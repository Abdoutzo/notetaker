import type {
  BriefReport,
  ProcessAudioResponse,
  ReportArtifact,
  ReportLanguage,
  ReportSession,
  SourceLanguage,
} from '@/types/report';

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isFrenchSession(session: ReportSession) {
  return (
    session.audio.uri.includes('ste-elisabeth.qc.ca') ||
    session.audio.fileName.toLowerCase().includes('2024-12-16') ||
    session.title.toLowerCase().includes('francaise')
  );
}

function isBusinessDemoSession(session: ReportSession) {
  return (
    session.audio.uri.includes('ramkrishnaforgings.com') ||
    session.audio.fileName.toLowerCase().includes('10034849.mp3') ||
    session.title.toLowerCase().includes('earnings call')
  );
}

function createReportArtifact(
  title: string,
  brief: BriefReport,
  outputLanguage: ReportLanguage,
): ReportArtifact {
  const actionBullets = brief.actionItems.map((item) => {
    const owner = item.owner ? ` - ${item.owner}` : '';
    const due = item.dueLabel ? ` - ${item.dueLabel}` : '';

    return `${item.text}${owner}${due}`;
  });

  const decisionBullets = brief.decisions.map((item) => {
    const timestamp = item.timestampMs !== undefined ? ` (${Math.floor(item.timestampMs / 60000)
      .toString()
      .padStart(2, '0')}:${Math.floor((item.timestampMs % 60000) / 1000)
      .toString()
      .padStart(2, '0')})` : '';

    return `${item.text}${timestamp}`;
  });

  const riskBullets = brief.risks.map((item) => `${item.text} ${item.mitigation}`);

  return {
    title,
    brief,
    detailed: {
      executiveSummary: brief.summary,
      sections: [
        {
          id: 'context',
          title: outputLanguage === 'fr' ? 'Contexte et objectif' : 'Context and objective',
          paragraphs:
            outputLanguage === 'fr'
              ? [
                  "Cette version detaillee est concue pour la relecture, l'alignement et l'export PDF. Elle garde la logique du brief tout en ajoutant plus de contexte narratif.",
                ]
              : [
                  'This detailed version is designed for review, alignment, and PDF export. It keeps the logic of the brief while adding more narrative context.',
                ],
        },
        {
          id: 'takeaways',
          title: outputLanguage === 'fr' ? 'Points cles' : 'Key takeaways',
          bullets: brief.keyTakeaways,
        },
        {
          id: 'actions',
          title: outputLanguage === 'fr' ? "Registre d'actions" : 'Action register',
          bullets: actionBullets,
        },
        {
          id: 'decisions',
          title: outputLanguage === 'fr' ? 'Journal des decisions' : 'Decision log',
          bullets: decisionBullets,
        },
        {
          id: 'risks',
          title: outputLanguage === 'fr' ? 'Registre des risques' : 'Risk register',
          bullets: riskBullets,
        },
        {
          id: 'questions',
          title: outputLanguage === 'fr' ? 'Questions ouvertes' : 'Open questions',
          bullets: brief.followUpQuestions,
        },
      ],
      verificationChecklist:
        outputLanguage === 'fr'
          ? [
              "Verifier les noms propres, dates, montants et decisions critiques avant partage.",
              "Croiser les actions importantes avec le transcript et, si besoin, l'audio source.",
              'Utiliser le statut Reviewed ou Final uniquement apres validation humaine.',
            ]
          : [
              'Verify names, dates, amounts, and critical decisions before sharing.',
              'Cross-check important actions with the transcript and, when needed, the source audio.',
              'Use the Reviewed or Final status only after human validation.',
            ],
    },
  };
}

