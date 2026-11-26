# Playwright TypeScript QA Automation Framework

A reusable end-to-end test framework built with Playwright Test and TypeScript. It supports project-specific tests and Page Objects, environment-based configuration, screenshots, HTML reports, per-attempt activity logs, and optional evidence retention.

## Technology stack

- Node.js
- Playwright Test
- TypeScript
- dotenv
- PowerShell for local commands

Dependencies are listed in `package.json` and pinned by `package-lock.json`.

## Repository structure

```text
fixtures/                 Shared test fixtures and verification screenshot helper
pages/<project>/          Project-specific Page Objects
test-data/                Reusable, non-sensitive test data
test-data/api/            Typed synthetic API request data
test-data/integration/    Typed local integration case datasets
test-data/auth/           Synthetic authentication case metadata
tests/<project>/          Project-specific Playwright tests
tests/api/                API tests using Playwright's request fixture
tests/demo/               Public browser smoke tests
tests/integration/        Local API and browser integration tests
tests/auth/               Local authentication and RBAC tests and fixture
playwright.integration.config.ts  Isolated integration test configuration
playwright.auth.config.ts         Isolated authentication test configuration
tests/auth.setup.ts       Authentication setup placeholder (currently skipped)
utils/                    Shared helpers and the evidence reporter
auth/                     Reserved for local authentication state; never commit it
playwright.config.ts      Playwright projects, browser settings, and reporters
tsconfig.json             TypeScript compiler settings
.env.example              Safe configuration template
CLAUDE.md                 Framework implementation guidance
Guidline.MD               QA automation guide
Workflow.md               QA automation workflow
```

## Installation and setup

Use PowerShell from the repository root:

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

The default `playwright.config.ts` imports `dotenv/config`, so its UI and API projects load the local `.env`. Edit that file only for an approved test environment. `.env` is ignored by Git; never commit credentials, tokens, cookies, or real authentication state.

The checked-in `.env.example` contains placeholders:

```dotenv
BASE_URL=https://your-test-environment.example
API_BASE_URL=https://dummyjson.com
TEST_ENV=SIT
EVIDENCE_PROJECT=UNASSIGNED
EVIDENCE_RETENTION_ENABLED=false
```

For default-config runs, set `BASE_URL`, `TEST_ENV`, and `EVIDENCE_PROJECT` to match the application and environment; `API_BASE_URL` controls the separate API project. The dedicated integration and authentication configs do not load dotenv automatically. They use process environment variables and loopback URLs rather than either default base URL. The integration config uses `INTEGRATION_PORT` (default `4179`); the auth config uses `AUTH_PORT` (default `4180`) and requires distinct synthetic `AUTH_ADMIN_PASSWORD` and `AUTH_STANDARD_PASSWORD` values. Both use `EVIDENCE_PROJECT` (default `UNASSIGNED`). Keep private URLs in local `.env`, not source or public documentation. Retention is opt-in; set `EVIDENCE_RETENTION_ENABLED=true` only when automatic cleanup is intended.

## Validate and execute tests

Type-check the project:

```powershell
npx tsc --noEmit
```

Run the default configuration (browser and API projects; the dedicated integration and authentication suites are excluded):

```powershell
npx playwright test
```

Select a browser project or individual test file as needed:

```powershell
npx playwright test --project=chromium
npx playwright test tests/<project>/<feature>.spec.ts --project=chromium --workers=1
```

Add `--headed` to display the browser. The default configuration has `chromium`, `firefox`, `webkit`, and `api` projects. Use the dedicated configurations below for the local integration and authentication suites.

View the HTML report after a run:

```powershell
npx playwright show-report
```

Playwright test results and reports are written to ignored local output directories.

## GitHub Actions

The CI workflow defines four independent jobs covering 24 unique tests: one tagged Chromium UI smoke test, six DummyJSON API tests, eight local API/UI integration tests, and nine local authentication and RBAC tests. Each job validates TypeScript. The first three jobs upload separate reports, results, and evidence for seven days; the authentication job uploads no artifacts while its publication privacy review remains incomplete. Browser jobs install Chromium; the API job uses Playwright's request fixture. The smoke job uses the public TodoMVC demo. The new authentication job has not yet run in a pull request or on `main`.

Run the public smoke test locally from PowerShell by setting `BASE_URL` explicitly:

