import 'dotenv/config';

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_UPLOAD_MB = 80;
const DEFAULT_SEGMENT_SECONDS = 10 * 60;
const DEFAULT_TRANSCRIPTION_CONCURRENCY = 2;

function required(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function asNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: asNumber(process.env.PORT, DEFAULT_PORT),
  openAiApiKey: required('OPENAI_API_KEY'),
  transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-transcribe-diarize',
  reportModel: process.env.OPENAI_REPORT_MODEL ?? 'gpt-4.1-mini',
  maxUploadBytes: asNumber(process.env.MAX_UPLOAD_MB, DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024,
  segmentSeconds: asNumber(process.env.SEGMENT_SECONDS, DEFAULT_SEGMENT_SECONDS),
  transcriptionConcurrency: asNumber(
    process.env.TRANSCRIPTION_CONCURRENCY,
    DEFAULT_TRANSCRIPTION_CONCURRENCY,
  ),
  enableRemoteSourceUrls: (process.env.ENABLE_REMOTE_SOURCE_URLS ?? 'true') !== 'false',
} as const;
