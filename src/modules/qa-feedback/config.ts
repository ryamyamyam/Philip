import type { AiProvider } from './ai/provider';
import type { TranscriptionProvider } from './transcription';
import type { TechnicalContext } from './types';

/**
 * Everything the module needs from its host application.
 * To reuse the module elsewhere, copy the folder and write one of these.
 */
export interface QaFeedbackConfig {
  /** Stable id of the host app; the default project is created with this appId. */
  appId: string;
  /** Human-readable app name used in generated prompts. */
  appName: string;
  appVersion?: string;
  /** One or two sentences of context for Claude Code (stack, purpose). Keep it factual. */
  appDescription?: string;
  /** Name of the project created on first run. Defaults to appName. */
  defaultProjectName?: string;
  /** IndexedDB database name. Defaults to "qa-feedback". */
  dbName?: string;
  /** Host user identity, if the host has accounts. */
  getUserId?: () => string | null;
  /** Extra context captured with each observation (e.g. the current screen). */
  getContext?: () => Partial<TechnicalContext>;
  /** Optional AI provider. When null/undefined every AI action is hidden. */
  ai?: AiProvider | null;
  /** Speech-to-text. Defaults to the browser's Web Speech API when available. Pass null to disable. */
  transcription?: TranscriptionProvider | null;
  speechLang?: string;
  /** Per-file limit for screenshots. Default 15 MB. */
  maxAttachmentBytes?: number;
  /** Default 10. */
  maxAttachmentsPerObservation?: number;
  /** Show the floating capture button on every screen (the user can hide it). Default true. */
  floatingButton?: boolean;
}

export const DEFAULT_MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const DEFAULT_MAX_ATTACHMENTS = 10;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif'] as const;
