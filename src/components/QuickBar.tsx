import { updateProfile } from '../db/repo';
import { useProfile } from '../hooks/useData';
import { t } from '../i18n';
import { openQaFeedback } from '../modules/qa-feedback';
import { Icon } from './Icon';

/**
 * OBS-C856D1: always at the top left, small. The kg ⇄ lb switch (the same setting as Settings › Units ›
 * Weight) and a bug icon that opens QA & Feedback straight on Capture.
 */
export function QuickBar() {
  const profile = useProfile();
  const unit = profile?.unitPrefs.weight;
  const next = unit === 'kg' ? 'lb' : 'kg';
  return (
    <div className="pm-quickbar">
      {profile && unit && (
        <button
          type="button"
          className="pm-quick-btn pm-quick-unit"
          aria-label={t('quick.unit', { unit, next })}
          data-testid="quick-unit"
          onClick={() => void updateProfile({ unitPrefs: { ...profile.unitPrefs, weight: next } })}
        >
          <span className={unit === 'kg' ? 'is-on' : undefined}>kg</span>
          <span className={unit === 'lb' ? 'is-on' : undefined}>lb</span>
        </button>
      )}
      <button type="button" className="pm-quick-btn" aria-label={t('quick.feedback')} onClick={() => openQaFeedback('capture')}>
        <Icon name="bug" />
      </button>
    </div>
  );
}
