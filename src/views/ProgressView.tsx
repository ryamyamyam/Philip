import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { NamePlate } from '../components/NamePlate';
import { StatPanel } from '../components/StatPanel';
import { StatRow } from '../components/StatRow';
import { NumberField } from '../components/NumberField';
import { useToast } from '../components/Toast';
import { WeightChart } from '../components/WeightChart';
import { addTargetPlan, deleteWeight, logWeight, restoreWeight } from '../db/repo';
import { DialogBar } from '../components/DialogBar';
import { GymCharacter } from '../components/GymCharacter';
import { setAskDraft } from '../lib/coach/askDraft';
import { refreshPlan, reviewWeighIn } from '../lib/weighIn';
import type { Profile, TargetPlan, WeightEntry } from '../db/types';
import { useProfile, useTargetPlans, useTrainingProgram, useWeightEntries } from '../hooks/useData';
import { overridesFor } from '../lib/goal/carbDays';
import { planForDate } from '../lib/nutrition';
import { trainingDaysOrDefault } from '../lib/training/schedule';
import { t, type StringKey } from '../i18n';
import { addDays, isValidYmd, todayYmd } from '../lib/date';
import { fmtDate, fmtNum } from '../lib/format';
import { KG_PER_LB, validateNumber, type FieldError } from '../lib/numbers';
import { goalDate, weightPlanLine, weightProgress, WEIGHT_LOG_RANGE, type WeightStatus } from '../lib/weight';
import { useUI } from '../ui';
import { StrengthPanel } from './StrengthPanel';
import { GoalHistory } from './goal/GoalHistory';
import { useGoalState } from '../hooks/useGoal';
import { tg } from '../i18n/goal';

const STATUS_KEY: Record<WeightStatus, StringKey> = {
  onTrack: 'progress.status.onTrack',
  ahead: 'progress.status.ahead',
  behind: 'progress.status.behind',
  off: 'progress.status.off',
  reached: 'progress.status.reached',
  needMore: 'progress.status.needMore',
};
const BADGE_KEY: Record<WeightStatus, StringKey> = {
  onTrack: 'progress.badge.onTrack',
  ahead: 'progress.badge.ahead',
  behind: 'progress.badge.behind',
  off: 'progress.badge.off',
  reached: 'progress.badge.reached',
  needMore: 'progress.badge.needMore',
};
const BADGE_TONE: Record<WeightStatus, 'success' | 'warning' | 'neutral'> = {
  onTrack: 'success',
  reached: 'success',
  ahead: 'warning',
  behind: 'warning',
  off: 'warning',
  needMore: 'neutral',
};
const STATUS_TONE: Record<WeightStatus, string> = {
  onTrack: 'tone-success',
  reached: 'tone-success',
  ahead: 'tone-warning',
  behind: 'tone-warning',
  off: 'tone-warning',
  needMore: '',
};

/**
 * Progress (Story 3): one question — am I changing weight at the rate I planned?
 * Status line, actual-vs-plan chart, the weigh-in form and a collapsed history.
 * Targets and the calculator live in Settings › Daily nutrition targets.
 */
