import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.INTEGRATION_PORT || 4179);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('INTEGRATION_PORT must be an integer between 1 and 65535.');
}

const baseURL = `http://127.0.0.1:${port}`;
const evidenceProject = process.env.EVIDENCE_PROJECT || 'UNASSIGNED';

export default defineConfig({
  metadata: { evidenceProject },
  testDir: './tests/integration',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./utils/evidenceReporter.ts'],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      metadata: { evidenceProject },
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node tests/integration/support/items-app.cjs',
    url: baseURL,
    reuseExistingServer: false,
    env: { INTEGRATION_PORT: String(port) },
  },
});
