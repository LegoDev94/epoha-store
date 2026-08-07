/**
 * EPOHA — сервер витрины: публичный API каталога + админка с импортом
 * товара по ссылке аукциона (фото и описание тянутся автоматически).
 *
 * ENV: PORT, ADMIN_PASSWORD, DATA_DIR
 */
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as connect from "./connect.js";
import * as settings from "./settings.js";
import * as legal from "./legal.js";
import { holdDays, orderMoney, payoutState, releaseDate, setHoldDays, toCents, toEur } from "./money.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOADS = path.join(DATA_DIR, "uploads");
const STORE = path.join(DATA_DIR, "store.json");
const ORDERS = path.join(DATA_DIR, "orders.json");
const SEED = path.join(ROOT, "data", "products.json");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "epoha2026";
const SECRET = process.env.SECRET || "epoha-secret-salt";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

fs.mkdirSync(UPLOADS, { recursive: true });
settings.init(DATA_DIR);
setHoldDays(() => settings.get("holdDays"));
if (!fs.existsSync(STORE)) {
  fs.copyFileSync(SEED, STORE);
  console.log("[epoha] store.json создан из сида");
}

/* ── хранилище ── */
const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = async (file, data) =>
  fsp.writeFile(file, JSON.stringify(data, null, 1), "utf8");

/* Вебхук Stripe и возврат покупателя на сайт приходят одновременно, а
   файл читается целиком и переписывается целиком — без очереди одна
   запись затрёт другую. Все изменения файла проходят через неё. */
const queues = new Map();
function withFile(file, fn) {
  const next = (queues.get(file) || Promise.resolve()).then(fn, fn);
  queues.set(
    file,
    next.catch(() => {})
  );
  return next;
}
/** Прочитать → изменить → записать под очередью. */
const updateJson = (file, fallback, mutate) =>
  withFile(file, async () => {
    const data = await readJson(file, fallback);
    const result = await mutate(data);
    await writeJson(file, data);
    return result;
  });

const loadProducts = () => readJson(STORE, []);
const saveProducts = (list) => writeJson(STORE, list);

/* У товаров, добавленных до появления дат, поля createdAt нет —
   проставляем один раз, сохраняя текущий порядок витрины. */
async function backfillDates() {
  const list = await loadProducts();
  if (!list.length || list.every((p) => p.createdAt)) return;
  const now = Date.now();
  list.forEach((p, i) => {
    if (!p.createdAt) p.createdAt = new Date(now - i * 60000).toISOString();
  });
  await saveProducts(list);
  console.log("[vm] проставлены даты добавления товаров");
}
backfillDates();

/* ── аккаунты: главный админ + продавцы маркетплейса ── */
const SELLERS = path.join(DATA_DIR, "sellers.json");
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || "admin";
const COMMISSION = () => settings.get("commission"); // процент площадки, меняется из панели

const loadSellers = () => readJson(SELLERS, []);
const saveSellers = (list) => writeJson(SELLERS, list);

const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");

/** Токен: подписанная полезная нагрузка с ролью и идентификатором. */
const makeToken = (role, id) => {
  const payload = Buffer.from(JSON.stringify({ r: role, i: id, t: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};
const readToken = (token) => {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expect = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (sig.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - data.t > 30 * 864e5) return null; // месяц
    return data;
  } catch {
    return null;
  }
};

const auth = async (req, res, next) => {
  const data = readToken(req.get("x-token"));
  if (!data) return res.status(401).json({ error: "unauthorized" });
  if (data.r === "admin") {
    req.actor = { role: "admin", id: null, name: "Администратор", commission: COMMISSION() };
    return next();
  }
  const seller = (await loadSellers()).find((x) => x.id === data.i && x.active !== false);
  if (!seller) return res.status(401).json({ error: "unauthorized" });
  req.actor = {
    role: "seller",
    id: seller.id,
    name: seller.name,
    commission: Number(seller.commission ?? COMMISSION()),
  };
  next();
};
const adminOnly = (req, res, next) =>
  req.actor?.role === "admin" ? next() : res.status(403).json({ error: "forbidden" });

/* ── журнал действий ──
   Кто, когда и что поменял. Дописывается построчно, чтобы запись
   нельзя было незаметно переписать. */
const AUDIT = path.join(DATA_DIR, "audit.log");

function logAction(req, action, target, before, after) {
  const actor = req?.actor || {};
  const line = JSON.stringify({
    at: new Date().toISOString(),
    actor: { role: actor.role || "?", id: actor.id || null, name: actor.name || "" },
    ip: legal.clientIp(req),
    action,
    target,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  });
  fsp.appendFile(AUDIT, line + "\n", "utf8").catch((e) => console.warn("[sofa] журнал:", e.message));
}

/** Последние записи журнала, при желании — по одному объекту. */
async function readAudit({ target = "", limit = 200 } = {}) {
  let text = "";
  try {
    text = await fsp.readFile(AUDIT, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (!target || r.target === target) rows.push(r);
    } catch {
      /* строка повреждена — пропускаем, остальные читаются */
    }
  }
  return rows.slice(-limit).reverse();
}

/** Доля площадки и чистая выручка продавца по одной сумме. */
const split = (gross, rate) => {
  const fee = Math.round(gross * rate) / 100;
  return { gross, rate, fee, net: Math.round((gross - fee) * 100) / 100 };
};

/* ── статус партнёра ──
   draft → анкета не заполнена; terms → условия не приняты;
   stripe → онбординг Stripe не завершён; review → ждёт проверки площадки;
   active → торгует; suspended → приостановлен. */
const REQUIRED_COMPANY = ["name", "regNr", "address", "phone", "email", "contactPerson"];

const companyReady = (s) => REQUIRED_COMPANY.every((f) => String(s.company?.[f] || "").trim());
const termsReady = (s) => Boolean(s.terms?.acceptedAt);
/* Готовность счёта: партнёр может принимать оплату и получать выплаты.
   details_submitted ставится только после формы Stripe, поэтому его
   достаточно как одного из признаков, а не как обязательного. */
const stripeReady = (s) =>
  Boolean(
    s.stripe?.chargesEnabled &&
      (s.stripe?.detailsSubmitted || s.stripe?.payoutsEnabled) &&
      (s.stripe?.mode || "live") === settings.mode()
  );

/** Шаг, на котором партнёр стоит сейчас. */
function partnerStage(s) {
  if (s.status === "suspended" || s.active === false) return "suspended";
  if (!companyReady(s)) return "draft";
  if (!termsReady(s)) return "terms";
  if (!stripeReady(s)) return "stripe";
  if (s.status !== "active") return "review";
  return "active";
}
/** Продавать можно только после проверки площадкой и готовности Stripe. */
const canSell = (s) => partnerStage(s) === "active";

/** Данные продавца, которые видит покупатель в карточке товара. */
const publicSeller = (s) => ({
  id: s.id,
  name: s.company?.name || s.name,
  regNr: s.company?.regNr || "",
  vatNr: s.company?.vatNr || "",
  address: s.company?.address || "",
  country: s.company?.country || "LV",
});

/* ── импорт товара по ссылке ── */
const meta = (html, attr, name) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] || "";
};

const CAT_RULES = [
  ["seating", /\b(sofa|soffa|settee|couch|armchair|arm chair|chair|fauteuil|bergere|berg\u00e8re|f\u00e5t\u00f6lj|bench|stool|ottoman|d\u012bv\u0101n|kr\u0113sl|диван|кресл|стул|банкетк)/gi],
  ["mirror", /\b(mirror|spegel|spogul|зеркал)/gi],
  ["light", /\b(chandelier|candelabra|candlestick|candle holder|pendant|lamp|lampa|lampett|sconce|ljuskrona|ljusstake|lustra|sveč|люстр|светильник|подсвечник|канделябр|бра)/gi],
  ["storage", /\b(chest of drawers|chest|commode|kommod|cabinet|cupboard|sideboard|drawer|byr\u00e5|dresser|bookcase|skapis|kumode|комод|шкаф|буфет)/gi],
  ["decor", /(bowl|vase|jar|plate|dish|tray|figurine|sculpture|statuette|porcelain|faience|ceramic|glass|crystal bowl|clock|painting|picture frame|skulptūra|vāze|šķīvis|keramika|porcelāns|ваза|чаша|блюдо|статуэтк|скульптур|фарфор|керамик|поднос|часы)/gi],
  ["table", /\b(table|bord|galds|desk|console|секретер|стол|столик)/gi],
];
/* Категорию выбираем по числу совпадений: заголовок весит втрое. */
const guessCat = (title, desc = "") => {
  let best = "seating";
  let top = 0;
  let bestAt = Infinity;
  for (const [cat, re] of CAT_RULES) {
    re.lastIndex = 0;
    const hits =
      (String(title).match(re) || []).length * 3 + (String(desc).match(re) || []).length;
    if (!hits) continue;
    re.lastIndex = 0;
    const at = re.exec(String(title))?.index ?? Infinity;
    /* При равном счёте побеждает слово, стоящее в названии раньше:
       «DINING TABLE AND CHAIRS» — это стол, а не стулья. */
    if (hits > top || (hits === top && at < bestAt)) {
      top = hits;
      bestAt = at;
      best = cat;
    }
  }
  return best;
};

async function downloadImage(url, base, i) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (url.match(/\.(jpe?g|png|webp)/i)?.[1] || "jpg").toLowerCase();
  const name = `${base}-${i}.${ext === "jpeg" ? "jpg" : ext}`;
  await fsp.writeFile(path.join(UPLOADS, name), buf);
  return `/uploads/${name}`;
}

