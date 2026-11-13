// Everything the oil-on-track model needs from one engine in one car, worked out once.

import type { Engine } from '../engine/kinematics.ts';
import type { SumpKind, SystemsSpec } from '../engine/systems-spec.ts';
import { oilParams, type OilParams } from '../systems/oil.ts';
import { fixedOilL } from '../systems/oil-capacity.ts';
import { fourStrokeLitres } from '../systems/size.ts';
import { panShape, type PanShape, type WellPlace } from '../systems/sump.ts';
import type { EngineMount } from '../vehicle/vehicle.ts';
import { mainJournalRadius } from './bearings.ts';
import { GALLERY_L_PER_L, headCapacityL, SUMP_KIND_CONSTANTS, type SumpKindConstants } from './constants.ts';
import { panGrid, type PanGrid } from './pan.ts';

const MM = 0.01;

export interface LubeHead {
  /** Bank angle of the head, degrees clockwise from up, seen from the front. */
  alpha: number;
  capacityL: number;
}

export interface LubeSetup {
  engine: Engine;
  systems: SystemsSpec;
  kind: SumpKind;
  mount: EngineMount;
  shape: PanShape;
  grid: PanGrid;
  k: SumpKindConstants;
  oil: OilParams;
  /** Displacement as a four-stroke engine, litres. */
  litres: number;
  /** Oil in the engine: capacity plus or minus the visitor's change, litres. */
  totalL: number;
  /** Oil that stays in the filter and galleries, litres. */
  fixedL: number;
  heads: LubeHead[];
  journalR: number;
  /** Suction tube: volume in litres, diameter and length in metres; pump inlet height, scene units. */
  tube: { litres: number; d: number; length: number; inletY: number };
  /** Oil between the pump and the lifters, litres. */
  galleryL: number;
  /** Pushrod petrol engine: hydraulic lifters are what tells first. */
  lifters: boolean;
}

export interface LubeOptions {
  /** Oil over the full mark, litres: -1 is about the dipstick's minimum. */
  oilDeltaL: number;
  accumulator: boolean;
  place?: WellPlace;
}

/** Heads of the engine: banks closer than 30° share one (a VR, each half of a W). */
function headsOf(engine: Engine, litres: number): LubeHead[] {
  const angles: number[] = [];
  for (const bank of engine.banks) {
    const near = angles.findIndex((a) => Math.abs(a - bank.alpha) < 30);
    if (near < 0) angles.push(bank.alpha);
  }
  if (engine.banks.length === 4 && angles.length > 2) {
    // A W: two heads, each over a pair of banks.
    const sorted = [...engine.banks].map((b) => b.alpha).sort((a, b) => a - b);
    angles.splice(0, angles.length, (sorted[0]! + sorted[1]!) / 2, (sorted[2]! + sorted[3]!) / 2);
  }
  return angles.map((alpha) => ({ alpha, capacityL: headCapacityL(litres, angles.length) }));
}

export function lubeSetup(engine: Engine, systems: SystemsSpec, mount: EngineMount, o: LubeOptions): LubeSetup {
  const kind = systems.sump;
  const shape = panShape(engine, systems, { mount, place: o.place ?? systems.well?.place });
  const litres = fourStrokeLitres(engine);
  const b = engine.spec.bore * MM;
  const pick = shape.pickup;
  // A crank-nose pump draws just under the crank at the front; a pump in the pan sits near the pickup.
  const inletY = systems.oilPump === 'crank' ? -0.34 * b : (pick?.y ?? shape.yFloor) + 0.2 * b;
  const inletZ = systems.oilPump === 'crank' ? engine.zMax * MM + 0.12 * b : shape.zMax - 0.2 * b;
  const tubeLength = pick ? (Math.abs(inletY - pick.y) + Math.abs(inletZ - pick.z) + Math.abs(pick.x)) * 0.1 : 0.2;
  const d = (pick?.tube ?? 0.2) * 0.1;
  return {
    engine,
    systems,
    kind,
    mount,
    shape,
    grid: panGrid(shape),
    k: SUMP_KIND_CONSTANTS[kind],
    oil: oilParams(engine, systems),
    litres,
    totalL: Math.max(0.5, systems.oilL + o.oilDeltaL),
    fixedL: fixedOilL(litres),
    heads: headsOf(engine, litres),
    journalR: mainJournalRadius(engine.spec.bore),
    tube: { litres: (Math.PI / 4) * d * d * tubeLength * 1000, d, length: tubeLength, inletY },
    galleryL: GALLERY_L_PER_L * litres,
    lifters: engine.spec.valvetrain === 'ohv' && engine.spec.fuel !== 'diesel',
  };
}
