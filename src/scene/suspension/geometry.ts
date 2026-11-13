// Parametric geometry of suspension parts, in scene units (1 unit = 100 mm) and scene axes (scene = (y, z, x)·10 of
// ISO 8855, kinematics.ts). Everything is built once per model from hardpoints and sizes; the coil spring and the
// boots rewrite their vertices in place each frame (CoilSpring, Bellows), so nothing is allocated while it moves.

import * as THREE from 'three';
import { merge } from '../geometry.ts';
import type { Vec3 } from '../../suspension/spec.ts';

const Y = new THREE.Vector3(0, 1, 0);

/** An ISO 8855 point in metres as a scene point. */
export const toScene = (p: Vec3, out = new THREE.Vector3()): THREE.Vector3 => out.set(p[1] * 10, p[2] * 10, p[0] * 10);

/** Moves geometry built along +Y from the origin so that +Y points along `dir` and the origin sits at `at`. */
export function placeAlong(geo: THREE.BufferGeometry, at: THREE.Vector3, dir: THREE.Vector3): THREE.BufferGeometry {
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize()));
  geo.translate(at.x, at.y, at.z);
  return geo;
}

/**
 * A solid of revolution about +Y from profile points [radius, height]. The outer surface must run towards +height, so
 * normals face out. LatheGeometry smooths normals across every profile corner; `flat` keeps each segment's own, for
 * turned parts with sharp edges (disc plates, flanges).
 */
export function lathe(profile: Array<[number, number]>, radial = 24, flat = false): THREE.BufferGeometry {
  const pts = profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h));
  if (!flat) return new THREE.LatheGeometry(pts, radial);
  const segments: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    if (pts[i]!.distanceTo(pts[i + 1]!) > 1e-6) segments.push(new THREE.LatheGeometry([pts[i]!, pts[i + 1]!], radial));
  }
  return merge(segments);
}

/** A solid of revolution about +Y, placed along `dir` from `at`. */
export function latheAlong(profile: Array<[number, number]>, at: THREE.Vector3, dir: THREE.Vector3, radial = 24, flat = false): THREE.BufferGeometry {
  return placeAlong(lathe(profile, radial, flat), at, dir);
}

/** A closed cylinder of radius r from a to b. */
export function rodBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, radial = 12): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r, len, radial).translate(0, len / 2, 0);
  return placeAlong(geo, a, b.clone().sub(a));
}

/** A closed cylinder of radius r and length `length` centred on `centre` along `dir`. */
export function boss(centre: THREE.Vector3, dir: THREE.Vector3, r: number, length: number, radial = 20): THREE.BufferGeometry {
  const d = dir.clone().normalize();
  const geo = new THREE.CylinderGeometry(r, r, length, radial).translate(0, length / 2, 0);
  return placeAlong(geo, centre.clone().addScaledVector(d, -length / 2), d);
}

/** A capsule from a (radius ra) to b (radius rb): a cone closed by two half spheres. Arms of the cast knuckle. */
export function capsule(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, radial = 14): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const pts: Array<[number, number]> = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2);
    pts.push([Math.sin(t) * ra, -Math.cos(t) * ra]);
  }
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2);
    pts.push([Math.cos(t) * rb, len + Math.sin(t) * rb]);
  }
  return latheAlong(pts, a, b.clone().sub(a), radial);
}

/** A hollow tube (closed ring section) between radii, from 0 to `length` along +Y. */
export const ringProfile = (inner: number, outer: number, y0: number, y1: number): Array<[number, number]> => [
  [inner, y0],
  [outer, y0],
  [outer, y1],
  [inner, y1],
  [inner, y0],
];

/**
 * The cast steering knuckle: a hub boss along the spin axis and tapered arms out to every point the links hold, each
 * ending in its own boss, merged into one mesh. The arms leave the space between them empty, as on a real casting:
 * the shape is not convex and does not fill the room between the strut, the ball joint and the steering arm.
 */
