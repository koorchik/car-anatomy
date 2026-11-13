import { describe, expect, it } from 'vitest';
import { macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { buildAxle, mirrorPose, newCornerSample, type CornerSample } from '../src/suspension/kinematics.ts';
import { CornerSolver, POSE_SIZE } from '../src/suspension/solve.ts';
import type { AxleSpec, Vec3 } from '../src/suspension/spec.ts';
import { dist, mirrorY, nullSpace, rank, rotateInto, sub, svd, unit } from '../src/suspension/vec.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { multilink, multilinkDefaults } from '../src/suspension/templates/multilink.ts';
import { solidAxle, SOLID_TYPICAL, type SolidAxleIntent } from '../src/suspension/templates/solid-axle.ts';
import { SolidAxleSolver } from '../src/suspension/solve-axle.ts';
import { newSolidSample, SolidAxle } from '../src/suspension/solid-kinematics.ts';
import type { SolidAxleLinkage } from '../src/suspension/spec.ts';

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

// ---- Stage P4-core: every independent template, split knuckles, SVD and the null space ----

const TEMPLATES: Array<{ name: string; spec: AxleSpec }> = [
  { name: 'double wishbone front', spec: doubleWishbone(wishboneDefaults('front')) },
  { name: 'double wishbone rear', spec: doubleWishbone(wishboneDefaults('rear')) },
  { name: 'five-link front', spec: multilink(multilinkDefaults('front')) },
  { name: 'five-link rear', spec: multilink(multilinkDefaults('rear')) },
  { name: 'MacPherson dual-axis', spec: macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'dual-axis' }) },
  { name: 'MacPherson RevoKnuckle', spec: macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'revoknuckle' }) },
];

/** Every distance of a corner: (body point, knuckle or carrier point, length, which body carries it). */
function distances(s: AxleSpec): Array<{ name: string; body: Vec3; end: Vec3; steer: boolean; len: number; carrier: boolean }> {
  const split = !!s.linkage.knuckle;
  return [
    ...s.linkage.wishbones.flatMap((w) => [
      { name: `${w.id} front`, body: w.front, end: w.ball, steer: false, len: dist(w.front, w.ball), carrier: split },
      { name: `${w.id} rear`, body: w.rear, end: w.ball, steer: false, len: dist(w.rear, w.ball), carrier: split },
    ]),
    ...s.linkage.rods.map((r) => ({ name: r.id, body: r.body, end: r.knuckle, steer: !!r.steer, len: r.lengthM ?? dist(r.body, r.knuckle), carrier: false })),
  ];
}

/** The left corner's hardpoints mirrored to the right side. */
function mirrorSpec(s: AxleSpec): AxleSpec {
  const m = (p: Vec3): Vec3 => mirrorY(p);
  const k = s.linkage.knuckle;
  return {
    ...s,
    wheelCentre: m(s.wheelCentre),
    spinAxis: m(s.spinAxis),
    linkage: {
      ...s.linkage,
      wishbones: s.linkage.wishbones.map((w) => ({ ...w, front: m(w.front), rear: m(w.rear), ball: m(w.ball) })),
      rods: s.linkage.rods.map((r) => ({ ...r, body: m(r.body), knuckle: m(r.knuckle) })),
      ...(s.linkage.strut ? { strut: { top: m(s.linkage.strut.top), lower: m(s.linkage.strut.lower) } } : {}),
      ...(k ? { knuckle: { ...k, axisLower: m(k.axisLower), axisUpper: m(k.axisUpper), hold: { body: m(k.hold.body), carrier: m(k.hold.carrier) } } } : {}),
    },
  };
}

