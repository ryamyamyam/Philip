import type { StringKey } from '../i18n';
import type { PoseId } from './character';

/**
 * Philip's guided tour (T-010, D-024). The steps are data: each names its line, the element it
 * spotlights (a `data-tour` anchor, or none) and when it applies. `stepsFor` filters them for the
 * current state, so a step whose anchor can't exist (no target → no protein row) is never shown.
 */
export type TourAnchor =
  | 'home-meals'
  | 'home-workout'
  | 'phase-chip'
  | 'calories'
  | 'protein'
  | 'calories-empty'
  | 'photo'
  | 'type'
  | 'dialog'
  | 'tab-progress'
  | 'tab-settings';

/** The screen a step runs on (Story 5: the tour starts on Home, then walks into the Meal log). */
export type TourScreen = 'home' | 'meals';

export interface TourContext {
  /** A calorie/macro target applies today. */
  hasTarget: boolean;
  /** A Gemini key is saved. */
  hasKey: boolean;
}

export type TourChoice = 'setTargets' | 'later';

export interface TourStep {
  id: string;
  textKey: StringKey;
  anchor: TourAnchor | null;
  screen: TourScreen;
  /** Philip's pose and expression for this line (owner brief, Nov 2026). */
  pose: PoseId;
  when: (ctx: TourContext) => boolean;
  /** Game-style choices; the step can't be advanced by tapping, only by picking one. */
  choices?: readonly TourChoice[];
}

const always = () => true;

export const TUTORIAL_STEPS: readonly TourStep[] = [
  { id: 'hello', textKey: 'tutorial.hello', pose: 'wave', screen: 'home', anchor: null, when: always },
  { id: 'what', textKey: 'tutorial.what', pose: 'cross-smug', screen: 'home', anchor: null, when: always },
  { id: 'homeMeals', textKey: 'tutorial.homeMeals', pose: 'point-down-smirk', screen: 'home', anchor: 'home-meals', when: always },
  { id: 'homeWorkout', textKey: 'tutorial.homeWorkout', pose: 'flex', screen: 'home', anchor: 'home-workout', when: always },
  { id: 'phase', textKey: 'tutorial.phase', pose: 'point-up', screen: 'home', anchor: 'phase-chip', when: always },
  // No anchor: the Meal log is still loading when this line starts.
  { id: 'mealsIntro', textKey: 'tutorial.mealsIntro', pose: 'cross-unimpressed', screen: 'meals', anchor: null, when: always },
  { id: 'fuel', textKey: 'tutorial.fuel', pose: 'point-up', screen: 'meals', anchor: 'calories', when: (c) => c.hasTarget },
  { id: 'protein', textKey: 'tutorial.protein', pose: 'flex', screen: 'meals', anchor: 'protein', when: (c) => c.hasTarget },
  { id: 'noTarget', textKey: 'tutorial.noTarget', pose: 'cross-unimpressed', screen: 'meals', anchor: 'calories-empty', when: (c) => !c.hasTarget, choices: ['setTargets', 'later'] },
  { id: 'photo', textKey: 'tutorial.photo', pose: 'phone', screen: 'meals', anchor: 'photo', when: always },
  { id: 'type', textKey: 'tutorial.type', pose: 'point-down-smirk', screen: 'meals', anchor: 'type', when: always },
  { id: 'dialog', textKey: 'tutorial.dialog', pose: 'point-down-warm', screen: 'meals', anchor: 'dialog', when: (c) => c.hasTarget },
  { id: 'progress', textKey: 'tutorial.progress', pose: 'point-down-cheer', screen: 'meals', anchor: 'tab-progress', when: always },
  { id: 'key', textKey: 'tutorial.key', pose: 'hair-flick', screen: 'meals', anchor: 'tab-settings', when: (c) => !c.hasKey },
  { id: 'bye', textKey: 'tutorial.bye', pose: 'fist-pump', screen: 'meals', anchor: null, when: always },
];

export function stepsFor(ctx: TourContext, steps: readonly TourStep[] = TUTORIAL_STEPS): TourStep[] {
  return steps.filter((s) => s.when(ctx));
}

/** Typewriter base speed and pauses, in ms (spec §2: ~30 ms a character, longer after . ? !). */
export const TYPE_MS = { char: 30, space: 45, comma: 120, stop: 240 } as const;

/** Delay before the character *after* `ch` appears. */
export function typeDelay(ch: string): number {
  if (ch === '.' || ch === '?' || ch === '!') return TYPE_MS.stop;
  if (ch === ',' || ch === ';' || ch === ':') return TYPE_MS.comma;
  if (ch === ' ') return TYPE_MS.space;
  return TYPE_MS.char;
}

/** Total time to type `text` (for tests and for pacing the mouth animation). */
export function typeDuration(text: string): number {
  let ms = 0;
  for (let i = 0; i < text.length - 1; i++) ms += typeDelay(text[i] ?? '');
  return ms;
}
