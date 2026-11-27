# QA Automation --- New Project & Test Case Guide

> **Purpose:** Reuse the existing Playwright + TypeScript framework for
> any project. Do not reinstall tools, recreate shared components, or
> modify unrelated tests.

This guide primarily covers application-specific UI cases. First decide whether the requirement needs a UI test, API test, or genuine API/UI integration test. The public demo, DummyJSON API, and local integration examples are documented in [README.md](README.md); they are not private application coverage.

## 1. Start a project (once per application)

1.  Open the existing `QA Automation` folder in VS Code.

2.  For the default Playwright configuration, set `.env` to the **approved test environment**; it loads dotenv. Use placeholders in shared instructions and AI prompts; never paste private SIT/UAT URLs:

    ``` dotenv
    BASE_URL=https://your-approved-test-environment.example
    TEST_ENV=SIT
    EVIDENCE_PROJECT=UNASSIGNED
    ```

3.  Create project-specific folders **only when needed**:
    `tests/<project>/`, `pages/<project>/`, `test-data/<project>/`.

4.  Confirm the test account, role, preconditions, and test data with
    QA/BA/dev. Keep credentials in ignored environment files, never in
    source code or AI prompts.

5.  If login is required, implement and verify project/role-specific
    `storageState` first. **Existing `tests/auth.setup.ts` is only a
    placeholder**, not working authentication.

6.  Confirm that the test is permitted in the selected environment. Do
    not run destructive tests against production.

## 2. Automate each Jira / Zephyr test case

1.  Copy **Test Case ID, title, preconditions, steps, test data,
    expected results**.

2.  Review acceptance criteria and design positive, negative, and boundary scenarios where relevant. Give the AI the prompt below. Let it inspect `CLAUDE.md` and actual framework files.

3.  Review generated `.spec.ts`: correct steps, stable semantic locators,
    exact assertions when exact output is required, no invented requirements,
    no hardcoded secrets. Use Codegen and Page Objects only when they help UI work.
    For API checks, validate status and response fields. For stateful integration,
    use unique synthetic data and clean up created records in `finally`, preserving
    both the original failure and any cleanup error.

4.  Verify and execute **only the authorized test**, using the correct project
    or dedicated configuration. See [README.md](README.md) for commands.

5.  If failed, check whether it is an **application defect**, locator
    issue, test-data issue, auth issue, or environment issue. Never
    weaken assertions merely to pass.

6.  Review the invocation summary and relevant evidence, then update Jira/Zephyr
    with the **actual** result and defect reference when applicable. Keep
    authentication summaries and artifacts local.

## 3. Copy-paste prompt for any AI assistant

``` text
You are helping with an existing Playwright + TypeScript QA Automation framework.

First inspect the project files and CLAUDE.md (if available). Reuse existing
Page Objects (pages/), fixtures/, utils/, and test-data/. Do not reinstall
dependencies, duplicate code, overwrite tests, or change unrelated files.

Project: [NAME]
Environment / BASE_URL: [APPROVED ENVIRONMENT NAME OR PLACEHOLDER; NO PRIVATE URL]
Test Case ID & Title: [ID + TITLE]
Preconditions / Role: [DETAILS]
Steps: [PASTE]
Test Data (non-sensitive): [PASTE]
Expected Results: [PASTE]

Task:
- Implement a maintainable Playwright TypeScript .spec.ts test under tests/[project]/.
- Add project-specific Page Object methods only when UI interactions need reuse; add fixtures only when necessary.
- Use reliable locators, auto-waiting, independent test setup, and exact assertions
  where required; cover positive, negative, and boundary criteria when applicable.
- For API work, check status and response fields. For stateful work, use unique
  synthetic data and cleanup in finally while preserving original failures.
- Preserve the Jira/Zephyr ID and existing framework conventions.
- Do not invent application behavior, locators, credentials, or expected results.
- Ask for missing essentials and clearly state assumptions.
- List files created/changed and provide exact validation/run commands.
- Do NOT execute tests or modify authentication/shared data without my approval.
- Never claim a test passed without real execution evidence.
```

## 4. Execution reference

Use the UI, API, or integration commands in [README.md](README.md). The local integration suite requires its dedicated Playwright config. Confirm the environment and authorization before running any test.

## 5. Rules to remember

-   **One shared framework; project-specific tests, pages, data, and
    authentication.**
-   The default Playwright config loads `.env` for UI and API runs. The dedicated
    integration config runs a local loopback fixture and does not load dotenv; it reads process environment variables
    such as `INTEGRATION_PORT` (default `4179`) and `EVIDENCE_PROJECT` (default
    `UNASSIGNED`). Set those explicitly in PowerShell or CI. Confirm the active
    environment before every run.
-   `CLAUDE.md` provides project guidance to Claude; for other AI tools,
    explicitly ask them to read it or paste the prompt above.
-   Codegen is an optional UI starting point: clean selectors and add real
    assertions.
-   The default and integration configs capture contextual end-of-test
    screenshots; these do not prove every assertion. The dedicated auth config
    disables automatic screenshots, traces, and videos, while auth tests attach
    selected verification screenshots on safe pages. Evidence uses `UNASSIGNED`
    if no project metadata is supplied.
    `execution-complete.json` requires enabled retention and successful reporter
    finalization; disabled retention can still leave complete attempt evidence.
    The default and integration configs retain videos on failure and capture
    traces on the first retry **only if a retry occurs**.
-   The evidence reporter writes per-attempt JSON and text activity logs.
    Latest-only evidence retention is controlled by
    `EVIDENCE_RETENTION_ENABLED=true`; incomplete or legacy evidence is preserved.
-   The reporter also writes `execution-summary.json` and `execution-summary.txt`
    under `run-summaries/<suite>/<summary-id>/` after each invocation, including
    retention-disabled runs. Open the newest directory for `default`,
    `integration`, `auth`, or `other`. Check Playwright's actual overall status
    and `complete` before interpreting logical passed/failed/flaky/skipped counts;
    a completed failed run differs from an interrupted or unexecuted run.
    Attempts and retries count physical executions separately from logical tests.
    Trace a valid case ID through its project, browser, execution, and relative
    evidence reference to an `attempt-complete.json` marker. Later retention may
    remove older evidence without removing summary history. Review identifiers
    and attachments for sensitive information before any approved sharing;
    authentication summaries and artifacts must stay local.
-   No real app tests or reusable login flow are configured yet:
    complete those per application.
