import { describe, expect, it } from 'vitest';
import { dayHeading } from './format';
import { resolveHash } from '../hooks/useRoute';

describe('UX-1 date heading never repeats itself', () => {
  const today = '2026-11-01'; // a Sunday
  it('today and ±1 day: relative title + full date', () => {
    expect(dayHeading(today, today)).toEqual({ title: 'Today', subtitle: 'Sunday, November 1' });
    expect(dayHeading('2026-11-02', today)).toEqual({ title: 'Tomorrow', subtitle: 'Monday, November 2' });
    expect(dayHeading('2026-10-31', today)).toEqual({ title: 'Yesterday', subtitle: 'Saturday, October 31' });
  });
  it('other days: weekday title + month/day, never the weekday twice', () => {
    const h = dayHeading('2026-11-03', today);
    expect(h).toEqual({ title: 'Tuesday', subtitle: 'November 3' });
    expect(h.subtitle).not.toMatch(/Tue/);
    expect(dayHeading('2026-10-20', today)).toEqual({ title: 'Tuesday', subtitle: 'October 20' });
  });
});

describe('navigation routes', () => {
  it('maps the three tabs + Targets page and redirects the old History/Meals routes', () => {
    expect(resolveHash('#/today')).toEqual({ tab: 'today', redirected: false });
    expect(resolveHash('#/meals')).toEqual({ tab: 'today', redirected: true });
    expect(resolveHash('#/progress')).toEqual({ tab: 'progress', redirected: false });
    expect(resolveHash('#/settings')).toEqual({ tab: 'settings', redirected: false });
    expect(resolveHash('#/history')).toEqual({ tab: 'today', redirected: true });
    expect(resolveHash('#/targets')).toEqual({ tab: 'targets', redirected: false });
    expect(resolveHash('')).toEqual({ tab: 'today', redirected: false });
    expect(resolveHash('#/nope')).toEqual({ tab: 'today', redirected: false });
  });
});
