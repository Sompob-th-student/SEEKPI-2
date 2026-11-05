// Resource registry: one definition drives the SQLite schema, the generic REST API,
// and the generic list/form screens in the client (via GET /api/meta).
// List columns follow the material-table column sets REA recovered from the original
// SEEKPI bundle (see ../rea-analysis/columns.json).
//
// field types: text | number | date | bool | color | select (options) | ref (ref: resource) | json

const company = { name: 'company_id', label: 'company', type: 'ref', ref: 'company', required: true };
const active = { name: 'is_active', label: 'active', type: 'bool', default: 1 };
const effective = { name: 'effective_date', label: 'effectiveDate', type: 'date' };

export const resources = {
  company: {
    perm: 'company', title: 'company', display: 'company_name',
    fields: [
      { name: 'company_code', label: 'companyCode', type: 'text', required: true, unique: true },
      { name: 'company_name', label: 'companyName', type: 'text', required: true },
      { name: 'business_line', label: 'lineBusiness', type: 'text' },
      active,
    ],
    list: ['company_code', 'company_name', 'business_line', 'is_active'],
  },
  organization: {
    table: 'org', perm: 'organization', title: 'organization', display: 'org_name',
    fields: [
      { name: 'org_code', label: 'orgCode', type: 'text', required: true, unique: true },
      { name: 'org_name', label: 'orgName', type: 'text', required: true },
      company,
      { name: 'level_id', label: 'level', type: 'ref', ref: 'level' },
      { name: 'parent_id', label: 'parentOrganization', type: 'ref', ref: 'organization' },
      effective, active,
    ],
    list: ['org_code', 'org_name', 'company_name', 'level_name', 'effective_date'],
  },
  level: {
    perm: 'level', title: 'level', display: 'level_name',
    fields: [
      { name: 'seq_no', label: 'seqNo', type: 'number' },
      { name: 'level_name', label: 'appraisalLevel', type: 'text', required: true },
      { name: 'appraisal_type', label: 'appraisalType', type: 'select', options: ['Organization', 'Individual'], default: 'Individual' },
      { name: 'parent_id', label: 'parentLevel', type: 'ref', ref: 'level' },
      company, active,
    ],
    list: ['seq_no', 'level_name', 'appraisal_type', 'parent_name', 'company_name', 'is_active'],
  },
  level_group: {
    perm: 'level_group', title: 'levelGroup', display: 'level_group_name',
    fields: [
      { name: 'level_group_name', label: 'levelGroupName', type: 'text', required: true },
      company, active,
      { name: 'is_vfr', label: 'verticalForceRank', type: 'bool', default: 0 },
    ],
    list: ['level_group_name', 'company_name', 'is_active', 'is_vfr'],
  },
  position_group: {
    perm: 'position_group', title: 'positionGroup', display: 'position_group_name',
    fields: [
      { name: 'position_group_code', label: 'positionGroupCode', type: 'text', required: true, unique: true },
      { name: 'position_group_name', label: 'positionGroupName', type: 'text', required: true },
      company, active,
    ],
    list: ['position_group_code', 'position_group_name', 'company_name', 'is_active'],
  },
  position: {
    perm: 'position', title: 'position', display: 'position_name',
    fields: [
      { name: 'position_code', label: 'positionCode', type: 'text', required: true, unique: true },
      { name: 'position_name', label: 'positionName', type: 'text', required: true },
      { name: 'position_group_id', label: 'positionGroup', type: 'ref', ref: 'position_group' },
      company, effective, active,
    ],
    list: ['position_code', 'position_name', 'position_group_name', 'company_name', 'effective_date'],
  },
  perspective: {
    perm: 'perspective', title: 'perspective', display: 'perspective_name',
    fields: [
      { name: 'perspective_name', label: 'perspectiveName', type: 'text', required: true },
      { name: 'perspective_abbr', label: 'perspectiveAbbr', type: 'text' },
      company,
      { name: 'color_code', label: 'colorCode', type: 'color', default: '#3c91dc' },
      active,
    ],
    list: ['perspective_name', 'perspective_abbr', 'company_name', 'color_code', 'is_active'],
  },
  kpi_type: {
    perm: 'kpi_type', title: 'kpiType', display: 'kpi_type_name',
    fields: [{ name: 'kpi_type_name', label: 'kpiTypeName', type: 'text', required: true }, company, active],
    list: ['kpi_type_name', 'company_name', 'is_active'],
  },
  uom: {
    perm: 'uom', title: 'uom', display: 'uom_name',
    fields: [
      { name: 'uom_name', label: 'uomName', type: 'text', required: true }, company,
      { name: 'is_date', label: 'isDate', type: 'bool', default: 0 }, active,
    ],
    list: ['uom_name', 'company_name', 'is_date', 'is_active'],
  },
  structure: {
    perm: 'structure', title: 'structure', display: 'structure_name',
    fields: [
      { name: 'seq_no', label: 'seqNo', type: 'number' },
      { name: 'structure_name', label: 'structureName', type: 'text', required: true },
      company,
      { name: 'target_score', label: 'targetScore', type: 'number', default: 5 },
      { name: 'structure_type', label: 'structureType', type: 'select', options: ['Quantity', 'Quality', 'Deduct Score'], default: 'Quantity' },
      active,
    ],
    list: ['seq_no', 'structure_name', 'company_name', 'target_score', 'structure_type', 'is_active'],
  },
  competency_score: {
    perm: 'competency_score', title: 'competencyScore', display: 'score_name',
    fields: [
      { name: 'structure_id', label: 'structureName', type: 'ref', ref: 'structure', required: true },
      { name: 'score', label: 'score', type: 'number', required: true },
      { name: 'score_name', label: 'competencyScore', type: 'text', required: true },
    ],
    list: ['structure_name', 'score', 'score_name'],
  },
  criteria: {
    perm: 'criteria', title: 'appraisalCriteria', display: 'criteria_name',
    // Structure weights per Level Group live in table criteria_weight (edited with the weight-matrix dialog),
    // as in the original SEE KPI Appraisal Criteria screen.
    fields: [{ name: 'criteria_name', label: 'criteriaName', type: 'text', required: true }, company, effective],
    list: ['criteria_name', 'company_name', 'effective_date'],
  },
  threshold_group: {
    perm: 'threshold_group', title: 'thresholdGroup', display: 'threshold_group_name',
    fields: [
      { name: 'threshold_group_name', label: 'thresholdGroupName', type: 'text', required: true }, company,
      { name: 'thresholds', label: 'threshold', type: 'json', default: '[{"score":5,"from":120},{"score":4,"from":100},{"score":3,"from":80},{"score":2,"from":60},{"score":1,"from":0}]' },
      effective, active,
    ],
    list: ['threshold_group_name', 'company_name', 'effective_date'],
  },
  grade_criteria: {
    perm: 'grade_criteria', title: 'gradeCriteria', display: 'grade_criteria_name',
    fields: [
      { name: 'grade_criteria_name', label: 'gradeCriteriaName', type: 'text', required: true }, company,
      // Grade names of the original SEE KPI: FE<S>, EE<A>, FM<B>, PM<C>, NM<D>
      { name: 'grades', label: 'gradeCondition', type: 'json', default: '[{"grade":"FE","begin":90,"end":100,"raise":8,"bonus":3},{"grade":"EE","begin":75,"end":89.99,"raise":6,"bonus":2},{"grade":"FM","begin":55,"end":74.99,"raise":4,"bonus":1.5},{"grade":"PM","begin":40,"end":54.99,"raise":2,"bonus":0.5},{"grade":"NM","begin":0,"end":39.99,"raise":0,"bonus":0}]' },
      effective,
    ],
    list: ['grade_criteria_name', 'company_name', 'effective_date'],
  },
  force_rank_group: {
    perm: 'force_rank_group', title: 'forceRankGroup', display: 'fr_group_name',
    fields: [
      { name: 'fr_group_name', label: 'forceRankGroupName', type: 'text', required: true }, company,
      { name: 'distribution', label: 'gradeDistribution', type: 'json', default: '{"FE":10,"EE":20,"FM":50,"PM":15,"NM":5}' },
      effective,
    ],
    list: ['fr_group_name', 'company_name', 'effective_date'],
  },
  form: {
    perm: 'form', title: 'form', display: 'form_name',
    fields: [
      { name: 'form_name', label: 'formName', type: 'text', required: true }, company,
      { name: 'appraisal_year', label: 'appraisalYear', type: 'number', required: true },
      { name: 'start_date', label: 'startDate', type: 'date' },
      { name: 'end_date', label: 'endDate', type: 'date' },
      { name: 'criteria_id', label: 'appraisalCriteria', type: 'ref', ref: 'criteria' },
      { name: 'threshold_group_id', label: 'thresholdGroup', type: 'ref', ref: 'threshold_group' },
      { name: 'grade_criteria_id', label: 'gradeCriteria', type: 'ref', ref: 'grade_criteria' },
      { name: 'force_rank_group_id', label: 'forceRankGroup', type: 'ref', ref: 'force_rank_group' },
      active,
    ],
    list: ['form_name', 'company_name', 'appraisal_year', 'start_date', 'end_date'],
  },
  item: {
    perm: 'item', title: 'appraisalItem', display: 'item_name',
    fields: [
      { name: 'item_code', label: 'itemCode', type: 'text', required: true, unique: true },
      { name: 'item_name', label: 'itemName', type: 'text', required: true },
      { name: 'structure_id', label: 'structure', type: 'ref', ref: 'structure', required: true },
      { name: 'perspective_id', label: 'perspective', type: 'ref', ref: 'perspective' },
      { name: 'kpi_type_id', label: 'kpiType', type: 'ref', ref: 'kpi_type' },
      { name: 'uom_id', label: 'uom', type: 'ref', ref: 'uom' },
      { name: 'value_type', label: 'valueType', type: 'select', options: ['Higher is better', 'Lower is better'], default: 'Higher is better' },
      { name: 'frequency', label: 'frequency', type: 'select', options: ['Monthly', 'Quarterly', 'Yearly'], default: 'Yearly' },
      // original item flag Sum Up: SUM UP adds subordinate actuals instead of averaging them
      { name: 'sum_up', label: 'sumUp', type: 'bool', default: 0 },
      { name: 'formula', label: 'formula', type: 'text' },
      effective, active,
    ],
    list: ['item_code', 'item_name', 'structure_name', 'perspective_name', 'uom_name', 'frequency', 'effective_date'],
  },
  employee: {
    perm: 'employee', title: 'employee', display: 'emp_name',
    fields: [
      { name: 'emp_code', label: 'empCode', type: 'text', required: true, unique: true },
      { name: 'emp_name', label: 'empName', type: 'text', required: true },
      { name: 'email', label: 'email', type: 'text' },
      { name: 'org_id', label: 'organization', type: 'ref', ref: 'organization' },
      { name: 'level_id', label: 'level', type: 'ref', ref: 'level' },
      { name: 'level_group_id', label: 'levelGroup', type: 'ref', ref: 'level_group' },
      { name: 'position_id', label: 'position', type: 'ref', ref: 'position' },
      { name: 'chief_emp_id', label: 'chief', type: 'ref', ref: 'employee' },
      { name: 'salary', label: 'salary', type: 'number', default: 0 },
      active,
    ],
    list: ['emp_code', 'emp_name', 'org_name', 'level_name', 'level_group_name', 'position_name', 'is_active'],
  },
  role: {
    perm: 'role', title: 'role', display: 'role_name',
    fields: [{ name: 'role_name', label: 'roleName', type: 'text', required: true }, company, active],
    list: ['role_name', 'company_name', 'is_active'],
  },
  user: {
    perm: 'user', title: 'users', display: 'user_name',
    fields: [
      { name: 'user_name', label: 'userName', type: 'text', required: true, unique: true },
      { name: 'first_name', label: 'firstName', type: 'text' },
      { name: 'last_name', label: 'lastName', type: 'text' },
      { name: 'email', label: 'email', type: 'text' },
      { name: 'role_id', label: 'role', type: 'ref', ref: 'role', required: true },
      { name: 'employee_id', label: 'employee', type: 'ref', ref: 'employee' },
      active,
    ],
    list: ['user_name', 'first_name', 'last_name', 'role_name', 'is_active'],
  },
  password_policy: {
    perm: 'password_policy', title: 'passwordPolicy', display: 'password_policy_name',
    fields: [
      { name: 'password_policy_name', label: 'passwordPolicyName', type: 'text', required: true },
      { name: 'min_length', label: 'minLength', type: 'number', default: 8 },
      { name: 'require_upper', label: 'requireUpper', type: 'bool', default: 1 },
      { name: 'require_number', label: 'requireNumber', type: 'bool', default: 1 },
      { name: 'expire_days', label: 'expireDays', type: 'number', default: 90 },
    ],
    list: ['password_policy_name', 'min_length', 'require_upper', 'require_number', 'expire_days'],
  },
  email_server: {
    perm: 'e_mail_server', title: 'emailServer', display: 'email_server_name',
    fields: [
      { name: 'email_server_name', label: 'emailServerName', type: 'text', required: true },
      { name: 'mail_host', label: 'mailHost', type: 'text' },
      { name: 'mail_port', label: 'mailPort', type: 'number', default: 587 },
      { name: 'mail_username', label: 'mailUsername', type: 'text' },
      active,
    ],
    list: ['email_server_name', 'mail_host', 'mail_port', 'mail_username', 'is_active'],
  },
};

