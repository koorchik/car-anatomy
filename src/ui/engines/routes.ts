// What the engines section reads from a route. Pure, so tests can check that every address opens what it did before
// the router.

import type { Route } from '../../shell/routes.ts';

export type EnginesPage = 'catalogue' | 'designer' | 'sump';

/** The engines page a route opens. Other sections and unknown addresses still show the catalogue, as they always did. */
export function enginesPage(route: Route): EnginesPage {
  if (route.section !== 'engines') return 'catalogue';
  return route.page === 'designer' || route.page === 'sump' ? route.page : 'catalogue';
}

/** The engine a catalogue address asks for, `page` or `page/variant`. Undefined leaves the choice to the page. */
export function catalogueEngineId(route: Route): string | undefined {
  if (route.section !== 'engines' || route.page !== 'catalogue' || !route.path.length) return undefined;
  return route.path.slice(0, 2).join('/');
}
