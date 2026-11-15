import { lazy, Suspense } from 'react';
import type { SheetState } from '../ui';
import { AddSheet } from './AddSheet';
import { EntrySheet } from './EntrySheet';

const PhotoSheet = lazy(() => import('./photo/PhotoSheet'));
const HandoffSheet = lazy(() => import('./photo/HandoffSheet'));
// Eager: manual and saved-meal logging go through the review sheet and must work offline on first tap.
import ReviewSheet from './photo/ReviewSheet';
const SuggestSheet = lazy(() => import('./SuggestSheet'));
const GoalSheet = lazy(() => import('./goal/GoalSheet'));
const UpdateGoalsSheet = lazy(() => import('./goal/UpdateGoalsSheet'));
const WhyPlanSheet = lazy(() => import('./learn/WhyPlanSheet'));
const PlaybookSheet = lazy(() => import('./playbook/PlaybookSheet'));

export function SheetHost({ sheet }: { sheet: SheetState }) {
  switch (sheet.kind) {
    case 'add':
      return <AddSheet key={`add-${sheet.date}`} date={sheet.date} meal={sheet.meal} />;
    case 'entry':
      return <EntrySheet key={sheet.entryId ?? 'new'} date={sheet.date} meal={sheet.meal} entryId={sheet.entryId} />;
    case 'photo':
      return (
        <Suspense fallback={null}>
          <PhotoSheet date={sheet.date} meal={sheet.meal} file={sheet.file} />
        </Suspense>
      );
    case 'handoff':
      return (
        <Suspense fallback={null}>
          <HandoffSheet date={sheet.date} meal={sheet.meal} file={sheet.file} details={sheet.details ?? null} />
        </Suspense>
      );
    case 'suggest':
      return (
        <Suspense fallback={null}>
          <SuggestSheet date={sheet.date} />
        </Suspense>
      );
    case 'review':
      return <ReviewSheet {...sheet} />;
    case 'goal':
      return (
        <Suspense fallback={null}>
          {/* Story 15: every manual plan change is "Update goals"; goal events (reached, off track) keep the goal sheet. */}
          {sheet.manual === true ? <UpdateGoalsSheet /> : <GoalSheet />}
        </Suspense>
      );
    case 'whyPlan':
      return (
        <Suspense fallback={null}>
          <WhyPlanSheet {...(sheet.phase ? { phase: sheet.phase } : {})} />
        </Suspense>
      );
    case 'playbook':
      return (
        <Suspense fallback={null}>
          <PlaybookSheet />
        </Suspense>
      );
  }
}
