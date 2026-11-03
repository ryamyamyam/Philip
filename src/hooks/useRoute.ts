import { useEffect, useState } from 'react';

/** Routes: the three tabs plus `targets`, a sub-page of Settings (Story 3). */
export type Tab = 'today' | 'progress' | 'settings' | 'targets';
/** Tabs shown in the tab bar (Story 3: Today · Progress · Settings). */
export const TABS: readonly Tab[] = ['today', 'progress', 'settings'];
const ROUTES: readonly Tab[] = [...TABS, 'targets'];
/** Which tab is highlighted for a route. */
export const TAB_FOR: Readonly<Record<Tab, Tab>> = { today: 'today', progress: 'progress', settings: 'settings', targets: 'settings' };

/** Old routes: History (pre round 2) and Meals (round 2) are now part of Today. */
export const ROUTE_REDIRECTS: Readonly<Record<string, Tab>> = { history: 'today', meals: 'today' };

/** Resolves a location hash to a tab, following the old-route redirects. Pure; exported for tests. */
export function resolveHash(hash: string): { tab: Tab; redirected: boolean } {
  const h = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  if ((ROUTES as readonly string[]).includes(h)) return { tab: h as Tab, redirected: false };
  const to = ROUTE_REDIRECTS[h];
  if (to) return { tab: to, redirected: true };
  return { tab: 'today', redirected: false };
}

function read(): Tab {
  const { tab, redirected } = resolveHash(window.location.hash);
  // Replace (not push) so Back doesn't bounce into the redirect again.
  if (redirected) window.history.replaceState(null, '', `#/${tab}`);
  return tab;
}

/** Hash-based tab routing (works on GitHub Pages with no server rewrites). */
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
    window.location.hash = `/${next}`;
    window.scrollTo(0, 0);
  };
  return [tab, go];
}
