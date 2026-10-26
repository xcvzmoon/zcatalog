import { H3 } from 'nitro/h3';
import { expect, test } from 'vitest';
import uploadBook from '~/server/routes/api/books/index.post.ts';

test('multipart uploads reach PDF validation after request size limiting', async () => {
  const app = new H3().post('/api/books', uploadBook);
  const form = new FormData();
  form.set('title', 'Invalid book');
  form.set('file', new File(['not a PDF'], 'invalid.pdf'));

  const response = await app.request('/api/books', {
    method: 'POST',
    body: form,
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ message: 'PDF_FILE_INVALID' });
});
