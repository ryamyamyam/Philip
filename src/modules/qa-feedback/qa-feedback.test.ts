import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { timing, webSpeechProvider, type TranscriptionErrorCode } from './transcription';
import { QaFeedbackDB, shortRef } from './db';
import {
  QaError,
  addAttachments,
  createObservation,
  createProject,
  defaultTitle,
  deleteObservation,
  ensureDefaultProject,
  getAttachmentBlob,
  getObservation,
  listAttachments,
  removeAttachment,
  savePrompt,
  updateObservation,
  updatePromptContent,
  getPrompt,
} from './repository';
import { listFeatures, matchesFilter, queryObservations } from './search';
import { moveObservation, planFromAi, planFromFeatures, resolveGroups } from './prompt/grouping';
import { buildDevelopmentPrompt } from './prompt/template';
import { validateBatch, validateScreenshot, validateStructure } from './ai/analysis';
import { createGeminiProvider, mapGeminiHttpError } from './ai/gemini';
import { AiError, extractJsonObject } from './ai/provider';
import type { Observation } from './types';

let n = 0;
async function fresh() {
  const db = new QaFeedbackDB(`qa-test-${Date.now()}-${n++}`);
  await db.open();
  const project = await ensureDefaultProject(db, 'philip', 'Philip');
  return { db, project };
}
const png = (bytes = 10) => new Blob([new Uint8Array(bytes)], { type: 'image/png' });

describe('projects', () => {
  it('creates the default project once and supports more projects', async () => {
    const { db, project } = await fresh();
    const again = await ensureDefaultProject(db, 'philip', 'Philip');
    expect(again.id).toBe(project.id);
    const other = await createProject(db, { name: 'Other App' });
    expect(other.appId).toBe('other-app');
    await expect(createProject(db, { name: '  ' })).rejects.toBeInstanceOf(QaError);
    expect(await db.projects.count()).toBe(2);
  });
});

describe('observations', () => {
  it('saves incomplete observations with simple defaults and no AI', async () => {
    const { db, project } = await fresh();
    const o = await createObservation(db, project.id, { originalText: 'The save button on the targets screen is hidden behind the tab bar when the keyboard is open' });
    expect(o.title).toBe('The save button on the targets screen is hidden behind…');
    expect(o.type).toBe('other');
    expect(o.priority).toBeNull();
    expect(o.status).toBe('new');
    const empty = await createObservation(db, project.id, { originalText: '' });
    expect(empty.title).toBe('Untitled observation');
    expect(await getObservation(db, project.id, o.id)).toMatchObject({ originalText: o.originalText });
  });

  it('keeps the original text and raw transcript when fields are edited', async () => {
    const { db, project } = await fresh();
    const o = await createObservation(db, project.id, {
      originalText: 'calorie ring overlaps the date',
      rawTranscript: 'calorie ring over laps the date',
      captureMethod: 'voice',
    });
    expect(o.rawTranscript).toBe('calorie ring over laps the date');
    const changes = { description: 'Ring overlaps date header', priority: 'high' as const, status: 'reviewed' as const, title: 'Ring overlap' };
    await updateObservation(db, project.id, o.id, { ...changes, originalText: 'hacked' } as never);
    const after = (await getObservation(db, project.id, o.id))!;
    expect(after.originalText).toBe('calorie ring overlaps the date');
    expect(after.rawTranscript).toBe('calorie ring over laps the date');
    expect(after).toMatchObject(changes);
    expect(after.updatedAt).toBeGreaterThanOrEqual(o.updatedAt);
  });

  it('drops an identical raw transcript', async () => {
    const { db, project } = await fresh();
    const o = await createObservation(db, project.id, { originalText: 'same', rawTranscript: ' same ' });
    expect(o.rawTranscript).toBeNull();
  });

  it('enforces project isolation', async () => {
    const { db, project } = await fresh();
    const other = await createProject(db, { name: 'Other' });
    const o = await createObservation(db, project.id, { originalText: 'mine' });
    expect(await getObservation(db, other.id, o.id)).toBeUndefined();
    await expect(updateObservation(db, other.id, o.id, { title: 'x' })).rejects.toMatchObject({ code: 'wrongProject' });
    await expect(deleteObservation(db, other.id, o.id)).rejects.toMatchObject({ code: 'wrongProject' });
    await expect(addAttachments(db, other.id, o.id, [{ blob: png() }])).rejects.toMatchObject({ code: 'wrongProject' });
    await expect(savePrompt(db, other.id, { observationIds: [o.id], content: 'x', mode: 'template' })).rejects.toMatchObject({ code: 'wrongProject' });
    expect(await queryObservations(db, other.id)).toHaveLength(0);
    expect(await queryObservations(db, project.id)).toHaveLength(1);
  });
});

