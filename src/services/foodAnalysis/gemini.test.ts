import { describe, expect, it, vi } from 'vitest';
import { analyzeWithGemini, listGeminiModels, mapHttpError, normalizeModel, responseText, testGeminiKey, DEFAULT_GEMINI_MODEL } from './gemini';
import { AnalysisError } from './types';

const goodJson = {
  items: [{ name: 'Banana', description: 'medium', grams: 118, calories: 105, protein_g: 1.3, fat_g: 0.4, carbs_g: 27, confidence: 'high' }],
  total: { calories: 105, protein_g: 1.3, fat_g: 0.4, carbs_g: 27 },
  uncertainties: [],
};

const ok = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
const err = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
const candidate = (text: string, finishReason = 'STOP') => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });

const req = (fetchImpl: typeof fetch) => ({ apiKey: 'k', model: 'gemini-x', imageBase64: 'AAAA', mimeType: 'image/jpeg', fetchImpl });

describe('gemini adapter', () => {
  it('sends the key in a header, not the URL, and parses the result', async () => {
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok(candidate(JSON.stringify(goodJson))));
    const r = await analyzeWithGemini(req(f as unknown as typeof fetch));
    expect(r.items[0]!.name).toBe('Banana');
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect(String(url)).not.toContain('k=');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const body = JSON.parse(String(init!.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('image/jpeg');
  });

  it('retries without schema on a generic 400', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(err(400, { error: { code: 400, message: 'Invalid JSON payload: responseSchema', status: 'INVALID_ARGUMENT' } }))
      .mockResolvedValueOnce(ok(candidate(JSON.stringify(goodJson))));
    const r = await analyzeWithGemini(req(f as unknown as typeof fetch));
    expect(r.items).toHaveLength(1);
    expect(JSON.parse(f.mock.calls[1]![1].body).generationConfig.responseSchema).toBeUndefined();
  });

  it('maps invalid key', async () => {
    const f = vi.fn().mockResolvedValue(
      err(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }),
    );
    await expect(analyzeWithGemini(req(f as unknown as typeof fetch))).rejects.toMatchObject({ code: 'invalidKey' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('maps rate limits with retry delay', () => {
    const e = mapHttpError(429, { error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '27s' }] } });
    expect(e.code).toBe('rateLimited');
    expect(e.retryAfterSec).toBe(27);
  });

  it('maps unavailable models, server errors, forbidden', () => {
    expect(mapHttpError(404, { error: { message: 'models/x is not found' } }).code).toBe('modelUnavailable');
    expect(mapHttpError(503, null).code).toBe('server');
    expect(mapHttpError(403, null).code).toBe('invalidKey');
  });

  it('maps network failure and missing key', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    await expect(analyzeWithGemini(req(f as unknown as typeof fetch))).rejects.toMatchObject({ code: 'network' });
    await expect(analyzeWithGemini({ ...req(f as unknown as typeof fetch), apiKey: ' ' })).rejects.toMatchObject({ code: 'noKey' });
  });

  it('detects blocked and invalid responses', async () => {
    expect(() => responseText({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(AnalysisError);
    expect(() => responseText(candidate('', 'SAFETY'))).toThrow(/SAFETY/);
    expect(() => responseText({ candidates: [] })).toThrow();
    const f = vi.fn().mockResolvedValue(ok(candidate('not json at all')));
    await expect(analyzeWithGemini(req(f as unknown as typeof fetch))).rejects.toMatchObject({ code: 'invalidResponse' });
  });

  it('ignores thought parts', () => {
    expect(responseText({ candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: '{}' }] } }] })).toBe('{}');
  });

  it('normalizes model names', () => {
    expect(normalizeModel('models/gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(normalizeModel('  ')).toBe(DEFAULT_GEMINI_MODEL);
    expect(normalizeModel('../evil')).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('tests keys and lists models', async () => {
    await expect(testGeminiKey('k', 'm', vi.fn().mockResolvedValue(ok({ name: 'models/m' })) as unknown as typeof fetch)).resolves.toBeUndefined();
    await expect(testGeminiKey('k', 'm', vi.fn().mockResolvedValue(err(404, {})) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'modelUnavailable' });
    const list = await listGeminiModels(
      'k',
      vi.fn().mockResolvedValue(
        ok({
          models: [
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
            { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
          ],
        }),
      ) as unknown as typeof fetch,
    );
    expect(list).toEqual(['gemini-2.5-flash']);
  });
});
