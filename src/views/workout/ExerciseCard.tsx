import { useState } from 'react';
import type { ActualSet, SessionExercise } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { parseDecimal } from '../../lib/numbers';
import { menuSlot, type ExerciseId, type Slot } from '../../lib/training/exercises';
import { loadFor, type BarSetup, type PlateUnit } from '../../lib/training/plates';
import type { Block, Day } from '../../lib/training/program';
import type { Prescribed } from '../../lib/training/session';
import { canCopyOrder, canMarkDone, copyOrder, infoFor } from '../../lib/training/sessionLog';
import { fmtBoth, fmtRest, fromDisplay, inputValue } from './units';

const SLOT_KEY: Record<SessionExercise['slot'], StringKey> = {
  main: 'session.slot.main',
  A1: 'session.slot.A1',
  A2: 'session.slot.A2',
  B: 'session.slot.B',
};

const exName = (id: string) => t(`exercise.${id}` as StringKey);

export interface ExerciseCardProps {
  ex: SessionExercise;
  day: Day;
  block: Block;
  unit: PlateUnit;
  bar: BarSetup;
  onChange: (next: SessionExercise) => void;
  onRest: (sec: number) => void;
  onSwap: (to: ExerciseId) => void;
}

/**
 * One exercise: PHILIP'S ORDERS (read-only, frozen on the session) above YOUR LIFT (the owner's own
 * numbers, empty until he types or taps "As ordered"). The two never overwrite each other.
 */
