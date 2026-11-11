/** Persistent data types. All nutrition values are metric (grams, kcal); training loads in kg. */
import type { Prescribed, SessionSlot } from '../lib/training/session';
import type { Block, Day, LiftId, Phase, TmReason, Week } from '../lib/training/program';
import type { CheckinFlag } from '../lib/training/checkin';
import type { PlateUnit } from '../lib/training/plates';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
export type Goal = 'lose' | 'maintain' | 'gain';

/** Local calendar date, YYYY-MM-DD. Never derived from UTC. */
export type YMD = string;

export interface Macros {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface UnitPrefs {
  weight: 'kg' | 'lb';
  height: 'cm' | 'in';
}

export interface Profile {
  id: 'me';
  sex: Sex | null;
  birthDate: YMD | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Optional body-fat percentage (3–60). When set, resting energy uses Katch–McArdle. Added in DB v2. */
  bodyFatPct: number | null;
  activityLevel: ActivityLevel | null;
  trainingDaysPerWeek: number | null;
  goal: Goal | null;
  targetWeightKg: number | null;
  /** Signed: negative = loss per week, positive = gain per week. */
  weeklyRateKg: number | null;
  /** Long-term body-fat % target (Story 5, DB v4). Checked against BODY_FAT_TARGET in lib/targets.ts. */
  targetBodyFatPct: number | null;
  unitPrefs: UnitPrefs;
  locale: string;
  /** Stored only on this device. Never exported unless the user opts in. */
  geminiKey: string | null;
  geminiModel: string | null;
  adherenceEnabled: boolean;
}

export type TargetMethod = 'calculated' | 'manual';
/** 0 = Sunday … 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TargetPlan extends Macros {
  id?: number;
  effectiveFrom: YMD;
  method: TargetMethod;
  /** Inputs used by the calculator (null for manual plans). */
  inputsSnapshot: Record<string, unknown> | null;
  /** Optional weekly planning: per-weekday targets that replace the base values. */
  weekdayOverrides?: Partial<Record<Weekday, Macros>> | null;
  createdAt: number;
}

export type FoodSource = 'manual' | 'photo' | 'saved';

