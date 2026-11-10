import { useMemo } from 'react';
import { DialogBar } from '../components/DialogBar';
import { GymCharacter } from '../components/GymCharacter';
import { Icon } from '../components/Icon';
import { Meter } from '../components/Meter';
import { StatusStrip } from '../components/StatusStrip';
import type { Profile, WeightEntry } from '../db/types';
import {
  useCycles,
  useEntriesForDate,
  useProfile,
  useTargetPlans,
  useTmHistory,
  useTrainingProgram,
  useWeightEntries,
  useWorkoutSessions,
} from '../hooks/useData';
import { t, type StringKey } from '../i18n';
import { addDays, todayYmd } from '../lib/date';
import { fmtDate, fmtG, fmtKcal, fmtNum } from '../lib/format';
import { planForDate, sumMacros, targetForDate } from '../lib/nutrition';
import { phaseFor, remainingAll, type Phase as FoodPhase, type Remaining } from '../lib/remaining';
import { KG_PER_LB } from '../lib/numbers';
import { rollingWeight } from '../lib/training/cycleGoal';
import { DAY_LIFT, DELOAD_WEEK, blockForCycle, type LiftId } from '../lib/training/program';
import { tmsForCycle, workoutCardState, type WorkoutCardState } from '../lib/training/progress';
import { buildSession } from '../lib/training/session';
import { useUI } from '../ui';

const PHASE_KEY: Record<FoodPhase, StringKey> = { cut: 'home.phase.cut', maintain: 'home.phase.maintain', bulk: 'home.phase.bulk' };
const KCAL_KEY: Record<Remaining['status'], StringKey> = {
  left: 'today.kcal.left',
  over: 'today.kcal.over',
  toGo: 'today.kcal.toGo',
  reached: 'today.kcal.reached',
};
const G_KEY: Record<Remaining['status'], StringKey> = {
  left: 'today.g.left',
  over: 'today.g.over',
  toGo: 'today.g.toGo',
  reached: 'today.g.reached',
};
const LIFT_KEY: Record<LiftId, StringKey> = {
  squat: 'exercise.squat',
  bench: 'exercise.bench',
  rdl: 'exercise.rdl',
  ohp: 'exercise.ohp',
};

/** kg → the user's display unit, one decimal. */
function fmtWeight(kg: number, unit: 'kg' | 'lb'): string {
  return t(unit === 'kg' ? 'home.kg' : 'home.lb', { n: fmtNum(unit === 'kg' ? kg : kg / KG_PER_LB, 1) });
}

/**
 * Home (Story 5, T-011): where the app opens. Two cartridges — Meal log and Workout — with live
 * numbers, the phase chip, this cycle's goal, and one line from Philip.
 */
