import { describe, expect, it } from 'vitest';
import { ALL_GEARBOXES } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import {
  centreDistance,
  gearGeometry,
  helixForCentre,
  interference,
  inverseInvolute,
  involute,
  pairGeometry,
  shiftSumForCentre,
  toothOutline,
  undercut,
} from '../src/drivetrain/gear-geometry.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';

const boxes = ALL_GEARBOXES.map((record) => buildGearbox(gearboxSpec(record)));
// Pairs on parallel axes: a crown wheel and its pinion cross the shafts, and the transverse section does not apply.
const meshes = boxes.flatMap((box) => box.meshes.filter((mesh) => !mesh.bevel).map((mesh) => ({ box, mesh })));
const axisOf = (box: (typeof boxes)[number], member: string) => {
  const axis = box.spec.members.find((m) => m.id === member)!.axis;
  return box.spec.axes.find((a) => a.id === axis)!;
};

describe('phases', () => {
  it.each(meshes.map(({ box, mesh }) => [`${box.spec.id} ${mesh.a}/${mesh.b}`, box, mesh] as const))(
    '%s: no tooth overlaps the mate in 12 positions, half a pitch off they do',
    (_name, box, mesh) => {
      const a = mesh.geometry.a;
      const b = mesh.geometry.b;
      const ca = axisOf(box, mesh.memberA);
      const cb = axisOf(box, mesh.memberB);
      const pitch = (2 * Math.PI) / a.teeth;
      for (let k = 0; k < 12; k++) {
        // Members turn together: B turns back by z_a/z_b of A's turn.
        const turn = (k / 12) * pitch;
        const thetaA = box.phases[mesh.a]! + turn;
        const thetaB = box.phases[mesh.b]! - (a.teeth / b.teeth) * turn;
        expect(interference(a, ca, thetaA, b, cb, thetaB), `position ${k}`).toBe(0);
      }
      const wrong = interference(a, ca, box.phases[mesh.a]!, b, cb, box.phases[mesh.b]! + Math.PI / b.teeth);
      expect(wrong).toBeGreaterThan(20);
    },
  );
});

describe('undercut', () => {
  it('a spur gear at 20° without shift is undercut below 17 teeth', () => {
    for (let z = 8; z <= 16; z++) expect(undercut(z, 0, 0, 20).undercut, `z ${z}`).toBe(true);
    for (let z = 17; z <= 40; z++) expect(undercut(z, 0, 0, 20).undercut, `z ${z}`).toBe(false);
  });

  it('the shift x = (17 − z)/17 removes it', () => {
    for (let z = 8; z <= 16; z++) expect(undercut(z, (17 - z) / 17, 0, 20).undercut, `z ${z}`).toBe(false);
  });

  it('a helix lowers the limit: the virtual spur gear has more teeth', () => {
    expect(undercut(14, 0, 0, 20).undercut).toBe(true);
    expect(undercut(14, 0, 30, 20).undercut).toBe(false);
  });

  it('no gear of the catalogue is undercut', () => {
    for (const box of boxes) {
      for (const g of box.spec.gears) expect(undercut(g.teeth, g.shift, Math.abs(g.helix), g.pressureAngle).undercut, `${box.spec.id} ${g.id}`).toBe(false);
    }
  });
});

describe('centre distance', () => {
  it('the helix found for a centre distance gives that distance back', () => {
    const cases: Array<[number, number, number, number, number]> = [
      [76, 2, 23, 45, 0],
      [76, 2.25, 20, 38, 0],
      [85, 2.5, 19, 43, 0],
      [85, 2.5, 19, 43, 0.3],
      [70, 2, 17, 44, -0.2],
    ];
    for (const [a, m, z1, z2, x] of cases) {
      const beta = helixForCentre(a, m, z1, z2, 20, x);
      expect(Number.isFinite(beta)).toBe(true);
      expect(Math.abs(centreDistance(m, z1, z2, beta, 20, x) - a)).toBeLessThan(1e-9);
    }
  });

  it('a spur pair whose shift sum was solved for the centre distance is spur, on either side of the rounding', () => {
    // The designer closes a spur pair's centre distance with a shift sum (shiftSumForCentre): its helix is exactly 0.
    for (const [a, m, z1, z2] of [[80, 2.25, 30, 41], [76, 2.5, 19, 42], [80, 2.5, 30, 33], [84, 1.75, 40, 55]] as const) {
      const x = shiftSumForCentre(a, m, z1, z2, 0, 20);
      expect(helixForCentre(a, m, z1, z2, 20, x)).toBe(0);
      for (const nudge of [-1e-12, 1e-12]) expect(helixForCentre(a, m, z1, z2, 20, x + nudge)).toBe(0);
    }
  });

  it('every helical pair of the catalogue sits at 15–35° on its shared centre distance', () => {
    for (const box of boxes) {
      for (const mesh of box.meshes) {
        const beta = Math.abs((mesh.geometry.a.beta * 180) / Math.PI);
        if (beta === 0) continue;
        expect(beta, `${box.spec.id} ${mesh.a}/${mesh.b}`).toBeGreaterThanOrEqual(15);
        expect(beta, `${box.spec.id} ${mesh.a}/${mesh.b}`).toBeLessThanOrEqual(35);
      }
    }
  });

  it('the involute inverts', () => {
    for (const deg of [5, 14.5, 20, 25, 35]) expect(inverseInvolute(involute((deg * Math.PI) / 180))).toBeCloseTo((deg * Math.PI) / 180, 12);
  });
});

describe('outline', () => {
  it('stays between the root and the tip and repeats every tooth', () => {
    const g = gearGeometry({ teeth: 23, module: 2, helix: 26.5, pressureAngle: 20, shift: 0, faceWidth: 20 });
    const outline = toothOutline(g, 10);
    const perTooth = outline.length / 2 / g.teeth;
    expect(Number.isInteger(perTooth)).toBe(true);
    for (let i = 0; i < outline.length; i += 2) {
      const r = Math.hypot(outline[i]!, outline[i + 1]!);
      expect(r).toBeGreaterThanOrEqual(g.rf - 1e-4);
      expect(r).toBeLessThanOrEqual(g.ra + 1e-4);
    }
  });

  it('a standard spur pair has a contact ratio of 1.3–1.8', () => {
    const shape = { module: 3, helix: 0, pressureAngle: 20, shift: 0, faceWidth: 20 };
    const pair = pairGeometry({ ...shape, teeth: 19 }, { ...shape, teeth: 43 });
    expect(pair.epsAlpha).toBeGreaterThan(1.3);
    expect(pair.epsAlpha).toBeLessThan(1.8);
    expect(pair.epsBeta).toBe(0);
  });
});
