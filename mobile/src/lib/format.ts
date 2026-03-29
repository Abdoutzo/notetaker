import type {
  ReportLanguage,
  ReportTemplate,
  ReportViewMode,
  ReviewStatus,
  SessionStatus,
  SourceLanguage,
} from '@/types/report';

function localeFromLanguage(language: ReportLanguage) {
  return language === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatShortDate(isoDate: string, language: ReportLanguage = 'en') {
  return new Intl.DateTimeFormat(localeFromLanguage(language), {
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoDate));
}

export function formatLongDateTime(isoDate: string, language: ReportLanguage = 'en') {
  return new Intl.DateTimeFormat(localeFromLanguage(language), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

export function formatTimecode(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function sessionStatusLabel(status: SessionStatus) {
  switch (status) {
    case 'captured':
      return 'Captured';
    case 'processing':
      return 'Processing';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Needs retry';
    default:
      return status;
  }
}

export function templateLabel(template: ReportTemplate, language: ReportLanguage = 'en') {
  if (language === 'fr') {
    switch (template) {
      case 'meeting':
        return 'Reunion';
      case 'field':
        return 'Visite terrain';
      case 'memo':
        return 'Memo vocal';
      default:
        return template;
    }
  }

  switch (template) {
    case 'meeting':
      return 'Meeting';
    case 'field':
      return 'Field visit';
    case 'memo':
      return 'Voice memo';
    default:
      return template;
  }
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value);
}

export function reportLanguageLabel(language: ReportLanguage, displayLanguage: ReportLanguage = 'en') {
  if (displayLanguage === 'fr') {
    return language === 'fr' ? 'Francais' : 'Anglais';
  }

  return language === 'fr' ? 'French' : 'English';
}

export function sourceLanguageLabel(
  language: SourceLanguage,
  displayLanguage: ReportLanguage = 'en',
) {
  if (displayLanguage === 'fr') {
    switch (language) {
      case 'fr':
        return 'Source francaise';
      case 'en':
        return 'Source anglaise';
      case 'mixed':
        return 'Source mixte';
      case 'unknown':
      default:
        return 'Source inconnue';
    }
  }

  switch (language) {
    case 'fr':
      return 'French source';
    case 'en':
      return 'English source';
    case 'mixed':
      return 'Mixed source';
    case 'unknown':
    default:
      return 'Source unknown';
  }
}

export function reportViewLabel(view: ReportViewMode, language: ReportLanguage = 'en') {
  if (language === 'fr') {
    return view === 'brief' ? 'Bref structure' : 'Rapport detaille';
  }

  return view === 'brief' ? 'Structured brief' : 'Detailed report';
}

export function reviewStatusLabel(status: ReviewStatus, language: ReportLanguage = 'en') {
  if (language === 'fr') {
    switch (status) {
      case 'draft':
        return 'Brouillon';
      case 'reviewed':
        return 'Relu';
      case 'final':
        return 'Final';
      default:
        return status;
    }
  }

  switch (status) {
    case 'draft':
      return 'Draft';
    case 'reviewed':
      return 'Reviewed';
    case 'final':
      return 'Final';
    default:
      return status;
  }
}
