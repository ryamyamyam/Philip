import { useEffect, useState } from 'react';
import { markPlaybookFresh, needsPlaybookUpdate, type UpdateKind } from '../db/playbookRepo';
import { useUI } from '../ui';

/**
 * Story 16 §3.2: on the first launch of 0.16.1, an install with a plan or a program gets the
 * "Today's plan, by the playbook" sheet once (never over another sheet or the tour). A new install has
 * nothing to migrate and is marked done at once. Lazy, like GoalWatcher.
 */
export default function PlaybookWatcher({ busy }: { busy: boolean }) {
  const { openSheet } = useUI();
  const [need, setNeed] = useState<UpdateKind | null>(null);
  // Story 17: the 0.17.1 maintenance re-check (PB-2.2) comes after Story 16's, once, the same way.
  useEffect(() => {
    void (async () => {
      const pb = await needsPlaybookUpdate();
      const tdee = await needsPlaybookUpdate(undefined, 'tdee');
      if (!pb) await markPlaybookFresh();
      if (!tdee) await markPlaybookFresh(undefined, 'tdee');
      setNeed(pb ? 'playbook' : tdee ? 'tdee' : null);
    })();
  }, []);
  useEffect(() => {
    if (!need || busy) return;
    setNeed(null);
    openSheet(need === 'tdee' ? { kind: 'playbook', update: 'tdee' } : { kind: 'playbook' });
  }, [need, busy, openSheet]);
  return null;
}