export function HomeView() {
  const { navigate, setDate } = useUI();
  const today = todayYmd();
  const profile = useProfile();
  const plans = useTargetPlans();
  const entries = useEntriesForDate(today);
  const weights = useWeightEntries();
  const program = useTrainingProgram();
  const sessions = useWorkoutSessions();
  const cycles = useCycles();
  const tmHistory = useTmHistory();

  const unit = profile?.unitPrefs.weight ?? 'kg';
  const foodPhase = phaseFor(plans ? planForDate(plans, today) : null, profile);
  const target = plans ? targetForDate(plans, today) : null;
  const consumed = useMemo(() => sumMacros(entries ?? []), [entries]);
  const rem = target ? remainingAll(foodPhase, consumed, target) : null;

  const card: WorkoutCardState | null = program === undefined || !sessions ? null : workoutCardState(program, sessions, today);
  const cycle = cycles?.find((c) => c.index === program?.currentCycle) ?? null;

  const goToMeals = () => {
    setDate(today);
    navigate('meals');
  };

  return (
    <div className="view view-fit view-home">
      <StatusStrip
        className="home-strip"
        center={
          <div className="home-title">
            <h1 className="pm-display">{t('home.title')}</h1>
            <span className="subtle">{fmtDate(today, 'long')}</span>
          </div>
        }
        right={
          <button type="button" className="pm-pill home-phase" data-tour="phase-chip" onClick={() => navigate('targets')}>
            <span className="visually-hidden">{t('home.phaseLabel')} </span>
            {profile?.goal ? t(PHASE_KEY[foodPhase]) : t('home.phase.none')}
          </button>
        }
      />
      <div className="stack home-stack">
        <p className="home-goal num" data-tour="home-goal">
          {goalLine(profile, cycle?.goal ?? null, cycle ? addDays(fmtYmd(cycle.startedAt), 28) : null, weights ?? [], today, unit)}
        </p>

        <button type="button" className="pm-cart pm-cat-coral" data-tour="home-meals" onClick={goToMeals}>
          <span className="pm-cart-head">
            <Icon name="meals" />
            <span className="pm-cart-label">{t('home.meals')}</span>
          </span>
          {target && rem ? (
            <>
              <span className={`pm-cart-big pm-display num tone-${rem.calories.tone}`}>
                {t(KCAL_KEY[rem.calories.status], { kcal: fmtKcal(rem.calories.amount) })}
              </span>
              <span className="pm-cart-meter" aria-hidden="true">
                <Meter
                  label={t('macro.calories')}
                  value={consumed.calories}
                  max={target.calories}
                  mode={rem.calories.status === 'left' || rem.calories.status === 'over' ? 'drain' : 'fill'}
                  tone={rem.calories.tone}
                />
              </span>
              <span className="pm-cart-sub num">
                {t('home.protein')} {t(G_KEY[rem.proteinG.status], { g: fmtG(rem.proteinG.amount) })}
              </span>
            </>
          ) : (
            <span className="pm-cart-sub">{plans ? t('home.noTargets') : ' '}</span>
          )}
        </button>

        <button
          type="button"
          className="pm-cart pm-cat-sky"
          data-tour="home-workout"
          onClick={() => navigate('workout')}
        >
          <span className="pm-cart-head">
            <Icon name="dumbbell" />
            <span className="pm-cart-label">{t('home.workout')}</span>
            {card?.kind === 'next' && card.week === DELOAD_WEEK && <span className="pm-pill home-deload">{t('home.deload')}</span>}
          </span>
          <WorkoutCardBody state={card} tmHistory={tmHistory ?? []} cyclePhase={cycle?.phase ?? null} unit={unit} />
        </button>

        <DialogBar
          speaker={t('coach.speaker')}
          portrait={<GymCharacter pose="cross-smug" framing="bust" scale={2} className="pm-dialog-portrait" />}
          className="home-dialog"
          action={{ label: t('home.ask'), onClick: () => navigate('ask') }}
        >
          {t(homeLine(card, rem))}
        </DialogBar>
      </div>
    </div>
  );
}

function fmtYmd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function goalLine(
  profile: Profile | undefined,
  goal: { endWeightKg: number; bfLinePct: number | null } | null,
  endDate: string | null,
  weights: readonly WeightEntry[],
  today: string,
  unit: 'kg' | 'lb',
): string {
  const now = rollingWeight(weights, today);
  const parts: string[] = [];
  if (goal && endDate) {
    parts.push(t('home.goal.cycle', { weight: fmtWeight(goal.endWeightKg, unit), date: fmtDate(endDate, 'short') }));
    if (goal.bfLinePct !== null) parts.push(t('home.goal.bf', { bf: fmtNum(goal.bfLinePct, 1) }));
  } else if (profile?.targetWeightKg) {
    parts.push(t('home.goal.target', { weight: fmtWeight(profile.targetWeightKg, unit) }));
  }
  if (now !== null) parts.push(t('home.goal.now', { weight: fmtWeight(now, unit) }));
  return parts.length ? parts.join(' · ') : t('home.goal.none');
}

