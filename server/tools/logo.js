/**
 * Готовит логотип для сайта из исходного файла.
 *
 * Исходник — 1448×386 с прозрачным фоном: латунный диван, разделитель
 * и тёмно-коричневое слово SOFA.LV. На светлой бумаге это читается,
 * а в тёмном подвале слово пропадает — поэтому делаем второй вариант,
 * где тёмные пиксели заменены на сливочный тон, а латунь оставлена.
 *
 * Отдельно вырезаем сам диван — он идёт значком вкладки и картинкой
 * для ссылок в мессенджерах, где нужна квадратная картинка.
 *
 * Исходник лежит в /assets и на сайт не попадает — в public кладутся
 * только готовые размеры.
 *
 *   node server/tools/logo.js [исходник.png]
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "public", "logo");

const src = process.argv[2] || path.join(ROOT, "assets", "sofalogo.png");
const WIDTHS = [240, 360, 480, 720];
const PNG = { compressionLevel: 9, palette: true, quality: 90 };

/** Сливочный тон подвала — в него перекрашиваем тёмное слово. */
const CREAM = [232, 223, 200];

/**
 * Светлый вариант: тёмные пиксели становятся сливочными, латунь
 * остаётся золотой. Решаем по насыщенности — у латуни она высокая,
 * у коричневого слова низкая.
 */
async function lighten(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    const a = out[i + 3];
    if (!a) continue;
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    /* Латунь: насыщенная и не тёмная — не трогаем, только чуть поднимаем */
    if (sat > 0.45 && lum > 90) {
      out[i] = Math.min(255, r * 1.08);
      out[i + 1] = Math.min(255, g * 1.08);
      out[i + 2] = Math.min(255, b * 1.08);
      continue;
    }
    /* Тёмное слово: чем темнее пиксель, тем ярче сливочный тон —
       так сохраняется сглаживание по краям букв. */
    const k = 1 - lum / 200;
    out[i] = Math.round(r + (CREAM[0] - r) * Math.max(0, Math.min(1, k)));
    out[i + 1] = Math.round(g + (CREAM[1] - g) * Math.max(0, Math.min(1, k)));
    out[i + 2] = Math.round(b + (CREAM[2] - b) * Math.max(0, Math.min(1, k)));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } }).png();
}

const human = (b) => (b > 1024 ? Math.round(b / 1024) + " КБ" : b + " Б");

const save = async (pipe, name) => {
  const file = path.join(OUT, name);
  await pipe.toFile(file);
  console.log(`  ${name.padEnd(28)} ${human(fs.statSync(file).size)}`);
};

const run = async () => {
  await fsp.mkdir(OUT, { recursive: true });
  const trimmed = await sharp(src).trim({ threshold: 1 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log(`исходник обрезан по краям: ${meta.width}×${meta.height}`);

  const light = await (await lighten(trimmed)).toBuffer();

  /* WebP тут проигрывает: рисунок плоский, цветов мало, и палитровый
     PNG выходит вдвое легче при том же качестве. */
  console.log("\nполная надпись:");
  for (const w of WIDTHS) {
    await save(sharp(trimmed).resize({ width: w }).png(PNG), `sofa-${w}.png`);
    await save(sharp(light).resize({ width: w }).png(PNG), `sofa-light-${w}.png`);
  }

  /* Диван занимает примерно первую треть ширины — вырезаем квадрат */
  const markW = Math.round(meta.height * 1.25);
  console.log("\nзнак (диван):");
  const markPipe = () => sharp(trimmed).extract({ left: 0, top: 0, width: markW, height: meta.height });
  const square = await markPipe()
    .resize({ width: 512, height: 512, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await save(sharp(square).png(PNG), "mark-512.png");

  /* Значок вкладки: тонкий контур дивана на прозрачном фоне в 32 px
     не разглядеть, поэтому кладём светлый знак на тёмную плашку —
     так он читается и в списке закладок, и на телефоне. */
  console.log("\nзначок вкладки:");
  const lightMark = await (await lighten(await markPipe().png().toBuffer())).toBuffer();
  const tile = async (size) => {
    const pad = Math.round(size * 0.13);
    const r = Math.round(size * 0.18);
    const rounded = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#10150e"/></svg>`
    );
    const glyph = await sharp(lightMark)
      .resize({ width: size - pad * 2, fit: "inside" })
      .png()
      .toBuffer();
    return sharp(rounded).composite([{ input: glyph, gravity: "centre" }]).png(PNG);
  };
  for (const size of [512, 180, 32]) await save(await tile(size), `icon-${size}.png`);

  /* Картинка для ссылок: логотип на бумажном фоне, 1200×630 */
  console.log("\nкартинка для ссылок:");
  const share = sharp({
    create: { width: 1200, height: 630, channels: 4, background: { r: 250, g: 246, b: 238, alpha: 1 } },
  })
    .composite([{ input: await sharp(trimmed).resize({ width: 820 }).toBuffer(), gravity: "centre" }])
    .jpeg({ quality: 88 });
  await save(share, "share.jpg");
};

run().catch((e) => {
  console.error("СБОЙ:", e.message);
  process.exit(1);
});
