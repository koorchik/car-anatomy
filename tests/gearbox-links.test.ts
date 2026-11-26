// The gearbox section in the site: it registers the pages a visitor can open, and the article of the engine of a car
// with such a gearbox links to it (the whole-car plan's cross links, carsWithEngine).

import { describe, expect, it } from 'vitest';
import { engineById } from '../src/data/engines.ts';
import { GEARBOX_PAGE_NAMES } from '../src/data/gearbox-names.ts';
import { GEARBOX_PAGES } from '../src/data/gearboxes.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { pageShown, SECTIONS } from '../src/shell/registry.ts';
import { parseRoute } from '../src/shell/routes.ts';
import { articleHtml } from '../src/ui/article.ts';

describe('the gearbox section', () => {
  it('registers manual-rwd as its first page, so the menu has somewhere to go', () => {
    const entry = SECTIONS.find((s) => s.id === 'gearboxes')!;
    expect(entry.openPages?.[0]).toBe('manual-rwd');
    expect(entry.pages?.[0]?.href).toBe('#/gearboxes/manual-rwd');
    expect(pageShown('gearboxes', 'manual-rwd')).toBe(true);
    // Data without its page yet is not a page a link may go to.
    expect(pageShown('gearboxes', 'manual-transaxle')).toBe(false);
    expect(pageShown('suspensions', 'macpherson')).toBe(false);
    expect(pageShown('engines', 'i4')).toBe(true);
    for (const page of entry.openPages ?? []) {
      const data = GEARBOX_PAGES.find((p) => p.id === page);
      expect(data?.article, page).toBeDefined();
      // Links name the gearbox without its data: the name they use is the record's.
      expect(GEARBOX_PAGE_NAMES[page], page).toBe(data!.base.name);
    }
    expect(parseRoute('#/gearboxes/manual-rwd')).toMatchObject({ section: 'gearboxes', page: 'catalogue', path: ['manual-rwd'] });
  });

  it('is named in the article of the BMW M3 E30 engine, and in no other', () => {
    const s14 = articleHtml(buildEngine(engineById('i4/bmw-m3-e30-s14')!));
    expect(s14).toContain('href="#/gearboxes/manual-rwd">Getrag 265/5</a>');
    // The Civic's gearbox has data but no page yet: no row.
    expect(articleHtml(buildEngine(engineById('i4/civic-type-r-k20c1')!))).not.toContain('#/gearboxes/');
    expect(articleHtml(buildEngine(engineById('i4')!))).not.toContain('#/gearboxes/');
  });
});
