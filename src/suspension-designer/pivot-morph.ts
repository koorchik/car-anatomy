// The sweep slider of the pivot pages (suspensions plan, the travel scene, step 9): one angle of the pivot axis from 0°
// to 90° turns a trailing arm into a semi-trailing arm and into a swing axle, and the roll centre climbs from the road
// to about the height of the axis.
//
// A design holds one layout, and the designer keeps each inside its own range (constraints.ts: a semi-trailing arm
// from 5° to 45°, a swing axle's inner pivot at the wheel's plane). The morph passes between them, so it does not go
// through resolveChassis: the design for an angle takes the inner pivot of the layouts' typical geometry
// (PIVOT_TYPICAL) interpolated by the angle, keeps everything else of the car, and goes straight to chassisToSpec. At
// the design's own angle it is the design itself, so the slider starts from the corner the page shows. No visitor
// text here.

import type { CornerSpec } from '../suspension/spec.ts';
import { newCornerSample } from '../suspension/kinematics.ts';
import { CornerSolver } from '../suspension/solve.ts';
import { Axle } from '../suspension/kinematics.ts';
import { PIVOT_TYPICAL, pivotLayout, type PivotLayout } from '../suspension/templates/pivot.ts';
import type { PivotLinkage } from '../suspension/spec.ts';
import { axleGeometryOf } from './geometry.ts';
import { designCorner, specCorner } from './page-cars.ts';
import { chassisToSpec } from './to-spec.ts';
import { axleOf, isPivot, withAxle, type AxleEnd, type ChassisDesign } from './design.ts';

/** The anchors of the morph: each layout's typical inner pivot at its typical sweep, mm. */
const ANCHORS: ReadonlyArray<{ sweepDeg: number; armMm: number; yMm: number }> = (['trailing-arm', 'semi-trailing', 'swing-axle'] as const).map(
  (l: PivotLayout) => ({ sweepDeg: PIVOT_TYPICAL[l].sweepDeg, armMm: PIVOT_TYPICAL[l].armM * 1000, yMm: PIVOT_TYPICAL[l].pivotYM * 1000 }),
);

/** The inner pivot (ahead of the wheel centre, from the centre line) the morph gives at `sweepDeg`, mm. */
export function morphPivot(sweepDeg: number): { armMm: number; yMm: number } {
  const s = Math.min(90, Math.max(0, sweepDeg));
  let i = 0;
  while (i < ANCHORS.length - 2 && s > ANCHORS[i + 1]!.sweepDeg) i++;
  const a = ANCHORS[i]!;
  const b = ANCHORS[i + 1]!;
  const x = (s - a.sweepDeg) / (b.sweepDeg - a.sweepDeg);
  // The pivot's distance from the centre line eases out: arriving at the next anchor with no slope, it never pulls the
  // instant centre back outboard, so the roll centre climbs all the way (a straight blend overshoots by 3 mm near 80°).
  const ease = 1 - (1 - x) * (1 - x);
  return { armMm: a.armMm + (b.armMm - a.armMm) * x, yMm: a.yMm + (b.yMm - a.yMm) * ease };
}

/** The sweep of a design's pivot axle, degrees; null when that axle is not a single pivot. */
export function designSweep(design: ChassisDesign, end: AxleEnd): number | null {
  const a = axleOf(design, end);
  return isPivot(a.layout) ? a.sweepDeg : null;
}

/** The design with its pivot axle turned to `sweepDeg` (see the header); the design itself at its own sweep. */
export function morphDesign(design: ChassisDesign, end: AxleEnd, sweepDeg: number): ChassisDesign {
  const own = designSweep(design, end);
  if (own === null) throw new Error(`The ${end} axle is not a single pivot`);
  const sweep = Math.min(90, Math.max(0, sweepDeg));
  if (sweep === own) return design;
  const pivot = morphPivot(sweep);
  return withAxle(design, end, { layout: pivotLayout(sweep), sweepDeg: sweep, pivotArmMm: pivot.armMm, pivotYMm: pivot.yMm });
}

/** The corner of the design turned to `sweepDeg`: the page's own corner at the design's sweep. */
export function morphCorner(design: ChassisDesign, end: AxleEnd, sweepDeg: number): CornerSpec {
  const turned = morphDesign(design, end, sweepDeg);
  return turned === design ? designCorner(design, end) : specCorner(turned, chassisToSpec(turned), end);
}

/** The roll centre at design and the height of the pivot axis above the road, mm, at each sweep of `sweeps`. */
export function rollCentreBySweep(design: ChassisDesign, end: AxleEnd, sweeps: readonly number[]): Array<{ sweepDeg: number; rcMm: number; pivotMm: number }> {
  const s = newCornerSample();
  return sweeps.map((sweepDeg) => {
    const d = morphDesign(design, end, sweepDeg);
    const g = axleGeometryOf(axleOf(d, end), end, d.drive, d.wheelbaseMm);
    if (g instanceof Error) throw g;
    const spec = g.spec;
    if (spec.linkage.kind !== 'pivot') throw new Error('A pivot design gave another axle');
    const axle = new Axle({ ...spec, linkage: spec.linkage as PivotLinkage }, { table: false });
    axle.measure(CornerSolver.identity(), 0, 0, s);
    return { sweepDeg, rcMm: s.rcHeight * 1000, pivotMm: (spec.linkage as PivotLinkage).axisA[2] * 1000 };
  });
}
