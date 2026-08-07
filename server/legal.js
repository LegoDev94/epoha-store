/**
 * Юридический слой площадки SOFA.LV.
 *
 * Документы лежат рядом в /terms как markdown с версией в имени файла.
 * Для каждого считается SHA-256 — именно он попадает в запись о принятии,
 * чтобы позже можно было доказать, ЧТО именно партнёр принял.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TERMS_DIR = path.join(__dirname, "terms");

/** Оператор площадки — реквизиты показываются покупателю и в договоре. */
export const PLATFORM = {
  legalName: 'SIA "RANČO GOBAS"',
  brand: "SOFA.LV",
  regNr: "40203253729",
  vatNr: "LV40203253729",
  address: '"Gobas", Ģibuļu pag., Talsu nov., LV-3297',
  email: "info@sofa.lv",
  site: "https://sofa.lv",
};

/** Версии документов. Меняешь текст — поднимаешь версию и имя файла. */
export const DOCS = {
  partner: {
    id: "partner",
    version: "1.0",
    lang: "lv",
    file: "partner-terms-lv-1.0.md",
    title: "SOFA.LV Partneru sadarbības un preču izvietošanas noteikumi",
    url: "/#/legal/partner",
  },
  buyer: {
    id: "buyer",
    version: "1.0",
    lang: "lv",
    file: "buyer-terms-lv-1.0.md",
    title: "SOFA.LV lietošanas un pirkuma noteikumi",
    url: "/#/legal/buyer",
  },
  privacy: {
    id: "privacy",
    version: "1.0",
    lang: "lv",
    file: "privacy-lv-1.0.md",
    title: "SOFA.LV Privātuma politika",
    url: "/#/legal/privacy",
  },
};

const cache = new Map();

/** Документ с телом и хешем; тело читается один раз за жизнь процесса. */
export function loadDoc(id) {
  const meta = DOCS[id];
  if (!meta) throw new Error(`Неизвестный документ: ${id}`);
  if (cache.has(id)) return cache.get(id);
  let body = "";
  try {
    body = fs.readFileSync(path.join(TERMS_DIR, meta.file), "utf8");
  } catch {
    body = `# ${meta.title}\n\n_Dokumenta teksts tiek gatavots._`;
  }
  const doc = {
    ...meta,
    body,
    hash: crypto.createHash("sha256").update(body, "utf8").digest("hex"),
    bytes: Buffer.byteLength(body, "utf8"),
  };
  cache.set(id, doc);
  return doc;
}

export const listDocs = () =>
  Object.keys(DOCS).map((id) => {
    const d = loadDoc(id);
    return { id: d.id, version: d.version, title: d.title, hash: d.hash, url: d.url, lang: d.lang };
  });

/** Текст чекбокса и кнопки — часть доказательства, поэтому живут в коде
    и попадают в запись о принятии дословно. */
export const CONSENT = {
  checkbox:
    "Es apliecinu, ka esmu tiesīgs pārstāvēt Partneri un noslēgt šo līgumu Partnera vārdā. " +
    "Esmu izlasījis un piekrītu SOFA.LV Partneru sadarbības un preču izvietošanas noteikumiem, " +
    "Privātuma politikai un maksājumu apstrādes kārtībai, izmantojot Stripe Connect. " +
    "Es saprotu, ka, nospiežot pogu “Apstiprināt un pievienoties SOFA.LV”, starp Partneri un " +
    'SIA “RANČO GOBAS” tiek noslēgts juridiski saistošs līgums elektroniskā veidā.',
  checkboxVersion: "1.0",
  button: "Apstiprināt un pievienoties SOFA.LV",
  buttonVersion: "1.0",
};

/** IP клиента с учётом обратного прокси nginx. */
export const clientIp = (req) =>
  String(req.get("x-forwarded-for") || "").split(",")[0].trim() ||
  req.socket?.remoteAddress ||
  "";

/**
 * Запись о заключении договора в электронном виде.
 * Хранится в карточке партнёра и больше не меняется.
 */
export function acceptanceRecord({ req, seller, representative }) {
  const doc = loadDoc("partner");
  const privacy = loadDoc("privacy");
  return {
    termsId: doc.id,
    termsVersion: doc.version,
    termsTitle: doc.title,
    termsUrl: doc.url,
    termsSha256: doc.hash,
    privacyVersion: privacy.version,
    privacySha256: privacy.hash,
    checkboxText: CONSENT.checkbox,
    checkboxTextVersion: CONSENT.checkboxVersion,
    buttonText: CONSENT.button,
    buttonTextVersion: CONSENT.buttonVersion,
    acceptedAt: new Date().toISOString(),
    acceptedIp: clientIp(req),
    acceptedUserAgent: String(req.get("user-agent") || "").slice(0, 300),
    partnerId: seller.id,
    companyName: seller.company?.name || seller.name,
    registrationNumber: seller.company?.regNr || "",
    representativeName: representative?.name || seller.company?.contactPerson || "",
    representativeEmail: representative?.email || seller.company?.email || "",
    representativePosition: representative?.position || seller.company?.contactPosition || "",
    platform: { legalName: PLATFORM.legalName, regNr: PLATFORM.regNr },
  };
}

/* ── PDF-копия принятых условий ─────────────────────────────────── */

/** Шрифт с латышской диакритикой: в репозитории, в системе Linux, затем Windows. */
const FONT_CANDIDATES = {
  regular: [
    path.join(__dirname, "fonts", "LiberationSans-Regular.ttf"),
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
  ],
  bold: [
    path.join(__dirname, "fonts", "LiberationSans-Bold.ttf"),
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
  ],
};
const findFont = (kind) => FONT_CANDIDATES[kind].find((f) => fs.existsSync(f)) || null;

