/**
 * A question another screen hands to Ask Philip (OBS-3037F2: "Ask Philip about this weigh-in").
 * In-memory only: Ask reads it once when it opens and pre-fills its text box; nothing is sent until
 * the owner taps Send.
 */
let draft: string | null = null;

export function setAskDraft(text: string): void {
  draft = text.trim() || null;
}

export function takeAskDraft(): string | null {
  const d = draft;
  draft = null;
  return d;
}
