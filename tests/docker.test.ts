import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import * as v from 'valibot';
import { expect, test } from 'vitest';
import packageJson from '~/package.json' with { type: 'json' };

function docker(arguments_: string[]): string {
  return execFileSync('docker', arguments_, {
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function waitForHealth(container: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = docker(['inspect', '--format', '{{.State.Health.Status}}', container]);
    if (status === 'healthy') {
      return;
    }
    if (status === 'unhealthy') {
      throw new Error('DOCKER_SMOKE_UNHEALTHY');
    }
    // oxlint-disable-next-line no-await-in-loop -- Poll health sequentially until the container is ready.
    await setTimeout(1000);
  }
  throw new Error('DOCKER_SMOKE_START_TIMEOUT');
}

const uploadSchema = v.object({
  bookId: v.pipe(v.string(), v.uuid()),
  pages: v.number(),
  chunks: v.number(),
});

const searchSchema = v.object({
  passages: v.array(
    v.object({
      bookId: v.string(),
      page: v.number(),
    }),
  ),
  context: v.string(),
});

test.skipIf(process.env.RUN_DOCKER_TEST !== '1')(
  'production image ingests PDFs and retrieves cited passages with matching API metadata',
  async () => {
    const container = `zcatalog-smoke-${randomUUID()}`;
    const image = process.env.DOCKER_TEST_IMAGE ?? 'zcatalog:production';
    const imageId = docker(['image', 'inspect', '--format', '{{.Id}}', image]);
    let started = false;

    try {
      docker([
        'run',
        '--detach',
        '--rm',
        '--init',
        '--name',
        container,
        '--publish',
        '127.0.0.1::3000',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        imageId,
      ]);
      started = true;
      expect(docker(['inspect', '--format', '{{.Config.User}}', container])).toBe('node');
      await waitForHealth(container);

      const address = docker(['port', container, '3000/tcp']);
      const base = `http://${address}`;
      const metadataResponse = await fetch(`${base}/_openapi.json`, {
        signal: AbortSignal.timeout(10_000),
      });
      expect(metadataResponse.status).toBe(200);
      const metadata = v.parse(
        v.object({
          info: v.object({
            version: v.string(),
          }),
        }),
        await metadataResponse.json(),
      );
      expect(metadata.info.version).toBe(packageJson.version);

      const form = new FormData();
      form.set('title', 'Production image verification');
      form.set(
        'file',
        new File(
          [
            await readFile(
              new URL(
                '../public/assets/Evaluating the quality of AI document data extraction with small and large language models.pdf',
                import.meta.url,
              ),
            ),
          ],
          'fixture.pdf',
          { type: 'application/pdf' },
        ),
      );
      const uploadResponse = await fetch(`${base}/api/books`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(480_000),
      });
      const uploadBody: unknown = await uploadResponse.json();
      expect(uploadResponse.status, JSON.stringify(uploadBody)).toBe(201);
      const book = v.parse(uploadSchema, uploadBody);
      expect(book.pages).toBe(7);
      expect(book.chunks).toBeGreaterThan(7);

      const searchResponse = await fetch(`${base}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'How is extraction accuracy measured against a source of truth?',
          topK: 5,
          bookId: book.bookId,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const searchBody: unknown = await searchResponse.json();
      expect(searchResponse.status, JSON.stringify(searchBody)).toBe(200);
      const results = v.parse(searchSchema, searchBody);
      expect(results.passages).toHaveLength(5);
      expect(results.passages.every(({ bookId }) => bookId === book.bookId)).toBe(true);
      expect(results.passages.some(({ page }) => page === 3)).toBe(true);
      expect(results.context).toContain('[1] Production image verification');
    } finally {
      if (started) {
        docker(['rm', '--force', container]);
      }
    }
  },
  600_000,
);
