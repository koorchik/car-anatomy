// The pivot-axis pages (stage P5): a single pivot arm written as links moves as the closed form does, the sweep slider
// turns each page's design into the next layout and back, the roll centre climbs from the road to the height of the
// pivot axis, and the jacking lift grows with it.

import { describe, expect, it } from 'vitest';
import { SUSPENSION_PAGES } from '../src/data/suspensions.ts';
import { pageCorner, designCorner } from '../src/suspension-designer/page-cars.ts';
import { designSweep, morphCorner, morphDesign, rollCentreBySweep } from '../src/suspension-designer/pivot-morph.ts';
import { catalogueChassis } from '../src/suspension-designer/catalogue.ts';
import { Axle, newCornerSample } from '../src/suspension/kinematics.ts';
import { asLinksCorner } from '../src/suspension/pivot-links.ts';
import type { AxleSpec, PivotLinkage } from '../src/suspension/spec.ts';
import { curveAt, jackingLift, travelCurves } from '../src/suspension/travel-curves.ts';
import { semiTrailingArticleHtml } from '../src/ui/suspensions/articles/semi-trailing.ts';
import { swingAxleArticleHtml } from '../src/ui/suspensions/articles/swing-axle.ts';

const PIVOT_PAGES = SUSPENSION_PAGES.filter((p) => p.id === 'trailing-arm' || p.id === 'semi-trailing' || p.id === 'swing-axle');
const designs = PIVOT_PAGES.flatMap((p) => [
  { name: `${p.id} (typical)`, design: p.base.design!(), end: p.base.end },
  ...p.cars.map((c) => ({ name: c.link.car, design: c.design, end: c.link.end })),
]);