describe('attachments', () => {
  it('stores multiple screenshots per observation unchanged and keeps them on edit', async () => {
    const { db, project } = await fresh();
    const a = await createObservation(db, project.id, { originalText: 'a' });
    const b = await createObservation(db, project.id, { originalText: 'b' });
    const blob = png(32);
    const added = await addAttachments(db, project.id, a.id, [{ blob, fileName: 'one.png', width: 390, height: 844 }, { blob: png(16) }]);
    await addAttachments(db, project.id, b.id, [{ blob: png(8) }]);
    expect(added).toHaveLength(2);
    expect((await getObservation(db, project.id, a.id))!.attachmentCount).toBe(2);
    await updateObservation(db, project.id, a.id, { title: 'edited' });
    const listed = await listAttachments(db, project.id, a.id);
    expect(listed.map((x) => x.fileName)).toEqual(['one.png', null]);
    const stored = await getAttachmentBlob(db, project.id, listed[0]!.id);
    expect(stored?.size).toBe(32);
    expect(stored?.type).toBe('image/png');

    await removeAttachment(db, project.id, listed[1]!.id);
    expect((await getObservation(db, project.id, a.id))!.attachmentCount).toBe(1);

    // Deleting observation A removes only A's attachments and files.
    await deleteObservation(db, project.id, a.id);
    expect(await db.attachments.count()).toBe(1);
    expect(await db.files.count()).toBe(1);
    expect((await listAttachments(db, project.id, b.id))).toHaveLength(1);
  });

  it('validates type, size and count', async () => {
    const { db, project } = await fresh();
    const o = await createObservation(db, project.id, { originalText: 'x' });
    await expect(addAttachments(db, project.id, o.id, [{ blob: new Blob(['x'], { type: 'text/html' }) }])).rejects.toMatchObject({ code: 'invalidFile' });
    await expect(addAttachments(db, project.id, o.id, [{ blob: png(100) }], { maxBytes: 50 })).rejects.toMatchObject({ code: 'fileTooLarge' });
    await expect(addAttachments(db, project.id, o.id, [{ blob: png() }, { blob: png() }, { blob: png() }], { maxCount: 2 })).rejects.toMatchObject({
      code: 'tooManyFiles',
    });
    expect(await db.files.count()).toBe(0);
  });
});

describe('search and filtering', () => {
  it('filters by keyword across fields, status, priority, type, feature and date', async () => {
    const { db, project } = await fresh();
    const a = await createObservation(db, project.id, { originalText: 'Ring overlaps the date', feature: 'Today', type: 'ui', priority: 'low' });
    const b = await createObservation(db, project.id, { originalText: 'Export fails', feature: 'Settings', type: 'bug', description: 'Backup crashes on iOS' });
    await createObservation(db, project.id, { originalText: 'Dark mode please', type: 'feature' });
    await updateObservation(db, project.id, b.id, { status: 'resolved' });

    const kw = await queryObservations(db, project.id, { keyword: 'backup ios' });
    expect(kw.map((o) => o.id)).toEqual([b.id]);
    expect((await queryObservations(db, project.id, { keyword: 'RING' })).map((o) => o.id)).toEqual([a.id]);
    expect(await queryObservations(db, project.id, { status: 'open' })).toHaveLength(2);
    expect(await queryObservations(db, project.id, { status: 'resolved' })).toHaveLength(1);
    expect(await queryObservations(db, project.id, { priority: 'none' })).toHaveLength(2);
    expect(await queryObservations(db, project.id, { type: 'bug' })).toHaveLength(1);
    expect(await queryObservations(db, project.id, { feature: 'today' })).toHaveLength(1);
    expect(await queryObservations(db, project.id, { from: Date.now() + 60_000 })).toHaveLength(0);
    expect(await listFeatures(db, project.id)).toEqual(['Settings', 'Today']);
    // newest first
    const all = await queryObservations(db, project.id);
    expect(all[0]!.createdAt).toBeGreaterThanOrEqual(all[2]!.createdAt);
  });

  it('matches the raw transcript too', () => {
    const o = { title: 't', originalText: 'x', rawTranscript: 'macro bar', description: '', feature: '', actualBehavior: '', expectedBehavior: '', proposedSolution: '', notes: '', tags: [], status: 'new', priority: null, type: 'other', createdAt: 1 } as unknown as Observation;
    expect(matchesFilter(o, { keyword: 'macro' })).toBe(true);
  });
});

