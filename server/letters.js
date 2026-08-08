/**
 * Тексты писем на трёх языках.
 *
 * Письмо покупателю об оплате — не любезность, а обязанность: статья
 * 8(7) директивы 2011/83/ES требует подтвердить заключённый договор
 * на долговременном носителе. Поэтому в нём есть всё необходимое:
 * что куплено и почём, кто продавец, право отказа за 14 дней и как
 * им воспользоваться. Остальное — ссылкой на условия, чтобы человек
 * получил письмо, а не пересказ закона.
 *
 * Языки равноправны: покупатель получает письмо на том языке, на
 * котором оформлял заказ (order.lang). Владельцу и партнёру пишем
 * по-латышски — это язык площадки.
 */
import { PLATFORM, DOCS } from "./legal.js";
import { holdDays } from "./money.js";
import { layout, p, note, facts, itemsTable, esc } from "./mail.js";

const SITE = PLATFORM.site;
const TERMS = `${SITE}/${DOCS.buyer.url.replace(/^\//, "")}`;

/** Суммы пишем так, как принято в языке письма. */
export function money(lang, eur) {
  const n = Number(eur || 0);
  const fixed = n.toFixed(2);
  if (lang === "en") return `€${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  const comma = fixed.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, " ");
  return lang === "lv" ? `${comma} EUR` : `${comma} €`;
}

/** Дату — в привычном виде, без машинного ISO. */
export function when(lang, iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const two = (x) => String(x).padStart(2, "0");
  const date = `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return lang === "en" ? `${date} at ${time}` : `${date}, ${time}`;
}

const L = {
  lv: {
    /* Звательная форма имени в латышском отличается от именительного
       («Jāni!», а не «Jānis»), а имя приходит как есть — поэтому
       здороваемся без имени, чтобы не коверкать обращение. */
    hello: () => "Labdien!",
    order: "Pasūtījums",
    items: "Preces",
    goods: "Preces",
    shipping: "Piegāde",
    total: "Kopā",
    pickup: "Saņemšana klātienē Talsos (bez maksas)",
    courier: "Piegāde līdz durvīm",
    buyer: "Pircējs",
    contact: "Kontakti",
    note: "Piezīme",
    seller: "Pārdevējs",
    paidAt: "Apmaksāts",
    placedAt: "Noformēts",
    terms: "Pirkuma noteikumi",
    payButton: "Apmaksāt pasūtījumu",
    openPanel: "Atvērt vadības paneli",
    openOrder: "Atvērt pasūtījumu",
  },
  en: {
    hello: (name) => (name ? `Hello, ${esc(name)}` : "Hello"),
    order: "Order",
    items: "Items",
    goods: "Goods",
    shipping: "Delivery",
    total: "Total",
    pickup: "Collection in Talsi (free)",
    courier: "Delivery to your door",
    buyer: "Buyer",
    contact: "Contact",
    note: "Note",
    seller: "Seller",
    paidAt: "Paid",
    placedAt: "Placed",
    terms: "Terms of purchase",
    payButton: "Pay for the order",
    openPanel: "Open the panel",
    openOrder: "Open the order",
  },
  ru: {
    hello: (name) => (name ? `Здравствуйте, ${esc(name)}` : "Здравствуйте"),
    order: "Заказ",
    items: "Товары",
    goods: "Товары",
    shipping: "Доставка",
    total: "Итого",
    pickup: "Самовывоз в Талси (бесплатно)",
    courier: "Доставка до дверей",
    buyer: "Покупатель",
    contact: "Контакты",
    note: "Комментарий",
    seller: "Продавец",
    paidAt: "Оплачен",
    placedAt: "Оформлен",
    terms: "Условия покупки",
    payButton: "Оплатить заказ",
    openPanel: "Открыть панель",
    openOrder: "Открыть заказ",
  },
};

const lang3 = (l) => (l === "en" || l === "ru" ? l : "lv");

/** Кто продавец: сама площадка или партнёр. Покупателю это нужно знать. */
function sellerLine(lang, order) {
  if (order.sellerType !== "partner" || !order.sellerName) {
    return {
      lv: `${PLATFORM.legalName}, reģ. Nr. ${PLATFORM.regNr}`,
      en: `${PLATFORM.legalName}, reg. No. ${PLATFORM.regNr}`,
      ru: `${PLATFORM.legalName}, рег. № ${PLATFORM.regNr}`,
    }[lang];
  }
  return order.sellerName;
}

/* ── письма покупателю ───────────────────────────────────────── */

