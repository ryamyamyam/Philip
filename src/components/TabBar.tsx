import { TAB_FOR, TABS, type Tab } from '../hooks/useRoute';
import { t } from '../i18n';
import { Icon, type IconName } from './Icon';

const ICONS: Partial<Record<Tab, IconName>> = { today: 'today', progress: 'progress', settings: 'settings' };

/** Three tabs: Today · Progress · Settings (Story 3). Logging starts on Today. */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label={t('nav.main')}>
      <div className="tabbar-inner">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            className="tab"
            aria-current={TAB_FOR[tab] === id ? 'page' : undefined}
            onClick={() => onTab(id)}
          >
            <Icon name={ICONS[id] ?? 'today'} />
            <span>{t(`nav.${id}`)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
