import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type SectionCardProps = ViewProps & {
  eyebrow?: string;
  title?: string;
  action?: React.ReactNode;
  inverse?: boolean;
};

export function SectionCard({
  action,
  children,
  eyebrow,
  inverse = false,
  style,
  title,
  ...rest
}: SectionCardProps) {
  return (
    <ThemedView
      type={inverse ? 'surfaceStrong' : 'backgroundElement'}
      style={[styles.card, inverse && styles.inverseCard, style]}
      {...rest}>
      {(eyebrow || title || action) && (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            {eyebrow ? (
              <ThemedText
                type="smallBold"
                style={[styles.eyebrow, inverse && styles.inverseEyebrow]}>
                {eyebrow}
              </ThemedText>
            ) : null}
            {title ? (
              <ThemedText type="subtitle" style={[styles.title, inverse && styles.inverseText]}>
                {title}
              </ThemedText>
            ) : null}
          </View>
          {action}
        </View>
      )}
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#dfc9b1',
    borderRadius: 28,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  inverseCard: {
    borderColor: 'rgba(255,255,255,0.16)',
  },
  inverseEyebrow: {
    color: 'rgba(255,255,255,0.72)',
  },
  inverseText: {
    color: '#fff7ef',
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
  },
});
