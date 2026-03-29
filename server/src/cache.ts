import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProcessAudioResponse, SourceLanguage, TranscriptSegment } from './types.js';

type CachedTranscript = {
  transcript: TranscriptSegment[];
  sourceLanguage: SourceLanguage;
  cachedAt: string;
};

type CachedResponse = ProcessAudioResponse & {
  cachedAt: string;
};

const cacheRoot = join(process.cwd(), '.cache');
const transcriptCacheRoot = join(cacheRoot, 'transcripts');
const responseCacheRoot = join(cacheRoot, 'responses');

function hashKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function ensureCacheDirectory(directoryPath: string) {
  await mkdir(directoryPath, { recursive: true });
}

async function readJsonFile<T>(filePath: string) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value), 'utf8');
}

export function buildTranscriptCacheKey(cacheKey: string) {
  return hashKey(`transcript:${cacheKey}`);
}

export function buildResponseCacheKey(params: {
  cacheKey: string;
  template: string;
  reportLanguage: string;
  title?: string;
}) {
  return hashKey(
    `response:${params.cacheKey}:${params.template}:${params.reportLanguage}:${params.title ?? ''}`,
  );
}

export async function getCachedTranscript(cacheKey: string) {
  await ensureCacheDirectory(transcriptCacheRoot);
  const cacheId = buildTranscriptCacheKey(cacheKey);
  return readJsonFile<CachedTranscript>(join(transcriptCacheRoot, `${cacheId}.json`));
}

export async function setCachedTranscript(
  cacheKey: string,
  value: {
    transcript: TranscriptSegment[];
    sourceLanguage: SourceLanguage;
  },
) {
  await ensureCacheDirectory(transcriptCacheRoot);
  const cacheId = buildTranscriptCacheKey(cacheKey);
  await writeJsonFile(join(transcriptCacheRoot, `${cacheId}.json`), {
    ...value,
    cachedAt: new Date().toISOString(),
  } satisfies CachedTranscript);
}

export async function getCachedResponse(cacheKey: string) {
  await ensureCacheDirectory(responseCacheRoot);
  return readJsonFile<CachedResponse>(join(responseCacheRoot, `${cacheKey}.json`));
}

export async function setCachedResponse(cacheKey: string, value: ProcessAudioResponse) {
  await ensureCacheDirectory(responseCacheRoot);
  await writeJsonFile(join(responseCacheRoot, `${cacheKey}.json`), {
    ...value,
    cachedAt: new Date().toISOString(),
  } satisfies CachedResponse);
}