export interface KnuckleShape {
  /** Hub boss: centre and axis (outboard). */
  hub: { centre: THREE.Vector3; axis: THREE.Vector3; radius: number; length: number };
  /** Strut clamp around the bottom of the strut tube; none on a knuckle that carries no strut. */
  clamp?: { from: THREE.Vector3; to: THREE.Vector3; radius: number };
  /** Ends of the arms with the boss each carries. An arm with `via` bends through those points (round the disc). */
  ends: KnuckleEnd[];
  /** How far inboard of the hub boss's centre the arms leave it, as a share of its length: 0.15 by default. */
  rootShare?: number;
}

export interface KnuckleEnd {
  at: THREE.Vector3;
  axis: THREE.Vector3;
  radius: number;
  length: number;
  arm: number;
  via?: THREE.Vector3[];
}

export function knuckleGeometry(shape: KnuckleShape): THREE.BufferGeometry {
  const { hub, clamp, ends } = shape;
  const parts: THREE.BufferGeometry[] = [boss(hub.centre, hub.axis, hub.radius, hub.length, 28)];
  // The arms leave the boss from its inboard half, where the casting is thickest.
  const root = hub.centre.clone().addScaledVector(hub.axis, -hub.length * (shape.rootShare ?? 0.15));
  if (clamp) {
    parts.push(rodBetween(clamp.from, clamp.to, clamp.radius, 20));
    const clampMid = clamp.from.clone().lerp(clamp.to, 0.35);
    parts.push(capsule(root, clampMid, hub.radius * 0.62, clamp.radius * 0.8));
  }
  for (const end of ends) parts.push(...armTo(root, end));
  return merge(parts);
}

/** An arm of a casting from `root` to an end and the end's boss: tapered on its first leg, then even. */
export function armTo(root: THREE.Vector3, end: KnuckleEnd): THREE.BufferGeometry[] {
  const path = [root, ...(end.via ?? []), end.at];
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < path.length; i++) parts.push(capsule(path[i]!, path[i + 1]!, i === 0 ? end.arm * 1.35 : end.arm, end.arm));
  parts.push(boss(end.at, end.axis, end.radius, end.length, 16));
  return parts;
}

/** Tyre cross-section as [radius, axial] from the inner bead round the tread to the outer bead. */
export function tyreProfile(freeR: number, rimR: number, width: number, beadWidth: number, steps = 44): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const half = width / 2;
  const bead = beadWidth / 2;
  const wall = freeR - rimR;
  // A superellipse round the section's middle: flat tread, rounded shoulders, bulging sidewalls.
  const cr = rimR + wall * 0.45;
  const ar = half;
  const rr = freeR - cr;
  const e = 2 / 5;
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + (i / steps) * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const r = cr + rr * Math.sign(c) * Math.abs(c) ** e;
    const a = ar * Math.sign(s) * Math.abs(s) ** e;
    pts.push([r, a]);
  }
  // Down the sidewalls to the beads.
  const inner: Array<[number, number]> = [
    [rimR + 0.004, -bead],
    [rimR + wall * 0.2, -half * 0.97],
  ];
  const outer: Array<[number, number]> = [
    [rimR + wall * 0.2, half * 0.97],
    [rimR + 0.004, bead],
  ];
  return [...inner, ...pts.filter(([r]) => r > rimR + wall * 0.3), ...outer];
}

/**
 * Wheel rim as a thin shell of revolution, [radius, axial], a loop with the tyre side first (towards +axial, so its
 * normals face out): inboard flange, bead seat, drop centre, outboard bead seat and flange, then back along the inside
 * of the barrel. Scene units.
 */
export function rimProfile(rimR: number, rimWidth: number): Array<[number, number]> {
  const h = rimWidth / 2;
  const t = 0.06; // 6 mm shell
  const flange = rimR + 0.2;
  return [
    [rimR - t, -h - 0.03],
    [flange, -h - 0.05],
    [flange + 0.01, -h],
    [rimR + 0.02, -h + 0.03],
    [rimR, -h + 0.15],
    [rimR - 0.25, -h + 0.4],
    [rimR - 0.25, h - 0.8],
    [rimR, h - 0.55],
    [rimR, h - 0.03],
    [flange, h - 0.01],
    [flange + 0.01, h + 0.03],
    [flange - 0.02, h + 0.06],
    [rimR - t, h + 0.04],
    [rimR - t - 0.25, h - 0.6],
    [rimR - t - 0.25, -h + 0.45],
    [rimR - t, -h - 0.03],
  ];
}

