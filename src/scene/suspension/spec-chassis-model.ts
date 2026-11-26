// The suspension designer's chassis in 3D (stage P8c): its two axles from the design's ChassisSpec, standing at their
// places along the wheelbase, without a body (a design has no record to build one from). An axle on links without a
// rocker (a strut, double wishbones, a multilink) is the IndependentAxleModel of the catalogue's chassis; an axle the 3D
// does not draw yet (a pivot arm, a twist beam, a solid axle, a pushrod's rocker) stands as its two plain wheels at the
// design's track, so the car keeps its footprint, and `axles` says which axles are whole. The axle model seats an
// anti-roll bar only on a strut or a rod, so an axle on wishbones stands without its bar rather than as wheels.
//
// Frames as in ChassisModel: the origin on the road under the centre of mass (CG frame, ISO 8855), scene = (y, z, x)·10.

import * as THREE from 'three';
import { tag, type SceneModel, type ViewMode } from '../model-types.ts';
import type { PartInfo } from '../parts-info.ts';
import { factorySetup, resolveCorner } from '../../suspension/setup.ts';
import type { AxleSpec, ChassisAxleSpec, ChassisSpec, CornerSpec } from '../../suspension/spec.ts';
import { axleFrame, IndependentAxleModel, type AxleModel } from './axle-model.ts';

/** The wheel of one axle as the 3D draws it, m. */
export interface DrawnWheel {
  rimRadiusM: number;
  rimWidthM: number;
  tyreWidthM: number;
}

export interface SpecChassisInput {
  spec: ChassisSpec;
  wheels: { front: DrawnWheel; rear: DrawnWheel };
  /** Sprung mass over each corner of an axle, kg (the resolved corner's static point). */
  sprungKg: { front: number; rear: number };
}

/** Whether the 3D draws this axle whole: an independent corner on links whose spring the knuckle or an arm works. */
export function drawsAxle(axle: AxleSpec<ChassisAxleSpec['axle']['linkage']>): boolean {
  return axle.linkage.kind === 'links' && !axle.spring.rocker && !axle.damper.rocker;
}

/** Two plain wheels for an axle the 3D does not draw yet. */
class WheelsOnly {
  readonly group = new THREE.Group();
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly geometries: THREE.BufferGeometry[];

  constructor(spec: ChassisAxleSpec, wheel: DrawnWheel) {
    const tyre = new THREE.MeshStandardMaterial({ color: 0x1d1f21, roughness: 0.9, metalness: 0 });
    const rim = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.45, metalness: 0.6 });
    this.materials = [tyre, rim];
    const r = (spec.tyreRadiusM ?? spec.axle.wheelCentre[2]) * 10;
    const tyreGeo = new THREE.CylinderGeometry(r, r, wheel.tyreWidthM * 10, 40, 1, false);
    tyreGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(wheel.rimRadiusM * 10, wheel.rimRadiusM * 10, wheel.rimWidthM * 10 + 0.02, 32);
    rimGeo.rotateZ(Math.PI / 2);
    this.geometries = [tyreGeo, rimGeo];
    const c = spec.axle.wheelCentre;
    for (const side of [1, -1]) {
      const t = tag(new THREE.Mesh(tyreGeo, tyre), 'susp.tyre');
      const m = tag(new THREE.Mesh(rimGeo, rim), 'susp.wheel');
      for (const mesh of [t, m]) {
        mesh.position.set(side * spec.axle.track * 5, c[2] * 10, c[0] * 10);
        this.group.add(mesh);
      }
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

export class SpecChassisModel implements SceneModel<null> {
  readonly group = new THREE.Group();
  readonly parts: Record<string, PartInfo>;
  /** The axles drawn whole, front then rear (null where only the wheels stand). */
  readonly axles: [AxleModel | null, AxleModel | null];
  private readonly plain: WheelsOnly[] = [];
  private readonly frame = axleFrame();

  constructor(input: SpecChassisInput) {
    const { spec } = input;
    const L = spec.body.wheelbaseM;
    // CG frame: the front axle a = L·(1 − share) ahead of the centre of mass, the rear b = L·share behind it.
    const xs = { front: L * (1 - spec.body.frontShare), rear: -L * spec.body.frontShare };
    const build = (which: 'front' | 'rear'): AxleModel | null => {
      const axleSpec = spec[which];
      let model: AxleModel | null = null;
      if (drawsAxle(axleSpec.axle)) {
        const corner: CornerSpec = {
          axle: axleSpec.axle as AxleSpec,
          sprungKg: input.sprungKg[which],
          unsprungKg: axleSpec.unsprungKg,
          tyre: spec.tyre,
          tyreRadiusM: axleSpec.tyreRadiusM,
        };
        const attempt = (antiRollBar: boolean): AxleModel | null => {
          try {
            const resolved = resolveCorner(corner, factorySetup(corner));
            return new IndependentAxleModel({ which, corner: resolved, wheel: input.wheels[which], antiRollBar });
          } catch {
            return null;
          }
        };
        // The axle model seats a bar only on a strut or a rod; on wishbones the axle stands without its bar.
        model = (axleSpec.swayBar !== null ? attempt(true) : null) ?? attempt(false);
      }
      if (model) {
        model.group.position.set(0, 0, xs[which] * 10);
        this.group.add(model.group);
        return model;
      }
      const wheels = new WheelsOnly(axleSpec, input.wheels[which]);
      wheels.group.position.set(0, 0, xs[which] * 10);
      this.plain.push(wheels);
      this.group.add(wheels.group);
      return null;
    };
    this.axles = [build('front'), build('rear')];
    this.parts = { ...(this.axles[0]?.parts ?? {}), ...(this.axles[1]?.parts ?? {}) };
    for (const axle of this.axles) axle?.update(this.frame);
    this.setView('solid');
  }

  update(): void {
    // Standing still: the axles were posed at rest when built.
  }

  setView(view: ViewMode): void {
    for (const a of this.axles) a?.setView(view);
  }

  setExplode(amount: number): void {
    for (const a of this.axles) a?.setExplode(amount);
  }

  setFailure(part: string | null): void {
    for (const a of this.axles) a?.setFailure(part);
  }

  setHighlight(on: boolean): void {
    for (const a of this.axles) a?.setHighlight?.(on);
  }

  setGhost(alpha: number): void {
    for (const a of this.axles) a?.setGhost?.(alpha);
  }

  setRenderBand(base: number): void {
    for (const a of this.axles) a?.setRenderBand?.(base);
  }

  /** Shows the whole car, or only one axle. */
  show(which: 'both' | 'front' | 'rear'): void {
    const [f, r] = this.group.children;
    if (f) f.visible = which !== 'rear';
    if (r) r.visible = which !== 'front';
  }

  dispose(): void {
    for (const a of this.axles) a?.dispose();
    for (const w of this.plain) w.dispose();
  }
}