async function importFromUrl(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Источник ответил ${res.status}`);
  const html = await res.text();
  const finalUrl = res.url || url;

  const title =
    meta(html, "property", "og:title") ||
    html.match(/<h1[^>]*>([^<]{3,200})<\/h1>/i)?.[1]?.trim() ||
    html.match(/<title>([^<]{3,200})<\/title>/i)?.[1]?.split(" - ")[0]?.trim() ||
    "";
  const desc =
    meta(html, "name", "description") || meta(html, "property", "og:description") || "";

  const srcId = Number(finalUrl.match(/(\d{6,})/)?.[1] || 0);
  const base = srcId || Date.now();

  /* Аукционные CDN-картинки (крупные версии), затем общий og:image */
  const found = new Set();
  const auction = [...html.matchAll(/https:\/\/images\.auctionet\.com\/thumbs\/(?:large|medium|small)_item_\d+_[a-f0-9]+\.(?:jpe?g|png)/gi)]
    .map((m) => m[0].replace(/\/(medium|small)_item_/, "/large_item_"));
  for (const u of auction) if (srcId ? u.includes(`_item_${srcId}_`) : true) found.add(u);
  if (found.size === 0) {
    const og = meta(html, "property", "og:image");
    if (og) found.add(og);
    for (const m of html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp))["']/gi)) {
      if (found.size < 6) found.add(m[1]);
    }
  }

  const images = [];
  let i = 1;
  for (const u of [...found].slice(0, 6)) {
    try {
      images.push(await downloadImage(u, base, i++));
    } catch {
      /* пропускаем недоступное изображение */
    }
  }

  const priceHint =
    Number(
      (
        html.match(/(?:&quot;|")amountValue(?:&quot;|")\s*:\s*(?:&quot;|")([\d\s]+)\s*EUR/i)?.[1] ||
        html.match(/(?:&quot;|")estimate(?:&quot;|")\s*:\s*(?:&quot;|")?([\d\s]+)/i)?.[1] ||
        ""
      ).replace(/\s/g, "")
    ) || null;

  /* Аукционные заголовки часто содержат всё описание — оставляем в
     названии первые фразы, остальное уводим в описание. */
  let shortTitle = title;
  let fullDesc = desc;
  if (title.length > 74) {
    const parts = title.match(/[^.!?]+[.!?]*/g) || [title];
    let head = "";
    let rest = "";
    for (const part of parts) {
      /* как только фраза ушла в описание, туда же идут и следующие —
         иначе хвост склеивается с началом и рвёт смысл */
      if (!rest && (head.length < 40 || head.length + part.length <= 74)) head += part;
      else rest += part;
    }
    shortTitle = head.trim();
    fullDesc = [rest.trim(), desc].filter(Boolean).join(" ");
  }

  return {
    id: srcId || Date.now(),
    source: finalUrl,
    images,
    cat: guessCat(shortTitle, fullDesc),
    priceHint,
    /* Исходник аукциона — английский; латышская и русская версии
       допереводятся автоматически при сохранении карточки. */
    tr: {
      lv: { title: "", era: "", desc: "" },
      en: { title: shortTitle, era: "", desc: fullDesc },
      ru: { title: "", era: "", desc: "" },
    },
  };
}

/* ── авто-перевод карточки (DeepSeek) ──
   Ключ живёт только в окружении сервера: DEEPSEEK_API_KEY. */
const LANG_NAME = { lv: "Latvian", en: "English", ru: "Russian" };

/** Достаёт первый полный JSON-объект: модель иногда добавляет
    markdown-обёртку или пояснение после ответа. */
function extractJson(raw) {
  const s = String(raw).replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    /* ищем сбалансированный объект, не считая скобки внутри строк */
  }
  const start = s.indexOf("{");
  if (start < 0) throw new Error("Модель вернула ответ без JSON");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) esc = false;
    else if (ch === "\\") esc = true;
    else if (ch === '"') inStr = !inStr;
    else if (!inStr && ch === "{") depth++;
    else if (!inStr && ch === "}" && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error("Не удалось разобрать ответ переводчика");
}

async function translateCard(src, from) {
  const key = settings.get("deepseekKey");
  if (!key) throw new Error("Ключ перевода не задан — задайте его в настройках площадки");
  const targets = ["lv", "en", "ru"].filter((l) => l !== from);
  const prompt = [
    `Translate a product card of a premium vintage furniture shop from ${LANG_NAME[from]}`,
    `into ${targets.map((l) => LANG_NAME[l]).join(" and ")}.`,
    "Keep the calm, expensive, editorial tone; keep proper names, styles (rococo, Gustavian, Biedermeier),",
    "measurements and centuries as they are. Do not invent facts, do not add commentary.",
    'Answer with strict JSON only: {"lv":{"title","era","desc"},"en":{"title","era","desc"},"ru":{"title","era","desc"}}.',
    `The ${LANG_NAME[from]} version must be returned unchanged.`,
    "",
    JSON.stringify({ [from]: src }),
  ].join("\n");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are a precise translator for an antique furniture catalogue. Reply with JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 1.1,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";
  const parsed = extractJson(raw);
  const norm = (o = {}) => ({
    title: String(o.title || "").trim(),
    era: String(o.era || "").trim(),
    desc: String(o.desc || "").trim(),
  });
  return { lv: norm(parsed.lv), en: norm(parsed.en), ru: norm(parsed.ru) };
}

/** Язык-источник: тот, где заполнено название (приоритет lv → en → ru). */
const pickSource = (tr) => ["lv", "en", "ru"].find((l) => (tr?.[l]?.title || "").trim());

/* ── сервер ── */
const app = express();
app.disable("x-powered-by");
/* Вебхуки Stripe подписывают СЫРОЕ тело запроса. Если его разберёт
   express.json(), до проверки подписи дойдёт уже объект, и всякая
   доставка будет отвергнута. Поэтому для этих адресов json не включаем. */
const WEBHOOK_PATHS = ["/api/stripe/webhook", "/api/stripe/webhook/connect"];
const jsonBody = express.json({ limit: "1mb" });
app.use((req, res, next) =>
  WEBHOOK_PATHS.includes(req.path) ? next() : jsonBody(req, res, next)
);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS),
    filename: (_req, file, cb) =>
      cb(null, `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${path.extname(file.originalname) || ".jpg"}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

/* Витрина показывает товар партнёра только когда партнёр проверен
   площадкой и его счёт Stripe готов принимать платежи. */
app.get("/api/products", async (_req, res) => {
  const [list, sellers] = await Promise.all([loadProducts(), loadSellers()]);
  const live = new Set(sellers.filter(canSell).map((s) => s.id));
  res.json(
    list
      .filter((p) => !p.hidden && !p.archived && (!p.sellerId || live.has(p.sellerId)))
      .map(({ reservedBy, reservedUntil, ...p }) => p)
  );
});

/** Юридические данные продавцов — показываются в карточке товара. */
app.get("/api/sellers", async (_req, res) => {
  const sellers = await loadSellers();
  res.json(sellers.filter(canSell).map(publicSeller));
});

/* Публикуемые документы площадки */
app.get("/api/legal", (_req, res) => res.json(legal.listDocs()));
app.get("/api/legal/:id", (req, res) => {
  try {
    const d = legal.loadDoc(req.params.id);
    res.json({ id: d.id, title: d.title, version: d.version, lang: d.lang, hash: d.hash, body: d.body });
  } catch {
    res.status(404).json({ error: "not found" });
  }
});
app.get("/api/platform", (_req, res) =>
  res.json({ ...legal.PLATFORM, commission: COMMISSION(), holdDays: holdDays(), deliveryFee: DELIVERY_FEE(), stripeMode: settings.mode() })
);

/* ── Заказ: сначала регистрируем, потом ведём на оплату ──
   Суммы считает сервер по своему каталогу — клиенту не доверяем. */
const DELIVERY_FEE = () => settings.get("deliveryFee");
const BASE_URL = process.env.BASE_URL || "http://72.62.112.227:8080";

async function notifyOwner(order) {
  const lines = order.items.map((i) => `• №${i.n} ${i.title} — €${i.price}`).join("\n");
  const text = [
    `НОВЫЙ ЗАКАЗ ${order.order}`,
    `${order.name} · ${order.contact}${order.email ? " · " + order.email : ""}`,
    order.delivery === "courier"
      ? `Доставка до дверей (+€${order.deliveryFee}): ${order.address}`
      : "Самовывоз со склада в Талси (бесплатно)",
    order.comment ? `Комментарий: ${order.comment}` : "",
    "",
    lines,
    `ИТОГО: €${order.total} · ${order.status === "paid" ? "оплачен" : "ожидает оплаты"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const tg = settings.get("telegramToken");
  const chat = settings.get("telegramChat");
  if (tg && chat) {
    try {
      await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
      });
    } catch (e) {
      console.warn("[vm] telegram:", String(e.message || e));
    }
  }
  const resend = settings.get("resendKey");
  const to = settings.get("orderEmail");
  if (resend && to) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resend}` },
        body: JSON.stringify({
          from: settings.get("orderFrom"),
          to,
          subject: `Заказ ${order.order} — €${order.total}`,
          text,
        }),
      });
    } catch (e) {
      console.warn("[vm] resend:", String(e.message || e));
    }
  }
  if (!tg && !resend) console.log("[vm] заказ (уведомления не настроены):\n" + text);
}

/** Партнёру пишем только об оплаченном заказе — до оплаты отгружать нечего. */
async function notifySeller(order) {
  if (!order.sellerId || order.status !== "paid") return;
  const seller = (await loadSellers()).find((s) => s.id === order.sellerId);
  const to = seller?.company?.email || seller?.contact || "";
  const resend = settings.get("resendKey");
  const text = [
    `Apmaksāts pasūtījums ${order.order} (sofa.lv)`,
    order.items.map((i) => `• №${i.n} ${i.title} — €${i.price}`).join("\n"),
    order.delivery === "courier"
      ? `Piegāde līdz durvīm (organizē sofa.lv): ${order.address}`
      : "Izņemšana Talsos",
    `Pircējs: ${order.name} · ${order.contact} · ${order.email}`,
    `Jums izmaksājamā summa: €${toEur(order.partnerNetCents)} (preces cena mīnus SOFA.LV komisija ${order.commissionBps / 100} %)`,
    `Izmaksa — ne agrāk kā ${holdDays()} dienas pēc preces nodošanas pircējam.`,
  ].join("\n");
  if (resend && to) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resend}` },
      body: JSON.stringify({
        from: settings.get("orderFrom"),
        to,
        subject: `sofa.lv · ${order.order}`,
        text,
      }),
    }).catch((e) => console.warn("[sofa] письмо партнёру:", String(e.message || e)));
  } else {
    console.log(`[sofa] партнёру ${to || order.sellerId} (почта не настроена):\n${text}`);
  }
}

/** Ссылка на оплату. Товар партнёра — direct charge на его аккаунт. */
async function stripeSession(order) {
  if (!connect.hasStripe()) return null;
  const sess = await connect.checkoutSession({
    order,
    account: order.stripeAccountId || null,
    applicationFeeCents: order.applicationFeeCents,
    successUrl: `${BASE_URL}/#/success/${order.order}?paid=1&s={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${BASE_URL}/#/checkout`,
    expiresAt: Math.floor(Date.now() / 1000) + RESERVE_MIN() * 60,
    locale: order.lang,
  });
  order.session = sess.id;
  return sess.url || null;
}

