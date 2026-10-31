import * as THREE from 'three';

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
  /** Multiplier for visible shaking; 0 turns it off. */
  shake: number;
}

export interface EngineModel {
  group: THREE.Group;
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

/** Gas colours by stroke, shared by piston and rotary engines. */
export const GAS = {
  intake: new THREE.Color('#62c6ec'),
  compression: new THREE.Color('#bfe4ff'),
  flash: new THREE.Color('#fff0c8'),
  fire: new THREE.Color('#ff7a1a'),
  smoke: new THREE.Color('#8a6a55'),
  exhaust: new THREE.Color('#6a635c'),
};

/** Tints a material to show damage, and gives back a way to undo it. */
export const markDamaged = (material: THREE.MeshStandardMaterial): (() => void) => {
  const { emissive, emissiveIntensity } = material;
  const before = emissive.clone();
  material.emissive.set('#ff2a10');
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
