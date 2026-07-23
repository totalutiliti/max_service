export interface CampaignDiscountRule {
  discountType: "fixed" | "percentage";
  discountValue: number;
  maxDiscountCents: number | null;
  minAmountCents: number;
}

export function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase();
}

export function isValidCouponCode(value: string) {
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(value);
}

export function calculateCampaignDiscount(listAmountCents: number, rule: CampaignDiscountRule) {
  if (!Number.isInteger(listAmountCents) || listAmountCents < rule.minAmountCents) return 0;
  const rawDiscount = rule.discountType === "fixed"
    ? rule.discountValue
    : Math.min(
      Math.floor((listAmountCents * rule.discountValue) / 10_000),
      rule.maxDiscountCents ?? 0,
    );
  return Math.max(0, Math.min(rawDiscount, listAmountCents - 100));
}
