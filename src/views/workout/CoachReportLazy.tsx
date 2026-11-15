import { lazy, Suspense, type ComponentProps } from 'react';
import type { CoachReport as Report } from './CoachReport';

/** Story 16: Philip's report loads on its own (it's only shown after a workout), keeping the workout chunk in budget. */
const Lazy = lazy(() => import('./CoachReport').then((m) => ({ default: m.CoachReport })));

export function CoachReport(props: ComponentProps<typeof Report>) {
  return (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
}
