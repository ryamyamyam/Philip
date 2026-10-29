import type { Tab } from '../hooks/useRoute';
import { t } from '../i18n';
import { Icon, type IconName } from './Icon';

const LEFT: { tab: Tab; icon: IconName }[] = [
  { tab: 'today', icon: 'today' },
  { tab: 'history', icon: 'history' },
];
const RIGHT: { tab: Tab; icon: IconName }[] = [
  { tab: 'targets', icon: 'targets' },
  { tab: 'settings', icon: 'settings' },
];

export function TabBar({ tab, onTab, onAdd }: { tab: Tab; onTab: (t: Tab) => void; onAdd: () => void }) {
  const item = ({ tab: id, icon }: { tab: Tab; icon: IconName }) => (
    <button
      key={id}
      type="button"
      className="tab"
      aria-current={tab === id ? 'page' : undefined}
      onClick={() => onTab(id)}
    >
      <Icon name={icon} />
      <span>{t(`nav.${id}`)}</span>
    </button>
  );
  return (
    <nav className="tabbar" aria-label={t('nav.main')}>
      <div className="tabbar-inner">
        {LEFT.map(item)}
        <button type="button" className="fab" onClick={onAdd} aria-label={t('nav.addFood')}>
          <Icon name="plus" />
        </button>
        {RIGHT.map(item)}
      </div>
    </nav>
  );
}
