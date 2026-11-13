// The oil pan and where the oil is drawn from. panShape is the one place that says how deep the pan is, where its
// well and pickup are and what a track pan or a dry sump adds; the 3D model, the oil layer and the oil-on-track
// physics all read it. Scene units (1 = 100 mm, so 1 unit³ = 1 litre), in the engine's own frame (kinematics.ts:
// crank on Z, front +Z, Y up). Rules and their status: docs/lubrication-model.md.

import * as THREE from 'three';
import type { Engine } from '../engine/kinematics.ts';
import { systemsOf, type SumpKind, type SystemsSpec } from '../engine/systems-spec.ts';
import type { EngineMount } from '../vehicle/vehicle.ts';
import { fixedOilL } from './oil-capacity.ts';
import { fourStrokeLitres } from './size.ts';

const MM = 0.01;

export interface PanDims {
  /** Half width across the engine. */
  halfW: number;
  /** Top of the pan body, and the flange lip above it. */
  top: number;
  lip: number;
  /** Lowest point of the pan: the floor of its well. */
  bottom: number;
  depth: number;
  zMin: number;
  zMax: number;
  /** Corner radius of the section. */
  round: number;
  /** A boxer's pan between the banks. */
  flat: boolean;
}

/** Where the deep part of a wet pan sits, in the car's terms: under the front, the middle or the rear of the engine. */
export type WellPlace = 'front' | 'middle' | 'rear';
export const WELL_PLACES: readonly WellPlace[] = ['front', 'middle', 'rear'];

/** A rectangle of the pan's plan, engine frame. */
export interface PanRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface PanShape extends PanDims {
  kind: SumpKind;
  place: WellPlace;
  /** Oil level of a full engine at rest, all its oil drained down: below the counterweights' orbit. */
  yFull: number;
  /** Floor of the shallow shelves either side of the well. Equal to yFloor on a dry sump. */
  yShelf: number;
  /** Floor of the well, the pan's lowest point. */
  yFloor: number;
  well: PanRect;
  /**
   * The compartment round the pickup: the well itself on a factory pan (its low baffles are the step to the shelves),
   * a box with trap doors and a lid on a track pan. Null on a dry sump.
   */
  box: (PanRect & { top: number }) | null;
  /** Oil in the pan of a full engine at rest, litres: the capacity less what stays in the filter and galleries. */
  panOilL: number;
  /** Pickup screen: centre in plan, bottom of its bell, radius and bell height. Null on a dry sump. */
  pickup: { x: number; z: number; y: number; radius: number; bell: number; tube: number } | null;
  /** Scavenge pickups of a dry sump along its floor. */
  scavenge: Array<{ x: number; z: number }>;
  /** Crank axis to the pan's lowest point, mm: how high the engine must sit. NaN on a rotary. */
  crankHeightMm: number;
}

const isFlat = (engine: Engine): boolean => engine.banks.length === 2 && Math.abs(engine.banks[0]!.alpha - engine.banks[1]!.alpha) > 150;

/** Counterweights clear the oil of a full engine by this much (estimate). */
export const FULL_CLEARANCE = 25 * MM;
/** A full engine has this much oil over its shelves, in bores (estimate). */
export const SHELF_OIL = 0.15;
/** Well length (longitudinal) or width (transverse, well to one side) as a share of the pan (estimate). */
export const WELL_SHARE = 0.5;
export const SIDE_WELL_SHARE = 0.6;
/** Longest well, in bores, and deepest before it spreads over the shelves (estimates). */
export const WELL_BORES = 2.6;
export const WELL_DEPTH_BORES = 1.3;
/** Track pan box round the pickup, as shares of the well, and how far its lid stands over the full level. */
export const BOX_SHARE = { x: 0.7, z: 0.6 };
export const BOX_LID = 15 * MM;
/** Gap between screen and floor: "the target gap is about 3/8 inch" (EngineLabs). */
export const PICKUP_GAP = 9.5 * MM;
export const PICKUP_BELL = 15 * MM;
/** A dry sump's pan floor under the full level. */
const DRY_FLOOR = 30 * MM;

export interface PanOptions {
  /** Where the well sits in the car. Default: middle. */
  place?: WellPlace;
  /** How the engine sits in the car: decides which end of the pan is the car's front. Default: longitudinal, facing forward. */
  mount?: EngineMount;
  /** Oil capacity, litres. Default: the systems' own. */
  oilL?: number;
}

const DEFAULT_MOUNT: EngineMount = { axis: 'longitudinal', front: 'forward', position: 'front' };

