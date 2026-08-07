/**
 * Товары: список, состояния предмета и работа пачками.
 *
 * Предметы штучные, поэтому в списке сразу видно, что свободно, что в
 * резерве под оплату, что продано и что скрыто с витрины.
 */
import { useMemo, useState } from "react";
import type { Category, Lot } from "../data/catalog";
import { Select } from "../ui/Select";
import { Empty, ErrorBox, Skeletons, useConfirmDialog, useToast } from "./ui";

type Api = (url: string, opts?: RequestInit) => Promise<any>;

export interface AdmLot extends Lot {
  sellerId?: string | null;
  hidden?: boolean;
  archived?: boolean;
  reservedBy?: string;
  reservedUntil?: string;
}

const money = (n: number | undefined) => "€" + (Math.round(n || 0)).toLocaleString("ru-RU");
const time = (s?: string) => (s ? new Date(s).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "");

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
      toast.err("Не получилось", String((e as Error).message));
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
      toast.ok(`№${p.n}: цена ${money(v)}`);
      onReload();
    } catch (e) {
      toast.err("Цена не сохранилась", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const STATES: [string, string, number][] = [
    ["live", "Все активные", items.filter((p) => !p.archived).length],
    ["free", "В продаже", counts.free],
    ["reserved", "В резерве", counts.reserved],
    ["sold", "Продано", counts.sold],
    ["hidden", "Скрыто", counts.hidden],
    ["nophoto", "Без фото", counts.nophoto],
    ["notr", "Без перевода", counts.notr],
    ["archived", "Архив", counts.archived],
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
        <input className="adm-fl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или номер" />
        <Select className="sel-sq" value={cat} onChange={setCat}
          options={[{ value: "all", label: "Все категории" }, ...cats.map((c) => ({ value: c.v, label: c.l }))]} />
        {isAdmin && (
          <Select className="sel-sq" value={seller} onChange={setSeller}
            options={[
              { value: "all", label: "Все продавцы" }, { value: "shop", label: "Витрина магазина" },
              ...sellers.map((s) => ({ value: s.id, label: s.name })),
            ]} />
        )}
        <Select className="sel-sq" value={sort} onChange={setSort}
          options={[
            { value: "new", label: "Сначала новые" }, { value: "old", label: "Сначала старые" },
            { value: "cheap", label: "Дешевле" }, { value: "rich", label: "Дороже" },
          ]} />
        <div className="adm-fl-range">
          <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="€ от" />
          <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="€ до" />
        </div>
        <span className="adm-fl-count">{shown.length}</span>
      </div>

      {loading && !items.length && <Skeletons n={5} h={74} />}
      {error && <ErrorBox text={error} onRetry={onReload} />}
      {!loading && !error && !shown.length && (
        <Empty title="Ничего не найдено" hint="Смените фильтр состояния или сбросьте поиск." />
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
              {p.images?.[0] ? <img src={p.images[0]} alt="" /> : <span className="gd-noimg">нет фото</span>}
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
                  {st === "reserved" && <em className="gd-state gd-res">в резерве до {time(p.reservedUntil)}</em>}
                  {st === "sold" && <em className="gd-state gd-sold">продано</em>}
                  {st === "hidden" && <em className="gd-state gd-hid">скрыто с витрины</em>}
                  {st === "archived" && <em className="gd-state">в архиве</em>}
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
                  <button className={`gd-price${p.price < 10 ? " gd-price-warn" : ""}`} title="Изменить цену"
                    onClick={() => setPrice({ id: p.id, v: String(p.price) })}>
                    {money(p.price)}
                  </button>
                )}
                <div className="gd-btns">
                  <button className="adm-btn adm-btn-sm" onClick={() => onEdit(p)}>Изменить</button>
                  <div className="ord-more">
                    <details>
                      <summary className="ord-more-btn">···</summary>
                      <div className="ord-menu">
                        <button onClick={() => onDuplicate(p)}>Дублировать</button>
                        <button onClick={() => call(`api/admin/products/${p.id}/state`, { sold: !p.sold }, p.sold ? "Вернули в продажу" : "Отметили проданным")}>
                          {p.sold ? "Вернуть в продажу" : "Отметить проданным"}
                        </button>
                        <button onClick={() => call(`api/admin/products/${p.id}/state`, { hidden: !p.hidden }, p.hidden ? "Товар на витрине" : "Скрыт с витрины")}>
                          {p.hidden ? "Показать на витрине" : "Скрыть с витрины"}
                        </button>
                        {st === "reserved" && (
                          <button onClick={() => call(`api/admin/products/${p.id}/state`, { release: true }, "Резерв снят")}>
                            Снять резерв
                          </button>
                        )}
                        <button onClick={() => call(`api/admin/products/${p.id}/state`, { archived: !p.archived }, p.archived ? "Возвращено из архива" : "Убрано в архив")}>
                          {p.archived ? "Вернуть из архива" : "Убрать в архив"}
                        </button>
                        <button className="danger" onClick={async () => {
                          if (await ask({
                            title: `Удалить «${tr}»?`,
                            body: <p>№ {p.n} · {money(p.price)}</p>,
                            consequence: "Карточка и связь с прошлыми заказами исчезнут навсегда. Обычно достаточно архива.",
                            confirmLabel: "Удалить", danger: true,
                          })) {
                            setBusy(true);
                            try {
                              await api(`api/admin/products/${p.id}`, { method: "DELETE" });
                              toast.ok("Товар удалён");
                              onReload();
                            } catch (e) {
                              toast.err("Не удалилось", String((e as Error).message));
                            } finally {
                              setBusy(false);
                            }
                          }
                        }}>
                          Удалить навсегда
                        </button>
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
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("sold", true, "Отмечены проданными")}>Продано</button>
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("sold", false, "Вернули в продажу")}>В продажу</button>
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("hidden", true, "Скрыты с витрины")}>Скрыть</button>
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("hidden", false, "Показаны на витрине")}>Показать</button>
          <Select className="sel-sq bulk-cat" value="" onChange={(v) => v && bulk("cat", v, "Категория изменена")}
            options={[{ value: "", label: "Категория →" }, ...cats.map((c) => ({ value: c.v, label: c.l }))]} />
          <button className="adm-btn adm-btn-sm adm-ghost" disabled={busy} onClick={() => bulk("archive", true, "Убраны в архив")}>В архив</button>
          <button className="bulk-x" onClick={() => setPicked([])}>снять отметки</button>
        </div>
      )}
    </>
  );
}
