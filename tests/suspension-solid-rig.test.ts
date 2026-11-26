// The solid axle's rig (src/suspension/solid-rig.ts): the acceptance of stage P6b in numbers. On a solid axle the
// camber to the road does not change with body roll; four parallel links with a Panhard rod bind once the upper pair
// is not parallel to the lower one in the side view, and a three-link axle never does.

import { describe, expect, it } from 'vitest';
import { cornerCamberRoad, SolidRig } from '../src/suspension/solid-rig.ts';
import { solidAxle, SOLID_TYPICAL } from '../src/suspension/templates/solid-axle.ts';
import { Axle } from '../src/suspension/kinematics.ts';
import { designCorner, TYPICAL_RWD } from '../src/suspension-designer/page-cars.ts';

const DEG = Math.PI / 180;
const TEMPLATES = Object.entries(SOLID_TYPICAL);

describe('solid axle rig', () => {
  it.each(TEMPLATES)('%s: body roll leaves the camber to the road at its static value', (_name, intent) => {
    const rig = new SolidRig(solidAxle(intent));
    for (const deg of [-5, -3, 1, 3, 5]) {
      const out = rig.solve({ rollRad: deg * DEG, heaveM: 0, bumpM: 0 });
      // 1e-5 rad is 0.0006°: the page shows hundredths of a degree.
      expect(Math.abs(out.camberRoad[0])).toBeLessThan(1e-5);
      expect(Math.abs(out.camberRoad[1])).toBeLessThan(1e-5);
      // The body has rolled over the axle: the left wheel droops when the left side goes up.
      expect(Math.sign(out.travel[0])).toBe(-Math.sign(deg));
    }
  });

  it('puts the wheels on the road', () => {
    const spec = solidAxle(SOLID_TYPICAL.panhard);
    const rig = new SolidRig(spec);
    const phi = 4 * DEG;
    rig.solve({ rollRad: phi, heaveM: 0.02, bumpM: 0.03 });
    const p = new Float64Array(3);
    const solver = rig.axle.solver;
    const zW = spec.wheelCentre[2];
    solver.point(rig.state, solver.wheelL, p);
    expect(p[1] * Math.sin(phi) + p[2] * Math.cos(phi)).toBeCloseTo(zW + 0.05, 6);
    solver.point(rig.state, solver.wheelR, p);
    expect(p[1] * Math.sin(phi) + p[2] * Math.cos(phi)).toBeCloseTo(zW + 0.02, 6);
  });

  it('tilts both wheels by the slope of the axle when one wheel rides a bump', () => {
    const spec = solidAxle(SOLID_TYPICAL.watt);
    const rig = new SolidRig(spec);
    const out = rig.solve({ rollRad: 0, heaveM: 0, bumpM: 0.05 });
    const slope = Math.atan(0.05 / spec.track);
    // Camber is negative when the top leans in: the axle's left end rises, so both tops lean to the right, the left
    // wheel's in and the right one's out.
    expect(out.camberRoad[0]).toBeCloseTo(-slope, 3);
    expect(out.camberRoad[1]).toBeCloseTo(slope, 3);
  });

  it('binds four parallel links and a Panhard rod once the upper links are not parallel to the lower ones', () => {
    const roll = { rollRad: 3 * DEG, heaveM: 0, bumpM: 0 };
    const parallel = new SolidRig(solidAxle(SOLID_TYPICAL.panhard)).solve(roll).bindM;
    const crossed = new SolidRig(solidAxle({ ...SOLID_TYPICAL.panhard, upperAngleDeg: 0 }));
    const out = crossed.solve(roll);
    expect(parallel).toBeLessThan(1e-5);
    expect(out.bindM).toBeGreaterThan(5e-4);
    expect(out.worst).not.toBe('');
    // In statics the set can no longer roll: one free motion is left.
    expect(crossed.freeMotions()).toBe(1);
  });

  it('never binds three links with a Panhard rod or Watt’s linkage, nor four triangulated links', () => {
    const roll = { rollRad: 4 * DEG, heaveM: 0.03, bumpM: 0.02 };
    const three = { links: 'three' } as const;
    for (const intent of [{ ...SOLID_TYPICAL.panhard, ...three }, { ...SOLID_TYPICAL.watt, ...three }, { ...SOLID_TYPICAL.deDion, ...three }, SOLID_TYPICAL.triangulated]) {
      const rig = new SolidRig(solidAxle(intent));
      expect(rig.solve(roll).bindM).toBeLessThan(1e-9);
      expect(rig.freeMotions()).toBe(2);
    }
  });

  it('shows an independent corner gaining camber to the road with the roll', () => {
    const axle = new Axle(designCorner(TYPICAL_RWD, 'F').axle);
    const [left, right] = cornerCamberRoad(axle, 3 * DEG, 0);
    // A typical double wishbone recovers a part of the roll, not all of it: the outer (right) wheel leans out.
    expect(Math.abs(left)).toBeGreaterThan(0.5 * DEG);
    expect(Math.abs(right)).toBeGreaterThan(0.5 * DEG);
    expect(Math.abs(left)).toBeLessThan(3 * DEG);
  });
});
