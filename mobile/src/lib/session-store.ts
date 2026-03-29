import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ActionItem,
  BriefReport,
  DecisionItem,
  DetailedReport,
  ReportArtifact,
  ReportLanguage,
  ReportSession,
  RiskItem,
  TranscriptSegment,
} from '@/types/report';

const STORAGE_KEY = 'memo-flux:sessions:v1';

type LegacyReportShape = {
  title?: string;
  summary?: string;
  keyTakeaways?: string[];
  actionItems?: ActionItem[];
  decisions?: DecisionItem[];
  risks?: RiskItem[];
  followUpQuestions?: string[];
  brief?: BriefReport;
  detailed?: DetailedReport;
};

type StoredSessionShape = Partial<ReportSession> & {
  report?: LegacyReportShape;
};

function ensureArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
}

function createDetailedFromBrief(brief: BriefReport, language: ReportLanguage): DetailedReport {
  const actionBullets = brief.actionItems.map((item) =>
    [item.text, item.owner, item.dueLabel].filter(Boolean).join(' - '),
  );
  const decisionBullets = brief.decisions.map((item) => item.text);
  const riskBullets = brief.risks.map((item) => `${item.text} Mitigation: ${item.mitigation}`);

  return {
    executiveSummary: brief.summary,
    sections: [
      {
        id: 'context',
        title: language === 'fr' ? 'Contexte et objectif' : 'Context and objective',
        paragraphs:
          language === 'fr'
            ? [
                "Rapport migre depuis une ancienne version locale. Regenerer le compte rendu pour obtenir la structure la plus recente.",
              ]
            : [
                'Report migrated from an older local version. Regenerate the report to get the latest structure.',
              ],
      },
      {
        id: 'takeaways',
        title: language === 'fr' ? 'Points cles' : 'Key takeaways',
        bullets: brief.keyTakeaways,
      },
      {
        id: 'actions',
        title: language === 'fr' ? "Registre d'actions" : 'Action register',
        bullets: actionBullets,
      },
      {
        id: 'decisions',
        title: language === 'fr' ? 'Journal des decisions' : 'Decision log',
        bullets: decisionBullets,
      },
      {
        id: 'risks',
        title: language === 'fr' ? 'Registre des risques' : 'Risk register',
        bullets: riskBullets,
      },
      {
        id: 'questions',
        title: language === 'fr' ? 'Questions ouvertes' : 'Open questions',
        bullets: brief.followUpQuestions,
      },
    ],
    verificationChecklist:
      language === 'fr'
        ? [
            "Verifier les noms propres, chiffres et decisions critiques avant partage.",
            "Regenerer le rapport si tu veux la version detaillee la plus recente.",
          ]
        : [
            'Verify names, numbers, and critical decisions before sharing.',
            'Regenerate the report if you want the latest detailed version.',
          ],
  };
}

function normalizeReport(
  report: LegacyReportShape | undefined,
  sessionTitle: string,
  language: ReportLanguage,
): ReportArtifact | undefined {
  if (!report) {
    return undefined;
  }

  const brief =
    report.brief ??
    (typeof report.summary === 'string'
      ? {
          summary: report.summary,
          keyTakeaways: ensureArray(report.keyTakeaways),
          actionItems: ensureArray(report.actionItems),
          decisions: ensureArray(report.decisions),
          risks: ensureArray(report.risks),
          followUpQuestions: ensureArray(report.followUpQuestions),
        }
      : undefined);

  if (!brief) {
    return undefined;
  }

  return {
    title: report.title ?? sessionTitle,
    brief,
    detailed: report.detailed ?? createDetailedFromBrief(brief, language),
  };
}

function normalizeTranscript(transcript: TranscriptSegment[] | undefined) {
  return Array.isArray(transcript) ? transcript : undefined;
}

function normalizeSession(session: StoredSessionShape): ReportSession | null {
  if (!session.id || !session.title || !session.createdAt || !session.updatedAt || !session.audio?.uri) {
    return null;
  }

  const reportLanguage = session.reportLanguage ?? 'en';
  const recoveredStatus = session.status === 'processing' ? 'captured' : session.status ?? 'captured';
  const recoveredError =
    session.status === 'processing'
      ? 'The previous processing run was interrupted. Generate the report again.'
      : session.error;

  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    source: session.source ?? 'import',
    status: recoveredStatus,
    template: session.template ?? 'meeting',
    reportLanguage,
    sourceLanguage: session.sourceLanguage ?? 'unknown',
    preferredView: session.preferredView ?? 'brief',
    reviewStatus: session.reviewStatus ?? 'draft',
    favorite: Boolean(session.favorite),
    audio: {
      uri: session.audio.uri,
      durationMs: session.audio.durationMs ?? 0,
      fileName: session.audio.fileName ?? 'audio-file',
      mimeType: session.audio.mimeType,
      sizeBytes: session.audio.sizeBytes,
    },
    transcript: normalizeTranscript(session.transcript),
    report: normalizeReport(session.report, session.title, reportLanguage),
    error: recoveredError,
  };
}

export async function loadSessions() {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as StoredSessionShape[];

    if (!Array.isArray(parsedValue)) {
      return null;
    }

    const normalizedSessions = parsedValue
      .map(normalizeSession)
      .filter((session): session is ReportSession => Boolean(session));

    return normalizedSessions.length ? normalizedSessions : null;
  } catch {
    return null;
  }
}

export async function saveSessions(sessions: ReportSession[]) {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      sessions.map((session) => ({
        ...session,
        audio: {
          ...session.audio,
          webFile: undefined,
        },
      })),
    ),
  );
}
