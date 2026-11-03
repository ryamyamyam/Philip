import { t } from '../i18n';
import type { MacroPercents } from '../lib/macroSplit';

/**
 * One stacked bar showing how the calories split across protein, fat and carbs (OBS-E49D0F).
 * Colors are the macro tokens; the legend text carries the numbers, so color is never the only cue.
 */
export function MacroSplitBar({ split }: { split: MacroPercents }) {
  const vars = { p: split.protein, f: split.fat, c: split.carbs };
  return (
    <div className="split">
      <div className="split-bar" role="img" aria-label={t('targets.split.bar', vars)}>
        {split.protein > 0 && <span className="split-seg split-protein" style={{ flexGrow: split.protein }} />}
        {split.fat > 0 && <span className="split-seg split-fat" style={{ flexGrow: split.fat }} />}
        {split.carbs > 0 && <span className="split-seg split-carbs" style={{ flexGrow: split.carbs }} />}
      </div>
      <p className="split-legend num" aria-hidden="true">
        {t('targets.split.legend', vars)}
      </p>
    </div>
  );
}
