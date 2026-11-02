import { describe, expect, it } from 'vitest';
import type { QuickFood } from './recents';
import { localRow, localRows, matchFood, parseFoodLine, splitFoodText } from './foodText';

const q = (name: string, grams: number | null, calories: number, p = 0, f = 0, c = 0): QuickFood => ({
  key: name, name, grams, calories, proteinG: p, fatG: f, carbsG: c, savedFoodId: null, count: 1, lastUsedAt: 0,
});

describe('BC1840 local text parsing (no AI)', () => {
  it('splits on commas, "and", "+" and new lines, keeping decimal commas', () => {
    expect(splitFoodText('2 eggs, 150 g rice, 1 tbsp olive oil')).toEqual(['2 eggs', '150 g rice', '1 tbsp olive oil']);
    expect(splitFoodText('toast and jam\n1,5 kg potatoes + salt')).toEqual(['toast', 'jam', '1,5 kg potatoes', 'salt']);
  });

  it('parses grams from g / kg / ml / household units and bare counts', () => {
    expect(parseFoodLine('150 g rice')).toMatchObject({ name: 'rice', grams: 150, count: null });
    expect(parseFoodLine('rice 150g')).toMatchObject({ name: 'rice', grams: 150 });
    expect(parseFoodLine('0.2 kg chicken breast')).toMatchObject({ name: 'chicken breast', grams: 200 });
    expect(parseFoodLine('250 ml milk')).toMatchObject({ name: 'milk', grams: 250 });
    expect(parseFoodLine('1 tbsp olive oil')).toMatchObject({ name: 'olive oil', grams: 15 });
    expect(parseFoodLine('2 eggs')).toMatchObject({ name: 'eggs', grams: null, count: 2 });
    expect(parseFoodLine('banana')).toMatchObject({ name: 'banana', grams: null, count: null });
  });

  it('matches My Foods / recents by name, ignoring case and plurals', () => {
    const c = [q('Egg', 50, 72, 6.3, 4.8, 0.4), q('White rice, cooked', 100, 130, 2.7, 0.3, 28)];
    expect(matchFood('eggs', c)?.name).toBe('Egg');
    expect(matchFood('EGG', c)?.name).toBe('Egg');
    expect(matchFood('rice', c)?.name).toBe('White rice, cooked'); // every typed word is in the saved name
    expect(matchFood('brown bread', c)).toBeNull();
    expect(matchFood('white rice cooked', c)?.name).toBe('White rice, cooked');
    expect(matchFood('', c)).toBeNull();
  });

  it('prefills macros from a match, scaled by typed grams or count', () => {
    const egg = q('Egg', 50, 72, 6.3, 4.8, 0.4);
    expect(localRow(parseFoodLine('2 eggs'), [egg])).toMatchObject({ name: 'Egg', grams: 100, macros: { calories: 144, proteinG: 12.6, fatG: 9.6, carbsG: 0.8 } });
    expect(localRow(parseFoodLine('75 g egg'), [egg]).macros?.calories).toBe(108);
  });

  it('leaves macros empty (null) when nothing matches, keeping the typed count in the name', () => {
    const rows = localRows('2 eggs, 150 g rice', []);
    expect(rows).toEqual([
      { name: '2 eggs', grams: null, macros: null, matched: null },
      { name: 'rice', grams: 150, macros: null, matched: null },
    ]);
  });
});
