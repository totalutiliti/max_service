export const reportPeriods = [7, 30, 90] as const;
export type ReportPeriodDays = typeof reportPeriods[number];

export function normalizeReportDays(value: string | number | undefined): ReportPeriodDays {
  const parsed = Number(value ?? 30);
  return reportPeriods.includes(parsed as ReportPeriodDays) ? parsed as ReportPeriodDays : 30;
}

export function percentage(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 10_000) / 100;
}

export function percentagePointChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  return Math.round((current - previous) * 100) / 100;
}

export function relativeChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10_000) / 100;
}
