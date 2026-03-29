import type { ProcessAudioInput, TranscriptSegment } from './types.js';

function languageLabel(language: ProcessAudioInput['reportLanguage']) {
  return language === 'fr' ? 'French' : 'English';
}

function templateLabel(template: ProcessAudioInput['template']) {
  switch (template) {
    case 'field':
      return 'field visit';
    case 'memo':
      return 'personal voice memo';
    case 'meeting':
    default:
      return 'meeting';
  }
}

function formatTimestamp(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function buildTranscriptForPrompt(transcript: TranscriptSegment[]) {
  return transcript
    .map((segment) => `[${formatTimestamp(segment.startMs)}-${formatTimestamp(segment.endMs)}] ${segment.speaker}: ${segment.text}`)
    .join('\n');
}

export function buildReportSystemPrompt() {
  return [
    'You are an expert meeting analyst and chief-of-staff style note writer.',
    'Your job is to transform raw meeting transcripts into reports that sound professional, natural, and human.',
    'Do not sound robotic, generic, or promotional.',
    'Do not invent facts, names, figures, or decisions that are not supported by the transcript.',
    'When something is uncertain or implied rather than explicit, either omit it or place it in follow-up questions / verification items.',
    'Prefer concrete language, crisp verbs, and readable business prose.',
    'Action items must only be included when they are clearly supported by the transcript.',
    'If an owner, due cue, timestamp, paragraphs array, or bullets array is not available, set that field to null instead of guessing.',
    'The detailed report should read like a polished human-written internal note, not like a machine dump.',
    'Keep the transcript language intact; only the report language changes.',
  ].join(' ');
}

export function buildReportUserPrompt(input: ProcessAudioInput, transcript: TranscriptSegment[]) {
  const transcriptBody = buildTranscriptForPrompt(transcript);

  return `
Create a highly professional report from the transcript below.

Output language: ${languageLabel(input.reportLanguage)}
Meeting type: ${templateLabel(input.template)}
Suggested title from user: ${input.title ?? 'none'}
Recorded at: ${input.recordedAt ?? 'unknown'}

Quality bar:
- sound like an experienced business operator or consultant wrote it
- stay natural and readable
- be accurate and evidence-bound
- separate fact, decision, action, risk, and open question clearly
- do not overstate certainty

Tone guidance:
- professional
- human
- concise but not cold
- specific rather than vague

Detailed report guidance:
- executive summary should be tighter and more senior-facing than the brief summary
- sections should add context, synthesis, and narrative value
- include verification reminders for names, numbers, dates, commitments, and unresolved items

Transcript:
${transcriptBody}
`.trim();
}
