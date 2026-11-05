import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Chip, Grid, Paper, Typography } from '@mui/material'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { DataTable, GradeChip, PageHeader, SelectField, fmt, gradeColor, useFormFilter, useToast } from '../components/common'

type Mode = 'company' | 'vertical' | 'horizontal' | 'board'
const TITLES: Record<Mode, string> = { company: 'forceRank', vertical: 'forceRankVertical', horizontal: 'forceRankHorizontal', board: 'forceRankHorizontalBoard' }
const PERM: Record<Mode, string> = { company: 'force_rank', vertical: 'force_rank_vertical', horizontal: 'force_rank_horizontal', board: 'force_rank_horizontal_board' }

export function ForceRank({ mode }: { mode: Mode }) {
  const { t } = useI18n()
  const { perm } = useAuth()
  const toast = useToast()
  const { forms, formId, setFormId } = useFormFilter()
  const [data, setData] = useState<{ distribution: Record<string, number>; rows: any[] }>({ distribution: {}, rows: [] })
  const apiMode = mode === 'board' ? 'horizontal' : mode
  const load = useCallback(() => { if (formId) api('/force_rank', { query: { form_id: formId, mode: apiMode } }).then(setData).catch(toast.error) }, [formId, apiMode]) // eslint-disable-line
  useEffect(load, [load])

  const grades = Object.keys(data.distribution)
  const chart = useMemo(() => grades.map((g) => ({
    grade: g,
    [t('planned')]: Math.round((data.distribution[g] / 100) * data.rows.length * 10) / 10,
    [t('grade')]: data.rows.filter((r) => r.grade === g).length,
    [t('forceRank')]: data.rows.filter((r) => r.force_rank_grade === g).length,
  })), [data, grades, t])
  const groups = useMemo(() => [...new Set(data.rows.map((r) => r.group))], [data])
  const apply = () => confirm(`${t('applyForceRank')}?`) && api('/force_rank/apply', { method: 'POST', body: { form_id: formId, mode: apiMode } }).then(() => { toast.ok(t('saved')); load() }).catch(toast.error)

  return (
    <Box>
      <PageHeader title={t(TITLES[mode])}>
        <SelectField label={t('form')} value={formId} onChange={setFormId} options={forms} />
        {perm(PERM[mode]).is_edit === 1 && <Button variant="contained" onClick={apply} disabled={!data.rows.length}>{t('applyForceRank')}</Button>}
      </PageHeader>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{t('distribution')} · {Object.entries(data.distribution).map(([g, p]) => `${g} ${p}%`).join(' · ')}</Typography>
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="grade" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              <Bar dataKey={t('planned')} fill="#c0c0c0" />
              <Bar dataKey={t('grade')} fill="#98cad3" />
              <Bar dataKey={t('forceRank')} fill="#1A90DC" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
      {mode === 'board' ? (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {groups.map((g) => (
            <Card key={g} variant="outlined">
              <CardHeader title={g} titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} sx={{ pb: 0 }} />
              <CardContent>
                <Grid container spacing={1}>
                  {grades.map((gr) => (
                    <Grid key={gr} size={{ xs: 12, sm: 6, md: 12 / Math.max(grades.length, 1) }}>
                      <Paper variant="outlined" sx={{ p: 1, minHeight: 120, borderTop: `4px solid ${gradeColor(gr)}` }}>
                        <Typography sx={{ fontWeight: 700, color: gradeColor(gr) }}>{gr}</Typography>
                        {data.rows.filter((r) => r.group === g && r.force_rank_grade === gr).map((r) => (
                          <Box key={r.id} sx={{ fontSize: 13, py: 0.3, borderBottom: '1px dashed #e0e0e0' }}>
                            {r.emp_name} <Typography component="span" variant="caption" color="text.secondary">({fmt(r.result_score)})</Typography>
                          </Box>
                        ))}
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        <DataTable rows={data.rows} pageSize={50} columns={[
          ...(mode !== 'company' ? [{ field: 'group', label: t(mode === 'vertical' ? 'organization' : 'levelGroup') }] : []),
          { field: 'no', label: t('no'), align: 'right' }, { field: 'emp_code', label: t('empCode') }, { field: 'emp_name', label: t('empName') },
          { field: 'org_name', label: t('organization') }, { field: 'level_group', label: t('levelGroup') }, { field: 'position_name', label: t('position') },
          { field: 'result_score', label: t('resultScore'), align: 'right', render: (r) => fmt(r.result_score) },
          { field: 'force_rank_index', label: 'Percentile', align: 'right', render: (r) => fmt(r.force_rank_index) },
          { field: 'grade', label: t('grade'), render: (r) => <GradeChip grade={r.grade} /> },
          { field: 'force_rank_grade', label: t('forceRank'), render: (r) => (
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <GradeChip grade={r.force_rank_grade} />
              {r.is_tie && <Chip size="small" color="warning" variant="outlined" label={t('tie')} />}
              {r.forced === false && <Chip size="small" variant="outlined" label={t('notForced')} />}
            </Box>
          ) },
          { field: 'adjust_grade', label: t('adjustGrade'), render: (r) => <GradeChip grade={r.adjust_grade} /> },
        ]} />
      )}
      {toast.node}
    </Box>
  )
}
