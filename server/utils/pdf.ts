import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type BookPage = {
  page: number;
  text: string;
};

export async function extractPages(data: Uint8Array): Promise<BookPage[]> {
  const loading = getDocument({
    useSystemFonts: true,
    data,
  });

  try {
    const document = await loading.promise;
    const pageNumbers = Array.from({ length: document.numPages }, (_, index) => index + 1);

    return await Array.fromAsync(pageNumbers, async (page) => {
      const content = await (await document.getPage(page)).getTextContent();
      let text = '';

      for (const item of content.items) {
        if ('str' in item) {
          text += item.str + (item.hasEOL ? '\n' : ' ');
        }
      }

      return {
        page,
        text: text.trim(),
      };
    });
  } finally {
    await loading.destroy();
  }
}

export function chunkTokens(tokens: number[]): number[][] {
  const chunks: number[][] = [];

  for (let start = 0; start < tokens.length; start += 160) {
    chunks.push(tokens.slice(start, start + 200));

    if (start + 200 >= tokens.length) {
      break;
    }
  }

  return chunks;
}
