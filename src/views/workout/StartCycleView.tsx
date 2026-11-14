import { useMemo, useState } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { addTargetPlan, addTm, startCycle, updateProfile } from '../../db/repo';
import type { CycleRecord, Profile, TmRecord, WeightEntry, WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { todayYmd } from '../../lib/date';
import { fmtKcal, fmtNum } from '../../lib/format';
import { parseDecimal } from '../../lib/numbers';
import { calculateTargets } from '../../lib/targets';
import {
  calcInputsForGoal,
  checkUserGoal,
  philipGoal,
  RATE_PCT,
  recommendPhase,
  startingWeight,
  type CycleGoal,
  type GoalIssue,
} from '../../lib/training/cycleGoal';
import { blockForCycle, type Phase } from '../../lib/training/program';
import { nextCycleIndex } from '../../lib/training/progress';
import { progressionFor } from '../../lib/training/nextCycle';
import { fmtIn, fromDisplay } from './units';

const PHASES: Phase[] = ['lose', 'maintain', 'gain'];
const PHASE_KEY: Record<Phase, StringKey> = { lose: 'home.phase.cut', maintain: 'home.phase.maintain', gain: 'home.phase.bulk' };
const BLOCK_FOCUS: Record<string, StringKey> = { A: 'plan.focus.A', B: 'plan.focus.B', C: 'plan.focus.C', D: 'plan.focus.D' };

/**
 * Cycle goal briefing (Story 5 §4.8, T-014): where you are, the phase, Philip's goal (preselected)
 * or your own (checked by the safety rules). Confirming applies last cycle's TM progression, sets the
 * phase and writes a new target plan through the calculator, then starts the cycle.
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
  const index = nextCycleIndex(cycles, sessions);
  const last = cycles.find((c) => c.index === index - 1) ?? null;
  const recommended = recommendPhase(profile.bodyFatPct, profile.targetBodyFatPct, last?.phase ?? profile.goal ?? null);
  const [phase, setPhase] = useState<Phase>(profile.goal ?? recommended);
  const [mode, setMode] = useState<'philip' | 'user'>('philip');
  const [endW, setEndW] = useState('');
  const [bfT, setBfT] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = profile.unitPrefs.weight;
  const today = todayYmd();
  const start = startingWeight(weights, today, profile.weightKg);
  const weight = start?.kg ?? null;

  const lastInfo = useMemo(() => {
    if (!last) return null;
    const startW = last.goal.startWeightKg;
    const nowW = weight;
    const actualRatePct = nowW === null ? 0 : ((nowW - startW) / startW / 4) * 100;
    const bfDelta = last.goal.startBfPct !== null && profile.bodyFatPct !== null ? profile.bodyFatPct - last.goal.startBfPct : null;
    return { phase: last.phase, plannedRatePct: last.goal.weeklyRatePct, actualRatePct, bfDelta };
  }, [last, weight, profile.bodyFatPct]);

  const philip = weight === null ? null : philipGoal(weight, profile.bodyFatPct, phase, lastInfo);
  const userEnd = parseDecimal(endW);
  const userBf = parseDecimal(bfT);
  const userEndKg = userEnd !== null && Number.isFinite(userEnd) && userEnd > 0 ? fromDisplay(userEnd, unit) : null;
  const userBfPct = userBf !== null && Number.isFinite(userBf) ? userBf : null;
  const check = weight !== null && userEndKg !== null ? checkUserGoal(weight, phase, userEndKg, userBfPct) : null;
  const blocked = check?.issues.some((i) => i.level === 'error') ?? false;
  const goal: CycleGoal | null =
    mode === 'philip'
      ? philip
      : weight !== null && userEndKg !== null && check && !blocked
        ? {
            startWeightKg: weight,
            startBfPct: profile.bodyFatPct,
            endWeightKg: userEndKg,
            weeklyRatePct: check.ratePct,
            bfLinePct: userBfPct,
            source: 'user',
          }
        : null;

  const calc = useMemo(() => {
    if (!goal) return null;
    const inputs = calcInputsForGoal(profile, phase, goal, today);
    return inputs ? { inputs, res: calculateTargets(inputs) } : null;
  }, [goal, profile, phase, today]);

  const confirm = async () => {
    if (!goal) return;
    setBusy(true);
    // Progression from the last cycle (§4.5): applied once, when the next cycle starts.
    const { rows, snapshot } = progressionFor(tmHistory, sessions, last, index);
    for (const r of rows) await addTm({ lift: r.lift, tmKg: r.tmKg, effectiveCycle: index, reason: r.reason });
    await updateProfile({
      goal: phase,
      targetWeightKg: phase === 'maintain' ? profile.targetWeightKg : Math.round(goal.endWeightKg * 10) / 10,
      weeklyRateKg: Math.round(((goal.endWeightKg - goal.startWeightKg) / 4) * 100) / 100,
      ...(goal.source === 'user' && goal.bfLinePct !== null ? { targetBodyFatPct: goal.bfLinePct } : {}),
    });
    let targetPlanId: number | null = null;
    if (calc) {
      const { res, inputs } = calc;
      targetPlanId = await addTargetPlan({
        effectiveFrom: today,
        calories: res.calories,
        proteinG: res.proteinG,
        fatG: res.fatG,
        carbsG: res.carbsG,
        method: 'calculated',
        inputsSnapshot: { ...inputs, bmr: res.bmr, tdee: res.tdee, adjustment: res.adjustment, warnings: res.warnings.map((w) => w.code), needsReview: res.needsReview, source: 'cycleBriefing' },
        weekdayOverrides: null,
      });
    }
    await startCycle({ index, block: blockForCycle(index), startedAt: Date.now(), phase, tms: snapshot, goal: { ...goal, targetPlanId } });
    setBusy(false);
  };

  const block = blockForCycle(index);
  return (
    <div className="stack">
      <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="point-up" framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t(weight === null ? 'brief.needWeighIns' : 'brief.line')}
      </DialogBar>

      <section className="card stack-sm" aria-labelledby="brief-h">
        <h2 id="brief-h">{t('brief.title', { n: index, block })}</h2>
        <p className="small muted">{t(BLOCK_FOCUS[block] ?? 'plan.focus.A')}</p>
        {weight !== null ? (
          <>
            <p className="num">
              {t(start?.source === 'average' ? 'brief.now' : 'brief.nowSingle', { weight: fmtIn(weight, unit) })}
              {profile.bodyFatPct !== null ? ` · ${t('brief.bfNow', { bf: fmtNum(profile.bodyFatPct, 1) })}` : ''}
            </p>
            {start?.source !== 'average' && <p className="small muted">{t(start?.source === 'latest' ? 'brief.fromLatest' : 'brief.fromProfile')}</p>}
          </>
        ) : (
          <p>{t('brief.weighInsHint')}</p>
        )}
        {last && (
          <p className="small num">
            {t('brief.lastCycle', { goal: fmtIn(last.goal.endWeightKg, unit), now: weight !== null ? fmtIn(weight, unit) : '–' })}
          </p>
        )}
      </section>

      <section className="card stack-sm" aria-labelledby="brief-phase">
        <h2 id="brief-phase">{t('brief.phaseTitle')}</h2>
        <div className="segmented" role="radiogroup" aria-label={t('brief.phaseTitle')}>
          {PHASES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={phase === p} onClick={() => setPhase(p)}>
              {t(PHASE_KEY[p])}
            </button>
          ))}
        </div>
        <p className="small muted">{t('brief.recommended', { phase: t(PHASE_KEY[recommended]) })}</p>
      </section>

      {weight !== null && (
        <section className="card stack-sm" aria-labelledby="brief-goal">
          <h2 id="brief-goal">{t('brief.goalTitle')}</h2>
          <div className="segmented" role="radiogroup" aria-label={t('brief.goalTitle')}>
            <button type="button" role="radio" aria-checked={mode === 'philip'} onClick={() => setMode('philip')}>
              {t('brief.philipsGoal')}
            </button>
            <button type="button" role="radio" aria-checked={mode === 'user'} onClick={() => setMode('user')}>
              {t('brief.myGoal')}
            </button>
          </div>
          {mode === 'philip' && philip && (
            <>
              <p className="num pm-display brief-goal">{t('brief.goal', { weight: fmtIn(philip.endWeightKg, unit), rate: fmtNum(philip.weeklyRatePct, 2) })}</p>
              {philip.bfLinePct !== null && <p className="num">{t(bfKey(phase), { bf: fmtNum(philip.bfLinePct, 1) })}</p>}
            </>
          )}
          {mode === 'user' && (
            <>
              <div className="setup-inputs">
                <label className="field">
                  <span className="field-label">{t(unit === 'kg' ? 'brief.endKg' : 'brief.endLb')}</span>
                  <input className="input num" inputMode="decimal" value={endW} onChange={(e) => setEndW(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">{t('brief.bfTargetLabel')}</span>
                  <input className="input num" inputMode="decimal" value={bfT} onChange={(e) => setBfT(e.target.value)} />
                </label>
              </div>
              {check && <p className="num small">{t('brief.userRate', { rate: fmtNum(check.ratePct, 2) })}</p>}
              {check?.issues.map((i) => (
                <p key={i.code} className={`small ${i.level === 'error' ? 'field-error' : 'warn-text'}`} role={i.level === 'error' ? 'alert' : undefined}>
                  {issueText(i, phase)}
                </p>
              ))}
            </>
          )}
          {goal && (
            <p className="small num">
              {calc
                ? t('brief.calories', { kcal: fmtKcal(calc.res.calories), protein: fmtKcal(calc.res.proteinG) })
                : t('brief.noCalc')}
            </p>
          )}
          {calc?.res.needsReview && <p className="small warn-text">{t('brief.review')}</p>}
          <p className="small muted">{t('brief.evidence')}</p>
        </section>
      )}

      <button type="button" className="btn btn-primary btn-block" disabled={!goal || busy} onClick={() => void confirm()}>
        {t('brief.start', { n: index })}
      </button>
    </div>
  );
}

function bfKey(phase: Phase): StringKey {
  return phase === 'gain' ? 'brief.bfCeiling' : phase === 'lose' ? 'brief.bfTarget' : 'brief.bfHold';
}

function issueText(i: GoalIssue, phase: Phase): string {
  switch (i.code) {
    case 'rateOutOfRange':
      return t('brief.issue.rate', { min: fmtNum(RATE_PCT[phase].min, 2), max: fmtNum(RATE_PCT[phase].max, 2) });
    case 'directionMismatch':
      return t('brief.issue.direction');
    case 'bfBelowFloor':
      return t('brief.issue.bfFloor', { min: i.min });
    case 'bfLow':
      return t('brief.issue.bfLow', { warn: i.warnBelow });
  }
}
