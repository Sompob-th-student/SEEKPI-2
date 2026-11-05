// Thin fetch wrapper. Token/session keys mirror the original SEEKPI client
// (localStorage: authToken, userInfo, userPermissions, language).
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const getToken = () => {
  try { return JSON.parse(localStorage.getItem('authToken') || 'null') as string | null } catch { return null }
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const qs = opts.query
    ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
    : ''
  const token = getToken()
  const res = await fetch(`/api${path}${qs}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') onUnauthorized()
    throw new ApiError(res.status, (data as { message?: string }).message || res.statusText)
  }
  return data as T
}

export function toCsv(columns: { field: string; label: string }[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.field])).join(','))].join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }) // BOM so Excel reads Thai correctly
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
