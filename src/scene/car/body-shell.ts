// The body as a glass shell (stage P7-geom; the whole-car plan, on how the car goes together in 3D), shared by the suspension's
// ChassisModel and the car overview. It is a loft through cross-sections built from the record: length, width, height,
// both overhangs, the ground clearance and the side profile (the bonnet's front edge, the base of the windscreen, the
// roof). Between those points the shape is ours: a rounded plan, a roof narrower than the body above the belt line, a
// rear deck by body type. No doors, handles or lamps (docs/ideas.md: no photo-real models).
//
// The lid over the engine bay (the bonnet, or the engine lid of a rear or mid engine) and the bulkhead behind it are
// built from the same packaging.bay box the car builder fits the engine into, and the top of the shell never dips below
// the bay's top over it, so "the engine sticks out of the bonnet" and the picture always say the same thing.
//
// The wheel wells are boxes under round arches cut out of the side, sized by the wheel's sweep (the suspension's
// WheelSweep: the bump the arches allow for and the whole steering lock), so the body never cuts a wheel. Each section
// has the same eight points on each side; outside an arch the well's points sit on the sill and close up.
//
// Front-axle frame (car.ts) and the scene's axes: scene = (y, z, x)·10, 1 unit = 100 mm. A group positioned by its
// owner (ChassisModel moves it into the CG frame).

import * as THREE from 'three';
import { glassMaterial } from '../materials.ts';
import { markDamaged, tag, type ViewMode } from '../model-types.ts';
import type { PartInfo } from '../parts-info.ts';
import type { CarRecord, Vec3 } from '../../vehicle/car.ts';
import { BODY_PARTS } from './parts.ts';

/** One pair of wheel arches (mirrored), front-axle frame. */
export interface WheelArch {
  /** The wheel centre's x and height. */
  x: number;
  z: number;
  /** Radius of the arch round the wheel centre in the side view, m; the well reaches as far fore and aft. */
  radius: number;
  /** The well's inner wall, m from the centre line. */
  innerY: number;
}

/** Room left between the wheel's sweep and the arch or the well's inner wall, m: typical. */
export const ARCH_CLEARANCE_M = 0.03;

/** The arch round a wheel whose sweep reaches `reachM` from its centre and comes `innerY` from the centre line. */
export const archFor = (x: number, z: number, reachM: number, innerY: number): WheelArch => ({
  x,
  z,
  radius: reachM + ARCH_CLEARANCE_M,
  innerY: innerY - ARCH_CLEARANCE_M,
});

/** Rear deck by body type: how far ahead of the tail it ends and its height, then the tail's top, in body heights. */
const REAR: Record<NonNullable<CarRecord['dimensions']>['shape'], { deckBackM: number; deck: number; tail: number }> = {
  sedan: { deckBackM: 0.3, deck: 0.74, tail: 0.68 },
  hatch: { deckBackM: 0.18, deck: 0.66, tail: 0.6 },
  coupe: { deckBackM: 0.25, deck: 0.7, tail: 0.62 },
  roadster: { deckBackM: 0.25, deck: 0.7, tail: 0.62 },
  wagon: { deckBackM: 0.12, deck: 0.92, tail: 0.7 },
};

/** How the bottom of the nose and of the tail rise from the ground clearance, m: typical approach and departure. */
const NOSE_RISE_M = 0.1;
const TAIL_RISE_M = 0.16;
/** Plan view: the ends are this much narrower than the body, rounding over this length, m. */
const END_NARROW = 0.2;
const NOSE_ROUND_M = 0.5;
const TAIL_ROUND_M = 0.4;
/** Height of the fender's crown above an arch, m. */
const FENDER_ABOVE_ARCH_M = 0.05;
/** Points of half a section, top centre round the side to the floor centre. */
export const SECTION_POINTS = 8;
/** Distance between the loft's sections, m. */
const STATION_M = 0.05;

type Pt = [number, number];

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A polyline z(x) through points in descending x, flat beyond its ends. */
function polyline(points: Pt[]): (x: number) => number {
  return (x) => {
    if (x >= points[0]![0]) return points[0]![1];
    for (let i = 1; i < points.length; i++) {
      const [x1, z1] = points[i]!;
      if (x >= x1) {
        const [x0, z0] = points[i - 1]!;
        return z0 + ((x - x0) / (x1 - x0)) * (z1 - z0);
      }
    }
    return points[points.length - 1]![1];
  };
}

