/**
 * Категории витрины — данные, а не код.
 *
 * Раньше их было ровно шесть и они жили в трёх местах сразу: тип в
 * коде, подписи в словаре, значки в разметке. Добавить седьмую можно
 * было только правкой исходников, а переименовать — только на всех
 * языках сразу.
 *
 * Теперь категории лежат в файле: у каждой ключ, значок, порядок,
 * подписи на языках витрины и слова для распознавания при импорте с
 * аукциона. Первый запуск заводит те шесть, что были, — витрина не
 * замечает подмены.
 */
import fs from "node:fs";
import path from "node:path";

let FILE = "";
let cache = null;

/** Значки нарисованы на витрине; здесь только их имена. */
export const ICONS = ["seating", "mirror", "light", "storage", "table", "decor", "all"];

/* Ключ виден в адресе и хранится в товарах — только латиница. */
export const keyOk = (k) => /^[a-z][a-z0-9-]{1,23}$/.test(k);

const SEED = [
  {
    key: "seating", icon: "seating",
    tr: { lv: "Mīkstās mēbeles", en: "Seating", ru: "Мягкая мебель", lt: "Minkšti baldai", et: "Pehme mööbel" },
    words:
      "sofa|soffa|settee|couch|armchair|arm chair|chair|fauteuil|bergere|bergère|fåtölj|bench|stool|ottoman|dīvān|krēsl|диван|кресл|стул|банкетк|minkšt|tugitool",
  },
  {
    key: "mirror", icon: "mirror",
    tr: { lv: "Spoguļi", en: "Mirrors", ru: "Зеркала", lt: "Veidrodžiai", et: "Peeglid" },
    words:
      "mirror|spegel|spogul|зеркал|veidrod|peegel",
  },
  {
    key: "light", icon: "light",
    tr: { lv: "Apgaismojums", en: "Lighting", ru: "Свет", lt: "Apšvietimas", et: "Valgustid" },
    words:
      "chandelier|candelabra|candlestick|candle holder|pendant|lamp|lampa|lampett|sconce|ljuskrona|ljusstake|lustra|sveč|люстр|светильник|подсвечник|канделябр|бра|šviestuv|valgusti",
  },
  {
    key: "storage", icon: "storage",
    tr: { lv: "Kumodes un glabāšana", en: "Chests & storage", ru: "Комоды и хранение", lt: "Komodos ir spintos", et: "Kummutid ja hoiustamine" },
    words:
      "chest of drawers|chest|commode|kommod|cabinet|cupboard|sideboard|drawer|byrå|dresser|bookcase|skapis|kumode|комод|шкаф|буфет|spinta|komoda|kummut|kapp",
  },
  {
    key: "table", icon: "table",
    tr: { lv: "Galdi", en: "Tables", ru: "Столы", lt: "Stalai", et: "Lauad" },
    words:
      "table|bord|galds|desk|console|секретер|стол|столик|stalas|laud",
  },
  {
    key: "decor", icon: "decor",
    tr: { lv: "Dekors un keramika", en: "Decor & ceramics", ru: "Декор и керамика", lt: "Dekoras ir keramika", et: "Dekoor ja keraamika" },
    words:
      "bowl|vase|jar|plate|dish|tray|figurine|sculpture|statuette|porcelain|faience|ceramic|glass|clock|painting|picture frame|skulptūra|vāze|šķīvis|keramika|porcelāns|ваза|чаша|блюдо|статуэтк|скульптур|фарфор|керамик|поднос|часы|vaza|keraamika",
  },
];

const load = () => {
  if (cache) return cache;
  try {
    const list = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (Array.isArray(list) && list.length) {
      cache = list;
      return cache;
    }
  } catch {
    /* файла ещё нет — заводим те категории, что были в коде */
  }
  cache = SEED.map((c, i) => ({ ...c, order: i, hidden: false }));
  save(cache);
  return cache;
};

function save(list) {
  cache = list;
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 1), "utf8");
  fs.renameSync(tmp, FILE);
}

export function init(file) {
  FILE = file;
  cache = null;
  load();
}

/** Все категории по порядку — как их показывать. */
export const all = () =>
  load()
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Только видимые: скрытая категория остаётся у товаров, но не в меню. */
export const visible = () => all().filter((c) => !c.hidden);

export const has = (key) => load().some((c) => c.key === key);

/** Первая видимая — запасной вариант, если у товара категории нет. */
export const fallback = () => (visible()[0] || all()[0] || SEED[0]).key;

/** Подпись на языке покупателя; нет перевода — берём латышскую. */
export const label = (key, lang = "lv") => {
  const c = load().find((x) => x.key === key);
  return c ? c.tr?.[lang] || c.tr?.lv || c.key : key;
};

const clean = (c, langs) => ({
  key: String(c.key || "").trim().toLowerCase(),
  icon: ICONS.includes(c.icon) ? c.icon : "decor",
  order: Number.isFinite(Number(c.order)) ? Number(c.order) : all().length,
  hidden: Boolean(c.hidden),
  words: String(c.words || "").trim().slice(0, 400),
  tr: Object.fromEntries(langs.map((l) => [l, String(c.tr?.[l] || "").trim().slice(0, 60)])),
});

/**
 * Создаёт или правит категорию. Ключ существующей не меняем: он лежит
 * в товарах, и подмена оставила бы их без категории.
 */
export function upsert(input, langs) {
  const list = all();
  const c = clean(input, langs);
  if (!keyOk(c.key)) throw new Error("Ключ: латинские буквы, цифры и дефис, от 2 до 24 знаков");
  if (!c.tr.lv) throw new Error("Нужно хотя бы латышское название");

  const i = list.findIndex((x) => x.key === c.key);
  if (i >= 0) list[i] = { ...list[i], ...c };
  else list.push(c);
  save(list);
  return list.find((x) => x.key === c.key);
}

/** Порядок в меню — списком ключей. */
export function reorder(keys) {
  const list = all();
  const pos = new Map(keys.map((k, i) => [k, i]));
  for (const c of list) if (pos.has(c.key)) c.order = pos.get(c.key);
  save(list);
  return all();
}

/**
 * Удаляет категорию. Товары не бросаем: вызывающий передаёт, куда их
 * перевести, и получает список тех, кого надо переписать.
 */
export function remove(key) {
  const list = all();
  if (list.length <= 1) throw new Error("Последнюю категорию удалить нельзя");
  if (!list.some((c) => c.key === key)) throw new Error("Категория не найдена");
  save(list.filter((c) => c.key !== key));
  return true;
}

/**
 * Угадывает категорию по названию и описанию — при импорте с аукциона.
 * Название весит втрое: «DINING TABLE AND CHAIRS» — это стол, а не стулья.
 */
export function guess(title, desc = "") {
  let best = fallback();
  let top = 0;
  let bestAt = Infinity;
  for (const c of all()) {
    if (!c.words) continue;
    let re;
    try {
      re = new RegExp(`\\b(${c.words})`, "gi");
    } catch {
      continue;
    }
    const hits =
      (String(title).match(re) || []).length * 3 + (String(desc).match(re) || []).length;
    if (!hits) continue;
    re.lastIndex = 0;
    const at = re.exec(String(title))?.index ?? Infinity;
    if (hits > top || (hits === top && at < bestAt)) {
      top = hits;
      bestAt = at;
      best = c.key;
    }
  }
  return best;
}
