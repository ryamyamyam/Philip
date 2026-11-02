import { useMemo } from 'react';
import { BackupReminder } from '../components/BackupReminder';
import { DateNav } from '../components/DateNav';
import { TodayCard } from '../components/TodayCard';
import { useEntriesForDate, useProfile, useTargetPlans } from '../hooks/useData';
import { useSwipe } from '../hooks/useSwipe';
import { t } from '../i18n';
import { addDays } from '../lib/date';
import { planForDate, sumMacros, targetForDate } from '../lib/nutrition';
import { adherenceScore } from '../lib/adherence';
import { phaseFor } from '../lib/remaining';
import { useUI } from '../ui';

/** Today answers one question: what's left (UX-3). Meals and logging live on the Meals tab (UX-5/6). */
export function TodayView() {
  const { date, setDate, navigate } = useUI();
  const entries = useEntriesForDate(date);
  const plans = useTargetPlans();
  const profile = useProfile();

  const totals = useMemo(() => sumMacros(entries ?? []), [entries]);
  const target = useMemo(() => (plans ? targetForDate(plans, date) : null), [plans, date]);
  const phase = useMemo(() => phaseFor(plans ? planForDate(plans, date) : null, profile), [plans, date, profile]);
  const score = useMemo(
    () => (profile?.adherenceEnabled && target && entries && entries.length ? adherenceScore(totals, target) : null),
    [profile?.adherenceEnabled, target, totals, entries],
  );

  const swipe = useSwipe(
    () => setDate(addDays(date, 1)),
    () => setDate(addDays(date, -1)),
  );

  return (
    <div className="view view-fit" {...swipe}>
      <DateNav />
      <div className="stack">
        <BackupReminder />
        {plans && (
          <TodayCard
            consumed={totals}
            target={target}
            phase={phase}
            adherence={score && score.status === 'scored' ? t('today.adherence', { score: `${score.score}/100` }) : null}
            onSetTargets={() => navigate('progress')}
          />
        )}
      </div>
    </div>
  );
}
