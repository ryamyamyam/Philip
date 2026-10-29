import type { Macros } from '../../db/types';

export type Confidence = 'low' | 'medium' | 'high';

export interface AnalysisItem extends Macros {
  name: string;
  description: string;
  grams: number | null;
  confidence: Confidence;
}

/** Provider-independent analysis result. Totals are always recomputed from items. */
export interface AnalysisResult {
  items: AnalysisItem[];
  totals: Macros;
  /** Uncertainty notes (hidden oils, sauces, obscured food, etc.). */
  notes: string[];
  /** True when the model's own totals disagreed with the item sum. */
  totalsMismatch: boolean;
}

export type AnalysisErrorCode =
  | 'noKey'
  | 'invalidKey'
  | 'rateLimited'
  | 'modelUnavailable'
  | 'network'
  | 'blocked'
  | 'invalidResponse'
  | 'server'
  | 'image'
  | 'timeout';

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode;
  readonly retryAfterSec: number | null;
  constructor(code: AnalysisErrorCode, message?: string, retryAfterSec: number | null = null) {
    super(message ?? code);
    this.name = 'AnalysisError';
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}
