import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatDuration,
  formatShortDate,
  reportLanguageLabel,
  reviewStatusLabel,
  templateLabel,
} from '@/lib/format';
import type { ReportSession } from '@/types/report';

type SessionCardProps = {
  session: ReportSession;
  onPress: () => void;
  onToggleFavorite: () => void;
};

export function SessionCard({ onPress, onToggleFavorite, session }: SessionCardProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <SectionCard
        style={styles.card}
        action={
          <Pressable onPress={onToggleFavorite} style={styles.pinButton}>
            <ThemedText type="smallBold" style={{ color: session.favorite ? theme.accent : theme.text }}>
              {session.favorite ? 'Pinned' : 'Pin'}
            </ThemedText>
          </Pressable>
        }>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <ThemedText type="subtitle" style={styles.title}>
              {session.title}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {templateLabel(session.template, session.reportLanguage)} -{' '}
              {formatShortDate(session.updatedAt, session.reportLanguage)}
            </ThemedText>
          </View>
          <StatusPill status={session.status} />
        </View>

        <ThemedText numberOfLines={3} themeColor="textSecondary">
          {session.report?.brief.summary ??
            'Audio captured and saved locally. Generate the structured brief to extract the summary, actions, and follow-up questions.'}
        </ThemedText>

        <View style={styles.metaRow}>
          <View style={styles.metaCluster}>
            <ThemedText type="smallBold">{session.source === 'recording' ? 'Recorded' : 'Imported'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {reportLanguageLabel(session.reportLanguage, session.reportLanguage)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {reviewStatusLabel(session.reviewStatus, session.reportLanguage)}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDuration(session.audio.durationMs)}
          </ThemedText>
        </View>
      </SectionCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  metaCluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pinButton: {
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.84,
  },
  title: {
    fontSize: 22,
    lineHeight: 26,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
});
