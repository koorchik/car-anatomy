// What the engine models record while they build themselves, so the systems layers can lay their pipes along the
// real parts without recomputing the models' geometry. Scene units, in the frame of the model's `mounted` group
// (kinematics.ts: crank on Z, front +Z, Y up) unless a field says otherwise.

import type * as THREE from 'three';
import type { PanDims } from '../../systems/sump.ts';

export interface BankAnchor {
  /** Degrees from vertical, clockwise seen from the front. */
  alpha: number;
  halfWidth: number;
  /** Ends of the head along Z. */
  zMin: number;
  zMax: number;
  /** +1 or -1: the bank-frame x side the exhaust leaves from. The intake is on the other side. */
  exhaustSide: number;
  /** The head's frame: a child of `mounted` turned by -alpha. */
  frame: THREE.Object3D;
}

export interface CylinderAnchor {
  n: number;
  bank: number;
  alpha: number;
  z: number;
  /** The cylinder's frame: y runs up the bore from the crank axis. */
  frame: THREE.Object3D;
}

export interface CamAnchor {
  bank: number;
  /** Bank frame. */
  x: number;
  y: number;
  zMin: number;
  zMax: number;
  /** True for an exhaust cam, false for an intake cam, null for a single cam working both. */
  exhaust: boolean | null;
}

export interface ValveAnchor {
  /** Cylinder number. */
  n: number;
  exhaust: boolean;
  /** Valve-seat frame: the stem runs up its +Y. */
  base: THREE.Matrix4;
}

export interface TurboAnchor {
  /** The turbo's own frame, mirrored on one side. Its matrix is up to date. */
  unit: THREE.Object3D;
  size: number;
  /** Side of the engine it hangs on, +1 or -1. */
  sign: number;
  /** 0 for the first turbo of a collector, more for those stacked under it. */
  stack: number;
  /** Unit-local fittings. */
  oilIn: THREE.Vector3;
  oilOut: THREE.Vector3;
  coolantIn: THREE.Vector3;
  coolantOut: THREE.Vector3;
  airIn: THREE.Vector3;
  /** Charge pipe to the plenum, only on the first turbo of a collector. */
  charge: THREE.Vector3[] | null;
}

export interface PistonAnchors {
  kind: 'piston';
  /** Turns with theta: crank drillings are added to it as a child. */
  crank: THREE.Object3D;
  bore: number;
  deck: number;
  headHeight: number;
  crankcaseR: number;
  /** Crank radius, main journal and pin radius, and the radius the counterweights and pins sweep. */
  crankR: number;
  mainR: number;
  pinR: number;
  crankSweep: number;
  /** Bottom of the liners, cylinder frame y, and their radius. */
  linerBottom: number;
  linerR: number;
  /** Block cross-section, engine frame, for checking that a channel stays inside the casting. */
  section: THREE.Vector2[];
  /** Timing-drive end and flywheel end of the block, z. */
  front: number;
  rear: number;
  banks: BankAnchor[];
  cylinders: CylinderAnchor[];
  cams: CamAnchor[];
  camBase: number;
  valveLift: number;
  valves: ValveAnchor[];
  stemLength: number;
  springR: number;
  blockCam: { x: number; y: number } | null;
  /** Pushrod engines: lifter base, pushrod top and rocker pivot of each valve, at rest. */
  pushrods: Array<{ n: number; bank: number; exhaust: boolean; lifter: THREE.Vector3; rodEnd: THREE.Vector3; pivot: THREE.Vector3 }>;
  plenum: { x: number; y: number; r: number; zMin: number; zMax: number };
  /** Runner centre line per cylinder, port first. */
  runners: Array<{ n: number; points: THREE.Vector3[]; r: number }>;
  collectors: Array<{ point: THREE.Vector3; sign: number }>;
  turbos: TurboAnchor[];
  supercharger: { x: number; y: number; halfW: number; height: number; zMin: number; zMax: number } | null;
  pulley: { z: number; r: number };
  alternator: THREE.Vector3;
  /** Where the solid look's oil filter can sits, or null on a flat engine. */
  filter: { position: THREE.Vector3; rotationZ: number } | null;
  pan: PanDims;
}

export interface RotaryAnchors {
  kind: 'rotary';
  /** The eccentric shaft group: turns with theta. */
  shaft: THREE.Object3D;
  R: number;
  e: number;
  width: number;
  /** Half width and half height of a housing. */
  half: number;
  tall: number;
  rotorZ: number[];
  /** Shaft angle offset of each rotor's journal, degrees: its firing phase. */
  rotorPhase: number[];
  /** Plug tips per rotor: leading below the short axis, trailing above it. */
  plugs: Array<{ leading: THREE.Vector3; trailing: THREE.Vector3 }>;
  runners: Array<{ rotor: number; points: THREE.Vector3[]; r: number }>;
  exhausts: Array<{ rotor: number; points: THREE.Vector3[] }>;
  plenum: { x: number; y: number; r: number; zMin: number; zMax: number };
  front: number;
  rear: number;
  pulley: { z: number; r: number };
  pan: PanDims;
}

export type EngineAnchors = PistonAnchors | RotaryAnchors;

/** How the model itself should look while systems layers are on. */
export interface SystemsLook {
  /** Intake manifold, runners, charge pipes and supercharger turn to glass in the X-ray. */
  intakeGlass: boolean;
  /** The model's own spark sprites. Off while the fuel layer draws sparks at their true angles. */
  ownSparks: boolean;
}
