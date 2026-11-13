// Plans of the systems layers: pipes, parts and sprays as plain data, built by pure functions from the anchors.
// No meshes here, so tests check the geometry in Node without WebGL. Scene units, model (`mounted`) frame.

import * as THREE from 'three';
import { DEG } from '../../engine/kinematics.ts';

/** Which object a piece hangs on: the engine, or a shaft that turns it along. */
export type Space = 'mounted' | 'crank' | 'shaft';

export interface Route {
  /** parts-info key the pipe explains itself with. */
  part: string;
  /** Flow channel: its speed and brightness come from the simulation. */
  channel: string;
  points: THREE.Vector3[];
  radius: number;
  space?: Space;
  /** Drawn over everything: drillings inside a solid shaft or rotor. */
  overlay?: boolean;
  /** Flow goes against the order of the points. */
  reverse?: boolean;
}

export type PartShape = 'cylinder' | 'ring' | 'box' | 'sphere' | 'disc';
export type PartMaterial = 'metal' | 'dark' | 'tint' | 'mesh' | 'rubber';

export interface PartPlacement {
  part: string;
  shape: PartShape;
  position: THREE.Vector3;
  /** Axis of a cylinder, ring or disc, and the long side of a box. Defaults to +Z. */
  axis?: THREE.Vector3;
  /** cylinder, ring, disc, sphere: radius. box: half sizes x, y, z in its own frame (z along the axis). */
  radius?: number;
  inner?: number;
  length?: number;
  half?: THREE.Vector3;
  material: PartMaterial;
  space?: Space;
}

/** A cone that sprays from a nozzle in a cylinder's frame to a point that moves with the piston. */
export interface PistonSpray {
  part: string;
  channel: string;
  /** Index into engine.cylinders. */
  cylinder: number;
  /** Cylinder frame. */
  from: THREE.Vector2;
  /** Cylinder-frame x of where it lands, and its height above the wrist pin. */
  toX: number;
  aboveWrist: number;
  radius: number;
  /** Event slot that drives it, instead of the channel's spray value: an injection. */
  slot?: number;
}

/** A cone fixed to a shaft: oil flung into a rotor, fuel into a port. */
export interface FixedSpray {
  part: string;
  channel: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  radius: number;
  space?: Space;
  overlay?: boolean;
  /** Event slot that drives it, instead of the channel's spray value. */
  slot?: number;
}

/** A glowing point that lights on an event: a spark at a plug tip, a glow plug, a coil firing. */
export interface Flash {
  part: string;
  position: THREE.Vector3;
  slot: number;
  /** Size relative to the bore-sized default. */
  size?: number;
  color?: string;
}

/** A part turning about its own axis at a ratio of crank speed: a distributor's rotor arm turns at half. */
export interface Spinner {
  part: string;
  position: THREE.Vector3;
  axis: THREE.Vector3;
  /** Arm length and thickness. */
  length: number;
  radius: number;
  ratio: number;
}

/** A disc that slides along an axis by its channel's spray value: the thermostat's valve, a pump plunger. */
export interface Mover {
  part: string;
  position: THREE.Vector3;
  axis: THREE.Vector3;
  radius: number;
  /** Travel at full value, scene units. */
  travel: number;
  channel: string;
  /** Turns across its axis instead of sliding along it: a throttle plate, shut at 8 degrees, open at 88. */
  turn?: boolean;
}

export interface LayerPlan {
  /** Channel ids in shader order. */
  channels: string[];
  routes: Route[];
  parts: PartPlacement[];
  pistonSprays: PistonSpray[];
  fixedSprays: FixedSpray[];
  /** Oil surface: a level plane in the pan's rectangle, kept between the pan's floor (bottom) and its top. */
  level?: { y: number; halfW: number; zMin: number; zMax: number; bottom: number; top: number };
  movers?: Mover[];
  flashes?: Flash[];
  spinners?: Spinner[];
  /** Number of event slots the flashes and sprays read. */
  slots?: number;
  /** Channels whose brightness follows an event slot: a high-pressure line lit by its injection, a lead by its spark. */
  channelSlots?: Record<string, number>;
}

export const emptyPlan = (): LayerPlan => ({ channels: [], routes: [], parts: [], pistonSprays: [], fixedSprays: [] });

/** Adds a route and registers its channel. */
export function addRoute(plan: LayerPlan, route: Route): Route {
  if (!plan.channels.includes(route.channel)) plan.channels.push(route.channel);
  plan.routes.push(route);
  return route;
}

/** Bank-frame point (x across the head, y up the bank) to the engine frame. Same turn as the head frames. */
export function bankPoint(alpha: number, x: number, y: number, z: number): THREE.Vector3 {
  const a = alpha * DEG;
  return new THREE.Vector3(x * Math.cos(a) + y * Math.sin(a), -x * Math.sin(a) + y * Math.cos(a), z);
}

/** The engine-frame point in a bank's frame. */
export function toBank(alpha: number, p: THREE.Vector3): THREE.Vector2 {
  const a = alpha * DEG;
  return new THREE.Vector2(p.x * Math.cos(a) - p.y * Math.sin(a), p.x * Math.sin(a) + p.y * Math.cos(a));
}

/** Even-odd test of a point against a closed polygon. */
export function insidePolygon(x: number, y: number, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a polygon's outline. */
export function distanceToOutline(x: number, y: number, poly: THREE.Vector2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

/** True when a circle of this radius sits inside the polygon. */
export const insideWithMargin = (x: number, y: number, margin: number, poly: THREE.Vector2[]): boolean =>
  insidePolygon(x, y, poly) && distanceToOutline(x, y, poly) >= margin;

/** Distance between two segments in 3D. */
export function segmentDistance(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): number {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) return r.length();
  if (a <= 1e-12) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1.dot(r);
    if (e <= 1e-12) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}

/**
 * Points for a smooth tube that keeps to the polyline: extra points close to each corner make the spline turn
 * tightly there instead of bulging across the bend.
 */
export function tightPath(points: THREE.Vector3[], round = 0.18): THREE.Vector3[] {
  if (points.length < 3) return points;
  const out: THREE.Vector3[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const here = points[i]!;
    const next = points[i + 1]!;
    out.push(here.clone().lerp(prev, round), here.clone(), here.clone().lerp(next, round));
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Length of a polyline. */
export const pathLength = (points: THREE.Vector3[]): number => points.reduce((sum, p, i) => (i ? sum + p.distanceTo(points[i - 1]!) : 0), 0);

/** The point at a share of a polyline's length. */
export function pointAlong(points: THREE.Vector3[], share: number): THREE.Vector3 {
  const total = pathLength(points);
  let left = total * Math.min(1, Math.max(0, share));
  for (let i = 1; i < points.length; i++) {
    const seg = points[i]!.distanceTo(points[i - 1]!);
    if (left <= seg || i === points.length - 1) return points[i - 1]!.clone().lerp(points[i]!, seg > 0 ? Math.min(1, left / seg) : 0);
    left -= seg;
  }
  return points[points.length - 1]!.clone();
}
