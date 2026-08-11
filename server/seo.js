/**
 * Страница глазами робота.
 *
 * Витрина — приложение на скриптах: браузер собирает её на лету, но
 * обходчики ИИ (GPTBot, ClaudeBot, PerplexityBot и прочие) скрипты не
 * выполняют вовсе — им достаётся исходный HTML. Раньше он был пустым
 * каркасом, поэтому для поисковиков и языковых моделей магазина не
 * существовало: одна страница без единого товара.
 *
 * Здесь на сервере в тот же каркас вкладывается всё, что нужно понять
 * страницу без скриптов: заголовок, описание, ссылки на языковые
 * версии, карточки Open Graph и разметка schema.org. Плюс настоящий
 * текст внутри корневого элемента — его же браузер заменит живым
 * приложением, а робот прочитает как обычную страницу.
 *
 * Адреса стали обычными (/lot/78 вместо #/lot/78): фрагмент после
 * решётки поисковик не индексирует, для него все товары были одной
 * и той же страницей.
 */
import fs from "node:fs";
import path from "node:path";
import { PLATFORM, DOCS } from "./legal.js";

const SITE = PLATFORM.site;

/** Языки витрины: латышский без приставки, остальные — с ней. */
export const LANGS = ["lv", "en", "ru", "lt", "et"];
const DEFAULT_LANG = "lv";
const LOCALE = { lv: "lv_LV", en: "en_GB", ru: "ru_RU", lt: "lt_LT", et: "et_EE" };

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Текст для описания: без переносов, обрезанный по границе слова. */
const brief = (s, max = 155) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
};

const money = (n) => `${Number(n || 0).toFixed(2)}`;

/* Поиск показывает около 60 знаков заголовка — остальное обрезает на
   полуслове. Режем сами и по границе слова. */
const shortTitle = (s, max = 55) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[,.;:·\s]+$/, "") + "…";
};

/* ── разбор адреса ───────────────────────────────────────────────
   Тот же набор страниц, что и у витрины; язык берётся из приставки. */
export function parsePath(pathname) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  let lang = DEFAULT_LANG;
  if (LANGS.includes(parts[0]) && parts[0] !== DEFAULT_LANG) lang = parts.shift();
  else if (parts[0] === DEFAULT_LANG) parts.shift();

  const [head, tail] = parts;
  if (!head) return { lang, view: "home" };
  if (head === "lot" && /^\d+$/.test(tail || "")) return { lang, view: "lot", id: Number(tail) };
  if (head === "cat" && tail) return { lang, view: "cat", cat: tail };
  if (head === "legal" && tail) return { lang, view: "legal", doc: tail };
  if (["favs", "cart", "checkout", "partner", "admin", "success"].includes(head))
    return { lang, view: head, order: tail };
  return { lang, view: "unknown" };
}

/** Адрес страницы на нужном языке. */
export const urlFor = (lang, tail = "") => {
  const prefix = lang === DEFAULT_LANG ? "" : `/${lang}`;
  return `${SITE}${prefix}${tail}`;
};

const pageTail = (route) => {
  switch (route.view) {
    case "lot": return `/lot/${route.id}`;
    case "cat": return `/cat/${route.cat}`;
    case "legal": return `/legal/${route.doc}`;
    case "home": return "";
    default: return `/${route.view}`;
  }
};

/* ── тексты страниц ─────────────────────────────────────────────── */

