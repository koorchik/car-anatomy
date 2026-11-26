// The menu (src/shell/menu-model.ts) is built from the sections' registry: a section's item is a link once it registers
// a page and says «готуємо» until then, every engine page has a tab, and «← До авто» follows car= on any page.

import { describe, expect, it } from 'vitest';
import { backToCar, menuItems, routeEntry } from '../src/shell/menu-model.ts';
import { SECTIONS, type SectionEntry } from '../src/shell/registry.ts';
import { parseRoute } from '../src/shell/routes.ts';
import { enginesPage } from '../src/ui/engines/routes.ts';

const fake = (id: SectionEntry['id'], pages: SectionEntry['pages']): SectionEntry => ({ id, pages, load: () => Promise.reject(new Error('not in a test')) });

describe('menu', () => {
  it('shows the sections in the plan order, with «готуємо» for those without a page and no car yet', () => {
    const items = menuItems(SECTIONS, parseRoute('#/engines/i4'));
    // Written against the registry, so a section that registers its page later does not have to edit this test.
    const ready = (id: string): boolean => (SECTIONS.find((s) => s.id === id)?.pages?.length ?? 0) > 0;
    const expected = (['car', 'engines', 'gearboxes', 'suspensions'] as const).filter((id) => id !== 'car' || ready(id)).map((id) => [id, ready(id), id === 'engines']);
    expect(items.map((item) => [item.id, item.href !== null, item.current])).toEqual(expected);
    expect(items.find((item) => item.id === 'engines')!.href).not.toBeNull();
  });

  it('turns a section into a link once it registers a visible page, and not before', () => {
    const hidden = menuItems([...SECTIONS, fake('suspensions', [])], parseRoute('#/suspensions'));
    expect(hidden.find((item) => item.id === 'suspensions')).toMatchObject({ href: null, current: false });
    // The first entry of a section wins, so the stand-ins go before the registry's own, which may have no page yet.
    const shown = menuItems([fake('gearboxes', [{ key: 'catalogue', href: '#/gearboxes/manual-rwd' }]), fake('car', [{ key: 'overview', href: '#/car' }]), ...SECTIONS], parseRoute('#/gearboxes/manual-rwd'));
    expect(shown.map((item) => item.id)).toEqual(['car', 'engines', 'gearboxes', 'suspensions']);
    expect(shown.find((item) => item.id === 'gearboxes')).toMatchObject({ href: '#/gearboxes/manual-rwd', current: true });
    expect(shown.find((item) => item.id === 'engines')!.current).toBe(false);
  });

  it('reaches every page of the engines from its tabs, and marks the one shown', () => {
    const tabs = (hash: string) => menuItems(SECTIONS, parseRoute(hash)).find((item) => item.id === 'engines')!.tabs;
    const pages = tabs('#/engines/i4').map((tab) => enginesPage(parseRoute(tab.href)));
    expect(pages).toEqual(['catalogue', 'designer', 'sump']);
    expect(tabs('#/engines/i4').map((tab) => tab.current)).toEqual([true, false, false]);
    expect(tabs('#/designer/from/i4').map((tab) => tab.current)).toEqual([false, true, false]);
    expect(tabs('#/sump/i4?k=dry').map((tab) => tab.current)).toEqual([false, false, true]);
    expect(tabs('#/engines/i4').map((tab) => tab.label)).toEqual(['Каталог', 'Свій двигун', 'Олива на треку']);
  });

  it('lets the router put the visitor context on every link', () => {
    const items = menuItems(SECTIONS, parseRoute('#/designer?car=civic-type-r-fk8'), (hash) => `${hash}?car=civic-type-r-fk8`);
    expect(items[0]!.href).toBe('#/engines/v8-cross?car=civic-type-r-fk8');
    expect(items[0]!.tabs.map((tab) => tab.href)).toEqual(['#/engines/v8-cross?car=civic-type-r-fk8', '#/designer?car=civic-type-r-fk8', '#/sump?car=civic-type-r-fk8']);
  });

  it('leads back to the car the visitor came from, with the system of the page in focus', () => {
    expect(backToCar(parseRoute('#/designer?car=civic-type-r-fk8'))).toBe('#/car/civic-type-r-fk8?focus=engine');
    expect(backToCar(parseRoute('#/engines/i4/civic-type-r-k20c1?car=civic-type-r-fk8&ret=car'))).toBe('#/car/civic-type-r-fk8?focus=engine');
    expect(backToCar(parseRoute('#/sump/i4?car=civic-type-r-fk8&k=dry'))).toBe('#/car/civic-type-r-fk8?focus=oil');
    expect(backToCar(parseRoute('#/gearboxes/manual-transaxle?car=civic-type-r-fk8'))).toBe('#/car/civic-type-r-fk8?focus=gearbox');
    expect(backToCar(parseRoute('#/designer'))).toBeNull();
    expect(backToCar(parseRoute('#/car/civic-type-r-fk8?car=civic-type-r-fk8'))).toBeNull();
  });

  it('finds no section for an unknown address or for a section not built yet, so the card shows instead', () => {
    expect(routeEntry(parseRoute('#/no/such/page'), SECTIONS)).toBeNull();
    expect(routeEntry(parseRoute('#/no-such-section/x'), [SECTIONS[0]!])).toBeNull();
    expect(routeEntry(parseRoute('#/gearboxes/manual-rwd'), [SECTIONS[0]!])).toBeNull();
    expect(routeEntry(parseRoute('#/car/civic-type-r-fk8'), [SECTIONS[0]!])).toBeNull();
    for (const hash of ['', '#/', '#/engines/i4', '#/designer', '#/sump/i4']) expect(routeEntry(parseRoute(hash), SECTIONS)?.id, hash).toBe('engines');
  });
});
