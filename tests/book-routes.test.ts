import { createRequestLogger } from 'evlog';
import { H3 } from 'nitro/h3';
import { expect, test } from 'vitest';
import uploadBook from '~/server/routes/api/books/index.post.ts';
import searchBooks from '~/server/routes/api/search/index.post.ts';

test('multipart uploads reach PDF validation after request size limiting', async () => {
  const app = new H3().post('/api/books', uploadBook);
  const form = new FormData();
  const log = createRequestLogger();
  form.set('title', 'Invalid book');
  form.set('file', new File(['not a PDF'], 'invalid.pdf'));

  const response = await app.request(
    '/api/books',
    {
      method: 'POST',
      body: form,
    },
    { log },
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ message: 'PDF_FILE_INVALID' });
  expect(log.getContext()).toMatchObject({
    action: 'books.ingest',
    stage: 'validate',
    upload: { bytes: 9 },
  });
  expect(JSON.stringify(log.getContext())).not.toContain('Invalid book');
});

test('invalid searches record their operation without logging query text', async () => {
  const app = new H3().post('/api/search', searchBooks);
  const log = createRequestLogger();
  const response = await app.request(
    '/api/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Private question',
        topK: 21,
      }),
    },
    { log },
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ message: 'SEARCH_REQUEST_INVALID' });
  expect(log.getContext()).toMatchObject({
    action: 'books.search',
    stage: 'validate',
  });
  expect(JSON.stringify(log.getContext())).not.toContain('Private question');
});
