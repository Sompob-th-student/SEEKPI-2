-- =====================================================================================
-- SEEKPI-2 · Production database schema (SQLite)
-- Target   : SQLite 3.45+ (bundled with Node.js 22+/24 `node:sqlite`, or better-sqlite3 11+)
-- Hosting  : on-premise, single application server, database file on local SSD
-- Version  : 1.1.0 (2026-11-05)
--
-- Every connection must run (SQLite does not persist these, except journal_mode):
--   PRAGMA journal_mode = WAL;        -- readers never block the single writer
--   PRAGMA foreign_keys = ON;         -- FK enforcement is off by default in SQLite
--   PRAGMA busy_timeout = 5000;       -- wait up to 5 s for the write lock instead of failing
--   PRAGMA synchronous = NORMAL;      -- safe with WAL, much faster than FULL
--
-- Conventions
--   * snake_case, singular table names, INTEGER PRIMARY KEY AUTOINCREMENT ("id")
--   * dates 'YYYY-MM-DD' TEXT, timestamps ISO-8601 UTC TEXT ('2026-11-05T03:12:04.784Z')
--   * booleans INTEGER 0/1, JSON in TEXT (validated with json_valid where it matters)
--   * money NUMERIC rounded to 2 decimals (satang) in the service layer, THB
--   * enumerations as TEXT + CHECK (...) lists
--   * bilingual labels *_th / *_en; company_id on all master data (multi-company)
-- Domains
--   1. Security & access     2. Organization & people    3. KPI master data
--   4. Appraisal cycle & workflow   5. Assignment & evaluation   6. Force ranking
--   7. Compensation          8. Feedback                 9. System, file import & audit
-- =====================================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- =====================================================================================
-- 1. SECURITY & ACCESS
-- =====================================================================================
CREATE TABLE company (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_code    varchar(20)  NOT NULL UNIQUE,
  company_name_th varchar(200) NOT NULL,
  company_name_en varchar(200) NOT NULL,
  business_line   varchar(200),
  tax_id          varchar(13),
  is_active       INTEGER      NOT NULL DEFAULT 1,
  created_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by      INTEGER,
  updated_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by      INTEGER
);

-- Catalogue of securable menu functions (= original SEEKPI permission[].url keys)
CREATE TABLE app_permission (
  code        varchar(60)  PRIMARY KEY,               -- e.g. 'appraisal', 'report_bonus_salary'
  module      varchar(40)  NOT NULL,                  -- e.g. 'setup', 'report', 'dashboard'
  name_th     varchar(150) NOT NULL,
  name_en     varchar(150) NOT NULL,
  route_path  varchar(150) NOT NULL,
  sort_order  int          NOT NULL DEFAULT 0
);

CREATE TABLE role (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER       NOT NULL REFERENCES company(id),
  role_code   varchar(40)  NOT NULL,
  role_name   varchar(150) NOT NULL,
  data_scope  varchar(20)  NOT NULL DEFAULT 'self'
              CHECK (data_scope IN ('self', 'subordinate', 'organization', 'company', 'all')),
  is_active   INTEGER      NOT NULL DEFAULT 1,
  created_at  TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by  INTEGER,
  updated_at  TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by  INTEGER,
  UNIQUE (company_id, role_code)
);

CREATE TABLE role_permission (
  role_id         INTEGER      NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  permission_code varchar(60) NOT NULL REFERENCES app_permission(code),
  can_view        INTEGER     NOT NULL DEFAULT 0,
  can_add         INTEGER     NOT NULL DEFAULT 0,
  can_edit        INTEGER     NOT NULL DEFAULT 0,
  can_delete      INTEGER     NOT NULL DEFAULT 0,
  can_approve     INTEGER     NOT NULL DEFAULT 0,
  can_export      INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE auth_provider (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER             NOT NULL REFERENCES company(id),
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('local', 'ldap', 'oidc')),
  provider_name varchar(100)       NOT NULL,          -- 'Syntec Active Directory'
  settings      TEXT              NOT NULL DEFAULT '{}',  -- issuer, client_id, base DN ... (secrets in vault, never here)
  is_active     INTEGER            NOT NULL DEFAULT 1,
  created_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE password_policy (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id           INTEGER      NOT NULL REFERENCES company(id),
  policy_name          varchar(100) NOT NULL,
  min_length           smallint    NOT NULL DEFAULT 10 CHECK (min_length BETWEEN 8 AND 128),
  require_upper        INTEGER     NOT NULL DEFAULT 1,
  require_lower        INTEGER     NOT NULL DEFAULT 1,
  require_digit        INTEGER     NOT NULL DEFAULT 1,
  require_symbol       INTEGER     NOT NULL DEFAULT 0,
  expire_days          smallint    NOT NULL DEFAULT 90,
  history_count        smallint    NOT NULL DEFAULT 5,
  max_failed_attempts  smallint    NOT NULL DEFAULT 5,
  lockout_minutes      smallint    NOT NULL DEFAULT 30,
  is_active            INTEGER     NOT NULL DEFAULT 1,
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE app_user (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             varchar(100) NOT NULL UNIQUE,
  email                varchar(200) UNIQUE,
  first_name           varchar(100),
  last_name            varchar(100),
  employee_id          INTEGER      REFERENCES employee(id),
  auth_provider_id     INTEGER       REFERENCES auth_provider(id),
  external_subject     varchar(200),                     -- OIDC 'sub' / AD objectGUID
  password_hash        varchar(255),                     -- argon2id; NULL for SSO-only accounts
  password_changed_at  TEXT,
  failed_attempts      smallint     NOT NULL DEFAULT 0,
  locked_until         TEXT,
  preferred_language   char(2)      NOT NULL DEFAULT 'th' CHECK (preferred_language IN ('th', 'en')),
  last_login_at        TEXT,
  is_active            INTEGER      NOT NULL DEFAULT 1,
  created_at           TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by           INTEGER,
  updated_at           TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by           INTEGER,
  UNIQUE (auth_provider_id, external_subject)
);

CREATE TABLE user_role (
  user_id     INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role_id     INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES company(id),
  PRIMARY KEY (user_id, role_id, company_id)
);

CREATE TABLE user_password_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER       NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  password_hash varchar(255) NOT NULL,
  created_at    TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE refresh_token (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash   char(64)    NOT NULL UNIQUE,                -- SHA-256 of the opaque token
  user_agent   varchar(300),
  ip_address   TEXT,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- =====================================================================================
-- 2. ORGANIZATION & PEOPLE
-- =====================================================================================
CREATE TABLE org_level (                               -- Company > Division > Department > Section
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER       NOT NULL REFERENCES company(id),
  seq_no          smallint     NOT NULL,
  level_name_th   varchar(100) NOT NULL,
  level_name_en   varchar(100) NOT NULL,
  appraisal_type  TEXT NOT NULL DEFAULT 'organization' CHECK (appraisal_type IN ('organization', 'individual')),
  parent_level_id INTEGER       REFERENCES org_level(id),
  is_active       INTEGER      NOT NULL DEFAULT 1,
  created_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, seq_no)
);

CREATE TABLE organization (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER       NOT NULL REFERENCES company(id),
  org_code        varchar(30)  NOT NULL,
  org_name_th     varchar(200) NOT NULL,
  org_name_en     varchar(200) NOT NULL,
  org_level_id    INTEGER       NOT NULL REFERENCES org_level(id),
  parent_id       INTEGER       REFERENCES organization(id),
  org_path        varchar(500) NOT NULL DEFAULT '',     -- materialized path '/1/4/12/' for subtree queries
  cost_center     varchar(30),                          -- cost center / project code (reference only)
  head_employee_id INTEGER      REFERENCES employee(id),
  effective_from  TEXT         NOT NULL,
  effective_to    TEXT,
  is_active       INTEGER      NOT NULL DEFAULT 1,
  created_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by      INTEGER,
  updated_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by      INTEGER,
  UNIQUE (company_id, org_code),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_org_parent ON organization(parent_id);
CREATE INDEX ix_org_path   ON organization(org_path);

CREATE TABLE level_group (                             -- job-level band used for horizontal force rank
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id              INTEGER       NOT NULL REFERENCES company(id),
  level_group_name        varchar(150) NOT NULL,
  use_vertical_force_rank INTEGER      NOT NULL DEFAULT 0,
  is_active               INTEGER      NOT NULL DEFAULT 1,
  created_at              TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at              TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, level_group_name)
);

CREATE TABLE job_level (                               -- M1..M3, P1..P4, S1..S3
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER      NOT NULL REFERENCES company(id),
  level_code      varchar(10) NOT NULL,
  level_name      varchar(100) NOT NULL,
  level_group_id  INTEGER      NOT NULL REFERENCES level_group(id),
  seq_no          smallint    NOT NULL,
  is_active       INTEGER     NOT NULL DEFAULT 1,
  UNIQUE (company_id, level_code)
);

CREATE TABLE position_group (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id           INTEGER       NOT NULL REFERENCES company(id),
  position_group_code  varchar(20)  NOT NULL,
  position_group_name  varchar(150) NOT NULL,
  is_active            INTEGER      NOT NULL DEFAULT 1,
  created_at           TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, position_group_code)
);

CREATE TABLE position (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id        INTEGER       NOT NULL REFERENCES company(id),
  position_code     varchar(20)  NOT NULL,
  position_name_th  varchar(150) NOT NULL,
  position_name_en  varchar(150) NOT NULL,
  position_group_id INTEGER       REFERENCES position_group(id),
  effective_from    TEXT         NOT NULL,
  effective_to      TEXT,
  is_active         INTEGER      NOT NULL DEFAULT 1,
  created_at        TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, position_code)
);

