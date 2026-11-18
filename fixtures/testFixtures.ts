import { test as base, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

export const test = base;

export { expect };

/** Attach a screenshot at the caller's chosen verification point for the evidence reporter. */
export async function captureVerificationEvidence(page: Page, testInfo: TestInfo): Promise<void> {
  const existingPoints = testInfo.attachments.filter((attachment) =>
    attachment.name.startsWith('verification-point-'),
  ).length;

  await testInfo.attach(`verification-point-${existingPoints + 1}`, {
    body: await page.screenshot({ type: 'png' }),
    contentType: 'image/png',
  });
}
