/**
 * All reads and writes for the module. Every observation/attachment/prompt operation takes a
 * projectId and refuses records from another project (project isolation).
 */
import { newId, type QaFeedbackDB } from './db';
import {
  OBSERVATION_TYPES,
  PRIORITIES,
  STATUSES,
  STRUCTURED_FIELDS,
  type AiObservationAnalysis,
  type AiScreenshotAnalysis,
  type DevelopmentPrompt,
  type ExportFormat,
  type Observation,
  type ObservationType,
  type Priority,
  type QaProject,
  type ScreenshotAttachment,
  type StructuredField,
  type TechnicalContext,
} from './types';
import { ACCEPTED_IMAGE_TYPES, DEFAULT_MAX_ATTACHMENT_BYTES, DEFAULT_MAX_ATTACHMENTS } from './config';

export class QaError extends Error {
  constructor(
    readonly code: 'notFound' | 'wrongProject' | 'invalidFile' | 'fileTooLarge' | 'tooManyFiles' | 'invalid',
    detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'QaError';
  }
}

const MAX_TEXT = 20_000;
const MAX_SHORT = 300;
const clip = (s: string | null | undefined, max = MAX_TEXT) => (s ?? '').slice(0, max);
const clean = (s: string | null | undefined, max = MAX_TEXT) => clip(s, max).trim();

/* ---------------- Projects ---------------- */

export function listProjects(db: QaFeedbackDB): Promise<QaProject[]> {
  return db.projects.orderBy('name').toArray();
}

export async function createProject(
  db: QaFeedbackDB,
  input: { name: string; appId?: string; description?: string | null },
): Promise<QaProject> {
  const name = clean(input.name, 120);
  if (!name) throw new QaError('invalid', 'Project name is required');
  const project: QaProject = {
    id: newId(),
    name,
    appId: clean(input.appId ?? slug(name), 120) || slug(name),
    description: input.description ? clean(input.description, 2000) : null,
    createdAt: Date.now(),
  };
  await db.projects.add(project);
  return project;
}

export async function renameProject(db: QaFeedbackDB, id: string, name: string): Promise<void> {
  const n = clean(name, 120);
  if (!n) throw new QaError('invalid', 'Project name is required');
  const count = await db.projects.update(id, { name: n });
  if (!count) throw new QaError('notFound');
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
}

/** Returns the project for this appId, creating it on first run. */
export async function ensureDefaultProject(db: QaFeedbackDB, appId: string, name: string): Promise<QaProject> {
  return db.transaction('rw', db.projects, async () => {
    const existing = await db.projects.where('appId').equals(appId).first();
    if (existing) return existing;
    const project: QaProject = { id: newId(), name: clean(name, 120) || appId, appId, description: null, createdAt: Date.now() };
    await db.projects.add(project);
    return project;
  });
}

