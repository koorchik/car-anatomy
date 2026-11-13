import { describe, expect, it } from 'vitest';
import { CATALOGUE, engineById, pageChoices } from '../src/data/engines.ts';
import { decodeDesign, encodeDesign } from '../src/designer/codec.ts';
import type { Design } from '../src/designer/design.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { CONTEXT_KEYS, formatRoute, HOME, parseRoute, PATTERNS, QUERY_KEYS, RESERVED, type Route, type SectionId } from '../src/shell/routes.ts';
import { DesignerPage } from '../src/ui/designer/designer-page.ts';
import { catalogueEngineId, enginesPage } from '../src/ui/engines/routes.ts';
import { SumpPage } from '../src/ui/sump/sump-page.ts';

const DEFAULT_ENGINE = 'v8-cross';
const PAGE_IDS = CATALOGUE.map((entry) => entry.id);
/** Every page of the catalogue and every real engine on it, as `page` and `page/variant`. */
const ENGINE_IDS = PAGE_IDS.flatMap((id) => pageChoices(id).map((choice) => choice.id));
const CODES = PAGE_IDS.map((id) => encodeDesign(designFromSpec(engineById(id)!)));

// What main.ts, DesignerPage and SumpPage did with the address before the router, kept as the reference.
const legacy = {
  opens(hash: string): 'catalogue' | 'designer' | 'sump' {
    if (hash.startsWith('#/sump')) return 'sump';
    if (hash.startsWith('#/designer')) return 'designer';
    return 'catalogue';
  },
  engine(hash: string): string {
    const match = /^#\/engines\/([\w-]+(?:\/[\w-]+)?)/.exec(hash);
    const wanted = match?.[1];
    return ((wanted && (engineById(wanted) ?? engineById(wanted.split('/')[0]!))) || engineById(DEFAULT_ENGINE)!).id;
  },
  /** Local storage is the fallback; Node has none, so that branch gives null here and in the new code alike. */
  design(hash: string): Design | null {
    const rest = hash.replace(/^#\/designer\/?/, '');
    if (rest.startsWith('from/')) {
      const spec = engineById(rest.slice(5));
      return spec ? designFromSpec(spec) : null;
    }
    return rest ? decodeDesign(rest) : null;
  },
  sump(hash: string): { path: string; params: Array<[string, string]> } {
    const [path, query] = hash.replace(/^#\/sump\/?/, '').split('?');
    return { path: path ?? '', params: [...new URLSearchParams(query ?? '')] };
  },
};

/** How main.ts picks the catalogue engine from a route, with the fallbacks it always had. */
const engineOf = (route: Route): string => {
  const wanted = catalogueEngineId(route);
  return ((wanted && (engineById(wanted) ?? engineById(wanted.split('/')[0]!))) || engineById(DEFAULT_ENGINE)!).id;
};

const HASHES = [
  '',
  '#',
  '#/',
  '#/engines',
  '#/engines/',
  '#/engines/no-such-engine',
  `#/engines/${DEFAULT_ENGINE}/no-such-variant`,
  ...ENGINE_IDS.map((id) => `#/engines/${id}`),
  ...ENGINE_IDS.map((id) => `#/engines/${id}?car=civic-type-r-fk8`),
  '#/designer',
  '#/designer/',
  '#/designer/from/no-such-engine',
  ...ENGINE_IDS.map((id) => `#/designer/from/${id}`),
  ...CODES.map((code) => `#/designer/${code}`),
  '#/designer/not-a-design',
  '#/sump',
  ...ENGINE_IDS.map((id) => `#/sump/${id}`),
  ...ENGINE_IDS.slice(0, 8).map((id) => `#/sump/${id}?k=dry&t=slick&o=-1&a=1&w=rear`),
  `#/sump/design/${CODES[0]}`,
  `#/sump/design/${CODES[1]}?k=baffled&t=semi&o=0&a=0&w=front`,
  // Sections that have no pages yet open the engines' catalogue, as any unknown address did.
  '#/gearboxes',
  '#/gearboxes/manual-rwd',
  '#/suspensions/macpherson/civic-type-r-fk8',
  '#/car/civic-type-r-fk8?focus=gearbox',
  '#/no-such-section/x',
];

describe('routes', () => {
  it('opens every address on the page it opened before the router', () => {
    for (const hash of HASHES) {
      const route = parseRoute(hash);
      const page = legacy.opens(hash);
      expect(enginesPage(route), hash).toBe(page);
      if (page === 'catalogue') expect(engineOf(route), hash).toBe(legacy.engine(hash));
      if (page === 'designer') expect(DesignerPage.designFromRoute(route), hash).toEqual(legacy.design(hash));
      if (page === 'sump') {
        const was = legacy.sump(hash);
        expect(route.path.join('/'), hash).toBe(was.path);
        expect(Object.entries(route.query), hash).toEqual(was.params);
      }
    }
  });

  it('finds every engine and variant of the catalogue on the oil page and in the designer', () => {
    for (const id of ENGINE_IDS) {
      expect(engineOf(parseRoute(`#/engines/${id}`)), id).toBe(id);
      expect(DesignerPage.designFromRoute(parseRoute(`#/designer/from/${id}`)), id).toEqual(designFromSpec(engineById(id)!));
      const { source } = SumpPage.parse(parseRoute(`#/sump/${id}`));
      // A rotary has no wet sump to slosh: the oil page never took one.
      if (engineById(id)!.layout.kind === 'wankel') expect(source, id).toBeNull();
      else expect(source?.kind === 'car' && source.car.engineId, id).toBe(id);
    }
    const { source } = SumpPage.parse(parseRoute(`#/sump/design/${CODES[0]}?k=dry`));
    expect(source?.kind === 'design' && source.code).toBe(CODES[0]);
  });

  it('keeps a design code clear of the query', () => {
    const code = CODES[2]!;
    const plain = DesignerPage.designFromRoute(parseRoute(`#/designer/${code}`));
    expect(plain).not.toBeNull();
    expect(DesignerPage.designFromRoute(parseRoute(`#/designer/${code}?car=civic-type-r-fk8&ret=car`))).toEqual(plain);
  });

  it('formats what it parses and parses what it formats', () => {
    for (const hash of HASHES) {
      const route = parseRoute(hash);
      expect(parseRoute(formatRoute(route)), hash).toEqual(route);
    }
    for (const pattern of PATTERNS) {
      for (const path of [[], ['some-page'], ['some-page', 'some-variant']]) {
        const route: Route = { section: pattern.section, page: pattern.page, path, query: { m: 'drive', ls: '1250.5', car: 'civic-type-r-fk8', note: 'a b&c' } };
        expect(parseRoute(formatRoute(route))).toEqual(route);
      }
    }
  });

  it('opens the engines on the empty address and nothing on an unknown one', () => {
    for (const hash of ['', '#', '#/', '#?lang=en']) expect(parseRoute(hash)).toMatchObject({ section: HOME.section, page: HOME.page, path: [] });
    expect(parseRoute('#/no-such-section/x?y=1')).toEqual({ section: 'not-found', page: '', path: ['no-such-section', 'x'], query: { y: '1' } });
    expect(parseRoute('#/gearboxes/designer/abc')).toMatchObject({ section: 'gearboxes', page: 'designer', path: ['abc'] });
    expect(parseRoute('#/suspensions/designer')).toMatchObject({ section: 'suspensions', page: 'designer', path: [] });
    expect(parseRoute('#/car')).toMatchObject({ section: 'car', page: 'overview', path: [] });
  });

  it('keeps ids clear of the words the addresses use', () => {
    for (const id of ENGINE_IDS) {
      for (const word of id.split('/')) expect(RESERVED.engines, id).not.toContain(word);
    }
  });

  it('has one table of query keys without two meanings for one key', () => {
    const keys = QUERY_KEYS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of CONTEXT_KEYS) expect(keys).toContain(key);
    const sections: SectionId[] = ['car', 'engines', 'gearboxes', 'suspensions'];
    for (const k of QUERY_KEYS) {
      expect(k.sections.length, k.key).toBeGreaterThan(0);
      for (const s of k.sections) expect(sections, k.key).toContain(s);
      for (const s of Object.keys(k.values ?? {})) expect(k.sections, k.key).toContain(s);
    }
  });
});
