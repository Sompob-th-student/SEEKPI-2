import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { db, all, get, run } from './db.js';
import { resources, refAlias, tableOf, permissionKeys } from './resources.js';
import { calculateAssignment, recalculateAll, forceRank, formConfig, structureWeights } from './scoring.js';
import { allowedActions, canTransition, canInput, firstStage, stageInfo } from './workflow.js';
import { round, periodsOf, sumUp } from './scoring-core.js';

const round2 = (x) => round(x, 2);

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const IDLE = '30m'; // original app: 30 min idle timer (REACT_APP_IDLE_TIMER / timeout:18e5)

recalculateAll();

const app = express();
app.use(express.json({ limit: '5mb' }));

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r !== undefined) res.json(r); } catch (e) { next(e); } };
const log = (req, page, action, id) => run('INSERT INTO usage_log (user_id,page_name,action,action_id) VALUES (?,?,?,?)', req.user?.id ?? null, page, action, id == null ? null : String(id));

function permissionsOf(roleId) {
  return all('SELECT url, is_view, is_add, is_edit, is_delete FROM role_permission WHERE role_id=?', roleId);
}

// ---------- auth ----------
app.post('/api/login', wrap((req) => {
  const { username, password, language } = req.body || {};
  const u = get('SELECT * FROM user WHERE (user_name=? OR email=?) AND is_active=1', username ?? '', username ?? '');
  if (!u || !bcrypt.compareSync(password ?? '', u.password_hash)) throw new HttpError(401, '401LI');
  const token = jwt.sign({ id: u.id }, SECRET, { expiresIn: '8h' });
  req.user = u; log(req, 'login', 'login', u.id);
  const { password_hash, ...user } = u;
  return { token, user: { ...user, language: language || 'en' }, permission: permissionsOf(u.role_id) };
}));

function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  try {
    const { id } = jwt.verify(h.replace(/^Bearer /, ''), SECRET);
    const u = get('SELECT * FROM user WHERE id=? AND is_active=1', id);
    if (!u) throw new Error();
    req.user = u;
    req.perms = Object.fromEntries(permissionsOf(u.role_id).map((p) => [p.url, p]));
    next();
  } catch { next(new HttpError(401, 'Unauthorized')); }
}
const can = (key, action = 'is_view') => (req, _res, next) => (req.perms[key]?.[action] === 1 ? next() : next(new HttpError(403, 'Forbidden')));
const canAny = (keys) => (req, _res, next) => (keys.some((k) => req.perms[k]?.is_view === 1) ? next() : next(new HttpError(403, 'Forbidden')));

app.use('/api', auth);

app.get('/api/me', wrap((req) => {
  const { password_hash, ...user } = req.user;
  const emp = user.employee_id ? get('SELECT e.*, o.org_name, p.position_name FROM employee e LEFT JOIN org o ON o.id=e.org_id LEFT JOIN position p ON p.id=e.position_id WHERE e.id=?', user.employee_id) : null;
  return { user, employee: emp, permission: Object.values(req.perms) };
}));
app.put('/api/me/password', wrap((req) => {
  const { old_password, new_password } = req.body;
  if (!bcrypt.compareSync(old_password ?? '', req.user.password_hash)) throw new HttpError(400, 'Current password is incorrect');
  const pol = get('SELECT * FROM password_policy ORDER BY id LIMIT 1');
  if (pol) {
    if ((new_password ?? '').length < pol.min_length) throw new HttpError(400, `Password must be at least ${pol.min_length} characters`);
    if (pol.require_upper && !/[A-Z]/.test(new_password)) throw new HttpError(400, 'Password must contain an uppercase letter');
    if (pol.require_number && !/[0-9]/.test(new_password)) throw new HttpError(400, 'Password must contain a number');
  }
  run('UPDATE user SET password_hash=? WHERE id=?', bcrypt.hashSync(new_password, 10), req.user.id);
  log(req, 'profile', 'change_password', req.user.id);
  return { ok: true };
}));

// ---------- metadata ----------
app.get('/api/meta', wrap(() => ({
  resources: Object.fromEntries(Object.entries(resources).map(([k, r]) => [k, { ...r, fields: r.fields.map((f) => ({ ...f, alias: f.type === 'ref' ? refAlias(f) : undefined })) }])),
  permissionKeys,
})));

// ---------- generic CRUD ----------
function selectSql(key) {
  const r = resources[key];
  const joins = [], cols = ['t.*'];
  r.fields.filter((f) => f.type === 'ref').forEach((f, i) => {
    const rr = resources[f.ref];
    joins.push(`LEFT JOIN "${tableOf(f.ref)}" j${i} ON j${i}.id = t."${f.name}"`);
    cols.push(`j${i}."${rr.display}" AS "${refAlias(f)}"`);
  });
  return `SELECT ${cols.join(', ')} FROM "${tableOf(key)}" t ${joins.join(' ')}`;
}
const strip = (row) => { if (row) delete row.password_hash; return row; };
function resource(req) {
  const r = resources[req.params.res];
  if (!r) throw new HttpError(404, 'Unknown resource');
  return r;
}
function clean(r, body, partial) {
  const out = {};
  for (const f of r.fields) {
    if (!(f.name in body)) { if (!partial && f.default !== undefined) out[f.name] = f.default; continue; }
    let v = body[f.name];
    if (v === '' || v === undefined) v = null;
    if (v != null && (f.type === 'number' || f.type === 'ref')) v = Number(v);
    if (f.type === 'bool') v = v ? 1 : 0;
    if (f.type === 'json' && v != null && typeof v !== 'string') v = JSON.stringify(v);
    if (f.type === 'json' && v != null) { try { JSON.parse(v); } catch { throw new HttpError(400, `${f.name}: invalid JSON`); } }
    out[f.name] = v;
  }
  for (const f of r.fields) if (f.required && !partial && (out[f.name] == null || out[f.name] === '')) throw new HttpError(400, `${f.label} is required`);
  return out;
}
const guard = (action) => (req, res, next) => { const r = resources[req.params.res]; if (!r) return next(new HttpError(404, 'Unknown resource')); return can(r.perm, action)(req, res, next); };

