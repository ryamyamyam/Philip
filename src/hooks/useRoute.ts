import { useEffect, useState } from 'react';

export type Tab = 'today' | 'meals' | 'progress' | 'settings';
export const TABS: readonly Tab[] = ['today', 'meals', 'progress', 'settings'];

/** Old routes from before QA round 2 (History → Meals, Targets → Progress). */
export const ROUTE_REDIRECTS: Readonly<Record<string, Tab>> = { history: 'meals', targets: 'progress' };

/** Resolves a location hash to a tab, following the old-route redirects. Pure; exported for tests. */
export function resolveHash(hash: string): { tab: Tab; redirected: boolean } {
  const h = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  if ((TABS as readonly string[]).includes(h)) return { tab: h as Tab, redirected: false };
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
