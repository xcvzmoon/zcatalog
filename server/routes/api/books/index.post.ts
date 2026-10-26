import { useLogger } from 'evlog/nitro/v3';
import { defineHandler, defineRouteMeta } from 'nitro';
import { assertBodySize, HTTPError } from 'nitro/h3';
import * as v from 'valibot';
import { useBookStore } from '~/server/stores/useBookStore.ts';
import { ingestBook } from '~/server/utils/books.ts';

defineRouteMeta({
  openAPI: {
    tags: ['Books'],
    operationId: 'uploadBook',
    summary: 'Upload and index a PDF book',
    description:
      'Processes a text-based PDF synchronously. The entire multipart request is limited to 250 MiB (262144000 bytes). Every upload creates a new UUID v7 book and UUID v7 passages, including repeated uploads. Originals are not retained. No OCR or password support.',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file', 'title'],
            properties: {
              file: {
                type: 'string',
                format: 'binary',
                contentMediaType: 'application/pdf',
                description: 'PDF bytes beginning with %PDF-, with extractable text.',
              },
              title: {
                type: 'string',
                minLength: 1,
                maxLength: 300,
                description: 'Trimmed title; whitespace-only titles are rejected.',
              },
            },
          },
          encoding: {
            file: {
              contentType: 'application/pdf',
            },
          },
        },
      },
    },
    responses: {
      '201': {
        description: 'Book indexed successfully.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/IngestedBook',
            },
          },
        },
      },
      '400': {
        description:
          'PDF_FILE_REQUIRED, PDF_TITLE_REQUIRED, BOOK_TITLE_INVALID, or PDF_FILE_INVALID.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      '413': {
        description: 'Entire multipart request exceeds 250 MiB.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      '422': {
        description: 'PDF_EXTRACTION_FAILED or PDF_TEXT_REQUIRED.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      '500': {
        description:
          'Unexpected multipart, model download/inference, or storage failure. Writes may be partial.',
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

const titleSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(300));

export default defineHandler(async (event) => {
  const log = useLogger(event);

  log.set({
    action: 'books.ingest',
    stage: 'validate',
  });

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

  log.set({ upload: { bytes: file.size } });

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
  log.set({ stage: 'ingest' });

  const book = await ingestBook(bookStore, byteArray, parsedTitle.output);
  log.set({
    stage: 'complete',
    outcome: 'success',
    book: {
      id: book.bookId,
      pages: book.pages,
      chunks: book.chunks,
    },
  });

  event.res.status = 201;
  return book;
});
