import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_KEYS,
  SEED_LOTS,
  type Category,
  type Lang,
  type Lot,
} from "./data/catalog";
import { LANGS, detectLang, localeOf, makeT, type T } from "./i18n";
import { Logo } from "./Logo";

const AdminApp = lazy(() => import("./admin/AdminApp"));

/* ═══ EPOHA — veikals / shop / магазин ═══
   Хеш-маршруты работают и на статике, и на сервере:
   #/  #/lot/:id  #/favs  #/cart  #/checkout  #/success/:n  #/admin */

type Route =
  | { view: "home" }
  | { view: "lot"; id: number }
  | { view: "favs" }
  | { view: "cart" }
  | { view: "checkout" }
  | { view: "success"; order: string }
  | { view: "admin" };

function parseRoute(): Route {
  const h = location.hash;
  const lot = h.match(/^#\/lot\/(\d+)/);
  if (lot) return { view: "lot", id: Number(lot[1]) };
  if (h.startsWith("#/favs")) return { view: "favs" };
  if (h.startsWith("#/cart")) return { view: "cart" };
  if (h.startsWith("#/checkout")) return { view: "checkout" };
  if (h.startsWith("#/admin")) return { view: "admin" };
  const s = h.match(/^#\/success\/([A-Za-z0-9-]+)/);
  if (s) return { view: "success", order: s[1] };
  return { view: "home" };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseRoute);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
const go = (hash: string) => {
  location.hash = hash;
};

/* ── каталог: API, при недоступности — встроенный сид ── */
function useProducts(): Lot[] {
  const [lots, setLots] = useState<Lot[]>(SEED_LOTS);
  useEffect(() => {
    fetch("api/products")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no api"))))
      .then((d: Lot[]) => {
        if (Array.isArray(d) && d.length) setLots(d);
      })
      .catch(() => {
        /* статическая витрина — остаёмся на сид-данных */
      });
  }, []);
  return lots;
}

function useStoredIds(key: string) {
  const [ids, setIds] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(ids));
  }, [key, ids]);
  return {
    ids,
    has: (id: number) => ids.includes(id),
    add: (id: number) => setIds((s) => (s.includes(id) ? s : [...s, id])),
    remove: (id: number) => setIds((s) => s.filter((x) => x !== id)),
    toggle: (id: number) =>
      setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    clear: () => setIds([]),
  };
}
type Store = ReturnType<typeof useStoredIds>;

function useReveal(dep: unknown) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.1 }
    );
    const attach = () =>
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    attach();
    /* товары приезжают из API после первого кадра — подписываемся ещё раз,
       иначе новые карточки остаются прозрачными */
    const again = setTimeout(attach, 300);
    return () => {
      clearTimeout(again);
      io.disconnect();
    };
  }, [dep]);
}

/* ── иконки категорий ── */
function CatIcon({ c }: { c: Category | "all" }) {
  const s = {
    stroke: "currentColor",
    strokeWidth: 1.6,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (c) {
    case "seating":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M5 11 V8 a3 3 0 0 1 3-3 h8 a3 3 0 0 1 3 3 v3" />
          <path d="M4 11 a2 2 0 0 1 2 2 v2 h12 v-2 a2 2 0 0 1 4 0 v3 a2 2 0 0 1 -2 2 H4 a2 2 0 0 1 -2 -2 v-3 a2 2 0 0 1 2 -2 Z" />
          <path d="M6 20 v1.5 M18 20 v1.5" />
        </svg>
      );
    case "mirror":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <ellipse cx="12" cy="11" rx="6.5" ry="8.5" />
          <path d="M9 8 c1-2 3-3 4.5-2.5" />
          <path d="M8 21.5 h8 M12 19.5 v2" />
        </svg>
      );
    case "light":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M12 2 v3 M7 7 a5 5 0 0 1 10 0 c0 2-1.2 3-2.5 4 H9.5 C8.2 10 7 9 7 7 Z" />
          <path d="M9.5 11 12 16 14.5 11 M12 16 v3 M10 21.5 h4" />
        </svg>
      );
    case "storage":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <path d="M4 9.3 h16 M4 14.6 h16 M10.5 6.6 h3 M10.5 12 h3 M10.5 17.3 h3" />
        </svg>
      );
    case "table":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M3 8 h18 M5 8 c0 4-.5 9-1.5 12 M19 8 c0 4 .5 9 1.5 12 M8 8 c0 3-.3 7-1 10 M16 8 c0 3 .3 7 1 10" />
        </svg>
      );
    case "decor":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M4 10 h16 a8 8 0 0 1 -8 8 a8 8 0 0 1 -8 -8 Z" />
          <path d="M8 10 c0-3 1.5-5 4-6 c2.5 1 4 3 4 6" />
          <path d="M6.5 21 h11" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" />
          <rect x="13" y="3.5" width="7.5" height="7.5" rx="1" />
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="1" />
          <rect x="13" y="13" width="7.5" height="7.5" rx="1" />
        </svg>
      );
  }
}