export default function ProgressView() {
  const plans = useTargetPlans();
  const profile = useProfile();
  const entries = useWeightEntries();
  const { navigate } = useUI();
  const [section, setSection] = useState<'body' | 'strength'>('body');
  // OBS-3037F2: after a weigh-in, Philip reacts (targets check + training note + Ask Philip).
  const [justLogged, setJustLogged] = useState(false);
  const today = todayYmd();
  const lb = profile?.unitPrefs.weight === 'lb';
  const unit = lb ? 'lb' : 'kg';
  const toUnit = (kg: number) => (lb ? kg / KG_PER_LB : kg);
  const fmtW = (kg: number) => fmtNum(toUnit(kg), 1);

  const line = useMemo(() => (profile && plans ? weightPlanLine(plans, profile, today) : null), [plans, profile, today]);
  const progress = useMemo(() => (entries ? weightProgress(entries, line, today) : null), [entries, line, today]);
  const reach = line ? goalDate(line) : null;

  if (!profile || !plans || !entries || !progress) return <div className="view" />;

  const latest = entries[entries.length - 1] ?? null;
  const goalKg = line?.targetKg ?? profile.targetWeightKg ?? null;
  // The one red accent: behind plan or off maintenance (the status line says it in words).
  const notable = progress.status === 'behind' || progress.status === 'off';

  return (
    <div className="view view-progress">
      <header className="view-header">
        <h1>{t('progress.title')}</h1>
      </header>
      <div className="segmented progress-tabs" role="tablist" aria-label={t('progress.sections')}>
        <button type="button" role="tab" aria-selected={section === 'body'} aria-pressed={section === 'body'} onClick={() => setSection('body')}>
          {t('progress.body')}
        </button>
        <button type="button" role="tab" aria-selected={section === 'strength'} aria-pressed={section === 'strength'} onClick={() => setSection('strength')}>
          {t('progress.strength')}
        </button>
      </div>
      {section === 'strength' ? (
        <StrengthPanel />
      ) : (
      <div className="stack">
        <StatPanel title={t('progress.weight')}>
          {latest && (
            <NamePlate
              title={t('progress.plate.latest', { value: fmtW(latest.weightKg), unit })}
              subtitle={goalKg != null ? t('progress.plate.goal', { value: fmtW(goalKg), unit }) : t('progress.plate.noGoal')}
              badge={{ label: t(BADGE_KEY[progress.status]), tone: BADGE_TONE[progress.status] }}
            />
          )}
          <p className={`progress-status ${STATUS_TONE[progress.status]}`} role="status">
            <strong>{t(STATUS_KEY[progress.status], { value: fmtNum(Math.abs(toUnit(progress.diffKg ?? 0)), 1), unit })}</strong>
          </p>
          {line && (progress.actualRateKg != null || progress.expectedTodayKg != null || (reach && line.targetKg != null)) && (
            <dl className="pm-rows">
              {progress.actualRateKg != null && (
                <>
                  <StatRow label={t('progress.row.rate')} value={t('progress.perWeek', { value: signed(toUnit(progress.actualRateKg)), unit })} notable={notable} />
                  <StatRow label={t('progress.row.planRate')} value={t('progress.perWeek', { value: signed(toUnit(line.rateKg)), unit })} />
                </>
              )}
              {progress.expectedTodayKg != null && (
                <StatRow label={t('progress.row.today')} value={`${fmtW(progress.expectedTodayKg)} ${unit}`} />
              )}
              {reach && line.targetKg != null && (
                <StatRow label={t('progress.row.reach')} value={`${fmtW(line.targetKg)} ${unit} · ${fmtDate(reach)}`} />
              )}
            </dl>
          )}
          {(entries.length > 0 || line) && <WeightChart entries={entries} line={line} today={today} toUnit={toUnit} unit={unit} />}
          {!line && (
            <>
              <p className="subtle">{t('progress.noLine')}</p>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('targets')}>
                <Icon name="progress" /> {t('progress.setUp')}
              </button>
            </>
          )}
        </StatPanel>
        <WeighIn lb={lb} unit={unit} onLogged={() => setJustLogged(true)} />
        {justLogged && latest && (
          <WeighInTake plans={plans} profile={profile} entries={entries} today={today} unit={unit} toUnit={toUnit} latestKg={latest.weightKg} onDone={() => setJustLogged(false)} />
        )}
        <GoalHistory unit={unit === 'lb' ? 'lb' : 'kg'} />
        {entries.length > 0 && <WeightHistory entries={entries} fmtW={fmtW} unit={unit} />}
      </div>
      )}
    </div>
  );
}

function signed(n: number): string {
  const v = fmtNum(Math.abs(n), 2);
  return n > 0 ? `+${v}` : n < 0 ? `−${v}` : v;
}

function WeighIn({ lb, unit, onLogged }: { lb: boolean; unit: string; onLogged: () => void }) {
  const toast = useToast();
  const today = todayYmd();
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<FieldError | null>(null);
  const dateId = useId();
  const range = lb
    ? { min: Math.ceil(WEIGHT_LOG_RANGE.min / KG_PER_LB), max: Math.floor(WEIGHT_LOG_RANGE.max / KG_PER_LB) }
    : WEIGHT_LOG_RANGE;

  const save = async () => {
    const v = validateNumber(value, { ...range, required: true });
    if (v.error || v.value == null || !isValidYmd(date)) {
      setError(v.error ?? 'invalid');
      return;
    }
    await logWeight(date, lb ? v.value * KG_PER_LB : v.value);
    setValue('');
    toast(t('progress.logged', { value: fmtNum(v.value, 1), unit }));
    onLogged();
  };

  return (
    <StatPanel title={t('progress.logWeight')}>
      <form
        className="weight-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <NumberField
          label={t('progress.weightLabel', { unit })}
          value={value}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          error={error}
          min={range.min}
          max={range.max}
        />
        <div className="field">
          <label className="field-label" htmlFor={dateId}>
            {t('entry.date')}
          </label>
          <input id={dateId} className="input input-date" type="date" value={date} max={addDays(today, 1)} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary weight-save">
          {t('progress.logWeight')}
        </button>
      </form>
    </StatPanel>
  );
}

