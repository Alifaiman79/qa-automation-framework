# QA Automation Framework — AI Agent Instructions

## Scope and architecture

This is a reusable Playwright Test and TypeScript framework for public examples and future approved applications. Use [README.md](README.md) for setup, suite commands, CI, and evidence layout; use [Guidline.MD](Guidline.MD) for application-specific test design and [Workflow.md](Workflow.md) for the review sequence.

- `tests/demo/`: public Chromium UI smoke test.
- `tests/api/`: DummyJSON request-fixture tests; simulated writes are not persisted.
- `tests/integration/`: local API/UI and data-driven tests using the in-memory server in `tests/integration/support/items-app.cjs`.
- `tests/auth/`: local authentication and RBAC tests using the synthetic server in `tests/auth/support/auth-app.cjs`.
- `playwright.config.ts`: browser and API projects; excludes the dedicated integration and authentication suites.
- `playwright.integration.config.ts`: local Chromium integration project, one worker and no retries.
- `playwright.auth.config.ts`: local Chromium authentication project with isolated outputs and no automatic trace, video, or screenshot.
- `fixtures/`, `utils/`, `test-data/`: shared fixtures, helpers, reporting, and non-sensitive data. `pages/<project>/` is an optional convention; no Page Objects are currently tracked.
- `tests/auth.setup.ts`: skipped placeholder, not a working login flow.

Read existing tests, any relevant Page Objects, `fixtures/testFixtures.ts`, `utils/helpers.ts`, and test data before adding components. Keep shared code project-neutral. Use TypeScript for Playwright and shared code; the integration and authentication fixture servers are disposable Node.js `.cjs` exceptions. Do not add dependencies or alter unrelated files without approval.

Never delete, overwrite, disable, or replace an existing test without explicit user approval. Preserve existing framework behavior unless a change is explicitly approved. Stop and request clarification when requirements or expected results are ambiguous.

## Test design

1. Read the case ID, title, preconditions, steps, data, and expected results. Confirm missing behavior and access rather than inventing them.
2. Select UI, API, or genuine API/UI integration coverage and the matching Playwright project or config. Preserve the case ID in the title or a `testCaseId` annotation; use `testScope` when useful.
3. Keep tests independent and safe for parallel execution. Use unique synthetic data and avoid test-order dependencies or shared mutable state.
4. Cover the relevant positive, negative, and boundary criteria. Assert observed behavior with Playwright `expect`; never weaken assertions or manipulate results to conceal failures.
5. For UI work, prefer `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`, then `getByTestId` as appropriate. Avoid fragile XPath, dynamic classes, needless `nth()`, and fixed waits. Use auto-retrying web assertions and exact text or collection assertions when exact results are required. A click alone is not proof of success.
6. Use Codegen only as a UI starting point. Keep reusable page interactions in project-specific Page Objects when they help; keep assertions in tests by default. Reuse existing fixtures and helpers without duplicating locators or behavior.
7. For API work, validate status and meaningful response fields. A simulated write response does not establish persistence.
8. For stateful API/UI work, verify the API-created state in the browser UI. Validate returned identifiers before using them; clean up created state in `finally`. Preserve the original test failure and any cleanup error, for example with `AggregateError`.

Use meaningful file and test names. Never assume selectors, credentials, roles, storage state, or expected values that have not been verified.

## Environment, authentication, and privacy

Approved tests may consume credentials securely through environment variables at runtime. AI agents must not open private `.env` files or inspect credential values. Use safe placeholders and environment variable references in generated scripts; never fabricate, print, log, hardcode, expose, or commit credentials, tokens, cookies, authentication state, private URLs, or real test data. Keep `.env` and authentication state ignored. The auth setup is a placeholder; any real login or role-specific `storageState` needs project approval and verification. Never bypass login, authentication, authorization, RBAC, MFA, or other security controls to make a test pass. Confirm the target environment and permission before executing tests; do not run destructive tests against production. Private application automation and evidence must stay out of the public repository and public AI prompts.

## Evidence and reporting

The reporter organizes PASS and FAIL evidence by project, browser, case ID, execution, and attempt. Supply `evidenceProject` through project metadata or an annotation; the fallback is `UNASSIGNED`. Automatic end-of-test screenshots are contextual, not proof of each assertion. Attach screenshots at meaningful verification points when needed. Preserve failure details, videos when retained, and traces when available; `on-first-retry` produces no trace for a successful test without a retry.

The reporter writes per-attempt JSON/text activity logs. Retention-disabled runs can still contain valid attempt evidence. `execution-complete.json` requires enabled retention and successful reporter finalization. Review screenshots, logs, and reports for sensitive information before sharing; never fabricate an execution result.

## Validation, review, and Git

Run TypeScript validation and only the authorized targeted tests. Investigate failures as application, locator, data, environment, authentication, or automation issues; report actual outcomes and defect references. Review the diff for scope, secrets, private URLs, and generated artifacts.

Obtain explicit approval before Git write operations, including branch creation, staging, committing, pushing, PR creation, and merging. Stage only approved files. Verify applicable CI checks and post-merge results when those actions are authorized. See [README.md](README.md) for commands rather than copying command tables here.
