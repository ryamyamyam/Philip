import { Icon } from '../components/Icon';
import { useTargetPlans } from '../hooks/useData';
import { t } from '../i18n';
import { todayYmd } from '../lib/date';
import { planForDate } from '../lib/nutrition';
import { useUI } from '../ui';
import { CurrentCard, TargetsSections } from './TargetsView';

/**
 * Settings › Targets & body stats (Story 3). The calculator, manual targets, weekly plan,
 * adherence and target history moved here from Progress — configuration, not daily use.
 */
export default function TargetsPage() {
  const { navigate } = useUI();
  const plans = useTargetPlans();
  const current = plans ? planForDate(plans, todayYmd()) : null;
  return (
    <div className="view view-targets">
      <header className="view-header view-header-back">
        <button type="button" className="icon-btn" onClick={() => navigate('settings')} aria-label={t('targets.backToSettings')}>
          <Icon name="chevronLeft" />
        </button>
        <h1>{t('targets.pageTitle')}</h1>
      </header>
      <div className="stack">
        <CurrentCard plan={current} />
        <TargetsSections showCurrent={false} compact />
      </div>
    </div>
  );
}
