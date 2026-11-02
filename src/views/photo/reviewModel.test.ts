import { describe, expect, it } from 'vitest';
import { blankItem, editItem, fromAnalysis, reviewTotals, toEntries, validateItems } from './reviewModel';

const analysis = [
  { name: 'Salmon', description: '', grams: 120, calories: 250, proteinG: 25, fatG: 16, carbsG: 0, confidence: 'medium' as const },
  { name: 'Potatoes', description: '', grams: 200, calories: 180, proteinG: 4, fatG: 0.2, carbsG: 40, confidence: 'low' as const },
];

describe('review model', () => {
  it('totals update as values are edited, including partial input', () => {
    let items = fromAnalysis(analysis);
    expect(reviewTotals(items).calories).toBe(430);
    items = items.map((it, i) => (i === 0 ? editItem(it, 'calories', '300') : it));
    expect(reviewTotals(items).calories).toBe(480);
    items = items.map((it, i) => (i === 0 ? editItem(it, 'calories', '') : it));
    expect(reviewTotals(items).calories).toBe(180);
  });

  it('rescales macros when grams change until a macro is edited', () => {
    let it = fromAnalysis(analysis)[0]!;
    it = editItem(it, 'grams', '240');
    expect(it).toMatchObject({ calories: '500', proteinG: '50', fatG: '32' });
    it = editItem(it, 'proteinG', '45');
    it = editItem(it, 'grams', '120');
    expect(it).toMatchObject({ grams: '120', calories: '500', proteinG: '45' });
  });

  it('validates every item before saving', () => {
    const items = [...fromAnalysis(analysis), blankItem()];
    const v = validateItems(items);
    expect(v.ok).toBe(false);
    expect(v.errors[items[2]!.key]).toMatchObject({ name: 'nameRequired', calories: 'required' });
    expect(validateItems(fromAnalysis(analysis)).ok).toBe(true);
    expect(validateItems([]).ok).toBe(false);
  });

  it('creates photo entries that keep the original AI values', () => {
    const items = fromAnalysis(analysis).map((it, i) => (i === 0 ? editItem(it, 'calories', '275.5') : it));
    const entries = toEntries(items, { date: '2026-10-28', meal: 'dinner', provider: 'gemini', model: 'g', analyzedAt: 5 });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ source: 'photo', calories: 275.5, meal: 'dinner', date: '2026-10-28' });
    expect(entries[0]!.estimate?.originalValues.calories).toBe(250);
    expect(entries[0]!.estimate?.items).toHaveLength(2);
    expect(entries[0]!.estimate?.provider).toBe('gemini');
  });
});

describe('text-box rows (OBS-BC1840 / OBS-A2F21F)', () => {
  it('local rows save as manual entries without an AI estimate; empty macros must be filled in', async () => {
    const { fromLocal, isUntouchedBlank } = await import('./reviewModel');
    const rows = fromLocal([
      { name: 'rice', grams: 150, macros: null, matched: null },
      { name: 'Egg', grams: 100, macros: { calories: 144, proteinG: 12.6, fatG: 9.6, carbsG: 0.8 }, matched: null },
    ]);
    expect(rows[0]).toMatchObject({ name: 'rice', grams: '150', calories: '', local: true });
    expect(validateItems(rows).ok).toBe(false); // macros empty → user fills them in, no AI needed
    const filled = [editItem(editItem(editItem(editItem(rows[0]!, 'calories', '195'), 'proteinG', '4'), 'fatG', '0.4'), 'carbsG', '43'), rows[1]!];
    expect(validateItems(filled).ok).toBe(true);
    const out = toEntries(filled, { date: '2026-11-01', meal: 'lunch', provider: 'gemini', model: 'm', analyzedAt: 1 });
    expect(out.map((e) => [e.source, e.estimate])).toEqual([['manual', null], ['manual', null]]);
    expect(out[1]).toMatchObject({ name: 'Egg', grams: 100, calories: 144 });
    expect(isUntouchedBlank(blankItem())).toBe(true);
    expect(isUntouchedBlank(rows[0]!)).toBe(false);
  });

  it('AI rows from different sends keep their own provider/model', () => {
    const a = fromAnalysis(analysis.slice(0, 1), { provider: 'gemini', model: 'text-model', analyzedAt: 5 });
    const out = toEntries(a, { date: '2026-11-01', meal: 'lunch', provider: 'claude-handoff', model: 'x', analyzedAt: 1 });
    expect(out[0]!.source).toBe('photo');
    expect(out[0]!.estimate).toMatchObject({ provider: 'gemini', model: 'text-model', analyzedAt: 5 });
  });
});
