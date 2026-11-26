// What the engines section reads from a route. Pure, so tests can check that every address opens what it did before
// the router.

import type { LayerId } from '../../scene/systems/styles.ts';
import type { Route } from '../../shell/routes.ts';

export type EnginesPage = 'catalogue' | 'designer' | 'sump';

/** The engine the catalogue opens without an id, and where the menu's engines item leads. */
export const DEFAULT_ENGINE = 'v8-cross';

/** The engines page a route opens. Other sections and unknown addresses still show the catalogue, as they always did. */
export function enginesPage(route: Route): EnginesPage {
  if (route.section !== 'engines') return 'catalogue';
  return route.page === 'designer' || route.page === 'sump' ? route.page : 'catalogue';
}

/** The systems layers in the order of their keys, 4 to 7, as `l=` lists them. */
export const LAYER_IDS: readonly LayerId[] = ['oil', 'coolant', 'fuel', 'air'];

/** The layers an address asks for (`l=oil,coolant`), in the order of their keys; null when it does not say. */
export function routeLayers(route: Route): LayerId[] | null {
  const asked = route.query.l;
  if (asked === undefined) return null;
  const words = asked.split(',');
  return LAYER_IDS.filter((id) => words.includes(id));
}

/** The keys that say what the catalogue and the designer show on top of the engine: the dyno and the layers. */
export function featureQuery(dyno: boolean, layers: readonly LayerId[]): { m: string | null; l: string | null } {
  return { m: dyno ? 'dyno' : null, l: layers.length ? LAYER_IDS.filter((id) => layers.includes(id)).join(',') : null };
}

/** Those keys of a route as they stand, for a page that rewrites its own address and keeps them (the designer). */
export function keptFeatures(route: Route): { m: string | null; l: string | null } {
  return { m: route.query.m ?? null, l: route.query.l ?? null };
}

/** The engine a catalogue address asks for, `page` or `page/variant`. Undefined leaves the choice to the page. */
export function catalogueEngineId(route: Route): string | undefined {
  if (route.section !== 'engines' || route.page !== 'catalogue' || !route.path.length) return undefined;
  return route.path.slice(0, 2).join('/');
}
