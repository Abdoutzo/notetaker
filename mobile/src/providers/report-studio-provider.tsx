import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import React, { createContext, startTransition, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  BUSINESS_DEMO_AUDIO,
  BUILD_PRIORITIES,
  FRENCH_DEMO_AUDIO,
  MARKET_INSIGHTS,
  PERSONAL_PRODUCT_PRINCIPLES,
  TEMPLATE_OPTIONS,
  createBusinessDemoSession,
  createFrenchDemoSession,
  createSeedSession,
} from '@/data/seed';
import { hasConfiguredApi, pingApi, processAudioWithApi } from '@/lib/api';
import { generateMockReport } from '@/lib/mock-ai';
import { exportSessionPdf } from '@/lib/pdf';
import { loadSessions, saveSessions } from '@/lib/session-store';
import type {
  AudioSource,
  ReportLanguage,
  ReportSession,
  ReportTemplate,
  ReportViewMode,
  ReviewStatus,
} from '@/types/report';

type ReportStudioContextValue = {
  sessions: ReportSession[];
  activeSession: ReportSession | null;
  activeSessionId: string | null;
  isHydrated: boolean;
  isRecording: boolean;
  recordingDurationMs: number;
  studioMessage: string;
  pipelineMode: 'api' | 'mock';
  templateOptions: typeof TEMPLATE_OPTIONS;
  marketInsights: typeof MARKET_INSIGHTS;
  personalPrinciples: typeof PERSONAL_PRODUCT_PRINCIPLES;
  buildPriorities: typeof BUILD_PRIORITIES;
  setActiveSession: (sessionId: string) => void;
  setTemplate: (sessionId: string, template: ReportTemplate) => void;
  setReportLanguage: (sessionId: string, language: ReportLanguage) => void;
  setPreferredView: (sessionId: string, view: ReportViewMode) => void;
  setReviewStatus: (sessionId: string, status: ReviewStatus) => void;
  renameSession: (sessionId: string, title: string) => void;
  toggleFavorite: (sessionId: string) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  importAudio: () => Promise<void>;
  loadBusinessDemo: () => void;
  loadFrenchDemo: () => void;
  generateReport: (sessionId?: string) => Promise<void>;
  exportPdf: (sessionId?: string) => Promise<void>;
  checkBackend: () => Promise<void>;
  resetSession: (sessionId?: string) => void;
};

const ReportStudioContext = createContext<ReportStudioContextValue | null>(null);
const isLivePipeline = hasConfiguredApi();