CREATE TABLE employee (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id        INTEGER       NOT NULL REFERENCES company(id),
  emp_code          varchar(20)  NOT NULL,
  title_th          varchar(20),
  first_name_th     varchar(100) NOT NULL,
  last_name_th      varchar(100) NOT NULL,
  first_name_en     varchar(100),
  last_name_en      varchar(100),
  email             varchar(200),
  hire_date         TEXT,
  termination_date  TEXT,
  employment_type   varchar(20)  NOT NULL DEFAULT 'permanent'
                    CHECK (employment_type IN ('permanent', 'contract', 'probation', 'project_based')),
  -- current snapshot (history in employee_job_history)
  organization_id   INTEGER       NOT NULL REFERENCES organization(id),
  position_id       INTEGER       REFERENCES position(id),
  job_level_id      INTEGER       REFERENCES job_level(id),
  chief_employee_id INTEGER       REFERENCES employee(id),  -- line manager = default evaluator
  is_active         INTEGER      NOT NULL DEFAULT 1,
  created_at        TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by        INTEGER,
  updated_at        TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by        INTEGER,
  UNIQUE (company_id, emp_code)
);
CREATE INDEX ix_employee_org   ON employee(organization_id);
CREATE INDEX ix_employee_chief ON employee(chief_employee_id);




