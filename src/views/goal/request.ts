/**
 * Story 11 §5: building Philip's goal-plan request, sending it and taking the answer in, whichever
 * way it comes (cloud now, cloud later from the queue, this device's key, or a reply pasted from
 * Claude). Lazy: loaded with the goal sheet or when a waiting request needs a nudge.
 */
import { db } from '../../db/db';
import { loadBrief } from '../../db/coachBrief';
import { addPlanChange, updatePlanChange } from '../../db/goalRepo';
import { META } from '../../db/repo';
import type { CycleRecord, GoalChoice, GoalProposalRecord, PlanChange, YMD } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { toYmd } from '../../lib/date';
import { planForDate } from '../../lib/nutrition';
import { calculateTargets } from '../../lib/targets';
import { calcInputsForGoal } from '../../lib/training/cycleGoal';
import { blockForCycle } from '../../lib/training/program';
import { nextCycleIndex } from '../../lib/training/progress';
import { trainingDaysOrDefault } from '../../lib/training/schedule';
import { goalWindow, type GoalWindow } from '../../lib/goal/window';
import { leverRanges, parseProposal, proposalPrompt, type LeverRanges } from '../../lib/goal/proposal';
import { extractJson } from '../../services/foodAnalysis/parse';
import { askCloud, cloudJob, cloudToken, cloudUrl } from '../../services/coachCloud';
import type { StoredSubscription } from '../../services/restPush';

const exName = (id: string) => t(`exercise.${id}` as StringKey);

export interface Prepared {
  window: GoalWindow;
  ranges: LeverRanges;
  prompt: string;
}

/** Everything Philip needs, from the database (one read), for the goal the owner picked. */
export async function prepareRequest(cycle: CycleRecord, choice: GoalChoice, event: 'reached' | 'offtrack', reason: string, restart: boolean, today: YMD): Promise<Prepared> {
  const [profile, plans, weights, program, cycles, sessions, choices] = await Promise.all([
    db.profile.get('me'),
    db.targetPlans.toArray(),
    db.weightEntries.toArray(),
    db.trainingProgram.get('me'),
    db.cycles.toArray(),
    db.workoutSessions.toArray(),
    db.slotChoices.toArray(),
  ]);
  const start = toYmd(new Date(cycle.startedAt));
  const food = await db.foodEntries.where('date').between(start, today, true, true).toArray();
  const window = goalWindow({
    start,
    today,
    startKg: cycle.goal.startWeightKg,
    weights,
    food,
    targetOn: (d) => planForDate(plans, d),
    sessions,
    cycle: cycle.index,
  });
  let calc = null;
  if (profile) {
    const inputs = calcInputsForGoal(profile, choice.phase, choice, today);
    if (inputs) {
      try {
        calc = calculateTargets(inputs);
      } catch {
        calc = null;
      }
    }
  }
  const block = restart ? blockForCycle(nextCycleIndex(cycles, sessions)) : cycle.block;
  const ranges = leverRanges({
    choice,
    calc,
    window,
    sex: profile?.sex ?? null,
    heightCm: profile?.heightCm ?? null,
    block,
    trainingDays: trainingDaysOrDefault(program?.trainingDays),
    choices: Object.fromEntries(choices.map((c) => [c.slotKey, c.exerciseId])),
  });
  const brief = await loadBrief(today);
  const prompt = proposalPrompt({ event, reason, restart, choice, ranges, window, brief, name: exName });
  return { window, ranges, prompt };
}

export async function createRequest(cycle: CycleRecord, choice: GoalChoice, event: PlanChange['event'], reason: PlanChange['reason'], restart: boolean, p: Prepared): Promise<number> {
  return addPlanChange({ at: Date.now(), cycle: cycle.index, event, reason, restart, choice, status: 'waiting', prompt: p.prompt, jobId: null, ranges: p.ranges, proposal: null, accepted: null, undo: null, appliedAt: null });
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

async function subscription(): Promise<StoredSubscription | null> {
  const v = (await db.meta.get(META.restAlertSub))?.value;
  return v && typeof v === 'object' ? (v as StoredSubscription) : null;
}

export type SendOutcome = 'ready' | 'queued' | 'offline' | 'failed' | 'noAi';

function accept(pc: PlanChange, text: string | unknown, source: GoalProposalRecord['source']): GoalProposalRecord {
  if (!pc.ranges) throw new Error('no ranges');
  const raw = typeof text === 'string' ? extractJson(text) : text;
  return parseProposal(raw, pc.ranges, source, Date.now());
}

/**
 * Sends (or re-sends) a waiting request: cloud first, queued if every free model is busy; else this
 * device's key. Offline: stays waiting and goes out when the app is back online.
 */
export async function sendRequest(id: number): Promise<SendOutcome> {
  const pc = await db.planChanges.get(id);
  if (!pc || (pc.status !== 'waiting' && pc.status !== 'ready')) return 'failed';
  if (!online()) return 'offline';
  const profile = await db.profile.get('me');
  const paired = !!cloudUrl() && !!(await cloudToken());
  try {
    if (paired) {
      try {
        const r = await askCloud(pc.prompt, { queue: true, subscription: await subscription() });
        if (r.status === 'queued') {
          await updatePlanChange(id, { jobId: r.jobId, failed: false, status: 'waiting' });
          return 'queued';
        }
        await updatePlanChange(id, { proposal: accept(pc, r.text, { kind: 'gemini-cloud', model: r.model || null }), status: 'ready', failed: false });
        return 'ready';
      } catch (e) {
        if (!profile?.geminiKey) throw e;
      }
    }
    if (!profile?.geminiKey) return 'noAi';
    const { coachCheckinWithGemini, DEFAULT_GEMINI_MODEL, normalizeModel } = await import('../../services/foodAnalysis/gemini');
    const model = normalizeModel(profile.geminiModel ?? DEFAULT_GEMINI_MODEL);
    const raw = await coachCheckinWithGemini({ apiKey: profile.geminiKey, model, text: pc.prompt });
    await updatePlanChange(id, { proposal: accept(pc, raw, { kind: 'gemini-device', model }), status: 'ready', failed: false });
    return 'ready';
  } catch {
    if (!online()) return 'offline';
    await updatePlanChange(id, { failed: true });
    return 'failed';
  }
}

/** A queued cloud request: picks up the answer if it's in. */
export async function resumeWaiting(id: number): Promise<SendOutcome | 'waiting'> {
  const pc = await db.planChanges.get(id);
  if (!pc || pc.status !== 'waiting') return 'failed';
  if (!pc.jobId) return pc.failed ? 'failed' : sendRequest(id);
  if (!online()) return 'offline';
  try {
    const r = await cloudJob(pc.jobId);
    if (r.status === 'waiting') return 'waiting';
    if (r.status === 'ok') {
      await updatePlanChange(id, { proposal: accept(pc, r.text, { kind: 'gemini-cloud', model: r.model || null }), status: 'ready', jobId: null, failed: false });
      return 'ready';
    }
    await updatePlanChange(id, { jobId: null, failed: true });
    return 'failed';
  } catch {
    return 'waiting';
  }
}

/** "Ask Philip in Claude": the reply pasted back. Same validation as Gemini. */
export async function pasteReply(id: number, text: string): Promise<boolean> {
  const pc = await db.planChanges.get(id);
  if (!pc) return false;
  try {
    await updatePlanChange(id, { proposal: accept(pc, text, { kind: 'claude-paste', model: null }), status: 'ready', jobId: null, failed: false });
    return true;
  } catch {
    return false;
  }
}

