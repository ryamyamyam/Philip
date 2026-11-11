import { useState } from 'react';
import type { CardioLog, Treadmill } from '../../db/types';
import { t } from '../../i18n';
import { parseDecimal } from '../../lib/numbers';
import { canFinishCardio, clampField } from '../../lib/training/cardio';
import { settingToMph } from '../../lib/training/treadmill';

/**
 * The cardio finisher after the lifts (Story 7, OBS-93A8C0): an incline walk, outside the 45-minute
 * budget. Minutes are needed to tick it done; incline and speed are optional.
 */
export function CardioCard({ cardio, cut, treadmill, onChange }: { cardio: CardioLog; cut: boolean; treadmill?: Treadmill; onChange: (next: CardioLog) => void }) {
  // Story 10 (OBS-E19B38): the speed is the machine's own number; Philip projects mph next to it.
  const machine: Treadmill = treadmill ?? { name: '', scale: cardio.speedUnit, source: 'me' };
  const [min, setMin] = useState(cardio.minutes === null ? '' : String(cardio.minutes));
  const [incline, setIncline] = useState(cardio.inclinePct === null ? '' : String(cardio.inclinePct));
  const [speed, setSpeed] = useState(cardio.speed === null ? '' : String(cardio.speed));
  const parse = (v: string) => parseDecimal(v);
  const edit = (m: string, i: string, s: string) => {
    setMin(m);
    setIncline(i);
    setSpeed(s);
    const mm = clampField('minutes', parse(m));
    const sp = clampField('speed', parse(s));
    const mph = settingToMph(sp, machine);
    const next: CardioLog = {
      ...cardio,
      minutes: mm === null ? null : Math.round(mm),
      inclinePct: clampField('inclinePct', parse(i)),
      speed: sp,
      speedUnit: machine.scale,
      done: false,
    };
    if (mph !== null) next.speedMph = mph;
    else delete next.speedMph;
    onChange(next);
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
        <p className="ex-summary num">{t('cardio.order', { n: cardio.planMin })}</p>
        <p className="small muted ex-why">{t(cut ? 'cardio.whyCut' : 'cardio.why')}</p>
      </div>
      {cardio.skipped ? (
        <p className="small muted">{t('cardio.skipped')}</p>
      ) : (
        <div className={`set-row${cardio.done ? ' is-done' : ''}`}>
          <div className="cardio-fields">
            <label className="field">
              <span className="field-label">{t('cardio.minutes')}</span>
              <input className="input num" inputMode="numeric" value={min} placeholder={String(cardio.planMin)} onChange={(e) => edit(e.target.value, incline, speed)} />
            </label>
            <label className="field">
              <span className="field-label">{t('cardio.incline')}</span>
              <input className="input num" inputMode="decimal" value={incline} onChange={(e) => edit(min, e.target.value, speed)} />
            </label>
            <label className="field">
              <span className="field-label">
                {machine.scale === 'level' ? t('cardio.speedLevel') : t('cardio.speed', { unit: machine.scale === 'mph' ? 'mph' : 'km/h' })}
              </span>
              <input className="input num" inputMode="decimal" value={speed} onChange={(e) => edit(min, incline, e.target.value)} />
            </label>
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
