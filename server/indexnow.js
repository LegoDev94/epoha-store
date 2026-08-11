/**
 * Оповещение поисковиков о новых и изменившихся страницах.
 *
 * Обычный обход доходит до нового товара за дни, а вещь у нас в одном
 * экземпляре: пока страницу заметят, её успевают купить — и в выдаче
 * висит проданное. IndexNow — общий для Bing, Yandex, Seznam и Naver
 * способ сказать «вот эти адреса изменились». Ответы ChatGPT о товарах
 * опираются на индекс Bing, поэтому то же оповещение ускоряет и их.
 *
 * Ключ лежит файлом в data/ и отдаётся с самого сайта: так поисковик
 * убеждается, что адреса присылает владелец домена, а не посторонний.
 *
 * Снимок каталога хранится рядом — иначе перезапуск сервера выглядел бы
 * как «изменилось всё» и мы слали бы полный список каждый раз.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ENDPOINT = "https://api.indexnow.org/indexnow";
/* Копим изменения: сохранение товара часто идёт пачкой, а слать
   отдельное письмо на каждое поле незачем. */
const DEBOUNCE_MS = 20_000;

let cfg = null;
let pending = new Set();
let timer = null;

const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

/** Отпечаток товара: любое изменение полей меняет его. */
const fingerprint = (p) =>
  crypto.createHash("sha1").update(JSON.stringify(p)).digest("hex").slice(0, 12);

/**
 * @param {object} o
 * @param {string} o.dir      — папка данных
 * @param {string} o.site     — https://sofa.lv
 * @param {string[]} o.langs  — языки витрины
 * @param {(lang: string, tail: string) => string} o.urlFor
 */
export function init({ dir, site, langs, urlFor }) {
  const host = (() => {
    try {
      return new URL(site).host;
    } catch {
      return "";
    }
  })();
  /* Без своего домена оповещать некого: с localhost поисковик нас не
     подтвердит, а лишний запрос наружу ни к чему. */
  const live = site.startsWith("https://") && process.env.INDEXNOW !== "off";

  const keyPath = path.join(dir, "indexnow-key.txt");
  let key = "";
  try {
    key = fs.readFileSync(keyPath, "utf8").trim();
  } catch {}
  if (!/^[a-f0-9]{32}$/.test(key)) {
    key = crypto.randomBytes(16).toString("hex");
    try {
      fs.writeFileSync(keyPath, key + "\n");
    } catch (e) {
      console.warn("[sofa] ключ IndexNow не сохранился:", String(e.message || e));
    }
  }

  cfg = {
    live,
    host,
    site,
    key,
    langs,
    urlFor,
    snapPath: path.join(dir, "indexnow-snapshot.json"),
    snap: readJson(path.join(dir, "indexnow-snapshot.json"), null),
  };
  return { key, live };
}

/** Файл-подтверждение, который поисковик читает с нашего сайта. */
export const keyFile = () => (cfg ? { name: `${cfg.key}.txt`, body: cfg.key } : null);

/**
 * Каталог сохранён — сверяем с прошлым снимком и копим адреса.
 * Первый запуск ничего не шлёт: он только запоминает, что уже есть.
 */
export function changed(list) {
  if (!cfg) return;
  const now = {};
  for (const p of list) {
    if (p.hidden || p.archived) continue;
    now[p.id] = fingerprint(p);
  }

  const was = cfg.snap;
  cfg.snap = now;
  try {
    fs.writeFileSync(cfg.snapPath, JSON.stringify(now));
  } catch {}
  if (!was) return;

  const ids = new Set([...Object.keys(was), ...Object.keys(now)].filter((id) => was[id] !== now[id]));
  if (!ids.size) return;

  for (const id of ids) for (const l of cfg.langs) pending.add(cfg.urlFor(l, `/lot/${id}`));
  /* Каталог тоже изменился — товар появился на витрине или исчез с неё */
  for (const l of cfg.langs) pending.add(cfg.urlFor(l, ""));

  clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
  timer.unref?.();
}

async function flush() {
  const urls = [...pending];
  pending = new Set();
  if (!urls.length || !cfg) return;
  if (!cfg.live) {
    console.log(`[sofa] IndexNow не включён, адресов накопилось: ${urls.length}`);
    return;
  }
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: cfg.host,
        key: cfg.key,
        keyLocation: `${cfg.site}/${cfg.key}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    });
    /* 200 — приняли, 202 — приняли и проверяют ключ; остальное пишем в
       журнал и живём дальше: поиск найдёт страницы и обычным обходом. */
    console.log(`[sofa] IndexNow: ${urls.length} адресов, ответ ${r.status}`);
  } catch (e) {
    console.warn("[sofa] IndexNow недоступен:", String(e.message || e));
  }
}
