import { expect, test } from '../../fixtures/testFixtures';
import {
  createPostPayload,
  existingPostId,
  nonexistentPostId,
  patchPostPayload,
  putPostPayload,
} from '../../test-data/api/postsData';

test('API_TC_001 gets an existing post', {
  tag: '@api',
  annotation: [
    { type: 'testCaseId', description: 'API_TC_001' },
    { type: 'testScope', description: 'API' },
  ],
}, async ({ request }) => {
  await test.step('GET an existing post and validate its response', async () => {
    const response = await request.get(`/posts/${existingPostId}`);
    expect(response.status()).toBe(200);

    const post = await response.json() as Record<string, unknown>;
    expect(post.id).toBe(existingPostId);
    expect(typeof post.title).toBe('string');
    expect(typeof post.body).toBe('string');
    expect(typeof post.userId).toBe('number');
    expect(Array.isArray(post.tags)).toBe(true);
  });
});

test('API_TC_002 simulates post creation', {
  tag: '@api',
  annotation: [
    { type: 'testCaseId', description: 'API_TC_002' },
    { type: 'testScope', description: 'API' },
  ],
}, async ({ request }) => {
  await test.step('POST a synthetic post and validate the simulated create response', async () => {
    const response = await request.post('/posts/add', { data: createPostPayload });
    expect(response.status()).toBe(201);

    const post = await response.json() as Record<string, unknown>;
    expect(typeof post.id).toBe('number');
    expect(post.title).toBe(createPostPayload.title);
    expect(post.body).toBe(createPostPayload.body);
    expect(post.userId).toBe(createPostPayload.userId);
  });
});

test('API_TC_003 simulates a PUT post update', {
  tag: '@api',
  annotation: [
    { type: 'testCaseId', description: 'API_TC_003' },
    { type: 'testScope', description: 'API' },
  ],
}, async ({ request }) => {
  await test.step('PUT a synthetic post update and validate the response', async () => {
    const response = await request.put(`/posts/${existingPostId}`, { data: putPostPayload });
    expect(response.status()).toBe(200);

    const post = await response.json() as Record<string, unknown>;
    expect(post.id).toBe(existingPostId);
    expect(post.title).toBe(putPostPayload.title);
    expect(post.body).toBe(putPostPayload.body);
    expect(post.userId).toBe(putPostPayload.userId);
  });
});

test('API_TC_004 simulates a PATCH post update', {
  tag: '@api',
  annotation: [
    { type: 'testCaseId', description: 'API_TC_004' },
    { type: 'testScope', description: 'API' },
  ],
}, async ({ request }) => {
  await test.step('PATCH a synthetic post title and validate the response', async () => {
    const response = await request.patch(`/posts/${existingPostId}`, { data: patchPostPayload });
    expect(response.status()).toBe(200);

    const post = await response.json() as Record<string, unknown>;
    expect(post.id).toBe(existingPostId);
    expect(post.title).toBe(patchPostPayload.title);
    expect(typeof post.body).toBe('string');
  });
});

test('API_TC_005 simulates post deletion', {
  tag: '@api',
  annotation: [
    { type: 'testCaseId', description: 'API_TC_005' },
    { type: 'testScope', description: 'API' },
  ],
}, async ({ request }) => {
  await test.step('DELETE an existing post and validate the simulated delete response', async () => {
    const response = await request.delete(`/posts/${existingPostId}`);
    expect(response.status()).toBe(200);

    const post = await response.json() as Record<string, unknown>;
    expect(post.id).toBe(existingPostId);
    expect(post.isDeleted).toBe(true);
    expect(typeof post.deletedOn).toBe('string');
  });
});

test('API_TC_006 returns not found for a nonexistent post', {
  tag: '@api',
  annotation: [
    { type: 'testCaseId', description: 'API_TC_006' },
    { type: 'testScope', description: 'API' },
  ],
}, async ({ request }) => {
  await test.step('GET a nonexistent post and validate the not-found response', async () => {
    const response = await request.get(`/posts/${nonexistentPostId}`);
    expect(response.status()).toBe(404);

    const error = await response.json() as Record<string, unknown>;
    expect(typeof error.message).toBe('string');
  });
});
