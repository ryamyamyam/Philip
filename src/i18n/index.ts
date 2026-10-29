import { en, type StringKey, type Strings } from './en';

export type { StringKey };
export type Vars = Record<string, string | number>;

const catalogs: Record<string, Strings> = { 'en-US': en };
let active: Strings = en;
let activeLocale = 'en-US';

export function setLocale(locale: string): void {
  active = catalogs[locale] ?? en;
  activeLocale = catalogs[locale] ? locale : 'en-US';
}

export function getLocale(): string {
  return activeLocale;
}

/** Translate a key with optional {placeholders}. Falls back to English. */
export function t(key: StringKey, vars?: Vars): string {
  const template = active[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
