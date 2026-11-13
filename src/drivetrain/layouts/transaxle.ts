// A two-shaft manual transaxle: the input shaft and the output shaft are parallel, every speed is one pair (one
// mesh), and a pinion on the output shaft drives the final drive's ring gear on the differential case in the same
// case. A transverse engine (Civic) has a helical final drive whose case turns on an axis parallel to the shafts; a
// longitudinal one (911) has a crown wheel and pinion, with the case's axis across the shafts. Research §3.1.
//
// Loose gears may sit on either shaft: their sleeve's shaft says which. Low speeds usually turn loose on the output
// shaft (their input gears are small enough to be cut on the shaft), high speeds on the input shaft. Reverse runs
// through an idler on its own axis, either one gear or a compound idler with two (one meshing the input gear, the
// other the output gear), which lets a short case reach a ratio a single idler cannot.
//
// transaxleSpec() expands the description into the core's GearboxSpec. The differential case is the spec's output,
// so the final drive's mesh carries torque in every gear (the power path lights it), and the state ratios are overall;
// speedRatio() gives a speed's own ratio, the figure makers publish. The case, the differential and the halfshaft
// stubs are placed by transaxleFrame(), shared by the 3D and by the car (where the inner joints sit).

import { centreDistance, gearGeometry, helixForCentre } from '../gear-geometry.ts';
import type { Gearbox, StateInfo } from '../topology.ts';
import type { AxisDef, ElementDef, GearboxSpec, GearDef, GearState, MemberDef, MeshDef, SleevePlace } from '../spec.ts';

export interface TransaxlePairDesc {
  /** Input-shaft gear and output-shaft gear. */
  teeth: [number, number];
  /** Normal module, mm. */
  module: number;
  /** Face width, mm. */
  faceWidth: number;
  shift?: [number, number];
}

export interface TransaxleReverseDesc {
  /** Input-shaft gear, idler, output-shaft gear; or input gear, the idler gear meshing it, the idler gear meshing the output gear, output gear. */
  teeth: [number, number, number] | [number, number, number, number];
  /** One module and one helix for every reverse gear. 0 is spur. */
  module: number;
  helix: number;
  faceWidth: number;
  /** Side of the line from the input axis to the output axis the idler sits on: +1 to the right going from input to output. */
  side: 1 | -1;
  engage: 'synchro' | 'dog';
}

/** A sleeve between two loose gears on one shaft, front (engine side) to back. */
export interface TransaxleSleeveDesc {
  id: string;
  shaft: 'input' | 'output';
  front: number | 'R' | null;
  back: number | 'R' | null;
}

/** The final drive: a helical pair on parallel axes, or a crown wheel and pinion on crossing ones. */
export type TransaxleFinalDesc =
  | {
      kind: 'helical';
      /** Pinion (on the output shaft) and ring gear teeth. */
      teeth: [number, number];
      module: number;
      faceWidth: number;
      /** Output shaft to the differential's axis, mm; the helix follows from it. */
      centreMm: number;
      /** Direction of the differential's axis from the output shaft's, degrees clockwise from +Y seen from the front. */
      deg: number;
    }
  | {
      kind: 'bevel';
      teeth: [number, number];
      /** Outer transverse module, mm. */
      module: number;
      faceWidth: number;
      /** Long and short addendum: the pinion's profile shift, the crown wheel's is its negative. */
      shift: number;
      /** The crown wheel's side of the pinion's axis along X. */
      side: 1 | -1;
    };

export interface TransaxleDesc {
  id: string;
  /** Input shaft to output shaft, mm. */
  centreMm: number;
  /** Direction of the output shaft from the input shaft, degrees clockwise from +Y seen from the front. */
  outputDeg: number;
  /** Normal pressure angle of every cylindrical pair, degrees. */
  pressureAngle: number;
  /** Hand of the input shaft's gears; their mates have the opposite one. */
  inputHand: 'left' | 'right';
  /** First, second, … in order. */
  speeds: TransaxlePairDesc[];
  reverse: TransaxleReverseDesc;
  /** Front to back along the shafts. Each speed and reverse sits on one side of one sleeve. */
  sleeves: TransaxleSleeveDesc[];
  /** Sleeve and hub width, mm. */
  sleeveWidth: number;
  final: TransaxleFinalDesc;
  meshEfficiency: number;
}

