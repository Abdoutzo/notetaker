export type ReportTemplate = 'meeting' | 'field' | 'memo';

export type SessionStatus = 'captured' | 'processing' | 'ready' | 'failed';

export type AudioSource = 'recording' | 'import';

export type ReportLanguage = 'fr' | 'en';

export type SourceLanguage = ReportLanguage | 'mixed' | 'unknown';

export type ReportViewMode = 'brief' | 'detailed';

export type ReviewStatus = 'draft' | 'reviewed' | 'final';

export type TranscriptSegment = {
  id: string;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type ActionItem = {
  id: string;
  text: string;
  owner?: string;
  dueLabel?: string;
  timestampMs?: number;
};

export type DecisionItem = {
  id: string;
  text: string;
  timestampMs?: number;
};

export type RiskItem = {
  id: string;
  text: string;
  mitigation: string;
};

export type BriefReport = {
  summary: string;
  keyTakeaways: string[];
  actionItems: ActionItem[];
  decisions: DecisionItem[];
  risks: RiskItem[];
  followUpQuestions: string[];
};

export type DetailedSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type DetailedReport = {
  executiveSummary: string;
  sections: DetailedSection[];
  verificationChecklist: string[];
};

export type ReportArtifact = {
  title: string;
  brief: BriefReport;
  detailed: DetailedReport;
};

export type AudioAsset = {
  uri: string;
  durationMs: number;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  webFile?: File;
};

export type ReportSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  source: AudioSource;
  status: SessionStatus;
  template: ReportTemplate;
  reportLanguage: ReportLanguage;
  sourceLanguage: SourceLanguage;
  preferredView: ReportViewMode;
  reviewStatus: ReviewStatus;
  audio: AudioAsset;
  transcript?: TranscriptSegment[];
  report?: ReportArtifact;
  error?: string;
  favorite?: boolean;
};

export type TemplateOption = {
  id: ReportTemplate;
  label: string;
  hint: string;
};

export type MarketInsight = {
  name: string;
  position: string;
  strength: string;
  gap: string;
  sourceUrl: string;
};

export type ProcessAudioResponse = {
  transcript: TranscriptSegment[];
  report: ReportArtifact;
  sourceLanguage: SourceLanguage;
};
