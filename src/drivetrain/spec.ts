// Declarative description of a gearbox: rotating members, gears, permanent links, shift elements and the shift matrix.
// Ratios, degrees of freedom, the power path and mesh phases are derived from it (topology.ts), never stored.
//
// Conventions (docs/gearbox-model.md):
// - SI inside the core: rad, rad/s, N·m, kg·m², m. Gear geometry is in millimetres, like the data.
// - Every member turns positive in the crank's direction (clockwise seen from the front, as in kinematics.ts). An
//   external mesh flips the sign, so a reverse gear has a negative ratio; published reverse ratios are magnitudes.
// - i = ω_in/ω_out, signed.
// - Shaft axes run along Z, the gearbox front (the engine side) is +Z, like the crankshaft. Axes sit in the XY plane
//   in millimetres; 1 scene unit = 100 mm.
//
// This file and everything under src/drivetrain/ is plain data and maths: no DOM, no Web Audio, no t().

/** A shaft line: where rotating members sit, in mm from the gearbox centre line (the input shaft). */
export interface AxisDef {
  id: string;
  x: number;
  y: number;
}

/** Anything that turns as one body: a shaft with its fixed gears, a loose gear, a carrier, a drum. */
export interface MemberDef {
  id: string;
  axis: string;
  /** Inertia not carried by its gears (shaft, hub, drum, disc), kg·m². Gears add their own from geometry. */
  inertia?: number;
  /** Planets turn with this carrier: their axis orbits the carrier's. */
  carrier?: string;
  /** Number of planets this member stands for. */
  count?: number;
}

export interface GearDef {
  id: string;
  member: string;
  teeth: number;
  /** Normal module, mm. */
  module: number;
  /** Helix angle at the reference circle, degrees. Positive is a right hand, 0 is spur. */
  helix: number;
  /** Normal pressure angle, degrees. */
  pressureAngle: number;
  /** Profile shift coefficient. */
  shift: number;
  /** Face width, mm. */
  faceWidth: number;
  /** Middle of the face along the shaft, mm behind the gearbox front face. */
  z: number;
  /** Bore through the gear body, mm: a loose gear's needle bearing seat. Absent: solid to the axis. */
  bore?: number;
  internal?: boolean;
  /** Bevel or hypoid: cone angle, degrees. */
  cone?: number;
}

/** z_a·(ω_a − ω_c) ± z_b·(ω_b − ω_c) = 0, minus for an internal pair. Without a carrier ω_c = 0. */
export interface MeshDef {
  a: string;
  b: string;
  carrier?: string;
}

export type ElementKind = 'clutch' | 'brake' | 'synchro' | 'dog' | 'oneway' | 'variator';

export interface FrictionDef {
  faces: number;
  rIn: number;
  rOut: number;
  muStatic: number;
  muKinetic: number;
  /** Stribeck decay of the static excess, rad/s. Judder appears where the slope is negative. */
  stribeck: number;
  /** Clamp force at full command, N. */
  clampN: number;
  /** Command to clamp: diaphragm spring, hydraulic piston with fill time, or electric. */
  actuator: 'diaphragm' | 'hydraulic' | 'electric';
}

export interface SynchroDef {
  cones: 1 | 2 | 3;
  coneHalfAngle: number;
  coneRadius: number;
  muCone: number;
  /** Half the roof angle of the blocking chamfers, from the shaft axis, degrees. */
  chamfer: number;
  chamferRadius: number;
  muChamfer: number;
  /** Engagement (dog) teeth on the gear, for the crunch pitch and the 3D. */
  dogTeeth: number;
  /** Sleeve travel from neutral to engaged, mm. */
  travel: number;
}

export interface ElementDef {
  id: string;
  kind: ElementKind;
  a: string;
  /** Null: the case. */
  b: string | null;
  friction?: FrictionDef;
  synchro?: SynchroDef;
  dog?: { teeth: number; backlashDeg: number; backCutDeg: number };
  /** Sleeve, rail or drum track that moves it, for the lever, the interlock and the 3D. */
  actuator?: string;
}

/** One line of the shift matrix: which elements are closed in this gear. */
export interface GearState {
  name: string;
  closed: string[];
}

export interface GearboxSpec {
  id: string;
  kind: 'layshaft' | 'transaxle' | 'dct' | 'sequential' | 'planetary' | 'cvt' | 'power-split';
  axes: AxisDef[];
  members: MemberDef[];
  gears: GearDef[];
  meshes: MeshDef[];
  /** Permanent rigid joins, ω_a = ω_b (8HP: S1 = S2, C1 = R4…). */
  couplings: Array<[string, string]>;
  elements: ElementDef[];
  /** In driver order: R, N, 1…n (or P, R, N, D for the selector). */
  states: GearState[];
  input: string;
  output: string;
  /** The solver stage adds the launch element, the damper and the spin losses; the kinematics needs none of them. */
  launch?: LaunchDef;
  damper?: DamperDef;
  variator?: VariatorDef;
  motors?: MotorDef[];
  spinLoss?: SpinLossDef;
  /** Mesh efficiency per tooth contact, rolling power. */
  meshEfficiency: number;
}

export type LaunchDef =
  | { kind: 'clutch'; element: string }
  | { kind: 'dual-clutch'; elements: [string, string] }
  | { kind: 'converter'; kStall: number; curve: 'gm-6t40'; lockup: string }
  | { kind: 'none' };

/** Spring between the crank and the gearbox. There always is one; a "solid" disc is a stiff 'disc'. */
export interface DamperDef {
  kind: 'disc' | 'dmf' | 'converter';
  /** N·m/rad. */
  stiffness: number;
  /** N·m·s/rad. */
  damping: number;
  /** Mass behind the spring before the launch element: DMF secondary, disc ring, converter cover and impeller. */
  inertia: number;
}

export interface VariatorDef {
  kind: 'push-belt' | 'chain' | 'toroidal';
  primary: string;
  secondary: string;
  rMin: number;
  rMax: number;
  centre: number;
  sheaveHalfAngle: number;
  mu: number;
  safety: number;
  /** Fastest ratio change the hydraulics allow, 1/s. */
  maxRate: number;
}

export interface MotorDef {
  id: string;
  member: string;
  maxNm: number;
  maxKw: number;
  maxRpm: number;
}

export interface SpinLossDef {
  /** Drag at the input, N·m: a + b·ω, at 90 °C. */
  a: number;
  b: number;
  /** Pump drag for automatics, N·m at 1000 rpm, rising linearly. */
  pump?: number;
}

/**
 * How a differential shares torque between its two outputs.
 *
 * A plate (clutch-pack) differential is described the way makers publish it, by its locking value
 * S = (T_high − T_low)/(T_high + T_low) on drive and on coast (BMW's "Sperrwert 25 %" is S = 0.25, a torque bias
 * ratio of (1 + S)/(1 − S)), plus the spring preload. Equal values make it 2-way, coast 0 makes it 1-way. The ramp
 * angles, plate count and radii that produce S are not published for any car in the catalogue, so they are not data.
 * An absent preload means it is not known; the solver stage decides how to treat it.
 */
export type DifferentialDef =
  | { kind: 'open' }
  | { kind: 'plate'; lockDrive: number; lockCoast: number; preloadNm?: number }
  | { kind: 'torsen' | 'helical'; tbr: number; preloadNm: number }
  | { kind: 'viscous'; nmPerRadS: number }
  | { kind: 'locked' }
  /** Haldex-type, only as a centre device. */
  | { kind: 'coupling'; maxNm: number; lagS: number; control: 'slip' | 'predictive' };
