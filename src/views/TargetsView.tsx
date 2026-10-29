import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { NumberField } from '../components/NumberField';
import { useToast } from '../components/Toast';
import { addTargetPlan, updateProfile } from '../db/repo';
import type { ActivityLevel, Goal, Macros, Profile, Sex, TargetPlan, Weekday } from '../db/types';
import { useProfile, useTargetPlans } from '../hooks/useData';
import { t, type StringKey } from '../i18n';
import { ageOn, isValidYmd, todayYmd } from '../lib/date';
import { fmtDate, fmtG, fmtKcal, fmtNum } from '../lib/format';
import { CM_PER_IN, KG_PER_LB, parseDecimal, validateNumber, type FieldError } from '../lib/numbers';
import { planForDate } from '../lib/nutrition';
import { calculateTargets, manualTargetWarnings, REVIEW_CODES, validateInputs, type CalcInputs, type CalcResult, type CalcWarning } from '../lib/targets';

type Mode = 'calculator' | 'manual';

export default function TargetsView() {
  const plans = useTargetPlans();
  const profile = useProfile();
  const today = todayYmd();
  const current = plans ? planForDate(plans, today) : null;
  const [mode, setMode] = useState<Mode>('calculator');
  const [prefill, setPrefill] = useState<Macros | null>(null);

  return (
    <div className="view">
      <header className="view-header">
        <h1>{t('targets.title')}</h1>
      </header>
      <div className="stack">
        <CurrentCard plan={current} />
        <div className="segmented" role="tablist" aria-label={t('targets.title')}>
          {(['calculator', 'manual'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(`targets.${m}`)}
            </button>
          ))}
        </div>
        {profile &&
          (mode === 'calculator' ? (
            <CalculatorForm
              profile={profile}
              onAdjust={(m) => {
                setPrefill(m);
                setMode('manual');
              }}
            />
          ) : (
            <ManualForm key={prefill ? JSON.stringify(prefill) : 'blank'} initial={prefill ?? current ?? null} />
          ))}
        {current && <WeeklyPlanning key={current.id} plan={current} />}
        {profile && <AdherenceSettings profile={profile} />}
        {plans && plans.length > 0 && <TargetHistory plans={plans} />}
      </div>
    </div>
  );
}

function CurrentCard({ plan }: { plan: TargetPlan | null }) {
  return (
    <section className="card stack-sm" aria-labelledby="cur-h">
      <h2 id="cur-h">{t('targets.current')}</h2>
      {plan ? (
        <>
          <div className="target-grid num">
            <Stat label={t('macro.calories')} value={`${fmtKcal(plan.calories)}`} unit={t('common.kcal')} />
            <Stat label={t('macro.protein')} value={fmtG(plan.proteinG)} unit="g" />
            <Stat label={t('macro.fat')} value={fmtG(plan.fatG)} unit="g" />
            <Stat label={t('macro.carbs')} value={fmtG(plan.carbsG)} unit="g" />
          </div>
          <p className="subtle">
            {t('targets.from', { date: fmtDate(plan.effectiveFrom) })} · {t(`targets.method.${plan.method}`)}
            {plan.weekdayOverrides && Object.keys(plan.weekdayOverrides).length > 0 ? ` · ${t('targets.weekly')}` : ''}
          </p>
        </>
      ) : (
        <p className="muted small">{t('targets.none')}</p>
      )}
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value} <span className="stat-unit">{unit}</span>
      </span>
    </div>
  );
}

/* ---------------- Calculator ---------------- */

interface CalcForm {
  sex: Sex | '';
  birthDate: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weight: string;
  activity: ActivityLevel | '';
  trainingDays: string;
  goal: Goal | '';
  targetWeight: string;
  rate: string;
}

const ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'veryActive'];
const GOALS: Goal[] = ['lose', 'maintain', 'gain'];

const r1 = (n: number) => String(Math.round(n * 10) / 10);

