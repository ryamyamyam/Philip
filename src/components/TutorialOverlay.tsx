import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { t } from '../i18n';
import { stepsFor, TUTORIAL_STEPS, type TourChoice, type TourContext, type TourScreen } from '../lib/tutorial';
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
 * then advances; holding the screen types twice as fast (owner feedback, Nov 5). Skip and Escape ask
 * first, so a stray tap never throws you out; the caller keeps the current step so the tour resumes
 * where it left off. Never changes data — the caller records the end.
 */
export function TutorialOverlay({
  ctx,
  onEnd,
  screen,
  onScreen,
  resumeAt,
  onStep,
}: {
  ctx: TourContext;
  onEnd: (how: TourEnd) => void;
  /** The screen showing now; when a step belongs to another one, `onScreen` is asked to go there. */
  screen?: TourScreen;
  onScreen?: (screen: TourScreen) => void;
  /** Resume at this step (or the next one that applies), e.g. after Set targets or a reload. */
  resumeAt?: string | null;
  /** Called with each step's id as the tour moves on, so the caller can resume it later. */
  onStep?: (id: string, nextId: string | null) => void;
}) {
  const steps = useMemo(() => stepsFor(ctx), [ctx]);
  const [index, setIndex] = useState(() => resumeIndex(resumeAt ?? null, ctx));
  const step = steps[Math.min(index, steps.length - 1)];
  const text = step ? t(step.textKey) : '';
  const [fast, setFast] = useState(false);
  const { shown, done, complete } = useTypewriter(text, fast ? 2 : 1);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
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

  useEffect(() => {
    if (step) onStep?.(step.id, steps[index + 1]?.id ?? null);
  }, [step, steps, index, onStep]);

  /** A tap finishes the line first; the next tap moves on. Choice steps only move on by choosing. */
  const advance = useCallback(() => {
    // The release after a hold-to-speed-up is not a tap.
    if (held.current) {
      held.current = false;
      return;
    }
    if (!done) complete();
    else if (!step?.choices) next();
  }, [done, complete, next, step]);

  // Hold anywhere (like a video's fast-forward): after a short press the line types at 2×.
  const onPointerDown = () => {
    held.current = false;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setFast(true);
    }, 250);
  };
  const endHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setFast(false);
  };
  useEffect(() => () => endHold(), []);

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
      setConfirmSkip((v) => !v);
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
      onClick={confirmSkip ? undefined : advance}
      onPointerDown={confirmSkip ? undefined : onPointerDown}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onPointerLeave={endHold}
      onKeyDown={onKeyDown}
      data-step={step.id}
    >
      {spot ? <div className="pm-tour-spot" style={spotStyle} /> : <div className="pm-tour-dim" />}
      {!confirmSkip && (
        <button type="button" className="btn btn-sm pm-tour-skip" onClick={stop(() => setConfirmSkip(true))}>
          {t('tutorial.skip')}
        </button>
      )}
      <div ref={boxRef} className={`pm-tour-box${placeTop ? ' is-top' : ''}`}>
        <GymCharacter pose={step.pose} talking={!done} scale={2} className="pm-tour-portrait" />
        <div className="pm-dialog pm-dialog-voiced pm-tour-dialog">
          <span className="pm-dialog-speaker">{t('coach.speaker')}</span>
          {/* The typed text is visual only; the full line is announced once below. The untyped rest
              keeps its space (invisible) so the box doesn't grow while typing. */}
          <p className="pm-dialog-text pm-tour-text" aria-hidden="true" hidden={confirmSkip}>
            {shown}
            <span className="pm-tour-rest">{text.slice(shown.length)}</span>
          </p>
          <p className="visually-hidden" aria-live="polite" key={step.id}>
            {text}
          </p>
          {confirmSkip ? (
            <div className="pm-tour-confirm" role="group" aria-label={t('tutorial.skipTitle')}>
              <p className="pm-dialog-text">{t('tutorial.skipAsk')}</p>
              <div className="pm-tour-actions">
                <button ref={firstActionRef} type="button" className="btn btn-sm pm-tour-choice" onClick={stop(() => setConfirmSkip(false))}>
                  <span aria-hidden="true">▸ </span>
                  {t('tutorial.keepGoing')}
                </button>
                <button type="button" className="btn btn-sm pm-tour-choice" onClick={stop(() => onEnd('skip'))}>
                  {t('tutorial.skipConfirm')}
                </button>
              </div>
            </div>
          ) : (
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
            {!done && <span className="pm-tour-hint small">{t('tutorial.holdHint')}</span>}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Index to resume at: the saved step if it still applies, else the next one after it that does. */
function resumeIndex(id: string | null, ctx: TourContext): number {
  if (!id) return 0;
  const steps = stepsFor(ctx);
  const at = steps.findIndex((s) => s.id === id);
  if (at >= 0) return at;
  const order = TUTORIAL_STEPS.map((s) => s.id);
  const from = order.indexOf(id);
  if (from < 0) return 0;
  const later = steps.findIndex((s) => order.indexOf(s.id) > from);
  return later >= 0 ? later : Math.max(0, steps.length - 1);
}
