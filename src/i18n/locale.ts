// The language is settled once, before anything else loads, so text can be built at module level.
// Switching reloads the page: nothing has to re-render by hand.

export type Locale = 'uk' | 'en';

const STORAGE_KEY = 'locale';

const stored = (): string | null => {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
};

const detect = (): Locale => {
  // Without a browser (tests, scripts) the source language is used.
  if (typeof globalThis.location === 'undefined') return 'uk';
  const asked = new URLSearchParams(globalThis.location.search).get('lang') ?? stored();
  if (asked === 'uk' || asked === 'en') return asked;
  const browser = globalThis.navigator?.language?.toLowerCase() ?? 'uk';
  return browser.startsWith('uk') ? 'uk' : 'en';
};

export const locale: Locale = detect();

/** Each language under its own name, whichever one the page is in. */
export const LANGUAGE_LABELS: Record<Locale, string> = { uk: 'Укр', en: 'Eng' };
export const LANGUAGE_GROUP_LABEL = 'Мова / Language';

/** For number formatting. */
export const numberLocale = locale === 'en' ? 'en-US' : 'uk-UA';

export function switchLocale(next: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage may be blocked. The address below still carries the choice.
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.href = url.toString();
}