/* ── резерв товара ──
   Предметы штучные: пока покупатель платит, товар держим за ним,
   иначе двое оплатят один и тот же диван. */
const RESERVE_MIN = () => settings.get("reserveMinutes");
const reservedByOther = (p, orderId, now = Date.now()) =>
  Boolean(p.reservedUntil && Date.parse(p.reservedUntil) > now && p.reservedBy && p.reservedBy !== orderId);

const reserveItems = (ids, orderId) =>
  updateJson(STORE, [], (list) => {
    const until = new Date(Date.now() + RESERVE_MIN() * 60000).toISOString();
    for (const p of list) if (ids.includes(p.id)) { p.reservedBy = orderId; p.reservedUntil = until; }
  });

const releaseItems = (ids, { sold = false } = {}) =>
  updateJson(STORE, [], (list) => {
    for (const p of list)
      if (ids.includes(p.id)) {
        delete p.reservedBy;
        delete p.reservedUntil;
        if (sold) p.sold = true;
      }
  });

/** Номер заказа: сквозной счётчик, а не обрезанное время (оно повторяется). */
const nextOrderNumber = (orders) => {
  const max = orders.reduce((m, o) => {
    const n = Number(String(o.order || "").replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  return `VM-${max + 1}`;
};

app.post("/api/orders", async (req, res) => {
  try {
    const b = req.body || {};
    const catalog = await loadProducts();
    const picked = (Array.isArray(b.items) ? b.items : [])
      .map((id) => catalog.find((p) => p.id === Number(id)))
      .filter(Boolean);

    if (!picked.length) return res.status(400).json({ error: "Grozs ir tukšs" });
    if (!String(b.name || "").trim() || !String(b.contact || "").trim())
      return res.status(400).json({ error: "Nepieciešams vārds un kontakts" });
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(b.email || "").trim()))
      return res.status(400).json({ error: "Nepieciešams derīgs e-pasts" });

    const delivery = b.delivery === "courier" ? "courier" : "pickup";
    if (delivery === "courier" && !String(b.address || "").trim())
      return res.status(400).json({ error: "Nepieciešama piegādes adrese" });

    /* Один заказ — один продавец: платёж уходит на один счёт. */
    const sellerIds = [...new Set(picked.map((p) => p.sellerId || "shop"))];
    if (sellerIds.length > 1)
      return res.status(409).json({ error: "MIXED_CART", sellers: sellerIds });

    const sellersList = await loadSellers();
    const sellerId = sellerIds[0] === "shop" ? null : sellerIds[0];
    const seller = sellerId ? sellersList.find((s) => s.id === sellerId) : null;
    if (sellerId && !seller) return res.status(409).json({ error: "Pārdevējs nav pieejams" });
    if (seller && !canSell(seller))
      return res.status(409).json({ error: "Šī pārdevēja preces pagaidām nav pieejamas" });

    /* Товар мог быть продан или занят другим покупателем, пока висела корзина */
    const sold = picked.find((p) => p.sold);
    if (sold) return res.status(409).json({ error: "ITEM_SOLD", item: sold.id });
    const busy = picked.find((p) => reservedByOther(p, null));
    if (busy) return res.status(409).json({ error: "ITEM_RESERVED", item: busy.id });

    const items = picked.map((p) => ({
      id: p.id,
      n: p.n,
      cents: toCents(p.price),
      price: Number(p.price) || 0,
      title: p.tr?.lv?.title || p.tr?.en?.title || `#${p.id}`,
      img: p.images?.[0] || "",
      sellerId: p.sellerId || null,
    }));

    const money = orderMoney({
      itemsCents: items.reduce((s, i) => s + i.cents, 0),
      shippingCents: delivery === "courier" ? toCents(DELIVERY_FEE()) : 0,
      commissionBps: Math.round(Number(seller?.commission ?? COMMISSION()) * 100),
      partner: Boolean(seller),
    });

    const id = crypto.randomUUID();
    const order = {
      id,
      at: new Date().toISOString(),
      status: "new",
      /* В песочнице деньги ненастоящие — помечаем, чтобы не путать в отчётах */
      mode: settings.mode(),
      items,
      ...money,
      /* суммы в евро — для писем и панели */
      subtotal: toEur(money.itemsCents),
      deliveryFee: toEur(money.shippingCents),
      total: toEur(money.chargeCents),
      sellerId,
      sellerName: seller?.company?.name || seller?.name || "",
      sellerType: seller ? "partner" : "shop",
      stripeAccountId: seller?.stripe?.accountId || null,
      delivery,
      name: String(b.name).trim(),
      contact: String(b.contact).trim(),
      email: String(b.email || "").trim(),
      address: String(b.address || "").trim(),
      comment: String(b.comment || "").trim(),
      lang: b.lang || "lv",
    };

    await updateJson(ORDERS, [], (list) => {
      order.order = nextOrderNumber(list);
      list.unshift(order);
    });
    await reserveItems(items.map((i) => i.id), id);
    notifyOwner(order);

    let payUrl = null;
    let payError = "";
    if (b.pay) {
      try {
        payUrl = await stripeSession(order);
        if (!payUrl) payError = "no-stripe";
        else await updateJson(ORDERS, [], (list) => {
          const o = list.find((x) => x.id === id);
          if (o) o.session = order.session;
        });
      } catch (e) {
        payError = String(e.message || e);
        console.warn("[sofa] stripe:", payError);
      }
    }
    res.json({ order: order.order, total: order.total, payUrl, payError });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* ── отметка оплаты ──
   Вебхук и возврат покупателя на сайт приходят одновременно, поэтому
   отметку делает одна идемпотентная функция под очередью записи. */
async function markPaid(match, info = {}) {
  const changed = await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => (match.id ? x.id === match.id : x.order === match.order));
    if (!o || o.status === "paid" || o.status === "done") return null;
    o.status = "paid";
    o.paidAt = new Date().toISOString();
    o.session = info.session || o.session || "";
    o.paymentIntent = info.paymentIntent || o.paymentIntent || "";
    o.charge = info.charge || o.charge || "";
    if (info.stripeFeeCents) o.stripeFeeCents = info.stripeFeeCents;
    if (info.applicationFeeCents) o.applicationFeeActualCents = info.applicationFeeCents;
    return { ...o };
  });
  if (changed) {
    await releaseItems(changed.items.map((i) => i.id), { sold: true });
    notifyOwner(changed);
    notifySeller(changed).catch(() => {});
  }
  return changed;
}

/** Заказ отменён/просрочен: снимаем резерв, товар снова в продаже. */
async function closeOrder(match, status) {
  const changed = await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => (match.id ? x.id === match.id : x.order === match.order));
    if (!o || o.status === "paid" || o.status === "done") return null;
    o.status = status;
    return { ...o };
  });
  if (changed) await releaseItems(changed.items.map((i) => i.id));
  return changed;
}

/* Возврат из Stripe: сверяем сессию напрямую с их API — клиенту не
   доверяем, статус ставим только по ответу Stripe. */