// Joined display columns: <ref resource display> exposed as e.g. company_name.
export function refAlias(field) {
  if (field.name === 'parent_id') return 'parent_name';
  if (field.name === 'chief_emp_id') return 'chief_name';
  const r = resources[field.ref];
  return r.display;
}

export function tableOf(key) {
  return resources[key].table || key;
}

// Permission keys (= original `permission[].url` values / menu keys)
export const permissionKeys = [
  'role', 'user', 'criteria', 'company', 'competency_score', 'form', 'kpi_type', 'level', 'level_group', 'organization',
  'perspective', 'position', 'position_group', 'structure', 'threshold_group', 'uom', 'grade_criteria', 'force_rank_group',
  'item', 'employee', 'assignment', 'appraisal', 'force_rank', 'force_rank_vertical', 'force_rank_horizontal',
  'force_rank_horizontal_board', 'import_salary',
  'dashboard_branch_performance', 'dashboard_overall_performance', 'dashboard_performance_comparison', 'dashboard_performance_trend',
  'report_appraisal', 'report_appraisal_by_org', 'report_appraisal_by_level', 'report_appraisal_by_job_kpi', 'report_data_entry',
  'report_kpi', 'report_performance_form', 'report_bonus_salary', 'usage_log',
  'password_policy', 'ldap', 'e_mail_server', 'data_integration', 'feedback', 'feedback_report',
];