/** f averaged over ±half m: rounds the corners of a polyline. */
const smoothed = (f: (x: number) => number, half: number): ((x: number) => number) => (x) => {
  let sum = 0;
  for (let k = -3; k <= 3; k++) sum += f(x + (k / 3) * half);
  return sum / 7;
};

/** The lid over the bay: a bonnet in front, an engine lid over a mid or rear engine. */
export interface BayLid {
  kind: 'bonnet' | 'engine-lid';
  x0: number;
  x1: number;
  /** Half width of the bay. */
  halfY: number;
  /** The bay's top: the shell's top never dips below it over the lid. */
  topZ: number;
}

/** The wall between the bay and the cabin, at the bay's cabin end. */
export interface Bulkhead {
  x: number;
  halfY: number;
  z0: number;
}

export interface BodyShape {
  xFront: number;
  xRear: number;
  arches: WheelArch[];
  lid: BayLid;
  bulkhead: Bulkhead;
  /** Centre-line top and floor at x. */
  topZ(x: number): number;
  floorZ(x: number): number;
  /** Half the body's width at x. */
  halfWidth(x: number): number;
  /** The arch over x, if any. */
  archAt(x: number): WheelArch | null;
  /** Half the section at x (y ≥ 0): SECTION_POINTS points from the top centre round the side to the floor centre. */
  section(x: number): Pt[];
  /** Whether a point (front-axle frame) is inside the body's solid: within the section and not in a wheel well. */
  contains(p: Vec3): boolean;
  /** Where the loft has its sections, front to back. */
  stations: number[];
}

/** Whether (y, z) is inside the closed half-section (its points and the centre line back to the top). */
function insideHalf(half: Pt[], y: number, z: number): boolean {
  let inside = false;
  const n = half.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, zi] = half[i]!;
    const [yj, zj] = half[j]!;
    if (zi > z !== zj > z && y < ((yj - yi) * (z - zi)) / (zj - zi) + yi) inside = !inside;
  }
  return inside;
}

