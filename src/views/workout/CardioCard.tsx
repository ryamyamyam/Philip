import { useState } from 'react';
import type { CardioLog, Treadmill } from '../../db/types';
import { t } from '../../i18n';
import { t17 } from '../../i18n/s17';
import { parseDecimal } from '../../lib/numbers';
import { CARDIO_LIMITS, canFinishCardio, clampField } from '../../lib/training/cardio';
import { inclineToPct, parseTreadmillRead, settingToMph, TREADMILL_LIMITS, treadmillReadPrompt, type TreadmillRead } from '../../lib/training/treadmill';
import { useProfile } from '../../hooks/useData';
import { useCloudPaired } from '../../hooks/useCoach';

/**
 * The cardio finisher after the lifts (Story 7, OBS-93A8C0): an incline walk, outside the lifting-minute
 * budget. Minutes are needed to tick it done; incline and speed are optional.
 */
export function CardioCard({
  cardio,
  cut,
  treadmill,
  budgetMin,
  onChange,
  onTreadmill,
}: {
  cardio: CardioLog;
  cut: boolean;
  treadmill?: Treadmill;
  budgetMin: number;
  onChange: (next: CardioLog) => void;
  /** Story 17 (OBS-A4F4B9): remember the machine Philip read (the default next time). */
  onTreadmill?: (m: Treadmill) => Promise<void> | void;
}) {
  // Story 10 (OBS-E19B38): the speed is the machine's own number; Philip projects mph next to it.
  // Story 17 (OBS-A4F4B9): the incline too, when the machine's incline isn't already a %.
  const machine: Treadmill = treadmill ?? { name: '', scale: cardio.speedUnit, source: 'me' };
  const inclineLevel = machine.incline?.scale === 'level';
  const profile = useProfile();
  const cloud = useCloudPaired();
  const canAsk = !!profile?.geminiKey || cloud;
  const [min, setMin] = useState(cardio.minutes === null ? '' : String(cardio.minutes));
  const [incline, setIncline] = useState(cardio.inclineSetting !== undefined ? String(cardio.inclineSetting) : cardio.inclinePct === null ? '' : String(cardio.inclinePct));
  const [name, setName] = useState(machine.name);
  const [asking, setAsking] = useState(false);
  const [read, setRead] = useState<TreadmillRead | null>(null);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [speed, setSpeed] = useState(cardio.speed === null ? '' : String(cardio.speed));
  const parse = (v: string) => parseDecimal(v);
  const edit = (m: string, i: string, s: string, mach: Treadmill = machine) => {
    setMin(m);
    setIncline(i);
    setSpeed(s);
    const mm = clampField('minutes', parse(m));
    const sp = clampField('speed', parse(s));
    const mph = settingToMph(sp, mach);
    const level = mach.incline?.scale === 'level';
    const raw = parse(i);
    const next: CardioLog = {
      ...cardio,
      minutes: mm === null ? null : Math.round(mm),
      inclinePct: clampField('inclinePct', level ? inclineToPct(raw, mach) : raw),
      speed: sp,
      speedUnit: mach.scale,
      done: false,
    };
    if (mph !== null) next.speedMph = mph;
    else delete next.speedMph;
    if (level && raw !== null) next.inclineSetting = raw;
    else delete next.inclineSetting;
    onChange(next);
  };
  const inRange = (r: TreadmillRead): string | null => {
    if (r.inclinePct !== null && (r.inclinePct < CARDIO_LIMITS.inclinePct[0] || r.inclinePct > CARDIO_LIMITS.inclinePct[1])) return t17('tread.out', { what: `${r.inclinePct}%`, min: `${CARDIO_LIMITS.inclinePct[0]}%`, max: `${CARDIO_LIMITS.inclinePct[1]}%` });
    if (r.mph !== null && (r.mph < CARDIO_LIMITS.speed[0] || r.mph > CARDIO_LIMITS.speed[1])) return t17('tread.out', { what: `${r.mph} mph`, min: CARDIO_LIMITS.speed[0], max: `${CARDIO_LIMITS.speed[1]} mph` });
    return null;
  };
  const applyRead = async (r: TreadmillRead) => {
    await onTreadmill?.(r.treadmill);
    edit(min, incline, speed, r.treadmill);
    setRead(null);
  };
  // Story 17 (OBS-A4F4B9): "woodway / 14 / 2.5" → Philip reads the machine's dials; the app does the math.
  const ask = async () => {
    if (!canAsk || !name.trim()) return;
    setAsking(true);
    setRead(null);
    setReadNote(null);
    try {
      const { coachJson } = await import('../../services/coachAi');
      const iv = parse(incline);
      const sv = parse(speed);
      const { raw } = await coachJson(treadmillReadPrompt(name, iv, sv), { apiKey: profile?.geminiKey ?? null, model: profile?.geminiModel ?? null });
      const r = parseTreadmillRead(raw, name, iv, sv);
      if (!r) return setReadNote(t17('tread.failed'));
      const bad = inRange(r);
      if (bad) return setReadNote(bad);
      const line = [t17('tread.result', { machine: r.treadmill.name, incline: r.inclinePct ?? '–', mph: r.mph ?? '–' }), r.inclineWasPct && iv !== null ? t17('tread.resultNote') : '', r.note].filter(Boolean).join(' ');
      setReadNote(line);
      if (r.confidence === 'low') setRead(r);
      else await applyRead(r);
    } catch {
      setReadNote(t17('tread.failed'));
    } finally {
      setAsking(false);
    }
  };
  return (
    <section className={`card ex-card${cardio.skipped ? ' is-skipped' : ''}`} aria-labelledby="cardio-h">
      <header className="ex-head">
        <span className="pm-pill ex-slot">{t('cardio.slot')}</span>
        <h2 id="cardio-h" className="ex-name">
          {t('cardio.title')}
        </h2>
      </header>
      <div className="ex-orders" aria-label={t('session.orders')}>
        <p className="ex-label">{t('session.orders')}</p>
        <p className="ex-summary num">{t('cardio.order', { n: cardio.planMin, min: budgetMin })}</p>
        <p className="small muted ex-why">{t(cut ? 'cardio.whyCut' : 'cardio.why')}</p>
      </div>
      {cardio.skipped ? (
        <p className="small muted">{t('cardio.skipped')}</p>
      ) : (
        <div className={`set-row${cardio.done ? ' is-done' : ''}`}>
          <div className="cardio-fields">
            <label className="field cardio-machine">
              <span className="field-label">{t17('tread.machine')}</span>
              <input className="input" value={name} maxLength={TREADMILL_LIMITS.nameChars} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t('cardio.minutes')}</span>
              <input className="input num" inputMode="numeric" value={min} placeholder={String(cardio.planMin)} onChange={(e) => edit(e.target.value, incline, speed)} />
            </label>
            <label className="field">
              <span className="field-label">{inclineLevel ? t17('tread.inclineShown') : t('cardio.incline')}</span>
              <input className="input num" inputMode="decimal" value={incline} onChange={(e) => edit(min, e.target.value, speed)} />
            </label>
            <label className="field">
              <span className="field-label">
                {machine.scale === 'level' ? t('cardio.speedLevel') : t('cardio.speed', { unit: machine.scale === 'mph' ? 'mph' : 'km/h' })}
              </span>
              <input className="input num" inputMode="decimal" value={speed} onChange={(e) => edit(min, incline, e.target.value)} />
            </label>
            {inclineLevel && cardio.inclinePct !== null && (
              <p className="small muted num cardio-mph" aria-live="polite">
                {t17('tread.inclinePct', { pct: cardio.inclinePct })}
              </p>
            )}
            {canAsk ? (
              <button type="button" className="btn btn-sm btn-secondary cardio-read" disabled={!name.trim() || asking} onClick={() => void ask()}>
                {asking ? t17('tread.reading') : t17('tread.read')}
              </button>
            ) : (
              <p className="small muted">{t17('tread.noAi')}</p>
            )}
            {readNote && (
              <p className="small" role="status">
                {readNote}
              </p>
            )}
            {read && (
              <div className="stack-xs">
                <p className="small">{t17('tread.low')}</p>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void applyRead(read)}>
                  {t17('tread.use')}
                </button>
              </div>
            )}
            {machine.scale !== 'mph' && (
              <p className="small muted num cardio-mph" aria-live="polite">
                {(() => {
                  const mph = settingToMph(parse(speed), machine);
                  if (mph !== null) return t(machine.scale === 'level' || machine.source === 'philip' ? 'cardio.mphEstimate' : 'cardio.mph', { mph });
                  return machine.scale === 'level' && machine.maxLevel === undefined ? t('cardio.mphNeedsMachine') : null;
                })()}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-sm set-check"
            aria-pressed={cardio.done}
            disabled={!cardio.done && !canFinishCardio(cardio)}
            onClick={() => onChange({ ...cardio, done: !cardio.done })}
          >
            {cardio.done ? t('cardio.undo') : t('cardio.done')}
          </button>
        </div>
      )}
      <div className="ex-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange({ ...cardio, skipped: !cardio.skipped, done: false })}>
          {t(cardio.skipped ? 'cardio.unskip' : 'cardio.skip')}
        </button>
      </div>
    </section>
  );
}

/** "15 min at 12%" / "Skipped" / "Not logged" for summaries and the calendar log. */
export function cardioValue(c: CardioLog): string {
  if (c.skipped) return t('cardio.skipped');
  if (!c.done || c.minutes === null) return t('cardio.notLogged');
  const base = c.inclinePct !== null ? t('cardio.loggedIncline', { n: c.minutes, incline: c.inclinePct }) : t('cardio.logged', { n: c.minutes });
  return c.speedMph !== undefined ? `${base} · ${t('cardio.mphShort', { mph: c.speedMph })}` : base;
}