const buyerNew = {
  lv: (o, t, m) => ({
    subject: `Pasūtījums ${o.order} ir saņemts`,
    preheader: `Preces rezervētas uz ${m.reserveMin} minūtēm. Kopā ${m.total}.`,
    heading: `Pasūtījums ${o.order} ir saņemts`,
    intro: [
      `${t.hello(o.name)} Paldies par pasūtījumu — mēs to saņēmām ${when("lv", o.at)}.`,
      `Pasūtījuma preces ir rezervētas uz ${m.reserveMin} minūtēm. Kad maksājums būs saņemts, nosūtīsim atsevišķu apstiprinājuma vēstuli.`,
    ],
    tailNote: `Ja maksājums netiek saņemts, rezervācija tiek atcelta un preces atgriežas katalogā. Naudu šādā gadījumā neprasām.`,
  }),
  en: (o, t, m) => ({
    subject: `Order ${o.order} received`,
    preheader: `Items reserved for ${m.reserveMin} minutes. Total ${m.total}.`,
    heading: `Order ${o.order} received`,
    intro: [
      `${t.hello(o.name)}, thank you for your order — we received it on ${when("en", o.at)}.`,
      `The items are reserved for ${m.reserveMin} minutes. Once the payment arrives, we will send a separate confirmation.`,
    ],
    tailNote: `If the payment does not arrive, the reservation is cancelled and the items return to the catalogue. Nothing is charged in that case.`,
  }),
  ru: (o, t, m) => ({
    subject: `Заказ ${o.order} принят`,
    preheader: `Товары в резерве ${m.reserveMin} минут. Итого ${m.total}.`,
    heading: `Заказ ${o.order} принят`,
    intro: [
      `${t.hello(o.name)}, спасибо за заказ — мы получили его ${when("ru", o.at)}.`,
      `Товары из заказа зарезервированы на ${m.reserveMin} минут. Когда оплата поступит, пришлём отдельное письмо-подтверждение.`,
    ],
    tailNote: `Если оплата не поступит, резерв снимается и товары возвращаются в каталог. Денег в этом случае не спишем.`,
  }),
};

const buyerPaid = {
  lv: (o, t, m) => ({
    subject: `Pasūtījums ${o.order} ir apmaksāts`,
    preheader: `Maksājums saņemts. Šī vēstule ir līguma apstiprinājums — saglabājiet to.`,
    heading: `Maksājums par pasūtījumu ${o.order} ir saņemts`,
    intro: [
      `${t.hello(o.name)} Jūsu maksājumu saņēmām ${when("lv", o.paidAt)}. Paldies.`,
      `Šī vēstule ir Jūsu līguma apstiprinājums — to var saglabāt un pārlasīt jebkurā laikā.`,
    ],
    legal: [
      `<b>Atteikuma tiesības.</b> Jums ir tiesības 14 dienu laikā no preces saņemšanas atkāpties no līguma, nenorādot iemeslu. Paziņojumu nosūtiet uz <a href="mailto:${PLATFORM.email}" style="color:#a07b3c;">${PLATFORM.email}</a> vai pa pastu: ${PLATFORM.address}.`,
      `Preces atpakaļ nosūtīšanas izmaksas sedzat Jūs. Jūs atbildat par preces vērtības samazināšanos, ja prece lietota vairāk, nekā nepieciešams tās rakstura, īpašību un darbības noskaidrošanai.`,
      `Ja kaut kas nav kārtībā ar preci vai piegādi, rakstiet mums — pieteikumu pieņemam un risinām mēs, neatkarīgi no tā, kurš ir preces pārdevējs.`,
    ],
  }),
  en: (o, t, m) => ({
    subject: `Order ${o.order} is paid`,
    preheader: `Payment received. This letter confirms your contract — please keep it.`,
    heading: `Payment for order ${o.order} received`,
    intro: [
      `${t.hello(o.name)}, we received your payment on ${when("en", o.paidAt)}. Thank you.`,
      `This letter is the confirmation of your contract — you can save it and read it at any time.`,
    ],
    legal: [
      `<b>Right of withdrawal.</b> You may withdraw from the contract within 14 days of receiving the goods, without giving a reason. Send your notice to <a href="mailto:${PLATFORM.email}" style="color:#a07b3c;">${PLATFORM.email}</a> or by post: ${PLATFORM.address}.`,
      `The direct cost of returning the goods is yours. You are liable for any diminished value of the goods if they were handled beyond what is necessary to establish their nature, characteristics and functioning.`,
      `If anything is wrong with the goods or the delivery, write to us — we handle the claim ourselves, whoever the seller is.`,
    ],
  }),
  ru: (o, t, m) => ({
    subject: `Заказ ${o.order} оплачен`,
    preheader: `Оплата получена. Это письмо — подтверждение договора, сохраните его.`,
    heading: `Оплата по заказу ${o.order} получена`,
    intro: [
      `${t.hello(o.name)}, мы получили вашу оплату ${when("ru", o.paidAt)}. Спасибо.`,
      `Это письмо — подтверждение вашего договора: его можно сохранить и перечитать в любой момент.`,
    ],
    legal: [
      `<b>Право отказа.</b> В течение 14 дней с получения товара вы можете отказаться от договора без объяснения причин. Сообщите об этом на <a href="mailto:${PLATFORM.email}" style="color:#a07b3c;">${PLATFORM.email}</a> или письмом по адресу: ${PLATFORM.address}.`,
      `Расходы на обратную пересылку несёте вы. Вы отвечаете за уменьшение стоимости товара, если обращались с ним больше, чем нужно для проверки его свойств и работы.`,
      `Если с товаром или доставкой что-то не так — напишите нам: обращение принимаем и решаем мы, независимо от того, кто продавец.`,
    ],
  }),
};

