// Where things sit in a real car (stage A1c): the engine placed by its record's mount and crankFront, the wheel
// centres, the body's outer box and the checks the overview's shell and the car builder share, so a bonnet drawn from
// `bay` and the question "does this engine fit" give one answer. Front-axle frame (car.ts): x forward, y left, z up,
// metres, origin on the road under the middle of the front axle.
//
// The engine box is the kinematics.ts envelope until the car builder (stage C4) adds engineEnvelope: crankshaft,
// crankcase, block, heads and pan in the proportions the 3D model draws them (piston-engine.ts, systems/sump.ts),
// without manifolds, turbochargers or ancillaries. That makes it a lower bound: an engine that does not fit by it fits
// by nothing. It reads the pan from systems/sump.ts, which brings three.js along, so the audio thread never imports it.

import { DEG, type Engine } from '../engine/kinematics.ts';
import { systemsOf } from '../engine/systems-spec.ts';
import { panShape } from '../systems/sump.ts';
import { tyreRadiiM, type CarRecord, type PlacedPart, type Vec3 } from './car.ts';
import type { EngineMount } from './vehicle.ts';

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

/** The 3D model's proportions in bores (piston-engine.ts): how far the crank's ends reach past kinematics' zMin and zMax. */
export const CRANK_END_BORES = 0.3;
/** Crankcase radius past the crank throw, in bores. */
export const CRANKCASE_BORES = 0.55;
/** Half width of a head across its bank, in bores, before a VR's zig-zag spread. */
export const HEAD_HALF_WIDTH_BORES = 0.6;
/** Head height above the deck, in bores: pushrod engines carry no cams up there. */
export const HEAD_BORES = { ohv: 0.72, overhead: 0.92 } as const;

/** systems/sump.ts works in scene units (1 = 100 mm) and kinematics.ts in millimetres. */
const SCENE_MM = 100;
const MM_M = 0.001;

/**
 * The engine's core in its own frame (kinematics.ts: crank on Z, its front +Z, Y up, X to the right seen from the
 * front), metres, with the origin at the crank's front end, so that a record's crankFront places it.
 */
export function engineCoreBox(engine: Engine): Box3 {
  if (engine.isRotary) throw new Error(`${engine.spec.id}: a rotary has no kinematic envelope yet; stage C4 adds engineEnvelope`);
  const b = engine.spec.bore;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const take = (x: number, y: number, z: number): void => {
    const p = [x, y, z];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[k]!);
      max[k] = Math.max(max[k]!, p[k]!);
    }
  };
  const nose = engine.zMax + CRANK_END_BORES * b;
  const tail = engine.zMin - CRANK_END_BORES * b;
  // Crankcase round the throws.
  const rc = engine.r + CRANKCASE_BORES * b;
  for (const z of [tail, nose]) {
    take(-rc, -rc, z);
    take(rc, rc, z);
  }
  // Each bank's block and head as a box along its cylinder axis, turned by the bank angle (clockwise from +Y).
  const head = (engine.spec.valvetrain === 'ohv' ? HEAD_BORES.ohv : HEAD_BORES.overhead) * b;
  for (const bank of engine.banks) {
    const spread = bank.cylinders.reduce((m, n) => {
      const cyl = engine.cylinders.find((c) => c.n === n)!;
      return Math.max(m, Math.abs(Math.sin((cyl.alpha - bank.alpha) * DEG)) * engine.deck);
    }, 0);
    const halfW = HEAD_HALF_WIDTH_BORES * b + spread;
    const a = bank.alpha * DEG;
    for (const u of [-halfW, halfW]) {
      for (const v of [0, engine.deck + head]) take(u * Math.cos(a) + v * Math.sin(a), -u * Math.sin(a) + v * Math.cos(a), nose);
    }
  }
  // The pan the 3D model draws: the engine's own sump and oil.
  const pan = panShape(engine, systemsOf(engine.spec));
  take(-pan.halfW * SCENE_MM, pan.bottom * SCENE_MM, pan.zMin * SCENE_MM);
  take(pan.halfW * SCENE_MM, pan.bottom * SCENE_MM, pan.zMax * SCENE_MM);
  return {
    min: [min[0]! * MM_M, min[1]! * MM_M, (min[2]! - nose) * MM_M],
    max: [max[0]! * MM_M, max[1]! * MM_M, (max[2]! - nose) * MM_M],
  };
}