function WeightHistory({ entries, fmtW, unit }: { entries: WeightEntry[]; fmtW: (kg: number) => string; unit: string }) {
  const toast = useToast();
  const recent = [...entries].reverse().slice(0, 30);
  const remove = async (date: string) => {
    const removed = await deleteWeight(date);
    if (removed) toast(t('progress.deleted', { date: fmtDate(date) }), { label: t('common.undo'), run: () => void restoreWeight(removed) });
  };
  return (
    <details className="pm-panel weight-history">
      <summary className="pm-panel-head">
        <span className="pm-panel-title">{t('progress.history')}</span>
      </summary>
      <ul className="list">
        {recent.map((e) => (
          <li key={e.date} className="list-item">
            <span className="list-text">
              <span className="list-title">{fmtDate(e.date, 'weekday')}</span>
            </span>
            <span className="list-value num">
              {fmtW(e.weightKg)} {unit}
            </span>
            <button type="button" className="icon-btn" aria-label={t('progress.delete', { date: fmtDate(e.date) })} onClick={() => void remove(e.date)}>
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * OBS-3037F2: Philip's reaction to a weigh-in. Local math only (no AI): recalculates the targets
 * with the new weight and offers them through the same append-only plan path as Targets. The Gemini
 * follow-up is one tap away in Ask Philip, pre-filled, and only sent when the owner taps Send.
 */
function WeighInTake({
  plans,
  profile,
  entries,
  today,
  unit,
  toUnit,
  latestKg,
  onDone,
}: {
  plans: TargetPlan[];
  profile: Profile;
  entries: WeightEntry[];
  today: string;
  unit: string;
  toUnit: (kg: number) => number;
  latestKg: number;
  onDone: () => void;
}) {
  const { navigate, openSheet } = useUI();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const program = useTrainingProgram();
  // 0.12.3: with a cycle running, Philip re-plans everything (food, P/F/C, lift weights, cardio, days) for a yes/no each.
  const goal = useGoalState();
  const canReplan = !!goal?.cycle && !goal.cycle.endedEarly && !goal.cycleDone;
  const replan = () => {
    onDone();
    openSheet(goal?.open ? { kind: 'goal' } : { kind: 'goal', manual: true, autoAsk: !goal?.openManual });
  };
  const review = useMemo(() => reviewWeighIn(plans, profile, entries, today), [plans, profile, entries, today]);
  const r = review.refresh;
  const fmtW = (kg: number) => fmtNum(toUnit(kg), 1);
  // The take renders below the form: bring it into view so the reaction isn't missed.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, []);

  const apply = async () => {
    if (!r) return;
    setBusy(true);
    // Story 12 update: a plan with carb days keeps them, re-split on the new numbers.
    const carry = planForDate(plans, today)?.inputsSnapshot?.carbDays === true && program?.carbDays !== false;
    await addTargetPlan(refreshPlan(r, today, carry ? overridesFor(r.to, trainingDaysOrDefault(program?.trainingDays), r.inputs.sex, true) : null));
    toast(t('weighIn.applied'));
    onDone();
  };
  const ask = () => {
    setAskDraft(t('weighIn.askQuestion', { weight: fmtW(latestKg), unit }));
    navigate('ask');
  };

  let line: string;
  if (review.progress.status === 'reached') line = t('weighIn.reached');
  else if (review.noPlan) line = t('weighIn.noPlan');
  else if (r)
    line = t('weighIn.refresh', {
      weight: fmtW(r.weightKg),
      unit,
      source: t(`weighIn.source.${r.weightSource}`),
      fromKcal: fmtNum(r.from.calories, 0),
      toKcal: fmtNum(r.to.calories, 0),
      fromP: fmtNum(r.from.proteinG, 0),
      toP: fmtNum(r.to.proteinG, 0),
    });
  else if (review.needsReview) line = '';
  else line = t('weighIn.fits');

  return (
    <StatPanel title={t('weighIn.title')}>
      <div ref={ref} className="stack-sm weigh-in-take" role="status">
        {line && (
          <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="point-up" framing="bust" scale={2} className="pm-dialog-portrait" />}>
            {line}
          </DialogBar>
        )}
        {/* Safety text stays plain (D-020). */}
        {review.needsReview && !r && review.progress.status !== 'reached' && <p className="banner banner-warning">{t('weighIn.review')}</p>}
        {canReplan && (
          <button type="button" className="btn btn-primary btn-block" onClick={replan}>
            <Icon name="sparkle" /> {tg('replan.weighIn')}
          </button>
        )}
        {r && review.progress.status !== 'reached' && (
          <>
            <p className="small num">
              {t('weighIn.newMacros', { kcal: fmtNum(r.to.calories, 0), p: fmtNum(r.to.proteinG, 0), f: fmtNum(r.to.fatG, 0), c: fmtNum(r.to.carbsG, 0) })}
            </p>
            <button type="button" className={`btn ${canReplan ? 'btn-secondary' : 'btn-primary'} btn-block`} disabled={busy} onClick={() => void apply()}>
              {t('weighIn.apply')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                toast(t('weighIn.kept'));
                onDone();
              }}
            >
              {t('weighIn.keep')}
            </button>
          </>
        )}
        {(review.noPlan || review.needsReview || review.progress.status === 'reached') && (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('targets')}>
            {t('weighIn.toTargets')}
          </button>
        )}
        <p className="small muted">{t('weighIn.training')}</p>
        {profile.geminiKey && !canReplan && (
          <button type="button" className="btn btn-ghost btn-block" onClick={ask}>
            <Icon name="sparkle" /> {t('weighIn.ask')}
          </button>
        )}
      </div>
    </StatPanel>
  );
}
