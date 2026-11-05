import type { ReactNode } from 'react'
import HomeIcon from '@mui/icons-material/Home'
import PeopleIcon from '@mui/icons-material/People'
import SettingsApplicationsIcon from '@mui/icons-material/SettingsApplications'
import ListAltIcon from '@mui/icons-material/ListAlt'
import BadgeIcon from '@mui/icons-material/Badge'
import AssignmentIcon from '@mui/icons-material/Assignment'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import ViewKanbanIcon from '@mui/icons-material/ViewKanban'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AssessmentIcon from '@mui/icons-material/Assessment'
import SettingsIcon from '@mui/icons-material/Settings'
import FeedbackIcon from '@mui/icons-material/Feedback'
import SummarizeIcon from '@mui/icons-material/Summarize'

export type MenuChild = { key: string; name: string; link: string }
export type MenuItem = { key: string; name: string; link: string; icon: ReactNode; child?: MenuChild[]; alwaysShow?: boolean }

// Same structure and order as the original SEEKPI sidebar (recovered by REA from main.b9e450c5.chunk.js).
export const menu: MenuItem[] = [
  { key: '', name: 'home', link: '/', icon: <HomeIcon />, alwaysShow: true },
  { key: 'manageUser', name: 'manageUser', link: '/', icon: <PeopleIcon />, child: [
    { key: 'role', name: 'role', link: '/manage/role' },
    { key: 'user', name: 'users', link: '/manage/user' },
  ] },
  { key: 'setupData', name: 'setupData', link: '/', icon: <SettingsApplicationsIcon />, child: [
    { key: 'criteria', name: 'appraisalCriteria', link: '/setup/criteria' },
    { key: 'company', name: 'company', link: '/setup/company' },
    { key: 'competency_score', name: 'competencyScore', link: '/setup/competency_score' },
    { key: 'form', name: 'form', link: '/setup/form' },
    { key: 'kpi_type', name: 'kpiType', link: '/setup/kpi' },
    { key: 'level', name: 'level', link: '/setup/level' },
    { key: 'level_group', name: 'levelGroup', link: '/setup/level_group' },
    { key: 'organization', name: 'organization', link: '/setup/organization' },
    { key: 'perspective', name: 'perspective', link: '/setup/perspective' },
    { key: 'position', name: 'position', link: '/setup/position' },
    { key: 'position_group', name: 'positionGroup', link: '/setup/position_group' },
    { key: 'structure', name: 'structure', link: '/setup/structure' },
    { key: 'threshold_group', name: 'thresholdGroup', link: '/setup/threshold_group' },
    { key: 'uom', name: 'uom', link: '/setup/uom' },
    { key: 'grade_criteria', name: 'gradeCriteria', link: '/setup/grade_criteria' },
    { key: 'force_rank_group', name: 'forceRankGroup', link: '/setup/force_rank_group' },
  ] },
  { key: 'item', name: 'appraisalItem', link: '/appraisal_item', icon: <ListAltIcon /> },
  { key: 'employee', name: 'employee', link: '/employee', icon: <BadgeIcon /> },
  { key: 'assignment', name: 'assignment', link: '/', icon: <AssignmentIcon />, child: [
    { key: 'assignment', name: 'individual', link: '/assignment/individual' },
    { key: 'assignment', name: 'corporate', link: '/assignment/corporate' },
  ] },
  { key: 'appraisal', name: 'appraisal', link: '/appraisal', icon: <FactCheckIcon /> },
  { key: 'force_rank', name: 'forceRank', link: '/force_rank', icon: <LeaderboardIcon /> },
  { key: 'force_rank_vertical', name: 'forceRankVertical', link: '/force_rank_vertical', icon: <SwapVertIcon /> },
  { key: 'force_rank_horizontal', name: 'forceRankHorizontal', link: '/force_rank_horizontal', icon: <SwapHorizIcon /> },
  { key: 'force_rank_horizontal_board', name: 'forceRankHorizontalBoard', link: '/force_rank_horizontal_board', icon: <ViewKanbanIcon /> },
  { key: 'import_salary', name: 'importSalary', link: '/import_salary', icon: <UploadFileIcon /> },
  { key: 'dashboard', name: 'dashboard', link: '/', icon: <DashboardIcon />, child: [
    { key: 'dashboard_branch_performance', name: 'dashboardBranchPerformance', link: '/dashboard/branch_performance' },
    { key: 'dashboard_overall_performance', name: 'dashboardOverallPerformance', link: '/dashboard/overall_performance' },
    { key: 'dashboard_performance_comparison', name: 'dashboardPerformanceComparison', link: '/dashboard/performance_comparison' },
    { key: 'dashboard_performance_trend', name: 'dashboardPerformanceTrend', link: '/dashboard/dashboard_performance_trend' },
  ] },
  { key: 'report', name: 'report', link: '/', icon: <AssessmentIcon />, child: [
    { key: 'report_appraisal', name: 'reportAppraisal', link: '/report/appraisal' },
    { key: 'report_appraisal_by_org', name: 'reportAppraisalByOrg', link: '/report/appraisalbyorg' },
    { key: 'report_appraisal_by_level', name: 'reportAppraisalByLevel', link: '/report/appraisalbylevel' },
    { key: 'report_appraisal_by_job_kpi', name: 'reportAppraisalByJobKpi', link: '/report/appraisalbyjobkpi' },
    { key: 'report_data_entry', name: 'reportDataEntry', link: '/report/data_entry' },
    { key: 'report_kpi', name: 'reportKpi', link: '/report/kpi' },
    { key: 'report_performance_form', name: 'reportPerformanceForm', link: '/report/performance_form' },
    { key: 'report_bonus_salary', name: 'reportBonusSalary', link: '/report/bonussalary' },
    { key: 'usage_log', name: 'usageLog', link: '/report/usage_log' },
  ] },
  { key: 'setting', name: 'setting', link: '/', icon: <SettingsIcon />, child: [
    { key: 'password_policy', name: 'passwordPolicy', link: '/setting/password_policy' },
    { key: 'ldap', name: 'LDAP', link: '/setting/LDAP' },
    { key: 'e_mail_server', name: 'emailServer', link: '/setting/e_mail_server' },
    { key: 'data_integration', name: 'dataIntegration', link: '/setting/data_integration' },
  ] },
  { key: 'feedback', name: 'feedback', link: '/feedback', icon: <FeedbackIcon /> },
  { key: 'feedback_report', name: 'feedbackReport', link: '/feedback_report', icon: <SummarizeIcon /> },
]