describe('the pivot-axis pages', () => {
  it('give each page its own corner and the typical design it comes from', () => {
    expect(PIVOT_PAGES.map((p) => p.id)).toEqual(['trailing-arm', 'semi-trailing', 'swing-axle']);
    for (const p of PIVOT_PAGES) {
      const corner = pageCorner(p, null);
      expect(corner.axle.layout).toBe(p.id);
      expect(corner.axle.linkage.rigidArm).toBeDefined();
      expect(designSweep(p.base.design!(), p.base.end)).not.toBeNull();
    }
  });

  it.each(designs.map((d) => [d.name, d] as const))('%s: the arm written as links moves as the closed form', (_name, d) => {
    const spec = catalogueChassis(d.design);
    const axleSpec = (d.end === 'F' ? spec.front : spec.rear).axle as AxleSpec<PivotLinkage>;
    expect(axleSpec.linkage.kind).toBe('pivot');
    const closed = new Axle(axleSpec, { table: false });
    const links = new Axle(asLinksCorner(axleSpec));
    const a = newCornerSample();
    const b = newCornerSample();
    for (const q of [-0.08, -0.04, 0, 0.04, 0.08]) {
      closed.measureAt(q, a);
      links.measureAt(q, b);
      expect(Math.abs(a.wheelY - b.wheelY), `wheel y at ${q}`).toBeLessThan(1e-6);
      expect(Math.abs(a.wheelZ - b.wheelZ), `wheel z at ${q}`).toBeLessThan(1e-6);
      expect(Math.abs(a.camber - b.camber), `camber at ${q}`).toBeLessThan(1e-6);
      expect(Math.abs(a.toe - b.toe), `toe at ${q}`).toBeLessThan(1e-6);
    }
  });

  it.each(designs.map((d) => [d.name, d] as const))('%s: the sweep slider gives a corner that solves at every angle', (_name, d) => {
    const own = designSweep(d.design, d.end)!;
    expect(morphDesign(d.design, d.end, own)).toBe(d.design);
    expect(morphCorner(d.design, d.end, own)).toEqual(designCorner(d.design, d.end));
    for (let sweep = 0; sweep <= 90; sweep += 10) {
      const corner = morphCorner(d.design, d.end, sweep);
      const curves = travelCurves(new Axle(corner.axle));
      expect(curves.camberDeg.every(Number.isFinite), `${sweep}°`).toBe(true);
    }
  });

  it('turns the layout with the angle: trailing arm at 0°, semi-trailing between, swing axle at 90°', () => {
    const d = PIVOT_PAGES[1]!.base.design!();
    expect(morphCorner(d, 'R', 0).axle.layout).toBe('trailing-arm');
    expect(morphCorner(d, 'R', 20).axle.layout).toBe('semi-trailing');
    expect(morphCorner(d, 'R', 90).axle.layout).toBe('swing-axle');
  });

  it.each(PIVOT_PAGES.map((p) => [p.id, p] as const))('%s: the roll centre climbs from the road to the pivot axis', (_id, p) => {
    const sweeps = Array.from({ length: 19 }, (_, i) => i * 5);
    const rows = rollCentreBySweep(p.base.design!(), p.base.end, sweeps);
    expect(Math.abs(rows[0]!.rcMm)).toBeLessThan(2);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.rcMm, `${rows[i]!.sweepDeg}°`).toBeGreaterThanOrEqual(rows[i - 1]!.rcMm - 0.5);
    const last = rows.at(-1)!;
    // The swing axle's joint stands off the centre line, so its roll centre is a little above the joint.
    expect(last.rcMm).toBeGreaterThanOrEqual(last.pivotMm);
    expect(last.rcMm).toBeLessThan(last.pivotMm * 1.4);
  });

  it('lifts the body by the sideways force times the slope of the force line, none on a trailing arm', () => {
    const s = newCornerSample();
    // A trailing arm's force line lies on the road.
    new Axle(pageCorner(PIVOT_PAGES[0]!, null).axle).measureAt(0, s);
    expect(Math.abs(jackingLift(3000, s.tanBeta))).toBeLessThan(1);
    // A swing axle's instant centre is its joint: the force line runs from the patch through it, whatever the solver.
    const swing = catalogueChassis(PIVOT_PAGES[2]!.base.design!()).rear.axle as AxleSpec<PivotLinkage>;
    const [, jointY, jointZ] = swing.linkage.axisA;
    new Axle(asLinksCorner(swing)).measureAt(0, s);
    const slope = (jointZ - s.contactZ) / (s.contactY - jointY);
    expect(jackingLift(3000, s.tanBeta)).toBeCloseTo(3000 * slope, 3);
    expect(jackingLift(3000, s.tanBeta)).toBeGreaterThan(1000);
  });

  it('quote in the articles what the pages\' own corners give', () => {
    const uk = (v: number, digits: number): string => v.toFixed(digits).replace('.', ',').replace('-', '−');
    const at = (id: string): { axle: Axle; curves: ReturnType<typeof travelCurves> } => {
      const axle = new Axle(pageCorner(PIVOT_PAGES.find((p) => p.id === id)!, null).axle);
      return { axle, curves: travelCurves(axle) };
    };
    const s = newCornerSample();
    const semi = at('semi-trailing');
    semi.axle.measureAt(0, s);
    const plunge0 = s.plunge;
    const semiText = semiTrailingArticleHtml();
    expect(semiText).toContain(`центр крену близько ${Math.round(s.rcHeight * 1000)} мм`);
    expect(semiText).toContain(`${uk((s.camberGain * 180) / Math.PI, 1)}° на метр ходу`);
    expect(semiText).toContain(`розвал ${uk(curveAt(semi.curves, 'camber', 0.12), 1)}°`);
    semi.axle.measureAt(0.12, s);
    expect(semiText).toContain(`на ${uk(Math.abs(s.plunge - plunge0) * 1000, 1)} мм`);
    const swing = at('swing-axle');
    const swingText = swingAxleArticleHtml();
    expect(swingText).toContain(`${uk(curveAt(swing.curves, 'camber', 0.12), 1)}° на +120 мм`);
    expect(swingText).toContain(`+${uk(curveAt(swing.curves, 'camber', -0.1), 1)}° на −100 мм`);
    expect(swingText).toContain(`колія ${uk(swing.axle.spec.wheelCentre[1] * 2, 2)} м`);
  });
});