CREATE TABLE employee_job_history (                    -- transfers / promotions, effective-dated
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id      INTEGER      NOT NULL REFERENCES employee(id),
  organization_id  INTEGER      NOT NULL REFERENCES organization(id),
  position_id      INTEGER      REFERENCES position(id),
  job_level_id     INTEGER      REFERENCES job_level(id),
  chief_employee_id INTEGER     REFERENCES employee(id),
  effective_from   TEXT        NOT NULL,
  effective_to     TEXT,
  change_reason    varchar(50),                          -- hire, transfer, promotion, reorg
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_job_hist_emp ON employee_job_history(employee_id, effective_from DESC);

CREATE TABLE employee_salary (                          -- salary history (restricted: HR/Comp only)
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER        NOT NULL REFERENCES employee(id),
  base_salary     numeric(14,2) NOT NULL CHECK (base_salary >= 0),
  currency        char(3)       NOT NULL DEFAULT 'THB',
  effective_from  TEXT          NOT NULL,
  source          varchar(30)   NOT NULL DEFAULT 'import',  -- import, compensation, manual
  import_line_id  INTEGER       REFERENCES salary_import_line(id),
  created_at      TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by      INTEGER,
  UNIQUE (employee_id, effective_from)
);

-- =====================================================================================
-- 3. KPI MASTER DATA
-- =====================================================================================
CREATE TABLE perspective (                             -- Balanced Scorecard perspectives
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER       NOT NULL REFERENCES company(id),
  perspective_name_th varchar(100) NOT NULL,
  perspective_name_en varchar(100) NOT NULL,
  abbreviation        varchar(5)   NOT NULL,
  color_code          char(7)      NOT NULL DEFAULT '#1A90DC' CHECK (color_code GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  sort_order          smallint     NOT NULL DEFAULT 0,
  is_active           INTEGER      NOT NULL DEFAULT 1,
  UNIQUE (company_id, abbreviation)
);

CREATE TABLE kpi_type (                                -- Corporate / Functional / Individual KPI
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER       NOT NULL REFERENCES company(id),
  kpi_type_name varchar(100) NOT NULL,
  is_active     INTEGER      NOT NULL DEFAULT 1,
  UNIQUE (company_id, kpi_type_name)
);

CREATE TABLE uom (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER      NOT NULL REFERENCES company(id),
  uom_name   varchar(50) NOT NULL,
  is_date    INTEGER     NOT NULL DEFAULT 0,         -- KPI measured as a TEXT (e.g. milestone)
  decimals   smallint    NOT NULL DEFAULT 2,
  is_active  INTEGER     NOT NULL DEFAULT 1,
  UNIQUE (company_id, uom_name)
);

CREATE TABLE appraisal_structure (                     -- KPI / Competency / Deduct-score blocks
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER         NOT NULL REFERENCES company(id),
  seq_no          smallint       NOT NULL,
  structure_name  varchar(150)   NOT NULL,
  structure_type  TEXT NOT NULL CHECK (structure_type IN ('quantity', 'quality', 'deduct')),
  max_score       numeric(5,2)   NOT NULL DEFAULT 5,     -- rating scale top (target score)
  is_get_zero     INTEGER        NOT NULL DEFAULT 0,     -- deduct only: allow value_get_zero (result becomes 0)
  is_active       INTEGER        NOT NULL DEFAULT 1,
  UNIQUE (company_id, seq_no)
);

CREATE TABLE rating_scale (                            -- competency score descriptors (1..5)
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  structure_id  INTEGER       NOT NULL REFERENCES appraisal_structure(id) ON DELETE CASCADE,
  score         numeric(5,2) NOT NULL,
  label_th      varchar(150) NOT NULL,
  label_en      varchar(150) NOT NULL,
  description   text,
  UNIQUE (structure_id, score)
);

CREATE TABLE appraisal_criteria (                      -- e.g. "Standard 70:30"
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER       NOT NULL REFERENCES company(id),
  criteria_name  varchar(150) NOT NULL,
  effective_from TEXT         NOT NULL,
  is_active      INTEGER      NOT NULL DEFAULT 1,
  UNIQUE (company_id, criteria_name)
);

CREATE TABLE criteria_structure_weight (               -- weight of each structure in the final score
  criteria_id    INTEGER       NOT NULL REFERENCES appraisal_criteria(id) ON DELETE CASCADE,
  structure_id   INTEGER       NOT NULL REFERENCES appraisal_structure(id),
  job_level_group_id INTEGER   REFERENCES level_group(id),  -- optional: different weights per level group
  weight_pct     numeric(6,3) NOT NULL CHECK (weight_pct BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX ux_criteria_weight ON criteria_structure_weight(criteria_id, structure_id, IFNULL(job_level_group_id, 0));

CREATE TABLE threshold_group (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id           INTEGER       NOT NULL REFERENCES company(id),
  threshold_group_name varchar(150) NOT NULL,
  effective_from       TEXT         NOT NULL,
  is_active            INTEGER      NOT NULL DEFAULT 1,
  UNIQUE (company_id, threshold_group_name)
);

CREATE TABLE threshold_band (                          -- achievement % -> score (5-level)
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  threshold_group_id INTEGER       NOT NULL REFERENCES threshold_group(id) ON DELETE CASCADE,
  score              numeric(5,2) NOT NULL,
  achievement_from   numeric(7,3) NOT NULL,              -- inclusive
  achievement_to     numeric(7,3),                       -- exclusive, NULL = open-ended
  UNIQUE (threshold_group_id, score),
  CHECK (achievement_to IS NULL OR achievement_to > achievement_from)
);

CREATE TABLE grade_criteria (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER       NOT NULL REFERENCES company(id),
  grade_criteria_name varchar(150) NOT NULL,
  effective_from      TEXT         NOT NULL,
  is_active           INTEGER      NOT NULL DEFAULT 1,
  UNIQUE (company_id, grade_criteria_name)
);

CREATE TABLE grade_band (                              -- result score (0-100) -> grade, raise %, bonus months
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_criteria_id  INTEGER       NOT NULL REFERENCES grade_criteria(id) ON DELETE CASCADE,
  grade              varchar(5)   NOT NULL,
  sort_order         smallint     NOT NULL,              -- 1 = best
  score_from         numeric(7,3) NOT NULL,
  score_to           numeric(7,3) NOT NULL,
  salary_raise_pct   numeric(6,3) NOT NULL DEFAULT 0,
  bonus_months       numeric(5,2) NOT NULL DEFAULT 0,
  UNIQUE (grade_criteria_id, grade),
  CHECK (score_to >= score_from)
);

CREATE TABLE force_rank_group (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER       NOT NULL REFERENCES company(id),
  fr_group_name   varchar(150) NOT NULL,
  effective_from  TEXT         NOT NULL,
  is_active       INTEGER      NOT NULL DEFAULT 1,
  UNIQUE (company_id, fr_group_name)
);

CREATE TABLE force_rank_quota (                        -- bell-curve distribution, sums to 100
  force_rank_group_id INTEGER       NOT NULL REFERENCES force_rank_group(id) ON DELETE CASCADE,
  grade               varchar(5)   NOT NULL,
  quota_pct           numeric(6,3) NOT NULL CHECK (quota_pct BETWEEN 0 AND 100),
  PRIMARY KEY (force_rank_group_id, grade)
);

CREATE TABLE appraisal_item (                          -- KPI / competency dictionary
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER             NOT NULL REFERENCES company(id),
  item_code        varchar(30)        NOT NULL,
  item_name_th     varchar(300)       NOT NULL,
  item_name_en     varchar(300)       NOT NULL,
  definition       text,                                -- how it is measured, data owner
  structure_id     INTEGER             NOT NULL REFERENCES appraisal_structure(id),
  perspective_id   INTEGER             REFERENCES perspective(id),
  kpi_type_id      INTEGER             REFERENCES kpi_type(id),
  uom_id           INTEGER             REFERENCES uom(id),
  value_direction  TEXT    NOT NULL DEFAULT 'higher_better' CHECK (value_direction IN ('higher_better', 'lower_better', 'target_exact')),
  frequency        TEXT NOT NULL DEFAULT 'Yearly' CHECK (frequency IN ('Monthly', 'Quarterly', 'Yearly')),  -- number of target/actual periods: 12 / 4 / 1
  is_sum_up        INTEGER NOT NULL DEFAULT 0,          -- original flag Sum Up: SUM UP adds subordinate actuals (else average)
  aggregation      TEXT NOT NULL DEFAULT 'average' CHECK (aggregation IN ('sum', 'average', 'last', 'max', 'min', 'formula')),  -- how period scores roll up to the KPI score (default: average)
  formula          text,                                 -- expression when aggregation = 'formula'
  data_source      varchar(30)  NOT NULL DEFAULT 'manual' CHECK (data_source IN ('manual', 'excel_import', 'calculated')),
  max_achievement_pct numeric(7,3) NOT NULL DEFAULT 150,
  effective_from   TEXT               NOT NULL,
  effective_to     TEXT,
  is_active        INTEGER            NOT NULL DEFAULT 1,
  created_at       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by       INTEGER,
  updated_at       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by       INTEGER,
  UNIQUE (company_id, item_code)
);
CREATE INDEX ix_item_structure ON appraisal_item(structure_id);

-- =====================================================================================
-- 4. APPRAISAL CYCLE & WORKFLOW
-- =====================================================================================
CREATE TABLE appraisal_period (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER       NOT NULL REFERENCES company(id),
  fiscal_year   smallint     NOT NULL,
  period_type   TEXT  NOT NULL DEFAULT 'annual' CHECK (period_type IN ('annual', 'semi_annual', 'quarterly', 'monthly')),
  period_no     smallint     NOT NULL DEFAULT 1,         -- 1 for annual, 1-2 semi, 1-4 quarter, 1-12 month
  period_name   varchar(100) NOT NULL,
  start_date    TEXT         NOT NULL,
  end_date      TEXT         NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'evaluating', 'calibrating', 'closed')),
  UNIQUE (company_id, fiscal_year, period_type, period_no),
  CHECK (end_date >= start_date)
);

CREATE TABLE appraisal_form (                          -- one evaluation cycle configuration
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER       NOT NULL REFERENCES company(id),
  period_id           INTEGER       NOT NULL REFERENCES appraisal_period(id),
  form_name           varchar(200) NOT NULL,
  criteria_id         INTEGER       NOT NULL REFERENCES appraisal_criteria(id),
  threshold_group_id  INTEGER       NOT NULL REFERENCES threshold_group(id),
  grade_criteria_id   INTEGER       NOT NULL REFERENCES grade_criteria(id),
  force_rank_group_id INTEGER       REFERENCES force_rank_group(id),
  data_entry_from     TEXT,
  data_entry_to       TEXT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'evaluating', 'calibrating', 'closed')),
  locked_at           TEXT,
  created_at          TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by          INTEGER,
  updated_at          TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by          INTEGER,
  UNIQUE (company_id, form_name)
);

