import { useEffect, useState } from 'react';
import { markPlaybookFresh, needsPlaybookUpdate } from '../db/playbookRepo';
import { useUI } from '../ui';

/**
 * Story 16 §3.2: on the first launch of 0.16.1, an install with a plan or a program gets the
 * "Today's plan, by the playbook" sheet once (never over another sheet or the tour). A new install has
 * nothing to migrate and is marked done at once. Lazy, like GoalWatcher.
 */
export default function PlaybookWatcher({ busy }: { busy: boolean }) {
  const { openSheet } = useUI();
  const [need, setNeed] = useState<boolean | null>(null);
  useEffect(() => {
    void needsPlaybookUpdate().then((n) => {
      if (!n) void markPlaybookFresh();
      setNeed(n);
    });
  }, []);
  useEffect(() => {
    if (!need || busy) return;
    setNeed(false);
    openSheet({ kind: 'playbook' });
  }, [need, busy, openSheet]);
  return null;
}