/**
 * PDF с принятыми условиями: шапка с реквизитами, блок доказательства
 * принятия и полный текст документа. Возвращает Buffer.
 */
export async function acceptancePdf({ acceptance, seller }) {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = loadDoc("partner");
  const regular = findFont("regular");
  const bold = findFont("bold");

  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: {
      Title: `${doc.title} v${doc.version}`,
      Author: PLATFORM.legalName,
      Subject: `Partnera apstiprinājums · ${acceptance.companyName}`,
    },
  });
  if (regular) pdf.registerFont("body", regular);
  if (bold) pdf.registerFont("head", bold);
  const F = (name) => pdf.font(name === "head" && bold ? "head" : regular ? "body" : "Helvetica");

  const chunks = [];
  pdf.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));

  const line = (y = 8) => {
    pdf.moveDown(y / 16);
    const x = pdf.page.margins.left;
    pdf
      .moveTo(x, pdf.y)
      .lineTo(pdf.page.width - pdf.page.margins.right, pdf.y)
      .lineWidth(0.7)
      .strokeColor("#a98a50")
      .stroke();
    pdf.moveDown(0.5);
  };

  /* шапка */
  F("head").fontSize(9).fillColor("#7a6136").text(PLATFORM.brand.toUpperCase(), { characterSpacing: 2 });
  F("body").fontSize(8.5).fillColor("#555").text(
    `${PLATFORM.legalName} · Reģ. Nr. ${PLATFORM.regNr} · PVN Nr. ${PLATFORM.vatNr} · ${PLATFORM.address}`
  );
  line();

  F("head").fontSize(15).fillColor("#1d1f18").text(doc.title);
  F("body").fontSize(9).fillColor("#666").text(
    `Versija ${doc.version} · SHA-256: ${doc.hash}`
  );
  pdf.moveDown(1);

  /* доказательство принятия */
  F("head").fontSize(11).fillColor("#1d1f18").text("Apstiprinājums par līguma noslēgšanu elektroniskā veidā");
  pdf.moveDown(0.4);
  const rows = [
    ["Partneris", acceptance.companyName],
    ["Reģistrācijas Nr.", acceptance.registrationNumber || "—"],
    ["PVN Nr.", seller?.company?.vatNr || "—"],
    ["Juridiskā adrese", seller?.company?.address || "—"],
    ["Pārstāvis", acceptance.representativeName || "—"],
    ["Pārstāvja amats", acceptance.representativePosition || "—"],
    ["E-pasts", acceptance.representativeEmail || "—"],
    ["Apstiprināts", new Date(acceptance.acceptedAt).toLocaleString("lv-LV", { timeZone: "Europe/Riga" }) + " (Rīgas laiks)"],
    ["IP adrese", acceptance.acceptedIp || "—"],
    ["Ierīce / pārlūks", acceptance.acceptedUserAgent || "—"],
    ["Partnera ID", acceptance.partnerId],
    ["Stripe konts", seller?.stripe?.accountId || "—"],
  ];
  for (const [k, v] of rows) {
    const y = pdf.y;
    F("body").fontSize(9).fillColor("#666").text(k, pdf.page.margins.left, y, { width: 130 });
    F("body").fontSize(9).fillColor("#1d1f18").text(String(v), pdf.page.margins.left + 140, y, {
      width: pdf.page.width - pdf.page.margins.left - pdf.page.margins.right - 140,
    });
    pdf.moveDown(0.25);
  }

  pdf.moveDown(0.6);
  F("body").fontSize(8.5).fillColor("#444").text(`Apliecinājuma teksts: „${acceptance.checkboxText}“`, {
    align: "justify",
  });
  F("body").fontSize(8.5).fillColor("#444").text(`Pogas teksts: „${acceptance.buttonText}“`);
  line();

  /* текст документа */
  pdf.addPage();
  renderMarkdown(pdf, doc.body, F);

  /* нумерация страниц */
  const range = pdf.bufferedPageRange?.() || { start: 0, count: 0 };
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    F("body").fontSize(7.5).fillColor("#999").text(
      `${doc.title} · v${doc.version} · lpp. ${i + 1}`,
      pdf.page.margins.left,
      pdf.page.height - 38,
      { width: pdf.page.width - pdf.page.margins.left - pdf.page.margins.right, align: "center" }
    );
  }

  pdf.end();
  return done;
}

/** Очень небольшой markdown: заголовки, списки, жирный, абзацы. */
function renderMarkdown(pdf, md, F) {
  for (const raw of String(md).split("\n")) {
    const s = raw.trimEnd();
    if (!s.trim()) {
      pdf.moveDown(0.35);
      continue;
    }
    const h = s.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const size = [15, 12.5, 10.8, 10][h[1].length - 1];
      pdf.moveDown(h[1].length <= 2 ? 0.7 : 0.45);
      F("head").fontSize(size).fillColor("#1d1f18").text(strip(h[2]));
      pdf.moveDown(0.2);
      continue;
    }
    const li = s.match(/^\s*[-*•]\s+(.*)$/);
    if (li) {
      F("body").fontSize(9.5).fillColor("#222").text("•  " + strip(li[1]), { indent: 10, align: "justify" });
      continue;
    }
    const num = s.match(/^\s*(\d+(?:\.\d+)*\.?)\s+(.*)$/);
    if (num) {
      F("body").fontSize(9.5).fillColor("#222").text(`${num[1]} ${strip(num[2])}`, { align: "justify" });
      continue;
    }
    F("body").fontSize(9.5).fillColor("#222").text(strip(s), { align: "justify" });
  }
}
const strip = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1").replace(/[*_`]/g, "");
