import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { pipeline } from '@huggingface/transformers';

function loadEmbedder(): Promise<FeatureExtractionPipeline> {
  return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
}

let embedder: ReturnType<typeof loadEmbedder> | undefined;

export async function getEmbedder(): ReturnType<typeof loadEmbedder> {
  embedder ??= loadEmbedder().catch((error: Error) => {
    embedder = undefined;
    throw error;
  });
  return embedder;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output = await extractor(text, {
    pooling: 'mean',
    normalize: true,
  });
  return Array.from(output.data, Number);
}
