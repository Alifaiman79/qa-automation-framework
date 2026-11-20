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
tests/<project>/          Project-specific Playwright tests
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

`execution-complete.json` marks a completed logical execution under its final status. Activity logs record attempt status separately from the final logical test status. Retry attempts share an execution ID; if retry statuses differ, their attempt directories can be under both PASS and FAIL roots.

### Latest-only evidence retention

Retention is enabled only when `EVIDENCE_RETENTION_ENABLED=true`. After evidence and completion metadata are written successfully, the reporter uses an exclusive lock and keeps the latest completed execution for each project/browser/test-case combination across PASS and FAIL, including all of that execution's retries. Cleanup fails closed: interrupted runs, incomplete evidence, ambiguous metadata, symlinks, or unavailable locks are preserved and reported. Legacy evidence without valid completion metadata is preserved.

The repository `.gitignore` excludes `test-evidence/`; review evidence locally and share it through an approved channel when needed. Do not commit screenshots, traces, videos, or logs that may contain application or personal data.

## Current coverage and limitations

This repository contains reusable framework components, not an application-specific end-to-end suite. `tests/auth.setup.ts` is a skipped placeholder; no reusable login flow is configured. Add application-specific tests and Page Objects under `tests/<project>/` and `pages/<project>/` after confirming project requirements and environment access.

Chromium, Firefox, and WebKit projects are configured. A project being configured does not imply that its browser execution has been validated.

Company-specific automation folders are excluded from Git by default. Their local contents are not described or published by this generic framework README.

## Security and publishing

Keep real environment values and authentication state local. Confirm that project names, test-case identifiers, application details, and any evidence are approved for the intended repository visibility before publishing. Excluding a local project folder or removing a URL from source does not establish that the remaining repository is safe to publish.
