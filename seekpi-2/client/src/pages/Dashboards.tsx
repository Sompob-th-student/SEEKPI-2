import { useEffect, useState } from 'react'
import { Box, Grid, MenuItem, Paper, TextField, Typography } from '@mui/material'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api'
import { useI18n } from '../i18n'
import { DataTable, GradeChip, PageHeader, SelectField, StatCard, fmt, gradeColor, useDropdown, useFormFilter, useToast } from '../components/common'

const Panel = ({ title, children, h = 300 }: { title: string; children: React.ReactElement; h?: number }) => (
  <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{title}</Typography>
    <Box sx={{ height: h }}><ResponsiveContainer>{children}</ResponsiveContainer></Box>
  </Paper>
)
const SERIES = ['#98cad3', '#1A90DC', '#3d6bb3', '#82ca9d']

export function OverallDashboard() {
  const { t } = useI18n()
  const toast = useToast()
  const { forms, formId, setFormId } = useFormFilter()
  const [d, setD] = useState<any>(null)
  useEffect(() => { if (formId) api('/dashboard/overall', { query: { form_id: formId } }).then(setD).catch(toast.error) }, [formId]) // eslint-disable-line
  return (
    <Box>
      <PageHeader title={t('dashboardOverallPerformance')}><SelectField label={t('form')} value={formId} onChange={setFormId} options={forms} /></PageHeader>
      {d && <>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, md: 3 }}><StatCard label={t('employees')} value={d.summary.total} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard label={t('evaluated')} value={d.summary.evaluated ?? 0} color="#2e7d32" sub={d.summary.total ? `${Math.round(((d.summary.evaluated ?? 0) / d.summary.total) * 100)}%` : ''} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard label={t('avgResult')} value={fmt(d.summary.avg_score)} color="#8d6e00" /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard label="Max" value={fmt(d.summary.max_score)} color="#17324d" /></Grid>
        </Grid>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Panel title={t('gradeDistributionChart')}>
              <PieChart>
                <Pie data={d.grades} dataKey="n" nameKey="grade" innerRadius={60} outerRadius={100} label={(e: any) => `${e.grade}: ${e.n}`}>
                  {d.grades.map((g: any) => <Cell key={g.grade} fill={gradeColor(g.grade)} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Panel title={t('perspectiveAchievement')}>
              <BarChart data={d.perspective}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis unit="%" /><Tooltip />
                <Bar dataKey="achievement" name={t('achievement')}>{d.perspective.map((p: any) => <Cell key={p.name} fill={p.color} />)}</Bar>
              </BarChart>
            </Panel>
          </Grid>
          {d.corporate && <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{t('corporateScorecard')} · {fmt(d.corporate.result_score)} <GradeChip grade={d.corporate.grade} /></Typography>
              <DataTable search={false} rows={(d.corporate.structures ?? []).flatMap((s: any) => s.items)} columns={[
                { field: 'perspective_name', label: t('perspective') }, { field: 'item_name', label: t('appraisalItem') }, { field: 'frequency', label: t('frequency') },
                { field: 'uom_name', label: t('uom') }, { field: 'weight_percent', label: t('weight'), align: 'right' },
                { field: 'actual_value', label: t('actual'), align: 'right' }, { field: 'score', label: t('score'), align: 'right' },
                { field: 'weighted_score', label: t('weightScore'), align: 'right' },
              ]} />
            </Paper>
          </Grid>}
        </Grid>
      </>}
      {toast.node}
    </Box>
  )
}

export function BranchDashboard() {
  const { t } = useI18n()
  const toast = useToast()
  const { forms, formId, setFormId } = useFormFilter()
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { if (formId) api<any[]>('/dashboard/branch', { query: { form_id: formId } }).then(setRows).catch(toast.error) }, [formId]) // eslint-disable-line
  return (
    <Box>
      <PageHeader title={t('dashboardBranchPerformance')}><SelectField label={t('form')} value={formId} onChange={setFormId} options={forms} /></PageHeader>
      <Box sx={{ mb: 2 }}>
        <Panel title={`${t('avgScore')} · ${t('organization')}`} h={Math.max(280, rows.length * 34)}>
          <ComposedChart data={rows} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 12 }} />
            <Tooltip /><Legend />
            <Bar dataKey="avg_score" name={t('avgScore')} fill="#1A90DC" barSize={16} />
            <Line dataKey="max_score" name="Max" stroke="#2e7d32" />
            <Line dataKey="min_score" name="Min" stroke="#c62828" />
          </ComposedChart>
        </Panel>
      </Box>
      <DataTable rows={rows} search={false} columns={[
        { field: 'name', label: t('organization') }, { field: 'headcount', label: t('headcount'), align: 'right' },
        { field: 'avg_score', label: t('avgScore'), align: 'right' }, { field: 'min_score', label: 'Min', align: 'right' }, { field: 'max_score', label: 'Max', align: 'right' },
      ]} />
      {toast.node}
    </Box>
  )
}

export function ComparisonDashboard() {
  const { t } = useI18n()
  const toast = useToast()
  const [by, setBy] = useState('org')
  const [d, setD] = useState<{ years: number[]; rows: any[] }>({ years: [], rows: [] })
  useEffect(() => { api('/dashboard/comparison', { query: { by } }).then(setD).catch(toast.error) }, [by]) // eslint-disable-line
  return (
    <Box>
      <PageHeader title={t('dashboardPerformanceComparison')}>
        <TextField select size="small" label={t('compareBy')} value={by} onChange={(e) => setBy(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="org">{t('organization')}</MenuItem><MenuItem value="level_group">{t('levelGroup')}</MenuItem>
        </TextField>
      </PageHeader>
      <Panel title={`${t('avgScore')} · ${d.years.join(' vs ')}`} h={420}>
        <BarChart data={d.rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={110} tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} /><Tooltip /><Legend verticalAlign="top" />
          {d.years.map((y, i) => <Bar key={y} dataKey={String(y)} name={String(y)} fill={SERIES[i % SERIES.length]} />)}
        </BarChart>
      </Panel>
      {toast.node}
    </Box>
  )
}

export function TrendDashboard() {
  const { t } = useI18n()
  const toast = useToast()
  const items = useDropdown('item')
  const [itemId, setItemId] = useState<number | ''>('')
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { if (itemId === '' && items.length) setItemId(items[0].id) }, [items, itemId])
  useEffect(() => { if (itemId) api<any[]>('/dashboard/trend', { query: { item_id: itemId } }).then(setRows).catch(toast.error) }, [itemId]) // eslint-disable-line
  return (
    <Box>
      <PageHeader title={t('dashboardPerformanceTrend')}><SelectField label={t('kpiItem')} value={itemId} onChange={setItemId} options={items} sx={{ minWidth: 320 }} /></PageHeader>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title={`${t('target')} vs ${t('actual')}`}>
            <ComposedChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="year" /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="actual" name={t('actual')} fill="#1A90DC" barSize={40} />
              <Line dataKey="target" name={t('target')} stroke="#c62828" strokeWidth={2} />
            </ComposedChart>
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Panel title={t('achievement')}>
            <ComposedChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip />
              <Line dataKey="achievement" name={t('achievement')} stroke="#2e7d32" strokeWidth={3} dot={{ r: 5 }} />
            </ComposedChart>
          </Panel>
        </Grid>
      </Grid>
      {toast.node}
    </Box>
  )
}
