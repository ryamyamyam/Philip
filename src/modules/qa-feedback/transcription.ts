/**
 * Speech-to-text behind a small interface so the provider can be swapped.
 * Default: the browser Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 *
 * Caveats (not assumed away):
 * - Not every browser has it (e.g. Firefox). isSupported() returns false and the UI falls back
 *   to typing, where the iOS/Android keyboard's own dictation key still works.
 * - Safari and Chrome send audio to Apple/Google servers: it needs a network connection.
 * - Microphone permission can be denied; the error is reported, never retried silently.
 * - In iOS home-screen apps it can be unreliable; the typed fallback always remains.
 */

export type TranscriptionErrorCode = 'permission' | 'noSpeech' | 'network' | 'audioCapture' | 'unsupported' | 'aborted' | 'unknown';

export interface TranscriptionHandlers {
  /** Full transcript so far: committed text + current interim words. */
  onText: (text: string, isFinal: boolean) => void;
  onError: (code: TranscriptionErrorCode) => void;
  onEnd: () => void;
}

export interface TranscriptionSession {
  stop: () => void;
  abort: () => void;
}

export interface TranscriptionProvider {
  id: string;
  isSupported: () => boolean;
  start: (handlers: TranscriptionHandlers, opts: { lang: string }) => TranscriptionSession;
}

/* Minimal Web Speech typings (not in every TS DOM lib version). */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
}
interface SpeechResultEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechResult };
}
interface SpeechErrorEvent {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function mapSpeechError(error: string): TranscriptionErrorCode {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission';
    case 'no-speech':
      return 'noSpeech';
    case 'network':
      return 'network';
    case 'audio-capture':
      return 'audioCapture';
    case 'aborted':
      return 'aborted';
    case 'language-not-supported':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

export const webSpeechProvider: TranscriptionProvider = {
  id: 'web-speech',
  isSupported: () => speechCtor() !== null,
  start(handlers, opts) {
    const Ctor = speechCtor();
    if (!Ctor) {
      handlers.onError('unsupported');
      handlers.onEnd();
      return { stop: () => undefined, abort: () => undefined };
    }
    const rec = new Ctor();
    rec.lang = opts.lang;
    rec.continuous = true;
    rec.interimResults = true;
    let committed = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) committed = (committed + ' ' + text).replace(/\s+/g, ' ').trim();
        else interim += text;
      }
      const full = (committed + ' ' + interim).replace(/\s+/g, ' ').trim();
      handlers.onText(full, interim === '');
    };
    rec.onerror = (e) => handlers.onError(mapSpeechError(e.error));
    rec.onend = () => handlers.onEnd();
    try {
      rec.start();
    } catch {
      handlers.onError('unknown');
      handlers.onEnd();
    }
    return { stop: () => rec.stop(), abort: () => rec.abort() };
  },
};
