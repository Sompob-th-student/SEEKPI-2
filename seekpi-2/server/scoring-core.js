// SEEKPI-2 scoring rules as pure functions (no database access).
// Documented, with worked examples, in docs/SEEKPI-2_Scoring_Method.md.
// The examples are checked by test/scoring.test.js, so the document and this code stay identical.

/** Round half away from zero to `d` decimals (avoids binary float artefacts such as 1.005 -> 1.00). */
export function round(x, d = 2) {
  if (x == null || Number.isNaN(x)) return null;
  const f = 10 ** d;
  return Math.sign(x) * Math.round((Math.abs(x) * f) + 1e-9) / f;
}

/**
 * Step 1: achievement % for a quantity KPI.
 * higher_better: actual / target x 100      lower_better: target / actual x 100
 * Result is capped to [0, cap] and rounded to 2 decimals.
 */
export function achievement({ target, actual, direction = 'higher_better', cap = 150 }) {
  if (actual == null || target == null) return null;
  let a;
  if (direction === 'lower_better') a = actual === 0 ? cap : (target / actual) * 100;
  else a = target === 0 ? (actual >= 0 ? 100 : 0) : (actual / target) * 100;
  return round(Math.max(0, Math.min(cap, a)), 2);
}

// ---------------------------------------------------------------------------------------
// 5-level target scoring (the method the original SEE KPI uses on its Assignment screen):
// every KPI has, for every period, five target values L1..L5 (score 1..5). The period score
// is the highest level the actual reaches. Direction comes from the levels themselves:
// L5 >= L1 means "higher is better", L5 < L1 means "lower is better".
// ---------------------------------------------------------------------------------------
export const PERIODS = {
  Monthly: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  Quarterly: ['QTR 1', 'QTR 2', 'QTR 3', 'QTR 4'],
  Yearly: ['Year'],
};
export const periodsOf = (frequency) => PERIODS[frequency] ?? PERIODS.Yearly;

/** Score of one period: highest k (1..5) whose level the actual reaches; below L1 -> belowLevel1 (default 0). */
export function levelScore(actual, levels, { belowLevel1 = 0 } = {}) {
  if (actual == null || actual === '' || !Array.isArray(levels) || levels.length !== 5 || levels.some((l) => l == null || l === '')) return null;
  const a = Number(actual), L = levels.map(Number);
  const higher = L[4] >= L[0];
  for (let k = 5; k >= 1; k--) {
    if (higher ? a >= L[k - 1] : a <= L[k - 1]) return k;
  }
  return belowLevel1;
}

/** KPI score = average of the period scores that have an actual (rounded to 2 decimals). */
export function kpiScore(periods, opts) {
  const scores = periods.map((p) => levelScore(p.actual, p.levels, opts)).filter((s) => s != null);
  return scores.length ? round(scores.reduce((s, x) => s + x, 0) / scores.length, 2) : null;
}

/** Weight score of one KPI line: score / maxScore x weight% (a line with no score yet counts 0). */
export const weightScore = (score, weight, maxScore = 5) => (score == null ? 0 : round((score / maxScore) * weight, 2));

/**
 * Structure score on the 0..100 scale (= sum of weight scores; weights sum to 100) and on the 0..5 scale.
 * Waived lines (original "Waive" switch) are left out and the remaining weights are scaled back up to 100%,
 * so waiving a KPI neither rewards nor penalises the employee.
 */
export function structureScore100(lines, maxScore = 5) {
  const active = lines.filter((l) => !l.waived);
  const activeWeight = active.reduce((s, l) => s + Number(l.weight || 0), 0);
  const raw = active.reduce((s, l) => s + weightScore(l.score, l.weight, maxScore), 0);
  const score100 = activeWeight > 0 ? round((raw * 100) / activeWeight, 2) : 0;
  return { score100, score5: round(score100 / 20, 2), complete: active.every((l) => l.score != null), waived: lines.length - active.length };
}

/**
 * SUM UP (original button on the appraisal screen): roll the same KPI up from subordinate scorecards,
 * period by period. method 'sum' for count / amount KPIs (item flag Sum Up), otherwise 'average'.
 * values: actuals of one period from each subordinate (null = not entered, ignored).
 */
export function sumUp(values, method = 'average') {
  const v = values.filter((x) => x != null && x !== '').map(Number);
  if (!v.length) return null;
  const total = v.reduce((s, x) => s + x, 0);
  return round(method === 'sum' ? total : total / v.length, 4);
}

/**
 * Total score: sum of structure score x structure weight% (weights per Level Group, from Appraisal Criteria),
 * minus deduct points (original STT03 rule); value_get_zero sets it to 0.
 */
export function totalScore({ structures, deducts = [] }) {
  const base = round(structures.reduce((s, x) => s + (x.score100 * x.weight) / 100, 0), 2);
  const lines = deducts.map(deductLine);
  const totalDeduct = round(lines.reduce((s, l) => s + l.deduct, 0), 2);
  const getZero = lines.some((l) => l.getZero);
  const total100 = getZero ? 0 : round(Math.max(0, base - totalDeduct), 2);
  return { base, totalDeduct, getZero, total100, total5: round(total100 / 20, 2) };
}

