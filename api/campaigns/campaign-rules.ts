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

export type CampaignAbuseLevel = "low" | "attention" | "high";

export function campaignAbuseLevel(input: {
  rejectedCount: number;
  blockedCount: number;
  suspiciousCustomerCount: number;
}): CampaignAbuseLevel {
  if (input.blockedCount > 0 || input.suspiciousCustomerCount >= 3) return "high";
  if (input.rejectedCount >= 5 || input.suspiciousCustomerCount > 0) return "attention";
  return "low";
}

export type CampaignEligibilityResult =
  | "accepted"
  | "outside_segment"
  | "consent_required"
  | "total_limit"
  | "customer_limit";

export function campaignEligibilityResult(input: {
  totalUsage: number;
  totalRedemptionLimit: number;
  customerUsage: number;
  perCustomerLimit: number;
  targetingMode: "contextual" | "consented";
  targetCategoryId: string | null;
  targetRegionId: string | null;
  contextCategoryId?: string;
  contextRegionId?: string;
  marketingConsentGranted: boolean;
}): CampaignEligibilityResult {
  if (input.totalUsage >= input.totalRedemptionLimit) return "total_limit";
  if (input.customerUsage >= input.perCustomerLimit) return "customer_limit";
  if (input.targetCategoryId && input.targetCategoryId !== input.contextCategoryId) return "outside_segment";
  if (input.targetRegionId && input.targetRegionId !== input.contextRegionId) return "outside_segment";
  if (input.targetingMode === "consented" && !input.marketingConsentGranted) return "consent_required";
  return "accepted";
}
