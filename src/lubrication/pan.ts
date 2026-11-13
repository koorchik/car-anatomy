// The pan as columns: each has a floor and a ceiling, and the oil under a tilted plane y = h + sx·x + sz·z is the sum
// over the columns. V(h) never decreases, so the level of a given volume is found by Newton's method on the wetted
// area (dV/dh), started from the last step's level and kept inside a bracket. Scene units: 1 unit = 100 mm, so
// volumes come out in litres. No DOM, no allocation per step.

import type { PanShape, PanRect } from '../systems/sump.ts';

export const GRID_X = 12;
export const GRID_Z = 24;

/** One region of the pan: a set of columns with their floors and ceilings. */
export interface PanRegion {
  count: number;
  x: Float64Array;
  z: Float64Array;
  floor: Float64Array;
  ceil: Float64Array;
  /** Plan area of one column. */
  area: number;
}

const inside = (r: PanRect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

function region(cells: Array<{ x: number; z: number; floor: number; ceil: number }>, area: number): PanRegion {
  const n = cells.length;
  const out: PanRegion = { count: n, x: new Float64Array(n), z: new Float64Array(n), floor: new Float64Array(n), ceil: new Float64Array(n), area };
  cells.forEach((c, i) => {
    out.x[i] = c.x;
    out.z[i] = c.z;
    out.floor[i] = c.floor;
    out.ceil[i] = c.ceil;
  });
  return out;
}

export interface PanGrid {
  /** Every column, the box's with its lid: what the oil settles into given time. */
  all: PanRegion;
  /** Columns of the compartment round the pickup. Empty on a dry sump. */
  box: PanRegion;
  /** The rest. */
  outside: PanRegion;
  /** Column size. */
  dx: number;
  dz: number;
}

/** The columns of a pan. On a dry sump `all` is its shallow pan. */
export function panGrid(shape: PanShape, nx = GRID_X, nz = GRID_Z): PanGrid {
  const W = 2 * shape.halfW;
  const L = shape.zMax - shape.zMin;
  const dx = W / nx;
  const dz = L / nz;
  const all: Array<{ x: number; z: number; floor: number; ceil: number }> = [];
  const box: typeof all = [];
  const outside: typeof all = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = -shape.halfW + (i + 0.5) * dx;
      const z = shape.zMin + (j + 0.5) * dz;
      const floor = inside(shape.well, x, z) ? shape.yFloor : shape.yShelf;
      const inBox = !!shape.box && inside(shape.box, x, z);
      const ceil = inBox ? shape.box!.top : shape.top;
      const cell = { x, z, floor, ceil };
      all.push(cell);
      (inBox ? box : outside).push(cell);
    }
  }
  return { all: region(all, dx * dz), box: region(box, dx * dz), outside: region(outside, dx * dz), dx, dz };
}

/** Oil under the plane y = h + sx·x + sz·z in a region, litres. */
export function volumeUnder(r: PanRegion, h: number, sx: number, sz: number): number {
  let v = 0;
  for (let i = 0; i < r.count; i++) {
    const d = h + sx * r.x[i]! + sz * r.z[i]! - r.floor[i]!;
    if (d <= 0) continue;
    const cap = r.ceil[i]! - r.floor[i]!;
    v += d < cap ? d : cap;
  }
  return v * r.area;
}

/** Most the region holds, litres. */
export function capacity(r: PanRegion): number {
  let v = 0;
  for (let i = 0; i < r.count; i++) v += r.ceil[i]! - r.floor[i]!;
  return v * r.area;
}

/** Scratch for one solve, reused. */
export interface LevelSolve {
  h: number;
  /** Area of the surface, columns neither dry nor full. */
  wetArea: number;
  iterations: number;
}

export const newLevelSolve = (): LevelSolve => ({ h: 0, wetArea: 0, iterations: 0 });

/**
 * Level h of a volume under a plane of slope (sx, sz), starting from `guess`. Writes into `out`. A volume of zero or
 * more than the region holds gives the bottom or the top of the bracket.
 */
export function solveLevel(r: PanRegion, volume: number, sx: number, sz: number, guess: number, out: LevelSolve): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < r.count; i++) {
    const tilt = sx * r.x[i]! + sz * r.z[i]!;
    const f = r.floor[i]! - tilt;
    const c = r.ceil[i]! - tilt;
    if (f < lo) lo = f;
    if (c > hi) hi = c;
  }
  out.iterations = 0;
  if (r.count === 0 || volume <= 0) {
    out.h = lo;
    out.wetArea = 0;
    return;
  }
  let h = Math.min(hi, Math.max(lo, guess));
  for (let it = 0; it < 60; it++) {
    out.iterations = it + 1;
    let v = 0;
    let wet = 0;
    for (let i = 0; i < r.count; i++) {
      const d = h + sx * r.x[i]! + sz * r.z[i]! - r.floor[i]!;
      if (d <= 0) continue;
      const cap = r.ceil[i]! - r.floor[i]!;
      if (d < cap) {
        v += d;
        wet += 1;
      } else v += cap;
    }
    v *= r.area;
    wet *= r.area;
    const err = v - volume;
    if (err > 0) hi = h;
    else lo = h;
    if (Math.abs(err) < 1e-7 || hi - lo < 1e-9) {
      out.h = h;
      out.wetArea = wet;
      return;
    }
    // Newton on the wetted area; bisection when that would leave the bracket or nothing is wet.
    let next = wet > 0 ? h - err / wet : Number.NaN;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    h = next;
  }
  out.h = h;
  out.wetArea = 0;
}

/** Extent of the wetted columns along x and z, and their mean depth: what the slosh frequency is worked out from. */
export function wettedSize(r: PanRegion, h: number, sx: number, sz: number, out: { lengthX: number; lengthZ: number; depth: number }, dx: number, dz: number): void {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let v = 0;
  let n = 0;
  for (let i = 0; i < r.count; i++) {
    const d = h + sx * r.x[i]! + sz * r.z[i]! - r.floor[i]!;
    if (d <= 1e-4) continue;
    const cap = r.ceil[i]! - r.floor[i]!;
    v += d < cap ? d : cap;
    n++;
    const x = r.x[i]!;
    const z = r.z[i]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (n === 0) {
    out.lengthX = dx;
    out.lengthZ = dz;
    out.depth = 0;
    return;
  }
  out.lengthX = x1 - x0 + dx;
  out.lengthZ = z1 - z0 + dz;
  out.depth = v / n;
}
