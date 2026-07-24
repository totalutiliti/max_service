export const referralRiskPolicyVersion = "REFERRAL-RISK-2026-01";

export type ReferralRiskLevel = "low" | "attention" | "high";
export type ReferralRiskSignalCode =
  | "self_referral"
  | "cross_network_duplicate"
  | "partner_velocity";

export interface ReferralRiskSignal {
  code: ReferralRiskSignalCode;
  severity: "attention" | "high";
  title: string;
  detail: string;
}

export interface ReferralRiskContext {
  selfReferral: boolean;
  duplicatePartnerCount: number;
  recentReferralCount: number;
}

export interface ReferralRiskAssessment {
  policyVersion: typeof referralRiskPolicyVersion;
  riskLevel: ReferralRiskLevel;
  signals: ReferralRiskSignal[];
  additionalVerificationRequired: boolean;
}

export function evaluateReferralRisk(context: ReferralRiskContext): ReferralRiskAssessment {
  const signals: ReferralRiskSignal[] = [];

  if (context.selfReferral) {
    signals.push({
      code: "self_referral",
      severity: "high",
      title: "Possível autorreferência",
      detail: "O e-mail informado corresponde ao e-mail do parceiro, incluindo variações com alias.",
    });
  }

  if (context.duplicatePartnerCount > 0) {
    signals.push({
      code: "cross_network_duplicate",
      severity: context.duplicatePartnerCount >= 2 ? "high" : "attention",
      title: "Cadastro presente em outra rede",
      detail: context.duplicatePartnerCount === 1
        ? "O mesmo e-mail normalizado aparece vinculado a outra rede de parceiro."
        : `O mesmo e-mail normalizado aparece vinculado a ${context.duplicatePartnerCount} outras redes de parceiro.`,
    });
  }

  if (context.recentReferralCount >= 3) {
    signals.push({
      code: "partner_velocity",
      severity: context.recentReferralCount >= 7 ? "high" : "attention",
      title: "Volume recente acima do padrão",
      detail: `${context.recentReferralCount} outras indicações foram registradas por este parceiro nas últimas 24 horas.`,
    });
  }

  const riskLevel: ReferralRiskLevel = signals.some((signal) => signal.severity === "high")
    ? "high"
    : signals.length > 0
      ? "attention"
      : "low";

  return {
    policyVersion: referralRiskPolicyVersion,
    riskLevel,
    signals,
    additionalVerificationRequired: riskLevel !== "low",
  };
}