function buildGenericEnglishMeetingBrief(session: ReportSession): BriefReport {
  return {
    summary:
      'This meeting focused on turning spoken detail into an operationally useful brief. The main requirement is not only transcription accuracy, but a trustworthy record of decisions, actions, and open questions.',
    keyTakeaways: [
      'The value comes from actionability, not from a decorative summary.',
      'Critical points should remain traceable to timestamps or transcript segments.',
      'A reliable review step is necessary before export or distribution.',
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: `Turn "${session.title}" into a validated meeting brief with clear owners and next steps.`,
        owner: 'You',
        dueLabel: 'Today',
        timestampMs: 121_000,
      },
      {
        id: makeId('action'),
        text: 'Review the brief and confirm whether each action is supported by the transcript.',
        owner: 'You',
        dueLabel: 'Before export',
        timestampMs: 143_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: 'The report should distinguish decisions, actions, risks, and open questions.',
        timestampMs: 104_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: 'If the meeting output feels generic, users will not trust it for real follow-up.',
        mitigation: 'Keep the report structured and make every key point traceable to evidence.',
      },
    ],
    followUpQuestions: [
      'Which decisions need explicit confirmation before the final PDF is shared?',
      'Which names, numbers, or dates still need manual verification?',
    ],
  };
}

function buildGenericEnglishFieldBrief(session: ReportSession): BriefReport {
  return {
    summary:
      'This field report is designed to support execution. It separates what was observed, what is risky, and what should happen next.',
    keyTakeaways: [
      'The next intervention should be easier because the note is structured around execution.',
      'Operational constraints matter as much as the technical issue itself.',
      'A field report needs clarity and prioritization more than narrative detail.',
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: `Document the next operational steps after "${session.title}".`,
        owner: 'Operations',
        dueLabel: 'Before next visit',
        timestampMs: 126_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: 'Keep field reports short, structured, and oriented toward the next action.',
        timestampMs: 145_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: 'A vague field note could cause the next visit to miss the real blocker.',
        mitigation: 'Highlight constraints, risks, and required confirmations explicitly.',
      },
    ],
    followUpQuestions: [
      'Which missing inputs could delay the next intervention?',
      'Which constraints must be confirmed before dispatching again?',
    ],
  };
}

function buildGenericEnglishMemoBrief(session: ReportSession): BriefReport {
  return {
    summary:
      'This personal memo captures an idea that needs to become an executable note. The report should help the user move from raw thought to a clear next step.',
    keyTakeaways: [
      'The workflow should stay fast and low-friction.',
      'The summary should sharpen the thinking, not only archive it.',
      'The original audio must remain available for verification.',
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: `Turn "${session.title}" into a compact, reviewable decision note.`,
        owner: 'You',
        dueLabel: 'Now',
        timestampMs: 133_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: 'Position the product as a personal reporting assistant, not a generic recorder.',
        timestampMs: 82_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: 'If capture becomes complicated, users will fall back to a default voice memo app.',
        mitigation: 'Keep recording friction near zero and make structured output the immediate payoff.',
      },
    ],
    followUpQuestions: [
      'What is the next concrete step behind this memo?',
      'What should be validated manually before the note is marked final?',
    ],
  };
}

function buildGenericFrenchMeetingBrief(session: ReportSession): BriefReport {
  return {
    summary:
      "Cette reunion vise a transformer la parole en un compte rendu exploitable. L'enjeu n'est pas seulement la transcription, mais la fiabilite des decisions, actions et questions ouvertes.",
    keyTakeaways: [
      "La valeur vient de l'actionnable, pas seulement du resume.",
      'Les elements critiques doivent rester rattachables au transcript ou aux timecodes.',
      "Une relecture humaine est necessaire avant l'export final.",
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: `Transformer "${session.title}" en brief valide avec responsables et prochaines etapes.`,
        owner: 'Vous',
        dueLabel: "Aujourd'hui",
        timestampMs: 121_000,
      },
      {
        id: makeId('action'),
        text: "Verifier que chaque action importante est bien appuyee par le transcript.",
        owner: 'Vous',
        dueLabel: "Avant l'export",
        timestampMs: 143_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: 'Le rapport doit separer decisions, actions, risques et questions ouvertes.',
        timestampMs: 104_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: "Si le compte rendu reste trop generique, l'utilisateur ne lui fera pas confiance.",
        mitigation: 'Conserver une structure claire et relier les points critiques a des preuves.',
      },
    ],
    followUpQuestions: [
      "Quelles decisions doivent etre confirmees avant le PDF final ?",
      'Quels noms, chiffres ou dates demandent encore verification manuelle ?',
    ],
  };
}

