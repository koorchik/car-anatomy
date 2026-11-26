// A planetary automatic as the solver steps it (stage K12a): wet plate packs for its clutches and brakes, its spin
// loss, and the torque converter in front of it. Main thread, scripts and tests: it derives (topology.ts), and the
// solver gets the flat core.
//
// Nobody publishes the 8HP's clamp forces. Each element's clamp is sized the way a designer would start: from the
// largest torque it must hold in any gear with the gearbox's rated input torque multiplied by the converter at stall,
// with a reserve [estimate]. The torque an element holds comes from the solver itself: the gear's elements locked, the
// output held, a unit torque on the input; with no motion left the accelerations are zero and the lock torques are the
// static ones.

import { torqueRatio } from './converter.ts';
import {
  BRAKE, buildCore, converterLaunchDraft, gearboxDraft, gearLossDraft, mergeDrafts, type ConverterParts, type CoreDraft, type DrivetrainCore,
} from './core.ts';
import { DRY_STRIBECK, WET_PACK } from './elements.ts';
import { DrivetrainSolver } from './solver.ts';
import type { ElementDef, FrictionDef, GearboxSpec, SpinLossDef } from './spec.ts';
import { buildGearbox, type Gearbox } from './topology.ts';

/**
 * Spin loss of a planetary automatic at its input, a + b·ω N·m: inside the 6T40's measured band at 93 °C, 3–6 N·m at
 * 500 rpm and 6–19 N·m at 5000 rpm by gear and line pressure (research §9) [estimate within it: 4 and 13.5].
 */
export const AUTOMATIC_SPIN_LOSS: SpinLossDef = { a: 3, b: 0.02 };
/** Static capacity of a pack over the largest torque it holds [estimate]. */
export const PACK_RESERVE = 1.3;

/** Friction of a wet pack of `plates` friction plates (two faces each) between these radii, mm, before its clamp. */
const wetPack = (plates: number, rIn: number, rOut: number, clampN: number): FrictionDef => ({
  faces: 2 * plates, rIn, rOut, ...WET_PACK, stribeck: DRY_STRIBECK, clampN, actuator: 'hydraulic',
});

/**
 * The largest torque each element holds in any gear of the matrix, per N·m on the input, by element id: the static
 * lock torques with the output held.
 */
export function elementTorquePerInput(spec: GearboxSpec): Map<string, number> {
  const packs = new Map((spec.packs ?? []).map((p) => [p.element, p]));
  const placeholder = { ...spec, elements: spec.elements.map((e): ElementDef => {
    const p = packs.get(e.id);
    return { ...e, friction: wetPack(p?.plates ?? 1, p?.rIn ?? 40, p?.rOut ?? 60, 1e9) };
  }) };
  const box = buildGearbox(placeholder);
  const core = buildCore(gearboxDraft(box));
  const input = core.members.indexOf(spec.input);
  const output = core.members.indexOf(spec.output);
  const out = new Map(spec.elements.map((e) => [e.id, 0]));
  for (const state of box.states) {
    if (state.kind !== 'gear') continue;
    const s = new DrivetrainSolver(core);
    core.elements.ids.forEach((id, e) => (s.command[e] = state.closed.includes(id) ? 1 : 0));
    s.memberTorque[input] = 1;
    s.drive[output] = 0;
    s.step(1e-3);
    core.elements.ids.forEach((id, e) => out.set(id, Math.max(out.get(id)!, Math.abs(s.torque[e]!))));
  }
  return out;
}

/**
 * The spec with a wet pack on every clutch and brake (its plate pack's size), the clamp sized for PACK_RESERVE times
 * the largest torque the element holds at `ratedInputNm` times the converter's stall ratio, and the automatic's spin
 * loss.
 */
export function withPlanetaryFriction(spec: GearboxSpec, ratedInputNm: number): GearboxSpec {
  const perInput = elementTorquePerInput(spec);
  const design = ratedInputNm * torqueRatio(0);
  const packs = new Map((spec.packs ?? []).map((p) => [p.element, p]));
  return {
    ...spec,
    spinLoss: spec.spinLoss ?? AUTOMATIC_SPIN_LOSS,
    elements: spec.elements.map((e): ElementDef => {
      if (e.friction || (e.kind !== 'clutch' && e.kind !== 'brake')) return e;
      const p = packs.get(e.id);
      if (!p) throw new Error(`${spec.id}: element ${e.id} has no plate pack to size`);
      const unit = wetPack(p.plates, p.rIn, p.rOut, 1);
      const perN = unit.muStatic * ((p.rIn + p.rOut) / 2000) * unit.faces;
      return { ...e, friction: { ...unit, clampN: (PACK_RESERVE * perInput.get(e.id)! * design) / perN } };
    }),
  };
}

/** What hangs on an automatic's output in the lab: the car as one inertia behind its final drive, and its brake. */
export interface AutomaticLoad {
  /** The car on its driven wheels as one inertia, m·r² plus the wheels, kg·m², behind `finalDrive`. */
  wheelInertia: number;
  finalDrive: number;
  /** Brake torque at the wheels with the pedal floored, N·m. */
  brakeNm: number;
  /** Rolling radius of the driven tyres, m, for the road speed. */
  radiusM: number;
}

/** Member of the car's wheels in the automatic's lab core. */
export const WHEELS = 'wheels';

/** The converter, the gearbox with its friction and mesh losses, and the car as one inertia with its brake. */
export function automaticCore(box: Gearbox, parts: ConverterParts, load: AutomaticLoad): DrivetrainCore {
  const wheels: CoreDraft = {
    members: [{ id: WHEELS, inertia: load.wheelInertia }],
    links: [[[box.spec.output, 1], [WHEELS, -load.finalDrive]]],
    springs: [], elements: [], prefer: [WHEELS], drag: null, meshes: [],
  };
  const brake: FrictionDef = { faces: 2, rIn: 100, rOut: 150, muStatic: 0.4, muKinetic: 0.36, stribeck: DRY_STRIBECK, clampN: 0, actuator: 'hydraulic' };
  brake.clampN = load.brakeNm / (brake.muStatic * ((brake.rIn + brake.rOut) / 2000) * brake.faces);
  wheels.elements.push({ id: BRAKE, kind: 'friction', a: WHEELS, b: null, friction: brake });
  return buildCore(mergeDrafts(converterLaunchDraft(box.spec.input, parts), gearboxDraft(box), gearLossDraft(box), wheels));
}