app.post("/api/orders/:num/confirm", async (req, res) => {
  try {
    const sid = String(req.body?.session || "").trim();
    if (!connect.hasStripe() || !/^cs_/.test(sid)) return res.status(400).json({ error: "no session" });

    const num = req.params.num;
    const order = (await readJson(ORDERS, [])).find((o) => o.order === num);
    if (!order) return res.status(404).json({ error: "order not found" });

    const sess = await connect.getSession(sid, order.stripeAccountId);
    if (sess?.metadata?.order_id !== order.id && sess?.metadata?.order !== num)
      return res.status(400).json({ error: "order mismatch" });

    const paid = sess.payment_status === "paid";
    if (paid) await markPaid({ id: order.id }, sessionMoney(sess));
    res.json({ paid });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Фактические суммы из оплаченной сессии (комиссия Stripe, id платежа). */
function sessionMoney(sess) {
  const pi = typeof sess.payment_intent === "object" ? sess.payment_intent : null;
  const ch = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const bt = ch && typeof ch.balance_transaction === "object" ? ch.balance_transaction : null;
  return {
    session: sess.id,
    paymentIntent: pi?.id || (typeof sess.payment_intent === "string" ? sess.payment_intent : ""),
    charge: ch?.id || "",
    stripeFeeCents: bt?.fee || 0,
    applicationFeeCents: typeof ch?.application_fee_amount === "number" ? ch.application_fee_amount : 0,
  };
}

/* ── вебхуки Stripe ──
   Два адреса: события площадки и события аккаунтов партнёров (у каждого
   свой секрет). Подпись обязательна: без неё пометить заказ оплаченным
   мог бы кто угодно. */
const EVENTS = path.join(DATA_DIR, "events.json");

/** Уже обработанное событие второй раз не проводим. */
const seenEvent = (id) =>
  updateJson(EVENTS, { ids: [] }, (data) => {
    if (data.ids.includes(id)) return true;
    data.ids.push(id);
    if (data.ids.length > 5000) data.ids.splice(0, data.ids.length - 5000);
    return false;
  });

const findOrder = async (obj) => {
  const list = await readJson(ORDERS, []);
  const md = obj?.metadata || {};
  return (
    list.find((o) => o.id === md.order_id) ||
    list.find((o) => o.id === obj?.client_reference_id) ||
    list.find((o) => o.order === md.order_number || o.order === md.order) ||
    (obj?.payment_intent && list.find((o) => o.paymentIntent === obj.payment_intent)) ||
    (obj?.id && list.find((o) => o.session === obj.id || o.paymentIntent === obj.id || o.charge === obj.id)) ||
    (obj?.charge && list.find((o) => o.charge === obj.charge)) ||
    null
  );
};

async function handleEvent(event) {
  const obj = event.data?.object || {};
  const type = event.type;

  if (type === "account.updated" && event.account) {
    await updateJson(SELLERS, [], (list) => {
      const s = list.find((x) => x.stripe?.accountId === event.account);
      if (s) s.stripe = { ...s.stripe, ...connect.accountState(obj) };
    });
    return;
  }
  if (type === "account.application.deauthorized" && event.account) {
    await updateJson(SELLERS, [], (list) => {
      const s = list.find((x) => x.stripe?.accountId === event.account);
      if (s) {
        s.status = "suspended";
        s.stripe = { ...s.stripe, chargesEnabled: false, payoutsEnabled: false, disabledReason: "deauthorized" };
      }
    });
    return;
  }

  const order = await findOrder(obj);
  if (!order) {
    if (/checkout|payment_intent|charge|refund/.test(type))
      console.warn(`[sofa] вебхук ${type} без заказа:`, obj.id);
    return;
  }
  /* Событие партнёрского аккаунта должно относиться к его же заказу */
  if (event.account && order.stripeAccountId && event.account !== order.stripeAccountId) {
    console.warn(`[sofa] вебхук ${type}: чужой аккаунт ${event.account} для ${order.order}`);
    return;
  }

  switch (type) {
    case "checkout.session.completed":
      if (obj.payment_status === "paid") await markPaid({ id: order.id }, sessionMoney(obj));
      break;
    case "payment_intent.succeeded":
      await markPaid({ id: order.id }, { paymentIntent: obj.id, charge: obj.latest_charge || "" });
      break;
    case "checkout.session.expired":
      await closeOrder({ id: order.id }, "expired");
      break;
    case "charge.refunded": {
      const full = (obj.amount_refunded || 0) >= (obj.amount || 0);
      await updateJson(ORDERS, [], (list) => {
        const o = list.find((x) => x.id === order.id);
        if (!o) return;
        o.refundedCents = obj.amount_refunded || 0;
        o.refundedAt = new Date().toISOString();
        if (full) o.status = "cancelled";
      });
      if (full) await freeOrderItems(order);
      break;
    }
    case "payout.paid":
    case "payout.failed":
      /* Выплата дошла до банка партнёра или не дошла — сохраняем причину */
      await updateJson(ORDERS, [], (list) => {
        for (const o of list)
          if (o.payoutId === obj.id) {
            o.payoutStatus = obj.status;
            o.payoutArrival = obj.arrival_date || null;
            o.payoutError = obj.failure_message || "";
          }
      });
      if (type === "payout.failed") console.warn(`[sofa] выплата не прошла: ${obj.id} ${obj.failure_code}`);
      break;
    case "charge.dispute.created":
      await updateJson(ORDERS, [], (list) => {
        const o = list.find((x) => x.id === order.id);
        if (o) { o.disputeAt = new Date().toISOString(); o.disputeId = obj.id; }
      });
      console.warn(`[sofa] СПОР по заказу ${order.order}: ${obj.reason}`);
      break;
    case "charge.dispute.closed":
      await updateJson(ORDERS, [], (list) => {
        const o = list.find((x) => x.id === order.id);
        if (o) { o.disputeClosedAt = new Date().toISOString(); o.disputeStatus = obj.status; }
      });
      break;
    default:
      break;
  }
}

function webhookRoute(path_, which) {
  app.post(path_, express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const secret = which === "connect" ? settings.connectWebhookSecret() : settings.webhookSecret();
      if (!secret) {
        console.warn(`[sofa] секрет вебхука (${which}, режим ${settings.mode()}) не задан — отклонено`);
        return res.status(500).send("webhook secret missing");
      }
      const event = connect.verifySignature({
        raw: req.body.toString("utf8"),
        header: req.get("stripe-signature"),
        secret,
      });
      /* Отвечаем сразу: Stripe ждёт 200 и повторяет доставку три дня. */
      res.json({ received: true });
      if (await seenEvent(event.id)) return;
      await handleEvent(event).catch((e) => console.warn("[sofa] вебхук:", String(e.message || e)));
    } catch (e) {
      res.status(400).send(String(e.message || e));
    }
  });
}
webhookRoute("/api/stripe/webhook", "platform");
webhookRoute("/api/stripe/webhook/connect", "connect");

/* Последний отказ Stripe Connect: партнёру показываем мягко, владельцу —
   с точной инструкцией, что нажать в дашборде. */
let connectBlock = null;

/* ── кабинет партнёра ─────────────────────────────────────────────
   Партнёр проходит четыре шага: анкета → договор → Stripe → проверка. */

const sellerSelf = (req, res, next) =>
  req.actor?.role === "seller" ? next() : res.status(403).json({ error: "только для партнёра" });

/** Карточка партнёра для его собственного кабинета. */
const partnerView = (s) => ({
  id: s.id,
  login: s.login,
  name: s.name,
  commission: Number(s.commission ?? COMMISSION()),
  stage: partnerStage(s),
  status: s.status || "draft",
  company: s.company || {},
  terms: s.terms
    ? {
        version: s.terms.termsVersion,
        title: s.terms.termsTitle,
        acceptedAt: s.terms.acceptedAt,
        sha256: s.terms.termsSha256,
        representative: s.terms.representativeName,
      }
    : null,
  stripe: s.stripe || null,
  holdDays: holdDays(),
});

app.get("/api/partner/me", auth, sellerSelf, async (req, res) => {
  const s = (await loadSellers()).find((x) => x.id === req.actor.id);
  if (!s) return res.status(404).json({ error: "not found" });
  res.json(partnerView(s));
});

/** Анкета компании. Пока не принят договор — данные можно править. */
app.post("/api/partner/company", auth, sellerSelf, async (req, res) => {
  const b = req.body?.company || {};
  const text = (v, max = 200) => String(v || "").trim().slice(0, max);
  const company = {
    name: text(b.name),
    form: b.form === "individual" ? "individual" : "company",
    regNr: text(b.regNr, 40),
    vatNr: text(b.vatNr, 40),
    address: text(b.address),
    actualAddress: text(b.actualAddress),
    country: text(b.country, 2).toUpperCase() || "LV",
    phone: text(b.phone, 40),
    email: text(b.email, 120),
    contactPerson: text(b.contactPerson),
    contactPosition: text(b.contactPosition),
    iban: text(b.iban, 42).replace(/\s+/g, ""),
    goodsOrigin: text(b.goodsOrigin, 1000),
    legalGoods: Boolean(b.legalGoods),
  };
  if (!company.name || !company.regNr)
    return res.status(400).json({ error: "Nepieciešams nosaukums un reģistrācijas numurs" });
  if (!company.legalGoods)
    return res.status(400).json({ error: "Nepieciešams apliecinājums par preču likumīgu izcelsmi" });

  const out = await updateJson(SELLERS, [], (list) => {
    const s = list.find((x) => x.id === req.actor.id);
    if (!s) return null;
    /* После принятия условий реквизиты меняет только площадка */
    if (s.terms?.acceptedAt) {
      s.company = { ...s.company, phone: company.phone, email: company.email, contactPerson: company.contactPerson, contactPosition: company.contactPosition, actualAddress: company.actualAddress, goodsOrigin: company.goodsOrigin };
    } else {
      s.company = company;
    }
    if (!s.status || s.status === "draft") s.status = "draft";
    return partnerView(s);
  });
  if (!out) return res.status(404).json({ error: "not found" });
  res.json(out);
});

/** Принятие условий: сохраняем всё, чем позже доказывается факт договора. */
app.post("/api/partner/terms", auth, sellerSelf, async (req, res) => {
  if (req.body?.accepted !== true)
    return res.status(400).json({ error: "Lai turpinātu, ir jāapstiprina noteikumi" });

  const sellers = await loadSellers();
  const seller = sellers.find((x) => x.id === req.actor.id);
  if (!seller) return res.status(404).json({ error: "not found" });
  if (!companyReady(seller)) return res.status(400).json({ error: "Vispirms aizpildiet uzņēmuma datus" });
  if (seller.terms?.acceptedAt) return res.json(partnerView(seller));

  const record = legal.acceptanceRecord({
    req,
    seller,
    representative: {
      name: String(req.body?.representative?.name || seller.company?.contactPerson || "").slice(0, 120),
      email: String(req.body?.representative?.email || seller.company?.email || "").slice(0, 120),
      position: String(req.body?.representative?.position || seller.company?.contactPosition || "").slice(0, 120),
    },
  });

  const out = await updateJson(SELLERS, [], (list) => {
    const s = list.find((x) => x.id === req.actor.id);
    if (!s || s.terms?.acceptedAt) return s ? partnerView(s) : null;
    s.terms = record;
    s.status = "onboarding";
    return partnerView(s);
  });
  res.json(out);
  sendTermsCopy(seller, record).catch((e) => console.warn("[sofa] копия договора:", String(e.message || e)));
});

/** PDF с принятыми условиями — партнёру и в архив площадки. */
async function termsPdf(sellerId) {
  const s = (await loadSellers()).find((x) => x.id === sellerId);
  if (!s?.terms?.acceptedAt) throw new Error("noteikumi nav apstiprināti");
  return { seller: s, pdf: await legal.acceptancePdf({ acceptance: s.terms, seller: s }) };
}

app.get("/api/partner/terms.pdf", auth, sellerSelf, async (req, res) => {
  try {
    const { pdf } = await termsPdf(req.actor.id);
    res.type("application/pdf").set("Content-Disposition", 'attachment; filename="sofa-lv-partneru-noteikumi.pdf"').send(pdf);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});
app.get("/api/admin/sellers/:id/terms.pdf", auth, adminOnly, async (req, res) => {
  try {
    const { pdf } = await termsPdf(req.params.id);
    res.type("application/pdf").send(pdf);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Письмо партнёру с копией принятых условий. */
async function sendTermsCopy(seller, record) {
  const to = record.representativeEmail || seller.company?.email;
  const resend = settings.get("resendKey");
  const body = [
    "Jūs esat apstiprinājis SOFA.LV Partneru sadarbības noteikumus.",
    `Līguma versija: ${record.termsVersion}`,
    `Apstiprināšanas datums un laiks: ${new Date(record.acceptedAt).toLocaleString("lv-LV", { timeZone: "Europe/Riga" })}`,
    `Partneris: ${record.companyName}, reģ. Nr. ${record.registrationNumber}`,
    `SIA "RANČO GOBAS": ${legal.PLATFORM.regNr}`,
    `Dokumenta SHA-256: ${record.termsSha256}`,
    "Pielikumā: PDF kopija ar apstiprinātajiem noteikumiem.",
  ].join("\n");
  if (!resend || !to) {
    console.log(`[sofa] копия договора для ${to || seller.id} (почта не настроена):\n${body}`);
    return;
  }
  const pdf = await legal.acceptancePdf({ acceptance: record, seller });
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resend}` },
    body: JSON.stringify({
      from: settings.get("orderFrom"),
      to,
      subject: "SOFA.LV — apstiprinātie sadarbības noteikumi",
      text: body,
      attachments: [{ filename: "sofa-lv-partneru-noteikumi.pdf", content: pdf.toString("base64") }],
    }),
  });
}

/* ── Stripe Connect в кабинете партнёра ── */

/** Создаёт при необходимости connected account и выдаёт ссылку онбординга. */
app.post("/api/partner/stripe/link", auth, sellerSelf, async (req, res) => {
  try {
    const sellers = await loadSellers();
    const seller = sellers.find((x) => x.id === req.actor.id);
    if (!seller) return res.status(404).json({ error: "not found" });
    if (!seller.terms?.acceptedAt)
      return res.status(400).json({ error: "Vispirms apstipriniet sadarbības noteikumus" });

    let accountId = seller.stripe?.accountId;
    if (!accountId) {
      const acct = await connect.createAccount(seller, { site: BASE_URL });
      accountId = acct.id;
      await updateJson(SELLERS, [], (list) => {
        const s = list.find((x) => x.id === seller.id);
        if (s) s.stripe = { ...connect.accountState(acct), mode: settings.mode() };
      });
    }
    const link = await connect.accountLink(accountId, {
      refreshUrl: `${BASE_URL}/#/admin?stripe=refresh`,
      returnUrl: `${BASE_URL}/#/admin?stripe=done`,
    });
    res.json({ url: link.url, expiresAt: link.expires_at, accountId });
  } catch (e) {
    /* Партнёру — человеческое объяснение, в журнал — что делать владельцу */
    const said = connect.explain(e);
    if (said.admin !== said.partner) {
      connectBlock = { at: new Date().toISOString(), mode: settings.mode(), admin: said.admin, raw: String(e.message || e) };
      console.warn("[sofa] Stripe Connect:", said.admin);
    }
    res.status(400).json({ error: said.partner, admin: said.admin });
  }
});

