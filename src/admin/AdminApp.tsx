import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Lang, Lot } from "../data/catalog";
import { Select } from "../ui/Select";
import "./admin.css";

/* ═══ Панель маркетплейса VINTAGE MĒBELES ═══
   Роли: администратор площадки (всё) и продавец (свои товары и продажи).
   Комиссия площадки удерживается с каждой проданной позиции. */

const CATS: { v: Category; l: string }[] = [
  { v: "seating", l: "Мягкая мебель" },
  { v: "mirror", l: "Зеркала" },
  { v: "light", l: "Свет" },
  { v: "storage", l: "Комоды и хранение" },
  { v: "table", l: "Столы" },
  { v: "decor", l: "Декор и керамика" },
];
const LANGS: { v: Lang; l: string }[] = [
  { v: "lv", l: "Latviski" },
  { v: "en", l: "English" },
  { v: "ru", l: "Русский" },
];
const STATUS: Record<string, string> = {
  new: "новый",
  paid: "оплачен",
  done: "выполнен",
  cancelled: "отменён",
};
const money = (n: number | undefined) =>
  "€" + (Math.round((n || 0) * 100) / 100).toLocaleString("ru-RU");

interface OrderItem {
  id: number;
  n?: string;
  title?: string;
  price?: number;
  img?: string;
  sellerId?: string | null;
}
interface OrderView {
  order: string;
  at: string;
  status?: string;
  total?: number;
  fee?: number;
  net?: number;
  gross?: number;
  deliveryFee?: number;
  delivery?: string;
  address?: string;
  name?: string;
  contact?: string;
  email?: string;
  comment?: string;
  items?: OrderItem[];
}
interface Seller {
  id: string;
  login: string;
  name: string;
  contact?: string;
  commission: number;
  active: boolean;
  products?: number;
  createdAt?: string;
}
interface StatsRow {
  id: string | null;
  name: string;
  sold: number;
  gross: number;
  fee: number;
  net: number;
  pending: number;
  commission?: number;
  products?: number;
}
interface Stats {
  role: string;
  commission?: number;
  products?: number;
  totals: Record<string, number>;
  rows?: StatsRow[];
  history?: OrderView[];
}
interface Me {
  role: "admin" | "seller";
  id: string | null;
  name: string;
  commission: number;
}

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

/* ── вход: администратор или продавец ── */
function Login({ onIn }: { onIn: (t: string, me: Me) => void }) {
  const [login, setLogin] = useState("");
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
        body: JSON.stringify({ login, password: pw }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Неверный логин или пароль");
      localStorage.setItem("epoha-token", data.token);
      onIn(data.token, { role: data.role, id: null, name: data.name, commission: data.commission ?? 20 });
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-login">
      <form onSubmit={submit}>
        <h1>VINTAGE MĒBELES</h1>
        <p className="adm-login-sub">кабинет площадки и продавцов</p>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин" autoFocus />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Пароль" />
        {err && <p className="adm-err">{err}</p>}
        <button className="adm-btn" disabled={busy}>{busy ? "Вход…" : "Войти"}</button>
        <a href="#/" className="adm-back">← на витрину</a>
      </form>
    </div>
  );
}

