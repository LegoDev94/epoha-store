/**
 * Заказы — рабочая очередь, а не архив.
 *
 * Сверху — что требует действия прямо сейчас; список свёрнут в строки,
 * карточка раскрывается по клику. В карточке одно главное действие,
 * остальное — под «…», чтобы «Удалить» не стояло рядом с «Передан».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "../ui/Select";
import { Empty, ErrorBox, Hint, Skeletons, copy, useConfirmDialog, useToast } from "./ui";

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

const money = (n: number | undefined) =>
  "€" + (Math.round((n || 0) * 100) / 100).toLocaleString("ru-RU", { minimumFractionDigits: 0 });
const cents = (c: number | undefined) => "€" + ((c || 0) / 100).toFixed(2).replace(".", ",");
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");

export const STATUS: Record<string, string> = {
  new: "ждёт оплаты", paid: "оплачен", done: "выполнен", cancelled: "отменён", expired: "просрочен",
};
/* В свёрнутой строке место узкое — подписи короче */
const SHORT: Record<string, string> = {
  new: "не оплачен", paid: "оплачен", done: "выполнен", cancelled: "отменён", expired: "просрочен",
};

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
    id ? sellers.find((s) => s.id === id)?.name || "партнёр" : "витрина магазина";

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
      toast.err("Не получилось", String((e as Error).message));
      return null;
    } finally {
      setBusy("");
    }
  };

  /* Выгрузка идёт с тем же токеном, что и остальные запросы,
     поэтому качаем через fetch, а не обычной ссылкой. */
  const exportCsv = async () => {
    try {
      const res = await fetch("api/admin/export/orders.csv", { headers: { "x-token": localStorage.getItem("epoha-token") || "" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sofa-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.ok("Файл выгружен — открывается в Excel и Numbers");
    } catch (e) {
      toast.err("Выгрузка не удалась", String((e as Error).message));
    }
  };

  const CHIPS: [string, string, number, boolean][] = [
    ["ship", "Ждут отправки", counts.ship, true],
    ["unpaid", "Ждут оплаты", counts.unpaid, false],
    ["payout", "Готовы к выплате", counts.payout, false],
    ["refund", "Возвраты", counts.refund, false],
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
          {!CHIPS.some(([, , n]) => n > 0) && !loading && <span className="chips-calm">Всё разобрано ✓</span>}
        </div>
        {isAdmin && (
          <button className="adm-btn adm-ghost adm-btn-sm" onClick={exportCsv}>
            Выгрузить CSV
          </button>
        )}
      </div>

      <div className="adm-filters">
        <input
          className="adm-fl-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Номер, имя, почта, телефон, адрес, товар"
        />
        <Select
          className="sel-sq" value={status} onChange={setStatus}
          options={[{ value: "all", label: "Любой статус" }, ...Object.entries(STATUS).map(([v, l]) => ({ value: v, label: l }))]}
        />
        <Select
          className="sel-sq" value={delivery} onChange={setDelivery}
          options={[
            { value: "all", label: "Любое получение" },
            { value: "pickup", label: "Самовывоз" },
            { value: "courier", label: "Доставка" },
          ]}
        />
        <Select
          className="sel-sq" value={sort} onChange={setSort}
          options={[
            { value: "new", label: "Сначала новые" }, { value: "old", label: "Сначала старые" },
            { value: "big", label: "Сумма больше" }, { value: "small", label: "Сумма меньше" },
          ]}
        />
        <div className="adm-fl-range">
          <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="€ от" />
          <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="€ до" />
        </div>
        {active && (
          <button className="adm-fl-reset" onClick={() => { setQ(""); setChip(""); setStatus("all"); setDelivery("all"); setMin(""); setMax(""); }}>
            Сбросить
          </button>
        )}
      </div>

      <div className="ord-sum">
        Показано <b>{shown.length}</b> из {orders.length} · на сумму <b>{money(sum)}</b>
      </div>

      {loading && !orders.length && <Skeletons n={4} h={64} />}
      {error && <ErrorBox text={error} onRetry={onReload} />}
      {!loading && !error && !shown.length && (
        <Empty
          title={orders.length ? "Под фильтры ничего не подошло" : "Заказов пока нет"}
          hint={orders.length ? "Сбросьте фильтры, чтобы увидеть все заказы." : "Здесь появятся заказы с витрины — сразу с контактами покупателя."}
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
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");
  const [ship, setShip] = useState({ carrier: o.shipping?.carrier || "", tracking: o.shipping?.tracking || "" });

  const courierText = [
    o.name, o.contact, o.email,
    o.delivery === "courier" ? o.address : "Izņemšana Talsos",
    ...(o.items || []).map((i) => `№${i.n} ${i.title}`),
    `Pasūtījums ${o.order} · ${money(o.total)}`,
  ].filter(Boolean).join("\n");

  const primary = () => {
    if (st === "new")
      return { label: "Отметить оплаченным", run: async () => {
        if (await ask({
          title: `Заказ ${o.order} оплачен?`,
          body: <p>Отметьте так, если деньги пришли наличными или переводом мимо Stripe.</p>,
          consequence: "Товар станет продан, партнёру начнёт считаться выплата.",
          confirmLabel: "Да, оплачен",
        })) act(o, `api/admin/orders/${o.order}/mark-paid`, { method: "transfer" });
      } };
    if (need === "ship")
      return { label: "Передан покупателю →", run: () => act(o, `api/admin/orders/${o.order}`, { delivered: true }) };
    if (o.deliveredAt && o.payoutState === "held")
      return { label: `Выплата после ${day(o.releaseAt)}`, run: () => {}, off: true };
    return null;
  };
  const main = primary();

  return (
    <article className={`ord${open ? " open" : ""}${need === "ship" ? " ord-hot" : ""}`}>
      <header className="ord-head" onClick={onToggle}>
        <span className={`dot dot-${st}`} title={STATUS[st] || st} />
        <b className="ord-n">{o.order}</b>
        <span className="ord-who">{o.name}</span>
        <span className="ord-way">
          {o.delivery === "courier" ? "Доставка" : "Самовывоз"} · {(o.items || []).length} поз.
        </span>
        <time>{dt(o.at)}</time>
        <u className="ord-total">{money(o.total)}</u>
        <span className={`adm-badge adm-st-${st}`}>{SHORT[st] || st}</span>
        <i className="ord-arrow" aria-hidden="true">{open ? "▴" : "▾"}</i>
      </header>

      {open && (
        <div className="ord-body">
          <div className="ord-cols">
            <div>
              <h4>Покупатель</h4>
              <p className="ord-contact">
                <b>{o.name}</b>
                {o.contact && <a href={`tel:${o.contact.replace(/[^\d+]/g, "")}`}>{o.contact}</a>}
                {o.email && <a href={`mailto:${o.email}?subject=Pasūtījums ${o.order}`}>{o.email}</a>}
              </p>
              <h4>Получение</h4>
              <p>
                {o.delivery === "courier"
                  ? <>Доставка до дверей{o.deliveryFee ? ` (+${money(o.deliveryFee)})` : ""}<br />{o.address || "адрес не указан"}</>
                  : "Самовывоз со склада в Талси (бесплатно)"}
              </p>
              {o.comment && (
                <>
                  <h4>Комментарий</h4>
                  <p>{/�/.test(o.comment) ? <em className="ord-broken">текст повреждён при вводе</em> : o.comment}</p>
                </>
              )}
              <div className="ord-copy">
                <button className="adm-btn adm-btn-sm adm-ghost" onClick={async () => {
                  toast[(await copy(courierText)) ? "ok" : "err"]("Данные для курьера скопированы");
                }}>
                  Скопировать для курьера
                </button>
                {o.delivery === "courier" && o.address && (
                  <a className="adm-btn adm-btn-sm adm-ghost" target="_blank" rel="noopener noreferrer"
                     href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`}>
                    Адрес на карте
                  </a>
                )}
              </div>
            </div>

            <div>
              <h4>Позиции {isAdmin && <span className="ord-seller">· {sellerName(o.sellerId)}</span>}</h4>
              <div className="ord-items">
                {(o.items || []).map((it, k) => (
                  <div className="ord-item" key={String(it.id) + k}>
                    {it.img ? <img src={it.img} alt="" /> : <span className="ord-noimg" />}
                    <span><b>{it.title}</b><i>№ {it.n}</i></span>
                    <em>{money(it.price)}</em>
                  </div>
                ))}
                {o.deliveryFee ? (
                  <div className="ord-item ord-ship"><span><b>Доставка</b></span><em>{money(o.deliveryFee)}</em></div>
                ) : null}
              </div>

              {isAdmin && o.sellerId && (
                <div className="ord-money">
                  <span>Оборот <b>{cents(o.chargeCents)}</b></span>
                  <span>Наша комиссия <b>{cents(o.commissionCents)}</b></span>
                  <span>Доставка нам <b>{cents(o.shippingCents)}</b></span>
                  <span className="ord-money-net">Партнёру <b>{cents(o.partnerNetCents)}</b></span>
                </div>
              )}
              {o.refundedCents ? (
                <p className="ord-refunded">Возвращено {cents(o.refundedCents)} из {cents(o.chargeCents)}</p>
              ) : null}
            </div>
          </div>

          {/* Отправка: перевозчик и трек-номер */}
          {isAdmin && o.delivery === "courier" && (st === "paid" || st === "done") && (
            <div className="ord-block">
              <h4>Отправка</h4>
              <div className="ord-ship-row">
                <input value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} placeholder="Перевозчик (DPD, Omniva, свой)" />
                <input value={ship.tracking} onChange={(e) => setShip({ ...ship, tracking: e.target.value })} placeholder="Трек-номер" />
                <button className="adm-btn adm-btn-sm" disabled={busy}
                  onClick={() => act(o, `api/admin/orders/${o.order}/shipping`, { ...ship, shipped: true }).then((r) => r && toast.ok("Отправка записана"))}>
                  {o.shippedAt ? "Обновить" : "Отправлено"}
                </button>
              </div>
              {o.shippedAt && <p className="ord-note-hint">Отправлено {day(o.shippedAt)}{o.shipping?.tracking ? ` · ${o.shipping.tracking}` : ""}</p>}
            </div>
          )}

          {/* Заметки для себя */}
          {isAdmin && (
            <div className="ord-block">
              <h4>Заметки</h4>
              {(o.notes || []).map((n, i) => (
                <p className="ord-note" key={i}><i>{dt(n.at)} · {n.by}</i>{n.text}</p>
              ))}
              <div className="ord-ship-row">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: заберёт в субботу после 14:00"
                  onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { act(o, `api/admin/orders/${o.order}/notes`, { text: note }); setNote(""); } }} />
                <button className="adm-btn adm-btn-sm adm-ghost" disabled={!note.trim() || busy}
                  onClick={() => { act(o, `api/admin/orders/${o.order}/notes`, { text: note }); setNote(""); }}>
                  Записать
                </button>
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
                      {STATUS[v]}
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
                  }}>
                    Ссылка на оплату
                  </button>
                )}
                <div className="ord-more">
                  <button className="ord-more-btn" onClick={() => setMenu(!menu)} aria-label="Ещё">···</button>
                  {menu && (
                    <div className="ord-menu" onMouseLeave={() => setMenu(false)}>
                      {(o.charge || o.paymentIntent) && (o.refundedCents || 0) < (o.chargeCents || 0) && (
                        <button onClick={() => { setMenu(false); onRefund(); }}>Вернуть деньги…</button>
                      )}
                      {o.deliveredAt && (
                        <button onClick={() => { setMenu(false); act(o, `api/admin/orders/${o.order}`, { delivered: false }); }}>
                          Снять отметку о передаче
                        </button>
                      )}
                      <button className="danger" onClick={async () => {
                        setMenu(false);
                        if (await ask({
                          title: `Удалить заказ ${o.order}?`,
                          body: <p>{o.name} · {money(o.total)} · {(o.items || []).length} поз.</p>,
                          consequence: "Запись исчезнет навсегда, товары вернутся на витрину. Для отчётности лучше отметить «отменён».",
                          confirmLabel: "Удалить", danger: true,
                        })) act(o, `api/admin/orders/${o.order}`, undefined, "DELETE");
                      }}>
                        Удалить заказ
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="ord-money">
                  <span>Ваши позиции <b>{cents(o.itemsCents)}</b></span>
                  <span>Komisija <b>−{cents(o.commissionCents)}</b></span>
                  <span className="ord-money-net">Jums <b>{cents(o.partnerNetCents)}</b></span>
                </div>
                {(st === "paid" || st === "done") && !o.deliveredAt && (
                  <button className="adm-btn" disabled={busy}
                    onClick={() => act(o, `api/partner/orders/${o.order}/delivered`).then((r) => r && toast.ok("Atzīmēts kā nodots"))}>
                    Nodots pircējam →
                  </button>
                )}
                {o.deliveredAt && (
                  <span className={`mp-badge mp-badge-${o.payoutState}`}>
                    {o.payoutState === "paid" ? "izmaksāts" : o.payoutState === "available" ? "gatavs izmaksai" : `aizturēts līdz ${day(o.releaseAt)}`}
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
  const rows: [string, string | null | undefined][] = [
    ["создан", o.at],
    ["оплачен", o.paidAt],
    ["отправлен", o.shippedAt],
    ["передан покупателю", o.deliveredAt],
    ["выплата разблокируется", o.releaseAt],
    ["выплачено партнёру", o.payoutAt],
    ["возврат", o.refundedAt],
  ];
  const has = rows.filter(([, v]) => v);
  if (has.length < 2) return null;
  return (
    <div className="ord-block">
      <h4>История</h4>
      <ol className="ord-hist">
        {has.map(([label, v]) => (
          <li key={label}><i>{dt(v)}</i>{label}</li>
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
      onError("Возврат не прошёл", String((e as Error).message));
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
            <button className="adm-btn adm-btn-sm adm-ghost" onClick={() => setAmount((left / 100).toFixed(2))}>Вся сумма</button>
            {order.itemsCents ? (
              <button className="adm-btn adm-btn-sm adm-ghost" onClick={() => setAmount((order.itemsCents! / 100).toFixed(2))}>Только товар</button>
            ) : null}
            {order.shippingCents ? (
              <button className="adm-btn adm-btn-sm adm-ghost" onClick={() => setAmount((order.shippingCents! / 100).toFixed(2))}>Только доставка</button>
            ) : null}
          </div>
          <label className="adm-f">
            <span>Сумма возврата, €</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            {bad && <small className="adm-err">Можно вернуть от 0,01 до {(left / 100).toFixed(2)} €</small>}
          </label>
          <label className="adm-f">
            <span>Причина</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="requested_by_customer">Покупатель отказался</option>
              <option value="duplicate">Двойная оплата</option>
              <option value="fraudulent">Подозрение на мошенничество</option>
            </select>
          </label>
          <label className="adm-f adm-check">
            <input type="checkbox" checked={fee} onChange={(e) => setFee(e.target.checked)} />
            <span>Вернуть и комиссию площадки <Hint text="Иначе комиссию потеряет партнёр: Stripe не возвращает её автоматически" /></span>
          </label>
          <label className="adm-f adm-check">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            <span>Вернуть товары на витрину</span>
          </label>
        </div>
        <footer className="adm-modal-foot">
          <button className="adm-btn adm-ghost" onClick={onClose}>Отмена</button>
          <button className="adm-btn adm-danger-solid" disabled={bad || busy} onClick={run}>
            {busy ? "Возвращаем…" : `Вернуть ${amount} €`}
          </button>
        </footer>
      </div>
    </div>
  );
}
