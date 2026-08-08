/**
 * Готовит варианты для всех уже загруженных фотографий.
 *
 * Запускается отдельным процессом и с пониженным приоритетом: рядом
 * работает сайт, и очередь записи заказов не должна ждать кодирование.
 *
 *   node server/tools/warm.js [--widths 320,640] [--limit 50]
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as images from "../images.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const widths = String(arg("--widths", images.WIDTHS.join(",")))
  .split(",")
  .map(Number)
  .filter((w) => images.WIDTHS.includes(w));
const limit = Number(arg("--limit", 0)) || Infinity;

images.init({ uploads: UPLOADS, cache: path.join(DATA, "cache") });

const human = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + " МБ" : Math.round(b / 1024) + " КБ");

const run = async () => {
  if (!images.hasSharp()) {
    console.error("sharp не установлен — обрабатывать нечем");
    process.exit(1);
  }
  const files = (await fsp.readdir(UPLOADS)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).slice(0, limit);
  const before = await images.usage();
  console.log(`фотографий: ${files.length} · ширины: ${widths.join(", ")}`);

  const started = Date.now();
  let done = 0;
  let made = 0;

  /* Два потока: столько же, сколько разрешено серверу, чтобы прогрев
     и живые запросы не дрались за процессор. */
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      made += await images.warm(f, widths);
      done++;
      if (done % 25 === 0 || done === files.length) {
        const per = (Date.now() - started) / done;
        const left = Math.round(((files.length - done) * per) / 1000);
        console.log(`  ${done}/${files.length} · вариантов ${made} · осталось ~${left} с`);
      }
    }
  };
  await Promise.all([worker(), worker()]);

  const after = await images.usage();
  console.log(
    `\nготово за ${Math.round((Date.now() - started) / 1000)} с` +
      `\nоригиналы: ${after.originals.files} файлов, ${human(after.originals.bytes)}` +
      `\nварианты : ${after.variants.files} файлов, ${human(after.variants.bytes)}` +
      ` (было ${human(before.variants.bytes)})`
  );
  /* Даём отложенной записи описаний дойти до диска */
  await new Promise((r) => setTimeout(r, 2000));
};

run().catch((e) => {
  console.error("СБОЙ:", e.message);
  process.exit(1);
});
