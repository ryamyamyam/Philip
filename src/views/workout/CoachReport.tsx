import { useEffect, useRef, useState } from 'react';
import { addCoachNotes, applyCoachProposals, saveCoachThread } from '../../db/repo';
import { loadBrief } from '../../db/coachBrief';
import { todayYmd } from '../../lib/date';
import { newId } from '../../db/db';
import { useProfile } from '../../hooks/useData';
import type { CoachChange, CoachProposal, CoachThread, CycleRecord, TmRecord, TrainingProgram, WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { addPhilipTurn, chatPrompt, cleanText, newThread, parseCoachTurn, reportPrompt, type CoachContext } from '../../lib/training/coach';
import { exerciseFor, menuSlot, slotKey, type ExerciseId } from '../../lib/training/exercises';
import { blockForCycle } from '../../lib/training/program';
import { tmsForCycle } from '../../lib/training/progress';
import { trainingDaysOrDefault } from '../../lib/training/schedule';
import { infoFor } from '../../lib/training/sessionLog';
import { fmtIn } from './units';

const LIFT_KEY = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' } as const;
const WD: Record<number, StringKey> = { 1: 'cal.wd.mon', 2: 'cal.wd.tue', 3: 'cal.wd.wed', 4: 'cal.wd.thu', 5: 'cal.wd.fri', 6: 'cal.wd.sat', 7: 'cal.wd.sun' };
const exName = (id: string) => t(`exercise.${id}` as StringKey);

interface Props {
  session: WorkoutSession;
  program: TrainingProgram;
  cycle: CycleRecord | null;
  tmHistory: readonly TmRecord[];
  choices: Readonly<Record<string, string>>;
  unit: 'kg' | 'lb';
  /** Write the report as soon as this shows (right after Finish). */
  auto?: boolean;
}

/**
 * Philip's observation report after a workout and the chat under it (Story 7, OBS-3DB146). Gemini
 * writes the report and proposes plan changes; every proposal is validated in lib/training/coach.ts
 * and applies only when the owner taps Apply (deleting the log undoes it). Without a key the rules
 * review above still works and this says what's needed.
 */
export function CoachReport({ session, program, cycle, tmHistory, choices, unit, auto }: Props) {
  const profile = useProfile();
  const key = profile?.geminiKey ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [comment, setComment] = useState('');
  // The thread shown here: the stored one, updated live by every save.
  const thread = session.coach ?? null;
  const started = useRef(false);

  const ctx = (): CoachContext => {
    const tms = tmsForCycle(tmHistory, session.cycle);
    return {
      session,
      phase: cycle?.phase ?? 'maintain',
      tms,
      trainingDays: trainingDaysOrDefault(program.trainingDays),
      choices,
      unit: program.weightUnit,
      name: exName,
    };
  };

  const ask = async (prompt: string): Promise<unknown> => {
    const { coachCheckinWithGemini, DEFAULT_GEMINI_MODEL, normalizeModel } = await import('../../services/foodAnalysis/gemini');
    return coachCheckinWithGemini({ apiKey: key ?? '', model: normalizeModel(profile?.geminiModel ?? DEFAULT_GEMINI_MODEL), text: prompt });
  };

  const report = async () => {
    if (!key || busy) return;
    setBusy(true);
    setError(false);
    try {
      const c = ctx();
      // Story 9: Philip reads the whole history (brief), not just today.
      const brief = await loadBrief(todayYmd(), { excludeSessionId: session.id });
      const turn = parseCoachTurn(await ask(reportPrompt(c, brief)), c);
      if (!turn) throw new Error('bad reply');
      await saveCoachThread(session.id, newThread(turn, Date.now(), newId));
      if (turn.remember.length) await addCoachNotes(turn.remember, { source: 'report', sessionId: session.id });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = cleanText(comment, 1000);
    if (!key || !thread || !text || busy) return;
    const withMine: CoachThread = { ...thread, messages: [...thread.messages, { from: 'me', text, at: Date.now() }], updatedAt: Date.now() };
    await saveCoachThread(session.id, withMine);
    setComment('');
    setBusy(true);
    setError(false);
    try {
      const c = ctx();
      const brief = await loadBrief(todayYmd(), { excludeSessionId: session.id });
      const turn = parseCoachTurn(await ask(chatPrompt(c, thread, text, brief)), c);
      if (!turn) throw new Error('bad reply');
      await saveCoachThread(session.id, addPhilipTurn(withMine, turn, Date.now(), newId));
      if (turn.remember.length) await addCoachNotes(turn.remember, { source: 'report', sessionId: session.id });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (auto && key && !thread && !started.current) {
      started.current = true;
      void report();
    }
    // Runs once per mount, as soon as the key is known (`started` guards repeats).
  }, [auto, key, thread]);

  const decide = async (p: CoachProposal, apply: boolean) => {
    if (!thread) return;
    if (apply) await applyCoachProposals(session.id, [p.id]);
    else await saveCoachThread(session.id, { ...thread, proposals: thread.proposals.map((x) => (x.id === p.id ? { ...x, status: 'declined' } : x)), updatedAt: Date.now() });
  };
  const applyAll = async () => {
    if (!thread) return;
    await applyCoachProposals(
      session.id,
      thread.proposals.filter((p) => p.status === 'open').map((p) => p.id),
    );
  };

  const label = (c: CoachChange, applied = false): string => {
    const tms = tmsForCycle(tmHistory, session.cycle);
    switch (c.kind) {
      case 'tm': {
        const from = tms[c.lift];
        return t('report.change.tm', { lift: t(LIFT_KEY[c.lift]), from: from !== null ? fmtIn(from, unit) : '–', to: fmtIn(c.toKg, unit) });
      }
      case 'rest':
        return t('report.change.rest', { s: c.extraSec });
      case 'next': {
        const what = [
          c.kg !== null ? t('report.change.nextKg', { w: infoFor(c.exerciseId).pair ? t('session.pair', { w: fmtIn(c.kg, unit) }) : fmtIn(c.kg, unit) }) : null,
          c.reps !== null ? t('report.change.nextReps', { n: c.reps }) : null,
          c.sets !== null ? t('report.change.nextSets', { n: c.sets }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return t('report.change.next', { name: exName(c.exerciseId), what });
      }
      case 'swap': {
        const block = blockForCycle(session.cycle);
        // Once applied, the current choice IS the new exercise: show what it replaced instead.
        const key = slotKey(c.day, c.slot, block);
        const rec = applied ? session.reviewApplied?.swaps?.find((x) => x.slotKey === key) : undefined;
        const from = rec ? (rec.from ?? menuSlot(c.day, c.slot, block).pick) : exerciseFor(c.day, c.slot, block, choices as Record<string, ExerciseId>);
        return t('report.change.swap', { day: c.day, slot: c.slot, from: exName(from), to: exName(c.exerciseId) });
      }
      case 'days':
        return t('report.change.days', { days: c.days.map((d) => t(WD[d] ?? 'cal.wd.mon')).join(' ') });
    }
  };

  const open = thread?.proposals.filter((p) => p.status === 'open') ?? [];

  return (
    <section className="card stack-sm" aria-labelledby={`report-h-${session.id}`}>
      <h2 id={`report-h-${session.id}`}>{t('report.title')}</h2>
      {!key && !thread && <p className="small">{t('report.noKey')}</p>}
      {key && !thread && !busy && (
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => void report()}>
          {error ? t('report.retry') : t('report.get')}
        </button>
      )}
      {thread && <p className="report-text">{thread.report}</p>}
      {thread && thread.proposals.length > 0 && (
        <>
          <p className="small">{t('report.proposals')}</p>
          <ul className="report-proposals">
            {thread.proposals.map((p) => (
              <li key={p.id} className={`report-proposal${p.status === 'applied' ? ' is-applied' : p.status === 'declined' ? ' is-declined' : ''}`}>
                <span className="num">{label(p.change, p.status === 'applied')}</span>
                {p.why && <span className="small muted">{p.why}</span>}
                {p.status === 'open' ? (
                  <div className="ex-actions">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => void decide(p, true)}>
                      {t('report.apply')}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => void decide(p, false)}>
                      {t('report.decline')}
                    </button>
                  </div>
                ) : (
                  <span className="small">{t(p.status === 'applied' ? 'report.applied' : 'report.declined')}</span>
                )}
              </li>
            ))}
          </ul>
          {open.length > 1 && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => void applyAll()}>
              {t('report.applyAll')}
            </button>
          )}
          <p className="small muted">{t('report.undoNote')}</p>
        </>
      )}
      {thread && thread.messages.length > 0 && (
        <ol className="report-thread">
          {thread.messages.map((m) => (
            <li key={m.at + m.from} className={`report-msg${m.from === 'me' ? ' is-me' : ''}`}>
              <span className="report-who">{m.from === 'me' ? t('report.me') : t('coach.speaker')}:</span> {m.text}
            </li>
          ))}
        </ol>
      )}
      {busy && (
        <p className="small muted" role="status">
          {t('report.thinking')}
        </p>
      )}
      {error && (
        <p className="small" role="alert">
          {t('report.error')}
        </p>
      )}
      {thread && key && (
        <>
          <label className="field">
            <span className="field-label">{t('report.chatLabel')}</span>
            <textarea className="input" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !comment.trim()} onClick={() => void send()}>
            {t('report.send')}
          </button>
        </>
      )}
    </section>
  );
}
