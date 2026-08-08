/**
 * Письма магазина: покупателю, владельцу и партнёру.
 *
 * Отправка идёт через Resend. Письмо — вещь односторонняя: если оно
 * не ушло, покупатель об этом не узнает, поэтому здесь три страховки.
 *
 * Первая: повтор при временной неудаче (сеть, 429, 5xx) с нарастающей
 * паузой. Вторая: отметка об отправке прямо в заказе — одно и то же
 * событие приходит и из вебхука, и со страницы успеха, и письмо не
 * должно уйти дважды. Третья: любая ошибка попадает в журнал заказа,
 * так что в панели видно, кому написать руками.
 *
 * Почта никогда не роняет заказ: сбой отправки не отменяет оплату.
 */
import * as settings from "./settings.js";
import { PLATFORM } from "./legal.js";

const API = "https://api.resend.com";

const key = () => settings.get("resendKey");
/** Отправитель. Домен должен быть подтверждён в Resend, иначе отказ. */
export const sender = () => settings.get("orderFrom") || `${PLATFORM.brand} <info@sofa.lv>`;
export const ready = () => Boolean(key());

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Понятное объяснение вместо служебного текста Resend. */
function explain(status, body) {
  const msg = String(body?.message || body?.error?.message || "").trim();
  if (status === 401 || status === 403) {
    if (/domain is not verified|not verified/i.test(msg))
      return `Домен отправителя не подтверждён в Resend. Проверьте адрес «${sender()}» и записи DNS.`;
    if (/plan includes/i.test(msg)) return `Тариф Resend не позволяет: ${msg}`;
    return "Resend не принял ключ — проверьте его в настройках.";
  }
  if (status === 422) return `Resend отказал: ${msg || "письмо не прошло проверку"}`;
  if (status === 429) return "Resend временно ограничил отправку — попробуем позже.";
  if (status >= 500) return "Resend недоступен.";
  return msg || `Resend ответил ${status}`;
}

/**
 * Отправка одного письма. Возвращает id письма в Resend.
 * Бросает исключение с понятным текстом — вызывающий решает, что делать.
 */
