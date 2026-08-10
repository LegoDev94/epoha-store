/**
 * Догоняющий перевод каталога.
 *
 * Новые карточки переводятся при сохранении, а те, что заведены до
 * появления языка, остаются без него. Этот инструмент проходит по
 * каталогу и допереводит недостающее.
 *
 * Работает бережно: по одной карточке за раз, с паузой между
 * запросами, и сохраняет после каждой — прерванный прогон не теряет
 * сделанное, повторный запуск продолжает с того же места.
 *
 *   node server/tools/translate.js [--langs lt,et] [--limit 10] [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const STORE = path.join(DATA, "store.json");
const SETTINGS = path.join(DATA, "settings.json");

const LANG_NAME = {
  lv: "Latvian",
  en: "English",
  ru: "Russian",
  lt: "Lithuanian",
  et: "Estonian",
};

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const langs = String(arg("--langs", "lt,et")).split(",").filter((l) => LANG_NAME[l]);
const limit = Number(arg("--limit", 0)) || Infinity;
const dry = process.argv.includes("--dry");

const key = () => {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, "utf8")).deepseekKey || "";
  } catch {
    return "";
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const filled = (t) => Boolean((t?.title || "").trim());

/** Первый язык, на котором карточка заполнена. */
const source = (tr) => Object.keys(LANG_NAME).find((l) => filled(tr?.[l]));

function extractJson(raw) {
  const s = String(raw).replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    return a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : {};
  }
}

async function translate(src, from, targets) {
  const prompt = [
    `Translate a product card of a premium vintage furniture shop from ${LANG_NAME[from]}`,
    `into ${targets.map((l) => LANG_NAME[l]).join(" and ")}.`,
    "Keep the calm, expensive, editorial tone; keep proper names, styles (rococo, Gustavian, Biedermeier),",
    "measurements and centuries as they are. Do not invent facts, do not add commentary.",
    `Answer with strict JSON only: {${targets.map((l) => `"${l}":{"title","era","desc"}`).join(",")}}.`,
    "",
    JSON.stringify({ [from]: src }),
  ].join("\n");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a precise translator for an antique furniture catalogue. Reply with JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 1.1,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const raw = (await res.json())?.choices?.[0]?.message?.content || "{}";
  const parsed = extractJson(raw);
  const norm = (o = {}) => ({
    title: String(o.title || "").trim(),
    era: String(o.era || "").trim(),
    desc: String(o.desc || "").trim(),
  });
  return Object.fromEntries(targets.map((l) => [l, norm(parsed[l])]));
}

const run = async () => {
  if (!key()) {
    console.error("Ключ DeepSeek не задан — задайте его в настройках площадки");
    process.exit(1);
  }
  const list = JSON.parse(fs.readFileSync(STORE, "utf8"));
  const todo = list.filter((p) => langs.some((l) => !filled(p.tr?.[l]))).slice(0, limit);
  console.log(`товаров в каталоге: ${list.length} · без перевода на ${langs.join(", ")}: ${todo.length}`);
  if (dry || !todo.length) return;

  let done = 0;
  let failed = 0;
  const started = Date.now();

  for (const p of todo) {
    const from = source(p.tr);
    if (!from) {
      console.log(`  №${p.n}: пустая карточка — пропускаем`);
      continue;
    }
    const targets = langs.filter((l) => !filled(p.tr?.[l]));
    try {
      const out = await translate(p.tr[from], from, targets);
      /* Читаем файл заново: пока шёл перевод, каталог мог измениться
         из панели — перезаписывать его целиком старой копией нельзя. */
      const fresh = JSON.parse(fs.readFileSync(STORE, "utf8"));
      const row = fresh.find((x) => x.id === p.id);
      if (row) {
        row.tr = row.tr || {};
        for (const l of targets) if (out[l]?.title) row.tr[l] = out[l];
        fs.writeFileSync(STORE + ".tmp", JSON.stringify(fresh, null, 1), "utf8");
        fs.renameSync(STORE + ".tmp", STORE);
      }
      done++;
      const per = (Date.now() - started) / done;
      const left = Math.round(((todo.length - done) * per) / 1000);
      console.log(`  ${done}/${todo.length} №${p.n} ${from}→${targets.join(",")} · «${out[targets[0]]?.title || "?"}» · осталось ~${left} с`);
    } catch (e) {
      failed++;
      console.warn(`  №${p.n}: ${String(e.message || e)}`);
    }
    await wait(700);
  }

  console.log(`\nпереведено: ${done} · не удалось: ${failed} · за ${Math.round((Date.now() - started) / 1000)} с`);
};

run().catch((e) => {
  console.error("СБОЙ:", e.message);
  process.exit(1);
});