/* ── редактор товара ── */
function Editor({
  item,
  note,
  onClose,
  onSave,
  api,
}: {
  item: Lot;
  note?: string;
  onClose: () => void;
  onSave: (l: Lot) => void;
  api: ReturnType<typeof useApi>;
}) {
  const [p, setP] = useState<Lot>(structuredClone(item));
  const [tab, setTab] = useState<Lang>(
    () => (["lv", "en", "ru"] as Lang[]).find((l) => item.tr[l]?.title.trim()) || "lv"
  );
  const [busy, setBusy] = useState<false | "save" | "tr" | "up">(false);
  const [imgUrl, setImgUrl] = useState("");
  const [progress, setProgress] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setTr = (lang: Lang, field: "title" | "era" | "desc", v: string) =>
    setP((s) => ({ ...s, tr: { ...s.tr, [lang]: { ...s.tr[lang], [field]: v } } }));
  const copyFrom = (from: Lang) => setP((s) => ({ ...s, tr: { ...s.tr, [tab]: { ...s.tr[from] } } }));

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

  /* Снимок с телефона весит 5–12 МБ: ужимаем прямо в браузере, на
     сервер уходит лёгкий JPEG, витрина остаётся быстрой. */
  const shrink = (file: File): Promise<File> =>
    new Promise((resolve) => {
      if (!/^image\/(jpe?g|png|webp)$/i.test(file.type) || file.size < 400_000) return resolve(file);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1) return resolve(file);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) =>
            resolve(
              blob
                ? new File([blob], file.name.replace(/\.(png|webp)$/i, ".jpg"), { type: "image/jpeg" })
                : file
            ),
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });

  const upload = async (files: FileList | File[] | null) => {
    const list = files ? [...files].filter((f) => f.type.startsWith("image/")) : [];
    if (!list.length) return;
    setBusy("up");
    setProgress(`0 / ${list.length}`);
    try {
      const done: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const fd = new FormData();
        fd.append("files", await shrink(list[i]));
        const { images } = await api("api/admin/upload", { method: "POST", body: fd });
        done.push(...images);
        setProgress(`${i + 1} / ${list.length}`);
        setP((s) => ({ ...s, images: [...s.images, ...images] }));
      }
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const save = async () => {
    if (!p.tr.lv.title.trim() && !p.tr.en.title.trim() && !p.tr.ru.title.trim())
      return alert("Заполните карточку хотя бы на одном языке");
    setBusy("save");
    try {
      const saved = await api("api/admin/products", { method: "POST", body: JSON.stringify(p) });
      if (saved?.translateError)
        alert(`Товар сохранён, но авто-перевод не сработал:\n${saved.translateError}\n\nЗаполните языки вручную или нажмите «Перевести».`);
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
          <button className="adm-x" onClick={onClose}>✕</button>
        </header>

        <div className="adm-modal-body">
          {note && <p className="adm-note">{note}</p>}
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
              <Select
                className="sel-sq sel-full"
                value={p.cat}
                onChange={(v) => setP({ ...p, cat: v as Category })}
                options={CATS.map((c) => ({ value: c.v, label: c.l }))}
              />
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
                <button
                  className="adm-img-x"
                  title="Удалить фото"
                  onClick={() => setP({ ...p, images: p.images.filter((_, k) => k !== i) })}
                >
                  ✕
                </button>
                {i === 0 ? (
                  <b>обложка</b>
                ) : (
                  <button
                    className="adm-img-cover"
                    onClick={() =>
                      setP({ ...p, images: [im, ...p.images.filter((_, k) => k !== i)] })
                    }
                  >
                    сделать обложкой
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            className={`adm-drop${drag ? " over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              upload(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
            </svg>
            <b>{busy === "up" ? `Загружаем ${progress}…` : "Перетащите фото сюда или выберите файлы"}</b>
            <i>JPG, PNG или WEBP · можно сразу несколько · большие снимки сожмём автоматически</i>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>

          <details className="adm-bylink">
            <summary>…или добавить фото по прямой ссылке</summary>
            <div className="adm-row">
              <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="https://…/photo.jpg" />
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
          </details>

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
                <button key={l.v} onClick={() => copyFrom(l.v)}>← копировать {l.v.toUpperCase()}</button>
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
              Источник: <a href={p.source} target="_blank" rel="noopener noreferrer">{p.source}</a>
            </p>
          )}
        </div>

        <footer className="adm-modal-foot">
          <span className="adm-foot-hint">Пустые языки заполнятся автоматически при сохранении</span>
          <button className="adm-btn adm-ghost" onClick={onClose}>Отмена</button>
          <button className="adm-btn" onClick={save} disabled={!!busy}>
            {busy === "save" ? "Сохранение…" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── карточка продавца ── */
function SellerForm({
  seller,
  onClose,
  onSave,
  api,
}: {
  seller: Partial<Seller>;
  onClose: () => void;
  onSave: () => void;
  api: ReturnType<typeof useApi>;
}) {
  const [f, setF] = useState({
    id: seller.id,
    login: seller.login || "",
    name: seller.name || "",
    contact: seller.contact || "",
    commission: seller.commission ?? 20,
    active: seller.active !== false,
    password: "",
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api("api/admin/sellers", { method: "POST", body: JSON.stringify(f) });
      onSave();
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-modal-bg" onClick={onClose}>
      <div className="adm-modal adm-modal-sm" onClick={(e) => e.stopPropagation()}>
        <header className="adm-modal-head">
          <h2>{seller.id ? `Продавец: ${seller.name}` : "Новый продавец"}</h2>
          <button className="adm-x" onClick={onClose}>✕</button>
        </header>
        <div className="adm-modal-body">
          <div className="adm-grid">
            <label className="adm-f">
              <span>Имя / магазин</span>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Anna Ozola" />
            </label>
            <label className="adm-f">
              <span>Логин для входа</span>
              <input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} placeholder="anna" />
            </label>
            <label className="adm-f">
              <span>Комиссия площадки, %</span>
              <input
                type="number"
                value={f.commission}
                onChange={(e) => setF({ ...f, commission: Number(e.target.value) })}
              />
            </label>
            <label className="adm-f adm-check">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
              <span>Доступ активен</span>
            </label>
          </div>
          <label className="adm-f">
            <span>Контакт (телефон, почта)</span>
            <input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="+371 20 000 000 · anna@mail.lv" />
          </label>
          <label className="adm-f">
            <span>{seller.id ? "Новый пароль (пусто — не менять)" : "Пароль"}</span>
            <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="минимум 6 символов" />
          </label>
          <p className="adm-hint">
            Продавец войдёт по этому логину и паролю на этой же странице и увидит только свои
            товары и продажи. Комиссия удерживается с каждой проданной позиции.
          </p>
        </div>
        <footer className="adm-modal-foot">
          <button className="adm-btn adm-ghost" onClick={onClose}>Отмена</button>
          <button className="adm-btn" onClick={save} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── панель ── */
export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem("epoha-token") || "");
  const [me, setMe] = useState<Me | null>(null);
  const api = useApi(token);

  const [items, setItems] = useState<Lot[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"goods" | "orders" | "sellers" | "stats">("goods");

  const [edit, setEdit] = useState<Lot | null>(null);
  const [note, setNote] = useState("");
  const [sellerEdit, setSellerEdit] = useState<Partial<Seller> | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");

  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fSeller, setFSeller] = useState("all");
  const [fSort, setFSort] = useState("new");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const [oq, setOq] = useState("");
  const [oStatus, setOStatus] = useState("all");
  const [oDelivery, setODelivery] = useState("all");
  const [oSort, setOSort] = useState("new");
  const [oMin, setOMin] = useState("");
  const [oMax, setOMax] = useState("");

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (!token) return;
    api("api/admin/me")
      .then(setMe)
      .catch(() => {
        localStorage.removeItem("epoha-token");
        setToken("");
        setMe(null);
      });
  }, [token, api]);

  const loadProducts = useCallback(() => {
    fetch("api/products").then((r) => r.json()).then(setItems).catch(() => setItems([]));
  }, []);
  const loadOrders = useCallback(() => {
    api("api/admin/orders").then(setOrders).catch(() => {});
  }, [api]);
  const loadSellers = useCallback(() => {
    api("api/admin/sellers").then(setSellers).catch(() => {});
  }, [api]);
  const loadStats = useCallback(() => {
    api("api/admin/stats").then(setStats).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (!me) return;
    loadProducts();
    loadOrders();
    loadStats();
    if (me.role === "admin") loadSellers();
  }, [me, loadProducts, loadOrders, loadStats, loadSellers]);

  const myItems = useMemo(
    () => (isAdmin ? items : items.filter((i) => (i as Lot & { sellerId?: string }).sellerId === me?.id)),
    [items, isAdmin, me]
  );

  const shown = useMemo(() => {
    let list = myItems.slice();
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter((i) =>
        `${i.n} ${i.tr.lv.title} ${i.tr.en.title} ${i.tr.ru.title}`.toLowerCase().includes(s)
      );
    if (fCat !== "all") list = list.filter((i) => i.cat === fCat);
    if (fSeller !== "all")
      list = list.filter(
        (i) => ((i as Lot & { sellerId?: string | null }).sellerId || "shop") === fSeller
      );
    const min = Number(fMin) || 0;
    const max = Number(fMax) || Infinity;
    list = list.filter((i) => i.price >= min && i.price <= max);
    const ts = (i: Lot) => (i.createdAt ? Date.parse(i.createdAt) : 0);
    if (fSort === "new") list.sort((a, b) => ts(b) - ts(a));
    if (fSort === "old") list.sort((a, b) => ts(a) - ts(b));
    if (fSort === "cheap") list.sort((a, b) => a.price - b.price);
    if (fSort === "rich") list.sort((a, b) => b.price - a.price);
    return list;
  }, [myItems, q, fCat, fSeller, fSort, fMin, fMax]);

  const shownOrders = useMemo(() => {
    let list = orders.slice();
    const s = oq.trim().toLowerCase();
    if (s)
      list = list.filter((o) =>
        `${o.order} ${o.name || ""} ${o.email || ""} ${o.contact || ""} ${o.address || ""}`.toLowerCase().includes(s)
      );
    if (oStatus !== "all") list = list.filter((o) => (o.status || "new") === oStatus);
    if (oDelivery !== "all") list = list.filter((o) => o.delivery === oDelivery);
    const min = Number(oMin) || 0;
    const max = Number(oMax) || Infinity;
    list = list.filter((o) => (o.total ?? 0) >= min && (o.total ?? 0) <= max);
    if (oSort === "new") list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    if (oSort === "old") list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (oSort === "big") list.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    if (oSort === "small") list.sort((a, b) => (a.total ?? 0) - (b.total ?? 0));
    return list;
  }, [orders, oq, oStatus, oDelivery, oSort, oMin, oMax]);

  if (!token || !me) return <Login onIn={(t, m) => { setToken(t); setMe(m); }} />;

  const doImport = async () => {
    if (!url.trim()) return;
    setBusy("Тянем данные со страницы…");
    try {
      const draft = await api("api/admin/import", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      const dup = items.find((i) => i.id === draft.id);
      setNote(dup ? `Этот предмет уже есть в каталоге под № ${dup.n} — сохранение обновит существующую карточку.` : "");
      const base = empty();
      setEdit({ ...base, ...draft, price: draft.priceHint ? Math.round(draft.priceHint * 3) : 0, tr: draft.tr || base.tr });
      setUrl("");
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const remove = async (l: Lot) => {
    if (!confirm(`Удалить «${l.tr.lv.title || l.tr.en.title}»?`)) return;
    try {
      await api(`api/admin/products/${l.id}`, { method: "DELETE" });
      loadProducts();
    } catch (e) {
      alert(String((e as Error).message));
    }
  };
  const setStatus = async (num: string, status: string) => {
    await api(`api/admin/orders/${num}`, { method: "POST", body: JSON.stringify({ status }) });
    loadOrders();
    loadStats();
  };
  const removeOrder = async (num: string) => {
    if (!confirm(`Удалить заказ ${num}?`)) return;
    await api(`api/admin/orders/${num}`, { method: "DELETE" });
    loadOrders();
    loadStats();
  };
  const removeSeller = async (s: Seller) => {
    if (!confirm(`Удалить продавца «${s.name}»? Его товары останутся на витрине.`)) return;
    await api(`api/admin/sellers/${s.id}`, { method: "DELETE" });
    loadSellers();
    loadStats();
  };

  const sellerName = (id?: string | null) =>
    id ? sellers.find((s) => s.id === id)?.name || "продавец" : "витрина магазина";

  return (
    <div className="adm">
      <header className="adm-top">
        <b>VINTAGE MĒBELES</b>
        <span className={`adm-role adm-role-${me.role}`}>
          {isAdmin ? "площадка" : `продавец · ${me.name}`}
        </span>
        <nav>
          <button className={tab === "goods" ? "on" : ""} onClick={() => setTab("goods")}>
            {isAdmin ? "Товары" : "Мои товары"} <i>{myItems.length}</i>
          </button>
          <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>
            {isAdmin ? "Заказы" : "Мои продажи"} <i>{orders.length}</i>
          </button>
          {isAdmin && (
            <button className={tab === "sellers" ? "on" : ""} onClick={() => setTab("sellers")}>
              Продавцы <i>{sellers.length}</i>
            </button>
          )}
          <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>
            {isAdmin ? "Статистика" : "Заработок"}
          </button>
        </nav>
        <a href="#/" className="adm-link">Витрина ↗</a>
        <button
          className="adm-link"
          onClick={() => {
            localStorage.removeItem("epoha-token");
            setToken("");
            setMe(null);
          }}
        >
          Выйти
        </button>
      </header>

      {tab === "goods" && (
        <>
          {isAdmin ? (
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
                Фото и описание подтянутся автоматически — вам останется поставить цену и
                перевести карточку. {busy}
              </p>
            </div>
            <button className="adm-btn adm-ghost" onClick={() => { setNote(""); setEdit(empty()); }}>
              + Добавить вручную
            </button>
          </section>
          ) : (
            <section className="adm-import">
              <div className="adm-import-main">
                <b className="adm-sec-title">Ваши товары на витрине</b>
                <p className="adm-hint">
                  Заполните карточку, загрузите фото со своего устройства — товар появится на
                  витрине сразу на трёх языках. Переводы сделаем автоматически.
                </p>
              </div>
              <button className="adm-btn" onClick={() => { setNote(""); setEdit(empty()); }}>
                + Добавить товар
              </button>
            </section>
          )}

          <div className="adm-filters">
            <input className="adm-fl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или номеру" />
            <Select
              className="sel-sq"
              value={fCat}
              onChange={setFCat}
              options={[{ value: "all", label: "Все категории" }, ...CATS.map((c) => ({ value: c.v, label: c.l }))]}
            />
            {isAdmin && (
              <Select
                className="sel-sq"
                value={fSeller}
                onChange={setFSeller}
                options={[
                  { value: "all", label: "Все продавцы" },
                  { value: "shop", label: "Витрина магазина" },
                  ...sellers.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            )}
            <Select
              className="sel-sq"
              value={fSort}
              onChange={setFSort}
              options={[
                { value: "new", label: "Сначала новые" },
                { value: "old", label: "Сначала старые" },
                { value: "cheap", label: "Дешевле" },
                { value: "rich", label: "Дороже" },
              ]}
            />
            <div className="adm-fl-range">
              <input type="number" value={fMin} onChange={(e) => setFMin(e.target.value)} placeholder="€ от" />
              <input type="number" value={fMax} onChange={(e) => setFMax(e.target.value)} placeholder="€ до" />
            </div>
            <span className="adm-fl-count">{shown.length}</span>
            {(q || fCat !== "all" || fSeller !== "all" || fSort !== "new" || fMin || fMax) && (
              <button
                className="adm-fl-reset"
                onClick={() => { setQ(""); setFCat("all"); setFSeller("all"); setFSort("new"); setFMin(""); setFMax(""); }}
              >
                ✕ сбросить
              </button>
            )}
          </div>

          <div className="adm-list">
            {shown.map((l) => {
              const sid = (l as Lot & { sellerId?: string | null }).sellerId || null;
              return (
                <article className="adm-card" key={l.id}>
                  <img src={l.images[0] || ""} alt="" />
                  <div className="adm-card-main">
                    <b>{l.tr.lv.title || l.tr.en.title || "— без названия —"}</b>
                    <span>
                      № {l.n} · {CATS.find((c) => c.v === l.cat)?.l} · {l.images.length} фото
                      {l.createdAt ? ` · ${new Date(l.createdAt).toLocaleDateString("ru-RU")}` : ""}
                    </span>
                    <span className="adm-langs">
                      {LANGS.map((x) => (
                        <i key={x.v} className={l.tr[x.v].title ? "ok" : ""}>{x.v.toUpperCase()}</i>
                      ))}
                      {isAdmin && <i className="adm-seller-tag">{sellerName(sid)}</i>}
                    </span>
                  </div>
                  <div className="adm-card-right">
                    <b>€{l.price}</b>
                    {l.sold && <span className="adm-sold">продано</span>}
                    <div>
                      <button className="adm-btn adm-btn-sm" onClick={() => { setNote(""); setEdit(l); }}>Изменить</button>
                      <button className="adm-btn adm-btn-sm adm-danger" onClick={() => remove(l)}>Удалить</button>
                    </div>
                  </div>
                </article>
              );
            })}
            {shown.length === 0 && (
              <p className="adm-empty">
                {isAdmin
                  ? "Товаров нет — импортируйте по ссылке или добавьте вручную."
                  : "У вас пока нет товаров. Добавьте первый — он появится на витрине."}
              </p>
            )}
          </div>
        </>
      )}

      {tab === "orders" && (
        <>
          <div className="adm-filters">
            <input className="adm-fl-search" value={oq} onChange={(e) => setOq(e.target.value)} placeholder="Поиск: номер, имя, почта, телефон, адрес" />
            <Select
              className="sel-sq"
              value={oStatus}
              onChange={setOStatus}
              options={[
                { value: "all", label: "Любой статус" },
                { value: "new", label: "Новые" },
                { value: "paid", label: "Оплаченные" },
                { value: "done", label: "Выполненные" },
                { value: "cancelled", label: "Отменённые" },
              ]}
            />
            <Select
              className="sel-sq"
              value={oDelivery}
              onChange={setODelivery}
              options={[
                { value: "all", label: "Любое получение" },
                { value: "pickup", label: "Самовывоз" },
                { value: "courier", label: "Доставка" },
              ]}
            />
            <Select
              className="sel-sq"
              value={oSort}
              onChange={setOSort}
              options={[
                { value: "new", label: "Сначала новые" },
                { value: "old", label: "Сначала старые" },
                { value: "big", label: "Сумма больше" },
                { value: "small", label: "Сумма меньше" },
              ]}
            />
            <div className="adm-fl-range">
              <input type="number" value={oMin} onChange={(e) => setOMin(e.target.value)} placeholder="€ от" />
              <input type="number" value={oMax} onChange={(e) => setOMax(e.target.value)} placeholder="€ до" />
            </div>
            <span className="adm-fl-count">{shownOrders.length}</span>
          </div>

          <div className="adm-list">
            {shownOrders.length === 0 && <p className="adm-empty">Заказы не найдены.</p>}
            {shownOrders.map((o) => {
              const status = o.status || "new";
              return (
                <article className="adm-ord" key={o.order}>
                  <header className="adm-ord-top">
                    <b>{o.order}</b>
                    <span className={`adm-badge adm-st-${status}`}>{STATUS[status] || status}</span>
                    <time>{new Date(o.at).toLocaleString("ru-RU")}</time>
                    <u>{money(o.total)}</u>
                  </header>

                  <div className="adm-ord-who">
                    <span><i>Покупатель</i>{o.name} · {o.contact}{o.email ? ` · ${o.email}` : ""}</span>
                    <span>
                      <i>Получение</i>
                      {o.delivery === "courier"
                        ? `Доставка до дверей${o.deliveryFee ? ` (+€${o.deliveryFee})` : ""} — ${o.address || "адрес не указан"}`
                        : o.delivery === "pickup"
                          ? "Самовывоз со склада в Талси (бесплатно)"
                          : "—"}
                    </span>
                    {o.comment && <span><i>Комментарий</i>{o.comment}</span>}
                  </div>

                  <div className="adm-ord-items">
                    {(o.items || []).map((it, k) => {
                      const prod = items.find((x) => x.id === it.id);
                      const img = it.img || prod?.images?.[0] || "";
                      return (
                        <div className="adm-ord-item" key={String(it.id) + k}>
                          {img ? <img src={img} alt="" /> : <span className="adm-ord-noimg" />}
                          <span>
                            <b>{it.title || prod?.tr.lv.title || `#${it.id}`}</b>
                            <i>
                              № {it.n ?? prod?.n ?? "—"}
                              {isAdmin ? ` · ${sellerName(it.sellerId)}` : ""}
                            </i>
                          </span>
                          <em>{money(it.price)}</em>
                        </div>
                      );
                    })}
                    {isAdmin && o.deliveryFee ? (
                      <div className="adm-ord-item adm-ord-ship">
                        <span><b>Доставка</b></span>
                        <em>{money(o.deliveryFee)}</em>
                      </div>
                    ) : null}
                  </div>

                  {!isAdmin && (
                    <div className="adm-ord-money">
                      <span>Ваши позиции <b>{money(o.total)}</b></span>
                      <span>Комиссия площадки <b>−{money(o.fee)}</b></span>
                      <span className="adm-ord-net">К выплате <b>{money(o.net)}</b></span>
                    </div>
                  )}

                  {isAdmin && (
                    <footer className="adm-ord-foot">
                      {(["paid", "done", "cancelled"] as const).map((st) => (
                        <button
                          key={st}
                          className={`adm-btn adm-btn-sm${status === st ? "" : " adm-ghost"}`}
                          onClick={() => setStatus(o.order, st)}
                        >
                          {STATUS[st]}
                        </button>
                      ))}
                      <button className="adm-btn adm-btn-sm adm-danger" onClick={() => removeOrder(o.order)}>Удалить</button>
                    </footer>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {tab === "sellers" && isAdmin && (
        <>
          <section className="adm-import">
            <div className="adm-import-main">
              <b className="adm-sec-title">Продавцы площадки</b>
              <p className="adm-hint">
                Выдайте продавцу логин и пароль — он войдёт на этой же странице, будет вести свои
                товары и видеть свои продажи. Комиссия площадки удерживается автоматически.
              </p>
            </div>
            <button className="adm-btn" onClick={() => setSellerEdit({})}>+ Добавить продавца</button>
          </section>

          <div className="adm-list">
            {sellers.length === 0 && <p className="adm-empty">Продавцов пока нет.</p>}
            {sellers.map((s) => (
              <article className="adm-card adm-seller" key={s.id}>
                <div className="adm-card-main">
                  <b>{s.name} {!s.active && <span className="adm-sold">доступ выключен</span>}</b>
                  <span>логин: {s.login} · комиссия {s.commission}% · товаров: {s.products ?? 0}</span>
                  {s.contact && <span>{s.contact}</span>}
                </div>
                <div className="adm-card-right">
                  <div>
                    <button className="adm-btn adm-btn-sm" onClick={() => setSellerEdit(s)}>Изменить</button>
                    <button className="adm-btn adm-btn-sm adm-danger" onClick={() => removeSeller(s)}>Удалить</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "stats" && stats && (
        <div className="adm-stats">
          {isAdmin ? (
            <>
              <div className="adm-cards">
                <div className="adm-stat">
                  <i>Оборот оплаченных</i><b>{money(stats.totals.gross)}</b>
                  <u>{stats.totals.paidOrders} из {stats.totals.orders} заказов</u>
                </div>
                <div className="adm-stat adm-stat-key">
                  <i>Наша комиссия</i><b>{money(stats.totals.fee)}</b><u>удержано с продавцов</u>
                </div>
                <div className="adm-stat">
                  <i>К выплате продавцам</i><b>{money(stats.totals.payout)}</b><u>чистыми</u>
                </div>
                <div className="adm-stat">
                  <i>Ожидает оплаты</i><b>{money(stats.totals.pending)}</b><u>новые заказы</u>
                </div>
              </div>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Продавец</th><th>Товаров</th><th>Продано</th><th>Оборот</th>
                    <th>Комиссия</th><th>К выплате</th><th>В ожидании</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.rows || []).map((r) => (
                    <tr key={r.id || "shop"}>
                      <td><b>{r.name || "—"}</b>{r.id ? <i> · {r.commission}%</i> : null}</td>
                      <td>{r.products ?? 0}</td>
                      <td>{r.sold}</td>
                      <td>{money(r.gross)}</td>
                      <td className="adm-td-fee">{money(r.fee)}</td>
                      <td><b>{money(r.net)}</b></td>
                      <td className="adm-td-dim">{money(r.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <div className="adm-cards">
                <div className="adm-stat">
                  <i>Продано на</i><b>{money(stats.totals.gross)}</b>
                  <u>{stats.totals.orders} заказов с вашими товарами</u>
                </div>
                <div className="adm-stat">
                  <i>Комиссия площадки</i><b>−{money(stats.totals.fee)}</b><u>{stats.commission}% с позиции</u>
                </div>
                <div className="adm-stat adm-stat-key">
                  <i>Ваш чистый заработок</i><b>{money(stats.totals.net)}</b><u>по оплаченным заказам</u>
                </div>
                <div className="adm-stat">
                  <i>Ожидает оплаты</i><b>{money(stats.totals.pending)}</b><u>заказы без оплаты</u>
                </div>
              </div>
              <table className="adm-table">
                <thead>
                  <tr><th>Заказ</th><th>Дата</th><th>Статус</th><th>Позиции</th><th>Сумма</th><th>Комиссия</th><th>Вам</th></tr>
                </thead>
                <tbody>
                  {(stats.history || []).map((h) => (
                    <tr key={h.order}>
                      <td><b>{h.order}</b></td>
                      <td>{new Date(h.at).toLocaleDateString("ru-RU")}</td>
                      <td><span className={`adm-badge adm-st-${h.status || "new"}`}>{STATUS[h.status || "new"]}</span></td>
                      <td className="adm-td-items">
                        {(h.items || []).map((i, k) => <span key={k}>№{i.n} {i.title}</span>)}
                      </td>
                      <td>{money(h.gross)}</td>
                      <td className="adm-td-fee">−{money(h.fee)}</td>
                      <td><b>{money(h.net)}</b></td>
                    </tr>
                  ))}
                  {(stats.history || []).length === 0 && (
                    <tr><td colSpan={7} className="adm-empty">Продаж пока нет.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {edit && (
        <Editor
          item={edit}
          note={note}
          api={api}
          onClose={() => { setEdit(null); setNote(""); }}
          onSave={() => { setEdit(null); setNote(""); loadProducts(); loadStats(); }}
        />
      )}
      {sellerEdit && (
        <SellerForm
          seller={sellerEdit}
          api={api}
          onClose={() => setSellerEdit(null)}
          onSave={() => { setSellerEdit(null); loadSellers(); loadStats(); }}
        />
      )}
    </div>
  );
}
