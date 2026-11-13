// Every address of the site in one table: which section and page an address opens, and the address of a route.
// A pure module without the DOM, so it is tested in Node. The table follows the address scheme of the whole-car plan
// (docs/superpowers/plans/2026-11-12-whole-car.md).

export type SectionId = 'car' | 'engines' | 'gearboxes' | 'suspensions';

export interface Route {
  section: SectionId | 'not-found';
  /** The page of the section: 'catalogue', 'designer', 'sump' or 'overview'. Empty for an address nobody knows. */
  page: string;
  /** What follows the page's own words, split at the slashes: an engine and its variant, a design's code. */
  path: string[];
  /** The keys after `?` inside the hash. The language stays in the real query before `#` and is not here. */
  query: Record<string, string>;
}

interface Pattern {
  section: SectionId;
  page: string;
  /** The words the address starts with. */
  prefix: readonly string[];
}

/** In the order of the plan's table, where the first match wins: a section's designer comes before its catalogue. */
export const PATTERNS: readonly Pattern[] = [
  { section: 'engines', page: 'catalogue', prefix: ['engines'] },
  { section: 'engines', page: 'designer', prefix: ['designer'] },
  { section: 'engines', page: 'sump', prefix: ['sump'] },
  { section: 'gearboxes', page: 'designer', prefix: ['gearboxes', 'designer'] },
  { section: 'gearboxes', page: 'catalogue', prefix: ['gearboxes'] },
  { section: 'suspensions', page: 'designer', prefix: ['suspensions', 'designer'] },
  { section: 'suspensions', page: 'catalogue', prefix: ['suspensions'] },
  { section: 'car', page: 'designer', prefix: ['car', 'designer'] },
  { section: 'car', page: 'overview', prefix: ['car'] },
];

/** What the empty address opens: the engines, until the overview of a car takes the root of the site. */
export const HOME: { readonly section: SectionId; readonly page: string } = { section: 'engines', page: 'catalogue' };

/** Words a section's own addresses use, so no id in its paths may be one of them. */
export const RESERVED: Readonly<Record<SectionId, readonly string[]>> = {
  // #/sump/design/<code> is a design, #/sump/<engine> an engine.
  engines: ['design'],
  gearboxes: ['designer'],
  suspensions: ['designer'],
  car: ['designer'],
};

export interface QueryKey {
  key: string;
  /** Sections whose addresses carry it. */
  sections: readonly SectionId[];
  meaning: string;
  /** The values it takes, where they are a fixed set. */
  values?: Partial<Record<SectionId, readonly string[]>>;
}

/** One table for the keys of every section, so that one key never means two things. */
export const QUERY_KEYS: readonly QueryKey[] = [
  { key: 'm', sections: ['engines', 'gearboxes', 'car'], meaning: 'mode of the page', values: { engines: ['dyno'], gearboxes: ['table', 'drive'], car: ['lift', 'lap', 'drive'] } },
  {
    key: 's',
    sections: ['suspensions'],
    meaning: 'scene of the suspension page',
    values: { suspensions: ['bump', 'road', 'shaker', 'travel', 'roll', 'pitch', 'lap', 'tyre', 'handling', 'steering', 'springs', 'active'] },
  },
  { key: 'demo', sections: ['gearboxes'], meaning: 'demonstration of the gearbox' },
  { key: 'ls', sections: ['engines', 'suspensions', 'car'], meaning: 'metres from the start of the canonical circuit: the moment shared by links between pages' },
  { key: 'lt', sections: ['engines'], meaning: "seconds into the oil page's own lap, only within that page" },
  { key: 'k', sections: ['engines'], meaning: 'sump of the oil page' },
  { key: 't', sections: ['engines', 'suspensions', 'car'], meaning: 'tyres' },
  { key: 'o', sections: ['engines'], meaning: 'oil level of the oil page, litres from full' },
  { key: 'a', sections: ['engines'], meaning: 'oil accumulator of the oil page', values: { engines: ['0', '1'] } },
  { key: 'w', sections: ['engines'], meaning: "where the oil page's sump has its well", values: { engines: ['front', 'middle', 'rear'] } },
  { key: 'focus', sections: ['car'], meaning: 'system in focus on the overview' },
  { key: 'l', sections: ['engines'], meaning: 'systems layers shown, comma-separated' },
  { key: 'car', sections: ['engines', 'gearboxes', 'suspensions'], meaning: 'the car the visitor came from: context and the way back' },
  { key: 'ret', sections: ['engines', 'gearboxes', 'suspensions'], meaning: 'came from the car designer', values: { engines: ['car'], gearboxes: ['car'], suspensions: ['car'] } },
];

/** The visitor's context: it rides along every address the router writes, unless a call drops it. */
export const CONTEXT_KEYS = ['car', 'ret'] as const;

const decodeWord = (word: string): string => {
  try {
    return decodeURIComponent(word);
  } catch {
    return word;
  }
};

/** The first value of each key wins, as URLSearchParams.get() gives it. */
function parseQuery(text: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (key !== '__proto__' && !Object.hasOwn(query, key)) query[key] = value;
  }
  return query;
}

/** Reads `location.hash`, with or without its `#`. An address nobody knows gives section 'not-found'. */
export function parseRoute(hash: string): Route {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const at = text.indexOf('?');
  const words = (at < 0 ? text : text.slice(0, at))
    .split('/')
    .filter((word) => word !== '')
    .map(decodeWord);
  const query = parseQuery(at < 0 ? '' : text.slice(at + 1));
  if (!words.length) return { section: HOME.section, page: HOME.page, path: [], query };
  for (const pattern of PATTERNS) {
    if (pattern.prefix.every((word, i) => words[i] === word)) return { section: pattern.section, page: pattern.page, path: words.slice(pattern.prefix.length), query };
  }
  return { section: 'not-found', page: '', path: words, query };
}

/** The hash of a route, `#/…`. Keys keep their order; parseRoute(formatRoute(r)) gives r back. */
export function formatRoute(route: Route): string {
  const pattern = PATTERNS.find((p) => p.section === route.section && p.page === route.page);
  const words = [...(pattern?.prefix ?? []), ...route.path].map(encodeURIComponent);
  const query = new URLSearchParams(Object.entries(route.query)).toString();
  return `#/${words.join('/')}${query ? `?${query}` : ''}`;
}