export function ExerciseCard({ ex, day, block, unit, bar, onChange, onRest, onSwap }: ExerciseCardProps) {
  const info = infoFor(ex.exerciseId);
  const [noteOpen, setNoteOpen] = useState(ex.note !== '');
  const [swapOpen, setSwapOpen] = useState(false);
  const stopped = ex.actual.some((a) => a.pain);
  const anyDone = ex.actual.some((a) => a.done);
  const slot = ex.slot === 'main' ? null : (ex.slot as Slot);
  const menu = slot ? menuSlot(day, slot, block) : null;
  const titleId = `ex-${ex.slot}`;

  const setActual = (order: number, next: ActualSet, restAfter?: number) => {
    onChange({ ...ex, actual: ex.actual.map((a) => (a.order === order ? next : a)) });
    if (restAfter) onRest(restAfter);
  };
  const hurts = () => {
    const target = ex.actual.find((a) => !a.done) ?? ex.actual[ex.actual.length - 1];
    if (!target) return;
    onChange({ ...ex, actual: ex.actual.map((a) => (a.order === target.order ? { ...a, pain: true } : a)) });
  };

  return (
    <section className={`card ex-card${ex.skipped ? ' is-skipped' : ''}`} aria-labelledby={titleId}>
      <header className="ex-head">
        <span className="pm-pill ex-slot">{t(SLOT_KEY[ex.slot])}</span>
        <h2 id={titleId} className="ex-name">
          {exName(ex.exerciseId)}
        </h2>
      </header>

      <div className="ex-orders" aria-label={t('session.orders')}>
        <p className="ex-label">{t('session.orders')}</p>
        <p className="small ex-cue">{t(`cue.${ex.exerciseId}` as StringKey)}</p>
        {slot && <p className="small muted ex-why">{t(`why.D${day}-${slot}` as StringKey)}</p>}
      </div>

      {ex.skipped ? (
        <p className="small muted">{t('session.skipped')}</p>
      ) : (
        <ol className="ex-sets">
          {ex.prescription.map((p) => {
            const a = ex.actual.find((x) => x.order === p.order);
            if (!a) return null;
            return (
              <SetRow
                key={`${p.order}-${unit}`}
                p={p}
                a={a}
                unit={unit}
                bar={bar}
                barbell={!!info.barbell}
                bodyweight={!!info.bodyweight}
                locked={stopped && !a.done && !a.pain}
                onChange={(next, rest) => setActual(p.order, next, rest)}
              />
            );
          })}
        </ol>
      )}

      {stopped && (
        <p className="ex-pain" role="alert">
          {t('session.painText')}
        </p>
      )}

      {noteOpen && (
        <label className="field">
          <span className="field-label">{t('session.note')}</span>
          <textarea className="input" rows={2} value={ex.note} onChange={(e) => onChange({ ...ex, note: e.target.value })} />
        </label>
      )}

      {swapOpen && menu && (
        <div className="ex-swap" role="group" aria-label={t('session.swapTitle')}>
          <p className="small">{t('session.swapHint')}</p>
          {[menu.pick, ...menu.swaps].map((id) => (
            <button
              key={id}
              type="button"
              className="btn btn-sm btn-secondary"
              aria-pressed={ex.exerciseId === id}
              onClick={() => {
                setSwapOpen(false);
                if (id !== ex.exerciseId) onSwap(id);
              }}
            >
              {exName(id)}
              {id === menu.pick ? ` · ${t('session.philipsPick')}` : ''}
            </button>
          ))}
        </div>
      )}

      <div className="ex-actions">
        {menu && !anyDone && !ex.skipped && (
          <button type="button" className="btn btn-sm btn-ghost" aria-expanded={swapOpen} onClick={() => setSwapOpen((v) => !v)}>
            {t('session.swap')}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange({ ...ex, skipped: !ex.skipped })}>
          {t(ex.skipped ? 'session.unskip' : 'session.skip')}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" aria-expanded={noteOpen} onClick={() => setNoteOpen((v) => !v)}>
          {t('session.noteBtn')}
        </button>
        {!stopped && !ex.skipped && (
          <button type="button" className="btn btn-sm btn-ghost ex-hurts" onClick={hurts}>
            {t('session.hurts')}
          </button>
        )}
      </div>
    </section>
  );
}

function orderText(p: Prescribed, unit: PlateUnit): string {
  const reps = p.repMin === p.repMax ? String(p.repMax) : `${p.repMin}–${p.repMax}`;
  const amount = p.timed ? t('session.seconds', { n: reps }) : `${reps}${p.kind === 'amrap' ? '+' : ''}`;
  const side = p.perSide ? ` ${t('session.perSide')}` : '';
  const load = p.kg !== null ? fmtBoth(p.kg, unit) : t('session.yourPick');
  return `${load} × ${amount}${side}`;
}

const KIND_KEY: Record<Prescribed['kind'], StringKey> = {
  warmup: 'session.kind.warmup',
  main: 'session.kind.main',
  amrap: 'session.kind.amrap',
  top: 'session.kind.top',
  backoff: 'session.kind.backoff',
  accessory: 'session.kind.accessory',
};

function SetRow({
  p,
  a,
  unit,
  bar,
  barbell,
  bodyweight,
  locked,
  onChange,
}: {
  p: Prescribed;
  a: ActualSet;
  unit: PlateUnit;
  bar: BarSetup;
  barbell: boolean;
  bodyweight: boolean;
  locked: boolean;
  onChange: (next: ActualSet, restSec?: number) => void;
}) {
  const [kg, setKg] = useState(inputValue(a.kg, unit));
  const [reps, setReps] = useState(a.reps === null ? '' : String(a.reps));
  const plates = barbell && p.kg !== null ? loadFor(p.kg, bar) : null;
  const n = p.order + 1;

  const parsedKg = (v: string): number | null => {
    const x = parseDecimal(v);
    return x === null || !Number.isFinite(x) || x <= 0 ? null : fromDisplay(x, unit);
  };
  const parsedReps = (v: string): number | null => {
    const x = parseDecimal(v);
    return x === null || !Number.isFinite(x) || x < 0 ? null : Math.round(x);
  };
  // Typing changes the owner's own numbers: a copied set stops being "as ordered", and a done set reopens.
  const edit = (nextKg: string, nextReps: string) => {
    setKg(nextKg);
    setReps(nextReps);
    onChange({ ...a, kg: parsedKg(nextKg), reps: parsedReps(nextReps), copiedFromOrder: false, done: false });
  };
  const ready = canMarkDone(a, bodyweight);

  return (
    <li className={`set-row${a.done ? ' is-done' : ''}${p.kind === 'warmup' ? ' is-warmup' : ''}`}>
      <div className="set-order">
        <span className="set-n">{t('session.setN', { n })}</span>
        <span className="set-kind small">{t(KIND_KEY[p.kind])}</span>
        <span className="set-target num">{orderText(p, unit)}</span>
        <span className="set-meta small muted num">
          {p.kind === 'warmup'
            ? t('session.restOnly', { t: fmtRest(p.restSec) })
            : `${t('session.rir', { rir: `${p.rir}+` })} · ${t('session.rest', { t: fmtRest(p.restSec) })}`}
        </span>
        {plates && (
          <span className="set-plates small num">
            {plates.perSide.length
              ? t('session.plates', { plates: plates.perSide.join(' + '), unit: plates.unit })
              : t('session.barOnly')}
          </span>
        )}
      </div>
      <div className="set-log">
        <label className="set-field">
          <span className="visually-hidden">{t('session.yourKg', { n, unit })}</span>
          <input
            className="input num"
            inputMode="decimal"
            value={kg}
            placeholder={p.kg !== null ? inputValue(p.kg, unit) : unit}
            disabled={locked}
            onChange={(e) => edit(e.target.value, reps)}
          />
          <span aria-hidden="true" className="set-unit">{unit}</span>
        </label>
        <span aria-hidden="true">×</span>
        <label className="set-field">
          <span className="visually-hidden">{t('session.yourReps', { n })}</span>
          <input
            className="input num"
            inputMode="numeric"
            value={reps}
            placeholder={p.kind === 'amrap' ? '?' : String(p.repMax)}
            disabled={locked}
            onChange={(e) => edit(kg, e.target.value)}
          />
        </label>
        {canCopyOrder(p) && !a.done && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={locked}
            aria-label={t('session.asOrderedN', { n })}
            onClick={() => {
              const next = copyOrder(p, a);
              setKg(inputValue(next.kg, unit));
              setReps(String(next.reps));
              onChange(next, p.restSec);
            }}
          >
            {t('session.asOrdered')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm set-check"
          aria-pressed={a.done}
          aria-label={t(a.done ? 'session.undoneN' : 'session.doneN', { n })}
          disabled={locked || (!a.done && !ready)}
          onClick={() => onChange({ ...a, done: !a.done }, a.done ? undefined : p.restSec)}
        >
          {a.done ? '✓' : t('session.done')}
        </button>
      </div>
    </li>
  );
}
