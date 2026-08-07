/**
 * Stripe Connect для SOFA.LV — маркетплейс с моделью Direct Charges.
 *
 * Деньги покупателя идут прямо на connected account партнёра (он и есть
 * продавец товара), площадка удерживает свою комиссию как application fee.
 * График выплат партнёру — ручной, поэтому деньги не уходят на его банк
 * раньше, чем истечёт 14-дневное право отказа покупателя.
 *
 * Библиотека stripe не используется: только form-urlencoded поверх fetch.
 */
import crypto from "node:crypto";
import * as settings from "./settings.js";

const API = "https://api.stripe.com/v1";
/* Ключ зависит от режима: боевой лежит в окружении, тестовый — в настройках */
const key = () => settings.stripeKey();
export const hasStripe = () => Boolean(key());
export const mode = () => settings.mode();

/** Плоский объект → скобочная нотация Stripe: {a:{b:1}} → a[b]=1 */
function encode(obj, prefix = "", form = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => encode({ [i]: item }, name, form));
    else if (typeof v === "object") encode(v, name, form);
    else form.set(name, String(v));
  }
  return form;
}

export class StripeError extends Error {
  constructor(status, body) {
    const e = body?.error || {};
    super(e.message || `Stripe ${status}`);
    this.status = status;
    this.code = e.code || e.type || "";
    this.param = e.param || "";
    this.raw = body;
  }
}

/**
 * Запрос к Stripe.
 * account — id connected account: запрос выполняется от его имени.
 */
