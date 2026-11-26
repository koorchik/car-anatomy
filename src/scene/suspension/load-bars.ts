// The roll scene's load bar over each wheel (suspensions plan, the roll scene, step 2): how much the tyre carries, on
// the section's force scale (1 kN = 40 mm), and where its change from rest comes from, in Milliken's three parts. The
// static load is grey; a part that adds load stands on top of it in its own colour, a part that takes load away eats
// into the grey from the top and shows as a pale ghost of the load that went, so the bar's solid height is always the
// tyre's load and its outline the load at rest. A tick marks the load at rest.
//
// The bars stand on the road's frame, not the body's: they are a chart over the wheels and do not lean with the body.

import * as THREE from 'three';
import { inert, ON_TOP, outOfFrame } from '../arrows.ts';
import { LOAD_SHARE } from '../palette.ts';
import { FORCE_SCALE } from './overlays.ts';

/** The three parts in the order they stack. */
export const LOAD_PARTS = ['geometric', 'elastic', 'unsprung'] as const;
export type LoadPart = (typeof LOAD_PARTS)[number];

/** Width of a bar across the car and along it, and of the tick at the static load, scene units. */
const WIDTH = 0.7;
const TICK = { width: 1.1, height: 0.04 };

/** One wheel's load: the tyre's static load and the three parts of its change, N. */
export interface WheelLoad {
  staticN: number;
  geometric: number;
  elastic: number;
  unsprung: number;
}

interface Bar {
  group: THREE.Group;
  base: THREE.Mesh;
  parts: THREE.Mesh[];
  tick: THREE.Mesh;
}

const material = (color: string, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });

export class LoadBars {
  readonly group = new THREE.Group();
  private readonly bars: Bar[] = [];
  private readonly box = outOfFrame(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  private readonly baseMat = material(LOAD_SHARE.static, 1);
  private readonly tickMat = material('#ece6d6', 1);
  private readonly solid: Record<LoadPart, THREE.MeshBasicMaterial>;
  private readonly ghost: Record<LoadPart, THREE.MeshBasicMaterial>;

  /** @param at Where each bar stands, scene units (its foot). */
  constructor(at: readonly THREE.Vector3[]) {
    this.solid = { geometric: material(LOAD_SHARE.geometric, 1), elastic: material(LOAD_SHARE.elastic, 1), unsprung: material(LOAD_SHARE.unsprung, 1) };
    this.ghost = { geometric: material(LOAD_SHARE.geometric, 0.28), elastic: material(LOAD_SHARE.elastic, 0.28), unsprung: material(LOAD_SHARE.unsprung, 0.28) };
    for (const p of at) {
      const group = new THREE.Group();
      group.position.copy(p);
      const base = inert(new THREE.Mesh(this.box, this.baseMat), ON_TOP - 2);
      const parts = LOAD_PARTS.map((k) => inert(new THREE.Mesh(this.box, this.solid[k]), ON_TOP - 1));
      const tick = inert(new THREE.Mesh(this.box, this.tickMat), ON_TOP);
      tick.scale.set(TICK.width, TICK.height, TICK.width);
      group.add(base, ...parts, tick);
      this.group.add(group);
      this.bars.push({ group, base, parts, tick });
    }
  }

  /** Bar i for this load. */
  set(i: number, load: WheelLoad): void {
    const bar = this.bars[i]!;
    const h = (n: number): number => Math.max(0, n) * FORCE_SCALE;
    const values = [load.geometric, load.elastic, load.unsprung];
    const lost = values.reduce((s, v) => s + Math.min(0, v), 0);
    // The grey is what is left of the static load after the parts that took some away.
    const grey = Math.max(0, load.staticN + lost);
    bar.base.scale.set(WIDTH, Math.max(1e-4, h(grey)), WIDTH);
    let up = h(load.staticN);
    let down = h(grey);
    for (let k = 0; k < 3; k++) {
      const v = values[k]!;
      const mesh = bar.parts[k]!;
      const part = LOAD_PARTS[k]!;
      if (v >= 0) {
        mesh.material = this.solid[part];
        mesh.position.y = up;
        mesh.scale.set(WIDTH * 0.98, Math.max(1e-4, h(v)), WIDTH * 0.98);
        up += h(v);
      } else {
        // What went is drawn where it used to be, between what is left and the static load.
        mesh.material = this.ghost[part];
        mesh.position.y = down;
        const len = Math.min(h(-v), Math.max(0, h(load.staticN) - down));
        mesh.scale.set(WIDTH * 0.98, Math.max(1e-4, len), WIDTH * 0.98);
        down += len;
      }
    }
    bar.tick.position.y = h(load.staticN) - TICK.height / 2;
  }

  /** Shows only the first `n` bars. */
  showFirst(n: number): void {
    this.bars.forEach((b, i) => (b.group.visible = i < n));
  }

  dispose(): void {
    this.box.dispose();
    for (const m of [this.baseMat, this.tickMat, ...Object.values(this.solid), ...Object.values(this.ghost)]) m.dispose();
  }
}
