import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.AUTH_PORT || 4180);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('AUTH_PORT must be an integer between 1 and 65535.');
}

const adminPassword = process.env.AUTH_ADMIN_PASSWORD;
const standardPassword = process.env.AUTH_STANDARD_PASSWORD;
if (!adminPassword || !standardPassword || adminPassword === standardPassword) {
  throw new Error('Distinct synthetic AUTH_ADMIN_PASSWORD and AUTH_STANDARD_PASSWORD values are required.');
}

const baseURL = `http://127.0.0.1:${port}`;
const evidenceProject = process.env.EVIDENCE_PROJECT || 'UNASSIGNED';

export default defineConfig({
  metadata: { evidenceProject },
  testDir: './tests/auth',
  testMatch: '**/auth-rbac.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results/auth',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/auth' }],
    ['./utils/evidenceReporter.ts'],
  ],
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      metadata: { evidenceProject },
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node tests/auth/support/auth-app.cjs',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    env: {
      AUTH_PORT: String(port),
      AUTH_ADMIN_PASSWORD: adminPassword,
      AUTH_STANDARD_PASSWORD: standardPassword,
    },
  },
});