function WorkoutCardBody({
  state,
  tmHistory,
  cyclePhase,
  unit,
}: {
  state: WorkoutCardState | null;
  tmHistory: Parameters<typeof tmsForCycle>[0];
  cyclePhase: 'lose' | 'maintain' | 'gain' | null;
  unit: 'kg' | 'lb';
}) {
  if (!state) return <span className="pm-cart-sub">{' '}</span>;
  switch (state.kind) {
    case 'setup':
      return (
        <>
          <span className="pm-cart-big">{t('home.workout.setup')}</span>
          <span className="pm-cart-sub">{t('home.workout.setupSub')}</span>
        </>
      );
    case 'briefing':
    case 'cycleDone':
      return (
        <>
          <span className="pm-cart-big">{t('home.workout.briefing')}</span>
          <span className="pm-cart-sub">{t('home.workout.briefingSub')}</span>
        </>
      );
    case 'resume':
      return (
        <>
          <span className="pm-cart-big">{t('home.workout.resume')}</span>
          <span className="pm-cart-sub">
            {t('home.workout.dayLine', {
              block: state.session.block,
              week: state.session.week,
              day: state.session.day,
              lift: t(LIFT_KEY[DAY_LIFT[state.session.day]]),
            })}
          </span>
        </>
      );
    case 'doneToday':
      return (
        <>
          <span className="pm-cart-big">{t('home.workout.doneToday')}</span>
          <span className="pm-cart-sub num">
            {t('home.workout.dayTitle', { day: state.session.day, lift: t(LIFT_KEY[DAY_LIFT[state.session.day]]) })}
          </span>
          {state.next && state.nextDate && (
            <span className="pm-cart-sub num">
              {t('home.workout.doneNext', { day: state.next.day, lift: t(LIFT_KEY[DAY_LIFT[state.next.day]]), date: fmtDate(state.nextDate, 'weekday') })}
            </span>
          )}
        </>
      );
    case 'next': {
      const lift = DAY_LIFT[state.day];
      const tms = tmsForCycle(tmHistory, state.cycle);
      const known = tms.squat !== null && tms.bench !== null && tms.rdl !== null && tms.ohp !== null;
      const plan = known
        ? buildSession({
            cycle: state.cycle,
            week: state.week,
            day: state.day,
            phase: cyclePhase ?? 'maintain',
            tms: { squat: tms.squat ?? 0, bench: tms.bench ?? 0, rdl: tms.rdl ?? 0, ohp: tms.ohp ?? 0 },
          })
        : null;
      const top = plan?.exercises[0]?.prescription.at(-1);
      return (
        <>
          <span className="pm-cart-big">
            {t('home.workout.dayTitle', { day: state.day, lift: t(LIFT_KEY[lift]) })}
          </span>
          <span className="pm-cart-sub num">
            {t('home.workout.blockLine', { block: blockForCycle(state.cycle), week: state.week })}
            {plan && ` · ${t('home.workout.minutes', { n: plan.estMinutes })}`}
          </span>
          {top?.kg != null && (
            <span className="pm-cart-sub num">
              {t(top.kind === 'amrap' ? 'home.workout.topSetPlus' : 'home.workout.topSet', {
                weight: fmtWeight(top.kg, unit),
                reps: top.repMax,
              })}
            </span>
          )}
        </>
      );
    }
  }
}

function homeLine(card: WorkoutCardState | null, rem: ReturnType<typeof remainingAll> | null): StringKey {
  if (card?.kind === 'setup') return 'home.line.setup';
  if (card?.kind === 'resume') return 'home.line.resume';
  if (card?.kind === 'doneToday') return 'home.line.doneToday';
  if (card?.kind === 'briefing' || card?.kind === 'cycleDone') return 'home.line.briefing';
  if (card?.kind === 'next' && card.week === DELOAD_WEEK) return 'home.line.deload';
  if (rem && rem.proteinG.status === 'toGo') return 'home.line.protein';
  return 'home.line.default';
}