function wankelShape(engine: Engine, kind: SumpKind): PanShape {
  const layout = engine.spec.layout;
  if (layout.kind !== 'wankel') throw new Error('not a rotary');
  const R = layout.R * MM;
  const e = layout.e * MM;
  const width = layout.width * MM;
  const pitch = width + 22 * MM;
  const ends = ((layout.rotors - 1) / 2) * pitch + width / 2 + 0.1;
  const tall = (R + e) * 1.28;
  const top = -tall - 0.02;
  const depth = R * 0.55;
  const halfW = R * 1.32 * 0.9;
  const bottom = top - depth;
  const rect = { x0: -halfW, x1: halfW, z0: -ends, z1: ends };
  const yFull = bottom + depth * 0.45;
  return {
    halfW, top, lip: 0.02, bottom, depth, zMin: -ends, zMax: ends, round: R * 0.12, flat: false,
    kind, place: 'middle', yFull, yShelf: bottom, yFloor: bottom, well: rect, box: null,
    panOilL: 2 * halfW * 2 * ends * (yFull - bottom),
    pickup: { x: 0, z: ends * 0.56, y: bottom + depth * 0.12 - PICKUP_BELL / 2, radius: 0.2 * R, bell: PICKUP_BELL, tube: 0.03 },
    scavenge: [],
    crankHeightMm: Number.NaN,
  };
}

/** The pan of this engine with this sump and oil. */
export function panShape(engine: Engine, systems: SystemsSpec, o: PanOptions = {}): PanShape {
  const kind = systems.sump;
  if (engine.spec.layout.kind === 'wankel') return wankelShape(engine, kind);
  const b = engine.spec.bore * MM;
  const r = engine.r * MM;
  const crankcaseR = r + b * 0.55;
  const flat = isFlat(engine);
  const dry = kind === 'dry';
  // A boxer's flange sits low between the banks; its wet pan is as wide as the crankcase to hold the oil.
  const halfW = flat ? crankcaseR * (dry ? 0.6 : 0.85) : crankcaseR * 0.93;
  const top = flat ? -crankcaseR * 0.86 : -crankcaseR * 0.42;
  const length = (engine.zMax - engine.zMin) * MM + b * 0.2;
  const zMid = ((engine.zMax + engine.zMin) / 2) * MM;
  const zMin = zMid - length * 0.48;
  const zMax = zMid + length * 0.48;
  // Counterweight orbit as safeCounterweight draws it, less the clearance; at least a fifth of a bore under the flange.
  const yFull = Math.min(-(r + 0.3 * b) - FULL_CLEARANCE, top - 0.2 * b);
  const litres = fourStrokeLitres(engine);
  const oilL = o.oilL ?? systems.oilL;
  const panOilL = Math.max(0.3, oilL - fixedOilL(litres));
  const place = o.place ?? systems.well?.place ?? 'middle';
  const W = 2 * halfW;
  const L = zMax - zMin;
  const base = { halfW, top, lip: b * 0.08, zMin, zMax, round: b * 0.12, flat, kind, place, panOilL };

  if (dry) {
    const yFloor = yFull - DRY_FLOOR;
    const rect = { x0: -halfW, x1: halfW, z0: zMin, z1: zMax };
    return {
      ...base,
      bottom: yFloor,
      depth: top - yFloor,
      yFull,
      yShelf: yFloor,
      yFloor,
      well: rect,
      box: null,
      pickup: null,
      scavenge: [0.15, 0.5, 0.85].map((share) => ({ x: 0, z: zMin + share * L })),
      crankHeightMm: -yFloor / MM,
    };
  }

  // The car's forward direction in the engine frame decides which end of the pan is the front.
  const mount = o.mount ?? (systems.well ? { ...DEFAULT_MOUNT, front: systems.well.front } : DEFAULT_MOUNT);
  const fwdZ = mount.front === 'forward' ? 1 : mount.front === 'rearward' ? -1 : 0;
  const fwdX = mount.front === 'right' ? 1 : mount.front === 'left' ? -1 : 0;
  const toward = place === 'front' ? 1 : place === 'rear' ? -1 : 0;
  const sideways = toward !== 0 && fwdZ === 0;
  /** The well as a share of the pan's length (or, to one side of a transverse engine, of its width). */
  const wellRect = (share: number): PanRect => {
    if (!sideways) {
      const wl = share * L;
      const side = toward * fwdZ;
      const z0 = side > 0 ? zMax - wl : side < 0 ? zMin : zMid - wl / 2;
      return { x0: -halfW, x1: halfW, z0, z1: z0 + wl };
    }
    // A transverse engine: the car's front is to one side of the pan.
    const ww = share * W;
    const x0 = toward * fwdX > 0 ? halfW - ww : -halfW;
    return { x0, x1: x0 + ww, z0: zMin, z1: zMax };
  };
  const area = W * L;
  const shelfOil = SHELF_OIL * b;
  // The well holds whatever the shelves don't, below the full level. Where that would make it deeper than a bore,
  // the well grows over the shelves instead, up to the whole pan, as a small engine's crankcase is.
  // A long engine's well stays a compact sump rather than half its length (estimate: at most WELL_BORES bores).
  let share = sideways ? SIDE_WELL_SHARE : Math.min(WELL_SHARE, (WELL_BORES * b) / L);
  const depthAt = (s: number): number => (panOilL - (1 - s) * area * shelfOil) / (s * area);
  const deepest = WELL_DEPTH_BORES * b;
  if (depthAt(share) > deepest) share = Math.min(1, Math.max(share, (panOilL - area * shelfOil) / (area * (deepest - shelfOil))));
  const well = wellRect(share);
  const hWell = Math.max(0.6 * b, depthAt(share));
  const yShelf = yFull - shelfOil;
  const yFloor = yFull - hWell;
  const cx = (well.x0 + well.x1) / 2;
  const cz = (well.z0 + well.z1) / 2;
  const track = kind === 'baffled' || kind === 'integrated-dry';
  const box = track
    ? {
        x0: cx - ((well.x1 - well.x0) * BOX_SHARE.x) / 2,
        x1: cx + ((well.x1 - well.x0) * BOX_SHARE.x) / 2,
        z0: cz - ((well.z1 - well.z0) * BOX_SHARE.z) / 2,
        z1: cz + ((well.z1 - well.z0) * BOX_SHARE.z) / 2,
        top: yFull + BOX_LID,
      }
    : { ...well, top };
  const bore = engine.spec.bore;
  return {
    ...base,
    bottom: yFloor,
    depth: top - yFloor,
    yFull,
    yShelf,
    yFloor,
    well,
    box,
    pickup: {
      x: cx,
      z: cz,
      y: yFloor + PICKUP_GAP,
      radius: Math.min(45, Math.max(25, 0.35 * bore)) * MM,
      bell: PICKUP_BELL,
      tube: Math.min(28, Math.max(16, 0.2 * bore)) * MM,
    },
    scavenge: [],
    crankHeightMm: -yFloor / MM,
  };
}

