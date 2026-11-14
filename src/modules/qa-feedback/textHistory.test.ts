import { describe, expect, it } from 'vitest';
import { GROUP_MS, HISTORY_LIMIT, canRedo, canUndo, checkpoint, editHistory, initHistory, redo, undo } from './textHistory';

describe('OBS-18D928: capture text undo/redo', () => {
  it('a burst of typing is one step; a pause starts a new one', () => {
    let h = initHistory('');
    h = editHistory(h, 'T', 1000);
    h = editHistory(h, 'Th', 1100);
    h = editHistory(h, 'The', 1200);
    h = editHistory(h, 'The ring', 1200 + GROUP_MS + 1);
    expect(h.present).toBe('The ring');
    h = undo(h);
    expect(h.present).toBe('The');
    h = undo(h);
    expect(h.present).toBe('');
    expect(canUndo(h)).toBe(false);
  });

  it('redo walks forward again; a new edit clears redo', () => {
    let h = editHistory(initHistory(''), 'a', 0);
    h = editHistory(h, 'a b', GROUP_MS * 2);
    h = undo(undo(h));
    expect(h.present).toBe('');
    h = redo(h);
    expect(h.present).toBe('a');
    expect(canRedo(h)).toBe(true);
    h = editHistory(h, 'a c', GROUP_MS * 5);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe('a');
  });

  it('after undo, typing starts a new step even within the group window', () => {
    let h = editHistory(initHistory(''), 'one', 0);
    h = editHistory(h, 'one two', GROUP_MS * 2);
    h = undo(h);
    h = editHistory(h, 'one three', GROUP_MS * 2 + 10);
    expect(undo(h).present).toBe('one');
  });

  it('dictation merges into one step between checkpoints', () => {
    let h = editHistory(initHistory(''), 'typed', 0);
    h = checkpoint(h);
    h = editHistory(h, 'typed hello', 1, true);
    h = editHistory(h, 'typed hello world', 50_000, true);
    h = checkpoint(h);
    expect(undo(h).present).toBe('typed');
  });

  it('no-op edits and empty undo/redo leave the history unchanged', () => {
    const h = editHistory(initHistory(''), 'x', 0);
    expect(editHistory(h, 'x', 10)).toBe(h);
    const empty = initHistory('');
    expect(undo(empty)).toBe(empty);
    expect(redo(empty)).toBe(empty);
  });

  it('keeps at most HISTORY_LIMIT steps', () => {
    let h = initHistory('');
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = editHistory(h, `v${i}`, i * GROUP_MS * 2);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
