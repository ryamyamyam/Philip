/**
 * Food analysis entry point. The rest of the app depends only on this module and ./types,
 * so swapping Gemini for another provider means changing this file and adding an adapter.
 */
import { analyzeTextWithGemini, analyzeWithGemini, normalizeModel, suggestWithGemini } from './gemini';
import type { SuggestTargets } from './prompt';
import { prepareImage } from './image';
import { AnalysisError, type AnalysisResult } from './types';

export { AnalysisError } from './types';
export type { AnalysisResult, AnalysisItem, AnalysisErrorCode } from './types';
export { parseAnalysisText } from './parse';
export { claudeHandoffPrompt } from './prompt';

export interface AnalyzeOptions {
  apiKey: string | null;
  model: string | null;
  signal?: AbortSignal;
}

export async function analyzeFoodPhoto(file: Blob, opts: AnalyzeOptions): Promise<AnalysisResult & { model: string }> {
  if (!opts.apiKey) throw new AnalysisError('noKey');
  let image;
  try {
    image = await prepareImage(file);
  } catch (e) {
    throw new AnalysisError('image', e instanceof Error ? e.message : String(e));
  }
  const model = normalizeModel(opts.model);
  const result = await analyzeWithGemini({
    apiKey: opts.apiKey,
    model,
    imageBase64: image.base64,
    mimeType: image.mimeType,
    signal: opts.signal,
  });
  return { ...result, model };
}

/** Typed food text ("2 eggs, 150 g rice") → the same AnalysisResult shape as a photo. */
export async function analyzeFoodText(text: string, opts: AnalyzeOptions): Promise<AnalysisResult & { model: string }> {
  if (!opts.apiKey) throw new AnalysisError('noKey');
  const model = normalizeModel(opts.model);
  const result = await analyzeTextWithGemini({ apiKey: opts.apiKey, model, text, signal: opts.signal });
  return { ...result, model };
}

/** "What should I eat?" — options for what is left today. Results must still go through review before saving. */
export async function suggestFoods(left: SuggestTargets, opts: AnalyzeOptions): Promise<AnalysisResult & { model: string }> {
  if (!opts.apiKey) throw new AnalysisError('noKey');
  const model = normalizeModel(opts.model);
  const result = await suggestWithGemini({ apiKey: opts.apiKey, model, left, signal: opts.signal });
  return { ...result, model };
}
