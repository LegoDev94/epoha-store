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

/* ── авторизация ── */
const tokenFor = (pw) => crypto.createHmac("sha256", SECRET).update(pw).digest("hex");
const VALID_TOKEN = tokenFor(ADMIN_PASSWORD);
const auth = (req, res, next) => {
  const t = req.get("x-token") || "";
  if (t && crypto.timingSafeEqual(Buffer.from(t.padEnd(64).slice(0, 64)), Buffer.from(VALID_TOKEN)))
    return next();
  res.status(401).json({ error: "unauthorized" });
};

/* ── импорт товара по ссылке ── */
const meta = (html, attr, name) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] || "";
};

const CAT_RULES = [
  ["seating", /(sofa|soffa|settee|couch|armchair|arm chair|chair|fauteuil|bergere|bergère|fåtölj|stol|bench|stool|ottoman|divān|krēsl|диван|кресл|стул|банкетк)/gi],
  ["mirror", /(mirror|spegel|spogul|зеркал)/gi],
  ["light", /(chandelier|pendant|lamp|lampa|lampett|sconce|light fitting|ljuskrona|lustra|люстр|светильник|бра)/gi],
  ["storage", /(chest of drawers|chest|commode|kommod|cabinet|cupboard|sideboard|drawer|byrå|dresser|bookcase|skapis|kumode|комод|шкаф|буфет)/gi],
  ["table", /(table|bord|galds|desk|console|секретер|стол|столик)/gi],
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

  return {
    id: srcId || Date.now(),
    source: finalUrl,
    images,
    cat: guessCat(title, desc),
    priceHint,
    tr: {
      lv: { title, era: "", desc },
      en: { title, era: "", desc },
      ru: { title, era: "", desc },
    },
  };
}

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

app.post("/api/orders", async (req, res) => {
  const list = await readJson(ORDERS, []);
  list.unshift({ ...req.body, at: new Date().toISOString() });
  await writeJson(ORDERS, list.slice(0, 500));
  res.json({ ok: true });
});

app.post("/api/admin/login", (req, res) => {
  if ((req.body?.password || "") === ADMIN_PASSWORD) return res.json({ token: VALID_TOKEN });
  res.status(401).json({ error: "wrong password" });
});

app.post("/api/admin/import", auth, async (req, res) => {
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

app.post("/api/admin/products", auth, async (req, res) => {
  const p = req.body || {};
  if (!p.id) p.id = Date.now();
  const list = await loadProducts();
  const idx = list.findIndex((x) => x.id === p.id);
  const nextN = String(
    list.reduce((m, x) => Math.max(m, Number(x.n) || 0), 0) + 1
  ).padStart(2, "0");
  const clean = {
    id: Number(p.id),
    n: p.n || nextN,
    cat: p.cat || "seating",
    price: Number(p.price) || 0,
    sold: Boolean(p.sold),
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    source: p.source || "",
    tr: {
      lv: { title: "", era: "", desc: "", ...(p.tr?.lv || {}) },
      en: { title: "", era: "", desc: "", ...(p.tr?.en || {}) },
      ru: { title: "", era: "", desc: "", ...(p.tr?.ru || {}) },
    },
  };
  if (idx >= 0) list[idx] = clean;
  else list.unshift(clean);
  await saveProducts(list);
  res.json(clean);
});

app.delete("/api/admin/products/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const list = await loadProducts();
  await saveProducts(list.filter((x) => x.id !== id));
  res.json({ ok: true });
});

app.get("/api/admin/orders", auth, async (_req, res) => res.json(await readJson(ORDERS, [])));

app.use("/uploads", express.static(UPLOADS, { maxAge: "30d", immutable: true }));
app.use(express.static(DIST, { maxAge: "1h" }));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(DIST, "index.html")));

app.listen(PORT, () => console.log(`[epoha] http://0.0.0.0:${PORT}`));
