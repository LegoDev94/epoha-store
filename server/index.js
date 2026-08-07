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
const COMMISSION = Number(process.env.COMMISSION || 20); // процент площадки

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
    req.actor = { role: "admin", id: null, name: "Администратор", commission: COMMISSION };
    return next();
  }
  const seller = (await loadSellers()).find((x) => x.id === data.i && x.active !== false);
  if (!seller) return res.status(401).json({ error: "unauthorized" });
  req.actor = {
    role: "seller",
    id: seller.id,
    name: seller.name,
    commission: Number(seller.commission ?? COMMISSION),
  };
  next();
};
const adminOnly = (req, res, next) =>
  req.actor?.role === "admin" ? next() : res.status(403).json({ error: "forbidden" });

/** Доля площадки и чистая выручка продавца по одной сумме. */
const split = (gross, rate) => {
  const fee = Math.round(gross * rate) / 100;
  return { gross, rate, fee, net: Math.round((gross - fee) * 100) / 100 };
};

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
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY не задан на сервере");
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
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS),
    filename: (_req, file, cb) =>
      cb(null, `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${path.extname(file.originalname) || ".jpg"}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

app.get("/api/products", async (_req, res) => res.json(await loadProducts()));

/* ── Заказ: сначала регистрируем, потом ведём на оплату ──
   Суммы считает сервер по своему каталогу — клиенту не доверяем. */
const DELIVERY_FEE = Number(process.env.DELIVERY_FEE || 50);
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

  const tg = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
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
  const resend = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_EMAIL;
  if (resend && to) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resend}` },
        body: JSON.stringify({
          from: process.env.ORDER_FROM || "orders@vintagemebeles.lv",
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

async function stripeSession(order) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set(
    "success_url",
    `${BASE_URL}/#/success/${order.order}?paid=1&s={CHECKOUT_SESSION_ID}`
  );
  form.set("cancel_url", `${BASE_URL}/#/checkout`);
  form.set("metadata[order]", order.order);
  if (order.email) form.set("customer_email", order.email);
  order.items.forEach((it, i) => {
    form.set(`line_items[${i}][quantity]`, "1");
    form.set(`line_items[${i}][price_data][currency]`, "eur");
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(it.price * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`, `№${it.n} ${it.title}`.slice(0, 120));
  });
  if (order.deliveryFee > 0) {
    const i = order.items.length;
    form.set(`line_items[${i}][quantity]`, "1");
    form.set(`line_items[${i}][price_data][currency]`, "eur");
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(order.deliveryFee * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`, "Piegade lidz durvim Latvija");
  }
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 180)}`);
  return (await res.json()).url || null;
}

app.post("/api/orders", async (req, res) => {
  try {
    const b = req.body || {};
    const catalog = await loadProducts();
    const items = (Array.isArray(b.items) ? b.items : [])
      .map((id) => catalog.find((p) => p.id === Number(id)))
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        n: p.n,
        price: Number(p.price) || 0,
        title: p.tr?.lv?.title || p.tr?.en?.title || `#${p.id}`,
        img: p.images?.[0] || "",
        sellerId: p.sellerId || null,
      }));
    if (!items.length) return res.status(400).json({ error: "Grozs ir tukss" });
    if (!String(b.name || "").trim() || !String(b.contact || "").trim())
      return res.status(400).json({ error: "Nepieciesams vards un kontakts" });
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(b.email || "").trim()))
      return res.status(400).json({ error: "Nepieciesams derigs e-pasts" });

    const delivery = b.delivery === "courier" ? "courier" : "pickup";
    if (delivery === "courier" && !String(b.address || "").trim())
      return res.status(400).json({ error: "Nepieciesama piegades adrese" });

    const subtotal = items.reduce((s, i) => s + i.price, 0);
    const deliveryFee = delivery === "courier" ? DELIVERY_FEE : 0;
    const order = {
      order: `VM-${String(Date.now()).slice(-6)}`,
      at: new Date().toISOString(),
      status: "new",
      items,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      delivery,
      name: String(b.name).trim(),
      contact: String(b.contact).trim(),
      email: String(b.email || "").trim(),
      address: String(b.address || "").trim(),
      comment: String(b.comment || "").trim(),
      lang: b.lang || "lv",
    };

    /* Разделение выручки: продавцам — чистыми, площадке — комиссия */
    const sellersList = await loadSellers();
    const bySeller = new Map();
    for (const it of items) {
      const key = it.sellerId || "shop";
      bySeller.set(key, (bySeller.get(key) || 0) + it.price);
    }
    order.splits = [...bySeller.entries()].map(([key, sum]) => {
      const sid = key === "shop" ? null : key;
      const rate = sid ? Number(sellersList.find((x) => x.id === sid)?.commission ?? COMMISSION) : 0;
      return { sellerId: sid, ...split(sum, rate) };
    });

    const list = await readJson(ORDERS, []);
    list.unshift(order);
    await writeJson(ORDERS, list.slice(0, 500));
    notifyOwner(order);

    let payUrl = null;
    let payError = "";
    if (b.pay) {
      try {
        payUrl = await stripeSession(order);
        if (!payUrl) payError = "no-stripe";
      } catch (e) {
        payError = String(e.message || e);
        console.warn("[vm] stripe:", payError);
      }
    }
    res.json({ order: order.order, total: order.total, payUrl, payError });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* Возврат из Stripe: сверяем сессию напрямую с их API — клиенту не
   доверяем, статус ставим только по ответу Stripe. */
