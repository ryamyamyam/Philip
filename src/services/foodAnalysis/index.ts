/**
 * Food analysis entry point. The rest of the app depends only on this module and ./types,
 * so swapping Gemini for another provider means changing this file and adding an adapter.
 */
import { analyzeWithGemini, normalizeModel } from './gemini';
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
