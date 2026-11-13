import { describe, expect, it } from 'vitest';
import { macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { buildAxle, mirrorPose, newCornerSample, type CornerSample } from '../src/suspension/kinematics.ts';
import { CornerSolver, POSE_SIZE } from '../src/suspension/solve.ts';
import type { AxleSpec, Vec3 } from '../src/suspension/spec.ts';
import { dist, mirrorY } from '../src/suspension/vec.ts';

const spec = macphersonJtekt({ wheelCentreZM: 0.3 });
const axle = buildAxle(spec);
const table = axle.table;
const travels = Array.from({ length: table.n }, (_, i) => table.travel0 + i * table.step);
const point = (pose: Float64Array, k: Vec3): Vec3 => {
  const out = [0, 0, 0];
  axle.knucklePoint(pose, k, out);
  return [out[0], out[1], out[2]];
};
const poseAt = (i: number): Float64Array => table.pose.slice(POSE_SIZE * i, POSE_SIZE * (i + 1));

/** Every link of the corner as (body point, knuckle point, length). */
function links(s: AxleSpec): Array<{ name: string; body: Vec3; knuckle: Vec3; steer: boolean; len: number }> {
  const out: Array<{ name: string; body: Vec3; knuckle: Vec3; steer: boolean; len: number }> = [];
  for (const w of s.linkage.wishbones) {
    out.push({ name: `${w.id} front`, body: w.front, knuckle: w.ball, steer: false, len: dist(w.front, w.ball) });
    out.push({ name: `${w.id} rear`, body: w.rear, knuckle: w.ball, steer: false, len: dist(w.rear, w.ball) });
  }
  for (const r of s.linkage.rods) out.push({ name: r.id, body: r.body, knuckle: r.knuckle, steer: !!r.steer, len: r.lengthM ?? dist(r.body, r.knuckle) });
  return out;
}

describe('MacPherson corner solver', () => {
  it('keeps every link length over the whole travel to 1e-9 m', () => {
    for (let i = 0; i < table.n; i++) {
      const pose = poseAt(i);
      for (const l of links(spec)) expect(Math.abs(dist(point(pose, l.knuckle), l.body) - l.len), `${l.name} at node ${i}`).toBeLessThan(1e-9);
    }
  });

  it('keeps the strut axis through the top mount and the wheel centre at the asked height', () => {
    const strut = spec.linkage.strut!;
    const axisDesign = [strut.top[0] - strut.lower[0], strut.top[1] - strut.lower[1], strut.top[2] - strut.lower[2]] as const;
    const n = Math.hypot(...axisDesign);
    const dir = [0, 0, 0];
    for (let i = 0; i < table.n; i++) {
      const pose = poseAt(i);
      axle.solver.direction(pose, [axisDesign[0] / n, axisDesign[1] / n, axisDesign[2] / n], dir);
      const lower = point(pose, strut.lower);
      const toTop = [strut.top[0] - lower[0], strut.top[1] - lower[1], strut.top[2] - lower[2]];
      // The top mount lies on the knuckle-fixed axis: no component across it.
      const along = toTop[0] * dir[0] + toTop[1] * dir[1] + toTop[2] * dir[2];
      const across = Math.hypot(toTop[0] - along * dir[0], toTop[1] - along * dir[1], toTop[2] - along * dir[2]);
      expect(across).toBeLessThan(1e-10);
      expect(Math.abs(spec.wheelCentre[2] + pose[2] - (spec.wheelCentre[2] + travels[i]))).toBeLessThan(1e-11);
    }
  });

  it('keeps the links while steering as well', () => {
    const pose = new Float64Array(POSE_SIZE);
    for (const travel of [-0.08, 0, 0.08]) {
      for (const rack of [-0.06, -0.03, 0.03, 0.06]) {
        const res = axle.solvePose(travel, 0, null, pose);
        expect(res.ok).toBe(true);
        const steered = axle.solver.solve(pose, travel, rack, 30);
        expect(steered.ok, `travel ${travel} rack ${rack}`).toBe(true);
        for (const l of links(spec)) {
          const body: Vec3 = l.steer ? [l.body[0], l.body[1] + rack, l.body[2]] : l.body;
          expect(Math.abs(dist(point(pose, l.knuckle), body) - l.len)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('converges at every grid node within 8 iterations on one branch', () => {
    expect(table.step).toBeLessThanOrEqual(0.002 + 1e-12);
    expect(Math.max(...table.iterations)).toBeLessThanOrEqual(8);
    const pose = new Float64Array(POSE_SIZE);
    for (const travel of travels) {
      const res = axle.solvePose(travel, 0, null, pose);
      expect(res.ok).toBe(true);
      expect(res.residual).toBeLessThan(1e-10);
      expect(res.iterations).toBeLessThanOrEqual(8);
      expect(res.detSign).toBe(table.detSign);
    }
  });

  it('gives a right corner that mirrors the left one: the same camber and toe to 1e-9 rad', () => {
    // Solve the mirrored hardpoints as a corner of their own, then compare with the left corner and mirrorPose.
    const m = (p: Vec3): Vec3 => mirrorY(p);
    const right: AxleSpec = {
      ...spec,
      wheelCentre: m(spec.wheelCentre),
      spinAxis: m(spec.spinAxis),
      linkage: {
        ...spec.linkage,
        wishbones: spec.linkage.wishbones.map((w) => ({ ...w, front: m(w.front), rear: m(w.rear), ball: m(w.ball) })),
        rods: spec.linkage.rods.map((r) => ({ ...r, body: m(r.body), knuckle: m(r.knuckle) })),
        strut: { top: m(spec.linkage.strut!.top), lower: m(spec.linkage.strut!.lower) },
      },
    };
    const solver = new CornerSolver(right);
    const left = new Float64Array(POSE_SIZE);
    const pose = CornerSolver.identity();
    const mirrored = new Float64Array(POSE_SIZE);
    const s = [0, 0, 0];
    const sample = newCornerSample();
    for (const travel of [-0.08, -0.03, 0, 0.05, 0.09]) {
      for (const rack of [-0.02, 0, 0.02]) {
        // A rack moving left pushes the left tie rod out and pulls the right one in: −rack on the mirror.
        expect(solver.solve(pose, travel, -rack, 30).ok).toBe(true);
        axle.solvePose(travel, 0, null, left);
        expect(axle.solver.solve(left, travel, rack, 30).ok).toBe(true);
        axle.measure(left, travel, rack, sample);
        solver.direction(pose, right.spinAxis, s);
        const camber = -Math.atan2(s[2], Math.hypot(s[0], s[1]));
        const toe = Math.atan2(s[0], -s[1]);
        expect(Math.abs(camber - sample.camber)).toBeLessThan(1e-9);
        expect(Math.abs(toe - sample.toe)).toBeLessThan(1e-9);
        mirrorPose(left, mirrored);
        for (let k = 0; k < 3; k++) expect(Math.abs(mirrored[k] - pose[k])).toBeLessThan(1e-9);
        const sign = mirrored[3] * pose[3] + mirrored[4] * pose[4] + mirrored[5] * pose[5] + mirrored[6] * pose[6] < 0 ? -1 : 1;
        for (let k = 3; k < POSE_SIZE; k++) expect(Math.abs(mirrored[k] - sign * pose[k])).toBeLessThan(1e-9);
      }
    }
    // The table's right side flips only the lateral quantities.
    const a = newCornerSample();
    const b = newCornerSample();
    axle.sample('left', 0.031, 0, a);
    axle.sample('right', 0.031, 0, b);
    expect(b.camber).toBe(a.camber);
    expect(b.toe).toBe(a.toe);
    expect(b.contactY).toBe(-a.contactY);
    expect(b.tanBeta).toBe(-a.tanBeta);
  });

  it('takes derivatives from the implicit function that match central differences to 1e-6', () => {
    const h = 1e-5;
    const pose = new Float64Array(POSE_SIZE);
    const up = new Float64Array(POSE_SIZE);
    const down = new Float64Array(POSE_SIZE);
    const dT = new Float64Array(6);
    const dR = new Float64Array(6);
    const pts: Vec3[] = [spec.wheelCentre, spec.linkage.strut!.lower, spec.linkage.rods[0].knuckle, [0.1, 0.65, 0.5]];
    for (const travel of [-0.07, -0.02, 0, 0.04, 0.08]) {
      for (const rack of [0, 0.03]) {
        axle.solvePose(travel, 0, null, pose);
        axle.solver.solve(pose, travel, rack, 30);
        axle.solver.derivatives(pose, travel, rack, dT, dR);
        for (const [d, sTravel, sRack] of [[dT, h, 0], [dR, 0, h]] as const) {
          up.set(pose);
          down.set(pose);
          expect(axle.solver.solve(up, travel + sTravel, rack + sRack, 30).ok).toBe(true);
          expect(axle.solver.solve(down, travel - sTravel, rack - sRack, 30).ok).toBe(true);
          for (const k of pts) {
            const a = point(up, k);
            const b = point(down, k);
            const p = point(pose, k);
            const W = [spec.wheelCentre[0] + pose[0], spec.wheelCentre[1] + pose[1], spec.wheelCentre[2] + pose[2]];
            const r = [p[0] - W[0], p[1] - W[1], p[2] - W[2]];
            const v = [d[0] + d[4] * r[2] - d[5] * r[1], d[1] + d[5] * r[0] - d[3] * r[2], d[2] + d[3] * r[1] - d[4] * r[0]];
            for (let c = 0; c < 3; c++) expect(Math.abs((a[c] - b[c]) / (2 * h) - v[c])).toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  it('derives motion ratio, force-line slope and recession that match the table by differences', () => {
    const a = newCornerSample();
    const b = newCornerSample();
    const c = newCornerSample();
    const h = 1e-5;
    for (const travel of [-0.06, 0, 0.05]) {
      axle.measureAt(travel + h, a);
      axle.measureAt(travel - h, b);
      axle.measureAt(travel, c);
      const fd = (f: keyof CornerSample): number => (a[f] - b[f]) / (2 * h);
      expect(Math.abs(-fd('damperLen') - c.mrDamper)).toBeLessThan(1e-6);
      expect(Math.abs(-fd('springLen') - c.mrSpring)).toBeLessThan(1e-6);
      expect(Math.abs(fd('contactY') - c.tanBeta)).toBeLessThan(1e-6);
      expect(Math.abs(fd('contactX') - c.tanThetaCP)).toBeLessThan(1e-6);
      expect(Math.abs(fd('wheelX') - c.tanThetaWC)).toBeLessThan(1e-6);
    }
  });

  it('measures the halfshaft from its two joint centres', () => {
    const shaft = spec.halfshaft!;
    const s = newCornerSample();
    const spin = [0, 0, 0];
    const design = dist(shaft.diffOutput, shaft.outerJoint);
    for (let i = 0; i < table.n; i += 7) {
      const pose = poseAt(i);
      axle.measure(pose, travels[i], 0, s);
      const o = point(pose, shaft.outerJoint);
      const d = [o[0] - shaft.diffOutput[0], o[1] - shaft.diffOutput[1], o[2] - shaft.diffOutput[2]];
      const len = Math.hypot(d[0], d[1], d[2]);
      axle.solver.direction(pose, spec.spinAxis, spin);
      expect(s.plunge).toBeCloseTo(design - len, 12);
      expect(s.cvInner).toBeCloseTo(Math.acos(d[1] / len), 12);
      expect(s.cvOuter).toBeCloseTo(Math.acos((d[0] * spin[0] + d[1] * spin[1] + d[2] * spin[2]) / len), 12);
    }
  });
});
