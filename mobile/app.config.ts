import type { ExpoConfig } from '@expo/config-types';

const appName = process.env.EXPO_PUBLIC_APP_NAME ?? 'MemoFlux';
const appSlug = process.env.EXPO_PUBLIC_APP_SLUG ?? 'memo-flux';
const iosBundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER ?? 'com.memoflux.personal';
const appScheme = process.env.EXPO_PUBLIC_APP_SCHEME ?? 'memoflux';

const config: ExpoConfig = {
  name: appName,
  slug: appSlug,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: appScheme,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: iosBundleIdentifier,
    supportsTablet: false,
    icon: './assets/expo.icon',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'MemoFlux needs microphone access so you can record audio notes and turn them into structured reports.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    package: process.env.ANDROID_PACKAGE ?? 'com.memoflux.personal',
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#17313d',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
    'expo-font',
    'expo-web-browser',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  description:
    'Personal iPhone-first app for turning raw audio into structured reports backed by transcripts and timestamps.',
};

export default config;
