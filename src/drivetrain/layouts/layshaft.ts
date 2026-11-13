// A manual gearbox with a countershaft (rear-wheel drive): the input and output shafts are coaxial, the main
// (constant-mesh) pair always turns the countershaft, every speed pair is always in mesh and a sleeve locks its loose
// gear to the output shaft. The direct speed locks the input to the output without any mesh. Reverse runs through an
// idler on its own axis. Research §3.1.
//
// The description is compact and close to what a drawing or a parts list gives; layshaftSpec() expands it into the
// GearboxSpec the core derives everything from. Each pair has its own module: real boxes use a coarser module on
// first and reverse, and the main pairs of one case differ too (research §3.2). The helix angle of every pair
// follows from the shared centre distance, its module, its teeth and its profile shift.

import { centreDistance, gearGeometry, helixForCentre } from '../gear-geometry.ts';
import type { AxisDef, ElementDef, GearboxSpec, GearDef, GearState, MemberDef, MeshDef } from '../spec.ts';

export interface PairDesc {
  /** Driving and driven teeth: input gear and countershaft gear for the main pair, countershaft gear and loose output-shaft gear for a speed. */
  teeth: [number, number];
  /** Normal module, mm. */
  module: number;
  /** Face width, mm. */
  faceWidth: number;
  /** Profile shift of the two gears. A non-zero sum changes the helix the shared centre distance leaves. */
  shift?: [number, number];
}

export interface ReverseDesc {
  /** Countershaft gear, idler, output-shaft gear. Only the outer two set the ratio. */
  teeth: [number, number, number];
  /** One module and one helix for all three: the idler meshes with both. 0 is spur. */
  module: number;
  helix: number;
  faceWidth: number;
  shift?: [number, number, number];
  /** Side of the plane through both shafts the idler sits on: +1 toward +X (right, seen from the front). */
  side: 1 | -1;
  /**
   * How reverse engages. 'synchro' or 'dog': the idler is always in mesh and a sleeve locks the loose output-shaft
   * gear. 'sliding-idler': the idler slides into mesh; the kinematics is the same (an always-meshed idler and a
   * dog), only the 3D slides it.
   */
  engage: 'synchro' | 'dog' | 'sliding-idler';
}

/** A sleeve between two gears on the output shaft, front to back. A null side engages nothing. */
export interface SleeveDesc {
  id: string;
  /** Speed engaged by pushing the sleeve forward (toward the engine), or 'R'. */
  front: number | 'R' | null;
  back: number | 'R' | null;
}

export interface LayshaftDesc {
  id: string;
  /** Countershaft to input/output shaft, mm. */
  centreMm: number;
  /** Normal pressure angle of every pair, degrees. */
  pressureAngle: number;
  /** Hand of the countershaft gears; their mates have the opposite. The countershaft's axial forces then oppose. */
  counterHand: 'left' | 'right';
  main: PairDesc;
  /** First, second, … in order; 'direct' locks the input shaft to the output shaft. */
  speeds: Array<PairDesc | 'direct'>;
  /** Null only for a partial record (a calibration pair) that has no reverse. */
  reverse: ReverseDesc | null;
  /** Front to back. Each speed and reverse sits on one side of one sleeve; the direct speed only at the front of the first. */
  sleeves: SleeveDesc[];
  /** Sleeve and hub width, mm. */
  sleeveWidth: number;
  meshEfficiency: number;
}

/** Spacing along the shafts, mm (layout estimates for the 3D, not data). */
const FRONT_WALL = 12;
/** Synchro cone and dog ring between a gear face and its sleeve. */
const CONE = 9;
const GAP = 4;

export const speedGearId = (speed: number | 'R'): string => (speed === 'R' ? 'main-R' : `main-${speed}`);
export const elementId = (speed: number | 'R'): string => `sync-${speed}`;
export const stateName = (speed: number | 'R'): string => String(speed);

