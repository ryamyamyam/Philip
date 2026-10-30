import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { TabBar } from './components/TabBar';
import { ToastProvider } from './components/Toast';
import { useRoute } from './hooks/useRoute';
import { todayYmd } from './lib/date';
import { defaultMealFor } from './lib/meals';
import { UICtx, type SheetState, type UI } from './ui';
import { TodayView } from './views/TodayView';
import { SheetHost } from './views/SheetHost';
import { OfflineBanner } from './components/OfflineBanner';
import { QaFeedback } from './modules/qa-feedback';
import { qaFeedbackConfig } from './qaFeedback.config';

const HistoryView = lazy(() => import('./views/HistoryView'));
const TargetsView = lazy(() => import('./views/TargetsView'));
const SettingsView = lazy(() => import('./views/SettingsView'));

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
  const ui: UI = useMemo(() => ({ date, setDate, openSheet: setSheet, closeSheet, navigate }), [date, closeSheet, navigate]);

  return (
    <UICtx.Provider value={ui}>
      <ToastProvider>
        <div className="app">
          <OfflineBanner />
          <main>
            {tab === 'today' && <TodayView />}
            <Suspense fallback={null}>
              {tab === 'history' && <HistoryView />}
              {tab === 'targets' && <TargetsView />}
              {tab === 'settings' && <SettingsView />}
            </Suspense>
          </main>
          <TabBar
            tab={tab}
            onTab={navigate}
            onAdd={() => setSheet({ kind: 'add', date: tab === 'today' ? date : todayYmd(), meal: defaultMealFor() })}
          />
          {sheet && <SheetHost sheet={sheet} />}
          <QaFeedback config={qaFeedbackConfig} />
        </div>
      </ToastProvider>
    </UICtx.Provider>
  );
}
