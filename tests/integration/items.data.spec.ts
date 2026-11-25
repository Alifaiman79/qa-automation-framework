import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { captureVerificationEvidence, expect, test } from '../../fixtures/testFixtures';
import { itemCases, type AcceptedItemCase } from '../../test-data/integration/itemsCases';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function makeAcceptedName(variant: AcceptedItemCase['nameVariant']): string {
  if (variant === 'single-character') return 'x';
  const uniqueName = `item-${randomUUID()}`;
  return variant === 'max-length' ? uniqueName.padEnd(200, 'x') : uniqueName;
}

async function deleteCreatedItem(request: APIRequestContext, itemId: string): Promise<void> {
  await test.step('Delete only the item created by this test', async () => {
    const response = await request.delete(`/api/items/${encodeURIComponent(itemId)}`);
    expect(response.status()).toBe(204);

    const collectionResponse = await request.get('/api/items');
    expect(collectionResponse.status()).toBe(200);
    const collection = await collectionResponse.json() as { items: Array<{ id?: unknown }> };
    expect(collection.items.some((item) => item.id === itemId)).toBe(false);
  });
}

for (const itemCase of itemCases) {
  const details = {
    tag: ['@integration', '@data-driven'],
    annotation: [
      { type: 'testCaseId', description: itemCase.testCaseId },
      { type: 'testScope', description: itemCase.kind === 'accepted' ? 'API_UI_INTEGRATION' : 'API' },
    ],
  };

  if (itemCase.kind === 'accepted') {
    test(`${itemCase.testCaseId} ${itemCase.title}`, details, async ({ page, request }, testInfo) => {
      const itemName = makeAcceptedName(itemCase.nameVariant);
      if (itemCase.nameVariant === 'max-length') expect(itemName).toHaveLength(200);
      if (itemCase.nameVariant === 'single-character') expect(itemName).toHaveLength(1);
      let createdItemId: string | undefined;
      let originalFailure: unknown;
      let testFailed = false;

      try {
        await test.step('Create the item through the local API', async () => {
          const response = await request.post('/api/items', { data: { name: itemName } });
          expect(response.status()).toBe(itemCase.expectedStatus);

          const createdItem = await response.json() as Record<string, unknown>;
          if (!isUuid(createdItem.id)) throw new Error('The create response did not contain a valid item UUID.');
          createdItemId = createdItem.id;
          expect(createdItem.name).toBe(itemName);
        });

        await test.step('Verify the exact item in the browser UI', async () => {
          await page.goto('/');
          const itemList = page.getByRole('list', { name: 'Items' });
          const createdItem = itemList.locator(`li[data-item-id="${createdItemId}"]`);
          await expect(createdItem).toHaveCount(1);
          await expect(createdItem).toHaveText(itemName);
          await captureVerificationEvidence(page, testInfo);
        });
      } catch (error) {
        originalFailure = error;
        testFailed = true;
        throw error;
      } finally {
        if (createdItemId) {
          try {
            await deleteCreatedItem(request, createdItemId);
          } catch (cleanupError) {
            if (testFailed) throw new AggregateError([originalFailure, cleanupError], 'The data-driven test and its cleanup both failed.');
            throw cleanupError;
          }
        }
      }
    });
  } else {
    test(`${itemCase.testCaseId} ${itemCase.title}`, details, async ({ request }) => {
      let unexpectedlyCreatedId: string | undefined;
      let originalFailure: unknown;
      let testFailed = false;

      try {
        await test.step('Reject the invalid name through the local API', async () => {
          const response = await request.post('/api/items', { data: { name: itemCase.name } });
          if (response.ok()) {
            const body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
            if (isUuid(body?.id)) unexpectedlyCreatedId = body.id;
          }

          expect(response.status()).toBe(itemCase.expectedStatus);
          expect(await response.json()).toEqual({ error: itemCase.expectedError });
        });
      } catch (error) {
        originalFailure = error;
        testFailed = true;
        throw error;
      } finally {
        if (unexpectedlyCreatedId) {
          try {
            await deleteCreatedItem(request, unexpectedlyCreatedId);
          } catch (cleanupError) {
            if (testFailed) throw new AggregateError([originalFailure, cleanupError], 'The rejection test and its cleanup both failed.');
            throw cleanupError;
          }
        }
      }
    });
  }
}
