import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  formatDuration,
  formatLongDateTime,
  formatTimecode,
  reportLanguageLabel,
  reviewStatusLabel,
  sourceLanguageLabel,
  templateLabel,
} from '@/lib/format';
import type { DetailedSection, ReportLanguage, ReportSession } from '@/types/report';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderParagraphs(paragraphs?: string[]) {
  return (paragraphs ?? [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

function renderBullets(bullets?: string[]) {
  if (!bullets?.length) {
    return '';
  }

  return `<ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>`;
}

function renderSection(section: DetailedSection) {
  return `
    <section class="section-block">
      <h2>${escapeHtml(section.title)}</h2>
      ${renderParagraphs(section.paragraphs)}
      ${renderBullets(section.bullets)}
    </section>
  `;
}

function labels(language: ReportLanguage) {
  return language === 'fr'
    ? {
        metadata: 'Metadonnees',
        generated: 'Genere le',
        template: 'Template',
        reportLanguage: 'Langue du rapport',
        sourceLanguage: 'Langue source',
        duration: 'Duree',
        status: 'Statut',
        executiveSummary: 'Resume executif',
        verificationChecklist: 'Checklist de verification',
        evidenceLayer: 'Extraits du transcript',
        exportTitle: 'Rapport detaille exportable',
      }
    : {
        metadata: 'Metadata',
        generated: 'Generated',
        template: 'Template',
        reportLanguage: 'Report language',
        sourceLanguage: 'Source language',
        duration: 'Duration',
        status: 'Status',
        executiveSummary: 'Executive summary',
        verificationChecklist: 'Verification checklist',
        evidenceLayer: 'Transcript evidence',
        exportTitle: 'Exportable detailed report',
      };
}

export function buildReportHtml(session: ReportSession) {
  if (!session.report?.brief || !session.report.detailed) {
    throw new Error('Generate a report before exporting a PDF.');
  }

  const copy = labels(session.reportLanguage);
  const transcriptHtml = (session.transcript ?? [])
    .map(
      (segment) => `
        <div class="transcript-item">
          <div class="transcript-meta">
            <strong>${escapeHtml(segment.speaker)}</strong>
            <span>${formatTimecode(segment.startMs)}</span>
          </div>
          <p>${escapeHtml(segment.text)}</p>
        </div>
      `,
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #102029;
            padding: 32px;
            line-height: 1.55;
            background: #fffdf9;
          }
          .header {
            border-bottom: 2px solid #e3c9b0;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 2px;
            font-size: 12px;
            color: #8b674c;
            margin: 0 0 8px;
          }
          h1 {
            font-size: 28px;
            margin: 0 0 10px;
          }
          h2 {
            font-size: 20px;
            margin: 0 0 10px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px 16px;
            margin-top: 16px;
          }
          .meta-card {
            background: #f7efe6;
            border-radius: 14px;
            padding: 12px 14px;
          }
          .meta-card strong {
            display: block;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #7a5e49;
            margin-bottom: 4px;
          }
          .section-block {
            margin-bottom: 22px;
          }
          p {
            margin: 0 0 10px;
          }
          ul {
            margin: 0;
            padding-left: 20px;
          }
          li {
            margin-bottom: 8px;
          }
          .transcript-item {
            border-top: 1px solid #e8d7c8;
            padding: 14px 0;
          }
          .transcript-meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        <header class="header">
          <p class="eyebrow">${escapeHtml(copy.exportTitle)}</p>
          <h1>${escapeHtml(session.report.title)}</h1>
          <p>${escapeHtml(session.report.detailed.executiveSummary)}</p>

          <div class="meta-grid">
            <div class="meta-card">
              <strong>${escapeHtml(copy.generated)}</strong>
              <span>${escapeHtml(formatLongDateTime(session.updatedAt, session.reportLanguage))}</span>
            </div>
            <div class="meta-card">
              <strong>${escapeHtml(copy.template)}</strong>
              <span>${escapeHtml(templateLabel(session.template, session.reportLanguage))}</span>
            </div>
            <div class="meta-card">
              <strong>${escapeHtml(copy.reportLanguage)}</strong>
              <span>${escapeHtml(reportLanguageLabel(session.reportLanguage, session.reportLanguage))}</span>
            </div>
            <div class="meta-card">
              <strong>${escapeHtml(copy.sourceLanguage)}</strong>
              <span>${escapeHtml(sourceLanguageLabel(session.sourceLanguage, session.reportLanguage))}</span>
            </div>
            <div class="meta-card">
              <strong>${escapeHtml(copy.duration)}</strong>
              <span>${escapeHtml(formatDuration(session.audio.durationMs))}</span>
            </div>
            <div class="meta-card">
              <strong>${escapeHtml(copy.status)}</strong>
              <span>${escapeHtml(reviewStatusLabel(session.reviewStatus, session.reportLanguage))}</span>
            </div>
          </div>
        </header>

        <section class="section-block">
          <h2>${escapeHtml(copy.executiveSummary)}</h2>
          <p>${escapeHtml(session.report.detailed.executiveSummary)}</p>
        </section>

        ${session.report.detailed.sections.map(renderSection).join('')}

        <section class="section-block">
          <h2>${escapeHtml(copy.verificationChecklist)}</h2>
          ${renderBullets(session.report.detailed.verificationChecklist)}
        </section>

        ${
          transcriptHtml
            ? `
              <section class="section-block">
                <h2>${escapeHtml(copy.evidenceLayer)}</h2>
                ${transcriptHtml}
              </section>
            `
            : ''
        }
      </body>
    </html>
  `;
}

export async function exportSessionPdf(session: ReportSession) {
  if (!session.report?.brief || !session.report.detailed) {
    throw new Error('Generate a report before exporting a PDF.');
  }

  if (Platform.OS === 'web') {
    await Print.printAsync({
      html: buildReportHtml(session),
    });

    return '';
  }

  const { uri } = await Print.printToFileAsync({
    html: buildReportHtml(session),
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle:
        session.reportLanguage === 'fr' ? 'Partager le rapport PDF' : 'Share the PDF report',
    });
  }

  return uri;
}