const T = {
  lv: {
    home: (n) => ({
      title: "SOFA.LV — antīkas un vintage mēbeles ar vēsturi",
      desc: `${n} autentiski 19.–20. gadsimta priekšmeti: rokoko, Gustava stils, bīdermeiers. Restauratora pārbaudītas mēbeles, piegāde Latvijā, Lietuvā un Igaunijā.`,
      h1: "Antīkas un vintage mēbeles",
    }),
    cat: (name, n) => ({
      title: `${name} — SOFA.LV`,
      desc: `${name}: ${n} priekšmeti no SOFA.LV kolekcijas. Autentiskas 19.–20. gadsimta mēbeles ar restauratora pārbaudi un piegādi Baltijā.`,
      h1: name,
    }),
    lot: (l, cat) => ({
      title: `${shortTitle(l.title)} — ${l.era ? l.era + " · " : ""}SOFA.LV`,
      desc: brief(l.desc || `${l.title}. ${l.era}. Cena ${money(l.price)} EUR.`),
      h1: l.title,
    }),
    partner: () => ({
      title: "Kļūt par partneri — SOFA.LV",
      desc: "Pārdodiet vintage un antīkas mēbeles caur SOFA.LV: 20 % komisija, izmaksa pēc preces nodošanas pircējam.",
      h1: "Pārdodiet savas mēbeles caur SOFA.LV",
    }),
    price: "Cena",
    era: "Laikmets",
    inStock: "Pieejams",
    sold: "Pārdots",
    catalog: "Katalogs",
    delivery: "Piegāde līdz durvīm Latvijā, Lietuvā un Igaunijā — 50 EUR; bezmaksas saņemšana Talsos.",
  },
  en: {
    home: (n) => ({
      title: "SOFA.LV — antique and vintage furniture with a history",
      desc: `${n} authentic 19th–20th century pieces: rococo, Gustavian, Biedermeier. Checked by a restorer, delivery in Latvia, Lithuania and Estonia.`,
      h1: "Antique and vintage furniture",
    }),
    cat: (name, n) => ({
      title: `${name} — SOFA.LV`,
      desc: `${name}: ${n} pieces from the SOFA.LV collection. Authentic 19th–20th century furniture, checked by a restorer, delivered across the Baltics.`,
      h1: name,
    }),
    lot: (l) => ({
      title: `${shortTitle(l.title)} — ${l.era ? l.era + " · " : ""}SOFA.LV`,
      desc: brief(l.desc || `${l.title}. ${l.era}. Price ${money(l.price)} EUR.`),
      h1: l.title,
    }),
    partner: () => ({
      title: "Become a partner — SOFA.LV",
      desc: "Sell vintage and antique furniture through SOFA.LV: 20% commission, payout after the item reaches the buyer.",
      h1: "Sell your furniture through SOFA.LV",
    }),
    price: "Price",
    era: "Era",
    inStock: "Available",
    sold: "Sold",
    catalog: "Catalogue",
    delivery: "Door-to-door delivery in Latvia, Lithuania and Estonia — 50 EUR; free collection in Talsi.",
  },
  ru: {
    home: (n) => ({
      title: "SOFA.LV — антикварная и винтажная мебель с историей",
      desc: `${n} подлинных предметов XIX–XX веков: рококо, густавианский стиль, бидермейер. Проверено реставратором, доставка по Латвии, Литве и Эстонии.`,
      h1: "Антикварная и винтажная мебель",
    }),
    cat: (name, n) => ({
      title: `${name} — SOFA.LV`,
      desc: `${name}: ${n} предметов из коллекции SOFA.LV. Подлинная мебель XIX–XX веков, проверка реставратором, доставка по Балтии.`,
      h1: name,
    }),
    lot: (l) => ({
      title: `${shortTitle(l.title)} — ${l.era ? l.era + " · " : ""}SOFA.LV`,
      desc: brief(l.desc || `${l.title}. ${l.era}. Цена ${money(l.price)} EUR.`),
      h1: l.title,
    }),
    partner: () => ({
      title: "Стать партнёром — SOFA.LV",
      desc: "Продавайте винтажную и антикварную мебель через SOFA.LV: комиссия 20 %, выплата после передачи вещи покупателю.",
      h1: "Продавайте свою мебель через SOFA.LV",
    }),
    price: "Цена",
    era: "Эпоха",
    inStock: "В наличии",
    sold: "Продано",
    catalog: "Каталог",
    delivery: "Доставка до дверей по Латвии, Литве и Эстонии — 50 EUR; самовывоз в Талси бесплатно.",
  },
  lt: {
    home: (n) => ({
      title: "SOFA.LV — antikvariniai ir vintažiniai baldai su istorija",
      desc: `${n} autentiški XIX–XX a. daiktai: rokoko, gustaviškas stilius, bydermejeris. Patikrinta restauratoriaus, pristatymas Latvijoje, Lietuvoje ir Estijoje.`,
      h1: "Antikvariniai ir vintažiniai baldai",
    }),
    cat: (name, n) => ({
      title: `${name} — SOFA.LV`,
      desc: `${name}: ${n} daiktai iš SOFA.LV kolekcijos. Autentiški XIX–XX a. baldai, restauratoriaus patikra, pristatymas Baltijos šalyse.`,
      h1: name,
    }),
    lot: (l) => ({
      title: `${shortTitle(l.title)} — ${l.era ? l.era + " · " : ""}SOFA.LV`,
      desc: brief(l.desc || `${l.title}. ${l.era}. Kaina ${money(l.price)} EUR.`),
      h1: l.title,
    }),
    partner: () => ({
      title: "Tapkite partneriu — SOFA.LV",
      desc: "Parduokite vintažinius ir antikvarinius baldus per SOFA.LV: 20 % komisinis, išmokėjimas po daikto perdavimo pirkėjui.",
      h1: "Parduokite savo baldus per SOFA.LV",
    }),
    price: "Kaina",
    era: "Laikotarpis",
    inStock: "Yra",
    sold: "Parduota",
    catalog: "Katalogas",
    delivery: "Pristatymas iki durų Latvijoje, Lietuvoje ir Estijoje — 50 EUR; atsiėmimas Talsuose nemokamai.",
  },
  et: {
    home: (n) => ({
      title: "SOFA.LV — ajalooga antiik- ja vintage-mööbel",
      desc: `${n} ehtsat 19.–20. sajandi eset: rokokoo, Gustavi stiil, biedermeier. Restauraatori kontrollitud, kohaletoimetamine Lätis, Leedus ja Eestis.`,
      h1: "Antiik- ja vintage-mööbel",
    }),
    cat: (name, n) => ({
      title: `${name} — SOFA.LV`,
      desc: `${name}: ${n} eset SOFA.LV kollektsioonist. Ehtne 19.–20. sajandi mööbel, restauraatori kontroll, kohaletoimetamine Baltikumis.`,
      h1: name,
    }),
    lot: (l) => ({
      title: `${shortTitle(l.title)} — ${l.era ? l.era + " · " : ""}SOFA.LV`,
      desc: brief(l.desc || `${l.title}. ${l.era}. Hind ${money(l.price)} EUR.`),
      h1: l.title,
    }),
    partner: () => ({
      title: "Hakka partneriks — SOFA.LV",
      desc: "Müü vintage- ja antiikmööblit SOFA.LV kaudu: 20% komisjonitasu, väljamakse pärast eseme üleandmist ostjale.",
      h1: "Müü oma mööblit SOFA.LV kaudu",
    }),
    price: "Hind",
    era: "Ajastu",
    inStock: "Saadaval",
    sold: "Müüdud",
    catalog: "Kataloog",
    delivery: "Kohaletoimetamine ukseni Lätis, Leedus ja Eestis — 50 EUR; tasuta järeletulek Talsis.",
  },
};