export async function send({ to, subject, html, text, replyTo, tags, idempotencyKey }) {
  if (!key()) throw new Error("Ключ Resend не задан");
  if (!to) throw new Error("Некому отправлять: адрес пуст");

  const body = {
    from: sender(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(tags ? { tags } : {}),
  };

  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await wait(attempt * 1500);
    let res;
    try {
      res = await fetch(`${API}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key()}`,
          "Content-Type": "application/json",
          /* Повтор того же письма Resend отбросит сам */
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      last = `Сеть: ${String(e.message || e)}`;
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) return data.id;
    last = explain(res.status, data);
    /* Отказ по существу повторять бессмысленно */
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(last || "Письмо не ушло");
}

/** Подтверждённые домены — чтобы в панели было видно, с чего слать можно. */
export async function domains() {
  if (!key()) return { ok: false, error: "Ключ Resend не задан", list: [] };
  try {
    const res = await fetch(`${API}/domains`, {
      headers: { Authorization: `Bearer ${key()}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: explain(res.status, data), list: [] };
    const list = (data.data || []).map((d) => ({
      name: d.name,
      status: d.status,
      region: d.region || "",
    }));
    const addr = sender().match(/<([^>]+)>/)?.[1] || sender();
    const domain = addr.split("@")[1] || "";
    const mine = list.find((d) => d.name.toLowerCase() === domain.toLowerCase());
    return {
      ok: true,
      list,
      from: addr,
      domain,
      verified: mine?.status === "verified",
      hint: mine
        ? mine.status === "verified"
          ? ""
          : `Домен ${domain} заведён, но не подтверждён (${mine.status}).`
        : `Домен ${domain} не заведён в этом аккаунте Resend. Письма с него уходить не будут.`,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e), list: [] };
  }
}

/* ── оформление ──────────────────────────────────────────────────
   Почтовые программы понимают только простую вёрстку: таблицы и
   стили в атрибутах. Ни сеток, ни внешних шрифтов, ни картинок с
   чужих адресов — иначе письмо развалится или уйдёт в спам. */

const C = {
  paper: "#faf6ee",
  card: "#ffffff",
  ink: "#241f1a",
  dim: "#6b6257",
  hair: "#e6ddcc",
  brass: "#a07b3c",
  dark: "#2b2b24",
};

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** €1 234,00 — как на витрине. */
export const money = (eur) =>
  "€" +
  Number(eur || 0)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * Собирает письмо целиком: шапка с названием магазина, содержимое,
 * подвал с реквизитами. Возвращает html и текстовую копию — часть
 * почтовых программ показывает именно её.
 */
export function layout({ lang, preheader, heading, blocks, cta, footNote }) {
  const site = PLATFORM.site;
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 18px;">
      <a href="${site}" style="text-decoration:none;color:${C.dark};font:600 15px/1 Georgia,'Times New Roman',serif;letter-spacing:.22em;text-transform:uppercase;">${PLATFORM.brand}</a>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.hair};border-radius:14px;padding:26px 24px;">
      <h1 style="margin:0 0 16px;font:400 23px/1.28 Georgia,'Times New Roman',serif;color:${C.ink};">${esc(heading)}</h1>
      ${blocks}
      ${
        cta
          ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td style="background:${C.brass};border-radius:10px;">
        <a href="${esc(cta.url)}" style="display:inline-block;padding:12px 22px;color:#fff;text-decoration:none;font:600 14px/1 Helvetica,Arial,sans-serif;letter-spacing:.03em;">${esc(cta.label)}</a>
      </td></tr></table>`
          : ""
      }
    </td></tr>
    <tr><td style="padding:16px 6px 0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:${C.dim};">
      ${footNote ? `<p style="margin:0 0 10px;">${footNote}</p>` : ""}
      <p style="margin:0;">${esc(PLATFORM.legalName)} · ${esc(PLATFORM.regNr)} · PVN ${esc(PLATFORM.vatNr)}<br>
      ${esc(PLATFORM.address)}<br>
      <a href="mailto:${PLATFORM.email}" style="color:${C.dim};">${PLATFORM.email}</a> · <a href="${site}" style="color:${C.dim};">sofa.lv</a></p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  return { html, text };
}

/** Абзац обычного текста письма. */
export const p = (s) =>
  `<p style="margin:0 0 12px;font:400 15px/1.62 Helvetica,Arial,sans-serif;color:${C.ink};">${s}</p>`;

/** Тихая строчка — пояснение мелким шрифтом. */
export const note = (s) =>
  `<p style="margin:0 0 12px;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${C.dim};">${s}</p>`;

/** Список товаров с итогами. Формат сумм задаёт язык письма. */
export function itemsTable({ items, rows, fmt = money }) {
  const lines = items
    .map(
      (i) => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid ${C.hair};font:400 14px/1.45 Helvetica,Arial,sans-serif;color:${C.ink};">
        ${esc(i.title)}<br><span style="color:${C.dim};font-size:12.5px;">№ ${esc(i.n)}</span>
      </td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid ${C.hair};font:400 14px/1.45 Helvetica,Arial,sans-serif;color:${C.ink};white-space:nowrap;">${fmt(i.price)}</td>
    </tr>`
    )
    .join("");

  const totals = rows
    .map(
      ([label, value, strong]) => `<tr>
      <td style="padding:${strong ? "12px 0 0" : "7px 0 0"};font:${strong ? "600" : "400"} ${strong ? "15px" : "14px"}/1.4 Helvetica,Arial,sans-serif;color:${strong ? C.ink : C.dim};">${esc(label)}</td>
      <td align="right" style="padding:${strong ? "12px 0 0" : "7px 0 0"};font:${strong ? "600" : "400"} ${strong ? "15px" : "14px"}/1.4 Helvetica,Arial,sans-serif;color:${strong ? C.ink : C.dim};white-space:nowrap;">${esc(value)}</td>
    </tr>`
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">${lines}${totals}</table>`;
}

/** Пары «что — значение»: доставка, контакты, реквизиты. */
export function facts(pairs) {
  const rows = pairs
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `<tr>
      <td style="padding:4px 14px 4px 0;font:400 13px/1.55 Helvetica,Arial,sans-serif;color:${C.dim};white-space:nowrap;vertical-align:top;">${esc(k)}</td>
      <td style="padding:4px 0;font:400 13.5px/1.55 Helvetica,Arial,sans-serif;color:${C.ink};">${esc(v)}</td>
    </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;">${rows}</table>`;
}

export { esc };