app.get('/api/r/:res', guard('is_view'), wrap((req) => {
  const r = resource(req);
  let rows = all(`${selectSql(req.params.res)} ORDER BY t.id`).map(strip);
  const q = (req.query.q || '').toString().toLowerCase();
  if (q) rows = rows.filter((x) => Object.values(x).some((v) => v != null && String(v).toLowerCase().includes(q)));
  return rows;
}));
app.get('/api/r/:res/:id', guard('is_view'), wrap((req) => strip(get(`${selectSql(req.params.res)} WHERE t.id=?`, req.params.id)) ?? (() => { throw new HttpError(404, '404'); })()));
app.post('/api/r/:res', guard('is_add'), wrap((req) => {
  const r = resource(req), data = clean(r, req.body, false);
  if (req.params.res === 'user') {
    if (!req.body.password) throw new HttpError(400, 'Password is required');
    data.password_hash = bcrypt.hashSync(req.body.password, 10);
  }
  const keys = Object.keys(data);
  try {
    const out = run(`INSERT INTO "${tableOf(req.params.res)}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => data[k]));
    const id = Number(out.lastInsertRowid);
    if (req.params.res === 'role') for (const url of permissionKeys) run('INSERT INTO role_permission (role_id,url) VALUES (?,?)', id, url);
    log(req, r.perm, 'add', id);
    return strip(get(`${selectSql(req.params.res)} WHERE t.id=?`, id));
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, '2002'); throw e; }
}));
app.put('/api/r/:res/:id', guard('is_edit'), wrap((req) => {
  const r = resource(req), data = clean(r, req.body, true);
  if (req.params.res === 'user' && req.body.password) data.password_hash = bcrypt.hashSync(req.body.password, 10);
  const keys = Object.keys(data);
  if (keys.length) {
    try { run(`UPDATE "${tableOf(req.params.res)}" SET ${keys.map((k) => `"${k}"=?`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...keys.map((k) => data[k]), req.params.id); }
    catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, '2002'); throw e; }
  }
  log(req, r.perm, 'edit', req.params.id);
  return strip(get(`${selectSql(req.params.res)} WHERE t.id=?`, req.params.id));
}));
app.delete('/api/r/:res/:id', guard('is_delete'), wrap((req) => {
  const r = resource(req);
  try { run(`DELETE FROM "${tableOf(req.params.res)}" WHERE id=?`, req.params.id); }
  catch (e) { if (String(e.message).includes('FOREIGN KEY')) throw new HttpError(409, '2000'); throw e; }
  log(req, r.perm, 'delete', req.params.id);
  return { ok: true };
}));
// Dropdowns are readable by any signed-in user (filters on dashboards/reports need them).
app.get('/api/dropdown/:res', wrap((req) => {
  const r = resource(req);
  return all(`SELECT id, "${r.display}" AS name FROM "${tableOf(req.params.res)}" ORDER BY "${r.display}"`);
}));

// ---------- role permissions ----------
app.get('/api/role/:id/permissions', can('role'), wrap((req) => {
  const have = Object.fromEntries(permissionsOf(req.params.id).map((p) => [p.url, p]));
  return permissionKeys.map((url) => have[url] ?? { url, is_view: 0, is_add: 0, is_edit: 0, is_delete: 0 });
}));
app.put('/api/role/:id/permissions', can('role', 'is_edit'), wrap((req) => {
  db.exec('BEGIN');
  for (const p of req.body) {
    if (!permissionKeys.includes(p.url)) continue;
    run(`INSERT INTO role_permission (role_id,url,is_view,is_add,is_edit,is_delete) VALUES (?,?,?,?,?,?)
      ON CONFLICT(role_id,url) DO UPDATE SET is_view=excluded.is_view,is_add=excluded.is_add,is_edit=excluded.is_edit,is_delete=excluded.is_delete`,
    req.params.id, p.url, p.is_view ? 1 : 0, p.is_add ? 1 : 0, p.is_edit ? 1 : 0, p.is_delete ? 1 : 0);
  }
  db.exec('COMMIT');
  log(req, 'role', 'edit_permission', req.params.id);
  return { ok: true };
}));

// ---------- assignment ----------
const ASSIGN_SQL = `SELECT a.*, f.form_name, f.appraisal_year, e.emp_code, e.emp_name, e.chief_emp_id, e.level_group_id, o.org_name, l.level_name,
    lg.level_group_name AS level_group, p.position_name,
    (SELECT COUNT(*) FROM assignment_item WHERE assignment_id=a.id) AS item_count
  FROM assignment a JOIN form f ON f.id=a.form_id LEFT JOIN employee e ON e.id=a.emp_id LEFT JOIN org o ON o.id=COALESCE(e.org_id,a.org_id)
  LEFT JOIN level l ON l.id=e.level_id LEFT JOIN level_group lg ON lg.id=e.level_group_id LEFT JOIN position p ON p.id=e.position_id`;
const structuresOf = (id) => all(`SELECT ast.*, s.structure_name, s.structure_type, s.seq_no FROM assignment_structure ast
  JOIN structure s ON s.id=ast.structure_id WHERE ast.assignment_id=? ORDER BY s.seq_no`, id)
  .map((s) => ({ ...s, stage_en: stageInfo(s.structure_type, s.stage).en, stage_th: stageInfo(s.structure_type, s.stage).th }));
function listAssignments(q, extra = '', params = []) {
  const where = ['1=1'], p = [];
  if (q.form_id) { where.push('a.form_id=?'); p.push(q.form_id); }
  if (q.type) { where.push('a.assignment_type=?'); p.push(q.type); }
  if (q.org_id) { where.push('COALESCE(e.org_id,a.org_id)=?'); p.push(q.org_id); }
  if (q.status) { where.push('a.status=?'); p.push(q.status); }
  return all(`${ASSIGN_SQL} WHERE ${where.join(' AND ')} ${extra} ORDER BY e.emp_code, a.id`, ...p, ...params)
    .map((a) => ({ ...a, structures: structuresOf(a.id) }));
}

