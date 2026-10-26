import { defineHandler } from 'nitro';
import { assertBodySize, HTTPError } from 'nitro/h3';
import * as v from 'valibot';
import { useBookStore } from '~/server/stores/useBookStore.ts';
import { ingestBook } from '~/server/utils/books.ts';

const titleSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(300));

export default defineHandler(async (event) => {
  assertBodySize(event, 250 * 1024 * 1024);

  const formData = await new Response(event.req.body, {
    headers: event.req.headers,
  }).formData();

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new HTTPError({
      status: 400,
      message: 'PDF_FILE_REQUIRED',
    });
  }

  const title = formData.get('title');
  if (!title) {
    throw new HTTPError({
      status: 400,
      message: 'PDF_TITLE_REQUIRED',
    });
  }

  const parsedTitle = v.safeParse(titleSchema, title);
  if (!parsedTitle.success) {
    throw new HTTPError({
      status: 400,
      message: 'BOOK_TITLE_INVALID',
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);
  const decodedData = new TextDecoder().decode(byteArray.subarray(0, 5));

  if (decodedData !== '%PDF-') {
    throw new HTTPError({
      status: 400,
      message: 'PDF_FILE_INVALID',
    });
  }

  const bookStore = useBookStore().get();
  const book = await ingestBook(bookStore, byteArray, parsedTitle.output);
  event.res.status = 201;

  return book;
});
