import { randomUUID } from 'node:crypto';
import { expect, test } from '../../fixtures/testFixtures';

test('INT_TC_001 API-created item appears in UI @integration', {
  tag: '@integration',
  annotation: [
    { type: 'testCaseId', description: 'INT_TC_001' },
    { type: 'testScope', description: 'API_UI_INTEGRATION' },
  ],
}, async ({ page, request }) => {
  const itemName = `integration-item-${randomUUID()}`;
  let createdItemId: string | undefined;
  let testFailure: unknown;

  try {
    await test.step('Create a unique item through the API', async () => {
      const response = await request.post('/api/items', { data: { name: itemName } });
      expect(response.status()).toBe(201);

      const createdItem = await response.json() as Record<string, unknown>;
      expect(typeof createdItem.id).toBe('string');
      if (typeof createdItem.id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(createdItem.id)) {
        throw new Error('The create response did not contain a valid item ID.');
      }
      createdItemId = createdItem.id;
      expect(createdItem.name).toBe(itemName);
    });

    await test.step('Verify the API-created item appears in the browser UI', async () => {
      await page.goto('/');
      const itemList = page.getByRole('list', { name: 'Items' });
      await expect(itemList.getByRole('listitem')).toHaveText([itemName]);
    });
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    if (createdItemId) {
      try {
        await test.step('Delete the synthetic item through the API', async () => {
          const response = await request.delete(`/api/items/${encodeURIComponent(createdItemId!)}`);
          expect(response.status()).toBe(204);

          const collectionResponse = await request.get('/api/items');
          expect(collectionResponse.status()).toBe(200);
          const collection = await collectionResponse.json() as { items: Array<{ id?: unknown }> };
          expect(collection.items.some((item) => item.id === createdItemId)).toBe(false);
        });
      } catch (cleanupError) {
        if (testFailure) {
          throw new AggregateError([testFailure, cleanupError], 'The integration test and its cleanup both failed.');
        }
        throw cleanupError;
      }
    }
  }
});