/** Workflow roles of the signed-in user on one scorecard. */
function rolesOn(req, a) {
  const admin = req.perms.assignment?.is_edit === 1 && req.perms.assignment?.is_delete === 1;
  const hr = req.perms.assignment?.is_edit === 1;
  const me = req.user.employee_id;
  return {
    owner: a.assignment_type === 'corporate' ? hr : !!me && me === a.emp_id,
    evaluator: hr || (!!me && (me === a.chief_emp_id || !!get('SELECT 1 FROM assessor_chain WHERE assignment_id=? AND employee_id=?', a.id, me))),
    admin,
  };
}
function fullAssignment(id, req) {
  const a = get(`${ASSIGN_SQL} WHERE a.id=?`, id);
  if (!a) throw new HttpError(404, '404');
  const roles = req ? rolesOn(req, a) : {};
  const structures = structuresOf(id).map((s) => {
    const items = all(`SELECT ai.*, i.item_code, i.item_name, i.value_type, i.frequency, i.sum_up, u.uom_name, pe.perspective_name, pe.color_code
      FROM assignment_item ai JOIN item i ON i.id=ai.item_id LEFT JOIN uom u ON u.id=i.uom_id LEFT JOIN perspective pe ON pe.id=i.perspective_id
      WHERE ai.assignment_id=? AND i.structure_id=? ORDER BY ai.id`, id, s.structure_id).map((it) => {
      const labels = periodsOf(it.frequency);
      const periods = all('SELECT * FROM assignment_item_period WHERE assignment_item_id=? ORDER BY period_no', it.id)
        .map((p) => ({ period_no: p.period_no, label: labels[p.period_no - 1] ?? `P${p.period_no}`, levels: [p.l1, p.l2, p.l3, p.l4, p.l5], actual_value: p.actual_value, score: p.score, source: p.source }));
      return { ...it, periods };
    });
    return { ...s, items, can_input: canInput(s.structure_type, s.stage), actions: allowedActions(s.structure_type, s.stage, roles) };
  });
  const log = all(`SELECT l.*, u.user_name FROM stage_log l LEFT JOIN user u ON u.id=l.user_id WHERE l.assignment_id=? ORDER BY l.id DESC LIMIT 50`, id);
  return { ...a, roles, structures, log, chain: assessorChain(id) };
}

const assessorChain = (id) => all(`SELECT c.seq_no, c.employee_id, e.emp_code, e.emp_name, p.position_name, o.org_name, pg.position_group_name
  FROM assessor_chain c JOIN employee e ON e.id=c.employee_id LEFT JOIN position p ON p.id=e.position_id LEFT JOIN org o ON o.id=e.org_id
  LEFT JOIN position_group pg ON pg.id=p.position_group_id WHERE c.assignment_id=? ORDER BY c.seq_no`, id);

app.get('/api/assignment', can('assignment'), wrap((req) => listAssignments(req.query)));

// ---------- ACTION TO (assessor chain) ----------
app.get('/api/assignment/:id/assessors', canAny(['assignment', 'appraisal']), wrap((req) => assessorChain(req.params.id)));
app.put('/api/assignment/:id/assessors', can('assignment', 'is_edit'), wrap((req) => {
  const chain = (req.body.chain || []).filter((c) => c.employee_id);
  const a = get('SELECT emp_id FROM assignment WHERE id=?', req.params.id);
  if (!a) throw new HttpError(404, '404');
  if (chain.some((c) => Number(c.employee_id) === a.emp_id)) throw new HttpError(400, 'An employee cannot assess their own scorecard');
  if (new Set(chain.map((c) => Number(c.employee_id))).size !== chain.length) throw new HttpError(400, 'Each assessor can appear only once');
  db.exec('BEGIN');
  run('DELETE FROM assessor_chain WHERE assignment_id=?', req.params.id);
  chain.forEach((c, i) => run('INSERT INTO assessor_chain (assignment_id, seq_no, employee_id) VALUES (?,?,?)', req.params.id, i + 1, c.employee_id));
  db.exec('COMMIT');
  log(req, 'assignment', 'action_to', req.params.id);
  return assessorChain(req.params.id);
}));
app.get('/api/assignment/:id', canAny(['assignment', 'appraisal']), wrap((req) => fullAssignment(req.params.id, req)));

/** Structure weights an employee (or a corporate scorecard) gets under a form. */
app.get('/api/structure-weights', canAny(['assignment', 'appraisal']), wrap((req) => {
  const lg = req.query.emp_id ? get('SELECT level_group_id FROM employee WHERE id=?', req.query.emp_id)?.level_group_id : corporateLevelGroup();
  return structureWeights(req.query.form_id, lg);
}));
const corporateLevelGroup = () => get("SELECT id FROM level_group WHERE level_group_name LIKE '%Corporate%' ORDER BY id LIMIT 1")?.id ?? null;

const num = (v) => (v === '' || v == null ? null : Number(v));
/**
 * Upsert KPI lines of one structure. Each line: { item_id, weight_percent, periods: [{ period_no, levels: [L1..L5] }] }
 * Actual values already entered are kept.
 */