-- Stages per structure kind, as in the original SEE KPI (Appraisal > Status):
--   kpi:        APPROVE_ITEM, REJECT_ITEM, SAVE_DRAFT_ACTUAL, REVIEW_ACTUAL, APPROVE_ACTUAL, REJECT_ACTUAL, ADMIN_APPROVE_ACTUAL,
--               ADMIN_REJECT_ACTUAL, ADMIN_REJECT_ITEM, RE_WORK, END_TO_VERTICAL, END_TO_HORIZONTAL
--   competency: APPRAISAL, SAVE_DRAFT_APPRAISAL, SUBMIT, APPROVE, REJECT, ADMIN_REJECT_ITEM, RE_WORK, END_TO_VERTICAL, END_TO_HORIZONTAL
-- Transitions and actor rules: see seekpi-2/server/workflow.js (reference implementation).
CREATE TABLE workflow_stage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER       NOT NULL REFERENCES company(id),
  structure_kind TEXT        NOT NULL DEFAULT 'kpi' CHECK (structure_kind IN ('kpi', 'competency')),
  stage_code    varchar(30)  NOT NULL,
  stage_name_th varchar(100) NOT NULL,
  stage_name_en varchar(100) NOT NULL,
  seq_no        smallint     NOT NULL,
  allow_edit_target INTEGER  NOT NULL DEFAULT 0,
  allow_edit_actual INTEGER  NOT NULL DEFAULT 0,          -- results may be entered at this stage
  send_email    INTEGER      NOT NULL DEFAULT 0,          -- original: is_email
  due_days      INTEGER,                                  -- original: due_date
  is_final      INTEGER      NOT NULL DEFAULT 0,
  UNIQUE (company_id, structure_kind, stage_code)
);

CREATE TABLE workflow_transition (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_stage_id   INTEGER      NOT NULL REFERENCES workflow_stage(id),
  to_stage_id     INTEGER      NOT NULL REFERENCES workflow_stage(id),
  action_code     varchar(30) NOT NULL,                  -- submit, accept, reject, evaluate, approve, reopen
  actor_rule      varchar(20) NOT NULL CHECK (actor_rule IN ('owner', 'evaluator', 'admin')),
  require_comment INTEGER     NOT NULL DEFAULT 0,
  notify_template varchar(60),
  UNIQUE (from_stage_id, action_code)
);

-- =====================================================================================
-- 5. ASSIGNMENT & EVALUATION
-- =====================================================================================
CREATE TABLE assignment (                              -- a scorecard for one employee or one organization in one form
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id                INTEGER          NOT NULL REFERENCES appraisal_form(id),
  assignment_kind        TEXT NOT NULL CHECK (assignment_kind IN ('corporate', 'organization', 'individual')),
  employee_id            INTEGER          REFERENCES employee(id),
  organization_id        INTEGER          NOT NULL REFERENCES organization(id),  -- employee's org at assignment time
  job_level_id           INTEGER          REFERENCES job_level(id),             -- snapshot for horizontal ranking
  parent_assignment_id   INTEGER          REFERENCES assignment(id),            -- cascade: corporate -> org -> individual
  evaluator_employee_id  INTEGER          REFERENCES employee(id),
  approver_employee_id   INTEGER          REFERENCES employee(id),
  assigned_date          TEXT,
  end_date               TEXT,
  status_summary         varchar(60),                     -- least advanced structure stage, for lists
  base_score             numeric(7,3),                    -- before deductions
  deduct_total           numeric(7,3),
  is_get_zero            INTEGER         NOT NULL DEFAULT 0,
  result_score           numeric(7,3),                    -- Total Score 0..100 = sum(structure score100 x structure weight%) - deductions
  result_score5          numeric(7,3),                    -- same on the 0..5 scale (shown as "71.20 (3.56) / 100.00 (5.00)")
  system_grade           varchar(5),                      -- from grade_band
  force_rank_grade       varchar(5),                      -- from latest applied force_rank_run
  final_grade            varchar(5),                      -- after calibration / approval
  remark                 text,
  submitted_at           TEXT,
  approved_at            TEXT,
  row_version            int             NOT NULL DEFAULT 1,  -- optimistic locking
  created_at             TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by             INTEGER,
  updated_at             TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by             INTEGER,
  CHECK ((assignment_kind = 'individual') = (employee_id IS NOT NULL))
);
CREATE UNIQUE INDEX ux_assignment_individual ON assignment(form_id, employee_id) WHERE assignment_kind = 'individual';
CREATE UNIQUE INDEX ux_assignment_org        ON assignment(form_id, organization_id, assignment_kind) WHERE assignment_kind <> 'individual';
CREATE INDEX ix_assignment_form       ON assignment(form_id, status_summary);
CREATE INDEX ix_assignment_evaluator  ON assignment(evaluator_employee_id);

