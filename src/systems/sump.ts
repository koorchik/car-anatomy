// The oil pan and where the oil is drawn from. This is the hook for feature/oil-sump: a dry or an integrated dry sump
// changes the pan here, adds scavenge pickups and a tank to the layout, and the 3D pan and the oil layer follow.
// Scene units (1 = 100 mm), in the engine's own frame (kinematics.ts: crank on Z, front +Z, Y up).

import * as THREE from 'three';
import type { Engine } from '../engine/kinematics.ts';
import type { SumpKind, SystemsSpec } from '../engine/systems-spec.ts';

const MM = 0.01;

export interface PanDims {
  /** Half width across the engine. */
  halfW: number;
  /** Top of the pan body, and the flange lip above it. */
  top: number;
  lip: number;
  bottom: number;
  depth: number;
  zMin: number;
  zMax: number;
  /** Corner radius of the section. */
  round: number;
  /** A boxer's shallow pan between the banks. */
  flat: boolean;
}

const isFlat = (engine: Engine): boolean => engine.banks.length === 2 && Math.abs(engine.banks[0]!.alpha - engine.banks[1]!.alpha) > 150;

/** The pan the 3D model draws and the oil layer fills. */
export function panDims(engine: Engine): PanDims {
  const layout = engine.spec.layout;
  if (layout.kind === 'wankel') {
    const R = layout.R * MM;
    const e = layout.e * MM;
    const width = layout.width * MM;
    const pitch = width + 22 * MM;
    const ends = ((layout.rotors - 1) / 2) * pitch + width / 2 + 0.1;
    const tall = (R + e) * 1.28;
    const top = -tall - 0.02;
    const depth = R * 0.55;
    return { halfW: R * 1.32 * 0.9, top, lip: 0.02, bottom: top - depth, depth, zMin: -ends, zMax: ends, round: R * 0.12, flat: false };
  }
  const b = engine.spec.bore * MM;
  const crankcaseR = engine.r * MM + b * 0.55;
  const flat = isFlat(engine);
  // A boxer gets a shallow pan between the banks.
  const depth = flat ? b * 0.42 : engine.r * MM + b * 1.05;
  const halfW = flat ? crankcaseR * 0.6 : crankcaseR * 0.93;
  const top = flat ? -crankcaseR * 0.86 : -crankcaseR * 0.42;
  const length = (engine.zMax - engine.zMin) * MM + b * 0.2;
  const zMid = ((engine.zMax + engine.zMin) / 2) * MM;
  return { halfW, top, lip: b * 0.08, bottom: top - depth, depth, zMin: zMid - length * 0.48, zMax: zMid + length * 0.48, round: b * 0.12, flat };
}

export interface SumpLayout {
  kind: SumpKind;
  pan: PanDims;
  /** Where the pressure pump draws from: the pickup on a wet sump, the tank outlet on a dry one. */
  pressureInlet: THREE.Vector3;
  /** Pickups of the scavenge stages, one per stage. Empty on a wet sump. */
  scavengePickups: THREE.Vector3[];
  /** External tank, engine frame. Null on a wet sump and on an integrated dry sump. */
  tank: { position: THREE.Vector3; radius: number; height: number } | null;
  /** Oil level at rest, engine-frame y. */
  levelY: number;
}

/** Wet sump: one pickup in the front third of the pan, under the oil. */
export function sumpLayout(engine: Engine, systems: SystemsSpec): SumpLayout {
  const pan = panDims(engine);
  const levelY = pan.bottom + pan.depth * (pan.flat ? 0.6 : 0.45);
  const z = pan.zMax - (pan.zMax - pan.zMin) * 0.22;
  return {
    kind: systems.sump,
    pan,
    pressureInlet: new THREE.Vector3(0, pan.bottom + pan.depth * 0.12, z),
    scavengePickups: [],
    tank: null,
    levelY,
  };
}