/** Свежий статус аккаунта из Stripe. */
async function syncSeller(sellerId) {
  const sellers = await loadSellers();
  const seller = sellers.find((x) => x.id === sellerId);
  if (!seller?.stripe?.accountId) return null;
  const acct = await connect.getAccount(seller.stripe.accountId);
  return updateJson(SELLERS, [], (list) => {
    const s = list.find((x) => x.id === sellerId);
    if (!s) return null;
    s.stripe = { ...s.stripe, ...connect.accountState(acct) };
    /* Партнёр завершил онбординг — отправляем на проверку площадке */
    if (s.status === "onboarding" && stripeReady(s)) s.status = "review";
    return partnerView(s);
  });
}

app.post("/api/partner/stripe/sync", auth, sellerSelf, async (req, res) => {
  try {
    const out = await syncSeller(req.actor.id);
    res.json(out || { error: "nav Stripe konta" });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Вход в панель Stripe партнёра (выплаты, документы, споры). */
app.get("/api/partner/stripe/dashboard", auth, sellerSelf, async (req, res) => {
  try {
    const s = (await loadSellers()).find((x) => x.id === req.actor.id);
    if (!s?.stripe?.accountId) return res.status(400).json({ error: "nav Stripe konta" });
    const link = await connect.loginLink(s.stripe.accountId);
    res.json({ url: link.url });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/* ── деньги партнёра: удержано / доступно / выплачено ── */

/** Разбор всех заказов продавца по состоянию выплаты. */
async function payoutSummary(sellerId) {
  const orders = (await readJson(ORDERS, [])).filter((o) => o.sellerId === sellerId);
  const buckets = { held: 0, available: 0, paid: 0, pending: 0, refunded: 0, disputed: 0 };
  const rows = orders.map((o) => {
    const state = payoutState(o);
    const net = o.partnerNetCents || 0;
    if (buckets[state] !== undefined) buckets[state] += net;
    return {
      order: o.order,
      at: o.at,
      status: o.status,
      state,
      deliveredAt: o.deliveredAt || null,
      releaseAt: releaseDate(o.deliveredAt),
      payoutAt: o.payoutAt || null,
      grossCents: o.chargeCents || 0,
      commissionCents: o.commissionCents || 0,
      feeCents: o.applicationFeeCents || 0,
      stripeFeeCents: o.stripeFeeCents || o.stripeFeeEstimateCents || 0,
      netCents: net,
      items: (o.items || []).map((i) => ({ n: i.n, title: i.title, img: i.img, price: i.price })),
    };
  });
  return { buckets, rows };
}

/** Партнёр отмечает передачу товара — отсчёт до выплаты идёт с этого дня. */
app.post("/api/partner/orders/:num/delivered", auth, sellerSelf, async (req, res) => {
  const out = await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => x.order === req.params.num);
    if (!o) return null;
    if (o.sellerId !== req.actor.id) return { forbidden: true };
    if (o.status !== "paid" && o.status !== "done") return { notPaid: true };
    o.deliveredAt = o.deliveredAt || new Date().toISOString();
    o.deliveredBy = "partner";
    return { order: { ...o, releaseAt: releaseDate(o.deliveredAt), payoutState: payoutState(o) } };
  });
  if (!out) return res.status(404).json({ error: "not found" });
  if (out.forbidden) return res.status(403).json({ error: "Cits pārdevējs" });
  if (out.notPaid) return res.status(400).json({ error: "Pasūtījums vēl nav apmaksāts" });
  logAction(req, "order.delivered", `order:${req.params.num}`, undefined, "partner");
  res.json(out.order);
});

app.get("/api/partner/payouts", auth, sellerSelf, async (req, res) => {
  const s = (await loadSellers()).find((x) => x.id === req.actor.id);
  const { buckets, rows } = await payoutSummary(req.actor.id);
  let balance = null;
  if (s?.stripe?.accountId && connect.hasStripe()) {
    try {
      const b = await connect.balance(s.stripe.accountId);
      balance = { available: connect.availableCents(b), pending: connect.pendingCents(b) };
    } catch (e) {
      balance = { error: String(e.message || e) };
    }
  }
  res.json({ holdDays: holdDays(), buckets, rows, balance });
});

/* ── настройки площадки ── */
app.get("/api/admin/settings", auth, adminOnly, (_req, res) =>
  res.json({ values: settings.forPanel(), health: settings.health() })
);

app.post("/api/admin/settings", auth, adminOnly, async (req, res) => {
  try {
    let values = await settings.save(req.body || {});
    /* Секреты в журнал не попадают — только имена изменённых полей */
    logAction(req, "settings.save", "settings", Object.keys(req.body || {}).join(","), undefined);

    /* Включили песочницу — сами заводим в ней вебхуки, чтобы владельцу
       не пришлось повторять руками то, что уже сделано для боевого режима. */
    if (settings.isTest() && settings.get("stripeTestSecret")) {
      const patch = {};
      try {
        if (!settings.get("stripeTestWebhook")) {
          const w = await connect.createWebhookEndpoint({
            url: `${BASE_URL}/api/stripe/webhook`,
            events: connect.PLATFORM_EVENTS,
            description: "sofa.lv sandbox (platforma)",
          });
          patch.stripeTestWebhook = w.secret;
        }
        if (!settings.get("stripeTestConnectWebhook")) {
          const w = await connect.createWebhookEndpoint({
            url: `${BASE_URL}/api/stripe/webhook/connect`,
            events: connect.CONNECT_EVENTS,
            connect: true,
            description: "sofa.lv sandbox (partneru konti)",
          });
          patch.stripeTestConnectWebhook = w.secret;
        }
        if (Object.keys(patch).length) {
          values = await settings.save(patch);
          console.log("[sofa] вебхуки песочницы созданы:", Object.keys(patch).join(", "));
        }
      } catch (e) {
        console.warn("[sofa] вебхуки песочницы:", String(e.message || e));
      }
    }
    res.json({ values, health: settings.health() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get("/api/admin/health", auth, adminOnly, (_req, res) =>
  res.json({
    ...settings.health(),
    /* Отказ считаем актуальным, пока режим не сменили */
    connectBlock: connectBlock && connectBlock.mode === settings.mode() ? connectBlock : null,
  })
);

/** Проверка Connect по кнопке: создаём и сразу удаляем пробный счёт. */
app.post("/api/admin/connect/check", auth, adminOnly, async (_req, res) => {
  if (!connect.hasStripe())
    return res.json({ ready: false, admin: "Ключ Stripe для текущего режима не задан" });
  try {
    const acct = await connect.createAccount(
      { id: "check", name: "SOFA.LV check", company: { name: "SOFA.LV check", email: "connect-check@sofa.lv" } },
      { site: BASE_URL }
    );
    await connect.deleteAccount(acct.id).catch(() => {});
    connectBlock = null;
    res.json({ ready: true, mode: settings.mode() });
  } catch (e) {
    const said = connect.explain(e);
    connectBlock = { at: new Date().toISOString(), mode: settings.mode(), admin: said.admin, raw: String(e.message || e) };
    res.json({ ready: false, admin: said.admin, raw: connectBlock.raw, mode: settings.mode() });
  }
});

/** Проверка канала уведомлений: отправляем себе тестовое сообщение. */
app.post("/api/admin/settings/test-notify", auth, adminOnly, async (req, res) => {
  const kind = req.body?.kind === "email" ? "email" : "telegram";
  const text = "SOFA.LV: проверка уведомлений. Если вы это читаете — канал работает.";
  try {
    if (kind === "telegram") {
      const token = settings.get("telegramToken");
      const chat = settings.get("telegramChat");
      if (!token || !chat) return res.status(400).json({ error: "Не заданы токен бота и chat id" });
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
      });
      const d = await r.json();
      if (!d.ok) return res.status(400).json({ error: d.description || "Telegram отказал" });
    } else {
      const key = settings.get("resendKey");
      const to = settings.get("orderEmail");
      if (!key || !to) return res.status(400).json({ error: "Не заданы ключ Resend и адрес для заказов" });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ from: settings.get("orderFrom"), to, subject: "SOFA.LV — проверка", text }),
      });
      const d = await r.json();
      if (d.error) return res.status(400).json({ error: d.error.message || "Resend отказал" });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get("/api/admin/audit", auth, adminOnly, async (req, res) =>
  res.json(await readAudit({ target: String(req.query.target || ""), limit: Number(req.query.limit || 200) }))
);

/* ── заказ: правка, заметки, отправка, ссылка на оплату ── */

/** Отменённый или удалённый заказ возвращает предметы на витрину. */
const freeOrderItems = (order) =>
  order?.items?.length ? releaseItems(order.items.map((i) => i.id)) : Promise.resolve();

app.patch("/api/admin/orders/:num", auth, adminOnly, async (req, res) => {
  const b = req.body || {};
  const text = (v, max = 300) => String(v ?? "").trim().slice(0, max);
  const out = await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => x.order === req.params.num);
    if (!o) return null;
    const before = { name: o.name, contact: o.contact, email: o.email, address: o.address, delivery: o.delivery };
    if (b.name !== undefined) o.name = text(b.name, 120);
    if (b.contact !== undefined) o.contact = text(b.contact, 60);
    if (b.email !== undefined) o.email = text(b.email, 120);
    if (b.address !== undefined) o.address = text(b.address);
    if (b.comment !== undefined) o.comment = text(b.comment, 1000);
    if (b.delivery === "pickup" || b.delivery === "courier") o.delivery = b.delivery;
    o.editedAt = new Date().toISOString();
    return { order: { ...o }, before };
  });
  if (!out) return res.status(404).json({ error: "not found" });
  logAction(req, "order.edit", `order:${req.params.num}`, out.before, {
    name: out.order.name, contact: out.order.contact, email: out.order.email,
    address: out.order.address, delivery: out.order.delivery,
  });
  res.json(out.order);
});

/** Короткие заметки по заказу — только для площадки. */
app.post("/api/admin/orders/:num/notes", auth, adminOnly, async (req, res) => {
  const text = String(req.body?.text || "").trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: "Пустая заметка" });
  const out = await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => x.order === req.params.num);
    if (!o) return null;
    o.notes = [...(o.notes || []), { at: new Date().toISOString(), by: req.actor.name, text }];
    return { ...o };
  });
  if (!out) return res.status(404).json({ error: "not found" });
  logAction(req, "order.note", `order:${req.params.num}`, undefined, text.slice(0, 80));
  res.json(out);
});

