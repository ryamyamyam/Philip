import { useEffect, useState } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { canUndoPlaybook, getPlaybookUpdate, runPlaybookUpdate, undoPlaybookUpdate, type PlaybookUpdateRecord, type UpdateKind } from '../../db/playbookRepo';
import { t17 } from '../../i18n/s17';
import type { ActivityLevel } from '../../db/types';
import { updateProfile } from '../../db/repo';
import { useProfile, useTrainingProgram } from '../../hooks/useData';
import { t, type StringKey } from '../../i18n';
import { tp, type PlaybookKey } from '../../i18n/playbook';
import { todayYmd } from '../../lib/date';
import { fmtG, fmtKcal } from '../../lib/format';
import { cutLine } from '../../lib/playbook/rules';
import type { Macros } from '../../db/types';
import { useUI } from '../../ui';
import { fmtIn } from '../workout/units';

/** Training-age answers (years, the middle of each PB-2.3 band). */
const YEARS: { key: PlaybookKey; years: number }[] = [
  { key: 'pb.years.lt1', years: 0.5 },
  { key: 'pb.years.1to3', years: 2 },
  { key: 'pb.years.gt3', years: 5 },
];

const macroLine = (m: Macros) => tp('pb.macros', { kcal: fmtKcal(m.calories), p: fmtG(m.proteinG), f: fmtG(m.fatG), c: fmtG(m.carbsG) });

/**
 * Story 16 §3.2: today's plan under Philip's Playbook. Shown once after the 0.16.1 update (and from
 * Settings › Training afterwards). Asks his training age once if it isn't known, then applies the
 * re-check automatically and shows before → after with the PB IDs that caused each change, the loads
 * the sweep fixed, and Undo for 24 hours.
 */
