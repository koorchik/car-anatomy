// The English text registered so far: UI_EN from t.ts, and each lazy chunk's dictionaries from the loader that brings
// the chunk (dictionaries.ts). No text of its own, so the loader can carry it.

export type Dictionary = Readonly<Record<string, string>>;

/** Every registered translation, read by t(). */
export const ENGLISH: Record<string, string> = {};

const registered = new Set<string>();

/** Adds a dictionary under its name. The same name twice adds it once. */
export function registerDictionary(name: string, dict: Dictionary): void {
  if (registered.has(name)) return;
  registered.add(name);
  Object.assign(ENGLISH, dict);
}