/** An engine-frame vector in the car frame: the inverse of carToEngine (mount.ts). */
export function engineToCar(mount: EngineMount, [x, y, z]: Vec3): Vec3 {
  switch (mount.front) {
    case 'forward':
      return [z, x, y];
    case 'rearward':
      return [-z, -x, y];
    case 'right':
      return [x, -z, y];
    case 'left':
      return [-x, z, y];
  }
}

const corners = (box: Box3): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i): Vec3 => [(i & 1 ? box.max : box.min)[0], (i & 2 ? box.max : box.min)[1], (i & 4 ? box.max : box.min)[2]]);

function boundsOf(points: Vec3[]): Box3 {
  const lo = (k: number): number => Math.min(...points.map((p) => p[k]!));
  const hi = (k: number): number => Math.max(...points.map((p) => p[k]!));
  return { min: [lo(0), lo(1), lo(2)], max: [hi(0), hi(1), hi(2)] };
}

const packagingOf = (car: CarRecord): NonNullable<CarRecord['packaging']> => {
  if (!car.packaging) throw new Error(`${car.id} has no packaging yet`);
  return car.packaging;
};

/** The engine's core in the car frame, turned by the record's mount and moved to its crankFront. */
export function engineBoxInCar(car: CarRecord, engine: Engine): Box3 {
  const at = packagingOf(car).crankFront;
  return boundsOf(
    corners(engineCoreBox(engine)).map((p): Vec3 => {
      const q = engineToCar(car.mount, p);
      return [q[0] + at[0], q[1] + at[1], q[2] + at[2]];
    }),
  );
}

export const containsPoint = (box: Box3, p: Vec3): boolean => [0, 1, 2].every((k) => p[k]! >= box.min[k]! && p[k]! <= box.max[k]!);

export const containsBox = (outer: Box3, inner: Box3): boolean => containsPoint(outer, inner.min) && containsPoint(outer, inner.max);

/** Does the engine fit the car's bay? The shell builds its bonnet from the same bay, so the picture agrees. */
export const fitsBay = (car: CarRecord, engine: Engine): boolean => containsBox(packagingOf(car).bay, engineBoxInCar(car, engine));

/** The body's outer box: nose to tail, width without mirrors, road to roof. */
export function bodyBox(car: CarRecord): Box3 {
  const d = car.dimensions;
  if (!d) throw new Error(`${car.id} has no dimensions yet`);
  return { min: [-(car.body.wheelbaseM + d.rearOverhangM), -d.widthM / 2, 0], max: [d.frontOverhangM, d.widthM / 2, d.heightM] };
}

/** Height of the bonnet's top at x, m: the profile's straight line from the bonnet's front edge to the windscreen's base. */
export function bonnetZ(car: CarRecord, x: number): number {
  const d = car.dimensions;
  if (!d) throw new Error(`${car.id} has no dimensions yet`);
  const [x0, z0] = d.profile.bonnetFront;
  const [x1, z1] = d.profile.cowl;
  return z0 + ((x - x0) / (x1 - x0)) * (z1 - z0);
}

/** Every point of a placed part: two, mirrored across the centre line, for a 'both' pair. */
export const placedPoints = (part: PlacedPart): Vec3[] => (part.side === 'both' ? [part.at, [part.at[0], -part.at[1], part.at[2]]] : [part.at]);

/**
 * Centre of a wheel: on its axle (x = 0 at the front, −wheelbase at the rear), half the axle's track out, at the tyre's
 * rolling radius. A gearbox's output flanges and a suspension's hubs start from here.
 */
export function wheelCentre(car: CarRecord, axle: 'front' | 'rear', side: 'left' | 'right'): Vec3 {
  const track = axle === 'front' ? car.body.trackFrontM : car.body.trackRearM;
  return [axle === 'front' ? 0 : -car.body.wheelbaseM, (side === 'left' ? 1 : -1) * (track / 2), tyreRadiiM(car)[axle]];
}
