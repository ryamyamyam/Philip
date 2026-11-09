import { useState } from 'react';
import type { CardioLog } from '../../db/types';
import { t } from '../../i18n';
import { parseDecimal } from '../../lib/numbers';
import { canFinishCardio, clampField } from '../../lib/training/cardio';

/**
 * The cardio finisher after the lifts (Story 7, OBS-93A8C0): an incline walk, outside the 45-minute
 * budget. Minutes are needed to tick it done; incline and speed are optional.
 */
export function CardioCard({ cardio, cut, onChange }: { cardio: CardioLog; cut: boolean; onChange: (next: CardioLog) => void }) {
  const [min, setMin] = useState(cardio.minutes === null ? '' : String(cardio.minutes));
  const [incline, setIncline] = useState(cardio.inclinePct === null ? '' : String(cardio.inclinePct));
  const [speed, setSpeed] = useState(cardio.speed === null ? '' : String(cardio.speed));
  const parse = (v: string) => parseDecimal(v);
  const edit = (m: string, i: string, s: string) => {
    setMin(m);
    setIncline(i);
    setSpeed(s);
    const mm = clampField('minutes', parse(m));
    onChange({
      ...cardio,
      minutes: mm === null ? null : Math.round(mm),
      inclinePct: clampField('inclinePct', parse(i)),
      speed: clampField('speed', parse(s)),
      done: false,
    });
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
              <span className="field-label">{t('cardio.speed', { unit: cardio.speedUnit === 'mph' ? 'mph' : 'km/h' })}</span>
              <input className="input num" inputMode="decimal" value={speed} onChange={(e) => edit(min, incline, e.target.value)} />
            </label>
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
  return c.inclinePct !== null ? t('cardio.loggedIncline', { n: c.minutes, incline: c.inclinePct }) : t('cardio.logged', { n: c.minutes });
}
