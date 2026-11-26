// The engine's outer box (whole-car plan, the car builder: "does the engine fit"), from the geometry kinematics.ts
// derives and the proportions the 3D models draw: crankshaft with its pulley and flywheel, crankcase, block, heads with
// their cam covers and coil packs, and pan (piston-engine.ts, systems/sump.ts; tests/packaging-model.test.ts holds the
// two together); for a rotary the housings, end plates, eccentric shaft, flywheel and pan (rotary-engine.ts). Without
// manifolds, turbochargers or ancillaries, so it is a lower bound: an engine that does not fit by it fits by nothing.
//
// Engine frame (kinematics.ts: crank on Z, its front +Z, Y up, X to the right seen from the front), metres, with the
// origin at the crankshaft's front end (crankFrontZMm), where a car record's crankFront places it. No DOM: it reads the
// pan from systems/sump.ts as the oil model does, so the audio thread never imports it.

import { panShape } from '../systems/sump.ts';
import { DEG, type Engine } from './kinematics.ts';
import { systemsOf, type SystemsSpec } from './systems-spec.ts';

export type Vec3 = readonly [number, number, number];

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

/** The 3D model's proportions in bores (piston-engine.ts). The crank as drawn reaches this far past zMin and zMax. */
export const CRANK_END_BORES = 0.3;
/** The crank pulley's outer face past kinematics' zMax: the crankshaft's front end, where a record's crankFront sits. */
export const PULLEY_FACE_BORES = 0.7;
/** The flywheel's back face past kinematics' zMin. */
export const FLYWHEEL_FACE_BORES = 0.55;
/** Crankcase radius past the crank throw, in bores. */
export const CRANKCASE_BORES = 0.55;
/** Half width of a head across its bank, in bores, before a VR's zig-zag spread. */
export const HEAD_HALF_WIDTH_BORES = 0.6;
/** Head height above the deck, in bores: pushrod engines carry no cams up there. */
export const HEAD_BORES = { ohv: 0.72, overhead: 0.92 } as const;
/** Cam cover on top of the head, in bores: taller over twin cams. */
export const COVER_BORES = { dohc: 0.36, other: 0.32 } as const;
/** Coil-on-plug packs on the cover of a spark-ignition engine, in bores. */
export const COIL_BORES = 0.07;
/** The timing cover's reach round each sprocket's centre, in bores: the sprocket and the room round it. */
export const TIMING_COVER_BORES = 0.4;

/**
 * A rotary as rotary-engine.ts draws it, in rotor radii R, eccentricities e and millimetres: housings 1.32·R to each
 * side and 1.28·(R + e) up and down, end plates 10 mm past the outer rotors' faces, the eccentric shaft 30 mm past them
 * at both ends (the pulley on its front end), the flywheel of radius 1.1·R and 0.26·R thick behind the rear end.
 */
export const ROTARY = { halfWidthR: 1.32, tallRE: 1.28, plateMm: 10, shaftEndMm: 30, flywheelR: 1.1, flywheelThickR: 0.26 } as const;

/** systems/sump.ts works in scene units (1 = 100 mm) and kinematics.ts in millimetres. */
const SCENE_MM = 100;
const MM_M = 0.001;

/** Flywheel radius, mm, as the 3D model draws it: a heavier flywheel is larger, within what fits under the engine. */
export function flywheelRadiusMm(engine: Engine): number {
  const b = engine.spec.bore;
  const kg = engine.spec.tuning?.flywheelKg;
  const scale = kg ? Math.min(1.25, Math.max(0.72, Math.cbrt(kg / 10))) : 1;
  return Math.max(1.28 * b, engine.r + 1.05 * b) * scale;
}

/** Where a record's crankFront sits on the crank axis, engine-frame Z in mm: the crank pulley's outer face. */
export const crankFrontZMm = (engine: Engine): number =>
  engine.isRotary ? engine.zMax + ROTARY.shaftEndMm : engine.zMax + PULLEY_FACE_BORES * engine.spec.bore;

/** Height of a bank's top above the crank axis along its cylinders, mm: block, head, cam cover and coil packs. */
function bankTopMm(engine: Engine): number {
  const { bore: b, valvetrain, fuel, systems } = engine.spec;
  const head = (valvetrain === 'ohv' ? HEAD_BORES.ohv : HEAD_BORES.overhead) * b;
  const cover = (valvetrain === 'dohc' ? COVER_BORES.dohc : COVER_BORES.other) * b;
  const coils = fuel !== 'diesel' && (systems?.ignition ?? 'coil-on-plug') === 'coil-on-plug' ? COIL_BORES * b : 0;
  return engine.deck + head + cover + coils;
}

/** A pushrod engine's block cam, mm (piston-engine.ts): over the crank in a vee or a flat engine, beside it in a row. */
function blockCamMm(engine: Engine): { x: number; y: number } | null {
  if (engine.spec.valvetrain !== 'ohv') return null;
  const b = engine.spec.bore;
  if (engine.banks.length !== 2) return { x: -0.78 * b, y: engine.r + 0.42 * b };
  const flat = Math.abs(engine.banks[0]!.alpha - engine.banks[1]!.alpha) > 150;
  return { x: 0, y: engine.r + (flat ? 0.55 : 0.85) * b };
}

