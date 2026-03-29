import type {
  BriefReport,
  MarketInsight,
  ReportArtifact,
  ReportLanguage,
  ReportSession,
  TemplateOption,
} from '@/types/report';

function makeId(seed: string) {
  return `seed-${seed}`;
}

function createReportArtifact(
  title: string,
  brief: BriefReport,
  language: ReportLanguage,
): ReportArtifact {
  const actionBullets = brief.actionItems.map((item) => {
    const owner = item.owner ? ` - ${item.owner}` : '';
    const due = item.dueLabel ? ` - ${item.dueLabel}` : '';

    return `${item.text}${owner}${due}`;
  });

  const decisionBullets = brief.decisions.map((item) => item.text);
  const riskBullets = brief.risks.map((item) => `${item.text} Mitigation: ${item.mitigation}`);

  return {
    title,
    brief,
    detailed: {
      executiveSummary: brief.summary,
      sections: [
        {
          id: 'context',
          title: language === 'fr' ? 'Contexte et objectif' : 'Context and objective',
          paragraphs:
            language === 'fr'
              ? [
                  "Cette version detaillee conserve la logique du brief mais ajoute davantage de contexte pour la relecture, l'alignement et l'export.",
                ]
              : [
                  'This detailed version keeps the logic of the brief while adding more context for review, alignment, and export.',
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
              "Verifier les noms propres, dates, montants et decisions critiques avant diffusion finale.",
              "Confirmer chaque action importante avec le transcript et, si besoin, l'audio source.",
              'Passer le statut a Reviewed ou Final seulement apres relecture humaine.',
            ]
          : [
              'Verify names, dates, amounts, and critical decisions before final distribution.',
              'Confirm every important action against the transcript and, when needed, the source audio.',
              'Move the status to Reviewed or Final only after human review.',
            ],
    },
  };
}

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'meeting',
    label: 'Meeting',
    hint: 'Actions, decisions, blockers, and next steps.',
  },
  {
    id: 'field',
    label: 'Field visit',
    hint: 'Observations, issues, risks, and follow-up on site.',
  },
  {
    id: 'memo',
    label: 'Voice memo',
    hint: 'Fast personal capture with a clean executive recap.',
  },
];

export const PERSONAL_PRODUCT_PRINCIPLES = [
  'Keep the raw audio and make every conclusion traceable to timestamps.',
  'Optimize for one person moving fast, not for a whole workspace admin flow.',
  'Make drafts editable before export so the user stays in control of the final record.',
  'Support messy reality: imports, short voice memos, field notes, and long conversations.',
  'Default to privacy and local drafts, then call a backend only for heavy AI work.',
];

export const BUILD_PRIORITIES = [
  'Reliable capture and import on iPhone.',
  'Structured outputs with templates, not free-form summaries.',
  'Timestamp-backed actions, decisions, and risks.',
  'Offline-safe drafts with a visible processing state.',
  'Simple export to text, markdown, email, or CRM later.',
];

export const MARKET_INSIGHTS: MarketInsight[] = [
  {
    name: 'Otter',
    position: 'Collaborative meeting assistant for shared workspaces.',
    strength: 'Strong live notes, transcripts, summaries, and action items for business meetings.',
    gap: 'Feels team-first and meeting-centric, less focused on private solo capture workflows.',
    sourceUrl: 'https://otter.ai/business',
  },
  {
    name: 'Fireflies',
    position: 'Automation-heavy meeting copilot with live notes and action items.',
    strength: 'Real-time notes, transcript, action extraction, and follow-up integrations.',
    gap: 'Still strongest when it can sit around calls and shared team systems rather than private voice capture.',
    sourceUrl: 'https://fireflies.ai/product/real-time',
  },
  {
    name: 'Granola',
    position: 'Bot-free desktop notepad for people in back-to-back meetings.',
    strength: 'Clean note enhancement flow and customizable formats without meeting bots.',
    gap: 'Desktop-first; less aligned with mobile field capture and on-the-go personal reporting.',
    sourceUrl: 'https://www.granola.ai/',
  },
  {
    name: 'Notta',
    position: 'Transcript-first product with reusable AI note templates.',
    strength: 'Template-driven AI notes, timestamps, and transcript corrections before summary.',
    gap: 'Template generation is useful, but the product still centers around transcript records more than personal operating flow.',
    sourceUrl: 'https://support.notta.ai/hc/en-us/articles/15451756393243-Generate-AI-Notes-with-templates',
  },
  {
    name: 'PLAUD',
    position: 'Hardware-plus-AI recorder with summary templates and traceable answers.',
    strength: 'Excellent capture convenience and answer traceability back to original audio.',
    gap: 'Requires hardware and subscription gravity; less flexible if you want the iPhone alone to be the product.',
    sourceUrl: 'https://www.plaud.ai/products/plaud-note-ai-voice-recorder',
  },
];

export const FRENCH_DEMO_AUDIO = {
  title: 'Conseil municipal - demo francaise',
  fileName: '2024-12-16-partie-1.mp3',
  uri: 'https://ste-elisabeth.qc.ca/wp-content/uploads/2024/12/2024-12-16-partie-1.mp3',
  mimeType: 'audio/mpeg',
  durationMs: 52 * 60 * 1000,
  sizeBytes: 28_000_000,
  sourceLabel: 'Municipalite de Sainte-Elisabeth',
} as const;

