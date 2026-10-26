# ZCatalog

PDF book retrieval with Node.js, Nitro v3, and Zvec. Upload a book, then search its content by meaning. Responses include passages with book titles and physical PDF page numbers, plus a context string for a language model.

## Run locally

```bash
pnpm install
pnpm dev
```

Node and pnpm are pinned through `devEngines` in `package.json`. Embeddings run locally with [Transformers.js](https://huggingface.co/docs/transformers.js/api/pipelines) and `Xenova/all-MiniLM-L6-v2`. The first ingestion or search downloads the model from Hugging Face; later requests reuse the cache. No API key is required. The model is intended for English text.

## Upload a book

```bash
curl http://localhost:3000/api/books \
  -F 'file=@/absolute/path/book.pdf' \
  -F 'title=My book'
```

`title` is required. The multipart request limit is 250 MiB. A successful request returns HTTP 201 with `bookId` (a UUID v7), `title`, `pages`, and `chunks`.

Only PDFs with extractable text are supported. Run OCR on scanned books before uploading them. Empty PDFs return `PDF_TEXT_REQUIRED`; corrupt or password-protected PDFs return `PDF_EXTRACTION_FAILED`.

Each page is split into 200-token windows with a 40-token overlap. The model produces normalized, 384-dimensional embeddings. Zvec stores vectors and passage metadata in `.data/books-minilm-l6-v2`, using exact cosine search. Each upload receives a new UUID v7 book ID, including repeated uploads of the same PDF.

## Search

```bash
curl http://localhost:3000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"How do stars form?","topK":5}'
```

Add `"bookId":"<UUID returned by upload>"` to search one book. `topK` defaults to 5 and accepts 1 through 20. Queries must contain text and fit the model's 256-token input limit.

The response contains `query`, `passages`, and `context`. Each passage includes `id`, `bookId`, `title`, `page`, `chunk`, `text`, and Zvec's raw cosine `score`. Page numbers start at 1 and refer to the PDF file, which may differ from printed page numbers. Chunk numbers start at 0 within each page. Passage text is decoded from model tokens, so typography and capitalization can differ from the PDF.

Pass `context` to your answer model alongside the question, instruct it to cite the numbered sources, and treat book content as untrusted data. This service implements retrieval; answer generation is a separate step. Search can return irrelevant passages when the collection lacks an answer, so callers should allow an insufficient-evidence response.

## Verification

```bash
pnpm check
pnpm test
RUN_SEMANTIC_TEST=1 pnpm test
pnpm build
pnpm start
```

Regular tests cover token overlap, extraction of the 7-page AI document extraction article in `public/assets`, Zvec ranking, filtering, repeat writes, and reopening persisted data. The opt-in semantic test downloads the embedding model, indexes the complete book twice to verify distinct UUID v7 IDs, and retrieves cited evaluation methodology passages. It can take several minutes. The book is read directly from disk for testing.

## Deployment

Run one Node server process per collection with a persistent writable `.data` directory. Zvec holds a collection lock; multiple processes must not share that directory. Build for the deployment target's OS and architecture because Zvec and the embedding runtime use native bindings. Nitro preserves these dependencies and PDF.js worker assets in the production output.

Ingestion runs within the HTTP request and prepares a book's embeddings before writing them. Large books can take time and memory; configure your hosting request timeout accordingly. Zvec reports writes per passage, so an infrastructure failure can leave a partial book; a retry creates a new book. This initial API has no authentication. Keep it local or behind access controls when hosting private books.
