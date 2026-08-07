/**
 * Деньги маркетплейса. Всё считается в евроцентах целыми числами:
 * копейка, потерянная на округлении float, — это расхождение с Stripe.
 */

export const toCents = (eur) => Math.round(Number(eur || 0) * 100);
export const toEur = (cents) => Math.round(Number(cents || 0)) / 100;

/** Эквайринг Stripe для карт EEA: 1,4 % + 0,25 €. Оценка — консервативная. */
export const STRIPE_BPS = Number(process.env.STRIPE_FEE_BPS || 140);
export const STRIPE_FIXED = Number(process.env.STRIPE_FEE_FIXED_CENTS || 25);

export const estimateStripeFee = (chargeCents) =>
  chargeCents > 0 ? Math.round((chargeCents * STRIPE_BPS) / 10000) + STRIPE_FIXED : 0;

/**
 * Раскладка одного заказа.
 *
 * Stripe разрешает Express-дашборд партнёру только при условии, что
 * эквайринг оплачивает площадка. Поэтому расклад простой и честный:
 *   комиссия 20 % берётся ТОЛЬКО с цены товара,
 *   доставку организует площадка — её стоимость целиком возвращается нам,
 *   партнёр получает ровно «цена товара минус комиссия», без вычетов Stripe.
 * Эквайринг Stripe идёт из комиссии площадки.
 */
export function orderMoney({ itemsCents, shippingCents = 0, commissionBps = 2000, partner = true }) {
  const items = Math.max(0, Math.round(itemsCents));
  const shipping = Math.max(0, Math.round(shippingCents));
  const charge = items + shipping;
  const stripeFee = estimateStripeFee(charge);

  if (!partner) {
    /* Товар самой площадки: комиссии нет, весь платёж наш. */
    return {
      itemsCents: items,
      shippingCents: shipping,
      chargeCents: charge,
      commissionBps: 0,
      commissionCents: 0,
      applicationFeeCents: 0,
      stripeFeeEstimateCents: stripeFee,
      partnerNetCents: 0,
      platformCents: charge - stripeFee,
    };
  }

  const commission = Math.round((items * commissionBps) / 10000);
  /* Stripe требует: 0 < application_fee_amount < сумма платежа. */
  const applicationFee = Math.max(0, Math.min(commission + shipping, charge - 1));
  const partnerNet = charge - applicationFee;

  return {
    itemsCents: items,
    shippingCents: shipping,
    chargeCents: charge,
    commissionBps,
    commissionCents: commission,
    applicationFeeCents: applicationFee,
    stripeFeeEstimateCents: stripeFee,
    partnerNetCents: partnerNet,
    /* нам остаётся комиссия и доставка за вычетом эквайринга */
    platformCents: applicationFee - stripeFee,
  };
}

/** Срок удержания выплаты: 14 дней права отказа с момента передачи товара. */
export const HOLD_DAYS = Number(process.env.PAYOUT_HOLD_DAYS || 14);
export const releaseDate = (deliveredAt) =>
  deliveredAt ? new Date(new Date(deliveredAt).getTime() + HOLD_DAYS * 864e5).toISOString() : null;

/**
 * Состояние денег партнёра по заказу.
 * held → удерживается, available → можно выплачивать, paid → выплачено.
 */
export function payoutState(order, now = Date.now()) {
  if (order.refundedAt) return "refunded";
  if (order.disputeAt && !order.disputeClosedAt) return "disputed";
  if (order.payoutAt) return "paid";
  if (order.status !== "paid" && order.status !== "done") return "pending";
  if (!order.deliveredAt) return "held";
  const release = releaseDate(order.deliveredAt);
  return release && now >= Date.parse(release) ? "available" : "held";
}
