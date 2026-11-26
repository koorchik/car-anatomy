// The gearbox with its engine in front of it (gearboxes plan, the views: the view with the engine, stage K3b; the
// whole-car plan, the amendments to the gearbox plan, item 6): the engine of the page's car from the catalogue, its flywheel face on the
// bellhousing (attach.ts, as in the car overview), turning by the crank angle the gearbox's input gets through the
// clutch. One model for the stage, so the camera frames both. Each keeps its own views, cards and glass; the glass of
// the two sorts in bands as in the car (CAR_BANDS: the engine 10–19, the gearbox 20–29).

import * as THREE from 'three';
import { attachGearbox } from '../car/attach.ts';
import type { EngineModel, FrameState, SceneModel, ViewMode } from '../model-types.ts';
import type { GearboxFrame } from './gearbox-model.ts';

export interface EngineGearboxFrame {
  engine: FrameState;
  gearbox: GearboxFrame;
}

/** The render-order bands of the two models (the car's CAR_BANDS, not imported: the car's code stays out of this chunk). */
const ENGINE_BAND = 10;
const GEARBOX_BAND = 20;

export class EngineWithGearbox implements SceneModel<EngineGearboxFrame> {
  readonly group = new THREE.Group();
  readonly engine: EngineModel;
  readonly gearbox: SceneModel<GearboxFrame>;

  constructor(engine: EngineModel, gearbox: SceneModel<GearboxFrame>) {
    this.engine = engine;
    this.gearbox = gearbox;
    // The engine's group shakes on its own, so both hang in a frame that undoes its centring, as in the car.
    const inner = new THREE.Group();
    inner.position.copy(engine.mounted.position).negate();
    gearbox.group.position.set(0, 0, 0);
    gearbox.group.rotation.set(0, 0, 0);
    gearbox.group.scale.set(1, 1, 1);
    gearbox.group.updateMatrix();
    inner.add(engine.group, gearbox.group);
    gearbox.group.applyMatrix4(attachGearbox(engine, gearbox));
    this.group.add(inner);
    engine.setRenderBand?.(ENGINE_BAND);
    gearbox.setRenderBand?.(GEARBOX_BAND);
  }

  update(frame: EngineGearboxFrame): void {
    this.engine.update(frame.engine);
    this.gearbox.update(frame.gearbox);
  }

  setView(view: ViewMode): void {
    this.engine.setView(view);
    this.gearbox.setView(view);
  }

  setExplode(amount: number): void {
    this.engine.setExplode(amount);
    this.gearbox.setExplode(amount);
  }

  setFailure(part: string | null): void {
    this.engine.setFailure(part);
    this.gearbox.setFailure(part);
  }

  /** Both are this view's own: the section builds a fresh gearbox whenever it builds the view again. */
  dispose(): void {
    this.engine.dispose();
    this.gearbox.dispose();
  }
}
