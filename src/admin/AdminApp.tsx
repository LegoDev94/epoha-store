import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Lang, Lot } from "../data/catalog";
import "./admin.css";

/* ═══ Админка EPOHA ═══
   Импорт товара по ссылке аукциона (фото + описание тянутся сами),
   ручное добавление, редактирование трёх языков, заказы. */

const CATS: { v: Category; l: string }[] = [
  { v: "seating", l: "Мягкая мебель" },
  { v: "mirror", l: "Зеркала" },
  { v: "light", l: "Свет" },
  { v: "storage", l: "Комоды и хранение" },
  { v: "table", l: "Столы" },
];
const LANGS: { v: Lang; l: string }[] = [
  { v: "lv", l: "Latviski" },
  { v: "en", l: "English" },
  { v: "ru", l: "Русский" },
];

const empty = (): Lot => ({
  id: 0,
  n: "",
  cat: "seating",
  price: 0,
  sold: false,
  images: [],
  source: "",
  tr: {
    lv: { title: "", era: "", desc: "" },
    en: { title: "", era: "", desc: "" },
    ru: { title: "", era: "", desc: "" },
  },
});

function useApi(token: string) {
  return useCallback(
    async (url: string, opts: RequestInit = {}) => {
      const res = await fetch(url, {
        ...opts,
        headers: {
          ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          "x-token": token,
          ...(opts.headers || {}),
        },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return res.json();
    },
    [token]
  );
}

/* ── вход ── */
function Login({ onIn }: { onIn: (t: string) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) throw new Error("Неверный пароль");
      const { token } = await r.json();
      localStorage.setItem("epoha-token", token);
      onIn(token);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-login">
      <form onSubmit={submit}>
        <h1>EPOHA · админка</h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Пароль"
          autoFocus
        />
        {err && <p className="adm-err">{err}</p>}
        <button className="adm-btn" disabled={busy}>
          {busy ? "Вход…" : "Войти"}
        </button>
        <a href="#/" className="adm-back">
          ← на витрину
        </a>
      </form>
    </div>
  );
}

/* ── редактор товара ── */
function Editor({
  item,
  onClose,
  onSave,
  api,
}: {
  item: Lot;
  onClose: () => void;
  onSave: (l: Lot) => void;
  api: ReturnType<typeof useApi>;
}) {
  const [p, setP] = useState<Lot>(structuredClone(item));
  /* Открываем вкладку языка, на котором карточка уже заполнена */
  const [tab, setTab] = useState<Lang>(
    () => (["lv", "en", "ru"] as Lang[]).find((l) => item.tr[l]?.title.trim()) || "lv"
  );
  const [busy, setBusy] = useState<false | "save" | "tr" | "up">(false);
  const [imgUrl, setImgUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const setTr = (lang: Lang, field: "title" | "era" | "desc", v: string) =>
    setP((s) => ({ ...s, tr: { ...s.tr, [lang]: { ...s.tr[lang], [field]: v } } }));

  const copyFrom = (from: Lang) =>
    setP((s) => ({ ...s, tr: { ...s.tr, [tab]: { ...s.tr[from] } } }));

  /* Авто-перевод активной вкладки на два других языка */
  const translate = async () => {
    if (!p.tr[tab].title.trim()) return alert(`Заполните карточку на ${tab.toUpperCase()} — с неё и переведём`);
    setBusy("tr");
    try {
      const done = await api("api/admin/translate", {
        method: "POST",
        body: JSON.stringify({ tr: p.tr, from: tab }),
      });
      setP((s) => ({ ...s, tr: { ...s.tr, ...done, [tab]: s.tr[tab] } }));
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("up");
    try {
      const fd = new FormData();
      [...files].forEach((f) => fd.append("files", f));
      const { images } = await api("api/admin/upload", { method: "POST", body: fd });
      setP((s) => ({ ...s, images: [...s.images, ...images] }));
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!p.tr.lv.title.trim() && !p.tr.en.title.trim() && !p.tr.ru.title.trim())
      return alert("Заполните карточку хотя бы на одном языке");
    setBusy("save");
    try {
      const saved = await api("api/admin/products", { method: "POST", body: JSON.stringify(p) });
      onSave(saved);
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-modal-bg" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <header className="adm-modal-head">
          <h2>{item.id ? `Товар № ${item.n || item.id}` : "Новый товар"}</h2>
          <button className="adm-x" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="adm-modal-body">
          <div className="adm-grid">
            <label className="adm-f">
              <span>Номер витрины</span>
              <input value={p.n} onChange={(e) => setP({ ...p, n: e.target.value })} placeholder="20" />
            </label>
            <label className="adm-f">
              <span>Цена продажи, €</span>
              <input
                type="number"
                value={p.price || ""}
                onChange={(e) => setP({ ...p, price: Number(e.target.value) })}
                placeholder="450"
              />
            </label>
            <label className="adm-f">
              <span>Категория</span>
              <select value={p.cat} onChange={(e) => setP({ ...p, cat: e.target.value as Category })}>
                {CATS.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.l}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-f adm-check">
              <input type="checkbox" checked={!!p.sold} onChange={(e) => setP({ ...p, sold: e.target.checked })} />
              <span>Продано</span>
            </label>
          </div>

          <div className="adm-imgs">
            {p.images.map((im, i) => (
              <div className="adm-img" key={im + i}>
                <img src={im} alt="" />
                <button onClick={() => setP({ ...p, images: p.images.filter((_, k) => k !== i) })}>✕</button>
                {i === 0 && <b>обложка</b>}
              </div>
            ))}
            <div className="adm-img adm-img-add">
              <button onClick={() => fileRef.current?.click()}>{busy === "up" ? "…" : "+ файл"}</button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => upload(e.target.files)}
              />
            </div>
          </div>
          <div className="adm-row">
            <input
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              placeholder="…или вставьте прямую ссылку на фото"
            />
            <button
              className="adm-btn adm-btn-sm"
              onClick={() => {
                if (imgUrl.trim()) {
                  setP({ ...p, images: [...p.images, imgUrl.trim()] });
                  setImgUrl("");
                }
              }}
            >
              Добавить
            </button>
          </div>

          <div className="adm-tabs">
            {LANGS.map((l) => (
              <button key={l.v} className={tab === l.v ? "on" : ""} onClick={() => setTab(l.v)}>
                {l.l}
                {!p.tr[l.v].title && <i>·</i>}
              </button>
            ))}
            <div className="adm-copy">
              <button className="adm-tr" onClick={translate} disabled={!!busy}>
                {busy === "tr" ? "Перевод…" : `✦ Перевести с ${tab.toUpperCase()} на остальные`}
              </button>
              {LANGS.filter((l) => l.v !== tab).map((l) => (
                <button key={l.v} onClick={() => copyFrom(l.v)}>
                  ← копировать {l.v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <label className="adm-f">
            <span>Название ({tab.toUpperCase()})</span>
            <input value={p.tr[tab].title} onChange={(e) => setTr(tab, "title", e.target.value)} />
          </label>
          <label className="adm-f">
            <span>Эпоха / происхождение</span>
            <input
              value={p.tr[tab].era}
              onChange={(e) => setTr(tab, "era", e.target.value)}
              placeholder={tab === "lv" ? "Zviedrija · 20. gs." : tab === "en" ? "Sweden · 20th century" : "Швеция · XX век"}
            />
          </label>
          <label className="adm-f">
            <span>Описание</span>
            <textarea rows={5} value={p.tr[tab].desc} onChange={(e) => setTr(tab, "desc", e.target.value)} />
          </label>

          {p.source && (
            <p className="adm-src">
              Источник:{" "}
              <a href={p.source} target="_blank" rel="noopener noreferrer">
                {p.source}
              </a>
            </p>
          )}
        </div>

        <footer className="adm-modal-foot">
          <span className="adm-foot-hint">
            Пустые языки заполнятся автоматически при сохранении
          </span>
          <button className="adm-btn adm-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="adm-btn" onClick={save} disabled={!!busy}>
            {busy === "save" ? "Сохранение…" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── панель ── */
export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem("epoha-token") || "");
  const api = useApi(token);
  const [items, setItems] = useState<Lot[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [tab, setTab] = useState<"goods" | "orders">("goods");
  const [edit, setEdit] = useState<Lot | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("api/products")
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (token && tab === "orders") api("api/admin/orders").then(setOrders).catch(() => {});
  }, [token, tab, api]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) =>
      `${i.n} ${i.tr.lv.title} ${i.tr.en.title} ${i.tr.ru.title}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  if (!token) return <Login onIn={setToken} />;

  const doImport = async () => {
    if (!url.trim()) return;
    setBusy("Тянем данные со страницы…");
    try {
      const draft = await api("api/admin/import", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      const base = empty();
      setEdit({
        ...base,
        ...draft,
        price: draft.priceHint ? Math.round(draft.priceHint * 3) : 0,
        tr: draft.tr || base.tr,
      });
      setUrl("");
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const remove = async (l: Lot) => {
    if (!confirm(`Удалить «${l.tr.lv.title || l.tr.en.title}»?`)) return;
    await api(`api/admin/products/${l.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="adm">
      <header className="adm-top">
        <b>EPOHA · админка</b>
        <nav>
          <button className={tab === "goods" ? "on" : ""} onClick={() => setTab("goods")}>
            Товары <i>{items.length}</i>
          </button>
          <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>
            Заказы <i>{orders.length}</i>
          </button>
        </nav>
        <a href="#/" className="adm-link">
          Витрина ↗
        </a>
        <button
          className="adm-link"
          onClick={() => {
            localStorage.removeItem("epoha-token");
            setToken("");
          }}
        >
          Выйти
        </button>
      </header>

      {tab === "goods" && (
        <>
          <section className="adm-import">
            <div className="adm-import-main">
              <label className="adm-f">
                <span>Импорт по ссылке — вставьте адрес товара с аукциона</span>
                <div className="adm-row">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doImport()}
                    placeholder="https://auctionet.com/en/5212622-sofa-rococo-style"
                  />
                  <button className="adm-btn" onClick={doImport} disabled={!!busy}>
                    {busy ? "…" : "Импортировать"}
                  </button>
                </div>
              </label>
              <p className="adm-hint">
                Фото и описание подтянутся автоматически — вам останется поставить цену
                (подставим ×3 от эстимейта) и перевести карточку. {busy}
              </p>
            </div>
            <button className="adm-btn adm-ghost" onClick={() => setEdit(empty())}>
              + Добавить вручную
            </button>
          </section>

          <div className="adm-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или номеру" />
          </div>

          <div className="adm-list">
            {shown.map((l) => (
              <article className="adm-card" key={l.id}>
                <img src={l.images[0] || ""} alt="" />
                <div className="adm-card-main">
                  <b>{l.tr.lv.title || l.tr.en.title || "— без названия —"}</b>
                  <span>
                    № {l.n} · {CATS.find((c) => c.v === l.cat)?.l} · {l.images.length} фото
                  </span>
                  <span className="adm-langs">
                    {LANGS.map((x) => (
                      <i key={x.v} className={l.tr[x.v].title ? "ok" : ""}>
                        {x.v.toUpperCase()}
                      </i>
                    ))}
                  </span>
                </div>
                <div className="adm-card-right">
                  <b>€{l.price}</b>
                  {l.sold && <span className="adm-sold">продано</span>}
                  <div>
                    <button className="adm-btn adm-btn-sm" onClick={() => setEdit(l)}>
                      Изменить
                    </button>
                    <button className="adm-btn adm-btn-sm adm-danger" onClick={() => remove(l)}>
                      Удалить
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {shown.length === 0 && <p className="adm-empty">Товаров нет — импортируйте по ссылке или добавьте вручную.</p>}
          </div>
        </>
      )}

      {tab === "orders" && (
        <div className="adm-list">
          {orders.length === 0 && <p className="adm-empty">Заказов пока нет.</p>}
          {orders.map((o, i) => (
            <article className="adm-card adm-order" key={i}>
              <div className="adm-card-main">
                <b>{String(o.order)}</b>
                <span>
                  {String(o.name || "")} · {String(o.contact || "")} · {String(o.city || "")}
                </span>
                <span>{String(o.comment || "")}</span>
              </div>
              <div className="adm-card-right">
                <b>€{String(o.total)}</b>
                <span>{new Date(String(o.at)).toLocaleString("ru-RU")}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {edit && (
        <Editor
          item={edit}
          api={api}
          onClose={() => setEdit(null)}
          onSave={() => {
            setEdit(null);
            load();
          }}
        />
      )}
    </div>
  );
}
