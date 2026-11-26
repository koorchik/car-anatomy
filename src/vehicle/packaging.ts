// Where things sit in a real car (stage A1c): the engine placed by its record's mount and crankFront, the wheel
// centres, the body's outer box and the checks the overview's shell and the car builder share, so a bonnet drawn from
// `bay` and the question "does this engine fit" give one answer. Front-axle frame (car.ts): x forward, y left, z up,
// metres, origin on the road under the middle of the front axle.
//
// The engine box is engineEnvelope (src/engine/envelope.ts, stage C4): crankshaft with its pulley and flywheel,
// crankcase, block, heads with their cam covers and coil packs, and pan, in the proportions the 3D model draws them
// (piston-engine.ts, systems/sump.ts; tests/packaging-model.test.ts holds the two together), without manifolds,
// turbochargers or ancillaries. That makes it a lower bound: an engine that does not fit by it fits by nothing. It reads
// the pan from systems/sump.ts, which brings three.js along, so the audio thread never imports it.

import { engineEnvelope, type Box3 } from '../engine/envelope.ts';
import type { Engine } from '../engine/kinematics.ts';
import { tyreRadiiM, type CarRecord, type PlacedPart, type Vec3 } from './car.ts';
import type { EngineMount } from './vehicle.ts';

export {
  COIL_BORES, COVER_BORES, CRANK_END_BORES, CRANKCASE_BORES, crankFrontZMm, FLYWHEEL_FACE_BORES, flywheelRadiusMm, HEAD_BORES,
  HEAD_HALF_WIDTH_BORES, PULLEY_FACE_BORES, TIMING_COVER_BORES,
} from '../engine/envelope.ts';
export type { Box3 };

/** The engine's core in its own frame, metres, origin at the crankshaft's front end: engineEnvelope with its own sump. */
export const engineCoreBox = (engine: Engine): Box3 => engineEnvelope(engine);

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

/** Where an engine leaves its car's bay: metres past each face (0 inside) and the plan it comes up through the lid in. */
export interface BayOverflow {
  fits: boolean;
  past: { front: number; rear: number; left: number; right: number; top: number; bottom: number };
  /**
   * Over this rectangle of the lid (front-axle frame, x0 < x1, y0 < y1) the engine stands above the bay's top, so it
   * comes up through the lid built from the bay (body-shell.ts cuts it open there); null when it stays under the top.
   */
  throughLid: { x0: number; x1: number; y0: number; y1: number } | null;
}

/** The diagnosis behind fitsBay, said face by face; the overview's lid is cut where it says the engine comes through. */
export function bayOverflow(car: CarRecord, engine: Engine): BayOverflow {
  const bay = packagingOf(car).bay;
  const box = engineBoxInCar(car, engine);
  const over = (a: number, b: number): number => Math.max(0, a - b);
  const past = {
    front: over(box.max[0], bay.max[0]),
    rear: over(bay.min[0], box.min[0]),
    left: over(box.max[1], bay.max[1]),
    right: over(bay.min[1], box.min[1]),
    top: over(box.max[2], bay.max[2]),
    bottom: over(bay.min[2], box.min[2]),
  };
  const x0 = Math.max(box.min[0], bay.min[0]);
  const x1 = Math.min(box.max[0], bay.max[0]);
  const y0 = Math.max(box.min[1], bay.min[1]);
  const y1 = Math.min(box.max[1], bay.max[1]);
  const throughLid = past.top > 0 && x0 < x1 && y0 < y1 ? { x0, x1, y0, y1 } : null;
  return { fits: Object.values(past).every((v) => v === 0), past, throughLid };
}

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
