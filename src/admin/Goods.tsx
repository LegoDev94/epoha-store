/**
 * Товары: список, состояния предмета и работа пачками.
 *
 * Предметы штучные, поэтому в списке сразу видно, что свободно, что в
 * резерве под оплату, что продано и что скрыто с витрины.
 */
import { useMemo, useState } from "react";
import type { Category, Lot } from "../data/catalog";
import { Select } from "../ui/Select";
import { useFmt, useT } from "./lang";
import { Empty, ErrorBox, Skeletons, Thumb, useConfirmDialog, useToast } from "./ui";

type Api = (url: string, opts?: RequestInit) => Promise<any>;

export interface AdmLot extends Lot {
  sellerId?: string | null;
  hidden?: boolean;
  archived?: boolean;
  reservedBy?: string;
  reservedUntil?: string;
}


/** Состояние предмета одной строкой — от него зависит и фильтр, и плашка. */
export function lotState(p: AdmLot): "sold" | "reserved" | "hidden" | "archived" | "free" {
  if (p.archived) return "archived";
  if (p.sold) return "sold";
  if (p.reservedUntil && Date.parse(p.reservedUntil) > Date.now()) return "reserved";
  if (p.hidden) return "hidden";
  return "free";
}

export default function Goods({
  items, sellers, cats, api, isAdmin, loading, error, onReload, onEdit, onDuplicate,
}: {
  items: AdmLot[];
  sellers: { id: string; name: string }[];
  cats: { v: Category; l: string }[];
  api: Api;
  isAdmin: boolean;
  loading: boolean;
  error: string;
  onReload: () => void;
  onEdit: (p: AdmLot) => void;
  onDuplicate: (p: AdmLot) => void;
}) {
  const toast = useToast();
  const { t } = useT();
  const { eur, time: fmtTime } = useFmt();
  const { ask, node: confirmNode } = useConfirmDialog();
  const [q, setQ] = useState("");
  const [state, setState] = useState("live");
  const [cat, setCat] = useState("all");
  const [seller, setSeller] = useState("all");
  const [sort, setSort] = useState("new");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [price, setPrice] = useState<{ id: number; v: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c = { free: 0, reserved: 0, sold: 0, hidden: 0, archived: 0, nophoto: 0, notr: 0 };
    for (const p of items) {
      c[lotState(p)]++;
      if (!p.images?.length) c.nophoto++;
      if (!p.tr?.lv?.title || !p.tr?.en?.title || !p.tr?.ru?.title) c.notr++;
    }
    return c;
  }, [items]);

  const shown = useMemo(() => {
    let list = items.filter((p) => (state === "archived" ? p.archived : !p.archived));
    if (state === "free" || state === "reserved" || state === "sold" || state === "hidden")
      list = list.filter((p) => lotState(p) === state);
    if (state === "nophoto") list = list.filter((p) => !p.images?.length);
    if (state === "notr") list = list.filter((p) => !p.tr?.lv?.title || !p.tr?.en?.title || !p.tr?.ru?.title);
    if (cat !== "all") list = list.filter((p) => p.cat === cat);
    if (seller !== "all") list = list.filter((p) => (seller === "shop" ? !p.sellerId : p.sellerId === seller));
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter((p) =>
        [p.n, p.tr?.lv?.title, p.tr?.en?.title, p.tr?.ru?.title].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
      );
    const lo = Number(min) || 0;
    const hi = Number(max) || Infinity;
    list = list.filter((p) => p.price >= lo && p.price <= hi);
    list.sort((a, b) =>
      sort === "cheap" ? a.price - b.price
      : sort === "rich" ? b.price - a.price
      : sort === "old" ? +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0)
      : +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0)
    );
    return list;
  }, [items, q, state, cat, seller, sort, min, max]);

  const call = async (url: string, body: any, okText: string) => {
    setBusy(true);
    try {
      await api(url, { method: "POST", body: JSON.stringify(body) });
      toast.ok(okText);
      onReload();
    } catch (e) {
      toast.err(t("ui.failed"), String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const bulk = (action: string, value: any, okText: string) =>
    call("api/admin/products/bulk", { ids: picked, action, value }, okText).then(() => setPicked([]));

  const savePrice = async (p: AdmLot, value: string) => {
    const v = Number(String(value).replace(",", "."));
    setPrice(null);
    if (!Number.isFinite(v) || v === p.price) return;
    setBusy(true);
    try {
      await api("api/admin/products", { method: "POST", body: JSON.stringify({ ...p, price: v }) });
      toast.ok(`№${p.n}: цена ${eur(v)}`);
      onReload();
    } catch (e) {
      toast.err(t("gd.priceFail"), String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const STATES: [string, string, number][] = [
    ["live", t("gd.live"), items.filter((p) => !p.archived).length],
    ["free", t("gd.free"), counts.free],
    ["reserved", t("gd.reserved"), counts.reserved],
    ["sold", t("gd.sold"), counts.sold],
    ["hidden", t("gd.hidden"), counts.hidden],
    ["nophoto", t("gd.nophoto"), counts.nophoto],
    ["notr", t("gd.notr"), counts.notr],
    ["archived", t("gd.archived"), counts.archived],
  ];

  return (
    <>
      {confirmNode}
      <div className="chips chips-goods">
        {STATES.filter(([k, , n]) => n > 0 || k === "live").map(([key, label, n]) => (
          <button key={key} className={`chip${state === key ? " on" : ""}`} onClick={() => setState(key)}>
            {label} <i>{n}</i>
          </button>
        ))}
      </div>

      <div className="adm-filters">
        <input className="adm-fl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("gd.search")} />
        <Select className="sel-sq" value={cat} onChange={setCat}
          options={[{ value: "all", label: t("gd.allCats") }, ...cats.map((c) => ({ value: c.v, label: c.l }))]} />
        {isAdmin && (
          <Select className="sel-sq" value={seller} onChange={setSeller}
            options={[
              { value: "all", label: t("gd.allSellers") }, { value: "shop", label: t("sel.shop2") },
              ...sellers.map((s) => ({ value: s.id, label: s.name })),
            ]} />
        )}
        <Select className="sel-sq" value={sort} onChange={setSort}
          options={[
            { value: "new", label: t("f.new") }, { value: "old", label: t("f.old") },
            { value: "cheap", label: t("f.cheap") }, { value: "rich", label: t("f.rich") },
          ]} />
        <div className="adm-fl-range">
          <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder={t("f.from")} />
          <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder={t("f.to")} />
        </div>
        <span className="adm-fl-count">{shown.length}</span>
      </div>

      {loading && !items.length && <Skeletons n={5} h={74} />}
      {error && <ErrorBox text={error} onRetry={onReload} />}
      {!loading && !error && !shown.length && (
        <Empty title={t("gd.empty")} hint={t("gd.emptyHint")} />
      )}

      <div className="adm-list">
        {shown.map((p) => {
          const st = lotState(p);
          const tr = p.tr?.lv?.title || p.tr?.en?.title || `#${p.id}`;
          const on = picked.includes(p.id);
          return (
            <article className={`gd gd-${st}${on ? " gd-on" : ""}`} key={p.id}>
              <label className="gd-pick">
                <input type="checkbox" checked={on}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
              </label>
              {p.images?.[0] ? <Thumb src={p.images[0]} /> : <span className="gd-noimg">{t("gd.noPhotoTag")}</span>}
              <div className="gd-main">
                <b>{tr}</b>
                <span className="gd-meta">
                  № {p.n} · {cats.find((c) => c.v === p.cat)?.l || p.cat} · {p.images?.length || 0} фото
                  {isAdmin && ` · ${p.sellerId ? sellers.find((s) => s.id === p.sellerId)?.name || "партнёр" : "витрина магазина"}`}
                </span>
                <span className="gd-tags">
                  {(["lv", "en", "ru"] as const).map((l) => (
                    <i key={l} className={p.tr?.[l]?.title ? "ok" : ""}>{l.toUpperCase()}</i>
                  ))}
                  {st === "reserved" && <em className="gd-state gd-res">в резерве до {fmtTime(p.reservedUntil)}</em>}
                  {st === "sold" && <em className="gd-state gd-sold">{t("gd.soldTag")}</em>}
                  {st === "hidden" && <em className="gd-state gd-hid">{t("gd.hiddenTag")}</em>}
                  {st === "archived" && <em className="gd-state">{t("gd.archTag")}</em>}
                </span>
              </div>
              <div className="gd-right">
                {price?.id === p.id ? (
                  <input className="gd-price-edit" autoFocus defaultValue={p.price}
                    onBlur={(e) => savePrice(p, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setPrice(null);
                    }} />
                ) : (
                  <button className={`gd-price${p.price < 10 ? " gd-price-warn" : ""}`} title={t("gd.editPrice")}
                    onClick={() => setPrice({ id: p.id, v: String(p.price) })}>
                    {eur(p.price)}
                  </button>
                )}
                <div className="gd-btns">
                  <button className="adm-btn adm-btn-sm" onClick={() => onEdit(p)}>{t("gd.edit")}</button>
                  <div className="ord-more">
                    <details>
                      <summary className="ord-more-btn">···</summary>
                      <div className="ord-menu">
                        <button onClick={() => onDuplicate(p)}>{t("gd.duplicate")}</button>
                        <button onClick={() => call(`api/admin/products/${p.id}/state`, { sold: !p.sold }, p.sold ? t("gd.unsold") : t("gd.marked"))}>
                          {p.sold ? t("gd.unsell") : t("gd.sell")}
                        </button>
                        <button onClick={() => call(`api/admin/products/${p.id}/state`, { hidden: !p.hidden }, p.hidden ? t("gd.shown") : t("gd.hid"))}>
                          {p.hidden ? t("gd.show") : t("gd.hide")}
                        </button>
                        {st === "reserved" && (
                          <button onClick={() => call(`api/admin/products/${p.id}/state`, { release: true }, t("gd.released"))}>{t("gd.release")}</button>
                        )}
                        <button onClick={() => call(`api/admin/products/${p.id}/state`, { archived: !p.archived }, p.archived ? t("gd.unarchived") : t("gd.archived2"))}>
                          {p.archived ? t("gd.unarchive") : t("gd.archive")}
                        </button>
                        <button className="danger" onClick={async () => {
                          if (await ask({
                            title: `Удалить «${tr}»?`,
                            body: <p>№ {p.n} · {eur(p.price)}</p>,
                            consequence: t("g.kartochkaISvyaz"),
                            confirmLabel: t("sl.delete"), danger: true,
                          })) {
                            setBusy(true);
                            try {
                              await api(`api/admin/products/${p.id}`, { method: "DELETE" });
                              toast.ok(t("gd.deleted"));
                              onReload();
                            } catch (e) {
                              toast.err(t("gd.deleteFail"), String((e as Error).message));
                            } finally {
                              setBusy(false);
                            }
                          }
                        }}>{t("gd.deleteForever")}</button>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Панель массовых действий появляется, когда что-то отмечено */}
      {picked.length > 0 && (
        <div className="bulk">
          <b>{picked.length} отмечено</b>
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("sold", true, t("gd.bulkSold"))}>{t("gd.sold")}</button>
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("sold", false, t("gd.unsold"))}>{t("gd.toSale")}</button>
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("hidden", true, t("gd.bulkHidden"))}>{t("gd.hideShort")}</button>
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("hidden", false, t("gd.bulkShown"))}>{t("gd.showShort")}</button>
          <Select className="sel-sq bulk-cat" value="" onChange={(v) => v && bulk("cat", v, t("gd.bulkCat"))}
            options={[{ value: "", label: t("gd.catTo") }, ...cats.map((c) => ({ value: c.v, label: c.l }))]} />
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("archive", true, t("gd.bulkArchived"))}>{t("gd.toArchive")}</button>
          <button className="bulk-x" onClick={() => setPicked([])}>{t("gd.unpick")}</button>
        </div>
      )}
    </>
  );
}
