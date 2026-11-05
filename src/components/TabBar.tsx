import { TAB_FOR, TABS, type Tab } from '../hooks/useRoute';
import { t } from '../i18n';
import { ControlDeck } from './ControlDeck';
import { Icon, type IconName } from './Icon';

const ICONS: Partial<Record<Tab, IconName>> = { home: 'home', progress: 'progress', settings: 'settings' };

/** Three tabs: Home · Progress · Settings (Story 5), on the control deck (D-022). Meal log and Workout open from Home. */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <ControlDeck label={t('nav.main')}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            className="tab"
            data-tour={`tab-${id}`}
            aria-current={TAB_FOR[tab] === id ? 'page' : undefined}
            onClick={() => onTab(id)}
          >
            <Icon name={ICONS[id] ?? 'home'} />
            <span>{t(id === 'home' ? 'nav.home' : id === 'progress' ? 'nav.progress' : 'nav.settings')}</span>
          </button>
        ))}
    </ControlDeck>
  );
}
