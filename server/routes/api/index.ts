import { defineHandler, defineRouteMeta } from 'nitro';

defineRouteMeta({
  openAPI: {
    tags: ['Health'],
    summary: 'Check API availability',
    description:
      'Returns a static response. Does not initialize or check the embedding model or Zvec collection.',
    responses: {
      '200': {
        description: 'API handler is reachable.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['message'],
              properties: {
                message: {
                  type: 'string',
                  example: 'Hello from API!',
                },
              },
            },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          ApiError: {
            type: 'object',
            required: ['message'],
            properties: {
              message: {
                type: 'string',
                description:
                  'Stable app error code for handled application failures; generic message for infrastructure failures.',
              },
              statusCode: {
                type: 'integer',
              },
              status: {
                type: 'integer',
              },
              error: {
                type: 'boolean',
              },
              statusText: {
                type: 'string',
              },
              statusMessage: {
                type: 'string',
              },
              url: {
                type: 'string',
              },
            },
          },
          IngestedBook: {
            type: 'object',
            required: ['bookId', 'title', 'pages', 'chunks'],
            properties: {
              bookId: {
                type: 'string',
                format: 'uuid',
                description: 'UUID v7 generated for this upload or passage.',
              },
              title: {
                type: 'string',
              },
              pages: {
                type: 'integer',
                minimum: 1,
                description: 'All physical pages, including pages with no extracted text.',
              },
              chunks: {
                type: 'integer',
                minimum: 1,
              },
            },
          },
          Passage: {
            type: 'object',
            required: ['id', 'score', 'bookId', 'title', 'page', 'chunk', 'text'],
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
                description: 'UUID v7 generated for this upload or passage.',
              },
              score: {
                type: 'number',
                description:
                  'Raw cosine similarity returned by Zvec; not an answer-confidence probability.',
              },
              bookId: {
                type: 'string',
                format: 'uuid',
                description: 'UUID v7 generated for this upload or passage.',
              },
              title: {
                type: 'string',
              },
              page: {
                type: 'integer',
                minimum: 1,
                description: 'Physical PDF page number, starting at 1.',
              },
              chunk: {
                type: 'integer',
                minimum: 0,
                description: 'Chunk index within the page, starting at 0.',
              },
              text: {
                type: 'string',
                description:
                  'Passage decoded from model tokens; formatting may differ from the PDF.',
              },
            },
          },
          SearchResult: {
            type: 'object',
            required: ['query', 'passages', 'context'],
            properties: {
              query: {
                type: 'string',
                description: 'Trimmed input question.',
              },
              passages: {
                type: 'array',
                maxItems: 20,
                items: {
                  $ref: '#/components/schemas/Passage',
                },
              },
              context: {
                type: 'string',
                description:
                  'Numbered source passages for an answer model. Empty when there are no matches.',
              },
            },
          },
        },
      },
    },
  },
});

export default defineHandler(() => {
  return { message: 'Hello from API!' };
});
