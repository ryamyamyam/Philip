import type { Macros } from '../db/types';
import { t, type StringKey } from '../i18n';
import { fmtG } from '../lib/format';
import { progress } from '../lib/nutrition';

const MACROS: { key: 'proteinG' | 'fatG' | 'carbsG'; label: StringKey; color: string }[] = [
  { key: 'proteinG', label: 'macro.protein', color: 'var(--color-protein)' },
  { key: 'fatG', label: 'macro.fat', color: 'var(--color-fat)' },
  { key: 'carbsG', label: 'macro.carbs', color: 'var(--color-carbs)' },
];

export function MacroBars({ consumed, target }: { consumed: Macros; target: Macros | null }) {
  return (
    <ul className="macro-bars">
      {MACROS.map((m) => {
        const c = consumed[m.key];
        const tg = target?.[m.key] ?? null;
        const p = tg ? progress(c, tg) : 0;
        return (
          <li key={m.key} className="macro-bar">
            <div className="macro-bar-top">
              <span className="macro-bar-label">{t(m.label)}</span>
              <span className="macro-bar-value num">
                <strong>{fmtG(c)}</strong>
                {tg != null ? ` / ${fmtG(tg)} ${t('common.g')}` : ` ${t('common.g')}`}
              </span>
            </div>
            <div
              className="macro-track"
              role="progressbar"
              aria-label={t(m.label)}
              aria-valuemin={0}
              aria-valuemax={tg ?? 0}
              aria-valuenow={Math.round(c)}
              aria-valuetext={tg != null ? t('macro.valueOf', { value: fmtG(c), target: fmtG(tg) }) : t('macro.value', { value: fmtG(c) })}
            >
              <div className="macro-fill" style={{ width: `${p * 100}%`, background: m.color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
