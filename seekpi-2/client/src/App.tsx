import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './auth'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { CrudPage } from './pages/CrudPage'
import { Assignment } from './pages/Assignment'
import { Appraisal } from './pages/Appraisal'
import { ForceRank } from './pages/ForceRank'
import { ImportSalary } from './pages/ImportSalary'
import { BranchDashboard, ComparisonDashboard, OverallDashboard, TrendDashboard } from './pages/Dashboards'
import { Report } from './pages/Report'
import { Feedback, FeedbackReport, Guard, NotConfigured, NotFound, Profile } from './pages/Misc'

function Private({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <Layout>{children}</Layout>
}

// [path, permission key, element] — paths match the original SEEKPI router (REA route inventory).
const crud = (res: string, perm = res) => <Guard perm={perm}><CrudPage key={res} resource={res} permKey={perm} /></Guard>
const routes: [string, string | null, ReactNode][] = [
  ['/', null, <Home />],
  ['/manage/role', 'role', crud('role')],
  ['/manage/user', 'user', crud('user')],
  ['/setup/criteria', 'criteria', crud('criteria')],
  ['/setup/company', 'company', crud('company')],
  ['/setup/competency_score', 'competency_score', crud('competency_score')],
  ['/setup/form', 'form', crud('form')],
  ['/setup/kpi', 'kpi_type', crud('kpi_type')],
  ['/setup/level', 'level', crud('level')],
  ['/setup/level_group', 'level_group', crud('level_group')],
  ['/setup/organization', 'organization', crud('organization')],
  ['/setup/perspective', 'perspective', crud('perspective')],
  ['/setup/position', 'position', crud('position')],
  ['/setup/position_group', 'position_group', crud('position_group')],
  ['/setup/structure', 'structure', crud('structure')],
  ['/setup/threshold_group', 'threshold_group', crud('threshold_group')],
  ['/setup/uom', 'uom', crud('uom')],
  ['/setup/grade_criteria', 'grade_criteria', crud('grade_criteria')],
  ['/setup/force_rank_group', 'force_rank_group', crud('force_rank_group')],
  ['/appraisal_item', 'item', crud('item')],
  ['/employee/*', 'employee', crud('employee')],
  ['/assignment/individual', 'assignment', <Assignment key="i" type="individual" />],
  ['/assignment/corporate', 'assignment', <Assignment key="c" type="corporate" />],
  ['/appraisal', 'appraisal', <Appraisal />],
  ['/force_rank', 'force_rank', <ForceRank key="c" mode="company" />],
  ['/force_rank_vertical', 'force_rank_vertical', <ForceRank key="v" mode="vertical" />],
  ['/force_rank_horizontal', 'force_rank_horizontal', <ForceRank key="h" mode="horizontal" />],
  ['/force_rank_horizontal_board', 'force_rank_horizontal_board', <ForceRank key="b" mode="board" />],
  ['/import_salary', 'import_salary', <ImportSalary />],
  ['/dashboard/branch_performance', 'dashboard_branch_performance', <BranchDashboard />],
  ['/dashboard/overall_performance', 'dashboard_overall_performance', <OverallDashboard />],
  ['/dashboard/performance_comparison', 'dashboard_performance_comparison', <ComparisonDashboard />],
  ['/dashboard/dashboard_performance_trend', 'dashboard_performance_trend', <TrendDashboard />],
  ['/report/appraisal', 'report_appraisal', <Report key="1" name="appraisal" title="reportAppraisal" />],
  ['/report/appraisalbyorg', 'report_appraisal_by_org', <Report key="2" name="appraisal_by_org" title="reportAppraisalByOrg" />],
  ['/report/appraisalbylevel', 'report_appraisal_by_level', <Report key="3" name="appraisal_by_level" title="reportAppraisalByLevel" />],
  ['/report/appraisalbyjobkpi', 'report_appraisal_by_job_kpi', <Report key="4" name="appraisal_by_job_kpi" title="reportAppraisalByJobKpi" />],
  ['/report/data_entry', 'report_data_entry', <Report key="5" name="data_entry" title="reportDataEntry" />],
  ['/report/kpi', 'report_kpi', <Report key="6" name="kpi" title="reportKpi" />],
  ['/report/performance_form', 'report_performance_form', <Report key="7" name="performance_form" title="reportPerformanceForm" />],
  ['/report/bonussalary', 'report_bonus_salary', <Report key="8" name="bonus_salary" title="reportBonusSalary" />],
  ['/report/usage_log', 'usage_log', <Report key="9" name="usage_log" title="usageLog" filters={false} />],
  ['/setting/password_policy', 'password_policy', crud('password_policy')],
  ['/setting/e_mail_server', 'e_mail_server', crud('email_server', 'e_mail_server')],
  ['/setting/LDAP', 'ldap', <NotConfigured title="LDAP" />],
  ['/setting/data_integration', 'data_integration', <NotConfigured title="dataIntegration" />],
  ['/adjust', null, <NotConfigured title="adjust" />],
  ['/feedback', 'feedback', <Feedback />],
  ['/feedback_report', 'feedback_report', <FeedbackReport />],
  ['/profile', null, <Profile />],
]

function Logout() {
  const { logout } = useAuth()
  logout()
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter basename="/seekpi-2">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/logout" element={<Logout />} />
        {routes.map(([path, perm, el]) => (
          <Route key={path} path={path} element={<Private>{perm ? <Guard perm={perm}>{el}</Guard> : el}</Private>} />
        ))}
        <Route path="*" element={<Private><NotFound /></Private>} />
      </Routes>
    </BrowserRouter>
  )
}