function buildGenericFrenchFieldBrief(session: ReportSession): BriefReport {
  return {
    summary:
      "Ce compte rendu terrain est concu pour l'execution. Il distingue les observations, les risques et les suites a donner.",
    keyTakeaways: [
      "La prochaine intervention doit etre facilitee par la structure du rapport.",
      "Les contraintes operationnelles comptent autant que le probleme technique lui-meme.",
      "Une note terrain doit prioriser la clarte d'action.",
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: `Documenter les prochaines suites operationnelles apres "${session.title}".`,
        owner: 'Operations',
        dueLabel: 'Avant la prochaine visite',
        timestampMs: 126_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: 'Garder les rapports terrain courts, structures et orientes execution.',
        timestampMs: 145_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: 'Une note terrain floue peut faire manquer le vrai blocage a la prochaine visite.',
        mitigation: 'Faire apparaitre explicitement les contraintes, risques et confirmations attendues.',
      },
    ],
    followUpQuestions: [
      'Quelles informations manquantes peuvent retarder la suite ?',
      'Quelles contraintes doivent etre confirmees avant replanification ?',
    ],
  };
}

function buildGenericFrenchMemoBrief(session: ReportSession): BriefReport {
  return {
    summary:
      "Ce memo personnel capture une idee qui doit devenir une note exploitable. Le rapport doit aider a passer d'une pensee brute a une prochaine action claire.",
    keyTakeaways: [
      'Le parcours doit rester tres fluide.',
      'Le compte rendu doit clarifier la pensee, pas seulement la stocker.',
      "L'audio d'origine doit rester disponible pour verification.",
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: `Transformer "${session.title}" en note courte, relisable et exploitable.`,
        owner: 'Vous',
        dueLabel: 'Maintenant',
        timestampMs: 133_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: "Positionner le produit comme un assistant personnel de compte rendu, pas comme un simple dictaphone.",
        timestampMs: 82_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: "Si la capture devient trop complexe, l'utilisateur reviendra a l'application Memo vocale.",
        mitigation: 'Conserver une capture simple et une structuration immediate.',
      },
    ],
    followUpQuestions: [
      'Quelle est la prochaine action concrete derriere ce memo ?',
      'Que faut-il verifier avant de passer le document en Final ?',
    ],
  };
}

