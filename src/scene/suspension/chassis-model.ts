// A real car's chassis in 3D (stage P7-geom): its two axles and the glass body shell, standing still. The axles come
// from the suspension's CarChassis (src/suspension/car-chassis.ts) and the shell from the record (body-shell.ts),
// with wheel arches sized by each wheel's sweep over the arches' bump and the whole steering lock, and a top that covers
// each axle's towers (towerTop): the JTEKT strut stands taller than the 911's bonnet line.
//
// Frames. The group's origin is on the road under the centre of mass (the CG frame, ISO 8855), so the car overview
// puts it into a car with a translation (suspensions plan, 3D). Records and the shell are in the front-axle frame;
// carFrameToCg moves each axle and the shell into place. Scene = (y, z, x)·10 as everywhere in the section.
//
// Implements the shell's SceneModel<ChassisFrame> structurally (whole-car plan, the Stage section) until O2b adds the
// type. The body draws in its own band, BODY_BAND above the chassis's, so with the overview's chassis band 30 it lands
// on the body's 90 and sorts after every other model's glass.

import * as THREE from 'three';
import type { ViewMode } from '../model-types.ts';
import type { PartInfo } from '../parts-info.ts';
import { factorySetup, resolveCorner } from '../../suspension/setup.ts';
import type { CarChassis, ChassisAxle } from '../../suspension/car-chassis.ts';
import { archFor, BodyShell } from '../car/body-shell.ts';
import { axleFrame, IndependentAxleModel, towerTop, type AxleFrame, type AxleModel } from './axle-model.ts';

export interface ChassisFrame {
  front: AxleFrame;
  rear: AxleFrame;
}

export const chassisFrame = (): ChassisFrame => ({ front: axleFrame(), rear: axleFrame() });

/** renderOrder of the body over the chassis's band. */
export const BODY_BAND = 60;

export interface ChassisModelOptions {
  /** Build the body shell. Default true. */
  body?: boolean;
}

/** An independent axle of the chassis, from its resolved left corner. */
function independentAxle(axle: ChassisAxle): AxleModel {
  const resolved = resolveCorner(axle.corner, factorySetup(axle.corner));
  const { rimRadiusM, rimWidthM, tyreWidthM } = axle.wheel;
  return new IndependentAxleModel({ which: axle.which, corner: resolved, wheel: { rimRadiusM, rimWidthM, tyreWidthM }, antiRollBar: axle.antiRollBar });
}

export class ChassisModel {
  readonly group = new THREE.Group();
  readonly chassis: CarChassis;
  readonly front: AxleModel;
  readonly rear: AxleModel;
  readonly shell: BodyShell | null;
  readonly parts: Record<string, PartInfo>;
  private readonly frame = chassisFrame();
  private view: ViewMode = 'solid';
  private bodyOn = true;

  constructor(chassis: CarChassis, options: ChassisModelOptions = {}) {
    this.chassis = chassis;
    const car = chassis.car;
    this.front = independentAxle(chassis.front);
    this.rear = independentAxle(chassis.rear);
    // Each axle's own frame sits on its axle line in the CG frame.
    this.front.group.position.set(0, 0, chassis.front.xCg * 10);
    this.rear.group.position.set(0, 0, chassis.rear.xCg * 10);
    this.group.add(this.front.group, this.rear.group);
    if (options.body !== false) {
      // Each arch round its wheel's sweep, with the tower over it, which the shell's top covers.
      const arch = (axle: ChassisAxle, x: number) => {
        const t = towerTop(axle.corner.axle);
        return archFor(x, axle.corner.axle.wheelCentre[2], axle.sweep.reachM, axle.sweep.innerY, { ...t, x: t.x + x });
      };
      this.shell = new BodyShell(car, [arch(chassis.front, 0), arch(chassis.rear, -car.body.wheelbaseM)]);
      // The shell is built in the front-axle frame: its origin goes where carFrameToCg takes the front axle's.
      const origin = chassis.toCg([0, 0, 0]);
      this.shell.group.position.set(origin[1] * 10, origin[2] * 10, origin[0] * 10);
      this.shell.setRenderBand(BODY_BAND);
      this.group.add(this.shell.group);
    } else {
      this.shell = null;
    }
    this.parts = { ...this.front.parts, ...this.rear.parts, ...(this.shell?.parts ?? {}) };
    this.setView('solid');
    this.update(this.frame);
  }

  /** Rack travel at full lock either way, m; 0 when the front axle does not steer. */
  get lockRackM(): number {
    return this.chassis.front.lock?.rackM ?? 0;
  }

  update(frame: ChassisFrame): void {
    this.front.update(frame.front);
    this.rear.update(frame.rear);
  }

  /** Shows or hides the body shell (the views keep it hidden in the mechanism view either way). */
  setBody(on: boolean): void {
    this.bodyOn = on;
    if (this.shell) this.shell.group.visible = on && this.view !== 'mechanism';
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.front.setView(view);
    this.rear.setView(view);
    this.shell?.setView(view);
    this.setBody(this.bodyOn);
  }

  setExplode(amount: number): void {
    this.front.setExplode(amount);
    this.rear.setExplode(amount);
    this.shell?.setExplode(amount);
  }

  setFailure(part: string | null): void {
    this.front.setFailure(part);
    this.rear.setFailure(part);
    this.shell?.setFailure(part);
  }

  setHighlight(on: boolean): void {
    this.front.setHighlight(on);
    this.rear.setHighlight(on);
    this.shell?.setHighlight(on);
  }

  setGhost(alpha: number): void {
    this.front.setGhost(alpha);
    this.rear.setGhost(alpha);
    this.shell?.setGhost(alpha);
  }

  setRenderBand(base: number): void {
    this.front.setRenderBand(base);
    this.rear.setRenderBand(base);
    this.shell?.setRenderBand(base + BODY_BAND);
  }

  /**
   * Named points in the chassis's frame (CG frame, scene units): every axle anchor under its axle's name
   * ('front.left.wheelCentre', 'rear.right.diffOutput', …) and the centre of mass on the road ('cg').
   */
  anchors(): Record<string, THREE.Vector3> {
    const out: Record<string, THREE.Vector3> = { cg: new THREE.Vector3(0, 0, 0) };
    for (const axle of [this.front, this.rear]) {
      for (const [k, v] of Object.entries(axle.anchors())) out[`${axle.which}.${k}`] = v.add(axle.group.position);
    }
    return out;
  }

  dispose(): void {
    this.front.dispose();
    this.rear.dispose();
    this.shell?.dispose();
  }
}