const dict = (lang) => T[lang] || T.lv;

/* ── разметка schema.org ────────────────────────────────────────── */

const store = () => ({
  "@type": "Store",
  "@id": `${SITE}/#store`,
  name: PLATFORM.brand,
  legalName: PLATFORM.legalName,
  url: SITE,
  email: PLATFORM.email,
  vatID: PLATFORM.vatNr,
  taxID: PLATFORM.regNr,
  image: `${SITE}/logo/share.jpg`,
  logo: `${SITE}/logo/sofa-720.png`,
  address: {
    "@type": "PostalAddress",
    streetAddress: '"Gobas", Ģibuļu pag.',
    addressLocality: "Talsu novads",
    postalCode: "LV-3297",
    addressCountry: "LV",
  },
  areaServed: ["LV", "LT", "EE"],
  currenciesAccepted: "EUR",
  paymentAccepted: "Credit Card",
});

const productLd = (lot, lang, tr, catName) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": `${urlFor(lang, `/lot/${lot.id}`)}#product`,
  name: tr.title,
  description: tr.desc || tr.title,
  sku: String(lot.n || lot.id),
  category: catName || undefined,
  /* Единичная вещь без штрихкода — прямо предусмотренный случай */
  image: (lot.images || []).slice(0, 6).map((u) => (u.startsWith("http") ? u : SITE + u.replace(/^\./, ""))),
  itemCondition: "https://schema.org/UsedCondition",
  brand: { "@type": "Brand", name: PLATFORM.brand },
  offers: {
    "@type": "Offer",
    url: urlFor(lang, `/lot/${lot.id}`),
    priceCurrency: "EUR",
    price: money(lot.price),
    itemCondition: "https://schema.org/UsedCondition",
    availability: lot.sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    /* Вещь одна: продаётся ровно один раз */
    inventoryLevel: { "@type": "QuantitativeValue", value: lot.sold ? 0 : 1 },
    seller: store(),
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: "50.00", currency: "EUR" },
      shippingDestination: ["LV", "LT", "EE"].map((c) => ({
        "@type": "DefinedRegion",
        addressCountry: c,
      })),
    },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: ["LV", "LT", "EE"],
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 14,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/ReturnShippingFees",
    },
  },
});

