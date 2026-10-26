// oxlint-disable unicorn/consistent-function-scoping

import {
  type ZVecCollection,
  type ZVecDocInput,
  type ZVecQuery,
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  ZVecOpen,
} from '@zvec/zvec';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as v from 'valibot';

const entrySchema = v.object({
  bookId: v.string(),
  title: v.string(),
  page: v.number(),
  chunk: v.number(),
  text: v.string(),
});

export type Passage = v.InferOutput<typeof entrySchema> & {
  id: string;
  score: number;
};

type BookStore = {
  open: (path: string) => ZVecCollection;
  close: () => void;
  get: () => ZVecCollection;
  set: (store: ZVecCollection, documents: ZVecDocInput[]) => void;
  search: (store: ZVecCollection, vector: number[], topk: number, bookId?: string) => Passage[];
};

let collection: ZVecCollection | undefined;

export function useBookStore(): BookStore {
  function open(path: string): ZVecCollection {
    if (existsSync(path)) {
      return ZVecOpen(path);
    }

    const schema = new ZVecCollectionSchema({
      name: 'book_passages',
      fields: [
        {
          name: 'bookId',
          dataType: ZVecDataType.STRING,
        },
        {
          name: 'title',
          dataType: ZVecDataType.STRING,
        },
        {
          name: 'page',
          dataType: ZVecDataType.INT32,
        },
        {
          name: 'chunk',
          dataType: ZVecDataType.INT32,
        },
        {
          name: 'text',
          dataType: ZVecDataType.STRING,
        },
      ],
      vectors: [
        {
          name: 'embedding',
          dataType: ZVecDataType.VECTOR_FP32,
          dimension: 384,
          indexParams: {
            indexType: ZVecIndexType.FLAT,
            metricType: ZVecMetricType.COSINE,
          },
        },
      ],
    });

    return ZVecCreateAndOpen(path, schema);
  }

  function close(): void {
    collection?.closeSync();
    collection = undefined;
  }

  function get(): ZVecCollection {
    if (!collection) {
      const directory = resolve('.data');
      mkdirSync(directory, { recursive: true });
      collection = open(resolve(directory, 'books-minilm-l6-v2'));
    }

    return collection;
  }

  function set(store: ZVecCollection, documents: ZVecDocInput[]): void {
    for (let start = 0; start < documents.length; start += 1024) {
      const statuses = store.upsertSync(documents.slice(start, start + 1024));
      if (statuses.some(({ ok }) => !ok)) {
        throw new Error('BOOK_INDEX_WRITE_FAILED');
      }
    }
  }

  function search(
    store: ZVecCollection,
    vector: number[],
    topk: number,
    bookId?: string,
  ): Passage[] {
    const query: ZVecQuery = {
      fieldName: 'embedding',
      vector,
      topk,
    };

    if (bookId) {
      query.filter = `bookId = '${bookId}'`;
    }

    const documents = store.querySync(query);
    return documents.map(({ fields, id, score }) => {
      const parsed = v.parse(entrySchema, fields);
      return {
        id,
        score,
        bookId: parsed.bookId,
        title: parsed.title,
        page: parsed.page,
        chunk: parsed.chunk,
        text: parsed.text,
      };
    });
  }

  return { open, close, get, set, search };
}
