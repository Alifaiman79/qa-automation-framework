import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { captureVerificationEvidence, expect, test } from '../../fixtures/testFixtures';
import { authCases, identities, type AuthCase, type SyntheticIdentity } from '../../test-data/auth/authCases';

type Cleanup = () => Promise<void>;

function caseDetails(authCase: AuthCase) {
  return {
    tag: authCase.scope === 'RBAC' ? ['@auth', '@rbac'] : '@auth',
    annotation: [
      { type: 'testCaseId', description: authCase.testCaseId },
      { type: 'testScope', description: authCase.scope },
    ],
  };
}

function caseTitle(authCase: AuthCase): string {
  return `${authCase.testCaseId} ${authCase.title}`;
}

function localBaseURL(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('A local authentication fixture baseURL is required.');
  const url = new URL(baseURL);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw new Error('Authentication tests require the loopback-only fixture.');
  }
  return baseURL;
}

function syntheticPasswords(): { admin: string; standard: string } {
  const admin = process.env[identities.admin.passwordEnvironment];
  const standard = process.env[identities.standard.passwordEnvironment];
  if (!admin || !standard || admin === standard) {
    throw new Error('Distinct synthetic AUTH_ADMIN_PASSWORD and AUTH_STANDARD_PASSWORD values are required.');
  }
  return { admin, standard };
}

async function runWithCleanup(work: (addCleanup: (cleanup: Cleanup) => void) => Promise<void>): Promise<void> {
  const cleanups: Cleanup[] = [];
  let originalFailure: unknown;
  let failed = false;
  try {
    await work((cleanup) => cleanups.push(cleanup));
  } catch (error) {
    originalFailure = error;
    failed = true;
  }

  const cleanupFailures: unknown[] = [];
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (failed && cleanupFailures.length) {
    throw new AggregateError([originalFailure, ...cleanupFailures], 'The authentication test and cleanup both failed.');
  }
  if (failed) throw originalFailure;
  if (cleanupFailures.length === 1) throw cleanupFailures[0];
  if (cleanupFailures.length > 1) throw new AggregateError(cleanupFailures, 'Multiple authentication cleanups failed.');
}

async function logoutContext(context: BrowserContext): Promise<void> {
  const response = await context.request.post('/api/logout');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ message: 'Logged out' });
}

function addContextCleanup(addCleanup: (cleanup: Cleanup) => void, context: BrowserContext): void {
  addCleanup(() => context.close());
  addCleanup(() => logoutContext(context));
  addCleanup(async () => {
    for (const page of context.pages()) await clearPasswordField(page);
  });
}

async function clearPasswordField(page: Page): Promise<void> {
  if (page.isClosed()) return;
  await page.locator('input[type="password"]').evaluateAll((inputs) => {
    for (const input of inputs) (input as HTMLInputElement).value = '';
  });
}

function addPageCleanup(addCleanup: (cleanup: Cleanup) => void, page: Page): void {
  addCleanup(() => logoutContext(page.context()));
  addCleanup(() => clearPasswordField(page));
}

async function loginThroughUi(page: Page, identity: SyntheticIdentity): Promise<void> {
  const passwords = syntheticPasswords();
  const loginPage = await page.goto('/login');
  expect(loginPage?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill(identity.id);
  await page.getByLabel('Password', { exact: true }).fill(passwords[identity.role]);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectDashboard(page, identity);
}

async function expectDashboard(page: Page, identity: SyntheticIdentity): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByText(`Signed in as ${identity.id}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Role: ${identity.role}`, { exact: true })).toBeVisible();
}

async function expectApiIdentity(context: BrowserContext, identity: SyntheticIdentity): Promise<void> {
  const response = await context.request.get('/api/me');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ user: { id: identity.id, role: identity.role } });
}

async function expectApiError(context: BrowserContext, route: '/api/me' | '/api/admin',
  status: 401 | 403, error: 'Authentication required' | 'Access denied'): Promise<void> {
  const response = await context.request.get(route);
  expect(response.status()).toBe(status);
  expect(await response.json()).toEqual({ error });
}

