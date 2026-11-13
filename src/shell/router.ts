// The only code that writes the address. A page records its state with replace() (the same history entry, no
// hashchange) and goes elsewhere with push() (a new entry and the hashchange that opens it). Both keep the visitor's
// context, car= and ret=, unless the call drops it on purpose: a page rewriting its own address must not lose the way
// back to the car the visitor came from.

import { CONTEXT_KEYS, formatRoute, parseRoute, type Route } from './routes.ts';

/** Where to go. A query value of null drops that key, the context keys included. */
export interface RouteTarget {
  section: Route['section'];
  page: string;
  path: string[];
  query?: Record<string, string | null>;
}

/** Changes to the current route: what is left out stays as it is, the whole query included. */
export type RoutePatch = Partial<RouteTarget>;

/** What the router needs of the browser, so that tests can hand it a stand-in. */
export interface RouterWindow {
  location: { hash: string; readonly origin: string; readonly pathname: string; readonly search: string };
  history: { replaceState(data: unknown, unused: string, url?: string | null): void };
}

/** The query of a target over the current one: its own keys, then the context the target does not mention. */
function withContext(current: Record<string, string>, query: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) if (value !== null) out[key] = value;
  for (const key of CONTEXT_KEYS) {
    const value = current[key];
    if (!Object.hasOwn(query, key) && value !== undefined) out[key] = value;
  }
  return out;
}

export class Router {
  private readonly win: () => RouterWindow;

  constructor(win: () => RouterWindow) {
    this.win = win;
  }

  /** The route the address bar holds now. */
  get current(): Route {
    return parseRoute(this.win().location.hash);
  }

  /** Rewrites the address in place: no history entry and no hashchange. */
  replace(patch: RoutePatch): void {
    const now = this.current;
    const hash = formatRoute({
      section: patch.section ?? now.section,
      page: patch.page ?? now.page,
      path: patch.path ?? now.path,
      query: patch.query ? withContext(now.query, patch.query) : now.query,
    });
    const win = this.win();
    if (win.location.hash !== hash) win.history.replaceState(null, '', hash);
  }

  /** Goes to a route: a new history entry, and the hashchange that opens it. */
  push(target: RouteTarget): void {
    this.win().location.hash = this.href(target);
  }

  /** The hash of a target with the visitor's context kept, for links within the site. */
  href(target: RouteTarget): string {
    return formatRoute({ section: target.section, page: target.page, path: target.path, query: withContext(this.current.query, target.query ?? {}) });
  }

  /** A whole address to share. The visitor's context belongs to their visit, not to the page, and stays out. */
  shareUrl(target: RouteTarget): string {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(target.query ?? {})) if (value !== null && !(CONTEXT_KEYS as readonly string[]).includes(key)) query[key] = value;
    const { origin, pathname, search } = this.win().location;
    return `${origin}${pathname}${search}${formatRoute({ section: target.section, page: target.page, path: target.path, query })}`;
  }
}

/** The router of the page. */
export const router = new Router(() => window);
