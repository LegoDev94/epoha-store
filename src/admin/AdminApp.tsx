import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Lang, Lot, Tr } from "../data/catalog";
import { LANGS as SITE_LANG_LIST } from "../i18n";

const SITE_LANGS = SITE_LANG_LIST.map((l) => l.code);
import { Select } from "../ui/Select";
import { AdminPartners, AdminPayouts, PartnerApplications, PartnerCabinet } from "./Marketplace";
import { Categories } from "./Categories";
import Goods, { type AdmLot } from "./Goods";
import Orders, { needsAction, statusLabel, type Order } from "./Orders";
import Settings from "./Settings";
import { LangProvider, LangSwitch, useFmt, useT } from "./lang";
import { Thumb, Toasts, ago, useToast } from "./ui";
import "./admin.css";
import { Logo } from "../Logo";

/* ═══ Панель маркетплейса SOFA.LV ═══
   Роли: администратор площадки (всё) и продавец (свои товары и продажи).
   Комиссия площадки удерживается с каждой проданной позиции. */

/* Категории заводит владелец, поэтому список берём с сервера.
   Пока он не пришёл, показываем прежний набор — редактор не пустует. */
const SEED_CAT_KEYS: Category[] = ["seating", "mirror", "light", "storage", "table", "decor"];

function useCategories(api: ReturnType<typeof useApi>) {
  const [cats, setCats] = useState<{ v: Category; l: string }[]>(
    SEED_CAT_KEYS.map((v) => ({ v, l: v }))
  );
  const load = useCallback(() => {
    api("api/admin/categories")
      .then((d: { key: string; tr?: Record<string, string> }[]) => {
        if (Array.isArray(d) && d.length)
          setCats(d.map((c) => ({ v: c.key, l: c.tr?.lv || c.key })));
      })
      .catch(() => {});
  }, [api]);
  useEffect(load, [load]);
  return { cats, reloadCats: load };
}
/* Языки карточки — те же, что и у витрины: покупатель должен видеть
   описание на своём. Список берём из одного места, чтобы новый язык
   появлялся и в редакторе, и в переводчике. */
const LANGS: { v: Lang; l: string }[] = SITE_LANG_LIST.map((l) => ({ v: l.code, l: l.full }));

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
  /* маркетплейс: продавец, выплата, платёж в Stripe */
  sellerId?: string | null;
  sellerName?: string;
  stripeFee?: number;
  deliveredAt?: string | null;
  releaseAt?: string | null;
  payoutState?: string;
  payoutAt?: string | null;
  refundedAt?: string | null;
  charge?: string;
  paymentIntent?: string;
}
interface Seller {
  id: string;
  stage?: string;
  canSell?: boolean;
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
type Tab = "goods" | "orders" | "sellers" | "stats" | "payouts" | "cabinet" | "settings";

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
  tr: blankTr(),
});

/* Пустая карточка на все языки витрины: перевод подтянется при
   сохранении, но поля должны существовать заранее. */
function blankTr(era: Partial<Record<Lang, string>> = {}): Record<Lang, Tr> {
  return Object.fromEntries(
    SITE_LANGS.map((l) => [l, { title: "", era: era[l] || "", desc: "" }])
  ) as Record<Lang, Tr>;
}

function useApi(token: string, onExpired?: () => void) {
  /* Колбэк держим в ссылке: иначе он пересоздаётся на каждом рендере,
     меняет api → меняет загрузчики → эффект загрузки бьёт по кругу. */
  const expired = useRef(onExpired);
  expired.current = onExpired;

  return useCallback(
    async (url: string, opts: RequestInit = {}) => {
      /* Адреса передают без ведущей косой — считаем их от корня, иначе
         со страницы вида /admin/… запрос ушёл бы не туда. */
      const res = await fetch(url.startsWith("/") ? url : "/" + url, {
        ...opts,
        headers: {
          ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          "x-token": token,
          ...(opts.headers || {}),
        },
      });
      /* Истёкший вход выглядел бы как «данных нет» — гасим сразу */
      if (res.status === 401) {
        expired.current?.();
        throw new Error("SESSION_EXPIRED");
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return res.json();
    },
    [token]
  );
}

/* ── вход: администратор или продавец ── */
function Login({ onIn }: { onIn: (token: string, me: Me) => void }) {
  const { t } = useT();
  const [login, setLogin] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password: pw }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || t("log.bad"));
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
        <h1 className="adm-login-logo"><Logo h={30} /></h1>
        <p className="adm-login-sub">{t("log.sub")}</p>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t("log.login")} autoFocus />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("log.pw")} />
        {err && <p className="adm-err">{err}</p>}
        <button className="adm-btn" disabled={busy}>{busy ? t("log.busy") : t("log.in")}</button>
        <a href="#/" className="adm-back">{t("log.back")}</a>
      </form>
    </div>
  );
}

