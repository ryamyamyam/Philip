import type { QaFeedbackDB } from './db';
import { OPEN_STATUSES, type Observation, type ObservationStatus, type ObservationType, type Priority } from './types';

export interface ObservationFilter {
  keyword?: string;
  feature?: string;
  /** 'open' = new/reviewed/planned/in progress. */
  status?: ObservationStatus | 'open' | 'all';
  priority?: Priority | 'none' | 'all';
  type?: ObservationType | 'all';
  /** Inclusive epoch-ms range on createdAt. */
  from?: number | null;
  to?: number | null;
}

const fold = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function normalizeFeature(s: string): string {
  return fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Text searched by keyword: title, original words, transcript, structured fields, notes, tags. */
function haystack(o: Observation): string {
  return fold(
    [o.title, o.originalText, o.rawTranscript ?? '', o.description, o.feature, o.actualBehavior, o.expectedBehavior, o.proposedSolution, o.notes, o.tags.join(' ')].join('\n'),
  );
}

export function matchesFilter(o: Observation, f: ObservationFilter): boolean {
  if (f.status && f.status !== 'all') {
    if (f.status === 'open' ? !OPEN_STATUSES.includes(o.status) : o.status !== f.status) return false;
  }
  if (f.priority && f.priority !== 'all') {
    if (f.priority === 'none' ? o.priority !== null : o.priority !== f.priority) return false;
  }
  if (f.type && f.type !== 'all' && o.type !== f.type) return false;
  if (f.feature && normalizeFeature(o.feature) !== normalizeFeature(f.feature)) return false;
  if (f.from != null && o.createdAt < f.from) return false;
  if (f.to != null && o.createdAt > f.to) return false;
  const kw = f.keyword ? fold(f.keyword).trim() : '';
  if (kw) {
    const h = haystack(o);
    for (const token of kw.split(/\s+/)) if (!h.includes(token)) return false;
  }
  return true;
}

/**
 * Project-scoped query, newest first. Uses the [projectId+createdAt] index for project and
 * date range; IndexedDB has no full-text index, so the remaining criteria are evaluated while
 * the cursor walks (records are never loaded from other projects).
 */
export function queryObservations(db: QaFeedbackDB, projectId: string, f: ObservationFilter = {}): Promise<Observation[]> {
  return db.observations
    .where('[projectId+createdAt]')
    .between([projectId, f.from ?? -Infinity], [projectId, f.to ?? Infinity], true, true)
    .reverse()
    .filter((o) => matchesFilter(o, { ...f, from: null, to: null }))
    .toArray();
}

/** Distinct feature/screen names used in a project, for the filter dropdown. */
export async function listFeatures(db: QaFeedbackDB, projectId: string): Promise<string[]> {
  const seen = new Map<string, string>();
  await db.observations
    .where('projectId')
    .equals(projectId)
    .each((o) => {
      const k = normalizeFeature(o.feature);
      if (k && !seen.has(k)) seen.set(k, o.feature.trim());
    });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function countObservations(db: QaFeedbackDB, projectId: string): Promise<number> {
  return db.observations.where('projectId').equals(projectId).count();
}
