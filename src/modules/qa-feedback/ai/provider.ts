/**
 * Provider-independent AI interface. The module only talks to this; adapters (e.g. ./gemini.ts)
 * implement it. Everything AI-related is optional.
 */

export type AiErrorCode =
  | 'notConfigured'
  | 'invalidKey'
  | 'rateLimited'
  | 'modelUnavailable'
  | 'network'
  | 'timeout'
  | 'blocked'
  | 'invalidResponse'
  | 'server';

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    detail = '',
    readonly retryAfterSec: number | null = null,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AiError';
  }
}

export interface AiImage {
  base64: string;
  mimeType: string;
}

export interface AiJsonRequest {
  /** Task instructions (trusted, written by the module). */
  instructions: string;
  /** Untrusted user content, already delimited by the caller. */
  input: string;
  images?: AiImage[];
  /** Optional JSON schema hint (OpenAPI subset, as Gemini accepts). */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AiJsonResult {
  /** Parsed JSON — untrusted; callers must validate. */
  data: unknown;
  model: string;
}

export interface AiProvider {
  id: string;
  /** Shown to the user before anything is sent, e.g. "Gemini (gemini-3.1-flash-lite)". */
  label(): Promise<string>;
  isConfigured(): Promise<boolean>;
  generateJson(req: AiJsonRequest): Promise<AiJsonResult>;
}

/** Pulls the first JSON object out of model text (handles ``` fences and stray prose). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw new AiError('invalidResponse', 'Response is not JSON');
}
