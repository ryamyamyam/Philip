import { useState } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { addTm, startCycle } from '../../db/repo';
import type { CycleRecord, Profile, TmRecord, WeightEntry, WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { todayYmd } from '../../lib/date';
import { fmtNum } from '../../lib/format';
import { philipGoal, recommendPhase, rollingWeight } from '../../lib/training/cycleGoal';
import { blockForCycle, LIFTS, nextTm, type LiftId, type Phase } from '../../lib/training/program';
import { cycleOutcomes, nextCycleIndex, tmsForCycle } from '../../lib/training/progress';
import { fmtIn } from './units';

const PHASE_KEY: Record<Phase, StringKey> = { lose: 'home.phase.cut', maintain: 'home.phase.maintain', gain: 'home.phase.bulk' };

/**
 * Starting a cycle (T-013 minimum). Philip proposes the goal from §4.8 and applies last cycle's TM
 * progression; T-014 adds the full briefing ("Set my own", writing the target plan).
 */
export function StartCycleView({
  profile,
  weights,
  cycles,
  sessions,
  tmHistory,
}: {
  profile: Profile;
  weights: readonly WeightEntry[];
  cycles: readonly CycleRecord[];
  sessions: readonly WorkoutSession[];
  tmHistory: readonly TmRecord[];
}) {
  const [busy, setBusy] = useState(false);
  const index = nextCycleIndex(cycles, sessions);
  const last = cycles.find((c) => c.index === index - 1) ?? null;
  const phase: Phase = profile.goal ?? recommendPhase(profile.bodyFatPct, profile.targetBodyFatPct, last?.phase ?? null);
  const weight = rollingWeight(weights, todayYmd());
  const goal = weight === null ? null : philipGoal(weight, profile.bodyFatPct, phase);
  const unit = profile.unitPrefs.weight;

  const start = async () => {
    if (!goal) return;
    setBusy(true);
    // Progression from the last cycle (§4.5): applied once, when the next cycle starts.
    const tmsBefore = tmsForCycle(tmHistory, index - 1);
    const snapshot = Object.fromEntries(LIFTS.map((l) => [l, tmsBefore[l] ?? 0])) as Record<LiftId, number>;
    if (last) {
      const now = cycleOutcomes(sessions, last.index);
      const before = cycleOutcomes(sessions, last.index - 1);
      for (const lift of LIFTS) {
        const tm = tmsBefore[lift];
        if (tm === null) continue;
        const next = nextTm(tm, lift, last.phase, now[lift], before[lift] === 'miss');
        await addTm({ lift, tmKg: next.tmKg, effectiveCycle: index, reason: next.reason });
        snapshot[lift] = next.tmKg;
      }
    }
    await startCycle({
      index,
      block: blockForCycle(index),
      startedAt: Date.now(),
      phase,
      tms: snapshot,
      goal: { ...goal, targetPlanId: null },
    });
    setBusy(false);
  };

  return (
    <div className="stack">
      <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="point-up" framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t(goal ? 'brief.line' : 'brief.needWeighIns')}
      </DialogBar>
      <section className="card stack-sm" aria-labelledby="brief-h">
        <h2 id="brief-h">{t('brief.title', { n: index, block: blockForCycle(index) })}</h2>
        <p className="num">{t('brief.phase', { phase: t(PHASE_KEY[phase]) })}</p>
        {goal ? (
          <>
            <p className="num">{t('brief.now', { weight: fmtIn(goal.startWeightKg, unit) })}</p>
            <p className="num pm-display brief-goal">{t('brief.goal', { weight: fmtIn(goal.endWeightKg, unit), rate: fmtNum(goal.weeklyRatePct, 2) })}</p>
            {goal.bfLinePct !== null && <p className="num">{t(phase === 'gain' ? 'brief.bfCeiling' : phase === 'lose' ? 'brief.bfTarget' : 'brief.bfHold', { bf: fmtNum(goal.bfLinePct, 1) })}</p>}
            <p className="small muted">{t('brief.evidence')}</p>
          </>
        ) : (
          <p>{t('brief.weighInsHint')}</p>
        )}
      </section>
      <button type="button" className="btn btn-primary btn-block" disabled={!goal || busy} onClick={() => void start()}>
        {t('brief.start', { n: index })}
      </button>
    </div>
  );
}
