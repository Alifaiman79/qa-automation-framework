
# QA Automation Framework

## 1. Technology Stack

- Playwright Test
- TypeScript
- Node.js
- dotenv
- Visual Studio Code
- Claude Code (AI-assisted test automation)

## 2. Project Overview

This project is a reusable QA Automation Framework built using Playwright and TypeScript.

The framework is designed to:
- Automate test cases from Jira/Zephyr.
- Support functional, regression, smoke, and E2E testing.
- Reduce repetitive test automation code.
- Reuse existing Page Objects, fixtures, helpers, and test data.
- Support multiple web applications and testing environments.
- Generate reliable, maintainable, and independent automated tests.

The framework must remain reusable and should not be tightly coupled to a single application.

## 3. Project Structure

- tests/: Automated Playwright test specifications.
- pages/: Page Object Model (POM) classes.
- fixtures/: Reusable Playwright test fixtures.
- utils/: Shared helper functions.
- test-data/: Reusable non-sensitive test data.
- auth/: Authentication session storage.
- playwright.config.ts: Global Playwright configuration.
- tsconfig.json: TypeScript configuration.
- .env: Local environment variables and credentials.
- .gitignore: Excludes sensitive and generated files.
- CLAUDE.md: Project instructions for Claude Code.

### Existing Reusable Components

- fixtures/testFixtures.ts
- utils/helpers.ts
- test-data/commonData.ts

Always inspect these files before creating additional reusable components.

Do not assume that a component contains functionality without reading its implementation.

## 4. General Coding Rules

1. Always use TypeScript.
2. Use Playwright Test as the automation framework.
3. Follow Page Object Model (POM) principles.
4. Reuse existing Page Objects, fixtures, helpers, and test data.
5. Avoid duplicate code, locators, and methods.
6. Keep test scripts readable and maintainable.
7. Use meaningful names for tests, functions, and variables.
8. Follow the existing project structure.
9. Do not modify unrelated files.
10. Do not create unnecessary dependencies.
11. Never invent application behavior or expected results.
12. Inspect existing framework files before generating code.
13. Never recreate existing configuration or reusable components unnecessarily.
14. Do not delete or overwrite existing tests without permission.
15. Preserve existing functionality when extending the framework.

## 5. Playwright Best Practices

### Locators

Prefer locators in this order when appropriate:

1. getByRole()
2. getByLabel()
3. getByPlaceholder()
4. getByText()
5. getByTestId()

Use CSS selectors only when more reliable semantic locators are unavailable.

Avoid:
- Fragile XPath selectors.
- Dynamic CSS classes.
- Unnecessary nth() selectors.
- Hardcoded element positions.

Always inspect the application before assuming locators exist.

### Assertions

- Use Playwright expect() assertions.
- Verify actual behavior against expected results.
- Include meaningful assertions for every test case.
- Use auto-retrying web assertions when appropriate.
- Do not treat successful clicks as proof that a feature works.
- Do not invent expected values.

### Waiting and Timing

- Use Playwright auto-waiting.
- Prefer expect().toBeVisible() and similar assertions.
- Avoid waitForTimeout() unless explicitly justified.
- Avoid arbitrary delays.
- Handle asynchronous UI behavior properly.

### Test Independence

- Each test must run independently.
- Avoid dependencies between test cases.
- Do not rely on execution order.
- Use isolated browser contexts where appropriate.
- Avoid sharing mutable test data between parallel tests.
- Generate unique test data when necessary.

## 6. Page Object Model Rules

Page Objects must contain reusable page-specific interactions and locators.

Examples:
- navigate()
- fillForm()
- clickSubmit()
- selectOption()
- getSuccessMessage()

Rules:

1. Create Page Objects inside pages/.
2. Use descriptive class names.
3. Keep application-specific locators inside Page Objects.
4. Reuse existing methods before creating new ones.
5. Avoid duplicating UI interactions across test files.
6. Keep test assertions inside test specifications by default.
7. Add Page Object methods only when necessary.
8. Do not create unnecessary Page Objects.

## 7. Fixtures Rules

Use fixtures/ for reusable Playwright fixtures.

Rules:

1. Inspect fixtures/testFixtures.ts before modifying it.
2. Extend existing fixtures when necessary.
3. Avoid duplicating fixture definitions.
4. Keep fixtures focused on setup and dependency injection.
5. Use appropriate fixture scopes.
6. Ensure test isolation.
7. Avoid unnecessary global state.
8. Preserve existing fixture functionality.

## 8. Test Data Management

Use test-data/ for reusable non-sensitive test data.

Existing file:
- test-data/commonData.ts

Rules:

1. Reuse existing test data when appropriate.
2. Keep application-specific data separate when necessary.
3. Avoid hardcoding repeated test values.
4. Use helpers to generate unique test data.
5. Never store real passwords or access tokens in source code.
6. Do not modify shared test data without approval.
7. Use clearly identified test accounts and datasets.

## 9. Reusable Helpers

Existing file:
- utils/helpers.ts

Use helpers for common reusable operations such as:
- Generating unique email addresses.
- Generating reference IDs.
- Formatting dates.
- Other generic non-UI operations.

Rules:

1. Inspect existing helper methods first.
2. Reuse helpers instead of duplicating logic.
3. Keep helpers generic and application-independent.
4. Do not place page-specific locators inside helpers.
5. Add new helper functions only when necessary.

## 10. Environment Configuration

Use environment variables for application configuration.

Examples:
- BASE_URL
- TEST_ENV
- TEST_EMAIL
- TEST_PASSWORD

Rules:

1. Load environment variables through the existing configuration.
2. Never hardcode credentials.
3. Never expose passwords, tokens, or session cookies.
4. Do not commit .env files.
5. Do not overwrite existing environment values without permission.
6. Validate required environment variables when needed.
7. Do not assume authentication is configured.

## 11. Authentication Rules

Authentication functionality is application-specific.

The existing authentication setup may be a placeholder.

Rules:

1. Inspect existing authentication files before modification.
2. Do not assume login automation is implemented.
3. Use Playwright storageState when appropriate.
4. Store authentication state in ignored files.
5. Never commit authentication session data.
6. Never expose credentials in logs or reports.
7. Do not modify authentication flows without approval.
8. Never bypass authentication or security controls.

## 12. Jira / Zephyr Automation Workflow

When a Jira/Zephyr test case is provided:

### Step 1: Analyze Requirements

Read and identify:
- Test Case ID
- Test Case Title
- Preconditions
- Test Steps
- Test Data
- Expected Results

Preserve the original testing intention.

### Step 2: Inspect Existing Framework

Before generating code:

1. Read CLAUDE.md.
2. Inspect existing Page Objects.
3. Inspect existing fixtures.
4. Inspect existing helpers.
5. Inspect existing test data.
6. Inspect existing test specifications.

Identify reusable components.

### Step 3: Generate Automation

1. Generate a Playwright TypeScript test.
2. Use the existing framework structure.
3. Reuse existing components.
4. Create new Page Object methods only when needed.
5. Include assertions for expected results.
6. Preserve the Jira/Zephyr test case ID when provided.
7. Keep the test independent.
8. Avoid unnecessary changes.

### Step 4: Handle Missing Information

If required information is missing:

- Do not invent requirements.
- Do not invent expected results.
- Do not guess credentials.
- Do not assume locators exist.
- Ask for missing test data or application details.
- Clearly explain any assumptions.

### Step 5: Validate

When execution is available:

1. Run TypeScript validation.
2. Run the targeted Playwright test.
3. Review failures.
4. Distinguish application defects from automation errors.
5. Report actual execution results.

Never claim a test passed unless it was executed successfully.

## 13. Test Naming Convention

Use meaningful test names.

When a Jira/Zephyr Test Case ID is available, include it.

Example:

test('QA_TC_001 - Verify successful login', async () => {
  // Test implementation
});

Recommended file naming:

- login.spec.ts
- enrolment.spec.ts
- attendance.spec.ts

Group related tests by feature or module.

Avoid creating unnecessary test files.

## 14. Error Handling and Debugging

When a test fails:

1. Read the error message.
2. Identify the failing step.
3. Inspect the locator or assertion.
4. Review screenshots, traces, and videos when available.
5. Determine whether the failure is caused by:
   - Application defect
   - Incorrect locator
   - Test data issue
   - Environment issue
   - Authentication issue
   - Automation script issue

Do not automatically change assertions just to make tests pass.

Do not hide legitimate application defects.

## 15. Reporting and Evidence

Use Playwright's existing reporting configuration.

Supported evidence:
- HTML reports
- End-of-test screenshots (the current Playwright configuration captures screenshots for every test)
- Videos retained on failure
- Traces on the first retry
- Per-attempt execution activity logs in JSON and text formats
- Completion metadata and latest-only retention when `EVIDENCE_RETENTION_ENABLED=true`

Rules:

1. Preserve useful failure evidence.
2. Do not expose sensitive information in reports.
3. Clearly identify passed, failed, and skipped tests.
4. Do not fabricate execution results.
5. Keep test case IDs traceable when available.

## 16. AI Code Generation Rules

When Claude is asked to generate or modify automation:

1. Read this file first.
2. Inspect relevant existing files.
3. Understand the requested test case.
4. Reuse the existing framework.
5. Avoid duplicate implementations.
6. Make minimal necessary changes.
7. Preserve existing working functionality.
8. Do not modify unrelated files.
9. Do not delete files without permission.
10. Explain newly created files and methods.
11. Identify missing information.
12. Never fabricate test execution results.
13. Ask before making significant architectural changes.
14. Do not install new packages without approval.
15. Do not execute destructive or production-impacting operations without explicit permission.

## 17. Multi-Project Reusability

This framework may be used for different applications and projects.

Rules:

1. Keep shared utilities generic.
2. Separate project-specific Page Objects.
3. Separate project-specific test data.
4. Avoid mixing unrelated application workflows.
5. Use environment variables for application URLs.
6. Preserve shared framework components.
7. Do not introduce project-specific assumptions into global configuration without approval.

## 18. Common Commands

### TypeScript Validation

npx tsc --noEmit

### Run All Tests

npx playwright test

### Run Specific Test File

npx playwright test tests/<filename>.spec.ts

### Run Chromium Only

npx playwright test --project=chromium

### Run in UI Mode

npx playwright test --ui

### Run in Debug Mode

npx playwright test --debug

### Record Browser Actions

npx playwright codegen <url>

### View HTML Report

npx playwright show-report

## 19. Final Instructions for Claude

Before implementing any test automation:

- Understand the Jira/Zephyr test case.
- Inspect the existing project structure.
- Reuse existing Page Objects, fixtures, helpers, and test data.
- Generate clean and maintainable TypeScript code.
- Preserve test independence.
- Implement meaningful assertions.
- Avoid duplicate code.
- Do not invent requirements.
- Make only necessary changes.
- Validate generated code when possible.
- Clearly report completed changes, assumptions, and limitations.

The primary objective is to maintain a reusable, scalable, and reliable Playwright TypeScript QA Automation Framework.