async function call(path, { method = "GET", data, account, idempotencyKey } = {}) {
  if (!key()) throw new Error("STRIPE_SECRET_KEY не задан на сервере");
  const headers = {
    Authorization: `Bearer ${key()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (account) headers["Stripe-Account"] = account;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const body = data ? encode(data).toString() : undefined;
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, json);
  return json;
}
export const stripeCall = call;

/* ── аккаунты партнёров ─────────────────────────────────────────── */

/**
 * Конфигурация connected account.
 * dashboard=express     — партнёр видит свою панель Stripe с выплатами;
 * fees.payer=application — эквайринг Stripe оплачивает площадка. Stripe не
 *   разрешает Express-дашборд на других условиях: «your platform must collect
 *   fees and be liable for negative balances». Поэтому партнёр получает ровно
 *   цену товара минус комиссию, а эквайринг мы платим из комиссии;
 * losses.payments=application — убытки/споры на площадке, и ТОЛЬКО при этом
 *   условии Stripe разрешает площадке управлять графиком выплат;
 * requirement_collection не шлём — по умолчанию stripe (проверку ведёт Stripe).
 */
export const accountPayload = (seller, { site }) => ({
  country: seller.company?.country || "LV",
  email: seller.company?.email || seller.contact || undefined,
  default_currency: "eur",
  business_type: seller.company?.form === "individual" ? "individual" : "company",
  controller: {
    stripe_dashboard: { type: "express" },
    fees: { payer: process.env.CONNECT_FEES_PAYER || "application" },
    losses: { payments: "application" },
  },
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
  business_profile: {
    mcc: "5712", // мебель и предметы интерьера
    name: seller.company?.name || seller.name,
    url: site,
    product_description:
      "Vintage and antique furniture sold through the sofa.lv marketplace",
    support_email: seller.company?.email || undefined,
  },
  settings: {
    payouts: {
      schedule: { interval: "manual" }, // выплату инициирует площадка
      statement_descriptor: "SOFA.LV",
    },
  },
  metadata: { partner_id: seller.id, platform: "sofa.lv" },
});

export const createAccount = (seller, opts) =>
  call("/accounts", { method: "POST", data: accountPayload(seller, opts) });

/**
 * Понятное объяснение вместо служебного текста Stripe.
 * Профиль площадки в Connect заполняется владельцем один раз, руками.
 */
export function explain(e) {
  const m = String(e?.message || e || "");
  if (/complete your platform profile|questionnaire/i.test(m))
    return {
      partner: "Maksājumu pieslēgšana pagaidām nav pieejama. SOFA.LV pabeidz Stripe Connect aktivizāciju — mēs sazināsimies ar Jums, tiklīdz varēs turpināt.",
      admin:
        "Stripe ещё не активировал Connect для площадки: заполните анкету платформы в дашборде " +
        "(dashboard.stripe.com/connect/accounts/overview) и подтвердите ответственность за споры " +
        "в настройках профиля платформы. Без этого счета партнёров не создаются.",
    };
  if (/must control losses|liable for negative balances/i.test(m))
    return {
      partner: "Maksājumu pieslēgšana pagaidām nav pieejama. Lūdzu, sazinieties ar SOFA.LV.",
      admin:
        "В профиле платформы Stripe не принята ответственность за отрицательные балансы и споры. " +
        "Примите её на dashboard.stripe.com/settings/connect/platform_profile — иначе Stripe не даёт " +
        "площадке управлять выплатами партнёров.",
    };
  return { partner: m, admin: m };
}

export const getAccount = (id) => call(`/accounts/${id}`);
export const deleteAccount = (id) => call(`/accounts/${id}`, { method: "DELETE" });

export const accountLink = (id, { refreshUrl, returnUrl, type = "account_onboarding" }) =>
  call("/account_links", {
    method: "POST",
    data: { account: id, refresh_url: refreshUrl, return_url: returnUrl, type },
  });

export const loginLink = (id) => call(`/accounts/${id}/login_links`, { method: "POST" });

/** Короткая сводка состояния аккаунта для интерфейса. */
export function accountState(a = {}) {
  const req = a.requirements || {};
  return {
    accountId: a.id || "",
    chargesEnabled: Boolean(a.charges_enabled),
    payoutsEnabled: Boolean(a.payouts_enabled),
    detailsSubmitted: Boolean(a.details_submitted),
    cardPayments: a.capabilities?.card_payments || "inactive",
    transfers: a.capabilities?.transfers || "inactive",
    disabledReason: req.disabled_reason || "",
    currentlyDue: req.currently_due || [],
    pastDue: req.past_due || [],
    pendingVerification: req.pending_verification || [],
    deadline: req.current_deadline || null,
    payoutInterval: a.settings?.payouts?.schedule?.interval || "",
    syncedAt: new Date().toISOString(),
  };
}

/* ── оплата ─────────────────────────────────────────────────────── */

/**
 * Сессия оплаты. Для товара партнёра — direct charge на его аккаунт
 * с удержанием application fee; для товара площадки — как раньше.
 */
export async function checkoutSession({
  order,
  account,
  applicationFeeCents,
  successUrl,
  cancelUrl,
  expiresAt,
  locale,
}) {
  const data = {
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_number: order.order },
    payment_intent_data: {
      description: `sofa.lv ${order.order}`,
      metadata: {
        order_id: order.id,
        order_number: order.order,
        seller_id: order.sellerId || "shop",
        commission_bps: order.commissionBps ?? 0,
        items_cents: order.itemsCents,
        shipping_cents: order.shippingCents,
        schema: "v1",
      },
    },
  };
  if (order.email) data.customer_email = order.email;
  if (locale && locale !== "ru") data.locale = locale; // ru у Stripe Checkout нет
  if (expiresAt) data.expires_at = expiresAt;

  data.line_items = order.items.map((it) => ({
    quantity: 1,
    price_data: {
      currency: "eur",
      unit_amount: it.cents,
      product_data: { name: `№${it.n} ${it.title}`.slice(0, 120) },
    },
  }));
  if (order.shippingCents > 0) {
    data.line_items.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: order.shippingCents,
        product_data: { name: "Piegāde līdz durvīm Latvijā" },
      },
    });
  }

  /* Комиссия площадки: только при direct charge и строго меньше суммы */
  if (account && applicationFeeCents > 0) {
    data.payment_intent_data.application_fee_amount = applicationFeeCents;
    data.payment_intent_data.statement_descriptor_suffix = "SOFA.LV";
  }

  return call("/checkout/sessions", {
    method: "POST",
    data,
    account: account || undefined,
    idempotencyKey: `sess_${order.id}`,
  });
}

/** Сессия читается с того же аккаунта, на котором создавалась. */
export const getSession = (id, account) =>
  call(`/checkout/sessions/${id}`, {
    data: { "expand[0]": "payment_intent.latest_charge.balance_transaction" },
    account: account || undefined,
  });

export const refund = ({ charge, paymentIntent, amountCents, account, refundApplicationFee = true, reason }) =>
  call("/refunds", {
    method: "POST",
    data: {
      charge: charge || undefined,
      payment_intent: charge ? undefined : paymentIntent,
      amount: amountCents || undefined,
      refund_application_fee: account ? refundApplicationFee : undefined,
      reason: reason || undefined,
    },
    account: account || undefined,
    idempotencyKey: `refund_${charge || paymentIntent}_${amountCents || "full"}`,
  });

/* ── выплаты партнёру ───────────────────────────────────────────── */

export const balance = (account) => call("/balance", { account });

export const createPayout = ({ account, amountCents, description, metadata, idempotencyKey }) =>
  call("/payouts", {
    method: "POST",
    data: {
      amount: amountCents,
      currency: "eur",
      description: description || "SOFA.LV izmaksa",
      metadata: metadata || undefined,
    },
    account,
    idempotencyKey,
  });

export const listPayouts = (account, limit = 20) =>
  call("/payouts", { data: { limit }, account });

/** Доступно к выплате в евроцентах (EUR-часть available). */
export const availableCents = (bal) =>
  (bal?.available || []).filter((b) => b.currency === "eur").reduce((s, b) => s + b.amount, 0);
export const pendingCents = (bal) =>
  (bal?.pending || []).filter((b) => b.currency === "eur").reduce((s, b) => s + b.amount, 0);

/* ── вебхуки ────────────────────────────────────────────────────── */

/**
 * Проверка подписи Stripe. Stripe не отбрасывает старые доставки сам —
 * окно давности проверяем мы (защита от повторной отправки).
 */
export function verifySignature({ raw, header, secret, toleranceSec = 300 }) {
  if (!secret) throw new Error("нет секрета вебхука");
  const ts = String(header || "").match(/t=(\d+)/)?.[1];
  const sigs = [...String(header || "").matchAll(/v1=([a-f0-9]+)/g)].map((m) => m[1]);
  if (!ts || !sigs.length) throw new Error("нет подписи");
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) throw new Error("подпись устарела");

  const expected = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const ok = sigs.some(
    (s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))
  );
  if (!ok) throw new Error("подпись не совпала");
  return JSON.parse(raw);
}

export const createWebhookEndpoint = ({ url, events, connect = false, description }) =>
  call("/webhook_endpoints", {
    method: "POST",
    data: { url, enabled_events: events, connect, description },
  });

export const listWebhookEndpoints = () => call("/webhook_endpoints", { data: { limit: 100 } });
export const deleteWebhookEndpoint = (id) => call(`/webhook_endpoints/${id}`, { method: "DELETE" });

/** События площадки (свои платежи) и события аккаунтов партнёров. */
export const PLATFORM_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "charge.refunded",
  "application_fee.created",
  "application_fee.refunded",
];
export const CONNECT_EVENTS = [
  "account.updated",
  "account.application.deauthorized",
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "charge.dispute.created",
  "charge.dispute.closed",
  "payout.created",
  "payout.paid",
  "payout.failed",
  "balance_settings.updated",
];