/** Collects points into a box, millimetres. */
class Bounds {
  readonly min = [Infinity, Infinity, Infinity];
  readonly max = [-Infinity, -Infinity, -Infinity];
  take(x: number, y: number, z: number): void {
    const p = [x, y, z];
    for (let k = 0; k < 3; k++) {
      this.min[k] = Math.min(this.min[k]!, p[k]!);
      this.max[k] = Math.max(this.max[k]!, p[k]!);
    }
  }
  /** Metres, with Z measured from the crankshaft's front end. */
  box(front: number): Box3 {
    return {
      min: [this.min[0]! * MM_M, this.min[1]! * MM_M, (this.min[2]! - front) * MM_M],
      max: [this.max[0]! * MM_M, this.max[1]! * MM_M, (this.max[2]! - front) * MM_M],
    };
  }
}

function rotaryEnvelope(engine: Engine, systems: SystemsSpec): Box3 {
  const layout = engine.spec.layout;
  if (layout.kind !== 'wankel') throw new Error('not a rotary');
  const { R, e } = layout;
  const out = new Bounds();
  const half = ROTARY.halfWidthR * R;
  const tall = ROTARY.tallRE * (R + e);
  const front = crankFrontZMm(engine);
  const back = engine.zMin - ROTARY.shaftEndMm;
  out.take(-half, -tall, engine.zMin - ROTARY.plateMm);
  out.take(half, tall, engine.zMax + ROTARY.plateMm);
  out.take(0, 0, front);
  const fly = ROTARY.flywheelR * R;
  out.take(-fly, -fly, back - ROTARY.flywheelThickR * R);
  out.take(fly, fly, back);
  const pan = panShape(engine, systems);
  out.take(-pan.halfW * SCENE_MM, pan.bottom * SCENE_MM, pan.zMin * SCENE_MM);
  out.take(pan.halfW * SCENE_MM, pan.bottom * SCENE_MM, pan.zMax * SCENE_MM);
  return out.box(front);
}

/**
 * The engine's outer box in its own frame, metres, origin at the crankshaft's front end. `systems` picks the sump and
 * the oil the pan is drawn for: the engine's own unless given (a dry sump's pan is shallower).
 */
export function engineEnvelope(engine: Engine, systems: SystemsSpec = systemsOf(engine.spec)): Box3 {
  if (engine.isRotary) return rotaryEnvelope(engine, systems);
  const b = engine.spec.bore;
  const out = new Bounds();
  const front = crankFrontZMm(engine);
  const nose = engine.zMax + CRANK_END_BORES * b;
  const tail = engine.zMin - CRANK_END_BORES * b;
  // Crankcase round the throws, the pulley ahead of it (smaller than the crankcase) and the flywheel behind it.
  const rc = engine.r + CRANKCASE_BORES * b;
  for (const z of [tail, nose]) {
    out.take(-rc, -rc, z);
    out.take(rc, rc, z);
  }
  out.take(0, 0, front);
  const fly = flywheelRadiusMm(engine);
  out.take(-fly, -fly, engine.zMin - FLYWHEEL_FACE_BORES * b);
  out.take(fly, fly, tail);
  // The timing cover round a pushrod engine's block cam; an overhead cam's sprocket stays under its cam cover.
  const cam = blockCamMm(engine);
  if (cam) {
    const reach = TIMING_COVER_BORES * b;
    out.take(cam.x - reach, cam.y - reach, nose);
    out.take(cam.x + reach, cam.y + reach, nose);
  }
  // Each bank's block and head as a box along its cylinder axis, turned by the bank angle (clockwise from +Y).
  const top = bankTopMm(engine);
  for (const bank of engine.banks) {
    const spread = bank.cylinders.reduce((m, n) => {
      const cyl = engine.cylinders.find((c) => c.n === n)!;
      return Math.max(m, Math.abs(Math.sin((cyl.alpha - bank.alpha) * DEG)) * engine.deck);
    }, 0);
    const halfW = HEAD_HALF_WIDTH_BORES * b + spread;
    const a = bank.alpha * DEG;
    for (const u of [-halfW, halfW]) {
      for (const v of [0, top]) out.take(u * Math.cos(a) + v * Math.sin(a), -u * Math.sin(a) + v * Math.cos(a), nose);
    }
  }
  // The pan the 3D model draws: the engine's own sump and oil, or the ones asked for.
  const pan = panShape(engine, systems);
  out.take(-pan.halfW * SCENE_MM, pan.bottom * SCENE_MM, pan.zMin * SCENE_MM);
  out.take(pan.halfW * SCENE_MM, pan.bottom * SCENE_MM, pan.zMax * SCENE_MM);
  return out.box(front);
}
