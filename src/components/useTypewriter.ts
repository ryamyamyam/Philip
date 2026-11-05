import { useCallback, useEffect, useState } from 'react';
import { typeDelay } from '../lib/tutorial';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reveals `text` one character at a time (T-010). `complete()` shows the rest at once.
 * Under reduced motion the whole line appears immediately.
 */
export function useTypewriter(text: string): { shown: string; done: boolean; complete: () => void } {
  const start = () => ({ text, count: prefersReducedMotion() ? text.length : 0 });
  const [state, setState] = useState(start);
  // A new line restarts during render, so the old count never flashes the new text whole.
  const current = state.text === text ? state : start();
  if (current !== state) setState(current);
  const { count } = current;

  useEffect(() => {
    if (count >= text.length) return;
    const id = window.setTimeout(
      () => setState((s) => (s.text === text ? { text, count: s.count + 1 } : s)),
      count === 0 ? 0 : typeDelay(text[count - 1] ?? ''),
    );
    return () => window.clearTimeout(id);
  }, [count, text]);

  const complete = useCallback(() => setState({ text, count: text.length }), [text]);
  return { shown: text.slice(0, count), done: count >= text.length, complete };
}