export async function getMetaValue<T>(db: QaFeedbackDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMetaValue(db: QaFeedbackDB, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/* ---------------- Observations ---------------- */

export interface NewObservation {
  originalText: string;
  rawTranscript?: string | null;
  captureMethod?: 'voice' | 'text';
  title?: string;
  feature?: string;
  type?: ObservationType;
  description?: string;
  actualBehavior?: string;
  expectedBehavior?: string;
  proposedSolution?: string;
  priority?: Priority | null;
  tags?: string[];
  notes?: string;
  technicalContext?: TechnicalContext | null;
  aiAnalysis?: AiObservationAnalysis | null;
  aiFields?: StructuredField[];
  userId?: string | null;
}

/** Simple non-AI title: the first sentence or ~10 words of what the user said. */
export function defaultTitle(text: string): string {
  const firstLine = text.trim().split(/(?<=[.!?])\s|\n/)[0] ?? '';
  const words = firstLine.split(/\s+/).filter(Boolean);
  const t = words.slice(0, 10).join(' ');
  return (words.length > 10 ? t + '…' : t).replace(/[.!?]+$/, '').slice(0, 120);
}

function normTags(tags: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const t = clean(raw, 40).toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

/** Saves an observation. Works with nothing but text (or even empty text when screenshots follow). */
export async function createObservation(db: QaFeedbackDB, projectId: string, input: NewObservation): Promise<Observation> {
  const project = await db.projects.get(projectId);
  if (!project) throw new QaError('notFound', 'Project not found');
  const originalText = clip(input.originalText);
  const raw = input.rawTranscript != null ? clip(input.rawTranscript) : null;
  const now = Date.now();
  const obs: Observation = {
    id: newId(),
    projectId,
    userId: input.userId ?? null,
    title: clean(input.title, MAX_SHORT) || defaultTitle(originalText) || 'Untitled observation',
    feature: clean(input.feature, MAX_SHORT),
    type: input.type && OBSERVATION_TYPES.includes(input.type) ? input.type : 'other',
    originalText,
    rawTranscript: raw && raw.trim() !== originalText.trim() ? raw : null,
    captureMethod: input.captureMethod ?? 'text',
    description: clean(input.description),
    actualBehavior: clean(input.actualBehavior),
    expectedBehavior: clean(input.expectedBehavior),
    proposedSolution: clean(input.proposedSolution),
    priority: input.priority && PRIORITIES.includes(input.priority) ? input.priority : null,
    status: 'new',
    tags: normTags(input.tags),
    notes: clean(input.notes),
    technicalContext: input.technicalContext ?? null,
    aiAnalysis: input.aiAnalysis ?? null,
    aiFields: (input.aiFields ?? []).filter((f) => STRUCTURED_FIELDS.includes(f)),
    attachmentCount: 0,
    promptIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.observations.add(obs);
  return obs;
}

export async function getObservation(db: QaFeedbackDB, projectId: string, id: string): Promise<Observation | undefined> {
  const o = await db.observations.get(id);
  return o && o.projectId === projectId ? o : undefined;
}

export type ObservationChanges = Partial<
  Pick<
    Observation,
    | 'title'
    | 'feature'
    | 'type'
    | 'description'
    | 'actualBehavior'
    | 'expectedBehavior'
    | 'proposedSolution'
    | 'priority'
    | 'status'
    | 'tags'
    | 'notes'
    | 'aiAnalysis'
    | 'aiFields'
  >
>;

/** Updates editable fields. originalText, rawTranscript, projectId and createdAt can never change. */
export async function updateObservation(
  db: QaFeedbackDB,
  projectId: string,
  id: string,
  changes: ObservationChanges,
): Promise<Observation> {
  return db.transaction('rw', db.observations, async () => {
    const existing = await db.observations.get(id);
    if (!existing) throw new QaError('notFound');
    if (existing.projectId !== projectId) throw new QaError('wrongProject');
    const next: Observation = { ...existing, updatedAt: Date.now() };
    for (const f of STRUCTURED_FIELDS) {
      const v = changes[f];
      if (v !== undefined) next[f] = clean(v, f === 'title' || f === 'feature' ? MAX_SHORT : MAX_TEXT);
    }
    if (!next.title) next.title = existing.title;
    if (changes.type !== undefined && OBSERVATION_TYPES.includes(changes.type)) next.type = changes.type;
    if (changes.status !== undefined && STATUSES.includes(changes.status)) next.status = changes.status;
    if (changes.priority !== undefined) next.priority = changes.priority && PRIORITIES.includes(changes.priority) ? changes.priority : null;
    if (changes.tags !== undefined) next.tags = normTags(changes.tags);
    if (changes.notes !== undefined) next.notes = clean(changes.notes);
    if (changes.aiAnalysis !== undefined) next.aiAnalysis = changes.aiAnalysis;
    if (changes.aiFields !== undefined) next.aiFields = changes.aiFields.filter((f) => STRUCTURED_FIELDS.includes(f));
    await db.observations.put(next);
    return next;
  });
}

/** Deletes the observation and only its own attachments and files. Prompts keep their text. */
export async function deleteObservation(db: QaFeedbackDB, projectId: string, id: string): Promise<void> {
  await db.transaction('rw', [db.observations, db.attachments, db.files], async () => {
    const existing = await db.observations.get(id);
    if (!existing) return;
    if (existing.projectId !== projectId) throw new QaError('wrongProject');
    const atts = await db.attachments.where('observationId').equals(id).toArray();
    const own = atts.filter((a) => a.projectId === projectId);
    await db.files.bulkDelete(own.map((a) => a.fileId));
    await db.attachments.bulkDelete(own.map((a) => a.id));
    await db.observations.delete(id);
  });
}

/** Loads observations by id, in the given order, refusing any outside the project. */
export async function getObservationsByIds(db: QaFeedbackDB, projectId: string, ids: string[]): Promise<Observation[]> {
  const rows = await db.observations.bulkGet(ids);
  return rows.filter((o): o is Observation => !!o && o.projectId === projectId);
}

/* ---------------- Attachments ---------------- */

export interface AttachmentInput {
  blob: Blob;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface AttachmentLimits {
  maxBytes?: number;
  maxCount?: number;
}

/** Validates type and size. Throws QaError with a specific code. */
export function validateAttachment(blob: Blob, limits: AttachmentLimits = {}): void {
  const type = (blob.type || '').toLowerCase();
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)) throw new QaError('invalidFile', type || 'unknown type');
  if (blob.size <= 0) throw new QaError('invalidFile', 'empty file');
  if (blob.size > (limits.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES)) throw new QaError('fileTooLarge');
}

/** Stores the original image bytes unchanged plus metadata. */
export async function addAttachments(
  db: QaFeedbackDB,
  projectId: string,
  observationId: string,
  inputs: AttachmentInput[],
  limits: AttachmentLimits = {},
): Promise<ScreenshotAttachment[]> {
  for (const i of inputs) validateAttachment(i.blob, limits);
  return db.transaction('rw', [db.observations, db.attachments, db.files], async () => {
    const obs = await db.observations.get(observationId);
    if (!obs) throw new QaError('notFound');
    if (obs.projectId !== projectId) throw new QaError('wrongProject');
    const existing = await db.attachments.where('observationId').equals(observationId).count();
    if (existing + inputs.length > (limits.maxCount ?? DEFAULT_MAX_ATTACHMENTS)) throw new QaError('tooManyFiles');
    const now = Date.now();
    const created = inputs.map((i, n): ScreenshotAttachment => ({
      id: newId(),
      observationId,
      projectId,
      fileId: newId(),
      fileName: i.fileName ? clean(i.fileName, 200) : null,
      mimeType: i.blob.type,
      size: i.blob.size,
      width: i.width ?? null,
      height: i.height ?? null,
      uploadedAt: now + n,
      description: '',
      aiAnalysis: null,
    }));
    await db.files.bulkAdd(created.map((a, n) => ({ id: a.fileId, blob: inputs[n]!.blob })));
    await db.attachments.bulkAdd(created);
    await db.observations.update(observationId, { attachmentCount: existing + created.length, updatedAt: now });
    return created;
  });
}

export async function listAttachments(db: QaFeedbackDB, projectId: string, observationId: string): Promise<ScreenshotAttachment[]> {
  const rows = await db.attachments.where('observationId').equals(observationId).toArray();
  return rows.filter((a) => a.projectId === projectId).sort((a, b) => a.uploadedAt - b.uploadedAt);
}

export async function getAttachmentBlob(db: QaFeedbackDB, projectId: string, attachmentId: string): Promise<Blob | undefined> {
  const a = await db.attachments.get(attachmentId);
  if (!a || a.projectId !== projectId) return undefined;
  return (await db.files.get(a.fileId))?.blob;
}

export async function updateAttachment(
  db: QaFeedbackDB,
  projectId: string,
  attachmentId: string,
  changes: { description?: string; aiAnalysis?: AiScreenshotAnalysis | null },
): Promise<void> {
  const a = await db.attachments.get(attachmentId);
  if (!a) throw new QaError('notFound');
  if (a.projectId !== projectId) throw new QaError('wrongProject');
  await db.attachments.update(attachmentId, {
    ...(changes.description !== undefined ? { description: clean(changes.description, 2000) } : {}),
    ...(changes.aiAnalysis !== undefined ? { aiAnalysis: changes.aiAnalysis } : {}),
  });
}

export async function removeAttachment(db: QaFeedbackDB, projectId: string, attachmentId: string): Promise<void> {
  await db.transaction('rw', [db.observations, db.attachments, db.files], async () => {
    const a = await db.attachments.get(attachmentId);
    if (!a) return;
    if (a.projectId !== projectId) throw new QaError('wrongProject');
    await db.files.delete(a.fileId);
    await db.attachments.delete(attachmentId);
    const remaining = await db.attachments.where('observationId').equals(a.observationId).count();
    await db.observations.update(a.observationId, { attachmentCount: remaining, updatedAt: Date.now() });
  });
}

/* ---------------- Development prompts ---------------- */

export async function savePrompt(
  db: QaFeedbackDB,
  projectId: string,
  input: { observationIds: string[]; content: string; mode: 'template' | 'ai'; metadata?: Record<string, unknown> | null },
): Promise<DevelopmentPrompt> {
  return db.transaction('rw', [db.prompts, db.observations], async () => {
    const obs = await db.observations.bulkGet(input.observationIds);
    if (obs.some((o) => !o || o.projectId !== projectId)) throw new QaError('wrongProject', 'Every observation must belong to the project');
    const now = Date.now();
    const p: DevelopmentPrompt = {
      id: newId(),
      projectId,
      observationIds: [...input.observationIds],
      generatedContent: input.content,
      content: input.content,
      mode: input.mode,
      generatedAt: now,
      updatedAt: now,
      exportedAt: null,
      exportFormat: null,
      metadata: input.metadata ?? null,
    };
    await db.prompts.add(p);
    for (const o of obs) {
      if (o && !o.promptIds.includes(p.id)) await db.observations.update(o.id, { promptIds: [...o.promptIds, p.id] });
    }
    return p;
  });
}

/** Replaces the generated text of an existing prompt (explicit regenerate). */
export async function regeneratePrompt(
  db: QaFeedbackDB,
  projectId: string,
  id: string,
  input: { content: string; mode: 'template' | 'ai'; metadata?: Record<string, unknown> | null },
): Promise<void> {
  const p = await db.prompts.get(id);
  if (!p) throw new QaError('notFound');
  if (p.projectId !== projectId) throw new QaError('wrongProject');
  const now = Date.now();
  await db.prompts.update(id, {
    generatedContent: input.content,
    content: input.content,
    mode: input.mode,
    generatedAt: now,
    updatedAt: now,
    metadata: input.metadata ?? null,
  });
}

export async function updatePromptContent(db: QaFeedbackDB, projectId: string, id: string, content: string): Promise<void> {
  const p = await db.prompts.get(id);
  if (!p) throw new QaError('notFound');
  if (p.projectId !== projectId) throw new QaError('wrongProject');
  await db.prompts.update(id, { content, updatedAt: Date.now() });
}

export async function markPromptExported(db: QaFeedbackDB, projectId: string, id: string, format: ExportFormat): Promise<void> {
  const p = await db.prompts.get(id);
  if (!p || p.projectId !== projectId) return;
  await db.prompts.update(id, { exportedAt: Date.now(), exportFormat: format });
}

export async function getPrompt(db: QaFeedbackDB, projectId: string, id: string): Promise<DevelopmentPrompt | undefined> {
  const p = await db.prompts.get(id);
  return p && p.projectId === projectId ? p : undefined;
}

export function recentPrompts(db: QaFeedbackDB, projectId: string, limit = 5): Promise<DevelopmentPrompt[]> {
  return db.prompts
    .where('[projectId+generatedAt]')
    .between([projectId, -Infinity], [projectId, Infinity])
    .reverse()
    .limit(limit)
    .toArray();
}
