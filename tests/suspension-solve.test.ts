import { describe, expect, it } from 'vitest';
import { macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { buildAxle, mirrorPose, newCornerSample, type CornerSample } from '../src/suspension/kinematics.ts';
import { CornerSolver, POSE_SIZE } from '../src/suspension/solve.ts';
import type { AxleSpec, Vec3 } from '../src/suspension/spec.ts';
import { dist, mirrorY, nullSpace, rank, sub, svd, unit } from '../src/suspension/vec.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { multilink, multilinkDefaults } from '../src/suspension/templates/multilink.ts';

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