function buildFrenchCouncilBrief(outputLanguage: ReportLanguage): BriefReport {
  if (outputLanguage === 'en') {
    return {
      summary:
        'This council meeting shows why a structured report matters more than a loose summary. The real value comes from turning speech into follow-up: decisions, owners, risks, and unresolved questions.',
      keyTakeaways: [
        'The core need is post-meeting follow-through, not summary polish.',
        'Important actions should be explicit and assigned whenever possible.',
        'Traceability to timestamps increases trust in the final report.',
      ],
      actionItems: [
        {
          id: makeId('action'),
          text: 'Formalize the list of decisions taken during the meeting.',
          owner: 'Secretariat',
          dueLabel: 'After the meeting',
          timestampMs: 124_000,
        },
        {
          id: makeId('action'),
          text: 'Prepare a follow-up for points that still require validation or arbitration.',
          owner: 'General management',
          dueLabel: 'Before the next meeting',
          timestampMs: 149_000,
        },
      ],
      decisions: [
        {
          id: makeId('decision'),
          text: 'The report should clearly separate decisions, actions, and open questions.',
          timestampMs: 138_000,
        },
      ],
      risks: [
        {
          id: makeId('risk'),
          text: 'If decisions and next steps are not formalized, part of the meeting commitment could be lost.',
          mitigation: 'Keep a fixed structure and tie the key points back to timestamped evidence.',
        },
      ],
      followUpQuestions: [
        'Which topics must be followed before the next council meeting?',
        'Which decisions are fully confirmed and which still require validation?',
      ],
    };
  }

  return {
    summary:
      "Cette seance montre bien le besoin d'un compte rendu structure plutot qu'un simple resume libre. L'essentiel est de transformer la parole en suivi concret : decisions, responsables, risques et points a clarifier.",
    keyTakeaways: [
      'Le besoin principal est la clarte du suivi apres reunion.',
      'Les actions doivent etre explicites, avec un responsable ou un prochain pas identifiable.',
      'Le compte rendu gagne en valeur quand il reste relie a des extraits et des timecodes.',
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: 'Formaliser la liste des decisions prises pendant la seance.',
        owner: 'Secretariat',
        dueLabel: 'Apres la reunion',
        timestampMs: 124_000,
      },
      {
        id: makeId('action'),
        text: 'Preparer un suivi des points qui demandent encore validation ou arbitrage.',
        owner: 'Direction generale',
        dueLabel: 'Avant la prochaine seance',
        timestampMs: 149_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: 'Le compte rendu devra separer clairement decisions, actions et questions ouvertes.',
        timestampMs: 138_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: "Si les decisions et les suites ne sont pas formalisees, une partie des engagements de la reunion risque d'etre perdue.",
        mitigation: 'Conserver une structure fixe et rattacher les elements clefs a des segments horodates.',
      },
    ],
    followUpQuestions: [
      'Quels sujets doivent absolument etre suivis avant la prochaine seance ?',
      'Quelles decisions sont deja valides et lesquelles restent a confirmer ?',
    ],
  };
}

function buildBusinessCallBrief(outputLanguage: ReportLanguage): BriefReport {
  if (outputLanguage === 'fr') {
    return {
      summary:
        "Cet earnings call ressemble a une reunion business brute : management, performance trimestrielle, pression sur les marges, capacite, demande et questions d'analystes. Le bon compte rendu doit faire ressortir les signaux de pilotage sans perdre la logique de l'echange oral.",
      keyTakeaways: [
        'Les themes structurants sont la trajectoire de demande, la discipline de marge et le rythme des investissements.',
        "Les questions des analystes servent surtout a tester la solidite de l'execution et des priorites du trimestre.",
        "Le rapport doit isoler les messages de direction, les engagements implicites et les points qui demandent verification.",
      ],
      actionItems: [
        {
          id: makeId('action'),
          text: "Formaliser les points de pilotage trimestriels ressortis de l'earnings call.",
          owner: 'FP&A',
          dueLabel: 'Apres ecoute',
          timestampMs: 173_000,
        },
        {
          id: makeId('action'),
          text: 'Verifier les messages lies aux marges, au mix produits et au rythme des capex avant diffusion.',
          owner: 'Investor relations',
          dueLabel: 'Avant partage',
          timestampMs: 242_000,
        },
      ],
      decisions: [
        {
          id: makeId('decision'),
          text: "Le compte rendu doit distinguer performance constatee, commentaires de management et questions des analystes.",
          timestampMs: 129_000,
        },
      ],
      risks: [
        {
          id: makeId('risk'),
          text: "Un resume trop libre peut melanger faits annonces, interpretation et points encore incertains.",
          mitigation: 'Rattacher les messages critiques au transcript et marquer les zones a confirmer.',
        },
      ],
      followUpQuestions: [
        'Quels messages relevent de faits trimestriels explicites et lesquels sont des signaux de perspective ?',
        "Quels chiffres, noms de clients ou hypotheses de demande doivent etre verifies avant un export final ?",
      ],
    };
  }

  return {
    summary:
      'This earnings call is a good raw business-meeting test case: management commentary, quarterly performance, margin pressure, capacity planning, demand signals, and analyst questions. The right report should surface operational meaning without flattening the spoken exchange into a loose recap.',
    keyTakeaways: [
      'The core themes are demand trajectory, margin discipline, and investment timing.',
      'Analyst questions are probing execution strength rather than only replaying prepared remarks.',
      'The report should separate management statements, evidence-backed facts, and items that still need verification.',
    ],
    actionItems: [
      {
        id: makeId('action'),
        text: 'Capture the quarter-level operating signals surfaced during the earnings call.',
        owner: 'FP&A',
        dueLabel: 'After review',
        timestampMs: 173_000,
      },
      {
        id: makeId('action'),
        text: 'Validate margin, product-mix, and capex commentary before forwarding the brief.',
        owner: 'Investor relations',
        dueLabel: 'Before distribution',
        timestampMs: 242_000,
      },
    ],
    decisions: [
      {
        id: makeId('decision'),
        text: 'The report should distinguish reported performance, management commentary, and analyst questions.',
        timestampMs: 129_000,
      },
    ],
    risks: [
      {
        id: makeId('risk'),
        text: 'A free-form summary can blur announced facts, interpretation, and still-uncertain signals.',
        mitigation: 'Attach critical messages to transcript evidence and flag items that need explicit confirmation.',
      },
    ],
    followUpQuestions: [
      'Which statements are explicit quarter facts versus forward-looking signals?',
      'Which figures, customer references, or demand assumptions need manual verification before export?',
    ],
  };
}

