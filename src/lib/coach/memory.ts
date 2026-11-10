/**
 * Story 9: how Philip asks the app to remember something, and the Ask Philip prompt. Pure.
 * Gemini may add `"remember": [..]` to any coaching reply; the app keeps at most two short notes
 * per reply (MEMORY.noteChars) and the owner can delete them in Settings › Philip's memory.
 */
import type { CoachChatMessage } from '../../db/types';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

export const REMEMBER_MAX = 2;
export const REMEMBER_CHARS = 140;

/** One rule line every coaching prompt carries. */
export const REMEMBER_RULE =
  'Optional "remember": a list of 0 to 2 short new facts worth keeping for future sessions (an injury or pain spot, equipment the gym lacks, a stated preference, a schedule limit, a goal). Only what the lifter said or the log shows; never guesses, never body judgments; skip anything already in your notes.';

/** The remember list from a raw Gemini reply: trimmed, emoji-free, deduped, at most REMEMBER_MAX. */
export function parseRemember(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const list = (raw as Record<string, unknown>).remember;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string') continue;
    const s = x.replace(EMOJI, '').replace(/\s+/g, ' ').trim().slice(0, REMEMBER_CHARS);
    if (s.length < 4 || out.some((o) => o.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length >= REMEMBER_MAX) break;
  }
  return out;
}

/** Ask Philip: chat turns sent back as history. */
export const ASK_HISTORY = 10;

/** Prompt for a question outside a workout. Advice only: plan changes are made from a workout report. */
export function askPrompt(brief: string, history: readonly CoachChatMessage[], question: string): string {
  const past = history
    .slice(-ASK_HISTORY)
    .map((m) => `${m.from === 'me' ? 'Lifter' : 'Philip'}: ${m.text.slice(0, 600)}`)
    .join('\n');
  return [
    "You are Philip, the lifter's personal strength and nutrition coach: confident, dry, a little sassy, short sentences. Evidence-based; say when evidence is thin. Never insult body, weight or appearance. No emoji.",
    'Never diagnose. If anything suggests pain, injury, dizziness or chest symptoms, tell them to stop that activity and see a professional.',
    'Answer from the brief below. Use their real numbers. If the brief lacks something you need, say what to log instead of guessing.',
    'You cannot change the plan from here: for training max, rest, swaps or training days, tell them to use the report after a workout.',
    REMEMBER_RULE,
    'Reply ONLY with JSON: {"message": string (plain words, max 700 chars), "remember": [string]}.',
    '',
    brief,
    '',
    past ? `This conversation so far:\n${past}` : '',
    `Lifter: ${question.slice(0, 1000)}`,
  ]
    .filter((l, idx, a) => l !== '' || a[idx - 1] !== '')
    .join('\n');
}

/** Philip's answer from a raw reply; null when there's no usable message. */
export function parseAskReply(raw: unknown): { message: string; remember: string[] } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = (raw as Record<string, unknown>).message;
  const message = typeof m === 'string' ? m.replace(EMOJI, '').trim().slice(0, 800) : '';
  if (!message) return null;
  return { message, remember: parseRemember(raw) };
}
