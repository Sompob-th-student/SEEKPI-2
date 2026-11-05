import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Paper, Rating, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { DataTable, PageHeader, SelectField, fmt, useDropdown, useFormFilter, useToast } from '../components/common'

export function Feedback() {
  const { t } = useI18n()
  const toast = useToast()
  const emps = useDropdown('employee')
  const { forms, formId } = useFormFilter()
  const [rows, setRows] = useState<any[]>([])
  const [edit, setEdit] = useState<any | null>(null)
  const load = () => api<any[]>('/feedback').then(setRows).catch(toast.error)
  useEffect(() => { load() }, []) // eslint-disable-line
  const save = () => api('/feedback', { method: 'POST', body: edit }).then(() => { setEdit(null); toast.ok(t('saved')); load() }).catch(toast.error)
  return (
    <Box>
      <PageHeader title={t('feedback')}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit({ form_id: formId, rating: 4 })}>{t('add')}</Button>
      </PageHeader>
      <DataTable rows={rows} columns={[
        { field: 'created_at', label: t('date') }, { field: 'emp_code', label: t('empCode') }, { field: 'emp_name', label: t('empName') },
        { field: 'topic', label: t('topic') }, { field: 'rating', label: t('rating'), render: (r) => <Rating size="small" readOnly value={r.rating ?? 0} /> },
        { field: 'comment', label: t('comment') }, { field: 'from_user', label: t('fromUser') },
      ]} />
      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('feedback')}</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          {edit && <>
            <SelectField label={t('form')} value={edit.form_id ?? ''} onChange={(v) => setEdit({ ...edit, form_id: v })} options={forms} />
            <SelectField required label={t('employee')} value={edit.to_emp_id ?? ''} onChange={(v) => setEdit({ ...edit, to_emp_id: v })} options={emps} />
            <TextField size="small" label={t('topic')} value={edit.topic ?? ''} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} />
            <Box><Typography variant="caption">{t('rating')}</Typography><br /><Rating value={edit.rating ?? 0} onChange={(_, v) => setEdit({ ...edit, rating: v })} /></Box>
            <TextField required multiline minRows={3} label={t('comment')} value={edit.comment ?? ''} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} />
          </>}
        </DialogContent>
        <DialogActions><Button onClick={() => setEdit(null)}>{t('cancel')}</Button><Button variant="contained" onClick={save}>{t('save')}</Button></DialogActions>
      </Dialog>
      {toast.node}
    </Box>
  )
}

export function FeedbackReport() {
  const { t } = useI18n()
  const toast = useToast()
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { api<any[]>('/feedback/report').then(setRows).catch(toast.error) }, []) // eslint-disable-line
  return (
    <Box>
      <PageHeader title={t('feedbackReport')} />
      <DataTable rows={rows} columns={[
        { field: 'emp_code', label: t('empCode') }, { field: 'emp_name', label: t('empName') }, { field: 'org_name', label: t('organization') },
        { field: 'feedback_count', label: t('feedbackCount'), align: 'right' }, { field: 'avg_rating', label: t('avgRating'), align: 'right', render: (r) => fmt(r.avg_rating) },
        { field: 'last_feedback', label: t('lastFeedback') },
      ]} />
      {toast.node}
    </Box>
  )
}

export function Profile() {
  const { t } = useI18n()
  const toast = useToast()
  const [me, setMe] = useState<any>(null)
  const [pw, setPw] = useState({ old_password: '', new_password: '', confirm: '' })
  useEffect(() => { api('/me').then(setMe).catch(toast.error) }, []) // eslint-disable-line
  const change = () => {
    if (pw.new_password !== pw.confirm) return toast.error(t('confirmPassword'))
    api('/me/password', { method: 'PUT', body: pw }).then(() => { toast.ok(t('saved')); setPw({ old_password: '', new_password: '', confirm: '' }) }).catch(toast.error)
  }
  const row = (k: string, v: unknown) => <><Grid size={{ xs: 5, sm: 4 }}><Typography color="text.secondary">{t(k)}</Typography></Grid><Grid size={{ xs: 7, sm: 8 }}><Typography>{fmt(v)}</Typography></Grid></>
  return (
    <Box>
      <PageHeader title={t('profile')} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            {me && <Grid container spacing={1}>
              {row('userName', me.user.user_name)}{row('firstName', me.user.first_name)}{row('lastName', me.user.last_name)}{row('email', me.user.email)}
              {me.employee && <>{row('empCode', me.employee.emp_code)}{row('position', me.employee.position_name)}{row('organization', me.employee.org_name)}</>}
            </Grid>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('changePassword')}</Typography>
            <TextField size="small" type="password" label={t('oldPassword')} value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} autoComplete="current-password" />
            <TextField size="small" type="password" label={t('newPassword')} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" />
            <TextField size="small" type="password" label={t('confirmPassword')} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            <Box><Button variant="contained" onClick={change} disabled={!pw.old_password || !pw.new_password}>{t('save')}</Button></Box>
          </Paper>
        </Grid>
      </Grid>
      {toast.node}
    </Box>
  )
}

/** LDAP / Data Integration / Adjust: the original app routes these to an empty layout too. */
export function NotConfigured({ title }: { title: string }) {
  const { t } = useI18n()
  return <Box><PageHeader title={t(title)} /><Alert severity="info">{t('notAvailable')}</Alert></Box>
}

export function NotFound() {
  return <Box sx={{ textAlign: 'center', py: 8 }}><Typography variant="h3" color="text.secondary">404</Typography><Button component={RouterLink} to="/">Home</Button></Box>
}

export function Guard({ perm: key, children }: { perm: string; children: React.ReactNode }) {
  const { perm } = useAuth()
  if (perm(key).is_view !== 1) return <Alert severity="warning">403 · Forbidden</Alert>
  return <>{children}</>
}
