// Where the stage's camera stands and how it gets there: the distance that frames a model in the free part of the
// window, the named views («Спереду», «Збоку», «Зверху») and a smooth move between two views (the plan of the whole
// car, «Stage для всіх розділів», changes 1 and 5). No DOM and no renderer, so tests/stage.test.ts checks it in Node.
//
// Directions are in the world, from the target toward the camera: +Z is the front of an engine (kinematics.ts) and of
// a car or a corner (ISO x forward), +Y is up, +X is the side an engine is drawn from and a corner's outboard side.

import * as THREE from 'three';

/** What the panels cover of the canvas on each side, px. */
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A named view: the page's own home, or straight from the front, the side or above. */
export type CameraPreset = 'home' | 'front' | 'side' | 'top';

/** How a view change happens: over this many seconds, or at once with 0. */
export interface MoveOptions {
  durationS?: number;
}

/** What a camera move takes when the caller says nothing. */
export const DEFAULT_MOVE_S = 0.8;

const PRESETS: Record<Exclude<CameraPreset, 'home'>, THREE.Vector3> = {
  // A little from above, as a person looks at a part on a stand.
  front: new THREE.Vector3(0, 0.12, 1).normalize(),
  side: new THREE.Vector3(1, 0.12, 0).normalize(),
  // Not exactly overhead: looking straight down the orbit has no way to tell which way is up.
  top: new THREE.Vector3(0, 1, 0.002).normalize(),
};

/** The direction from the target toward the camera for a named view. */
export function presetDirection(name: CameraPreset, home: THREE.Vector3): THREE.Vector3 {
  return name === 'home' ? home.clone().normalize() : PRESETS[name].clone();
}

export interface FrameView {
  /** Vertical field of view, degrees. */
  fovDeg: number;
  /** Canvas size, px. */
  width: number;
  height: number;
  /** What the panels cover of the canvas, px. */
  insets: Insets;
}

/**
 * Camera distance at which a sphere of `radius` fits the free part of the canvas: by the tighter of its free height and
 * free width, scaled by `fitScale` (below 1 the model may reach under the panels when turned).
 */
export function fitDistance(radius: number, view: FrameView, fitScale: number): number {
  const { width, height, insets } = view;
  const freeW = Math.max(120, width - insets.left - insets.right);
  const freeH = Math.max(120, height - insets.top - insets.bottom);
  const vFov = (view.fovDeg * Math.PI) / 180;
  const aspect = width / height;
  const heightLimit = radius / Math.sin((vFov * (freeH / height)) / 2);
  const hFovFree = 2 * Math.atan(Math.tan(vFov / 2) * aspect * (freeW / width));
  const widthLimit = radius / Math.sin(hFovFree / 2);
  return Math.max(heightLimit, widthLimit) * fitScale;
}

/** Slow out, slow in. */
export const ease = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export interface CameraPose {
  target: THREE.Vector3;
  /** Unit vector from the target toward the camera. */
  direction: THREE.Vector3;
  distance: number;
}

/**
 * A move of the camera from one pose to another: the target slides, the direction turns about the shorter way and the
 * distance changes, all on one eased clock, so the model never leaves the picture on the way.
 */
export class CameraMove {
  private readonly from: CameraPose;
  private readonly to: CameraPose;
  private readonly durationS: number;
  private readonly turn = new THREE.Quaternion();
  private readonly partial = new THREE.Quaternion();
  private elapsed = 0;

  constructor(from: CameraPose, to: CameraPose, durationS: number) {
    this.from = { target: from.target.clone(), direction: from.direction.clone().normalize(), distance: from.distance };
    this.to = { target: to.target.clone(), direction: to.direction.clone().normalize(), distance: to.distance };
    this.durationS = Math.max(0, durationS);
    this.turn.setFromUnitVectors(this.from.direction, this.to.direction);
  }

  get done(): boolean {
    return this.elapsed >= this.durationS;
  }

  /** Moves the clock on by `dt` seconds and writes where the camera and its target stand now. */
  step(dt: number, position: THREE.Vector3, target: THREE.Vector3): void {
    this.elapsed = Math.min(this.durationS, this.elapsed + Math.max(0, dt));
    const k = this.durationS > 0 ? ease(this.elapsed / this.durationS) : 1;
    target.lerpVectors(this.from.target, this.to.target, k);
    this.partial.identity().slerp(this.turn, k);
    const direction = this.from.direction.clone().applyQuaternion(this.partial);
    const distance = this.from.distance + (this.to.distance - this.from.distance) * k;
    position.copy(target).addScaledVector(direction, distance);
  }
}
