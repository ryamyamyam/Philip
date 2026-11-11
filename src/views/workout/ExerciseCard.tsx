import { useState, type ReactNode } from 'react';
import type { ActualSet, SessionExercise } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { parseDecimal } from '../../lib/numbers';
import { menuSlot, type ExerciseId, type Slot } from '../../lib/training/exercises';
import { loadFor, type BarSetup, type PlateUnit } from '../../lib/training/plates';
import type { Block, Day } from '../../lib/training/program';
import type { Prescribed } from '../../lib/training/session';
import { canCopyOrder, canMarkDone, copyOrder, infoFor } from '../../lib/training/sessionLog';
import { CHECKIN_FLAGS, type CheckinFlag, type CheckinOption } from '../../lib/training/checkin';
import { fmtBoth, fmtIn, fmtRest, fromDisplay, inputValue } from './units';
import { Icon } from '../../components/Icon';
import { startRule } from '../../lib/training/startLoad';
import { useLongPress } from './ReorderList';

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
  /** `ask` = the owner wants Philip (Gemini) to read the note too. */
  onCheckin: (order: number, flag: CheckinFlag | null, note: string, ask: boolean) => void;
  /** OBS-2C086C: a set was just ticked; the card hands the updated exercise for the miss check. */
  onMissed?: (order: number, next: SessionExercise) => void;
  /** Philip's options for the rest of today, waiting for the owner's pick (OBS-097D6D). */
  proposal?: CheckinProposal | null;
  /** The set the options belong to (they show right under it). */
  proposalOrder?: number | null;
  thinking?: boolean;
  onAccept?: (picked: readonly CheckinOption[]) => void;
  onDecline?: () => void;
  /** Story 10 (OBS-DD5F16): long-press the title bar to reorder (undefined = this card can't start it). */
  onReorder?: () => void;
}

/**
 * One exercise: PHILIP'S ORDERS (read-only, frozen on the session) above YOUR LIFT (the owner's own
 * numbers, empty until he types or taps "As ordered"). The two never overwrite each other.
 */
export function ExerciseCard({ ex, day, block, unit, bar, onChange, onRest, onSwap, swapPreviewKg, onCheckin, onMissed, proposal, proposalOrder, thinking, onAccept, onDecline, onReorder }: ExerciseCardProps) {
  const longPress = useLongPress(onReorder);
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
    const was = ex.actual.find((a) => a.order === order);
    const updated = { ...ex, actual: ex.actual.map((a) => (a.order === order ? next : a)) };
    onChange(updated);
    if (restAfter) onRest(restAfter);
    if (next.done && !was?.done) onMissed?.(order, updated);
  };
  const options = proposal ? <ProposalCard key={proposal.message + proposal.options.map((o) => o.id).join()} proposal={proposal} ex={ex} unit={unit} pair={pair} onAccept={onAccept} onDecline={onDecline} /> : null;
  const optionsAtSet = proposal && proposalOrder !== null && proposalOrder !== undefined && ex.prescription.some((p) => p.order === proposalOrder) && !ex.skipped;
  const hurts = () => {
    const target = ex.actual.find((a) => !a.done) ?? ex.actual[ex.actual.length - 1];
    if (!target) return;
    onChange({ ...ex, actual: ex.actual.map((a) => (a.order === target.order ? { ...a, pain: true } : a)) });
  };

  return (
    <section className={`card ex-card${ex.skipped ? ' is-skipped' : ''}`} aria-labelledby={titleId}>
      <header className={`ex-head${onReorder ? ' can-reorder' : ''}`} {...longPress.handlers} title={onReorder ? t('reorder.press') : undefined}>
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
                onCheckin={(flag, note, ask) => onCheckin(p.order, flag, note, ask)}
                after={optionsAtSet && proposalOrder === p.order ? options : null}
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
      {!optionsAtSet && options}

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
  after,
}: {
  after?: ReactNode;
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
  onCheckin: (flag: CheckinFlag | null, note: string, ask: boolean) => void;
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
          onSend={(flag, note, ask) => {
            setTalk(false);
            onCheckin(flag, note, ask);
          }}
        />
      )}
      {after}
    </li>
  );
}

const FLAG_KEY: Record<CheckinFlag, StringKey> = {
  breath: 'checkin.flag.breath',
  heavy: 'checkin.flag.heavy',
  easy: 'checkin.flag.easy',
  pain: 'checkin.flag.pain',
};

/**
 * Tell Philip how this set went. OBS-097D6D: one tap on a flag answers at once with Philip's options
 * (no Send needed). A typed note can go to Philip (Gemini) with "Ask Philip".
 */
