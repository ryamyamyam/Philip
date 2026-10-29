import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getMeta, META, setMeta } from '../db/repo';
import { t } from '../i18n';
import { useUI } from '../ui';
import { Icon } from './Icon';

const REMIND_AFTER_MS = 7 * 86_400_000;
const SNOOZE_MS = 3 * 86_400_000;
const MIN_ENTRIES = 5;

/** Gentle reminder when there is data worth protecting and no recent backup. */
export function BackupReminder() {
  const { navigate } = useUI();
  const state = useLiveQuery(async () => {
    const [last, snoozed, count] = await Promise.all([
      getMeta<number>(META.lastBackupAt),
      getMeta<number>(META.backupReminderSnoozedAt),
      db.foodEntries.count(),
    ]);
    return { last: last ?? null, snoozed: snoozed ?? null, count };
  }, []);
  if (!state || state.count < MIN_ENTRIES) return null;
  const now = Date.now();
  if (state.snoozed && now - state.snoozed < SNOOZE_MS) return null;
  if (state.last && now - state.last < REMIND_AFTER_MS) return null;
  return (
    <div className="banner banner-warning" role="status">
      <Icon name="download" />
      <div className="stack-sm" style={{ flex: 1 }}>
        <span>{state.last ? t('backup.reminder') : t('backup.reminderNever')}</span>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" onClick={() => navigate('settings')}>
            {t('backup.reminderAction')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMeta(META.backupReminderSnoozedAt, Date.now())}>
            {t('backup.reminderLater')}
          </button>
        </div>
      </div>
    </div>
  );
}
