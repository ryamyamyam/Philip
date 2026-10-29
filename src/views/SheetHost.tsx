import { lazy, Suspense } from 'react';
import type { SheetState } from '../ui';
import { AddSheet } from './AddSheet';
import { EntrySheet } from './EntrySheet';
import { SavedFoodSheet } from './SavedFoodSheet';
import { MyFoodsSheet } from './MyFoodsSheet';

const PhotoSheet = lazy(() => import('./photo/PhotoSheet'));
const HandoffSheet = lazy(() => import('./photo/HandoffSheet'));
const ReviewSheet = lazy(() => import('./photo/ReviewSheet'));

export function SheetHost({ sheet }: { sheet: SheetState }) {
  switch (sheet.kind) {
    case 'add':
      return <AddSheet key={`add-${sheet.date}`} date={sheet.date} meal={sheet.meal} />;
    case 'entry':
      return <EntrySheet key={sheet.entryId ?? 'new'} date={sheet.date} meal={sheet.meal} entryId={sheet.entryId} />;
    case 'savedFood':
      return <SavedFoodSheet key={sheet.id} id={sheet.id} />;
    case 'myFoods':
      return <MyFoodsSheet date={sheet.date} meal={sheet.meal} />;
    case 'photo':
      return (
        <Suspense fallback={null}>
          <PhotoSheet date={sheet.date} meal={sheet.meal} file={sheet.file} />
        </Suspense>
      );
    case 'handoff':
      return (
        <Suspense fallback={null}>
          <HandoffSheet date={sheet.date} meal={sheet.meal} file={sheet.file} />
        </Suspense>
      );
    case 'review':
      return (
        <Suspense fallback={null}>
          <ReviewSheet {...sheet} />
        </Suspense>
      );
  }
}
