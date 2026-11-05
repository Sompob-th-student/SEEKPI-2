// Thin async wrapper over the Cloudflare D1 binding, mirroring the all/get/run helpers of server/db.js.
// D1 is SQLite, so every SQL statement of the Node prototype runs unchanged; only the calls become async.
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export function d1(DB) {
  const prep = (sql, params) => DB.prepare(sql).bind(...params.map(norm));
  return {
    all: async (sql, ...p) => (await prep(sql, p).all()).results ?? [],
    get: async (sql, ...p) => (await prep(sql, p).first()) ?? undefined,
    run: async (sql, ...p) => {
      const r = await prep(sql, p).run();
      return { lastInsertRowid: r.meta.last_row_id, changes: r.meta.changes };
    },
    /** Several writes in one round trip; D1 runs a batch atomically (all or nothing). */
    batch: async (stmts) => (stmts.length ? DB.batch(stmts.map(([sql, ...p]) => prep(sql, p))) : []),
  };
}

/** Bind a list of ids as one parameter (D1 allows at most 100 bound parameters per statement). */
export const idList = (ids) => JSON.stringify(ids.map(Number));
export const IN_IDS = '(SELECT value FROM json_each(?))';
