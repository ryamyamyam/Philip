import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TabBar } from './components/TabBar';
import { ToastProvider } from './components/Toast';
import { useRoute, type Tab } from './hooks/useRoute';
import { todayYmd } from './lib/date';
import { UICtx, type SheetState, type UI } from './ui';
import { TodayView } from './views/TodayView';
import { HomeView } from './views/HomeView';
import { SheetHost } from './views/SheetHost';
import { OfflineBanner } from './components/OfflineBanner';
import { QaFeedback } from './modules/qa-feedback';
import { qaFeedbackConfig } from './qaFeedback.config';
import { TutorialOverlay, type TourEnd } from './components/TutorialOverlay';
import { META, setMeta } from './db/repo';
import { useMeta, useProfile, useTargetPlans } from './hooks/useData';
import { targetForDate } from './lib/nutrition';
import type { TourContext, TourScreen } from './lib/tutorial';

const ProgressView = lazy(() => import('./views/ProgressView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const TargetsPage = lazy(() => import('./views/TargetsPage'));
const WorkoutView = lazy(() => import('./views/WorkoutView'));
const AskView = lazy(() => import('./views/AskView'));

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
  // UX-2 (Story 5): entering the Meal log always starts on today's date.
  const onTab = useCallback(
    (next: Tab) => {
      if (next === 'meals') setDate(todayYmd());
      navigate(next);
    },
    [navigate],
  );
  // Philip's tour (T-010; Story 5: starts on Home, then walks into the Meal log): shows while `tutorialSeenAt` is unset (first launch, every existing
  // install once, or after Settings › Replay tutorial clears it), once targets and profile have loaded.
  const seenAt = useMeta<number>(META.tutorialSeenAt);
  const savedStep = useMeta<string>(META.tutorialStep);
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
  // The step the tour is on, so it can pick up where it left off.
  const nextStep = useRef<string | null>(null);
  const onTourStep = useCallback((id: string, next: string | null) => {
    nextStep.current = next;
    void setMeta(META.tutorialStep, id);
  }, []);
  const endTour = useCallback(
    (how: TourEnd) => {
      setTourCtx(null);
      if (how === 'setTargets') {
        // Not the end (owner feedback, Nov 5): pause, and resume at the next line back on Home or Meal log.
        void setMeta(META.tutorialStep, nextStep.current);
        navigate('targets');
        return;
      }
      setTourEnded(true);
      void setMeta(META.tutorialSeenAt, Date.now());
      void setMeta(META.tutorialStep, null);
    },
    [navigate],
  );
  const tourScreen: TourScreen | null = tab === 'home' || tab === 'meals' ? tab : null;
  const showTour = tourScreen !== null && !sheet && seenAt === null && savedStep !== undefined && !tourEnded && tourCtx !== null;
  const onTourScreen = useCallback(
    (s: TourScreen) => {
      if (s === 'meals') setDate(todayYmd());
      navigate(s);
    },
    [navigate],
  );

  const ui: UI = useMemo(() => ({ date, setDate, openSheet: setSheet, closeSheet, navigate }), [date, closeSheet, navigate]);

  return (
    <UICtx.Provider value={ui}>
      <ToastProvider>
        <div className="app">
          <OfflineBanner />
          <main>
            {tab === 'home' && <HomeView />}
            {tab === 'meals' && <TodayView />}
            <Suspense fallback={null}>
              {tab === 'workout' && <WorkoutView />}
              {tab === 'workoutPlan' && <WorkoutView plan />}
              {tab === 'progress' && <ProgressView />}
              {tab === 'settings' && <SettingsView />}
              {tab === 'targets' && <TargetsPage />}
              {tab === 'ask' && <AskView />}
            </Suspense>
          </main>
          <TabBar tab={tab} onTab={onTab} />
          {sheet && <SheetHost sheet={sheet} />}
          {showTour && (
            <TutorialOverlay
              ctx={tourCtx}
              onEnd={endTour}
              screen={tourScreen ?? undefined}
              onScreen={onTourScreen}
              resumeAt={savedStep}
              onStep={onTourStep}
            />
          )}
          <QaFeedback config={qaFeedbackConfig} />
        </div>
      </ToastProvider>
    </UICtx.Provider>
  );
}
