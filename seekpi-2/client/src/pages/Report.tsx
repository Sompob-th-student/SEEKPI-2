import { useEffect, useState } from 'react'
import { Box, Button } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import { api, downloadCsv, toCsv } from '../api'
import { useI18n } from '../i18n'
import { DataTable, GradeChip, PageHeader, SelectField, StatusChip, useDropdown, useFormFilter, useToast, type Col } from '../components/common'

export function Report({ name, title, filters = true }: { name: string; title: string; filters?: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const { forms, formId, setFormId } = useFormFilter()
  const orgs = useDropdown('organization')
  const [orgId, setOrgId] = useState<number | ''>('')
  const [data, setData] = useState<{ columns: { field: string; label: string }[]; rows: any[] }>({ columns: [], rows: [] })
  useEffect(() => {
    if (filters && !formId) return
    api(`/report/${name}`, { query: filters ? { form_id: formId, org_id: orgId } : {} }).then(setData).catch(toast.error)
  }, [name, formId, orgId, filters]) // eslint-disable-line

  const columns: Col[] = data.columns.map((c) => ({
    field: c.field, label: t(c.label),
    align: typeof data.rows[0]?.[c.field] === 'number' ? 'right' : undefined,
    render: /grade/.test(c.field) && !/_criteria/.test(c.field) ? (r) => <GradeChip grade={r[c.field]} /> : c.field === 'status' ? (r) => <StatusChip status={r.status} /> : undefined,
  }))
  const exportCsv = () => downloadCsv(`${name}.csv`, toCsv(data.columns.map((c) => ({ field: c.field, label: t(c.label) })), data.rows.map((r) => Object.fromEntries(data.columns.map((c) => [c.field, r[c.field] == null ? '' : r[c.field]])))))

  return (
    <Box>
      <PageHeader title={t(title)}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!data.rows.length}>{t('export')} CSV</Button>
      </PageHeader>
      <DataTable columns={columns} rows={data.rows} pageSize={50} toolbar={filters ? <>
        <SelectField label={t('form')} value={formId} onChange={setFormId} options={forms} />
        {!['appraisal_by_org', 'appraisal_by_level', 'appraisal_by_job_kpi'].includes(name) &&
          <SelectField label={t('organization')} value={orgId} onChange={setOrgId} options={orgs} allLabel={t('allOrganizations')} />}
      </> : undefined} />
      <Box sx={{ mt: 1, color: 'text.secondary', fontSize: 12 }}>{data.rows.length.toLocaleString()} rows</Box>
      {toast.node}
    </Box>
  )
}
