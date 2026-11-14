import { describe, expect, it } from 'vitest';
import { en } from './en';

// D-023 guardrail: copy is words only — no emoji in sentences, dialog bars, toasts, banners or buttons.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{231A}\u{231B}\u{23E9}-\u{23FA}]/u;

describe('D-023 no emoji in copy', () => {
  it('has no emoji in any string', () => {
    const offenders = Object.entries(en).filter(([, v]) => EMOJI.test(v));
    expect(offenders).toEqual([]);
  });
});

describe('D-023 no emoji in the Story 11 goal pack', async () => {
  const { goalStrings } = await import('./goal');
  it('has no emoji in any string', () => {
    expect(Object.entries(goalStrings).filter(([, v]) => EMOJI.test(v))).toEqual([]);
  });
});