-- ACTION TO: ordered chain of assessors / approvers of one scorecard (original emp_detail.action_to)
CREATE TABLE assessor_chain (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id      INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  seq_no             smallint NOT NULL,
  position_group_id  INTEGER REFERENCES position_group(id),
  employee_id        INTEGER NOT NULL REFERENCES employee(id),
  position_id        INTEGER REFERENCES position(id),
  organization_id    INTEGER REFERENCES organization(id),
  UNIQUE (assignment_id, seq_no)
);

CREATE TABLE assignment_item (                         -- one KPI/competency line on a scorecard
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id           INTEGER       NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  item_id                 INTEGER       NOT NULL REFERENCES appraisal_item(id),
  parent_assignment_item_id INTEGER     REFERENCES assignment_item(id),  -- KPI deployed from the parent scorecard
  is_deployed             INTEGER      NOT NULL DEFAULT 0,         -- cascaded down to subordinates
  is_adopted              INTEGER      NOT NULL DEFAULT 0,         -- result taken from parent's actual
  seq_no                  smallint     NOT NULL DEFAULT 0,
  weight_pct              numeric(6,3) NOT NULL CHECK (weight_pct BETWEEN 0 AND 100),
  target_value            numeric(18,4),
  target_text             varchar(300),                               -- qualitative target / milestone description
  threshold_override      TEXT,                                      -- item-specific bands, else form's threshold group
  -- deduct structure only (original SEEKPI STT03): over = max(0, actual - max_value); deduct = over x unit_deduct_score
  max_value               numeric(18,4),
  unit_deduct_score       numeric(7,3),
  value_get_zero          numeric(18,4),
  deduct_score            numeric(7,3),
  -- Waive (original switch on the appraisal screen): line left out of the score, other weights rescaled to 100%
  is_waived               INTEGER      NOT NULL DEFAULT 0,
  waive_reason            text,
  waived_by               INTEGER      REFERENCES app_user(id),
  -- results (rolled up from assignment_item_period / evaluator ratings)
  actual_value            numeric(18,4),
  achievement_pct         numeric(7,3),
  self_score              numeric(5,2),
  score                   numeric(5,2),
  weighted_score          numeric(7,3),
  evaluator_comment       text,
  UNIQUE (assignment_id, item_id)
);
CREATE INDEX ix_assign_item_item ON assignment_item(item_id);

-- Target levels and actual of every period of a KPI line (original Assignment screen: 5 coloured levels per period).
-- period_no: 1..12 (Monthly), 1..4 (Quarterly) or 1 (Yearly), following appraisal_item.frequency.
-- Period score = highest level k the actual reaches (l5 >= l1: actual >= lk; l5 < l1: actual <= lk); worse than l1 = 0.
CREATE TABLE assignment_item_period (
  assignment_item_id INTEGER       NOT NULL REFERENCES assignment_item(id) ON DELETE CASCADE,
  period_no          smallint      NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  l1 numeric(18,4), l2 numeric(18,4), l3 numeric(18,4), l4 numeric(18,4), l5 numeric(18,4),   -- l3 = target
  actual_value       numeric(18,4),
  score              numeric(5,2),                                      -- 0..5, computed
  reject_reason      text,
  source             varchar(30)   NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'excel_import', 'calculated', 'adopted', 'sum_up')),
  entered_by         INTEGER       REFERENCES app_user(id),
  entered_at         TEXT,
  PRIMARY KEY (assignment_item_id, period_no)
);

-- One row per structure on a scorecard: weight (Appraisal Criteria x Level Group), current workflow stage and score.
CREATE TABLE assignment_structure (
  assignment_id   INTEGER       NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  structure_id    INTEGER       NOT NULL REFERENCES appraisal_structure(id),
  weight_pct      numeric(6,3)  NOT NULL CHECK (weight_pct BETWEEN 0 AND 100),
  stage_id        INTEGER       NOT NULL REFERENCES workflow_stage(id),
  assigned_date   TEXT,
  end_date        TEXT,
  score100        numeric(7,3),                          -- sum of line weight scores (score / 5 x weight%)
  score5          numeric(7,3),
  is_complete     INTEGER       NOT NULL DEFAULT 0,      -- every line has a score
  calculated_at   TEXT,
  PRIMARY KEY (assignment_id, structure_id)
);

CREATE TABLE assignment_stage_log (                    -- immutable workflow history (per structure)
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER      NOT NULL REFERENCES assignment(id),
  structure_id  INTEGER      NOT NULL REFERENCES appraisal_structure(id),
  from_stage_id INTEGER      REFERENCES workflow_stage(id),
  to_stage_id   INTEGER      NOT NULL REFERENCES workflow_stage(id),
  action_code   varchar(30) NOT NULL,
  actor_user_id INTEGER      NOT NULL REFERENCES app_user(id),
  comment       text,
  acted_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_stage_log_assignment ON assignment_stage_log(assignment_id, acted_at);

CREATE TABLE action_plan (                             -- improvement / delivery plan per KPI line
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_item_id INTEGER       NOT NULL REFERENCES assignment_item(id) ON DELETE CASCADE,
  phase              varchar(100),
  task_name          varchar(300) NOT NULL,
  responsible_employee_id INTEGER  REFERENCES employee(id),
  plan_start         TEXT,
  plan_end           TEXT,
  actual_start       TEXT,
  actual_end         TEXT,
  progress_pct       numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  status             TEXT  NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done', 'cancelled')),
  created_at         TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- =====================================================================================
-- 6. FORCE RANKING (calibration)
-- =====================================================================================
CREATE TABLE force_rank_run (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id             INTEGER          NOT NULL REFERENCES appraisal_form(id),
  force_rank_group_id INTEGER          NOT NULL REFERENCES force_rank_group(id),
  rank_mode           TEXT NOT NULL CHECK (rank_mode IN ('company', 'vertical', 'horizontal', 'horizontal_board')),
  status              TEXT      NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'applied', 'cancelled')),
  run_by              INTEGER          NOT NULL REFERENCES app_user(id),
  run_at              TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  applied_by          INTEGER          REFERENCES app_user(id),
  applied_at          TEXT,
  note                text
);