/** Step 2 (threshold mode, for structures flagged is_threshold): achievement % -> score using bands [{score, from}]. */
export function thresholdScore(ach, bands) {
  if (ach == null) return null;
  const sorted = [...bands].sort((x, y) => y.from - x.from);
  const hit = sorted.find((b) => ach >= b.from);
  return hit ? hit.score : sorted.at(-1).score;
}

/** Step 3: weighted average score of one structure (KPI or competency), on the 0..maxScore scale. */
export function structureScore(lines) {
  const w = lines.reduce((s, l) => s + l.weight, 0);
  if (!w || lines.some((l) => l.score == null)) return null;
  return round(lines.reduce((s, l) => s + l.score * l.weight, 0) / w, 4);
}

/**
 * Step 4: deduct structure (same rule as the original SEEKPI STT03 screen):
 *   over   = max(0, actual - max_value)          (max_value = allowance, e.g. 3 late arrivals allowed)
 *   deduct = over x unit_deduct_score
 *   getZero = value_get_zero is set and actual >= value_get_zero  -> the whole result becomes 0
 */
export function deductLine({ actual, maxValue = 0, unit = 0, valueGetZero = null }) {
  const a = actual ?? 0;
  const over = Math.max(0, a - maxValue);
  return { over: round(over, 2), deduct: round(over * unit, 2), getZero: valueGetZero != null && a >= valueGetZero };
}

/**
 * Step 5: result score 0..100.
 *   base   = sum( structureScore / maxScore x structureWeight )   (structure weights sum to 100)
 *   result = max(0, base - totalDeduct), or 0 when any deduct line hits value_get_zero
 */
export function resultScore({ structures, deducts = [] }) {
  if (structures.some((s) => s.score == null)) return null;
  const tw = structures.reduce((s, x) => s + x.weight, 0);
  const base = structures.reduce((s, x) => s + (x.score / x.maxScore) * x.weight, 0) * (100 / tw);
  const lines = deducts.map(deductLine);
  const totalDeduct = round(lines.reduce((s, l) => s + l.deduct, 0), 2);
  const zero = lines.some((l) => l.getZero);
  const result = zero ? 0 : Math.max(0, round(base, 2) - totalDeduct);
  return { base: round(base, 2), totalDeduct, getZero: zero, result: round(result, 2) };
}

/** Step 6: result score -> grade using bands [{grade, begin, end}] (score rounded to 2 decimals first). */
export function gradeOf(score, bands) {
  if (score == null) return null;
  const s = round(score, 2);
  const hit = [...bands].sort((a, b) => b.begin - a.begin).find((b) => s >= b.begin);
  return hit ? hit.grade : bands.at(-1).grade;
}

/**
 * Step 7a: force-rank seats per grade with the Largest Remainder (Hamilton) method.
 * distribution: ordered best -> worst, e.g. [['A',10],['B',20],['C',50],['D',15],['E',5]]
 *   exact = N x pct / 100; seats = floor(exact); leftover seats go to the largest fractional parts.
 *   Equal fractions: the grade closer to the middle grade wins; equal distance: the lower (more conservative) grade wins.
 */
export function allocateSeats(n, distribution) {
  const mid = (distribution.length - 1) / 2;
  const rows = distribution.map(([grade, pct], i) => {
    const exact = (n * pct) / 100;
    const seats = Math.floor(exact + 1e-9);
    return { grade, pct, i, exact: round(exact, 4), seats, frac: round(exact - seats, 4) };
  });
  let left = n - rows.reduce((s, r) => s + r.seats, 0);
  const order = [...rows].sort((a, b) => b.frac - a.frac || Math.abs(a.i - mid) - Math.abs(b.i - mid) || b.i - a.i);
  for (const r of order) { if (left <= 0) break; r.seats += 1; r.bonusSeat = true; left -= 1; }
  return rows.map(({ i, ...r }) => r);
}

/**
 * Step 7b: rank and assign force-rank grades within one group.
 * Ranking order: result desc, then KPI score desc, then competency score desc, then emp_code asc.
 * A person whose result equals the neighbour across a grade boundary is flagged tie=true for the committee.
 * Groups smaller than minGroupSize are not forced: they keep their system grade.
 */
export function forceRankGroup(people, distribution, { minGroupSize = 5 } = {}) {
  const sorted = [...people].sort((a, b) =>
    b.result - a.result || (b.kpi ?? 0) - (a.kpi ?? 0) || (b.competency ?? 0) - (a.competency ?? 0) || String(a.empCode).localeCompare(String(b.empCode)));
  if (sorted.length < minGroupSize) {
    return { seats: null, rows: sorted.map((p, k) => ({ ...p, rank: k + 1, frGrade: p.systemGrade, tie: false, forced: false })) };
  }
  const seats = allocateSeats(sorted.length, distribution);
  const grades = seats.flatMap((s) => Array(s.seats).fill(s.grade));
  const rows = sorted.map((p, k) => ({ ...p, rank: k + 1, frGrade: grades[k], forced: true, tie: false }));
  for (let k = 1; k < rows.length; k++) {
    if (rows[k].frGrade !== rows[k - 1].frGrade && rows[k].result === rows[k - 1].result) rows[k].tie = rows[k - 1].tie = true;
  }
  return { seats, rows };
}