const Heart = ({ on }: { on?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill={on ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinejoin="round"
  >
    <path d="M12 20.5 C7 16.5 3.5 13.3 3.5 9.6 a4.6 4.6 0 0 1 8.5 -2.4 A4.6 4.6 0 0 1 20.5 9.6 c0 3.7-3.5 6.9-8.5 10.9 Z" />
  </svg>
);

/* ── редакционный заголовок секции ── */
function SecHead({
  kicker,
  title,
  accent,
  count,
  right,
}: {
  kicker: string;
  title: string;
  accent?: string;
  count?: number | string;
  right?: React.ReactNode;
}) {
  return (
    <div className="sh reveal">
      <span className="sh-kicker">
        <i className="sh-diamond" aria-hidden="true" />
        {kicker}
        {count !== undefined && <b>{count}</b>}
      </span>
      <div className="sh-row">
        <h2 className="sh-title">
          {title} {accent && <em>{accent}</em>}
        </h2>
        <span className="sh-rule" aria-hidden="true" />
        {right}
      </div>
    </div>
  );
}

/* ── карточка товара в сетке ── */
function LotCard({
  l,
  favs,
  cart,
  lang,
  t,
  fmt,
}: {
  l: Lot;
  favs: Store;
  cart: Store;
  lang: Lang;
  t: T;
  fmt: (n: number) => string;
}) {
  const tr = l.tr[lang] ?? l.tr.lv;
  return (
    <article className="lot reveal" onClick={() => go(`/lot/${l.id}`)}>
      {l.sold && <span className="lot-sold">{t("lot.sold")}</span>}
      <button
        className={`lot-fav${favs.has(l.id) ? " on" : ""}`}
        aria-label={t("nav.favs")}
        onClick={(e) => {
          e.stopPropagation();
          favs.toggle(l.id);
        }}
      >
        <Heart on={favs.has(l.id)} />
      </button>
      <div className="lot-imgs">
        <img src={l.images[0]} alt={tr.title} loading="lazy" width={760} height={570} />
        {l.images[1] && (
          <img
            className="alt"
            src={l.images[1]}
            alt=""
            loading="lazy"
            width={760}
            height={570}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="lot-meta">
        <span className="lot-n">№ {l.n}</span>
        <span className="lot-era">{tr.era}</span>
      </div>
      <h3 className="lot-title">{tr.title}</h3>
      <div className="lot-buy">
        <p className="lot-price">€{fmt(l.price)}</p>
        {!l.sold && (
          <button
            className={`lot-add${cart.has(l.id) ? " in" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              cart.has(l.id) ? go("/cart") : cart.add(l.id);
            }}
          >
            {cart.has(l.id) ? t("lot.inCart") : t("lot.add")}
          </button>
        )}
      </div>
    </article>
  );
}

/* ── шапка ── */
function Header({
  lots,
  favs,
  cart,
  query,
  setQuery,
  cat,
  setCat,
  lang,
  setLang,
  t,
  fmt,
}: {
  lots: Lot[];
  favs: Store;
  cart: Store;
  query: string;
  setQuery: (q: string) => void;
  cat: Category | "all";
  setCat: (c: Category | "all") => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  fmt: (n: number) => string;
}) {
  const [focus, setFocus] = useState(false);
  const [menu, setMenu] = useState(false);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return lots
      .filter((l) => {
        const tr = l.tr[lang] ?? l.tr.lv;
        return `${tr.title} ${tr.era} ${tr.desc} ${t("cat." + l.cat)}`.toLowerCase().includes(q);
      })
      .slice(0, 5);
  }, [query, lots, lang, t]);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menu]);

  const goCatalog = () => {
    go("/");
    setTimeout(() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }), 60);
  };
  const pick = (c: Category | "all") => {
    setMenu(false);
    setCat(c);
    goCatalog();
  };

  return (
    <>
      <header className="hd">
        <div className="hd-top">
          <button className="hd-burger" aria-label={t("nav.menu")} onClick={() => setMenu(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
              <path d="M4 7 h16 M4 12 h16 M4 17 h10" />
            </svg>
          </button>
          <a
            href="#/"
            className="hd-logo"
            onClick={(e) => {
              e.preventDefault();
              go("/");
              scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Logo h={30} />
          </a>
          <div className="hd-search">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16 21 21" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 180)}
              onKeyDown={(e) => e.key === "Enter" && goCatalog()}
              placeholder={t("nav.search")}
              aria-label={t("nav.search")}
            />
            {focus && found.length > 0 && (
              <div className="hd-drop">
                {found.map((l) => {
                  const tr = l.tr[lang] ?? l.tr.lv;
                  return (
                    <button key={l.id} className="hd-drop-item" onMouseDown={() => go(`/lot/${l.id}`)}>
                      <img src={l.images[0]} alt="" />
                      <span>
                        <b>{tr.title}</b>
                        <i>
                          {tr.era} · €{fmt(l.price)}
                        </i>
                      </span>
                    </button>
                  );
                })}
                <button className="hd-drop-all" onMouseDown={goCatalog}>
                  {t("nav.allResults")}
                </button>
              </div>
            )}
          </div>
          <div className="hd-actions">
            <div className="lang" role="group" aria-label="Language">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  className={lang === l.code ? "on" : ""}
                  onClick={() => setLang(l.code)}
                  title={l.full}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button className="hd-act" onClick={() => go("/favs")} aria-label={t("nav.favs")}>
              <Heart on={favs.ids.length > 0} />
              {favs.ids.length > 0 && <b>{favs.ids.length}</b>}
            </button>
            <button className="hd-act hd-cart" onClick={() => go("/cart")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                <path d="M4 7 h16 l-1.6 12.2 a2 2 0 0 1 -2 1.8 H7.6 a2 2 0 0 1 -2 -1.8 Z" />
                <path d="M8.5 10 V6.5 a3.5 3.5 0 0 1 7 0 V10" strokeLinecap="round" />
              </svg>
              <span className="hd-cart-label">{t("nav.cart")}</span>
              {cart.ids.length > 0 && <b>{cart.ids.length}</b>}
            </button>
          </div>
        </div>
        <nav className="hd-cats" aria-label="Categories">
          {CATEGORY_KEYS.map((c) => (
            <button
              key={c}
              className={`hd-cat${cat === c ? " on" : ""}`}
              onClick={() => {
                setCat(c);
                goCatalog();
              }}
            >
              <CatIcon c={c} />
              {t("cat." + c)}
            </button>
          ))}
        </nav>
      </header>

      {menu && (
        <>
          <div className="mn-bg" onClick={() => setMenu(false)} />
          <aside className="mn" role="dialog" aria-label={t("nav.menu")}>
            <div className="mn-head">
              <Logo h={26} />
              <button className="mn-x" aria-label={t("nav.close")} onClick={() => setMenu(false)}>
                ✕
              </button>
            </div>
            <nav className="mn-list">
              {CATEGORY_KEYS.map((c, i) => (
                <button
                  key={c}
                  className={`mn-item${cat === c ? " on" : ""}`}
                  style={{ animationDelay: `${0.05 + i * 0.05}s` }}
                  onClick={() => pick(c)}
                >
                  <CatIcon c={c} />
                  {t("cat." + c)}
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </nav>
            <div className="mn-foot">
              <div className="lang mn-lang">
                {LANGS.map((l) => (
                  <button key={l.code} className={lang === l.code ? "on" : ""} onClick={() => setLang(l.code)}>
                    {l.label}
                  </button>
                ))}
              </div>
              <button className="mn-link" onClick={() => { setMenu(false); go("/favs"); }}>
                ♥ {t("nav.favs")}{favs.ids.length > 0 && ` · ${favs.ids.length}`}
              </button>
              <button className="mn-link" onClick={() => { setMenu(false); go("/cart"); }}>
                {t("nav.cart")}{cart.ids.length > 0 && ` · ${cart.ids.length}`}
              </button>
              <a className="mn-link" href="https://wa.me/37125674959" target="_blank" rel="noopener noreferrer">
                Telegram
              </a>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

/* ── Плавающая кнопка WhatsApp ── */
function WhatsApp({ t }: { t: T }) {
  return (
    <a
      className="wa"
      href={`https://wa.me/37125674959?text=${encodeURIComponent(t("wa.hello"))}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("wa.label")}
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
        <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.4.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4z" />
        <path d="M12 2.1c-5.5 0-10 4.4-10 9.9 0 1.7.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.4 10-9.9s-4.5-9.8-10-9.8zm0 18c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3c-.9-1.4-1.3-3-1.3-4.6 0-4.5 3.7-8.2 8.4-8.2s8.4 3.7 8.4 8.2-3.7 8.5-8.4 8.5z" />
      </svg>
      <span>{t("wa.label")}</span>
    </a>
  );
}

function Footer({ t }: { t: T }) {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-grid">
          <div>
            <div className="ftr-logo">
              <Logo h={36} />
            </div>
            <p>{t("ftr.about")}</p>
          </div>
          <div className="ftr-col">
            <span>{t("ftr.shop")}</span>
            <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>{t("crumb.home")}</a>
            <a href="#/favs" onClick={(e) => { e.preventDefault(); go("/favs"); }}>{t("nav.favs")}</a>
            <a href="#/cart" onClick={(e) => { e.preventDefault(); go("/cart"); }}>{t("nav.cart")}</a>
          </div>
          <div className="ftr-col">
            <span>{t("ftr.contact")}</span>
            <a href="mailto:info@vintagemebeles.lv">info@vintagemebeles.lv</a>
            <a href="tel:+37125674959">+371 25 674 959</a>
            <a href="https://wa.me/37125674959" target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
        </div>
        <div className="ftr-bottom">
          <span>© {new Date().getFullYear()} VINTAGE MĒBELES · {t("ftr.rights")}</span>
          <span>
            {t("ftr.by")} <a href="https://mtbyte.io" target="_blank" rel="noopener noreferrer">METABYTE</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ── витрина ── */
function Home({
  lots,
  favs,
  cart,
  cat,
  query,
  sort,
  setSort,
  viewed,
  lang,
  t,
  fmt,
}: {
  lots: Lot[];
  favs: Store;
  cart: Store;
  cat: Category | "all";
  query: string;
  sort: string;
  setSort: (s: string) => void;
  viewed: number[];
  lang: Lang;
  t: T;
  fmt: (n: number) => string;
}) {
  useReveal(`${cat}${sort}${lots.length}`);

  const shown = useMemo(() => {
    let list = lots.slice();
    if (cat !== "all") list = list.filter((l) => l.cat === cat);
    const q = query.trim().toLowerCase();
    if (q.length >= 2)
      list = list.filter((l) => {
        const tr = l.tr[lang] ?? l.tr.lv;
        return `${tr.title} ${tr.era} ${tr.desc}`.toLowerCase().includes(q);
      });
    if (sort === "cheap") list.sort((a, b) => a.price - b.price);
    if (sort === "rich") list.sort((a, b) => b.price - a.price);
    return list;
  }, [lots, cat, query, sort, lang]);

  const recent = viewed
    .map((id) => lots.find((l) => l.id === id))
    .filter(Boolean)
    .slice(0, 4) as Lot[];

  return (
    <>
      {/* Строка выгод вместо баннера: доставка — главный аргумент */}
      <section className="usp">
        <div className="wrap usp-row">
          <span className="usp-item">
            <b>{lots.length}</b> {t("usp.items")}
          </span>
          <span className="usp-item usp-accent">
            <i aria-hidden="true">◆</i> {t("usp.pickup")}
          </span>
          <span className="usp-item">{t("usp.delivery")}</span>
        </div>
      </section>

      <section className="sec" id="catalog" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <SecHead
            kicker={t("cat.kicker")}
            title={t("cat." + cat)}
            count={shown.length}
            right={
              <select className="sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                <option value="new">{t("sort.new")}</option>
                <option value="cheap">{t("sort.cheap")}</option>
                <option value="rich">{t("sort.rich")}</option>
              </select>
            }
          />

          {shown.length === 0 ? (
            <div className="empty">
              <p>{t("cat.empty")}</p>
            </div>
          ) : (
            <div className="lots">
              {shown.map((l) => (
                <LotCard key={l.id} l={l} favs={favs} cart={cart} lang={lang} t={t} fmt={fmt} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="sec" id="how" style={{ paddingTop: 24 }}>
        <div className="wrap">
          <SecHead kicker={t("why.kicker")} title={t("why.title")} accent={t("why.titleAccent")} />
          <div className="steps">
            {["I", "II", "III"].map((rn, i) => (
              <div className="step reveal" key={rn} style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="step-no">{rn}.</span>
                <strong>{t(`why.${i + 1}`)}</strong>
                <p>{t(`why.${i + 1}t`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="sec" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <SecHead kicker={t("recent.kicker")} title={t("recent.title")} accent={t("recent.titleAccent")} />
            <div className="lots">
              {recent.map((l) => (
                <LotCard key={l.id} l={l} favs={favs} cart={cart} lang={lang} t={t} fmt={fmt} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ── полноэкранный просмотр фото: свайп между кадрами, тап — зум,
      в увеличенном виде кадр таскается пальцем ── */
function Lightbox({
  images,
  start,
  title,
  t,
  onClose,
}: {
  images: string[];
  start: number;
  title: string;
  t: T;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const at = (n: number) => {
    setZoom(false);
    setI((n + images.length) % images.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") at(i + 1);
      if (e.key === "ArrowLeft") at(i - 1);
    };
    addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [i, images.length]);

  /* Тап по увеличенному кадру центрирует зум в точке касания */
  const toggleZoom = (e: React.MouseEvent<HTMLImageElement>) => {
    const box = scrollRef.current;
    const next = !zoom;
    setZoom(next);
    if (next && box) {
      const rect = e.currentTarget.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      requestAnimationFrame(() => {
        box.scrollLeft = rx * (box.scrollWidth - box.clientWidth);
        box.scrollTop = ry * (box.scrollHeight - box.clientHeight);
      });
    }
  };

  return (
    <div className="lb" role="dialog" aria-label={title}>
      <div className="lb-bar">
        <span className="lb-count">
          {i + 1} / {images.length}
        </span>
        <button className="lb-x" onClick={onClose} aria-label={t("nav.close")}>
          ✕
        </button>
      </div>

      <div
        className={`lb-scroll${zoom ? " zoom" : ""}`}
        ref={scrollRef}
        onClick={(e) => {
          if (e.target === e.currentTarget && !zoom) onClose();
        }}
        onTouchStart={(e) => {
          if (zoom) return;
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          if (zoom || !touch.current) return;
          const dx = e.changedTouches[0].clientX - touch.current.x;
          const dy = e.changedTouches[0].clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) at(i + (dx < 0 ? 1 : -1));
          else if (dy > 90) onClose();
        }}
      >
        <img
          className="lb-img"
          src={images[i]}
          alt={`${title} ${i + 1}`}
          onClick={toggleZoom}
          draggable={false}
        />
      </div>

      {images.length > 1 && (
        <>
          <button className="lb-arrow lb-prev" onClick={() => at(i - 1)} aria-label="‹">
            ‹
          </button>
          <button className="lb-arrow lb-next" onClick={() => at(i + 1)} aria-label="›">
            ›
          </button>
          <div className="lb-thumbs">
            {images.map((im, k) => (
              <button key={im + k} className={k === i ? "on" : ""} onClick={() => at(k)}>
                <img src={im} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── страница товара ── */
function LotPage({
  lot,
  lots,
  favs,
  cart,
  lang,
  t,
  fmt,
}: {
  lot: Lot;
  lots: Lot[];
  favs: Store;
  cart: Store;
  lang: Lang;
  t: T;
  fmt: (n: number) => string;
}) {
  const tr = lot.tr[lang] ?? lot.tr.lv;
  const related = lots.filter((l) => l.cat === lot.cat && l.id !== lot.id).slice(0, 3);
  const inCart = cart.has(lot.id);
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  const goSlide = (i: number) => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setSlide(i);
  };
  return (
    <div className="pg">
      <div className="wrap">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>{t("crumb.home")}</a>
          <span>/</span>
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>{t("cat." + lot.cat)}</a>
          <span>/</span>
          <b>№ {lot.n}</b>
        </nav>
        <div className="pd">
          <div
            className="pd-gallery"
            ref={galleryRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.clientWidth) setSlide(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {lot.images.map((im, i) => (
              <figure className="pd-photo" key={im + i} onClick={() => setZoomAt(i)}>
                <img
                  src={im}
                  alt={`${tr.title} ${i + 1}`}
                  width={880}
                  height={660}
                  fetchPriority={i === 0 ? "high" : undefined}
                  loading={i === 0 ? undefined : "lazy"}
                />
                <figcaption className="pd-zoomhint" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M16 16 21 21 M11 8.5 v5 M8.5 11 h5" strokeLinecap="round" />
                  </svg>
                  {i + 1}/{lot.images.length}
                </figcaption>
              </figure>
            ))}
          </div>
          {lot.images.length > 1 && (
            <div className="pd-thumbs">
              {lot.images.map((im, i) => (
                <button
                  key={im + i}
                  className={i === slide ? "on" : ""}
                  onClick={() => goSlide(i)}
                  aria-label={`${tr.title} ${i + 1}`}
                >
                  <img src={im} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {zoomAt !== null && (
            <Lightbox
              images={lot.images}
              start={zoomAt}
              title={tr.title}
              t={t}
              onClose={() => setZoomAt(null)}
            />
          )}
          <aside className="pd-panel">
            <span className="pd-n">№ {lot.n} · {t("cat." + lot.cat).toUpperCase()}</span>
            <h1 className="pd-title">{tr.title}</h1>
            <span className="pd-era">{tr.era}</span>
            <p className="pd-desc">{tr.desc}</p>
            <div className="pd-price">
              €{fmt(lot.price)} {lot.sold && <small>· {t("lot.sold").toLowerCase()}</small>}
            </div>
            <div className="pd-ctas">
              {lot.sold ? (
                <a className="btn-ghost" href="mailto:hello@epoha.example?subject=Similar%20piece">
                  {t("lot.askSimilar")}
                </a>
              ) : inCart ? (
                <button className="btn-ghost" onClick={() => go("/cart")}>
                  {t("lot.openCart")}
                </button>
              ) : (
                <>
                  <button className="btn-brass" onClick={() => cart.add(lot.id)}>
                    {t("lot.add")}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      cart.add(lot.id);
                      go("/checkout");
                    }}
                  >
                    {t("lot.buyNow")}
                  </button>
                </>
              )}
              <button
                className={`pd-fav${favs.has(lot.id) ? " on" : ""}`}
                onClick={() => favs.toggle(lot.id)}
                aria-label={t("nav.favs")}
              >
                <Heart on={favs.has(lot.id)} />
              </button>
            </div>
            <ul className="pd-notes">
              <li>{t("lot.note1")}</li>
              <li>{t("lot.note2")}</li>
              <li>{t("lot.note3")}</li>
            </ul>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="pd-related">
            <SecHead kicker={t("related.kicker")} title={t("related.title")} accent={t("related.titleAccent")} />
            <div className="lots">
              {related.map((l) => (
                <LotCard key={l.id} l={l} favs={favs} cart={cart} lang={lang} t={t} fmt={fmt} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function FavsPage({ lots, favs, cart, lang, t, fmt }: { lots: Lot[]; favs: Store; cart: Store; lang: Lang; t: T; fmt: (n: number) => string }) {
  const items = lots.filter((l) => favs.has(l.id));
  return (
    <div className="pg">
      <div className="wrap">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>{t("crumb.home")}</a>
          <span>/</span>
          <b>{t("favs.title")}</b>
        </nav>
        <h1 className="pg-title">{t("favs.title")}</h1>
        {items.length === 0 ? (
          <div className="empty">
            <p>{t("favs.empty")}</p>
            <button className="btn-brass" onClick={() => go("/")}>{t("favs.go")}</button>
          </div>
        ) : (
          <div className="lots">
            {items.map((l) => (
              <LotCard key={l.id} l={l} favs={favs} cart={cart} lang={lang} t={t} fmt={fmt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CartPage({ lots, cart, lang, t, fmt }: { lots: Lot[]; cart: Store; lang: Lang; t: T; fmt: (n: number) => string }) {
  const items = lots.filter((l) => cart.has(l.id));
  const total = items.reduce((s, l) => s + l.price, 0);
  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>{t("crumb.home")}</a>
          <span>/</span>
          <b>{t("cart.title")}</b>
        </nav>
        <h1 className="pg-title">{t("cart.title")}</h1>
        {items.length === 0 ? (
          <div className="empty">
            <p>{t("cart.empty")}</p>
            <button className="btn-brass" onClick={() => go("/")}>{t("favs.go")}</button>
          </div>
        ) : (
          <div className="cartpg">
            <div className="cartpg-list">
              {items.map((l) => {
                const tr = l.tr[lang] ?? l.tr.lv;
                return (
                  <div key={l.id} className="cartpg-item">
                    <img src={l.images[0]} alt={tr.title} onClick={() => go(`/lot/${l.id}`)} />
                    <div className="cartpg-info" onClick={() => go(`/lot/${l.id}`)}>
                      <strong>{tr.title}</strong>
                      <small>№ {l.n} · {tr.era}</small>
                    </div>
                    <div className="cartpg-right">
                      <b>€{fmt(l.price)}</b>
                      <button className="cart-rm" onClick={() => cart.remove(l.id)}>{t("cart.remove")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <aside className="cartpg-sum">
              <h3>{t("cart.sum")}</h3>
              <div className="cartpg-row">
                <span>{t("cart.items")}</span>
                <b>{items.length}</b>
              </div>
              <div className="cartpg-row">
                <span>{t("cart.ship")}</span>
                <b>{t("cart.shipCalc")}</b>
              </div>
              <div className="cartpg-row cartpg-total">
                <span>{t("cart.total")}</span>
                <b>€{fmt(total)}</b>
              </div>
              <button className="btn-brass" style={{ width: "100%", justifyContent: "center" }} onClick={() => go("/checkout")}>
                {t("cart.checkout")}
              </button>
              <p className="cart-note">{t("cart.note")}</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckoutPage({ lots, cart, lang, t, fmt }: { lots: Lot[]; cart: Store; lang: Lang; t: T; fmt: (n: number) => string }) {
  const items = lots.filter((l) => cart.has(l.id));
  const subtotal = items.reduce((s, l) => s + l.price, 0);
  const [delivery, setDelivery] = useState<"pickup" | "courier">("pickup");
  const [form, setForm] = useState({ name: "", contact: "", email: "", address: "", comment: "" });
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const fee = delivery === "courier" ? 50 : 0;
  const total = subtotal + fee;

  /* Почта и телефон обязательны — по ним менеджер связывается с покупателем */
  const err = {
    name: form.name.trim().length > 1 ? "" : t("ck.errName"),
    contact: form.contact.trim().length > 3 ? "" : t("ck.errPhone"),
    email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim()) ? "" : t("ck.errEmail"),
    address: delivery === "pickup" || form.address.trim().length > 5 ? "" : t("ck.errAddress"),
  };
  const ok = !err.name && !err.contact && !err.email && !err.address;
  const showErr = (k: keyof typeof err) => (touched[k] ? err[k] : "");
  const mark = (k: string) => () => setTouched((s) => ({ ...s, [k]: true }));

  const submit = async (pay: boolean) => {
    if (!ok) {
      setTouched({ name: true, contact: true, email: true, address: true });
      return;
    }
    if (!items.length || busy) return;
    setBusy(true);
    try {
      const res = await fetch("api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, delivery, pay, lang, items: items.map((l) => l.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "error");
      cart.clear();
      if (data.payUrl) {
        location.href = data.payUrl;
        return;
      }
      if (pay && data.payError) alert(t("ck.noStripe"));
      go(`/success/${data.order}`);
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <nav className="crumbs">
          <a href="#/cart" onClick={(e) => { e.preventDefault(); go("/cart"); }}>{t("cart.title")}</a>
          <span>/</span>
          <b>{t("ck.title")}</b>
        </nav>
        <h1 className="pg-title">{t("ck.title")}</h1>
        {items.length === 0 ? (
          <div className="empty">
            <p>{t("ck.empty")}</p>
            <button className="btn-brass" onClick={() => go("/")}>{t("favs.go")}</button>
          </div>
        ) : (
          <form className="ck" noValidate onSubmit={(e) => { e.preventDefault(); submit(true); }}>
            <div className="ck-form">
              <label className="ck-field">
                <span>{t("ck.name")} *</span>
                <input
                  className={showErr("name") ? "bad" : ""}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={mark("name")}
                  placeholder={t("ck.namePh")}
                  required
                />
                {showErr("name") && <em className="ck-err">{showErr("name")}</em>}
              </label>
              <label className="ck-field">
                <span>{t("ck.contact")} *</span>
                <input
                  className={showErr("contact") ? "bad" : ""}
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  onBlur={mark("contact")}
                  placeholder={t("ck.contactPh")}
                  required
                />
                {showErr("contact") && <em className="ck-err">{showErr("contact")}</em>}
              </label>
              <label className="ck-field">
                <span>{t("ck.email")} *</span>
                <input
                  className={showErr("email") ? "bad" : ""}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={mark("email")}
                  placeholder={t("ck.emailPh")}
                  required
                />
                {showErr("email") && <em className="ck-err">{showErr("email")}</em>}
              </label>

              <div className="ck-field">
                <span>{t("ck.delivery")} *</span>
                <div className="ck-ship">
                  <button
                    type="button"
                    className={`ck-opt${delivery === "pickup" ? " on" : ""}`}
                    onClick={() => setDelivery("pickup")}
                  >
                    <i aria-hidden="true" />
                    <b>{t("ck.pickup")}</b>
                    <small>{t("ck.pickupNote")}</small>
                    <u>{t("ck.free")}</u>
                  </button>
                  <button
                    type="button"
                    className={`ck-opt${delivery === "courier" ? " on" : ""}`}
                    onClick={() => setDelivery("courier")}
                  >
                    <i aria-hidden="true" />
                    <b>{t("ck.courier")}</b>
                    <small>{t("ck.courierNote")}</small>
                    <u>+€50</u>
                  </button>
                </div>
              </div>

              {delivery === "pickup" && (
                <div className="ck-pick">
                  <div className="ck-pick-main">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" strokeLinejoin="round" />
                      <circle cx="12" cy="10" r="2.6" />
                    </svg>
                    <span>
                      <b>{t("ck.pickupTitle")}</b>
                      <i>{t("ck.pickupAddr")}</i>
                      <u>{t("ck.pickupHint")}</u>
                    </span>
                  </div>
                  <div className="ck-pick-links">
                    <a
                      href="https://www.google.com/maps/dir/?api=1&destination=Talsi%2C+Latvia"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("ck.route")} · Google Maps
                    </a>
                    <a
                      href="https://www.waze.com/ul?ll=57.2447%2C22.5876&navigate=yes&zoom=13"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("ck.route")} · Waze
                    </a>
                  </div>
                </div>
              )}

              {delivery === "courier" && (
                <label className="ck-field">
                  <span>{t("ck.address")} *</span>
                  <input
                    className={showErr("address") ? "bad" : ""}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    onBlur={mark("address")}
                    placeholder={t("ck.addressPh")}
                    required
                  />
                  {showErr("address") && <em className="ck-err">{showErr("address")}</em>}
                </label>
              )}

              <label className="ck-field">
                <span>{t("ck.comment")}</span>
                <textarea rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder={t("ck.commentPh")} />
              </label>
              <p className="cart-note">{t("ck.note")}</p>
            </div>

            <aside className="cartpg-sum">
              <h3>{t("ck.your")}</h3>
              {items.map((l) => (
                <div key={l.id} className="cartpg-row">
                  <span>№{l.n} · {(l.tr[lang] ?? l.tr.lv).title}</span>
                  <b>€{fmt(l.price)}</b>
                </div>
              ))}
              <div className="cartpg-row">
                <span>{t("cart.ship")}</span>
                <b>{fee ? `€${fmt(fee)}` : t("ck.free")}</b>
              </div>
              <div className="cartpg-row cartpg-total">
                <span>{t("cart.total")}</span>
                <b>€{fmt(total)}</b>
              </div>
              {/* Кнопки остаются активными: по клику показываем, что именно
                  не заполнено, вместо мёртвой кнопки без объяснения */}
              <button
                type="submit"
                className="btn-brass"
                style={{ width: "100%", justifyContent: "center", opacity: ok ? 1 : 0.7 }}
                disabled={busy}
              >
                {busy ? "…" : t("ck.payCard")}
              </button>
              <button
                type="button"
                className="btn-ghost ck-later"
                onClick={() => submit(false)}
                disabled={busy}
              >
                {t("ck.payLater")}
              </button>
              {!ok && Object.keys(touched).length > 0 && (
                <p className="ck-form-err">{t("ck.fixFields")}</p>
              )}
              <p className="cart-note">{t("ck.payHint")}</p>
              <p className="cart-note">{t("ck.agree")}</p>
            </aside>
          </form>
        )}
      </div>
    </div>
  );
}

function SuccessPage({ order, t }: { order: string; t: T }) {
  const [paid, setPaid] = useState(location.hash.includes("paid=1"));
  useEffect(() => {
    const sid = location.hash.match(/[?&]s=(cs_[A-Za-z0-9_]+)/)?.[1];
    if (!sid) return;
    /* сверяем оплату на сервере: он спросит Stripe напрямую */
    fetch(`api/orders/${order}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sid }),
    })
      .then((r) => r.json())
      .then((d) => setPaid(Boolean(d.paid)))
      .catch(() => {});
  }, [order]);
  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <div className="empty success">
          <span className={`success-seal${paid ? " paid" : ""}`}>
            {paid ? t("ok.paid") : t("ok.seal")}
          </span>
          <h1 className="pg-title">{t("ok.title", { n: order })}</h1>
          <p>{paid ? t("ok.textPaid") : t("ok.text")}</p>
          <button className="btn-brass" onClick={() => go("/")}>{t("ok.back")}</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const lots = useProducts();
  const cart = useStoredIds("epoha-cart");
  const favs = useStoredIds("epoha-favs");
  const route = useRoute();
  const [lang, setLangState] = useState<Lang>(detectLang);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [sort, setSort] = useState("new");
  const [viewed, setViewed] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("epoha-viewed") || "[]");
    } catch {
      return [];
    }
  });

  const t = useMemo(() => makeT(lang), [lang]);
  const fmt = useMemo(() => {
    const loc = localeOf(lang);
    return (n: number) => n.toLocaleString(loc);
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("epoha-lang", l);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t("meta.title");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.desc"));
  }, [lang, t]);

  useEffect(() => {
    if (route.view === "lot") {
      const id = route.id;
      setViewed((v) => {
        const next = [id, ...v.filter((x) => x !== id)].slice(0, 8);
        localStorage.setItem("epoha-viewed", JSON.stringify(next));
        return next;
      });
    }
  }, [route]);

  /* живой фон: курсор и скролл двигают латунные блики */
  useEffect(() => {
    let raf = 0;
    const root = document.documentElement.style;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.setProperty("--mx", `${(e.clientX / innerWidth - 0.5) * 46}px`);
        root.setProperty("--my", `${(e.clientY / innerHeight - 0.5) * 46}px`);
      });
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.setProperty("--sy", `${scrollY * 0.06}px`);
      });
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  useReveal(`${route.view}${cat}${query}${sort}${lang}${lots.length}`);

  const key = route.view + ("id" in route ? route.id : "") + ("order" in route ? route.order : "");
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      scrollTo({ top: 0 });
    }
  }, [key]);

  if (route.view === "admin") {
    return (
      <Suspense fallback={<div className="adm-boot">…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

  const lot = route.view === "lot" ? lots.find((l) => l.id === route.id) : undefined;

  return (
    <>
      <div className="ibg" aria-hidden="true">
        <i className="ibg-a" />
        <i className="ibg-b" />
        <i className="ibg-c" />
      </div>
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <Header
        lots={lots}
        favs={favs}
        cart={cart}
        query={query}
        setQuery={setQuery}
        cat={cat}
        setCat={setCat}
        lang={lang}
        setLang={setLang}
        t={t}
        fmt={fmt}
      />
      {route.view === "home" && (
        <Home
          lots={lots}
          favs={favs}
          cart={cart}
          cat={cat}
          query={query}
          sort={sort}
          setSort={setSort}
          viewed={viewed}
          lang={lang}
          t={t}
          fmt={fmt}
        />
      )}
      {route.view === "lot" && lot && (
        <LotPage lot={lot} lots={lots} favs={favs} cart={cart} lang={lang} t={t} fmt={fmt} />
      )}
      {route.view === "favs" && <FavsPage lots={lots} favs={favs} cart={cart} lang={lang} t={t} fmt={fmt} />}
      {route.view === "cart" && <CartPage lots={lots} cart={cart} lang={lang} t={t} fmt={fmt} />}
      {route.view === "checkout" && <CheckoutPage lots={lots} cart={cart} lang={lang} t={t} fmt={fmt} />}
      {route.view === "success" && <SuccessPage order={route.order} t={t} />}
      <Footer t={t} />
      <WhatsApp t={t} />
    </>
  );
}
