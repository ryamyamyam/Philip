import { useEffect, useState } from 'react';

export type Tab = 'today' | 'history' | 'targets' | 'settings';
const TABS: Tab[] = ['today', 'history', 'targets', 'settings'];

function read(): Tab {
  const h = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (TABS as string[]).includes(h) ? (h as Tab) : 'today';
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
