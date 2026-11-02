import { t } from '../i18n';
import { addDays, isValidYmd, todayYmd } from '../lib/date';
import { dayHeading } from '../lib/format';
import { useUI } from '../ui';
import { Icon } from './Icon';

/** Shared date header for Today and Meals: ‹ title/subtitle › with a native date picker overlay (UX-1). */
export function DateNav() {
  const { date, setDate } = useUI();
  const { title, subtitle } = dayHeading(date, todayYmd());
  return (
    <header className="date-nav">
      <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label={t('today.prevDay')}>
        <Icon name="chevronLeft" />
      </button>
      <div className="date-nav-title">
        <h1>{title}</h1>
        <span className="subtle">{subtitle}</span>
        <input
          className="date-input-overlay"
          type="date"
          value={date}
          aria-label={t('today.pickDate')}
          onChange={(e) => isValidYmd(e.target.value) && setDate(e.target.value)}
        />
      </div>
      <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label={t('today.nextDay')}>
        <Icon name="chevronRight" />
      </button>
    </header>
  );
}