```powershell
$env:BASE_URL = 'https://demo.playwright.dev/todomvc/'
npx playwright test tests/demo/ --project=chromium --workers=1 --grep '@smoke'
```

In GitHub, open the completed workflow run and download its artifacts from the run summary. Manual runs can override the smoke job's grep filter; that job remains restricted to `tests/demo/`.

## API testing

API tests use Playwright's built-in `request` fixture through the shared test export. `API_BASE_URL` configures the API project separately from the browser UI `BASE_URL`; the safe public default is `https://dummyjson.com`.

Run the API tests locally from PowerShell:

```powershell
$env:API_BASE_URL = 'https://dummyjson.com'
npx playwright test tests/api/ --project=api --grep '@api' --workers=1
```

The API project does not require a browser installation when its tests use only the `request` fixture. DummyJSON simulates POST, PUT, PATCH, and DELETE responses; those writes are not persisted, so the tests validate response status and body rather than a later GET reflecting the write. GitHub Actions runs the API suite in a separate job from the Chromium UI smoke job, with separate report and evidence artifacts.

## API and UI integration

`INT_TC_001` creates a uniquely named synthetic item through the local test API and verifies the browser UI contains exactly that item. The disposable Node.js server uses only built-in modules; its API and UI share one in-memory store, and the UI reads items through `GET /api/items`. The test validates the returned UUID and deletes that item through the API in `finally`; if test and cleanup both fail, both errors are retained.

This fixture demonstrates the Playwright API-to-browser workflow. It is not a production-like application and does not validate a database, authentication, or external service behavior.

Run the integration suite locally from PowerShell:

```powershell
$env:INTEGRATION_PORT = '4179'
$env:EVIDENCE_PROJECT = 'portfolio-demo'
npx playwright test -c playwright.integration.config.ts --project=chromium --workers=1 --retries=0
```

Playwright starts the local server before the run and stops it afterward. The default port is `4179`; set `INTEGRATION_PORT` to another available port if needed. The dedicated configuration selects only `tests/integration/` and does not use `BASE_URL` or `API_BASE_URL`. Set integration environment variables in PowerShell as above or in CI; values in `.env` are not automatically loaded by this config.

GitHub Actions runs the integration suite in its own job, starts the same local server through Playwright, installs Chromium, and uploads integration-specific HTML report, test-results, and evidence artifacts for seven days. The job uses no external API or credentials. Phase 3 CI and merge verification are complete.

## Data-driven integration testing

`test-data/integration/itemsCases.ts` defines typed, readonly cases. `tests/integration/items.data.spec.ts` uses native Playwright parameterization to register one independent test per case at file scope. Each has a stable `DATA_TC_*` ID, its own result and evidence, and no test-order dependency. Accepted cases create an item through the local API, validate its UUID and exact name, then locate that UUID in the UI and assert its exact text. When a record is created, its test deletes only that UUID in `finally` and retains both the original and cleanup failures. Rejected cases assert HTTP `400` and the exact validation error. The existing integration CI command selects this spec without workflow changes.

Normal and 200-character names are generated inside each test; the one-character boundary case is isolated by its returned UUID. Evidence follows the project, browser, case ID, execution, and attempt layout described below.

| Case | Input | Expected HTTP status |
| --- | --- | ---: |
| `DATA_TC_001` | Unique synthetic name | 201 |
| `DATA_TC_002` | Exactly 200 ASCII characters | 201 |
| `DATA_TC_003` | One character | 201 |
| `DATA_TC_004` | Empty string | 400 |
| `DATA_TC_005` | Whitespace only | 400 |
| `DATA_TC_006` | Exactly 201 ASCII characters | 400 |
| `DATA_TC_007` | Numeric name | 400 |

In PowerShell, set the evidence project before running any command below. Retention is disabled here so prior executions remain available:

```powershell
$env:EVIDENCE_PROJECT = 'portfolio-demo'
$env:EVIDENCE_RETENTION_ENABLED = 'false'
```

Run all seven data-driven cases:

```powershell
npx --no-install playwright test -c playwright.integration.config.ts tests/integration/items.data.spec.ts --project=chromium --workers=1 --retries=0
```

Run one case independently by its ID:

```powershell
npx --no-install playwright test -c playwright.integration.config.ts tests/integration/items.data.spec.ts --project=chromium --grep 'DATA_TC_001' --workers=1 --retries=0
```