/* ── письма площадке и партнёру (по-латышски) ────────────────── */

const adminNew = (o, m) => ({
  subject: `Jauns pasūtījums ${o.order} — ${m.total}`,
  preheader: `${o.name} · ${m.total} · gaida apmaksu, preces rezervētas`,
  heading: `Jauns pasūtījums ${o.order}`,
  intro: [
    `Pasūtījums saņemts ${when("lv", o.at)}. Statuss — gaida apmaksu, preces ir rezervētas un no kataloga noņemtas.`,
  ],
});

const adminPaid = (o, m) => ({
  subject: `Apmaksāts pasūtījums ${o.order} — ${m.total}`,
  preheader: `${o.name} · ${m.total} · var sākt gatavot sūtījumu`,
  heading: `Pasūtījums ${o.order} ir apmaksāts`,
  intro: [
    `Maksājums saņemts ${when("lv", o.paidAt)}${o.paidOutside ? " (atzīmēts manuāli, ārpus Stripe)" : ""}. Preces katalogā atzīmētas kā pārdotas.`,
  ],
});

const sellerPaid = (o, m) => ({
  subject: `Apmaksāts pasūtījums ${o.order} — sagatavojiet preci nodošanai`,
  preheader: `Jums izmaksājamā summa — ${m.net}`,
  heading: `Pasūtījums ${o.order} ir apmaksāts`,
  intro: [
    `Labdien! Pircējs SOFA.LV veikalā ir apmaksājis pasūtījumu ${when("lv", o.paidAt)}. Preces jāsagatavo nodošanai.`,
    `Jums ar pircēju sazināties nav nepieciešams — piegādi organizē SOFA.LV.`,
  ],
  tailNote: `Kad prece ir nodota, atzīmējiet to savā kabinetā. No šī datuma sāk skaitīt izmaksas termiņu — ${holdDays()} dienas.`,
});

/* ── сборка ──────────────────────────────────────────────────── */

const deliveryLine = (lang, o, t) =>
  o.delivery === "courier"
    ? `${t.courier}${o.address ? ` — ${o.address}` : ""}`
    : t.pickup;

/**
 * Готовое письмо: тема, html и текстовая копия.
 * kind — buyer-new | buyer-paid | admin-new | admin-paid | seller-paid
 */
