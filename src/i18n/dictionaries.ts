// Every English dictionary but UI_EN, which t.ts carries itself: its name and its module. The loader of a lazy chunk
// registers the dictionaries the chunk's code needs before the chunk itself loads (withDictionaries), and only in
// English: t() at the chunk's module level then finds its text, and a Ukrainian visitor downloads none of it.
// tests/i18n.test.ts reads this list and checks, for every file the site loads, that the dictionaries registered
// before it can run hold all of its text.

import { registerDictionary, type Dictionary } from './english.ts';
import { locale } from './locale.ts';

export interface DictionaryModule {
  /** The source file, for the tests and the bundle report. */
  module: string;
  load(): Promise<Dictionary>;
}

export const DICTIONARIES = {
  /** The engine pages: catalogue, article, dash, systems card, and what the lazy features show before they load. */
  engines: { module: 'src/i18n/en/engine-ui.ts', load: () => import('./en/engine-ui.ts').then((m) => m.ENGINE_UI_EN) },
  designer: { module: 'src/i18n/en/designer.ts', load: () => import('./en/designer.ts').then((m) => m.DESIGNER_EN) },
  presets: { module: 'src/i18n/en/presets.ts', load: () => import('./en/presets.ts').then((m) => m.PRESETS_EN) },
  dyno: { module: 'src/i18n/en/dyno.ts', load: () => import('./en/dyno.ts').then((m) => m.DYNO_EN) },
  systems: { module: 'src/i18n/en/systems.ts', load: () => import('./en/systems.ts').then((m) => m.SYSTEMS_EN) },
  lubrication: { module: 'src/i18n/en/lubrication.ts', load: () => import('./en/lubrication.ts').then((m) => m.LUBRICATION_EN) },
  'gearbox-parts': { module: 'src/i18n/en/gearbox-parts.ts', load: () => import('./en/gearbox-parts.ts').then((m) => m.GEARBOX_PARTS_EN) },
  suspension: { module: 'src/i18n/en/suspension.ts', load: () => import('./en/suspension.ts').then((m) => m.SUSPENSION_EN) },
} satisfies Record<string, DictionaryModule>;

export type DictionaryName = keyof typeof DICTIONARIES;

/**
 * Loads a chunk after its dictionaries. Name every dictionary the chunk's code needs, those of the section around it
 * included: the loader may start the chunk alongside its section. `load` must be `() => import('…')` written out, so
 * that the test of the dictionaries can follow it.
 */
export async function withDictionaries<T>(names: readonly DictionaryName[], load: () => Promise<T>): Promise<T> {
  if (locale === 'en') {
    const dicts = await Promise.all(names.map((name) => DICTIONARIES[name].load()));
    names.forEach((name, i) => registerDictionary(name, dicts[i]!));
  }
  return load();
}
