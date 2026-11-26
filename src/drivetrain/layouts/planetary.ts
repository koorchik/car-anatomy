// A planetary automatic (research §10): simple planetary sets on one axis, each a sun, a ring with internal teeth
// and planets on a carrier; permanent joins between members of different sets; brakes that hold a member to the case
// and clutches that join two members; a shift matrix of the elements each gear closes. Gears are spur and unshifted
// here, so a planet has (z_r − z_s)/2 teeth and must fit between its sun and ring.
//
// The description names the members of set k as S<k>, C<k>, R<k> (sun, carrier, ring); the planets are P<k>.
// planetarySpec() expands it into the GearboxSpec the core derives everything from: one axis for the suns, carriers
// and rings, one per set for its planet copy 0 (straight up from the axis), the planets standing for `planets`
// copies round the carrier (topology.ts checks they can be assembled and clear each other).
//
// The kinematics needs none of the layout. The positions along the axis, the module, the face widths and where each
// element's plate pack sits are estimates for the 3D (the 8HP's are not published), marked as such in the data.

import { gearGeometry } from '../gear-geometry.ts';
import type { AxisDef, ElementDef, GearboxSpec, GearDef, GearState, MemberDef, MeshDef, PackPlace } from '../spec.ts';

export interface PlanetarySetDesc {
  sun: number;
  ring: number;
  /** How many planets: the assembly condition (z_s + z_r)/n whole picks among a few (assemblableCounts). */
  planets: number;
  /** Normal module, mm. */
  module: number;
  /** Face width, mm. */
  faceWidth: number;
  /** Middle of the set along the axis, mm behind the gearbox front face. */
  z: number;
}

export interface PlanetaryElementDesc {
  id: string;
  /** A brake holds `a` to the case; a clutch joins `a` and `b`. */
  kind: 'brake' | 'clutch';
  a: string;
  b: string | null;
  /** Where its plate pack sits, for the 3D (an estimate). */
  pack: Omit<PackPlace, 'element'>;
}

export interface PlanetaryDesc {
  id: string;
  /** Normal pressure angle of every set, degrees. */
  pressureAngle: number;
  /** Set 1 first: the input side. */
  sets: PlanetarySetDesc[];
  /** Permanent joins, by member name: ['S1', 'S2'], ['C1', 'R4']… */
  couplings: Array<[string, string]>;
  input: string;
  output: string;
  elements: PlanetaryElementDesc[];
  /** The shift matrix: 'R', '1'…'n' with the elements each closes, in driver order. Neutral is added. */
  gears: Array<{ name: string; closed: string[] }>;
  meshEfficiency: number;
  /** Outer radius of the case, mm (3D). */
  caseRadius: number;
  /** The torque converter in front (stage K12a): its size, K_stall in rpm/√(N·m), for the car's engine. */
  converter?: { kStall: number };
}

export const sunId = (k: number): string => `S${k}`;
export const carrierId = (k: number): string => `C${k}`;
export const ringId = (k: number): string => `R${k}`;
export const planetId = (k: number): string => `P${k}`;
/** Gear ids: a member's teeth carry the member's name in lower case. */
export const gearOf = (member: string): string => member.toLowerCase();

/** Planet teeth of a spur set without profile shift: the planet spans the gap between sun and ring. */
export function planetTeeth(sun: number, ring: number): number {
  const z = (ring - sun) / 2;
  if (!Number.isInteger(z) || z < 1) throw new Error(`a set with sun ${sun} and ring ${ring} has no whole planet between them`);
  return z;
}

/**
 * Planet counts from 2 to 8 that can be assembled evenly spaced: (z_s + z_r)/n whole. Research §10.2 lists them for
 * the 8HP sets; none of the sources gives the real count.
 */
export function assemblableCounts(sun: number, ring: number): number[] {
  const out: number[] = [];
  for (let n = 2; n <= 8; n++) if ((sun + ring) % n === 0) out.push(n);
  return out;
}

/** The smallest gap between neighbouring planet tips we accept, in modules: room for the carrier's posts (an estimate). */
export const POST_GAP_MODULES = 2;
/** Most planets per set we choose: more share the load, but the carrier's posts need room between them (an estimate). */
export const MAX_PLANETS = 5;

/**
 * The planet count we choose for a set: the most the assembly condition allows, up to MAX_PLANETS, that leaves at
 * least POST_GAP_MODULES between neighbouring tips. Null when none fits.
 */
export function chosenPlanetCount(sun: number, ring: number, module: number, pressureAngle = 20): number | null {
  const zp = planetTeeth(sun, ring);
  const radius = (module * (sun + zp)) / 2;
  const tip = gearGeometry({ teeth: zp, module, helix: 0, pressureAngle, shift: 0, faceWidth: 1 }).ra;
  const fits = assemblableCounts(sun, ring).filter((n) => n >= 3 && n <= MAX_PLANETS && 2 * radius * Math.sin(Math.PI / n) - 2 * tip >= POST_GAP_MODULES * module);
  return fits.length ? Math.max(...fits) : null;
}

