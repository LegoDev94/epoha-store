import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, LOTS, img, type Category, type Lot } from "./data/catalog";

/* ═══ ПАТИНА — салон винтажной мебели ═══
   Один экранный маршрут + hash-навигация лота (#/lot/id) — работает
   на GitHub Pages без серверных правил. Корзина в localStorage. */

const fmt = (n: number) => n.toLocaleString("ru-RU");

/* Reveal-on-scroll: один IntersectionObserver на всё приложение */
function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

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

function useHashLot(): [Lot | null, (id: number | null) => void] {
  const read = () => {
    const m = location.hash.match(/^#\/lot\/(\d+)/);
    return m ? LOTS.find((l) => l.id === Number(m[1])) ?? null : null;
  };
  const [lot, setLot] = useState<Lot | null>(read);
  useEffect(() => {
    const on = () => setLot(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [
    lot,
    (id) => {
      if (id === null) {
        history.pushState(null, "", location.pathname + location.search);
        setLot(null);
      } else {
        location.hash = `/lot/${id}`;
      }
    },
  ];
}

const MARQUEE =
  "рококо · густавианский стиль · бидермейер · ар-нуво · поздний ампир · skønvirke · хрусталь · золочение · морёный дуб · ручная резьба · ";

export default function App() {
  const cart = useCart();
  const [lot, openLot] = useHashLot();
  const [cartOpen, setCartOpen] = useState(false);
  const [filter, setFilter] = useState<Category | "all">("all");
  useReveal();

  const shown = useMemo(
    () => (filter === "all" ? LOTS : LOTS.filter((l) => l.cat === filter)),
    [filter]
  );
  const inCart = LOTS.filter((l) => cart.ids.includes(l.id));
  const total = inCart.reduce((s, l) => s + l.price, 0);

  /* Блокировка скролла под модалками */
  useEffect(() => {
    document.body.style.overflow = lot || cartOpen ? "hidden" : "";
  }, [lot, cartOpen]);

  const catalogRef = useRef<HTMLDivElement>(null);

  const orderMail = () => {
    const lines = inCart.map((l) => `• Лот №${l.n} — ${l.title} — €${fmt(l.price)}`);
    const body = encodeURIComponent(
      `Здравствуйте!\n\nХочу оформить заявку на предметы:\n${lines.join("\n")}\n\nИтого: €${fmt(total)}\n\nИмя:\nТелефон/Telegram:\nГород доставки:`
    );
    location.href = `mailto:salon@patina.example?subject=${encodeURIComponent("Заявка ПАТИНА")}&body=${body}`;
  };

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <header className="hdr">
        <a href="#" className="hdr-logo" onClick={(e) => { e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); }}>
          ПАТИ<b>НА</b>
        </a>
        <nav className="hdr-nav">
          <a href="#collection">Коллекция</a>
          <a href="#how">Как мы работаем</a>
          <a href="#about">О салоне</a>
        </nav>
        <button className="hdr-cart" onClick={() => setCartOpen(true)}>
          Корзина <b>{cart.ids.length}</b>
        </button>
      </header>

      {/* ── HERO ── */}
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
                  catalogRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Смотреть коллекцию →
              </a>
              <a className="btn-ghost" href="#how">
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

      {/* ── КОЛЛЕКЦИЯ ── */}
      <section className="sec" id="collection" ref={catalogRef}>
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
              <article
                key={l.id}
                className="lot reveal"
                onClick={() => openLot(l.id)}
              >
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
            ))}
          </div>
        </div>
      </section>

      {/* ── КАК МЫ РАБОТАЕМ ── */}
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

      {/* ── ЦИТАТА / О САЛОНЕ ── */}
      <figure className="quote" id="about">
        <blockquote className="reveal">
          Новая мебель бывает у всех. <b>Мебель с прошлым</b> — только у вас.
        </blockquote>
        <figcaption className="reveal">ПАТИНА · салон винтажной мебели</figcaption>
      </figure>

      {/* ── ФУТЕР ── */}
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
              <a href="#collection">Коллекция</a>
              <a href="#how">Как мы работаем</a>
              <a href="#about">О салоне</a>
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
              Дизайн и разработка — <a href="https://mtbyte.io" target="_blank" rel="noopener noreferrer">METABYTE</a>
            </span>
          </div>
        </div>
      </footer>

      {/* ── МОДАЛКА ЛОТА ── */}
      {lot && (
        <div className="modal-bg" onClick={() => openLot(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-photos">
              <img src={img(lot.id, 1)} alt={lot.title} width={880} height={660} />
              <img src={img(lot.id, 2)} alt={`${lot.title} — ракурс 2`} width={880} height={660} loading="lazy" />
            </div>
            <div className="modal-body">
              <button className="modal-x" onClick={() => openLot(null)} aria-label="Закрыть">
                ✕
              </button>
              <span className="modal-n">ЛОТ №{lot.n} · {CATEGORIES[lot.cat].toUpperCase()}</span>
              <h3 className="modal-title">{lot.title}</h3>
              <span className="modal-era">{lot.era}</span>
              <p className="modal-desc">{lot.desc}</p>
              <div className="modal-price">
                €{fmt(lot.price)} {lot.sold && <small>· продано</small>}
              </div>
              <div className="modal-ctas">
                {lot.sold ? (
                  <a className="btn-ghost" href="mailto:salon@patina.example?subject=Подбор похожего предмета">
                    Запросить похожий
                  </a>
                ) : cart.ids.includes(lot.id) ? (
                  <button className="btn-ghost" onClick={() => { setCartOpen(true); openLot(null); }}>
                    В корзине — открыть →
                  </button>
                ) : (
                  <button
                    className="btn-brass"
                    onClick={() => {
                      cart.add(lot.id);
                      setCartOpen(true);
                      openLot(null);
                    }}
                  >
                    Добавить в корзину
                  </button>
                )}
              </div>
              <p className="modal-note">
                Видеообзор состояния — по запросу перед покупкой. Доставка по
                Европе, срок 7–14 дней.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── КОРЗИНА ── */}
      {cartOpen && (
        <>
          <div className="cart-bg" onClick={() => setCartOpen(false)} />
          <aside className="cart">
            <div className="cart-head">
              <h3>Корзина</h3>
              <button className="cart-x" onClick={() => setCartOpen(false)} aria-label="Закрыть корзину">
                ✕
              </button>
            </div>
            <div className="cart-list">
              {inCart.length === 0 && (
                <p className="cart-empty">Корзина пуста — коллекция ждёт.</p>
              )}
              {inCart.map((l) => (
                <div key={l.id} className="cart-item">
                  <img src={img(l.id, 1)} alt={l.title} />
                  <div>
                    <strong>{l.title}</strong>
                    <small>ЛОТ №{l.n} · {l.era}</small>
                  </div>
                  <div className="cart-item-right">
                    <b>€{fmt(l.price)}</b>
                    <button className="cart-rm" onClick={() => cart.remove(l.id)}>
                      убрать
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {inCart.length > 0 && (
              <div className="cart-foot">
                <div className="cart-total">
                  <span>Итого</span>
                  <b>€{fmt(total)}</b>
                </div>
                <button className="btn-brass" style={{ width: "100%", justifyContent: "center" }} onClick={orderMail}>
                  Оформить заявку
                </button>
                <p className="cart-note">
                  Заявка уходит письмом — менеджер салона подтвердит наличие,
                  согласует доставку и выставит счёт. Оплата после
                  подтверждения.
                </p>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
