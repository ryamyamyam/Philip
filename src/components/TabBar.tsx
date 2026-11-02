import { TABS, type Tab } from '../hooks/useRoute';
import { t } from '../i18n';
import { Icon, type IconName } from './Icon';

const ICONS: Record<Tab, IconName> = { today: 'today', meals: 'meals', progress: 'progress', settings: 'settings' };

/** Four tabs: Today · Meals · Progress · Settings. Logging lives on the Meals cards (UX-5/UX-6). */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label={t('nav.main')}>
      <div className="tabbar-inner">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            className="tab"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => onTab(id)}
          >
            <Icon name={ICONS[id]} />
            <span>{t(`nav.${id}`)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
