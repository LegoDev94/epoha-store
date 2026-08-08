/**
 * Заказы — рабочая очередь, а не архив.
 *
 * Сверху — что требует действия прямо сейчас; список свёрнут в строки,
 * карточка раскрывается по клику. В карточке одно главное действие,
 * остальное — под «…», чтобы «Удалить» не стояло рядом с «Передан».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "../ui/Select";
import { useFmt, useT, type AdminT } from "./lang";
import { Empty, ErrorBox, Hint, Skeletons, Thumb, copy, download, useConfirmDialog, useToast } from "./ui";

type Api = (url: string, opts?: RequestInit) => Promise<any>;

export interface OrderItem {
  id: number; n?: string; title?: string; price?: number; img?: string; cents?: number; sellerId?: string | null;
}
export interface Order {
  order: string; at: string; status?: string;
  total?: number; fee?: number; net?: number; deliveryFee?: number;
  itemsCents?: number; shippingCents?: number; chargeCents?: number;
  commissionCents?: number; partnerNetCents?: number; stripeFeeCents?: number; refundedCents?: number;
  delivery?: string; address?: string; name?: string; contact?: string; email?: string; comment?: string;
  items?: OrderItem[]; sellerId?: string | null; sellerName?: string;
  deliveredAt?: string | null; releaseAt?: string | null; payoutState?: string; payoutAt?: string | null;
  payoutStatus?: string; payoutError?: string;
  refundedAt?: string | null; charge?: string; paymentIntent?: string; paidAt?: string;
  notes?: { at: string; by: string; text: string }[];
  shipping?: { carrier?: string; tracking?: string; url?: string };
  shippedAt?: string | null; paidOutside?: boolean; paymentMethod?: string; lang?: string;
}


export const STATUSES = ["new", "paid", "done", "cancelled", "expired"] as const;
/* В свёрнутой строке место узкое — у «нового» подпись короче */
export const statusLabel = (t: AdminT, st: string, short = false) =>
  t(short && st === "new" ? "st.newShort" : `st.${st}`);

/** Что с заказом нужно сделать прямо сейчас. */
export function attention(o: Order) {
  const st = o.status || "new";
  if (o.refundedAt) return "refund";
  if (st === "new") return "unpaid";
  if ((st === "paid" || st === "done") && !o.deliveredAt) return "ship";
  if (o.payoutState === "available") return "payout";
  return "";
}
export const needsAction = (o: Order) => ["unpaid", "ship"].includes(attention(o));

/** «1 pozīcija» против «2 pozīcijas»: форма зависит от числа. */
const pcs = (t: AdminT, n: number) => t(n === 1 ? "ord.pcs1" : "ord.pcs", { n });

