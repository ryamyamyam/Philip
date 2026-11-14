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
  const blocked = busy || !!state?.workoutOpen;

  useEffect(() => {
    if (!fresh || blocked) return;
    void markPromptFired({ cycle: fresh.cycle, kind: fresh.kind, reason: fresh.reason }).then(() => openSheet({ kind: 'goal' }));
  }, [fresh, blocked, openSheet]);

  const waitingId = open?.status === 'waiting' && !open.failed ? open.id : undefined;
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
  const prev = useRef(open?.status);
  useEffect(() => {
    if (prev.current === 'waiting' && open?.status === 'ready' && !blocked) openSheet({ kind: 'goal' });
    prev.current = open?.status;
  }, [open?.status, blocked, openSheet]);
  return null;
}