/** Spacing along the shafts, mm (layout estimates for the 3D, not data), as in layshaft.ts. */
const FRONT_WALL = 12;
const CONE = 9;
const GAP = 4;
/** mm the speed gears keep from the crown wheel's tips. */
const CROWN_CLEAR = 6;

/** Shafts for the dynamics [estimate, as layshaft.ts]: steel, 0.4 of the centre distance across, the input 150 mm on to the clutch. */
const SHAFT_SHARE = 0.4;
const INPUT_REACH = 150;
const STEEL = 7850;
const ringInertia = (w: number, r1: number, r2: number): number => (STEEL * Math.PI * (w / 1000) * ((r2 / 1000) ** 4 - (r1 / 1000) ** 4)) / 2;

const DEG = Math.PI / 180;

export const elementId = (speed: number | 'R'): string => `sync-${speed}`;
export const stateName = (speed: number | 'R'): string => String(speed);
export const inputGearId = (speed: number | 'R'): string => `in-${speed}`;
export const outputGearId = (speed: number | 'R'): string => `out-${speed}`;
export const PINION = 'final-pinion';
export const RING = 'final-ring';

/** Pitch cone angles of a bevel pair with crossing axes at 90°, rad: δ_pinion = atan(z_p/z_c). */
export function bevelCones(pinion: number, crown: number): { pinion: number; crown: number } {
  const d = Math.atan(pinion / crown);
  return { pinion: d, crown: Math.PI / 2 - d };
}

/** Outer pitch radii and the outer cone distance of a bevel pair, mm. */
export function bevelSizes(module: number, pinion: number, crown: number): { rPinion: number; rCrown: number; cone: number } {
  const rPinion = (module * pinion) / 2;
  const rCrown = (module * crown) / 2;
  return { rPinion, rCrown, cone: Math.hypot(rPinion, rCrown) };
}

