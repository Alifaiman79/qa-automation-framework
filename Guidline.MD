# QA Automation --- New Project & Test Case Guide

> **Purpose:** Reuse the existing Playwright + TypeScript framework for
> any project. Do not reinstall tools, recreate shared components, or
> modify unrelated tests.

## 1. Start a project (once per application)

1.  Open the existing `QA Automation` folder in VS Code.

2.  Set `.env` to the **approved test environment**:

    ``` dotenv
    BASE_URL=https://your-sit-or-uat-url
    TEST_ENV=SIT
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

2.  Give the AI the prompt below. Let it inspect `CLAUDE.md` (if
    present) and actual framework files.

3.  Review generated `.spec.ts`: correct steps, stable locators,
    meaningful assertions, no invented requirements, no hardcoded
    secrets.

4.  Verify and execute **only the targeted test**:

    ``` powershell
    npx tsc --noEmit
    npx playwright test tests/<project>/<feature>.spec.ts --project=chromium
    ```

5.  If failed, check whether it is an **application defect**, locator
    issue, test-data issue, auth issue, or environment issue. Never
    weaken assertions merely to pass.

6.  Review evidence, then update Jira/Zephyr with the **actual** result
    and defect reference when applicable.

## 3. Copy-paste prompt for any AI assistant

``` text
You are helping with an existing Playwright + TypeScript QA Automation framework.

First inspect the project files and CLAUDE.md (if available). Reuse existing
Page Objects (pages/), fixtures/, utils/, and test-data/. Do not reinstall
dependencies, duplicate code, overwrite tests, or change unrelated files.

Project: [NAME]
Environment / BASE_URL: [SIT/UAT URL]
Test Case ID & Title: [ID + TITLE]
Preconditions / Role: [DETAILS]
Steps: [PASTE]
Test Data (non-sensitive): [PASTE]
Expected Results: [PASTE]

Task:
- Implement a maintainable Playwright TypeScript .spec.ts test under tests/[project]/.
- Add only necessary project-specific Page Object methods/fixtures.
- Use reliable locators, auto-waiting, independent test setup, and assertions
  covering each expected result.
- Preserve the Jira/Zephyr ID and existing framework conventions.
- Do not invent application behavior, locators, credentials, or expected results.
- Ask for missing essentials and clearly state assumptions.
- List files created/changed and provide exact validation/run commands.
- Do NOT execute tests or modify authentication/shared data without my approval.
- Never claim a test passed without real execution evidence.
```

## 4. Useful commands

  ----------------------------------------------------------------------------------------------------------------
  Task                                Command
  ----------------------------------- ----------------------------------------------------------------------------
  Type-check                          `npx tsc --noEmit`

  Run one file                        `npx playwright test tests/<project>/<feature>.spec.ts`

  Chromium only                       `npx playwright test tests/<project>/<feature>.spec.ts --project=chromium`

  Visual debugging                    `npx playwright test --ui`

  Step debugging                      `npx playwright test --debug`

  Record browser actions              `npx playwright codegen <url>`

  HTML report                         `npx playwright show-report`

  Capture trace for a run             `npx playwright test tests/<project>/<feature>.spec.ts --trace on`
  ----------------------------------------------------------------------------------------------------------------

## 5. Rules to remember

-   **One shared framework; project-specific tests, pages, data, and
    authentication.**
-   `.env` controls the active environment; **double-check before every
    run**.
-   `CLAUDE.md` provides project guidance to Claude; for other AI tools,
    explicitly ask them to read it or paste the prompt above.
-   Codegen is a starting point: clean selectors and add real
    assertions.
-   Screenshots/videos are retained on failure per current config;
    traces on first retry **only if a retry occurs**, or use
    `--trace on`.
-   No real app tests or reusable login flow are configured yet:
    complete those per application.
