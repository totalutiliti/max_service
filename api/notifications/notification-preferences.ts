export const notificationTimeZones = [
  { value: "America/Sao_Paulo", label: "Brasília, São Paulo e Sul" },
  { value: "America/Bahia", label: "Bahia" },
  { value: "America/Belem", label: "Pará e Amapá" },
  { value: "America/Boa_Vista", label: "Roraima" },
  { value: "America/Campo_Grande", label: "Mato Grosso do Sul" },
  { value: "America/Cuiaba", label: "Mato Grosso" },
  { value: "America/Fortaleza", label: "Ceará e parte do Nordeste" },
  { value: "America/Maceio", label: "Alagoas e Sergipe" },
  { value: "America/Manaus", label: "Amazonas" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
  { value: "America/Porto_Velho", label: "Rondônia" },
  { value: "America/Recife", label: "Pernambuco" },
  { value: "America/Rio_Branco", label: "Acre" },
] as const;

export type NotificationTimeZone = (typeof notificationTimeZones)[number]["value"];
export type NotificationCategory = "marketplace" | "messages" | "support" | "system";

export interface NotificationPreferencesInput {
  marketplacePush: boolean;
  messagesPush: boolean;
  supportPush: boolean;
  systemPush: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timeZone: NotificationTimeZone;
}

const supportedTimeZones = new Set<string>(notificationTimeZones.map((item) => item.value));
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new Error(`${field} deve ser verdadeiro ou falso.`);
  return value;
}

function requireTime(value: unknown, field: string) {
  if (typeof value !== "string" || !timePattern.test(value)) {
    throw new Error(`${field} deve usar o formato HH:mm.`);
  }
  return value;
}

export function notificationCategoryForType(type: string): NotificationCategory {
  if ([
    "proposal_received",
    "proposal_accepted",
    "booking_started",
    "booking_completed",
    "booking_cancelled",
    "review_received",
  ].includes(type)) return "marketplace";
  if (type === "message_received") return "messages";
  if ([
    "case_opened",
    "case_updated",
    "referral_reviewed",
    "support_message",
  ].includes(type)) return "support";
  return "system";
}

export function validateNotificationPreferences(value: unknown): NotificationPreferencesInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Preferências de notificação inválidas.");
  }
  const candidate = value as Record<string, unknown>;
  const quietStart = requireTime(candidate.quietStart, "O início do horário de silêncio");
  const quietEnd = requireTime(candidate.quietEnd, "O fim do horário de silêncio");
  if (quietStart === quietEnd) {
    throw new Error("O início e o fim do horário de silêncio devem ser diferentes.");
  }
  if (typeof candidate.timeZone !== "string" || !supportedTimeZones.has(candidate.timeZone)) {
    throw new Error("Fuso horário não suportado.");
  }
  return {
    marketplacePush: requireBoolean(candidate.marketplacePush, "Avisos do marketplace"),
    messagesPush: requireBoolean(candidate.messagesPush, "Avisos de mensagens"),
    supportPush: requireBoolean(candidate.supportPush, "Avisos de atendimento"),
    systemPush: requireBoolean(candidate.systemPush, "Avisos da plataforma"),
    quietHoursEnabled: requireBoolean(candidate.quietHoursEnabled, "Horário de silêncio"),
    quietStart,
    quietEnd,
    timeZone: candidate.timeZone as NotificationTimeZone,
  };
}
