import { createReadStream } from 'node:fs';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { config } from './config.js';
import { extractedReportSchema } from './schemas.js';
import { buildReportSystemPrompt, buildReportUserPrompt } from './prompts.js';
import type {
  ActionItem,
  DecisionItem,
  DetailedSection,
  ProcessAudioInput,
  ProcessAudioResponse,
  SourceLanguage,
  TranscriptSegment,
} from './types.js';

type RawTranscriptSegment = {
  start?: number;
  end?: number;
  text?: string;
  speaker?: string | null;
};

type RawTranscriptionResult = {
  text?: string;
  language?: string;
  segments?: RawTranscriptSegment[];
};

const openai = new OpenAI({
  apiKey: config.openAiApiKey,
});

function makeId(prefix: string, index: number) {
  return `${prefix}_${index + 1}`;
}

function normalizeSourceLanguage(language: string | undefined, fallback: SourceLanguage = 'unknown'): SourceLanguage {
  if (!language) {
    return fallback;
  }

  const normalized = language.toLowerCase();
  if (normalized.startsWith('fr')) {
    return 'fr';
  }
  if (normalized.startsWith('en')) {
    return 'en';
  }

  return fallback;
}

function normalizeSpeaker(label: string | null | undefined, index: number) {
  if (!label || label.trim().length === 0) {
    return `Speaker ${index + 1}`;
  }

  const sanitized = label.replaceAll('_', ' ').trim();
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
}

function mergeTranscriptSegments(segments: TranscriptSegment[]) {
  const merged: TranscriptSegment[] = [];

  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.speaker === segment.speaker &&
      segment.startMs - previous.endMs <= 1500
    ) {
      previous.endMs = segment.endMs;
      previous.text = `${previous.text} ${segment.text}`.trim();
      continue;
    }

    merged.push({ ...segment });
  }

  return merged.map((segment, index) => ({
    ...segment,
    id: makeId('seg', index),
  }));
}

function normalizeNullableActionItems(actionItems: Array<{
  id: string;
  text: string;
  owner: string | null;
  dueLabel: string | null;
  timestampMs: number | null;
}>): ActionItem[] {
  return actionItems.map((item) => ({
    id: item.id,
    text: item.text,
    ...(item.owner ? { owner: item.owner } : {}),
    ...(item.dueLabel ? { dueLabel: item.dueLabel } : {}),
    ...(typeof item.timestampMs === 'number' ? { timestampMs: item.timestampMs } : {}),
  }));
}

function normalizeNullableDecisionItems(decisions: Array<{
  id: string;
  text: string;
  timestampMs: number | null;
}>): DecisionItem[] {
  return decisions.map((item) => ({
    id: item.id,
    text: item.text,
    ...(typeof item.timestampMs === 'number' ? { timestampMs: item.timestampMs } : {}),
  }));
}

function normalizeNullableSections(
  sections: Array<{
    id: string;
    title: string;
    paragraphs: string[] | null;
    bullets: string[] | null;
  }>,
): DetailedSection[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    ...(section.paragraphs?.length ? { paragraphs: section.paragraphs } : {}),
    ...(section.bullets?.length ? { bullets: section.bullets } : {}),
  }));
}

async function transcribeSingleFile(filePath: string, offsetMs: number) {
  const result = (await openai.audio.transcriptions.create({
    model: config.transcriptionModel,
    file: createReadStream(filePath),
    response_format: 'diarized_json',
    chunking_strategy: 'auto',
  })) as unknown as RawTranscriptionResult;

  const rawSegments = Array.isArray(result.segments) ? result.segments : [];
  const normalizedSegments =
    rawSegments.length > 0
      ? rawSegments
          .filter((segment) => typeof segment.text === 'string' && segment.text.trim().length > 0)
          .map((segment, index) => ({
            id: makeId('raw', index),
            speaker: normalizeSpeaker(segment.speaker, index),
            startMs: Math.round((segment.start ?? 0) * 1000) + offsetMs,
            endMs: Math.round((segment.end ?? segment.start ?? 0) * 1000) + offsetMs,
            text: segment.text!.trim(),
          }))
      : [
          {
            id: makeId('raw', 0),
            speaker: 'Speaker 1',
            startMs: offsetMs,
            endMs: offsetMs,
            text: result.text?.trim() ?? '',
          },
        ].filter((segment) => segment.text.length > 0);

  return {
    language: normalizeSourceLanguage(result.language),
    segments: normalizedSegments,
  };
}

export async function transcribeAudio(
  files: Array<{ path: string; offsetMs: number }>,
  onProgress?: (message: string) => void,
) {
  const collectedSegments: TranscriptSegment[] = [];
  const detectedLanguages = new Set<SourceLanguage>();

  const concurrency = Math.max(1, Math.min(config.transcriptionConcurrency, files.length));

  for (let batchStart = 0; batchStart < files.length; batchStart += concurrency) {
    const batch = files.slice(batchStart, batchStart + concurrency);
    batch.forEach((file, batchIndex) => {
      const index = batchStart + batchIndex;
      onProgress?.(
        `transcribing chunk ${index + 1}/${files.length} | offset=${Math.round(file.offsetMs / 1000)}s`,
      );
    });

    const batchResults = await Promise.all(
      batch.map(async (file, batchIndex) => {
        const index = batchStart + batchIndex;
        const transcript = await transcribeSingleFile(file.path, file.offsetMs);
        onProgress?.(
          `chunk ${index + 1}/${files.length} done | segments=${transcript.segments.length} | language=${transcript.language}`,
        );
        return transcript;
      }),
    );

    batchResults.forEach((transcript) => {
      transcript.segments.forEach((segment) => {
        collectedSegments.push(segment);
      });
      detectedLanguages.add(transcript.language);
    });
  }

  const mergedTranscript = mergeTranscriptSegments(
    collectedSegments.sort((left, right) => left.startMs - right.startMs),
  );

  const sourceLanguage: SourceLanguage =
    detectedLanguages.size === 1
      ? [...detectedLanguages][0]
      : detectedLanguages.size > 1
        ? 'mixed'
        : 'unknown';

  return {
    transcript: mergedTranscript,
    sourceLanguage,
  };
}

export async function buildStructuredReport(
  input: ProcessAudioInput,
  transcript: TranscriptSegment[],
  detectedSourceLanguage: SourceLanguage,
): Promise<ProcessAudioResponse> {
  const response = await openai.responses.parse({
    model: config.reportModel,
    input: [
      {
        role: 'system',
        content: buildReportSystemPrompt(),
      },
      {
        role: 'user',
        content: buildReportUserPrompt(input, transcript),
      },
    ],
    text: {
      format: zodTextFormat(extractedReportSchema, 'meeting_report'),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error('The structured report model returned no parsable output.');
  }

  return {
    transcript,
    report: {
      title: parsed.title,
      brief: {
        summary: parsed.brief.summary,
        keyTakeaways: parsed.brief.keyTakeaways,
        actionItems: normalizeNullableActionItems(parsed.brief.actionItems),
        decisions: normalizeNullableDecisionItems(parsed.brief.decisions),
        risks: parsed.brief.risks,
        followUpQuestions: parsed.brief.followUpQuestions,
      },
      detailed: {
        executiveSummary: parsed.detailed.executiveSummary,
        sections: normalizeNullableSections(parsed.detailed.sections),
        verificationChecklist: parsed.detailed.verificationChecklist,
      },
    },
    sourceLanguage: parsed.sourceLanguage === 'unknown' ? detectedSourceLanguage : parsed.sourceLanguage,
  };
}
