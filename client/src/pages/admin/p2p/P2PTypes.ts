import type { ReactNode } from 'react';

export type P2PStatItem = {
  label: string;
  value: string | number;
  hint?: string;
  testId?: string;
};

export type P2PDetailItem = {
  label: string;
  value: ReactNode;
  testId?: string;
};

export type P2PSettingsPanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
};

export type P2PActionDialogsProps = {
  children: ReactNode;
};

export type P2PStatsOverviewProps = {
  stats: P2PStatItem[];
  testId?: string;
};

export type P2PDetailsGridProps = {
  items: P2PDetailItem[];
  testId?: string;
};