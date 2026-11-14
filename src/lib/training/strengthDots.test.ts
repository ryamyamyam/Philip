/** OBS-1F8106: Strength charts — red dots for entered PRs, blue dots for each week's best estimated 1RM. */
import { describe, expect, it } from 'vitest';
import type { TmRecord } from '../../db/types';
import { toYmd } from '../date';
import { datePosition, enteredPrPoints, weeklyE1rm, type E1rmPoint } from './progress';

const at = (ymd: string) => new Date(`${ymd}T12:00:00`).getTime();

describe('enteredPrPoints', () => {
  it('turns setup and re-test TMs back into the 1RM he entered, dated when he entered it', () => {
    const records: TmRecord[] = [
      { id: 1, lift: 'bench', tmKg: 90, effectiveCycle: 1, reason: 'setup', createdAt: at('2026-11-02') },
      { id: 2, lift: 'bench', tmKg: 92.5, effectiveCycle: 2, reason: 'cycle', createdAt: at('2026-11-30') },
      { id: 3, lift: 'bench', tmKg: 85.5, effectiveCycle: 1, reason: 'adjust', createdAt: at('2026-11-05') },
      { id: 4, lift: 'bench', tmKg: 94.5, effectiveCycle: 2, reason: 'retest', createdAt: at('2026-12-07') },
    ];
    expect(enteredPrPoints(records)).toEqual([
      { date: '2026-11-02', lift: 'bench', oneRmKg: 100 },
      { date: '2026-12-07', lift: 'bench', oneRmKg: 105 },
    ]);
    expect(toYmd(new Date(at('2026-11-02')))).toBe('2026-11-02');
  });
});

describe('weeklyE1rm', () => {
  it('keeps the best estimate per lift per Monday–Sunday week, dated at the session that set it', () => {
    const pts: E1rmPoint[] = [
      { date: '2026-11-02', lift: 'squat', e1rmKg: 140 }, // Mon
      { date: '2026-11-06', lift: 'squat', e1rmKg: 145 }, // Fri, same week: wins
      { date: '2026-11-08', lift: 'squat', e1rmKg: 139 }, // Sun, same week
      { date: '2026-11-09', lift: 'squat', e1rmKg: 143 }, // next Monday
      { date: '2026-11-06', lift: 'bench', e1rmKg: 101 },
    ];
    expect(weeklyE1rm(pts)).toEqual([
      { date: '2026-11-06', lift: 'squat', e1rmKg: 145, week: '2026-11-02' },
      { date: '2026-11-06', lift: 'bench', e1rmKg: 101, week: '2026-11-02' },
      { date: '2026-11-09', lift: 'squat', e1rmKg: 143, week: '2026-11-09' },
    ]);
  });
});

describe('datePosition', () => {
  it('places dates by time, not by index; one date sits in the middle', () => {
    expect(datePosition('2026-11-01', '2026-11-01', '2026-11-11')).toBe(0);
    expect(datePosition('2026-11-03', '2026-11-01', '2026-11-11')).toBeCloseTo(0.2);
    expect(datePosition('2026-11-11', '2026-11-01', '2026-11-11')).toBe(1);
    expect(datePosition('2026-11-01', '2026-11-01', '2026-11-01')).toBe(0.5);
  });
});