/** Expands a layshaft description into the core's GearboxSpec. Throws on a description that cannot be built. */
export function layshaftSpec(desc: LayshaftDesc): GearboxSpec {
  const a = desc.centreMm;
  const alpha = desc.pressureAngle;
  const hand = desc.counterHand === 'right' ? 1 : -1;
  const helixOf = (pair: PairDesc, what: string): number => {
    const shift = pair.shift ?? [0, 0];
    const beta = helixForCentre(a, pair.module, pair.teeth[0], pair.teeth[1], alpha, shift[0] + shift[1]);
    if (!Number.isFinite(beta)) throw new Error(`${desc.id}: ${what} ${pair.teeth.join('/')} with module ${pair.module} cannot span ${a} mm`);
    return beta;
  };

  // Which sleeve side engages each speed, and the order of parts along the output shaft.
  const sideOf = new Map<number | 'R', { sleeve: string; side: 'front' | 'back' }>();
  for (const s of desc.sleeves) {
    for (const side of ['front', 'back'] as const) {
      const speed = s[side];
      if (speed === null) continue;
      if (sideOf.has(speed)) throw new Error(`${desc.id}: speed ${speed} sits on two sleeves`);
      sideOf.set(speed, { sleeve: s.id, side });
    }
  }
  const speedIds: Array<number | 'R'> = [...desc.speeds.map((_, i) => i + 1), ...(desc.reverse ? ['R' as const] : [])];
  for (const speed of speedIds) if (!sideOf.has(speed)) throw new Error(`${desc.id}: speed ${speed} has no sleeve`);
  const directIndex = desc.speeds.indexOf('direct');
  if (directIndex >= 0) {
    const s = sideOf.get(directIndex + 1)!;
    if (s.side !== 'front' || s.sleeve !== desc.sleeves[0]!.id) throw new Error(`${desc.id}: the direct speed must be the front of the first sleeve`);
  }

  const axes: AxisDef[] = [
    { id: 'main', x: 0, y: 0 },
    { id: 'counter', x: 0, y: -a },
  ];
  const members: MemberDef[] = [
    { id: 'input', axis: 'main' },
    { id: 'counter', axis: 'counter' },
    { id: 'output', axis: 'main' },
  ];
  const gears: GearDef[] = [];
  const meshes: MeshDef[] = [];
  const elements: ElementDef[] = [];

  // Along the shafts: the main pair, then each sleeve with its front gear, the sleeve itself and its back gear.
  let z = FRONT_WALL;
  const place = (width: number): number => {
    const middle = z + width / 2;
    z += width;
    return middle;
  };
  const mainHelix = helixOf(desc.main, 'main pair');
  const mainShift = desc.main.shift ?? [0, 0];
  const mainZ = place(desc.main.faceWidth);
  gears.push(
    { id: 'input-main', member: 'input', teeth: desc.main.teeth[0], module: desc.main.module, helix: -hand * mainHelix, pressureAngle: alpha, shift: mainShift[0], faceWidth: desc.main.faceWidth, z: mainZ },
    { id: 'counter-main', member: 'counter', teeth: desc.main.teeth[1], module: desc.main.module, helix: hand * mainHelix, pressureAngle: alpha, shift: mainShift[1], faceWidth: desc.main.faceWidth, z: mainZ },
  );
  meshes.push({ a: 'input-main', b: 'counter-main' });

  const addSpeed = (speed: number | 'R') => {
    const sleeve = sideOf.get(speed)!.sleeve;
    if (speed === 'R') {
      addReverse(sleeve);
      return;
    }
    const pair = desc.speeds[speed - 1]!;
    if (pair === 'direct') {
      elements.push({ id: elementId(speed), kind: 'synchro', a: 'input', b: 'output', actuator: sleeve });
      return;
    }
    const beta = helixOf(pair, `speed ${speed}`);
    const shift = pair.shift ?? [0, 0];
    const gz = place(pair.faceWidth);
    members.push({ id: `gear-${speed}`, axis: 'main' });
    gears.push(
      { id: `counter-${speed}`, member: 'counter', teeth: pair.teeth[0], module: pair.module, helix: hand * beta, pressureAngle: alpha, shift: shift[0], faceWidth: pair.faceWidth, z: gz },
      { id: speedGearId(speed), member: `gear-${speed}`, teeth: pair.teeth[1], module: pair.module, helix: -hand * beta, pressureAngle: alpha, shift: shift[1], faceWidth: pair.faceWidth, z: gz },
    );
    meshes.push({ a: `counter-${speed}`, b: speedGearId(speed) });
    elements.push({ id: elementId(speed), kind: 'synchro', a: `gear-${speed}`, b: 'output', actuator: sleeve });
  };

  const addReverse = (sleeve: string) => {
    const r = desc.reverse;
    if (!r) throw new Error(`${desc.id}: a sleeve engages reverse but there is none`);
    const [zc, zi, zm] = r.teeth;
    const [xc, xi, xm] = r.shift ?? [0, 0, 0];
    const d1 = centreDistance(r.module, zc, zi, r.helix, alpha, xc + xi);
    const d2 = centreDistance(r.module, zi, zm, r.helix, alpha, xi + xm);
    // The idler's axis: d1 from the countershaft, d2 from the output shaft, on the chosen side.
    const t = (d2 * d2 - d1 * d1 + a * a) / (2 * a);
    const h2 = d2 * d2 - t * t;
    if (h2 <= 0) throw new Error(`${desc.id}: the reverse idler ${zi} cannot reach both reverse gears`);
    axes.push({ id: 'idler', x: r.side * Math.sqrt(h2), y: -t });
    // The two reverse gears share a plane; their tips must clear each other.
    const tip = (teeth: number, shift: number) => gearGeometry({ teeth, module: r.module, helix: r.helix, pressureAngle: alpha, shift, faceWidth: r.faceWidth }).ra;
    if (tip(zc, xc) + tip(zm, xm) >= a) throw new Error(`${desc.id}: reverse gears ${zc} and ${zm} collide at ${a} mm`);
    const gz = place(r.faceWidth);
    members.push({ id: 'gear-R', axis: 'main' }, { id: 'idler', axis: 'idler' });
    gears.push(
      { id: 'counter-R', member: 'counter', teeth: zc, module: r.module, helix: hand * r.helix, pressureAngle: alpha, shift: xc, faceWidth: r.faceWidth, z: gz },
      { id: 'idler-R', member: 'idler', teeth: zi, module: r.module, helix: -hand * r.helix, pressureAngle: alpha, shift: xi, faceWidth: r.faceWidth, z: gz },
      { id: speedGearId('R'), member: 'gear-R', teeth: zm, module: r.module, helix: hand * r.helix, pressureAngle: alpha, shift: xm, faceWidth: r.faceWidth, z: gz },
    );
    meshes.push({ a: 'counter-R', b: 'idler-R' }, { a: 'idler-R', b: speedGearId('R') });
    elements.push({ id: elementId('R'), kind: r.engage === 'synchro' ? 'synchro' : 'dog', a: 'gear-R', b: 'output', actuator: sleeve });
  };

  desc.sleeves.forEach((s) => {
    // The direct speed's dog ring is cut on the back of the input gear, so its sleeve follows the main pair closely.
    const direct = typeof s.front === 'number' && desc.speeds[s.front - 1] === 'direct';
    if (!direct) z += GAP;
    if (s.front !== null) addSpeed(s.front);
    z += CONE;
    place(desc.sleeveWidth);
    z += CONE;
    if (s.back !== null) addSpeed(s.back);
  });

  const states: GearState[] = [
    ...(desc.reverse ? [{ name: stateName('R'), closed: [elementId('R')] }] : []),
    { name: 'N', closed: [] },
    ...desc.speeds.map((_, i) => ({ name: stateName(i + 1), closed: [elementId(i + 1)] })),
  ];
  return {
    id: desc.id,
    kind: 'layshaft',
    axes,
    members,
    gears,
    meshes,
    couplings: [],
    elements,
    states,
    input: 'input',
    output: 'output',
    meshEfficiency: desc.meshEfficiency,
  };
}

/** Length of the gear stack from the front wall to the last gear, mm: what the case has to hold. */
export function stackLength(spec: GearboxSpec): number {
  return Math.max(...spec.gears.map((g) => g.z + g.faceWidth / 2)) + FRONT_WALL;
}
