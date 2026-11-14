import { useEffect, useRef } from 'react';
import type { YMD } from '../db/types';

/**
 * Story 12: the day slides in when it changes (‹ ›, a swipe or the date picker). Going forward the new
 * day comes in from the right, going back from the left. A short Web Animation on the same element, so
 * nothing remounts (a half-typed entry stays). The length is the slow motion token (and 1.5×), which is
 * 0 under reduced motion: then there's no slide.
 */
export function useDaySlide<T extends HTMLElement>(date: YMD) {
  const ref = useRef<T>(null);
  const prev = useRef(date);
  useEffect(() => {
    const from = prev.current;
    prev.current = date;
    const el = ref.current;
    if (!el || from === date || typeof el.animate !== 'function') return;
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-slow')) * 1.5;
    if (!Number.isFinite(ms) || ms <= 0) return;
    const dx = date > from ? 36 : -36;
    el.animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: ms, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }, [date]);
  return ref;
}