function isBuiltInSeedSession(session: ReportSession) {
  return session.id === 'seed-demo-session' || session.audio.uri.startsWith('demo://');
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

function resetDemoSession(
  session: ReportSession,
  overrides: Partial<ReportSession> = {},
): ReportSession {
  return {
    ...session,
    status: 'captured',
    sourceLanguage: 'unknown',
    preferredView: 'brief',
    reviewStatus: 'draft',
    transcript: undefined,
    report: undefined,
    error: undefined,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createSessionFromAudio({
  source,
  title,
  fileName,
  uri,
  durationMs,
  mimeType,
  sizeBytes,
  webFile,
}: {
  source: AudioSource;
  title: string;
  fileName: string;
  uri: string;
  durationMs: number;
  mimeType?: string;
  sizeBytes?: number;
  webFile?: File;
}): ReportSession {
  const timestamp = new Date().toISOString();

  return {
    id: createId('session'),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    source,
    status: 'captured',
    template: source === 'recording' ? 'memo' : 'meeting',
    reportLanguage: 'en',
    sourceLanguage: 'unknown',
    preferredView: 'brief',
    reviewStatus: 'draft',
    favorite: false,
    audio: {
      uri,
      durationMs,
      fileName,
      mimeType,
      sizeBytes,
      webFile,
    },
  };
}

export function ReportStudioProvider({ children }: React.PropsWithChildren) {
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [recorder, setRecorder] = useState<Audio.Recording | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const inFlightSessionIdsRef = useRef(new Set<string>());
  const [studioMessage, setStudioMessage] = useState(
    isLivePipeline
      ? Platform.OS === 'web'
        ? 'Live processing is ready. Record or import audio in the browser to generate a report.'
        : 'Live processing is ready. Record or import audio to generate a report.'
      : 'Sample mode is active. You can still explore the app flow before connecting a live backend.',
  );

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      const storedSessions = await loadSessions();
      const sanitizedSessions = isLivePipeline
        ? (storedSessions ?? []).filter((session) => !isBuiltInSeedSession(session))
        : storedSessions;
      const initialSessions = sanitizedSessions?.length
        ? sanitizedSessions
        : isLivePipeline
          ? []
          : [createSeedSession()];

      if (!isMounted) {
        return;
      }

      startTransition(() => {
        setSessions(initialSessions);
        setActiveSessionId(initialSessions[0]?.id ?? null);
        setIsHydrated(true);
      });
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    void saveSessions(sessions);
  }, [isHydrated, sessions]);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

  function patchSession(sessionId: string, updater: (current: ReportSession) => ReportSession) {
    setSessions((currentSessions) =>
      currentSessions.map((session) => (session.id === sessionId ? updater(session) : session)),
    );
  }

  function putSession(session: ReportSession) {
    setSessions((currentSessions) => [
      session,
      ...currentSessions.filter((currentSession) => currentSession.id !== session.id),
    ]);
  }

  function invalidateDerivedOutput(session: ReportSession) {
    return {
      ...session,
      status: 'captured' as const,
      transcript: undefined,
      report: undefined,
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  function resetSession(sessionId = activeSessionId ?? undefined) {
    if (!sessionId) {
      return;
    }

    inFlightSessionIdsRef.current.delete(sessionId);
    patchSession(sessionId, (session) => invalidateDerivedOutput(session));
    setStudioMessage(
      isLivePipeline
        ? 'Draft cleared. You can generate the report again when you are ready.'
        : 'Draft cleared. You can generate the sample report again when you are ready.',
    );
  }

  async function startRecording() {
    if (recorder) {
      return;
    }

    const permissionResponse = await Audio.requestPermissionsAsync();
    if (!permissionResponse.granted) {
      setStudioMessage(
        Platform.OS === 'web'
          ? 'Microphone access is required to record in the browser.'
          : 'Microphone access is required to record on iPhone.',
      );
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const nextRecorder = new Audio.Recording();
    nextRecorder.setProgressUpdateInterval(250);
    nextRecorder.setOnRecordingStatusUpdate((status) => {
      if (status.isRecording) {
        setRecordingDurationMs(status.durationMillis ?? 0);
      }
    });

    await nextRecorder.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await nextRecorder.startAsync();
    setRecorder(nextRecorder);
    setRecordingDurationMs(0);
    setStudioMessage(
      Platform.OS === 'web'
        ? 'Recording started in the browser. Speak naturally, then stop when you are ready to structure the note.'
        : 'Recording started. Speak naturally, then stop when you are ready to structure the note.',
    );
  }

  async function stopRecording() {
    if (!recorder) {
      return;
    }

    const currentRecorder = recorder;
    setRecorder(null);

    const status = await currentRecorder.stopAndUnloadAsync();
    const uri = currentRecorder.getURI();

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    if (!uri) {
      setRecordingDurationMs(0);
      setStudioMessage('The recording finished, but no audio file was returned.');
      return;
    }

    const nextSession = createSessionFromAudio({
      source: 'recording',
      title: `Voice memo ${new Date().toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
      fileName: `recording-${Date.now()}.m4a`,
      uri,
      durationMs: status.durationMillis ?? recordingDurationMs,
      mimeType: 'audio/m4a',
    });

    putSession(nextSession);
    setActiveSessionId(nextSession.id);
    setRecordingDurationMs(0);
    setStudioMessage('Recording saved locally. Pick a template and generate the first structured report.');
  }

  async function importAudio() {
    const MAX_WEB_UPLOAD_BYTES = 80 * 1024 * 1024;
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*', 'video/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    const webFile =
      Platform.OS === 'web'
        ? ((asset as typeof asset & { file?: File | null }).file ?? undefined)
        : undefined;

    if ((asset.size ?? 0) > MAX_WEB_UPLOAD_BYTES) {
      setStudioMessage(
        'This file is larger than the current 80 MB upload limit. Compress it or trim it before importing.',
      );
      return;
    }

    if (Platform.OS === 'web' && !webFile) {
      setStudioMessage(
        'This browser did not expose the selected file correctly. Try Safari or re-select the file from Files.',
      );
      return;
    }

    const nextSession = createSessionFromAudio({
      source: 'import',
      title: stripExtension(asset.name),
      fileName: asset.name,
      uri: asset.uri,
      durationMs: 0,
      mimeType: asset.mimeType,
      sizeBytes: asset.size,
      webFile,
    });

    putSession(nextSession);
    setActiveSessionId(nextSession.id);
    setStudioMessage('Audio imported. You can now generate a structured brief from this file.');
  }

  function loadFrenchDemo() {
    const existingSession = sessions.find(
      (session) => session.audio.uri === FRENCH_DEMO_AUDIO.uri,
    );

    if (existingSession) {
      patchSession(existingSession.id, (session) =>
        resetDemoSession(session, {
          reportLanguage: 'fr',
          sourceLanguage: 'fr',
          template: 'meeting',
        }),
      );
      setActiveSessionId(existingSession.id);
      setStudioMessage(
        'French sample ready. Generate the report to review a francophone meeting flow.',
      );
      return;
    }

    const nextSession = createFrenchDemoSession();
    putSession(nextSession);
    setActiveSessionId(nextSession.id);
    setStudioMessage(
      'French sample loaded from a public recording. Generate the report when you want to test the French flow.',
    );
  }

  function loadBusinessDemo() {
    const existingSession = sessions.find(
      (session) => session.audio.uri === BUSINESS_DEMO_AUDIO.uri,
    );

    if (existingSession) {
      patchSession(existingSession.id, (session) =>
        resetDemoSession(session, {
          reportLanguage: 'en',
          sourceLanguage: 'en',
          template: 'meeting',
        }),
      );
      setActiveSessionId(existingSession.id);
      setStudioMessage(
        'English sample ready. Generate the report to review a raw business-call workflow.',
      );
      return;
    }

    const nextSession = createBusinessDemoSession();
    putSession(nextSession);
    setActiveSessionId(nextSession.id);
    setStudioMessage(
      'English sample loaded from a public earnings call. Generate the report when you want to test a longer business audio flow.',
    );
  }

  async function generateReport(sessionId = activeSessionId ?? undefined) {
    if (!sessionId) {
      return;
    }

    if (inFlightSessionIdsRef.current.has(sessionId)) {
      setStudioMessage('This session is already being processed. Wait for the current run to finish.');
      return;
    }

    const session = sessions.find((entry) => entry.id === sessionId);

    if (!session) {
      return;
    }

    inFlightSessionIdsRef.current.add(sessionId);
    patchSession(sessionId, (currentSession) => ({
      ...currentSession,
      status: 'processing',
      error: undefined,
      updatedAt: new Date().toISOString(),
    }));

    setStudioMessage(
      isLivePipeline
        ? 'Processing your audio. Long recordings can take several minutes.'
        : 'Running the local mock pipeline so you can validate the product flow first.',
    );

    try {
      const processed = hasConfiguredApi()
        ? await processAudioWithApi(session, (message) => {
            setStudioMessage(message);
          })
        : await generateMockReport(session);

      startTransition(() => {
        patchSession(sessionId, (currentSession) => ({
          ...currentSession,
          transcript: processed.transcript,
          report: processed.report,
          sourceLanguage: processed.sourceLanguage,
          status: 'ready',
          updatedAt: new Date().toISOString(),
          error: undefined,
        }));
        setActiveSessionId(sessionId);
      });

      setStudioMessage(
        'Report ready. Review the brief, switch to the detailed version, then export the PDF after human validation.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The report generation failed.';

      patchSession(sessionId, (currentSession) => ({
        ...currentSession,
        status: 'failed',
        error: message,
        updatedAt: new Date().toISOString(),
      }));

      setStudioMessage(message);
    } finally {
      inFlightSessionIdsRef.current.delete(sessionId);
    }
  }

  function setTemplate(sessionId: string, template: ReportTemplate) {
    patchSession(sessionId, (session) => ({
      ...(session.template === template ? session : invalidateDerivedOutput(session)),
      template,
    }));
  }

  function setReportLanguage(sessionId: string, language: ReportLanguage) {
    patchSession(sessionId, (session) => ({
      ...(session.reportLanguage === language ? session : invalidateDerivedOutput(session)),
      reportLanguage: language,
    }));
  }

  function setPreferredView(sessionId: string, view: ReportViewMode) {
    patchSession(sessionId, (session) => ({
      ...session,
      preferredView: view,
      updatedAt: new Date().toISOString(),
    }));
  }

  function setReviewStatus(sessionId: string, status: ReviewStatus) {
    patchSession(sessionId, (session) => ({
      ...session,
      reviewStatus: status,
      updatedAt: new Date().toISOString(),
    }));
  }

  function renameSession(sessionId: string, title: string) {
    patchSession(sessionId, (session) => ({
      ...session,
      title,
      updatedAt: new Date().toISOString(),
    }));
  }

  function toggleFavorite(sessionId: string) {
    patchSession(sessionId, (session) => ({
      ...session,
      favorite: !session.favorite,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function exportPdf(sessionId = activeSessionId ?? undefined) {
    if (!sessionId) {
      return;
    }

    const session = sessions.find((entry) => entry.id === sessionId);

    if (!session?.report?.brief || !session.report.detailed) {
      setStudioMessage(
        'Generate or regenerate the report first. The PDF export needs the latest detailed version plus evidence snippets.',
      );
      return;
    }

    try {
      const uri = await exportSessionPdf(session);
      setStudioMessage(
        uri
          ? 'PDF ready. Review the shared file before sending it as a final record.'
          : 'PDF export completed.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The PDF export failed.';
      setStudioMessage(message);
    }
  }

  async function checkBackend() {
    if (!isLivePipeline) {
      setStudioMessage('No backend configured. The app is currently in mock mode.');
      return;
    }

    setStudioMessage(
      Platform.OS === 'web'
        ? 'Checking backend connectivity from this browser...'
        : 'Checking backend connectivity from this device...',
    );

    try {
      const health = await pingApi();
      setStudioMessage(
        `Backend reachable. Transcription: ${health.transcriptionModel}. Report: ${health.reportModel}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The backend health check failed from this device.';
      setStudioMessage(message);
    }
  }

  const value: ReportStudioContextValue = {
    sessions,
    activeSession,
    activeSessionId,
    isHydrated,
    isRecording: Boolean(recorder),
    recordingDurationMs,
    studioMessage,
    pipelineMode: isLivePipeline ? 'api' : 'mock',
    templateOptions: TEMPLATE_OPTIONS,
    marketInsights: MARKET_INSIGHTS,
    personalPrinciples: PERSONAL_PRODUCT_PRINCIPLES,
    buildPriorities: BUILD_PRIORITIES,
    setActiveSession: setActiveSessionId,
    setTemplate,
    setReportLanguage,
    setPreferredView,
    setReviewStatus,
    renameSession,
    toggleFavorite,
    startRecording,
    stopRecording,
    importAudio,
    loadBusinessDemo,
    loadFrenchDemo,
    generateReport,
    exportPdf,
    checkBackend,
    resetSession,
  };

  return <ReportStudioContext.Provider value={value}>{children}</ReportStudioContext.Provider>;
}

export function useReportStudio() {
  const context = useContext(ReportStudioContext);

  if (!context) {
    throw new Error('useReportStudio must be used inside ReportStudioProvider.');
  }

  return context;
}