/** Перевозчик и трек-номер: покупатель спрашивает «где заказ». */
app.post("/api/admin/orders/:num/shipping", auth, adminOnly, async (req, res) => {
  const b = req.body || {};
  const out = await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => x.order === req.params.num);
    if (!o) return null;
    o.shipping = {
      carrier: String(b.carrier || "").trim().slice(0, 40),
      tracking: String(b.tracking || "").trim().slice(0, 60),
      url: String(b.url || "").trim().slice(0, 300),
    };
    if (b.shipped === true) o.shippedAt = o.shippedAt || new Date().toISOString();
    if (b.shipped === false) delete o.shippedAt;
    return { ...o };
  });
  if (!out) return res.status(404).json({ error: "not found" });
  logAction(req, "order.shipping", `order:${req.params.num}`, undefined, out.shipping);
  res.json(out);
});

/** Новая ссылка на оплату для заказа, который ещё не оплачен. */
app.post("/api/admin/orders/:num/pay-link", auth, adminOnly, async (req, res) => {
  try {
    const order = (await readJson(ORDERS, [])).find((o) => o.order === req.params.num);
    if (!order) return res.status(404).json({ error: "not found" });
    if (order.status === "paid" || order.status === "done")
      return res.status(400).json({ error: "Заказ уже оплачен" });

    /* Товары могли уйти другому покупателю, пока заказ висел */
    const catalog = await loadProducts();
    const gone = order.items.filter((i) => {
      const p = catalog.find((x) => x.id === i.id);
      return !p || p.sold || reservedByOther(p, order.id);
    });
    if (gone.length)
      return res.status(409).json({ error: `Позиции уже недоступны: ${gone.map((g) => "№" + g.n).join(", ")}` });

    const url = await stripeSession(order);
    if (!url) return res.status(400).json({ error: "Stripe не настроен" });
    await reserveItems(order.items.map((i) => i.id), order.id);
    await updateJson(ORDERS, [], (list) => {
      const o = list.find((x) => x.order === req.params.num);
      if (o) { o.session = order.session; o.status = "new"; }
    });
    logAction(req, "order.paylink", `order:${req.params.num}`);
    res.json({ url, expiresIn: RESERVE_MIN() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Оплата мимо Stripe — наличными или переводом. */
app.post("/api/admin/orders/:num/mark-paid", auth, adminOnly, async (req, res) => {
  const method = ["cash", "transfer", "other"].includes(req.body?.method) ? req.body.method : "other";
  const order = (await readJson(ORDERS, [])).find((o) => o.order === req.params.num);
  if (!order) return res.status(404).json({ error: "not found" });
  await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => x.order === req.params.num);
    if (!o) return;
    o.paymentMethod = method;
    o.paidOutside = true;
  });
  const changed = await markPaid({ order: req.params.num }, {});
  logAction(req, "order.markPaid", `order:${req.params.num}`, undefined, method);
  res.json(changed || { ok: true });
});

app.delete("/api/admin/orders/:num", auth, adminOnly, async (req, res) => {
  const list = await readJson(ORDERS, []);
  const order = list.find((o) => o.order === req.params.num);
  await writeJson(ORDERS, list.filter((o) => o.order !== req.params.num));
  await freeOrderItems(order);
  logAction(req, "order.delete", `order:${req.params.num}`, order?.total, undefined);
  res.json({ ok: true });
});

/* Ручная отметка статуса заказа из админки */
app.post("/api/admin/orders/:num", auth, adminOnly, async (req, res) => {
  const out = await updateJson(ORDERS, [], (list) => {
    const o = list.find((x) => x.order === req.params.num);
    if (!o) return null;
    const was = o.status;
    if (req.body?.status) o.status = String(req.body.status);
    /* Передача товара покупателю запускает отсчёт дней до выплаты */
    if (req.body?.delivered === true) o.deliveredAt = o.deliveredAt || new Date().toISOString();
    if (req.body?.delivered === false) delete o.deliveredAt;
    return { order: { ...o, releaseAt: releaseDate(o.deliveredAt), payoutState: payoutState(o) }, was };
  });
  if (!out) return res.status(404).json({ error: "not found" });

  /* Отменённый заказ отпускает товары обратно на витрину */
  const o = out.order;
  if ((o.status === "cancelled" || o.status === "expired") && out.was !== o.status) await freeOrderItems(o);
  if (req.body?.status && out.was !== o.status)
    logAction(req, "order.status", `order:${o.order}`, out.was, o.status);
  if (req.body?.delivered !== undefined)
    logAction(req, "order.delivered", `order:${o.order}`, undefined, o.deliveredAt || null);
  res.json(o);
});

/** Возврат покупателю. При товаре партнёра возвращаем и свою комиссию. */
app.post("/api/admin/orders/:num/refund", auth, adminOnly, async (req, res) => {
  try {
    const order = (await readJson(ORDERS, [])).find((o) => o.order === req.params.num);
    if (!order) return res.status(404).json({ error: "not found" });
    if (!order.charge && !order.paymentIntent)
      return res.status(400).json({ error: "Šis pasūtījums nav apmaksāts caur Stripe" });

    const amountCents = req.body?.amountCents ? Math.round(Number(req.body.amountCents)) : undefined;
    const r = await connect.refund({
      charge: order.charge || undefined,
      paymentIntent: order.paymentIntent || undefined,
      amountCents,
      account: order.stripeAccountId || null,
      refundApplicationFee: req.body?.refundFee !== false,
      reason: req.body?.reason,
    });
    const out = await updateJson(ORDERS, [], (list) => {
      const o = list.find((x) => x.order === req.params.num);
      if (!o) return null;
      o.refundedCents = (o.refundedCents || 0) + (r.amount || 0);
      o.refundedAt = new Date().toISOString();
      o.refunds = [...(o.refunds || []), { at: o.refundedAt, id: r.id, amount: r.amount, reason: req.body?.reason || "" }];
      o.refundId = r.id;
      if (o.refundedCents >= (o.chargeCents || 0)) o.status = "cancelled";
      return { ...o };
    });
    /* Полный возврат снимает продажу: предмет снова доступен покупателям */
    if (req.body?.restock !== false && out.refundedCents >= (out.chargeCents || 0)) await freeOrderItems(out);
    logAction(req, "order.refund", `order:${req.params.num}`, undefined, { amount: r.amount, id: r.id });
    res.json({ refund: { id: r.id, amount: r.amount, status: r.status }, order: out });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post("/api/admin/login", async (req, res) => {
  const login = String(req.body?.login || "").trim();
  const password = String(req.body?.password || "");
  if ((!login || login.toLowerCase() === ADMIN_LOGIN.toLowerCase()) && password === ADMIN_PASSWORD)
    return res.json({ token: makeToken("admin", null), role: "admin", name: "Администратор" });

  const seller = (await loadSellers()).find(
    (x) => x.login.toLowerCase() === login.toLowerCase() && x.active !== false
  );
  if (seller && hashPw(password, seller.salt) === seller.hash)
    return res.json({
      token: makeToken("seller", seller.id),
      role: "seller",
      name: seller.name,
      commission: Number(seller.commission ?? COMMISSION()),
    });
  res.status(401).json({ error: "Неверный логин или пароль" });
});

app.get("/api/admin/me", auth, (req, res) => res.json(req.actor));

/* ── продавцы (только главный админ) ── */
app.get("/api/admin/sellers", auth, adminOnly, async (_req, res) => {
  const [sellers, products] = await Promise.all([loadSellers(), loadProducts()]);
  res.json(
    sellers.map((s) => ({
      id: s.id,
      login: s.login,
      name: s.name,
      contact: s.contact || "",
      commission: Number(s.commission ?? COMMISSION()),
      active: s.active !== false,
      createdAt: s.createdAt,
      products: products.filter((p) => p.sellerId === s.id).length,
      stage: partnerStage(s),
      status: s.status || "draft",
      canSell: canSell(s),
      company: s.company || null,
      terms: s.terms
        ? { version: s.terms.termsVersion, acceptedAt: s.terms.acceptedAt, sha256: s.terms.termsSha256, ip: s.terms.acceptedIp, representative: s.terms.representativeName }
        : null,
      stripe: s.stripe || null,
    }))
  );
});

/** Проверка площадкой: допустить к торговле или приостановить. */
app.post("/api/admin/sellers/:id/status", auth, adminOnly, async (req, res) => {
  const want = String(req.body?.status || "");
  if (!["active", "suspended", "review", "onboarding"].includes(want))
    return res.status(400).json({ error: "Неизвестный статус" });

  const out = await updateJson(SELLERS, [], (list) => {
    const s = list.find((x) => x.id === req.params.id);
    if (!s) return null;
    if (want === "active") {
      if (!companyReady(s)) return { error: "Партнёр не заполнил реквизиты" };
      if (!termsReady(s)) return { error: "Партнёр не принял условия" };
      if (!stripeReady(s)) return { error: "Stripe ещё не подтвердил счёт партнёра" };
      s.active = true;
      s.approvedAt = new Date().toISOString();
    }
    if (want === "suspended") s.active = false;
    else s.active = true;
    s.status = want;
    return { id: s.id, status: s.status, stage: partnerStage(s), canSell: canSell(s) };
  });
  if (!out) return res.status(404).json({ error: "not found" });
  if (out.error) return res.status(400).json(out);
  res.json(out);
});

/** Привязать партнёру готовый счёт Stripe. Только в песочнице:
    на бою счёт создаёт сам партнёр, проходя проверку Stripe. */
app.post("/api/admin/sellers/attach-test-account", auth, adminOnly, async (req, res) => {
  if (!settings.isTest())
    return res.status(400).json({ error: "Доступно только в режиме песочницы" });
  const accountId = String(req.body?.accountId || "");
  if (!/^acct_/.test(accountId)) return res.status(400).json({ error: "Нужен id счёта acct_…" });
  try {
    const acct = await connect.getAccount(accountId);
    const out = await updateJson(SELLERS, [], (list) => {
      const s = list.find((x) => x.id === req.body?.sellerId);
      if (!s) return null;
      s.stripe = { ...connect.accountState(acct), mode: "test" };
      return partnerView(s);
    });
    if (!out) return res.status(404).json({ error: "Партнёр не найден" });
    logAction(req, "seller.attachTestAccount", `seller:${req.body?.sellerId}`, undefined, accountId);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Обновить состояние счёта партнёра из Stripe вручную. */
app.post("/api/admin/sellers/:id/sync", auth, adminOnly, async (req, res) => {
  try {
    const out = await syncSeller(req.params.id);
    res.json(out || { error: "у партнёра нет счёта Stripe" });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/* ── выплаты партнёрам ──
   Деньги лежат на счёте партнёра в Stripe, но уходят на его банк только
   по кнопке площадки — не раньше, чем истечёт право отказа покупателя. */
app.get("/api/admin/payouts", auth, adminOnly, async (_req, res) => {
  const sellers = (await loadSellers()).filter((s) => s.stripe?.accountId || s.company);
  const rows = [];
  for (const s of sellers) {
    const { buckets, rows: orders } = await payoutSummary(s.id);
    let balance = null;
    if (s.stripe?.accountId && connect.hasStripe()) {
      try {
        const b = await connect.balance(s.stripe.accountId);
        balance = { available: connect.availableCents(b), pending: connect.pendingCents(b) };
      } catch (e) {
        balance = { error: String(e.message || e) };
      }
    }
    rows.push({
      id: s.id,
      name: s.company?.name || s.name,
      iban: s.company?.iban || "",
      stage: partnerStage(s),
      accountId: s.stripe?.accountId || "",
      payoutsEnabled: Boolean(s.stripe?.payoutsEnabled),
      payoutInterval: s.stripe?.payoutInterval || "",
      buckets,
      balance,
      orders: orders.filter((o) => o.state === "available" || o.state === "held" || o.state === "disputed"),
    });
  }
  res.json({ holdDays: holdDays(), rows });
});

app.post("/api/admin/payouts/:id", auth, adminOnly, async (req, res) => {
  try {
    const seller = (await loadSellers()).find((x) => x.id === req.params.id);
    if (!seller?.stripe?.accountId) return res.status(400).json({ error: "у партнёра нет счёта Stripe" });

    const { rows } = await payoutSummary(seller.id);
    const due = rows.filter((r) => r.state === "available");
    const dueCents = due.reduce((s, r) => s + r.netCents, 0);
    if (dueCents <= 0) return res.status(400).json({ error: "нечего выплачивать" });

    const bal = await connect.balance(seller.stripe.accountId);
    const available = connect.availableCents(bal);
    const amount = Math.min(dueCents, available);
    if (amount <= 0)
      return res.status(400).json({
        error: "средства ещё не доступны в Stripe",
        due: dueCents,
        available,
        pending: connect.pendingCents(bal),
      });

    const payout = await connect.createPayout({
      account: seller.stripe.accountId,
      amountCents: amount,
      description: `SOFA.LV ${due.map((r) => r.order).join(", ")}`.slice(0, 200),
      metadata: { partner_id: seller.id, orders: due.map((r) => r.order).join(",").slice(0, 480) },
      idempotencyKey: `payout_${seller.id}_${due.map((r) => r.order).join("_")}`.slice(0, 200),
    });

    const paidOrders = [];
    let left = amount;
    await updateJson(ORDERS, [], (list) => {
      for (const r of due) {
        if (left < r.netCents) break;
        const o = list.find((x) => x.order === r.order);
        if (!o) continue;
        o.payoutAt = new Date().toISOString();
        o.payoutId = payout.id;
        o.payoutCents = r.netCents;
        left -= r.netCents;
        paidOrders.push(o.order);
      }
    });
    res.json({
      payout: { id: payout.id, amount: payout.amount, arrival: payout.arrival_date, status: payout.status },
      orders: paidOrders,
      partial: amount < dueCents,
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post("/api/admin/sellers", auth, adminOnly, async (req, res) => {
  const b = req.body || {};
  const list = await loadSellers();
  const login = String(b.login || "").trim().toLowerCase();
  if (!login || !String(b.name || "").trim())
    return res.status(400).json({ error: "Нужны логин и имя продавца" });

  const idx = list.findIndex((x) => x.id === b.id);
  if (list.some((x) => x.login.toLowerCase() === login && x.id !== b.id))
    return res.status(400).json({ error: "Такой логин уже занят" });
  if (idx < 0 && !b.password) return res.status(400).json({ error: "Задайте пароль" });

  const base =
    idx >= 0
      ? list[idx]
      : { id: `s${Date.now().toString(36)}`, createdAt: new Date().toISOString(), status: "draft" };
  const next = {
    ...base,
    login,
    name: String(b.name).trim(),
    contact: String(b.contact || "").trim(),
    commission: Math.max(0, Math.min(90, Number(b.commission ?? COMMISSION()))),
    active: b.active !== false,
    status: base.status || "draft",
  };
  if (b.password) {
    next.salt = crypto.randomBytes(16).toString("hex");
    next.hash = hashPw(b.password, next.salt);
  }
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  await saveSellers(list);
  res.json({ id: next.id, login: next.login, name: next.name });
});

app.delete("/api/admin/sellers/:id", auth, adminOnly, async (req, res) => {
  const list = await loadSellers();
  await saveSellers(list.filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
});

/* ── статистика: админу по всем, продавцу — по себе ── */
app.get("/api/admin/stats", auth, async (req, res) => {
  const [orders, sellers, products] = await Promise.all([
    readJson(ORDERS, []),
    loadSellers(),
    loadProducts(),
  ]);
  const done = (o) => o.status === "paid" || o.status === "done";

  if (req.actor.role === "seller") {
    const mine = req.actor.id;
    let gross = 0;
    let fee = 0;
    let pending = 0;
    const history = [];
    for (const o of orders) {
      const items = (o.items || []).filter((i) => i.sellerId === mine);
      if (!items.length) continue;
      const legacy = split(items.reduce((a, i) => a + (i.price || 0), 0), req.actor.commission);
      const sum = o.itemsCents !== undefined ? toEur(o.itemsCents) : legacy.gross;
      const sp = {
        fee: o.commissionCents !== undefined ? toEur(o.commissionCents) : legacy.fee,
        net: o.partnerNetCents !== undefined ? toEur(o.partnerNetCents) : legacy.net,
      };
      if (done(o)) {
        gross += sum;
        fee += sp.fee;
      } else pending += sp.net;
      history.push({
        order: o.order,
        at: o.at,
        status: o.status || "new",
        payoutState: payoutState(o),
        releaseAt: releaseDate(o.deliveredAt),
        items: items.map((i) => ({ n: i.n, title: i.title, price: i.price, img: i.img })),
        gross: sum,
        fee: sp.fee,
        net: sp.net,
      });
    }
    return res.json({
      role: "seller",
      commission: req.actor.commission,
      products: products.filter((p) => p.sellerId === mine).length,
      totals: {
        orders: history.length,
        gross: Math.round(gross * 100) / 100,
        fee: Math.round(fee * 100) / 100,
        net: Math.round((gross - fee) * 100) / 100,
        pending: Math.round(pending * 100) / 100,
      },
      history,
    });
  }

  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id))
      rows.set(id, { id, name: id ? "" : "Витрина магазина", sold: 0, gross: 0, fee: 0, net: 0, pending: 0 });
    return rows.get(id);
  };
  let gross = 0;
  let fee = 0;
  let pending = 0;
  let paidOrders = 0;
  for (const o of orders) {
    const ok = done(o);
    if (ok) paidOrders++;
    for (const it of o.items || []) {
      const sid = it.sellerId || null;
      const rate = sid ? Number(sellers.find((x) => x.id === sid)?.commission ?? COMMISSION()) : 0;
      const sp = split(it.price || 0, rate);
      const r = row(sid);
      if (ok) {
        r.sold++;
        r.gross += sp.gross;
        r.fee += sp.fee;
        r.net += sp.net;
        gross += sp.gross;
        fee += sp.fee;
      } else {
        r.pending += sp.gross;
        pending += sp.gross;
      }
    }
  }
  for (const s of sellers) {
    const r = row(s.id);
    r.name = s.name;
    r.commission = Number(s.commission ?? COMMISSION());
    r.products = products.filter((p) => p.sellerId === s.id).length;
  }
  const shop = rows.get(null);
  if (shop) shop.products = products.filter((p) => !p.sellerId).length;

  res.json({
    role: "admin",
    totals: {
      orders: orders.length,
      paidOrders,
      gross: Math.round(gross * 100) / 100,
      fee: Math.round(fee * 100) / 100,
      payout: Math.round((gross - fee) * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      sellers: sellers.length,
      products: products.length,
    },
    rows: [...rows.values()].map((r) => ({
      ...r,
      gross: Math.round(r.gross * 100) / 100,
      fee: Math.round(r.fee * 100) / 100,
      net: Math.round(r.net * 100) / 100,
      pending: Math.round(r.pending * 100) / 100,
    })),
  });
});

/* В панели виден весь каталог: публичная витрина прячет товары
   непроверенных партнёров, но владельцу они нужны всегда. */
app.get("/api/admin/products", auth, async (req, res) => {
  const list = await loadProducts();
  res.json(req.actor.role === "admin" ? list : list.filter((p) => p.sellerId === req.actor.id));
});

/* ── товары: видимость, архив, массовые операции ── */

/** Своё — админу, чужое — нельзя: одна проверка на все операции. */
const ownsProduct = (actor, p) => actor.role === "admin" || p?.sellerId === actor.id;

app.post("/api/admin/products/:id/state", auth, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const out = await updateJson(STORE, [], (list) => {
    const p = list.find((x) => x.id === id);
    if (!p) return null;
    if (!ownsProduct(req.actor, p)) return { forbidden: true };
    const before = { sold: Boolean(p.sold), hidden: Boolean(p.hidden), archived: Boolean(p.archived) };
    if (b.sold !== undefined) p.sold = Boolean(b.sold);
    if (b.hidden !== undefined) p.hidden = Boolean(b.hidden);
    if (b.archived !== undefined) {
      p.archived = Boolean(b.archived);
      if (p.archived) p.archivedAt = new Date().toISOString();
      else delete p.archivedAt;
    }
    /* Снятие резерва вручную: заказ отменился, а предмет остался занят */
    if (b.release) {
      delete p.reservedBy;
      delete p.reservedUntil;
    }
    return { before, product: { ...p } };
  });
  if (!out) return res.status(404).json({ error: "not found" });
  if (out.forbidden) return res.status(403).json({ error: "Это товар другого продавца" });
  logAction(req, "product.state", `product:${id}`, out.before, {
    sold: out.product.sold, hidden: out.product.hidden, archived: out.product.archived,
  });
  res.json(out.product);
});

/** Одно действие сразу над пачкой отмеченных карточек. */
app.post("/api/admin/products/bulk", auth, async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  const action = String(req.body?.action || "");
  const value = req.body?.value;
  if (!ids.length) return res.status(400).json({ error: "Ничего не выбрано" });

  const out = await updateJson(STORE, [], (list) => {
    let done = 0;
    let denied = 0;
    for (const p of list) {
      if (!ids.includes(p.id)) continue;
      if (!ownsProduct(req.actor, p)) { denied++; continue; }
      if (action === "sold") p.sold = Boolean(value);
      else if (action === "hidden") p.hidden = Boolean(value);
      else if (action === "archive") { p.archived = true; p.archivedAt = new Date().toISOString(); }
      else if (action === "restore") { p.archived = false; delete p.archivedAt; }
      else if (action === "cat" && value) p.cat = String(value);
      else if (action === "seller" && req.actor.role === "admin") p.sellerId = value || null;
      else continue;
      done++;
    }
    return { done, denied };
  });
  logAction(req, `product.bulk.${action}`, `products:${ids.length}`, undefined, String(value ?? ""));
  res.json(out);
});

/* ── выгрузка для бухгалтерии ── */
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

app.get("/api/admin/export/orders.csv", auth, adminOnly, async (req, res) => {
  const [orders, sellers] = await Promise.all([readJson(ORDERS, []), loadSellers()]);
  const from = req.query.from ? Date.parse(String(req.query.from)) : 0;
  const to = req.query.to ? Date.parse(String(req.query.to)) + 864e5 : Infinity;
  const money = (c) => (Math.round(c || 0) / 100).toFixed(2).replace(".", ",");

  const head = [
    "Дата", "Заказ", "Статус", "Покупатель", "Почта", "Телефон", "Получение", "Адрес",
    "Продавец", "№ товара", "Название", "Цена товара", "Доставка", "Итого заказа",
    "Комиссия площадки", "Комиссия Stripe", "К выплате партнёру", "Возвращено",
    "Передан", "Выплачен", "PaymentIntent",
  ];
  const rows = [head.map(csvCell).join(";")];
  for (const o of orders) {
    const at = Date.parse(o.at || "");
    if (!(at >= from && at <= to)) continue;
    const seller = o.sellerId ? sellers.find((s) => s.id === o.sellerId) : null;
    const items = o.items || [];
    items.forEach((it, i) => {
      rows.push(
        [
          new Date(o.at).toLocaleString("lv-LV"),
          o.order,
          o.status || "new",
          o.name, o.email, o.contact,
          o.delivery === "courier" ? "Piegāde" : "Talsi",
          o.address || "",
          seller ? seller.company?.name || seller.name : "SOFA.LV",
          it.n || "",
          it.title || "",
          money(it.cents ?? toCents(it.price)),
          i === 0 ? money(o.shippingCents) : "",
          i === 0 ? money(o.chargeCents) : "",
          i === 0 ? money(o.commissionCents) : "",
          i === 0 ? money(o.stripeFeeCents || o.stripeFeeEstimateCents) : "",
          i === 0 ? money(o.partnerNetCents) : "",
          i === 0 ? money(o.refundedCents) : "",
          i === 0 ? (o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString("lv-LV") : "") : "",
          i === 0 ? (o.payoutAt ? new Date(o.payoutAt).toLocaleDateString("lv-LV") : "") : "",
          i === 0 ? o.paymentIntent || "" : "",
        ].map(csvCell).join(";")
      );
    });
  }
  const name = `sofa-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  res
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="${name}"`)
    /* BOM — иначе Excel открывает кириллицу и диакритику крякозябрами */
    .send("\uFEFF" + rows.join("\r\n"));
});

app.post("/api/admin/import", auth, adminOnly, async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: "Нужна ссылка http(s)://" });
    res.json(await importFromUrl(url));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/admin/upload", auth, upload.array("files", 8), (req, res) => {
  res.json({ images: (req.files || []).map((f) => `/uploads/${f.filename}`) });
});

app.post("/api/admin/translate", auth, async (req, res) => {
  try {
    const tr = req.body?.tr || {};
    const from = req.body?.from || pickSource(tr);
    if (!from) return res.status(400).json({ error: "Заполните карточку хотя бы на одном языке" });
    res.json(await translateCard(tr[from], from));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/admin/products", auth, async (req, res) => {
  const p = req.body || {};
  if (!p.id) p.id = Date.now();

  /* Публикуем сразу на трёх языках: пустые версии переводим сами. */
  let translateError = "";
  const from = pickSource(p.tr);
  const missing = ["lv", "en", "ru"].filter((l) => !(p.tr?.[l]?.title || "").trim());
  if (from && missing.length && settings.get("deepseekKey")) {
    try {
      const done = await translateCard(p.tr[from], from);
      for (const l of missing) p.tr[l] = { ...done[l] };
    } catch (e) {
      translateError = String(e.message || e);
      console.warn("[epoha] авто-перевод не удался:", translateError);
    }
  }
  const list = await loadProducts();
  const idx = list.findIndex((x) => x.id === p.id);

  /* Продавец ведёт только свои карточки; администратор — любые */
  if (req.actor.role === "seller") {
    if (idx >= 0 && list[idx].sellerId !== req.actor.id)
      return res.status(403).json({ error: "Это товар другого продавца" });
    p.sellerId = req.actor.id;
  } else {
    p.sellerId = p.sellerId ?? (idx >= 0 ? list[idx].sellerId : null) ?? null;
  }

  const nextN = String(
    list.reduce((m, x) => Math.max(m, Number(x.n) || 0), 0) + 1
  ).padStart(2, "0");
  const prev = idx >= 0 ? list[idx] : null;
  const clean = {
    ...(prev ? { reservedBy: prev.reservedBy, reservedUntil: prev.reservedUntil } : {}),
    hidden: p.hidden !== undefined ? Boolean(p.hidden) : Boolean(prev?.hidden),
    archived: Boolean(prev?.archived),
    id: Number(p.id),
    createdAt: p.createdAt || list[idx]?.createdAt || new Date().toISOString(),
    n: p.n || nextN,
    cat: p.cat || "seating",
    price: Number(p.price) || 0,
    sold: Boolean(p.sold),
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    source: p.source || "",
    sellerId: p.sellerId ?? null,
    tr: {
      lv: { title: "", era: "", desc: "", ...(p.tr?.lv || {}) },
      en: { title: "", era: "", desc: "", ...(p.tr?.en || {}) },
      ru: { title: "", era: "", desc: "", ...(p.tr?.ru || {}) },
    },
  };
  if (idx >= 0) list[idx] = clean;
  else list.unshift(clean);
  await saveProducts(list);
  res.json(translateError ? { ...clean, translateError } : clean);
});

app.delete("/api/admin/products/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const list = await loadProducts();
  const item = list.find((x) => x.id === id);
  if (req.actor.role === "seller" && item && item.sellerId !== req.actor.id)
    return res.status(403).json({ error: "Это товар другого продавца" });
  await saveProducts(list.filter((x) => x.id !== id));
  res.json({ ok: true });
});

app.get("/api/admin/orders", auth, async (req, res) => {
  const orders = await readJson(ORDERS, []);
  if (req.actor.role === "admin") return res.json(orders);

  /* Продавцу — только его заказы, с его же суммами и состоянием выплаты */
  const mine = req.actor.id;
  res.json(
    orders
      .filter((o) => o.sellerId === mine || (o.items || []).some((i) => i.sellerId === mine))
      .map((o) => {
        const items = (o.items || []).filter((i) => i.sellerId === mine);
        const legacy = split(items.reduce((a, i) => a + (i.price || 0), 0), req.actor.commission);
        return {
          order: o.order,
          at: o.at,
          status: o.status || "new",
          delivery: o.delivery,
          address: o.address,
          name: o.name,
          contact: o.contact,
          email: o.email,
          comment: o.comment,
          items,
          deliveredAt: o.deliveredAt || null,
          releaseAt: releaseDate(o.deliveredAt),
          payoutState: payoutState(o),
          total: o.itemsCents !== undefined ? toEur(o.itemsCents) : legacy.gross,
          fee: o.commissionCents !== undefined ? toEur(o.commissionCents) : legacy.fee,
          net: o.partnerNetCents !== undefined ? toEur(o.partnerNetCents) : legacy.net,
          stripeFee: toEur(o.stripeFeeCents || o.stripeFeeEstimateCents || 0),
        };
      })
  );
});

app.use("/uploads", express.static(UPLOADS, { maxAge: "30d", immutable: true }));
app.use(express.static(DIST, { maxAge: "1h" }));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(DIST, "index.html")));

app.listen(PORT, () => console.log(`[epoha] http://0.0.0.0:${PORT}`));
