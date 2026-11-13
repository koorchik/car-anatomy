// Kinematics of universal (Cardan) joints from their 3D geometry, for the propshaft in 3D and the Cardan
// demonstration (gearbox plan, demonstration 17). A joint is two shafts whose axes meet: the input yoke's pins lie
// across the input shaft, the cross's other arm across both the pins and the output shaft, and that arm is the output
// yoke's pins. Nothing here assumes the textbook result ω₂/ω₁ = cos β/(1 − sin²β·cos²θ); the test checks that the
// geometry gives it. The dynamics takes the joints as constant-velocity on average: at the E30's few degrees the
// unevenness is about a tenth of a per cent (research §13).

export type Vec3 = readonly [number, number, number];

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));

/** Rotates v about the unit axis k by angle t (Rodrigues). */
export function rotate(v: Vec3, k: Vec3, t: number): Vec3 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** A yoke's pin direction (unit, across its shaft) and how fast it turns about its shaft, rad/s. */
export interface Yoke {
  pins: Vec3;
  omega: number;
}

/**
 * Across one joint: the input yoke turning at `input.omega` about the unit axis `from`, the output shaft along the
 * unit axis `to`. The cross's second arm is across the input pins and the output shaft, q = (p × w)/|p × w|; its
 * rotation rate about w is (q × q̇)·w, with q̇ from ṗ = ω·(u × p).
 */
export function acrossJoint(input: Yoke, from: Vec3, to: Vec3): Yoke {
  const n = cross(input.pins, to);
  const len = norm(n);
  const q = scale(n, 1 / len);
  const pDot = scale(cross(from, input.pins), input.omega);
  const nDot = cross(pDot, to);
  const qDot = scale(sub(nDot, scale(q, dot(q, nDot))), 1 / len);
  return { pins: q, omega: dot(cross(q, qDot), to) };
}

/**
 * One joint bent by β in the x–z plane, the input along +z with its yoke θ from the plane of the shafts: the output
 * yoke and its speed per unit input speed.
 */
export function singleJoint(theta: number, beta: number): Yoke {
  const u: Vec3 = [0, 0, 1];
  const w: Vec3 = [Math.sin(beta), 0, Math.cos(beta)];
  return acrossJoint({ pins: [Math.cos(theta), Math.sin(theta), 0], omega: 1 }, u, w);
}

/**
 * Two joints in the Z arrangement (both bends in one plane, the output parallel to the input), β each, the
 * intermediate shaft's second yoke turned by `phase` from its first: the output's speed per unit input speed.
 */
export function twoJoints(theta: number, beta: number, phase: number): number {
  const u: Vec3 = [0, 0, 1];
  const w: Vec3 = [Math.sin(beta), 0, Math.cos(beta)];
  const first = acrossJoint({ pins: [Math.cos(theta), Math.sin(theta), 0], omega: 1 }, u, w);
  const second: Yoke = { pins: rotate(first.pins, w, phase), omega: first.omega };
  return acrossJoint(second, w, u).omega;
}

/** The textbook ratio of one joint, for the demonstration's chart: ω₂/ω₁ = cos β/(1 − sin²β·cos²θ). */
export const cardanRatio = (theta: number, beta: number): number => Math.cos(beta) / (1 - Math.sin(beta) ** 2 * Math.cos(theta) ** 2);
