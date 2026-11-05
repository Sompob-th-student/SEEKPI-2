import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Alert, Box, Card, CardContent, Chip, MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TableSortLabel, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useI18n } from '../i18n'

export type Col<T = any> = { field: string; label: string; render?: (row: T) => ReactNode; align?: 'left' | 'right' | 'center'; width?: number | string }

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#17324d', flex: 1, minWidth: 200 }}>{title}</Typography>
      {children}
    </Box>
  )
}

export function fmt(v: unknown): ReactNode {
  if (v == null || v === '') return '–'
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return String(v)
}

// Original SEE KPI grades: FE<S>, EE<A>, FM<B>, PM<C>, NM<D>
const GRADE_COLORS: Record<string, string> = { FE: '#1b5e20', EE: '#2e7d32', FM: '#1A90DC', PM: '#ef6c00', NM: '#c62828', A: '#2e7d32', B: '#1A90DC', C: '#8d6e00', D: '#ef6c00', E: '#c62828' }
export const GRADE_LETTER: Record<string, string> = { FE: 'S', EE: 'A', FM: 'B', PM: 'C', NM: 'D' }
export const GRADES = ['FE', 'EE', 'FM', 'PM', 'NM']
export const gradeColor = (g?: string | null) => (g ? GRADE_COLORS[g] ?? '#555' : '#999')
/** Colour of a period score 0..5 (original level strip: 1 red .. 5 dark green). */
export const LEVEL_COLORS = ['#9e9e9e', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1b5e20']
export function GradeChip({ grade }: { grade?: string | null }) {
  if (!grade) return <>–</>
  return <Chip size="small" label={GRADE_LETTER[grade] ? `${grade}‹${GRADE_LETTER[grade]}›` : grade} sx={{ bgcolor: gradeColor(grade), color: '#fff', fontWeight: 700, minWidth: 34 }} />
}
/** Colour a workflow stage (English label or code) the way the original SEE KPI colours its structure chips. */
export function stageColor(stage?: string): 'default' | 'info' | 'warning' | 'success' | 'primary' | 'error' | 'secondary' {
  const s = (stage ?? '').toLowerCase().replace(/_/g, ' ')
  if (/reject|re-work|re work/.test(s)) return 'error'
  if (/end to/.test(s)) return 'secondary'
  if (/admin approve|approve actual|^approve$/.test(s)) return 'success'
  if (/review|submit/.test(s)) return 'warning'
  if (/draft|appraisal/.test(s)) return 'info'
  if (/approve item/.test(s)) return 'primary'
  return 'default'
}
export function StatusChip({ status }: { status?: string }) {
  return <Chip size="small" variant="outlined" color={stageColor(status)} label={status || '–'} />
}
/** One chip per structure: name + stage colour (original Appraisal / Assignment cards). */
export function StructureChips({ structures }: { structures?: { structure_id: number; structure_name: string; stage_en: string; score100?: number | null }[] }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {(structures ?? []).map((s) => (
        <Chip key={s.structure_id} size="small" variant="outlined" color={stageColor(s.stage_en)} title={s.stage_en}
          label={`${s.structure_name}${s.score100 != null ? ` · ${fmt(s.score100)}` : ''}`} />
      ))}
    </Box>
  )
}

