import { useState } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { useToast } from '../../components/Toast';
import { setUpTraining } from '../../db/repo';
import { t, type StringKey } from '../../i18n';
import { parseDecimal } from '../../lib/numbers';
import { KG_PLATES, LB_PLATES, type PlateUnit } from '../../lib/training/plates';
import { epley, EPLEY_MAX_REPS, LIFTS, tmFromOneRm, type LiftId } from '../../lib/training/program';
import { fmtIn, fromDisplay } from './units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };

interface Row {
  mode: '1rm' | 'set';
  weight: string;
  reps: string;
}

function estimate(row: Row, unit: PlateUnit): { oneRm: number; tm: number; rough: boolean } | null {
  const w = parseDecimal(row.weight);
  if (w === null || !Number.isFinite(w) || w <= 0) return null;
  const kg = fromDisplay(w, unit);
  if (row.mode === '1rm') return { oneRm: kg, tm: tmFromOneRm(kg), rough: false };
  const reps = parseDecimal(row.reps);
  if (reps === null || !Number.isFinite(reps) || reps < 1 || reps > 30 || !Number.isInteger(reps)) return null;
  const oneRm = epley(kg, reps);
  return { oneRm, tm: tmFromOneRm(oneRm), rough: reps > EPLEY_MAX_REPS };
}

/**
 * Training setup (Story 5 §4.1, T-013): a known 1RM or a recent hard set per lift (kg or lb), shown
 * as e1RM and training max; a blank lift is calibrated in its first session. Bar and plates too.
 * Nothing is seeded: every number comes from the owner.
 */
export function SetupView() {
  const toast = useToast();
  const [unit, setUnit] = useState<PlateUnit>('kg');
  const [plateUnit, setPlateUnit] = useState<PlateUnit>('lb');
  const [barKg, setBarKg] = useState('20');
  const [rows, setRows] = useState<Record<LiftId, Row>>({
    squat: { mode: '1rm', weight: '', reps: '' },
    bench: { mode: '1rm', weight: '', reps: '' },
    rdl: { mode: '1rm', weight: '', reps: '' },
    ohp: { mode: '1rm', weight: '', reps: '' },
  });
  const [saving, setSaving] = useState(false);
  const set = (lift: LiftId, patch: Partial<Row>) => setRows((r) => ({ ...r, [lift]: { ...r[lift], ...patch } }));
  const bar = parseDecimal(barKg);
  const barOk = bar !== null && Number.isFinite(bar) && bar >= 5 && bar <= 30;
  const ests = Object.fromEntries(LIFTS.map((l) => [l, estimate(rows[l], unit)])) as Record<LiftId, ReturnType<typeof estimate>>;
  const anyBad = LIFTS.some((l) => rows[l].weight.trim() !== '' && ests[l] === null);

  const save = async () => {
    if (!barOk || anyBad) return;
    setSaving(true);
    const tms: Partial<Record<LiftId, number>> = {};
    for (const l of LIFTS) {
      const e = ests[l];
      if (e) tms[l] = e.tm;
    }
    await setUpTraining({
      bar: { barKg: bar, plateUnit, plates: [...(plateUnit === 'lb' ? LB_PLATES : KG_PLATES)] },
      weightUnit: plateUnit,
      tms,
    });
    toast(t('setup.saved'));
  };

  return (
    <div className="stack workout-setup">
      <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="cross-smug" framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t('setup.intro')}
      </DialogBar>

      <section className="card stack-sm" aria-labelledby="setup-lifts">
        <div className="setup-head">
          <h2 id="setup-lifts">{t('setup.lifts')}</h2>
          <UnitSwitch value={unit} onChange={setUnit} label={t('setup.entryUnit')} />
        </div>
        <p className="small muted">{t('setup.liftsHint')}</p>
        {LIFTS.map((l) => {
          const r = rows[l];
          const e = ests[l];
          const bad = r.weight.trim() !== '' && e === null;
          return (
            <fieldset key={l} className="setup-lift">
              <legend>{t(LIFT_KEY[l])}</legend>
              <div className="segmented" role="radiogroup" aria-label={t('setup.mode')}>
                {(['1rm', 'set'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={r.mode === m} onClick={() => set(l, { mode: m })}>
                    {t(m === '1rm' ? 'setup.mode1rm' : 'setup.modeSet')}
                  </button>
                ))}
              </div>
              <div className="setup-inputs">
                <label className="field">
                  <span className="field-label">{t(unit === 'kg' ? 'setup.weightKg' : 'setup.weightLb')}</span>
                  <input className="input num" inputMode="decimal" value={r.weight} aria-invalid={bad || undefined} onChange={(ev) => set(l, { weight: ev.target.value })} />
                </label>
                {r.mode === 'set' && (
                  <label className="field">
                    <span className="field-label">{t('setup.reps')}</span>
                    <input className="input num" inputMode="numeric" value={r.reps} aria-invalid={bad || undefined} onChange={(ev) => set(l, { reps: ev.target.value })} />
                  </label>
                )}
              </div>
              <p className="small setup-result num" aria-live="polite">
                {e
                  ? t('setup.result', { oneRm: fmtIn(e.oneRm, unit), tm: fmtIn(e.tm, unit) })
                  : bad
                    ? t('setup.invalid')
                    : t('setup.blank')}
              </p>
              {e?.rough && <p className="small warn-text">{t('setup.rough')}</p>}
            </fieldset>
          );
        })}
      </section>

      <section className="card stack-sm" aria-labelledby="setup-bar">
        <h2 id="setup-bar">{t('setup.bar')}</h2>
        <label className="field">
          <span className="field-label">{t('setup.barKg')}</span>
          <input className="input num" inputMode="decimal" value={barKg} aria-invalid={!barOk || undefined} onChange={(e) => setBarKg(e.target.value)} />
        </label>
        <div className="setup-head">
          <span className="field-label">{t('setup.plates')}</span>
          <UnitSwitch value={plateUnit} onChange={setPlateUnit} label={t('setup.plates')} />
        </div>
        <p className="small muted num">{(plateUnit === 'lb' ? LB_PLATES : KG_PLATES).join(' · ')} {plateUnit}</p>
      </section>

      <button type="button" className="btn btn-primary btn-block" disabled={saving || !barOk || anyBad} onClick={() => void save()}>
        {t('setup.save')}
      </button>
    </div>
  );
}

export function UnitSwitch({ value, onChange, label }: { value: PlateUnit; onChange: (u: PlateUnit) => void; label: string }) {
  return (
    <div className="segmented segmented-sm" role="radiogroup" aria-label={label}>
      {(['kg', 'lb'] as const).map((u) => (
        <button key={u} type="button" role="radio" aria-checked={value === u} onClick={() => onChange(u)}>
          {u}
        </button>
      ))}
    </div>
  );
}
