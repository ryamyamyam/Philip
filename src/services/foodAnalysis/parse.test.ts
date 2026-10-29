import { describe, expect, it } from 'vitest';
import { extractJson, parseAnalysisText, validateAnalysis } from './parse';
import { AnalysisError } from './types';

const good = {
  items: [
    { name: 'Grilled chicken', description: 'Breast, palm-sized', grams: 150, calories: 248, protein_g: 46.5, fat_g: 5.4, carbs_g: 0, confidence: 'high' },
    { name: 'White rice', description: '1 cup cooked', grams: 180, calories: 234, protein_g: 4.3, fat_g: 0.5, carbs_g: 51.5, confidence: 'medium' },
  ],
  total: { calories: 482, protein_g: 50.8, fat_g: 5.9, carbs_g: 51.5 },
  uncertainties: ['Cooking oil not visible'],
};

describe('extractJson', () => {
  it('handles raw JSON, code fences, and surrounding prose', () => {
    expect(extractJson(JSON.stringify(good))).toEqual(good);
    expect(extractJson('```json\n' + JSON.stringify(good) + '\n```')).toEqual(good);
    expect(extractJson('Here you go:\n' + JSON.stringify(good) + '\nLet me know!')).toEqual(good);
  });
  it('handles braces inside strings', () => {
    const o = { items: [], total: {}, uncertainties: ['a } brace'] };
    expect(extractJson('text ' + JSON.stringify(o) + ' more')).toEqual(o);
  });
  it('throws on no JSON', () => {
    expect(() => extractJson('I cannot see any food')).toThrow(AnalysisError);
  });
});

describe('validateAnalysis', () => {
  it('normalizes a good response and recomputes totals', () => {
    const r = validateAnalysis(good);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ name: 'Grilled chicken', grams: 150, calories: 248, proteinG: 46.5, confidence: 'high' });
    expect(r.totals).toEqual({ calories: 482, proteinG: 50.8, fatG: 5.9, carbsG: 51.5 });
    expect(r.notes).toEqual(['Cooking oil not visible']);
    expect(r.totalsMismatch).toBe(false);
  });
  it('flags model totals that disagree with items', () => {
    expect(validateAnalysis({ ...good, total: { calories: 900 } }).totalsMismatch).toBe(true);
  });
  it('accepts numeric strings and alternate keys', () => {
    const r = validateAnalysis({ foods: [{ name: 'Toast', grams: '30 g', kcal: '80', protein: '3', fat: '1', carbohydrates: '15', confidence: 0.3 }] });
    expect(r.items[0]).toMatchObject({ grams: 30, calories: 80, proteinG: 3, carbsG: 15, confidence: 'low' });
  });
  it('allows unknown grams', () => {
    const r = validateAnalysis({ items: [{ ...good.items[0], grams: null }] });
    expect(r.items[0]!.grams).toBeNull();
  });
  it('rejects missing or implausible values', () => {
    expect(() => validateAnalysis({ items: [{ name: 'x', calories: 100 }] })).toThrow(/missing/);
    expect(() => validateAnalysis({ items: [{ ...good.items[0], calories: -10 }] })).toThrow();
    expect(() => validateAnalysis({ items: [{ ...good.items[0], calories: 99999 }] })).toThrow();
    expect(() => validateAnalysis({ items: [{ ...good.items[0], name: '' }] })).toThrow();
    expect(() => validateAnalysis({ nope: true })).toThrow(/items/);
    expect(() => validateAnalysis([])).toThrow();
  });
  it('accepts an empty item list (no food found)', () => {
    expect(validateAnalysis({ items: [], total: {}, uncertainties: [] }).items).toEqual([]);
  });
  it('parses pasted Claude replies end to end', () => {
    expect(parseAnalysisText('```json\n' + JSON.stringify(good) + '\n```').items).toHaveLength(2);
  });
});
