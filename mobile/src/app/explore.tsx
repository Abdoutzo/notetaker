import { useRouter } from 'expo-router';
import React, { useDeferredValue, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SectionCard } from '@/components/section-card';
import { SessionCard } from '@/components/session-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReportStudio } from '@/providers/report-studio-provider';

export default function ExploreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    activeSessionId,
    pipelineMode,
    sessions,
    setActiveSession,
    toggleFavorite,
  } = useReportStudio();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filteredSessions = sessions.filter((session) => {
    if (!deferredQuery) {
      return true;
    }

    return (
      session.title.toLowerCase().includes(deferredQuery) ||
      session.template.toLowerCase().includes(deferredQuery) ||
      session.status.toLowerCase().includes(deferredQuery) ||
      session.reportLanguage.toLowerCase().includes(deferredQuery) ||
      session.reviewStatus.toLowerCase().includes(deferredQuery)
    );
  });

  const readySessions = sessions.filter((session) => session.status === 'ready').length;
  const pinnedSessions = sessions.filter((session) => session.favorite).length;
  const inProgressSessions = sessions.filter((session) => session.status === 'processing').length;

  function openSession(sessionId: string) {
    setActiveSession(sessionId);
    router.navigate('/');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.contentColumn}>
            <SectionCard eyebrow="Library" title="Your reports, ready when you need them">
              <ThemedText themeColor="textSecondary">
                Search past recordings, reopen the right note quickly, and keep the final version
                under your control before you share it.
              </ThemedText>

              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">Sessions</ThemedText>
                  <ThemedText type="subtitle">{sessions.length}</ThemedText>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">Ready</ThemedText>
                  <ThemedText type="subtitle">{readySessions}</ThemedText>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">Pinned</ThemedText>
                  <ThemedText type="subtitle">{pinnedSessions}</ThemedText>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">Processing</ThemedText>
                  <ThemedText type="subtitle">{inProgressSessions}</ThemedText>
                </View>
              </View>

              <TextInput
                onChangeText={setQuery}
                placeholder="Search a note, language, or status"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.searchInput,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                value={query}
              />
            </SectionCard>

            <SectionCard eyebrow="Saved sessions" title="Browse and reopen">
              <View style={styles.listColumn}>
                {filteredSessions.map((session) => (
                  <View key={session.id} style={activeSessionId === session.id ? styles.activeSession : undefined}>
                    <SessionCard
                      onPress={() => openSession(session.id)}
                      onToggleFavorite={() => toggleFavorite(session.id)}
                      session={session}
                    />
                  </View>
                ))}
                {!filteredSessions.length ? (
                  <ThemedText themeColor="textSecondary">
                    No session matches this query yet.
                  </ThemedText>
                ) : null}
              </View>
            </SectionCard>

            <SectionCard
              inverse
              eyebrow="How it works"
              title="A personal workflow, not a meeting bot"
              action={
                <View style={[styles.modeBadge, { backgroundColor: theme.accentSoft }]}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    {pipelineMode === 'api' ? 'Live processing' : 'Sample mode'}
                  </ThemedText>
                </View>
              }>
              <View style={styles.listColumn}>
                {[
                  'Capture first, edit second. The raw audio remains the source of truth.',
                  'Use short recordings while drafting. Use longer files when you are ready for a full report.',
                  'Mark the note Reviewed or Final before you export and share it.',
                ].map((principle) => (
                  <View key={principle} style={styles.principleRow}>
                    <View style={styles.principleMarker} />
                    <ThemedText style={styles.inverseCopy}>{principle}</ThemedText>
                  </View>
                ))}
              </View>
            </SectionCard>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  activeSession: {
    borderRadius: 30,
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
  inverseCopy: {
    color: '#fff7ef',
  },
  listColumn: {
    gap: Spacing.two,
  },
  modeBadge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  principleMarker: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#f09a67',
    marginTop: 7,
  },
  principleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    alignItems: 'center',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    fontWeight: '500',
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: 22,
    padding: Spacing.three,
    gap: 6,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
