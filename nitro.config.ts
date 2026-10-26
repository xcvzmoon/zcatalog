import evlog from 'evlog/nitro/v3';
import { defineConfig } from 'nitro';
import { fileURLToPath } from 'node:url';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  compatibilityDate: '2026-10-26',
  serverDir: './server',
  rolldownConfig: {
    external: ['@zvec/zvec', '@huggingface/transformers', 'pdfjs-dist/legacy/build/pdf.mjs'],
  },
  traceDeps: ['@zvec/zvec*', '@huggingface/transformers*', 'pdfjs-dist*', '@napi-rs/canvas*'],
  experimental: {
    openAPI: true,
  },
  alias: {
    '~': fileURLToPath(new URL('.', import.meta.url)),
  },
  openAPI: {
    meta: {
      title: 'ZCatalog',
      description: 'Catalog for Acumen Resources',
      version: packageJson.version,
    },
    production: 'runtime',
  },
  modules: [evlog()],
});