const breadcrumbLd = (lang, trail) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((x, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: x.name,
    item: x.url,
  })),
});

const listLd = (lang, lots, trOf) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  numberOfItems: lots.length,
  itemListElement: lots.slice(0, 30).map((l, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: urlFor(lang, `/lot/${l.id}`),
    name: trOf(l).title,
  })),
});

/* ── сборка страницы ────────────────────────────────────────────── */

const trOf = (lot, lang) => {
  const t = lot.tr?.[lang];
  if (t && String(t.title || "").trim()) return t;
  return lot.tr?.lv || { title: `#${lot.n}`, era: "", desc: "" };
};

const catName = (cats, key, lang) => {
  const c = cats.find((x) => x.key === key);
  return c ? c.tr?.[lang] || c.tr?.lv || c.key : "";
};

/**
 * Что вложить в страницу: заголовки, разметка и видимый текст.
 * Возвращает null для служебных страниц — там роботу делать нечего.
 */
export function pageFor(route, { products, categories }) {
  const lang = route.lang;
  const d = dict(lang);
  const live = products.filter((p) => !p.hidden && !p.archived);

  const home = { name: PLATFORM.brand, url: urlFor(lang, "") };

  if (route.view === "lot") {
    const lot = live.find((p) => p.id === route.id);
    if (!lot) return null;
    const tr = trOf(lot, lang);
    const cn = catName(categories, lot.cat, lang);
    const head = d.lot({ ...tr, price: lot.price }, cn);
    return {
      lang,
      tail: `/lot/${lot.id}`,
      ...head,
      image: (lot.images || [])[0],
      ld: [
        productLd(lot, lang, tr, cn),
        breadcrumbLd(lang, [
          home,
          { name: cn || d.catalog, url: urlFor(lang, `/cat/${lot.cat}`) },
          { name: tr.title, url: urlFor(lang, `/lot/${lot.id}`) },
        ]),
      ],
      body: `
        <article>
          <h1>${esc(tr.title)}</h1>
          <p><strong>${esc(d.price)}: ${money(lot.price)} EUR</strong> · ${esc(lot.sold ? d.sold : d.inStock)}</p>
          ${tr.era ? `<p>${esc(d.era)}: ${esc(tr.era)}</p>` : ""}
          ${cn ? `<p>${esc(d.catalog)}: <a href="${urlFor(lang, `/cat/${lot.cat}`)}">${esc(cn)}</a></p>` : ""}
          <p>${esc(tr.desc)}</p>
          <p>${esc(d.delivery)}</p>
        </article>`,
    };
  }

  if (route.view === "cat") {
    const cat = categories.find((c) => c.key === route.cat);
    if (!cat) return null;
    const items = live.filter((p) => p.cat === cat.key);
    const cn = cat.tr?.[lang] || cat.tr?.lv || cat.key;
    const head = d.cat(cn, items.length);
    return {
      lang,
      tail: `/cat/${cat.key}`,
      ...head,
      ld: [
        listLd(lang, items, (l) => trOf(l, lang)),
        breadcrumbLd(lang, [home, { name: cn, url: urlFor(lang, `/cat/${cat.key}`) }]),
      ],
      body: catalogBody(lang, d, cn, items),
    };
  }

  if (route.view === "home") {
    const head = d.home(live.length);
    return {
      lang,
      tail: "",
      ...head,
      ld: [
        { "@context": "https://schema.org", ...store() },
        listLd(lang, live, (l) => trOf(l, lang)),
      ],
      body: `
        ${catalogBody(lang, d, head.h1, live)}
        <nav><ul>${categories
          .map((c) => `<li><a href="${urlFor(lang, `/cat/${c.key}`)}">${esc(c.tr?.[lang] || c.tr?.lv || c.key)}</a></li>`)
          .join("")}</ul></nav>`,
    };
  }

  if (route.view === "partner") {
    const head = d.partner();
    return {
      lang,
      tail: "/partner",
      ...head,
      ld: [breadcrumbLd(lang, [home, { name: head.h1, url: urlFor(lang, "/partner") }])],
      body: `<article><h1>${esc(head.h1)}</h1><p>${esc(head.desc)}</p></article>`,
    };
  }

  if (route.view === "legal") {
    const doc = DOCS[route.doc];
    if (!doc) return null;
    return {
      lang,
      tail: `/legal/${route.doc}`,
      title: `${doc.title} — ${PLATFORM.brand}`,
      desc: brief(`${doc.title}. Versija ${doc.version}.`),
      h1: doc.title,
      ld: [breadcrumbLd(lang, [home, { name: doc.title, url: urlFor(lang, `/legal/${route.doc}`) }])],
      body: `<article><h1>${esc(doc.title)}</h1><p>Versija ${esc(doc.version)}</p></article>`,
    };
  }

  return null;
}