function formFromProfile(p: Profile): CalcForm {
  const lb = p.unitPrefs.weight === 'lb';
  const w = (kg: number | null) => (kg == null ? '' : r1(lb ? kg / KG_PER_LB : kg));
  const totalIn = p.heightCm != null ? p.heightCm / CM_PER_IN : null;
  return {
    sex: p.sex ?? '',
    birthDate: p.birthDate ?? '',
    heightCm: p.heightCm != null ? r1(p.heightCm) : '',
    heightFt: totalIn != null ? String(Math.floor(Math.round(totalIn) / 12)) : '',
    heightIn: totalIn != null ? String(Math.round(totalIn) % 12) : '',
    weight: w(p.weightKg),
    activity: p.activityLevel ?? '',
    trainingDays: p.trainingDaysPerWeek != null ? String(p.trainingDaysPerWeek) : '3',
    goal: p.goal ?? '',
    targetWeight: w(p.targetWeightKg),
    rate: p.weeklyRateKg != null && p.weeklyRateKg !== 0 ? w(Math.abs(p.weeklyRateKg)) : '',
  };
}

function CalculatorForm({ profile, onAdjust }: { profile: Profile; onAdjust: (m: Macros) => void }) {
  const toast = useToast();
  const lb = profile.unitPrefs.weight === 'lb';
  const inches = profile.unitPrefs.height === 'in';
  const wUnit = lb ? 'lb' : 'kg';
  const [f, setF] = useState<CalcForm>(() => formFromProfile(profile));
  const [result, setResult] = useState<{ res: CalcResult; inputs: CalcInputs } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CalcForm, FieldError>>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(todayYmd());
  const ids = { sex: useId(), dob: useId(), act: useId(), days: useId(), goal: useId(), eff: useId() };

  // Re-sync if units change.
  const unitKey = `${profile.unitPrefs.weight}-${profile.unitPrefs.height}`;
  const lastUnits = useRef(unitKey);
  useEffect(() => {
    if (lastUnits.current !== unitKey) {
      lastUnits.current = unitKey;
      setF(formFromProfile(profile));
      setResult(null);
    }
  }, [unitKey, profile]);

  const set = <K extends keyof CalcForm>(k: K, v: CalcForm[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setResult(null);
  };

  const toKg = (s: string) => {
    const v = parseDecimal(s);
    return v == null || Number.isNaN(v) ? null : lb ? v * KG_PER_LB : v;
  };

  const calculate = () => {
    setProblem(null);
    const errs: Partial<Record<keyof CalcForm, FieldError>> = {};
    const weightKg = toKg(f.weight);
    let heightCm: number | null;
    if (inches) {
      const ft = parseDecimal(f.heightFt);
      const inch = parseDecimal(f.heightIn) ?? 0;
      const ok = ft != null && Number.isInteger(ft) && ft >= 3 && ft <= 7 && !Number.isNaN(inch) && inch >= 0 && inch < 12;
      heightCm = ok ? (ft * 12 + inch) * CM_PER_IN : null;
      if (heightCm == null) errs.heightFt = ft == null ? 'required' : 'invalid';
    } else {
      const v = validateNumber(f.heightCm, { min: 120, max: 230, required: true });
      heightCm = v.value;
      if (v.error) errs.heightCm = v.error;
    }
    if (weightKg == null) errs.weight = f.weight.trim() ? 'invalid' : 'required';
    // Target weight and rate are hidden (and ignored) for Maintain.
    const usesGoalFields = f.goal === 'lose' || f.goal === 'gain';
    const target = usesGoalFields && f.targetWeight.trim() ? toKg(f.targetWeight) : null;
    if (usesGoalFields && f.targetWeight.trim() && target == null) errs.targetWeight = 'invalid';
    const rate = usesGoalFields && f.rate.trim() ? toKg(f.rate) : null;
    if (usesGoalFields && f.rate.trim() && rate == null) errs.rate = 'invalid';
    setErrors(errs);
    if (!f.sex || !f.activity || !f.goal || !isValidYmd(f.birthDate) || Object.keys(errs).length || weightKg == null || heightCm == null) {
      setProblem(t('targets.missing'));
      return;
    }
    const inputs: CalcInputs = {
      sex: f.sex,
      ageYears: ageOn(f.birthDate, todayYmd()),
      heightCm,
      weightKg,
      activityLevel: f.activity,
      trainingDaysPerWeek: Number(f.trainingDays),
      goal: f.goal,
      targetWeightKg: target,
      weeklyRateKg: rate,
    };
    const invalid = validateInputs(inputs);
    if (invalid.includes('age')) {
      setProblem(t('targets.warning.age'));
      return;
    }
    if (invalid.length) {
      setProblem(t('targets.missing'));
      const map: Record<string, keyof CalcForm> = { height: inches ? 'heightFt' : 'heightCm', weight: 'weight', targetWeight: 'targetWeight', rate: 'rate' };
      setErrors(Object.fromEntries(invalid.filter((k) => map[k]).map((k) => [map[k]!, 'invalid'])));
      return;
    }
    setResult({ res: calculateTargets(inputs), inputs });
  };

  const apply = async () => {
    if (!result || !isValidYmd(effectiveFrom)) return;
    const { res, inputs } = result;
    await updateProfile({
      sex: inputs.sex,
      birthDate: f.birthDate,
      heightCm: Math.round(inputs.heightCm * 10) / 10,
      weightKg: Math.round(inputs.weightKg * 10) / 10,
      activityLevel: inputs.activityLevel,
      trainingDaysPerWeek: inputs.trainingDaysPerWeek,
      goal: inputs.goal,
      targetWeightKg: inputs.targetWeightKg != null ? Math.round(inputs.targetWeightKg * 10) / 10 : null,
      weeklyRateKg: inputs.weeklyRateKg != null ? (inputs.goal === 'lose' ? -1 : 1) * inputs.weeklyRateKg : null,
    });
    await addTargetPlan({
      effectiveFrom,
      calories: res.calories,
      proteinG: res.proteinG,
      fatG: res.fatG,
      carbsG: res.carbsG,
      method: 'calculated',
      inputsSnapshot: {
        ...inputs,
        bmr: res.bmr,
        tdee: res.tdee,
        adjustment: res.adjustment,
        warnings: res.warnings.map((w) => w.code),
        needsReview: res.needsReview,
      },
      weekdayOverrides: null,
    });
    toast(t('targets.saved'));
    setResult(null);
  };

  const wl = (kg: number) => fmtNum(lb ? kg / KG_PER_LB : kg, 1);

  return (
    <section className="card stack" aria-label={t('targets.calculator')}>
      <p className="subtle">{t('targets.estimate')}</p>
      <div className="grid-2">
        <div className="field">
          <label className="field-label" htmlFor={ids.sex}>
            {t('targets.sex')}
          </label>
          <select id={ids.sex} className="select" value={f.sex} onChange={(e) => set('sex', e.target.value as Sex)}>
            <option value="" disabled>
              —
            </option>
            <option value="male">{t('targets.sex.male')}</option>
            <option value="female">{t('targets.sex.female')}</option>
          </select>
        </div>

        <NumberField label={t('targets.weight', { unit: wUnit })} value={f.weight} onChange={(v) => set('weight', v)} error={errors.weight} />
        {inches ? (
          <>
            <NumberField label={`${t('targets.height')} — ${t('targets.heightFt')}`} value={f.heightFt} onChange={(v) => set('heightFt', v)} error={errors.heightFt} />
            <NumberField label={t('targets.heightIn')} value={f.heightIn} onChange={(v) => set('heightIn', v)} />
          </>
        ) : (
          <NumberField label={t('targets.heightCm')} value={f.heightCm} onChange={(v) => set('heightCm', v)} error={errors.heightCm} min={120} max={230} />
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor={ids.dob}>
          {t('targets.birthDate')}
        </label>
        <input id={ids.dob} className="input" type="date" value={f.birthDate} max={todayYmd()} onChange={(e) => set('birthDate', e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={ids.act}>
          {t('targets.activity')}
        </label>
        <select id={ids.act} className="select" value={f.activity} onChange={(e) => set('activity', e.target.value as ActivityLevel)}>
          <option value="" disabled>
            —
          </option>
          {ACTIVITIES.map((a) => (
            <option key={a} value={a}>
              {t(`targets.activity.${a}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={ids.days}>
          {t('targets.trainingDays')}
        </label>
        <select id={ids.days} className="select" value={f.trainingDays} onChange={(e) => set('trainingDays', e.target.value)}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="field-label" id={ids.goal}>
          {t('targets.goal')}
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby={ids.goal}>
          {GOALS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={f.goal === g} onClick={() => set('goal', g)}>
              {t(`targets.goal.${g}`)}
            </button>
          ))}
        </div>
      </div>
      {f.goal && f.goal !== 'maintain' && (
        <div className="grid-2">
          <NumberField label={t('targets.targetWeight', { unit: wUnit })} value={f.targetWeight} onChange={(v) => set('targetWeight', v)} error={errors.targetWeight} />
          <NumberField
            label={t('targets.rate', { unit: wUnit })}
            value={f.rate}
            onChange={(v) => set('rate', v)}
            error={errors.rate}
            hint={t('targets.rateHint')}
          />
        </div>
      )}
      {problem && (
        <div className="banner banner-warning" role="alert">
          <Icon name="warning" />
          <span>{problem}</span>
        </div>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={calculate}>
        {t('targets.calculate')}
      </button>

      {result && (
        <div className="stack result-block" aria-live="polite">
          <h3>{t('targets.result')}</h3>
          <dl className="kv num">
            <dt>{t('targets.bmr')}</dt>
            <dd>{fmtKcal(result.res.bmr)} kcal</dd>
            <dt>{t('targets.tdee')}</dt>
            <dd>{fmtKcal(result.res.tdee)} kcal</dd>
            <dt>{t('targets.adjustment')}</dt>
            <dd>
              {result.res.adjustment > 0 ? '+' : ''}
              {fmtKcal(result.res.adjustment)} kcal
            </dd>
          </dl>
          <div className="target-grid num">
            <Stat label={t('macro.calories')} value={fmtKcal(result.res.calories)} unit={t('common.kcal')} />
            <Stat label={t('macro.protein')} value={fmtG(result.res.proteinG)} unit="g" />
            <Stat label={t('macro.fat')} value={fmtG(result.res.fatG)} unit="g" />
            <Stat label={t('macro.carbs')} value={fmtG(result.res.carbsG)} unit="g" />
          </div>
          <p className="subtle">
            {t('macro.protein')}:{' '}
            {t(result.res.usesReferenceWeight ? 'targets.proteinPerRefKg' : 'targets.proteinPerKg', { value: fmtNum(result.res.proteinPerKg, 1) })} ·{' '}
            {t('macro.fat')}:{' '}
            {t('targets.fatPct', { value: result.res.fatPct })}
          </p>
          {result.inputs.goal !== 'maintain' && (
            <p className="subtle">
              {t('targets.projected', {
                rate: `${result.res.projectedRateKg > 0 ? '+' : result.res.projectedRateKg < 0 ? '−' : ''}${wl(Math.abs(result.res.projectedRateKg))}`,
                unit: wUnit,
              })}
            </p>
          )}
          {result.res.needsReview && (
            <div className="banner banner-danger" role="alert">
              <Icon name="warning" />
              <strong>{t('targets.needsReview')}</strong>
            </div>
          )}
          {result.res.warnings.map((w, i) => (
            <WarningBanner key={i} w={w} unit={wUnit} wl={wl} />
          ))}
          <div className="field">
            <label className="field-label" htmlFor={ids.eff}>
              {t('targets.effectiveFrom')}
            </label>
            <input id={ids.eff} className="input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void apply()}>
            {t('targets.apply')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => onAdjust({ calories: result.res.calories, proteinG: result.res.proteinG, fatG: result.res.fatG, carbsG: result.res.carbsG })}
          >
            {t('targets.edit')}
          </button>
        </div>
      )}
    </section>
  );
}

function WarningBanner({ w, unit, wl }: { w: CalcWarning; unit: string; wl: (kg: number) => string }) {
  const danger = REVIEW_CODES.has(w.code);
  let text: string;
  switch (w.code) {
    case 'rateCapped':
      text = t('targets.warning.rateCapped', { rate: wl(w.rateKg), unit });
      break;
    case 'floor':
      text = t('targets.warning.floor', { floor: fmtKcal(w.floor) });
      break;
    case 'ceiling':
      text = t('targets.warning.ceiling', { ceiling: fmtKcal(w.ceiling) });
      break;
    default:
      text = t(`targets.warning.${w.code}` as StringKey);
  }
  return (
    <div className={`banner ${danger ? 'banner-danger' : 'banner-warning'}`} role="note">
      <Icon name="warning" />
      <span>{text}</span>
    </div>
  );
}

/* ---------------- Manual ---------------- */

interface MacroStrings {
  calories: string;
  proteinG: string;
  fatG: string;
  carbsG: string;
}

const RULES = {
  calories: { min: 500, max: 10000, required: true },
  macro: { min: 0, max: 1000, required: true },
};

function parseMacroStrings(v: MacroStrings): { macros: Macros | null; errors: Partial<Record<keyof MacroStrings, FieldError>> } {
  const c = validateNumber(v.calories, RULES.calories);
  const p = validateNumber(v.proteinG, RULES.macro);
  const fa = validateNumber(v.fatG, RULES.macro);
  const cb = validateNumber(v.carbsG, RULES.macro);
  const errors: Partial<Record<keyof MacroStrings, FieldError>> = {};
  if (c.error) errors.calories = c.error;
  if (p.error) errors.proteinG = p.error;
  if (fa.error) errors.fatG = fa.error;
  if (cb.error) errors.carbsG = cb.error;
  if (Object.keys(errors).length) return { macros: null, errors };
  return { macros: { calories: c.value!, proteinG: p.value!, fatG: fa.value!, carbsG: cb.value! }, errors };
}

const toStrings = (m: Macros | null): MacroStrings => ({
  calories: m ? String(m.calories) : '',
  proteinG: m ? String(m.proteinG) : '',
  fatG: m ? String(m.fatG) : '',
  carbsG: m ? String(m.carbsG) : '',
});

function MacroInputs({ v, errors, onChange }: { v: MacroStrings; errors: Partial<Record<keyof MacroStrings, FieldError>>; onChange: (k: keyof MacroStrings, s: string) => void }) {
  return (
    <div className="grid-2">
      <NumberField label={t('entry.calories')} value={v.calories} onChange={(s) => onChange('calories', s)} error={errors.calories} min={RULES.calories.min} max={RULES.calories.max} />
      <NumberField label={t('entry.protein')} value={v.proteinG} onChange={(s) => onChange('proteinG', s)} error={errors.proteinG} max={1000} />
      <NumberField label={t('entry.fat')} value={v.fatG} onChange={(s) => onChange('fatG', s)} error={errors.fatG} max={1000} />
      <NumberField label={t('entry.carbs')} value={v.carbsG} onChange={(s) => onChange('carbsG', s)} error={errors.carbsG} max={1000} />
    </div>
  );
}

function ManualForm({ initial }: { initial: Macros | null }) {
  const toast = useToast();
  const [v, setV] = useState<MacroStrings>(() => toStrings(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof MacroStrings, FieldError>>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(todayYmd());
  const effId = useId();
  const parsed = useMemo(() => parseMacroStrings(v).macros, [v]);
  const warnings = parsed ? manualTargetWarnings(parsed) : [];

  const save = async () => {
    const r = parseMacroStrings(v);
    setErrors(r.errors);
    if (!r.macros || !isValidYmd(effectiveFrom)) return;
    await addTargetPlan({ effectiveFrom, ...r.macros, method: 'manual', inputsSnapshot: null, weekdayOverrides: null });
    toast(t('targets.saved'));
  };

  return (
    <section className="card stack" aria-label={t('targets.manual')}>
      <MacroInputs
        v={v}
        errors={errors}
        onChange={(k, s) => {
          setV((x) => ({ ...x, [k]: s }));
          setErrors((e) => ({ ...e, [k]: undefined }));
        }}
      />
      {warnings.map((w) => (
        <div key={w.code} className={`banner ${w.code === 'manualLow' ? 'banner-danger' : 'banner-warning'}`} role="note">
          <Icon name="warning" />
          <span>{w.code === 'manualLow' ? t('targets.warning.manualLow') : t('targets.warning.manualEnergy', { kcal: fmtKcal(w.kcal) })}</span>
        </div>
      ))}
      <div className="field">
        <label className="field-label" htmlFor={effId}>
          {t('targets.effectiveFrom')}
        </label>
        <input id={effId} className="input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={() => void save()}>
        {t('common.save')}
      </button>
    </section>
  );
}

/* ---------------- Weekly planning ---------------- */

const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function WeeklyPlanning({ plan }: { plan: TargetPlan }) {
  const toast = useToast();
  const initialOverrides = plan.weekdayOverrides ?? {};
  const [enabled, setEnabled] = useState(Object.keys(initialOverrides).length > 0);
  const [days, setDays] = useState<Partial<Record<Weekday, MacroStrings>>>(() =>
    Object.fromEntries(Object.entries(initialOverrides).map(([k, m]) => [k, toStrings(m as Macros)])),
  );
  const [errors, setErrors] = useState<Partial<Record<Weekday, Partial<Record<keyof MacroStrings, FieldError>>>>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(todayYmd());
  const effId = useId();

  const weeklyAvg = useMemo(() => {
    let total = 0;
    for (const d of WEEK_ORDER) {
      const s = days[d];
      const parsed = s ? parseMacroStrings(s).macros : null;
      total += enabled && parsed ? parsed.calories : plan.calories;
    }
    return total / 7;
  }, [days, enabled, plan.calories]);

  const save = async () => {
    const overrides: Partial<Record<Weekday, Macros>> = {};
    const errs: typeof errors = {};
    if (enabled) {
      for (const d of WEEK_ORDER) {
        const s = days[d];
        if (!s) continue;
        const r = parseMacroStrings(s);
        if (r.macros) overrides[d] = r.macros;
        else errs[d] = r.errors;
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length || !isValidYmd(effectiveFrom)) return;
    // A weekly-plan change is a target change: always a new plan, history untouched.
    await addTargetPlan({
      effectiveFrom,
      calories: plan.calories,
      proteinG: plan.proteinG,
      fatG: plan.fatG,
      carbsG: plan.carbsG,
      method: plan.method,
      inputsSnapshot: plan.inputsSnapshot,
      weekdayOverrides: Object.keys(overrides).length ? overrides : null,
    });
    toast(t('targets.saved'));
  };

  return (
    <section className="card stack" aria-labelledby="weekly-h">
      <h2 id="weekly-h">{t('targets.weekly')}</h2>
      <p className="subtle">{t('targets.weeklyHint')}</p>
      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>{t('targets.weeklyEnable')}</span>
      </label>
      {enabled && (
        <div className="stack">
          {WEEK_ORDER.map((d) => {
            const custom = days[d];
            return (
              <div key={d} className="weekday-block stack-sm">
                <div className="row">
                  <strong style={{ flex: 1 }}>{t(`weekday.${d}`)}</strong>
                  <div className="segmented" role="radiogroup" aria-label={t(`weekday.${d}`)}>
                    <button type="button" role="radio" aria-checked={!custom} onClick={() => setDays((s) => ({ ...s, [d]: undefined }))}>
                      {t('targets.weeklySame')}
                    </button>
                    <button type="button" role="radio" aria-checked={Boolean(custom)} onClick={() => setDays((s) => ({ ...s, [d]: s[d] ?? toStrings(plan) }))}>
                      {t('targets.weeklyCustom')}
                    </button>
                  </div>
                </div>
                {custom && (
                  <MacroInputs
                    v={custom}
                    errors={errors[d] ?? {}}
                    onChange={(k, s) => setDays((x) => ({ ...x, [d]: { ...(x[d] ?? toStrings(plan)), [k]: s } }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="small num">{t('targets.weeklyAvg', { kcal: fmtKcal(weeklyAvg) })}</p>
      <div className="field">
        <label className="field-label" htmlFor={effId}>
          {t('targets.effectiveFrom')}
        </label>
        <input id={effId} className="input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
      </div>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => void save()}>
        {t('targets.weeklySave')}
      </button>
    </section>
  );
}

/* ---------------- Adherence ---------------- */

function AdherenceSettings({ profile }: { profile: Profile }) {
  return (
    <section className="card stack-sm" aria-labelledby="adh-h">
      <h2 id="adh-h">{t('targets.adherence')}</h2>
      <label className="checkbox-row">
        <input type="checkbox" checked={profile.adherenceEnabled} onChange={(e) => void updateProfile({ adherenceEnabled: e.target.checked })} />
        <span>{t('targets.adherenceEnable')}</span>
      </label>
      <details>
        <summary className="details-summary">{t('targets.adherenceHow')}</summary>
        <p className="small muted">
          {t('targets.adherenceBody')}
        </p>
      </details>
    </section>
  );
}

/* ---------------- History ---------------- */

function TargetHistory({ plans }: { plans: TargetPlan[] }) {
  const sorted = [...plans].sort((a, b) => (b.effectiveFrom === a.effectiveFrom ? b.createdAt - a.createdAt : b.effectiveFrom.localeCompare(a.effectiveFrom)));
  return (
    <section className="card card-flush" aria-labelledby="hist-h" role="region">
      <h2 id="hist-h" style={{ padding: 'var(--space-4) var(--space-4) var(--space-2)' }}>
        {t('targets.history')}
      </h2>
      <ul className="list">
        {sorted.map((p) => (
          <li key={p.id} className="list-item">
            <span className="list-text">
              <span className="list-title">{t('targets.from', { date: fmtDate(p.effectiveFrom) })}</span>
              <span className="list-meta num">
                {t(`targets.method.${p.method}`)} · P {fmtG(p.proteinG)} · F {fmtG(p.fatG)} · C {fmtG(p.carbsG)}
                {p.weekdayOverrides && Object.keys(p.weekdayOverrides).length ? ` · ${t('targets.weekly')}` : ''}
              </span>
            </span>
            <span className="list-value">{fmtKcal(p.calories)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
