# QA Automation Workflow

1. **Review requirements** — Read the manual case, acceptance criteria, expected results, and permitted environment. Resolve missing details without inventing behavior.
2. **Select the test type** — Choose UI, API, or genuine API/UI integration coverage. Use the matching project or config described in [README.md](README.md).
3. **Identify preconditions and data** — Confirm role, access, dependencies, and synthetic data. Generate unique identifiers for created records.
4. **Implement the test** — Keep tests independent. Use Codegen and Page Objects only when useful for UI automation; validate API status and response fields for API work.
5. **Review test logic** — Prefer stable semantic locators, auto-retrying assertions, and exact text when exact output is required. Put state cleanup in `finally` and retain original and cleanup failures.
6. **Validate statically** — Run TypeScript validation and review the diff, file scope, and sensitive-data exposure.
7. **Execute with approval** — Confirm the approved environment, then run the targeted test with the appropriate Playwright config.
8. **Review evidence** — Record the actual outcome, contextual screenshots, verification-point attachments, activity logs, and retention outcome. A successful test without a retry has no `on-first-retry` trace; retention-disabled runs may lack `execution-complete.json` while retaining valid attempt evidence. Missing project metadata uses `UNASSIGNED`.
9. **Investigate failures** — Separate application defects from environment, data, locator, authentication, and automation failures. Report verified defects with approved evidence.
10. **Prepare a public contribution** — Keep private application tests, URLs, credentials, and evidence out of the public framework repository.
11. **Create a feature branch** — Do so only when approved, then stage only approved files.
12. **Commit and open a Pull Request** — Review the exact staged diff and obtain approval for each Git write or remote action.
13. **Verify CI** — Check the applicable smoke, API, and integration jobs and their artifacts.
14. **Merge after approval** — Use the reviewed Pull Request and required checks.
15. **Confirm delivery** — Verify post-merge CI and synchronize local `main`.

For private application-specific automation, follow the approved internal repository and environment process. Do not place that work in the public framework contribution flow.
