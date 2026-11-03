import type { Macros } from '../db/types';
import { t, type StringKey } from '../i18n';
import { fmtG, fmtKcal } from '../lib/format';
import { MACRO_CATEGORY, type CategoryKey } from '../lib/category';
import type { MeterMode } from '../lib/meter';
import { dayGoalHit, remainingAll, type MacroKey, type Phase, type Remaining } from '../lib/remaining';
import { CategoryChip } from './CategoryChip';
import { DialogBar } from './DialogBar';
import { Icon } from './Icon';
import { Meter } from './Meter';

const KCAL_KEY: Record<Remaining['status'], StringKey> = {
  left: 'today.kcal.left',
  over: 'today.kcal.over',
  toGo: 'today.kcal.toGo',
  reached: 'today.kcal.reached',
};
/** Big number on the panel: the CALORIES label already names the unit (owner feedback, Nov 3). */
const KCAL_SHORT: Record<Remaining['status'], StringKey> = {
  left: 'today.kcalShort.left',
  over: 'today.kcalShort.over',
  toGo: 'today.kcalShort.toGo',
  reached: 'today.kcalShort.reached',
};
const KCAL_HINT: Record<Remaining['status'], StringKey> = {
  left: 'today.kcalHint.left',
  over: 'today.kcalHint.over',
  toGo: 'today.kcalHint.toGo',
  reached: 'today.kcalHint.reached',
};
const G_KEY: Record<Remaining['status'], StringKey> = {
  left: 'today.g.left',
  over: 'today.g.over',
  toGo: 'today.g.toGo',
  reached: 'today.g.reached',
};
const MACROS: { key: Exclude<MacroKey, 'calories'>; label: StringKey; cat: CategoryKey; emoji: string }[] = [
  { key: 'proteinG', label: 'macro.protein', cat: MACRO_CATEGORY.protein, emoji: '🥩' },
  { key: 'fatG', label: 'macro.fat', cat: MACRO_CATEGORY.fat, emoji: '🥑' },
  { key: 'carbsG', label: 'macro.carbs', cat: MACRO_CATEGORY.carbs, emoji: '🍚' },
];

/** Ceilings (left / over) drain like a health bar; minimums (to go / reached) fill up (D-022). */
const modeFor = (r: Remaining): MeterMode => (r.status === 'left' || r.status === 'over' ? 'drain' : 'fill');

/**
 * Today's one card (Story 3): calories eaten and left, then P/F/C eaten / target / left, each with a bar.
 * Color follows the phase rules in lib/remaining.ts and is never the only signal — every value
 * carries the words left / over / to go.
 */
export function TodayCard({
  consumed,
  target,
  phase,
  adherence,
  onSetTargets,
  onAsk,
}: {
  consumed: Macros;
  target: Macros | null;
  phase: Phase;
  adherence: string | null;
  onSetTargets: () => void;
  /** "What do I eat?" lives in Philip's dialog bar when given (owner feedback, Nov 3). */
  onAsk?: () => void;
}) {
  if (!target) {
    return (
      <section className="card today-card today-card-empty stack-sm" aria-label={t('today.cardLabel')}>
        <p className="today-cta-title">{t('today.noTarget')}</p>
        <p className="subtle">{t('today.noTargetHint', { kcal: fmtKcal(consumed.calories) })}</p>
        <button type="button" className="btn btn-secondary btn-block" onClick={onSetTargets}>
          <Icon name="progress" /> {t('today.setTargets')}
        </button>
      </section>
    );
  }
  const r = remainingAll(phase, consumed, target);
  const hit = dayGoalHit(phase, consumed, target);
  const kcalText = t(KCAL_KEY[r.calories.status], { kcal: fmtKcal(r.calories.amount) });
  const eatenText = t('today.eatenOf', { consumed: fmtKcal(consumed.calories), target: fmtKcal(target.calories) });
  return (
    <section className="card today-card pm-hero" aria-label={t('today.cardLabel')}>
      <div className="today-hero">
        <div className="today-hero-head">
          <span className="pm-pill">{t('macro.calories')}</span>
          {adherence && <span className="pm-pill pm-pill-quiet adherence-pill num">{adherence}</span>}
        </div>
        <p className={`today-big pm-display tone-${r.calories.tone}`} aria-live="polite">
          <span className="num">{t(KCAL_SHORT[r.calories.status], { kcal: fmtKcal(r.calories.amount) })}</span>
        </p>
        <div className="today-hero-meter">
          <Meter
            size="hero"
            label={t('macro.calories')}
            value={consumed.calories}
            max={target.calories}
            mode={modeFor(r.calories)}
            tone={r.calories.tone}
            valueText={kcalText}
          />
          <p className="today-sub num">
            <span aria-hidden="true">{t('today.kcalOfShort', { consumed: fmtKcal(consumed.calories), target: fmtKcal(target.calories) })}</span>
            <span className="visually-hidden">{eatenText}</span>
          </p>
        </div>
      </div>
      <ul className="today-macros" aria-label={t('today.macrosLabel')}>
        {MACROS.map((m) => {
          const rem = r[m.key];
          const text = t(G_KEY[rem.status], { g: fmtKcal(rem.amount) });
          return (
            <li key={m.key} className={`today-macro tone-${rem.tone}`}>
              <span className="today-macro-name">
                <CategoryChip category={m.cat} icon={m.emoji} label={t(m.label)} />
              </span>
              <span className="today-macro-value pm-display num">{text}</span>
              <Meter
                label={t(m.label)}
                value={consumed[m.key]}
                max={target[m.key]}
                mode={modeFor(rem)}
                tone={rem.tone}
                valueText={text}
              />
              <span className="today-macro-eaten subtle num">
                {t('today.gOf', { consumed: fmtG(consumed[m.key]), target: fmtG(target[m.key]) })}
              </span>
            </li>
          );
        })}
      </ul>
      <DialogBar
        speaker={t('coach.speaker')}
        className="today-hint"
        action={onAsk && { label: t('suggest.open'), onClick: onAsk }}
      >
        {hit ? t('today.goalHit') : t(KCAL_HINT[r.calories.status])}
      </DialogBar>
    </section>
  );
}
