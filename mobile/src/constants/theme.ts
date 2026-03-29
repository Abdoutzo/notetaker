/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#14231d',
    background: '#f4ede3',
    backgroundElement: '#fff7ef',
    backgroundSelected: '#f3dcc1',
    textSecondary: '#5b6761',
    accent: '#b45a30',
    accentSoft: '#f6dbc9',
    surfaceStrong: '#17313d',
    success: '#1f7a5b',
    successSoft: '#d9efe6',
    warning: '#ac6c12',
    warningSoft: '#f7e4c3',
    danger: '#aa3d32',
    dangerSoft: '#f5d6d2',
    border: '#dfc9b1',
  },
  dark: {
    text: '#f7f0e8',
    background: '#10181b',
    backgroundElement: '#162328',
    backgroundSelected: '#22343d',
    textSecondary: '#9fb0aa',
    accent: '#f09a67',
    accentSoft: '#513222',
    surfaceStrong: '#0c1215',
    success: '#7ed0af',
    successSoft: '#1d3c34',
    warning: '#f0bc6a',
    warningSoft: '#4d3818',
    danger: '#f1958b',
    dangerSoft: '#4f2420',
    border: '#294049',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'ui-rounded',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif-medium',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 36,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 920;
