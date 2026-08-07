/**
 * Настройки площадки, которые владелец меняет сам из панели.
 *
 * Значение берётся из data/settings.json, если его там нет — из окружения,
 * иначе из умолчания. Так ключи можно и дальше держать в systemd, но
 * комиссию, доставку и уведомления больше не нужно править на сервере.
 */
import fs from "node:fs";
import path from "node:path";

let FILE = "";
let cache = null;

export function init(dataDir) {
  FILE = path.join(dataDir, "settings.json");
  load();
}

function load() {
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cache = {};
  }
  return cache;
}

/** Схема: тип, умолчание и переменная окружения-запасной вариант. */
const FIELDS = {
  commission: { type: "number", env: "COMMISSION", def: 20, min: 0, max: 90 },
  deliveryFee: { type: "number", env: "DELIVERY_FEE", def: 50, min: 0, max: 2000 },
  holdDays: { type: "number", env: "PAYOUT_HOLD_DAYS", def: 14, min: 0, max: 90 },
  reserveMinutes: { type: "number", env: "RESERVE_MINUTES", def: 35, min: 5, max: 1440 },
  pickupAddress: { type: "string", env: "PICKUP_ADDRESS", def: "Talsi, Latvija" },
  telegramToken: { type: "secret", env: "TELEGRAM_BOT_TOKEN", def: "" },
  telegramChat: { type: "string", env: "TELEGRAM_CHAT_ID", def: "" },
  resendKey: { type: "secret", env: "RESEND_API_KEY", def: "" },
  orderEmail: { type: "string", env: "ORDER_EMAIL", def: "" },
  orderFrom: { type: "string", env: "ORDER_FROM", def: "info@sofa.lv" },
  deepseekKey: { type: "secret", env: "DEEPSEEK_API_KEY", def: "" },
  /* Песочница Stripe: те же сценарии, но без настоящих денег.
     Ключи боевого режима остаются в окружении сервера. */
  stripeMode: { type: "string", env: "STRIPE_MODE", def: "live" },
  stripeTestSecret: { type: "secret", env: "STRIPE_TEST_SECRET_KEY", def: "" },
  stripeTestWebhook: { type: "secret", env: "STRIPE_TEST_WEBHOOK_SECRET", def: "" },
  stripeTestConnectWebhook: { type: "secret", env: "STRIPE_TEST_CONNECT_WEBHOOK_SECRET", def: "" },
};

/** Сейчас работаем на настоящих деньгах или в песочнице. */
export const mode = () => (get("stripeMode") === "test" ? "test" : "live");
export const isTest = () => mode() === "test";

/** Ключ Stripe и секреты вебхуков — по текущему режиму. */
export const stripeKey = () =>
  isTest() ? get("stripeTestSecret") : process.env.STRIPE_SECRET_KEY || "";
export const webhookSecret = () =>
  isTest() ? get("stripeTestWebhook") : process.env.STRIPE_WEBHOOK_SECRET || "";
export const connectWebhookSecret = () =>
  isTest() ? get("stripeTestConnectWebhook") : process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "";

export function get(name) {
  if (!cache) load();
  const f = FIELDS[name];
  if (!f) return undefined;
  const raw = cache[name] !== undefined && cache[name] !== "" ? cache[name] : process.env[f.env] ?? f.def;
  if (f.type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return f.def;
    return Math.min(f.max, Math.max(f.min, n));
  }
  return String(raw ?? "");
}

/** Источник значения — чтобы в панели было видно, что задано вручную. */
export const origin = (name) =>
  cache?.[name] !== undefined && cache?.[name] !== "" ? "panel" : process.env[FIELDS[name]?.env] ? "env" : "default";

/** Для панели: секреты не отдаём, только признак «задан». */
export function forPanel() {
  const out = {};
  for (const [name, f] of Object.entries(FIELDS)) {
    out[name] =
      f.type === "secret"
        ? { set: Boolean(get(name)), origin: origin(name) }
        : { value: get(name), origin: origin(name) };
  }
  return out;
}

export async function save(patch) {
  if (!cache) load();
  const next = { ...cache };
  for (const [name, f] of Object.entries(FIELDS)) {
    if (!(name in patch)) continue;
    const v = patch[name];
    if (v === null) {
      delete next[name]; // вернуть к значению из окружения
      continue;
    }
    if (f.type === "number") {
      const n = Number(v);
      if (Number.isFinite(n)) next[name] = Math.min(f.max, Math.max(f.min, n));
    } else {
      next[name] = String(v).trim();
    }
  }
  await fs.promises.writeFile(FILE, JSON.stringify(next, null, 1), "utf8");
  cache = next;
  return forPanel();
}

/** Что из настроенного реально работает — показываем строкой здоровья. */
export const health = () => ({
  mode: mode(),
  stripe: Boolean(stripeKey()),
  stripeWebhook: Boolean(webhookSecret()),
  connectWebhook: Boolean(connectWebhookSecret()),
  telegram: Boolean(get("telegramToken") && get("telegramChat")),
  email: Boolean(get("resendKey") && get("orderEmail")),
  translate: Boolean(get("deepseekKey")),
});