function CheckinPanel({
  n,
  initialFlag,
  initialNote,
  onSend,
}: {
  n: number;
  initialFlag: CheckinFlag | null;
  initialNote: string;
  onSend: (flag: CheckinFlag | null, note: string, ask: boolean) => void;
}) {
  const [flag, setFlag] = useState<CheckinFlag | null>(initialFlag);
  const [note, setNote] = useState(initialNote);
  return (
    <div className="checkin" role="group" aria-label={t('checkin.title', { n })}>
      <div className="checkin-flags" role="radiogroup" aria-label={t('checkin.how')}>
        {CHECKIN_FLAGS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={flag === f}
            className="btn btn-sm btn-secondary"
            onClick={() => {
              setFlag(f);
              onSend(f, note.trim(), false);
            }}
          >
            {t(FLAG_KEY[f])}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">{t('checkin.noteLabel')}</span>
        <textarea className="input" rows={2} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="btn btn-sm btn-primary" disabled={!note.trim()} onClick={() => onSend(flag, note.trim(), true)}>
        {t('checkin.send')}
      </button>
    </div>
  );
}

export interface CheckinProposal {
  message: string;
  options: (CheckinOption & { previewKg?: number })[];
  source: 'rules' | 'gemini';
}

/** One option in words. Loads show the new weight; dumbbell pairs per hand. */
function optionText(o: CheckinOption & { previewKg?: number }, unit: PlateUnit, pair: boolean): string {
  const c = o.change;
  const w = (kg: number) => (pair ? t('session.pair', { w: fmtIn(kg, unit) }) : fmtIn(kg, unit));
  if (o.id === 'ai') {
    const parts: string[] = [];
    if (c.loadFactor !== 1) parts.push(o.previewKg !== undefined ? t(c.loadFactor < 1 ? 'checkin.opt.drop' : 'checkin.opt.up', { w: w(o.previewKg) }) : t(c.loadFactor < 1 ? 'checkin.change.lighter' : 'checkin.change.heavier', { pct: Math.round(Math.abs(1 - c.loadFactor) * 100) }));
    if (c.restExtraSec > 0) parts.push(t('checkin.change.rest', { s: c.restExtraSec }));
    if (c.dropSets > 0) parts.push(t('checkin.change.drop', { n: c.dropSets }));
    return t('checkin.opt.ai', { what: parts.join(', ') });
  }
  if (o.scope === 'session') return t('checkin.opt.later', { s: c.restExtraSec });
  if (c.loadFactor !== 1) {
    if (o.previewKg !== undefined) return t(c.loadFactor < 1 ? 'checkin.opt.drop' : 'checkin.opt.up', { w: w(o.previewKg) });
    return t(c.loadFactor < 1 ? 'checkin.change.lighter' : 'checkin.change.heavier', { pct: Math.round(Math.abs(1 - c.loadFactor) * 100) });
  }
  if (c.targetReps !== undefined) return t(o.id === 'repsDown' ? 'checkin.opt.repsDown' : 'checkin.opt.repsUp', { n: c.targetReps });
  if (c.dropSets > 0) return t('checkin.opt.oneLess');
  if (c.restExtraSec < 0) return t('checkin.opt.restLess', { s: -c.restExtraSec });
  return t('checkin.opt.rest', { s: c.restExtraSec });
}

/**
 * Philip's options (OBS-097D6D): his pick is ticked; the owner can tick others (one per kind) and
 * Apply. Nothing changes until Apply. Done sets never change.
 */
function ProposalCard({
  proposal,
  unit,
  pair,
  onAccept,
  onDecline,
}: {
  proposal: CheckinProposal;
  ex: SessionExercise;
  unit: PlateUnit;
  pair: boolean;
  onAccept?: (picked: readonly CheckinOption[]) => void;
  onDecline?: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(() => (proposal.options[0] ? [proposal.options[0].id] : []));
  const toggle = (o: CheckinOption) =>
    setPicked((cur) => {
      if (cur.includes(o.id)) return cur.filter((id) => id !== o.id);
      const groupOf = (id: string) => proposal.options.find((x) => x.id === id)?.group;
      // One pick per kind; Philip's own read of the note replaces the rule picks and the other way round.
      return [...cur.filter((id) => groupOf(id) !== o.group && (o.group === 'ai' ? false : groupOf(id) !== 'ai')), o.id];
    });
  const chosen = proposal.options.filter((o) => picked.includes(o.id));
  return (
    <div className="checkin-proposal" role="status">
      <p className="pm-dialog-text">
        <span className="checkin-speaker">{t('coach.speaker')}</span> {proposal.message}
      </p>
      {proposal.options.length > 0 ? (
        <>
          <p className="small muted">{t('checkin.pick')}</p>
          <div className="checkin-options" role="group" aria-label={t('checkin.optionsLabel')}>
            {proposal.options.map((o, i) => (
              <button key={o.id} type="button" role="checkbox" aria-checked={picked.includes(o.id)} className="btn btn-sm btn-secondary checkin-option" onClick={() => toggle(o)}>
                <span className="checkin-tick" aria-hidden="true">
                  {picked.includes(o.id) ? '✓' : ''}
                </span>
                <span>
                  {optionText(o, unit, pair)}
                  {i === 0 ? <span className="small muted"> · {t('session.philipsPick')}</span> : null}
                </span>
              </button>
            ))}
          </div>
          <div className="ex-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={chosen.length === 0} onClick={() => onAccept?.(chosen)}>
              {t('checkin.apply')}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onDecline}>
              {t('checkin.decline')}
            </button>
          </div>
        </>
      ) : (
        <div className="ex-actions">
          <button type="button" className="btn btn-sm btn-secondary" onClick={onDecline}>
            {t('checkin.ok')}
          </button>
        </div>
      )}
    </div>
  );
}
