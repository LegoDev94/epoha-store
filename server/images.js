/**
 * Фотографии: один оригинал — набор готовых вариантов.
 *
 * Мебель продают снимки, поэтому оригинал храним всегда, но плитке
 * каталога незачем отдавать файл на 165 КБ: та же картинка шириной
 * 320 px весит 7 КБ. Варианты делаются при загрузке товара, а если
 * какого-то не оказалось — по первому запросу, и остаются на диске.
 *
 * Адрес: /i/v1/<пресет>/<имя>.<формат> — например /i/v1/w640/up-123.webp
 * Версия в пути нужна, чтобы можно было сменить рецепт: файлы отдаются
 * с кэшем на год, иначе у вернувшегося покупателя останется старое.
 *
 * Запасной вариант всегда есть: в <picture> исходный файл стоит в <img>,
 * поэтому даже полный отказ обработки оставляет сайт рабочим.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

let sharp = null;
try {
  sharp = (await import("sharp")).default;
  /* Один поток на кодирование: рядом живёт сайт, и очередь записи
     заказов не должна ждать, пока libvips займёт все ядра. */
  sharp.concurrency(1);
  sharp.cache({ memory: 96 });
} catch {
  console.warn("[sofa] sharp не установлен — фото отдаются как есть");
}

export const hasSharp = () => Boolean(sharp);
export const VERSION = "v1";

/* Ширины выведены из реальных размеров блоков на сайте:
   160 — миниатюры в панели и в заказах, 320 — плитка каталога,
   640 — она же на экранах 2x и мобильная карточка, 960 и 1280 —
   страница товара, 1600 — лупа. Выше не идём: столько пикселей
   в исходниках просто нет. */
export const WIDTHS = [160, 320, 640, 960, 1280, 1600];

/* AVIF заметно легче, но кодируется в 4 раза дольше, а на мелких
   ширинах экономит считаные килобайты — там хватает WebP. */
const AVIF_FROM = 640;
export const FORMATS = { webp: "image/webp", avif: "image/avif" };

const webpQuality = (w) => (w <= 320 ? 82 : w <= 960 ? 80 : 78);

let UPLOADS = "";
/* Где искать исходники: сначала загруженные фото товаров, затем
   снимки из сборки — витрине они нужны такими же лёгкими. */
let ROOTS = [];
let CACHE = "";
let INDEX = "";
let index = {};

export function init({ uploads, cache, extra = [] }) {
  UPLOADS = uploads;
  ROOTS = [{ dir: path.resolve(uploads), url: "/uploads" }];
  for (const e of extra) {
    try {
      if (fs.statSync(e.dir).isDirectory()) ROOTS.push({ dir: path.resolve(e.dir), url: e.url });
    } catch {
      /* каталога нет — не беда */
    }
  }
  CACHE = path.join(cache, VERSION);
  INDEX = path.join(cache, "index.json");
  fs.mkdirSync(CACHE, { recursive: true });
  try {
    index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  } catch {
    index = {};
  }
}

const stemOf = (name) => name.replace(/\.[^.]+$/, "");
const safeName = (n) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(n) && !n.includes("..");

/* Прогрев идёт отдельным процессом и дописывает описания в файл —
   сервер должен их подхватывать, а не жить со снимком на момент старта. */
let indexRead = 0;
const refreshIndex = () => {
  if (Date.now() - indexRead < 10000) return;
  indexRead = Date.now();
  try {
    const st = fs.statSync(INDEX);
    if (st.mtimeMs > (index.__at || 0)) {
      const fresh = JSON.parse(fs.readFileSync(INDEX, "utf8"));
      index = { ...fresh, __at: st.mtimeMs };
    }
  } catch {
    /* описаний ещё нет */
  }
};

/** Что известно про фото: размеры и основной цвет (для подложки). */
export const meta = (name) => {
  refreshIndex();
  return index[stemOf(name)] || null;
};
export const allMeta = () => {
  refreshIndex();
  return index;
};

let saveTimer = null;
const rememberMeta = (stem, data) => {
  index[stem] = { ...index[stem], ...data };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { __at, ...clean } = index;
    void __at;
    fsp.writeFile(INDEX, JSON.stringify(clean), "utf8").catch(() => {});
  }, 1500);
};

/* Один вариант могут попросить сразу несколько посетителей — готовим
   его один раз, остальные ждут тот же результат. */
const inFlight = new Map();
/* И не больше двух кодирований разом: остальное подождёт в очереди. */
let running = 0;
const queue = [];
export const busy = () => ({ running, queued: queue.length });

const slot = () =>
  new Promise((resolve, reject) => {
    if (queue.length > 24) return reject(new Error("очередь переполнена"));
    const go = () => {
      running++;
      resolve(() => {
        running--;
        const next = queue.shift();
        if (next) next();
      });
    };
    if (running < 2) go();
    else queue.push(go);
  });

