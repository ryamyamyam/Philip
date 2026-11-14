import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast';
import { applyAvailability, undoAvailability } from '../../db/availabilityRepo';
import type { TrainingProgram } from '../../db/types';
import { useCycles, useProfile, useTargetPlans, useWorkoutSessions } from '../../hooks/useData';
import { t, type StringKey } from '../../i18n';
import { tg } from '../../i18n/goal';
import { todayYmd } from '../../lib/date';
import { fmtNum } from '../../lib/format';
import { planForDate } from '../../lib/nutrition';
import { calculateTargets } from '../../lib/targets';
import { AVAILABILITY_RULES, planAvailability } from '../../lib/training/availability';
import { CARDIO_MINUTES } from '../../lib/training/cardio';
import { calcInputsForGoal } from '../../lib/training/cycleGoal';
import { trainingDaysOrDefault } from '../../lib/training/schedule';
import { SESSION_BUDGET_MIN } from '../../lib/training/session';

const wd = (d: number) => t(`training.wd.${d}` as StringKey);
const steps = (r: { min: number; max: number; step: number }) => Array.from({ length: (r.max - r.min) / r.step + 1 }, (_, i) => r.min + i * r.step);

/**
 * Story 12: "Your time" (Settings › Training). Days a week, lifting minutes and cardio minutes; the
 * list under them shows what Confirm would change, worked out by lib/training/availability.ts.
 */
export function YourTime({ program }: { program: TrainingProgram }) {
  const toast = useToast();
  const profile = useProfile();
  const cycles = useCycles();
  const plans = useTargetPlans();
  const sessions = useWorkoutSessions();
  const today = todayYmd();
  const cycle = cycles?.find((c) => c.index === program.currentCycle) ?? null;
  const phase = cycle?.phase ?? profile?.goal ?? 'maintain';
  const curDays = useMemo(() => trainingDaysOrDefault(program.trainingDays), [program.trainingDays]);
  const curStrength = program.availability?.strengthMin ?? SESSION_BUDGET_MIN;
  const curCardio = cycle?.cardioMin ?? CARDIO_MINUTES[phase];
  const [days, setDays] = useState(curDays.length);
  const [strength, setStrength] = useState(curStrength);
  const [cardio, setCardio] = useState(program.availability?.cardioMin ?? Math.max(curCardio, AVAILABILITY_RULES.cardioMin.min));
  const [busy, setBusy] = useState(false);
  const plan = plans ? planForDate(plans, today) : null;
  const workoutOpen = sessions?.some((s) => s.status === 'in_progress') ?? false;

  const result = useMemo(() => {
    if (!profile) return null;
    const weightKg = cycle?.goal.startWeightKg ?? profile.weightKg ?? null;
    return planAvailability(
      { daysPerWeek: days, strengthMin: strength, cardioMin: cardio },
      { days: curDays, strengthMin: curStrength, cardioPlanned: curCardio, phase, plan: plan ? { calories: plan.calories, proteinG: plan.proteinG, fatG: plan.fatG, carbsG: plan.carbsG } : null, weightKg, heightCm: profile.heightCm },
      (n) => {
        if (!cycle) return null;
        const inputs = calcInputsForGoal(profile, phase, cycle.goal, today, n);
        if (!inputs) return null;
        try {
          return calculateTargets(inputs);
        } catch {
          return null;
        }
      },
    );
  }, [profile, cycle, days, strength, cardio, curDays, curStrength, curCardio, phase, plan, today]);
  const firstSave = !program.availability;

  const confirm = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const undo = await applyAvailability(result, today, phase);
      toast(tg('time.saved'), { label: tg('goal.undo'), run: () => void undoAvailability(undo, todayYmd()).then(() => toast(tg('time.undone'))) });
    } catch {
      toast(tg('goal.workoutOpen'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-sm" role="group" aria-labelledby="time-h">
      <h3 id="time-h">{tg('time.title')}</h3>
      <p className="small muted">{tg('time.hint')}</p>
      <div className="field">
        <span className="field-label" id="time-days">
          {tg('time.days')}
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="time-days">
          {[3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="setup-inputs">
        <label className="field">
          <span className="field-label">{tg('time.strength')}</span>
          <select className="input num" value={strength} onChange={(e) => setStrength(Number(e.target.value))}>
            {steps(AVAILABILITY_RULES.strengthMin).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{tg('time.cardio')}</span>
          <select className="input num" value={cardio} onChange={(e) => setCardio(Number(e.target.value))}>
            {steps(AVAILABILITY_RULES.cardioMin).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {result && (
        <div className="stack-xs" aria-live="polite" data-testid="time-changes">
          <span className="field-label">{tg('time.changes')}</span>
          {!result.changed && <p className="small">{tg('time.none')}</p>}
          {result.daysChanged && (
            <>
              <p className="small num">{tg('time.row.days', { from: curDays.map(wd).join(' '), to: result.days.map(wd).join(' ') })}</p>
              <p className="small num">{tg('time.row.cycle', { weeks: fmtNum(Math.round((16 / result.days.length) * 10) / 10, 1), n: result.days.length })}</p>
              {result.closeDays && <p className="small">{tg('time.row.close')}</p>}
            </>
          )}
          {result.strengthChanged && <p className="small num">{tg('time.row.strength', { from: curStrength, to: result.strengthMin })}</p>}
          {result.cardioChanged ? (
            <p className="small num">{tg('time.row.cardio', { from: curCardio, to: result.cardioPlanned })}</p>
          ) : (
            result.changed && cardio > curCardio && <p className="small num">{tg('time.row.cardioKeep', { n: curCardio })}</p>
          )}
          {result.nutritionChanged && result.nutrition && plan ? (
            <p className="small num">{tg('time.row.food', { fromKcal: plan.calories, toKcal: result.nutrition.calories, fromP: plan.proteinG, toP: result.nutrition.proteinG })}</p>
          ) : (
            result.changed && <p className="small">{tg('time.row.foodKeep')}</p>
          )}
        </div>
      )}
      <button type="button" className="btn btn-secondary btn-block" disabled={busy || workoutOpen || !result || (!result.changed && !firstSave)} onClick={() => void confirm()}>
        {tg('time.confirm')}
      </button>
      {workoutOpen && <p className="small muted">{tg('goal.workoutOpen')}</p>}
    </div>
  );
}
