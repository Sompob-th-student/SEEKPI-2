import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { resources, tableOf, permissionKeys } from './resources.js';
import { periodsOf } from './scoring-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SEEKPI_DB || join(here, 'data', 'seekpi2.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

const sqlType = (f) => (f.type === 'number' || f.type === 'bool' || f.type === 'ref' ? (f.type === 'number' ? 'REAL' : 'INTEGER') : 'TEXT');

function createSchema() {
  for (const [key, r] of Object.entries(resources)) {
    const cols = r.fields.map((f) => {
      let c = `"${f.name}" ${sqlType(f)}`;
      if (f.unique) c += ' UNIQUE';
      return c;
    });
    if (key === 'user') cols.push('password_hash TEXT NOT NULL');
    db.exec(`CREATE TABLE IF NOT EXISTS "${tableOf(key)}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols.join(', ')},
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permission (
      role_id INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE, url TEXT NOT NULL,
      is_view INTEGER DEFAULT 0, is_add INTEGER DEFAULT 0, is_edit INTEGER DEFAULT 0, is_delete INTEGER DEFAULT 0,
      PRIMARY KEY (role_id, url));
    CREATE TABLE IF NOT EXISTS assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INTEGER NOT NULL REFERENCES form(id),
      assignment_type TEXT NOT NULL DEFAULT 'individual', emp_id INTEGER REFERENCES employee(id), org_id INTEGER REFERENCES org(id),
      status TEXT NOT NULL DEFAULT 'Draft', kpi_score REAL, competency_score REAL, base_score REAL, deduct_total REAL,
      is_get_zero INTEGER NOT NULL DEFAULT 0, result_score REAL, total5 REAL, grade TEXT, adjust_grade TEXT, remark TEXT,
      assign_date TEXT, end_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    -- One row per structure on a scorecard: its weight (from Appraisal Criteria x Level Group), workflow stage and score.
    CREATE TABLE IF NOT EXISTS assignment_structure (
      assignment_id INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
      structure_id INTEGER NOT NULL REFERENCES structure(id), weight_pct REAL NOT NULL DEFAULT 0,
      stage TEXT NOT NULL, score100 REAL, score5 REAL, complete INTEGER DEFAULT 0,
      PRIMARY KEY (assignment_id, structure_id));
    -- 5 target levels and the actual for every period of a KPI line (Monthly 12 / Quarterly 4 / Yearly 1).
    CREATE TABLE IF NOT EXISTS assignment_item_period (
      assignment_item_id INTEGER NOT NULL REFERENCES assignment_item(id) ON DELETE CASCADE,
      period_no INTEGER NOT NULL, l1 REAL, l2 REAL, l3 REAL, l4 REAL, l5 REAL, actual_value REAL, score REAL,
      source TEXT NOT NULL DEFAULT 'manual',
      PRIMARY KEY (assignment_item_id, period_no));
    -- Structure weight per Level Group (original: Appraisal Criteria data table).
    CREATE TABLE IF NOT EXISTS criteria_weight (
      criteria_id INTEGER NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
      level_group_id INTEGER NOT NULL REFERENCES level_group(id), structure_id INTEGER NOT NULL REFERENCES structure(id),
      weight_pct REAL NOT NULL DEFAULT 0, PRIMARY KEY (criteria_id, level_group_id, structure_id));
    -- ACTION TO: ordered chain of assessors / approvers of a scorecard (original emp_detail.action_to)
    CREATE TABLE IF NOT EXISTS assessor_chain (
      assignment_id INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE, seq_no INTEGER NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES employee(id), PRIMARY KEY (assignment_id, seq_no));
    CREATE TABLE IF NOT EXISTS stage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
      structure_id INTEGER NOT NULL, from_stage TEXT, to_stage TEXT NOT NULL, user_id INTEGER, remark TEXT,
      acted_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS assignment_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES item(id), weight_percent REAL NOT NULL DEFAULT 0, target_value REAL,
      actual_value REAL, achievement REAL, score REAL, weighted_score REAL,
      max_value REAL, unit_deduct_score REAL, value_get_zero REAL, deduct_score REAL,
      is_waived INTEGER NOT NULL DEFAULT 0, waive_reason TEXT);
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INTEGER REFERENCES form(id), from_user_id INTEGER REFERENCES user(id),
      to_emp_id INTEGER NOT NULL REFERENCES employee(id), topic TEXT, rating INTEGER, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, usage_datetime TEXT DEFAULT CURRENT_TIMESTAMP, user_id INTEGER,
      page_name TEXT, action TEXT, action_id TEXT);
  `);
}

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

function insert(table, obj) {
  const keys = Object.keys(obj);
  const r = run(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => obj[k]));
  return Number(r.lastInsertRowid);
}

