/**
 * QA & Feedback Capture — persisted data model.
 * App-agnostic: nothing here knows about the host application.
 */

export const OBSERVATION_TYPES = ['bug', 'ui', 'usability', 'feature', 'optimization', 'other'] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export const STATUSES = ['new', 'reviewed', 'planned', 'inProgress', 'resolved', 'dismissed'] as const;
export type ObservationStatus = (typeof STATUSES)[number];
/** Statuses that count as "open" in the default inbox filter. */
export const OPEN_STATUSES: readonly ObservationStatus[] = ['new', 'reviewed', 'planned', 'inProgress'];

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface QaProject {
  id: string;
  name: string;
  /** Identifier of the application this project tracks (e.g. "philip"). */
  appId: string;
  description: string | null;
  createdAt: number;
}

/** The fields a user (or AI suggestion) can fill in to structure an observation. */
export const STRUCTURED_FIELDS = ['title', 'feature', 'description', 'actualBehavior', 'expectedBehavior', 'proposedSolution'] as const;
export type StructuredField = (typeof STRUCTURED_FIELDS)[number];

/** Where the app was when the observation was captured. All optional; never invented. */
export interface TechnicalContext {
  screen: string | null;
  route: string | null;
  viewport: string | null;
  userAgent: string | null;
  appVersion: string | null;
  online: boolean | null;
  extra?: Record<string, string>;
}

/** AI output for one observation. Suggestions only — never applied without the user seeing them. */
export interface AiObservationAnalysis {
  provider: string;
  model: string;
  analyzedAt: number;
  suggested: Partial<Record<StructuredField, string>> & { type?: ObservationType; priority?: Priority };
  /** Required for any suggested priority; high/critical without a reason is dropped. */
  priorityReason: string | null;
  /** Statements the user explicitly made. */
  facts: string[];
  /** Reasonable readings of the user's words that they did not state outright. */
  interpretations: string[];
  /** Information needed to act that the observation does not contain. */
  unknowns: string[];
}

export interface Observation {
  id: string;
  projectId: string;
  /** Host-provided user identity, if the host has one. */
  userId: string | null;
  title: string;
  feature: string;
  type: ObservationType;
  /** The user's words as saved. Never changed after creation. */
  originalText: string;
  /** Raw speech-recognizer output if voice was used and differed from originalText. Never changed. */
  rawTranscript: string | null;
  captureMethod: 'voice' | 'text';
  description: string;
  actualBehavior: string;
  expectedBehavior: string;
  proposedSolution: string;
  priority: Priority | null;
  status: ObservationStatus;
  tags: string[];
  notes: string;
  technicalContext: TechnicalContext | null;
  aiAnalysis: AiObservationAnalysis | null;
  /** Structured fields whose current value came from an AI suggestion and hasn't been edited since. */
  aiFields: StructuredField[];
  attachmentCount: number;
  promptIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AiScreenshotAnalysis {
  provider: string;
  model: string;
  analyzedAt: number;
  summary: string;
  visibleText: string[];
  uiElements: string[];
  possibleIssues: string[];
}

/** Metadata only. The image bytes live in the `files` table so lists never load them. */
export interface ScreenshotAttachment {
  id: string;
  observationId: string;
  projectId: string;
  fileId: string;
  fileName: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  uploadedAt: number;
  description: string;
  aiAnalysis: AiScreenshotAnalysis | null;
}

export interface StoredFile {
  id: string;
  blob: Blob;
}

export type ExportFormat = 'clipboard' | 'txt' | 'md';

export interface DevelopmentPrompt {
  id: string;
  projectId: string;
  observationIds: string[];
  /** Last generated text (template or AI-assisted). */
  generatedContent: string;
  /** What the user sees and exports; may contain their edits. */
  content: string;
  mode: 'template' | 'ai';
  generatedAt: number;
  updatedAt: number;
  exportedAt: number | null;
  exportFormat: ExportFormat | null;
  metadata: Record<string, unknown> | null;
}

export interface MetaRow {
  key: string;
  value: unknown;
}
