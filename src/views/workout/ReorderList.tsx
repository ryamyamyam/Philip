import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SessionExercise } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { dropIndex, moveTo } from '../../lib/training/order';

const SLOT_KEY: Record<SessionExercise['slot'], StringKey> = {
  main: 'session.slot.main',
  A1: 'session.slot.A1',
  A2: 'session.slot.A2',
  B: 'session.slot.B',
};

interface Drag {
  index: number;
  pointerId: number;
  downY: number;
  y: number;
  downTop: number;
}

/**
 * Story 10 (OBS-DD5F16): reorder mode. Every exercise folds to its title bar and floats; drag one
 * (or use its Up/Down buttons) to where it should go, then Save. The main lift stays first. Nothing
 * is saved until Save; Cancel keeps the old order.
 */
export function ReorderList({ exercises, onSave, onCancel }: { exercises: readonly SessionExercise[]; onSave: (next: SessionExercise[]) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<SessionExercise[]>(() => [...exercises]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const boxRef = useRef<HTMLElement>(null);
  // The list opens where the session was scrolled; bring it into view.
  useEffect(() => {
    boxRef.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  // The lifted row follows the finger; its layout slot moves under it as the order changes.
  useLayoutEffect(() => {
    rows.current.forEach((el, i) => {
      if (!el) return;
      el.style.transform = drag && i === drag.index ? `translateY(${drag.y - drag.downY - (el.offsetTop - drag.downTop)}px)` : '';
    });
  }, [drag, draft]);

  const start = (e: React.PointerEvent<HTMLLIElement>, index: number) => {
    if (draft[index]?.slot === 'main') return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index, pointerId: e.pointerId, downY: e.clientY, y: e.clientY, downTop: e.currentTarget.offsetTop });
  };
  const move = (e: React.PointerEvent<HTMLLIElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const list = listRef.current;
    if (!list) return;
    const y = e.clientY - list.getBoundingClientRect().top;
    const mids = rows.current.map((el) => (el ? el.offsetTop + el.offsetHeight / 2 : 0));
    const to = dropIndex(mids, y, drag.index);
    if (to !== drag.index) {
      const next = moveTo(draft, drag.index, to);
      const landed = next.indexOf(draft[drag.index] as SessionExercise);
      setDraft(next);
      setDrag({ ...drag, index: landed, y: e.clientY });
    } else {
      setDrag({ ...drag, y: e.clientY });
    }
  };
  const end = (e: React.PointerEvent<HTMLLIElement>) => {
    if (drag && e.pointerId === drag.pointerId) setDrag(null);
  };
  const step = (index: number, dir: -1 | 1) => setDraft((d) => moveTo(d, index, index + dir));
  const floor = draft[0]?.slot === 'main' ? 1 : 0;

  return (
    <section ref={boxRef} className="card stack-sm reorder" aria-labelledby="reorder-h">
      <h2 id="reorder-h">{t('reorder.title')}</h2>
      <p className="small">{t('reorder.hint')}</p>
      <ol ref={listRef} className="reorder-list">
        {draft.map((ex, i) => {
          const name = t(`exercise.${ex.exerciseId}` as StringKey);
          const fixed = ex.slot === 'main';
          return (
            <li
              key={ex.slot}
              ref={(el) => {
                rows.current[i] = el;
              }}
              className={`reorder-row${fixed ? ' is-fixed' : drag?.index === i ? ' is-lifted' : ' is-floating'}`}
              onPointerDown={(e) => start(e, i)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              aria-label={fixed ? t('reorder.fixed', { name }) : name}
            >
              <span className="pm-pill ex-slot">{t(SLOT_KEY[ex.slot])}</span>
              <span className="reorder-name">{name}</span>
              {fixed ? (
                <span className="small muted">{t('reorder.first')}</span>
              ) : (
                <span className="reorder-steps">
                  <button type="button" className="btn btn-sm btn-ghost" disabled={i <= floor} aria-label={t('session.moveUpN', { name })} onClick={() => step(i, -1)}>
                    {t('session.moveUp')}
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={i >= draft.length - 1} aria-label={t('session.moveDownN', { name })} onClick={() => step(i, 1)}>
                    {t('session.moveDown')}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="ex-actions">
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          {t('reorder.save')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('reorder.cancel')}
        </button>
      </div>
    </section>
  );
}

/**
 * Long press (OBS-DD5F16): calls `fn` after `ms` of holding still. Moving more than 10 px or lifting
 * the finger cancels it. Returns pointer handlers and `fired()`, so a click that ends a long press
 * can be ignored.
 */
export function useLongPress(fn: (() => void) | undefined, ms = 450) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const clear = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    origin.current = null;
  };
  return {
    handlers: fn
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            firedRef.current = false;
            origin.current = { x: e.clientX, y: e.clientY };
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => {
              firedRef.current = true;
              origin.current = null;
              fn();
            }, ms);
          },
          onPointerMove: (e: React.PointerEvent) => {
            const o = origin.current;
            if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clear();
          },
          onPointerUp: clear,
          onPointerCancel: clear,
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
          onClickCapture: (e: React.MouseEvent) => {
            if (firedRef.current) {
              e.preventDefault();
              e.stopPropagation();
              firedRef.current = false;
            }
          },
        }
      : {},
  };
}
