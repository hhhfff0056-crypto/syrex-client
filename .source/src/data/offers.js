// Central catalogue used by pricing, checkout and key management.
// The payments page is informational: access is only granted by a redeemed key.
export const PREMIUM_PLANS = Object.freeze([
  Object.freeze({ kind: 'PREMIUM_30', durationDays: 30, priceValue: 199 }),
  Object.freeze({ kind: 'PREMIUM_90', durationDays: 90, priceValue: 299 }),
  Object.freeze({ kind: 'PREMIUM_180', durationDays: 180, priceValue: 499 }),
  Object.freeze({ kind: 'PREMIUM_FOREVER', durationDays: 0, priceValue: 899 })
]);

export const HWID_RESET_OFFER = Object.freeze({
  kind: 'HWID_RESET', priceValue: 99
});

export const getOfferByKind = (kind) =>
  [...PREMIUM_PLANS, HWID_RESET_OFFER].find((offer) => offer.kind === kind) || PREMIUM_PLANS[0];

export const priceRUB = (value) => value + ' ₽';