/* ---------------- Prompt generation ---------------- */

async function threeObs() {
  const { db, project } = await fresh();
  const a = await createObservation(db, project.id, { originalText: 'Ring overlaps the date label on small screens', feature: 'Today', type: 'ui', expectedBehavior: 'Ring and date never overlap' });
  const b = await createObservation(db, project.id, { originalText: 'Meal list jumps when I add food', feature: 'today ', type: 'bug', actualBehavior: 'List jumps to top' });
  const c = await createObservation(db, project.id, { originalText: 'Export should include notes', feature: 'Settings', type: 'feature' });
  await addAttachments(db, project.id, a.id, [{ blob: png(2048), fileName: 'ring.png', width: 390, height: 844 }]);
  const obs = await queryObservations(db, project.id);
  const attachments = { [a.id]: await listAttachments(db, project.id, a.id) };
  const order = [a.id, b.id, c.id];
  obs.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
  return { db, project, a, b, c, obs, attachments };
}

describe('grouping', () => {
  it('groups only the same feature and keeps others separate', async () => {
    const { a, b, c, obs } = await threeObs();
    const groups = resolveGroups(planFromFeatures(obs), obs);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.observationIds).toEqual([a.id, b.id]);
    expect(groups[0]!.reason).toContain('same feature/screen');
    expect(groups[1]!.observationIds).toEqual([c.id]);
  });

  it('lets the user split and merge groups, explaining the change', async () => {
    const { a, b, c, obs } = await threeObs();
    let plan = moveObservation(planFromFeatures(obs), obs.find((o) => o.id === b.id)!, 'solo');
    let groups = resolveGroups(plan, obs);
    expect(groups.map((g) => g.observationIds.length)).toEqual([1, 1, 1]);
    expect(groups.find((g) => g.observationIds[0] === b.id)!.reason).toBe('Kept separate by you.');
    plan = moveObservation(plan, obs.find((o) => o.id === c.id)!, plan.assignments[a.id]!);
    groups = resolveGroups(plan, obs);
    expect(groups.find((g) => g.observationIds.includes(c.id))!.observationIds).toEqual([a.id, c.id]);
    expect(groups.find((g) => g.observationIds.includes(c.id))!.reason).toContain('Adjusted manually.');
  });
});