Run only the data-driven spec with two workers:

```powershell
npx --no-install playwright test -c playwright.integration.config.ts tests/integration/items.data.spec.ts --project=chromium --fully-parallel --workers=2 --retries=0
```

Run the full integration regression with one worker:

```powershell
npx --no-install playwright test -c playwright.integration.config.ts --project=chromium --workers=1 --retries=0
```

Local validation passed: 7/7 targeted and independent data-driven cases, 7/7 two-worker cases (user-reported), and 8/8 full integration cases; the API and UI smoke regressions passed 6/6 and 1/1. The seven cases produced separate evidence, including verification screenshots for the three UI cases. API-only rejection cases need no browser screenshot. Parallel validation applies to the data-driven spec only; the full integration suite has not been validated with `--fully-parallel`.

The fixture uses synthetic data and disposable in-memory state, not production systems. Positive-case cleanup requires a valid returned UUID. If a future server creates an item but returns a non-201 success status, the status assertion may fail before that UUID is captured; the current fixture always returns `201` for successful creation.

## Authentication and RBAC testing

`tests/auth/support/auth-app.cjs` is a disposable loopback-only HTTP fixture with synthetic admin and standard accounts, in-memory sessions, and server-enforced access decisions. `test-data/auth/authCases.ts` holds typed case metadata; `tests/auth/auth-rbac.spec.ts` registers nine independent Playwright tests. `playwright.auth.config.ts` selects only this suite in Chromium, starts and stops the local server, defaults to one worker and zero retries, and disables automatic traces, videos, and screenshots. It does not load `.env` or use a public application.

| Case | Scenario |
| --- | --- |
| `AUTH_TC_001` | Admin UI login and exact dashboard/API identity |
| `AUTH_TC_002` | Standard-user UI login and exact dashboard/API identity |
| `AUTH_TC_003` | Invalid credentials rejected without a session |
| `AUTH_TC_004` | Guest denied direct UI and API access |
| `AUTH_TC_005` | Logout invalidates the issued server session while another session remains valid |
| `AUTH_TC_006` | In-memory session reuse and separate guest isolation |
| `RBAC_TC_001` | Standard user denied direct admin UI and API access |
| `RBAC_TC_002` | Admin allowed direct admin UI and API access |
| `RBAC_TC_003` | Admin and standard sessions retain distinct roles; logout affects only one |

Protected pages and API routes return `401` for guests and `403` for an authenticated standard user requesting the admin resource. The logout test reuses pre-logout storage state in memory to confirm server-side invalidation; no storage-state file is created. Each test cleans up its own sessions and contexts and retains both test and cleanup failures when necessary.

In PowerShell, generate temporary synthetic credentials in the current session without displaying them. Use no real or company credentials:

```powershell
$env:AUTH_ADMIN_PASSWORD = [guid]::NewGuid().ToString('N')
do {
  $env:AUTH_STANDARD_PASSWORD = [guid]::NewGuid().ToString('N')
} while ($env:AUTH_STANDARD_PASSWORD -eq $env:AUTH_ADMIN_PASSWORD)
$env:AUTH_PORT = '4180'
$env:EVIDENCE_PROJECT = 'portfolio-demo'
$env:EVIDENCE_RETENTION_ENABLED = 'false'
```

Run all nine cases, one case independently, or the auth spec with two workers:

```powershell
npx --no-install playwright test -c playwright.auth.config.ts --project=chromium --workers=1 --retries=0
npx --no-install playwright test -c playwright.auth.config.ts --project=chromium --grep 'AUTH_TC_001' --workers=1 --retries=0
npx --no-install playwright test -c playwright.auth.config.ts --project=chromium --fully-parallel --workers=2 --retries=0
```

Replace `AUTH_TC_001` in the individual command with any other listed ID to run that case alone. The two-worker command applies only to the auth suite.

Remove the temporary credential variables after testing:

```powershell
Remove-Item Env:AUTH_ADMIN_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:AUTH_STANDARD_PASSWORD -ErrorAction SilentlyContinue
```

