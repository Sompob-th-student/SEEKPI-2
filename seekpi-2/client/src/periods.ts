// Same period layout as server/scoring-core.js (original SEE KPI: Monthly Jan..Dec, Quarterly QTR 1..4, Yearly).
export const PERIODS: Record<string, string[]> = {
  Monthly: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  Quarterly: ['QTR 1', 'QTR 2', 'QTR 3', 'QTR 4'],
  Yearly: ['Year'],
}
export const periodsOf = (frequency?: string) => PERIODS[frequency ?? 'Yearly'] ?? PERIODS.Yearly

export type Period = { period_no: number; label: string; levels: (number | string | null)[]; actual_value?: number | string | null; score?: number | null }
export const blankPeriods = (frequency?: string): Period[] =>
  periodsOf(frequency).map((label, i) => ({ period_no: i + 1, label, levels: [null, null, null, null, null] }))
