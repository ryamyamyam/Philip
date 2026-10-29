import { useRef, type TouchEvent } from 'react';

const EDGE = 28; // ignore iOS edge-swipe-back zone
const MIN_DX = 60;
const MAX_DY = 45;

/** Horizontal swipe detection. Returns touch handlers to spread on an element. */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart(e: TouchEvent) {
      const p = e.touches[0];
      if (!p || p.clientX < EDGE || p.clientX > window.innerWidth - EDGE) {
        start.current = null;
        return;
      }
      start.current = { x: p.clientX, y: p.clientY };
    },
    onTouchEnd(e: TouchEvent) {
      const s = start.current;
      const p = e.changedTouches[0];
      start.current = null;
      if (!s || !p) return;
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dy) > MAX_DY) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}