Local validation passed: 9/9 sequential, 9/9 independently, and 9/9 with two workers; existing UI, API, and integration regression passed 1/1, 6/6, and 8/8. The evidence reporter retains separate PASS/FAIL attempts using the case annotations, with manually captured verification screenshots on safe post-login or access-denied pages. The auth CI job generates disposable credentials, masks them before use, and reports only numeric counts plus the real Playwright exit code. It does not upload auth reports, results, screenshots, evidence, or raw logs. These local outputs must not be published until the incomplete artifact privacy review is resolved.

This fixture does not validate production identity providers, MFA, HTTPS transport security, or session expiry. Phase 4 is implemented and locally validated; its pull request, CI, and merge verification are pending.

## Evidence and Execution Activity Logs

The custom evidence reporter stores each execution under its project, browser, and test case ID. PASS and FAIL executions remain separate:

```text
test-evidence/
  PASS/<PROJECT>/<BROWSER>/<TEST_CASE_ID>/<EXECUTION_ID>/
  FAIL/<PROJECT>/<BROWSER>/<TEST_CASE_ID>/<EXECUTION_ID>/
```

Each execution directory contains attempt directories such as `ATTEMPT_0/`. An attempt can contain:

- `execution-log.json`: structured attempt and step data
- `execution-log.txt`: readable metadata and aligned activity table
- `attempt-manifest.json` and `attempt-complete.json`
- `evidence.png` or `failure.png`, plus verification screenshots attached by a test
- Failure details, traces, or videos when produced by the run

When `EVIDENCE_RETENTION_ENABLED=true`, successful reporter finalization writes `execution-complete.json` under the logical execution's final status. With retention disabled, valid attempt evidence, screenshots, and activity logs can still be produced without that marker. Activity logs record attempt status separately from the final logical test status. Retry attempts share an execution ID; if retry statuses differ, their attempt directories can be under both PASS and FAIL roots.

In the default and integration suites, automatic end-of-test screenshots show context; they do not prove each assertion. Tests can attach screenshots at meaningful verification points. The authentication suite disables automatic screenshots, traces, and videos while retaining its explicit safe-page verification attachments. The default and integration `on-first-retry` trace is absent for a successful test without retries. Evidence uses `UNASSIGNED` when `evidenceProject` metadata is not supplied.

### Latest-only evidence retention

Retention is enabled only when `EVIDENCE_RETENTION_ENABLED=true`. After evidence and completion metadata are written successfully, the reporter uses an exclusive lock and keeps the latest completed execution for each project/browser/test-case combination across PASS and FAIL, including all of that execution's retries. Cleanup fails closed: interrupted runs, incomplete evidence, ambiguous metadata, symlinks, or unavailable locks are preserved and reported. Legacy evidence without valid completion metadata is preserved.

The repository `.gitignore` excludes `test-evidence/`; review evidence locally and share it through an approved channel when needed. Do not commit screenshots, traces, videos, or logs that may contain application or personal data.

## Current coverage and limitations

This repository contains reusable framework components and disposable public fixtures, not an application-specific end-to-end suite. `tests/auth.setup.ts` remains a skipped placeholder for real applications; the local authentication fixture is separate and uses only synthetic accounts. Add application-specific tests and Page Objects under `tests/<project>/` and `pages/<project>/` after confirming project requirements and environment access.

Chromium, Firefox, and WebKit projects are configured. A project being configured does not imply that its browser execution has been validated.

Local Git exclusions are not included in fresh clones or GitHub Actions checkouts. Only files committed to the repository are available there; add any required reusable files to the repository through the normal review process. Company-specific local files are not part of the tracked framework.

## Contribution workflow and phase status

For public framework changes, review the diff and sensitive-data scope, run the relevant static checks and targeted tests, then create a feature branch. Stage only approved files and commit after review. Create a Pull Request when approved, verify all relevant CI jobs, and merge only after approval. Confirm post-merge CI and synchronize local `main`. Keep private application-specific tests and evidence out of this public workflow.

Completed: Phase 1 (CI Pipeline v1), Phase 2A (API automation), Phase 2B (local API/UI integration), and Phase 3 (data-driven integration testing). Phase 4 (local authentication and RBAC) is implemented and locally validated; its Pull Request, CI, and merge verification are pending. Phases 5–7 remain planned.

## Security and publishing

Keep real environment values and authentication state local. Confirm that project names, test-case identifiers, application details, and any evidence are approved for the intended repository visibility before publishing. Excluding a local project folder or removing a URL from source does not establish that the remaining repository is safe to publish.
