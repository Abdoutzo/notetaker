import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatDuration,
  formatLongDateTime,
  formatTimecode,
  reportLanguageLabel,
  reportViewLabel,
  reviewStatusLabel,
  sourceLanguageLabel,
  templateLabel,
} from '@/lib/format';
import { useReportStudio } from '@/providers/report-studio-provider';
import type { ReportLanguage, ReportTemplate, ReportViewMode, ReviewStatus } from '@/types/report';

type ButtonTone = 'primary' | 'secondary' | 'ghost';

function getReportCopy(language: ReportLanguage) {
  return language === 'fr'
    ? {
        outputEyebrow: 'Sortie generee',
        briefTitle: 'Bref structure',
        detailedTitle: 'Rapport detaille',
        summary: 'Resume',
        takeaways: 'Points cles',
        actionItems: 'Actions',
        decisions: 'Decisions',
        risks: 'Risques',
        openQuestions: 'Questions ouvertes',
        executiveSummary: 'Resume executif',
        verificationChecklist: 'Checklist de verification',
        transcriptEyebrow: 'Couche de preuve',
        transcriptTitle: 'Extraits du transcript',
        reportLanguage: 'Langue du rapport',
        outputMode: 'Niveau de detail',
        reviewStatus: 'Statut de validation',
        exportPdf: Platform.OS === 'web' ? 'Imprimer / PDF' : 'Exporter PDF',
        reportReadyHint: 'Le PDF assemble la version detaillee et les preuves du transcript.',
        reportReadyHintWeb:
          'Dans le navigateur, le bouton ouvre la boite d impression pour enregistrer en PDF.',
        draftTitle: 'Accuracy maximale = verification humaine',
        draftBody:
          "Aucune transcription n'est parfaite. Utilise le transcript, les timestamps et le statut Reviewed ou Final avant diffusion.",
        webInstallTitle: 'Utiliser MemoFlux comme app web',
        webInstallBody:
          "Sur iPhone, ouvre cette page dans Safari puis Partager > Ajouter a l ecran d accueil pour l utiliser comme une vraie app.",
      }
    : {
        outputEyebrow: 'Generated output',
        briefTitle: 'Structured brief',
        detailedTitle: 'Detailed report',
        summary: 'Summary',
        takeaways: 'Key takeaways',
        actionItems: 'Action items',
        decisions: 'Decisions',
        risks: 'Risks',
        openQuestions: 'Open questions',
        executiveSummary: 'Executive summary',
        verificationChecklist: 'Verification checklist',
        transcriptEyebrow: 'Evidence layer',
        transcriptTitle: 'Transcript snapshots',
        reportLanguage: 'Report language',
        outputMode: 'Detail level',
        reviewStatus: 'Review status',
        exportPdf: Platform.OS === 'web' ? 'Print / PDF' : 'Export PDF',
        reportReadyHint: 'The PDF combines the detailed version and transcript evidence.',
        reportReadyHintWeb:
          'In the browser, the button opens the print dialog so you can save the report as a PDF.',
        draftTitle: 'Maximum accuracy needs human review',
        draftBody:
          'No speech pipeline is perfect. Use the transcript, timestamps, and the Reviewed or Final status before sharing.',
        webInstallTitle: 'Use MemoFlux as a web app',
        webInstallBody:
          'On iPhone, open this page in Safari, then use Share > Add to Home Screen to use it like a real app.',
      };
}

function ActionButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  fullWidth = false,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const theme = useTheme();

  const styleMap: Record<ButtonTone, ViewStyle> = {
    primary: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    secondary: {
      backgroundColor: theme.backgroundElement,
      borderColor: theme.border,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: theme.border,
    },
  };

  const textStyleMap: Record<ButtonTone, TextStyle> = {
    primary: { color: '#fff7ef' },
    secondary: { color: theme.text },
    ghost: { color: theme.textSecondary },
  };

  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[
          styles.button,
          styleMap[tone],
          disabled && styles.buttonDisabled,
          fullWidth && styles.buttonFullWidth,
        ]}>
        <ThemedText type="smallBold" style={[textStyleMap[tone], disabled && styles.buttonTextDisabled]}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function ChoicePill({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[
          styles.choicePill,
          {
            backgroundColor: selected ? theme.accentSoft : theme.background,
            borderColor: selected ? theme.accent : theme.border,
          },
        ]}>
        <ThemedText type="smallBold" style={{ color: selected ? theme.accent : theme.text }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function ControlGroup({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <View style={styles.controlGroup}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.choiceRow}>{children}</View>
    </View>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const {
    activeSession,
    checkBackend,
    exportPdf,
    generateReport,
    importAudio,
    isHydrated,
    isRecording,
    loadBusinessDemo,
    loadFrenchDemo,
    pipelineMode,
    recordingDurationMs,
    renameSession,
    setPreferredView,
    setReportLanguage,
    setReviewStatus,
    setTemplate,
    startRecording,
    stopRecording,
    studioMessage,
    resetSession,
    templateOptions,
  } = useReportStudio();
  const [titleDraft, setTitleDraft] = useState(activeSession?.title ?? '');

  useEffect(() => {
    setTitleDraft(activeSession?.title ?? '');
  }, [activeSession?.id, activeSession?.title]);

  const reportLanguage = activeSession?.reportLanguage ?? 'en';
  const copy = getReportCopy(reportLanguage);
  const canGenerate = Boolean(activeSession) && activeSession?.status !== 'processing' && !isRecording;
  const briefReport = activeSession?.report?.brief;
  const detailedReport = activeSession?.report?.detailed;
  const canExport = Boolean(briefReport && detailedReport);
  const isDebugToolsVisible = __DEV__;
  const isSampleToolsVisible = __DEV__ || pipelineMode === 'mock';
  const isProcessing = activeSession?.status === 'processing';
  const isWeb = Platform.OS === 'web';
  const isCompactLayout = width < 560;
  const estimatedProcessingLabel =
    activeSession && activeSession.audio.durationMs >= 30 * 60 * 1000
      ? reportLanguage === 'fr'
        ? 'Les longs audios peuvent prendre plusieurs minutes.'
        : 'Long recordings can take several minutes.'
      : reportLanguage === 'fr'
        ? 'Les notes courtes finissent souvent en moins d une minute.'
        : 'Short notes often finish in under a minute.';

  async function handlePrimaryAudioAction() {
    if (isRecording) {
      await stopRecording();
      return;
    }

    await startRecording();
  }

  async function handleGenerate() {
    if (!activeSession) {
      return;
    }

    await generateReport(activeSession.id);
  }

  async function handleExport() {
    if (!activeSession) {
      return;
    }

    await exportPdf(activeSession.id);
  }

  function handleTitleChange(nextTitle: string) {
    setTitleDraft(nextTitle);
    if (activeSession) {
      renameSession(activeSession.id, nextTitle || 'Untitled note');
    }
  }

  function handleTemplateChange(template: ReportTemplate) {
    if (!activeSession) {
      return;
    }

    setTemplate(activeSession.id, template);
  }

  function handleLanguageChange(language: ReportLanguage) {
    if (!activeSession) {
      return;
    }

    setReportLanguage(activeSession.id, language);
  }

  function handleViewChange(view: ReportViewMode) {
    if (!activeSession) {
      return;
    }

    setPreferredView(activeSession.id, view);
  }

  function handleReviewStatusChange(status: ReviewStatus) {
    if (!activeSession) {
      return;
    }

    setReviewStatus(activeSession.id, status);
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.backgroundOrb, styles.orbOne]} />
      <View style={[styles.backgroundOrb, styles.orbTwo]} />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.contentColumn, isCompactLayout && styles.contentColumnCompact]}>
            <SectionCard
              inverse
              eyebrow="Studio"
              title="Capture the note. Keep the proof. Export the result."
              action={
                <View style={[styles.modePill, { backgroundColor: theme.accentSoft }]}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    {pipelineMode === 'api' ? 'Live processing' : 'Sample mode'}
                  </ThemedText>
                </View>
              }>
              <ThemedText style={styles.heroCopy}>
                {isWeb
                  ? 'MemoFlux works as a personal web app: record or import audio, generate a clean brief, review the evidence, then save a polished PDF when you are ready.'
                  : 'MemoFlux is built for your own iPhone workflow: record or import audio, generate a clean brief, review the evidence, then export a polished PDF when you are ready.'}
              </ThemedText>

              <View style={[styles.heroMetrics, isCompactLayout && styles.heroMetricsCompact]}>
                <View style={[styles.metricBlock, isCompactLayout && styles.metricBlockCompact]}>
                  <ThemedText type="smallBold" style={styles.inverseMetricLabel}>
                    Capture
                  </ThemedText>
                  <ThemedText style={styles.inverseMetricValue}>
                    {isRecording ? formatDuration(recordingDurationMs) : 'Ready'}
                  </ThemedText>
                </View>
                <View style={[styles.metricBlock, isCompactLayout && styles.metricBlockCompact]}>
                  <ThemedText type="smallBold" style={styles.inverseMetricLabel}>
                    Output
                  </ThemedText>
                  <ThemedText style={styles.inverseMetricValue}>
                    Brief + detailed
                  </ThemedText>
                </View>
                <View style={[styles.metricBlock, isCompactLayout && styles.metricBlockCompact]}>
                  <ThemedText type="smallBold" style={styles.inverseMetricLabel}>
                    Proof
                  </ThemedText>
                  <ThemedText style={styles.inverseMetricValue}>
                    Raw audio + timestamps
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.buttonRow, isCompactLayout && styles.buttonRowCompact]}>
                <ActionButton
                  label={isRecording ? 'Stop recording' : 'Start recording'}
                  onPress={() => void handlePrimaryAudioAction()}
                  fullWidth={isCompactLayout}
                />
                <ActionButton
                  label="Import audio"
                  onPress={() => void importAudio()}
                  tone="secondary"
                  fullWidth={isCompactLayout}
                />
                {isSampleToolsVisible ? (
                  <ActionButton
                    label="English sample"
                    onPress={loadBusinessDemo}
                    tone="secondary"
                    fullWidth={isCompactLayout}
                  />
                ) : null}
                {isSampleToolsVisible ? (
                  <ActionButton
                    label="French sample"
                    onPress={loadFrenchDemo}
                    tone="secondary"
                    fullWidth={isCompactLayout}
                  />
                ) : null}
                <ActionButton
                  label="Clear draft"
                  onPress={() => resetSession(activeSession?.id)}
                  tone="secondary"
                  disabled={!activeSession}
                  fullWidth={isCompactLayout}
                />
                {isDebugToolsVisible ? (
                  <ActionButton
                    label="Check backend"
                    onPress={() => void checkBackend()}
                    tone="secondary"
                    fullWidth={isCompactLayout}
                  />
                ) : null}
                <ActionButton
                  label="Generate report"
                  onPress={() => void handleGenerate()}
                  tone="ghost"
                  disabled={!canGenerate}
                  fullWidth={isCompactLayout}
                />
              </View>

              <ThemedText style={styles.heroStatus}>{studioMessage}</ThemedText>
              <ThemedText style={styles.heroHint}>
                {isSampleToolsVisible
                  ? 'Start with a short note when testing live processing. Reuse the same recording when you want a refined report without paying for a fresh transcription.'
                  : 'Start with a short note for the fastest turnaround. Reuse the same recording when you want a refined report without paying for a fresh transcription.'}
              </ThemedText>
            </SectionCard>

            {isWeb ? (
              <SectionCard eyebrow="Web app" title={copy.webInstallTitle}>
                <ThemedText themeColor="textSecondary">{copy.webInstallBody}</ThemedText>
              </SectionCard>
            ) : null}

            {!isHydrated ? (
              <SectionCard eyebrow="Loading" title="Preparing your local library">
                <ThemedText themeColor="textSecondary">
                  Sessions are being restored from local storage.
                </ThemedText>
              </SectionCard>
            ) : activeSession ? (
              <>
                <SectionCard eyebrow="Current session" title="Review this note before export">
                  <TextInput
                    onChangeText={handleTitleChange}
                    placeholder="Untitled note"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.titleInput,
                      {
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                      },
                    ]}
                    value={titleDraft}
                  />

                  <View style={[styles.sessionMetaRow, isCompactLayout && styles.sessionMetaRowCompact]}>
                    <StatusPill status={activeSession.status} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {templateLabel(activeSession.template, reportLanguage)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatLongDateTime(activeSession.updatedAt, reportLanguage)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDuration(activeSession.audio.durationMs)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {reportLanguageLabel(activeSession.reportLanguage, reportLanguage)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {sourceLanguageLabel(activeSession.sourceLanguage, reportLanguage)}
                    </ThemedText>
                  </View>

                  <ControlGroup label="Template">
                    {templateOptions.map((option) => (
                      <ChoicePill
                        key={option.id}
                        label={option.label}
                        onPress={() => handleTemplateChange(option.id)}
                        selected={option.id === activeSession.template}
                      />
                    ))}
                  </ControlGroup>

                  <ControlGroup label={copy.reportLanguage}>
                    {(['fr', 'en'] as ReportLanguage[]).map((language) => (
                      <ChoicePill
                        key={language}
                        label={reportLanguageLabel(language, reportLanguage)}
                        onPress={() => handleLanguageChange(language)}
                        selected={language === activeSession.reportLanguage}
                      />
                    ))}
                  </ControlGroup>

                  <ControlGroup label={copy.outputMode}>
                    {(['brief', 'detailed'] as ReportViewMode[]).map((view) => (
                      <ChoicePill
                        key={view}
                        label={reportViewLabel(view, reportLanguage)}
                        onPress={() => handleViewChange(view)}
                        selected={view === activeSession.preferredView}
                      />
                    ))}
                  </ControlGroup>

                  <ControlGroup label={copy.reviewStatus}>
                    {(['draft', 'reviewed', 'final'] as ReviewStatus[]).map((status) => (
                      <ChoicePill
                        key={status}
                        label={reviewStatusLabel(status, reportLanguage)}
                        onPress={() => handleReviewStatusChange(status)}
                        selected={status === activeSession.reviewStatus}
                      />
                    ))}
                  </ControlGroup>

                  <ThemedText themeColor="textSecondary">
                    {templateOptions.find((option) => option.id === activeSession.template)?.hint}
                  </ThemedText>

                  {activeSession.error ? (
                    <View style={[styles.alertBox, { backgroundColor: theme.dangerSoft }]}>
                      <ThemedText type="smallBold" style={{ color: theme.danger }}>
                        {activeSession.error}
                      </ThemedText>
                    </View>
                  ) : null}
                </SectionCard>

                {isProcessing ? (
                  <SectionCard eyebrow="Processing" title="Your report is being prepared">
                    <View style={styles.processingRow}>
                      <ActivityIndicator color={theme.accent} size="small" />
                      <View style={styles.processingCopyBlock}>
                        <ThemedText type="smallBold">
                          {reportLanguage === 'fr'
                            ? 'MemoFlux traite l audio et redige le rapport.'
                            : 'MemoFlux is transcribing the audio and drafting the report.'}
                        </ThemedText>
                        <ThemedText themeColor="textSecondary">{estimatedProcessingLabel}</ThemedText>
                      </View>
                    </View>
                  </SectionCard>
                ) : null}

                {briefReport ? (
                  <SectionCard
                    eyebrow={copy.outputEyebrow}
                    title={
                      activeSession.preferredView === 'brief' || !detailedReport
                        ? copy.briefTitle
                        : copy.detailedTitle
                    }
                    action={
                      <ActionButton
                        label={copy.exportPdf}
                        onPress={() => void handleExport()}
                        tone="secondary"
                        disabled={!canExport}
                      />
                    }>
                    <ThemedText themeColor="textSecondary">
                      {isWeb ? copy.reportReadyHintWeb : copy.reportReadyHint}
                    </ThemedText>

                    {activeSession.reviewStatus === 'draft' ? (
                      <View style={[styles.alertBox, { backgroundColor: theme.warningSoft }]}>
                        <ThemedText type="smallBold" style={{ color: theme.warning }}>
                          {copy.draftTitle}
                        </ThemedText>
                        <ThemedText themeColor="textSecondary">{copy.draftBody}</ThemedText>
                      </View>
                    ) : null}

                    {activeSession.preferredView === 'brief' || !detailedReport ? (
                      <>
                        <View style={styles.reportBlock}>
                          <ThemedText type="smallBold">{copy.summary}</ThemedText>
                          <ThemedText themeColor="textSecondary">{briefReport.summary}</ThemedText>
                        </View>

                        <View style={styles.reportBlock}>
                          <ThemedText type="smallBold">{copy.takeaways}</ThemedText>
                          {briefReport.keyTakeaways.map((item) => (
                            <View key={item} style={styles.inlineItem}>
                              <ThemedText themeColor="textSecondary">{item}</ThemedText>
                            </View>
                          ))}
                        </View>

                        <View style={[styles.reportGrid, isCompactLayout && styles.reportGridCompact]}>
                          <View style={[styles.reportColumn, isCompactLayout && styles.reportColumnCompact]}>
                            <ThemedText type="smallBold">{copy.actionItems}</ThemedText>
                            {briefReport.actionItems.map((item) => (
                              <View key={item.id} style={styles.inlineItem}>
                                <ThemedText type="smallBold">{item.text}</ThemedText>
                                <ThemedText type="small" themeColor="textSecondary">
                                  {[item.owner ?? 'Unassigned', item.dueLabel ?? 'No deadline']
                                    .filter(Boolean)
                                    .join(' - ')}
                                </ThemedText>
                                {item.timestampMs !== undefined ? (
                                  <ThemedText type="small" themeColor="textSecondary">
                                    {formatTimecode(item.timestampMs)}
                                  </ThemedText>
                                ) : null}
                              </View>
                            ))}
                          </View>

                          <View style={[styles.reportColumn, isCompactLayout && styles.reportColumnCompact]}>
                            <ThemedText type="smallBold">{copy.decisions}</ThemedText>
                            {briefReport.decisions.map((item) => (
                              <View key={item.id} style={styles.inlineItem}>
                                <ThemedText type="smallBold">{item.text}</ThemedText>
                                {item.timestampMs !== undefined ? (
                                  <ThemedText type="small" themeColor="textSecondary">
                                    {formatTimecode(item.timestampMs)}
                                  </ThemedText>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        </View>

                        <View style={[styles.reportGrid, isCompactLayout && styles.reportGridCompact]}>
                          <View style={[styles.reportColumn, isCompactLayout && styles.reportColumnCompact]}>
                            <ThemedText type="smallBold">{copy.risks}</ThemedText>
                            {briefReport.risks.map((item) => (
                              <View key={item.id} style={styles.inlineItem}>
                                <ThemedText type="smallBold">{item.text}</ThemedText>
                                <ThemedText type="small" themeColor="textSecondary">
                                  {item.mitigation}
                                </ThemedText>
                              </View>
                            ))}
                          </View>

                          <View style={[styles.reportColumn, isCompactLayout && styles.reportColumnCompact]}>
                            <ThemedText type="smallBold">{copy.openQuestions}</ThemedText>
                            {briefReport.followUpQuestions.map((question) => (
                              <View key={question} style={styles.inlineItem}>
                                <ThemedText themeColor="textSecondary">{question}</ThemedText>
                              </View>
                            ))}
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.reportBlock}>
                          <ThemedText type="smallBold">{copy.executiveSummary}</ThemedText>
                          <ThemedText themeColor="textSecondary">{detailedReport.executiveSummary}</ThemedText>
                        </View>

                        {detailedReport.sections.map((section) => (
                          <View key={section.id} style={styles.reportBlock}>
                            <ThemedText type="smallBold">{section.title}</ThemedText>
                            {(section.paragraphs ?? []).map((paragraph) => (
                              <ThemedText key={paragraph} themeColor="textSecondary">
                                {paragraph}
                              </ThemedText>
                            ))}
                            {(section.bullets ?? []).map((bullet) => (
                              <View key={bullet} style={styles.bulletRow}>
                                <View style={[styles.priorityDot, { backgroundColor: theme.accent }]} />
                                <ThemedText themeColor="textSecondary">{bullet}</ThemedText>
                              </View>
                            ))}
                          </View>
                        ))}

                        <View style={styles.reportBlock}>
                          <ThemedText type="smallBold">{copy.verificationChecklist}</ThemedText>
                          {detailedReport.verificationChecklist.map((item) => (
                            <View key={item} style={styles.bulletRow}>
                              <View style={[styles.priorityDot, { backgroundColor: theme.warning }]} />
                              <ThemedText themeColor="textSecondary">{item}</ThemedText>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                  </SectionCard>
                ) : null}

                {activeSession.transcript?.length ? (
                  <SectionCard eyebrow={copy.transcriptEyebrow} title={copy.transcriptTitle}>
                    {activeSession.transcript.slice(0, 5).map((segment) => (
                      <View key={segment.id} style={styles.transcriptSegment}>
                        <View style={styles.segmentMeta}>
                          <ThemedText type="smallBold">{segment.speaker}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {formatTimecode(segment.startMs)}
                          </ThemedText>
                        </View>
                        <ThemedText themeColor="textSecondary">{segment.text}</ThemedText>
                      </View>
                    ))}
                  </SectionCard>
                ) : null}
              </>
            ) : (
              <SectionCard eyebrow="First step" title="No audio yet">
                <ThemedText themeColor="textSecondary">
                  Record a voice memo or import an existing file to start the personal report flow.
                </ThemedText>
              </SectionCard>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  alertBox: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  backgroundOrb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.5,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  button: {
    minWidth: 132,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFullWidth: {
    width: '100%',
    minWidth: 0,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  buttonRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  buttonTextDisabled: {
    opacity: 0.7,
  },
  choicePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  container: {
    flex: 1,
  },
  contentColumn: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  contentColumnCompact: {
    maxWidth: 560,
  },
  controlGroup: {
    gap: Spacing.two,
  },
  heroCopy: {
    color: 'rgba(255,247,239,0.86)',
    maxWidth: 620,
  },
  heroHint: {
    color: 'rgba(255,247,239,0.58)',
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  heroMetricsCompact: {
    flexDirection: 'column',
  },
  heroStatus: {
    color: 'rgba(255,247,239,0.72)',
  },
  inlineItem: {
    gap: 4,
    paddingVertical: 6,
  },
  inverseMetricLabel: {
    color: 'rgba(255,247,239,0.66)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inverseMetricValue: {
    color: '#fff7ef',
  },
  metricBlock: {
    minWidth: 140,
    gap: 4,
  },
  metricBlockCompact: {
    minWidth: 0,
  },
  modePill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  orbOne: {
    width: 280,
    height: 280,
    backgroundColor: '#f3c8a8',
    top: -80,
    right: -40,
  },
  orbTwo: {
    width: 220,
    height: 220,
    backgroundColor: '#d6e4dc',
    bottom: 40,
    left: -80,
  },
  pressed: {
    opacity: 0.84,
  },
  processingCopyBlock: {
    flex: 1,
    gap: 4,
  },
  processingRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 7,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  reportBlock: {
    gap: Spacing.two,
  },
  reportColumn: {
    flex: 1,
    gap: Spacing.one,
    minWidth: 220,
  },
  reportColumnCompact: {
    minWidth: 0,
    width: '100%',
  },
  reportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  reportGridCompact: {
    flexDirection: 'column',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    alignItems: 'center',
  },
  segmentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  sessionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  sessionMetaRowCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 18,
    fontWeight: '600',
  },
  transcriptSegment: {
    gap: 8,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d9c4ae',
  },
});