/** The body's shape from the record and its wheel arches. */
export function bodyShape(car: CarRecord, arches: WheelArch[]): BodyShape {
  const d = car.dimensions;
  const p = car.packaging;
  if (!d || !p) throw new Error(`${car.id} has no dimensions and packaging yet`);
  const L = car.body.wheelbaseM;
  const H = d.heightM;
  const W = d.widthM;
  const xF = d.frontOverhangM;
  const xR = -(L + d.rearOverhangM);
  const [bx, bz] = d.profile.bonnetFront;
  const [cx, cz] = d.profile.cowl;
  const [r0, r1] = d.profile.roofX;
  const rear = REAR[d.shape];
  const deckX = Math.min(xR + rear.deckBackM, r1 - 0.2);
  const deckZ = rear.deck * H;

  // ---- Top line: nose, bonnet, windscreen, roof, rear window, deck, tail; then held over the bay ----
  const rawTop = polyline([
    [xF, bz - 0.6 * (xF - bx)],
    [bx, bz],
    [cx, cz],
    [r0, H],
    [r1, H],
    [deckX, deckZ],
    [xR, rear.tail * H],
  ]);
  const bay = p.bay;
  const bayTop = bay.max[2];
  /** The bay's top, falling away beyond its ends at 1:2, so the shell rounds over it rather than steps. */
  const bayFloor = (x: number): number => {
    const out = Math.max(0, bay.min[0] - x, x - bay.max[0]);
    return bayTop - 0.5 * out;
  };
  const top0 = smoothed((x) => Math.max(rawTop(x), bayFloor(x)), 0.08);
  const topZ = (x: number): number => (x >= bay.min[0] && x <= bay.max[0] ? Math.max(top0(x), bayTop) : top0(x));

  // ---- Floor: the ground clearance between the arches, rising toward the nose and the tail ----
  const front = arches.reduce((a, b) => (b.x > a.x ? b : a));
  const back = arches.reduce((a, b) => (b.x < a.x ? b : a));
  const floorRaw = polyline([
    [xF, d.groundClearanceM + NOSE_RISE_M],
    [Math.min(xF - 0.05, front.x + front.radius), d.groundClearanceM],
    [Math.max(xR + 0.05, back.x - back.radius), d.groundClearanceM],
    [xR, d.groundClearanceM + TAIL_RISE_M],
  ]);
  const floorZ = smoothed(floorRaw, 0.1);

  // ---- Plan, belt line and the roof's narrowing above it ----
  const halfWidth = (x: number): number => {
    const nose = 1 - Math.min(1, (xF - x) / NOSE_ROUND_M);
    const tail = 1 - Math.min(1, (x - xR) / TAIL_ROUND_M);
    return (W / 2) * (1 - END_NARROW * nose * nose - END_NARROW * tail * tail);
  };
  const beltLine = polyline([
    [cx, cz],
    [deckX, deckZ],
  ]);
  const archAt = (x: number): WheelArch | null => arches.find((a) => Math.abs(x - a.x) < a.radius) ?? null;
  /** The crown each fender needs over its arch, faded out over 0.3 m beyond it. */
  const fenderLift = (x: number, shoulder: number): number => {
    let z = shoulder;
    for (const a of arches) {
      const dx = Math.abs(x - a.x);
      const w = dx <= a.radius ? 1 : dx < a.radius + 0.3 ? 0.5 + 0.5 * Math.cos((Math.PI * (dx - a.radius)) / 0.3) : 0;
      z += w * Math.max(0, a.z + a.radius + FENDER_ABOVE_ARCH_M - z);
    }
    return z;
  };

  const section = (x: number): Pt[] => {
    const top = topZ(x);
    const floor = floorZ(x);
    const hw = halfWidth(x);
    const belt = x >= cx ? top : Math.min(top, beltLine(x));
    const glass = smoothstep(0.02, 0.25, top - belt);
    const hwTop = hw * (0.92 - 0.2 * glass);
    const crown = 0.02 + 0.025 * glass;
    let edge = top - crown;
    const shoulder = fenderLift(x, Math.max(floor + 0.05, Math.min(belt - 0.02, edge - 0.02)));
    if (shoulder > edge - 0.02) edge = shoulder + 0.02;
    const arch = archAt(x);
    const archZ = arch ? arch.z + Math.sqrt(arch.radius ** 2 - (x - arch.x) ** 2) : floor;
    const wellY = arch ? Math.min(arch.innerY, hw) : hw;
    return [
      [0, top],
      [hwTop * 0.5, top - (top - edge) * 0.3],
      [hwTop, edge],
      [hw, shoulder],
      [hw, archZ],
      [wellY, archZ],
      [wellY, floor],
      [0, floor],
    ];
  };

  // ---- Lid and bulkhead from the bay ----
  const engineAhead = car.mount.position === 'front';
  const lid: BayLid = {
    kind: engineAhead ? 'bonnet' : 'engine-lid',
    x0: Math.max(bay.min[0], xR),
    x1: Math.min(bay.max[0], xF),
    halfY: Math.max(-bay.min[1], bay.max[1]),
    topZ: bayTop,
  };
  const bulkX = engineAhead ? bay.min[0] : bay.max[0];
  const bulkArch = archAt(bulkX);
  const bulkhead: Bulkhead = {
    x: bulkX,
    halfY: Math.min(lid.halfY, bulkArch ? bulkArch.innerY : halfWidth(bulkX) - 0.03),
    z0: Math.max(bay.min[2], floorZ(bulkX)),
  };

  // ---- Stations: every STATION_M, and either side of each arch's ends, where the well opens ----
  const xs: number[] = [];
  for (let x = xF; x > xR; x -= STATION_M) xs.push(x);
  xs.push(xR);
  for (const a of arches) for (const end of [a.x - a.radius, a.x + a.radius]) xs.push(end - 1e-4, end + 1e-4);
  const stations = [...new Set(xs.filter((x) => x <= xF && x >= xR))].sort((a, b) => b - a);

  return {
    xFront: xF,
    xRear: xR,
    arches,
    lid,
    bulkhead,
    topZ,
    floorZ,
    halfWidth,
    archAt,
    section,
    contains: ([x, y, z]) => x <= xF && x >= xR && insideHalf(section(x), Math.abs(y), z),
    stations,
  };
}

/** Scene point of a front-axle frame point (y, z, x)·10. */
const scenePoint = (x: number, y: number, z: number, out: number[], at: number): void => {
  out[at] = y * 10;
  out[at + 1] = z * 10;
  out[at + 2] = x * 10;
};

