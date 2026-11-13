// The glass piece of the body round a corner and the subframe its arms hang from. Illustrative: the hardpoints say
// where the links meet the body, not what the body looks like there, so these are plain boxes and cans placed from
// those points. Scene axes and units as in geometry.ts.

import * as THREE from 'three';
import { merge } from '../geometry.ts';
import type { AxleSpec, Vec3 } from '../../suspension/spec.ts';
import { latheAlong, slab, toScene } from './geometry.ts';

const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const iso = (x: number, y: number, z: number): THREE.Vector3 => toScene([x, y, z]);

export interface CornerBody {
  shell: THREE.BufferGeometry;
  subframe: THREE.BufferGeometry;
}

/** The strut tower round the top mount `T` (scene), the inner fender and the frame rail, and the subframe of the
 *  MacPherson corner of the page (JTEKT). */
export function strutBody(T: THREE.Vector3): CornerBody {
  const towerR = 0.95;
  const shell = merge([
    // Strut tower round the top mount, closed at the top.
    latheAlong(
      [
        [towerR, -1.15],
        [towerR, 0.32],
        [towerR - 0.15, 0.4],
        [0.0001, 0.4],
      ],
      T,
      UP,
      32,
    ),
    // Inner fender from the tower to the front, and the frame rail under it along the car.
    slab(iso(-0.5, 0.452, 0.71), iso(0.42, 0.452, 0.71), X, 3.2, 0.15),
    slab(iso(-0.6, 0.395, 0.55), iso(0.6, 0.395, 0.55), X, 1.0, 0.7),
  ]);
  const subframe = merge([
    slab(iso(-0.26, 0.275, 0.225), iso(0.3, 0.275, 0.225), UP, 0.5, 0.5),
    slab(iso(0.22, 0.29, 0.21), iso(0.22, 0.34, 0.26), X, 0.5, 0.7),
    slab(iso(-0.128, 0.29, 0.21), iso(-0.128, 0.33, 0.295), X, 0.5, 0.7),
  ]);
  return { shell, subframe };
}

/**
 * A corner on arms or links with a coilover: a damper tower round the top mount, a frame rail along the car above the
 * upper pivots with a bracket down to them, and a subframe rail inboard of the lower pivots with a crossmember towards
 * the middle and a bracket up to every pivot that sits off it. Body points below the wheel centre count as lower.
 */
export function linkBody(spec: AxleSpec): CornerBody {
  const link = spec.linkage;
  const top = spec.damper.body;
  const wheelZ = spec.wheelCentre[2];
  const pivots: Vec3[] = [];
  for (const w of link.wishbones) pivots.push(w.front, w.rear);
  for (const r of link.rods) if (!r.steer) pivots.push(r.body);
  const upper = pivots.filter((p) => p[2] >= wheelZ);
  const below = pivots.filter((p) => p[2] < wheelZ);
  const lower = below.length > 0 ? below : pivots;
  const span = (ps: Vec3[]): { x0: number; x1: number; y: number; z0: number; z1: number } => ({
    x0: Math.min(...ps.map((p) => p[0])),
    x1: Math.max(...ps.map((p) => p[0])),
    y: Math.min(...ps.map((p) => p[1])),
    z0: Math.min(...ps.map((p) => p[2])),
    z1: Math.max(...ps.map((p) => p[2])),
  });

  // ---- Body: tower, frame rail, upper bracket ----
  const shell: THREE.BufferGeometry[] = [
    latheAlong(
      [
        [0.62, -0.75],
        [0.62, 0.3],
        [0.5, 0.38],
        [0.0001, 0.38],
      ],
      toScene(top),
      UP,
      32,
    ),
  ];
  const railZ = Math.max(top[2], ...upper.map((p) => p[2])) + 0.08;
  const railY = Math.min(top[1], ...(upper.length > 0 ? [span(upper).y] : [])) - 0.06;
  shell.push(slab(iso(-0.6, railY, railZ), iso(0.6, railY, railZ), X, 1.0, 0.7));
  if (upper.length > 0) {
    const u = span(upper);
    const x = (u.x0 + u.x1) / 2;
    shell.push(slab(iso(x, u.y - 0.035, u.z0 - 0.04), iso(x, u.y - 0.035, railZ), X, (u.x1 - u.x0) * 10 + 0.8, 0.3));
  }

  // ---- Subframe: rail along the lower pivots, crossmember to the middle, brackets ----
  const l = span(lower);
  const zr = l.z0;
  const yr = l.y - 0.045;
  const sub = [slab(iso(l.x0 - 0.08, yr, zr), iso(l.x1 + 0.08, yr, zr), X, 0.6, 0.5)];
  const xm = (l.x0 + l.x1) / 2;
  sub.push(slab(iso(xm, yr, zr), iso(xm, 0.12, zr), UP, 1.2, 0.6));
  for (const p of lower) {
    if (Math.abs(p[2] - zr) < 0.03) continue;
    sub.push(slab(iso(p[0], p[1] - 0.045, zr - 0.03), iso(p[0], p[1] - 0.045, p[2] + 0.03), X, 0.45, 0.4));
  }
  return { shell: merge(shell), subframe: merge(sub) };
}