describe('development prompt (template)', () => {
  it('includes every selected observation with original words, structure, screenshots and criteria', async () => {
    const { a, b, c, obs, attachments } = await threeObs();
    const groups = resolveGroups(planFromFeatures(obs), obs);
    const text = buildDevelopmentPrompt({ app: { appName: 'Philip', projectName: 'Philip', appVersion: '0.1.0' }, observations: obs, groups, attachments });
    for (const o of [a, b, c]) {
      expect(text).toContain(shortRef(o.id));
      expect(text).toContain(o.originalText);
    }
    expect(text).toContain('Inspect the repository first');
    expect(text).toContain('Expected behavior holds: Ring and date never overlap');
    expect(text).toContain('The reported behavior no longer occurs: List jumps to top');
    expect(text).toContain('ring.png (image/png, 2 KB, 390×844)');
    expect(text).not.toContain('The feature/screen was not stated');
    expect(text).toContain('Do not invent file names');
    expect(text).toContain('(template, no AI)');
    // c is its own group
    expect(text).toMatch(/### 2\. Export should include notes\nGrouping: Independent\./);
  });
});

describe('AI validation', () => {
  it('structure: keeps valid fields, drops unknown enums and unsupported high priority', () => {
    const r = validateStructure(
      { title: 'Ring overlap', type: 'explosion', priority: 'critical', priorityReason: '', facts: ['ring overlaps'], unknowns: ['device?', 5], description: '' },
      'gemini',
      'm',
    );
    expect(r.suggested).toEqual({ title: 'Ring overlap' });
    expect(r.priorityReason).toBeNull();
    expect(r.unknowns).toEqual(['device?']);
    const ok = validateStructure({ title: 't', type: 'bug', priority: 'high', priorityReason: 'user said data is lost', facts: [] }, 'gemini', 'm');
    expect(ok.suggested).toMatchObject({ type: 'bug', priority: 'high' });
    expect(() => validateStructure('nope', 'g', 'm')).toThrow(AiError);
  });

  it('screenshot: requires a summary', () => {
    expect(() => validateScreenshot({ visibleText: [] }, 'g', 'm')).toThrow(AiError);
    expect(validateScreenshot({ summary: 'Today screen', possibleIssues: ['ring clipped'] }, 'g', 'm').possibleIssues).toEqual(['ring clipped']);
  });

  it('batch: ignores invented ids, de-duplicates and never drops an observation', async () => {
    const { a, b, c, obs } = await threeObs();
    const batch = validateBatch(
      {
        groups: [
          { title: 'Today layout', observationIds: [shortRef(a.id), shortRef(b.id), 'OBS-FAKE99'], relationship: 'Both on Today' },
          { title: 'dup', observationIds: [shortRef(a.id)], relationship: 'x' },
        ],
        items: [{ id: shortRef(a.id), acceptanceCriteria: ['Ring has 8px clearance'] }, { id: 'nope' }],
        dependencies: ['Fix layout before list'],
      },
      obs,
      'gemini',
      'm',
    );
    expect(batch.groups).toHaveLength(2);
    expect(batch.groups[0]!.observationIds).toEqual([a.id, b.id]);
    expect(batch.groups[1]!.observationIds).toEqual([c.id]);
    expect(batch.recovered).toEqual([c.id]);
    expect(Object.keys(batch.items)).toEqual([a.id]);

    const groups = resolveGroups(planFromAi(batch, obs), obs);
    const text = buildDevelopmentPrompt({ app: { appName: 'Philip', projectName: 'Philip' }, observations: obs, groups, attachments: {}, batch });
    expect(text).toContain('Ring has 8px clearance _(AI-suggested');
    expect(text).toContain('AI-suggested: Both on Today');
    expect(text).toContain('Fix layout before list _(AI-suggested)_');
    expect(text).toContain(c.originalText);
  });

  it('extracts JSON from fenced or noisy text', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(() => extractJsonObject('no json')).toThrow(AiError);
  });
});

describe('Gemini adapter', () => {
  const ok = (data: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] }, finishReason: 'STOP' }] }), { status: 200 });

  it('is not configured without a key and never calls the network', async () => {
    let calls = 0;
    const p = createGeminiProvider({ getCredentials: async () => null, fetchImpl: async () => (calls++, ok({})) });
    expect(await p.isConfigured()).toBe(false);
    await expect(p.generateJson({ instructions: 'i', input: 'x' })).rejects.toMatchObject({ code: 'notConfigured' });
    expect(calls).toBe(0);
  });

  it('sends the key only in the header and parses JSON', async () => {
    let url = '';
    let headers: Record<string, string> = {};
    let body = '';
    const p = createGeminiProvider({
      getCredentials: async () => ({ apiKey: 'secret-key', model: 'gemini-x' }),
      fetchImpl: async (u, init) => {
        url = String(u);
        headers = init?.headers as Record<string, string>;
        body = String(init?.body);
        return ok({ title: 'hi' });
      },
    });
    const r = await p.generateJson({ instructions: 'i', input: 'x' });
    expect(r).toEqual({ data: { title: 'hi' }, model: 'gemini-x' });
    expect(url).not.toContain('secret-key');
    expect(headers['x-goog-api-key']).toBe('secret-key');
    expect(body).not.toContain('secret-key');
  });

  it('maps HTTP and network failures', async () => {
    expect(mapGeminiHttpError(429, { error: { details: [{ retryDelay: '12s' }] } })).toMatchObject({ code: 'rateLimited', retryAfterSec: 12 });
    expect(mapGeminiHttpError(400, { error: { message: 'API key not valid' } }).code).toBe('invalidKey');
    expect(mapGeminiHttpError(404, null).code).toBe('modelUnavailable');
    expect(mapGeminiHttpError(503, null).code).toBe('server');
    const p = createGeminiProvider({
      getCredentials: async () => ({ apiKey: 'k', model: 'm1' }),
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(p.generateJson({ instructions: 'i', input: 'x' })).rejects.toMatchObject({ code: 'network' });
  });
});

