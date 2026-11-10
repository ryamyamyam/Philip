import { describe, expect, it } from 'vitest';
import { formatMb } from './pwa';
import { backupFileName } from './backup';
import { backupFileName as fromName } from './backupName';

describe('Story 8: storage readout and the split backup name', () => {
  it('formats bytes as MB with one decimal, never 0.0', () => {
    expect(formatMb(0)).toBe('< 0.1');
    expect(formatMb(50_000)).toBe('< 0.1');
    expect(formatMb(1024 * 1024)).toBe('1.0');
    expect(formatMb(2.46 * 1024 * 1024)).toBe('2.5');
  });
  it('backup.ts still exports the same file name as backupName.ts', () => {
    const d = new Date(2026, 10, 9);
    expect(backupFileName(d)).toBe('philip-backup-2026-11-09.json');
    expect(fromName(d)).toBe(backupFileName(d));
  });
});