/**
 * Исходник по имени без расширения: где лежит и по какому адресу
 * доступен. null — такого файла нет ни в одном из каталогов.
 */
export function findSource(stem) {
  if (!safeName(stem)) return null;
  for (const root of ROOTS) {
    for (const ext of [".jpg", ".jpeg", ".png", ".webp", ""]) {
      const file = stem + ext;
      const full = path.resolve(path.join(root.dir, file));
      if (full.startsWith(root.dir) && fs.existsSync(full))
        return { dir: root.dir, file, url: `${root.url}/${file}` };
    }
  }
  return null;
}

/**
 * Готовый вариант; при необходимости создаёт его.
 * null — исходника нет, обработка не удалась или ширина лишняя.
 */
export async function variant(name, width, fmt) {
  if (!sharp || !WIDTHS.includes(width) || !FORMATS[fmt]) return null;
  const stem = stemOf(name);
  const source = findSource(stem);
  if (!source) return null;

  const out = path.join(CACHE, `w${width}`, `${stem}.${fmt}`);
  try {
    await fsp.access(out);
    return out;
  } catch {
    /* варианта ещё нет */
  }
  if (inFlight.has(out)) return inFlight.get(out);

  const job = (async () => {
    const release = await slot();
    try {
      const pipe = sharp(path.join(source.dir, source.file), { failOn: "none", limitInputPixels: 50e6 });
      const info = await pipe.metadata();

      /* Не растягиваем: вариант шире исходника будет тяжелее и хуже */
      if (info.width && info.width <= width * 0.9 && width !== WIDTHS[0]) return null;

      const resized = pipe.rotate().resize({ width, fit: "inside", withoutEnlargement: true });
      const buf =
        fmt === "avif"
          ? await resized.avif({ quality: 56, effort: 3 }).toBuffer()
          : await resized.webp({ quality: webpQuality(width), effort: 4 }).toBuffer();

      await fsp.mkdir(path.dirname(out), { recursive: true });
      /* Через временный файл: параллельный запрос не должен увидеть
         недописанный вариант. */
      const tmp = `${out}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, buf);
      await fsp.rename(tmp, out);
      return out;
    } finally {
      release();
    }
  })()
    .catch((e) => {
      console.warn(`[sofa] вариант ${name} ${width}${fmt}:`, String(e.message || e));
      return null;
    })
    .finally(() => inFlight.delete(out));

  inFlight.set(out, job);
  return job;
}

/**
 * Приводит только что полученный файл к разумному виду: поворот по
 * метке камеры, ограничение стороны, снятие метаданных (включая
 * координаты съёмки), единый формат. Возвращает имя файла.
 */
export async function normalize(buffer, baseName) {
  if (!sharp) {
    const name = `${baseName}.jpg`;
    await fsp.writeFile(path.join(UPLOADS, name), buffer);
    return name;
  }
  const img = sharp(buffer, { failOn: "none", limitInputPixels: 50e6 });
  const info = await img.metadata();
  const buf = await img
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 86, progressive: true })
    .toBuffer();

  const name = `${baseName}.jpg`;
  await fsp.writeFile(path.join(UPLOADS, name), buf);
  void info;
  await describe(name);
  return name;
}

/** Размеры и основной цвет — чтобы место под фото не «прыгало». */
export async function describe(name) {
  if (!sharp) return null;
  const source = findSource(stemOf(name));
  if (!source) return null;
  try {
    const img = sharp(path.join(source.dir, source.file), { failOn: "none", limitInputPixels: 50e6 });
    const info = await img.metadata();
    const { dominant } = await img.stats();
    const hex = (n) => n.toString(16).padStart(2, "0");
    const data = {
      w: info.width || 0,
      h: info.height || 0,
      tone: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    };
    rememberMeta(stemOf(name), data);
    return data;
  } catch {
    return null;
  }
}

/** Заранее готовит ходовые варианты — первый посетитель не ждёт. */
export async function warm(name, widths = WIDTHS) {
  if (!sharp) return 0;
  let made = 0;
  await describe(name);
  for (const w of widths) {
    if (await variant(name, w, "webp")) made++;
    if (w >= AVIF_FROM && (await variant(name, w, "avif"))) made++;
  }
  return made;
}

/** Сколько занимают оригиналы и варианты. */
export async function usage() {
  const size = async (dir) => {
    let bytes = 0;
    let files = 0;
    const walk = async (d) => {
      let items = [];
      try {
        items = await fsp.readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const it of items) {
        const p = path.join(d, it.name);
        if (it.isDirectory()) await walk(p);
        else {
          const st = await fsp.stat(p).catch(() => null);
          if (st) { bytes += st.size; files++; }
        }
      }
    };
    await walk(dir);
    return { bytes, files };
  };
  return { originals: await size(UPLOADS), variants: await size(CACHE), described: Object.keys(index).length };
}
