# SEEKPI: reverse-engineering spec (REA)

Source: `https://kpi.syntec.co.th/seekpi/` (production, original app)
Tool: REA `rea-agents@6.8.0` (https://github.com/morluto/rea), run on a portable Node 24.22.2
Date: 2026-11-05

## How it was captured

```
chrome --remote-debugging-port=9222 --user-data-dir=<dedicated profile> https://kpi.syntec.co.th/seekpi/login
rea list-browser-targets http://127.0.0.1:9222 --json
rea analyze-web-bundle   http://127.0.0.1:9222 <target> --json              -> rea-bundle-summary.json
rea inspect-web-page     http://127.0.0.1:9222 <target> --include-script-sources --json
rea export-web-scripts   <inspect.json> <outdir>                            -> main.b9e450c5.chunk.js
```

Static extraction from the exported bundle produced `i18n.json` (538 EN / 532 TH labels) and `columns.json` (32 table column sets).
Limitation: only the unauthenticated login page was observed live. No signed-in session was captured, so runtime API response
values and screen layouts behind the login are inferred from the bundle code, not observed.

## Original architecture (observed)

| Layer | Finding |
|---|---|
| Frontend | React (Create React App), Material-UI v4, material-table, Redux + react-redux-i18n, react-router, idle timer 30 min |
| Base path | `PUBLIC_URL=/seekpi` |
| API | `https://kpi.syntec.co.th/syntec_api/public/api` (Laravel-style `public/api`), one axios instance per module |
| Auth | `POST /login {username,password,language}` -> `{token, user, permission[]}` stored in `localStorage` (`authToken`, `userInfo`, `userPermissions`) |
| Permissions | `permission[] = {url, is_view, is_add, is_edit, is_delete}`; the menu shows an item only when `is_view === 1` for its key |
| i18n | `en`, `th` |

API modules (axios `baseURL`): company, password_policy, ldap_server, email_server, level, org, position, position_group, user,
level/org, criteria, level/emp, structure, structure_type, role, value_list, item, form, uom, kpi_type, perspective, employee,
level_group, dropdown, competency_score, adjust, assignment, appraisal, appraisal/dropdown, threshold_group, usage_log, report,
dashboard_overall_performace, dashboard_performance_comparison, dashboard_branch_performance, competency_score_group,
force_rank_horizon, force_rank_vertical, force_rank_group, grade_criteria.

## Menu (sidebar, in original order)

- Home `/`
- Manage User: Role `/manage/role`, Users `/manage/user`
- Setup Data: Appraisal Criteria, Company, Competency Score, Form, KPI Type, Level, Level Group, Organization, Perspective,
  Position, Position Group, Structure, Threshold Group, UOM, Grade Criteria, Force Rank Group (`/setup/*`)
- Appraisal Item `/appraisal_item`
- Employee `/employee` (+ `/employee/:id|add`)
- Assignment: Individual `/assignment/individual`, Corporate `/assignment/corporate`
- Appraisal `/appraisal`
- Force Rank `/force_rank`, Vertical `/force_rank_vertical`, Horizontal `/force_rank_horizontal`, Horizontal Board `/force_rank_horizontal_board`
- Import Salary `/import_salary`
- Dashboard: Branch Performance, Overall Performance, Performance Comparison, Performance Trend
- Report: Appraisal, by Org, by Level, by Job KPI, Data Entry, KPI, Performance Form, Bonus/Salary, Usage Log
- Setting: Password Policy, LDAP, E-mail Server, Data Integration
- Feedback `/feedback`, Feedback Report `/feedback_report`
- Profile `/profile`, Logout `/logout`

See `rea-bundle-summary.json` for the full route and endpoint inventory, and `columns.json` for table columns.