function buildTranscript(session: ReportSession, outputLanguage: ReportLanguage) {
  if (isBusinessDemoSession(session)) {
    if (outputLanguage === 'fr') {
      return [
        {
          id: makeId('seg'),
          speaker: 'Moderateur',
          startMs: 0,
          endMs: 31_000,
          text: `Ouverture de l'earnings call pour ${session.title}. La discussion couvre la performance du trimestre, la demande par segment, les marges et les questions des analystes.`,
        },
        {
          id: makeId('seg'),
          speaker: 'Direction',
          startMs: 31_000,
          endMs: 109_000,
          text: "Le management revient sur l'activite du trimestre, le niveau de demande chez les clients, la discipline de couts et le rythme des investissements industriels.",
        },
        {
          id: makeId('seg'),
          speaker: 'Analyste',
          startMs: 109_000,
          endMs: 181_000,
          text: "Les questions portent surtout sur la marge, le mix de produits, la visibilite de demande et la confiance de l'entreprise sur la suite de l'exercice.",
        },
      ];
    }

    return [
      {
        id: makeId('seg'),
        speaker: 'Moderator',
        startMs: 0,
        endMs: 31_000,
        text: `Opening remarks for ${session.title}. The call moves through quarterly performance, segment demand, margin profile, and analyst Q&A.`,
      },
      {
        id: makeId('seg'),
        speaker: 'Management',
        startMs: 31_000,
        endMs: 109_000,
        text: 'Management walks through quarterly activity, customer demand, cost discipline, and the pace of manufacturing investments.',
      },
      {
        id: makeId('seg'),
        speaker: 'Analyst',
        startMs: 109_000,
        endMs: 181_000,
        text: 'The questions focus on margin durability, product mix, demand visibility, and the company confidence level for the next quarters.',
      },
    ];
  }

  if (isFrenchSession(session)) {
    if (outputLanguage === 'en') {
      return [
        {
          id: makeId('seg'),
          speaker: 'Chair',
          startMs: 0,
          endMs: 41_000,
          text: `Opening of the meeting for ${session.title}. The discussion focuses on municipal follow-up, field priorities, and upcoming decisions to confirm.`,
        },
        {
          id: makeId('seg'),
          speaker: 'Council member',
          startMs: 41_000,
          endMs: 101_000,
          text: 'The main issue is the coordination between what is said during the meeting and the actions that the administration needs to follow up afterwards.',
        },
        {
          id: makeId('seg'),
          speaker: 'General director',
          startMs: 101_000,
          endMs: 170_000,
          text: 'The report must remain clear, actionable, and verifiable. It should therefore distinguish decisions taken, actions to launch, and questions that remain open.',
        },
      ];
    }

    return [
      {
        id: makeId('seg'),
        speaker: 'Presidence',
        startMs: 0,
        endMs: 41_000,
        text: `Ouverture de la seance pour ${session.title}. Les echanges portent sur le suivi des dossiers municipaux, les priorites de terrain et les prochaines decisions a confirmer.`,
      },
      {
        id: makeId('seg'),
        speaker: 'Conseiller',
        startMs: 41_000,
        endMs: 101_000,
        text: "Le point principal concerne la coordination entre les informations communiquees en reunion et les actions qui doivent etre suivies par l'administration apres la seance.",
      },
      {
        id: makeId('seg'),
        speaker: 'Directrice generale',
        startMs: 101_000,
        endMs: 170_000,
        text: 'Le compte rendu doit rester clair, operable et verifiable. Il faut donc distinguer les decisions prises, les actions a lancer et les questions qui restent ouvertes.',
      },
    ];
  }

  if (outputLanguage === 'fr') {
    return [
      {
        id: makeId('seg'),
        speaker: 'Vous',
        startMs: 0,
        endMs: 38_000,
        text: `Ouverture du memo pour ${session.title}. L'objectif est de capturer les points cles, les blocages et les prochaines decisions sans perdre le contexte de la conversation.`,
      },
      {
        id: makeId('seg'),
        speaker: 'Intervenant',
        startMs: 38_000,
        endMs: 97_000,
        text: "Le principal point de friction concerne l'ecart entre ce qui est dit verbalement et ce qui est reellement formalise ensuite.",
      },
      {
        id: makeId('seg'),
        speaker: 'Vous',
        startMs: 97_000,
        endMs: 165_000,
        text: "Le rapport doit conserver une trace fiable de l'audio source, proposer un resume clair et isoler les actions, decisions et zones d'incertitude.",
      },
    ];
  }

  return [
    {
      id: makeId('seg'),
      speaker: 'You',
      startMs: 0,
      endMs: 38_000,
      text: `Recording opened for ${session.title}. The goal was to capture the main asks, blockers, and next decisions without losing the detail from the conversation.`,
    },
    {
      id: makeId('seg'),
      speaker: 'Stakeholder',
      startMs: 38_000,
      endMs: 97_000,
      text: 'The biggest pain point is the handoff between what was agreed verbally and what is actually written down afterwards.',
    },
    {
      id: makeId('seg'),
      speaker: 'You',
      startMs: 97_000,
      endMs: 165_000,
      text: 'The report should preserve source evidence, create a concise summary, and isolate actions, decisions, and uncertainty before export.',
    },
  ];
}