describe.each(TEMPLATES)('$name corner solver', ({ spec: s }) => {
  const a = buildAxle(s);
  const steered = s.linkage.rods.some((r) => r.steer);
  const racks = steered ? [-0.05, -0.02, 0.02, 0.05] : [0];
  const at = (pose: Float64Array, p: Vec3, carrier: boolean): Vec3 => {
    const out = [0, 0, 0];
    if (carrier) a.solver.carrierPoint(pose, p, out);
    else a.solver.point(pose, p, out);
    return [out[0], out[1], out[2]];
  };

  it('keeps every link length over the whole travel and steering to 1e-9 m', () => {
    const pose = new Float64Array(POSE_SIZE);
    for (let i = 0; i < a.table.n; i++) {
      const travel = a.table.travel0 + i * a.table.step;
      const node = a.table.pose.slice(POSE_SIZE * i, POSE_SIZE * (i + 1));
      for (const d of distances(s)) expect(Math.abs(dist(at(node, d.end, d.carrier), d.body) - d.len), `${d.name} at ${travel}`).toBeLessThan(1e-9);
      if (i % 10 !== 0) continue;
      for (const rack of racks) {
        pose.set(node);
        expect(a.solver.solve(pose, travel, rack, 30).ok, `travel ${travel} rack ${rack}`).toBe(true);
        for (const d of distances(s)) {
          const body: Vec3 = d.steer ? [d.body[0], d.body[1] + rack, d.body[2]] : d.body;
          expect(Math.abs(dist(at(pose, d.end, d.carrier), body) - d.len)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('converges at every grid node within 8 iterations on one branch', () => {
    expect(a.table.step).toBeLessThanOrEqual(0.002 + 1e-12);
    expect(Math.max(...a.table.iterations)).toBeLessThanOrEqual(8);
    const pose = new Float64Array(POSE_SIZE);
    for (let i = 0; i < a.table.n; i++) {
      const res = a.solvePose(a.table.travel0 + i * a.table.step, 0, null, pose);
      expect(res.ok && res.iterations <= 8 && res.detSign === a.table.detSign).toBe(true);
    }
  });

  it('gives a right corner that mirrors the left one: the same camber and toe to 1e-9 rad', () => {
    const right = mirrorSpec(s);
    const solver = new CornerSolver(right);
    const pose = CornerSolver.identity();
    const left = new Float64Array(POSE_SIZE);
    const mirrored = new Float64Array(POSE_SIZE);
    const sample = newCornerSample();
    const spin = [0, 0, 0];
    for (const travel of [-0.08, -0.03, 0, 0.05, 0.09]) {
      for (const rack of steered ? [-0.02, 0, 0.02] : [0]) {
        expect(solver.solve(pose, travel, -rack, 30).ok).toBe(true);
        a.solvePose(travel, 0, null, left);
        expect(a.solver.solve(left, travel, rack, 30).ok).toBe(true);
        a.measure(left, travel, rack, sample);
        solver.direction(pose, right.spinAxis, spin);
        expect(Math.abs(-Math.atan2(spin[2], Math.hypot(spin[0], spin[1])) - sample.camber)).toBeLessThan(1e-9);
        expect(Math.abs(Math.atan2(spin[0], -spin[1]) - sample.toe)).toBeLessThan(1e-9);
        mirrorPose(left, mirrored);
        for (let k = 0; k < 3; k++) expect(Math.abs(mirrored[k] - pose[k])).toBeLessThan(1e-9);
        const sign = mirrored[3] * pose[3] + mirrored[4] * pose[4] + mirrored[5] * pose[5] + mirrored[6] * pose[6] < 0 ? -1 : 1;
        for (let k = 3; k < 7; k++) expect(Math.abs(mirrored[k] - sign * pose[k])).toBeLessThan(1e-9);
        // A split knuckle's turn flips sign on the mirror.
        expect(Math.abs(mirrored[7] - pose[7])).toBeLessThan(1e-9);
      }
    }
  });

  it('takes derivatives from the implicit function that match central differences to 1e-6', () => {
    const h = 1e-5;
    const n = a.solver.n;
    const pose = new Float64Array(POSE_SIZE);
    const up = new Float64Array(POSE_SIZE);
    const down = new Float64Array(POSE_SIZE);
    const dT = new Float64Array(n);
    const dR = new Float64Array(n);
    const v = [0, 0, 0];
    const points: Array<[Vec3, boolean]> = [[s.wheelCentre, false], [[0.1, 0.65, 0.5], false], [s.linkage.rods.at(-1)!.knuckle, false]];
    if (s.linkage.strut) points.push([s.linkage.strut.lower, true]);
    for (const travel of [-0.07, 0, 0.06]) {
      for (const rack of steered ? [0, 0.03] : [0]) {
        a.solvePose(travel, 0, null, pose);
        a.solver.solve(pose, travel, rack, 30);
        a.solver.derivatives(pose, travel, rack, dT, steered ? dR : null);
        for (const [d, sTravel, sRack] of steered ? ([[dT, h, 0], [dR, 0, h]] as const) : ([[dT, h, 0]] as const)) {
          up.set(pose);
          down.set(pose);
          expect(a.solver.solve(up, travel + sTravel, rack + sRack, 30).ok).toBe(true);
          expect(a.solver.solve(down, travel - sTravel, rack - sRack, 30).ok).toBe(true);
          for (const [k, carrier] of points) {
            const p = at(up, k, carrier);
            const q = at(down, k, carrier);
            a.solver.pointVelocity(pose, d, k, !carrier, v);
            for (let c = 0; c < 3; c++) expect(Math.abs((p[c] - q[c]) / (2 * h) - v[c])).toBeLessThan(1e-6);
          }
        }
      }
    }
  });
});

describe('split knuckle (dual-axis strut, RevoKnuckle)', () => {
  for (const knuckle of ['dual-axis', 'revoknuckle'] as const) {
    const s = macphersonJtekt({ wheelCentreZM: 0.3, knuckle });
    const a = buildAxle(s);
    const k = s.linkage.knuckle!;

    it(`${knuckle}: keeps the strut through its top mount, the carrier held and the axis shared`, () => {
      const strut = s.linkage.strut!;
      const axis = [0, 0, 0];
      const hold = [0, 0, 0];
      const lower = [0, 0, 0];
      const pose = new Float64Array(POSE_SIZE);
      for (const travel of [-0.08, 0, 0.1]) {
        for (const rack of [-0.04, 0, 0.04]) {
          a.solvePose(travel, 0, null, pose);
          expect(a.solver.solve(pose, travel, rack, 30).ok).toBe(true);
          // The strut's axis, fixed in the carrier, passes through the top mount.
          a.solver.carrierDirection(pose, unit(sub(strut.top, strut.lower)), axis);
          a.solver.carrierPoint(pose, strut.lower, lower);
          const t = sub(strut.top, [lower[0], lower[1], lower[2]]);
          const along = t[0] * axis[0] + t[1] * axis[1] + t[2] * axis[2];
          expect(Math.hypot(t[0] - along * axis[0], t[1] - along * axis[1], t[2] - along * axis[2])).toBeLessThan(1e-10);
          // The hold keeps its two directions square.
          a.solver.carrierDirection(pose, k.hold.carrier, hold);
          expect(Math.abs(hold[0] * k.hold.body[0] + hold[1] * k.hold.body[1] + hold[2] * k.hold.body[2])).toBeLessThan(1e-10);
          // Points of the steering axis sit in the same place whether carried by the knuckle or the carrier.
          for (const p of [k.axisLower, k.axisUpper]) {
            const onKnuckle = [0, 0, 0];
            const onCarrier = [0, 0, 0];
            a.solver.point(pose, p, onKnuckle);
            a.solver.carrierPoint(pose, p, onCarrier);
            expect(dist(onKnuckle as unknown as Vec3, onCarrier as unknown as Vec3)).toBeLessThan(1e-12);
          }
        }
      }
    });

    it(`${knuckle}: steering turns the knuckle in the carrier, which only rides along its own travel path`, () => {
      const p0 = new Float64Array(POSE_SIZE);
      const p1 = new Float64Array(POSE_SIZE);
      a.solvePose(0, 0, null, p0);
      p1.set(p0);
      expect(a.solver.solve(p1, 0, 0.04, 30).ok).toBe(true);
      expect(Math.abs(p1[7] - p0[7])).toBeGreaterThan(0.1);
      // Turning about an axis with caster and offset lifts the wheel centre, so at the same wheel-centre height the
      // carrier sits elsewhere: at the pose it has, unsteered, for some other travel. Find that travel by the height of
      // the strut's lower point, then every carrier point must agree.
      const lower = s.linkage.strut!.lower;
      const z1 = [0, 0, 0];
      a.solver.carrierPoint(p1, lower, z1);
      const p2 = new Float64Array(POSE_SIZE);
      const zAt = (q: number): number => {
        a.solvePose(q, 0, null, p2);
        const z = [0, 0, 0];
        a.solver.carrierPoint(p2, lower, z);
        return z[2] - z1[2];
      };
      let lo = -0.02;
      let hi = 0.02;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (zAt(mid) > 0) hi = mid;
        else lo = mid;
      }
      zAt((lo + hi) / 2);
      expect(Math.abs((lo + hi) / 2)).toBeGreaterThan(1e-4);
      for (const q of [lower, s.linkage.wishbones[0].ball, s.linkage.strut!.top, k.axisLower, k.axisUpper]) {
        const x = [0, 0, 0];
        const y = [0, 0, 0];
        a.solver.carrierPoint(p1, q, x);
        a.solver.carrierPoint(p2, q, y);
        expect(dist(x as unknown as Vec3, y as unknown as Vec3)).toBeLessThan(1e-9);
      }
    });
  }
});

describe('SVD and null space', () => {
  // A deterministic pseudo-random matrix.
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const matrix = (m: number, n: number): Float64Array => Float64Array.from({ length: m * n }, rnd);
  const mul = (a: Float64Array, m: number, k: number, b: Float64Array, n: number): Float64Array => {
    const out = new Float64Array(m * n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) for (let l = 0; l < k; l++) out[i * n + j] += a[i * k + l] * b[l * n + j];
    return out;
  };

  it('splits a matrix into orthogonal columns: A·V has orthogonal columns of lengths s, V is orthonormal', () => {
    for (const [m, n] of [[6, 6], [5, 6], [7, 4], [3, 7]] as const) {
      const a = matrix(m, n);
      const { s, v } = svd(a, m, n);
      const av = mul(a, m, n, v, n);
      for (let p = 0; p < n; p++) {
        for (let q = 0; q < n; q++) {
          let g = 0;
          let vv = 0;
          for (let i = 0; i < m; i++) g += av[i * n + p] * av[i * n + q];
          for (let i = 0; i < n; i++) vv += v[i * n + p] * v[i * n + q];
          expect(Math.abs(g - (p === q ? s[p] * s[p] : 0))).toBeLessThan(1e-12);
          expect(Math.abs(vv - (p === q ? 1 : 0))).toBeLessThan(1e-12);
        }
      }
      for (let j = 1; j < n; j++) expect(s[j]).toBeLessThanOrEqual(s[j - 1]);
    }
  });

  it('finds the rank and the null space of a matrix built with a known rank', () => {
    for (const r of [1, 2, 3, 4]) {
      const a = mul(matrix(6, r), 6, r, matrix(r, 6), 6);
      expect(rank(a, 6, 6)).toBe(r);
      const ns = nullSpace(a, 6, 6);
      expect(ns.length).toBe(6 - r);
      for (const x of ns) {
        const ax = mul(a, 6, 6, x, 1);
        expect(Math.max(...ax.map(Math.abs))).toBeLessThan(1e-12);
      }
    }
  });

  it('leaves the five-link one free motion, the travel; taking k links away frees k more (rank 5 − k)', () => {
    const s = multilink(multilinkDefaults('rear'));
    const a = buildAxle(s);
    const pose = new Float64Array(POSE_SIZE);
    const ids = s.linkage.rods.map((r) => r.id);
    for (const travel of [-0.06, 0, 0.08]) {
      a.solvePose(travel, 0, null, pose);
      const all = a.solver.freeMotions(pose, 0);
      expect(all.length).toBe(1);
      // It is the travel motion, up to scale.
      const v = new Float64Array(6);
      a.solver.derivatives(pose, travel, 0, v, null);
      const cos = Math.abs(all[0].reduce((sum, x, i) => sum + x * v[i], 0)) / Math.hypot(...v);
      expect(cos).toBeCloseTo(1, 12);
      for (let k = 1; k <= 4; k++) {
        const without = ids.slice(0, k);
        const free = a.solver.freeMotions(pose, 0, without);
        expect(free.length, `without ${without.join(', ')}`).toBe(1 + k);
        const J = a.solver.constraintJacobian(pose, 0);
        const kept = ids.map((_, i) => i).filter((i) => !without.includes(ids[i]));
        expect(rank(Float64Array.from(kept.flatMap((i) => Array.from(J.subarray(6 * i, 6 * i + 6)))), kept.length, 6)).toBe(5 - k);
        // Each free motion keeps every remaining link's length to first order.
        for (const x of free) for (const i of kept) expect(Math.abs(J.subarray(6 * i, 6 * i + 6).reduce((sum, c, j) => sum + c * x[j], 0))).toBeLessThan(1e-12);
      }
    }
  });
});

describe('solid axle solver (weighted least squares)', () => {
  const DEG = Math.PI / 180;
  const build = (intent: SolidAxleIntent, tweak?: (spec: AxleSpec<SolidAxleLinkage>) => void): SolidAxle => {
    const spec = solidAxle(intent);
    tweak?.(spec);
    return new SolidAxle(spec);
  };
  /** Travels of a 3° roll of the axle against the body: the wheel centres ±(t/2)·sin 3°. */
  const roll3 = (axle: SolidAxle): number => axle.spec.wheelCentre[1] * Math.sin(3 * DEG);
  /** Every rigid link of the axle as (name, body point, axle point, length); a Watt rod's axle end is its rocker end. */
  const rodsOf = (axle: SolidAxle) => axle.spec.linkage.rods.map((r) => ({ name: r.id, body: r.body, axle: r.knuckle, len: dist(r.body, r.knuckle) }));
  const at = (axle: SolidAxle, s: Float64Array, a: Vec3): Vec3 => {
    const out = [0, 0, 0];
    axle.solver.point(s, a, out);
    return [out[0], out[1], out[2]];
  };
  /** A grid over both travels, the wheels at most 160 mm apart. */
  const grid: Array<[number, number]> = [];
  for (let i = -10; i <= 12; i += 2) for (let j = -10; j <= 12; j += 2) if (Math.abs(i - j) <= 16) grid.push([i / 100, j / 100]);
  const exact = {
    'triangulated four-link': SOLID_TYPICAL.triangulated,
    'three links and a Panhard rod': { ...SOLID_TYPICAL.panhard, links: 'three' },
    'three links and Watt’s linkage': { ...SOLID_TYPICAL.watt, links: 'three' },
  } as const satisfies Record<string, SolidAxleIntent>;

  it('leaves heave and roll free: a triangulated four-link, three links with a Panhard rod, Watt’s linkage (research §2)', () => {
    for (const [name, intent] of Object.entries(exact)) expect(build(intent).solver.freeMotions(SolidAxleSolver.rest()).length, name).toBe(2);
    // Four parallel links and a Panhard rod: five rods of rank four, so still two to first order, and singular as a
    // square system.
    const parallel = build(SOLID_TYPICAL.panhard);
    expect(parallel.solver.freeMotions(SolidAxleSolver.rest()).length).toBe(2);
    expect(parallel.spec.linkage.rods.length + 1).toBe(5);
    // Moving the upper links 20 mm apart in plan makes the five independent: the axle can no longer roll (rank 5).
    const offset = build(SOLID_TYPICAL.panhard, (spec) => {
      for (const r of spec.linkage.rods) if (r.id.startsWith('upper')) r.knuckle = [r.knuckle[0], r.knuckle[1] + Math.sign(r.knuckle[1]) * 0.02, r.knuckle[2]];
    });
    expect(offset.solver.freeMotions(SolidAxleSolver.rest()).length).toBe(1);
    // Taking the Panhard rod away frees the sideways motion.
    expect(build(exact['three links and a Panhard rod']).solver.freeMotions(SolidAxleSolver.rest(), ['panhard']).length).toBe(3);
  });

  it('keeps every rod of a set that moves exactly to 1e-9 m and meets both wheel heights, with no binding', () => {
    for (const [name, intent] of Object.entries(exact)) {
      const axle = build(intent);
      const s = axle.rest();
      const tr = [0, 0];
      for (const [zL, zR] of grid) {
        const res = axle.solve(s, zL, zR);
        expect(res.bind, `${name} at ${zL}/${zR}`).toBeLessThan(1e-9);
        for (const r of rodsOf(axle)) expect(Math.abs(dist(at(axle, s, r.axle), r.body) - r.len), `${name}: ${r.name}`).toBeLessThan(1e-9);
        const lat = axle.spec.linkage.lateral;
        if (lat.kind === 'panhard') expect(Math.abs(dist(at(axle, s, lat.axle), lat.body) - dist(lat.axle, lat.body))).toBeLessThan(1e-9);
        if (lat.kind === 'watt') {
          const w = lat.spec;
          const end = [0, 0, 0];
          for (const [upper, body] of [[true, w.upperBody], [false, w.lowerBody]] as const) {
            axle.solver.rockerEnd(s, upper, end);
            const design: Vec3 = [w.pivotOnAxle[0], w.pivotOnAxle[1], w.pivotOnAxle[2] + (upper ? 1 : -1) * w.centreLinkM / 2];
            expect(Math.abs(dist([end[0], end[1], end[2]], body) - dist(design, body))).toBeLessThan(1e-9);
            // The rocker stays a rigid bar on its pivot.
            expect(Math.abs(dist([end[0], end[1], end[2]], at(axle, s, w.pivotOnAxle)) - w.centreLinkM / 2)).toBeLessThan(1e-12);
          }
        }
        axle.solver.travels(s, tr);
        expect(Math.abs(tr[0] - zL)).toBeLessThan(1e-10);
        expect(Math.abs(tr[1] - zR)).toBeLessThan(1e-10);
      }
    }
  });

  it('parallel four links and a Panhard rod bind at 3° of axle roll: more than zero, under 0.5 mm (plan, stage 6b)', () => {
    const axle = build(SOLID_TYPICAL.panhard);
    const s = axle.rest();
    const dz = roll3(axle);
    const res = axle.solve(s, dz, -dz);
    expect(res.bind).toBeGreaterThan(1e-7);
    expect(res.bind).toBeLessThan(0.5e-3);
    expect(res.worst).toMatch(/^(lower|upper)-/);
    // The stretch is the rods' own: every rod's residual is its length change, and the largest is the binding.
    const residuals = new Float64Array(axle.solver.rows.length);
    axle.solver.residuals(s, residuals);
    const named = axle.solver.rows.map((name, i) => ({ name, r: residuals[i] }));
    for (const r of rodsOf(axle)) {
      const row = named.find((x) => x.name === r.name)!;
      expect(row.r).toBeCloseTo(dist(at(axle, s, r.axle), r.body) - r.len, 12);
    }
    expect(Math.max(...named.map((x) => Math.abs(x.r)))).toBeCloseTo(res.bind, 12);
    // Back at design nothing binds.
    expect(axle.solve(s, 0, 0).bind).toBeLessThan(1e-12);
  });

  it('binds more when the rods are independent: a plan offset or unequal side-view angles block the roll at first order', () => {
    const bindAt3 = (axle: SolidAxle) => {
      const dz = roll3(axle);
      return axle.solve(axle.rest(), dz, -dz).bind;
    };
    const parallel = bindAt3(build(SOLID_TYPICAL.panhard));
    const offsetBy = (dy: number) =>
      bindAt3(
        build(SOLID_TYPICAL.panhard, (spec) => {
          for (const r of spec.linkage.rods) if (r.id.startsWith('upper')) r.knuckle = [r.knuckle[0], r.knuckle[1] + Math.sign(r.knuckle[1]) * dy, r.knuckle[2]];
        }),
      );
    // The research's invented layout: 0.06 mm at 20 mm of offset, 0.25 mm at 100 mm; ours is another layout, so only the
    // order and the growth are checked.
    expect(offsetBy(0.02)).toBeGreaterThan(10 * parallel);
    expect(offsetBy(0.1)).toBeGreaterThan(offsetBy(0.02));
    expect(offsetBy(0.1)).toBeLessThan(0.5e-3);
    // Unequal side-view angles want different roll steer from the two pairs: the binding grows in proportion.
    const angled = [1, 2].map((d) => bindAt3(build({ ...SOLID_TYPICAL.panhard, upperAngleDeg: SOLID_TYPICAL.panhard.linkAngleDeg - d })));
    expect(angled[0]).toBeGreaterThan(100 * parallel);
    expect(angled[1] / angled[0]).toBeCloseTo(2, 1);
  });

  it('converges each 10 mm step within 8 iterations on one branch, for every template', () => {
    for (const [name, intent] of Object.entries(SOLID_TYPICAL)) {
      const axle = build(intent);
      const s = axle.rest();
      for (const [zL, zR] of grid) {
        const res = axle.solve(s, zL, zR);
        expect(res.iterations, `${name} at ${zL}/${zR}`).toBeLessThanOrEqual(8);
        expect(res.detSign).toBe(axle.detSign);
      }
    }
  });

  it('takes derivatives from the implicit function that match central differences to 1e-6, binding or not', () => {
    const h = 1e-5;
    const cases: SolidAxleIntent[] = [...Object.values(exact), SOLID_TYPICAL.panhard, SOLID_TYPICAL.leaf, SOLID_TYPICAL.deDion];
    for (const intent of cases) {
      const axle = build(intent);
      for (const [zL, zR] of [[0, 0], [0.04, -0.03], [-0.06, 0.05], [0.08, 0.08]] as const) {
        for (const side of ['left', 'right'] as const) {
          const s = newSolidSample();
          axle.measureAt(zL, zR, side, s);
          const own: [number, number] = side === 'left' ? [1, 0] : [0, 1];
          const shifted = (k: number, sign: number) => {
            const out = newSolidSample();
            const d = k === 0 ? own : [own[1], own[0]];
            axle.measureAt(zL + sign * h * d[0], zR + sign * h * d[1], side, out);
            return out;
          };
          const [a, b, c, d] = [shifted(0, 1), shifted(0, -1), shifted(1, 1), shifted(1, -1)];
          const fd = (p: number, q: number) => (p - q) / (2 * h);
          const pairs: Array<[string, number, number]> = [
            ['tanβ', s.tanBeta, fd(a.contactY, b.contactY)],
            ['tanβ cross', s.tanBetaCross, fd(c.contactY, d.contactY)],
            ['tanθ CP', s.tanThetaCP, fd(a.contactX, b.contactX)],
            ['tanθ WC cross', s.tanThetaWCCross, fd(c.wheelX, d.wheelX)],
            ['camber gain', s.camberGain, fd(a.camber, b.camber)],
            ['camber gain cross', s.camberGainCross, fd(c.camber, d.camber)],
            ['bump steer', s.bumpSteer, fd(a.toe, b.toe)],
            ['bump steer cross', s.bumpSteerCross, fd(c.toe, d.toe)],
            ['mr spring', s.mrSpring, -fd(a.springLen, b.springLen)],
            ['mr damper cross', s.mrDamperCross, -fd(c.damperLen, d.damperLen)],
          ];
          for (const [what, x, y] of pairs) expect(Math.abs(x - y), `${intent.lateral} ${side} ${what} at ${zL}/${zR}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('gives a right wheel that mirrors the left one where the axle is symmetric, and wheel poses in the corner layout', () => {
    for (const intent of [SOLID_TYPICAL.triangulated, SOLID_TYPICAL.leaf]) {
      const axle = build(intent);
      for (const [zL, zR] of [[0.05, -0.03], [-0.08, 0.1]] as const) {
        const l = newSolidSample();
        const r = newSolidSample();
        axle.measureAt(zL, zR, 'left', l);
        axle.measureAt(zR, zL, 'right', r);
        for (const f of ['camber', 'toe', 'contactX', 'tanThetaCP', 'camberGain', 'camberGainCross', 'bumpSteer', 'mrSpring', 'mrDamperCross'] as const) {
          expect(Math.abs(l[f] - r[f]), `${intent.lateral} ${f}`).toBeLessThan(1e-9);
        }
        for (const f of ['contactY', 'wheelY', 'tanBeta', 'tanBetaCross'] as const) expect(Math.abs(l[f] + r[f]), `${intent.lateral} ${f}`).toBeLessThan(1e-9);
      }
    }
    // The pose of each wheel puts its design points where the axle has them; the right one through mirrorPose.
    const axle = build(SOLID_TYPICAL.panhard);
    const s = axle.rest();
    axle.solve(s, 0.06, -0.04);
    const W = axle.spec.wheelCentre;
    const k: Vec3 = [W[0] + 0.1, W[1] + 0.05, W[2] - 0.2];
    const pose = new Float64Array(POSE_SIZE);
    const right = new Float64Array(POSE_SIZE);
    const viaPose = (p: Float64Array, point: Vec3, c0: Vec3): Vec3 => {
      // p = c0 + t + R·(k − c0), as solve.ts lays a corner pose out (its wheel centre is c0).
      const r = [0, 0, 0];
      rotateInto(p, 3, point[0] - c0[0], point[1] - c0[1], point[2] - c0[2], r, 0);
      return [c0[0] + p[0] + r[0], c0[1] + p[1] + r[1], c0[2] + p[2] + r[2]];
    };
    axle.wheelPose(s, 'left', pose);
    expect(dist(viaPose(pose, k, W), at(axle, s, k))).toBeLessThan(1e-12);
    axle.wheelPose(s, 'right', pose);
    mirrorPose(pose, right);
    expect(dist(viaPose(right, mirrorY(k), mirrorY(W)), at(axle, s, mirrorY(k)))).toBeLessThan(1e-12);
  });

  it('measures the de Dion half-shafts from their two joint centres; a live axle has none', () => {
    const axle = build(SOLID_TYPICAL.deDion);
    const shaft = axle.spec.halfshaft!;
    expect(axle.spec.diff).toBe('body');
    const s = axle.rest();
    const out = newSolidSample();
    const D = 180 / Math.PI;
    let least = 0;
    let most = 0;
    for (const [zL, zR] of grid) {
      axle.solve(s, zL, zR);
      for (const side of ['left', 'right'] as const) {
        axle.measure(s, side, out);
        const m = (p: Vec3): Vec3 => (side === 'left' ? p : mirrorY(p));
        const outer = at(axle, s, m(shaft.outerJoint));
        const inner = m(shaft.diffOutput);
        const len = dist(outer, inner);
        expect(out.plunge).toBeCloseTo(dist(shaft.outerJoint, shaft.diffOutput) - len, 12);
        const axis = unit(sub(outer, inner));
        expect(out.cvInner).toBeCloseTo(Math.acos(Math.abs(axis[1])), 9);
        const spin = [0, 0, 0];
        axle.solver.direction(s, m(axle.spec.spinAxis), spin);
        expect(out.cvOuter).toBeCloseTo(Math.acos(Math.abs(axis[0] * spin[0] + axis[1] * spin[1] + axis[2] * spin[2])), 9);
        expect(out.cvInner * D).toBeLessThan(shaft.innerMaxDeg);
        expect(out.cvOuter * D).toBeLessThan(shaft.outerMaxDeg);
        least = Math.min(least, out.plunge);
        most = Math.max(most, out.plunge);
      }
    }
    // The tube keeps the hubs a fixed distance apart while the differential stays on the body, so the shafts need to
    // slide both ways, inside the joint's travel.
    expect(least).toBeLessThan(-0.005);
    expect(most).toBeGreaterThan(0.005);
    expect(least).toBeGreaterThan(shaft.plungeM[0]);
    expect(most).toBeLessThan(shaft.plungeM[1]);
    const live = build(SOLID_TYPICAL.panhard);
    expect(live.spec.halfshaft).toBeNull();
    expect(live.spec.diff).toBe('axle');
    live.measureAt(0.08, -0.05, 'left', out);
    expect(out.plunge).toBe(0);
  });
});
