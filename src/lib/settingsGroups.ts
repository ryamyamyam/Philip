/**
 * OBS-46BCAD: which collapsible Settings groups are open in this run of the app (not stored). Lives
 * outside the lazy Settings screen so other screens can open a group before navigating there.
 */
export type SettingsGroupId = 'settings-training' | 'settings-ai' | 'settings-app' | 'settings-data';

export const openSettingsGroups = new Set<SettingsGroupId>();

/** Call before navigate('settings') to land with that group open. */
export function openSettingsGroup(id: SettingsGroupId): void {
  openSettingsGroups.add(id);
}
