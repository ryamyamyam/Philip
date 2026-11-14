/**
 * Undo / redo for the capture text box (OBS-18D928). Pure and framework-free so it stays portable
 * with the module. Typing within GROUP_MS of the last edit joins one step (so Undo removes a burst of
 * typing, not one letter); a dictation run is one step; a checkpoint closes the current step.
 */
export interface TextHistory {
  past: string[];
  present: string;
  future: string[];
  /** Time of the last edit (ms). */
  at: number;
  /** Whether the next edit may join the current step. */
  open: boolean;
}

export const GROUP_MS = 1000;
export const HISTORY_LIMIT = 100;

export function initHistory(text = ''): TextHistory {
  return { past: [], present: text, future: [], at: 0, open: false };
}

/** A new text value. `merge` joins the current step regardless of time (used while dictating). */
export function editHistory(h: TextHistory, next: string, now: number, merge = false): TextHistory {
  if (next === h.present) return h;
  const join = h.open && (merge || now - h.at < GROUP_MS);
  const past = join ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], at: now, open: true };
}

/** Ends the current step, so the next edit starts a new one (e.g. when dictation starts). */
export function checkpoint(h: TextHistory): TextHistory {
  return h.open ? { ...h, open: false } : h;
}

export const canUndo = (h: TextHistory): boolean => h.past.length > 0;
export const canRedo = (h: TextHistory): boolean => h.future.length > 0;

export function undo(h: TextHistory): TextHistory {
  if (!canUndo(h)) return h;
  const prev = h.past[h.past.length - 1] ?? '';
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], at: 0, open: false };
}

export function redo(h: TextHistory): TextHistory {
  if (!canRedo(h)) return h;
  const [next = '', ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest, at: 0, open: false };
}
