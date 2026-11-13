// What a model on the model viewer (dev/models.html) gives and gets. Each model lives in its own file
// dev/models/<id>.ts with `export default defineModel({...})`, so stages that build models side by side never edit
// a shared list. The viewer is a developer's tool and is not part of the site.

import type * as THREE from 'three';
import type { ViewMode } from '../src/scene/model-types.ts';

export type Value = number | boolean | string;
export type Values = Record<string, Value>;

interface ControlBase {
  /** Also the name of the address parameter that keeps it, so it must not be one of RESERVED_KEYS. */
  key: string;
  label: string;
  /** Changing it builds the model anew instead of calling set(). */
  rebuild?: boolean;
}

export interface RangeControl extends ControlBase {
  kind: 'range';
  min: number;
  max: number;
  step?: number;
  value: number;
}

export interface ToggleControl extends ControlBase {
  kind: 'toggle';
  value: boolean;
}

export interface ChoiceControl extends ControlBase {
  kind: 'choice';
  options: Array<{ value: string; label: string }>;
  value: string;
  /** A row of buttons instead of a drop-down, for a few short options such as gears. */
  buttons?: boolean;
}

export type Control = RangeControl | ToggleControl | ChoiceControl;

/** Address parameters the viewer keeps for itself. */
export const RESERVED_KEYS = ['m', 'view', 'explode', 'highlight', 'ghost', 'cam', 'dist', 'at', 'still', 'ui', 'grid', 'lang'] as const;

export interface PartCard {
  name: string;
  text: string;
}

/** One built model. Optional methods add the viewer's own controls for them (view, explode, highlight, ghost). */
export interface ViewerModel {
  /** Added to the scene, framed, lit and picked. */
  readonly group: THREE.Object3D;
  /** Camera direction from the model's centre when it appears. Three-quarter front by default. */
  readonly home?: [number, number, number];
  /** Height of the ground under the model, scene units. The bottom of its bounds by default. */
  readonly groundY?: number;
  /** Every frame. `time` stands still and `dt` is 0 while the viewer is paused. */
  frame?(time: number, dt: number): void;
  /** A control without `rebuild` changed. `values` holds all of them. */
  set?(key: string, values: Values): void;
  setView?(view: ViewMode): void;
  /** 0 = assembled, 1 = fully pulled apart. */
  setExplode?(amount: number): void;
  setHighlight?(on: boolean): void;
  /** 1 = as the view draws it, 0.15 = faint ghost. */
  setGhost?(alpha: number): void;
  /** The card of a part, by the key tag() put on it. A key without a card is listed by the viewer as missing one. */
  part?(key: string): PartCard | undefined;
  dispose(): void;
}

export interface ModelDef {
  title: string;
  controls?: Control[];
  /** Starting view and explode, when the model has them. */
  defaults?: { view?: ViewMode; explode?: number };
  /** `values` stays live: the viewer writes each change into it before calling set(). */
  create(values: Values): ViewerModel;
}

export const defineModel = (def: ModelDef): ModelDef => def;
