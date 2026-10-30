/**
 * Speech-to-text behind a small interface so the provider can be swapped.
 * Default: the browser Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 *
 * Caveats (not assumed away):
 * - Not every browser has it (e.g. Firefox). isSupported() returns false and the UI falls back
 *   to typing, where the iOS/Android keyboard's own dictation key still works.
 * - Safari and Chrome send audio to Apple/Google servers: it needs a network connection.
 * - Microphone permission can be denied; the error is reported, never retried silently, and the
 *   session always ends (watchdogs guarantee `onEnd`), so the UI can't get stuck "listening".
 * - In iOS home-screen apps it can be unreliable; the typed fallback always remains.
 */

export type TranscriptionErrorCode =
  | 'permission'
  | 'notStarted'
  | 'noSpeech'
  | 'network'
  | 'audioCapture'
  | 'unsupported'
  | 'aborted'
  | 'unknown';

/** Errors after which the recognizer can't continue: the session is ended right away. */
const FATAL = new Set<TranscriptionErrorCode>(['permission', 'notStarted', 'audioCapture', 'unsupported', 'network']);

/** Watchdog timings (ms). Exported so tests can shorten them. */
export const timing = { startTimeoutMs: 6000, stopTimeoutMs: 1500 };

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
  onstart: (() => void) | null;
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
    // The session must always end exactly once. iOS can leave a recognizer that was refused the
    // microphone (e.g. after "Don't Allow") in a state where it never fires `end`, or never even
    // starts — which used to leave the UI stuck on "Listening…" with a stop button that did nothing.
    let ended = false;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (ended) return;
      ended = true;
      clearTimeout(stopTimer);
      clearTimeout(startTimer);
      rec.onresult = rec.onerror = rec.onend = rec.onstart = null;
      handlers.onEnd();
    };
    const fail = (code: TranscriptionErrorCode) => {
      if (ended) return;
      handlers.onError(code);
      if (FATAL.has(code)) {
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
        finish();
      }
    };
    rec.onstart = () => clearTimeout(startTimer);
    rec.onresult = (e) => {
      clearTimeout(startTimer);
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
    rec.onerror = (e) => fail(mapSpeechError(e.error));
    rec.onend = finish;
    try {
      rec.start();
    } catch (e) {
      fail(e instanceof DOMException && e.name === 'NotAllowedError' ? 'permission' : 'unknown');
      finish();
      return { stop: () => undefined, abort: () => undefined };
    }
    // Never started listening (no `start` event) → most likely the microphone is blocked.
    startTimer = setTimeout(() => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      fail('notStarted');
      finish();
    }, timing.startTimeoutMs);
    return {
      stop: () => {
        if (ended) return;
        try {
          rec.stop();
        } catch {
          finish();
          return;
        }
        // If the recognizer doesn't confirm, end the session anyway so the UI never gets stuck.
        stopTimer = setTimeout(() => {
          try {
            rec.abort();
          } catch {
            /* ignore */
          }
          finish();
        }, timing.stopTimeoutMs);
      },
      abort: () => {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
        finish();
      },
    };
  },
};
