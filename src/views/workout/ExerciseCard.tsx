import { useState } from 'react';
import type { ActualSet, SessionExercise } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { parseDecimal } from '../../lib/numbers';
import { menuSlot, type ExerciseId, type Slot } from '../../lib/training/exercises';
import { loadFor, type BarSetup, type PlateUnit } from '../../lib/training/plates';
import type { Block, Day } from '../../lib/training/program';
import type { Prescribed } from '../../lib/training/session';
import { canCopyOrder, canMarkDone, copyOrder, infoFor } from '../../lib/training/sessionLog';
import { CHECKIN_FLAGS, type CheckinFlag, type TodayChange } from '../../lib/training/checkin';
import { fmtBoth, fmtIn, fmtRest, fromDisplay, inputValue } from './units';
import { Icon } from '../../components/Icon';
import { startRule } from '../../lib/training/startLoad';

const loadKindOf = (id: string): LoadKind => {
  try {
    return startRule(id as ExerciseId).kind;
  } catch {
    return 'load';
  }
};

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
  /** Swap to an approved exercise; `keep` makes it this slot's pick for future workouts (Story 6 §7). */
  onSwap: (to: ExerciseId, keep: boolean) => void;
  /** Philip's first-set weight for a swap option (estimate or last progression), for the swap list. */
  swapPreviewKg?: (to: ExerciseId) => number | null;
  /** Owner tells Philip how a set went (owner feedback, Nov 5). */
  onCheckin: (order: number, flag: CheckinFlag | null, note: string) => void;
  /** Philip's proposed change for the rest of today, waiting for OK. */
  proposal?: CheckinProposal | null;
  thinking?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  /** Story 7 (OBS-F52773): move this exercise up (-1) or down (+1); undefined = that way is blocked. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

/**
 * One exercise: PHILIP'S ORDERS (read-only, frozen on the session) above YOUR LIFT (the owner's own
 * numbers, empty until he types or taps "As ordered"). The two never overwrite each other.
 */
