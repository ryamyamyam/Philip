import { useEffect, useRef } from 'react';
import { markPromptFired } from '../db/goalPrompts';
import { useGoalState } from '../hooks/useGoal';
import { useUI } from '../ui';

/**
 * Story 11: pops the goal sheet up the moment a goal is reached or the plan drifts (after a weigh-in,
 * or on open), once per event. Never over another sheet, the tour or an open workout; the Home line
 * keeps the reminder until it's answered. Also nudges a waiting plan request when the app comes back
 * online or into view, and opens the sheet when Philip's plan arrives.
 */
export default function GoalWatcher({ busy }: { busy: boolean }) {
  const { openSheet } = useUI();
  const state = useGoalState();
  const fresh = state?.fresh ?? null;
  const open = state?.open ?? null;
  // Story 12: a manual request is polled and shown the same way, but never reminds on Home.
  const manual = state?.openManual ?? null;
  const live = open ?? manual;
  const blocked = busy || !!state?.workoutOpen;

  useEffect(() => {
    if (!fresh || blocked) return;
    void markPromptFired({ cycle: fresh.cycle, kind: fresh.kind, reason: fresh.reason }).then(() => openSheet({ kind: 'goal' }));
  }, [fresh, blocked, openSheet]);

  const waitingId = live?.status === 'waiting' && !live.failed ? live.id : undefined;
  useEffect(() => {
    if (waitingId === undefined) return;
    const run = () => void import('../views/goal/request').then((m) => m.resumeWaiting(waitingId));
    const onVis = () => document.visibilityState === 'visible' && run();
    run();
    const id = window.setInterval(run, 5 * 60_000);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [waitingId]);

  // The plan arrived while the app was open: show it.
  const prev = useRef(live?.status);
  useEffect(() => {
    if (prev.current === 'waiting' && live?.status === 'ready' && !blocked) openSheet(manual && !open ? { kind: 'goal', manual: true } : { kind: 'goal' });
    prev.current = live?.status;
  }, [live?.status, manual, open, blocked, openSheet]);
  return null;
}