export default function Orders({
  orders, sellers, api, isAdmin, loading, error, onReload,
}: {
  orders: Order[];
  sellers: { id: string; name: string }[];
  api: Api;
  isAdmin: boolean;
  loading: boolean;
  error: string;
  onReload: () => void;
}) {
  const toast = useToast();
  const { t } = useT();
  const { eur } = useFmt();
  const { ask, node: confirmNode } = useConfirmDialog();
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("");
  const [status, setStatus] = useState("all");
  const [delivery, setDelivery] = useState("all");
  const [sort, setSort] = useState("new");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [refund, setRefund] = useState<Order | null>(null);
  const [busy, setBusy] = useState("");

  const sellerName = (id?: string | null) =>
    id ? sellers.find((s) => s.id === id)?.name || t("sel.partner") : t("sel.shop");

  const counts = useMemo(() => {
    const c = { unpaid: 0, ship: 0, payout: 0, refund: 0 };
    for (const o of orders) {
      const a = attention(o);
      if (a && a in c) c[a as keyof typeof c]++;
    }
    return c;
  }, [orders]);

  const shown = useMemo(() => {
    let list = orders.slice();
    if (chip) list = list.filter((o) => attention(o) === chip);
    if (status !== "all") list = list.filter((o) => (o.status || "new") === status);
    if (delivery !== "all") list = list.filter((o) => o.delivery === delivery);
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter((o) =>
        [o.order, o.name, o.email, o.contact, o.address, o.comment, ...(o.items || []).flatMap((i) => [i.n, i.title])]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s))
      );
    const lo = Number(min) || 0;
    const hi = Number(max) || Infinity;
    list = list.filter((o) => (o.total || 0) >= lo && (o.total || 0) <= hi);
    list.sort((a, b) =>
      sort === "old" ? +new Date(a.at) - +new Date(b.at)
      : sort === "big" ? (b.total || 0) - (a.total || 0)
      : sort === "small" ? (a.total || 0) - (b.total || 0)
      : +new Date(b.at) - +new Date(a.at)
    );
    return list;
  }, [orders, q, chip, status, delivery, sort, min, max]);

  const sum = shown.reduce((s, o) => s + (o.total || 0), 0);
  const active = q || chip || status !== "all" || delivery !== "all" || min || max;

  const act = async (o: Order, url: string, body?: any, method = "POST") => {
    setBusy(o.order);
    try {
      const r = await api(url, { method, body: body ? JSON.stringify(body) : undefined });
      onReload();
      return r;
    } catch (e) {
      toast.err(t("ui.failed"), String((e as Error).message));
      return null;
    } finally {
      setBusy("");
    }
  };

  /* Выгрузка идёт с тем же токеном, что и остальные запросы,
     поэтому качаем через fetch, а не обычной ссылкой. */
  const exportCsv = async () => {
    try {
      await download("api/admin/export/orders.csv", `sofa-orders-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.ok(t("o.fajlVygruzhenOtkryvaetsya"));
    } catch (e) {
      toast.err(t("ord.csvFail"), String((e as Error).message));
    }
  };

  const CHIPS: [string, string, number, boolean][] = [
    ["ship", t("ord.chipShip"), counts.ship, true],
    ["unpaid", t("ord.chipUnpaid"), counts.unpaid, false],
    ["payout", t("ord.chipPayout"), counts.payout, false],
    ["refund", t("ord.chipRefund"), counts.refund, false],
  ];

  return (
    <>
      {confirmNode}
      {refund && (
        <RefundDialog
          order={refund}
          onClose={() => setRefund(null)}
          onDone={(msg) => { setRefund(null); toast.ok(msg); onReload(); }}
          onError={(m, d) => toast.err(m, d)}
          api={api}
        />
      )}

      <div className="ord-top">
        <div className="chips">
          {CHIPS.filter(([, , n]) => n > 0).map(([key, label, n, hot]) => (
            <button
              key={key}
              className={`chip${chip === key ? " on" : ""}${hot ? " hot" : ""}`}
              onClick={() => setChip(chip === key ? "" : key)}
            >
              {label} <i>{n}</i>
            </button>
          ))}
          {!CHIPS.some(([, , n]) => n > 0) && !loading && <span className="chips-calm">{t("ord.allDone")}</span>}
        </div>
        {isAdmin && (
          <button className="adm-btn adm-ghost adm-btn-sm" onClick={exportCsv}>{t("ord.csv")}</button>
        )}
      </div>

      <div className="adm-filters">
        <input
          className="adm-fl-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("ord.search")}
        />
        <Select
          className="sel-sq" value={status} onChange={setStatus}
          options={[{ value: "all", label: t("ord.anyStatus") }, ...STATUSES.map((v) => ({ value: v, label: statusLabel(t, v) }))]}
        />
        <Select
          className="sel-sq" value={delivery} onChange={setDelivery}
          options={[
            { value: "all", label: t("ord.anyDelivery") },
            { value: "pickup", label: t("ord.pickup") },
            { value: "courier", label: t("ord.delivery") },
          ]}
        />
        <Select
          className="sel-sq" value={sort} onChange={setSort}
          options={[
            { value: "new", label: t("f.new") }, { value: "old", label: t("f.old") },
            { value: "big", label: t("f.big") }, { value: "small", label: t("f.small") },
          ]}
        />
        <div className="adm-fl-range">
          <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder={t("f.from")} />
          <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder={t("f.to")} />
        </div>
        {active && (
          <button className="adm-fl-reset" onClick={() => { setQ(""); setChip(""); setStatus("all"); setDelivery("all"); setMin(""); setMax(""); }}>{t("f.reset")}</button>
        )}
      </div>

      <div className="ord-sum">
        {t("ord.shownOf", { n: shown.length, total: orders.length, sum: eur(sum) })}
      </div>

      {loading && !orders.length && <Skeletons n={4} h={64} />}
      {error && <ErrorBox text={error} onRetry={onReload} />}
      {!loading && !error && !shown.length && (
        <Empty
          title={orders.length ? t("ord.emptyFiltered") : t("ord.empty")}
          hint={orders.length ? t("ord.emptyFilteredHint") : t("ord.emptyHint")}
        />
      )}

      <div className="adm-list ord-list">
        {shown.map((o) => (
          <OrderRow
            key={o.order}
            o={o}
            open={open === o.order}
            onToggle={() => setOpen(open === o.order ? null : o.order)}
            isAdmin={isAdmin}
            busy={busy === o.order}
            sellerName={sellerName}
            act={act}
            ask={ask}
            toast={toast}
            onRefund={() => setRefund(o)}
          />
        ))}
      </div>
    </>
  );
}

/* ── строка списка с раскрытием ────────────────────────────────── */
function OrderRow({
  o, open, onToggle, isAdmin, busy, sellerName, act, ask, toast, onRefund,
}: {
  o: Order; open: boolean; onToggle: () => void; isAdmin: boolean; busy: boolean;
  sellerName: (id?: string | null) => string;
  act: (o: Order, url: string, body?: any, method?: string) => Promise<any>;
  ask: (opts: any) => Promise<boolean>;
  toast: ReturnType<typeof useToast>;
  onRefund: () => void;
}) {
  const st = o.status || "new";
  const need = attention(o);
  const { t } = useT();
  const { eur, cents: fmtCents, dateTime, date } = useFmt();
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");
  const [ship, setShip] = useState({ carrier: o.shipping?.carrier || "", tracking: o.shipping?.tracking || "" });

  const courierText = [
    o.name, o.contact, o.email,
    o.delivery === "courier" ? o.address : "Izņemšana Talsos",
    ...(o.items || []).map((i) => `№${i.n} ${i.title}`),
    `Pasūtījums ${o.order} · ${eur(o.total)}`,
  ].filter(Boolean).join("\n");

  const primary = () => {
    if (st === "new")
      return { label: t("ord.markPaid"), run: async () => {
        if (await ask({
          title: `Заказ ${o.order} оплачен?`,
          body: <p>{t("o.otmetteTakEsli")}</p>,
          consequence: t("o.tovarStanetProdan"),
          confirmLabel: t("ord.markPaidYes"),
        })) act(o, `api/admin/orders/${o.order}/mark-paid`, { method: "transfer" });
      } };
    if (need === "ship")
      return { label: t("ord.markDelivered"), run: () => act(o, `api/admin/orders/${o.order}`, { delivered: true }) };
    if (o.deliveredAt && o.payoutState === "held")
      return { label: `Выплата после ${date(o.releaseAt)}`, run: () => {}, off: true };
    return null;
  };
  const main = primary();

  return (
    <article className={`ord${open ? " open" : ""}${need === "ship" ? " ord-hot" : ""}`}>
      <header className="ord-head" onClick={onToggle}>
        <span className={`dot dot-${st}`} title={statusLabel(t, st)} />
        <b className="ord-n">{o.order}</b>
        <span className="ord-who">{o.name}</span>
        <span className="ord-way">
          {o.delivery === "courier" ? t("ord.delivery") : t("ord.pickup")} · {pcs(t, (o.items || []).length)}
        </span>
        <time>{dateTime(o.at)}</time>
        <u className="ord-total">{eur(o.total)}</u>
        <span className={`adm-badge adm-st-${st}`}>{statusLabel(t, st, true)}</span>
        <i className="ord-arrow" aria-hidden="true">{open ? "▴" : "▾"}</i>
      </header>

      {open && (
        <div className="ord-body">
          <div className="ord-cols">
            <div>
              <h4>{t("ord.buyer")}</h4>
              <p className="ord-contact">
                <b>{o.name}</b>
                {o.contact && <a href={`tel:${o.contact.replace(/[^\d+]/g, "")}`}>{o.contact}</a>}
                {o.email && <a href={`mailto:${o.email}?subject=Pasūtījums ${o.order}`}>{o.email}</a>}
              </p>
              <h4>{t("ord.receiving")}</h4>
              <p>
                {o.delivery === "courier"
                  ? <>Доставка до дверей{o.deliveryFee ? ` (+${eur(o.deliveryFee)})` : ""}<br />{o.address || t("ord.noAddress")}</>
                  : t("ord.pickupFull")}
              </p>
              {o.comment && (
                <>
                  <h4>{t("ord.comment")}</h4>
                  <p>{/�/.test(o.comment) ? <em className="ord-broken">{t("ord.brokenText")}</em> : o.comment}</p>
                </>
              )}
              <div className="ord-copy">
                <button className="adm-btn adm-btn-sm adm-ghost" onClick={async () => {
                  toast[(await copy(courierText)) ? "ok" : "err"](t("ord.copied"));
                }}>{t("ord.copyCourier")}</button>
                {o.delivery === "courier" && o.address && (
                  <a className="adm-btn adm-btn-sm adm-ghost" target="_blank" rel="noopener noreferrer"
                     href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`}>{t("ord.map")}</a>
                )}
              </div>
            </div>

            <div>
              <h4>Позиции {isAdmin && <span className="ord-seller">· {sellerName(o.sellerId)}</span>}</h4>
              <div className="ord-items">
                {(o.items || []).map((it, k) => (
                  <div className="ord-item" key={String(it.id) + k}>
                    {it.img ? <Thumb src={it.img} /> : <span className="ord-noimg" />}
                    <span><b>{it.title}</b><i>№ {it.n}</i></span>
                    <em>{eur(it.price)}</em>
                  </div>
                ))}
                {o.deliveryFee ? (
                  <div className="ord-item ord-ship"><span><b>{t("ord.delivery")}</b></span><em>{eur(o.deliveryFee)}</em></div>
                ) : null}
              </div>

              {isAdmin && o.sellerId && (
                <div className="ord-money">
                  <span>{t("ord.gross")}<b>{fmtCents(o.chargeCents)}</b></span>
                  <span>{t("ord.ourFee")}<b>{fmtCents(o.commissionCents)}</b></span>
                  <span>{t("ord.shipToUs")}<b>{fmtCents(o.shippingCents)}</b></span>
                  <span className="ord-money-net">{t("ord.toPartner")}<b>{fmtCents(o.partnerNetCents)}</b></span>
                </div>
              )}
              {o.refundedCents ? (
                <p className="ord-refunded">Возвращено {fmtCents(o.refundedCents)} из {fmtCents(o.chargeCents)}</p>
              ) : null}
            </div>
          </div>

          {/* Отправка: перевозчик и трек-номер */}
          {isAdmin && o.delivery === "courier" && (st === "paid" || st === "done") && (
            <div className="ord-block">
              <h4>{t("ord.shipping")}</h4>
              <div className="ord-ship-row">
                <input value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} placeholder={t("ord.carrier")} />
                <input value={ship.tracking} onChange={(e) => setShip({ ...ship, tracking: e.target.value })} placeholder={t("ord.tracking")} />
                <button className="adm-btn adm-btn-sm" disabled={busy}
                  onClick={() => act(o, `api/admin/orders/${o.order}/shipping`, { ...ship, shipped: true }).then((r) => r && toast.ok(t("ord.shipSaved")))}>
                  {o.shippedAt ? t("ord.update") : t("ord.shipped")}
                </button>
              </div>
              {o.shippedAt && <p className="ord-note-hint">Отправлено {date(o.shippedAt)}{o.shipping?.tracking ? ` · ${o.shipping.tracking}` : ""}</p>}
            </div>
          )}

          {/* Заметки для себя */}
          {isAdmin && (
            <div className="ord-block">
              <h4>{t("ord.notes")}</h4>
              {(o.notes || []).map((n, i) => (
                <p className="ord-note" key={i}><i>{dateTime(n.at)} · {n.by}</i>{n.text}</p>
              ))}
              <div className="ord-ship-row">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("ord.notePh")}
                  onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { act(o, `api/admin/orders/${o.order}/notes`, { text: note }); setNote(""); } }} />
                <button className="adm-btn adm-btn-sm adm-ghost" disabled={!note.trim() || busy}
                  onClick={() => { act(o, `api/admin/orders/${o.order}/notes`, { text: note }); setNote(""); }}>{t("ord.noteSave")}</button>
              </div>
            </div>
          )}

          <History o={o} />

          <footer className="ord-foot">
            {isAdmin ? (
              <>
                <div className="seg">
                  {(["paid", "done", "cancelled"] as const).map((v) => (
                    <button key={v} className={st === v ? "on" : ""} disabled={busy}
                      onClick={() => act(o, `api/admin/orders/${o.order}`, { status: v })}>
                      {statusLabel(t, v)}
                    </button>
                  ))}
                </div>
                {main && (
                  <button className="adm-btn" disabled={busy || main.off} onClick={main.run}>
                    {busy ? "…" : main.label}
                  </button>
                )}
                {st === "new" && (
                  <button className="adm-btn adm-ghost" disabled={busy} onClick={async () => {
                    const r = await act(o, `api/admin/orders/${o.order}/pay-link`);
                    if (r?.url) {
                      await copy(r.url);
                      toast.ok(`Ссылка на оплату скопирована · действует ${r.expiresIn} мин`);
                    }
                  }}>{t("ord.payLink")}</button>
                )}
                <div className="ord-more">
                  <button className="ord-more-btn" onClick={() => setMenu(!menu)} aria-label={t("ord.more")}>···</button>
                  {menu && (
                    <div className="ord-menu" onMouseLeave={() => setMenu(false)}>
                      {(o.charge || o.paymentIntent) && (o.refundedCents || 0) < (o.chargeCents || 0) && (
                        <button onClick={() => { setMenu(false); onRefund(); }}>{t("ord.refundOpen")}</button>
                      )}
                      {o.deliveredAt && (
                        <button onClick={() => { setMenu(false); act(o, `api/admin/orders/${o.order}`, { delivered: false }); }}>{t("ord.unDeliver")}</button>
                      )}
                      <button className="danger" onClick={async () => {
                        setMenu(false);
                        if (await ask({
                          title: `Удалить заказ ${o.order}?`,
                          body: <p>{o.name} · {eur(o.total)} · {pcs(t, (o.items || []).length)}</p>,
                          consequence: t("o.zapisIscheznetNavsegda"),
                          confirmLabel: t("sl.delete"), danger: true,
                        })) act(o, `api/admin/orders/${o.order}`, undefined, "DELETE");
                      }}>{t("ord.delete")}</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="ord-money">
                  <span>{t("ord.yourItems")}<b>{fmtCents(o.itemsCents)}</b></span>
                  <span>Komisija <b>−{fmtCents(o.commissionCents)}</b></span>
                  <span className="ord-money-net">Jums <b>{fmtCents(o.partnerNetCents)}</b></span>
                </div>
                {(st === "paid" || st === "done") && !o.deliveredAt && (
                  <button className="adm-btn" disabled={busy}
                    onClick={() => act(o, `api/partner/orders/${o.order}/delivered`).then((r) => r && toast.ok("Atzīmēts kā nodots"))}>
                    Nodots pircējam →
                  </button>
                )}
                {o.deliveredAt && (
                  <span className={`mp-badge mp-badge-${o.payoutState}`}>
                    {o.payoutState === "paid" ? "izmaksāts" : o.payoutState === "available" ? "gatavs izmaksai" : `aizturēts līdz ${date(o.releaseAt)}`}
                  </span>
                )}
              </>
            )}
          </footer>
        </div>
      )}
    </article>
  );
}

