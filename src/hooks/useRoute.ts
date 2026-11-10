import { useEffect, useState } from 'react';

/**
 * Routes (Story 5, T-011): Home is where the app opens; Meal log (`meals`, the former Today screen)
 * and Workout (`workout`, `workout/plan`) are entered from Home; `targets` is a sub-page of Settings.
 */
export type Tab = 'home' | 'meals' | 'workout' | 'workoutPlan' | 'progress' | 'settings' | 'targets' | 'ask';
/** Tabs shown in the tab bar: Home · Progress · Settings. */
export const TABS: readonly Tab[] = ['home', 'progress', 'settings'];
const PATHS: Readonly<Record<Tab, string>> = {
  home: 'home',
  meals: 'meals',
  workout: 'workout',
  workoutPlan: 'workout/plan',
  progress: 'progress',
  settings: 'settings',
  targets: 'targets',
  ask: 'ask',
};
const BY_PATH: Readonly<Record<string, Tab>> = Object.fromEntries(Object.entries(PATHS).map(([tab, path]) => [path, tab as Tab]));
/** Which tab-bar button is highlighted for a route. */
export const TAB_FOR: Readonly<Record<Tab, Tab>> = {
  home: 'home',
  meals: 'home',
  workout: 'home',
  workoutPlan: 'home',
  progress: 'progress',
  settings: 'settings',
  targets: 'settings',
  ask: 'home',
};

/** Old routes: Today (Story 3) and History (pre round 2) are the Meal log now. */
export const ROUTE_REDIRECTS: Readonly<Record<string, Tab>> = { today: 'meals', history: 'meals' };

export const hashFor = (tab: Tab): string => `#/${PATHS[tab]}`;

/** Resolves a location hash to a route, following the old-route redirects. Pure; exported for tests. */
export function resolveHash(hash: string): { tab: Tab; redirected: boolean } {
  const parts = hash.replace(/^#\/?/, '').split('?')[0]?.split('/').filter(Boolean) ?? [];
  const two = parts.slice(0, 2).join('/');
  const one = parts[0] ?? '';
  const exact = BY_PATH[two] ?? BY_PATH[one];
  if (exact) return { tab: exact, redirected: false };
  const to = ROUTE_REDIRECTS[one];
  if (to) return { tab: to, redirected: true };
  return { tab: 'home', redirected: false };
}

function read(): Tab {
  const { tab, redirected } = resolveHash(window.location.hash);
  // Replace (not push) so Back doesn't bounce into the redirect again.
  if (redirected) window.history.replaceState(null, '', hashFor(tab));
  return tab;
}

/** Hash-based routing (works on GitHub Pages with no server rewrites). */
export function useRoute(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (next: Tab) => {
    if (next === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.location.hash = hashFor(next).slice(1);
    window.scrollTo(0, 0);
  };
  return [tab, go];
}
