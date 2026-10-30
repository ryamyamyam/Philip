/**
 * Explainable, editable grouping of selected observations for one development prompt.
 * Default rule (no AI): observations are grouped only when they name the same feature/screen.
 * Everything else stays separate. The user can move any observation between groups.
 */
import type { BatchAnalysis } from '../ai/analysis';
import { normalizeFeature } from '../search';
import type { Observation } from '../types';

export interface GroupMeta {
  label: string;
  reason: string;
  source: 'feature' | 'single' | 'ai' | 'manual';
}

export interface GroupPlan {
  /** observationId → group key */
  assignments: Record<string, string>;
  meta: Record<string, GroupMeta>;
  /** Observations the user moved by hand. */
  manual: string[];
}

export interface PromptGroup extends GroupMeta {
  key: string;
  observationIds: string[];
}

const soloKey = (id: string) => `solo:${id}`;

export function planFromFeatures(observations: Observation[]): GroupPlan {
  const plan: GroupPlan = { assignments: {}, meta: {}, manual: [] };
  const byFeature = new Map<string, Observation[]>();
  for (const o of observations) {
    const f = normalizeFeature(o.feature);
    if (!f) continue;
    byFeature.set(f, [...(byFeature.get(f) ?? []), o]);
  }
  for (const o of observations) {
    const f = normalizeFeature(o.feature);
    const members = f ? byFeature.get(f)! : [];
    if (members.length > 1) {
      const key = `feature:${f}`;
      plan.assignments[o.id] = key;
      plan.meta[key] ??= {
        label: members[0]!.feature.trim(),
        reason: `All ${members.length} observations name the same feature/screen (“${members[0]!.feature.trim()}”). They may still need separate fixes.`,
        source: 'feature',
      };
    } else {
      plan.assignments[o.id] = soloKey(o.id);
      plan.meta[soloKey(o.id)] = { label: o.title, reason: 'Independent — no other selected observation names the same feature/screen.', source: 'single' };
    }
  }
  return plan;
}

export function planFromAi(batch: BatchAnalysis, observations: Observation[]): GroupPlan {
  const plan: GroupPlan = { assignments: {}, meta: {}, manual: [] };
  batch.groups.forEach((g, i) => {
    const key = g.observationIds.length > 1 ? `ai:${i}` : soloKey(g.observationIds[0]!);
    for (const id of g.observationIds) plan.assignments[id] = key;
    plan.meta[key] = { label: g.title, reason: `AI-suggested: ${g.relationship}`, source: g.observationIds.length > 1 ? 'ai' : 'single' };
  });
  for (const o of observations) {
    if (!plan.assignments[o.id]) {
      plan.assignments[o.id] = soloKey(o.id);
      plan.meta[soloKey(o.id)] = { label: o.title, reason: 'Independent.', source: 'single' };
    }
  }
  return plan;
}

/** Moves one observation into another group, or into its own group with target "solo". */
export function moveObservation(plan: GroupPlan, obs: Observation, target: string): GroupPlan {
  const key = target === 'solo' ? soloKey(obs.id) : target;
  const next: GroupPlan = {
    assignments: { ...plan.assignments, [obs.id]: key },
    meta: { ...plan.meta },
    manual: plan.manual.includes(obs.id) ? plan.manual : [...plan.manual, obs.id],
  };
  if (target === 'solo') next.meta[key] = { label: obs.title, reason: 'Kept separate by you.', source: 'manual' };
  return next;
}

/** Groups in the order their first member appears in `observations`. Every observation lands in exactly one group. */
export function resolveGroups(plan: GroupPlan, observations: Observation[]): PromptGroup[] {
  const groups = new Map<string, PromptGroup>();
  for (const o of observations) {
    const key = plan.assignments[o.id] ?? soloKey(o.id);
    let g = groups.get(key);
    if (!g) {
      const meta = plan.meta[key] ?? { label: o.title, reason: 'Independent.', source: 'single' as const };
      g = { key, ...meta, observationIds: [] };
      groups.set(key, g);
    }
    g.observationIds.push(o.id);
  }
  for (const g of groups.values()) {
    if (g.observationIds.length === 1 && g.source !== 'manual') {
      const only = observations.find((o) => o.id === g.observationIds[0])!;
      if (g.source !== 'single') Object.assign(g, { label: only.title, reason: 'Independent (other members were moved out).', source: 'single' });
    } else if (g.observationIds.some((id) => plan.manual.includes(id)) && g.observationIds.length > 1) {
      g.reason = g.source === 'single' || g.source === 'manual' ? 'Grouped by you.' : `${g.reason} Adjusted manually.`;
      g.source = 'manual';
    }
  }
  return [...groups.values()];
}
