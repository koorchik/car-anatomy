// Forces the links put on the knuckle (knuckle-statics.ts): at rest the tyre, the spring and the links hold the wheel
// with nothing left over, and every force and moment on the knuckle balances.

import { describe, expect, it } from 'vitest';
import { G } from '../src/suspension/forces.ts';
import { KnuckleStatics } from '../src/suspension/knuckle-statics.ts';
import { factorySetup, resolveCorner } from '../src/suspension/setup.ts';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';

const corner = jtektCorner();
const r = resolveCorner(corner, factorySetup(corner));
const axle = r.axle;
const spec = axle.spec;
const strut = spec.linkage.strut!;
const top = [strut.top[0], strut.top[1], strut.top[2]];

/** The knuckle at rest with the tyre, the strut (spring) and the unsprung weight on it. */
function atRest(): { statics: KnuckleStatics; applied: Array<{ p: number[]; f: number[] }>; pose: Float64Array } {
  const travel = r.staticTravelM;
  const pose = axle.measureAt(travel, { ...r.atRest });
  const s = r.atRest;
  const lower = [0, 0, 0];
  axle.knucklePoint(pose, strut.lower, lower);
  const len = Math.hypot(top[0] - lower[0], top[1] - lower[1], top[2] - lower[2]);
  const down = [(lower[0] - top[0]) / len, (lower[1] - top[1]) / len, (lower[2] - top[2]) / len];
  const strutN = r.spring.staticN;
  const applied = [
    { p: [s.contactX, s.contactY, s.contactZ], f: [0, 0, (r.sprungKg + r.unsprungKg) * G] },
    { p: lower, f: down.map((d) => d * strutN) },
    { p: [s.wheelX, s.wheelY, s.wheelZ], f: [0, 0, -r.unsprungKg * G] },
  ];
  const statics = new KnuckleStatics(axle);
  statics.begin(pose, travel, 0);
  for (const a of applied) statics.force(a.p[0]!, a.p[1]!, a.p[2]!, a.f[0]!, a.f[1]!, a.f[2]!);
  expect(statics.solve()).toBe(true);
  return { statics, applied, pose };
}

describe('knuckle statics', () => {
  it('leaves nothing to accelerate the wheel at rest', () => {
    const { statics } = atRest();
    const tyre = (r.sprungKg + r.unsprungKg) * G;
    // The quarter car pushes the spring force straight to the wheel centre through the motion ratio; the knuckle
    // feels it at the contact point, which moves with the wheel centre but for the camber change. Within 0.5 %.
    expect(Math.abs(statics.lambda[5]!)).toBeLessThan(0.005 * tyre);
  });

  it('balances every force and moment on the knuckle', () => {
    const { statics, applied, pose } = atRest();
    const solver = statics.solver;
    const W = [spec.wheelCentre[0] + pose[0], spec.wheelCentre[1] + pose[1], spec.wheelCentre[2] + pose[2]];
    const forces = [...applied];
    const wb = spec.linkage.wishbones[0]!;
    const ball = [0, 0, 0];
    axle.knucklePoint(pose, wb.ball, ball);
    const rod = spec.linkage.rods[0]!;
    const rodEnd = [0, 0, 0];
    axle.knucklePoint(pose, rod.knuckle, rodEnd);
    const points = [ball, ball, rodEnd, top, top, W];
    expect(solver.rows).toEqual(['lower-arm.front', 'lower-arm.rear', 'tie-rod', 'strut', 'strut', 'travel']);
    for (let i = 0; i < 6; i++) {
      const f = [0, 0, 0];
      statics.rowForce(i, f);
      forces.push({ p: points[i]!, f });
    }
    const sum = [0, 0, 0, 0, 0, 0];
    for (const { p, f } of forces) {
      const a = [p[0]! - W[0]!, p[1]! - W[1]!, p[2]! - W[2]!];
      sum[0] += f[0]!;
      sum[1] += f[1]!;
      sum[2] += f[2]!;
      sum[3] += a[1]! * f[2]! - a[2]! * f[1]!;
      sum[4] += a[2]! * f[0]! - a[0]! * f[2]!;
      sum[5] += a[0]! * f[1]! - a[1]! * f[0]!;
    }
    for (const v of sum) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('pushes the strut outboard at the top mount', () => {
    // The tyre pushes up outboard of the ball joint and the spring pushes down along an axis that passes inboard of
    // it, so both turn the knuckle's top inboard about the ball joint: the top mount holds it back outboard. Its size
    // is the two moments over the height of the top mount above the ball joint, about 1 kN here.
    const { statics } = atRest();
    const f = [0, 0, 0];
    const g = [0, 0, 0];
    statics.rowForce(3, f);
    statics.rowForce(4, g);
    const side = f[1]! + g[1]!;
    expect(side).toBeGreaterThan(500);
    expect(side).toBeLessThan(2000);
  });
});