// Deterministic pseudo-random so the demo data is the same on every reseed.
let seedState = 20261105;
const rnd = () => ((seedState = (seedState * 1103515245 + 12345) % 2147483648) / 2147483648);

function seed() {
  if (get('SELECT COUNT(*) n FROM company').n > 0) return;
  db.exec('BEGIN');
  const C = insert('company', { company_code: 'SYNTEC', company_name: 'Syntec Construction PCL', business_line: 'General Contractor (Tier-1)', is_active: 1 });
  const lvCo = insert('level', { seq_no: 1, level_name: 'Company', appraisal_type: 'Organization', company_id: C, is_active: 1 });
  const lvDiv = insert('level', { seq_no: 2, level_name: 'Division', appraisal_type: 'Organization', parent_id: lvCo, company_id: C, is_active: 1 });
  const lvDept = insert('level', { seq_no: 3, level_name: 'Department', appraisal_type: 'Organization', parent_id: lvDiv, company_id: C, is_active: 1 });
  const lvInd = insert('level', { seq_no: 4, level_name: 'Individual', appraisal_type: 'Individual', parent_id: lvDept, company_id: C, is_active: 1 });

  const lgMgmt = insert('level_group', { level_group_name: 'Management (M1-M3)', company_id: C, is_active: 1, is_vfr: 0 });
  const lgEng = insert('level_group', { level_group_name: 'Engineer / Professional (P1-P4)', company_id: C, is_active: 1, is_vfr: 1 });
  const lgSup = insert('level_group', { level_group_name: 'Supervisor / Foreman (S1-S3)', company_id: C, is_active: 1, is_vfr: 1 });
  const lgCorp = insert('level_group', { level_group_name: 'Company level (Corporate)', company_id: C, is_active: 1, is_vfr: 0 });

  const orgHQ = insert('org', { org_code: 'HQ', org_name: 'Syntec Head Office', company_id: C, level_id: lvCo, effective_date: '2025-01-01', is_active: 1 });
  const divs = {};
  for (const [code, name] of [['ENG', 'Engineering & Design Division'], ['OPS', 'Construction Operations Division'], ['SUP', 'Corporate Support Division']]) {
    divs[code] = insert('org', { org_code: code, org_name: name, company_id: C, level_id: lvDiv, parent_id: orgHQ, effective_date: '2025-01-01', is_active: 1 });
  }
  const depts = [
    ['VDC', 'BIM & VDC Department', 'ENG'], ['MEP', 'MEP Engineering Department', 'ENG'], ['STR', 'Structural Engineering Department', 'ENG'],
    ['PM-HC', 'Project Management - Healthcare', 'OPS'], ['PM-DC', 'Project Management - Data Center', 'OPS'], ['PM-HR', 'Project Management - High-rise', 'OPS'],
    ['QAQC', 'QA/QC Department', 'OPS'], ['SHE', 'Safety, Health & Environment', 'OPS'],
    ['PROC', 'Procurement Department', 'SUP'], ['FIN', 'Finance & Accounting', 'SUP'], ['HR', 'Human Resources', 'SUP'],
  ].map(([code, name, d]) => ({ code, id: insert('org', { org_code: code, org_name: name, company_id: C, level_id: lvDept, parent_id: divs[d], effective_date: '2025-01-01', is_active: 1 }) }));

  const pgMgr = insert('position_group', { position_group_code: 'MGR', position_group_name: 'Manager', company_id: C, is_active: 1 });
  const pgEng = insert('position_group', { position_group_code: 'ENG', position_group_name: 'Engineer', company_id: C, is_active: 1 });
  const pgSup = insert('position_group', { position_group_code: 'SUP', position_group_name: 'Site Supervisor', company_id: C, is_active: 1 });
  const pos = {};
  for (const [code, name, g] of [
    ['DM', 'Department Manager', pgMgr], ['PM', 'Project Manager', pgMgr], ['BIMM', 'BIM Manager', pgMgr],
    ['BIMC', 'BIM Coordinator', pgEng], ['SE', 'Structural Engineer', pgEng], ['ME', 'MEP Engineer', pgEng], ['QE', 'QA/QC Engineer', pgEng],
    ['SO', 'Safety Officer', pgEng], ['PE', 'Procurement Officer', pgEng], ['ACC', 'Accountant', pgEng], ['HRO', 'HR Officer', pgEng],
    ['SS', 'Site Supervisor', pgSup], ['FM', 'Foreman', pgSup],
  ]) pos[code] = insert('position', { position_code: code, position_name: name, position_group_id: g, company_id: C, effective_date: '2025-01-01', is_active: 1 });

  const persp = {};
  for (const [n, a, c] of [['Financial', 'F', '#3d6bb3'], ['Customer', 'C', '#82ca9d'], ['Internal Process', 'P', '#FFCC00'], ['Learning & Growth', 'L', '#98cad3']]) {
    persp[a] = insert('perspective', { perspective_name: n, perspective_abbr: a, company_id: C, color_code: c, is_active: 1 });
  }
  const ktCorp = insert('kpi_type', { kpi_type_name: 'Corporate KPI', company_id: C, is_active: 1 });
  const ktFunc = insert('kpi_type', { kpi_type_name: 'Functional KPI', company_id: C, is_active: 1 });
  const ktInd = insert('kpi_type', { kpi_type_name: 'Individual KPI', company_id: C, is_active: 1 });
  const uom = {};
  for (const [n, d] of [['%', 0], ['Index', 0], ['Days', 0], ['Cases', 0], ['MTHB', 0], ['Hours', 0], ['Score', 0], ['Date', 1]]) uom[n] = insert('uom', { uom_name: n, company_id: C, is_date: d, is_active: 1 });

  // Structures as configured in the original SEE KPI for Syntec: three KPI blocks + Competency.
  const stCP = insert('structure', { seq_no: 1, structure_name: 'Company Performance', company_id: C, target_score: 5, structure_type: 'Quantity', is_active: 1 });
  const stPP = insert('structure', { seq_no: 2, structure_name: 'Project Performance', company_id: C, target_score: 5, structure_type: 'Quantity', is_active: 1 });
  const stIP = insert('structure', { seq_no: 3, structure_name: 'Individual Performance', company_id: C, target_score: 5, structure_type: 'Quantity', is_active: 1 });
  const stComp = insert('structure', { seq_no: 4, structure_name: 'Competency', company_id: C, target_score: 5, structure_type: 'Quality', is_active: 1 });
  for (const [s, n] of [[1, 'Needs significant improvement'], [2, 'Below expectation'], [3, 'Meets expectation'], [4, 'Exceeds expectation'], [5, 'Outstanding / role model']]) {
    insert('competency_score', { structure_id: stComp, score: s, score_name: n });
  }
  const crit = insert('criteria', { criteria_name: 'Syntec Appraisal Criteria 2025', company_id: C, effective_date: '2025-01-01' });
  // Structure weight per Level Group (rows of the original Appraisal Criteria table)
  const weightRows = [
    [lgCorp, { [stCP]: 100 }],
    [lgMgmt, { [stCP]: 20, [stPP]: 50, [stComp]: 30 }],
    [lgEng, { [stPP]: 40, [stIP]: 40, [stComp]: 20 }],
    [lgSup, { [stPP]: 50, [stIP]: 50 }],
  ];
  for (const [lg, w] of weightRows) for (const st of [stCP, stPP, stIP, stComp]) {
    run('INSERT INTO criteria_weight (criteria_id, level_group_id, structure_id, weight_pct) VALUES (?,?,?,?)', crit, lg, st, w[st] ?? 0);
  }
  const thr = insert('threshold_group', { threshold_group_name: 'Standard 5-level threshold', company_id: C, thresholds: resources.threshold_group.fields[2].default, effective_date: '2025-01-01', is_active: 1 });
  const gc = insert('grade_criteria', { grade_criteria_name: 'Syntec Grade FE-NM', company_id: C, grades: resources.grade_criteria.fields[2].default, effective_date: '2025-01-01' });
  const frg = insert('force_rank_group', { fr_group_name: 'Company bell curve', company_id: C, distribution: resources.force_rank_group.fields[2].default, effective_date: '2025-01-01' });

  const forms = [
    insert('form', { form_name: 'Performance Evaluation 2025', company_id: C, appraisal_year: 2025, start_date: '2025-01-01', end_date: '2025-12-31', criteria_id: crit, threshold_group_id: thr, grade_criteria_id: gc, force_rank_group_id: frg, is_active: 1 }),
    insert('form', { form_name: 'Performance Evaluation 2026', company_id: C, appraisal_year: 2026, start_date: '2026-01-01', end_date: '2026-12-31', criteria_id: crit, threshold_group_id: thr, grade_criteria_id: gc, force_rank_group_id: frg, is_active: 1 }),
  ];

  // KPI library per structure: [code, name, perspective, kpi type, uom, direction, frequency, target per period]
  const lib = {
    [stCP]: [
      ['CP-NEW', 'New contracts secured (THB million)', 'F', ktCorp, 'MTHB', 'Higher is better', 'Quarterly', 2125],
      ['CP-GPM', 'Company gross profit margin', 'F', ktCorp, '%', 'Higher is better', 'Quarterly', 12],
      ['CP-LTI', 'Company LTIFR', 'P', ktCorp, 'Index', 'Lower is better', 'Quarterly', 0.5],
      ['CP-CSAT', 'Client satisfaction score', 'C', ktCorp, 'Score', 'Higher is better', 'Yearly', 4.2],
    ],
    [stPP]: [
      ['PP-SPI', 'Schedule Performance Index (SPI)', 'P', ktFunc, 'Index', 'Higher is better', 'Monthly', 1.0],
      ['PP-CPI', 'Cost Performance Index (CPI)', 'F', ktFunc, 'Index', 'Higher is better', 'Monthly', 1.0],
      ['PP-NCR', 'NCR closure within 14 days', 'P', ktFunc, '%', 'Higher is better', 'Monthly', 90],
      ['PP-LTI', 'Project LTIFR', 'P', ktFunc, 'Index', 'Lower is better', 'Quarterly', 0.5],
      ['PP-DEF', 'Defects at handover per 1,000 m2', 'C', ktFunc, 'Cases', 'Lower is better', 'Quarterly', 8],
      ['PP-CLASH', 'BIM clash resolution before IFC', 'P', ktFunc, '%', 'Higher is better', 'Monthly', 95],
      ['PP-RFI', 'Average RFI turnaround time', 'C', ktFunc, 'Days', 'Lower is better', 'Monthly', 5],
    ],
    [stIP]: [
      ['IP-TRAIN', 'Training hours', 'L', ktInd, 'Hours', 'Higher is better', 'Yearly', 40],
      ['IP-SHOP', 'Shop drawings approved at first submission', 'P', ktInd, '%', 'Higher is better', 'Quarterly', 80],
      ['IP-AUDIT', 'Audit adjustment entries', 'F', ktInd, 'Cases', 'Lower is better', 'Quarterly', 2],
      ['IP-REPORT', 'Reports submitted on time', 'P', ktInd, '%', 'Higher is better', 'Monthly', 95],
    ],
  };
  const kpi = {};
  for (const [st, rows] of Object.entries(lib)) for (const [code, name, p, kt, u, vt, freq, target] of rows) {
    kpi[code] = { target, vt, freq, st: Number(st),
      id: insert('item', { item_code: code, item_name: name, structure_id: Number(st), perspective_id: persp[p], kpi_type_id: kt, uom_id: uom[u], value_type: vt, frequency: freq, sum_up: u === 'Cases' || u === 'MTHB' ? 1 : 0, effective_date: '2025-01-01', is_active: 1 }) };
  }
  const comps = ['Safety leadership', 'Collaboration & coordination', 'Digital / BIM adoption', 'Quality mindset', 'Customer focus'].map((n, i) => ({
    id: insert('item', { item_code: `C-${i + 1}`, item_name: n, structure_id: stComp, perspective_id: persp.L, kpi_type_id: ktInd, uom_id: uom.Score, value_type: 'Higher is better', frequency: 'Yearly', effective_date: '2025-01-01', is_active: 1 }),
  }));
  // Five target levels around the period target (score 3 = target), as on the original Assignment screen.
  const levelsFor = (k) => {
    const t = k.target, f = k.vt === 'Lower is better' ? [1.4, 1.2, 1, 0.8, 0.6] : [0.8, 0.9, 1, 1.1, 1.2];
    return f.map((x) => Math.round(t * x * 10000) / 10000);
  };

  // Employees (fictional demo data)
  const people = [
    ['E0001', 'Somchai Wattanakul', 'VDC', 'BIMM', lgMgmt, 145000], ['E0002', 'Pimchanok Srisuk', 'VDC', 'BIMC', lgEng, 62000],
    ['E0003', 'Nattapong Chaiyaporn', 'VDC', 'BIMC', lgEng, 58000], ['E0004', 'Kittipong Boonmee', 'MEP', 'DM', lgMgmt, 138000],
    ['E0005', 'Arisa Thongdee', 'MEP', 'ME', lgEng, 55000], ['E0006', 'Thanawat Phromma', 'MEP', 'ME', lgEng, 51000],
    ['E0007', 'Supaporn Kaewmanee', 'STR', 'DM', lgMgmt, 142000], ['E0008', 'Wichai Rattanapong', 'STR', 'SE', lgEng, 60000],
    ['E0009', 'Jiraporn Saetang', 'STR', 'SE', lgEng, 53000], ['E0010', 'Prasert Jaidee', 'PM-HC', 'PM', lgMgmt, 165000],
    ['E0011', 'Anucha Somboon', 'PM-HC', 'SS', lgSup, 42000], ['E0012', 'Ratchanee Inthong', 'PM-DC', 'PM', lgMgmt, 172000],
    ['E0013', 'Chaiwat Nakprasert', 'PM-DC', 'SS', lgSup, 44000], ['E0014', 'Sakda Pongsri', 'PM-DC', 'FM', lgSup, 36000],
    ['E0015', 'Montri Kanjana', 'PM-HR', 'PM', lgMgmt, 158000], ['E0016', 'Boonsong Yodsri', 'PM-HR', 'FM', lgSup, 35000],
    ['E0017', 'Siriporn Mahachai', 'QAQC', 'QE', lgEng, 54000], ['E0018', 'Teerapat Wongsawat', 'QAQC', 'QE', lgEng, 50000],
    ['E0019', 'Orawan Klinsukon', 'SHE', 'SO', lgEng, 48000], ['E0020', 'Phaithoon Saengthong', 'SHE', 'SO', lgEng, 47000],
    ['E0021', 'Kanokwan Petchrat', 'PROC', 'PE', lgEng, 46000], ['E0022', 'Damrong Srisawat', 'FIN', 'ACC', lgEng, 49000],
    ['E0023', 'Ploypailin Chantra', 'HR', 'HRO', lgEng, 45000], ['E0024', 'Narong Thepsiri', 'PM-HC', 'SS', lgSup, 41000],
  ];
  const deptId = Object.fromEntries(depts.map((d) => [d.code, d.id]));
  const emps = people.map(([code, name, dept, p, lg, salary]) => ({
    code, dept, p, lg,
    id: insert('employee', { emp_code: code, emp_name: name, email: `${code.toLowerCase()}@syntec.example`, org_id: deptId[dept], level_id: lvInd, level_group_id: lg, position_id: pos[p], salary, is_active: 1 }),
  }));
  // Line managers: department managers / PMs evaluate their department
  for (const e of emps) {
    const chief = emps.find((m) => m.dept === e.dept && m.lg === lgMgmt && m.id !== e.id);
    if (chief) run('UPDATE employee SET chief_emp_id=? WHERE id=?', chief.id, e.id);
  }

  // KPI portfolio per department and structure
  const ppByDept = {
    VDC: ['PP-CLASH', 'PP-RFI', 'PP-SPI'], MEP: ['PP-CLASH', 'PP-RFI', 'PP-NCR'], STR: ['PP-RFI', 'PP-NCR', 'PP-SPI'],
    'PM-HC': ['PP-SPI', 'PP-CPI', 'PP-LTI'], 'PM-DC': ['PP-SPI', 'PP-CPI', 'PP-DEF'], 'PM-HR': ['PP-SPI', 'PP-CPI', 'PP-LTI'],
    QAQC: ['PP-NCR', 'PP-DEF', 'PP-SPI'], SHE: ['PP-LTI', 'PP-NCR', 'PP-SPI'], PROC: ['PP-CPI', 'PP-RFI', 'PP-SPI'],
    FIN: ['PP-CPI', 'PP-SPI', 'PP-NCR'], HR: ['PP-SPI', 'PP-NCR', 'PP-CPI'],
  };
  const ipByDept = {
    VDC: ['IP-SHOP', 'IP-TRAIN', 'IP-REPORT'], MEP: ['IP-SHOP', 'IP-TRAIN', 'IP-REPORT'], STR: ['IP-SHOP', 'IP-TRAIN', 'IP-REPORT'],
    'PM-HC': ['IP-REPORT', 'IP-TRAIN'], 'PM-DC': ['IP-REPORT', 'IP-TRAIN'], 'PM-HR': ['IP-REPORT', 'IP-TRAIN'],
    QAQC: ['IP-REPORT', 'IP-TRAIN'], SHE: ['IP-REPORT', 'IP-TRAIN'], PROC: ['IP-AUDIT', 'IP-REPORT', 'IP-TRAIN'],
    FIN: ['IP-AUDIT', 'IP-REPORT', 'IP-TRAIN'], HR: ['IP-REPORT', 'IP-TRAIN'],
  };
  const W = { 1: [100], 2: [60, 40], 3: [40, 30, 30], 4: [30, 30, 20, 20] };
  const weightOf = (lg, st) => get('SELECT weight_pct w FROM criteria_weight WHERE criteria_id=? AND level_group_id=? AND structure_id=?', crit, lg, st)?.w ?? 0;

  /** periods with actuals: 2025 = whole year; 2026 = up to October */
  const filledPeriods = (freq, fi) => (fi === 0 ? periodsOf(freq).length : freq === 'Monthly' ? 10 : freq === 'Quarterly' ? 3 : 0);
  const addKpiLine = (a, code, weight, fi, perf) => {
    const k = kpi[code];
    const ai = insert('assignment_item', { assignment_id: a, item_id: k.id, weight_percent: weight, target_value: k.target });
    const L = levelsFor(k), n = periodsOf(k.freq).length, filled = filledPeriods(k.freq, fi);
    for (let p = 1; p <= n; p++) {
      const factor = perf + (rnd() - 0.5) * 0.25;
      const actual = p <= filled ? Math.round((k.vt === 'Lower is better' ? k.target / Math.max(0.3, factor) : k.target * factor) * 100) / 100 : null;
      insert('assignment_item_period', { assignment_item_id: ai, period_no: p, l1: L[0], l2: L[1], l3: L[2], l4: L[3], l5: L[4], actual_value: actual });
    }
  };
  // 2026 workflow stages to show a realistic mix
  const stage2026 = ['SAVE_DRAFT_ACTUAL', 'REVIEW_ACTUAL', 'APPROVE_ACTUAL', 'APPROVE_ITEM'];
  forms.forEach((formId, fi) => {
    emps.forEach((e, ei) => {
      const a = insert('assignment', { form_id: formId, assignment_type: 'individual', emp_id: e.id, org_id: deptId[e.dept], status: '', assign_date: fi ? '2026-01-01' : '2025-01-01', end_date: fi ? '2026-12-31' : '2025-12-31' });
      const perf = 0.92 + rnd() * 0.22; // employee-level performance tendency
      const chief = get('SELECT chief_emp_id c FROM employee WHERE id=?', e.id)?.c;
      if (chief) run('INSERT INTO assessor_chain (assignment_id, seq_no, employee_id) VALUES (?,?,?)', a, 1, chief);
      for (const st of [stCP, stPP, stIP, stComp]) {
        const w = weightOf(e.lg, st);
        if (!w) continue;
        const isComp = st === stComp;
        const stage = fi === 0 ? 'END_TO_VERTICAL' : isComp ? (ei % 2 ? 'APPRAISAL' : 'SUBMIT') : stage2026[ei % 4];
        insert('assignment_structure', { assignment_id: a, structure_id: st, weight_pct: w, stage });
        if (isComp) {
          const rated = fi === 0 || ei % 2 === 0;
          comps.forEach((c) => {
            const ai = insert('assignment_item', { assignment_id: a, item_id: c.id, weight_percent: 20, target_value: 5, actual_value: rated ? Math.min(5, Math.max(1, Math.round(perf * 3.6 + (rnd() - 0.5) * 2))) : null });
            insert('assignment_item_period', { assignment_item_id: ai, period_no: 1, l1: 1, l2: 2, l3: 3, l4: 4, l5: 5, actual_value: null });
          });
        } else {
          const codes = st === stCP ? ['CP-NEW', 'CP-GPM', 'CP-LTI', 'CP-CSAT'] : st === stPP ? ppByDept[e.dept] : ipByDept[e.dept];
          codes.forEach((code, i) => addKpiLine(a, code, W[codes.length][i], fi, perf));
        }
      }
    });
    // Corporate (company-level) scorecard: Company Performance 100%
    const ca = insert('assignment', { form_id: formId, assignment_type: 'corporate', org_id: orgHQ, status: '', assign_date: fi ? '2026-01-01' : '2025-01-01', end_date: fi ? '2026-12-31' : '2025-12-31' });
    insert('assignment_structure', { assignment_id: ca, structure_id: stCP, weight_pct: 100, stage: fi === 0 ? 'END_TO_VERTICAL' : 'SAVE_DRAFT_ACTUAL' });
    ['CP-NEW', 'CP-GPM', 'CP-LTI', 'CP-CSAT'].forEach((code, i) => addKpiLine(ca, code, W[4][i], fi, 1.0));
  });

  // Roles & permissions
  const roleAdmin = insert('role', { role_name: 'System Administrator', company_id: C, is_active: 1 });
  const roleHR = insert('role', { role_name: 'HR Appraisal Officer', company_id: C, is_active: 1 });
  const roleEmp = insert('role', { role_name: 'Employee', company_id: C, is_active: 1 });
  for (const url of permissionKeys) {
    run('INSERT INTO role_permission VALUES (?,?,?,?,?,?)', roleAdmin, url, 1, 1, 1, 1);
    const hrView = !['ldap', 'data_integration', 'role', 'user'].includes(url);
    run('INSERT INTO role_permission VALUES (?,?,?,?,?,?)', roleHR, url, hrView ? 1 : 0, hrView ? 1 : 0, hrView ? 1 : 0, 0);
    const empView = ['appraisal', 'feedback', 'dashboard_overall_performance'].includes(url);
    run('INSERT INTO role_permission VALUES (?,?,?,?,?,?)', roleEmp, url, empView ? 1 : 0, 0, empView && url !== 'dashboard_overall_performance' ? 1 : 0, 0);
  }
  // Local demo accounts (test credentials, documented in README.md)
  insert('user', { user_name: 'admin', first_name: 'System', last_name: 'Administrator', email: 'admin@syntec.example', role_id: roleAdmin, is_active: 1, password_hash: bcrypt.hashSync('admin123', 10) });
  insert('user', { user_name: 'hr', first_name: 'Ploypailin', last_name: 'Chantra', email: 'hr@syntec.example', role_id: roleHR, employee_id: emps[22].id, is_active: 1, password_hash: bcrypt.hashSync('hr123', 10) });
  insert('user', { user_name: 'E0002', first_name: 'Pimchanok', last_name: 'Srisuk', email: 'e0002@syntec.example', role_id: roleEmp, employee_id: emps[1].id, is_active: 1, password_hash: bcrypt.hashSync('demo123', 10) });
  // E0001 is E0002's chief (BIM Manager): evaluator in the workflow
  insert('user', { user_name: 'E0001', first_name: 'Somchai', last_name: 'Wattanakul', email: 'e0001@syntec.example', role_id: roleEmp, employee_id: emps[0].id, is_active: 1, password_hash: bcrypt.hashSync('demo123', 10) });

  insert('password_policy', { password_policy_name: 'Syntec standard policy', min_length: 10, require_upper: 1, require_number: 1, expire_days: 90 });
  insert('email_server', { email_server_name: 'Corporate SMTP', mail_host: 'smtp.syntec.example', mail_port: 587, mail_username: 'seekpi-noreply', is_active: 1 });
  insert('feedback', { form_id: forms[1], from_user_id: 2, to_emp_id: emps[1].id, topic: 'BIM coordination - Data Center project', rating: 5, comment: 'Clash detection reports were issued ahead of every MEP coordination meeting.' });
  db.exec('COMMIT');
}

createSchema();
seed();
export { DB_PATH };
