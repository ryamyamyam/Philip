import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The bottom "control deck" (D-022): dark, textured, thumb-reachable. `ControlDeck` is the
 * navigation strip (TabBar renders inside it). `DeckActions` is an optional strip that a screen
 * docks right above it (Today: the log buttons); it stays in the screen's markup, so it is still
 * part of <main>, and publishes its height as --deck-actions-h so content never hides under it.
 */
export function ControlDeck({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="tabbar pm-deck" aria-label={label}>
      <div className="tabbar-inner">{children}</div>
    </nav>
  );
}

export function DeckActions({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const publish = () => root.style.setProperty('--deck-actions-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty('--deck-actions-h');
    };
  }, []);
  return (
    <div ref={ref} className={`pm-deck-actions${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      <div className="pm-deck-actions-inner">{children}</div>
    </div>
  );
}
