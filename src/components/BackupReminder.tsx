import { useEffect, useId, useRef, useState } from 'react';
import { db } from '../db/db';
import { getMeta, META, setMeta } from '../db/repo';
import { t } from '../i18n';
import { backupFileName } from '../lib/backup';
import { useUI } from '../ui';
import { Icon } from './Icon';

const REMIND_AFTER_MS = 7 * 86_400_000;
const SNOOZE_MS = 3 * 86_400_000;
const MIN_ENTRIES = 5;

/** Pure rule: is a backup reminder due? Exported for tests. */
export function backupReminderDue(
  s: { last: number | null; snoozed: number | null; count: number },
  now: number,
): boolean {
  if (s.count < MIN_ENTRIES) return false;
  if (s.snoozed && now - s.snoozed < SNOOZE_MS) return false;
  if (s.last && now - s.last < REMIND_AFTER_MS) return false;
  return true;
}

// Dismissed for this app session (e.g. backdrop tap / Escape) — survives tab switches, not reloads.
let dismissedThisSession = false;

/**
 * One-time pop-up (not a fixed banner) when there is data worth protecting and no recent backup.
 * Explains why a backup matters and where the file goes. "Later" snoozes for 3 days.
 */
export function BackupReminder() {
  const { navigate } = useUI();
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Checked once when Today opens (not live), so it never interrupts right after logging food.
  const [state, setState] = useState<{ last: number | null; snoozed: number | null; count: number } | null>(null);
  useEffect(() => {
    if (dismissedThisSession) return;
    let alive = true;
    void Promise.all([
      getMeta<number>(META.lastBackupAt),
      getMeta<number>(META.backupReminderSnoozedAt),
      db.foodEntries.count(),
    ]).then(
      ([last, snoozed, count]) => alive && setState({ last: last ?? null, snoozed: snoozed ?? null, count }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  const open = !dismissed && state !== null && backupReminderDue(state, Date.now());

  const close = () => {
    dismissedThisSession = true;
    setDismissed(true);
  };
  const later = () => {
    close();
    void setMeta(META.backupReminderSnoozedAt, Date.now());
  };

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && later();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="dialog" onMouseDown={(e) => e.target === e.currentTarget && later()}>
      <div className="dialog-box backup-popup" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="backup-popup-icon" aria-hidden="true">
          <Icon name="download" />
        </div>
        <h2 id={titleId}>{t('backup.reminderTitle')}</h2>
        <div className="stack-sm small">
          <p className="muted">{state?.last ? t('backup.reminder') : t('backup.reminderNever')}</p>
          <p>{t('backup.reminderWhy')}</p>
          <p>{t('backup.reminderWhere', { file: backupFileName() })}</p>
          <p className="muted">{t('backup.reminderRestore')}</p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={later}>
            {t('backup.reminderLater')}
          </button>
          <button
            ref={primaryRef}
            type="button"
            className="btn btn-primary"
            onClick={() => {
              close();
              navigate('settings');
              window.setTimeout(() => document.getElementById('settings-data')?.scrollIntoView({ block: 'start' }), 50);
            }}
          >
            {t('backup.reminderAction')}
          </button>
        </div>
      </div>
    </div>
  );
}