export interface EstimateItem extends Macros {
  name: string;
  description: string;
  grams: number | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface FoodEstimate {
  provider: 'gemini' | 'claude-handoff';
  model: string;
  items: EstimateItem[];
  /** Values as returned by the AI for this entry, before user edits. */
  originalValues: Macros & { name: string; grams: number | null };
  analyzedAt: number;
}

export interface FoodEntry extends Macros {
  id: string;
  date: YMD;
  meal: Meal;
  name: string;
  grams: number | null;
  source: FoodSource;
  savedFoodId: string | null;
  estimate: FoodEstimate | null;
  createdAt: number;
  updatedAt: number;
}

export interface SavedFood extends Macros {
  id: string;
  name: string;
  grams: number | null;
  useCount: number;
  lastUsedAt: number | null;
  favorite: boolean;
  createdAt: number;
}

/** One body-weight reading per local date (DB v2). Logging again for a date overwrites it. */
export interface WeightEntry {
  date: YMD;
  weightKg: number;
  createdAt: number;
  updatedAt: number;
}

/** One food inside a saved meal. Values are for `grams` (when known). */
export interface SavedMealItem extends Macros {
  name: string;
  grams: number | null;
}

/** A named, reusable combination of foods ("Usual breakfast"). DB v3 (Story 3). */
export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
  useCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/* ---------------- Training (Story 5, DB v4) ---------------- */

/** The single training program row. Loads are in kg; units only change display and rounding. */
export interface TrainingProgram {
  id: 'me';
  startedAt: number;
  /** Empty bar (kg), plate unit and the plate sizes available, in that unit. */
  bar: { barKg: number; plateUnit: PlateUnit; plates: number[] };
  /** Unit for dumbbells and machine stacks (rounding and increments). */
  weightUnit: PlateUnit;
  unavailableEquipment: string[];
  /** 1-based cycle in progress; 0 = set up but the first cycle hasn't started (briefing pending). */
  currentCycle: number;
  /** Training weekdays for the projected calendar (Story 6 §3.1), 1 = Mon … 7 = Sun. Absent = Philip's pick. */
  trainingDays?: IsoWeekday[];
  /** Story 7 (OBS-F52773): the owner's exercise order per program day ('1'–'4'); main lift always first. */
  dayOrder?: Partial<Record<string, SessionSlot[]>>;
  /** Story 7 (OBS-3DB146): one-off accessory orders Philip's report set for the next time an exercise comes up. */
  nextOverrides?: AccessoryOverride[];
  /** Story 10 (OBS-E19B38): the owner's treadmill and what its speed number means. Absent = the owner's unit. */
  treadmill?: Treadmill;
  createdAt: number;
  updatedAt: number;
}

/** The owner's treadmill (Story 10). `level` dials map linearly from minMph (level 1) to maxMph (maxLevel). */
export interface Treadmill {
  /** Brand and model as the owner typed it ('' = not named). */
  name: string;
  scale: 'mph' | 'kmh' | 'level';
  maxLevel?: number;
  minMph?: number;
  maxMph?: number;
  /** Philip estimated it (Gemini), or the owner set it. */
  source: 'philip' | 'me';
}

/** Append-only TM history. The TM for a cycle is the latest row with effectiveCycle ≤ that cycle. */
export interface TmRecord {
  id?: number;
  lift: LiftId;
  tmKg: number;
  effectiveCycle: number;
  reason: TmReason;
  createdAt: number;
}

export interface CycleGoalSnapshot {
  startWeightKg: number;
  startBfPct: number | null;
  endWeightKg: number;
  weeklyRatePct: number;
  bfLinePct: number | null;
  source: 'philip' | 'user';
  /** The target plan written when the cycle started, if any. */
  targetPlanId: number | null;
}

/** A started cycle, with the phase, TMs and goal snapshotted at its start. */
export interface CycleRecord {
  index: number;
  block: Block;
  startedAt: number;
  phase: Phase;
  tms: Record<LiftId, number>;
  goal: CycleGoalSnapshot;
  /** Extra rest (s) for the rest of this cycle, accepted in a review. */
  restBonusSec?: number;
}

/** What the owner actually did on one set. Never derived from the order unless he taps "As ordered". */
export interface ActualSet {
  order: number;
  kg: number | null;
  reps: number | null;
  done: boolean;
  pain: boolean;
  copiedFromOrder: boolean;
  /** Owner's check-in on this set (Nov 5 feedback). */
  flag?: CheckinFlag;
  /** What the owner told Philip about this set. */
  note?: string;
}

export interface SessionExercise {
  slot: SessionSlot;
  exerciseId: string;
  swappedFrom: string | null;
  note: string;
  /** Philip's orders, frozen when the session was generated. Never edited. */
  prescription: Prescribed[];
  /** The owner's log. */
  actual: ActualSet[];
  /** The owner skipped this exercise today (its sets stay unlogged). */
  skipped?: boolean;
  /** Philip's original orders, kept when the owner OKs a mid-workout change. */
  originalPrescription?: Prescribed[];
}

export type SessionStatus = 'in_progress' | 'done' | 'skipped';

export interface WorkoutSession {
  id: string;
  date: YMD;
  cycle: number;
  block: Block;
  week: Week;
  day: Day;
  status: SessionStatus;
  estMinutes: number;
  startedAt: number;
  finishedAt: number | null;
  exercises: SessionExercise[];
  /** The end-of-day review was answered (applied or declined). */
  reviewed?: boolean;
  /** What "OK, apply" in this session's review changed (Story 6 §4), so deleting the log can undo it. */
  reviewApplied?: ReviewApplied;
  /** Story 7 (OBS-93A8C0): the cardio finisher (outside the 45-minute budget). Older sessions: absent. */
  cardio?: CardioLog;
  /** Story 7 (OBS-3DB146): Philip's observation report, his proposals and the chat under it. */
  coach?: CoachThread;
  /**
   * Story 10 (OBS-7BAD75): a finished log reopened to fix it. While set, the session screen has no
   * timer, and saving keeps the original `finishedAt`. Absent on every other session.
   */
  editing?: boolean;
}

/** Cardio after the lifts (Story 7). Planned minutes come from the phase; the rest is the owner's log. */
export interface CardioLog {
  kind: 'incline-walk';
  planMin: number;
  minutes: number | null;
  inclinePct: number | null;
  /** The number set on the machine (Story 10: in the machine's own scale). */
  speed: number | null;
  /** What `speed` means: mph, km/h, or a level on the owner's treadmill (Story 10, OBS-E19B38). */
  speedUnit: 'mph' | 'kmh' | 'level';
  /** Story 10: Philip's projected mph for `speed` when it was logged (an estimate for levels). Absent before Story 10. */
  speedMph?: number;
  done: boolean;
  skipped: boolean;
}

/** One next-time order for an accessory, set by an applied report proposal. Inert once the exercise is logged again. */
export interface AccessoryOverride {
  exerciseId: string;
  /** The session whose report set it. It applies while that is the latest log of the exercise. */
  afterSessionId: string;
  kg: number | null;
  reps: number | null;
  sets: number | null;
}

/** A plan change Philip proposes in his report or in chat. Nothing applies until the owner taps Apply. */
export type CoachChange =
  | { kind: 'tm'; lift: LiftId; toKg: number }
  | { kind: 'rest'; extraSec: number }
  | { kind: 'swap'; day: Day; slot: 'A1' | 'A2' | 'B'; exerciseId: string }
  | { kind: 'next'; exerciseId: string; kg: number | null; reps: number | null; sets: number | null }
  | { kind: 'days'; days: IsoWeekday[] };

export interface CoachProposal {
  id: string;
  change: CoachChange;
  why: string;
  status: 'open' | 'applied' | 'declined';
}

export interface CoachMessage {
  from: 'me' | 'philip';
  text: string;
  at: number;
}

export interface CoachThread {
  report: string;
  proposals: CoachProposal[];
  messages: CoachMessage[];
  createdAt: number;
  updatedAt: number;
}

/** One TM change and the rest bonus a review applied. Undo is additive: TM += fromKg − toKg. */
export interface ReviewApplied {
  tm: { lift: LiftId; fromKg: number; toKg: number }[];
  restBonusAddedSec: number;
  /** Story 7: sticky swaps a report applied, with the choice they replaced (null = Philip's pick). */
  swaps?: { slotKey: string; from: string | null; to: string }[];
  /** Story 7: training days a report applied, with the days they replaced (null = Philip's pick). */
  days?: { from: IsoWeekday[] | null; to: IsoWeekday[] };
}

/** The owner's sticky pick for a menu slot (one of Philip's approved swaps). */
export interface SlotChoice {
  slotKey: string;
  exerciseId: string;
  chosenAt: number;
}


/* ---------------- Philip's memory (Story 9, DB v5) ---------------- */

/**
 * A durable fact Philip keeps across workouts and chats ("Left knee complains on lunges").
 * Written when Gemini returns `remember` in a reply; the owner sees and deletes them in Settings.
 */
export interface CoachNote {
  id?: number;
  text: string;
  /** Where it came from: a workout report/chat, or Ask Philip. */
  source: 'report' | 'ask';
  sessionId: string | null;
  createdAt: number;
}

/** One line of the Ask Philip chat (outside a workout). Workout chats stay on their session. */
export interface CoachChatMessage {
  id?: number;
  from: 'me' | 'philip';
  text: string;
  at: number;
}