export default function PlaybookSheet({ kind = 'playbook' }: { kind?: UpdateKind }) {
  const { closeSheet } = useUI();
  const toast = useToast();
  const profile = useProfile();
  const program = useTrainingProgram();
  const [rec, setRec] = useState<PlaybookUpdateRecord | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Story 17 (PB-2.2): the maintenance re-check asks his daily movement once, then applies.
  const [moved, setMoved] = useState(false);
  const tdee = kind === 'tdee';
  const askYears = !tdee && profile !== undefined && (profile?.trainingYears ?? null) === null && rec === null;
  const askMove = tdee && profile !== undefined && rec === null && !moved;

  useEffect(() => {
    void getPlaybookUpdate(undefined, kind).then((r) => setRec(r && r.status !== 'fresh' ? r : null));
  }, [kind]);

  // Known training age (or answered/skipped): apply automatically.
  const apply = async () => {
    setBusy(true);
    try {
      setRec(await runPlaybookUpdate(todayYmd(), undefined, kind));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!tdee && rec === null && profile && profile.trainingYears != null && !busy) void apply();
  }, [rec, profile?.trainingYears]);
  const answerMove = async (level: ActivityLevel | null) => {
    if (level !== null) await updateProfile({ activityLevel: level });
    setMoved(true);
    await apply();
  };

  const answer = async (years: number | null) => {
    if (years !== null) await updateProfile({ trainingYears: years });
    await apply();
  };

  const undo = async () => {
    await undoPlaybookUpdate(todayYmd(), undefined, kind);
    setRec(await getPlaybookUpdate(undefined, kind));
    toast(tp('pb.undone'));
  };

  const unit = program?.weightUnit ?? profile?.unitPrefs.weight ?? 'kg';
  const nothing = rec && !rec.manual && rec.changes.length === 0 && !rec.splitChanged && rec.loads.length === 0;
  const line = !rec ? (tdee ? t17('tdee.line') : tp('pb.line')) : rec.manual ? tp('pb.lineManual') : nothing ? (tdee ? t17('tdee.lineNone') : tp('pb.lineNone')) : tdee ? t17('tdee.line') : tp('pb.line');

  return (
    <Sheet
      title={tdee ? t17('tdee.title') : tp('pb.title')}
      onClose={closeSheet}
      full
      footer={
        rec ? (
          <div className="stack-sm">
            {canUndoPlaybook(rec, Date.now()) && (
              <button type="button" className="btn btn-secondary btn-block" onClick={() => void undo()}>
                {tp('pb.undo')}
              </button>
            )}
            <button type="button" className="btn btn-primary btn-block" onClick={closeSheet}>
              {tp('pb.done')}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="stack playbook-sheet">
        <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="point-up" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {line}
        </DialogBar>

        {askMove && (
          <section className="card stack-sm" aria-labelledby="pb-move">
            <h3 id="pb-move">{t17('tdee.ask.title')}</h3>
            <p className="small muted">{t17('tdee.ask.why')}</p>
            <div className="stack-xs" role="group" aria-labelledby="pb-move">
              {(['sedentary', 'active'] as const).map((lv) => (
                <button key={lv} type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => void answerMove(lv)}>
                  {t17(`tdee.ask.${lv}`)}
                </button>
              ))}
              <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => void answerMove(null)}>
                {tp('pb.years.skip')}
              </button>
            </div>
          </section>
        )}

        {askYears && (
          <section className="card stack-sm" aria-labelledby="pb-years">
            <h3 id="pb-years">{tp('pb.years.title')}</h3>
            <p className="small muted">{tp('pb.years.why')}</p>
            <div className="stack-xs" role="group" aria-labelledby="pb-years">
              {YEARS.map((y) => (
                <button key={y.key} type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => void answer(y.years)}>
                  {tp(y.key)}
                </button>
              ))}
              <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => void answer(null)}>
                {tp('pb.years.skip')}
              </button>
            </div>
          </section>
        )}

        {busy && (
          <p className="small muted" role="status">
            {tp('pb.applying')}
          </p>
        )}

        {rec && rec.status === 'undone' && <p className="small">{tp('pb.undone')}</p>}

        {rec && rec.changes.length > 0 && (
          <section className="card stack-sm" aria-labelledby="pb-plan">
            <h3 id="pb-plan">{tp('pb.sec.plan')}</h3>
            <ul className="stack-xs pb-changes">
              {rec.changes.map((c) => (
                <li key={c.field} className="pb-change">
                  <span className="pb-field">{tp(`pb.row.${c.field}` as PlaybookKey)}</span>
                  <span className="num">{tp('pb.arrow', { before: c.field === 'calories' ? `${fmtKcal(c.before)} kcal` : `${fmtG(c.before)} g`, after: c.field === 'calories' ? `${fmtKcal(c.after)} kcal` : `${fmtG(c.after)} g` })}</span>
                  <span className="pm-pill small">{tp('pb.ids', { ids: c.pbIds.join(', ') })}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">{tp('pb.food')}</p>
          </section>
        )}

        {rec && rec.splitChanged && (
          <section className="card stack-sm" aria-labelledby="pb-split">
            <h3 id="pb-split">{tp('pb.sec.split')}</h3>
            {(['gym', 'rest'] as const).map((k) => (
              <p key={k} className="small num">
                <strong>{tp(k === 'gym' ? 'pb.gym' : 'pb.rest')}:</strong>{' '}
                {tp('pb.arrow', {
                  before: rec.splitBefore ? macroLine(rec.splitBefore[k]) : tp('pb.splitNone'),
                  after: rec.splitAfter ? macroLine(rec.splitAfter[k]) : tp('pb.splitNone'),
                })}
              </p>
            ))}
            <p className="small muted">{tp('pb.splitWhy')}</p>
          </section>
        )}

        {rec && rec.loads.length > 0 && (
          <section className="card stack-sm" aria-labelledby="pb-loads">
            <h3 id="pb-loads">{tp('pb.sec.loads')}</h3>
            <ul className="stack-xs">
              {rec.loads.map((l) => (
                <li key={l.exerciseId} className="small num">
                  {tp('pb.loadLine', { name: t(`exercise.${l.exerciseId}` as StringKey), from: fmtIn(l.fromKg, unit), to: fmtIn(l.toKg, unit) })} ({tp(`pb.loadWhy.${l.reason}` as PlaybookKey)})
                </li>
              ))}
            </ul>
            <p className="small muted">{tp('pb.loadsNote')}</p>
          </section>
        )}

        {rec && rec.suggestCut && profile?.bodyFatPct != null && (
          <p className="small warn-text" role="note">
            {tp('pb.cut', { bf: profile.bodyFatPct, cutAt: cutLine(profile.sex) })}
          </p>
        )}

        {rec && canUndoPlaybook(rec, Date.now()) && <p className="small muted">{tp('pb.undoNote')}</p>}
      </div>
    </Sheet>
  );
}