/** Sortable, searchable, paginated table: replaces material-table from the original app. */
export function DataTable<T extends Record<string, any>>({ columns, rows, search = true, dense = true, onRowClick, empty, toolbar, pageSize = 25 }: {
  columns: Col<T>[]; rows: T[]; search?: boolean; dense?: boolean; onRowClick?: (r: T) => void; empty?: string; toolbar?: ReactNode; pageSize?: number
}) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ f: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(pageSize)
  const filtered = useMemo(() => {
    let r = rows
    if (q) { const s = q.toLowerCase(); r = r.filter((x) => columns.some((c) => String(x[c.field] ?? '').toLowerCase().includes(s))) }
    if (sort) {
      r = [...r].sort((a, b) => {
        const av = a[sort.f], bv = b[sort.f]
        const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
        return sort.dir === 'asc' ? c : -c
      })
    }
    return r
  }, [rows, q, sort, columns])
  useEffect(() => setPage(0), [q, rows])
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {(search || toolbar) && (
        <Box sx={{ display: 'flex', gap: 1, p: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {toolbar}
          <Box sx={{ flex: 1 }} />
          {search && <TextField size="small" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 260 } }} />}
        </Box>
      )}
      <TableContainer>
        <Table size={dense ? 'small' : 'medium'} stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.field + c.label} align={c.align} sx={{ fontWeight: 600, bgcolor: '#eef4fa', whiteSpace: 'nowrap', width: c.width }}>
                  <TableSortLabel active={sort?.f === c.field} direction={sort?.f === c.field ? sort.dir : 'asc'}
                    onClick={() => setSort(sort?.f === c.field && sort.dir === 'asc' ? { f: c.field, dir: 'desc' } : { f: c.field, dir: 'asc' })}>
                    {c.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.slice(page * size, page * size + size).map((r, i) => (
              <TableRow key={(r.id ?? '') + '-' + i} hover onClick={onRowClick ? () => onRowClick(r) : undefined} sx={{ cursor: onRowClick ? 'pointer' : undefined }}>
                {columns.map((c) => <TableCell key={c.field + c.label} align={c.align}>{c.render ? c.render(r) : fmt(r[c.field])}</TableCell>)}
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow><TableCell colSpan={columns.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>{empty ?? t('noData')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {filtered.length > size && (
        <TablePagination component="div" count={filtered.length} page={page} rowsPerPage={size} rowsPerPageOptions={[10, 25, 50, 100]}
          onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setSize(Number(e.target.value)); setPage(0) }} />
      )}
    </Paper>
  )
}

export type Option = { id: number; name: string }
const cache: Record<string, Promise<Option[]>> = {}
export function useDropdown(res: string, refresh = 0) {
  const [opts, setOpts] = useState<Option[]>([])
  useEffect(() => {
    if (refresh) delete cache[res]
    cache[res] ??= api<Option[]>(`/dropdown/${res}`).catch(() => { delete cache[res]; return [] })
    cache[res].then(setOpts)
  }, [res, refresh])
  return opts
}
export const invalidateDropdown = (res: string) => { delete cache[res] }

export function SelectField({ label, value, onChange, options, allLabel, sx, required }: {
  label: string; value: number | string | ''; onChange: (v: any) => void; options: Option[]; allLabel?: string; sx?: object; required?: boolean
}) {
  return (
    <TextField select size="small" label={label} value={value ?? ''} required={required} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 220, ...sx }}>
      {allLabel !== undefined && <MenuItem value="">{allLabel}</MenuItem>}
      {options.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
    </TextField>
  )
}

/** Appraisal form selector, defaulting to the most recent year (like the original Form filter). */
export function useFormFilter() {
  const forms = useDropdown('form')
  const [formId, setFormId] = useState<number | ''>('')
  useEffect(() => {
    if (formId === '' && forms.length) {
      const latest = [...forms].sort((a, b) => b.name.localeCompare(a.name))[0]
      setFormId(latest.id)
    }
  }, [forms, formId])
  return { forms, formId, setFormId }
}

export function StatCard({ label, value, color = '#1A90DC', sub }: { label: string; value: ReactNode; color?: string; sub?: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ borderLeft: `4px solid ${color}`, height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, color }}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  )
}

export type Toast = { msg: string; sev: 'success' | 'error' | 'info' } | null
export function useToast() {
  const [toast, setToast] = useState<Toast>(null)
  const { t } = useI18n()
  const node = (
    <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
      {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : <span />}
    </Snackbar>
  )
  const error = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e)
    setToast({ msg: /^\d{3,4}$/.test(m) ? t(m) : m, sev: 'error' })
  }
  return { node, ok: (msg: string) => setToast({ msg, sev: 'success' }), error }
}
