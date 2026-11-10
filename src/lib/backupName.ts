/** Backup file name, split out of backup.ts (Story 8) so the Meal log's reminder doesn't load the whole backup code. */
export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `philip-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