CREATE TABLE force_rank_result (
  run_id           INTEGER       NOT NULL REFERENCES force_rank_run(id) ON DELETE CASCADE,
  assignment_id    INTEGER       NOT NULL REFERENCES assignment(id),
  group_key        varchar(150) NOT NULL,                -- org code / level group / 'COMPANY'
  rank_no          int          NOT NULL,
  is_tie           INTEGER      NOT NULL DEFAULT 0,       -- equal score split across a grade boundary
  percentile       numeric(6,3) NOT NULL,
  result_score     numeric(7,3) NOT NULL,
  system_grade     varchar(5),
  force_rank_grade varchar(5)   NOT NULL,
  manual_override_grade varchar(5),                      -- calibration committee decision
  override_reason  text,
  PRIMARY KEY (run_id, assignment_id)
);

-- =====================================================================================
-- 7. COMPENSATION (restricted data)
-- =====================================================================================
CREATE TABLE salary_import_batch (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER        NOT NULL REFERENCES company(id),
  file_name    varchar(255)  NOT NULL,
  file_sha256  char(64)      NOT NULL,
  effective_from TEXT        NOT NULL,
  row_count    int           NOT NULL DEFAULT 0,
  error_count  int           NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'validated', 'applied', 'failed')),
  uploaded_by  INTEGER        NOT NULL REFERENCES app_user(id),
  uploaded_at  TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  applied_at   TEXT
);

CREATE TABLE salary_import_line (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id     INTEGER        NOT NULL REFERENCES salary_import_batch(id) ON DELETE CASCADE,
  line_no      int           NOT NULL,
  emp_code     varchar(20)   NOT NULL,
  employee_id  INTEGER        REFERENCES employee(id),    -- resolved during validation
  base_salary  numeric(14,2),
  error_message varchar(300),
  UNIQUE (batch_id, line_no)
);


CREATE TABLE compensation_result (                     -- merit increase & bonus per assignment
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id      INTEGER        NOT NULL UNIQUE REFERENCES assignment(id),
  grade_used         varchar(5)    NOT NULL,
  base_salary        numeric(14,2) NOT NULL,
  raise_pct          numeric(6,3)  NOT NULL DEFAULT 0,
  raise_amount       numeric(14,2) NOT NULL DEFAULT 0,
  extra_raise_amount numeric(14,2) NOT NULL DEFAULT 0,
  new_salary         numeric(14,2) GENERATED ALWAYS AS (base_salary + raise_amount + extra_raise_amount) STORED,
  bonus_months       numeric(5,2)  NOT NULL DEFAULT 0,
  bonus_amount       numeric(14,2) NOT NULL DEFAULT 0,
  extra_bonus_amount numeric(14,2) NOT NULL DEFAULT 0,
  final_bonus        numeric(14,2) GENERATED ALWAYS AS (bonus_amount + extra_bonus_amount) STORED,
  status             varchar(20)   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'exported')),
  approved_by        INTEGER        REFERENCES app_user(id),
  approved_at        TEXT,
  created_at         TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- =====================================================================================
-- 8. FEEDBACK (continuous / 360)
-- =====================================================================================
CREATE TABLE feedback (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id          INTEGER       REFERENCES appraisal_form(id),
  from_user_id     INTEGER       NOT NULL REFERENCES app_user(id),
  to_employee_id   INTEGER       NOT NULL REFERENCES employee(id),
  assignment_item_id INTEGER     REFERENCES assignment_item(id),  -- optional link to a KPI line
  topic            varchar(200),
  rating           smallint     CHECK (rating BETWEEN 1 AND 5),
  comment          text         NOT NULL,
  visibility       varchar(20)  NOT NULL DEFAULT 'manager' CHECK (visibility IN ('private', 'manager', 'employee', 'public')),
  is_unread        INTEGER      NOT NULL DEFAULT 1,
  created_at       TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);
CREATE INDEX ix_feedback_to ON feedback(to_employee_id, created_at DESC);

-- =====================================================================================
-- 9. SYSTEM, INTEGRATION & AUDIT
-- =====================================================================================
CREATE TABLE email_server (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER       NOT NULL REFERENCES company(id),
  server_name     varchar(100) NOT NULL,
  mail_host       varchar(200) NOT NULL,
  mail_port       int          NOT NULL DEFAULT 587,
  use_tls         INTEGER      NOT NULL DEFAULT 1,
  mail_username   varchar(200),
  secret_ref      varchar(200),                          -- key in vault, never the password itself
  from_address    varchar(200) NOT NULL,
  is_active       INTEGER      NOT NULL DEFAULT 1
);

CREATE TABLE notification (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER       NOT NULL REFERENCES app_user(id),
  channel       varchar(20)  NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'teams', 'line')),
  template_code varchar(60)  NOT NULL,
  title         varchar(200) NOT NULL,
  body          text,
  link_path     varchar(300),
  sent_at       TEXT,
  read_at       TEXT,
  created_at    TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_notification_user ON notification(user_id) WHERE read_at IS NULL;

CREATE TABLE integration_job (                         -- scheduled file imports (employees, org, KPI actuals from Excel/CSV drop folder)
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER       NOT NULL REFERENCES company(id),
  job_code       varchar(50)  NOT NULL,                   -- employee_import, org_import, kpi_actual_import
  direction      varchar(10)  NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  schedule_cron  varchar(50),
  settings       TEXT        NOT NULL DEFAULT '{}',
  is_active      INTEGER      NOT NULL DEFAULT 1,
  UNIQUE (company_id, job_code)
);