/** Expands a transaxle description into the core's GearboxSpec. Throws on a description that cannot be built. */
export function transaxleSpec(desc: TransaxleDesc): GearboxSpec {
  const a = desc.centreMm;
  const alpha = desc.pressureAngle;
  const sign = desc.inputHand === 'right' ? 1 : -1;
  const hand = (beta: number): number => (beta === 0 ? 0 : sign * beta);
  const helixOf = (pair: TransaxlePairDesc, what: string): number => {
    const shift = pair.shift ?? [0, 0];
    const beta = helixForCentre(a, pair.module, pair.teeth[0], pair.teeth[1], alpha, shift[0] + shift[1]);
    if (!Number.isFinite(beta)) throw new Error(`${desc.id}: ${what} ${pair.teeth.join('/')} with module ${pair.module} cannot span ${a} mm`);
    return beta;
  };

  // Which sleeve and side engage each speed.
  const sideOf = new Map<number | 'R', { sleeve: TransaxleSleeveDesc; side: 'front' | 'back' }>();
  for (const s of desc.sleeves) {
    for (const side of ['front', 'back'] as const) {
      const speed = s[side];
      if (speed === null) continue;
      if (speed !== 'R' && !(Number.isInteger(speed) && speed >= 1 && speed <= desc.speeds.length)) {
        throw new Error(`${desc.id}: sleeve ${s.id} engages speed ${speed}, but the box has speeds 1–${desc.speeds.length}`);
      }
      if (sideOf.has(speed)) throw new Error(`${desc.id}: speed ${speed} sits on two sleeves`);
      sideOf.set(speed, { sleeve: s, side });
    }
  }
  for (const speed of [...desc.speeds.map((_, i) => i + 1), 'R' as const]) if (!sideOf.has(speed)) throw new Error(`${desc.id}: speed ${speed} has no sleeve`);

  const d = desc.outputDeg * DEG;
  const out = { x: a * Math.sin(d), y: a * Math.cos(d) };
  const axes: AxisDef[] = [
    { id: 'input', x: 0, y: 0 },
    { id: 'output', x: out.x, y: out.y },
  ];
  const members: MemberDef[] = [
    { id: 'input', axis: 'input' },
    { id: 'output', axis: 'output' },
    { id: 'diff', axis: 'diff' },
  ];
  const gears: GearDef[] = [];
  const meshes: MeshDef[] = [];
  const elements: ElementDef[] = [];
  const sleeves: SleevePlace[] = [];

  let z = FRONT_WALL;
  const place = (width: number): number => {
    const middle = z + width / 2;
    z += width;
    return middle;
  };

  // The final drive at the front of the output shaft, next to the engine.
  const f = desc.final;
  if (f.kind === 'helical') {
    const beta = helixForCentre(f.centreMm, f.module, f.teeth[0], f.teeth[1], alpha, 0);
    if (!Number.isFinite(beta)) throw new Error(`${desc.id}: final drive ${f.teeth.join('/')} with module ${f.module} cannot span ${f.centreMm} mm`);
    const fd = f.deg * DEG;
    axes.push({ id: 'diff', x: out.x + f.centreMm * Math.sin(fd), y: out.y + f.centreMm * Math.cos(fd) });
    const gz = place(f.faceWidth);
    gears.push(
      { id: PINION, member: 'output', teeth: f.teeth[0], module: f.module, helix: hand(beta), pressureAngle: alpha, shift: 0, faceWidth: f.faceWidth, z: gz },
      { id: RING, member: 'diff', teeth: f.teeth[1], module: f.module, helix: hand(-beta), pressureAngle: alpha, shift: 0, faceWidth: f.faceWidth, z: gz },
    );
  } else {
    const cones = bevelCones(f.teeth[0], f.teeth[1]);
    const { rCrown, cone } = bevelSizes(f.module, f.teeth[0], f.teeth[1]);
    if (f.faceWidth > cone / 2.5) throw new Error(`${desc.id}: a bevel face of ${f.faceWidth} mm is wider than the usual third of the cone distance ${cone.toFixed(1)} mm`);
    const gz = place(f.faceWidth * Math.cos(cones.pinion));
    // The pitch cones share an apex on the pinion's axis, ahead of the pinion (toward the engine).
    const mean = cone - f.faceWidth / 2;
    const apex = gz - mean * Math.cos(cones.pinion);
    axes.push({ id: 'diff', x: out.x, y: out.y, across: apex });
    gears.push(
      { id: PINION, member: 'output', teeth: f.teeth[0], module: f.module, helix: 0, pressureAngle: alpha, shift: f.shift, faceWidth: f.faceWidth, z: gz, cone: cones.pinion / DEG },
      { id: RING, member: 'diff', teeth: f.teeth[1], module: f.module, helix: 0, pressureAngle: alpha, shift: -f.shift, faceWidth: f.faceWidth, z: f.side * mean * Math.sin(cones.pinion), cone: cones.crown / DEG },
    );
    // The speed gears start behind the crown wheel's tips.
    const crownTip = rCrown + f.module * (1 + f.shift);
    z = Math.max(z, apex + crownTip + CROWN_CLEAR);
  }
  meshes.push({ a: PINION, b: RING });

  const shaftOf = (speed: number | 'R'): 'input' | 'output' => sideOf.get(speed)!.sleeve.shaft;

  const addSpeed = (speed: number) => {
    const pair = desc.speeds[speed - 1]!;
    const beta = helixOf(pair, `speed ${speed}`);
    const shift = pair.shift ?? [0, 0];
    const gz = place(pair.faceWidth);
    const loose = shaftOf(speed);
    members.push({ id: `gear-${speed}`, axis: loose });
    gears.push(
      { id: inputGearId(speed), member: loose === 'input' ? `gear-${speed}` : 'input', teeth: pair.teeth[0], module: pair.module, helix: hand(beta), pressureAngle: alpha, shift: shift[0], faceWidth: pair.faceWidth, z: gz },
      { id: outputGearId(speed), member: loose === 'output' ? `gear-${speed}` : 'output', teeth: pair.teeth[1], module: pair.module, helix: hand(-beta), pressureAngle: alpha, shift: shift[1], faceWidth: pair.faceWidth, z: gz },
    );
    meshes.push({ a: inputGearId(speed), b: outputGearId(speed) });
    elements.push({ id: elementId(speed), kind: 'synchro', a: `gear-${speed}`, b: loose, actuator: sideOf.get(speed)!.sleeve.id });
  };

  const addReverse = (side: 'front' | 'back') => {
    const r = desc.reverse;
    const [zIn, zIdlerIn, zIdlerOut, zOut] = r.teeth.length === 3 ? [r.teeth[0], r.teeth[1], r.teeth[1], r.teeth[2]] : r.teeth;
    const compound = r.teeth.length === 4;
    const d1 = centreDistance(r.module, zIn, zIdlerIn, r.helix, alpha);
    const d2 = centreDistance(r.module, zIdlerOut, zOut, r.helix, alpha);
    // The idler's axis: d1 from the input axis, d2 from the output axis, on the chosen side of the line between them.
    const t = (d1 * d1 - d2 * d2 + a * a) / (2 * a);
    const h2 = d1 * d1 - t * t;
    if (h2 <= 0) throw new Error(`${desc.id}: the reverse idler cannot reach both reverse gears`);
    const ux = out.x / a;
    const uy = out.y / a;
    // Right of the direction (ux, uy), clockwise seen from the front: (uy, −ux).
    const h = r.side * Math.sqrt(h2);
    axes.push({ id: 'idler', x: t * ux + h * uy, y: t * uy - h * ux });
    const tip = (teeth: number) => gearGeometry({ teeth, module: r.module, helix: r.helix, pressureAngle: alpha, shift: 0, faceWidth: r.faceWidth }).ra;
    if (!compound && tip(zIn) + tip(zOut) >= a) throw new Error(`${desc.id}: reverse gears ${zIn} and ${zOut} collide at ${a} mm`);
    const loose = shaftOf('R');
    members.push({ id: 'gear-R', axis: loose }, { id: 'idler', axis: 'idler' });
    const inMember = loose === 'input' ? 'gear-R' : 'input';
    const outMember = loose === 'output' ? 'gear-R' : 'output';
    // A compound idler takes two planes: the input gear's next to its sleeve when it is the loose one, else the output gear's.
    const planes: Array<'in' | 'out'> = !compound ? ['in'] : (loose === 'input') === (side === 'back') ? ['in', 'out'] : ['out', 'in'];
    const zAt: Record<'in' | 'out', number> = { in: 0, out: 0 };
    for (const p of planes) zAt[p] = place(r.faceWidth);
    if (!compound) zAt.out = zAt.in;
    gears.push(
      { id: inputGearId('R'), member: inMember, teeth: zIn, module: r.module, helix: hand(r.helix), pressureAngle: alpha, shift: 0, faceWidth: r.faceWidth, z: zAt.in },
      { id: 'idler-R', member: 'idler', teeth: zIdlerIn, module: r.module, helix: hand(-r.helix), pressureAngle: alpha, shift: 0, faceWidth: r.faceWidth, z: zAt.in },
    );
    if (compound) gears.push({ id: 'idler-R2', member: 'idler', teeth: zIdlerOut, module: r.module, helix: hand(-r.helix), pressureAngle: alpha, shift: 0, faceWidth: r.faceWidth, z: zAt.out });
    gears.push({ id: outputGearId('R'), member: outMember, teeth: zOut, module: r.module, helix: hand(r.helix), pressureAngle: alpha, shift: 0, faceWidth: r.faceWidth, z: zAt.out });
    meshes.push({ a: inputGearId('R'), b: 'idler-R' }, { a: compound ? 'idler-R2' : 'idler-R', b: outputGearId('R') });
    elements.push({ id: elementId('R'), kind: r.engage, a: 'gear-R', b: loose, actuator: sideOf.get('R')!.sleeve.id });
  };

  const addSide = (speed: number | 'R' | null, side: 'front' | 'back') => {
    if (speed === null) return;
    if (speed === 'R') addReverse(side);
    else addSpeed(speed);
  };

  for (const s of desc.sleeves) {
    z += GAP;
    addSide(s.front, 'front');
    z += CONE;
    const middle = place(desc.sleeveWidth);
    sleeves.push({
      id: s.id, z: middle, width: desc.sleeveWidth, gap: CONE, shaft: s.shaft,
      front: s.front === null ? null : elementId(s.front), back: s.back === null ? null : elementId(s.back),
    });
    z += CONE;
    addSide(s.back, 'back');
  }

  // Shafts over the stack, the input on to the clutch.
  const shaftR = (SHAFT_SHARE * a) / 2;
  members[0]!.inertia = ringInertia(z + INPUT_REACH, 0, shaftR);
  members[1]!.inertia = ringInertia(z, 0, shaftR);

  const states: GearState[] = [
    { name: stateName('R'), closed: [elementId('R')] },
    { name: 'N', closed: [] },
    ...desc.speeds.map((_, i) => ({ name: stateName(i + 1), closed: [elementId(i + 1)] })),
  ];
  return {
    id: desc.id,
    kind: 'transaxle',
    axes,
    members,
    gears,
    meshes,
    couplings: [],
    elements,
    states,
    input: 'input',
    output: 'diff',
    meshEfficiency: desc.meshEfficiency,
    sleeves,
    finalDrive: { pinion: PINION, ring: RING, shaft: 'output', kind: f.kind, ...(f.kind === 'bevel' ? { side: f.side } : {}) },
  };
}

