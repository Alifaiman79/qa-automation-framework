import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const evidenceProject = process.env.EVIDENCE_PROJECT || 'UNASSIGNED';
const apiBaseURL = process.env.API_BASE_URL || 'https://dummyjson.com';

export default defineConfig({
  metadata: { evidenceProject },
  testDir: './tests',

  fullyParallel: true,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./utils/evidenceReporter.ts'],
  ],

  timeout: 30_000,

  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: process.env.BASE_URL || 'https://playwright.dev',

    trace: 'on-first-retry',
    // This end-of-test screenshot is contextual evidence, not proof of every assertion.
    screenshot: 'on',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      metadata: { evidenceProject },
      testIgnore: ['**/api/**', '**/integration/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      metadata: { evidenceProject },
      testIgnore: ['**/api/**', '**/integration/**'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      metadata: { evidenceProject },
      testIgnore: ['**/api/**', '**/integration/**'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'api',
      testDir: './tests/api',
      testIgnore: '**/integration/**',
      metadata: { evidenceProject },
      use: { baseURL: apiBaseURL },
    },
  ],
});
