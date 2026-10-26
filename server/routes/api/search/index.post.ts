import { defineHandler } from 'nitro';
import { assertBodySize, HTTPError, readBody } from 'nitro/h3';
import * as v from 'valibot';
import { useBookStore } from '~/server/stores/useBookStore.ts';
import { searchBooks } from '~/server/utils/books.ts';

const searchSchema = v.object({
  query: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
  topK: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)), 5),
  bookId: v.optional(v.pipe(v.string(), v.uuid())),
});

export default defineHandler(async (event) => {
  assertBodySize(event, 16 * 1024);

  const body: unknown = await readBody(event);
  const result = v.safeParse(searchSchema, body);

  if (!result.success) {
    throw new HTTPError({
      status: 400,
      message: 'SEARCH_REQUEST_INVALID',
    });
  }

  const { query, topK, bookId } = result.output;
  const bookStore = useBookStore().get();
  return searchBooks(bookStore, query, topK, bookId);
});
