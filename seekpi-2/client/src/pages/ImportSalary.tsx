import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button } from '@mui/material'
import UploadIcon from '@mui/icons-material/Upload'
import DownloadIcon from '@mui/icons-material/Download'
import { api, downloadCsv, toCsv } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { DataTable, PageHeader, useToast } from '../components/common'

export function ImportSalary() {
  const { t } = useI18n()
  const { perm } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<any[]>([])
  const [result, setResult] = useState<{ updated: number; missing: string[] } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const load = () => api<any[]>('/salary').then(setRows).catch(toast.error)
  useEffect(() => { load() }, []) // eslint-disable-line

  const onFile = async (f?: File) => {
    if (!f) return
    const text = (await f.text()).replace(/^﻿/, '')
    const lines = text.split(/\r?\n/).filter(Boolean)
    const head = lines.shift()!.split(',').map((h) => h.trim().toLowerCase())
    const ci = head.indexOf('emp_code'), si = head.indexOf('salary')
    if (ci < 0 || si < 0) return toast.error('CSV must have emp_code and salary columns')
    const data = lines.map((l) => l.split(',')).map((c) => ({ emp_code: c[ci]?.trim(), salary: Number(c[si]) })).filter((r) => r.emp_code && !isNaN(r.salary))
    api<{ updated: number; missing: string[] }>('/salary/import', { method: 'POST', body: { rows: data } }).then((r) => { setResult(r); load() }).catch(toast.error)
    if (file.current) file.current.value = ''
  }

  return (
    <Box>
      <PageHeader title={t('importSalary')}>
        <Button startIcon={<DownloadIcon />} onClick={() => downloadCsv('salary_template.csv', toCsv([{ field: 'emp_code', label: 'emp_code' }, { field: 'emp_name', label: 'emp_name' }, { field: 'salary', label: 'salary' }], rows))}>{t('downloadTemplate')}</Button>
        {perm('import_salary').is_edit === 1 && <>
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="contained" startIcon={<UploadIcon />} onClick={() => file.current?.click()}>{t('uploadCsv')}</Button>
        </>}
      </PageHeader>
      {result && <Alert severity={result.missing.length ? 'warning' : 'success'} sx={{ mb: 2 }} onClose={() => setResult(null)}>
        {t('importResult')}: {t('updated')} {result.updated}{result.missing.length ? ` · ${t('notFound')}: ${result.missing.join(', ')}` : ''}
      </Alert>}
      <DataTable rows={rows} columns={[
        { field: 'emp_code', label: t('empCode') }, { field: 'emp_name', label: t('empName') }, { field: 'org_name', label: t('organization') },
        { field: 'salary', label: t('salary'), align: 'right' },
      ]} />
      {toast.node}
    </Box>
  )
}