app.post("/api/orders/:num/confirm", async (req, res) => {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    const sid = String(req.body?.session || "").trim();
    if (!key || !/^cs_/.test(sid)) return res.status(400).json({ error: "no session" });

    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return res.status(400).json({ error: `stripe ${r.status}` });
    const sess = await r.json();
    const num = req.params.num;
    if (sess?.metadata?.order !== num) return res.status(400).json({ error: "order mismatch" });

    const paid = sess.payment_status === "paid";
    const list = await readJson(ORDERS, []);
    const idx = list.findIndex((o) => o.order === num);
    if (idx >= 0 && paid && list[idx].status !== "paid") {
      list[idx].status = "paid";
      list[idx].paidAt = new Date().toISOString();
      list[idx].stripe = sess.id;
      await writeJson(ORDERS, list);
      notifyOwner(list[idx]);
    }
    res.json({ paid });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* Stripe помечает заказ оплаченным через вебхук */
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const raw = req.body.toString("utf8");
    if (secret) {
      const sig = req.get("stripe-signature") || "";
      const ts = sig.match(/t=(\d+)/)?.[1] || "";
      const v1 = sig.match(/v1=([a-f0-9]+)/)?.[1] || "";
      const expected = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
      if (!v1 || v1.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected)))
        return res.status(400).send("bad signature");
    }
    const event = JSON.parse(raw);
    if (event.type === "checkout.session.completed") {
      const num = event.data?.object?.metadata?.order;
      const list = await readJson(ORDERS, []);
      const idx = list.findIndex((o) => o.order === num);
      if (idx >= 0) {
        list[idx].status = "paid";
        list[idx].paidAt = new Date().toISOString();
        await writeJson(ORDERS, list);
        notifyOwner(list[idx]);
      }
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.delete("/api/admin/orders/:num", auth, adminOnly, async (req, res) => {
  const list = await readJson(ORDERS, []);
  await writeJson(ORDERS, list.filter((o) => o.order !== req.params.num));
  res.json({ ok: true });
});

/* Ручная отметка статуса заказа из админки */
app.post("/api/admin/orders/:num", auth, adminOnly, async (req, res) => {
  const list = await readJson(ORDERS, []);
  const idx = list.findIndex((o) => o.order === req.params.num);
  if (idx < 0) return res.status(404).json({ error: "not found" });
  list[idx].status = String(req.body?.status || list[idx].status);
  await writeJson(ORDERS, list);
  res.json(list[idx]);
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
      commission: Number(seller.commission ?? COMMISSION),
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
      commission: Number(s.commission ?? COMMISSION),
      active: s.active !== false,
      createdAt: s.createdAt,
      products: products.filter((p) => p.sellerId === s.id).length,
    }))
  );
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

  const base = idx >= 0 ? list[idx] : { id: `s${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  const next = {
    ...base,
    login,
    name: String(b.name).trim(),
    contact: String(b.contact || "").trim(),
    commission: Math.max(0, Math.min(90, Number(b.commission ?? COMMISSION))),
    active: b.active !== false,
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
      const sum = items.reduce((a, i) => a + (i.price || 0), 0);
      const sp = split(sum, req.actor.commission);
      if (done(o)) {
        gross += sum;
        fee += sp.fee;
      } else pending += sp.net;
      history.push({
        order: o.order,
        at: o.at,
        status: o.status || "new",
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
      const rate = sid ? Number(sellers.find((x) => x.id === sid)?.commission ?? COMMISSION) : 0;
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
    r.commission = Number(s.commission ?? COMMISSION);
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
  if (from && missing.length && process.env.DEEPSEEK_API_KEY) {
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
  const clean = {
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

  /* Продавцу — только заказы с его товарами и только его позиции и суммы */
  const mine = req.actor.id;
  res.json(
    orders
      .map((o) => {
        const items = (o.items || []).filter((i) => i.sellerId === mine);
        if (!items.length) return null;
        const sum = items.reduce((a, i) => a + (i.price || 0), 0);
        const sp = split(sum, req.actor.commission);
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
          total: sp.gross,
          fee: sp.fee,
          net: sp.net,
        };
      })
      .filter(Boolean)
  );
});

app.use("/uploads", express.static(UPLOADS, { maxAge: "30d", immutable: true }));
app.use(express.static(DIST, { maxAge: "1h" }));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(DIST, "index.html")));

app.listen(PORT, () => console.log(`[epoha] http://0.0.0.0:${PORT}`));