async function expectDeniedUi(page: Page, route: '/dashboard' | '/admin',
  status: 401 | 403, message: 'Authentication required' | 'Access denied'): Promise<void> {
  const response = await page.goto(route);
  expect(response?.status()).toBe(status);
  await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(message);
}

for (const role of ['admin', 'standard'] as const) {
  const authCase = role === 'admin' ? authCases.adminLogin : authCases.standardLogin;
  const identity = identities[role];
  test(caseTitle(authCase), caseDetails(authCase), async ({ page, baseURL }, testInfo) => {
    localBaseURL(baseURL);
    await runWithCleanup(async (addCleanup) => {
      addPageCleanup(addCleanup, page);
      await loginThroughUi(page, identity);
      await expectApiIdentity(page.context(), identity);
      await captureVerificationEvidence(page, testInfo);
    });
  });
}

test(caseTitle(authCases.invalidCredentials), caseDetails(authCases.invalidCredentials),
  async ({ page, baseURL }, testInfo) => {
    localBaseURL(baseURL);
    syntheticPasswords();
    await runWithCleanup(async (addCleanup) => {
      addPageCleanup(addCleanup, page);
      const response = await page.goto('/login');
      expect(response?.status()).toBe(200);
      await page.getByLabel('Username', { exact: true }).fill(`invalid-${randomUUID()}`);
      await page.getByLabel('Password', { exact: true }).fill(randomUUID());
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveText('Invalid credentials');
      await expectDeniedUi(page, '/dashboard', 401, 'Authentication required');
      await expectApiError(page.context(), '/api/me', 401, 'Authentication required');
      await captureVerificationEvidence(page, testInfo);
    });
  });

test(caseTitle(authCases.guestAccess), caseDetails(authCases.guestAccess),
  async ({ page, baseURL }, testInfo) => {
    localBaseURL(baseURL);
    await expectDeniedUi(page, '/dashboard', 401, 'Authentication required');
    await expectDeniedUi(page, '/admin', 401, 'Authentication required');
    await expectApiError(page.context(), '/api/me', 401, 'Authentication required');
    await expectApiError(page.context(), '/api/admin', 401, 'Authentication required');
    await captureVerificationEvidence(page, testInfo);
  });