/** The final drive's ratio from its teeth: ring over pinion. Null for a box without one inside. */
export function finalRatio(spec: GearboxSpec): number | null {
  const fd = spec.finalDrive;
  if (!fd) return null;
  const teeth = (id: string) => spec.gears.find((g) => g.id === id)!.teeth;
  return teeth(fd.ring) / teeth(fd.pinion);
}

/**
 * A state's own ratio, input over the output shaft: the figure makers publish for each speed. For a box without a final
 * drive inside it is the state's ratio.
 */
export function speedRatio(box: Gearbox, state: StateInfo): number | null {
  const fd = box.spec.finalDrive;
  if (state.ratio === null || !state.speeds) return null;
  if (!fd) return state.ratio;
  return 1 / state.speeds[box.members.indexOf(fd.shaft)]!;
}

// ---- Where the case, the differential and the halfshaft stubs sit (for the 3D and for the car) ----

/** Layout estimates, mm (not data): case walls, the bellhousing's depth, the differential case and the stubs. */
export const TRANSAXLE_LAYOUT = {
  wall: 10,
  /** The bellhousing's face to the case's front wall: the flywheel, the clutch and its release bearing. */
  bellhousingMm: 120,
  /** The flywheel's radius and its depth behind the bellhousing's face; behind it the clutch cover's radius. */
  flywheelMm: 150,
  flywheelDepthMm: 40,
  clutchMm: 135,
  /** Tip circles to the case. */
  margin: 6,
  /** Differential case radius and half length, in ring-gear pitch radii (helical) or crown pitch radii (bevel). */
  caseRadius: 0.5,
  caseHalf: 0.62,
  /** How far each stub reaches past the case's end to its inner joint centre. */
  stubMm: 70,
};