export function build(kind, order, extra = {}) {
  const forBuyer = kind.startsWith("buyer");
  const lang = forBuyer ? lang3(order.lang) : "lv";
  const t = L[lang];
  const m = {
    subtotal: money(lang, order.subtotal),
    shipping: money(lang, order.deliveryFee),
    total: money(lang, order.total),
    net: money("lv", (order.partnerNetCents || 0) / 100),
    commission: money("lv", (order.commissionCents || 0) / 100),
    reserveMin: extra.reserveMin || 30,
  };

  const fmt = (eur) => money(lang, eur);
  const rows = [];
  if (order.deliveryFee > 0) {
    rows.push([t.goods, m.subtotal, false]);
    rows.push([t.shipping, m.shipping, false]);
  }
  rows.push([t.total, m.total, true]);

  let head;
  let blocks = "";
  let cta = null;
  let footNote = "";

  if (kind === "buyer-new") {
    head = buyerNew[lang](order, t, m);
    blocks =
      head.intro.map(p).join("") +
      itemsTable({ items: order.items, rows, fmt }) +
      facts([
        [t.shipping, deliveryLine(lang, order, t)],
        [t.seller, sellerLine(lang, order)],
      ]) +
      note(head.tailNote);
    if (extra.payUrl) cta = { url: extra.payUrl, label: t.payButton };
    footNote = `${t.terms}: <a href="${TERMS}" style="color:#6b6257;">${TERMS}</a>`;
  } else if (kind === "buyer-paid") {
    head = buyerPaid[lang](order, t, m);
    blocks =
      head.intro.map(p).join("") +
      itemsTable({ items: order.items, rows, fmt }) +
      facts([
        [t.paidAt, when(lang, order.paidAt)],
        [t.shipping, deliveryLine(lang, order, t)],
        [t.seller, sellerLine(lang, order)],
      ]) +
      head.legal.map(note).join("");
    cta = { url: `${SITE}/#/legal/buyer`, label: t.terms };
    footNote = `${t.terms}: <a href="${TERMS}" style="color:#6b6257;">${TERMS}</a>`;
  } else if (kind === "admin-new" || kind === "admin-paid") {
    head = kind === "admin-new" ? adminNew(order, m) : adminPaid(order, m);
    const pairs = [
      [t.buyer, order.name],
      [t.contact, [order.contact, order.email].filter(Boolean).join(" · ")],
      [t.shipping, deliveryLine("lv", order, t)],
      [t.seller, order.sellerType === "partner" ? order.sellerName : "SOFA.LV"],
      [t.note, order.comment],
      ["Valoda", { lv: "latviešu", en: "angļu", ru: "krievu" }[lang3(order.lang)]],
    ];
    if (order.sellerType === "partner" && kind === "admin-paid") {
      pairs.push(["Komisija", `${m.commission} (${(order.commissionBps || 0) / 100} %)`]);
      pairs.push(["Partnerim", m.net]);
    }
    blocks =
      head.intro.map(p).join("") + itemsTable({ items: order.items, rows, fmt }) + facts(pairs);
    cta = { url: `${SITE}/#/admin`, label: t.openPanel };
  } else if (kind === "seller-paid") {
    head = sellerPaid(order, m);
    blocks =
      head.intro.map(p).join("") +
      itemsTable({
        items: order.items,
        fmt,
        rows: [
          ["Preču cena", m.subtotal, false],
          [`SOFA.LV komisija ${(order.commissionBps || 0) / 100} %`, `−${m.commission}`, false],
          ["Jums izmaksājam", m.net, true],
        ],
      }) +
      facts([
        ["Saņemšana", deliveryLine("lv", order, t)],
        ["Pircējs", order.name],
      ]) +
      note(head.tailNote);
    cta = { url: `${SITE}/#/admin`, label: "Atvērt kabinetu" };
  } else {
    throw new Error(`Неизвестное письмо: ${kind}`);
  }

  const { html, text } = layout({
    lang,
    preheader: head.preheader,
    heading: head.heading,
    blocks,
    cta,
    footNote,
  });

  return { subject: head.subject, html, text, lang };
}

export const KINDS = ["buyer-new", "buyer-paid", "admin-new", "admin-paid", "seller-paid"];

/**
 * Заявка от компании, которая хочет продавать через площадку.
 *
 * Письмо уходит владельцу: всё, что человек написал, — сразу перед
 * глазами, чтобы ответить можно было прямо из почты. Поэтому в поле
 * «ответить» ставим адрес заявителя.
 */
export function applicationLetter(app) {
  const t = L.lv;
  const rows = [
    ["Uzņēmums", app.company],
    ["Reģ. Nr.", app.regNr],
    ["Kontaktpersona", app.person],
    ["E-pasts", app.email],
    ["Tālrunis", app.phone],
    ["Ko pārdod", app.goods],
    ["Saite", app.link],
    ["Valoda", { lv: "latviešu", en: "angļu", ru: "krievu" }[lang3(app.lang)]],
  ];

  const blocks =
    p(`Jauns pieteikums kļūt par partneri — ${esc(app.company)}.`) +
    facts(rows) +
    (app.message ? note(`<b>Ziņa:</b><br>${esc(app.message).replace(/\n/g, "<br>")}`) : "") +
    note(`Saņemts ${when("lv", app.at)} · IP ${esc(app.ip || "—")}`);

  const { html, text } = layout({
    lang: "lv",
    preheader: `${app.company} · ${app.email}`,
    heading: "Pieteikums kļūt par partneri",
    blocks,
    cta: { url: `${SITE}/#/admin`, label: t.openPanel },
    footNote: "",
  });

  return { subject: `Pieteikums partnerim — ${app.company}`, html, text };
}
