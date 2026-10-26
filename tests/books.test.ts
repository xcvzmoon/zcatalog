import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v7 as uuidV7, version as uuidVersion } from 'uuid';
import { expect, test } from 'vitest';
import { useBookStore } from '~/server/stores/useBookStore.ts';
import { ingestBook, searchBooks } from '~/server/utils/books.ts';
import { chunkTokens, extractPages } from '~/server/utils/pdf.ts';

const bookStore = useBookStore();

const cookbookPdfUrl = new URL(
  '../public/assets/Quick and Easy Filipino Cookbook - Quick and easy to prepare at home recipes, step by step guide to the classic Filipino… (Scott Wilson).pdf',
  import.meta.url,
);

async function readCookbookPdf(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(cookbookPdfUrl));
}

test('token windows preserve the tail, overlap, and model input budget', () => {
  const tokens = Array.from(
    {
      length: 531,
    },
    (_, index) => index,
  );

  const chunks = chunkTokens(tokens);
  expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 200, 51]);
  expect(chunks[0]?.slice(-40)).toEqual(chunks[1]?.slice(0, 40));
  expect([...new Set(chunks.flat())]).toEqual(tokens);
  expect(chunkTokens([])).toEqual([]);
});

test('Zvec ranks passages, filters books, upserts, and persists on reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zcatalog-'));
  const path = join(directory, 'books');
  let store = bookStore.open(path);

  const vector = Array.from(
    {
      length: 384,
    },
    (_, index) => (index === 0 ? 1 : 0),
  );

  const otherVector = Array.from(
    {
      length: 384,
    },
    (_, index) => (index === 1 ? 1 : 0),
  );

  const bookId = uuidV7();

  try {
    const documents = [
      {
        id: 'first',
        fields: {
          bookId,
          title: 'Stars',
          page: 3,
          chunk: 0,
          text: 'Astronomy',
        },
        vectors: {
          embedding: vector,
        },
      },
      {
        id: 'second',
        fields: {
          bookId: uuidV7(),
          title: 'Plants',
          page: 1,
          chunk: 0,
          text: 'Botany',
        },
        vectors: {
          embedding: otherVector,
        },
      },
    ];

    bookStore.set(store, documents);
    bookStore.set(store, documents);
    expect(bookStore.search(store, vector, 5).map(({ id }) => id)).toEqual(['first', 'second']);
    expect(bookStore.search(store, otherVector, 5, bookId).map(({ id }) => id)).toEqual(['first']);
    store.closeSync();
    store = bookStore.open(path);
    expect(bookStore.search(store, vector, 1)[0]).toMatchObject({
      title: 'Stars',
      page: 3,
      text: 'Astronomy',
    });
    expect(bookStore.search(store, vector, 5, uuidV7())).toEqual([]);
  } finally {
    store.closeSync();
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }
});

test('invalid PDFs fail extraction', async () => {
  await expect(extractPages(new TextEncoder().encode('not a PDF'))).rejects.toThrow();
});

test('cookbook PDF extraction preserves physical page numbers including blank covers', async () => {
  const pages = await extractPages(await readCookbookPdf());
  expect(pages).toHaveLength(42);
  expect(pages[0]).toEqual({
    page: 1,
    text: '',
  });
  expect(pages[1]).toEqual({
    page: 2,
    text: '',
  });
  expect(pages[2]?.page).toBe(3);
  expect(pages[2]?.text).toContain('COPYRIGHT');
  expect(pages[3]?.text).toContain('CONTENTS');
  expect(pages.every(({ page }, index) => page === index + 1)).toBe(true);
}, 30_000);

test.skipIf(process.env.RUN_SEMANTIC_TEST !== '1')(
  'local embeddings retrieve cited recipe passages from the complete cookbook',
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'zcatalog-semantic-'));
    const store = bookStore.open(join(directory, 'books'));

    try {
      const title = 'Quick and Easy Filipino Cookbook';
      const book = await ingestBook(store, await readCookbookPdf(), title);
      const repeated = await ingestBook(store, await readCookbookPdf(), title);
      expect(uuidVersion(book.bookId)).toBe(7);
      expect(uuidVersion(repeated.bookId)).toBe(7);
      expect(repeated.bookId).not.toBe(book.bookId);
      expect(repeated.pages).toBe(book.pages);
      expect(repeated.chunks).toBe(book.chunks);
      expect(book.pages).toBe(42);
      expect(book.chunks).toBeGreaterThan(42);

      const results = await searchBooks(store, 'How do I make chicken adobo?', 5, book.bookId);
      expect(results.passages).toHaveLength(5);
      expect(results.passages.every(({ bookId }) => bookId === book.bookId)).toBe(true);
      expect(results.passages.some(({ page }) => page === 11 || page === 12)).toBe(true);
      expect(results.context).toContain(`[1] ${title}, PDF page ${results.passages[0]?.page}`);
    } finally {
      store.closeSync();
      rmSync(directory, {
        recursive: true,
        force: true,
      });
    }
  },
  600_000,
);
