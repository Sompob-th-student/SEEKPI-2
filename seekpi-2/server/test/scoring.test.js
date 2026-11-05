// Every worked example in docs/SEEKPI-2_Scoring_Method.md is asserted here.
// Run: npm test  (from seekpi-2/server)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../scoring-core.js';

const GRADES = [
  { grade: 'FE', begin: 90 }, { grade: 'EE', begin: 75 }, { grade: 'FM', begin: 55 }, { grade: 'PM', begin: 40 }, { grade: 'NM', begin: 0 },
];
const DIST = [['FE', 10], ['EE', 20], ['FM', 50], ['PM', 15], ['NM', 5]];

// Worked example (doc section 3-6): employee in level group "Site OP1", Project 50% / Individual 50%
const SPI = [0.97, 1.01, 0.94, 0.99, 1.02, 1.06, 0.92, 0.98, 1.0, 1.03].map((actual) => ({ actual, levels: [0.85, 0.9, 0.95, 1.0, 1.05] }));
const LTIFR = [0.5, 0.3, 0.9].map((actual) => ({ actual, levels: [1.0, 0.8, 0.6, 0.4, 0.2] }));
const CSAT = [{ actual: 4.3, levels: [3.6, 3.8, 4.0, 4.2, 4.4] }];
const TRAIN = [{ actual: 45, levels: [20, 30, 40, 50, 60] }];
const SHOP = [82, 88, 91, 76].map((actual) => ({ actual, levels: [60, 70, 80, 90, 95] }));
const AUDIT = [2, 1, 0, 3].map((actual) => ({ actual, levels: [4, 3, 2, 1, 0] }));

test('example 1: period score from 5 target levels (both directions)', () => {
  assert.deepEqual(SPI.map((p) => S.levelScore(p.actual, p.levels)), [3, 4, 2, 3, 4, 5, 2, 3, 4, 4]);
  assert.deepEqual(LTIFR.map((p) => S.levelScore(p.actual, p.levels)), [3, 4, 1]);
  assert.deepEqual(AUDIT.map((p) => S.levelScore(p.actual, p.levels)), [3, 4, 5, 2]);
  assert.equal(S.levelScore(0.95, [0.85, 0.9, 0.95, 1.0, 1.05]), 3, 'reaching a level exactly counts');
  assert.equal(S.levelScore(1.2, [1.0, 0.8, 0.6, 0.4, 0.2]), 0, 'worse than level 1 scores 0');
  assert.equal(S.levelScore(null, [1, 2, 3, 4, 5]), null, 'no actual yet');
});

test('example 2: KPI score = average of period scores', () => {
  assert.equal(S.kpiScore(SPI), 3.4);
  assert.equal(S.kpiScore(LTIFR), 2.67);
  assert.equal(S.kpiScore(CSAT), 4);
  assert.equal(S.kpiScore(TRAIN), 3);
  assert.equal(S.kpiScore(SHOP), 3);
  assert.equal(S.kpiScore(AUDIT), 3.5);
  assert.equal(S.kpiScore([{ actual: null, levels: [1, 2, 3, 4, 5] }]), null);
});

test('example 3: weight score and structure score', () => {
  assert.equal(S.weightScore(3.4, 40), 27.2);
  assert.equal(S.weightScore(2.67, 30), 16.02);
  assert.equal(S.weightScore(4, 30), 24);
  assert.deepEqual(S.structureScore100([{ score: 3.4, weight: 40 }, { score: 2.67, weight: 30 }, { score: 4, weight: 30 }]), { score100: 67.22, score5: 3.36, complete: true, waived: 0 });
  assert.deepEqual(S.structureScore100([{ score: 3, weight: 30 }, { score: 3, weight: 40 }, { score: 3.5, weight: 30 }]), { score100: 63, score5: 3.15, complete: true, waived: 0 });
});

test('example 3b: Waive leaves the line out and rescales the other weights to 100%', () => {
  // Individual Performance of example 3 with "Audit adjustment" (30%) waived:
  // (18 + 24) / 70 x 100 = 60.00
  const s = S.structureScore100([{ score: 3, weight: 30 }, { score: 3, weight: 40 }, { score: 3.5, weight: 30, waived: true }]);
  assert.deepEqual(s, { score100: 60, score5: 3, complete: true, waived: 1 });
  // a waived line without a result does not make the structure incomplete
  assert.equal(S.structureScore100([{ score: 4, weight: 60 }, { score: null, weight: 40, waived: true }]).complete, true);
  assert.equal(S.structureScore100([{ score: 4, weight: 100, waived: true }]).score100, 0);
});

test('example 3c: SUM UP rolls a KPI up from subordinates per period', () => {
  assert.equal(S.sumUp([0.97, 1.03, 0.94]), 0.98, 'average for ratio KPIs such as SPI');
  assert.equal(S.sumUp([2, 1, 0, null], 'sum'), 3, 'sum for count KPIs; blanks ignored');
  assert.equal(S.sumUp([null, '']), null);
});

