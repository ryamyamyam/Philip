import { describe, expect, it } from 'vitest';
import { dayHeading } from './format';
import { resolveHash, TAB_FOR, TABS } from '../hooks/useRoute';

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

describe('navigation routes (Story 5)', () => {
  it('opens on Home; Meal log, Workout and Plan are routes; old Today/History go to the Meal log', () => {
    expect(resolveHash('')).toEqual({ tab: 'home', redirected: false });
    expect(resolveHash('#/home')).toEqual({ tab: 'home', redirected: false });
    expect(resolveHash('#/meals')).toEqual({ tab: 'meals', redirected: false });
    expect(resolveHash('#/today')).toEqual({ tab: 'meals', redirected: true });
    expect(resolveHash('#/history')).toEqual({ tab: 'meals', redirected: true });
    expect(resolveHash('#/workout')).toEqual({ tab: 'workout', redirected: false });
    expect(resolveHash('#/workout/plan')).toEqual({ tab: 'workoutPlan', redirected: false });
    expect(resolveHash('#/progress')).toEqual({ tab: 'progress', redirected: false });
    expect(resolveHash('#/settings')).toEqual({ tab: 'settings', redirected: false });
    expect(resolveHash('#/targets')).toEqual({ tab: 'targets', redirected: false });
    expect(resolveHash('#/nope')).toEqual({ tab: 'home', redirected: false });
  });
  it('highlights Home for its sections and Settings for Targets', () => {
    expect([TAB_FOR.meals, TAB_FOR.workout, TAB_FOR.workoutPlan, TAB_FOR.targets]).toEqual(['home', 'home', 'home', 'settings']);
    expect(TABS).toEqual(['home', 'progress', 'settings']);
  });
});