/** A grid of points (rows × cols, ISO) as one surface, its normals smooth across it. */
function surface(rows: Array<Array<[number, number, number]>>): THREE.BufferGeometry {
  const nr = rows.length;
  const nc = rows[0]!.length;
  const pos = new Array<number>(nr * nc * 3);
  rows.forEach((row, i) => row.forEach(([x, y, z], j) => scenePoint(x, y, z, pos, (i * nc + j) * 3)));
  const index: number[] = [];
  for (let i = 0; i + 1 < nr; i++) {
    for (let j = 0; j + 1 < nc; j++) {
      const a = i * nc + j;
      const b = a + nc;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** The shell's panels: between consecutive points of the section, each side its own surface (sharp edges between). */
const PANELS: Array<[number, number]> = [
  [0, 2], // roof or bonnet, crowned
  [2, 3], // glass above the belt, or the bonnet's edge down to the fender
  [3, 4], // side down to the sill or the arch
  [4, 5], // the well's top
  [5, 6], // the well's inner wall
  [6, 7], // floor
];

function shellGeometry(shape: BodyShape): THREE.BufferGeometry {
  const sections = shape.stations.map((x) => ({ x, half: shape.section(x) }));
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    for (const [from, to] of PANELS) {
      parts.push(surface(sections.map(({ x, half }) => half.slice(from, to + 1).map(([y, z]): [number, number, number] => [x, side * y, z]))));
    }
  }
  // Caps at the nose and the tail: a fan from the section's middle.
  for (const end of [sections[0]!, sections[sections.length - 1]!]) {
    const ring = [...end.half, ...end.half.slice(1, -1).reverse().map(([y, z]): Pt => [-y, z])];
    const cy = 0;
    const cz = ring.reduce((s, [, z]) => s + z, 0) / ring.length;
    const pos: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const [ya, za] = ring[i]!;
      const [yb, zb] = ring[(i + 1) % ring.length]!;
      const tri = [
        [end.x, cy, cz],
        [end.x, ya, za],
        [end.x, yb, zb],
      ];
      for (const [x, y, z] of tri) pos.push(y! * 10, z! * 10, x! * 10);
    }
    const cap = new THREE.BufferGeometry();
    cap.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cap.computeVertexNormals();
    parts.push(cap);
  }
  return mergeAll(parts);
}

/** Merges plain geometries (positions, normals, optional index) into one indexed geometry. */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const index: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) index.push(base + idx.getX(i));
    else for (let i = 0; i < p.count; i++) index.push(base + i);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(index);
  return geo;
}

/** The top of a half-section at y (≤ its roof's half width): along the crowned roof. */
function topAt(half: Pt[], y: number): number {
  for (let i = 1; i <= 3; i++) {
    const [y0, z0] = half[i - 1]!;
    const [y1, z1] = half[i]!;
    if (y <= y1 || i === 3) return z0 + ((Math.min(y, y1) - y0) / (y1 - y0)) * (z1 - z0);
  }
  return half[0]![1];
}

/** Lines of the silhouette: the top's centre line, both shoulders and sills (the sills trace the arches), and the
 *  sections at the windscreen's base, the roof's ends and both ends of the body. */
