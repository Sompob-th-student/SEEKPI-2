# SEEKPI-2

KPI and performance-appraisal web app for Syntec Construction. It was rebuilt from a REA (reverse engineer anything,
https://github.com/morluto/rea) analysis of the original SEEKPI at `https://kpi.syntec.co.th/seekpi/`.
The findings behind it are in [`../rea-analysis/SPEC.md`](../rea-analysis/SPEC.md) (bundle analysis) and
[`../rea-analysis/SEEKPI_Original_Feature_Catalogue.md`](../rea-analysis/SEEKPI_Original_Feature_Catalogue.md) (read-only study of the signed-in original, with a gap analysis).

## What was carried over from the original (via REA)

- The same menu, route paths, and permission model: `permission[] = {url, is_view, is_add, is_edit, is_delete}`, where a menu item shows only when `is_view = 1`.
- The same EN/TH label dictionaries: 538 keys extracted from the original bundle, plus extras in `client/src/i18n/extra.ts`.
- The same list columns for each master-data screen (material-table column sets), the same session keys in `localStorage`, and the same 30-minute idle logout.
- The same module set: master data, appraisal items, employees, individual and corporate assignments, appraisal, the four force-rank modes,
  salary import, four dashboards, nine reports, settings, feedback, and profile.

The backend is new. The original API (Laravel at `syntec_api/public/api`) and its database were never accessed. seekpi-2 uses
its own Express + SQLite API, and its scoring follows the method the original shows on screen (`server/scoring-core.js`, `server/workflow.js`):

- **Structures:** Company Performance, Project Performance, Individual Performance and Competency. Each structure's weight comes from Appraisal Criteria for the employee's **Level Group**.
- **KPI targets:** each KPI has five target levels (score 1–5) for every period: Monthly 12, Quarterly 4 or Yearly 1. A period scores the highest level the actual reaches; direction comes from L1 vs L5, and worse than L1 scores 0. The KPI score is the average of its scored periods.
- **Scores:** weight score = score ÷ 5 × %weight; structure score = sum of its weight scores (0–100); total = Σ structure score × structure weight − deductions. Shown on both scales, e.g. `65.11 (3.26) / 100.00 (5.00)`.
- **Competency:** the evaluator's 1–5 rating. **Deduct:** the original STT03 rule (max_value, unit_deduct_score, value_get_zero).
- **Grades:** FE‹S›, EE‹A›, FM‹B›, PM‹C›, NM‹D›.
- **Workflow:** each structure moves through the original's stages (Approve Item → Save Draft / Review Actual → Approve / Reject → Admin Approve → End to Vertical → End to Horizontal; competency has its own). The Action list shows only the steps the signed-in user is allowed to take.
- **Force rank:** seats per grade use the Largest Remainder method. Ranking is by result, then KPI, then competency, then emp_code. Ties across a grade boundary are flagged, and groups under 5 people are not forced.

Full rules and examples are in [`docs/SEEKPI-2_Scoring_Method.md`](docs/SEEKPI-2_Scoring_Method.md).

## Production design

Decisions (2026-11-05): **on-premise** hosting, **SQLite** database, **no D365** integration (Excel/CSV import instead).

- [`docs/SEEKPI-2_Software_Specification.md`](docs/SEEKPI-2_Software_Specification.md): software specification in Thai, covering requirements, business rules, on-prem architecture, the tech stack, ERDs and workflow diagrams. [`docs/seekpi-2-spec.html`](docs/seekpi-2-spec.html) is the same document rendered as a page.
- [`docs/SEEKPI-2_Scoring_Method.md`](docs/SEEKPI-2_Scoring_Method.md): the 5-level target method, structure weights by level group, deduct score, FE–NM grades, force-rank rounding and the per-structure workflow, with worked examples. The examples are asserted by `server/test/*.test.js` (`cd server && npm test`, 16 tests).
- [`docs/seekpi-2-hr-decisions.html`](docs/seekpi-2-hr-decisions.html): the nine policy points HR must confirm.
- [`database/schema.sql`](database/schema.sql): production SQLite schema (WAL) with 58 tables in 9 domains, 116 FKs and 23 triggers. It includes `assignment_item_period` (L1–L5 targets and actual per period), `assignment_structure` (stage and score per structure) and `assessor_chain` (ACTION TO), plus reporting views, a `job` queue table and the permission catalogue.

The prototype below uses its own simpler SQLite tables, but its scoring and workflow run on the same code as the scoring document. Moving the prototype onto `database/schema.sql` is the Phase 1 work described in the spec.

## Cloudflare deployment

[`cloudflare/`](cloudflare/) runs the same app on Cloudflare Workers + D1 + Static Assets. The Worker imports the same scoring, workflow and resource modules from `server/`. See [`cloudflare/README-DEPLOY.md`](cloudflare/README-DEPLOY.md) for the deploy steps, and note that it conflicts with the on-premise decision for real personal data.

## Stack (prototype)

| | |
|---|---|
| Client | React 19, TypeScript, Vite, MUI, Recharts, react-router (`/seekpi-2/` base path) |
| API | Node ≥ 22.13, Express 5, `node:sqlite` (built-in), JWT, bcrypt |
| Data | `server/data/seekpi2.db`, created and seeded with fictional Syntec demo data on first start |

## Run

```bash
npm run install:all
npm run build
npm start
```

Open http://127.0.0.1:4000/seekpi-2/

For development with hot reload, run `npm run dev:api` and `npm run dev:web`, then open http://127.0.0.1:5173/seekpi-2/

To re-seed the demo data, run `npm run reset-db` and start the app again.

### Local demo accounts (seed data, test only)

| User | Password | Role |
|---|---|---|
| `admin` | `admin123` | System Administrator (all modules) |
| `hr` | `hr123` | HR Appraisal Officer |
| `E0002` | `demo123` | Employee: owner of their own scorecard (enters actuals, sends for review) |
| `E0001` | `demo123` | Employee who is E0002's chief: evaluator (approves or rejects E0002's results, rates competency) |

Before any real deployment: change these passwords, set `JWT_SECRET`, and put the app behind HTTPS.