const catalogBody = (lang, d, title, items) => `
  <section>
    <h1>${esc(title)}</h1>
    <p>${esc(d.delivery)}</p>
    <ul>
      ${items
        .slice(0, 60)
        .map((l) => {
          const tr = trOf(l, lang);
          return `<li><a href="${urlFor(lang, `/lot/${l.id}`)}">${esc(tr.title)}</a> — ${money(l.price)} EUR${
            tr.era ? ` · ${esc(tr.era)}` : ""
          }${l.sold ? ` · ${esc(d.sold)}` : ""}</li>`;
        })
        .join("")}
    </ul>
  </section>`;

/* ── вставка в каркас ───────────────────────────────────────────── */

let shell = null;
let shellAt = 0;

/** Каркас читаем с диска и обновляем после пересборки витрины. */
function readShell(file) {
  try {
    const st = fs.statSync(file);
    if (!shell || st.mtimeMs !== shellAt) {
      shell = fs.readFileSync(file, "utf8");
      shellAt = st.mtimeMs;
    }
  } catch {
    shell = null;
  }
  return shell;
}

/**
 * Возвращает готовый HTML страницы: тот же каркас, но с заголовками,
 * разметкой и текстом. Не нашли страницу — отдаём каркас как есть.
 */
export function render(distIndex, route, data) {
  const html = readShell(distIndex);
  if (!html) return null;
  const page = pageFor(route, data);
  if (!page) return html;

  const canonical = urlFor(page.lang, page.tail);
  const alternates = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${urlFor(l, page.tail)}" />`
  ).join("\n    ");

  const image = page.image
    ? (page.image.startsWith("http") ? page.image : SITE + page.image.replace(/^\./, ""))
    : `${SITE}/logo/share.jpg`;

  const head = `
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.desc)}" />
    <link rel="canonical" href="${canonical}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${urlFor(DEFAULT_LANG, page.tail)}" />
    <meta property="og:type" content="${route.view === "lot" ? "product" : "website"}" />
    <meta property="og:site_name" content="${PLATFORM.brand}" />
    <meta property="og:locale" content="${LOCALE[page.lang] || LOCALE.lv}" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.desc)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />
    ${page.ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n    ")}`;

  return html
    /* Прежние заголовок и описание заменяем страничными */
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, "")
    .replace(/<meta property="og:[\s\S]*?\/>\s*/g, "")
    .replace(/<meta name="twitter:card"[\s\S]*?\/>\s*/g, "")
    .replace(/<html lang="[a-z-]+"/, `<html lang="${page.lang}"`)
    .replace("</head>", `${head}\n  </head>`)
    /* Содержимое кладём внутрь корня: браузер заменит его живым
       приложением, а обходчик прочитает как обычную страницу. */
    .replace('<div id="root"></div>', `<div id="root">${page.body}</div>`);
}

