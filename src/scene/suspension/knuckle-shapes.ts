// Cast knuckles of the corners that are not a plain strut: the upright of a double wishbone or a multilink, and the
// two halves of a split strut knuckle (dual-axis, RevoKnuckle), the strut carrier and the wheel knuckle that turns in
// it. Each is a hub boss (the carrier: a strut clamp) with an arm out to every point it holds, built by
// knuckleGeometry, so the castings are not convex. Scene axes and units as in geometry.ts.
//
// The brake disc turns with the hub just outboard of the knuckle's arms. An arm whose end sits near the wheel's
// centre plane (a ball joint low in the wheel, a split axis's bearing) would cut through it, so such an arm leaves the
// hub boss inboard, runs out past the disc's edge in a plane behind it, and only then turns outboard to its end.

import * as THREE from 'three';
import type { KnuckleEnd } from './geometry.ts';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** The brake disc's size the arms keep clear of, scene units. */
export interface DiscRoom {
  /** Outer radius of the disc. */
  outer: number;
}

/**
 * The plane behind the disc in which bent arms run, along the spin axis from the wheel centre: 40 mm inboard of the
 * braking ring's inner face, which DRAWING puts 20 mm inboard of the wheel's centre plane.
 */
const ARM_PLANE = -0.62;
/** Radius inside which an arm may still run straight from the hub boss to the arm plane. */
const HUB_REACH = 0.7;

/** What a knuckle holds, and the boss it holds it with. */
export type HoldKind =
  /** A ball joint's stud: boss on the hub's side of the ball, along the vertical. */
  | 'ball'
  /** The steering arm's (or toe link's) ball joint. */
  | 'steer'
  /** The eye of a link: a clevis along the eye's axis. */
  | 'link'
  /** A caliper lug, along the spin axis. */
  | 'lug'
  /** A split axis's bearing, along the steering axis. */
  | 'pivot';

export interface Hold {
  at: THREE.Vector3;
  kind: HoldKind;
  /** The steering axis for a pivot (unit, upward). */
  axis?: THREE.Vector3;
  /** Which side of the pivot the boss sits on along the axis: +1 above, −1 below. */
  side?: 1 | -1;
}

/**
 * The bends an arm from the hub boss takes to reach `end` without cutting the disc: none when the end is well inboard
 * of the arm plane; otherwise into the plane (out to the end's radius) and then outboard.
 */
export function aroundDisc(end: THREE.Vector3, c0: THREE.Vector3, spin: THREE.Vector3): THREE.Vector3[] {
  const rel = end.clone().sub(c0);
  const a = rel.dot(spin);
  if (a <= ARM_PLANE + 0.12) return [];
  const radial = rel.addScaledVector(spin, -a);
  const r = radial.length();
  const plane = c0.clone().addScaledVector(spin, ARM_PLANE);
  if (r <= HUB_REACH) return [plane.clone().add(radial)];
  return [plane.clone().addScaledVector(radial, HUB_REACH / r), plane.clone().add(radial)];
}

/** The point in the plane behind the disc at `end`'s place round the hub: where a bent arm turns outboard. */
export function armPlane(end: THREE.Vector3, c0: THREE.Vector3, spin: THREE.Vector3): THREE.Vector3 {
  const rel = end.clone().sub(c0);
  return c0.clone().add(rel.addScaledVector(spin, ARM_PLANE - rel.dot(spin)));
}

/** The knuckle's end for a point it holds: a boss of the right kind, bent round the disc when it has to be. */
export function holdEnd(hold: Hold, c0: THREE.Vector3, spin: THREE.Vector3, disc: DiscRoom): KnuckleEnd {
  const rel = hold.at.clone().sub(c0);
  const a = rel.dot(spin);
  const r = rel.clone().addScaledVector(spin, -a).length();
  const nearDisc = a > ARM_PLANE + 0.12;
  let end: KnuckleEnd;
  switch (hold.kind) {
    case 'ball': {
      // The boss sits between the ball and the hub: above a low ball, below a high one; short when the ball is low in
      // the wheel beside the disc, so the boss stays outside the disc's radius.
      const towards = hold.at.y < c0.y ? 1 : -1;
      const reach = nearDisc ? Math.min(0.25, Math.max(0.05, r - disc.outer - 0.2)) : 0.25;
      end = { at: hold.at.clone().addScaledVector(UP, towards * reach), axis: UP, radius: 0.24, length: 0.4, arm: nearDisc ? 0.17 : 0.2 };
      break;
    }
    case 'steer':
      end = { at: hold.at.clone().addScaledVector(UP, 0.12), axis: UP, radius: 0.17, length: 0.3, arm: 0.15 };
      break;
    case 'link':
      // A clevis round the link's eye: wider than the eye along its axis.
      end = { at: hold.at.clone(), axis: FORWARD, radius: 0.16, length: 0.5, arm: 0.15 };
      break;
    case 'lug':
      end = { at: hold.at.clone(), axis: spin.clone(), radius: 0.15, length: 0.3, arm: 0.13 };
      break;
    case 'pivot': {
      const axis = hold.axis ?? UP;
      end = { at: hold.at.clone().addScaledVector(axis, (hold.side ?? 1) * 0.15), axis, radius: 0.16, length: 0.3, arm: 0.15 };
      break;
    }
  }
  const via = aroundDisc(end.at, c0, spin);
  if (via.length > 0) end.via = via;
  return end;
}

/**
 * Two points of a split steering axis to draw its bearings at: where the axis is `radius` from the spin axis, above
 * and below the hub. The solver's own axis points may sit inside the brake disc's radius; any two points of the axis
 * carry the same motion.
 */
export function axisPivots(
  c0: THREE.Vector3,
  spin: THREE.Vector3,
  lower: THREE.Vector3,
  upper: THREE.Vector3,
  radius: number,
): { above: THREE.Vector3; below: THREE.Vector3; dir: THREE.Vector3 } {
  const dir = upper.clone().sub(lower).normalize();
  if (dir.y < 0) dir.negate();
  const w = lower.clone().sub(c0);
  w.addScaledVector(spin, -w.dot(spin));
  const u = dir.clone().addScaledVector(spin, -dir.dot(spin));
  // |w + s·u|² = radius²
  const A = u.dot(u);
  const B = 2 * w.dot(u);
  const C = w.dot(w) - radius * radius;
  const root = Math.sqrt(Math.max(0, B * B - 4 * A * C));
  const s1 = (-B + root) / (2 * A);
  const s2 = (-B - root) / (2 * A);
  const p1 = lower.clone().addScaledVector(dir, s1);
  const p2 = lower.clone().addScaledVector(dir, s2);
  return p1.y > p2.y ? { above: p1, below: p2, dir } : { above: p2, below: p1, dir };
}
