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
  permission: 'Microphone access was denied. Allow it in your browser settings, or type instead (the keyboard’s mic key also works).',
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