test('example 4: total score and grade', () => {
  const t = S.totalScore({ structures: [{ score100: 67.22, weight: 50 }, { score100: 63, weight: 50 }] });
  assert.deepEqual(t, { base: 65.11, totalDeduct: 0, getZero: false, total100: 65.11, total5: 3.26 });
  assert.equal(S.gradeOf(t.total100, GRADES), 'FM');
});

test('example 5: structure without results yet counts 0 (as on the original screen 50.00 (2.50))', () => {
  const t = S.totalScore({ structures: [{ score100: 100, weight: 50 }, { score100: 0, weight: 50 }] });
  assert.equal(t.total100, 50);
  assert.equal(t.total5, 2.5);
  assert.equal(S.structureScore100([{ score: 5, weight: 60 }, { score: null, weight: 40 }]).complete, false);
});

test('example 6: deduct lines (original SEEKPI STT03 rule) and value_get_zero', () => {
  assert.deepEqual(S.deductLine({ actual: 5, maxValue: 3, unit: 0.5 }), { over: 2, deduct: 1, getZero: false });
  const t = S.totalScore({ structures: [{ score100: 65.11, weight: 100 }], deducts: [{ actual: 5, maxValue: 3, unit: 0.5 }, { actual: 1, maxValue: 0, unit: 2, valueGetZero: 3 }] });
  assert.equal(t.total100, 62.11);
  const z = S.totalScore({ structures: [{ score100: 65.11, weight: 100 }], deducts: [{ actual: 3, maxValue: 0, unit: 2, valueGetZero: 3 }] });
  assert.equal(z.total100, 0);
  assert.equal(z.getZero, true);
});

test('grade boundary rounding', () => {
  assert.equal(S.gradeOf(89.995, GRADES), 'FE');
  assert.equal(S.gradeOf(89.994, GRADES), 'EE');
  assert.equal(S.gradeOf(65, GRADES), 'FM');
});

test('example 7: largest remainder seats with FE..NM', () => {
  const seats = (n) => Object.fromEntries(S.allocateSeats(n, DIST).map((s) => [s.grade, s.seats]));
  assert.deepEqual(seats(16), { FE: 2, EE: 3, FM: 8, PM: 2, NM: 1 });
  assert.deepEqual(seats(7), { FE: 1, EE: 1, FM: 4, PM: 1, NM: 0 });
  assert.deepEqual(seats(10), { FE: 1, EE: 2, FM: 5, PM: 2, NM: 0 });
  for (const n of [1, 5, 9, 16, 23, 57, 101]) assert.equal(Object.values(seats(n)).reduce((a, b) => a + b, 0), n);
});

test('example 8: ranking, tie-break and tie flag', () => {
  const people = [
    ['E101', 88.4, 4.2, 4.4], ['E102', 84.0, 4.0, 4.2], ['E103', 79.2, 3.9, 4.0], ['E104', 75.6, 3.9, 4.0],
    ['E105', 70.1, 3.6, 3.8], ['E106', 64.5, 3.4, 3.6], ['E107', 64.5, 3.6, 3.2],
  ].map(([empCode, result, kpi, competency]) => ({ empCode, result, kpi, competency, systemGrade: S.gradeOf(result, GRADES) }));
  const { rows } = S.forceRankGroup(people, DIST);
  assert.deepEqual(rows.map((r) => [r.empCode, r.systemGrade, r.frGrade, r.tie]), [
    ['E101', 'EE', 'FE', false], ['E102', 'EE', 'EE', false], ['E103', 'EE', 'FM', false], ['E104', 'EE', 'FM', false],
    ['E105', 'FM', 'FM', false], ['E107', 'FM', 'FM', true], ['E106', 'FM', 'PM', true],
  ]);
});

test('groups below the minimum size keep their system grade', () => {
  const people = [['E1', 88.4], ['E2', 84], ['E3', 79.2], ['E4', 75.6]].map(([empCode, result]) => ({ empCode, result, systemGrade: S.gradeOf(result, GRADES) }));
  const { rows } = S.forceRankGroup(people, DIST);
  assert.deepEqual(rows.map((r) => [r.frGrade, r.forced]), [['EE', false], ['EE', false], ['EE', false], ['EE', false]]);
});

test('threshold mode (structures flagged is_threshold) still works', () => {
  const T = [{ score: 5, from: 120 }, { score: 4, from: 100 }, { score: 3, from: 80 }, { score: 2, from: 60 }, { score: 1, from: 0 }];
  assert.equal(S.thresholdScore(S.achievement({ target: 0.5, actual: 0.4, direction: 'lower_better' }), T), 5);
  assert.equal(S.achievement({ target: 100, actual: 200 }), 150);
});
