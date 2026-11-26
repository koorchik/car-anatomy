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
import { gearboxArticleHtml } from '../src/ui/gearboxes/article.ts';

describe('the gearbox section', () => {
  it('registers manual-rwd as its first page, so the menu has somewhere to go', () => {
    const entry = SECTIONS.find((s) => s.id === 'gearboxes')!;
    expect(entry.openPages?.[0]).toBe('manual-rwd');
    // The menu's item leads there (O3 builds the menu from the registry).
    expect(entry.pages?.[0]?.href).toBe('#/gearboxes/manual-rwd');
    expect(pageShown('gearboxes', 'manual-rwd')).toBe(true);
    // The transaxle page (stage K6a-geom), with its variant at page/variant.
    expect(entry.openPages).toContain('manual-transaxle');
    expect(pageShown('gearboxes', 'manual-transaxle')).toBe(true);
    expect(parseRoute('#/gearboxes/manual-transaxle/porsche-911-carrera-t-992')).toMatchObject({ section: 'gearboxes', page: 'catalogue', path: ['manual-transaxle', 'porsche-911-carrera-t-992'] });
    // Data without its page yet is not a page a link may go to.
    expect(pageShown('gearboxes', 'differential')).toBe(false);
    expect(pageShown('suspensions', 'twist-beam')).toBe(false);
    expect(pageShown('engines', 'i4')).toBe(true);
    for (const page of entry.openPages ?? []) {
      const data = GEARBOX_PAGES.find((p) => p.id === page);
      expect(data?.article, page).toBeDefined();
      // Links name the gearbox without its data: the name they use is the record's.
      expect(GEARBOX_PAGE_NAMES[page], page).toBe(data!.base.name);
      for (const variant of data!.variants) expect(GEARBOX_PAGE_NAMES[variant.id], variant.id).toBe(variant.name);
    }
    expect(parseRoute('#/gearboxes/manual-rwd')).toMatchObject({ section: 'gearboxes', page: 'catalogue', path: ['manual-rwd'] });
  });

  it('is named in the articles of the engines of the M3 E30, the Civic Type R and the 911 Carrera T, and in no other', () => {
    const s14 = articleHtml(buildEngine(engineById('i4/bmw-m3-e30-s14')!));
    expect(s14).toContain('href="#/gearboxes/manual-rwd">Getrag 265/5</a>');
    expect(articleHtml(buildEngine(engineById('i4/civic-type-r-k20c1')!))).toContain('href="#/gearboxes/manual-transaxle">Honda 6MT</a>');
    // A variant's link leads to page/variant.
    expect(articleHtml(buildEngine(engineById('b6/porsche-992-carrera-3-0')!))).toContain('href="#/gearboxes/manual-transaxle/porsche-911-carrera-t-992">Porsche 7MT</a>');
    expect(articleHtml(buildEngine(engineById('i4')!))).not.toContain('#/gearboxes/');
  });

  it('prints each record\'s published ratios to one precision, the most places any of them has', () => {
    const published = (id: string): string => {
      const page = GEARBOX_PAGES.find((p) => id === p.id || id.startsWith(`${p.id}/`))!;
      const record = [page.base, ...page.variants].find((r) => r.id === id)!;
      const html = gearboxArticleHtml({ page, record, car: null, ratios: [], reverse: null, finalDrive: null, engine: null, tyre: '', rollingRadiusMm: null, demo: false });
      return html.match(/Опубліковані числа: ([^.]*\d)\./)![1]!;
    };
    // The Getrag 265/5's fifth is published as 1.000 among three-place figures.
    expect(published('manual-rwd')).toBe('3,717 · 2,404 · 1,766 · 1,264 · 1,000');
    expect(published('manual-transaxle')).toBe('3,625 · 2,115 · 1,529 · 1,125 · 0,911 · 0,734');
    // Porsche publishes two places.
    expect(published('manual-transaxle/porsche-911-carrera-t-992')).toBe('3,91 · 2,29 · 1,58 · 1,18 · 0,94 · 0,79 · 0,62');
  });
});
