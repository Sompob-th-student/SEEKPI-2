import { useCallback, useEffect, useState } from 'react'
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, MenuItem,
  Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import LockIcon from '@mui/icons-material/Lock'
import CheckIcon from '@mui/icons-material/Check'
import TableChartIcon from '@mui/icons-material/TableChart'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { DataTable, PageHeader, invalidateDropdown, useDropdown, useToast, type Col } from '../components/common'

export type Field = { name: string; label: string; type: string; ref?: string; alias?: string; options?: string[]; required?: boolean; default?: unknown }
export type Resource = { perm: string; title: string; display: string; fields: Field[]; list: string[] }
type Meta = { resources: Record<string, Resource>; permissionKeys: string[] }

let metaPromise: Promise<Meta> | null = null
export const loadMeta = () => (metaPromise ??= api<Meta>('/meta').catch((e) => { metaPromise = null; throw e }))

function RefSelect({ field, value, onChange, label }: { field: Field; value: any; onChange: (v: any) => void; label: string }) {
  const opts = useDropdown(field.ref!)
  return (
    <TextField select fullWidth size="small" label={label} required={field.required} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <MenuItem value="">–</MenuItem>
      {opts.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
    </TextField>
  )
}

/** Editor for JSON config columns (grade conditions, thresholds, force-rank distribution). */
function JsonEditor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  let parsed: any
  try { parsed = JSON.parse(value || 'null') } catch { parsed = undefined }
  if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'object') {
    const keys = Object.keys(parsed[0])
    const set = (i: number, k: string, v: string) => {
      const next = parsed.map((r: any, j: number) => (j === i ? { ...r, [k]: v === '' || isNaN(Number(v)) ? v : Number(v) } : r))
      onChange(JSON.stringify(next))
    }
    return (
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Table size="small">
          <TableHead><TableRow>{keys.map((k) => <TableCell key={k}>{k}</TableCell>)}<TableCell /></TableRow></TableHead>
          <TableBody>
            {parsed.map((r: any, i: number) => (
              <TableRow key={i}>
                {keys.map((k) => <TableCell key={k} sx={{ p: 0.5 }}><TextField size="small" variant="standard" value={r[k] ?? ''} onChange={(e) => set(i, k, e.target.value)} /></TableCell>)}
                <TableCell sx={{ p: 0 }}><IconButton size="small" onClick={() => onChange(JSON.stringify(parsed.filter((_: any, j: number) => j !== i)))}><DeleteIcon fontSize="small" /></IconButton></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange(JSON.stringify([...parsed, Object.fromEntries(keys.map((k) => [k, '']))]))}>Row</Button>
      </Box>
    )
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const total = Object.values(parsed).reduce((s: number, v) => s + Number(v || 0), 0)
    return (
      <Box>
        <Typography variant="caption" color="text.secondary">{label} (total {total}%)</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
          {Object.entries(parsed).map(([k, v]) => (
            <TextField key={k} size="small" type="number" label={k} value={v as any} sx={{ width: 90 }}
              onChange={(e) => onChange(JSON.stringify({ ...parsed, [k]: Number(e.target.value) }))} />
          ))}
        </Box>
      </Box>
    )
  }
  return <TextField fullWidth multiline minRows={3} size="small" label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} error={parsed === undefined} helperText="JSON" />
}

function PermissionDialog({ roleId, onClose }: { roleId: number | null; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { if (roleId) api<any[]>(`/role/${roleId}/permissions`).then(setRows).catch(toast.error) }, [roleId]) // eslint-disable-line
  const flags = ['is_view', 'is_add', 'is_edit', 'is_delete'] as const
  const toggle = (i: number, f: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [f]: r[f] ? 0 : 1 } : r)))
  const save = () => api(`/role/${roleId}/permissions`, { method: 'PUT', body: rows }).then(() => { toast.ok(t('saved')); onClose() }).catch(toast.error)
  return (
    <Dialog open={!!roleId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('permission')}</DialogTitle>
      <DialogContent dividers>
        <Table size="small" stickyHeader>
          <TableHead><TableRow><TableCell>Menu</TableCell>{flags.map((f) => (
            <TableCell key={f} align="center">
              {t(f === 'is_view' ? 'view' : f.slice(3))}
              <Checkbox size="small" checked={rows.length > 0 && rows.every((r) => r[f])} onChange={(e) => setRows(rows.map((r) => ({ ...r, [f]: e.target.checked ? 1 : 0 })))} />
            </TableCell>))}</TableRow></TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.url} hover>
                <TableCell>{t(r.url.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()))} <Typography component="span" variant="caption" color="text.secondary">({r.url})</Typography></TableCell>
                {flags.map((f) => <TableCell key={f} align="center"><Checkbox size="small" checked={!!r[f]} onChange={() => toggle(i, f)} /></TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('cancel')}</Button><Button variant="contained" onClick={save}>{t('save')}</Button></DialogActions>
      {toast.node}
    </Dialog>
  )
}

