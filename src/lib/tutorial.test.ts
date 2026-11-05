import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { ATLAS } from './character';
import { stepsFor, TUTORIAL_STEPS, TYPE_MS, typeDelay, typeDuration } from './tutorial';

const ids = (ctx: { hasTarget: boolean; hasKey: boolean }) => stepsFor(ctx).map((s) => s.id);

describe('stepsFor', () => {
  it('with a target and no key: fuel, protein, dialog and the key step, no choice step', () => {
    expect(ids({ hasTarget: true, hasKey: false })).toEqual([
      'hello', 'what', 'fuel', 'protein', 'photo', 'type', 'dialog', 'progress', 'key', 'bye',
    ]);
  });

  it('with no target: the choice step replaces the target steps', () => {
    expect(ids({ hasTarget: false, hasKey: false })).toEqual([
      'hello', 'what', 'noTarget', 'photo', 'type', 'progress', 'key', 'bye',
    ]);
  });

  it('with a Gemini key the key step is skipped', () => {
    expect(ids({ hasTarget: true, hasKey: true })).not.toContain('key');
    expect(ids({ hasTarget: false, hasKey: true })).not.toContain('key');
  });

  it('always starts with hello and ends with bye', () => {
    for (const hasTarget of [true, false]) {
      for (const hasKey of [true, false]) {
        const list = ids({ hasTarget, hasKey });
        expect(list[0]).toBe('hello');
        expect(list[list.length - 1]).toBe('bye');
      }
    }
  });

  it('only the no-target step has choices, and they are Set targets / Later', () => {
    const withChoices = TUTORIAL_STEPS.filter((s) => s.choices);
    expect(withChoices.map((s) => s.id)).toEqual(['noTarget']);
    expect(withChoices[0]?.choices).toEqual(['setTargets', 'later']);
  });
});

describe('step data', () => {
  it('has unique ids, existing strings and existing poses', () => {
    const seen = new Set<string>();
    for (const s of TUTORIAL_STEPS) {
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
      expect(en[s.textKey]).toBeTruthy();
      expect(Object.keys(ATLAS.poses)).toContain(s.pose);
    }
  });
});

describe('typewriter timing', () => {
  it('pauses longer after sentence ends and commas than after letters', () => {
    expect(typeDelay('a')).toBe(TYPE_MS.char);
    expect(typeDelay(' ')).toBe(TYPE_MS.space);
    expect(typeDelay(',')).toBe(TYPE_MS.comma);
    for (const ch of ['.', '?', '!']) expect(typeDelay(ch)).toBe(TYPE_MS.stop);
    expect(TYPE_MS.stop).toBeGreaterThan(TYPE_MS.comma);
    expect(TYPE_MS.comma).toBeGreaterThan(TYPE_MS.char);
  });

  it('sums the delays before every character but the first', () => {
    expect(typeDuration('')).toBe(0);
    expect(typeDuration('a')).toBe(0);
    expect(typeDuration('ab')).toBe(TYPE_MS.char);
    expect(typeDuration('Hi. Yo')).toBe(3 * TYPE_MS.char + TYPE_MS.stop + TYPE_MS.space);
  });
});