/** The speeds of a simple set: z_s·ω_s + z_r·ω_r = (z_s + z_r)·ω_c (research §10.1). */
export const carrierSpeed = (sun: number, ring: number, omegaSun: number, omegaRing: number): number => (sun * omegaSun + ring * omegaRing) / (sun + ring);

/**
 * Inertia of the parts that are not teeth [estimate]: each carrier two steel plates of 4 mm out to the planet circle
 * plus a module, each ring a drum shell of 3 mm as wide as the set, the input shaft of 22 mm and the output of 30 mm
 * over the length of the box. Gears add their own (topology.ts).
 */
const STEEL = 7850;
const ringInertia = (w: number, r1: number, r2: number): number => (STEEL * Math.PI * (w / 1000) * ((r2 / 1000) ** 4 - (r1 / 1000) ** 4)) / 2;

/** Expands a planetary description into the core's GearboxSpec. Throws on a description that cannot be built. */
export function planetarySpec(desc: PlanetaryDesc): GearboxSpec {
  const axes: AxisDef[] = [{ id: 'main', x: 0, y: 0 }];
  const members: MemberDef[] = [];
  const gears: GearDef[] = [];
  const meshes: MeshDef[] = [];
  const length = Math.max(...desc.sets.map((s) => s.z + s.faceWidth / 2));
  desc.sets.forEach((set, i) => {
    const k = i + 1;
    const zp = planetTeeth(set.sun, set.ring);
    const radius = (set.module * (set.sun + zp)) / 2;
    const tooth = { module: set.module, helix: 0, pressureAngle: desc.pressureAngle, shift: 0, faceWidth: set.faceWidth, z: set.z };
    axes.push({ id: `planet-${k}`, x: 0, y: radius });
    const planetCircle = radius + set.module * 2;
    members.push(
      { id: sunId(k), axis: 'main' },
      { id: carrierId(k), axis: 'main', inertia: 2 * ringInertia(4, 0, planetCircle) },
      { id: ringId(k), axis: 'main', inertia: ringInertia(set.faceWidth, (set.module * set.ring) / 2 + 4 * set.module, (set.module * set.ring) / 2 + 4 * set.module + 3) },
      { id: planetId(k), axis: `planet-${k}`, carrier: carrierId(k), count: set.planets },
    );
    gears.push(
      { id: gearOf(sunId(k)), member: sunId(k), teeth: set.sun, ...tooth },
      // A planet turns on needle rollers round its pin: the bore is the needles' outer race (an estimate).
      { id: gearOf(planetId(k)), member: planetId(k), teeth: zp, ...tooth, bore: 0.45 * set.module * zp },
      { id: gearOf(ringId(k)), member: ringId(k), teeth: set.ring, ...tooth, internal: true },
    );
    meshes.push(
      { a: gearOf(sunId(k)), b: gearOf(planetId(k)), carrier: carrierId(k) },
      { a: gearOf(planetId(k)), b: gearOf(ringId(k)), carrier: carrierId(k) },
    );
  });
  const known = new Set(members.map((m) => m.id));
  const check = (id: string | null, what: string) => {
    if (id !== null && !known.has(id)) throw new Error(`${desc.id}: ${what} names ${id}, which is no member of the sets`);
  };
  for (const [a, b] of desc.couplings) {
    check(a, 'a coupling');
    check(b, 'a coupling');
  }
  check(desc.input, 'the input');
  check(desc.output, 'the output');
  const elements: ElementDef[] = desc.elements.map((e) => {
    check(e.a, `element ${e.id}`);
    check(e.b, `element ${e.id}`);
    if ((e.kind === 'brake') !== (e.b === null)) throw new Error(`${desc.id}: element ${e.id}: a brake holds to the case, a clutch joins two members`);
    return { id: e.id, kind: e.kind, a: e.a, b: e.b };
  });
  const ids = new Set(elements.map((e) => e.id));
  for (const g of desc.gears) for (const id of g.closed) if (!ids.has(id)) throw new Error(`${desc.id}: gear ${g.name} closes unknown element ${id}`);
  const add = (id: string, value: number) => {
    const m = members.find((x) => x.id === id)!;
    m.inertia = (m.inertia ?? 0) + value;
  };
  add(desc.input, ringInertia(length + 60, 0, 11));
  add(desc.output, ringInertia(length, 0, 15));
  const reverse = desc.gears.filter((g) => g.name === 'R');
  const states: GearState[] = [...reverse, { name: 'N', closed: [] }, ...desc.gears.filter((g) => g.name !== 'R')];
  return {
    id: desc.id,
    kind: 'planetary',
    axes,
    members,
    gears,
    meshes,
    couplings: desc.couplings.map(([a, b]) => [a, b] as [string, string]),
    elements,
    states,
    input: desc.input,
    output: desc.output,
    meshEfficiency: desc.meshEfficiency,
    packs: desc.elements.map((e) => ({ element: e.id, ...e.pack })),
    ...(desc.converter ? { launch: { kind: 'converter' as const, kStall: desc.converter.kStall, curve: 'gm-6t40' as const, lockup: 'lockup' } } : {}),
  };
}

/** The set a member belongs to (1-based), from its name. */
export const setOf = (member: string): number => Number(member.slice(1));