/** Appraisal Criteria: structure weight per Level Group (original SEE KPI criteria data table). */
function WeightsDialog({ criteriaId, onClose, canEdit }: { criteriaId: number | null; onClose: () => void; canEdit: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const [d, setD] = useState<{ level_groups: any[]; structures: any[]; w: Record<string, number> } | null>(null)
  useEffect(() => {
    if (!criteriaId) return
    api<any>(`/criteria/${criteriaId}/weights`).then((r) => setD({
      level_groups: r.level_groups, structures: r.structures,
      w: Object.fromEntries(r.weights.map((x: any) => [`${x.level_group_id}:${x.structure_id}`, x.weight_pct])),
    })).catch(toast.error)
  }, [criteriaId]) // eslint-disable-line
  const total = (lg: number) => d ? d.structures.reduce((s, st) => s + Number(d.w[`${lg}:${st.id}`] || 0), 0) : 0
  const save = () => api(`/criteria/${criteriaId}/weights`, {
    method: 'PUT',
    body: { weights: d!.level_groups.flatMap((lg) => d!.structures.map((st) => ({ level_group_id: lg.id, structure_id: st.id, weight_pct: Number(d!.w[`${lg.id}:${st.id}`] || 0) }))) },
  }).then(() => { toast.ok(t('saved')); onClose() }).catch(toast.error)
  return (
    <Dialog open={!!criteriaId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('structureWeight')} · {t('levelGroup')} × {t('structure')}</DialogTitle>
      <DialogContent dividers sx={{ overflowX: 'auto' }}>
        {d && (
          <Table size="small">
            <TableHead><TableRow><TableCell>{t('levelGroup')}</TableCell>{d.structures.map((s) => <TableCell key={s.id} align="center">{s.structure_name}</TableCell>)}<TableCell align="right">{t('total')}</TableCell></TableRow></TableHead>
            <TableBody>
              {d.level_groups.map((lg) => (
                <TableRow key={lg.id} hover>
                  <TableCell>{lg.level_group_name}</TableCell>
                  {d.structures.map((s) => (
                    <TableCell key={s.id} align="center">
                      <TextField size="small" variant="standard" type="number" disabled={!canEdit} sx={{ width: 70 }} value={d.w[`${lg.id}:${s.id}`] ?? 0}
                        onChange={(e) => setD({ ...d, w: { ...d.w, [`${lg.id}:${s.id}`]: Number(e.target.value) } })} />
                    </TableCell>
                  ))}
                  <TableCell align="right"><Typography variant="body2" color={[0, 100].includes(total(lg.id)) ? 'success.main' : 'error.main'} sx={{ fontWeight: 700 }}>{total(lg.id)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('cancel')}</Button>{canEdit && <Button variant="contained" onClick={save}>{t('save')}</Button>}</DialogActions>
      {toast.node}
    </Dialog>
  )
}

export function CrudPage({ resource, permKey }: { resource: string; permKey?: string }) {
  const { t } = useI18n()
  const { perm } = useAuth()
  const p = perm(permKey ?? resource)
  const toast = useToast()
  const [def, setDef] = useState<Resource | null>(null)
  const [rows, setRows] = useState<any[]>([])
  const [edit, setEdit] = useState<any | null>(null)
  const [roleId, setRoleId] = useState<number | null>(null)
  const [criteriaId, setCriteriaId] = useState<number | null>(null)

  const load = useCallback(() => api<any[]>(`/r/${resource}`).then(setRows).catch(toast.error), [resource]) // eslint-disable-line
  useEffect(() => { loadMeta().then((m) => setDef(m.resources[resource])).catch(toast.error); load() }, [resource, load]) // eslint-disable-line

  if (!def) return null
  const fieldOf = (name: string) => def.fields.find((f) => f.name === name || f.alias === name)
  const columns: Col[] = [
    { field: '_i', label: '#', width: 48, render: (r) => rows.indexOf(r) + 1 },
    ...def.list.map((name) => {
      const f = fieldOf(name)
      const label = t(f?.alias === name ? (f.ref === 'company' ? 'company' : f.label) : f?.label ?? name)
      const col: Col = { field: name, label }
      if (f?.type === 'bool') col.render = (r) => (r[name] ? <CheckIcon fontSize="small" color="success" /> : '–')
      if (f?.type === 'color') col.render = (r) => <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: r[name] }} />{r[name]}</Box>
      return col
    }),
    {
      field: '_a', label: '', align: 'right', render: (r) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          {resource === 'role' && p.is_edit === 1 && <Tooltip title={t('permission')}><IconButton size="small" onClick={() => setRoleId(r.id)}><LockIcon fontSize="small" /></IconButton></Tooltip>}
          {resource === 'criteria' && <Tooltip title={t('structureWeight')}><IconButton size="small" onClick={() => setCriteriaId(r.id)} aria-label="weights"><TableChartIcon fontSize="small" /></IconButton></Tooltip>}
          {p.is_edit === 1 && <IconButton size="small" onClick={() => setEdit({ ...r })} aria-label="edit"><EditIcon fontSize="small" /></IconButton>}
          {p.is_delete === 1 && <IconButton size="small" aria-label="delete" onClick={() => {
            if (!confirm(t('confirmDelete'))) return
            api(`/r/${resource}/${r.id}`, { method: 'DELETE' }).then(() => { toast.ok(t('deleted')); invalidateDropdown(resource); load() }).catch(toast.error)
          }}><DeleteIcon fontSize="small" /></IconButton>}
        </Box>
      ),
    },
  ]

  const save = () => {
    const body: any = {}
    for (const f of def.fields) body[f.name] = edit[f.name]
    if (resource === 'user' && edit.password) body.password = edit.password
    const req = edit.id ? api(`/r/${resource}/${edit.id}`, { method: 'PUT', body }) : api(`/r/${resource}`, { method: 'POST', body })
    req.then(() => { toast.ok(t('saved')); setEdit(null); invalidateDropdown(resource); load() }).catch(toast.error)
  }
  const blank = () => Object.fromEntries(def.fields.map((f) => [f.name, f.default ?? (f.type === 'ref' && f.ref === 'company' ? 1 : null)]))

  return (
    <Box>
      <PageHeader title={t(def.title)}>
        {p.is_add === 1 && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit(blank())}>{t('add')}</Button>}
      </PageHeader>
      <DataTable columns={columns} rows={rows} />
      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{t(edit?.id ? 'edit' : 'add')} {t(def.title)}</DialogTitle>
        <DialogContent dividers>
          {edit && (
            <Grid container spacing={2} sx={{ pt: 0.5 }}>
              {def.fields.map((f) => {
                const label = t(f.label) + (f.required ? ' *' : '')
                const set = (v: any) => setEdit({ ...edit, [f.name]: v })
                const v = edit[f.name]
                let input
                if (f.type === 'ref') input = <RefSelect field={f} value={v} onChange={set} label={label} />
                else if (f.type === 'bool') input = <FormControlLabel control={<Switch checked={!!v} onChange={(e) => set(e.target.checked ? 1 : 0)} />} label={t(f.label)} />
                else if (f.type === 'select') input = <TextField select fullWidth size="small" label={label} value={v ?? ''} onChange={(e) => set(e.target.value)}>{f.options!.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}</TextField>
                else if (f.type === 'json') input = <JsonEditor label={t(f.label)} value={v ?? ''} onChange={set} />
                else input = (
                  <TextField fullWidth size="small" label={label} value={v ?? ''} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'color' ? 'color' : 'text'}
                    slotProps={{ inputLabel: f.type === 'date' || f.type === 'color' ? { shrink: true } : undefined }} onChange={(e) => set(e.target.value)} />
                )
                return <Grid key={f.name} size={{ xs: 12, sm: f.type === 'json' ? 12 : 6 }}>{input}</Grid>
              })}
              {resource === 'user' && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" type="password" label={t('password') + (edit.id ? '' : ' *')} autoComplete="new-password"
                    value={edit.password ?? ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} helperText={edit.id ? 'Leave blank to keep the current password' : undefined} />
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setEdit(null)}>{t('cancel')}</Button><Button variant="contained" onClick={save}>{t('save')}</Button></DialogActions>
      </Dialog>
      <PermissionDialog roleId={roleId} onClose={() => setRoleId(null)} />
      <WeightsDialog criteriaId={criteriaId} onClose={() => setCriteriaId(null)} canEdit={p.is_edit === 1} />
      {toast.node}
    </Box>
  )
}