function saveStructureItems(assignmentId, structureId, items) {
  const existing = all(`SELECT ai.id, ai.item_id FROM assignment_item ai JOIN item i ON i.id=ai.item_id
    WHERE ai.assignment_id=? AND i.structure_id=?`, assignmentId, structureId);
  const keep = new Set(items.map((i) => Number(i.item_id)));
  for (const e of existing) if (!keep.has(e.item_id)) run('DELETE FROM assignment_item WHERE id=?', e.id);
  for (const it of items) {
    const item = get('SELECT * FROM item WHERE id=?', it.item_id);
    if (!item || item.structure_id !== Number(structureId)) throw new HttpError(400, `Item ${it.item_id} does not belong to this structure`);
    let row = get('SELECT id FROM assignment_item WHERE assignment_id=? AND item_id=?', assignmentId, it.item_id);
    if (row) run('UPDATE assignment_item SET weight_percent=?, max_value=?, unit_deduct_score=?, value_get_zero=? WHERE id=?',
      Number(it.weight_percent || 0), num(it.max_value), num(it.unit_deduct_score), num(it.value_get_zero), row.id);
    else row = { id: Number(run(`INSERT INTO assignment_item (assignment_id,item_id,weight_percent,max_value,unit_deduct_score,value_get_zero)
      VALUES (?,?,?,?,?,?)`, assignmentId, it.item_id, Number(it.weight_percent || 0), num(it.max_value), num(it.unit_deduct_score), num(it.value_get_zero)).lastInsertRowid) };
    const n = periodsOf(item.frequency).length;
    for (let p = 1; p <= n; p++) {
      const src = (it.periods || []).find((x) => Number(x.period_no) === p) ?? (it.periods || [])[0];
      const L = (src?.levels ?? [null, null, null, null, null]).map(num);
      run(`INSERT INTO assignment_item_period (assignment_item_id, period_no, l1, l2, l3, l4, l5) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(assignment_item_id, period_no) DO UPDATE SET l1=excluded.l1, l2=excluded.l2, l3=excluded.l3, l4=excluded.l4, l5=excluded.l5`,
      row.id, p, ...L);
    }
    run('DELETE FROM assignment_item_period WHERE assignment_item_id=? AND period_no>?', row.id, n);
  }
}
function checkWeights(structures) {
  for (const [sid, s] of Object.entries(structures || {})) {
    const st = get('SELECT structure_type, structure_name FROM structure WHERE id=?', sid);
    if (!st || st.structure_type === 'Deduct Score' || !(s.items || []).length) continue;
    const total = s.items.reduce((x, i) => x + Number(i.weight_percent || 0), 0);
    if (Math.abs(total - 100) > 0.001) throw new HttpError(400, `${st.structure_name}: total %Weight is ${total}, it must be 100`);
  }
}

