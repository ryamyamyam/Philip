import type { Macros } from '../db/types';
import { t, type StringKey } from '../i18n';
import { fmtKcal } from '../lib/format';
import { remainingAll, type MacroKey, type Phase, type Remaining } from '../lib/remaining';
import { Icon } from './Icon';

const KCAL_KEY: Record<Remaining['status'], StringKey> = {
  left: 'today.kcal.left',
  over: 'today.kcal.over',
  toGo: 'today.kcal.toGo',
  reached: 'today.kcal.reached',
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
const MACROS: { key: Exclude<MacroKey, 'calories'>; label: StringKey; cls: string }[] = [
  { key: 'proteinG', label: 'macro.protein', cls: 'p' },
  { key: 'fatG', label: 'macro.fat', cls: 'f' },
  { key: 'carbsG', label: 'macro.carbs', cls: 'c' },
];

/**
 * The one question Today answers: how much is left? (UX-3 / OBS-F047E3)
 * Color follows the phase rules in lib/remaining.ts and is never the only signal — every value
 * carries the words left / over / to go.
 */
export function TodayCard({
  consumed,
  target,
  phase,
  adherence,
  onSetTargets,
}: {
  consumed: Macros;
  target: Macros | null;
  phase: Phase;
  adherence: string | null;
  onSetTargets: () => void;
}) {
  if (!target) {
    return (
      <section className="card today-card today-card-empty stack-sm" aria-label={t('today.cardLabel')}>
        <p className="today-cta-title">{t('today.noTarget')}</p>
        <p className="subtle">{t('today.noTargetHint', { kcal: fmtKcal(consumed.calories) })}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onSetTargets}>
          <Icon name="progress" /> {t('today.setTargets')}
        </button>
      </section>
    );
  }
  const r = remainingAll(phase, consumed, target);
  return (
    <section className="card today-card" aria-label={t('today.cardLabel')}>
      <p className={`today-big tone-${r.calories.tone}`} aria-live="polite">
        <span className="num">{t(KCAL_KEY[r.calories.status], { kcal: fmtKcal(r.calories.amount) })}</span>
      </p>
      <p className="today-hint subtle">{t(KCAL_HINT[r.calories.status])}</p>
      <p className="today-sub subtle num">
        {t('today.eatenOf', { consumed: fmtKcal(consumed.calories), target: fmtKcal(target.calories) })}
      </p>
      <ul className="today-macros" aria-label={t('today.macrosLabel')}>
        {MACROS.map((m) => {
          const rem = r[m.key];
          return (
            <li key={m.key} className={`today-macro tone-${rem.tone}`}>
              <span className={`today-macro-name macro-dot-${m.cls}`}>{t(m.label)}</span>
              <span className="today-macro-value num">{t(G_KEY[rem.status], { g: fmtKcal(rem.amount) })}</span>
            </li>
          );
        })}
      </ul>
      {adherence && <span className="chip chip-brand adherence-pill num">{adherence}</span>}
    </section>
  );
}
