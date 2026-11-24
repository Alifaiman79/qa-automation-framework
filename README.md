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
tests/<project>/          Project-specific Playwright tests
tests/api/                API tests using Playwright's request fixture
tests/demo/               Public browser smoke tests
tests/integration/        Local API and browser integration test
playwright.integration.config.ts  Isolated integration test configuration
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

Edit the local `.env` with values for the approved test environment. `.env` is ignored by Git; never commit credentials, tokens, cookies, or real authentication state.

The checked-in `.env.example` contains placeholders:

```dotenv
BASE_URL=https://your-test-environment.example
TEST_ENV=SIT
EVIDENCE_PROJECT=UNASSIGNED
EVIDENCE_RETENTION_ENABLED=false
```

Set `BASE_URL`, `TEST_ENV`, and `EVIDENCE_PROJECT` to match the application and environment being tested. Keep the actual URL in local `.env` rather than in source or public documentation. Retention is opt-in; set `EVIDENCE_RETENTION_ENABLED=true` only when automatic cleanup is intended.

## Validate and execute tests

Type-check the project:

```powershell
npx tsc --noEmit
```

Run the test suite:

```powershell
npx playwright test
```

Select a browser project or individual test file as needed:

```powershell
npx playwright test --project=chromium
npx playwright test tests/<project>/<feature>.spec.ts --project=chromium --workers=1
```

Add `--headed` to display the browser. Configured browser projects are `chromium`, `firefox`, and `webkit`.

View the HTML report after a run:

```powershell
npx playwright show-report
```

Playwright test results and reports are written to ignored local output directories.

## GitHub Actions

The CI workflow runs TypeScript validation and the tagged Chromium smoke test in `tests/demo/`. It installs Chromium on an Ubuntu runner and uploads the HTML report, Playwright test results, and execution evidence as artifacts for seven days, including when the test job fails. The initial `BASE_URL` points to the public TodoMVC demo.

Run the public smoke test locally from PowerShell by setting `BASE_URL` explicitly:

```powershell
$env:BASE_URL = 'https://demo.playwright.dev/todomvc/'
npx playwright test tests/demo/ --project=chromium --workers=1 --grep '@smoke'
```

In GitHub, open the completed workflow run and download its artifacts from the run summary. Manual runs can override the grep filter; test execution remains restricted to `tests/demo/`.

## API testing

API tests use Playwright's built-in `request` fixture through the shared test export. `API_BASE_URL` configures the API project separately from the browser UI `BASE_URL`; the safe public default is `https://dummyjson.com`.

Run the API tests locally from PowerShell:

```powershell
$env:API_BASE_URL = 'https://dummyjson.com'
npx playwright test tests/api/ --project=api --grep '@api' --workers=1
```

The API project does not require a browser installation when its tests use only the `request` fixture. DummyJSON simulates POST, PUT, PATCH, and DELETE responses; those writes are not persisted, so the tests validate response status and body rather than a later GET reflecting the write. GitHub Actions runs the API suite in a separate job from the Chromium UI smoke job, with separate report and evidence artifacts.

## API and UI integration

`INT_TC_001` creates a synthetic item through the local test API and verifies that the browser UI displays the same item. The disposable Node.js server uses only built-in modules; its API and UI share one in-memory store, and the UI reads items through `GET /api/items`. The item is deleted through the API during test cleanup.

This fixture demonstrates the Playwright API-to-browser workflow. It is not a production-like application and does not validate a database, authentication, or external service behavior.

Run the integration test locally from PowerShell:

```powershell
$env:INTEGRATION_PORT = '4179'
$env:EVIDENCE_PROJECT = 'portfolio-demo'
npx playwright test -c playwright.integration.config.ts --project=chromium --workers=1 --retries=0
```

Playwright starts the local server before the run and stops it afterward. The default port is `4179`; set `INTEGRATION_PORT` to another available port if needed. The dedicated configuration selects only `tests/integration/` and does not use `BASE_URL` or `API_BASE_URL`.

GitHub Actions runs this test in its own job, starts the same local server through Playwright, installs Chromium, and uploads integration-specific HTML report, test-results, and evidence artifacts for seven days. The job uses no external API or credentials.

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

### Latest-only evidence retention

Retention is enabled only when `EVIDENCE_RETENTION_ENABLED=true`. After evidence and completion metadata are written successfully, the reporter uses an exclusive lock and keeps the latest completed execution for each project/browser/test-case combination across PASS and FAIL, including all of that execution's retries. Cleanup fails closed: interrupted runs, incomplete evidence, ambiguous metadata, symlinks, or unavailable locks are preserved and reported. Legacy evidence without valid completion metadata is preserved.

The repository `.gitignore` excludes `test-evidence/`; review evidence locally and share it through an approved channel when needed. Do not commit screenshots, traces, videos, or logs that may contain application or personal data.

## Current coverage and limitations

This repository contains reusable framework components, not an application-specific end-to-end suite. `tests/auth.setup.ts` is a skipped placeholder; no reusable login flow is configured. Add application-specific tests and Page Objects under `tests/<project>/` and `pages/<project>/` after confirming project requirements and environment access.

Chromium, Firefox, and WebKit projects are configured. A project being configured does not imply that its browser execution has been validated.

Local Git exclusions are not included in fresh clones or GitHub Actions checkouts. Only files committed to the repository are available there; add any required reusable files to the repository through the normal review process. Company-specific local files are not part of the tracked framework.

## Security and publishing

Keep real environment values and authentication state local. Confirm that project names, test-case identifiers, application details, and any evidence are approved for the intended repository visibility before publishing. Excluding a local project folder or removing a URL from source does not establish that the remaining repository is safe to publish.