function outlineGeometry(shape: BodyShape, car: CarRecord): THREE.BufferGeometry {
  const pos: number[] = [];
  const seg = (a: [number, number, number], b: [number, number, number]): void => {
    pos.push(a[1] * 10, a[2] * 10, a[0] * 10, b[1] * 10, b[2] * 10, b[0] * 10);
  };
  const xs = shape.stations;
  const along = (point: number, side: number): void => {
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = shape.section(xs[i]!)[point]!;
      const b = shape.section(xs[i + 1]!)[point]!;
      seg([xs[i]!, side * a[0], a[1]], [xs[i + 1]!, side * b[0], b[1]]);
    }
  };
  along(0, 1);
  for (const side of [1, -1]) {
    along(3, side);
    along(4, side);
  }
  const d = car.dimensions!;
  for (const x of [shape.xFront, d.profile.cowl[0], d.profile.roofX[0], d.profile.roofX[1], shape.xRear]) {
    const half = shape.section(x);
    const ring = [...half, ...half.slice(1, -1).reverse().map(([y, z]): Pt => [-y, z])];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      seg([x, a[0], a[1]], [x, b[0], b[1]]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** Height of the lid above the shell, m, so the two read as two panels. */
const LID_LIFT_M = 0.005;

function lidGeometry(shape: BodyShape): THREE.BufferGeometry {
  const { x0, x1, halfY } = shape.lid;
  const rows: Array<Array<[number, number, number]>> = [];
  const nx = 16;
  const ny = 12;
  for (let i = 0; i <= nx; i++) {
    const x = x1 + ((x0 - x1) * i) / nx;
    const half = shape.section(x);
    const reach = Math.min(halfY, half[2]![0] * 0.97);
    const row: Array<[number, number, number]> = [];
    for (let j = -ny; j <= ny; j++) {
      const y = (reach * j) / ny;
      row.push([x, y, topAt(half, Math.abs(y)) + LID_LIFT_M]);
    }
    rows.push(row);
  }
  return surface(rows);
}

function lidOutline(shape: BodyShape): THREE.BufferGeometry {
  const { x0, x1, halfY } = shape.lid;
  const pts: Array<[number, number, number]> = [];
  const n = 16;
  const edge = (x: number, side: number): [number, number, number] => {
    const half = shape.section(x);
    const y = side * Math.min(halfY, half[2]![0] * 0.97);
    return [x, y, topAt(half, Math.abs(y)) + LID_LIFT_M];
  };
  for (let i = 0; i <= n; i++) pts.push(edge(x1 + ((x0 - x1) * i) / n, 1));
  for (let i = n; i >= 0; i--) pts.push(edge(x1 + ((x0 - x1) * i) / n, -1));
  const pos: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    pos.push(a[1] * 10, a[2] * 10, a[0] * 10, b[1] * 10, b[2] * 10, b[0] * 10);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

function bulkheadGeometry(shape: BodyShape): THREE.BufferGeometry {
  const { x, halfY, z0 } = shape.bulkhead;
  const half = shape.section(x);
  const rows: Array<Array<[number, number, number]>> = [];
  const ny = 10;
  for (const up of [0, 1]) {
    const row: Array<[number, number, number]> = [];
    for (let j = -ny; j <= ny; j++) {
      const y = (halfY * j) / ny;
      row.push([x, y, up ? topAt(half, Math.min(Math.abs(y), half[2]![0])) - 0.01 : z0]);
    }
    rows.push(row);
  }
  return surface(rows);
}

/**
 * Glass (glassMaterial) whose Fresnel alpha also scales with the material's opacity, so a ghost can fade it: plain
 * glass sets its alpha in the shader and ignores opacity. Double-sided, so the far side of the body shows through.
 */
function shellGlass(color: string, base: number, edge: number): THREE.MeshStandardMaterial {
  const m = glassMaterial(color, base, edge);
  const glass = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    glass(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.a = mix(uGlassBase, uGlassEdge, glassFresnel);', 'diffuseColor.a = mix(uGlassBase, uGlassEdge, glassFresnel) * opacity;');
  };
  m.customProgramCacheKey = () => `shell-glass-${base}-${edge}`;
  m.side = THREE.DoubleSide;
  return m;
}

interface Look {
  shell: THREE.MeshStandardMaterial;
  lid: THREE.MeshStandardMaterial;
  bulkhead: THREE.MeshStandardMaterial;
}

/** The glass body with its bay lid and bulkhead, in the front-axle frame. */
export class BodyShell {
  readonly group = new THREE.Group();
  readonly shape: BodyShape;
  readonly parts: Record<string, PartInfo>;
  private readonly shell: THREE.Mesh;
  private readonly lid: THREE.Mesh;
  private readonly bulkhead: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private readonly lidLines: THREE.LineSegments;
  private readonly solid: Look;
  private readonly xray: Look;
  private readonly lineMaterial = new THREE.LineBasicMaterial({ color: '#d4ebf2', transparent: true, opacity: 0.32, depthWrite: false });
  private readonly orders = new Map<THREE.Object3D, number>();
  private view: ViewMode = 'solid';
  private ghost = 1;
  private highlightUndo: Array<() => void> = [];
  private failures: Array<() => void> = [];

  constructor(car: CarRecord, arches: WheelArch[]) {
    this.shape = bodyShape(car, arches);
    const lidKey = this.shape.lid.kind === 'bonnet' ? 'car.bonnet' : 'car.engine-lid';
    this.parts = { 'car.body': BODY_PARTS['car.body']!, [lidKey]: BODY_PARTS[lidKey]!, 'car.bulkhead': BODY_PARTS['car.bulkhead']! };
    const glass = shellGlass;
    this.solid = { shell: glass('#bcd9e4', 0.05, 0.42), lid: glass('#d3e9f1', 0.1, 0.5), bulkhead: glass('#bcd9e4', 0.07, 0.36) };
    // The X-ray keeps the outline and the Fresnel edge only (whole-car plan, transparency).
    this.xray = { shell: glass('#bcd9e4', 0, 0.26), lid: glass('#d3e9f1', 0.02, 0.32), bulkhead: glass('#bcd9e4', 0, 0.22) };
    this.shell = tag(new THREE.Mesh(shellGeometry(this.shape), this.solid.shell), 'car.body');
    this.lid = tag(new THREE.Mesh(lidGeometry(this.shape), this.solid.lid), lidKey);
    this.bulkhead = tag(new THREE.Mesh(bulkheadGeometry(this.shape), this.solid.bulkhead), 'car.bulkhead');
    this.lines = new THREE.LineSegments(outlineGeometry(this.shape, car), this.lineMaterial);
    this.lidLines = new THREE.LineSegments(lidOutline(this.shape), this.lineMaterial);
    // Lines are not parts: a click goes through them to the panel.
    for (const l of [this.lines, this.lidLines]) l.raycast = () => {};
    this.lid.add(this.lidLines);
    this.group.add(this.shell, this.bulkhead, this.lid, this.lines);
    // The lid and its outline draw over the shell under it; the lines last.
    this.lid.renderOrder = 1;
    this.lidLines.renderOrder = 2;
    this.lines.renderOrder = 2;
    this.group.traverse((o) => this.orders.set(o, o.renderOrder));
  }

  private looks(): THREE.Material[] {
    return [...Object.values(this.solid), ...Object.values(this.xray), this.lineMaterial];
  }

  setView(view: ViewMode): void {
    this.view = view;
    const look = view === 'xray' ? this.xray : this.solid;
    this.shell.material = look.shell;
    this.lid.material = look.lid;
    this.bulkhead.material = look.bulkhead;
    this.lineMaterial.opacity = (view === 'xray' ? 0.55 : 0.32) * this.ghost;
    this.group.visible = view !== 'mechanism';
  }

  setExplode(amount: number): void {
    const e = Math.min(1, Math.max(0, amount));
    this.shell.position.y = e * 6;
    this.lines.position.y = e * 6;
    this.bulkhead.position.y = e * 6;
    this.lid.position.y = e * 9;
  }

  setFailure(part: string | null): void {
    for (const undo of this.failures) undo();
    this.failures = [];
    if (!part) return;
    for (const mesh of [this.shell, this.lid, this.bulkhead]) {
      if (mesh.userData.part !== part) continue;
      const looks = mesh === this.shell ? [this.solid.shell, this.xray.shell] : mesh === this.lid ? [this.solid.lid, this.xray.lid] : [this.solid.bulkhead, this.xray.bulkhead];
      for (const m of looks) this.failures.push(markDamaged(m));
    }
  }

  setHighlight(on: boolean): void {
    for (const undo of this.highlightUndo) undo();
    this.highlightUndo = [];
    if (!on) return;
    for (const m of this.looks()) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      const before = m.emissive.clone();
      const intensity = m.emissiveIntensity;
      m.emissive.set('#ffb35c');
      m.emissiveIntensity = 0.28;
      this.highlightUndo.push(() => {
        m.emissive.copy(before);
        m.emissiveIntensity = intensity;
      });
    }
  }

  /** Glass is transparent already: a ghost scales its alpha and the lines'. */
  setGhost(alpha: number): void {
    this.ghost = Math.min(1, Math.max(0, alpha));
    for (const m of [...Object.values(this.solid), ...Object.values(this.xray)]) m.opacity = this.ghost;
    this.setView(this.view);
  }

  setRenderBand(base: number): void {
    for (const [o, order] of this.orders) o.renderOrder = order + base;
  }

  /** The view the shell shows now. */
  get viewMode(): ViewMode {
    return this.view;
  }

  dispose(): void {
    for (const o of [this.shell, this.lid, this.bulkhead, this.lines, this.lidLines]) o.geometry.dispose();
    for (const m of this.looks()) m.dispose();
  }
}
