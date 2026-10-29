import { createContext, useContext } from 'react';
import type { Meal, YMD } from './db/types';
import type { Tab } from './hooks/useRoute';
import type { ReviewItem } from './views/photo/reviewModel';

export type SheetState =
  | { kind: 'add'; date: YMD; meal: Meal }
  | { kind: 'entry'; date: YMD; meal: Meal; entryId?: string }
  | { kind: 'photo'; date: YMD; meal: Meal; file: File }
  | { kind: 'handoff'; date: YMD; meal: Meal; file: File | null }
  | { kind: 'review'; date: YMD; meal: Meal; items: ReviewItem[]; provider: 'gemini' | 'claude-handoff'; model: string; notes: string[]; analyzedAt: number }
  | { kind: 'savedFood'; id: string }
  | { kind: 'myFoods'; date: YMD; meal: Meal };

export interface UI {
  date: YMD;
  setDate: (d: YMD) => void;
  openSheet: (s: SheetState) => void;
  closeSheet: () => void;
  navigate: (tab: Tab) => void;
}

export const UICtx = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UICtx);
  if (!ui) throw new Error('UICtx missing');
  return ui;
}
