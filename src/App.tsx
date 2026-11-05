import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TabBar } from './components/TabBar';
import { ToastProvider } from './components/Toast';
import { useRoute, type Tab } from './hooks/useRoute';
import { todayYmd } from './lib/date';
import { UICtx, type SheetState, type UI } from './ui';
import { TodayView } from './views/TodayView';
import { SheetHost } from './views/SheetHost';
import { OfflineBanner } from './components/OfflineBanner';
import { QaFeedback } from './modules/qa-feedback';
import { qaFeedbackConfig } from './qaFeedback.config';
import { TutorialOverlay, type TourEnd } from './components/TutorialOverlay';
import { META, setMeta } from './db/repo';
import { useMeta, useProfile, useTargetPlans } from './hooks/useData';
import { targetForDate } from './lib/nutrition';
import type { TourContext } from './lib/tutorial';

const ProgressView = lazy(() => import('./views/ProgressView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const TargetsPage = lazy(() => import('./views/TargetsPage'));

export function App() {
  const [tab, navigate] = useRoute();
  const [date, setDate] = useState(todayYmd);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  // Keep "today" correct if the app stays open past midnight.
  useEffect(() => {
    let last = todayYmd();
    const check = () => {
      const now = todayYmd();
      if (now !== last) {
        setDate((d) => (d === last ? now : d));
        last = now;
      }
    };
    const id = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);
  // UX-2: tapping Today always shows Today *and* resets the date — even when already on that tab.
  const onTab = useCallback(
    (next: Tab) => {
      if (next === 'today') setDate(todayYmd());
      navigate(next);
    },
    [navigate],
  );
  // Philip's tour (T-010): shows on Today while `tutorialSeenAt` is unset (first launch, every existing
  // install once, or after Settings › Replay tutorial clears it), once targets and profile have loaded.
  const seenAt = useMeta<number>(META.tutorialSeenAt);
  const plans = useTargetPlans();
  const profile = useProfile();
  // The context is captured when the tour starts, so logging during it can't reshuffle the steps.
  const [tourCtx, setTourCtx] = useState<TourContext | null>(null);
  const [tourEnded, setTourEnded] = useState(false);
  const prevSeenAt = useRef(seenAt);
  useEffect(() => {
    // Replay: the flag went from a timestamp back to null.
    if (seenAt === null && typeof prevSeenAt.current === 'number') setTourEnded(false);
    prevSeenAt.current = seenAt;
  }, [seenAt]);
  useEffect(() => {
    if (seenAt === null && !tourEnded && plans && profile) {
      setTourCtx((c) => c ?? { hasTarget: targetForDate(plans, date) !== null, hasKey: !!profile.geminiKey });
    }
  }, [seenAt, tourEnded, plans, profile, date]);
  const endTour = useCallback(
    (how: TourEnd) => {
      setTourEnded(true);
      setTourCtx(null);
      void setMeta(META.tutorialSeenAt, Date.now());
      if (how === 'setTargets') navigate('targets');
    },
    [navigate],
  );
  const showTour = tab === 'today' && !sheet && seenAt === null && !tourEnded && tourCtx !== null;

  const ui: UI = useMemo(() => ({ date, setDate, openSheet: setSheet, closeSheet, navigate }), [date, closeSheet, navigate]);

  return (
    <UICtx.Provider value={ui}>
      <ToastProvider>
        <div className="app">
          <OfflineBanner />
          <main>
            {tab === 'today' && <TodayView />}
            <Suspense fallback={null}>
              {tab === 'progress' && <ProgressView />}
              {tab === 'settings' && <SettingsView />}
              {tab === 'targets' && <TargetsPage />}
            </Suspense>
          </main>
          <TabBar tab={tab} onTab={onTab} />
          {sheet && <SheetHost sheet={sheet} />}
          {showTour && <TutorialOverlay ctx={tourCtx} onEnd={endTour} />}
          <QaFeedback config={qaFeedbackConfig} />
        </div>
      </ToastProvider>
    </UICtx.Provider>
  );
}
