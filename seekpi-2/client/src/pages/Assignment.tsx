import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { DataTable, GradeChip, LEVEL_COLORS, PageHeader, SelectField, StructureChips, fmt, useDropdown, useFormFilter, useToast } from '../components/common'
import { blankPeriods, type Period } from '../periods'

type Line = { item_id: number | ''; weight_percent: number | string; periods: Period[]; open?: boolean }
type Edit = { id?: number; emp_ids: number[]; org_id: number | ''; assign_date: string; end_date: string; tab: number; tabs: Record<number, Line[]>; weights: Record<number, number> }

export function Assignment({ type }: { type: 'individual' | 'corporate' }) {
  const { t } = useI18n()
  const { perm } = useAuth()
  const p = perm('assignment')
  const toast = useToast()
  const { forms, formId, setFormId } = useFormFilter()
  const orgs = useDropdown('organization')
  const [orgId, setOrgId] = useState<number | ''>('')
  const [rows, setRows] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [structures, setStructures] = useState<any[]>([])
  const [emps, setEmps] = useState<any[]>([])
  const [edit, setEdit] = useState<Edit | null>(null)

  const load = useCallback(() => { if (formId) api<any[]>('/assignment', { query: { form_id: formId, type, org_id: orgId } }).then(setRows).catch(toast.error) }, [formId, type, orgId]) // eslint-disable-line
  useEffect(load, [load])
  useEffect(() => {
    api<any[]>('/r/item').then((r) => setItems(r.filter((i) => i.is_active))).catch(() => {})
    api<any[]>('/r/structure').then((r) => setStructures(r.filter((s) => s.is_active && s.structure_type !== 'Deduct Score').sort((a, b) => a.seq_no - b.seq_no))).catch(() => {})
    if (type === 'individual') api<any[]>('/r/employee').then(setEmps).catch(() => {})
  }, [type])
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])
  const form = forms.find((f) => f.id === formId)

  // Structure weights the first selected employee (or the corporate scorecard) gets from Appraisal Criteria
  useEffect(() => {
    if (!edit || edit.id || !formId) return
    const q = type === 'corporate' ? { form_id: formId } : edit.emp_ids[0] ? { form_id: formId, emp_id: edit.emp_ids[0] } : null
    if (!q) return
    api<any[]>('/structure-weights', { query: q }).then((w) => setEdit((e) => e && { ...e, weights: Object.fromEntries(w.map((x) => [x.structure_id, x.weight_pct])) })).catch(() => {})
  }, [edit?.emp_ids[0], edit?.id, formId, type]) // eslint-disable-line

  const openNew = () => setEdit({ emp_ids: [], org_id: '', assign_date: '', end_date: '', tab: structures[0]?.id ?? 0, tabs: {}, weights: {} })
  const openEdit = async (row: any) => {
    const a = await api<any>(`/assignment/${row.id}`)
    const tabs: Record<number, Line[]> = {}, weights: Record<number, number> = {}
    for (const s of a.structures) {
      weights[s.structure_id] = s.weight_pct
      tabs[s.structure_id] = s.items.map((i: any) => ({ item_id: i.item_id, weight_percent: i.weight_percent, periods: i.periods }))
    }
    setEdit({ id: a.id, emp_ids: a.emp_id ? [a.emp_id] : [], org_id: a.org_id ?? '', assign_date: a.assign_date ?? '', end_date: a.end_date ?? '', tab: a.structures[0]?.structure_id ?? 0, tabs, weights })
  }
  const visibleTabs = edit ? structures.filter((s) => (edit.id ? edit.weights[s.id] !== undefined : (edit.weights[s.id] ?? 1) > 0)) : []
  const lines = edit ? edit.tabs[edit.tab] ?? [] : []
  const setLines = (fn: (l: Line[]) => Line[]) => setEdit((e) => e && { ...e, tabs: { ...e.tabs, [e.tab]: fn(e.tabs[e.tab] ?? []) } })
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const setLevel = (i: number, pi: number, k: number, v: string) =>
    setLines((ls) => ls.map((l, j) => (j !== i ? l : { ...l, periods: l.periods.map((pp, q) => (q !== pi ? pp : { ...pp, levels: pp.levels.map((x, kk) => (kk === k ? v : x)) })) })))
  const applyAll = (i: number) => setLines((ls) => ls.map((l, j) => (j !== i ? l : { ...l, periods: l.periods.map((pp) => ({ ...pp, levels: [...l.periods[0].levels] })) })))
  const tabTotal = (sid: number) => (edit?.tabs[sid] ?? []).reduce((s, l) => s + Number(l.weight_percent || 0), 0)

  const save = () => {
    if (!edit) return
    const body = {
      form_id: formId, assignment_type: type, emp_ids: edit.emp_ids, org_id: edit.org_id, assign_date: edit.assign_date || undefined, end_date: edit.end_date || undefined,
      structures: Object.fromEntries(Object.entries(edit.tabs).map(([sid, ls]) => [sid, { items: ls.filter((l) => l.item_id).map((l) => ({ item_id: l.item_id, weight_percent: l.weight_percent, periods: l.periods })) }])),
    }
    const req = edit.id ? api(`/assignment/${edit.id}`, { method: 'PUT', body }) : api('/assignment', { method: 'POST', body })
    req.then(() => { toast.ok(t('saved')); setEdit(null); load() }).catch(toast.error)
  }

  const columns = [
    ...(type === 'individual'
      ? [{ field: 'emp_code', label: t('empCode') }, { field: 'emp_name', label: t('empName') }, { field: 'level_group', label: t('levelGroup') }]
      : []),
    { field: 'org_name', label: t('organization') },
    { field: 'structures', label: t('structure'), render: (r: any) => <StructureChips structures={r.structures} /> },
    { field: 'result_score', label: t('totalScore'), align: 'right' as const, render: (r: any) => r.result_score == null ? '–' : `${fmt(r.result_score)} (${fmt(r.total5)})` },
    { field: 'grade', label: t('grade'), render: (r: any) => <GradeChip grade={r.adjust_grade || r.grade} /> },
    { field: '_a', label: '', align: 'right' as const, render: (r: any) => (
      <Box sx={{ whiteSpace: 'nowrap' }}>
        {p.is_edit === 1 && <IconButton size="small" onClick={() => openEdit(r)} aria-label="edit"><EditIcon fontSize="small" /></IconButton>}
        {p.is_delete === 1 && <IconButton size="small" aria-label="delete" onClick={() => api(`/assignment/${r.id}`, { method: 'DELETE' }).then(load).catch(toast.error)}><DeleteIcon fontSize="small" /></IconButton>}
      </Box>
    ) },
  ]

  return (
    <Box>
      <PageHeader title={`${t('assignment')} · ${t(type)}`}>
        {p.is_add === 1 && <Button variant="contained" startIcon={<AddIcon />} onClick={openNew} disabled={!formId || !structures.length}>{t('newAssignment')}</Button>}
      </PageHeader>
      <DataTable columns={columns} rows={rows} toolbar={<>
        <SelectField label={t('form')} value={formId} onChange={setFormId} options={forms} />
        <SelectField label={t('organization')} value={orgId} onChange={setOrgId} options={orgs} allLabel={t('allOrganizations')} />
      </>} />

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="xl" fullWidth>
        <DialogTitle>{edit?.id ? t('edit') : t('newAssignment')} · {t(type)} · {form?.name}</DialogTitle>
        <DialogContent dividers>
          {edit && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {type === 'individual' ? (
                  <Autocomplete multiple disabled={!!edit.id} sx={{ flex: 1, minWidth: 280 }} size="small" options={emps}
                    getOptionLabel={(o: any) => `${o.emp_code} ${o.emp_name} · ${o.level_group_name ?? ''}`} value={emps.filter((e) => edit.emp_ids.includes(e.id))}
                    onChange={(_, v) => setEdit({ ...edit, emp_ids: v.map((x: any) => x.id) })}
                    renderInput={(params) => <TextField {...params} label={t('selectEmployees')} />} />
                ) : (
                  <SelectField label={t('organization')} value={edit.org_id} onChange={(v) => setEdit({ ...edit, org_id: v })} options={orgs} sx={{ flex: 1 }} />
                )}
                <TextField size="small" type="date" label={t('assignDate')} slotProps={{ inputLabel: { shrink: true } }} value={edit.assign_date} onChange={(e) => setEdit({ ...edit, assign_date: e.target.value })} />
                <TextField size="small" type="date" label={t('assignmentEndDate')} slotProps={{ inputLabel: { shrink: true } }} value={edit.end_date} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} />
              </Box>
              {!edit.id && type === 'individual' && edit.emp_ids.length > 1 && <Alert severity="info">{t('multiAssignHint')}</Alert>}
              <Tabs value={visibleTabs.some((s) => s.id === edit.tab) ? edit.tab : false} onChange={(_, v) => setEdit({ ...edit, tab: v })} variant="scrollable">
                {visibleTabs.map((s) => (
                  <Tab key={s.id} value={s.id} label={`${s.structure_name}${edit.weights[s.id] !== undefined ? ` · ${fmt(edit.weights[s.id])}%` : ''}`} />
                ))}
              </Tabs>
              {visibleTabs.length === 0 && <Alert severity="warning">{t('noStructureForLevelGroup')}</Alert>}
              {visibleTabs.some((s) => s.id === edit.tab) && (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell width={36} /><TableCell>{t('appraisalItem')}</TableCell><TableCell>{t('frequency')}</TableCell><TableCell>{t('uom')}</TableCell>
                      <TableCell width={110}>%{t('weight')}</TableCell><TableCell width={40} />
                    </TableRow></TableHead>
                    <TableBody>
                      {lines.map((l, i) => {
                        const it = l.item_id ? itemById[l.item_id] : null
                        const isComp = structures.find((s) => s.id === edit.tab)?.structure_type === 'Quality'
                        return (
                          <Fragment key={i}>
                            <TableRow>
                              <TableCell>{!isComp && <IconButton size="small" onClick={() => setLine(i, { open: !l.open })} aria-label="targets">{l.open ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}</IconButton>}</TableCell>
                              <TableCell sx={{ minWidth: 300 }}>
                                <TextField select fullWidth size="small" variant="standard" value={l.item_id}
                                  onChange={(e) => { const nit = itemById[Number(e.target.value)]; setLine(i, { item_id: Number(e.target.value), periods: blankPeriods(nit?.frequency), open: true }) }}>
                                  {items.filter((x) => x.structure_id === edit.tab).map((x) => <MenuItem key={x.id} value={x.id}>{x.item_code} · {x.item_name}</MenuItem>)}
                                </TextField>
                              </TableCell>
                              <TableCell>{it?.frequency ?? '–'}</TableCell>
                              <TableCell>{it?.uom_name ?? '–'}</TableCell>
                              <TableCell><TextField size="small" variant="standard" type="number" value={l.weight_percent} onChange={(e) => setLine(i, { weight_percent: e.target.value })} /></TableCell>
                              <TableCell><IconButton size="small" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="remove"><DeleteIcon fontSize="small" /></IconButton></TableCell>
                            </TableRow>
                            {!isComp && (
                              <TableRow>
                                <TableCell colSpan={6} sx={{ p: 0, border: l.open ? undefined : 0 }}>
                                  <Collapse in={!!l.open} unmountOnExit>
                                    <Box sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{t('levelTargetsHint')}</Typography>
                                        <Button size="small" variant="contained" onClick={() => applyAll(i)} disabled={l.periods.length < 2}>{t('applyAll')}</Button>
                                      </Box>
                                      <Table size="small">
                                        <TableHead><TableRow>
                                          <TableCell>{t('targetValue')}</TableCell>
                                          {[1, 2, 3, 4, 5].map((k) => <TableCell key={k} sx={{ bgcolor: LEVEL_COLORS[k], color: k === 3 ? '#000' : '#fff', fontWeight: 700 }}>{k}</TableCell>)}
                                        </TableRow></TableHead>
                                        <TableBody>
                                          {l.periods.map((pp, pi) => (
                                            <TableRow key={pp.period_no}>
                                              <TableCell sx={{ whiteSpace: 'nowrap' }}>{pp.label}</TableCell>
                                              {[0, 1, 2, 3, 4].map((k) => (
                                                <TableCell key={k}><TextField size="small" variant="standard" type="number" value={pp.levels[k] ?? ''} onChange={(e) => setLevel(i, pi, k, e.target.value)} /></TableCell>
                                              ))}
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </Box>
                                  </Collapse>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => setLines((ls) => [...ls, { item_id: '', weight_percent: '', periods: [] }])}>{t('addKpi')}</Button>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="body2" color={tabTotal(edit.tab) === 100 ? 'success.main' : 'warning.main'}>{t('totalWeight')}: <b>{fmt(tabTotal(edit.tab))}%</b></Typography>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setEdit(null)}>{t('cancel')}</Button><Button variant="contained" onClick={save}>{t('save')}</Button></DialogActions>
      </Dialog>
      {toast.node}
    </Box>
  )
}
