import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { t } from '../i18n';
import { stepsFor, type TourChoice, type TourContext, type TourScreen } from '../lib/tutorial';
import { GymCharacter } from './GymCharacter';
import { prefersReducedMotion, useTypewriter } from './useTypewriter';

export type TourEnd = 'finish' | 'skip' | 'setTargets';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const anchorEl = (anchor: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Philip's guided tour (T-010, D-024): dims Today, spotlights one `data-tour` anchor at a time and
 * talks in a bottom dialog box with his portrait. Tap (or Next / Enter / Space) finishes the line,
 * then advances; Skip or Escape ends it. Never changes data — the caller records the end.
 */
export function TutorialOverlay({
  ctx,
  onEnd,
  screen,
  onScreen,
}: {
  ctx: TourContext;
  onEnd: (how: TourEnd) => void;
  /** The screen showing now; when a step belongs to another one, `onScreen` is asked to go there. */
  screen?: TourScreen;
  onScreen?: (screen: TourScreen) => void;
}) {
  const steps = useMemo(() => stepsFor(ctx), [ctx]);
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];
  const text = step ? t(step.textKey) : '';
  const { shown, done, complete } = useTypewriter(text);
  const [spot, setSpot] = useState<Box | null>(null);
  const [placeTop, setPlaceTop] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  const next = useCallback(() => {
    if (index >= steps.length - 1) onEnd('finish');
    else setIndex((i) => i + 1);
  }, [index, steps.length, onEnd]);

  /** A tap finishes the line first; the next tap moves on. Choice steps only move on by choosing. */
  const advance = useCallback(() => {
    if (!done) complete();
    else if (!step?.choices) next();
  }, [done, complete, next, step]);

  const choose = (c: TourChoice) => (c === 'setTargets' ? onEnd('setTargets') : next());

  // Steps say which screen they run on (Story 5): walk there before pointing at anything.
  const stepScreen = step?.screen;
  const onWrongScreen = !!(screen && stepScreen && screen !== stepScreen);
  useEffect(() => {
    if (onWrongScreen && stepScreen) onScreen?.(stepScreen);
  }, [onWrongScreen, stepScreen, onScreen]);

  // Focus moves in on open and goes back to Today on close.
  useEffect(() => {
    returnTo.current = document.activeElement;
    return () => {
      const prev = returnTo.current;
      const target =
        prev instanceof HTMLElement && prev.isConnected && prev !== document.body
          ? prev
          : document.querySelector<HTMLElement>('.view-today button, .view-today [tabindex]');
      target?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    firstActionRef.current?.focus({ preventScroll: true });
  }, [index, done]);

  // Spotlight: scroll the anchor into view, then follow it on resize and scroll.
  useLayoutEffect(() => {
    setPlaceTop(false);
    const anchor = step?.anchor;
    if (onWrongScreen) {
      setSpot(null);
      return;
    }
    if (!anchor) {
      setSpot(null);
      return;
    }
    const el = anchorEl(anchor);
    if (!el) {
      // The anchor isn't on screen (e.g. Today changed under us): skip the step rather than point at nothing.
      setSpot(null);
      next();
      return;
    }
    el.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setSpot({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      ro?.disconnect();
    };
  }, [step, onWrongScreen]);

  // The dialog never covers the spotlit element: if it would, it moves to the top of the screen.
  useLayoutEffect(() => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!spot || !box || placeTop) return;
    const overlaps = spot.top < box.bottom && spot.top + spot.height > box.top;
    if (overlaps) setPlaceTop(true);
  }, [spot, placeTop]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEnd('skip');
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault();
      advance();
    } else if (e.key === 'Tab') {
      const items = rootRef.current ? [...rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  if (!step) return null;
  const spotStyle: CSSProperties | undefined = spot
    ? { top: spot.top, left: spot.left, width: spot.width, height: spot.height }
    : undefined;

  return (
    <div
      ref={rootRef}
      className="pm-tour"
      role="dialog"
      aria-modal="true"
      aria-label={t('tutorial.label')}
      tabIndex={-1}
      onClick={advance}
      onKeyDown={onKeyDown}
      data-step={step.id}
    >
      {spot ? <div className="pm-tour-spot" style={spotStyle} /> : <div className="pm-tour-dim" />}
      <button type="button" className="btn btn-sm pm-tour-skip" onClick={stop(() => onEnd('skip'))}>
        {t('tutorial.skip')}
      </button>
      <div ref={boxRef} className={`pm-tour-box${placeTop ? ' is-top' : ''}`}>
        <GymCharacter pose={step.pose} talking={!done} scale={2} className="pm-tour-portrait" />
        <div className="pm-dialog pm-dialog-voiced pm-tour-dialog">
          <span className="pm-dialog-speaker">{t('coach.speaker')}</span>
          {/* The typed text is visual only; the full line is announced once below. The untyped rest
              keeps its space (invisible) so the box doesn't grow while typing. */}
          <p className="pm-dialog-text pm-tour-text" aria-hidden="true">
            {shown}
            <span className="pm-tour-rest">{text.slice(shown.length)}</span>
          </p>
          <p className="visually-hidden" aria-live="polite" key={step.id}>
            {text}
          </p>
          <div className="pm-tour-actions">
            {step.choices ? (
              step.choices.map((c, i) => (
                <button
                  key={c}
                  ref={i === 0 ? firstActionRef : undefined}
                  type="button"
                  className="btn btn-sm pm-tour-choice"
                  onClick={stop(() => choose(c))}
                >
                  {i === 0 && <span aria-hidden="true">▸ </span>}
                  {t(c === 'setTargets' ? 'tutorial.setTargets' : 'tutorial.later')}
                </button>
              ))
            ) : (
              <button ref={firstActionRef} type="button" className="btn btn-sm pm-tour-next" onClick={stop(advance)}>
                {t('tutorial.next')}
                {done && <span className="pm-dialog-caret pm-tour-caret" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
