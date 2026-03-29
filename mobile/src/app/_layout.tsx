import React from 'react';

import AppTabs from '@/components/app-tabs';
import { ReportStudioProvider } from '@/providers/report-studio-provider';

export default function TabLayout() {
  return (
    <ReportStudioProvider>
      <AppTabs />
    </ReportStudioProvider>
  );
}
