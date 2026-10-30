import Dexie, { type EntityTable } from 'dexie';
import type { DevelopmentPrompt, MetaRow, Observation, QaProject, ScreenshotAttachment, StoredFile } from './types';

export const DEFAULT_DB_NAME = 'qa-feedback';

/**
 * The module's own IndexedDB database (same Dexie/IndexedDB stack as the host app).
 * Kept separate from the host's database so the host's schema, backups and
 * "delete all" are untouched, and so the module can be copied into another app as-is.
 *
 * Migrations: add `this.version(n).stores({...}).upgrade(...)` — never edit an existing version.
 * Rollback: the database can be deleted with `Dexie.delete(name)` without affecting the host.
 */
export class QaFeedbackDB extends Dexie {
  projects!: EntityTable<QaProject, 'id'>;
  observations!: EntityTable<Observation, 'id'>;
  attachments!: EntityTable<ScreenshotAttachment, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  prompts!: EntityTable<DevelopmentPrompt, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = DEFAULT_DB_NAME) {
    super(name);
    this.version(1).stores({
      projects: 'id, appId, name',
      observations: 'id, projectId, [projectId+createdAt], status, updatedAt',
      attachments: 'id, observationId, projectId',
      files: 'id',
      prompts: 'id, projectId, [projectId+generatedAt]',
      meta: 'key',
    });
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Short, human-friendly reference used in prompts (e.g. OBS-3F9A2C). */
export function shortRef(id: string): string {
  return 'OBS-' + id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
}
