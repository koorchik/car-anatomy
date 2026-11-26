// The exhaust line under a car (stage C1a; the whole-car plan, how the car goes together in 3D): from the end of the
// engine's down-pipe (after the turbine on a turbocharged engine) down under the floor, along the tunnel to the back
// and up to the record's tailpipe point, packaging.exhaustExit. The catalyst sits close behind the engine; the
// muffler sits pipeM along the line, the length the sound's synthesis is tuned to (ExhaustDef.pipeM), when the line
// has room for it there, and otherwise in its usual place under the back of the car. The card says where the two
// lengths part.
//
// Front-axle frame (car.ts), metres; the scene's axes are (y, z, x)·10. The heights, the radii and where the line
// turns are typical, not measured: no record gives them.

import * as THREE from 'three';
import type { CarRecord, Vec3 } from '../../vehicle/car.ts';
import { placedPoints } from '../../vehicle/packaging.ts';
import { fromScene, toScene } from './car-frame.ts';
import { SimpleModel } from './simple-model.ts';

/** Sizes of the line, m: typical of a car of this size. */
export const EXHAUST = {
  /** Pipe radius. */
  pipeR: 0.028,
  /** Pipe centre above the ground clearance: the pipe sits in the floor's tunnel. */
  aboveClearance: 0.05,
  /** The catalyst: how far along the line its middle is, its length and radius. */
  catalystS: 0.35,
  catalystLength: 0.3,
  catalystR: 0.06,
  /** The muffler's length, half width and half height. */
  mufflerLength: 0.5,
  mufflerHalfWidth: 0.2,
  mufflerHalfHeight: 0.1,
  /** The muffler's middle at least this far ahead of the tailpipe, along the line. */
  tailRoom: 0.45,
} as const;

/** The line as the scene draws it, in the front-axle frame. */
export interface ExhaustRoute {
  /** Points the pipe's curve passes through, from the down-pipe's end to the tailpipe point. */
  points: Vec3[];
  /** The curve through them, scene units. */
  curve: THREE.CatmullRomCurve3;
  lengthM: number;
  catalyst: { s: number; at: Vec3 };
  /** alongPipe: at pipeM along the line, as the synthesis has it; false: in its usual place, which the line leaves. */
  muffler: { s: number; at: Vec3; alongPipe: boolean };
  /** Further tailpipe points of a pair ('both'), each with a short pipe from the muffler. */
  tails: Vec3[];
}

/**
 * Routes the line from `start` (the down-pipe's end, front-axle frame) to the record's tailpipe point. `pipeM` is the
 * synthesis's collector-to-muffler length.
 */
export function exhaustRoute(car: CarRecord, start: Vec3, pipeM: number): ExhaustRoute {
  const d = car.dimensions;
  const p = car.packaging;
  if (!d || !p) throw new Error(`${car.id} has no dimensions and packaging yet`);
  const [end, ...others] = placedPoints(p.exhaustExit) as [Vec3, ...Vec3[]];
  const under = d.groundClearanceM + EXHAUST.aboveClearance;
  const rearAxle = -car.body.wheelbaseM;
  // Down from the down-pipe, over to the tunnel, back along it to behind the rear axle, then up to the tailpipe.
  const down = Math.max(under, Math.min(start[2] - 0.12, under + 0.12));
  const tunnelY = end[1];
  const points: Vec3[] = [
    start,
    [start[0] - 0.06, start[1], down],
    [start[0] - 0.4, (start[1] + tunnelY) / 2, under],
    [start[0] - 0.8, tunnelY, under],
  ];
  const behindAxle = Math.max(end[0] + 0.5, rearAxle - 0.25);
  if (behindAxle < start[0] - 1.0) points.push([behindAxle, tunnelY, under]);
  points.push([end[0] + 0.2, tunnelY, (under + end[2]) / 2], end);
  const curve = new THREE.CatmullRomCurve3(
    points.map((q) => toScene(q)),
    false,
    'centripetal',
  );
  curve.arcLengthDivisions = 400;
  const lengthM = curve.getLength() / 10;
  const at = (s: number): Vec3 => fromScene(curve.getPointAt(Math.min(1, Math.max(0, s / lengthM))));
  const catalystS = Math.min(EXHAUST.catalystS, lengthM * 0.25);
  const lastMuffler = lengthM - EXHAUST.tailRoom;
  const alongPipe = pipeM + EXHAUST.mufflerLength / 2 <= lastMuffler && pipeM - EXHAUST.mufflerLength / 2 > catalystS + EXHAUST.catalystLength / 2;
  const mufflerS = alongPipe ? pipeM : lastMuffler;
  return {
    points,
    curve,
    lengthM,
    catalyst: { s: catalystS, at: at(catalystS) },
    muffler: { s: mufflerS, at: at(mufflerS), alongPipe },
    tails: others,
  };
}

/** A body of revolution or an oval box lying along the curve at `s`. */
function along(curve: THREE.CatmullRomCurve3, lengthM: number, s: number, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const u = Math.min(1, Math.max(0, s / lengthM));
  const tangent = curve.getTangentAt(u);
  // Level along the floor: the body lies flat even where the line climbs.
  const flat = new THREE.Vector3(tangent.x, 0, tangent.z);
  if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), flat.normalize()));
  geometry.translate(...curve.getPointAt(u).toArray());
  return geometry;
}

/** An ellipse of half sizes (a, b) extruded along Z over `length`, centred. */
function ovalBox(a: number, b: number, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape().absellipse(0, 0, a, b, 0, Math.PI * 2, false, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -length / 2);
  return g;
}

/** The exhaust line in the front-axle frame, scene units: pipe, catalyst, muffler and the tailpipes. */
export class ExhaustModel extends SimpleModel {
  readonly route: ExhaustRoute;

  constructor(route: ExhaustRoute, highlight: THREE.ColorRepresentation) {
    super(highlight);
    this.route = route;
    const { curve, lengthM } = route;
    const steel = this.material('#b9b3a8', 0.85, 0.38);
    const pipe = new THREE.TubeGeometry(curve, Math.max(64, Math.round(lengthM * 40)), EXHAUST.pipeR * 10, 12, false);
    this.solid(pipe, steel, 'car.exhaust-pipe');
    const can = this.material('#8f8a82', 0.8, 0.45);
    const catalyst = along(curve, lengthM, route.catalyst.s, ovalBox(EXHAUST.catalystR * 10, EXHAUST.catalystR * 10, EXHAUST.catalystLength * 10));
    this.shell(catalyst, can, this.glass('#d9cfc0', 0.06, 0.42), 'car.catalyst');
    const box = along(curve, lengthM, route.muffler.s, ovalBox(EXHAUST.mufflerHalfWidth * 10, EXHAUST.mufflerHalfHeight * 10, EXHAUST.mufflerLength * 10));
    this.shell(box, can, this.glass('#d9cfc0', 0.06, 0.42), 'car.muffler');
    // A pair's second tailpipe leaves the muffler for its own side.
    const from = toScene(route.muffler.at);
    for (const tail of route.tails) {
      const to = toScene(tail);
      const bend = from.clone().lerp(to, 0.5).setX(to.x);
      this.solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, bend, to], false, 'centripetal'), 24, EXHAUST.pipeR * 10, 12, false), steel, 'car.exhaust-pipe');
    }
  }
}
