// What each suspension page shows of its corners, pinned: for the page's own corner and every car, the hardpoints the
// 3D draws, the masses and the tyre the scenes take, the four curves of the travel scene at a few points of the travel
// and the halfshaft's joints. If this fails, visitors get another suspension. Update a snapshot only for an intended
// change (vitest -u) and list it in the commit. Each page has its own file under __snapshots__/suspension-catalog/, so
// pages built in parallel do not touch one file (build order, shared files).

import { describe, expect, it } from 'vitest';
import { SUSPENSION_PAGES } from '../src/data/suspensions.ts';
import { pageCorner } from '../src/suspension-designer/page-cars.ts';
import { buildAxle } from '../src/suspension/kinematics.ts';
import type { CornerSpec, Vec3 } from '../src/suspension/spec.ts';
import { camberReversal, CURVE_IDS, curveAt, jointRange, travelCurves } from '../src/suspension/travel-curves.ts';

const r = (v: number, digits = 4): number => Math.round(v * 10 ** digits) / 10 ** digits || 0;
const p = (v: Vec3): number[] => v.map((x) => r(x));
const TRAVELS = [-0.08, -0.04, 0, 0.04, 0.08];

function shown(corner: CornerSpec) {
  const spec = corner.axle;
  const link = spec.linkage;
  const axle = buildAxle(spec);
  const curves = travelCurves(axle);
  const joints = jointRange(axle, 0);
  return {
    layout: spec.layout,
    track: r(spec.track),
    travel: spec.travel,
    wishbones: link.wishbones.map((w) => ({ id: w.id, front: p(w.front), rear: p(w.rear), ball: p(w.ball) })),
    rods: link.rods.map((rod) => ({ id: rod.id, body: p(rod.body), knuckle: p(rod.knuckle), steer: !!rod.steer })),
    strut: link.strut ? { top: p(link.strut.top), lower: p(link.strut.lower) } : null,
    knuckle: link.knuckle?.kind ?? 'plain',
    wheelCentre: p(spec.wheelCentre),
    spring: { rate: r(spec.spring.rate, 0), body: p(spec.spring.body) },
    halfshaft: spec.halfshaft ? { diffOutput: p(spec.halfshaft.diffOutput), outerJoint: p(spec.halfshaft.outerJoint) } : null,
    sprungKg: r(corner.sprungKg, 2),
    unsprungKg: corner.unsprungKg,
    tyre: corner.tyre,
    tyreRadiusM: corner.tyreRadiusM === null ? null : r(corner.tyreRadiusM),
    curves: Object.fromEntries(CURVE_IDS.map((id) => [id, TRAVELS.map((q) => r(curveAt(curves, id, q), 3))])),
    camberReversal: camberReversal(curves),
    joints: joints && { plungeMm: joints.plunge.map((v) => r(v * 1000, 1)), innerDeg: r(joints.innerDeg, 1), outerDeg: r(joints.outerDeg, 1) },
  };
}

describe.each(SUSPENSION_PAGES.map((page) => [page.id, page] as const))('the suspension page %s', (id, page) => {
  it('shows its corners as pinned', async () => {
    const corners = Object.fromEntries([null, ...page.cars].map((car) => [car?.link.car ?? 'page', shown(pageCorner(page, car))]));
    // Arrays of numbers on one line each, so a changed point reads as one line of the diff.
    const text = JSON.stringify(corners, null, 1).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_m, inner: string) => `[${inner.replace(/\s+/g, ' ')}]`);
    await expect(text).toMatchFileSnapshot(`./__snapshots__/suspension-catalog/${id}.json`);
  });
});