export function ExerciseCard({ ex, day, block, unit, bar, onChange, onRest, onSwap, swapPreviewKg, onCheckin, proposal, thinking, onAccept, onDecline, onMoveUp, onMoveDown }: ExerciseCardProps) {
  const info = infoFor(ex.exerciseId);
  const pair = !!info.pair;
  const [noteOpen, setNoteOpen] = useState(ex.note !== '');
  const [swapOpen, setSwapOpen] = useState(false);
  const [keep, setKeep] = useState(false);
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
          {menu && !ex.skipped ? (
            <button type="button" className="ex-name-btn" aria-expanded={swapOpen} onClick={() => setSwapOpen((v) => !v)}>
              {exName(ex.exerciseId)}
              <Icon name="swap" />
            </button>
          ) : (
            exName(ex.exerciseId)
          )}
        </h2>
        {(onMoveUp || onMoveDown) && (
          <div className="ex-move" role="group" aria-label={t('session.orderHint')}>
            <button type="button" className="btn btn-sm btn-ghost" disabled={!onMoveUp} aria-label={t('session.moveUpN', { name: exName(ex.exerciseId) })} onClick={onMoveUp}>
              {t('session.moveUp')}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={!onMoveDown} aria-label={t('session.moveDownN', { name: exName(ex.exerciseId) })} onClick={onMoveDown}>
              {t('session.moveDown')}
            </button>
          </div>
        )}
      </header>
      {ex.swappedFrom && <p className="small muted">{t('cal.swappedFrom', { name: exName(ex.swappedFrom) })}</p>}

      <div className="ex-orders" aria-label={t('session.orders')}>
        <p className="ex-label">{t('session.orders')}</p>
        <p className="small ex-cue">{t(`cue.${ex.exerciseId}` as StringKey)}</p>
        {slot && <p className="small muted ex-why">{t(`why.D${day}-${slot}` as StringKey)}</p>}
        {slot && summaryLine(ex, { kind: loadKindOf(ex.exerciseId), pair }, unit) && <p className="ex-summary num">{summaryLine(ex, { kind: loadKindOf(ex.exerciseId), pair }, unit)}</p>}
        {ex.prescription.some((p) => p.estimate) && (
          <p className="small ex-estimate">
            <span className="pm-pill">{t('session.estimate')}</span> {t('session.estimateWhy')}
          </p>
        )}
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
                bodyweight={!!info.bodyweight || loadKindOf(ex.exerciseId) === 'band' || loadKindOf(ex.exerciseId) === 'timed'}
                loadKind={loadKindOf(ex.exerciseId)}
                pair={pair}
                locked={stopped && !a.done && !a.pain}
                onChange={(next, rest) => setActual(p.order, next, rest)}
                onCheckin={(flag, note) => onCheckin(p.order, flag, note)}
              />
            );
          })}
        </ol>
      )}

      {thinking && (
        <p className="small muted" role="status">
          {t('checkin.thinking')}
        </p>
      )}
      {proposal && <ProposalCard proposal={proposal} unit={unit} onAccept={onAccept} onDecline={onDecline} />}

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
          {anyDone ? (
            <p className="small">{t('session.swapLogged')}</p>
          ) : (
            <>
              <p className="small">{t('session.swapHint')}</p>
              {[menu.pick, ...menu.swaps].map((id) => {
                const kg = id === ex.exerciseId ? (ex.prescription[0]?.kg ?? null) : (swapPreviewKg?.(id) ?? null);
                return (
                  <button
                    key={id}
                    type="button"
                    className="btn btn-sm btn-secondary"
                    aria-pressed={ex.exerciseId === id}
                    onClick={() => {
                      setSwapOpen(false);
                      if (id !== ex.exerciseId) onSwap(id, keep);
                    }}
                  >
                    {exName(id)}
                    {id === menu.pick ? ` · ${t('session.philipsPick')}` : ''}
                    {kg !== null ? ` · ${pair ? t('session.pair', { w: fmtIn(kg, unit) }) : fmtIn(kg, unit)}` : ''}
                  </button>
                );
              })}
              <label className="review-item">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                <span>{t('session.swapKeep')}</span>
              </label>
            </>
          )}
        </div>
      )}

      <div className="ex-actions">
        {menu && !ex.skipped && (
          <button type="button" className="btn btn-sm btn-secondary" aria-expanded={swapOpen} onClick={() => setSwapOpen((v) => !v)}>
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

type LoadKind = ReturnType<typeof startRule>['kind'];

/** What goes before the ×: weight, assistance, Bodyweight, Band, or (nothing to anchor on) Your pick. */
function loadText(p: Prescribed, kind: LoadKind, unit: PlateUnit, both = true, pair = false): string | null {
  const w = (kg: number) => (both ? fmtBoth(kg, unit) : fmtIn(kg, unit));
  if (p.kg !== null) return p.assist ? t('session.assist', { w: w(p.kg) }) : pair ? t('session.pair', { w: w(p.kg) }) : w(p.kg);
  if (kind === 'bodyweight') return t('session.bodyweight');
  if (kind === 'band') return t('session.band');
  if (kind === 'timed') return null;
  return t('session.yourPick');
}

/** Reps for one set: Philip's single target when he has one, else the range (+ for AMRAP sets). */
function repsText(p: Prescribed): string {
  const reps = p.targetReps !== undefined && p.kind === 'accessory' ? String(p.targetReps) : p.repMin === p.repMax ? String(p.repMax) : `${p.repMin}–${p.repMax}`;
  return p.timed ? t('session.seconds', { n: reps }) : `${reps}${p.kind === 'amrap' ? '+' : ''}`;
}

export function orderText(p: Prescribed, unit: PlateUnit, kind: LoadKind, pair = false): string {
  const side = p.perSide ? ` ${t('session.perSide')}` : '';
  const load = loadText(p, kind, unit, true, pair);
  return `${load ? `${load} × ` : ''}${repsText(p)}${side}`;
}

/**
 * Story 6 §6: "3 × 10 @ 25 kg (8–12)" — sets × target reps @ weight, the range in brackets.
 * Story 7 (OBS-C94181): dumbbell pairs read per hand, "3 sets · 2 × 12.5 kg × 10 (8–12)".
 */
export function summaryLine(ex: SessionExercise, info: { kind: LoadKind; pair?: boolean }, unit: PlateUnit): string | null {
  const first = ex.prescription.find((p) => p.kind === 'accessory');
  if (!first) return null;
  const sets = ex.prescription.filter((p) => p.kind === 'accessory').length;
  const range = first.repMin !== first.repMax ? ` (${first.repMin}–${first.repMax})` : '';
  const side = first.perSide ? ` ${t('session.perSide')}` : '';
  if (info.pair && first.kg !== null && !first.assist) {
    return t('session.pairSummary', { sets, w: fmtIn(first.kg, unit), reps: repsText(first), side, range });
  }
  const load = loadText(first, info.kind, unit, false);
  return `${sets} × ${repsText(first)}${side}${load ? ` @ ${load}` : ''}${range}`;
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
  loadKind,
  pair,
  locked,
  onChange,
  onCheckin,
}: {
  loadKind: LoadKind;
  pair: boolean;
  p: Prescribed;
  a: ActualSet;
  unit: PlateUnit;
  bar: BarSetup;
  barbell: boolean;
  bodyweight: boolean;
  locked: boolean;
  onChange: (next: ActualSet, restSec?: number) => void;
  onCheckin: (flag: CheckinFlag | null, note: string) => void;
}) {
  const [talk, setTalk] = useState(false);
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
        <span className="set-target num">{orderText(p, unit, loadKind, pair)}</span>
        {pair && p.kg !== null && <span className="set-total small muted num">{t('session.pairTotal', { w: fmtIn(p.kg * 2, unit) })}</span>}
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
        {pair && (
          <span aria-hidden="true" className="set-pair num">
            2 ×
          </span>
        )}
        <label className="set-field">
          <span className="visually-hidden">{t(pair ? 'session.yourKgHand' : 'session.yourKg', { n, unit })}</span>
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
            placeholder={p.kind === 'amrap' ? '?' : String(p.targetReps ?? p.repMax)}
            disabled={locked}
            onChange={(e) => edit(kg, e.target.value)}
          />
        </label>
        {canCopyOrder(p, bodyweight || loadKind === 'band' || loadKind === 'timed') && !a.done && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={locked}
            aria-label={t('session.asOrderedN', { n })}
            onClick={() => {
              const next = copyOrder(p, a);
              setKg(next.kg === null ? '' : inputValue(next.kg, unit));
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
      {p.kind !== 'warmup' && !locked && (
        <button type="button" className="set-talk small" aria-expanded={talk} onClick={() => setTalk((v) => !v)}>
          {a.flag ? t(FLAG_KEY[a.flag]) : t('checkin.open')}
          {a.note ? ` · “${a.note.slice(0, 40)}${a.note.length > 40 ? '…' : ''}”` : ''}
        </button>
      )}
      {talk && (
        <CheckinPanel
          n={n}
          initialFlag={a.flag ?? null}
          initialNote={a.note ?? ''}
          onSend={(flag, note) => {
            setTalk(false);
            onCheckin(flag, note);
          }}
        />
      )}
    </li>
  );
}

const FLAG_KEY: Record<CheckinFlag, StringKey> = {
  breath: 'checkin.flag.breath',
  heavy: 'checkin.flag.heavy',
  easy: 'checkin.flag.easy',
  pain: 'checkin.flag.pain',
};

/** Tell Philip how this set went: one tap on a flag, an optional note, Send. */
function CheckinPanel({
  n,
  initialFlag,
  initialNote,
  onSend,
}: {
  n: number;
  initialFlag: CheckinFlag | null;
  initialNote: string;
  onSend: (flag: CheckinFlag | null, note: string) => void;
}) {
  const [flag, setFlag] = useState<CheckinFlag | null>(initialFlag);
  const [note, setNote] = useState(initialNote);
  return (
    <div className="checkin" role="group" aria-label={t('checkin.title', { n })}>
      <div className="checkin-flags" role="radiogroup" aria-label={t('checkin.how')}>
        {CHECKIN_FLAGS.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={flag === f} className="btn btn-sm btn-secondary" onClick={() => setFlag(flag === f ? null : f)}>
            {t(FLAG_KEY[f])}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">{t('checkin.noteLabel')}</span>
        <textarea className="input" rows={2} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="btn btn-sm btn-primary" disabled={!flag && !note.trim()} onClick={() => onSend(flag, note.trim())}>
        {t('checkin.send')}
      </button>
    </div>
  );
}

export interface CheckinProposal {
  change: TodayChange;
  message: string;
  source: 'rules' | 'gemini';
}

function ProposalCard({
  proposal,
  onAccept,
  onDecline,
}: {
  proposal: CheckinProposal;
  unit: PlateUnit;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const c = proposal.change;
  const lines: string[] = [];
  if (c.loadFactor !== 1) lines.push(t(c.loadFactor < 1 ? 'checkin.change.lighter' : 'checkin.change.heavier', { pct: Math.round(Math.abs(1 - c.loadFactor) * 100) }));
  if (c.restExtraSec > 0) lines.push(t('checkin.change.rest', { s: c.restExtraSec }));
  if (c.dropSets > 0) lines.push(t('checkin.change.drop', { n: c.dropSets }));
  return (
    <div className="checkin-proposal" role="status">
      <p className="pm-dialog-text">
        <span className="checkin-speaker">{t('coach.speaker')}</span> {proposal.message}
      </p>
      {lines.length > 0 && (
        <ul className="small">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <div className="ex-actions">
        {lines.length > 0 ? (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={onAccept}>
              {t('checkin.accept')}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onDecline}>
              {t('checkin.decline')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-secondary" onClick={onDecline}>
            {t('checkin.ok')}
          </button>
        )}
      </div>
    </div>
  );
}