/** The pan the 3D model draws and the oil layer fills: the engine's own sump and oil. */
export function panDims(engine: Engine): PanDims {
  const s = panShape(engine, systemsOf(engine.spec));
  return { halfW: s.halfW, top: s.top, lip: s.lip, bottom: s.bottom, depth: s.depth, zMin: s.zMin, zMax: s.zMax, round: s.round, flat: s.flat };
}

export interface SumpLayout {
  kind: SumpKind;
  pan: PanDims;
  shape: PanShape;
  /** Where the pressure pump draws from: the pickup on a wet sump, the tank outlet on a dry one. */
  pressureInlet: THREE.Vector3;
  /** Pickups of the scavenge stages, one per stage. Empty on a wet sump. */
  scavengePickups: THREE.Vector3[];
  /** External tank, engine frame. Null on a wet sump and on an integrated dry sump. */
  tank: { position: THREE.Vector3; radius: number; height: number } | null;
  /** Oil level at rest, engine-frame y: full on a wet pan, a film on a dry one, whose oil is in the tank. */
  levelY: number;
}

/** A dry sump's tank holds the oil not in the engine with this much room for foam (estimate). */
export const TANK_ROOM = 1.3;
/** Tank height over its radius. */
export const TANK_ASPECT = 2.5;

/** Radius and height of a dry sump's tank, scene units, from the litres it holds. */
export function tankSize(engine: Engine, oilL: number): { radius: number; height: number; litres: number } {
  const litres = TANK_ROOM * Math.max(0.5, oilL - fixedOilL(fourStrokeLitres(engine)));
  const radius = Math.cbrt(litres / (TANK_ASPECT * Math.PI));
  return { radius, height: TANK_ASPECT * radius, litres };
}

export function sumpLayout(engine: Engine, systems: SystemsSpec, o: PanOptions = {}): SumpLayout {
  const shape = panShape(engine, systems, o);
  const pan: PanDims = { halfW: shape.halfW, top: shape.top, lip: shape.lip, bottom: shape.bottom, depth: shape.depth, zMin: shape.zMin, zMax: shape.zMax, round: shape.round, flat: shape.flat };
  if (shape.kind === 'dry' && !engine.isRotary) {
    const t = tankSize(engine, o.oilL ?? systems.oilL);
    // Beside the engine, clear of its heads, standing level with the pan's floor.
    const bore = engine.spec.bore * MM;
    const reach = Math.max(shape.halfW, ...engine.banks.map((k) => Math.abs(Math.sin((k.alpha * Math.PI) / 180)) * (engine.deck * MM + bore) + 0.6 * bore));
    const position = new THREE.Vector3(reach + t.radius + 0.3, shape.yFloor + t.height / 2, (shape.zMin + shape.zMax) / 2);
    return {
      kind: shape.kind,
      pan,
      shape,
      pressureInlet: position.clone().add(new THREE.Vector3(0, -t.height / 2, 0)),
      scavengePickups: shape.scavenge.map((p) => new THREE.Vector3(p.x, shape.yFloor + 0.06, p.z)),
      tank: { position, radius: t.radius, height: t.height },
      levelY: shape.yFloor + 0.08,
    };
  }
  const pick = shape.pickup!;
  return {
    kind: shape.kind,
    pan,
    shape,
    pressureInlet: new THREE.Vector3(pick.x, pick.y + pick.bell / 2, pick.z),
    scavengePickups: [],
    tank: null,
    levelY: shape.yFull,
  };
}
