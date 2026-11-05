import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { EXERCISE_IDS, MENU } from './exercises';

const has = (k: string) => typeof (en as Record<string, string>)[k] === 'string' && (en as Record<string, string>)[k]!.length > 0;

describe('exercise copy', () => {
  it('every exercise has a name and a technique cue in en.ts', () => {
    for (const id of EXERCISE_IDS) {
      expect(has(`exercise.${id}`), `exercise.${id}`).toBe(true);
      expect(has(`cue.${id}`), `cue.${id}`).toBe(true);
    }
  });
  it('every day × slot has a why-line', () => {
    for (const m of MENU) expect(has(`why.D${m.day}-${m.slot}`), `why.D${m.day}-${m.slot}`).toBe(true);
  });
});
