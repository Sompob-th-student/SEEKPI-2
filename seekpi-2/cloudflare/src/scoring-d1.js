// Async (D1) version of server/scoring.js. The rules come from the shared, unit-tested modules
// server/scoring-core.js and server/workflow.js; this file only loads data and writes results.
// Queries are grouped per scorecard (3 reads + 1 batched write) to stay well inside D1 per-request limits.
import * as core from '../../server/scoring-core.js';
import { stagesFor, stageInfo } from '../../server/workflow.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

export async function formConfig(db, formId) {
  const f = await db.get(`SELECT f.*, t.thresholds, g.grades, r.distribution
    FROM form f LEFT JOIN threshold_group t ON t.id=f.threshold_group_id
    LEFT JOIN grade_criteria g ON g.id=f.grade_criteria_id LEFT JOIN force_rank_group r ON r.id=f.force_rank_group_id WHERE f.id=?`, formId);
  if (!f) return null;
  return {
    form: f,
    thresholds: parse(f.thresholds, []),
    grades: parse(f.grades, []).sort((a, b) => b.begin - a.begin),
    distribution: parse(f.distribution, {}),
  };
}

export const structureWeights = (db, formId, levelGroupId) => db.all(`SELECT s.id structure_id, s.structure_name, s.structure_type, s.seq_no, COALESCE(w.weight_pct,0) weight_pct
    FROM structure s JOIN form f ON f.id=? LEFT JOIN criteria_weight w ON w.criteria_id=f.criteria_id AND w.level_group_id=? AND w.structure_id=s.id
    WHERE s.is_active=1 ORDER BY s.seq_no`, formId, levelGroupId ?? -1);

function summaryStatus(structs) {
  if (!structs.length) return 'Draft';
  let worst = null, worstIdx = Infinity;
  for (const s of structs) {
    const idx = stagesFor(s.structure_type).findIndex((x) => x.code === s.stage);
    const rank = s.stage.startsWith('END_') ? 100 + idx : idx;
    if (rank < worstIdx) { worstIdx = rank; worst = s; }
  }
  return stageInfo(worst.structure_type, worst.stage).en;
}

export async function calculateAssignment(db, assignmentId) {
  const a = await db.get('SELECT * FROM assignment WHERE id=?', assignmentId);
  if (!a) return null;
  const cfg = await formConfig(db, a.form_id);
  const structs = await db.all(`SELECT ast.*, s.structure_type, s.target_score FROM assignment_structure ast JOIN structure s ON s.id=ast.structure_id
    WHERE ast.assignment_id=? ORDER BY s.seq_no`, assignmentId);
  const items = await db.all(`SELECT ai.*, i.value_type, i.structure_id FROM assignment_item ai JOIN item i ON i.id=ai.item_id WHERE ai.assignment_id=?`, assignmentId);
  const periods = await db.all(`SELECT p.* FROM assignment_item_period p JOIN assignment_item ai ON ai.id=p.assignment_item_id
    WHERE ai.assignment_id=? ORDER BY p.period_no`, assignmentId);
  const byItem = {};
  for (const p of periods) (byItem[p.assignment_item_id] ??= []).push(p);

  const writes = [];
  const totals = [], deducts = [];
  const kpi5 = [];
  let comp5 = null;
  for (const st of structs) {
    const lines = [];
    for (const it of items.filter((x) => x.structure_id === st.structure_id)) {
      let score = null, actual = null;
      if (st.structure_type === 'Quality') {
        score = it.actual_value == null || it.actual_value === '' ? null : Math.max(1, Math.min(5, Number(it.actual_value)));
        actual = score;
      } else if (st.structure_type === 'Deduct Score') {
        const line = { actual: Number(it.actual_value ?? 0), maxValue: it.max_value ?? 0, unit: it.unit_deduct_score ?? 0, valueGetZero: it.value_get_zero };
        deducts.push(line);
        writes.push(['UPDATE assignment_item SET deduct_score=? WHERE id=?', core.deductLine(line).deduct, it.id]);
        continue;
      } else {
        const ps = (byItem[it.id] ?? []).map((p) => ({ ...p, levels: [p.l1, p.l2, p.l3, p.l4, p.l5], actual: p.actual_value }));
        for (const p of ps) {
          const s = core.levelScore(p.actual, p.levels);
          if (s !== p.score) writes.push(['UPDATE assignment_item_period SET score=? WHERE assignment_item_id=? AND period_no=?', s, it.id, p.period_no]);
        }
        score = core.kpiScore(ps);
        const acts = ps.map((p) => p.actual_value).filter((v) => v != null);
        actual = acts.length ? core.round(acts.reduce((s, v) => s + v, 0) / acts.length, 4) : null;
      }
      writes.push(['UPDATE assignment_item SET score=?, weighted_score=?, actual_value=? WHERE id=?',
        score, it.is_waived ? 0 : core.weightScore(score, it.weight_percent, st.target_score || 5), actual, it.id]);
      lines.push({ score, weight: it.weight_percent, waived: !!it.is_waived });
    }
    if (st.structure_type === 'Deduct Score') continue;
    const s = core.structureScore100(lines, st.target_score || 5);
    writes.push(['UPDATE assignment_structure SET score100=?, score5=?, complete=? WHERE assignment_id=? AND structure_id=?',
      s.score100, s.score5, s.complete ? 1 : 0, assignmentId, st.structure_id]);
    totals.push({ score100: s.score100, weight: st.weight_pct });
    if (st.structure_type === 'Quality') comp5 = s.score5; else if (st.weight_pct > 0) kpi5.push(s.score5);
  }
  const t = core.totalScore({ structures: totals, deducts });
  const hasAny = periods.some((p) => p.actual_value != null) || items.some((i) => i.actual_value != null);
  const result = hasAny ? t.total100 : null;
  const grade = core.gradeOf(result, cfg.grades);
  writes.push([`UPDATE assignment SET kpi_score=?, competency_score=?, base_score=?, deduct_total=?, is_get_zero=?, result_score=?, total5=?, grade=?, status=?,
       updated_at=CURRENT_TIMESTAMP WHERE id=?`,
  kpi5.length ? core.round(kpi5.reduce((s, x) => s + x, 0) / kpi5.length, 2) : null, comp5, hasAny ? t.base : null, hasAny ? t.totalDeduct : null,
  t.getZero ? 1 : 0, result, hasAny ? t.total5 : null, grade, summaryStatus(structs), assignmentId]);
  await db.batch(writes);
  return { result_score: result, grade };
}

