import type { ProcessAudioResponse, ReportSession } from '@/types/report';
import { Platform } from 'react-native';

function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? null;
}

const HEALTH_TIMEOUT_MS = 8_000;
const PROCESS_TIMEOUT_MS = 15 * 60 * 1_000;
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

function reachabilityMessage(apiBaseUrl: string) {
  if (Platform.OS === 'web') {
    return `This browser could not reach the backend at ${apiBaseUrl}. Open ${apiBaseUrl}/health in a new tab and confirm the web app is online.`;
  }

  return `This device could not reach the backend at ${apiBaseUrl}. Open ${apiBaseUrl}/health in the browser and confirm the app can access the internet.`;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function hasConfiguredApi() {
  return Boolean(getApiBaseUrl());
}

function buildClientCacheKey(session: ReportSession) {
  return [
    session.audio.uri,
    session.audio.fileName,
    session.audio.durationMs,
    session.audio.sizeBytes ?? 'na',
    session.source,
  ].join('|');
}

export async function pingApi() {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    throw new Error('No API base URL configured.');
  }

  const response = await fetchWithTimeout(
    `${apiBaseUrl}/health`,
    {
      method: 'GET',
    },
    HEALTH_TIMEOUT_MS,
    reachabilityMessage(apiBaseUrl),
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'The backend health check returned an error.');
  }

  return response.json();
}

export async function processAudioWithApi(session: ReportSession): Promise<ProcessAudioResponse> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    throw new Error('No API base URL configured.');
  }

  await pingApi();

  if (
    Platform.OS === 'web' &&
    !/^https?:\/\//i.test(session.audio.uri) &&
    !session.audio.webFile
  ) {
    throw new Error(
      'This browser no longer has access to the selected local file. Re-import the audio, then generate the report again.',
    );
  }

  if (/^https?:\/\//i.test(session.audio.uri)) {
    const response = await fetchWithTimeout(
      `${apiBaseUrl}/v1/reports/process`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template: session.template,
          title: session.title,
          recordedAt: session.createdAt,
          reportLanguage: session.reportLanguage,
          sourceUrl: session.audio.uri,
          cacheKey: buildClientCacheKey(session),
        }),
      },
      PROCESS_TIMEOUT_MS,
      `The backend did not answer in time for ${session.title}. The connectivity check passed, so the server is likely still processing or stuck.`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'The report API returned an error.');
    }

    return (await response.json()) as ProcessAudioResponse;
  }

  const formData = new FormData();
  formData.append('template', session.template);
  formData.append('title', session.title);
  formData.append('recordedAt', session.createdAt);
  formData.append('reportLanguage', session.reportLanguage);
  formData.append('cacheKey', buildClientCacheKey(session));

  if ((session.audio.sizeBytes ?? 0) > MAX_UPLOAD_BYTES) {
    throw new Error('This file is larger than the current 80 MB upload limit.');
  }

  if (session.audio.webFile) {
    formData.append('file', session.audio.webFile, session.audio.fileName);
  } else {
    formData.append('file', {
      uri: session.audio.uri,
      name: session.audio.fileName,
      type: session.audio.mimeType ?? 'audio/m4a',
    } as never);
  }

  const response = await fetchWithTimeout(
    `${apiBaseUrl}/v1/reports/process`,
    {
      method: 'POST',
      body: formData,
    },
    PROCESS_TIMEOUT_MS,
    `The backend did not answer in time for ${session.title}. The connectivity check passed, so the server is likely still processing or stuck.`,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'The report API returned an error.');
  }

  return (await response.json()) as ProcessAudioResponse;
}
