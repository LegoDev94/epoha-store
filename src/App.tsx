import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  COLLECTIONS,
  LOTS,
  img,
  type Category,
  type Lot,
} from "./data/catalog";
import { Logo } from "./Logo";

/* ═══ ЭПОХА — магазин винтажной мебели ═══
   Полноценный e-commerce на hash-маршрутах (GitHub Pages friendly):
   #/            — витрина (hero, подборки, каталог, ценности)
   #/lot/:id     — карточка товара
   #/favs        — избранное
   #/cart        — корзина
   #/checkout    — оформление заказа
   #/success/:n  — подтверждение
   Корзина и избранное — localStorage. */

const fmt = (n: number) => n.toLocaleString("ru-RU");

/* ── маршрутизация ── */
type Route =
  | { view: "home" }
  | { view: "lot"; lot: Lot }
  | { view: "favs" }
  | { view: "cart" }
  | { view: "checkout" }
  | { view: "success"; order: string };

function parseRoute(): Route {
  const h = location.hash;
  const lot = h.match(/^#\/lot\/(\d+)/);
  if (lot) {
    const found = LOTS.find((l) => l.id === Number(lot[1]));
    if (found) return { view: "lot", lot: found };
  }
  if (h.startsWith("#/favs")) return { view: "favs" };
  if (h.startsWith("#/cart")) return { view: "cart" };
  if (h.startsWith("#/checkout")) return { view: "checkout" };
  const s = h.match(/^#\/success\/([A-Z0-9-]+)/);
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

/* ── хранилища ── */
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
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

/* ── иконки категорий (line-art, свои) ── */
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

const FEATURED = [5212622, 5245111, 5243214]
  .map((id) => LOTS.find((l) => l.id === id)!)
  .filter(Boolean);

/* ── Редакционный заголовок секции ── */
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

/* ── карточка лота ── */
function LotCard({ l, favs, cart }: { l: Lot; favs: Store; cart: Store }) {
  return (
    <article className="lot reveal" onClick={() => go(`/lot/${l.id}`)}>
      {l.sold && <span className="lot-sold">ПРОДАНО</span>}
      <button
        className={`lot-fav${favs.has(l.id) ? " on" : ""}`}
        aria-label="В избранное"
        onClick={(e) => {
          e.stopPropagation();
          favs.toggle(l.id);
        }}
      >
        <Heart on={favs.has(l.id)} />
      </button>
      <div className="lot-imgs">
        <img src={img(l.id, 1)} alt={l.title} loading="lazy" width={760} height={570} />
        <img className="alt" src={img(l.id, 2)} alt="" loading="lazy" width={760} height={570} aria-hidden="true" />
      </div>
      <div className="lot-meta">
        <span className="lot-n">№ {l.n}</span>
        <span className="lot-era">{l.era}</span>
      </div>
      <h3 className="lot-title">{l.title}</h3>
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
            {cart.has(l.id) ? "В корзине ✓" : "В корзину"}
          </button>
        )}
      </div>
    </article>
  );
}

/* ── шапка с живым поиском и категориями ── */
function Header({
  favs,
  cart,
  query,
  setQuery,
  cat,
  setCat,
}: {
  favs: Store;
  cart: Store;
  query: string;
  setQuery: (q: string) => void;
  cat: Category | "all";
  setCat: (c: Category | "all") => void;
}) {
  const [focus, setFocus] = useState(false);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return LOTS.filter((l) =>
      `${l.title} ${l.era} ${l.desc} ${CATEGORIES[l.cat]}`.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [query]);

  const goCatalog = () => {
    go("/");
    setTimeout(
      () => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }),
      60
    );
  };

  const [menu, setMenu] = useState(false);
  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menu]);
  const pick = (c: Category | "all") => {
    setMenu(false);
    setCat(c);
    goCatalog();
  };

  return (
    <>
    <header className="hd">
      <div className="hd-top">
        <button className="hd-burger" aria-label="Меню" onClick={() => setMenu(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
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
            placeholder="Найти предмет: рококо, зеркало, комод…"
            aria-label="Поиск по коллекции"
          />
          {focus && found.length > 0 && (
            <div className="hd-drop">
              {found.map((l) => (
                <button key={l.id} className="hd-drop-item" onMouseDown={() => go(`/lot/${l.id}`)}>
                  <img src={img(l.id, 1)} alt="" />
                  <span>
                    <b>{l.title}</b>
                    <i>{l.era} · €{fmt(l.price)}</i>
                  </span>
                </button>
              ))}
              <button className="hd-drop-all" onMouseDown={goCatalog}>
                Все результаты в каталоге →
              </button>
            </div>
          )}
        </div>
        <div className="hd-actions">
          <button className="hd-act" onClick={() => go("/favs")} aria-label="Избранное">
            <Heart on={favs.ids.length > 0} />
            {favs.ids.length > 0 && <b>{favs.ids.length}</b>}
          </button>
          <button className="hd-act hd-cart" onClick={() => go("/cart")}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <path d="M4 7 h16 l-1.6 12.2 a2 2 0 0 1 -2 1.8 H7.6 a2 2 0 0 1 -2 -1.8 Z" />
              <path d="M8.5 10 V6.5 a3.5 3.5 0 0 1 7 0 V10" strokeLinecap="round" />
            </svg>
            Корзина
            {cart.ids.length > 0 && <b>{cart.ids.length}</b>}
          </button>
        </div>
      </div>
      <nav className="hd-cats" aria-label="Категории">
        {(Object.keys(CATEGORIES) as (Category | "all")[]).map((c) => (
          <button
            key={c}
            className={`hd-cat${cat === c ? " on" : ""}`}
            onClick={() => {
              setCat(c);
              goCatalog();
            }}
          >
            <CatIcon c={c} />
            {CATEGORIES[c]}
          </button>
        ))}
      </nav>
    </header>

      {menu && (
        <>
          <div className="mn-bg" onClick={() => setMenu(false)} />
          <aside className="mn" role="dialog" aria-label="Меню">
            <div className="mn-head">
              <Logo h={26} />
              <button className="mn-x" aria-label="Закрыть" onClick={() => setMenu(false)}>✕</button>
            </div>
            <nav className="mn-list">
              {(Object.keys(CATEGORIES) as (Category | "all")[]).map((c, i) => (
                <button
                  key={c}
                  className={`mn-item${cat === c ? " on" : ""}`}
                  style={{ animationDelay: `${0.05 + i * 0.05}s` }}
                  onClick={() => pick(c)}
                >
                  <CatIcon c={c} />
                  {CATEGORIES[c]}
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </nav>
            <div className="mn-foot">
              <button className="mn-link" onClick={() => { setMenu(false); go("/favs"); }}>
                ♥ Избранное{favs.ids.length > 0 && ` · ${favs.ids.length}`}
              </button>
              <button className="mn-link" onClick={() => { setMenu(false); go("/cart"); }}>
                Корзина{cart.ids.length > 0 && ` · ${cart.ids.length}`}
              </button>
              <a className="mn-link" href="https://t.me/epoha_salon" target="_blank" rel="noopener noreferrer">
                Telegram
              </a>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function Footer() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-grid">
          <div>
            <div className="ftr-logo">
              <Logo h={36} />
            </div>
            <p>
              Винтажная и антикварная мебель XIX–XX веков. Подлинные предметы,
              бережная реставрация, доставка по Европе.
            </p>
          </div>
          <div className="ftr-col">
            <span>Магазин</span>
            <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>Витрина</a>
            <a href="#/favs" onClick={(e) => { e.preventDefault(); go("/favs"); }}>Избранное</a>
            <a href="#/cart" onClick={(e) => { e.preventDefault(); go("/cart"); }}>Корзина</a>
          </div>
          <div className="ftr-col">
            <span>Связаться</span>
            <a href="mailto:hello@epoha.example">hello@epoha.example</a>
            <a href="tel:+37360000000">+373 60 000 000</a>
            <a href="https://t.me/epoha_salon" target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
        </div>
        <div className="ftr-bottom">
          <span>© {new Date().getFullYear()} ЭПОХА · Демонстрационная витрина</span>
          <span>
            Дизайн и разработка —{" "}
            <a href="https://mtbyte.io" target="_blank" rel="noopener noreferrer">METABYTE</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ── главная-витрина ── */
function Home({
  favs,
  cart,
  cat,
  setCat,
  query,
  sort,
  setSort,
  viewed,
}: {
  favs: Store;
  cart: Store;
  cat: Category | "all";
  setCat: (c: Category | "all") => void;
  query: string;
  sort: string;
  setSort: (s: string) => void;
  viewed: number[];
}) {
  const [coll, setColl] = useState<string | null>(null);
  const active = COLLECTIONS.find((c) => c.key === coll) ?? null;
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % FEATURED.length), 5200);
    return () => clearInterval(t);
  }, []);

  const shown = useMemo(() => {
    let list = LOTS.slice();
    if (active) list = list.filter((l) => active.ids.includes(l.id));
    else if (cat !== "all") list = list.filter((l) => l.cat === cat);
    const q = query.trim().toLowerCase();
    if (q.length >= 2)
      list = list.filter((l) =>
        `${l.title} ${l.era} ${l.desc}`.toLowerCase().includes(q)
      );
    if (sort === "cheap") list.sort((a, b) => a.price - b.price);
    if (sort === "rich") list.sort((a, b) => b.price - a.price);
    return list;
  }, [cat, query, sort, active]);

  const recent = viewed
    .map((id) => LOTS.find((l) => l.id === id))
    .filter(Boolean)
    .slice(0, 4) as Lot[];

  return (
    <>
      {/* Витрина недели: живой слайдер предметов */}
      <section className="bn">
        {FEATURED.map((f, i) => (
          <img
            key={f.id}
            className={`bn-img${i === slide ? " on" : ""}`}
            src={img(f.id, 1)}
            alt=""
            aria-hidden="true"
            fetchPriority={i === 0 ? "high" : undefined}
            loading={i === 0 ? undefined : "lazy"}
          />
        ))}
        <div className="bn-shade" />
        <div className="wrap bn-inner">
          <p className="bn-over">Витрина недели · коллекция пополнена</p>
          <h1 className="bn-title">
            Мебель, <em>пережившая моду</em>
          </h1>
          <p className="bn-sub">
            Подлинные предметы XIX–XX веков: рококо, густавианский стиль,
            бидермейер. Каждый предмет проверен реставратором и готов к новой
            жизни в вашем доме.
          </p>
          <div className="bn-ctas">
            <button
              className="btn-brass"
              onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
            >
              Смотреть коллекцию →
            </button>
            <button
              className="btn-ghost"
              onClick={() => document.getElementById("collections")?.scrollIntoView({ behavior: "smooth" })}
            >
              Подборки
            </button>
          </div>
          <div className="bn-facts">
            <span><b>{LOTS.length}</b> предметов в наличии</span>
            <i />
            <span><b>XIX–XX</b> век</span>
            <i />
            <span><b>7–14</b> дней доставка</span>
          </div>
        </div>
        {/* Продающая карточка предмета на витрине */}
        {FEATURED.map((f, i) => (
          <button
            key={f.id}
            className={`bn-card${i === slide ? " on" : ""}`}
            onClick={() => go(`/lot/${f.id}`)}
          >
            <span className="bn-card-k">Сейчас на витрине</span>
            <b>{f.title}</b>
            <span className="bn-card-era">{f.era}</span>
            <span className="bn-card-row">
              <u>€{fmt(f.price)}</u>
              <s
                onClick={(e) => {
                  e.stopPropagation();
                  cart.has(f.id) ? go("/cart") : cart.add(f.id);
                }}
              >
                {cart.has(f.id) ? "В корзине ✓" : "В корзину"}
              </s>
            </span>
          </button>
        ))}
        <div className="bn-dots" role="tablist" aria-label="Предметы витрины">
          {FEATURED.map((f, i) => (
            <button
              key={f.id}
              className={i === slide ? "on" : ""}
              aria-label={f.title}
              onClick={() => setSlide(i)}
            />
          ))}
        </div>
      </section>

      {/* Подборки */}
      <section className="sec" id="collections">
        <div className="wrap">
          <SecHead kicker="Кураторские подборки" title="Настроения" accent="интерьера" />
          <div className="colls">
            {COLLECTIONS.map((c) => (
              <button
                key={c.key}
                className={`coll reveal${coll === c.key ? " on" : ""}`}
                onClick={() => {
                  setColl(coll === c.key ? null : c.key);
                  setCat("all");
                  document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <img src={img(c.cover, 1)} alt="" loading="lazy" />
                <span className="coll-shade" />
                <span className="coll-text">
                  <b>{c.title}</b>
                  <i>{c.hint}</i>
                  <u>{c.ids.length} предметов →</u>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Каталог */}
      <section className="sec" id="catalog" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <SecHead
            kicker={active ? "Подборка" : "Каталог"}
            title={active ? active.title : CATEGORIES[cat]}
            count={shown.length}
            right={
              <select className="sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
                <option value="new">Сначала витринные</option>
                <option value="cheap">Дешевле</option>
                <option value="rich">Дороже</option>
              </select>
            }
          />
          {active && (
            <button className="coll-reset" onClick={() => setColl(null)}>
              ✕ Сбросить подборку «{active.title}»
            </button>
          )}
          {shown.length === 0 ? (
            <div className="empty">
              <p>Ничего не нашлось — попробуйте другой запрос.</p>
            </div>
          ) : (
            <div className="lots">
              {shown.map((l) => (
                <LotCard key={l.id} l={l} favs={favs} cart={cart} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ценности */}
      <section className="sec" id="how" style={{ paddingTop: 24 }}>
        <div className="wrap">
          <SecHead kicker="Почему ЭПОХА" title="Три" accent="обещания" />
          <div className="steps">
            <div className="step reveal">
              <span className="step-no">I.</span>
              <strong>Подлинность</strong>
              <p>
                Каждый предмет атрибутирован: эпоха, школа, материалы. Никаких
                «под старину» — только вещи с настоящей биографией.
              </p>
            </div>
            <div className="step reveal" style={{ transitionDelay: "90ms" }}>
              <span className="step-no">II.</span>
              <strong>Состояние</strong>
              <p>
                Реставратор проверяет каркас, пружины и фурнитуру до витрины.
                Перед покупкой пришлём видеообзор — вы видите ровно то, что
                приедет.
              </p>
            </div>
            <div className="step reveal" style={{ transitionDelay: "180ms" }}>
              <span className="step-no">III.</span>
              <strong>Доставка</strong>
              <p>
                Обрешётка, мягкая упаковка, страховка. По Европе — 7–14 дней,
                до двери, с подъёмом. Оплата после подтверждения заказа.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Недавно смотрели */}
      {recent.length > 0 && (
        <section className="sec" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <SecHead kicker="Вы смотрели" title="Недавние" accent="предметы" />
            <div className="lots">
              {recent.map((l) => (
                <LotCard key={l.id} l={l} favs={favs} cart={cart} />
              ))}
            </div>
          </div>
        </section>
      )}

    </>
  );
}

/* ── карточка товара ── */
function LotPage({ lot, favs, cart }: { lot: Lot; favs: Store; cart: Store }) {
  const related = LOTS.filter((l) => l.cat === lot.cat && l.id !== lot.id).slice(0, 3);
  const inCart = cart.has(lot.id);
  return (
    <div className="pg">
      <div className="wrap">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>Витрина</a>
          <span>/</span>
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>{CATEGORIES[lot.cat]}</a>
          <span>/</span>
          <b>№ {lot.n}</b>
        </nav>
        <div className="pd">
          <div className="pd-gallery">
            <figure className="pd-photo">
              <img src={img(lot.id, 1)} alt={lot.title} width={880} height={660} fetchPriority="high" />
            </figure>
            <figure className="pd-photo">
              <img src={img(lot.id, 2)} alt={`${lot.title} — ракурс 2`} width={880} height={660} loading="lazy" />
            </figure>
          </div>
          <aside className="pd-panel">
            <span className="pd-n">№ {lot.n} · {CATEGORIES[lot.cat].toUpperCase()}</span>
            <h1 className="pd-title">{lot.title}</h1>
            <span className="pd-era">{lot.era}</span>
            <p className="pd-desc">{lot.desc}</p>
            <div className="pd-price">
              €{fmt(lot.price)} {lot.sold && <small>· продано</small>}
            </div>
            <div className="pd-ctas">
              {lot.sold ? (
                <a className="btn-ghost" href="mailto:hello@epoha.example?subject=Подбор похожего предмета">
                  Запросить похожий
                </a>
              ) : inCart ? (
                <button className="btn-ghost" onClick={() => go("/cart")}>
                  В корзине — открыть →
                </button>
              ) : (
                <>
                  <button className="btn-brass" onClick={() => cart.add(lot.id)}>
                    В корзину
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      cart.add(lot.id);
                      go("/checkout");
                    }}
                  >
                    Купить сейчас
                  </button>
                </>
              )}
              <button
                className={`pd-fav${favs.has(lot.id) ? " on" : ""}`}
                onClick={() => favs.toggle(lot.id)}
                aria-label="В избранное"
              >
                <Heart on={favs.has(lot.id)} />
              </button>
            </div>
            <ul className="pd-notes">
              <li>Видеообзор состояния — по запросу перед покупкой</li>
              <li>Доставка по Европе · 7–14 дней · обрешётка и страховка</li>
              <li>Оплата после подтверждения заказа менеджером</li>
            </ul>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="pd-related">
            <SecHead kicker="Из той же витрины" title="Похожие" accent="предметы" />
            <div className="lots">
              {related.map((l) => (
                <LotCard key={l.id} l={l} favs={favs} cart={cart} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ── избранное ── */
function FavsPage({ favs, cart }: { favs: Store; cart: Store }) {
  const items = LOTS.filter((l) => favs.has(l.id));
  return (
    <div className="pg">
      <div className="wrap">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>Витрина</a>
          <span>/</span>
          <b>Избранное</b>
        </nav>
        <h1 className="pg-title">Избранное</h1>
        {items.length === 0 ? (
          <div className="empty">
            <p>Пока пусто. Отмечайте сердцем то, что легло на душу.</p>
            <button className="btn-brass" onClick={() => go("/")}>
              Смотреть коллекцию →
            </button>
          </div>
        ) : (
          <div className="lots">
            {items.map((l) => (
              <LotCard key={l.id} l={l} favs={favs} cart={cart} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── корзина ── */
function CartPage({ cart }: { cart: Store }) {
  const items = LOTS.filter((l) => cart.has(l.id));
  const total = items.reduce((s, l) => s + l.price, 0);
  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>Витрина</a>
          <span>/</span>
          <b>Корзина</b>
        </nav>
        <h1 className="pg-title">Корзина</h1>
        {items.length === 0 ? (
          <div className="empty">
            <p>Корзина пуста — коллекция ждёт.</p>
            <button className="btn-brass" onClick={() => go("/")}>
              Смотреть коллекцию →
            </button>
          </div>
        ) : (
          <div className="cartpg">
            <div className="cartpg-list">
              {items.map((l) => (
                <div key={l.id} className="cartpg-item">
                  <img src={img(l.id, 1)} alt={l.title} onClick={() => go(`/lot/${l.id}`)} />
                  <div className="cartpg-info" onClick={() => go(`/lot/${l.id}`)}>
                    <strong>{l.title}</strong>
                    <small>№ {l.n} · {l.era}</small>
                  </div>
                  <div className="cartpg-right">
                    <b>€{fmt(l.price)}</b>
                    <button className="cart-rm" onClick={() => cart.remove(l.id)}>
                      убрать
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <aside className="cartpg-sum">
              <h3>Итог</h3>
              <div className="cartpg-row">
                <span>Предметов</span>
                <b>{items.length}</b>
              </div>
              <div className="cartpg-row">
                <span>Доставка</span>
                <b>рассчитаем</b>
              </div>
              <div className="cartpg-row cartpg-total">
                <span>Итого</span>
                <b>€{fmt(total)}</b>
              </div>
              <button
                className="btn-brass"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => go("/checkout")}
              >
                Оформить заказ →
              </button>
              <p className="cart-note">
                Оплата после подтверждения наличия и расчёта доставки менеджером.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── оформление ── */
function CheckoutPage({ cart }: { cart: Store }) {
  const items = LOTS.filter((l) => cart.has(l.id));
  const total = items.reduce((s, l) => s + l.price, 0);
  const [form, setForm] = useState({ name: "", contact: "", city: "", comment: "" });
  const ok = form.name.trim().length > 1 && form.contact.trim().length > 3;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || items.length === 0) return;
    const order = `E-${String(Date.now()).slice(-6)}`;
    const lines = items.map((l) => `• №${l.n} — ${l.title} — €${fmt(l.price)}`);
    const body = encodeURIComponent(
      `Заказ ${order}\n\nПредметы:\n${lines.join("\n")}\n\nИтого: €${fmt(total)}\n\nИмя: ${form.name}\nСвязь: ${form.contact}\nГород: ${form.city}\nКомментарий: ${form.comment}`
    );
    window.open(
      `mailto:hello@epoha.example?subject=${encodeURIComponent(`Заказ ${order} — ЭПОХА`)}&body=${body}`,
      "_self"
    );
    cart.clear();
    go(`/success/${order}`);
  };

  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <nav className="crumbs">
          <a href="#/cart" onClick={(e) => { e.preventDefault(); go("/cart"); }}>Корзина</a>
          <span>/</span>
          <b>Оформление</b>
        </nav>
        <h1 className="pg-title">Оформление заказа</h1>
        {items.length === 0 ? (
          <div className="empty">
            <p>В заказе пока пусто.</p>
            <button className="btn-brass" onClick={() => go("/")}>
              Смотреть коллекцию →
            </button>
          </div>
        ) : (
          <form className="ck" onSubmit={submit}>
            <div className="ck-form">
              <label className="ck-field">
                <span>Имя *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Как к вам обращаться"
                  required
                />
              </label>
              <label className="ck-field">
                <span>Телефон или Telegram *</span>
                <input
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="+373… или @username"
                  required
                />
              </label>
              <label className="ck-field">
                <span>Город доставки</span>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Кишинёв, Бухарест, Берлин…"
                />
              </label>
              <label className="ck-field">
                <span>Комментарий</span>
                <textarea
                  rows={4}
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  placeholder="Вопросы о состоянии, сроках, реставрации…"
                />
              </label>
              <p className="cart-note">
                После отправки менеджер свяжется с вами в течение рабочего дня:
                подтвердит наличие, пришлёт видеообзор и рассчитает доставку.
                Оплата — только после подтверждения.
              </p>
            </div>
            <aside className="cartpg-sum">
              <h3>Ваш заказ</h3>
              {items.map((l) => (
                <div key={l.id} className="cartpg-row">
                  <span>№{l.n} · {l.title}</span>
                  <b>€{fmt(l.price)}</b>
                </div>
              ))}
              <div className="cartpg-row cartpg-total">
                <span>Итого</span>
                <b>€{fmt(total)}</b>
              </div>
              <button
                type="submit"
                className="btn-brass"
                style={{ width: "100%", justifyContent: "center", opacity: ok ? 1 : 0.55 }}
                disabled={!ok}
              >
                Отправить заказ
              </button>
              <p className="cart-note">Нажимая, вы соглашаетесь на обработку контактных данных.</p>
            </aside>
          </form>
        )}
      </div>
    </div>
  );
}

function SuccessPage({ order }: { order: string }) {
  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <div className="empty success">
          <span className="success-seal">ПРИНЯТО</span>
          <h1 className="pg-title">Заказ {order} отправлен</h1>
          <p>
            Менеджер свяжется с вами в течение рабочего дня — подтвердит
            наличие, пришлёт видеообзор предметов и рассчитает доставку.
          </p>
          <button className="btn-brass" onClick={() => go("/")}>
            Вернуться на витрину →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const cart = useStoredIds("epoha-cart");
  const favs = useStoredIds("epoha-favs");
  const route = useRoute();
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

  /* журнал просмотров */
  useEffect(() => {
    if (route.view === "lot") {
      setViewed((v) => {
        const next = [route.lot.id, ...v.filter((x) => x !== route.lot.id)].slice(0, 8);
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

  useReveal(route.view + cat + query + sort);

  const key =
    route.view + (route.view === "lot" ? route.lot.id : "") + (route.view === "success" ? route.order : "");
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      scrollTo({ top: 0 });
    }
  }, [key]);

  return (
    <>
      <div className="ibg" aria-hidden="true">
        <i className="ibg-a" />
        <i className="ibg-b" />
        <i className="ibg-c" />
      </div>
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <Header favs={favs} cart={cart} query={query} setQuery={setQuery} cat={cat} setCat={setCat} />
      {route.view === "home" && (
        <Home
          favs={favs}
          cart={cart}
          cat={cat}
          setCat={setCat}
          query={query}
          sort={sort}
          setSort={setSort}
          viewed={route.view === "home" ? viewed : []}
        />
      )}
      {route.view === "lot" && <LotPage lot={route.lot} favs={favs} cart={cart} />}
      {route.view === "favs" && <FavsPage favs={favs} cart={cart} />}
      {route.view === "cart" && <CartPage cart={cart} />}
      {route.view === "checkout" && <CheckoutPage cart={cart} />}
      {route.view === "success" && <SuccessPage order={route.order} />}
      <Footer />
    </>
  );
}
