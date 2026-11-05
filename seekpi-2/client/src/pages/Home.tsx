import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { menu } from '../menu'
import { DataTable, GradeChip, StatusChip, fmt } from '../components/common'

export function Home() {
  const { user, perm } = useAuth()
  const { t } = useI18n()
  const [mine, setMine] = useState<any[]>([])
  useEffect(() => { if (perm('appraisal').is_view) api<any[]>('/appraisal').then((r) => setMine(user?.employee_id ? r.filter((a) => a.emp_id === user.employee_id) : [])).catch(() => {}) }, []) // eslint-disable-line
  const tiles = menu.flatMap((m) => (m.child ? m.child.map((c) => ({ ...c, icon: m.icon, group: m.name })) : m.key ? [{ ...m, group: '' }] : []))
    .filter((m) => perm(m.key).is_view === 1)

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#17324d' }}>{t('welcome')}, {user?.first_name || user?.user_name}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>SEEKPI-2 · KPI &amp; performance appraisal for Syntec Construction</Typography>
      {mine.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('myAppraisal')}</Typography>
          <DataTable search={false} rows={mine} columns={[
            { field: 'form_name', label: t('form') }, { field: 'status', label: t('status'), render: (r) => <StatusChip status={r.status} /> },
            { field: 'result_score', label: t('resultScore'), align: 'right', render: (r) => fmt(r.result_score) },
            { field: 'grade', label: t('grade'), render: (r) => <GradeChip grade={r.adjust_grade || r.grade} /> },
            { field: 'x', label: '', render: () => <Button size="small" component={RouterLink} to="/appraisal">{t('evaluate')}</Button> },
          ]} />
        </Box>
      )}
      <Grid container spacing={2}>
        {tiles.map((m) => (
          <Grid key={m.link + m.name} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea component={RouterLink} to={m.link} sx={{ height: '100%' }}>
                <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Box sx={{ color: '#1A90DC', display: 'flex' }}>{m.icon}</Box>
                  <Box>
                    {m.group && <Typography variant="caption" color="text.secondary">{t(m.group)}</Typography>}
                    <Typography sx={{ fontWeight: 500 }}>{t(m.name)}</Typography>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
