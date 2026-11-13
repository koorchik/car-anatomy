// Small vector, quaternion and matrix helpers for the suspension solver. No DOM, no Three.js: the same code runs in
// tests, scripts and the page. Functions that run inside a physics step write into `out` and allocate nothing; the
// tuple helpers are for building data.

import type { Vec3 } from './spec.ts';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const unit = (a: Vec3): Vec3 => scale(a, 1 / norm(a));
/** Mirror a left-corner point to the right side of the car (ISO 8855: y is to the left). */
export const mirrorY = (a: Vec3): Vec3 => [a[0], -a[1], a[2]];

/** A unit vector perpendicular to `a` (any one, chosen stably). */
export function perpendicular(a: Vec3): Vec3 {
  const ax = Math.abs(a[0]);
  const ay = Math.abs(a[1]);
  const az = Math.abs(a[2]);
  const other: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  return unit(cross(a, other));
}

/** Quaternion [x, y, z, w], unit length, rotating vectors as q·v·q⁻¹. */
export type Quat = [number, number, number, number];

export const QUAT_IDENTITY: readonly [number, number, number, number] = [0, 0, 0, 1];

/** Rotates `v` by the unit quaternion stored at `q[o..o+3]`, into `out[oo..oo+2]`. */
export function rotateInto(
  q: ArrayLike<number>,
  o: number,
  vx: number,
  vy: number,
  vz: number,
  out: Float64Array | number[],
  oo: number,
): void {
  const qx = q[o];
  const qy = q[o + 1];
  const qz = q[o + 2];
  const qw = q[o + 3];
  // v + 2w(u × v) + 2u × (u × v), u = (qx, qy, qz)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[oo] = vx + qw * tx + (qy * tz - qz * ty);
  out[oo + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[oo + 2] = vz + qw * tz + (qx * ty - qy * tx);
}

/** q ← exp(θ/2)·q: rotates the orientation `q` (in place, at offset o) by the world rotation vector θ. */
export function rotateQuatBy(q: Float64Array | number[], o: number, tx: number, ty: number, tz: number): void {
  const angle = Math.hypot(tx, ty, tz);
  if (angle === 0) return;
  const s = Math.sin(angle / 2) / angle;
  const dx = tx * s;
  const dy = ty * s;
  const dz = tz * s;
  const dw = Math.cos(angle / 2);
  const qx = q[o];
  const qy = q[o + 1];
  const qz = q[o + 2];
  const qw = q[o + 3];
  let x = dw * qx + dx * qw + dy * qz - dz * qy;
  let y = dw * qy - dx * qz + dy * qw + dz * qx;
  let z = dw * qz + dx * qy - dy * qx + dz * qw;
  let w = dw * qw - dx * qx - dy * qy - dz * qz;
  const n = 1 / Math.hypot(x, y, z, w);
  x *= n;
  y *= n;
  z *= n;
  w *= n;
  q[o] = x;
  q[o + 1] = y;
  q[o + 2] = z;
  q[o + 3] = w;
}

/** Normalised linear interpolation of two unit quaternions (the shorter way round). Enough between 2 mm grid nodes. */
export function nlerpInto(
  a: ArrayLike<number>,
  ao: number,
  b: ArrayLike<number>,
  bo: number,
  t: number,
  out: Float64Array | number[],
  oo: number,
): void {
  const sign = a[ao] * b[bo] + a[ao + 1] * b[bo + 1] + a[ao + 2] * b[bo + 2] + a[ao + 3] * b[bo + 3] < 0 ? -1 : 1;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const v = a[ao + i] * (1 - t) + sign * b[bo + i] * t;
    out[oo + i] = v;
    n += v * v;
  }
  n = 1 / Math.sqrt(n);
  for (let i = 0; i < 4; i++) out[oo + i] *= n;
}

/**
 * Solves the n×n system A·x = b in place by Gaussian elimination with partial pivoting. `a` is row-major n×n and is
 * destroyed, `b` becomes x. Returns the sign of det A (0 when singular).
 */
export function solveLinear(a: Float64Array, b: Float64Array, n: number): number {
  let sign = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    let best = Math.abs(a[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(a[r * n + c]);
      if (v > best) {
        best = v;
        p = r;
      }
    }
    if (best < 1e-300) return 0;
    if (p !== c) {
      sign = -sign;
      for (let k = 0; k < n; k++) {
        const tmp = a[c * n + k];
        a[c * n + k] = a[p * n + k];
        a[p * n + k] = tmp;
      }
      const tb = b[c];
      b[c] = b[p];
      b[p] = tb;
    }
    const pivot = a[c * n + c];
    if (pivot < 0) sign = -sign;
    for (let r = c + 1; r < n; r++) {
      const f = a[r * n + c] / pivot;
      if (f === 0) continue;
      for (let k = c; k < n; k++) a[r * n + k] -= f * a[c * n + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= a[r * n + k] * b[k];
    b[r] = s / a[r * n + r];
  }
  return sign;
}
