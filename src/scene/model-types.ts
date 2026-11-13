import * as THREE from 'three';
import type { EngineAnchors, SystemsLook } from './systems/anchors.ts';
import type { ValveState } from '../engine/valve-control.ts';
import { DAMAGE, GAS_COLORS } from './palette.ts';

export type ViewMode = 'solid' | 'xray' | 'mechanism';

export interface FrameState {
  /** Crank angle to show, degrees. */
  theta: number;
  rpm: number;
  /** 0..1 */
  load: number;
  fuelCut: boolean;
  running: boolean;
  /** Turbo shaft speed 0..1. */
  boost: number;
  dt: number;
  /** A still picture for a snapshot: what eases in over time, such as header heat or torque roll, stands where it heads. */
  held?: boolean;
  /** Multiplier for visible shaking; 0 turns it off. */
  shake: number;
  /** Variable valve gear as the engine computer has it now. */
  valves?: ValveState;
}

export interface EngineModel {
  group: THREE.Group;
  /** Engine frame of kinematics.ts: crank axis on Z, scene units. Shakes with the engine; overlays go here. */
  readonly mounted: THREE.Group;
  /** Where the parts the systems layers follow were built (src/scene/systems/anchors.ts). */
  systemsAnchors?(): EngineAnchors;
  /** Glass intake while the air or fuel layer shows; the model's own sparks off while the fuel layer draws real ones. */
  setSystemsLook?(look: SystemsLook): void;
  update(state: FrameState): void;
  setView(view: ViewMode): void;
  /** 0 = assembled, 1 = fully pulled apart. */
  setExplode(amount: number): void;
  /** Marks the part that failed. Null clears it. */
  setFailure(part: string | null): void;
  dispose(): void;
}

/** Marks an object with the part it belongs to, for click-to-explain. */
export const tag = <T extends THREE.Object3D>(obj: T, part: string): T => {
  obj.userData.part = part;
  return obj;
};

/** Gas colours by stroke, shared by piston and rotary engines (palette.ts). */
export const GAS = {
  intake: new THREE.Color(GAS_COLORS.intake),
  compression: new THREE.Color(GAS_COLORS.compression),
  flash: new THREE.Color(GAS_COLORS.flash),
  fire: new THREE.Color(GAS_COLORS.fire),
  smoke: new THREE.Color(GAS_COLORS.smoke),
  exhaust: new THREE.Color(GAS_COLORS.exhaust),
};

/** Tints a material to show damage, and gives back a way to undo it. */
export const markDamaged = (material: THREE.MeshStandardMaterial): (() => void) => {
  const { emissive, emissiveIntensity } = material;
  const before = emissive.clone();
  material.emissive.set(DAMAGE);
  material.emissiveIntensity = 1.3;
  return () => {
    material.emissive.copy(before);
    material.emissiveIntensity = emissiveIntensity;
  };
};

export const disposeTree = (root: THREE.Object3D): void => {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const m = mesh.material;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      if (!seen.has(mat)) {
        seen.add(mat);
        mat.dispose();
      }
    }
  });
};
