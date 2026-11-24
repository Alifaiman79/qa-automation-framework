import { expect, test } from '../../fixtures/testFixtures';

test('DEMO_TC_001 adds a todo item @smoke', {
  tag: '@smoke',
  annotation: [
    { type: 'testCaseId', description: 'DEMO_TC_001' },
    { type: 'testScope', description: 'SMOKE' },
  ],
}, async ({ page }) => {
  await page.goto('./');

  await test.step('Add a todo item and verify it appears in the list', async () => {
    const todoText = 'Check the demo task';
    const newTodo = page.getByPlaceholder('What needs to be done?');

    await newTodo.fill(todoText);
    await newTodo.press('Enter');

    await expect(page.getByRole('listitem').filter({ hasText: todoText })).toHaveCount(1);
  });
});
