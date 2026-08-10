/**
 * Категории витрины: завести свою, переименовать, скрыть, переставить.
 *
 * Ключ у категории один и неизменный — он записан в товарах, и подмена
 * оставила бы их без категории. Меняются подписи на языках витрины,
 * значок, порядок и слова, по которым категория угадывается при
 * импорте с аукциона.
 *
 * Удаление не бросает товары: панель спрашивает, куда их перевести.
 */
import { useCallback, useEffect, useState } from "react";
import { LANGS as SITE_LANGS } from "../i18n";
import type { Lang } from "../data/catalog";
import { useT } from "./lang";
import { useConfirmDialog, useToast } from "./ui";

type Api = (url: string, opts?: RequestInit) => Promise<any>;

export interface AdminCat {
  key: string;
  icon: string;
  order?: number;
  hidden?: boolean;
  words?: string;
  items?: number;
  tr: Partial<Record<Lang, string>>;
}

const ICONS = ["seating", "mirror", "light", "storage", "table", "decor"];

const blank = (): AdminCat => ({ key: "", icon: "decor", hidden: false, words: "", tr: {} });

export function Categories({ api, onChanged }: { api: Api; onChanged?: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const { ask, node: confirmNode } = useConfirmDialog();
  const [list, setList] = useState<AdminCat[]>([]);
  const [edit, setEdit] = useState<AdminCat | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api("api/admin/categories").then(setList).catch(() => {});
  }, [api]);
  useEffect(load, [load]);

  const save = async (c: AdminCat) => {
    setBusy(c.key || "new");
    try {
      await api("api/admin/categories", { method: "POST", body: JSON.stringify(c) });
      setEdit(null);
      load();
      onChanged?.();
      toast.ok(t("ct.saved"));
    } catch (e) {
      toast.err(t("ui.failed"), String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const move = async (key: string, dir: -1 | 1) => {
    const keys = list.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setList(keys.map((k) => list.find((c) => c.key === k)!));
    try {
      await api("api/admin/categories/order", { method: "POST", body: JSON.stringify({ keys }) });
      onChanged?.();
    } catch {
      load();
    }
  };

  const drop = async (c: AdminCat) => {
    const others = list.filter((x) => x.key !== c.key);
    if (!others.length) return;
    const target = others[0];
    const ok = await ask({
      title: t("ct.deleteTitle", { name: c.tr.lv || c.key }),
      body: (
        <p>
          {c.items
            ? t("ct.deleteWithItems", { n: c.items, target: target.tr.lv || target.key })
            : t("ct.deleteEmpty")}
        </p>
      ),
      consequence: t("ct.deleteConsequence"),
      confirmLabel: t("gd.deleteForever"),
    });
    if (!ok) return;
    setBusy(c.key);
    try {
      const r = await api(`api/admin/categories/${c.key}?moveTo=${target.key}`, { method: "DELETE" });
      load();
      onChanged?.();
      toast.ok(r?.moved ? t("ct.movedItems", { n: r.moved }) : t("ct.deleted"));
    } catch (e) {
      toast.err(t("ui.failed"), String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="ct">
      {confirmNode}
      <div className="ct-head">
        <h3>{t("ct.title")}</h3>
        <button className="adm-btn adm-btn-sm" onClick={() => setEdit(blank())}>{t("ct.add")}</button>
      </div>
      <p className="adm-hint">{t("ct.hint")}</p>

      <div className="ct-list">
        {list.map((c, i) => (
          <article key={c.key} className={`ct-row${c.hidden ? " off" : ""}`}>
            <div className="ct-order">
              <button disabled={i === 0} onClick={() => move(c.key, -1)} aria-label="↑">↑</button>
              <button disabled={i === list.length - 1} onClick={() => move(c.key, 1)} aria-label="↓">↓</button>
            </div>
            <span className="ct-name">
              <b>{c.tr.lv || c.key}</b>
              <small>
                {c.key} · {t("ct.items", { n: c.items || 0 })}
                {c.hidden ? ` · ${t("ct.hidden")}` : ""}
              </small>
            </span>
            <div className="ct-btns">
              <button className="adm-btn adm-btn-sm adm-ghost" onClick={() => setEdit({ ...c })}>
                {t("gd.edit")}
              </button>
              <button
                className="adm-btn adm-btn-sm adm-ghost"
                disabled={busy === c.key}
                onClick={() => save({ ...c, hidden: !c.hidden })}
              >
                {c.hidden ? t("ct.show") : t("ct.hide")}
              </button>
              <button
                className="adm-btn adm-btn-sm adm-ghost"
                disabled={busy === c.key || list.length < 2}
                onClick={() => drop(c)}
              >
                {t("gd.deleteForever")}
              </button>
            </div>
          </article>
        ))}
      </div>

      {edit && (
        <CategoryForm
          cat={edit}
          isNew={!list.some((c) => c.key === edit.key)}
          busy={Boolean(busy)}
          onCancel={() => setEdit(null)}
          onSave={save}
        />
      )}
    </section>
  );
}

function CategoryForm({
  cat, isNew, busy, onCancel, onSave,
}: {
  cat: AdminCat;
  isNew: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (c: AdminCat) => void;
}) {
  const { t } = useT();
  const [c, setC] = useState<AdminCat>(cat);
  const set = (patch: Partial<AdminCat>) => setC({ ...c, ...patch });
  const setTr = (l: Lang, v: string) => setC({ ...c, tr: { ...c.tr, [l]: v } });

  /* Ключ подсказываем из латышского названия, но править его можно
     только у новой категории. */
  const suggest = () => {
    if (!isNew || c.key) return;
    const base = (c.tr.lv || "")
      .toLowerCase()
      .replace(/[āăą]/g, "a").replace(/[čć]/g, "c").replace(/[ēėę]/g, "e")
      .replace(/[ģ]/g, "g").replace(/[īįi]/g, "i").replace(/[ķ]/g, "k")
      .replace(/[ļ]/g, "l").replace(/[ņ]/g, "n").replace(/[š]/g, "s")
      .replace(/[ūų]/g, "u").replace(/[žź]/g, "z")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    if (base.length >= 2) set({ key: base });
  };

  const ready = c.key.length >= 2 && Boolean((c.tr.lv || "").trim());

  return (
    <div className="ct-form">
      <h4>{isNew ? t("ct.newTitle") : t("ct.editTitle")}</h4>

      <div className="ct-grid">
        {SITE_LANGS.map((l) => (
          <label key={l.code} className="adm-f">
            <span>{l.full}{l.code === "lv" ? " *" : ""}</span>
            <input
              value={c.tr[l.code] || ""}
              onChange={(e) => setTr(l.code, e.target.value)}
              onBlur={l.code === "lv" ? suggest : undefined}
              placeholder={l.code === "lv" ? t("ct.namePh") : ""}
            />
          </label>
        ))}
      </div>

      <label className="adm-f">
        <span>{t("ct.key")}</span>
        <input
          value={c.key}
          disabled={!isNew}
          onChange={(e) => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
          placeholder="lamps"
        />
        <i className="adm-hint">{isNew ? t("ct.keyHint") : t("ct.keyLocked")}</i>
      </label>

      <label className="adm-f">
        <span>{t("ct.icon")}</span>
        <div className="ct-icons">
          {ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              className={c.icon === ic ? "on" : ""}
              onClick={() => set({ icon: ic })}
            >
              {ic}
            </button>
          ))}
        </div>
      </label>

      <label className="adm-f">
        <span>{t("ct.words")}</span>
        <input value={c.words || ""} onChange={(e) => set({ words: e.target.value })} placeholder="lamp|lustra|люстра" />
        <i className="adm-hint">{t("ct.wordsHint")}</i>
      </label>

      <div className="mp-btns">
        <button className="adm-btn adm-btn-sm" disabled={!ready || busy} onClick={() => onSave(c)}>
          {t("ed.save")}
        </button>
        <button className="adm-btn adm-btn-sm adm-ghost" onClick={onCancel}>{t("ed.cancel")}</button>
      </div>
    </div>
  );
}
