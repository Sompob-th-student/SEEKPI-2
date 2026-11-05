// SEEKPI-2 API on Cloudflare Workers (Hono + D1).
// Port of seekpi-2/server/index.js: same routes, same request/response shapes, same rules.
// Business rules are imported unchanged from ../../server (scoring-core.js, workflow.js, resources.js).
// Static front-end files are served by Workers Static Assets (wrangler.jsonc "assets"); only /api/* reaches this code.
import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { d1, idList, IN_IDS } from './d1.js';
import { hashPassword, verifyPassword } from './password.js';
import { calculateAssignment, forceRank, formConfig, structureWeights } from './scoring-d1.js';
import { resources, refAlias, tableOf, permissionKeys } from '../../server/resources.js';
import { allowedActions, canTransition, canInput, firstStage, stageInfo } from '../../server/workflow.js';
import { round, periodsOf, sumUp } from '../../server/scoring-core.js';

const app = new Hono();
const round2 = (x) => round(x, 2);
const TOKEN_HOURS = 8;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

app.onError((err, c) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  return c.json({ message: status === 500 ? '500' : err.message }, status);
});
app.notFound((c) => c.json({ message: '404' }, 404));

// ---------- per-request context ----------
app.use('/api/*', async (c, next) => {
  if (!c.env.JWT_SECRET) fail(500, 'JWT_SECRET is not configured');
  c.set('db', d1(c.env.DB));
  await next();
});
const db = (c) => c.get('db');
const body = async (c) => { try { return await c.req.json(); } catch { return {}; } };
const log = (c, page, action, id) => db(c).run('INSERT INTO usage_log (user_id,page_name,action,action_id) VALUES (?,?,?,?)',
  c.get('user')?.id ?? null, page, action, id == null ? null : String(id));
const permissionsOf = (dbx, roleId) => dbx.all('SELECT url, is_view, is_add, is_edit, is_delete FROM role_permission WHERE role_id=?', roleId);

// ---------- auth ----------
app.post('/api/login', async (c) => {
  const { username, password, language } = await body(c);
  const u = await db(c).get('SELECT * FROM user WHERE (user_name=? OR email=?) AND is_active=1', username ?? '', username ?? '');
  if (!u || !(await verifyPassword(password ?? '', u.password_hash))) fail(401, '401LI');
  const token = await sign({ id: u.id, exp: Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600 }, c.env.JWT_SECRET, 'HS256');
  c.set('user', u);
  await log(c, 'login', 'login', u.id);
  const { password_hash, ...user } = u;
  return c.json({ token, user: { ...user, language: language || 'en' }, permission: await permissionsOf(db(c), u.role_id) });
});

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/login') return next();
  const h = c.req.header('authorization') || '';
  let id;
  try { ({ id } = await verify(h.replace(/^Bearer /, ''), c.env.JWT_SECRET, 'HS256')); } catch { fail(401, 'Unauthorized'); }
  const u = await db(c).get('SELECT * FROM user WHERE id=? AND is_active=1', id);
  if (!u) fail(401, 'Unauthorized');
  c.set('user', u);
  c.set('perms', Object.fromEntries((await permissionsOf(db(c), u.role_id)).map((p) => [p.url, p])));
  await next();
});
const can = (c, key, action = 'is_view') => { if (c.get('perms')[key]?.[action] !== 1) fail(403, 'Forbidden'); };
const canAny = (c, keys) => { if (!keys.some((k) => c.get('perms')[k]?.is_view === 1)) fail(403, 'Forbidden'); };

app.get('/api/me', async (c) => {
  const { password_hash, ...user } = c.get('user');
  const emp = user.employee_id ? await db(c).get('SELECT e.*, o.org_name, p.position_name FROM employee e LEFT JOIN org o ON o.id=e.org_id LEFT JOIN position p ON p.id=e.position_id WHERE e.id=?', user.employee_id) : null;
  return c.json({ user, employee: emp, permission: Object.values(c.get('perms')) });
});
app.put('/api/me/password', async (c) => {
  const { old_password, new_password } = await body(c);
  if (!(await verifyPassword(old_password ?? '', c.get('user').password_hash))) fail(400, 'Current password is incorrect');
  const pol = await db(c).get('SELECT * FROM password_policy ORDER BY id LIMIT 1');
  if (pol) {
    if ((new_password ?? '').length < pol.min_length) fail(400, `Password must be at least ${pol.min_length} characters`);
    if (pol.require_upper && !/[A-Z]/.test(new_password)) fail(400, 'Password must contain an uppercase letter');
    if (pol.require_number && !/[0-9]/.test(new_password)) fail(400, 'Password must contain a number');
  }
  await db(c).run('UPDATE user SET password_hash=? WHERE id=?', await hashPassword(new_password), c.get('user').id);
  await log(c, 'profile', 'change_password', c.get('user').id);
  return c.json({ ok: true });
});

// ---------- metadata ----------
app.get('/api/meta', (c) => c.json({
  resources: Object.fromEntries(Object.entries(resources).map(([k, r]) => [k, { ...r, fields: r.fields.map((f) => ({ ...f, alias: f.type === 'ref' ? refAlias(f) : undefined })) }])),
  permissionKeys,
}));

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
const resourceOf = (c) => resources[c.req.param('res')] ?? fail(404, 'Unknown resource');
function clean(r, b, partial) {
  const out = {};
  for (const f of r.fields) {
    if (!(f.name in b)) { if (!partial && f.default !== undefined) out[f.name] = f.default; continue; }
    let v = b[f.name];
    if (v === '' || v === undefined) v = null;
    if (v != null && (f.type === 'number' || f.type === 'ref')) v = Number(v);
    if (f.type === 'bool') v = v ? 1 : 0;
    if (f.type === 'json' && v != null && typeof v !== 'string') v = JSON.stringify(v);
    if (f.type === 'json' && v != null) { try { JSON.parse(v); } catch { fail(400, `${f.name}: invalid JSON`); } }
    out[f.name] = v;
  }
  for (const f of r.fields) if (f.required && !partial && (out[f.name] == null || out[f.name] === '')) fail(400, `${f.label} is required`);
  return out;
}
const sqlError = (e) => {
  const m = String(e?.message ?? e);
  if (m.includes('UNIQUE')) fail(409, '2002');
  if (m.includes('FOREIGN KEY')) fail(409, '2000');
  throw e;
};

