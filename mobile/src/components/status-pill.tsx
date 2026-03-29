import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sessionStatusLabel } from '@/lib/format';
import type { SessionStatus } from '@/types/report';

export function StatusPill({ status }: { status: SessionStatus }) {
  const theme = useTheme();

  const palette =
    status === 'ready'
      ? { backgroundColor: theme.successSoft, textColor: theme.success }
      : status === 'processing'
        ? { backgroundColor: theme.warningSoft, textColor: theme.warning }
        : status === 'failed'
          ? { backgroundColor: theme.dangerSoft, textColor: theme.danger }
          : { backgroundColor: theme.accentSoft, textColor: theme.accent };

  return (
    <View style={[styles.pill, { backgroundColor: palette.backgroundColor }]}>
      <ThemedText type="smallBold" style={{ color: palette.textColor }}>
        {sessionStatusLabel(status)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 999,
  },
});