function buildBrief(session: ReportSession, outputLanguage: ReportLanguage): BriefReport {
  if (isBusinessDemoSession(session) && session.template === 'meeting') {
    return buildBusinessCallBrief(outputLanguage);
  }

  if (isFrenchSession(session) && session.template === 'meeting') {
    return buildFrenchCouncilBrief(outputLanguage);
  }

  if (outputLanguage === 'fr') {
    switch (session.template) {
      case 'meeting':
        return buildGenericFrenchMeetingBrief(session);
      case 'field':
        return buildGenericFrenchFieldBrief(session);
      case 'memo':
      default:
        return buildGenericFrenchMemoBrief(session);
    }
  }

  switch (session.template) {
    case 'meeting':
      return buildGenericEnglishMeetingBrief(session);
    case 'field':
      return buildGenericEnglishFieldBrief(session);
    case 'memo':
    default:
      return buildGenericEnglishMemoBrief(session);
  }
}

export async function generateMockReport(session: ReportSession): Promise<ProcessAudioResponse> {
  await delay(1400);

  const outputLanguage = session.reportLanguage;
  const sourceLanguage: SourceLanguage = isFrenchSession(session) ? 'fr' : 'en';
  const transcript = buildTranscript(session, outputLanguage);
  const brief = buildBrief(session, outputLanguage);

  return {
    transcript,
    report: createReportArtifact(session.title, brief, outputLanguage),
    sourceLanguage,
  };
}
