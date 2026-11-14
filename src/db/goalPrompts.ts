/** Story 11: which goal events were already shown (tiny and eager: the watcher runs on every screen). */
import { db, type PhilipDB } from './db';
import { META } from './repo';
import type { FiredPrompt } from '../lib/goal/goalCheck';

export async function firedPrompts(database: PhilipDB = db): Promise<FiredPrompt[]> {
  const v = (await database.meta.get(META.goalPrompts))?.value;
  return Array.isArray(v) ? (v as FiredPrompt[]) : [];
}

/** Marks a goal event as shown, so it doesn't pop up again for this cycle. */
export async function markPromptFired(p: FiredPrompt, database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', database.meta, async () => {
    const list = await firedPrompts(database);
    if (list.some((f) => f.cycle === p.cycle && f.kind === p.kind && f.reason === p.reason)) return;
    await database.meta.put({ key: META.goalPrompts, value: [...list, p].slice(-60) });
  });
}

