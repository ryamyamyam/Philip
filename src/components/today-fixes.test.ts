import { describe, expect, it } from 'vitest';
import { backupReminderDue } from './BackupReminder';
import { SWIPE_ACTIONS_W, clampSwipe, settleSwipe } from './SwipeRow';
import { fmtRelativeDay } from '../lib/format';

const DAY = 86_400_000;

describe('backup reminder rule (OBS-3AD584)', () => {
  const now = 100 * DAY;
  it('waits for enough data', () => {
    expect(backupReminderDue({ last: null, snoozed: null, count: 4 }, now)).toBe(false);
    expect(backupReminderDue({ last: null, snoozed: null, count: 5 }, now)).toBe(true);
  });
  it('respects a recent backup and a 3-day snooze', () => {
    expect(backupReminderDue({ last: now - 6 * DAY, snoozed: null, count: 9 }, now)).toBe(false);
    expect(backupReminderDue({ last: now - 8 * DAY, snoozed: null, count: 9 }, now)).toBe(true);
    expect(backupReminderDue({ last: null, snoozed: now - 2 * DAY, count: 9 }, now)).toBe(false);
    expect(backupReminderDue({ last: null, snoozed: now - 4 * DAY, count: 9 }, now)).toBe(true);
  });
});

describe('swipe row (OBS-3E7A73)', () => {
  it('snaps open only past 40% of the action width', () => {
    expect(settleSwipe(-SWIPE_ACTIONS_W * 0.3)).toBe('closed');
    expect(settleSwipe(-SWIPE_ACTIONS_W * 0.5)).toBe('open');
    expect(settleSwipe(0)).toBe('closed');
  });
  it('never drags right and limits overshoot', () => {
    expect(clampSwipe(40)).toBe(0);
    expect(clampSwipe(-60)).toBe(-60);
    expect(clampSwipe(-1000)).toBe(-(SWIPE_ACTIONS_W + 24));
  });
});

describe('relative day heading (OBS-763014)', () => {
  it('names tomorrow and yesterday, and only today as Today', () => {
    expect(fmtRelativeDay('2026-10-30', '2026-10-29')).toBe('Tomorrow');
    expect(fmtRelativeDay('2026-10-28', '2026-10-29')).toBe('Yesterday');
    expect(fmtRelativeDay('2026-10-29', '2026-10-29')).toBe('Today');
    expect(fmtRelativeDay('2026-10-31', '2026-10-29')).toBeNull();
  });
});