/* ── редактор товара ── */
function Editor({
  item,
  note,
  isAdmin,
  commission,
  onSaved,
  onClose,
  onSave,
  api,
}: {
  item: Lot;
  note?: string;
  isAdmin: boolean;
  commission: number;
  onSaved?: () => void;
  onClose: () => void;
  onSave: (l: Lot) => void;
  api: ReturnType<typeof useApi>;
}) {
  const toast = useToast();
  const { t } = useT();
  const { cats } = useCategories(api);
  const [p, setP] = useState<Lot>(structuredClone(item));
  const [tab, setTab] = useState<Lang>(
    () => SITE_LANGS.find((l) => item.tr[l]?.title.trim()) || "lv"
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
      toast.err(t("ui.error"), String((e as Error).message));
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
      toast.err(t("ui.error"), String((e as Error).message));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const save = async (next = false) => {
    if (!p.tr.lv.title.trim() && !p.tr.en.title.trim() && !p.tr.ru.title.trim())
      return toast.err(t("a.zapolniteKartochkuHotya"));
    setBusy("save");
    try {
      const saved = await api("api/admin/products", { method: "POST", body: JSON.stringify(p) });
      if (saved?.translateError) toast.err(t("a.kartochkaSohranenaNo"), saved.translateError);
      else toast.ok(`№${saved.n} сохранён${next ? " · вводите следующий" : ""}`);
      if (next) {
        /* Конвейер: категория, продавец и эпоха остаются от предыдущей карточки */
        const base = structuredClone(p);
        setP({
          ...base, id: 0, n: "", price: 0, images: [], source: "", sold: false,
          tr: blankTr(
            Object.fromEntries(SITE_LANGS.map((l) => [l, base.tr[l]?.era || ""]))
          ),
        });
        onSaved?.();
      } else onSave(saved);
    } catch (e) {
      toast.err(t("ui.saveFail"), String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-modal-bg" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <header className="adm-modal-head">
          <h2>{item.id ? `Товар № ${item.n || item.id}` : t("ed.newItem")}</h2>
          <button className="adm-x" onClick={onClose}>✕</button>
        </header>

        <div className="adm-modal-body">
          {note && <p className="adm-note">{note}</p>}
          <div className="adm-grid">
            <label className="adm-f">
              <span>{t("ed.number")}</span>
              <input value={p.n} onChange={(e) => setP({ ...p, n: e.target.value })} placeholder="20" />
            </label>
            <label className="adm-f">
              <span>{t("ed.price")}</span>
              <input
                type="number"
                value={p.price || ""}
                onChange={(e) => setP({ ...p, price: Number(e.target.value) })}
                placeholder="450"
              />
              {/* Партнёр должен видеть свою долю до того, как поставит цену */}
              {!isAdmin && p.price > 0 && (
                <small className="adm-hint">
                  Pircējam €{p.price} → SOFA.LV komisija {commission}% −€{Math.round((p.price * commission) / 100)} →{" "}
                  <b>Jums €{p.price - Math.round((p.price * commission) / 100)}</b>. Stripe komisiju sedz sofa.lv.
                </small>
              )}
            </label>
            <label className="adm-f">
              <span>{t("ed.cat")}</span>
              <Select
                className="sel-sq sel-full"
                value={p.cat}
                onChange={(v) => setP({ ...p, cat: v as Category })}
                options={cats.map((c) => ({ value: c.v, label: c.l }))}
              />
            </label>
            <label className="adm-f adm-check">
              <input type="checkbox" checked={!!p.sold} onChange={(e) => setP({ ...p, sold: e.target.checked })} />
              <span>{isAdmin ? t("ed.sold") : "Pārdots"}</span>
            </label>
            <label className="adm-f adm-check">
              <input
                type="checkbox"
                checked={!!(p as Lot & { hidden?: boolean }).hidden}
                onChange={(e) => setP({ ...p, hidden: e.target.checked } as Lot)}
              />
              <span>{isAdmin ? t("ed.hide") : "Paslēpt no skatloga"}</span>
            </label>
          </div>

          <div className="adm-imgs">
            {p.images.map((im, i) => (
              <div className="adm-img" key={im + i}>
                <Thumb src={im} />
                <button
                  className="adm-img-x"
                  title={t("a.udalitFoto")}
                  onClick={() => setP({ ...p, images: p.images.filter((_, k) => k !== i) })}
                >
                  ✕
                </button>
                {i === 0 ? (
                  <b>{t("a.oblozhka")}</b>
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
            <i>{t("a.jpgPngIli")}</i>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>

          <details className="adm-bylink">
            <summary>{t("a.iliDobavitFoto")}</summary>
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
              >{t("ed.add")}</button>
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
                {busy === "tr" ? t("ed.translating") : `✦ Перевести с ${tab.toUpperCase()} на остальные`}
              </button>
              {LANGS.filter((l) => l.v !== tab && p.tr[l.v]?.title.trim()).map((l) => (
                <button key={l.v} onClick={() => copyFrom(l.v)}>← копировать {l.v.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <label className="adm-f">
            <span>Название ({tab.toUpperCase()})</span>
            <input value={p.tr[tab].title} onChange={(e) => setTr(tab, "title", e.target.value)} />
          </label>
          <label className="adm-f">
            <span>{t("a.epohaProishozhdenie")}</span>
            <input
              value={p.tr[tab].era}
              onChange={(e) => setTr(tab, "era", e.target.value)}
              placeholder={tab === "lv" ? "Zviedrija · 20. gs." : tab === "en" ? "Sweden · 20th century" : t("a.shveciyaXxVek")}
            />
          </label>
          <label className="adm-f">
            <span>{t("ed.desc")}</span>
            <textarea rows={5} value={p.tr[tab].desc} onChange={(e) => setTr(tab, "desc", e.target.value)} />
          </label>

          {p.source && (
            <p className="adm-src">
              Источник: <a href={p.source} target="_blank" rel="noopener noreferrer">{p.source}</a>
            </p>
          )}
        </div>

        <footer className="adm-modal-foot">
          <span className="adm-foot-hint">{t("ed.autoHint")}</span>
          <button className="adm-btn adm-ghost" onClick={onClose}>{t("ed.cancel")}</button>
          {!item.id && (
            <button className="adm-btn adm-ghost" onClick={() => save(true)} disabled={!!busy}>{t("ed.saveNext")}</button>
          )}
          <button className="adm-btn" onClick={() => save()} disabled={!!busy}>
            {busy === "save" ? t("ed.saving") : t("ed.save")}
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
  const toast = useToast();
  const { t } = useT();

  const save = async () => {
    setBusy(true);
    try {
      await api("api/admin/sellers", { method: "POST", body: JSON.stringify(f) });
      toast.ok(t("sl.saved"));
      onSave();
    } catch (e) {
      toast.err(t("ui.error"), String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-modal-bg" onClick={onClose}>
      <div className="adm-modal adm-modal-sm" onClick={(e) => e.stopPropagation()}>
        <header className="adm-modal-head">
          <h2>{seller.id ? `Продавец: ${seller.name}` : t("sl.new")}</h2>
          <button className="adm-x" onClick={onClose}>✕</button>
        </header>
        <div className="adm-modal-body">
          <div className="adm-grid">
            <label className="adm-f">
              <span>{t("sl.name")}</span>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Anna Ozola" />
            </label>
            <label className="adm-f">
              <span>{t("sl.login")}</span>
              <input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} placeholder="anna" />
            </label>
            <label className="adm-f">
              <span>{t("sl.commission")}</span>
              <input
                type="number"
                value={f.commission}
                onChange={(e) => setF({ ...f, commission: Number(e.target.value) })}
              />
            </label>
            <label className="adm-f adm-check">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
              <span>{t("sl.active")}</span>
            </label>
          </div>
          <label className="adm-f">
            <span>{t("sl.contact")}</span>
            <input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="+371 20 000 000 · anna@mail.lv" />
          </label>
          <label className="adm-f">
            <span>{seller.id ? t("a.novyjParolPusto") : t("log.pw")}</span>
            <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={t("a.minimum6Simvolov")} />
          </label>
          <p className="adm-hint">
            Продавец войдёт по этому логину и паролю на этой же странице и увидит только свои
            товары и продажи. Комиссия удерживается с каждой проданной позиции.
          </p>
        </div>
        <footer className="adm-modal-foot">
          <button className="adm-btn adm-ghost" onClick={onClose}>{t("ed.cancel")}</button>
          <button className="adm-btn" onClick={save} disabled={busy}>
            {busy ? t("ed.saving") : t("ed.save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── панель ── */
export default function AdminApp() {
  return (
    <LangProvider>
      <Toasts>
        <Panel />
      </Toasts>
    </LangProvider>
  );
}

function Panel() {
  const { t } = useT();
  const { eur } = useFmt();
  const [token, setToken] = useState(() => localStorage.getItem("epoha-token") || "");
  const [me, setMe] = useState<Me | null>(null);
  const toast = useToast();
  /* Просроченный вход не должен выглядеть как пустая база */
  const api = useApi(token, () => {
    localStorage.removeItem("epoha-token");
    setToken("");
    setMe(null);
  });

  const { cats: CATS, reloadCats } = useCategories(api);

  const [items, setItems] = useState<AdmLot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const [stage, setStage] = useState<string>("");

  const [edit, setEdit] = useState<Lot | null>(null);
  const [note, setNote] = useState("");
  const [sellerEdit, setSellerEdit] = useState<Partial<Seller> | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");

  /* Состояние загрузки на каждый список: пусто ≠ не загрузилось */
  const [load, setLoad] = useState({ items: true, orders: true });
  const [failed, setFailed] = useState({ items: "", orders: "" });
  const [freshAt, setFreshAt] = useState<number | null>(null);
  const [sandbox, setSandbox] = useState(false);

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

  /* Панель показывает весь свой каталог, включая скрытые с витрины товары */
  const loadProducts = useCallback(() => {
    api("api/admin/products")
      .then((d) => { setItems(d); setFailed((f) => ({ ...f, items: "" })); })
      .catch((e) => setFailed((f) => ({ ...f, items: String(e.message) })))
      .finally(() => setLoad((l) => ({ ...l, items: false })));
  }, [api]);
  const loadOrders = useCallback(() => {
    api("api/admin/orders")
      .then((d) => { setOrders(d); setFailed((f) => ({ ...f, orders: "" })); setFreshAt(Date.now()); })
      .catch((e) => setFailed((f) => ({ ...f, orders: String(e.message) })))
      .finally(() => setLoad((l) => ({ ...l, orders: false })));
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
    if (me.role === "admin") {
      loadSellers();
      api("api/admin/health").then((h) => setSandbox(h.mode === "test")).catch(() => {});
    }
    else api("api/partner/me").then((p) => setStage(p.stage)).catch(() => {});
  }, [me, api, loadProducts, loadOrders, loadStats, loadSellers]);

  /* Уведомления могут быть не настроены — тогда панель единственный канал:
     обновляем её сами, но только пока вкладка на экране. */
  useEffect(() => {
    if (!me) return;
    const tick = () => {
      if (document.hidden) return;
      loadOrders();
      loadStats();
    };
    const timer = setInterval(tick, 30000);
    const onShow = () => !document.hidden && tick();
    addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      removeEventListener("visibilitychange", onShow);
    };
  }, [me, loadOrders, loadStats]);

  const myItems = useMemo(
    () => (isAdmin ? items : items.filter((i) => i.sellerId === me?.id)),
    [items, isAdmin, me]
  );

  /* Сколько дел ждёт: этим числом живут бейджи и заголовок вкладки */
  const todo = useMemo(() => orders.filter(needsAction).length, [orders]);
  useEffect(() => {
    document.title = todo ? `(${todo}) Панель · SOFA.LV` : "Панель · SOFA.LV";
  }, [todo]);


  if (!token || !me) return <Login onIn={(t, m) => { setToken(t); setMe(m); }} />;

  const doImport = async () => {
    if (!url.trim()) return;
    setBusy(t("a.tyanemDannyeSo"));
    try {
      const draft = await api("api/admin/import", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      const dup = items.find((i) => i.id === draft.id);
      setNote(dup ? `Этот предмет уже есть в каталоге под № ${dup.n} — сохранение обновит существующую карточку.` : "");
      const base = empty();
      setEdit({ ...base, ...draft, price: draft.priceHint ? Math.round(draft.priceHint * 3) : 0, tr: draft.tr || base.tr });
      setUrl("");
    } catch (e) {
      toast.err(t("imp.fail"), String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const removeSeller = async (s: Seller) => {
    if (!confirm(`Удалить продавца «${s.name}»? Его товары останутся на витрине.`)) return;
    await api(`api/admin/sellers/${s.id}`, { method: "DELETE" });
    loadSellers();
    loadStats();
  };

  return (
    <div className="adm">
      <header className="adm-top">
        <b className="adm-brand"><Logo h={26} /></b>
        {sandbox && <span className="adm-sandbox" title="Платежи идут в песочнице Stripe">SANDBOX</span>}
        <span className={`adm-role adm-role-${me.role}`}>
          {isAdmin ? t("role.admin") : `продавец · ${me.name}`}
        </span>
        <nav>
          <button className={tab === "goods" ? "on" : ""} onClick={() => setTab("goods")}>
            {isAdmin ? t("nav.goods") : "Manas preces"} <i>{myItems.length}</i>
          </button>
          <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>
            {isAdmin ? t("nav.orders") : "Pārdevumi"} {todo > 0 && <i className="hot">{todo}</i>}
          </button>
          {isAdmin && (
            <button className={tab === "sellers" ? "on" : ""} onClick={() => setTab("sellers")}>
              {t("nav.sellers")} {sellers.some((s) => s.stage === "review") && <i className="hot">!</i>}
            </button>
          )}
          {isAdmin && (
            <button className={tab === "payouts" ? "on" : ""} onClick={() => setTab("payouts")}>{t("nav.payouts")}</button>
          )}
          {!isAdmin && (
            <button className={tab === "cabinet" ? "on" : ""} onClick={() => setTab("cabinet")}>
              Konts
            </button>
          )}
          <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>
            {isAdmin ? t("nav.stats") : "Ieņēmumi"}
          </button>
          {isAdmin && (
            <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>{t("nav.settings")}</button>
          )}
        </nav>
        {freshAt && <span className="adm-fresh" title={t("a.spisokObnovlyaetsyaSam")}>{ago(freshAt, t)}</span>}
        <LangSwitch />
        <a href="#/" className="adm-link">{t("nav.shop")}</a>
        <button
          className="adm-link"
          onClick={() => {
            localStorage.removeItem("epoha-token");
            setToken("");
            setMe(null);
          }}
        >{t("nav.exit")}</button>
      </header>

      {tab === "goods" && (
        <>
          {isAdmin && <Categories api={api} onChanged={() => { reloadCats(); loadProducts(); }} />}
          {isAdmin ? (
            <details className="adm-import adm-import-fold" open={window.innerWidth > 720}>
              <summary>{t("imp.add")}</summary>
              <div className="adm-import-main">
                <label className="adm-f">
                  <span>{t("imp.label")}</span>
                  <div className="adm-row">
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && doImport()}
                      placeholder="https://auctionet.com/en/5212622-sofa-rococo-style"
                    />
                    <button className="adm-btn" onClick={doImport} disabled={!!busy}>
                      {busy ? "…" : t("imp.go")}
                    </button>
                  </div>
                </label>
                <p className="adm-hint">
                  Фото и описание подтянутся автоматически — вам останется поставить цену. {busy}
                </p>
              </div>
              <button className="adm-btn adm-ghost" onClick={() => { setNote(""); setEdit(empty()); }}>{t("imp.manual")}</button>
            </details>
          ) : (
            <section className="adm-import">
              <div className="adm-import-main">
                <b className="adm-sec-title">Jūsu preces</b>
                <p className="adm-hint">
                  Aizpildiet kartīti un pievienojiet fotoattēlus — prece parādīsies skatlogā uzreiz
                  trīs valodās. Tulkojumus veiksim automātiski.
                </p>
              </div>
              <button className="adm-btn" onClick={() => { setNote(""); setEdit(empty()); }}>
                + Pievienot preci
              </button>
            </section>
          )}

          {!isAdmin && stage && stage !== "active" && (
            <section className="adm-import mp-gate">
              <div className="adm-import-main">
                <b className="adm-sec-title">Preces vēl nav redzamas skatlogā</b>
                <p className="adm-hint">
                  Lai sāktu pārdot, pabeidziet pievienošanos: uzņēmuma dati → sadarbības noteikumi →
                  Stripe konts → SOFA.LV pārbaude.
                </p>
              </div>
              <button className="adm-btn" onClick={() => setTab("cabinet")}>Turpināt →</button>
            </section>
          )}

          <Goods
            items={myItems}
            sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
            cats={CATS}
            api={api}
            isAdmin={!!isAdmin}
            loading={load.items}
            error={failed.items}
            onReload={() => { loadProducts(); loadStats(); }}
            onEdit={(p) => { setNote(""); setEdit(p as Lot); }}
            onDuplicate={(p) => {
              setNote(t("a.kopiyaKartochkiProverte"));
              setEdit({ ...(p as Lot), id: 0, n: "", sold: false, createdAt: undefined });
            }}
          />
        </>
      )}


      {tab === "orders" && (
        <Orders
          orders={orders}
          sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
          api={api}
          isAdmin={!!isAdmin}
          loading={load.orders}
          error={failed.orders}
          onReload={() => { loadOrders(); loadStats(); loadProducts(); }}
        />
      )}


      {tab === "sellers" && isAdmin && (
        <>
          <section className="adm-import">
            <div className="adm-import-main">
              <b className="adm-sec-title">{t("sl.title")}</b>
              <p className="adm-hint">
                Выдайте продавцу логин и пароль — он войдёт на этой же странице, будет вести свои
                товары и видеть свои продажи. Комиссия площадки удерживается автоматически.
              </p>
            </div>
            <button className="adm-btn" onClick={() => setSellerEdit({})}>{t("sl.add")}</button>
          </section>

          <PartnerApplications api={api} />
          <AdminPartners api={api} onChanged={() => { loadSellers(); loadStats(); }} />

          <div className="adm-list">
            {sellers.map((s) => (
              <article className="adm-card adm-seller" key={s.id}>
                <div className="adm-card-main">
                  <b>{s.name} {!s.active && <span className="adm-sold">{t("sl.off")}</span>}</b>
                  <span>логин: {s.login} · комиссия {s.commission}% · товаров: {s.products ?? 0}</span>
                </div>
                <div className="adm-card-right">
                  <div>
                    <button className="adm-btn adm-btn-sm" onClick={() => setSellerEdit(s)}>{t("sl.access")}</button>
                    <button className="adm-btn adm-btn-sm adm-danger" onClick={() => removeSeller(s)}>{t("sl.delete")}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "payouts" && isAdmin && <AdminPayouts api={api} />}
      {tab === "settings" && isAdmin && <Settings api={api} />}
      {tab === "cabinet" && !isAdmin && (
        <PartnerCabinet api={api} onChanged={() => { loadProducts(); loadStats(); }} />
      )}

      {tab === "stats" && stats && (
        <div className="adm-stats">
          {isAdmin ? (
            <>
              <div className="adm-cards">
                <div className="adm-stat">
                  <i>{t("stt.gross")}</i><b>{eur(stats.totals.gross)}</b>
                  <u>{stats.totals.paidOrders} из {stats.totals.orders} заказов</u>
                </div>
                <div className="adm-stat adm-stat-key">
                  <i>{t("stt.fee")}</i><b>{eur(stats.totals.fee)}</b><u>{t("stt.feeHint")}</u>
                </div>
                <div className="adm-stat">
                  <i>{t("stt.payout")}</i><b>{eur(stats.totals.payout)}</b><u>{t("stt.netHint")}</u>
                </div>
                <div className="adm-stat">
                  <i>{t("stt.pending")}</i><b>{eur(stats.totals.pending)}</b><u>{t("stt.pendingHint")}</u>
                </div>
              </div>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{t("stt.seller")}</th><th>{t("stt.products")}</th><th>{t("ed.sold")}</th><th>{t("ord.gross")}</th>
                    <th>{t("stt.commission")}</th><th>{t("a.kVyplate")}</th><th>{t("stt.waiting")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.rows || []).map((r) => (
                    <tr key={r.id || "shop"}>
                      <td><b>{r.name || "—"}</b>{r.id ? <i> · {r.commission}%</i> : null}</td>
                      <td>{r.products ?? 0}</td>
                      <td>{r.sold}</td>
                      <td>{eur(r.gross)}</td>
                      <td className="adm-td-fee">{eur(r.fee)}</td>
                      <td><b>{eur(r.net)}</b></td>
                      <td className="adm-td-dim">{eur(r.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <div className="adm-cards">
                <div className="adm-stat">
                  <i>{t("a.prodanoNa")}</i><b>{eur(stats.totals.gross)}</b>
                  <u>{stats.totals.orders} заказов с вашими товарами</u>
                </div>
                <div className="adm-stat">
                  <i>{t("a.komissiyaPloschadki")}</i><b>−{eur(stats.totals.fee)}</b><u>{stats.commission}% с позиции</u>
                </div>
                <div className="adm-stat adm-stat-key">
                  <i>{t("stt.yourNet")}</i><b>{eur(stats.totals.net)}</b><u>{t("a.poOplachennymZakazam")}</u>
                </div>
                <div className="adm-stat">
                  <i>{t("stt.pending")}</i><b>{eur(stats.totals.pending)}</b><u>{t("a.zakazyBezOplaty")}</u>
                </div>
              </div>
              <table className="adm-table">
                <thead>
                  <tr><th>{t("stt.order")}</th><th>{t("stt.date")}</th><th>{t("a.status")}</th><th>{t("ord.items")}</th><th>{t("a.summa")}</th><th>{t("stt.commission")}</th><th>{t("stt.toYou")}</th></tr>
                </thead>
                <tbody>
                  {(stats.history || []).map((h) => (
                    <tr key={h.order}>
                      <td><b>{h.order}</b></td>
                      <td>{new Date(h.at).toLocaleDateString("ru-RU")}</td>
                      <td><span className={`adm-badge adm-st-${h.status || "new"}`}>{statusLabel(t, h.status || "new")}</span></td>
                      <td className="adm-td-items">
                        {(h.items || []).map((i, k) => <span key={k}>№{i.n} {i.title}</span>)}
                      </td>
                      <td>{eur(h.gross)}</td>
                      <td className="adm-td-fee">−{eur(h.fee)}</td>
                      <td><b>{eur(h.net)}</b></td>
                    </tr>
                  ))}
                  {(stats.history || []).length === 0 && (
                    <tr><td colSpan={7} className="adm-empty">{t("a.prodazhPokaNet")}</td></tr>
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
          isAdmin={!!isAdmin}
          commission={me.commission ?? 20}
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
