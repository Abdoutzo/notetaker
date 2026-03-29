export type ReportTemplate = 'meeting' | 'field' | 'memo';
export type ReportLanguage = 'fr' | 'en';
export type SourceLanguage = ReportLanguage | 'mixed' | 'unknown';

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

export type ProcessAudioResponse = {
  transcript: TranscriptSegment[];
  report: ReportArtifact;
  sourceLanguage: SourceLanguage;
};

export type ProcessAudioInput = {
  title?: string;
  template: ReportTemplate;
  reportLanguage: ReportLanguage;
  recordedAt?: string;
};