/** Что уже произошло с заказом — из дат, которые и так хранятся. */
function History({ o }: { o: Order }) {
  const { t } = useT();
  const { dateTime } = useFmt();
  const rows: [string, string | null | undefined][] = [
    [t("h.created"), o.at],
    [t("st.paid"), o.paidAt],
    [t("h.shipped"), o.shippedAt],
    [t("h.delivered"), o.deliveredAt],
    [t("h.release"), o.releaseAt],
    [t("h.paidOut"), o.payoutAt],
    [t("h.refund"), o.refundedAt],
  ];
  const has = rows.filter(([, v]) => v);
  if (has.length < 2) return null;
  return (
    <div className="ord-block">
      <h4>{t("ord.history")}</h4>
      <ol className="ord-hist">
        {has.map(([label, v]) => (
          <li key={label}><i>{dateTime(v)}</i>{label}</li>
        ))}
      </ol>
    </div>
  );
}

/* ── возврат: частичный, с понятными последствиями ─────────────── */
function RefundDialog({
  order, api, onClose, onDone, onError,
}: {
  order: Order; api: Api; onClose: () => void;
  onDone: (msg: string) => void; onError: (m: string, d?: string) => void;
}) {
  const { t } = useT();
  const left = (order.chargeCents || 0) - (order.refundedCents || 0);
  const [amount, setAmount] = useState((left / 100).toFixed(2));
  const [reason, setReason] = useState("requested_by_customer");
  const [fee, setFee] = useState(true);
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const cents = Math.round(Number(String(amount).replace(",", ".")) * 100);
  const bad = !Number.isFinite(cents) || cents <= 0 || cents > left;

  const run = async () => {
    setBusy(true);
    try {
      const r = await api(`api/admin/orders/${order.order}/refund`, {
        method: "POST",
        body: JSON.stringify({ amountCents: cents, refundFee: fee, restock, reason }),
      });
      onDone(`Возврат ${(r.refund.amount / 100).toFixed(2)} € — ${r.refund.status}`);
    } catch (e) {
      onError(t("ord.refundFail"), String((e as Error).message));
      setBusy(false);
    }
  };

  return (
    <div className="adm-modal-bg" onClick={onClose}>
      <div className="adm-modal adm-modal-sm" ref={box} onClick={(e) => e.stopPropagation()}>
        <header className="adm-modal-head">
          <h2>Возврат по заказу {order.order}</h2>
          <button className="adm-x" onClick={onClose}>✕</button>
        </header>
        <div className="adm-modal-body">
          <p className="adm-hint">
            {order.name} · {(order.items || []).map((i) => `№${i.n}`).join(", ")} · оплачено {cents === left ? "" : ""}
            {((order.chargeCents || 0) / 100).toFixed(2)} €
            {order.refundedCents ? `, уже возвращено ${(order.refundedCents / 100).toFixed(2)} €` : ""}
          </p>
          <div className="ord-quick">
            <button className="adm-btn adm-btn-sm adm-ghost" onClick={() => setAmount((left / 100).toFixed(2))}>{t("ord.refundAll")}</button>
            {order.itemsCents ? (
              <button className="adm-btn adm-btn-sm adm-ghost" onClick={() => setAmount((order.itemsCents! / 100).toFixed(2))}>{t("ord.refundGoods")}</button>
            ) : null}
            {order.shippingCents ? (
              <button className="adm-btn adm-btn-sm adm-ghost" onClick={() => setAmount((order.shippingCents! / 100).toFixed(2))}>{t("ord.refundShipping")}</button>
            ) : null}
          </div>
          <label className="adm-f">
            <span>{t("ord.refundAmount")}</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            {bad && <small className="adm-err">Можно вернуть от 0,01 до {(left / 100).toFixed(2)} €</small>}
          </label>
          <label className="adm-f">
            <span>{t("ord.reason")}</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="requested_by_customer">{t("ord.reasonCustomer")}</option>
              <option value="duplicate">{t("ord.reasonDuplicate")}</option>
              <option value="fraudulent">{t("ord.reasonFraud")}</option>
            </select>
          </label>
          <label className="adm-f adm-check">
            <input type="checkbox" checked={fee} onChange={(e) => setFee(e.target.checked)} />
            <span>{t("o.vernutIKomissiyu")}<Hint text={t("o.inacheKomissiyuPoteryaet")} /></span>
          </label>
          <label className="adm-f adm-check">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            <span>{t("ord.restock")}</span>
          </label>
        </div>
        <footer className="adm-modal-foot">
          <button className="adm-btn adm-ghost" onClick={onClose}>{t("ed.cancel")}</button>
          <button className="adm-btn adm-danger-solid" disabled={bad || busy} onClick={run}>
            {busy ? t("ord.refunding") : `Вернуть ${amount} €`}
          </button>
        </footer>
      </div>
    </div>
  );
}
