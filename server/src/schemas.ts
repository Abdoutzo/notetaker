import { z } from 'zod';

export const actionItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  owner: z.string().nullable(),
  dueLabel: z.string().nullable(),
  timestampMs: z.number().int().nonnegative().nullable(),
});

export const decisionItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  timestampMs: z.number().int().nonnegative().nullable(),
});

export const riskItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  mitigation: z.string(),
});

export const transcriptSegmentSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});

export const extractedReportSchema = z.object({
  title: z.string(),
  sourceLanguage: z.enum(['fr', 'en', 'mixed', 'unknown']),
  brief: z.object({
    summary: z.string(),
    keyTakeaways: z.array(z.string()).max(8),
    actionItems: z.array(actionItemSchema).max(12),
    decisions: z.array(decisionItemSchema).max(12),
    risks: z.array(riskItemSchema).max(8),
    followUpQuestions: z.array(z.string()).max(8),
  }),
  detailed: z.object({
    executiveSummary: z.string(),
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        paragraphs: z.array(z.string()).nullable(),
        bullets: z.array(z.string()).nullable(),
      }),
    ),
    verificationChecklist: z.array(z.string()).max(8),
  }),
});

export type ExtractedReport = z.infer<typeof extractedReportSchema>;