app.post('/api/assignment', can('assignment', 'is_add'), wrap((req) => {
  const { form_id, assignment_type = 'individual', emp_ids = [], org_id, structures = {}, assign_date, end_date } = req.body;
  if (!form_id) throw new HttpError(400, 'Form is required');
  if (!Object.values(structures).some((s) => (s.items || []).length)) throw new HttpError(400, 'Add at least one KPI');
  checkWeights(structures);
  const form = get('SELECT * FROM form WHERE id=?', form_id);
  const targets = assignment_type === 'corporate' ? [{ emp: null, org: org_id, lg: corporateLevelGroup() }]
    : emp_ids.map((e) => { const emp = get('SELECT org_id, level_group_id FROM employee WHERE id=?', e); return { emp: e, org: emp?.org_id, lg: emp?.level_group_id }; });
  if (!targets.length || (assignment_type === 'corporate' && !org_id)) throw new HttpError(400, assignment_type === 'corporate' ? 'Organization is required' : 'Select at least one employee');
  const ids = [];
  db.exec('BEGIN');
  try {
    for (const t of targets) {
      if (t.emp && get('SELECT id FROM assignment WHERE form_id=? AND emp_id=?', form_id, t.emp)) throw new HttpError(409, '2002');
      const id = Number(run('INSERT INTO assignment (form_id,assignment_type,emp_id,org_id,status,assign_date,end_date) VALUES (?,?,?,?,?,?,?)',
        form_id, assignment_type, t.emp, t.org, '', assign_date || form.start_date, end_date || form.end_date).lastInsertRowid);
      for (const w of structureWeights(form_id, t.lg)) {
        const s = structures[w.structure_id];
        if (!w.weight_pct || !s || !(s.items || []).length) continue; // structure not used by this level group
        run('INSERT INTO assignment_structure (assignment_id, structure_id, weight_pct, stage) VALUES (?,?,?,?)', id, w.structure_id, w.weight_pct, firstStage(w.structure_type));
        saveStructureItems(id, w.structure_id, s.items);
      }
      ids.push(id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  ids.forEach((id) => calculateAssignment(id));
  log(req, 'assignment', 'add', ids.join(','));
  return { ids };
}));
app.put('/api/assignment/:id', can('assignment', 'is_edit'), wrap((req) => {
  const { structures = {}, assign_date, end_date, remark } = req.body;
  checkWeights(structures);
  db.exec('BEGIN');
  try {
    for (const [sid, s] of Object.entries(structures)) {
      if (!get('SELECT 1 FROM assignment_structure WHERE assignment_id=? AND structure_id=?', req.params.id, sid)) continue;
      saveStructureItems(req.params.id, sid, s.items || []);
    }
    run('UPDATE assignment SET assign_date=COALESCE(?,assign_date), end_date=COALESCE(?,end_date), remark=COALESCE(?,remark), updated_at=CURRENT_TIMESTAMP WHERE id=?',
      assign_date ?? null, end_date ?? null, remark ?? null, req.params.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  calculateAssignment(req.params.id);
  log(req, 'assignment', 'edit', req.params.id);
  return fullAssignment(req.params.id, req);
}));
app.delete('/api/assignment/:id', can('assignment', 'is_delete'), wrap((req) => {
  run('DELETE FROM assignment WHERE id=?', req.params.id); log(req, 'assignment', 'delete', req.params.id); return { ok: true };
}));

// ---------- criteria weights (Level Group x Structure) ----------
app.get('/api/criteria/:id/weights', can('criteria'), wrap((req) => ({
  level_groups: all('SELECT id, level_group_name FROM level_group WHERE is_active=1 ORDER BY id'),
  structures: all("SELECT id, structure_name FROM structure WHERE is_active=1 AND structure_type<>'Deduct Score' ORDER BY seq_no"),
  weights: all('SELECT level_group_id, structure_id, weight_pct FROM criteria_weight WHERE criteria_id=?', req.params.id),
})));
app.put('/api/criteria/:id/weights', can('criteria', 'is_edit'), wrap((req) => {
  const rows = req.body.weights || [];
  const byLg = {};
  for (const r of rows) byLg[r.level_group_id] = (byLg[r.level_group_id] ?? 0) + Number(r.weight_pct || 0);
  for (const [lg, total] of Object.entries(byLg)) if (total !== 0 && Math.abs(total - 100) > 0.001) {
    throw new HttpError(400, `${get('SELECT level_group_name n FROM level_group WHERE id=?', lg)?.n}: total weight is ${total}, it must be 100`);
  }
  db.exec('BEGIN');
  run('DELETE FROM criteria_weight WHERE criteria_id=?', req.params.id);
  for (const r of rows) run('INSERT INTO criteria_weight (criteria_id, level_group_id, structure_id, weight_pct) VALUES (?,?,?,?)', req.params.id, r.level_group_id, r.structure_id, Number(r.weight_pct || 0));
  db.exec('COMMIT');
  log(req, 'criteria', 'edit_weights', req.params.id);
  return { ok: true };
}));

// ---------- appraisal (data entry & evaluation, workflow per structure) ----------
app.get('/api/appraisal', can('appraisal'), wrap((req) => {
  const isAdmin = req.perms.assignment?.is_view === 1;
  if (!isAdmin) { // employees see only their own (and their subordinates')
    return listAssignments(req.query, 'AND (a.emp_id=? OR e.chief_emp_id=?)', [req.user.employee_id ?? -1, req.user.employee_id ?? -1]);
  }
  return listAssignments(req.query);
}));
/**
 * Save results and/or move one structure to the next stage.
 * body: { structure_id, actuals: [{ assignment_item_id, period_no, actual_value }], ratings: [{ assignment_item_id, actual_value }],
 *         action: '<to stage code>', remark, adjust_grade }
 */
app.put('/api/appraisal/:id', can('appraisal', 'is_edit'), wrap((req) => {
  const { structure_id, actuals = [], ratings = [], waive = [], action, remark, adjust_grade } = req.body;
  const a = get(`${ASSIGN_SQL} WHERE a.id=?`, req.params.id);
  if (!a) throw new HttpError(404, '404');
  const roles = rolesOn(req, a);
  if (!roles.owner && !roles.evaluator && !roles.admin) throw new HttpError(403, 'Forbidden');
  db.exec('BEGIN');
  try {
    if (structure_id) {
      const st = get(`SELECT ast.*, s.structure_type FROM assignment_structure ast JOIN structure s ON s.id=ast.structure_id
        WHERE ast.assignment_id=? AND ast.structure_id=?`, req.params.id, structure_id);
      if (!st) throw new HttpError(404, 'Structure is not on this scorecard');
      if (actuals.length || ratings.length) {
        if (!canInput(st.structure_type, st.stage)) throw new HttpError(409, `Results cannot be changed at stage "${stageInfo(st.structure_type, st.stage).en}"`);
        if (ratings.length && !(roles.evaluator || roles.admin)) throw new HttpError(403, 'Only the evaluator can rate competencies');
        for (const x of actuals) run(`UPDATE assignment_item_period SET actual_value=? WHERE period_no=? AND assignment_item_id IN
          (SELECT id FROM assignment_item WHERE id=? AND assignment_id=?)`, num(x.actual_value), x.period_no, x.assignment_item_id, req.params.id);
        for (const x of ratings) run('UPDATE assignment_item SET actual_value=? WHERE id=? AND assignment_id=?', num(x.actual_value), x.assignment_item_id, req.params.id);
      }
      if (waive.length) {
        if (!(roles.evaluator || roles.admin)) throw new HttpError(403, 'Only the evaluator or admin can waive a KPI');
        if (st.stage.startsWith('END_')) throw new HttpError(409, 'The structure is closed');
        if (waive.some((w) => w.is_waived && !String(w.reason ?? '').trim())) throw new HttpError(400, 'A reason is required to waive a KPI');
        for (const w of waive) run(`UPDATE assignment_item SET is_waived=?, waive_reason=? WHERE id=? AND assignment_id=?
          AND item_id IN (SELECT id FROM item WHERE structure_id=?)`, w.is_waived ? 1 : 0, w.is_waived ? (w.reason ?? null) : null, w.assignment_item_id, req.params.id, structure_id);
      }
      if (action) {
        if (!canTransition(st.structure_type, st.stage, action, roles)) throw new HttpError(403, `Action "${action}" is not allowed from "${stageInfo(st.structure_type, st.stage).en}"`);
        run('UPDATE assignment_structure SET stage=? WHERE assignment_id=? AND structure_id=?', action, req.params.id, structure_id);
        run('INSERT INTO stage_log (assignment_id, structure_id, from_stage, to_stage, user_id, remark) VALUES (?,?,?,?,?,?)',
          req.params.id, structure_id, st.stage, action, req.user.id, remark ?? null);
      }
    }
    if (adjust_grade !== undefined && roles.admin) run('UPDATE assignment SET adjust_grade=? WHERE id=?', adjust_grade || null, req.params.id);
    if (remark !== undefined && !action) run('UPDATE assignment SET remark=? WHERE id=?', remark, req.params.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  calculateAssignment(req.params.id);
  log(req, 'appraisal', action ? `stage:${action}` : 'save', req.params.id);
  return fullAssignment(req.params.id, req);
}));

/**
 * SUM UP: fill this structure's period actuals from the same KPIs on subordinate scorecards of the same form.
 * individual scorecard: employees whose chief is this employee; corporate / org scorecard: every individual
 * scorecard in that organization and its sub-organizations. Item flag sum_up = add, otherwise average.
 */
app.post('/api/appraisal/:id/sum-up', can('appraisal', 'is_edit'), wrap((req) => {
  const { structure_id } = req.body;
  const a = get(`${ASSIGN_SQL} WHERE a.id=?`, req.params.id);
  if (!a) throw new HttpError(404, '404');
  const roles = rolesOn(req, a);
  if (!roles.owner && !roles.evaluator && !roles.admin) throw new HttpError(403, 'Forbidden');
  const st = get(`SELECT ast.*, s.structure_type FROM assignment_structure ast JOIN structure s ON s.id=ast.structure_id
    WHERE ast.assignment_id=? AND ast.structure_id=?`, a.id, structure_id);
  if (!st) throw new HttpError(404, 'Structure is not on this scorecard');
  if (st.structure_type !== 'Quantity') throw new HttpError(400, 'SUM UP applies to KPI structures only');
  if (!canInput(st.structure_type, st.stage)) throw new HttpError(409, `Results cannot be changed at stage "${stageInfo(st.structure_type, st.stage).en}"`);
  const subs = a.assignment_type === 'individual'
    ? all(`SELECT x.id FROM assignment x JOIN employee e ON e.id=x.emp_id WHERE x.form_id=? AND x.assignment_type='individual' AND e.chief_emp_id=?`, a.form_id, a.emp_id)
    : all(`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT o.id FROM org o JOIN tree t ON o.parent_id=t.id)
        SELECT x.id FROM assignment x JOIN employee e ON e.id=x.emp_id WHERE x.form_id=? AND x.assignment_type='individual' AND e.org_id IN (SELECT id FROM tree)`, a.org_id, a.form_id);
  if (!subs.length) throw new HttpError(409, 'No subordinate scorecards to sum up');
  const ids = subs.map((x) => x.id);
  const lines = all(`SELECT ai.id, ai.item_id, i.sum_up FROM assignment_item ai JOIN item i ON i.id=ai.item_id WHERE ai.assignment_id=? AND i.structure_id=?`, a.id, structure_id);
  let periods = 0, kpis = 0;
  db.exec('BEGIN');
  try {
    for (const l of lines) {
      const rows = all(`SELECT p.period_no, p.actual_value FROM assignment_item_period p JOIN assignment_item ai ON ai.id=p.assignment_item_id
        WHERE ai.item_id=? AND ai.is_waived=0 AND ai.assignment_id IN (${ids.map(() => '?').join(',')})`, l.item_id, ...ids);
      if (!rows.length) continue;
      kpis++;
      const byPeriod = {};
      for (const r of rows) (byPeriod[r.period_no] ??= []).push(r.actual_value);
      for (const [p, values] of Object.entries(byPeriod)) {
        const v = sumUp(values, l.sum_up ? 'sum' : 'average');
        if (v == null) continue;
        run(`UPDATE assignment_item_period SET actual_value=?, source='sum_up' WHERE assignment_item_id=? AND period_no=?`, v, l.id, p);
        periods++;
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  calculateAssignment(a.id);
  log(req, 'appraisal', 'sum_up', a.id);
  return { ...fullAssignment(a.id, req), sum_up: { subordinates: ids.length, kpis, periods } };
}));

// ---------- force rank ----------
const frKeys = ['force_rank', 'force_rank_vertical', 'force_rank_horizontal', 'force_rank_horizontal_board'];
app.get('/api/force_rank', canAny(frKeys), wrap((req) => forceRank(req.query.form_id, req.query.mode)));
app.post('/api/force_rank/apply', canAny(frKeys), wrap((req) => { const r = forceRank(req.body.form_id, req.body.mode, true); log(req, 'force_rank', `apply:${req.body.mode}`, req.body.form_id); return r; }));

// ---------- salary import ----------
app.get('/api/salary', can('import_salary'), wrap(() => all('SELECT e.id, e.emp_code, e.emp_name, o.org_name, e.salary FROM employee e LEFT JOIN org o ON o.id=e.org_id ORDER BY e.emp_code')));
app.post('/api/salary/import', can('import_salary', 'is_edit'), wrap((req) => {
  const rows = req.body.rows || [];
  let updated = 0; const missing = [];
  db.exec('BEGIN');
  for (const r of rows) {
    const out = run('UPDATE employee SET salary=? WHERE emp_code=?', Number(r.salary), String(r.emp_code).trim());
    if (out.changes) updated++; else missing.push(r.emp_code);
  }
  db.exec('COMMIT');
  log(req, 'import_salary', 'import', updated);
  return { updated, missing };
}));

// ---------- dashboards ----------
const latestForm = () => get('SELECT id FROM form ORDER BY appraisal_year DESC LIMIT 1')?.id;
app.get('/api/dashboard/overall', can('dashboard_overall_performance'), wrap((req) => {
  const formId = req.query.form_id || latestForm();
  const statusCount = all("SELECT status, COUNT(*) n FROM assignment WHERE form_id=? AND assignment_type='individual' GROUP BY status", formId);
  const grades = all("SELECT COALESCE(adjust_grade,grade) grade, COUNT(*) n FROM assignment WHERE form_id=? AND assignment_type='individual' AND result_score IS NOT NULL GROUP BY 1 ORDER BY 1", formId);
  const perspective = all(`SELECT pe.perspective_name name, pe.color_code color, ROUND(AVG(ai.score)/5*100,1) achievement, ROUND(AVG(ai.score),2) score
    FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id JOIN item i ON i.id=ai.item_id JOIN perspective pe ON pe.id=i.perspective_id
    JOIN structure s ON s.id=i.structure_id WHERE a.form_id=? AND s.structure_type='Quantity' AND ai.score IS NOT NULL GROUP BY pe.id ORDER BY pe.id`, formId);
  const summary = get("SELECT COUNT(*) total, SUM(result_score IS NOT NULL) evaluated, ROUND(AVG(result_score),2) avg_score, MAX(result_score) max_score FROM assignment WHERE form_id=? AND assignment_type='individual'", formId);
  const corporate = get("SELECT id FROM assignment WHERE form_id=? AND assignment_type='corporate' LIMIT 1", formId);
  return { form_id: Number(formId), summary, statusCount, grades, perspective, corporate: corporate ? fullAssignment(corporate.id) : null };
}));
app.get('/api/dashboard/branch', can('dashboard_branch_performance'), wrap((req) => {
  const formId = req.query.form_id || latestForm();
  return all(`SELECT o.org_name name, COUNT(*) headcount, ROUND(AVG(a.result_score),2) avg_score, ROUND(MIN(a.result_score),2) min_score,
      ROUND(MAX(a.result_score),2) max_score FROM assignment a JOIN employee e ON e.id=a.emp_id JOIN org o ON o.id=e.org_id
    WHERE a.form_id=? AND a.result_score IS NOT NULL GROUP BY o.id ORDER BY avg_score DESC`, formId);
}));
app.get('/api/dashboard/comparison', can('dashboard_performance_comparison'), wrap((req) => {
  const by = req.query.by === 'level_group' ? 'lg.level_group_name' : 'o.org_name';
  const rows = all(`SELECT ${by} name, f.appraisal_year year, ROUND(AVG(a.result_score),2) avg_score FROM assignment a
    JOIN employee e ON e.id=a.emp_id JOIN form f ON f.id=a.form_id LEFT JOIN org o ON o.id=e.org_id LEFT JOIN level_group lg ON lg.id=e.level_group_id
    WHERE a.result_score IS NOT NULL GROUP BY 1,2 ORDER BY 1,2`);
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const map = {};
  for (const r of rows) (map[r.name] ??= { name: r.name })[r.year] = r.avg_score;
  return { years, rows: Object.values(map) };
}));
app.get('/api/dashboard/trend', can('dashboard_performance_trend'), wrap((req) => {
  const itemId = req.query.item_id;
  return all(`SELECT f.appraisal_year year, ROUND(AVG((SELECT AVG(p.l3) FROM assignment_item_period p WHERE p.assignment_item_id=ai.id)),2) target, ROUND(AVG(ai.actual_value),2) actual, ROUND(AVG(ai.score)/5*100,1) achievement
    FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id JOIN form f ON f.id=a.form_id
    WHERE ai.item_id=? AND ai.actual_value IS NOT NULL GROUP BY f.appraisal_year ORDER BY 1`, itemId);
}));

// ---------- reports ----------
const C = (field, label) => ({ field, label });
const baseCols = [C('no', 'no'), C('emp_code', 'empCode'), C('emp_name', 'empName'), C('level_name', 'level'), C('position_name', 'position'), C('org_name', 'organization'), C('status', 'status'), C('result_score', 'resultScore'), C('grade', 'grade'), C('adjust_grade', 'adjustGrade')];
const reports = {
  appraisal: { perm: 'report_appraisal', run: (q) => ({ columns: baseCols, rows: listAssignments({ ...q, type: 'individual' }) }) },
  appraisal_by_org: { perm: 'report_appraisal_by_org', run: (q) => ({
    columns: [C('org_name', 'organization'), C('headcount', 'headcount'), C('avg_score', 'avgScore'), C('A', 'A'), C('B', 'B'), C('C', 'C'), C('D', 'D'), C('E', 'E')],
    rows: gradeMatrix(q, 'o.org_name') }) },
  appraisal_by_level: { perm: 'report_appraisal_by_level', run: (q) => ({
    columns: [C('org_name', 'levelGroup'), C('headcount', 'headcount'), C('avg_score', 'avgScore'), C('A', 'A'), C('B', 'B'), C('C', 'C'), C('D', 'D'), C('E', 'E')],
    rows: gradeMatrix(q, 'lg.level_group_name') }) },
  appraisal_by_job_kpi: { perm: 'report_appraisal_by_job_kpi', run: (q) => ({
    columns: [C('item_code', 'itemCode'), C('item_name', 'itemName'), C('perspective_name', 'perspective'), C('assigned', 'assigned'), C('avg_target', 'target'), C('avg_actual', 'actual'), C('avg_achievement', 'achievement'), C('avg_score', 'score')],
    rows: all(`SELECT i.item_code, i.item_name, pe.perspective_name, COUNT(*) assigned, ROUND(AVG((SELECT AVG(p.l3) FROM assignment_item_period p WHERE p.assignment_item_id=ai.id)),2) avg_target, ROUND(AVG(ai.actual_value),2) avg_actual,
      ROUND(AVG(ai.score)/5*100,1) avg_achievement, ROUND(AVG(ai.score),2) avg_score FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id
      JOIN item i ON i.id=ai.item_id LEFT JOIN perspective pe ON pe.id=i.perspective_id WHERE a.form_id=? GROUP BY i.id ORDER BY i.item_code`, q.form_id || latestForm()) }) },
  data_entry: { perm: 'report_data_entry', run: (q) => ({
    columns: [C('emp_code', 'empCode'), C('emp_name', 'empName'), C('org_name', 'organization'), C('item_count', 'items'), C('filled', 'filled'), C('progress', 'progress'), C('status', 'status')],
    rows: listAssignments({ ...q, type: 'individual' }).map((a) => { const c = get(`SELECT COUNT(p.actual_value) f, COUNT(*) n FROM assignment_item_period p JOIN assignment_item ai ON ai.id=p.assignment_item_id JOIN item i ON i.id=ai.item_id JOIN structure s ON s.id=i.structure_id WHERE ai.assignment_id=? AND s.structure_type='Quantity'`, a.id); return { ...a, item_count: c.n, filled: c.f, progress: `${Math.round((c.f / (c.n || 1)) * 100)}%` }; }) }) },
  kpi: { perm: 'report_kpi', run: (q) => ({
    columns: [C('emp_code', 'empCode'), C('emp_name', 'empName'), C('item_code', 'itemCode'), C('item_name', 'itemName'), C('uom_name', 'uom'), C('weight_percent', 'weight'), C('target_value', 'target'), C('actual_value', 'actual'), C('achievement', 'achievement'), C('score', 'score')],
    rows: all(`SELECT e.emp_code, e.emp_name, i.item_code, i.item_name, u.uom_name, ai.weight_percent, (SELECT AVG(p.l3) FROM assignment_item_period p WHERE p.assignment_item_id=ai.id) target_value, ai.actual_value, ROUND(ai.score/5*100,1) achievement, ai.score
      FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id JOIN employee e ON e.id=a.emp_id JOIN item i ON i.id=ai.item_id
      JOIN structure s ON s.id=i.structure_id LEFT JOIN uom u ON u.id=i.uom_id WHERE a.form_id=? AND s.structure_type='Quantity' ${q.org_id ? 'AND e.org_id=?' : ''} ORDER BY e.emp_code, i.item_code`,
    ...[q.form_id || latestForm(), ...(q.org_id ? [q.org_id] : [])]) }) },
  performance_form: { perm: 'report_performance_form', run: (q) => ({
    columns: [...baseCols.slice(1, 7), C('competency_score', 'competency'), C('result_score', 'resultScore'), C('grade', 'grade'), C('remark', 'remark')],
    rows: listAssignments({ ...q, type: 'individual' }) }) },
  bonus_salary: { perm: 'report_bonus_salary', run: (q) => {
    const formId = q.form_id || latestForm(), cfg = formConfig(formId);
    const g = Object.fromEntries(cfg.grades.map((x) => [x.grade, x]));
    const rows = all(`${ASSIGN_SQL} WHERE a.form_id=? AND a.assignment_type='individual' ${q.org_id ? 'AND e.org_id=?' : ''} ORDER BY e.emp_code`, formId, ...(q.org_id ? [q.org_id] : []))
      .map((a) => {
        const salary = get('SELECT salary FROM employee WHERE id=?', a.emp_id)?.salary ?? 0;
        const gr = g[a.adjust_grade || a.grade] || { raise: 0, bonus: 0 };
        const raise = round2((salary * gr.raise) / 100); // BR-13: rounded to satang
        return { ...a, salary, raise_percent: gr.raise, raise_amount: raise, new_salary: round2(salary + raise), bonus_month: gr.bonus, final_bonus: round2(salary * gr.bonus) };
      });
    return { columns: [...baseCols.slice(1, 3), C('org_name', 'organization'), C('result_score', 'resultScore'), C('grade', 'grade'), C('adjust_grade', 'adjustGrade'), C('salary', 'salary'), C('raise_percent', 'raisePercent'), C('raise_amount', 'raiseAmount'), C('new_salary', 'newSalary'), C('bonus_month', 'bonusMonth'), C('final_bonus', 'finalBonus')], rows };
  } },
  usage_log: { perm: 'usage_log', run: () => ({
    columns: [C('usage_datetime', 'usageDateTime'), C('user_name', 'userName'), C('full_name', 'fullName'), C('emp_code', 'empCode'), C('page_name', 'pageName'), C('action', 'action'), C('action_id', 'actionId')],
    rows: all(`SELECT l.usage_datetime, u.user_name, TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) full_name, e.emp_code, l.page_name, l.action, l.action_id
      FROM usage_log l LEFT JOIN user u ON u.id=l.user_id LEFT JOIN employee e ON e.id=u.employee_id ORDER BY l.id DESC LIMIT 1000`) }) },
};
function gradeMatrix(q, by) {
  const rows = all(`SELECT ${by} k, COALESCE(a.adjust_grade,a.grade) g, COUNT(*) n, AVG(a.result_score) s FROM assignment a JOIN employee e ON e.id=a.emp_id
    LEFT JOIN org o ON o.id=e.org_id LEFT JOIN level_group lg ON lg.id=e.level_group_id WHERE a.form_id=? AND a.result_score IS NOT NULL GROUP BY 1,2`, q.form_id || latestForm());
  const m = {};
  for (const r of rows) { const x = (m[r.k] ??= { org_name: r.k, headcount: 0, sum: 0 }); x[r.g] = r.n; x.headcount += r.n; x.sum += r.s * r.n; }
  return Object.values(m).map(({ sum, ...x }) => ({ ...x, avg_score: Math.round((sum / x.headcount) * 100) / 100 }));
}
app.get('/api/report/:name', wrap((req, res, next) => {
  const r = reports[req.params.name];
  if (!r) throw new HttpError(404, 'Unknown report');
  if (req.perms[r.perm]?.is_view !== 1) throw new HttpError(403, 'Forbidden');
  const out = r.run(req.query);
  out.rows = out.rows.map((x, i) => ({ no: i + 1, ...x }));
  return out;
}));

// ---------- feedback ----------
app.get('/api/feedback', can('feedback'), wrap(() => all(`SELECT f.*, e.emp_code, e.emp_name, u.user_name from_user FROM feedback f
  JOIN employee e ON e.id=f.to_emp_id LEFT JOIN user u ON u.id=f.from_user_id ORDER BY f.id DESC`)));
app.post('/api/feedback', can('feedback'), wrap((req) => {
  const { to_emp_id, form_id, topic, rating, comment } = req.body;
  if (!to_emp_id || !comment) throw new HttpError(400, 'Employee and comment are required');
  const id = Number(run('INSERT INTO feedback (form_id,from_user_id,to_emp_id,topic,rating,comment) VALUES (?,?,?,?,?,?)', form_id ?? null, req.user.id, to_emp_id, topic ?? null, rating ?? null, comment).lastInsertRowid);
  log(req, 'feedback', 'add', id);
  return { id };
}));
app.get('/api/feedback/report', can('feedback_report'), wrap(() => all(`SELECT e.emp_code, e.emp_name, o.org_name, COUNT(f.id) feedback_count, ROUND(AVG(f.rating),2) avg_rating,
  MAX(f.created_at) last_feedback FROM employee e LEFT JOIN feedback f ON f.to_emp_id=e.id LEFT JOIN org o ON o.id=e.org_id GROUP BY e.id ORDER BY feedback_count DESC, e.emp_code`)));

// ---------- errors & static ----------
app.use('/api', (_req, _res, next) => next(new HttpError(404, '404')));
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? '500' : err.message });
});
const dist = join(here, '..', 'client', 'dist');
if (existsSync(dist)) {
  app.use('/seekpi-2', express.static(dist));
  app.get(/^\/seekpi-2(\/.*)?$/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  app.get('/', (_req, res) => res.redirect('/seekpi-2/'));
}
app.listen(PORT, '127.0.0.1', () => console.log(`seekpi-2 API listening on http://127.0.0.1:${PORT}`));