export const BUSINESS_DEMO_AUDIO = {
  title: 'Ramkrishna Forgings earnings call - business demo',
  fileName: '10034849.mp3',
  uri: 'https://ramkrishnaforgings.com/wp-content/uploads/2025/08/10034849.mp3',
  mimeType: 'audio/mpeg',
  durationMs: 48 * 60 * 1000,
  sizeBytes: 5_300_000,
  sourceLabel: 'Ramkrishna Forgings Limited',
} as const;

export function createFrenchDemoSession(): ReportSession {
  const createdAt = new Date().toISOString();

  return {
    id: makeId(`french-demo-${Date.now()}`),
    title: FRENCH_DEMO_AUDIO.title,
    createdAt,
    updatedAt: createdAt,
    source: 'import',
    status: 'captured',
    template: 'meeting',
    reportLanguage: 'fr',
    sourceLanguage: 'fr',
    preferredView: 'brief',
    reviewStatus: 'draft',
    favorite: false,
    audio: {
      uri: FRENCH_DEMO_AUDIO.uri,
      durationMs: FRENCH_DEMO_AUDIO.durationMs,
      fileName: FRENCH_DEMO_AUDIO.fileName,
      mimeType: FRENCH_DEMO_AUDIO.mimeType,
      sizeBytes: FRENCH_DEMO_AUDIO.sizeBytes,
    },
  };
}

export function createBusinessDemoSession(): ReportSession {
  const createdAt = new Date().toISOString();

  return {
    id: makeId(`business-demo-${Date.now()}`),
    title: BUSINESS_DEMO_AUDIO.title,
    createdAt,
    updatedAt: createdAt,
    source: 'import',
    status: 'captured',
    template: 'meeting',
    reportLanguage: 'en',
    sourceLanguage: 'en',
    preferredView: 'brief',
    reviewStatus: 'draft',
    favorite: false,
    audio: {
      uri: BUSINESS_DEMO_AUDIO.uri,
      durationMs: BUSINESS_DEMO_AUDIO.durationMs,
      fileName: BUSINESS_DEMO_AUDIO.fileName,
      mimeType: BUSINESS_DEMO_AUDIO.mimeType,
      sizeBytes: BUSINESS_DEMO_AUDIO.sizeBytes,
    },
  };
}

export function createSeedSession(): ReportSession {
  const createdAt = new Date('2026-03-27T09:30:00.000Z').toISOString();
  const brief: BriefReport = {
    summary:
      'The conversation confirmed a recurring pain point: what is promised in pre-sales is not cleanly translated into operational follow-up. The opportunity is a personal assistant that turns ad hoc audio into a reliable action brief.',
    keyTakeaways: [
      'The biggest friction is handoff quality, not just raw transcription accuracy.',
      'Stakeholders care about actionability and traceability more than polished prose.',
      'A private personal workflow is easier to adopt than a full-team meeting bot.',
    ],
    actionItems: [
      {
        id: makeId('action-1'),
        text: 'Draft a first iPhone flow for capture, transcript review, and structured brief generation.',
        owner: 'You',
        dueLabel: 'This week',
        timestampMs: 120_000,
      },
      {
        id: makeId('action-2'),
        text: 'Validate whether field teams prefer "visit report" or "voice memo" as the default template.',
        owner: 'You',
        dueLabel: 'Next client check-in',
        timestampMs: 138_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision-1'),
        text: 'Keep raw audio as the source of truth and build reports as editable overlays.',
        timestampMs: 98_000,
      },
    ],
    risks: [
      {
        id: makeId('risk-1'),
        text: 'If the app feels like another meeting tool, individual users may not adopt it for daily capture.',
        mitigation: 'Position it as a personal operating system for notes, not a team surveillance tool.',
      },
    ],
    followUpQuestions: [
      'Which report template needs the highest quality first: client meeting, field visit, or private memo?',
      'How much editing do users accept before export?',
    ],
  };

  return {
    id: makeId('demo-session'),
    title: 'Client discovery debrief',
    createdAt,
    updatedAt: createdAt,
    source: 'import',
    status: 'ready',
    template: 'meeting',
    reportLanguage: 'en',
    sourceLanguage: 'en',
    preferredView: 'brief',
    reviewStatus: 'reviewed',
    favorite: true,
    audio: {
      uri: 'demo://client-discovery.m4a',
      durationMs: 18 * 60 * 1000 + 42 * 1000,
      fileName: 'client-discovery.m4a',
      mimeType: 'audio/m4a',
      sizeBytes: 9_300_000,
    },
    transcript: [
      {
        id: makeId('seg-1'),
        speaker: 'You',
        startMs: 0,
        endMs: 45_000,
        text: 'Quick debrief after the client call. The main request is faster onboarding and better visibility on field technician availability.',
      },
      {
        id: makeId('seg-2'),
        speaker: 'Client',
        startMs: 45_000,
        endMs: 109_000,
        text: 'They want quote to booking handoff cleaned up. Today too much information is lost between sales and operations.',
      },
      {
        id: makeId('seg-3'),
        speaker: 'You',
        startMs: 109_000,
        endMs: 160_000,
        text: 'Next step is mapping the current workflow, then validating if a lightweight personal reporting app can cover field feedback before a bigger CRM integration.',
      },
    ],
    report: createReportArtifact('Client discovery debrief', brief, 'en'),
  };
}