CREATE TABLE integration_run (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        INTEGER      NOT NULL REFERENCES integration_job(id),
  started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at   TEXT,
  status        varchar(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  rows_read     int         NOT NULL DEFAULT 0,
  rows_written  int         NOT NULL DEFAULT 0,
  error_detail  text
);

CREATE TABLE attachment (                              -- evidence files (stored in object storage)
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  varchar(40)  NOT NULL,                    -- assignment_item, action_plan, feedback
  entity_id    INTEGER       NOT NULL,
  file_name    varchar(255) NOT NULL,
  content_type varchar(100) NOT NULL,
  size_bytes   INTEGER       NOT NULL CHECK (size_bytes > 0),
  storage_key  varchar(400) NOT NULL,                    -- relative path under the on-prem file store (data/files/...)
  sha256       char(64)     NOT NULL,
  uploaded_by  INTEGER       NOT NULL REFERENCES app_user(id),
  uploaded_at  TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_attachment_entity ON attachment(entity_type, entity_id);

CREATE TABLE system_setting (
  company_id  INTEGER      NOT NULL REFERENCES company(id),
  setting_key varchar(80) NOT NULL,
  value       TEXT       NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by  INTEGER,
  PRIMARY KEY (company_id, setting_key)
);

-- Background job queue (replaces Redis/BullMQ on a single on-prem server).
-- Workers claim a job with: UPDATE job SET status='running', locked_by=?, started_at=now
--   WHERE id = (SELECT id FROM job WHERE status='queued' AND run_after <= now ORDER BY priority, id LIMIT 1) RETURNING *;
CREATE TABLE job (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type     varchar(40) NOT NULL,                     -- recalc_assignment, recalc_form, send_email, import_file, export_report
  payload      TEXT        NOT NULL DEFAULT '{}' CHECK (json_valid(payload)),
  status       TEXT        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  priority     INTEGER     NOT NULL DEFAULT 5,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  max_attempts INTEGER     NOT NULL DEFAULT 3,
  run_after    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  locked_by    varchar(60),
  last_error   TEXT,
  created_by   INTEGER     REFERENCES app_user(id),
  created_at   TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX ix_job_queue ON job(status, priority, run_after) WHERE status = 'queued';

-- Usage / audit log (original: report/usage_log). Append-only (see triggers); archived yearly to seekpi-audit-YYYY.db.
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_id      INTEGER,
  company_id   INTEGER,
  page_code    varchar(60),
  action       varchar(40)  NOT NULL,                   -- login, view, add, edit, delete, export, approve
  entity_type  varchar(40),
  entity_id    varchar(40),
  before_data  TEXT,
  after_data   TEXT,
  ip_address   TEXT,
  request_id   TEXT,
  CHECK (before_data IS NULL OR json_valid(before_data)),
  CHECK (after_data IS NULL OR json_valid(after_data))
);
CREATE INDEX ix_audit_user_time ON audit_log(user_id, occurred_at DESC);


-- ---------- updated_at triggers --------------------------------------------------------
CREATE TRIGGER trg_company_touch AFTER UPDATE ON company FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE company SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_role_touch AFTER UPDATE ON role FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE role SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_auth_provider_touch AFTER UPDATE ON auth_provider FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE auth_provider SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_password_policy_touch AFTER UPDATE ON password_policy FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE password_policy SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_app_user_touch AFTER UPDATE ON app_user FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE app_user SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_org_level_touch AFTER UPDATE ON org_level FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE org_level SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_organization_touch AFTER UPDATE ON organization FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE organization SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_level_group_touch AFTER UPDATE ON level_group FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE level_group SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_position_group_touch AFTER UPDATE ON position_group FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE position_group SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_position_touch AFTER UPDATE ON position FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE position SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_employee_touch AFTER UPDATE ON employee FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE employee SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_appraisal_item_touch AFTER UPDATE ON appraisal_item FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE appraisal_item SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_appraisal_form_touch AFTER UPDATE ON appraisal_form FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE appraisal_form SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_assignment_touch AFTER UPDATE ON assignment FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE assignment SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_action_plan_touch AFTER UPDATE ON action_plan FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE action_plan SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_compensation_result_touch AFTER UPDATE ON compensation_result FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE compensation_result SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;
CREATE TRIGGER trg_system_setting_touch AFTER UPDATE ON system_setting FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE system_setting SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid; END;

-- ---------- Integrity rules that need cross-row checks --------------------------------
-- The KPI / competency lines of a structure must total 100% before that structure moves to another stage.
-- Deduct structures carry no weight and are excluded.
-- A waived reason is required when a line is waived.
CREATE TRIGGER trg_waive_reason BEFORE UPDATE OF is_waived ON assignment_item FOR EACH ROW
WHEN NEW.is_waived = 1 AND COALESCE(TRIM(NEW.waive_reason), '') = ''
BEGIN SELECT RAISE(ABORT, 'a reason is required to waive a KPI'); END;

CREATE TRIGGER trg_structure_weights BEFORE UPDATE OF stage_id ON assignment_structure FOR EACH ROW
WHEN NEW.stage_id IS NOT OLD.stage_id
 AND (SELECT structure_type FROM appraisal_structure WHERE id = NEW.structure_id) <> 'deduct'
 AND abs(COALESCE((SELECT sum(ai.weight_pct) FROM assignment_item ai JOIN appraisal_item i ON i.id = ai.item_id
                   WHERE ai.assignment_id = NEW.assignment_id AND i.structure_id = NEW.structure_id), 0) - 100) > 0.0001
BEGIN SELECT RAISE(ABORT, 'the lines of this structure must total 100% before changing its stage'); END;

-- Structure weights of one Level Group under one criteria must total 100 (or 0 = not used).
CREATE TRIGGER trg_criteria_weight_total AFTER INSERT ON criteria_structure_weight FOR EACH ROW
WHEN (SELECT sum(weight_pct) FROM criteria_structure_weight
       WHERE criteria_id = NEW.criteria_id AND IFNULL(job_level_group_id, 0) = IFNULL(NEW.job_level_group_id, 0)) > 100.0001
BEGIN SELECT RAISE(ABORT, 'structure weights of a level group cannot exceed 100'); END;

-- Workflow history and audit log are append-only.
CREATE TRIGGER trg_stage_log_no_update BEFORE UPDATE ON assignment_stage_log
BEGIN SELECT RAISE(ABORT, 'assignment_stage_log is append-only'); END;
CREATE TRIGGER trg_stage_log_no_delete BEFORE DELETE ON assignment_stage_log
BEGIN SELECT RAISE(ABORT, 'assignment_stage_log is append-only'); END;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
-- Yearly archiving (maintenance script, outside business hours):
--   ATTACH 'seekpi-audit-2026.db' AS arc; CREATE TABLE arc.audit_log AS SELECT * FROM audit_log WHERE occurred_at < '2027-01-01';
--   then DELETE the archived rows (the delete trigger below is dropped and recreated by that script only).
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log rows are removed only by the yearly archive script'); END;

-- ---------- Reporting views -----------------------------------------------------------
CREATE VIEW v_assignment_summary AS
SELECT a.id AS assignment_id, f.id AS form_id, f.form_name, p.fiscal_year,
       a.assignment_kind, e.emp_code,
       TRIM(COALESCE(e.first_name_th, '') || ' ' || COALESCE(e.last_name_th, '')) AS emp_name_th,
       o.org_code, o.org_name_th, jl.level_code, lg.level_group_name, pos.position_name_th,
       a.status_summary, a.base_score, a.deduct_total, a.result_score, a.result_score5, a.system_grade, a.force_rank_grade,
       COALESCE(a.final_grade, a.force_rank_grade, a.system_grade) AS effective_grade
  FROM assignment a
  JOIN appraisal_form f    ON f.id = a.form_id
  JOIN appraisal_period p  ON p.id = f.period_id
  JOIN organization o      ON o.id = a.organization_id
  LEFT JOIN employee e     ON e.id = a.employee_id
  LEFT JOIN job_level jl   ON jl.id = a.job_level_id
  LEFT JOIN level_group lg ON lg.id = jl.level_group_id
  LEFT JOIN position pos   ON pos.id = e.position_id;

CREATE VIEW v_kpi_trend AS
SELECT ai.item_id, i.item_code, i.frequency, a.form_id, p.period_no,
       avg(p.l3) AS avg_target, avg(p.actual_value) AS avg_actual, avg(p.score) AS avg_score, count(*) AS n
  FROM assignment_item_period p
  JOIN assignment_item ai ON ai.id = p.assignment_item_id
  JOIN assignment a       ON a.id = ai.assignment_id
  JOIN appraisal_item i   ON i.id = ai.item_id
 GROUP BY ai.item_id, i.item_code, i.frequency, a.form_id, p.period_no;

-- ---------- Reference data: permission catalogue (matches the SEEKPI menu) ------------
INSERT INTO app_permission (code, module, name_th, name_en, route_path, sort_order) VALUES
 ('role','manage_user','บทบาท','Role','/manage/role',10),
 ('user','manage_user','ผู้ใช้งาน','Users','/manage/user',11),
 ('criteria','setup','เกณฑ์การประเมิน','Appraisal Criteria','/setup/criteria',20),
 ('company','setup','บริษัท','Company','/setup/company',21),
 ('competency_score','setup','คะแนน Competency','Competency Score','/setup/competency_score',22),
 ('form','setup','แบบฟอร์ม','Form','/setup/form',23),
 ('kpi_type','setup','ประเภท KPI','KPI Type','/setup/kpi',24),
 ('level','setup','ระดับ','Level','/setup/level',25),
 ('level_group','setup','กลุ่มระดับ','Level Group','/setup/level_group',26),
 ('organization','setup','หน่วยงาน','Organization','/setup/organization',27),
 ('perspective','setup','มุมมอง','Perspective','/setup/perspective',28),
 ('position','setup','ตำแหน่ง','Position','/setup/position',29),
 ('position_group','setup','กลุ่มตำแหน่ง','Position Group','/setup/position_group',30),
 ('structure','setup','โครงสร้าง','Structure','/setup/structure',31),
 ('threshold_group','setup','กลุ่มเกณฑ์คะแนน','Threshold Group','/setup/threshold_group',32),
 ('uom','setup','หน่วยวัด','UOM','/setup/uom',33),
 ('grade_criteria','setup','เกณฑ์เกรด','Grade Criteria','/setup/grade_criteria',34),
 ('force_rank_group','setup','กลุ่ม Force Rank','Force Rank Group','/setup/force_rank_group',35),
 ('item','kpi','หัวข้อประเมิน','Appraisal Item','/appraisal_item',40),
 ('employee','people','พนักงาน','Employee','/employee',41),
 ('assignment','appraisal','การมอบหมาย','Assignment','/assignment/individual',42),
 ('appraisal','appraisal','ประเมิน','Appraisal','/appraisal',43),
 ('force_rank','calibration','Force Rank','Force Rank','/force_rank',50),
 ('force_rank_vertical','calibration','Force Rank ตามสายงาน','Vertical Force Rank','/force_rank_vertical',51),
 ('force_rank_horizontal','calibration','Force Rank ตามระดับงาน','Horizontal Force Rank','/force_rank_horizontal',52),
 ('force_rank_horizontal_board','calibration','Force Rank (Board)','Horizontal Force Rank (Board)','/force_rank_horizontal_board',53),
 ('import_salary','compensation','นำเข้าข้อมูลเงินเดือน','Import Salary','/import_salary',60),
 ('dashboard_branch_performance','dashboard','ประสิทธิภาพของสาขา','Branch Performance','/dashboard/branch_performance',70),
 ('dashboard_overall_performance','dashboard','ประสิทธิภาพโดยรวม','Overall Performance','/dashboard/overall_performance',71),
 ('dashboard_performance_comparison','dashboard','เปรียบเทียบประสิทธิภาพ','Performance Comparison','/dashboard/performance_comparison',72),
 ('dashboard_performance_trend','dashboard','แนวโน้มประสิทธิภาพ','Performance Trend','/dashboard/dashboard_performance_trend',73),
 ('report_appraisal','report','รายงานสรุปผลการประเมิน','Appraisal Summary','/report/appraisal',80),
 ('report_appraisal_by_org','report','สรุปผลตามหน่วยงาน','Appraisal by Org','/report/appraisalbyorg',81),
 ('report_appraisal_by_level','report','สรุปผลตามระดับ','Appraisal by Level','/report/appraisalbylevel',82),
 ('report_appraisal_by_job_kpi','report','สรุปผลตาม Job KPI','Appraisal by Job KPI','/report/appraisalbyjobkpi',83),
 ('report_data_entry','report','สถานะการบันทึกข้อมูล','Data Entry Status','/report/data_entry',84),
 ('report_kpi','report','สรุป KPI','KPI Summary','/report/kpi',85),
 ('report_performance_form','report','แบบฟอร์มผลการปฏิบัติงาน','Performance Form','/report/performance_form',86),
 ('report_bonus_salary','report','โบนัสและขึ้นเงินเดือน','Bonus & Salary','/report/bonussalary',87),
 ('usage_log','report','ประวัติการใช้งาน','Usage Log','/report/usage_log',88),
 ('password_policy','setting','นโยบายรหัสผ่าน','Password Policy','/setting/password_policy',90),
 ('ldap','setting','LDAP / SSO','LDAP / SSO','/setting/LDAP',91),
 ('e_mail_server','setting','E-mail Server','E-mail Server','/setting/e_mail_server',92),
 ('data_integration','setting','เชื่อมต่อข้อมูล','Data Integration','/setting/data_integration',93),
 ('feedback','feedback','Feedback','Feedback','/feedback',100),
 ('feedback_report','feedback','รายงาน Feedback','Feedback Report','/feedback_report',101);