test(caseTitle(authCases.logout), caseDetails(authCases.logout),
  async ({ page, browser, baseURL }, testInfo) => {
    const fixtureURL = localBaseURL(baseURL);
    await runWithCleanup(async (addCleanup) => {
      addPageCleanup(addCleanup, page);
      await loginThroughUi(page, identities.standard);
      await expectApiIdentity(page.context(), identities.standard);

      const peerContext = await browser.newContext({ baseURL: fixtureURL });
      addContextCleanup(addCleanup, peerContext);
      const peerPage = await peerContext.newPage();
      await loginThroughUi(peerPage, identities.standard);
      await expectApiIdentity(peerContext, identities.standard);

      const preLogoutState = await page.context().storageState();
      const [logoutResponse] = await Promise.all([
        page.waitForResponse((response) => response.url().endsWith('/logout')
          && response.request().method() === 'POST'),
        page.getByRole('button', { name: 'Log out', exact: true }).click(),
      ]);
      expect(logoutResponse.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Logged out', exact: true })).toBeVisible();
      await expectDeniedUi(page, '/dashboard', 401, 'Authentication required');
      await expectApiError(page.context(), '/api/me', 401, 'Authentication required');

      const staleContext = await browser.newContext({ baseURL: fixtureURL, storageState: preLogoutState });
      addContextCleanup(addCleanup, staleContext);
      const stalePage = await staleContext.newPage();
      await expectDeniedUi(stalePage, '/dashboard', 401, 'Authentication required');
      await expectApiError(staleContext, '/api/me', 401, 'Authentication required');
      await expectApiIdentity(peerContext, identities.standard);
      await captureVerificationEvidence(page, testInfo);
    });
  });

test(caseTitle(authCases.inMemoryReuse), caseDetails(authCases.inMemoryReuse),
  async ({ page, browser, baseURL }, testInfo) => {
    const fixtureURL = localBaseURL(baseURL);
    await runWithCleanup(async (addCleanup) => {
      addPageCleanup(addCleanup, page);
      await loginThroughUi(page, identities.admin);
      const state = await page.context().storageState();

      const reusedContext = await browser.newContext({ baseURL: fixtureURL, storageState: state });
      addContextCleanup(addCleanup, reusedContext);
      const reusedPage = await reusedContext.newPage();
      const response = await reusedPage.goto('/dashboard');
      expect(response?.status()).toBe(200);
      await expectDashboard(reusedPage, identities.admin);
      await expectApiIdentity(reusedContext, identities.admin);

      const guestContext = await browser.newContext({ baseURL: fixtureURL });
      addCleanup(() => guestContext.close());
      const guestPage = await guestContext.newPage();
      await expectDeniedUi(guestPage, '/dashboard', 401, 'Authentication required');
      await expectApiError(guestContext, '/api/me', 401, 'Authentication required');
      await captureVerificationEvidence(reusedPage, testInfo);
    });
  });

test(caseTitle(authCases.standardDenied), caseDetails(authCases.standardDenied),
  async ({ page, baseURL }, testInfo) => {
    localBaseURL(baseURL);
    await runWithCleanup(async (addCleanup) => {
      addPageCleanup(addCleanup, page);
      await loginThroughUi(page, identities.standard);
      const dashboard = await page.goto('/dashboard');
      expect(dashboard?.status()).toBe(200);
      await expectDashboard(page, identities.standard);
      await expectDeniedUi(page, '/admin', 403, 'Access denied');
      await expectApiError(page.context(), '/api/admin', 403, 'Access denied');
      await captureVerificationEvidence(page, testInfo);
    });
  });

test(caseTitle(authCases.adminAllowed), caseDetails(authCases.adminAllowed),
  async ({ page, baseURL }, testInfo) => {
    localBaseURL(baseURL);
    await runWithCleanup(async (addCleanup) => {
      addPageCleanup(addCleanup, page);
      await loginThroughUi(page, identities.admin);
      const response = await page.goto('/admin');
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Admin resource', exact: true })).toBeVisible();
      await expect(page.getByText('Signed in as fixture-admin', { exact: true })).toBeVisible();
      await expect(page.getByText('Role: admin', { exact: true })).toBeVisible();
      const apiResponse = await page.context().request.get('/api/admin');
      expect(apiResponse.status()).toBe(200);
      expect(await apiResponse.json()).toEqual({ message: 'Admin access granted' });
      await captureVerificationEvidence(page, testInfo);
    });
  });

test(caseTitle(authCases.roleIsolation), caseDetails(authCases.roleIsolation),
  async ({ browser, baseURL }, testInfo) => {
    const fixtureURL = localBaseURL(baseURL);
    await runWithCleanup(async (addCleanup) => {
      const adminContext = await browser.newContext({ baseURL: fixtureURL });
      addContextCleanup(addCleanup, adminContext);
      const adminPage = await adminContext.newPage();
      await loginThroughUi(adminPage, identities.admin);

      const standardContext = await browser.newContext({ baseURL: fixtureURL });
      addContextCleanup(addCleanup, standardContext);
      const standardPage = await standardContext.newPage();
      await loginThroughUi(standardPage, identities.standard);
      await expectApiIdentity(adminContext, identities.admin);
      await expectApiIdentity(standardContext, identities.standard);

      const adminUi = await adminPage.goto('/admin');
      expect(adminUi?.status()).toBe(200);
      await expect(adminPage.getByRole('heading', { name: 'Admin resource', exact: true })).toBeVisible();
      const adminApi = await adminContext.request.get('/api/admin');
      expect(adminApi.status()).toBe(200);
      expect(await adminApi.json()).toEqual({ message: 'Admin access granted' });
      await expectDeniedUi(standardPage, '/admin', 403, 'Access denied');
      await expectApiError(standardContext, '/api/admin', 403, 'Access denied');

      await logoutContext(standardContext);
      await expectApiError(standardContext, '/api/me', 401, 'Authentication required');
      await expectApiIdentity(adminContext, identities.admin);
      await captureVerificationEvidence(adminPage, testInfo);
    });
  });
