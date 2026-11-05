import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, MenuItem, Paper, Switch, Tab, Table,
  TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import FunctionsIcon from '@mui/icons-material/Functions'
import GroupsIcon from '@mui/icons-material/Groups'
import DeleteIcon from '@mui/icons-material/Delete'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import {
  DataTable, GRADES, GradeChip, LEVEL_COLORS, PageHeader, SelectField, StatCard, StatusChip, StructureChips, fmt, useDropdown, useFormFilter, useToast,
} from '../components/common'

type Changes = { actuals: Record<string, string>; ratings: Record<number, string> }

export function Appraisal() {
  const { t, lang } = useI18n()
  const { perm } = useAuth()
  const canEdit = perm('appraisal').is_edit === 1
  const toast = useToast()
  const { forms, formId, setFormId } = useFormFilter()
  const orgs = useDropdown('organization')
  const [orgId, setOrgId] = useState<number | ''>('')
  const [rows, setRows] = useState<any[]>([])
  const [cur, setCur] = useState<any | null>(null)
  const [tab, setTab] = useState<number>(0)
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const [chg, setChg] = useState<Changes>({ actuals: {}, ratings: {} })
  const [action, setAction] = useState('')
  const [remark, setRemark] = useState('')
  const [chainEdit, setChainEdit] = useState<any[] | null>(null)
  const [waiveAsk, setWaiveAsk] = useState<{ item: any; reason: string } | null>(null)
  const [emps, setEmps] = useState<any[]>([])
  const canEditChain = perm('assignment').is_edit === 1
  useEffect(() => { if (canEditChain) api<any[]>('/r/employee').then(setEmps).catch(() => {}) }, [canEditChain])

  const load = useCallback(() => { if (formId) api<any[]>('/appraisal', { query: { form_id: formId, org_id: orgId, type: 'individual' } }).then(setRows).catch(toast.error) }, [formId, orgId]) // eslint-disable-line
  useEffect(load, [load])

  const show = (a: any, keepTab = false) => {
    setCur(a); setChg({ actuals: {}, ratings: {} }); setAction(''); setRemark('')
    if (!keepTab || !a.structures.some((s: any) => s.structure_id === tab)) setTab(a.structures[0]?.structure_id ?? 0)
  }
  const openRow = (r: any) => api(`/assignment/${r.id}`).then((a) => show(a)).catch(toast.error)
  const st = cur?.structures.find((s: any) => s.structure_id === tab)
  const isComp = st?.structure_type === 'Quality'
  const canActual = !!st && canEdit && st.can_input && (isComp ? cur.roles.evaluator || cur.roles.admin : cur.roles.owner || cur.roles.evaluator || cur.roles.admin)
  const dirty = Object.keys(chg.actuals).length + Object.keys(chg.ratings).length > 0

  const submit = (withAction: boolean) => {
    const body: any = {
      structure_id: tab,
      actuals: Object.entries(chg.actuals).map(([k, v]) => { const [id, p] = k.split(':'); return { assignment_item_id: Number(id), period_no: Number(p), actual_value: v } }),
      ratings: Object.entries(chg.ratings).map(([id, v]) => ({ assignment_item_id: Number(id), actual_value: v })),
      remark: remark || undefined,
    }
    if (withAction) body.action = action
    api(`/appraisal/${cur.id}`, { method: 'PUT', body }).then((a) => { show(a, true); toast.ok(t('saved')); load() }).catch(toast.error)
  }
  const setWaive = (item: any, on: boolean, reason = '') =>
    api(`/appraisal/${cur.id}`, { method: 'PUT', body: { structure_id: tab, waive: [{ assignment_item_id: item.id, is_waived: on, reason }] } })
      .then((a) => { show(a, true); load(); setWaiveAsk(null) }).catch(toast.error)
  const sumUp = () => api<any>(`/appraisal/${cur.id}/sum-up`, { method: 'POST', body: { structure_id: tab } })
    .then((a) => { show(a, true); load(); toast.ok(`${t('sumUp')}: ${a.sum_up.subordinates} ${t('employees')} · ${a.sum_up.kpis} KPI · ${a.sum_up.periods} ${t('period')}`) })
    .catch(toast.error)
  const saveChain = () => api<any[]>(`/assignment/${cur.id}/assessors`, { method: 'PUT', body: { chain: chainEdit } })
    .then(() => api(`/assignment/${cur.id}`)).then((a) => { show(a, true); setChainEdit(null); toast.ok(t('saved')) }).catch(toast.error)
  const canWaive = !!st && canEdit && (cur?.roles.evaluator || cur?.roles.admin) && !String(st.stage).startsWith('END_')
  const evaluated = rows.filter((r) => r.result_score != null)

  return (
    <Box>
      <PageHeader title={t('appraisal')} />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label={t('employees')} value={rows.length} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label={t('evaluated')} value={evaluated.length} color="#2e7d32" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label={t('avgResult')} value={evaluated.length ? fmt(evaluated.reduce((s, r) => s + r.result_score, 0) / evaluated.length) : '–'} color="#8d6e00" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="End to Vertical" value={rows.filter((r) => /^End/.test(r.status)).length} color="#17324d" /></Grid>
      </Grid>
      <DataTable rows={rows} onRowClick={openRow} toolbar={<>
        <SelectField label={t('form')} value={formId} onChange={setFormId} options={forms} />
        <SelectField label={t('organization')} value={orgId} onChange={setOrgId} options={orgs} allLabel={t('allOrganizations')} />
      </>} columns={[
        { field: 'emp_code', label: t('empCode') }, { field: 'emp_name', label: t('empName') }, { field: 'position_name', label: t('position') },
        { field: 'level_group', label: t('levelGroup') },
        { field: 'structures', label: t('structure'), render: (r) => <StructureChips structures={r.structures} /> },
        { field: 'result_score', label: t('totalScore'), align: 'right', render: (r) => r.result_score == null ? '–' : `${fmt(r.result_score)} (${fmt(r.total5)})` },
        { field: 'grade', label: t('grade'), render: (r) => <GradeChip grade={r.adjust_grade || r.grade} /> },
      ]} />

      <Dialog open={!!cur} onClose={() => setCur(null)} maxWidth="xl" fullWidth>
        {cur && <>
          <DialogTitle sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              {cur.emp_code} · {cur.emp_name}
              <Typography variant="body2" color="text.secondary">{cur.position_name} · {cur.org_name} · {cur.level_group} · {cur.form_name}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">{t('totalScore')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {fmt(cur.result_score ?? 0)} <Typography component="span" variant="body2">({fmt(cur.total5 ?? 0)})</Typography> / 100.00 <Typography component="span" variant="body2">(5.00)</Typography>
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                <GradeChip grade={cur.grade} />{cur.adjust_grade && <>→ <GradeChip grade={cur.adjust_grade} /></>}
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            <Tabs value={tab} onChange={(_, v) => { setTab(v); setChg({ actuals: {}, ratings: {} }); setAction('') }} variant="scrollable" sx={{ mb: 1 }}>
              {cur.structures.map((s: any) => <Tab key={s.structure_id} value={s.structure_id} label={s.structure_name} />)}
            </Tabs>
            {st && (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography>{t('structureWeight')}: <b>{fmt(st.weight_pct)} %</b></Typography>
                  <StatusChip status={lang === 'th' ? `${st.stage_th} (${st.stage_en})` : st.stage_en} />
                  <Button size="small" variant="outlined" startIcon={<GroupsIcon />} onClick={() => setChainEdit(cur.chain.map((c: any) => ({ ...c })))}>{t('actionTo')} ({cur.chain.length})</Button>
                  {!isComp && (
                    <Tooltip title={t('sumUpHint')}><span>
                      <Button size="small" variant="contained" color="secondary" startIcon={<FunctionsIcon />} disabled={!canActual} onClick={sumUp}>{t('sumUp')}</Button>
                    </span></Tooltip>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Typography>{t('score')}: <b>{fmt(st.score100 ?? 0)}</b> ({fmt(st.score5 ?? 0)}) / 100.00 (5.00)</Typography>
                </Box>
                {!st.can_input && <Alert severity="info" sx={{ py: 0 }}>{t('lockedAtStage')}</Alert>}
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell width={36} /><TableCell>{t('perspective')}</TableCell><TableCell>{t('kpiName')}</TableCell><TableCell>{t('frequency')}</TableCell>
                      <TableCell>{t('uom')}</TableCell><TableCell align="right">{t('actual')}</TableCell><TableCell align="right">{t('score')}</TableCell>
                      <TableCell align="right">%{t('weight')}</TableCell><TableCell align="right">{t('weightScore')}</TableCell><TableCell align="center">{t('waive')}</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {st.items.map((i: any) => (
                        <Fragment key={i.id}>
                          <TableRow hover sx={{ opacity: i.is_waived ? 0.5 : 1 }}>
                            <TableCell>{!isComp && <IconButton size="small" onClick={() => setOpen({ ...open, [i.id]: !open[i.id] })} aria-label="periods">{open[i.id] ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}</IconButton>}</TableCell>
                            <TableCell>{i.perspective_name}</TableCell>
                            <TableCell><Typography variant="body2">{i.item_name}</Typography><Typography variant="caption" color="text.secondary">{i.item_code}</Typography></TableCell>
                            <TableCell>{i.frequency}</TableCell>
                            <TableCell>{i.uom_name}</TableCell>
                            <TableCell align="right">
                              {isComp
                                ? <TextField select size="small" variant="standard" disabled={!canActual} value={chg.ratings[i.id] ?? i.actual_value ?? ''} sx={{ minWidth: 70 }}
                                    onChange={(e) => setChg({ ...chg, ratings: { ...chg.ratings, [i.id]: e.target.value } })}>
                                    <MenuItem value="">–</MenuItem>{[1, 2, 3, 4, 5].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                                  </TextField>
                                : fmt(i.actual_value)}
                            </TableCell>
                            <TableCell align="right"><b>{fmt(i.score)}</b></TableCell>
                            <TableCell align="right">{fmt(i.weight_percent)}</TableCell>
                            <TableCell align="right">{fmt(i.weighted_score)}</TableCell>
                            <TableCell align="center">
                              <Tooltip title={i.is_waived ? `${t('waived')}${i.waive_reason ? `: ${i.waive_reason}` : ''}` : t('waive')}>
                                <span><Switch size="small" color="warning" checked={!!i.is_waived} disabled={!canWaive}
                                  onChange={(e) => (e.target.checked ? setWaiveAsk({ item: i, reason: '' }) : setWaive(i, false))} /></span>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                          {!isComp && (
                            <TableRow>
                              <TableCell colSpan={10} sx={{ p: 0, border: open[i.id] ? undefined : 0 }}>
                                <Collapse in={!!open[i.id]} unmountOnExit>
                                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', overflowX: 'auto' }}>
                                    <Table size="small">
                                      <TableHead><TableRow>
                                        <TableCell>{t('period')}</TableCell>
                                        {[1, 2, 3, 4, 5].map((k) => <TableCell key={k} align="right" sx={{ bgcolor: LEVEL_COLORS[k], color: k === 3 ? '#000' : '#fff', fontWeight: 700 }}>{k}</TableCell>)}
                                        <TableCell width={140}>{t('actualValue')}</TableCell><TableCell align="center">{t('score')}</TableCell>
                                      </TableRow></TableHead>
                                      <TableBody>
                                        {i.periods.map((pp: any) => {
                                          const key = `${i.id}:${pp.period_no}`
                                          return (
                                            <TableRow key={pp.period_no}>
                                              <TableCell>{pp.label}</TableCell>
                                              {pp.levels.map((l: any, k: number) => <TableCell key={k} align="right">{fmt(l)}</TableCell>)}
                                              <TableCell>
                                                <TextField size="small" variant="standard" type="number" disabled={!canActual} value={chg.actuals[key] ?? pp.actual_value ?? ''}
                                                  onChange={(e) => setChg({ ...chg, actuals: { ...chg.actuals, [key]: e.target.value } })} />
                                              </TableCell>
                                              <TableCell align="center">
                                                {pp.source === 'sum_up' && <Tooltip title={t('fromSumUp')}><Chip size="small" variant="outlined" label="Σ" sx={{ mr: 0.5 }} /></Tooltip>}
                                                {pp.score == null ? '–' : <Chip size="small" label={pp.score} sx={{ bgcolor: LEVEL_COLORS[pp.score], color: pp.score === 3 ? '#000' : '#fff', fontWeight: 700, minWidth: 32 }} />}
                                              </TableCell>
                                            </TableRow>
                                          )
                                        })}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <TextField select size="small" label={t('action')} value={action} onChange={(e) => setAction(e.target.value)} sx={{ minWidth: 300 }} disabled={!st.actions.length}
                    helperText={st.actions.length ? undefined : t('noActionForYou')}>
                    {st.actions.map((x: any) => <MenuItem key={x.to} value={x.to}>{lang === 'th' ? `${x.th} (${x.en})` : x.en}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label={t('remark')} value={remark} onChange={(e) => setRemark(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
                  {cur.roles.admin && (
                    <TextField select size="small" label={t('adjustGrade')} value={cur.adjust_grade ?? ''} sx={{ width: 150 }}
                      onChange={(e) => api(`/appraisal/${cur.id}`, { method: 'PUT', body: { adjust_grade: e.target.value } }).then((a) => { show(a, true); load() }).catch(toast.error)}>
                      <MenuItem value="">–</MenuItem>{GRADES.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                    </TextField>
                  )}
                </Paper>
                {cur.log?.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{t('history')}</Typography>
                    {cur.log.filter((l: any) => l.structure_id === tab).slice(0, 6).map((l: any) => (
                      <Typography key={l.id} variant="body2" color="text.secondary">{l.acted_at} · {l.user_name}: {l.from_stage} → <b>{l.to_stage}</b>{l.remark ? ` · ${l.remark}` : ''}</Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCur(null)}>{t('cancel')}</Button>
            <Button onClick={() => submit(false)} disabled={!dirty}>{t('save')}</Button>
            <Button variant="contained" onClick={() => submit(true)} disabled={!action}>{t('save')} + {t('action')}</Button>
          </DialogActions>
        </>}
      </Dialog>
      <Dialog open={!!waiveAsk} onClose={() => setWaiveAsk(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('waive')} · {waiveAsk?.item.item_name}</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">{t('waiveHint')}</Typography>
          <TextField autoFocus label={t('waiveReason')} value={waiveAsk?.reason ?? ''} onChange={(e) => setWaiveAsk((w) => w && { ...w, reason: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWaiveAsk(null)}>{t('cancel')}</Button>
          <Button variant="contained" color="warning" disabled={!waiveAsk?.reason.trim()} onClick={() => setWaive(waiveAsk!.item, true, waiveAsk!.reason)}>{t('waive')}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!chainEdit} onClose={() => setChainEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{t('actionTo')} · {cur?.emp_code} {cur?.emp_name}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('actionToHint')}</Typography>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell width={70}>{t('seqNo')}</TableCell><TableCell>{t('employee')}</TableCell><TableCell>{t('position')}</TableCell>
              <TableCell>{t('organization')}</TableCell><TableCell width={40} />
            </TableRow></TableHead>
            <TableBody>
              {(chainEdit ?? []).map((c, k) => (
                <TableRow key={k}>
                  <TableCell>{k + 1}</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    {canEditChain
                      ? <Autocomplete size="small" options={emps.filter((e) => e.id !== cur?.emp_id)} getOptionLabel={(o: any) => `${o.emp_code} ${o.emp_name}`}
                          value={emps.find((e) => e.id === c.employee_id) ?? null}
                          onChange={(_, v: any) => setChainEdit((ch) => ch!.map((x, j) => (j === k ? { employee_id: v?.id, position_name: v?.position_name, org_name: v?.org_name } : x)))}
                          renderInput={(p) => <TextField {...p} variant="standard" />} />
                      : `${c.emp_code} ${c.emp_name}`}
                  </TableCell>
                  <TableCell>{c.position_name ?? '–'}</TableCell>
                  <TableCell>{c.org_name ?? '–'}</TableCell>
                  <TableCell>{canEditChain && <IconButton size="small" onClick={() => setChainEdit((ch) => ch!.filter((_, j) => j !== k))} aria-label="remove"><DeleteIcon fontSize="small" /></IconButton>}</TableCell>
                </TableRow>
              ))}
              {!chainEdit?.length && <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>{t('noData')}</TableCell></TableRow>}
            </TableBody>
          </Table>
          {canEditChain && <Button size="small" sx={{ mt: 1 }} onClick={() => setChainEdit((ch) => [...(ch ?? []), { employee_id: null }])}>+ {t('add')}</Button>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChainEdit(null)}>{t('cancel')}</Button>
          {canEditChain && <Button variant="contained" onClick={saveChain}>{t('save')}</Button>}
        </DialogActions>
      </Dialog>
      {toast.node}
    </Box>
  )
}
