import { useLogger } from 'evlog/nitro/v3';
import { defineHandler, defineRouteMeta } from 'nitro';
import { assertBodySize, HTTPError, readBody } from 'nitro/h3';
import * as v from 'valibot';
import { useBookStore } from '~/server/stores/useBookStore.ts';
import { searchBooks } from '~/server/utils/books.ts';

defineRouteMeta({
  openAPI: {
    tags: ['Search'],
    operationId: 'searchBooks',
    summary: 'Retrieve semantically related PDF passages',
    description:
      'JSON request limit: 16 KiB (16384 bytes). Trimmed questions must also fit 256 tokenizer tokens, including special tokens. Uses exact cosine search with no relevance threshold or answer generation. Unknown book UUIDs return no matches.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: {
                type: 'string',
                minLength: 1,
                maxLength: 2000,
                description:
                  'Trimmed, non-empty question, at most 256 model tokens including special tokens.',
              },
              topK: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                default: 5,
              },
              bookId: {
                type: 'string',
                format: 'uuid',
                description:
                  'Optional UUID filter. Generated book IDs use version 7; validation accepts UUIDs.',
              },
            },
          },
          example: {
            query: 'How is extraction accuracy measured against a source of truth?',
            topK: 5,
          },
        },
      },
    },
    responses: {
      '200': {
        description:
          'Ranked passages and numbered context; passages and context are empty if no records match.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/SearchResult',
            },
          },
        },
      },
      '400': {
        description: 'SEARCH_REQUEST_INVALID, SEARCH_QUERY_TOO_LONG, or malformed JSON.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      '413': {
        description: 'Request exceeds 16 KiB.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      '500': {
        description: 'Unexpected model or storage failure.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
    },
  },
});

const searchSchema = v.object({
  query: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
  topK: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)), 5),
  bookId: v.optional(v.pipe(v.string(), v.uuid())),
});

export default defineHandler(async (event) => {
  const log = useLogger(event);

  log.set({
    action: 'books.search',
    stage: 'validate',
  });

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

  log.set({
    stage: 'search',
    search: {
      queryCharacters: query.length,
      topK,
      hasBookFilter: Boolean(bookId),
    },
  });

  if (bookId) {
    log.set({ book: { id: bookId } });
  }

  const bookStore = useBookStore().get();
  const results = await searchBooks(bookStore, query, topK, bookId);

  log.set({
    stage: 'complete',
    outcome: 'success',
    search: { resultCount: results.passages.length },
  });

  return results;
});