describe('prompts', () => {
  it('saves a prompt, links observations and keeps user edits separate from generated text', async () => {
    const { db, project, a, b } = await threeObs();
    const p = await savePrompt(db, project.id, { observationIds: [a.id, b.id], content: 'generated', mode: 'template' });
    await updatePromptContent(db, project.id, p.id, 'generated + my edit');
    const stored = (await getPrompt(db, project.id, p.id))!;
    expect(stored.generatedContent).toBe('generated');
    expect(stored.content).toBe('generated + my edit');
    expect((await getObservation(db, project.id, a.id))!.promptIds).toEqual([p.id]);
  });
});

describe('defaultTitle', () => {
  it('uses the first sentence', () => {
    expect(defaultTitle('Button is clipped. It happens on iPhone mini.')).toBe('Button is clipped');
  });
});

/* ---------- OBS-748382: voice session can never get stuck ---------- */
describe('web speech provider lifecycle', () => {
  type Rec = {
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onresult: unknown;
    started: boolean;
    aborted: boolean;
  };
  let last: Rec | null = null;
  function install(behavior: 'stuck' | 'denied' | 'ok') {
    class Fake implements Rec {
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onresult: unknown = null;
      lang = '';
      continuous = false;
      interimResults = false;
      started = false;
      aborted = false;
      constructor() {
        last = this;
      }
      start() {
        this.started = true;
        if (behavior === 'ok') setTimeout(() => this.onstart?.(), 10);
        if (behavior === 'denied') setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 10); // no `end` follows
      }
      stop() {
        if (behavior === 'ok') setTimeout(() => this.onend?.(), 10);
      }
      abort() {
        this.aborted = true;
      }
    }
    (globalThis as unknown as { window: unknown }).window = { webkitSpeechRecognition: Fake };
  }
  function run() {
    const errors: TranscriptionErrorCode[] = [];
    let ends = 0;
    const session = webSpeechProvider.start(
      { onText: () => undefined, onError: (c) => errors.push(c), onEnd: () => ends++ },
      { lang: 'en-US' },
    );
    return { session, errors, ends: () => ends };
  }
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
    last = null;
  });

  it('ends the session when permission is denied even if the recognizer never fires end', () => {
    vi.useFakeTimers();
    install('denied');
    const r = run();
    vi.advanceTimersByTime(20);
    expect(r.errors).toEqual(['permission']);
    expect(r.ends()).toBe(1);
    expect(last?.aborted).toBe(true);
  });

  it('stop() ends a recognizer that never confirms, exactly once', () => {
    vi.useFakeTimers();
    install('stuck');
    const r = run();
    r.session.stop();
    vi.advanceTimersByTime(timing.stopTimeoutMs + 10);
    expect(r.ends()).toBe(1);
    r.session.stop();
    r.session.abort();
    vi.advanceTimersByTime(timing.startTimeoutMs + 10);
    expect(r.ends()).toBe(1);
    expect(r.errors).toEqual([]);
  });

  it('reports notStarted when the microphone never starts', () => {
    vi.useFakeTimers();
    install('stuck');
    const r = run();
    vi.advanceTimersByTime(timing.startTimeoutMs + 10);
    expect(r.errors).toEqual(['notStarted']);
    expect(r.ends()).toBe(1);
  });

  it('a normal session is not cut short by the watchdogs', () => {
    vi.useFakeTimers();
    install('ok');
    const r = run();
    vi.advanceTimersByTime(timing.startTimeoutMs * 2);
    expect(r.ends()).toBe(0);
    r.session.stop();
    vi.advanceTimersByTime(20);
    expect(r.ends()).toBe(1);
    expect(r.errors).toEqual([]);
  });
});