/** A point in the gearbox frame: x, y from the input axis, z behind the case's front face (GearDef.z), mm. */
export type GearboxPoint = [number, number, number];

export interface DiffPlace {
  /** 'z': the case turns on an axis parallel to the shafts; 'x': across them. */
  axis: 'z' | 'x';
  /** Middle of the differential case. */
  centre: GearboxPoint;
  /** Half the case's length along its axis and its radius, mm. */
  halfLength: number;
  radius: number;
  /** The ring gear's (crown wheel's) tip radius and the middle of its face along the case's axis, mm. */
  ringTip: number;
  ringAt: GearboxPoint;
}

export interface TransaxleFrame {
  diff: DiffPlace;
  /**
   * Inner joint centres of the default stubs, first on the axis's negative side in the engine's frame (−Z, away from
   * the engine, which is +z here; or −X), then the positive one.
   */
  stubs: [GearboxPoint, GearboxPoint];
  /** The case's front and back faces, z (the front may lie ahead of 0 where the crown wheel reaches). */
  front: number;
  back: number;
  /** The bellhousing's engine face, z: the plane where the engine's block ends, on the input axis. */
  bellhousing: number;
}

/** Where everything of a transaxle spec sits (layout estimates on top of the data). */
export function transaxleFrame(spec: GearboxSpec): TransaxleFrame {
  const fd = spec.finalDrive;
  if (!fd) throw new Error(`${spec.id}: no final drive inside the case`);
  const L = TRANSAXLE_LAYOUT;
  const gear = (id: string) => spec.gears.find((g) => g.id === id)!;
  const axis = (member: string) => spec.axes.find((ax) => ax.id === spec.members.find((m) => m.id === member)!.axis)!;
  const ring = gear(fd.ring);
  const pinion = gear(fd.pinion);
  const ringGeo = gearGeometry({ ...ring, helix: Math.abs(ring.helix) });
  const diffAxis = axis(spec.output);
  const back = Math.max(...spec.gears.map((g) => g.z + g.faceWidth / 2), ...(spec.sleeves ?? []).map((s) => s.z + s.width / 2 + s.gap)) + FRONT_WALL;
  let diff: DiffPlace;
  if (fd.kind === 'helical') {
    const r = ringGeo.r;
    diff = {
      axis: 'z',
      centre: [diffAxis.x, diffAxis.y, ring.z],
      halfLength: L.caseHalf * r,
      radius: L.caseRadius * r,
      ringTip: ringGeo.ra,
      ringAt: [diffAxis.x, diffAxis.y, ring.z],
    };
  } else {
    const { rPinion, rCrown } = bevelSizes(ring.module, pinion.teeth, ring.teeth);
    const side = fd.side ?? 1;
    const apex = diffAxis.across!;
    // The case sits on the crown axis a little toward the crown wheel's side; the crown wheel is bolted to it.
    diff = {
      axis: 'x',
      centre: [diffAxis.x + side * 0.35 * rPinion, diffAxis.y, apex],
      halfLength: L.caseHalf * rCrown,
      radius: L.caseRadius * rCrown,
      ringTip: rCrown + ring.module * (1 + ring.shift),
      ringAt: [diffAxis.x + ring.z, diffAxis.y, apex],
    };
  }
  const c = diff.centre;
  const reach = diff.halfLength + L.stubMm;
  const stubs: [GearboxPoint, GearboxPoint] =
    diff.axis === 'z'
      ? [[c[0], c[1], c[2] + reach], [c[0], c[1], c[2] - reach]]
      : [[c[0] - reach, c[1], c[2]], [c[0] + reach, c[1], c[2]]];
  // The case reaches ahead of z = 0 where the crown wheel or the ring gear does: both come in under the clutch. A
  // parallel differential's case sits beside the clutch, as in a front-wheel-drive transaxle whose clutch housing holds
  // the differential, so it may reach on into the bellhousing when it clears the clutch cover across and the flywheel
  // along; otherwise the case starts ahead of it too.
  let front: number;
  if (diff.axis === 'z') {
    front = Math.min(-L.wall, diff.ringAt[2] - ring.faceWidth / 2 - L.margin);
    const nose = c[2] - diff.halfLength - L.margin;
    const besideClutch = Math.hypot(c[0], c[1]) - diff.radius - L.margin >= L.clutchMm && nose >= front - L.bellhousingMm + L.flywheelDepthMm;
    if (!besideClutch) front = Math.min(front, nose);
  } else {
    front = Math.min(-L.wall, c[2] - diff.ringTip - L.margin);
  }
  return { diff, stubs, front, back: back + L.wall, bellhousing: front - L.bellhousingMm };
}