/** Force ranking: see docs/SEEKPI-2_Scoring_Method.md section 9 (same rules as server/scoring.js). */
export async function forceRank(db, formId, mode = 'company', apply = false) {
  const cfg = await formConfig(db, formId);
  const rows = await db.all(`SELECT a.id, a.result_score, a.kpi_score, a.competency_score, a.grade, a.adjust_grade, e.emp_code, e.emp_name, o.org_name,
      l.level_name, lg.level_group_name AS level_group, p.position_name, a.org_id, e.level_group_id
    FROM assignment a JOIN employee e ON e.id=a.emp_id LEFT JOIN org o ON o.id=e.org_id LEFT JOIN level l ON l.id=e.level_id
    LEFT JOIN level_group lg ON lg.id=e.level_group_id LEFT JOIN position p ON p.id=e.position_id
    WHERE a.form_id=? AND a.assignment_type='individual' AND a.result_score IS NOT NULL`, formId);
  const key = mode === 'vertical' ? 'org_name' : mode === 'horizontal' ? 'level_group' : null;
  const groups = {};
  for (const r of rows) (groups[key ? r[key] ?? '-' : 'Company'] ??= []).push(r);
  const dist = Object.entries(cfg.distribution);
  const out = [];
  for (const [group, list] of Object.entries(groups)) {
    const people = list.map((r) => ({ ...r, empCode: r.emp_code, result: r.result_score, kpi: r.kpi_score, competency: r.competency_score, systemGrade: r.grade }));
    const ranked = core.forceRankGroup(people, dist);
    const n = ranked.rows.length;
    for (const r of ranked.rows) {
      out.push({
        id: r.id, result_score: r.result_score, grade: r.grade, adjust_grade: r.adjust_grade, emp_code: r.emp_code, emp_name: r.emp_name,
        org_name: r.org_name, level_name: r.level_name, level_group: r.level_group, position_name: r.position_name,
        group, no: r.rank, force_rank_grade: r.frGrade, is_tie: r.tie, forced: r.forced,
        force_rank_index: core.round(((n - r.rank + 1) / n) * 100, 2),
      });
    }
  }
  out.sort((a, b) => a.group.localeCompare(b.group) || a.no - b.no);
  if (apply) await db.batch(out.map((r) => ['UPDATE assignment SET adjust_grade=? WHERE id=?', r.force_rank_grade, r.id]));
  return { distribution: cfg.distribution, rows: out };
}