/** A closed annulus [inner, outer] × [y0, y1] about +Y with sharp edges. */
export const annulus = (inner: number, outer: number, y0: number, y1: number, radial = 48): THREE.BufferGeometry =>
  lathe(ringProfile(inner, outer, y0, y1), radial, true);

/** A box of the given size whose local Y runs from a to b, its local Z along `normal` (made perpendicular). */
export function slab(a: THREE.Vector3, b: THREE.Vector3, normal: THREE.Vector3, width: number, thickness: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const y = b.clone().sub(a).normalize();
  const z = normal.clone().addScaledVector(y, -normal.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const geo = new THREE.BoxGeometry(width, len, thickness).translate(0, len / 2, 0);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(a));
  return geo;
}

/**
 * A coil spring rewritten in place for its length: a tube of round wire along a helix of constant mean radius and
 * turn count, so the wire never flattens. Built along local −Y from the origin (the upper seat). Closed end turns
 * (pitch of one wire) at both ends, the rest shares what is left. Normals are radial from the wire's centreline.
 */
export class CoilSpring {
  readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly meanR: number;
  private readonly turns: number;
  private readonly endTurns: number;
  private readonly steps: number;
  private readonly radial: number;

  constructor(meanR: number, turns: number, endTurns: number, perTurn = 32, radial = 8) {
    this.meanR = meanR;
    this.turns = turns;
    this.endTurns = endTurns;
    this.steps = Math.ceil(turns * perTurn);
    this.radial = radial;
    const count = (this.steps + 1) * radial;
    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    const index: number[] = [];
    for (let i = 0; i < this.steps; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j;
        const b = i * radial + ((j + 1) % radial);
        const c = (i + 1) * radial + j;
        const d = (i + 1) * radial + ((j + 1) % radial);
        index.push(a, c, b, b, c, d);
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
  }

  /** Writes the coil `length` long (seat to seat) with wire of radius `wire`. */
  update(length: number, wire: number): void {
    const { meanR: R, turns, endTurns, steps, radial, positions: P, normals: N } = this;
    const closed = 2 * wire;
    const active = turns - 2 * endTurns;
    const activePitch = Math.max(closed, (length - 2 * wire - 2 * endTurns * closed) / active);
    const total = 2 * Math.PI * turns;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * total;
      const turn = theta / (2 * Math.PI);
      // Axial position of the wire centre from the upper seat, and its pitch here.
      let z: number;
      let pitch: number;
      if (turn < endTurns) {
        z = wire + turn * closed;
        pitch = closed;
      } else if (turn > turns - endTurns) {
        z = wire + endTurns * closed + active * activePitch + (turn - (turns - endTurns)) * closed;
        pitch = closed;
      } else {
        z = wire + endTurns * closed + (turn - endTurns) * activePitch;
        pitch = activePitch;
      }
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      // Centreline (R c, −z, R s); tangent (−R s, −p/2π, R c); radial normal (c, 0, s); binormal = tangent × radial.
      const dz = pitch / (2 * Math.PI);
      let tx = -R * s;
      let ty = -dz;
      let tz = R * c;
      // Math.sqrt, not Math.hypot: V8 does not inline hypot, so each call boxes its arguments, and this runs per vertex.
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const bx = ty * s - tz * 0;
      const by = tz * c - tx * s;
      const bz = tx * 0 - ty * c;
      for (let j = 0; j < radial; j++) {
        const phi = (j / radial) * 2 * Math.PI;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const nx = cp * c + sp * bx;
        const ny = sp * by;
        const nz = cp * s + sp * bz;
        const k = 3 * (i * radial + j);
        P[k] = R * c + wire * nx;
        P[k + 1] = -z + wire * ny;
        P[k + 2] = R * s + wire * nz;
        N[k] = nx;
        N[k + 1] = ny;
        N[k + 2] = nz;
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.normal!.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  /** Solid height of the coil with this wire: every turn touching. */
  solidLength(wire: number): number {
    return 2 * wire * (this.turns + 1);
  }
}

/**
 * A corrugated rubber boot rewritten in place between two ends, each given by a centre and the direction the boot
 * leaves it in: the centreline is a cubic curve tangent to both, so the boot bends with the joint it covers. Radius
 * runs from r0 to r1 with `folds` corrugations of depth `depth`.
 */
export class Bellows {
  readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly rings: number;
  private readonly radial: number;
  /** Radius of each ring and its rate along the boot (per unit of u): the profile does not change with the pose. */
  private readonly ringR: Float64Array;
  private readonly ringDr: Float64Array;
  // Scratch
  private readonly c = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly p2 = new THREE.Vector3();
  private readonly d0 = new THREE.Vector3();
  private readonly d1 = new THREE.Vector3();
  private readonly d2 = new THREE.Vector3();

  constructor(r0: number, r1: number, folds: number, depth: number, rings = 40, radial = 18) {
    this.rings = rings;
    this.radial = radial;
    const radius = (u: number): number => {
      const base = r0 + (r1 - r0) * u;
      // Folds fade out at the clamped ends.
      const fold = 0.5 - 0.5 * Math.cos(2 * Math.PI * folds * u);
      const fade = Math.min(1, u * 8, (1 - u) * 8);
      return base + depth * fold * fade;
    };
    this.ringR = new Float64Array(rings + 1);
    this.ringDr = new Float64Array(rings + 1);
    const du = 1 / rings;
    for (let i = 0; i <= rings; i++) {
      const u = i / rings;
      this.ringR[i] = radius(u);
      this.ringDr[i] = (radius(Math.min(1, u + du)) - radius(Math.max(0, u - du))) / (2 * du);
    }
    const count = (rings + 1) * radial;
    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    const index: number[] = [];
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j;
        const b = i * radial + ((j + 1) % radial);
        const c = (i + 1) * radial + j;
        const d = (i + 1) * radial + ((j + 1) % radial);
        index.push(a, b, c, b, d, c);
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
  }

  /** Boot from a (leaving along da) to b (arriving along db), both directions unit, all in the parent's frame. */
  update(a: THREE.Vector3, da: THREE.Vector3, b: THREE.Vector3, db: THREE.Vector3): void {
    const { rings, radial, positions: P, normals: N, c, t, n, b: bi, p1, p2, d0, d1, d2 } = this;
    const len = a.distanceTo(b);
    p1.copy(a).addScaledVector(da, len / 3);
    p2.copy(b).addScaledVector(db, -len / 3);
    d0.copy(p1).sub(a);
    d1.copy(p2).sub(p1);
    d2.copy(b).sub(p2);
    // Start frame: any normal perpendicular to the first tangent, carried along by projection.
    n.set(0, 0, 0);
    for (let i = 0; i <= rings; i++) {
      const u = i / rings;
      const v = 1 - u;
      c.set(0, 0, 0)
        .addScaledVector(a, v * v * v)
        .addScaledVector(p1, 3 * v * v * u)
        .addScaledVector(p2, 3 * v * u * u)
        .addScaledVector(b, u * u * u);
      t.set(0, 0, 0)
        .addScaledVector(d0, 3 * v * v)
        .addScaledVector(d1, 6 * v * u)
        .addScaledVector(d2, 3 * u * u)
        .normalize();
      if (i === 0) {
        n.set(Math.abs(t.x) < 0.9 ? 1 : 0, Math.abs(t.x) < 0.9 ? 0 : 1, 0);
      }
      n.addScaledVector(t, -n.dot(t)).normalize();
      bi.crossVectors(t, n);
      const r = this.ringR[i]!;
      // Slope of the radius along the boot tilts the normal, so the folds shade as folds.
      const slope = this.ringDr[i]! / Math.max(len, 1e-6);
      for (let j = 0; j < radial; j++) {
        const phi = (j / radial) * 2 * Math.PI;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const rx = cp * n.x + sp * bi.x;
        const ry = cp * n.y + sp * bi.y;
        const rz = cp * n.z + sp * bi.z;
        const k = 3 * (i * radial + j);
        P[k] = c.x + r * rx;
        P[k + 1] = c.y + r * ry;
        P[k + 2] = c.z + r * rz;
        const nx = rx - slope * t.x;
        const ny = ry - slope * t.y;
        const nz = rz - slope * t.z;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        N[k] = nx / nl;
        N[k + 1] = ny / nl;
        N[k + 2] = nz / nl;
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.normal!.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}
