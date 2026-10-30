import { createContext, useContext } from 'react';
import type { QaFeedbackConfig } from '../config';
import type { QaFeedbackDB } from '../db';
import type { ObservationFilter } from '../search';
import type { TechnicalContext } from '../types';

export type QaView = { name: 'capture' } | { name: 'inbox' } | { name: 'detail'; id: string } | { name: 'prompt' };

export interface QaUI {
  config: QaFeedbackConfig;
  db: QaFeedbackDB;
  projectId: string;
  setProjectId: (id: string) => void;
  view: QaView;
  go: (v: QaView) => void;
  close: () => void;
  /** Context recorded when the panel was opened (before it covered the screen). */
  openContext: TechnicalContext | null;
  filter: ObservationFilter;
  setFilter: (f: ObservationFilter) => void;
  selection: string[];
  setSelection: (ids: string[]) => void;
  aiAvailable: boolean;
  aiLabel: string;
  notify: (text: string) => void;
}

export const QaCtx = createContext<QaUI | null>(null);

export function useQa(): QaUI {
  const v = useContext(QaCtx);
  if (!v) throw new Error('QaCtx missing');
  return v;
}
