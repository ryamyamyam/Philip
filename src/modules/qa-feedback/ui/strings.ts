/**
 * English UI text for the module. Kept inside the module (not the host's i18n catalog) so the
 * folder can be copied to another app; translate by editing or replacing this file.
 */
import type { AiErrorCode } from '../ai/provider';
import type { QaError } from '../repository';
import type { TranscriptionErrorCode } from '../transcription';
import type { ObservationStatus, ObservationType, Priority } from '../types';

export const TYPE_LABELS: Record<ObservationType, string> = {
  bug: 'Bug',
  ui: 'UI issue',
  usability: 'Usability',
  feature: 'Feature request',
  optimization: 'Optimization',
  other: 'Other',
};

export const STATUS_LABELS: Record<ObservationStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  planned: 'Planned',
  inProgress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

/** Archive after a prompt is copied/exported (OBS-CDDDEC). */
export const ARCHIVE_TEXT = {
  filter: 'Archived',
  badge: 'Archived',
  archived: (n: number) => `${n} observation${n === 1 ? '' : 's'} archived`,
  undo: 'Undo',
  unarchive: 'Unarchive',
  unarchived: 'Unarchived',
  detailNote: (when: string) => `Archived ${when}, after a prompt was generated from it.`,
  detailNoteManual: (when: string) => `Archived ${when}.`,
  archive: 'Archive',
  archiveIncluded: (n: number) => `Archive the ${n} in this prompt`,
  archiveSelected: (n: number) => `Archive ${n}`,
  unarchiveSelected: (n: number) => `Unarchive ${n}`,
  unarchivedN: (n: number) => `${n} observation${n === 1 ? '' : 's'} unarchived`,
  inPrompt: 'In a prompt',
  inPromptHint: 'Already turned into a prompt. Archive it when you’re done with it.',
  tab: (n: number | null) => `Inbox${n != null ? ` (${n})` : ''}`,
  activeN: (n: number | null) => `Active${n != null ? ` · ${n}` : ''}`,
  archivedN: (n: number | null) => `Archived${n != null ? ` · ${n}` : ''}`,
  askTitle: 'Do you want to archive the suggestions included in this prompt?',
  askBody: (n: number) =>
    `${n} suggestion${n === 1 ? '' : 's'} will leave the active list. You can still review ${n === 1 ? 'it' : 'them'} under Archived, by date.`,
  askConfirm: 'Archive',
  askCancel: 'Keep active',
  active: 'Active',
  archivedOn: (day: string) => `Archived ${day}`,
  emptyActive: 'Nothing waiting. Capture a bug or idea first.',
  emptyArchived: 'Nothing archived yet.',
} as const;

/** Day heading for grouping archived observations. */
export function fmtDay(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms));
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const AI_ERRORS: Record<AiErrorCode, string> = {
  notConfigured: 'AI is not set up. Add an API key in Settings.',
  invalidKey: 'The AI provider rejected the API key.',
  rateLimited: 'The free-tier limit was reached. Try again in a bit.',
  modelUnavailable: 'The selected AI model is not available for this key.',
  network: 'No connection to the AI provider.',
  timeout: 'The AI provider took too long to answer.',
  blocked: 'The AI provider declined this request.',
  invalidResponse: 'The AI answer could not be read. Nothing was changed.',
  server: 'The AI provider had a server error. Try again later.',
};

export const SPEECH_ERRORS: Record<TranscriptionErrorCode, string> = {
  permission:
    'Microphone access is blocked, so voice can’t record. To turn it back on: on iPhone open Settings → Apps → Safari → Microphone and choose Ask or Allow (in Safari you can also use the aA menu → Website Settings), then close and reopen the app. Meanwhile, type below — the keyboard’s mic key also dictates.',
  notStarted:
    'The microphone didn’t start. If you tapped Don’t Allow earlier, allow the microphone (iPhone: Settings → Apps → Safari → Microphone), then close and reopen the app. You can type below in the meantime.',
  noSpeech: 'No speech was heard. Try again or type instead.',
  network: 'Voice input needs a connection. Type instead — your keyboard’s dictation key may still work.',
  audioCapture: 'No microphone was found.',
  unsupported: 'Voice input isn’t available in this browser. Type instead, or use your keyboard’s dictation key.',
  aborted: 'Recording stopped.',
  unknown: 'Voice input stopped unexpectedly. What was heard so far is kept.',
};

export function fileErrorMessage(e: QaError, maxMb: number, maxCount: number): string {
  switch (e.code) {
    case 'invalidFile':
      return 'Only image files (PNG, JPEG, WebP, GIF, HEIC) can be attached.';
    case 'fileTooLarge':
      return `Each screenshot must be ${maxMb} MB or smaller.`;
    case 'tooManyFiles':
      return `Up to ${maxCount} screenshots per observation.`;
    default:
      return 'The screenshot could not be saved.';
  }
}

export function fmtWhen(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}
