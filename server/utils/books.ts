import type { ZVecCollection, ZVecDocInput } from '@zvec/zvec';
import type { Passage } from '~/server/stores/useBookStore.ts';
import { HTTPError } from 'nitro/h3';
import { v7 as uuidV7 } from 'uuid';
import { useBookStore } from '~/server/stores/useBookStore.ts';
import { embedText, getEmbedder } from '~/server/utils/embeddings.ts';
import { chunkTokens, extractPages } from '~/server/utils/pdf.ts';

type IngestedBook = {
  bookId: string;
  title: string;
  pages: number;
  chunks: number;
};

type SearchResult = {
  query: string;
  passages: Passage[];
  context: string;
};

export async function ingestBook(
  store: ZVecCollection,
  data: Uint8Array,
  title: string,
): Promise<IngestedBook> {
  const bookId = uuidV7();
  const pages = await extractPages(data).catch(() => {
    throw new HTTPError({
      status: 422,
      message: 'PDF_EXTRACTION_FAILED',
    });
  });

  if (!pages.some(({ text }) => text.length > 0)) {
    throw new HTTPError({
      status: 422,
      message: 'PDF_TEXT_REQUIRED',
    });
  }

  const extractor = await getEmbedder();
  const pageDocuments = await Array.fromAsync(pages, async ({ page, text: $text }) => {
    const tokens = extractor.tokenizer.encode($text, { add_special_tokens: false });
    return Array.fromAsync(
      chunkTokens(tokens),
      async (tokenChunk, chunk): Promise<ZVecDocInput> => {
        const text = extractor.tokenizer.decode(tokenChunk, { skip_special_tokens: true });
        const embedding = await embedText(text);
        return {
          id: uuidV7(),
          fields: { bookId, title, page, chunk, text },
          vectors: { embedding },
        };
      },
    );
  });

  const documents = pageDocuments.flat();
  useBookStore().set(store, documents);

  return {
    bookId,
    title,
    pages: pages.length,
    chunks: documents.length,
  };
}

export async function searchBooks(
  store: ZVecCollection,
  query: string,
  topK: number,
  bookId?: string,
): Promise<SearchResult> {
  const extractor = await getEmbedder();
  if (extractor.tokenizer.encode(query).length > 256) {
    throw new HTTPError({
      status: 400,
      message: 'SEARCH_QUERY_TOO_LONG',
    });
  }

  const passages = useBookStore().search(store, await embedText(query), topK, bookId);
  const context = passages
    .map(({ title, page, text }, index) => `[${index + 1}] ${title}, PDF page ${page}\n${text}`)
    .join('\n\n');

  return { query, passages, context };
}
