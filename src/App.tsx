import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, LOTS, img, type Category, type Lot } from "./data/catalog";

/* ═══ ПАТИНА — салон винтажной мебели ═══
   Многостраничник на hash-маршрутах (надёжно для GitHub Pages):
   #/            — главная (hero + каталог + процесс)
   #/lot/:id     — страница карточки товара
   #/cart        — корзина
   #/checkout    — оформление заказа
   #/success     — подтверждение заявки
   Корзина живёт в localStorage. */

const fmt = (n: number) => n.toLocaleString("ru-RU");

type Route =
  | { view: "home" }
  | { view: "lot"; lot: Lot }
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
  if (h.startsWith("#/cart")) return { view: "cart" };
  if (h.startsWith("#/checkout")) return { view: "checkout" };
  const success = h.match(/^#\/success\/([A-Z0-9-]+)/);
  if (success) return { view: "success", order: success[1] };
  return { view: "home" };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseRoute);
  useEffect(() => {
    const on = () => {
      const r = parseRoute();
      setRoute(r);
      if (r.view !== "home") scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const go = (hash: string) => {
  location.hash = hash;
};

function useCart() {
  const [ids, setIds] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("patina-cart") || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("patina-cart", JSON.stringify(ids));
  }, [ids]);
  return {
    ids,
    add: (id: number) => setIds((s) => (s.includes(id) ? s : [...s, id])),
    remove: (id: number) => setIds((s) => s.filter((x) => x !== id)),
    clear: () => setIds([]),
  };
}

/* Reveal-on-scroll — перевешивается при смене маршрута */
function useReveal(dep: unknown) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

const MARQUEE =
  "рококо · густавианский стиль · бидермейер · ар-нуво · поздний ампир · skønvirke · хрусталь · золочение · морёный дуб · ручная резьба · ";

/* ── Карточка лота в сетке ── */
function LotCard({ l }: { l: Lot }) {
  return (
    <article className="lot reveal" onClick={() => go(`/lot/${l.id}`)}>
      {l.sold && <span className="lot-sold">ПРОДАНО</span>}
      <div className="lot-imgs">
        <img src={img(l.id, 1)} alt={l.title} loading="lazy" width={760} height={570} />
        <img className="alt" src={img(l.id, 2)} alt="" loading="lazy" width={760} height={570} aria-hidden="true" />
      </div>
      <div className="lot-meta">
        <span className="lot-n">ЛОТ №{l.n}</span>
        <span className="lot-era">{l.era}</span>
      </div>
      <h3 className="lot-title">{l.title}</h3>
      <p className="lot-price">
        €{fmt(l.price)} <small>{l.sold ? "· продано" : ""}</small>
      </p>
    </article>
  );
}

/* ── Шапка ── */
function Header({ count }: { count: number }) {
  return (
    <header className="hdr">
      <a
        href="#/"
        className="hdr-logo"
        onClick={(e) => {
          e.preventDefault();
          go("/");
          scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        ПАТИ<b>НА</b>
      </a>
      <nav className="hdr-nav">
        <a href="#collection" onClick={(e) => { e.preventDefault(); go("/"); setTimeout(() => document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" }), 50); }}>Коллекция</a>
        <a href="#how" onClick={(e) => { e.preventDefault(); go("/"); setTimeout(() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }), 50); }}>Как мы работаем</a>
        <a href="#about" onClick={(e) => { e.preventDefault(); go("/"); setTimeout(() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" }), 50); }}>О салоне</a>
      </nav>
      <button className="hdr-cart" onClick={() => go("/cart")}>
        Корзина <b>{count}</b>
      </button>
    </header>
  );
}

function Footer() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-grid">
          <div>
            <div className="ftr-logo">
              ПАТИ<b>НА</b>
            </div>
            <p>
              Винтажная и антикварная мебель с европейских аукционов.
              Реставрация, гарантия подлинности, доставка.
            </p>
          </div>
          <div className="ftr-col">
            <span>Салон</span>
            <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>Коллекция</a>
            <a href="#/cart" onClick={(e) => { e.preventDefault(); go("/cart"); }}>Корзина</a>
          </div>
          <div className="ftr-col">
            <span>Связаться</span>
            <a href="mailto:salon@patina.example">salon@patina.example</a>
            <a href="tel:+37360000000">+373 60 000 000</a>
            <a href="https://t.me/patina_salon" target="_blank" rel="noopener noreferrer">
              Telegram
            </a>
          </div>
        </div>
        <div className="ftr-bottom">
          <span>© {new Date().getFullYear()} ПАТИНА · Демонстрационная витрина</span>
          <span>
            Дизайн и разработка —{" "}
            <a href="https://mtbyte.io" target="_blank" rel="noopener noreferrer">
              METABYTE
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ── Главная ── */
function Home({ filter, setFilter }: { filter: Category | "all"; setFilter: (c: Category | "all") => void }) {
  const shown = useMemo(
    () => (filter === "all" ? LOTS : LOTS.filter((l) => l.cat === filter)),
    [filter]
  );
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="hero-over">Салон винтажной мебели · европейские аукционы</p>
            <h1 className="hero-title" aria-label="ПАТИНА">
              {"ПАТИНА".split("").map((ch, i) => (
                <span key={i} style={{ animationDelay: `${0.2 + i * 0.07}s` }}>
                  {ch}
                </span>
              ))}
            </h1>
            <p className="hero-sub">
              Патина — это не износ. Это биография предмета. Мы находим мебель
              с историей на аукционах Европы и привозим её в ваш дом.
            </p>
            <div className="hero-ctas">
              <a
                className="btn-brass"
                href="#collection"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Смотреть коллекцию →
              </a>
              <a
                className="btn-ghost"
                href="#how"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Как мы работаем
              </a>
            </div>
          </div>
          <figure className="hero-frame">
            <div className="hero-frame-inner">
              <img
                src={img(5212622, 1)}
                alt="Диван в стиле рококо — лот №01"
                width={880}
                height={660}
                fetchPriority="high"
              />
              <figcaption className="hero-frame-label">
                Лот №01 · Диван рококо · Швеция, XX век
              </figcaption>
            </div>
            <span className="hero-plaque">В коллекции</span>
          </figure>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>{MARQUEE.repeat(3)}</span>
          <span>{MARQUEE.repeat(3)}</span>
        </div>
      </div>

      <section className="sec" id="collection">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="sec-no">КАТАЛОГ · {LOTS.length} ЛОТОВ</span>
            <h2 className="sec-title">Коллекция</h2>
            <i className="sec-rule" />
          </div>
          <div className="chips reveal">
            {(Object.keys(CATEGORIES) as (Category | "all")[]).map((c) => (
              <button
                key={c}
                className={`chip${filter === c ? " on" : ""}`}
                onClick={() => setFilter(c)}
              >
                {CATEGORIES[c]}
              </button>
            ))}
          </div>
          <div className="lots">
            {shown.map((l) => (
              <LotCard key={l.id} l={l} />
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="how" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="sec-no">ПУТЬ ПРЕДМЕТА</span>
            <h2 className="sec-title">Как мы работаем</h2>
            <i className="sec-rule" />
          </div>
          <div className="steps">
            <div className="step reveal">
              <span className="step-no">I.</span>
              <strong>Находим</strong>
              <p>
                Каждую неделю отсматриваем сотни лотов на аукционах Швеции,
                Дании и Германии. В коллекцию попадает один из пятидесяти —
                с честной историей и здоровой конструкцией.
              </p>
            </div>
            <div className="step reveal" style={{ transitionDelay: "90ms" }}>
              <span className="step-no">II.</span>
              <strong>Проверяем</strong>
              <p>
                Осматриваем каркас, пружины, фурнитуру и следы реставраций.
                Что требует внимания — приводим в порядок, сохраняя патину:
                биографию предмета не смывают.
              </p>
            </div>
            <div className="step reveal" style={{ transitionDelay: "180ms" }}>
              <span className="step-no">III.</span>
              <strong>Доставляем</strong>
              <p>
                Бережная упаковка и доставка по Европе. Перед отправкой —
                видеообзор предмета: вы видите ровно то, что приедет к вам
                домой.
              </p>
            </div>
          </div>
        </div>
      </section>

      <figure className="quote" id="about">
        <blockquote className="reveal">
          Новая мебель бывает у всех. <b>Мебель с прошлым</b> — только у вас.
        </blockquote>
        <figcaption className="reveal">ПАТИНА · салон винтажной мебели</figcaption>
      </figure>
    </>
  );
}

/* ── Страница товара ── */
function LotPage({ lot, cart }: { lot: Lot; cart: ReturnType<typeof useCart> }) {
  const related = LOTS.filter((l) => l.cat === lot.cat && l.id !== lot.id).slice(0, 3);
  const inCart = cart.ids.includes(lot.id);
  return (
    <div className="pg">
      <div className="wrap">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>Каталог</a>
          <span>/</span>
          <b>Лот №{lot.n}</b>
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
            <span className="pd-n">ЛОТ №{lot.n} · {CATEGORIES[lot.cat].toUpperCase()}</span>
            <h1 className="pd-title">{lot.title}</h1>
            <span className="pd-era">{lot.era}</span>
            <p className="pd-desc">{lot.desc}</p>
            <div className="pd-price">
              €{fmt(lot.price)} {lot.sold && <small>· продано</small>}
            </div>
            <div className="pd-ctas">
              {lot.sold ? (
                <a className="btn-ghost" href="mailto:salon@patina.example?subject=Подбор похожего предмета">
                  Запросить похожий
                </a>
              ) : inCart ? (
                <button className="btn-ghost" onClick={() => go("/cart")}>
                  В корзине — открыть →
                </button>
              ) : (
                <>
                  <button className="btn-brass" onClick={() => cart.add(lot.id)}>
                    Добавить в корзину
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
            </div>
            <ul className="pd-notes">
              <li>Видеообзор состояния — по запросу перед покупкой</li>
              <li>Доставка по Европе · 7–14 дней · бережная упаковка</li>
              <li>Оплата после подтверждения наличия менеджером</li>
            </ul>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="pd-related">
            <div className="sec-head">
              <span className="sec-no">ИЗ ТОЙ ЖЕ ВИТРИНЫ</span>
              <h2 className="sec-title" style={{ fontSize: "clamp(26px,3vw,40px)" }}>
                Похожие лоты
              </h2>
              <i className="sec-rule" />
            </div>
            <div className="lots">
              {related.map((l) => (
                <LotCard key={l.id} l={l} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ── Страница корзины ── */
function CartPage({ cart }: { cart: ReturnType<typeof useCart> }) {
  const items = LOTS.filter((l) => cart.ids.includes(l.id));
  const total = items.reduce((s, l) => s + l.price, 0);
  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <nav className="crumbs">
          <a href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>Каталог</a>
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
                  <img
                    src={img(l.id, 1)}
                    alt={l.title}
                    onClick={() => go(`/lot/${l.id}`)}
                  />
                  <div className="cartpg-info" onClick={() => go(`/lot/${l.id}`)}>
                    <strong>{l.title}</strong>
                    <small>ЛОТ №{l.n} · {l.era}</small>
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
                Оплата после подтверждения наличия и расчёта доставки
                менеджером салона.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Оформление заказа ── */
function CheckoutPage({ cart }: { cart: ReturnType<typeof useCart> }) {
  const items = LOTS.filter((l) => cart.ids.includes(l.id));
  const total = items.reduce((s, l) => s + l.price, 0);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    city: "",
    comment: "",
  });
  const ok = form.name.trim().length > 1 && form.contact.trim().length > 3;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || items.length === 0) return;
    const order = `P-${String(Date.now()).slice(-6)}`;
    const lines = items.map((l) => `• Лот №${l.n} — ${l.title} — €${fmt(l.price)}`);
    const body = encodeURIComponent(
      `Заявка ${order}\n\nПредметы:\n${lines.join("\n")}\n\nИтого: €${fmt(total)}\n\nИмя: ${form.name}\nСвязь: ${form.contact}\nГород: ${form.city}\nКомментарий: ${form.comment}`
    );
    // Заявка уходит письмом; в проде здесь будет API/бот
    window.open(
      `mailto:salon@patina.example?subject=${encodeURIComponent(`Заявка ${order} — ПАТИНА`)}&body=${body}`,
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
                После отправки менеджер салона свяжется с вами в течение
                рабочего дня: подтвердит наличие, пришлёт видеообзор и
                рассчитает доставку. Оплата — только после подтверждения.
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
                Отправить заявку
              </button>
              <p className="cart-note">Нажимая, вы соглашаетесь на обработку контактных данных.</p>
            </aside>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Успех ── */
function SuccessPage({ order }: { order: string }) {
  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <div className="empty success">
          <span className="success-seal">ПРИНЯТО</span>
          <h1 className="pg-title">Заявка {order} отправлена</h1>
          <p>
            Менеджер салона свяжется с вами в течение рабочего дня —
            подтвердит наличие, пришлёт видеообзор предметов и рассчитает
            доставку.
          </p>
          <button className="btn-brass" onClick={() => go("/")}>
            Вернуться в коллекцию →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const cart = useCart();
  const route = useRoute();
  const [filter, setFilter] = useState<Category | "all">("all");
  useReveal(route.view + (route.view === "home" ? filter : ""));

  const key = route.view + (route.view === "lot" ? route.lot.id : "");
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      scrollTo({ top: 0 });
    }
  }, [key]);

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <Header count={cart.ids.length} />
      {route.view === "home" && <Home filter={filter} setFilter={setFilter} />}
      {route.view === "lot" && <LotPage lot={route.lot} cart={cart} />}
      {route.view === "cart" && <CartPage cart={cart} />}
      {route.view === "checkout" && <CheckoutPage cart={cart} />}
      {route.view === "success" && <SuccessPage order={route.order} />}
      <Footer />
    </>
  );
}
