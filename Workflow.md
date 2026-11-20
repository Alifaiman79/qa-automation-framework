# QA Automation Workflow

1. **Zephyr test case** — Capture the case ID, title, preconditions, steps, test data, and expected results.
2. **Review requirements** — Confirm scope, environment, business rules, and missing information. Do not invent behavior or test data.
3. **Playwright Codegen** — Inspect the approved test environment and record a user-equivalent starting script. Treat generated selectors as provisional.
4. **Page Object** — Move reusable page interactions and locators into the project-specific Page Object.
5. **Test implementation** — Add a clearly named test with meaningful assertions, case metadata, and evidence capture. Keep its scope explicit.
6. **TypeScript validation** — Run `npx tsc --noEmit` and review the diff.
7. **PowerShell execution** — Confirm the approved `.env` target, then run only the authorized test or browser project.
8. **Evidence review** — Review the actual result, activity logs, screenshots, report, and retention outcome. Preserve failures and incomplete evidence.
9. **Defect reporting** — Report verified failures with evidence and distinguish application defects from environment, data, locator, and automation issues. Update Zephyr with the actual result.
