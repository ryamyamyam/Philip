import { describe, expect, it } from 'vitest';
import { addDays, ageOn, dateRange, daysBetween, isValidYmd, startOfWeek, toYmd, weekdayOf } from './date';

describe('date utils (local time)', () => {
  it('formats local calendar date, not UTC', () => {
    // 11:30 PM local on Oct 28 must stay Oct 28 regardless of UTC offset.
    expect(toYmd(new Date(2026, 9, 28, 23, 30))).toBe('2026-10-28');
    expect(toYmd(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
  it('adds days across month, year, leap day, and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST start
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // US DST end
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('validates YMD strings', () => {
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('2026-1-01')).toBe(false);
    expect(isValidYmd(42)).toBe(false);
  });
  it('computes weekdays, ranges, week start, day differences', () => {
    expect(weekdayOf('2026-10-28')).toBe(3); // Wednesday
    expect(startOfWeek('2026-10-28')).toBe('2026-10-26');
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to Monday-start week
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });
  it('computes age on a date', () => {
    expect(ageOn('2000-10-29', '2026-10-28')).toBe(25);
    expect(ageOn('2000-10-28', '2026-10-28')).toBe(26);
  });
});
