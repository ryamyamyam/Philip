import { t } from '../i18n';
import { addDays, isValidYmd, todayYmd, weekdayOf } from '../lib/date';
import { dayHeading } from '../lib/format';
import { useUI } from '../ui';
import { CornerButton } from './CornerButton';
import { DotIndicator } from './DotIndicator';
import { StatusStrip } from './StatusStrip';

/**
 * Shared date header for Today and Meals: ‹ title/subtitle › with a native date picker overlay (UX-1).
 * D-022: rendered as the top status strip with half-circle corner buttons and week dots (Mon → Sun,
 * decorative — the heading says which day it is).
 */
export function DateNav() {
  const { date, setDate } = useUI();
  const { title, subtitle } = dayHeading(date, todayYmd());
  const monFirst = (weekdayOf(date) + 6) % 7;
  return (
    <StatusStrip
      className="date-nav"
      left={<CornerButton side="left" icon="chevronLeft" label={t('today.prevDay')} onClick={() => setDate(addDays(date, -1))} />}
      center={
        <div className="date-nav-title">
          <h1 className="pm-display">{title}</h1>
          <span className="subtle">{subtitle}</span>
          <input
            className="date-input-overlay"
            type="date"
            value={date}
            aria-label={t('today.pickDate')}
            onChange={(e) => isValidYmd(e.target.value) && setDate(e.target.value)}
          />
        </div>
      }
      right={<CornerButton side="right" icon="chevronRight" label={t('today.nextDay')} onClick={() => setDate(addDays(date, 1))} />}
      below={<DotIndicator count={7} active={monFirst} />}
    />
  );
}
