import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';

/** Width of the revealed action area, px. Two 72px buttons (≥ 44px touch targets). */
export const SWIPE_ACTIONS_W = 144;
const LOCK_PX = 8; // movement before deciding horizontal vs vertical
const OPEN_RATIO = 0.4; // released past 40% of the action width → snap open

/** Where the row should rest after a drag. Pure; exported for tests. */
export function settleSwipe(offset: number, actionsWidth = SWIPE_ACTIONS_W): 'open' | 'closed' {
  return -offset >= actionsWidth * OPEN_RATIO ? 'open' : 'closed';
}

/** Clamp the live drag offset: no right overshoot, a little rubber band past the actions. */
export function clampSwipe(offset: number, actionsWidth = SWIPE_ACTIONS_W): number {
  if (offset > 0) return 0;
  const max = actionsWidth + 24;
  return Math.max(offset, -max);
}

let closeOthers: (() => void) | null = null;

/**
 * List row that reveals actions on a left swipe (iOS Mail style). Touch events from a
 * horizontal drag are stopped here so the Today view's day-swipe does not also fire.
 * A right swipe on a closed row is left alone, so it still goes to the previous day.
 */
export function SwipeRow({ children, actions, label }: { children: ReactNode; actions: ReactNode; label: string }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const open = offset !== 0 && !dragging;
  const start = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null } | null>(null);
  const close = useRef(() => setOffset(0));
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const mine = close.current;
    if (closeOthers && closeOthers !== mine) closeOthers();
    closeOthers = mine;
    const onDown = (e: PointerEvent) => {
      const row = rowRef.current;
      if (row && e.target instanceof Node && row.contains(e.target)) return;
      setOffset(0);
    };
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      if (closeOthers === mine) closeOthers = null;
    };
  }, [open]);

  const onTouchStart = (e: TouchEvent) => {
    const p = e.touches[0];
    if (!p) return;
    start.current = { x: p.clientX, y: p.clientY, base: offset, axis: null };
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = start.current;
    const p = e.touches[0];
    if (!s || !p) return;
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      // Horizontal only if it's a left drag, or a right drag that closes an open row.
      s.axis = Math.abs(dx) > Math.abs(dy) && (dx < 0 || s.base < 0) ? 'x' : 'y';
      if (s.axis === 'x') setDragging(true);
    }
    if (s.axis !== 'x') return;
    e.stopPropagation();
    setOffset(clampSwipe(s.base + dx));
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== 'x') return;
    e.stopPropagation(); // keep the parent's day-swipe from firing
    setDragging(false);
    setOffset((o) => (settleSwipe(o) === 'open' ? -SWIPE_ACTIONS_W : 0));
  };

  return (
    <div ref={rowRef} className={`swipe-row${open ? ' is-open' : ''}`}>
      <div className="swipe-actions" role="group" aria-label={label} hidden={offset === 0 && !dragging}>
        {actions}
      </div>
      <div
        className="swipe-content"
        style={{ transform: offset ? `translateX(${offset}px)` : undefined, transition: dragging ? 'none' : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          // A tap on an open row closes it instead of opening the entry.
          if (offset !== 0) {
            e.preventDefault();
            e.stopPropagation();
            setOffset(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