app.get('/api/r/:res', async (c) => {
  const r = resourceOf(c); can(c, r.perm);
  let rows = (await db(c).all(`${selectSql(c.req.param('res'))} ORDER BY t.id`)).map(strip);
  const q = (c.req.query('q') || '').toLowerCase();
  if (q) rows = rows.filter((x) => Object.values(x).some((v) => v != null && String(v).toLowerCase().includes(q)));
  return c.json(rows);
});
app.get('/api/r/:res/:id', async (c) => {
  const r = resourceOf(c); can(c, r.perm);
  return c.json(strip(await db(c).get(`${selectSql(c.req.param('res'))} WHERE t.id=?`, c.req.param('id'))) ?? fail(404, '404'));
});
app.post('/api/r/:res', async (c) => {
  const r = resourceOf(c); can(c, r.perm, 'is_add');
  const res = c.req.param('res'), b = await body(c), data = clean(r, b, false);
  if (res === 'user') {
    if (!b.password) fail(400, 'Password is required');
    data.password_hash = await hashPassword(b.password);
  }
  const keys = Object.keys(data);
  const out = await db(c).run(`INSERT INTO "${tableOf(res)}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => data[k])).catch(sqlError);
  const id = Number(out.lastInsertRowid);
  if (res === 'role') await db(c).batch(permissionKeys.map((url) => ['INSERT INTO role_permission (role_id,url) VALUES (?,?)', id, url]));
  await log(c, r.perm, 'add', id);
  return c.json(strip(await db(c).get(`${selectSql(res)} WHERE t.id=?`, id)));
});
app.put('/api/r/:res/:id', async (c) => {
  const r = resourceOf(c); can(c, r.perm, 'is_edit');
  const res = c.req.param('res'), id = c.req.param('id'), b = await body(c), data = clean(r, b, true);
  if (res === 'user' && b.password) data.password_hash = await hashPassword(b.password);
  const keys = Object.keys(data);
  if (keys.length) {
    await db(c).run(`UPDATE "${tableOf(res)}" SET ${keys.map((k) => `"${k}"=?`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...keys.map((k) => data[k]), id).catch(sqlError);
  }
  await log(c, r.perm, 'edit', id);
  return c.json(strip(await db(c).get(`${selectSql(res)} WHERE t.id=?`, id)));
});
app.delete('/api/r/:res/:id', async (c) => {
  const r = resourceOf(c); can(c, r.perm, 'is_delete');
  await db(c).run(`DELETE FROM "${tableOf(c.req.param('res'))}" WHERE id=?`, c.req.param('id')).catch(sqlError);
  await log(c, r.perm, 'delete', c.req.param('id'));
  return c.json({ ok: true });
});
// Dropdowns are readable by any signed-in user (filters on dashboards/reports need them).
app.get('/api/dropdown/:res', async (c) => {
  const r = resourceOf(c);
  return c.json(await db(c).all(`SELECT id, "${r.display}" AS name FROM "${tableOf(c.req.param('res'))}" ORDER BY "${r.display}"`));
});

// ---------- role permissions ----------
app.get('/api/role/:id/permissions', async (c) => {
  can(c, 'role');
  const have = Object.fromEntries((await permissionsOf(db(c), c.req.param('id'))).map((p) => [p.url, p]));
  return c.json(permissionKeys.map((url) => have[url] ?? { url, is_view: 0, is_add: 0, is_edit: 0, is_delete: 0 }));
});
app.put('/api/role/:id/permissions', async (c) => {
  can(c, 'role', 'is_edit');
  const id = c.req.param('id'), rows = await body(c);
  await db(c).batch((Array.isArray(rows) ? rows : []).filter((p) => permissionKeys.includes(p.url)).map((p) => [
    `INSERT INTO role_permission (role_id,url,is_view,is_add,is_edit,is_delete) VALUES (?,?,?,?,?,?)
     ON CONFLICT(role_id,url) DO UPDATE SET is_view=excluded.is_view,is_add=excluded.is_add,is_edit=excluded.is_edit,is_delete=excluded.is_delete`,
    id, p.url, p.is_view ? 1 : 0, p.is_add ? 1 : 0, p.is_edit ? 1 : 0, p.is_delete ? 1 : 0]));
  await log(c, 'role', 'edit_permission', id);
  return c.json({ ok: true });
});

// ---------- assignment ----------
const ASSIGN_SQL = `SELECT a.*, f.form_name, f.appraisal_year, e.emp_code, e.emp_name, e.chief_emp_id, e.level_group_id, e.salary, o.org_name, l.level_name,
    lg.level_group_name AS level_group, p.position_name,
    (SELECT COUNT(*) FROM assignment_item WHERE assignment_id=a.id) AS item_count
  FROM assignment a JOIN form f ON f.id=a.form_id LEFT JOIN employee e ON e.id=a.emp_id LEFT JOIN org o ON o.id=COALESCE(e.org_id,a.org_id)
  LEFT JOIN level l ON l.id=e.level_id LEFT JOIN level_group lg ON lg.id=e.level_group_id LEFT JOIN position p ON p.id=e.position_id`;
const withStage = (s) => ({ ...s, stage_en: stageInfo(s.structure_type, s.stage).en, stage_th: stageInfo(s.structure_type, s.stage).th });
const STRUCT_SQL = `SELECT ast.*, s.structure_name, s.structure_type, s.seq_no FROM assignment_structure ast JOIN structure s ON s.id=ast.structure_id`;

async function listAssignments(dbx, q, extra = '', params = []) {
  const where = ['1=1'], p = [];
  if (q.form_id) { where.push('a.form_id=?'); p.push(q.form_id); }
  if (q.type) { where.push('a.assignment_type=?'); p.push(q.type); }
  if (q.org_id) { where.push('COALESCE(e.org_id,a.org_id)=?'); p.push(q.org_id); }
  if (q.status) { where.push('a.status=?'); p.push(q.status); }
  const rows = await dbx.all(`${ASSIGN_SQL} WHERE ${where.join(' AND ')} ${extra} ORDER BY e.emp_code, a.id`, ...p, ...params);
  if (!rows.length) return rows;
  const structs = await dbx.all(`${STRUCT_SQL} WHERE ast.assignment_id IN ${IN_IDS} ORDER BY s.seq_no`, idList(rows.map((r) => r.id)));
  const by = {};
  for (const s of structs) (by[s.assignment_id] ??= []).push(withStage(s));
  return rows.map((a) => ({ ...a, structures: by[a.id] ?? [] }));
}

/** Workflow roles of the signed-in user on one scorecard. */
async function rolesOn(c, a) {
  const perms = c.get('perms'), me = c.get('user').employee_id;
  const admin = perms.assignment?.is_edit === 1 && perms.assignment?.is_delete === 1;
  const hr = perms.assignment?.is_edit === 1;
  const inChain = me ? !!(await db(c).get('SELECT 1 FROM assessor_chain WHERE assignment_id=? AND employee_id=?', a.id, me)) : false;
  return {
    owner: a.assignment_type === 'corporate' ? hr : !!me && me === a.emp_id,
    evaluator: hr || (!!me && (me === a.chief_emp_id || inChain)),
    admin,
  };
}
const assessorChain = (dbx, id) => dbx.all(`SELECT c.seq_no, c.employee_id, e.emp_code, e.emp_name, p.position_name, o.org_name, pg.position_group_name
  FROM assessor_chain c JOIN employee e ON e.id=c.employee_id LEFT JOIN position p ON p.id=e.position_id LEFT JOIN org o ON o.id=e.org_id
  LEFT JOIN position_group pg ON pg.id=p.position_group_id WHERE c.assignment_id=? ORDER BY c.seq_no`, id);

async function fullAssignment(c, id, withRoles = true) {
  const dbx = db(c);
  const a = await dbx.get(`${ASSIGN_SQL} WHERE a.id=?`, id);
  if (!a) fail(404, '404');
  const roles = withRoles ? await rolesOn(c, a) : {};
  const [structs, items, periods, logRows, chain] = await Promise.all([
    dbx.all(`${STRUCT_SQL} WHERE ast.assignment_id=? ORDER BY s.seq_no`, id),
    dbx.all(`SELECT ai.*, i.item_code, i.item_name, i.value_type, i.frequency, i.sum_up, i.structure_id, u.uom_name, pe.perspective_name, pe.color_code
      FROM assignment_item ai JOIN item i ON i.id=ai.item_id LEFT JOIN uom u ON u.id=i.uom_id LEFT JOIN perspective pe ON pe.id=i.perspective_id
      WHERE ai.assignment_id=? ORDER BY ai.id`, id),
    dbx.all(`SELECT p.* FROM assignment_item_period p JOIN assignment_item ai ON ai.id=p.assignment_item_id WHERE ai.assignment_id=? ORDER BY p.period_no`, id),
    dbx.all(`SELECT l.*, u.user_name FROM stage_log l LEFT JOIN user u ON u.id=l.user_id WHERE l.assignment_id=? ORDER BY l.id DESC LIMIT 50`, id),
    assessorChain(dbx, id),
  ]);
  const byItem = {};
  for (const p of periods) (byItem[p.assignment_item_id] ??= []).push(p);
  const structures = structs.map(withStage).map((s) => ({
    ...s,
    items: items.filter((it) => it.structure_id === s.structure_id).map((it) => {
      const labels = periodsOf(it.frequency);
      return { ...it, periods: (byItem[it.id] ?? []).map((p) => ({ period_no: p.period_no, label: labels[p.period_no - 1] ?? `P${p.period_no}`, levels: [p.l1, p.l2, p.l3, p.l4, p.l5], actual_value: p.actual_value, score: p.score, source: p.source })) };
    }),
    can_input: canInput(s.structure_type, s.stage),
    actions: allowedActions(s.structure_type, s.stage, roles),
  }));
  return { ...a, roles, structures, log: logRows, chain };
}

app.get('/api/assignment', async (c) => { can(c, 'assignment'); return c.json(await listAssignments(db(c), c.req.query())); });

// ---------- ACTION TO (assessor chain) ----------
app.get('/api/assignment/:id/assessors', async (c) => { canAny(c, ['assignment', 'appraisal']); return c.json(await assessorChain(db(c), c.req.param('id'))); });
app.put('/api/assignment/:id/assessors', async (c) => {
  can(c, 'assignment', 'is_edit');
  const id = c.req.param('id');
  const chain = ((await body(c)).chain || []).filter((x) => x.employee_id);
  const a = await db(c).get('SELECT emp_id FROM assignment WHERE id=?', id);
  if (!a) fail(404, '404');
  if (chain.some((x) => Number(x.employee_id) === a.emp_id)) fail(400, 'An employee cannot assess their own scorecard');
  if (new Set(chain.map((x) => Number(x.employee_id))).size !== chain.length) fail(400, 'Each assessor can appear only once');
  await db(c).batch([['DELETE FROM assessor_chain WHERE assignment_id=?', id],
    ...chain.map((x, i) => ['INSERT INTO assessor_chain (assignment_id, seq_no, employee_id) VALUES (?,?,?)', id, i + 1, x.employee_id])]);
  await log(c, 'assignment', 'action_to', id);
  return c.json(await assessorChain(db(c), id));
});
app.get('/api/assignment/:id', async (c) => { canAny(c, ['assignment', 'appraisal']); return c.json(await fullAssignment(c, c.req.param('id'))); });

const corporateLevelGroup = async (dbx) => (await dbx.get("SELECT id FROM level_group WHERE level_group_name LIKE '%Corporate%' ORDER BY id LIMIT 1"))?.id ?? null;
/** Structure weights an employee (or a corporate scorecard) gets under a form. */
app.get('/api/structure-weights', async (c) => {
  canAny(c, ['assignment', 'appraisal']);
  const empId = c.req.query('emp_id');
  const lg = empId ? (await db(c).get('SELECT level_group_id FROM employee WHERE id=?', empId))?.level_group_id : await corporateLevelGroup(db(c));
  return c.json(await structureWeights(db(c), c.req.query('form_id'), lg));
});

const num = (v) => (v === '' || v == null ? null : Number(v));
/** Upsert KPI lines of one structure (actuals already entered are kept). */
async function saveStructureItems(dbx, assignmentId, structureId, items) {
  const existing = await dbx.all(`SELECT ai.id, ai.item_id FROM assignment_item ai JOIN item i ON i.id=ai.item_id
    WHERE ai.assignment_id=? AND i.structure_id=?`, assignmentId, structureId);
  const keep = new Set(items.map((i) => Number(i.item_id)));
  const writes = existing.filter((e) => !keep.has(e.item_id)).map((e) => ['DELETE FROM assignment_item WHERE id=?', e.id]);
  for (const it of items) {
    const item = await dbx.get('SELECT * FROM item WHERE id=?', it.item_id);
    if (!item || item.structure_id !== Number(structureId)) fail(400, `Item ${it.item_id} does not belong to this structure`);
    let row = existing.find((e) => e.item_id === Number(it.item_id));
    if (row) writes.push(['UPDATE assignment_item SET weight_percent=?, max_value=?, unit_deduct_score=?, value_get_zero=? WHERE id=?',
      Number(it.weight_percent || 0), num(it.max_value), num(it.unit_deduct_score), num(it.value_get_zero), row.id]);
    else row = { id: Number((await dbx.run(`INSERT INTO assignment_item (assignment_id,item_id,weight_percent,max_value,unit_deduct_score,value_get_zero)
      VALUES (?,?,?,?,?,?)`, assignmentId, it.item_id, Number(it.weight_percent || 0), num(it.max_value), num(it.unit_deduct_score), num(it.value_get_zero))).lastInsertRowid) };
    const n = periodsOf(item.frequency).length;
    for (let p = 1; p <= n; p++) {
      const src = (it.periods || []).find((x) => Number(x.period_no) === p) ?? (it.periods || [])[0];
      const L = (src?.levels ?? [null, null, null, null, null]).map(num);
      writes.push([`INSERT INTO assignment_item_period (assignment_item_id, period_no, l1, l2, l3, l4, l5) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(assignment_item_id, period_no) DO UPDATE SET l1=excluded.l1, l2=excluded.l2, l3=excluded.l3, l4=excluded.l4, l5=excluded.l5`, row.id, p, ...L]);
    }
    writes.push(['DELETE FROM assignment_item_period WHERE assignment_item_id=? AND period_no>?', row.id, n]);
  }
  await dbx.batch(writes);
}
async function checkWeights(dbx, structures) {
  for (const [sid, s] of Object.entries(structures || {})) {
    const st = await dbx.get('SELECT structure_type, structure_name FROM structure WHERE id=?', sid);
    if (!st || st.structure_type === 'Deduct Score' || !(s.items || []).length) continue;
    const total = s.items.reduce((x, i) => x + Number(i.weight_percent || 0), 0);
    if (Math.abs(total - 100) > 0.001) fail(400, `${st.structure_name}: total %Weight is ${total}, it must be 100`);
  }
}

app.post('/api/assignment', async (c) => {
  can(c, 'assignment', 'is_add');
  const dbx = db(c);
  const { form_id, assignment_type = 'individual', emp_ids = [], org_id, structures = {}, assign_date, end_date } = await body(c);
  if (!form_id) fail(400, 'Form is required');
  if (!Object.values(structures).some((s) => (s.items || []).length)) fail(400, 'Add at least one KPI');
  await checkWeights(dbx, structures);
  const form = await dbx.get('SELECT * FROM form WHERE id=?', form_id);
  const targets = assignment_type === 'corporate' ? [{ emp: null, org: org_id, lg: await corporateLevelGroup(dbx) }]
    : await Promise.all(emp_ids.map(async (e) => { const emp = await dbx.get('SELECT org_id, level_group_id FROM employee WHERE id=?', e); return { emp: e, org: emp?.org_id, lg: emp?.level_group_id }; }));
  if (!targets.length || (assignment_type === 'corporate' && !org_id)) fail(400, assignment_type === 'corporate' ? 'Organization is required' : 'Select at least one employee');
  for (const t of targets) if (t.emp && await dbx.get('SELECT id FROM assignment WHERE form_id=? AND emp_id=?', form_id, t.emp)) fail(409, '2002');
  // D1 has no multi-statement transactions across awaits: on a failure, remove the scorecards created so far.
  const ids = [];
  try {
    for (const t of targets) {
      const id = Number((await dbx.run('INSERT INTO assignment (form_id,assignment_type,emp_id,org_id,status,assign_date,end_date) VALUES (?,?,?,?,?,?,?)',
        form_id, assignment_type, t.emp, t.org, '', assign_date || form.start_date, end_date || form.end_date)).lastInsertRowid);
      ids.push(id);
      for (const w of await structureWeights(dbx, form_id, t.lg)) {
        const s = structures[w.structure_id];
        if (!w.weight_pct || !s || !(s.items || []).length) continue;
        await dbx.run('INSERT INTO assignment_structure (assignment_id, structure_id, weight_pct, stage) VALUES (?,?,?,?)', id, w.structure_id, w.weight_pct, firstStage(w.structure_type));
        await saveStructureItems(dbx, id, w.structure_id, s.items);
      }
    }
  } catch (e) {
    if (ids.length) await dbx.batch(ids.map((id) => ['DELETE FROM assignment WHERE id=?', id]));
    throw e;
  }
  for (const id of ids) await calculateAssignment(dbx, id);
  await log(c, 'assignment', 'add', ids.join(','));
  return c.json({ ids });
});
app.put('/api/assignment/:id', async (c) => {
  can(c, 'assignment', 'is_edit');
  const dbx = db(c), id = c.req.param('id');
  const { structures = {}, assign_date, end_date, remark } = await body(c);
  await checkWeights(dbx, structures);
  for (const [sid, s] of Object.entries(structures)) {
    if (!(await dbx.get('SELECT 1 FROM assignment_structure WHERE assignment_id=? AND structure_id=?', id, sid))) continue;
    await saveStructureItems(dbx, id, sid, s.items || []);
  }
  await dbx.run('UPDATE assignment SET assign_date=COALESCE(?,assign_date), end_date=COALESCE(?,end_date), remark=COALESCE(?,remark), updated_at=CURRENT_TIMESTAMP WHERE id=?',
    assign_date ?? null, end_date ?? null, remark ?? null, id);
  await calculateAssignment(dbx, id);
  await log(c, 'assignment', 'edit', id);
  return c.json(await fullAssignment(c, id));
});
app.delete('/api/assignment/:id', async (c) => {
  can(c, 'assignment', 'is_delete');
  await db(c).run('DELETE FROM assignment WHERE id=?', c.req.param('id'));
  await log(c, 'assignment', 'delete', c.req.param('id'));
  return c.json({ ok: true });
});

// ---------- criteria weights (Level Group x Structure) ----------
app.get('/api/criteria/:id/weights', async (c) => {
  can(c, 'criteria');
  const dbx = db(c);
  return c.json({
    level_groups: await dbx.all('SELECT id, level_group_name FROM level_group WHERE is_active=1 ORDER BY id'),
    structures: await dbx.all("SELECT id, structure_name FROM structure WHERE is_active=1 AND structure_type<>'Deduct Score' ORDER BY seq_no"),
    weights: await dbx.all('SELECT level_group_id, structure_id, weight_pct FROM criteria_weight WHERE criteria_id=?', c.req.param('id')),
  });
});
app.put('/api/criteria/:id/weights', async (c) => {
  can(c, 'criteria', 'is_edit');
  const dbx = db(c), id = c.req.param('id');
  const rows = (await body(c)).weights || [];
  const byLg = {};
  for (const r of rows) byLg[r.level_group_id] = (byLg[r.level_group_id] ?? 0) + Number(r.weight_pct || 0);
  for (const [lg, total] of Object.entries(byLg)) if (total !== 0 && Math.abs(total - 100) > 0.001) {
    fail(400, `${(await dbx.get('SELECT level_group_name n FROM level_group WHERE id=?', lg))?.n}: total weight is ${total}, it must be 100`);
  }
  await dbx.batch([['DELETE FROM criteria_weight WHERE criteria_id=?', id],
    ...rows.map((r) => ['INSERT INTO criteria_weight (criteria_id, level_group_id, structure_id, weight_pct) VALUES (?,?,?,?)', id, r.level_group_id, r.structure_id, Number(r.weight_pct || 0)])]);
  await log(c, 'criteria', 'edit_weights', id);
  return c.json({ ok: true });
});

// ---------- appraisal (data entry & evaluation, workflow per structure) ----------
app.get('/api/appraisal', async (c) => {
  can(c, 'appraisal');
  const me = c.get('user').employee_id ?? -1;
  if (c.get('perms').assignment?.is_view !== 1) {
    return c.json(await listAssignments(db(c), c.req.query(), 'AND (a.emp_id=? OR e.chief_emp_id=?)', [me, me]));
  }
  return c.json(await listAssignments(db(c), c.req.query()));
});
/** Save results, waive lines and/or move one structure to the next stage (all writes of one call go in one D1 batch). */
app.put('/api/appraisal/:id', async (c) => {
  can(c, 'appraisal', 'is_edit');
  const dbx = db(c), id = c.req.param('id');
  const { structure_id, actuals = [], ratings = [], waive = [], action, remark, adjust_grade } = await body(c);
  const a = await dbx.get(`${ASSIGN_SQL} WHERE a.id=?`, id);
  if (!a) fail(404, '404');
  const roles = await rolesOn(c, a);
  if (!roles.owner && !roles.evaluator && !roles.admin) fail(403, 'Forbidden');
  const writes = [];
  if (structure_id) {
    const st = await dbx.get(`SELECT ast.*, s.structure_type FROM assignment_structure ast JOIN structure s ON s.id=ast.structure_id
      WHERE ast.assignment_id=? AND ast.structure_id=?`, id, structure_id);
    if (!st) fail(404, 'Structure is not on this scorecard');
    if (actuals.length || ratings.length) {
      if (!canInput(st.structure_type, st.stage)) fail(409, `Results cannot be changed at stage "${stageInfo(st.structure_type, st.stage).en}"`);
      if (ratings.length && !(roles.evaluator || roles.admin)) fail(403, 'Only the evaluator can rate competencies');
      for (const x of actuals) writes.push([`UPDATE assignment_item_period SET actual_value=?, source='manual' WHERE period_no=? AND assignment_item_id IN
        (SELECT id FROM assignment_item WHERE id=? AND assignment_id=?)`, num(x.actual_value), x.period_no, x.assignment_item_id, id]);
      for (const x of ratings) writes.push(['UPDATE assignment_item SET actual_value=? WHERE id=? AND assignment_id=?', num(x.actual_value), x.assignment_item_id, id]);
    }
    if (waive.length) {
      if (!(roles.evaluator || roles.admin)) fail(403, 'Only the evaluator or admin can waive a KPI');
      if (st.stage.startsWith('END_')) fail(409, 'The structure is closed');
      if (waive.some((w) => w.is_waived && !String(w.reason ?? '').trim())) fail(400, 'A reason is required to waive a KPI');
      for (const w of waive) writes.push([`UPDATE assignment_item SET is_waived=?, waive_reason=? WHERE id=? AND assignment_id=?
        AND item_id IN (SELECT id FROM item WHERE structure_id=?)`, w.is_waived ? 1 : 0, w.is_waived ? (w.reason ?? null) : null, w.assignment_item_id, id, structure_id]);
    }
    if (action) {
      if (!canTransition(st.structure_type, st.stage, action, roles)) fail(403, `Action "${action}" is not allowed from "${stageInfo(st.structure_type, st.stage).en}"`);
      writes.push(['UPDATE assignment_structure SET stage=? WHERE assignment_id=? AND structure_id=?', action, id, structure_id]);
      writes.push(['INSERT INTO stage_log (assignment_id, structure_id, from_stage, to_stage, user_id, remark) VALUES (?,?,?,?,?,?)',
        id, structure_id, st.stage, action, c.get('user').id, remark ?? null]);
    }
  }
  if (adjust_grade !== undefined && roles.admin) writes.push(['UPDATE assignment SET adjust_grade=? WHERE id=?', adjust_grade || null, id]);
  if (remark !== undefined && !action) writes.push(['UPDATE assignment SET remark=? WHERE id=?', remark, id]);
  await dbx.batch(writes);
  await calculateAssignment(dbx, id);
  await log(c, 'appraisal', action ? `stage:${action}` : 'save', id);
  return c.json(await fullAssignment(c, id));
});

/** SUM UP: fill this structure's period actuals from the same KPIs on subordinate scorecards of the same form. */
app.post('/api/appraisal/:id/sum-up', async (c) => {
  can(c, 'appraisal', 'is_edit');
  const dbx = db(c);
  const { structure_id } = await body(c);
  const a = await dbx.get(`${ASSIGN_SQL} WHERE a.id=?`, c.req.param('id'));
  if (!a) fail(404, '404');
  const roles = await rolesOn(c, a);
  if (!roles.owner && !roles.evaluator && !roles.admin) fail(403, 'Forbidden');
  const st = await dbx.get(`SELECT ast.*, s.structure_type FROM assignment_structure ast JOIN structure s ON s.id=ast.structure_id
    WHERE ast.assignment_id=? AND ast.structure_id=?`, a.id, structure_id);
  if (!st) fail(404, 'Structure is not on this scorecard');
  if (st.structure_type !== 'Quantity') fail(400, 'SUM UP applies to KPI structures only');
  if (!canInput(st.structure_type, st.stage)) fail(409, `Results cannot be changed at stage "${stageInfo(st.structure_type, st.stage).en}"`);
  const subs = a.assignment_type === 'individual'
    ? await dbx.all(`SELECT x.id FROM assignment x JOIN employee e ON e.id=x.emp_id WHERE x.form_id=? AND x.assignment_type='individual' AND e.chief_emp_id=?`, a.form_id, a.emp_id)
    : await dbx.all(`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT o.id FROM org o JOIN tree t ON o.parent_id=t.id)
        SELECT x.id FROM assignment x JOIN employee e ON e.id=x.emp_id WHERE x.form_id=? AND x.assignment_type='individual' AND e.org_id IN (SELECT id FROM tree)`, a.org_id, a.form_id);
  if (!subs.length) fail(409, 'No subordinate scorecards to sum up');
  const ids = idList(subs.map((x) => x.id));
  const lines = await dbx.all(`SELECT ai.id, ai.item_id, i.sum_up FROM assignment_item ai JOIN item i ON i.id=ai.item_id WHERE ai.assignment_id=? AND i.structure_id=?`, a.id, structure_id);
  const sourceRows = await dbx.all(`SELECT ai.item_id, p.period_no, p.actual_value FROM assignment_item_period p JOIN assignment_item ai ON ai.id=p.assignment_item_id
    WHERE ai.is_waived=0 AND ai.assignment_id IN ${IN_IDS}`, ids);
  let periods = 0, kpis = 0;
  const writes = [];
  for (const l of lines) {
    const rows = sourceRows.filter((r) => r.item_id === l.item_id);
    if (!rows.length) continue;
    kpis++;
    const byPeriod = {};
    for (const r of rows) (byPeriod[r.period_no] ??= []).push(r.actual_value);
    for (const [p, values] of Object.entries(byPeriod)) {
      const v = sumUp(values, l.sum_up ? 'sum' : 'average');
      if (v == null) continue;
      writes.push([`UPDATE assignment_item_period SET actual_value=?, source='sum_up' WHERE assignment_item_id=? AND period_no=?`, v, l.id, Number(p)]);
      periods++;
    }
  }
  await dbx.batch(writes);
  await calculateAssignment(dbx, a.id);
  await log(c, 'appraisal', 'sum_up', a.id);
  return c.json({ ...(await fullAssignment(c, a.id)), sum_up: { subordinates: subs.length, kpis, periods } });
});

// ---------- force rank ----------
const frKeys = ['force_rank', 'force_rank_vertical', 'force_rank_horizontal', 'force_rank_horizontal_board'];
app.get('/api/force_rank', async (c) => { canAny(c, frKeys); return c.json(await forceRank(db(c), c.req.query('form_id'), c.req.query('mode'))); });
app.post('/api/force_rank/apply', async (c) => {
  canAny(c, frKeys);
  const b = await body(c);
  const r = await forceRank(db(c), b.form_id, b.mode, true);
  await log(c, 'force_rank', `apply:${b.mode}`, b.form_id);
  return c.json(r);
});

// ---------- salary import ----------
app.get('/api/salary', async (c) => {
  can(c, 'import_salary');
  return c.json(await db(c).all('SELECT e.id, e.emp_code, e.emp_name, o.org_name, e.salary FROM employee e LEFT JOIN org o ON o.id=e.org_id ORDER BY e.emp_code'));
});
app.post('/api/salary/import', async (c) => {
  can(c, 'import_salary', 'is_edit');
  const rows = (await body(c)).rows || [];
  const known = new Set((await db(c).all('SELECT emp_code FROM employee')).map((e) => e.emp_code));
  const ok = rows.filter((r) => known.has(String(r.emp_code).trim()));
  const missing = rows.filter((r) => !known.has(String(r.emp_code).trim())).map((r) => r.emp_code);
  await db(c).batch(ok.map((r) => ['UPDATE employee SET salary=? WHERE emp_code=?', Number(r.salary), String(r.emp_code).trim()]));
  await log(c, 'import_salary', 'import', ok.length);
  return c.json({ updated: ok.length, missing });
});

// ---------- dashboards ----------
const latestForm = async (dbx) => (await dbx.get('SELECT id FROM form ORDER BY appraisal_year DESC LIMIT 1'))?.id;
app.get('/api/dashboard/overall', async (c) => {
  can(c, 'dashboard_overall_performance');
  const dbx = db(c), formId = c.req.query('form_id') || await latestForm(dbx);
  const [statusCount, grades, perspective, summary, corporate] = await Promise.all([
    dbx.all("SELECT status, COUNT(*) n FROM assignment WHERE form_id=? AND assignment_type='individual' GROUP BY status", formId),
    dbx.all("SELECT COALESCE(adjust_grade,grade) grade, COUNT(*) n FROM assignment WHERE form_id=? AND assignment_type='individual' AND result_score IS NOT NULL GROUP BY 1 ORDER BY 1", formId),
    dbx.all(`SELECT pe.perspective_name name, pe.color_code color, ROUND(AVG(ai.score)/5*100,1) achievement, ROUND(AVG(ai.score),2) score
      FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id JOIN item i ON i.id=ai.item_id JOIN perspective pe ON pe.id=i.perspective_id
      JOIN structure s ON s.id=i.structure_id WHERE a.form_id=? AND s.structure_type='Quantity' AND ai.score IS NOT NULL GROUP BY pe.id ORDER BY pe.id`, formId),
    dbx.get("SELECT COUNT(*) total, SUM(result_score IS NOT NULL) evaluated, ROUND(AVG(result_score),2) avg_score, MAX(result_score) max_score FROM assignment WHERE form_id=? AND assignment_type='individual'", formId),
    dbx.get("SELECT id FROM assignment WHERE form_id=? AND assignment_type='corporate' LIMIT 1", formId),
  ]);
  return c.json({ form_id: Number(formId), summary, statusCount, grades, perspective, corporate: corporate ? await fullAssignment(c, corporate.id, false) : null });
});
app.get('/api/dashboard/branch', async (c) => {
  can(c, 'dashboard_branch_performance');
  const dbx = db(c), formId = c.req.query('form_id') || await latestForm(dbx);
  return c.json(await dbx.all(`SELECT o.org_name name, COUNT(*) headcount, ROUND(AVG(a.result_score),2) avg_score, ROUND(MIN(a.result_score),2) min_score,
      ROUND(MAX(a.result_score),2) max_score FROM assignment a JOIN employee e ON e.id=a.emp_id JOIN org o ON o.id=e.org_id
    WHERE a.form_id=? AND a.result_score IS NOT NULL GROUP BY o.id ORDER BY avg_score DESC`, formId));
});
app.get('/api/dashboard/comparison', async (c) => {
  can(c, 'dashboard_performance_comparison');
  const by = c.req.query('by') === 'level_group' ? 'lg.level_group_name' : 'o.org_name';
  const rows = await db(c).all(`SELECT ${by} name, f.appraisal_year year, ROUND(AVG(a.result_score),2) avg_score FROM assignment a
    JOIN employee e ON e.id=a.emp_id JOIN form f ON f.id=a.form_id LEFT JOIN org o ON o.id=e.org_id LEFT JOIN level_group lg ON lg.id=e.level_group_id
    WHERE a.result_score IS NOT NULL GROUP BY 1,2 ORDER BY 1,2`);
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const map = {};
  for (const r of rows) (map[r.name] ??= { name: r.name })[r.year] = r.avg_score;
  return c.json({ years, rows: Object.values(map) });
});
app.get('/api/dashboard/trend', async (c) => {
  can(c, 'dashboard_performance_trend');
  return c.json(await db(c).all(`SELECT f.appraisal_year year, ROUND(AVG((SELECT AVG(p.l3) FROM assignment_item_period p WHERE p.assignment_item_id=ai.id)),2) target,
      ROUND(AVG(ai.actual_value),2) actual, ROUND(AVG(ai.score)/5*100,1) achievement
    FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id JOIN form f ON f.id=a.form_id
    WHERE ai.item_id=? AND ai.actual_value IS NOT NULL GROUP BY f.appraisal_year ORDER BY 1`, c.req.query('item_id')));
});

// ---------- reports ----------
const C = (field, label) => ({ field, label });
const baseCols = [C('no', 'no'), C('emp_code', 'empCode'), C('emp_name', 'empName'), C('level_name', 'level'), C('position_name', 'position'), C('org_name', 'organization'), C('status', 'status'), C('result_score', 'resultScore'), C('grade', 'grade'), C('adjust_grade', 'adjustGrade')];
const GRADE_COLS = ['FE', 'EE', 'FM', 'PM', 'NM'].map((g) => C(g, g));
async function gradeMatrix(dbx, q, by) {
  const rows = await dbx.all(`SELECT ${by} k, COALESCE(a.adjust_grade,a.grade) g, COUNT(*) n, AVG(a.result_score) s FROM assignment a JOIN employee e ON e.id=a.emp_id
    LEFT JOIN org o ON o.id=e.org_id LEFT JOIN level_group lg ON lg.id=e.level_group_id WHERE a.form_id=? AND a.result_score IS NOT NULL GROUP BY 1,2`, q.form_id || await latestForm(dbx));
  const m = {};
  for (const r of rows) { const x = (m[r.k] ??= { org_name: r.k, headcount: 0, sum: 0 }); x[r.g] = r.n; x.headcount += r.n; x.sum += r.s * r.n; }
  return Object.values(m).map(({ sum, ...x }) => ({ ...x, avg_score: Math.round((sum / x.headcount) * 100) / 100 }));
}
const reports = {
  appraisal: { perm: 'report_appraisal', run: async (dbx, q) => ({ columns: baseCols, rows: await listAssignments(dbx, { ...q, type: 'individual' }) }) },
  appraisal_by_org: { perm: 'report_appraisal_by_org', run: async (dbx, q) => ({
    columns: [C('org_name', 'organization'), C('headcount', 'headcount'), C('avg_score', 'avgScore'), ...GRADE_COLS], rows: await gradeMatrix(dbx, q, 'o.org_name') }) },
  appraisal_by_level: { perm: 'report_appraisal_by_level', run: async (dbx, q) => ({
    columns: [C('org_name', 'levelGroup'), C('headcount', 'headcount'), C('avg_score', 'avgScore'), ...GRADE_COLS], rows: await gradeMatrix(dbx, q, 'lg.level_group_name') }) },
  appraisal_by_job_kpi: { perm: 'report_appraisal_by_job_kpi', run: async (dbx, q) => ({
    columns: [C('item_code', 'itemCode'), C('item_name', 'itemName'), C('perspective_name', 'perspective'), C('assigned', 'assigned'), C('avg_target', 'target'), C('avg_actual', 'actual'), C('avg_achievement', 'achievement'), C('avg_score', 'score')],
    rows: await dbx.all(`SELECT i.item_code, i.item_name, pe.perspective_name, COUNT(*) assigned, ROUND(AVG((SELECT AVG(p.l3) FROM assignment_item_period p WHERE p.assignment_item_id=ai.id)),2) avg_target,
      ROUND(AVG(ai.actual_value),2) avg_actual, ROUND(AVG(ai.score)/5*100,1) avg_achievement, ROUND(AVG(ai.score),2) avg_score FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id
      JOIN item i ON i.id=ai.item_id LEFT JOIN perspective pe ON pe.id=i.perspective_id WHERE a.form_id=? GROUP BY i.id ORDER BY i.item_code`, q.form_id || await latestForm(dbx)) }) },
  data_entry: { perm: 'report_data_entry', run: async (dbx, q) => {
    const rows = await listAssignments(dbx, { ...q, type: 'individual' });
    const counts = rows.length ? await dbx.all(`SELECT ai.assignment_id, COUNT(p.actual_value) f, COUNT(*) n FROM assignment_item_period p JOIN assignment_item ai ON ai.id=p.assignment_item_id
      JOIN item i ON i.id=ai.item_id JOIN structure s ON s.id=i.structure_id WHERE s.structure_type='Quantity' AND ai.assignment_id IN ${IN_IDS} GROUP BY ai.assignment_id`, idList(rows.map((r) => r.id))) : [];
    const by = Object.fromEntries(counts.map((x) => [x.assignment_id, x]));
    return {
      columns: [C('emp_code', 'empCode'), C('emp_name', 'empName'), C('org_name', 'organization'), C('item_count', 'items'), C('filled', 'filled'), C('progress', 'progress'), C('status', 'status')],
      rows: rows.map((a) => { const x = by[a.id] ?? { f: 0, n: 0 }; return { ...a, item_count: x.n, filled: x.f, progress: `${Math.round((x.f / (x.n || 1)) * 100)}%` }; }),
    };
  } },
  kpi: { perm: 'report_kpi', run: async (dbx, q) => ({
    columns: [C('emp_code', 'empCode'), C('emp_name', 'empName'), C('item_code', 'itemCode'), C('item_name', 'itemName'), C('uom_name', 'uom'), C('weight_percent', 'weight'), C('target_value', 'target'), C('actual_value', 'actual'), C('achievement', 'achievement'), C('score', 'score')],
    rows: await dbx.all(`SELECT e.emp_code, e.emp_name, i.item_code, i.item_name, u.uom_name, ai.weight_percent, (SELECT AVG(p.l3) FROM assignment_item_period p WHERE p.assignment_item_id=ai.id) target_value,
      ai.actual_value, ROUND(ai.score/5*100,1) achievement, ai.score
      FROM assignment_item ai JOIN assignment a ON a.id=ai.assignment_id JOIN employee e ON e.id=a.emp_id JOIN item i ON i.id=ai.item_id
      JOIN structure s ON s.id=i.structure_id LEFT JOIN uom u ON u.id=i.uom_id WHERE a.form_id=? AND s.structure_type='Quantity' ${q.org_id ? 'AND e.org_id=?' : ''} ORDER BY e.emp_code, i.item_code`,
    q.form_id || await latestForm(dbx), ...(q.org_id ? [q.org_id] : [])) }) },
  performance_form: { perm: 'report_performance_form', run: async (dbx, q) => ({
    columns: [...baseCols.slice(1, 7), C('competency_score', 'competency'), C('result_score', 'resultScore'), C('grade', 'grade'), C('remark', 'remark')],
    rows: await listAssignments(dbx, { ...q, type: 'individual' }) }) },
  bonus_salary: { perm: 'report_bonus_salary', run: async (dbx, q) => {
    const formId = q.form_id || await latestForm(dbx), cfg = await formConfig(dbx, formId);
    const g = Object.fromEntries(cfg.grades.map((x) => [x.grade, x]));
    const rows = (await dbx.all(`${ASSIGN_SQL} WHERE a.form_id=? AND a.assignment_type='individual' ${q.org_id ? 'AND e.org_id=?' : ''} ORDER BY e.emp_code`, formId, ...(q.org_id ? [q.org_id] : [])))
      .map((a) => {
        const salary = a.salary ?? 0;
        const gr = g[a.adjust_grade || a.grade] || { raise: 0, bonus: 0 };
        const raise = round2((salary * gr.raise) / 100);
        return { ...a, salary, raise_percent: gr.raise, raise_amount: raise, new_salary: round2(salary + raise), bonus_month: gr.bonus, final_bonus: round2(salary * gr.bonus) };
      });
    return { columns: [...baseCols.slice(1, 3), C('org_name', 'organization'), C('result_score', 'resultScore'), C('grade', 'grade'), C('adjust_grade', 'adjustGrade'), C('salary', 'salary'), C('raise_percent', 'raisePercent'), C('raise_amount', 'raiseAmount'), C('new_salary', 'newSalary'), C('bonus_month', 'bonusMonth'), C('final_bonus', 'finalBonus')], rows };
  } },
  usage_log: { perm: 'usage_log', run: async (dbx) => ({
    columns: [C('usage_datetime', 'usageDateTime'), C('user_name', 'userName'), C('full_name', 'fullName'), C('emp_code', 'empCode'), C('page_name', 'pageName'), C('action', 'action'), C('action_id', 'actionId')],
    rows: await dbx.all(`SELECT l.usage_datetime, u.user_name, TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) full_name, e.emp_code, l.page_name, l.action, l.action_id
      FROM usage_log l LEFT JOIN user u ON u.id=l.user_id LEFT JOIN employee e ON e.id=u.employee_id ORDER BY l.id DESC LIMIT 1000`) }) },
};
app.get('/api/report/:name', async (c) => {
  const r = reports[c.req.param('name')] ?? fail(404, 'Unknown report');
  if (c.get('perms')[r.perm]?.is_view !== 1) fail(403, 'Forbidden');
  const out = await r.run(db(c), c.req.query());
  out.rows = out.rows.map((x, i) => ({ no: i + 1, ...x }));
  return c.json(out);
});

// ---------- feedback ----------
app.get('/api/feedback', async (c) => {
  can(c, 'feedback');
  return c.json(await db(c).all(`SELECT f.*, e.emp_code, e.emp_name, u.user_name from_user FROM feedback f
    JOIN employee e ON e.id=f.to_emp_id LEFT JOIN user u ON u.id=f.from_user_id ORDER BY f.id DESC`));
});
app.post('/api/feedback', async (c) => {
  can(c, 'feedback');
  const { to_emp_id, form_id, topic, rating, comment } = await body(c);
  if (!to_emp_id || !comment) fail(400, 'Employee and comment are required');
  const id = Number((await db(c).run('INSERT INTO feedback (form_id,from_user_id,to_emp_id,topic,rating,comment) VALUES (?,?,?,?,?,?)',
    form_id ?? null, c.get('user').id, to_emp_id, topic ?? null, rating ?? null, comment)).lastInsertRowid);
  await log(c, 'feedback', 'add', id);
  return c.json({ id });
});
app.get('/api/feedback/report', async (c) => {
  can(c, 'feedback_report');
  return c.json(await db(c).all(`SELECT e.emp_code, e.emp_name, o.org_name, COUNT(f.id) feedback_count, ROUND(AVG(f.rating),2) avg_rating,
    MAX(f.created_at) last_feedback FROM employee e LEFT JOIN feedback f ON f.to_emp_id=e.id LEFT JOIN org o ON o.id=e.org_id GROUP BY e.id ORDER BY feedback_count DESC, e.emp_code`));
});

app.all('/api/*', () => fail(404, '404'));

export default app;