/* ── служебные файлы для обходчиков ─────────────────────────────── */

/**
 * robots.txt. Обходчикам ИИ вход открыт намеренно: попадание в ответы
 * ChatGPT и подобных — это тот же показ товара, только без ставки за
 * клик. Закрыты только панель и служебные адреса.
 */
export const robots = () =>
  [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /checkout",
    "Disallow: /cart",
    "Disallow: /success",
    "",
    "# Обходчики языковых моделей — вход открыт",
    ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "meta-externalagent"].flatMap(
      (bot) => [`User-agent: ${bot}`, "Allow: /", ""]
    ),
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");

/** Карта сайта: все языки всех страниц, товары с датой изменения. */
export function sitemap({ products, categories }) {
  const live = products.filter((p) => !p.hidden && !p.archived);
  const rows = [];

  const add = (tail, opts = {}) => {
    for (const lang of LANGS) {
      rows.push({
        loc: urlFor(lang, tail),
        lang,
        tail,
        ...opts,
      });
    }
  };

  add("", { priority: "1.0", changefreq: "daily" });
  add("/partner", { priority: "0.5", changefreq: "monthly" });
  for (const c of categories.filter((c) => !c.hidden)) add(`/cat/${c.key}`, { priority: "0.7", changefreq: "daily" });
  for (const l of live) add(`/lot/${l.id}`, { priority: "0.8", changefreq: "weekly", lastmod: l.createdAt });
  for (const id of Object.keys(DOCS)) add(`/legal/${id}`, { priority: "0.3", changefreq: "yearly" });

  const body = rows
    .map(
      (r) => `  <url>
    <loc>${r.loc}</loc>${r.lastmod ? `\n    <lastmod>${String(r.lastmod).slice(0, 10)}</lastmod>` : ""}
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(l, r.tail)}" />`).join("\n")}
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;
}

/**
 * llms.txt — короткая выжимка о магазине для языковых моделей.
 * Соглашение молодое и принято далеко не всеми, но файл дешёвый:
 * главную работу всё равно делает обычный HTML с содержимым.
 */
export function llms({ products, categories }) {
  const live = products.filter((p) => !p.hidden && !p.archived && !p.sold);
  const prices = live.map((p) => p.price).sort((a, b) => a - b);
  return `# SOFA.LV

> ${PLATFORM.legalName} (reģ. ${PLATFORM.regNr}) — магазин антикварной и винтажной мебели XIX–XX веков в Латвии. Каждый предмет существует в одном экземпляре, проверен реставратором и продаётся с доставкой по Латвии, Литве и Эстонии.

Сайт говорит на пяти языках: латышском (основной), английском, русском, литовском и эстонском. Латышская версия — по адресу без приставки, остальные — с приставкой языка: ${SITE}/en/, ${SITE}/ru/, ${SITE}/lt/, ${SITE}/et/

## Что есть в наличии
- предметов в продаже: ${live.length}
- цены: от ${prices[0] || 0} до ${prices[prices.length - 1] || 0} EUR
- категории: ${categories.filter((c) => !c.hidden).map((c) => `${c.tr?.lv || c.key} (${live.filter((p) => p.cat === c.key).length})`).join(", ")}

## Условия
- Доставка до дверей по Латвии, Литве и Эстонии — 50 EUR за заказ; самовывоз в Талси бесплатно.
- Оплата картой онлайн через Stripe.
- Право отказа: 14 дней с получения товара.
- Один заказ — товары одного продавца.

## Разделы
- [Каталог](${SITE}/): все предметы с ценами и описаниями
${categories.filter((c) => !c.hidden).map((c) => `- [${c.tr?.lv || c.key}](${SITE}/cat/${c.key})`).join("\n")}
- [Стать партнёром](${SITE}/partner): условия для компаний, продающих через площадку
- [Правила покупки](${SITE}/legal/buyer), [Политика приватности](${SITE}/legal/privacy)

## Связь
- Почта: ${PLATFORM.email}
- Телефон и WhatsApp: +371 25 674 959
- Адрес: ${PLATFORM.address}
`;
}
