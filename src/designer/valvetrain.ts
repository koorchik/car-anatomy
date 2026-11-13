// Variable valve gear in the designer: which mechanisms a design may have, where its cams sit for any
// phaser position or profile, and the geometry the model needs from that (effective compression,
// overlap area, piston travel). The engine computer's schedule search lives in physics.ts.
//
// The design's cam fields describe the middle of the phaser travel. Park is half the travel to the side
// of least overlap: intake later, exhaust earlier, a coupled shaft earlier. Shifts here are crank degrees
// later than park, the same convention the live controller in src/engine/valve-control.ts uses.

import { DEG, liftWindow } from '../engine/kinematics.ts';
import type { ValveTiming } from '../engine/spec.ts';
import { firingFromCrank } from './crank.ts';
import { DEFAULT_DESIGN, isRotary, valveSplit, type Design } from './design.ts';
import { FUELS } from './fuels.ts';
import type { CamState, ValveEvents } from './physics.ts';

/** The mechanisms switched off. A variant of a page takes none of them from the page's own engine. */
export const NO_MECHANISMS: Pick<Design, 'camPhaser' | 'intakePhaseRange' | 'exhaustPhaseRange' | 'camSwitch' | 'switchRpm' | 'lowLift' | 'lowDuration' | 'switchKind' | 'liftControl' | 'deactivation' | 'deactivateGroup' | 'deactivateRpm'> = {
  camPhaser: DEFAULT_DESIGN.camPhaser,
  intakePhaseRange: DEFAULT_DESIGN.intakePhaseRange,
  exhaustPhaseRange: DEFAULT_DESIGN.exhaustPhaseRange,
  camSwitch: DEFAULT_DESIGN.camSwitch,
  switchRpm: DEFAULT_DESIGN.switchRpm,
  lowLift: DEFAULT_DESIGN.lowLift,
  lowDuration: DEFAULT_DESIGN.lowDuration,
  switchKind: DEFAULT_DESIGN.switchKind,
  liftControl: DEFAULT_DESIGN.liftControl,
  deactivation: DEFAULT_DESIGN.deactivation,
  deactivateGroup: DEFAULT_DESIGN.deactivateGroup,
  deactivateRpm: DEFAULT_DESIGN.deactivateRpm,
};

/** True when the design has any of the mechanisms. Engines without them take the old path unchanged. */
export const hasVariableValves = (d: Design): boolean => d.camPhaser !== 'none' || d.camSwitch !== 'none' || d.liftControl !== 'cam' || d.deactivation !== 'none';

/** Brings the mechanisms in line with the rest of the design. Each rule only narrows, so it is idempotent. */
export function resolveValvetrain(d: Design): void {
  const target = d as unknown as Record<string, unknown>;
  for (const key of ['camPhaser', 'camSwitch', 'switchKind', 'liftControl', 'deactivation', 'deactivateGroup'] as const) {
    if (typeof target[key] !== 'string') target[key] = DEFAULT_DESIGN[key];
  }
  for (const key of ['intakePhaseRange', 'exhaustPhaseRange', 'switchRpm', 'lowLift', 'lowDuration'] as const) {
    if (typeof target[key] !== 'number' || !Number.isFinite(target[key])) target[key] = DEFAULT_DESIGN[key];
  }
  if (isRotary(d)) {
    d.camPhaser = 'none';
    d.camSwitch = 'none';
    d.liftControl = 'cam';
    d.deactivation = 'none';
    return;
  }
  const dohc = d.valvetrain === 'dohc';
  // One shaft carries both lobes, so it can only be turned as a whole.
  if (!dohc && (d.camPhaser === 'intake' || d.camPhaser === 'dual')) d.camPhaser = 'coupled';
  if (dohc && d.camPhaser === 'coupled') d.camPhaser = 'dual';
  // A diesel has no throttle to replace, and pushrods leave no room for the levers.
  if (FUELS[d.fuel].diesel || d.valvetrain === 'ohv') d.liftControl = 'cam';
  if (d.liftControl === 'continuous' && !dohc) d.liftControl = 'cam';
  if (d.valvetrain === 'ohv') d.camSwitch = 'none';
  // The intake cam no longer sets the lift when the valve does.
  if (d.liftControl !== 'cam') {
    if (d.camSwitch === 'intake') d.camSwitch = 'none';
    if (d.camSwitch === 'both') d.camSwitch = 'exhaust';
  }
  if (d.cylinders < 4 || d.cylinders % 2 === 1) d.deactivation = 'none';
}

/**
 * A documented window for resting cylinders, in whole tens of rpm inside the rev range. Runs after the rev
 * limit is settled. Anything else, or a window too narrow to use, falls back to the generic estimate.
 */
export function resolveDeactivationWindow(d: Design): void {
  const w = d.deactivateRpm as unknown;
  const valid = Array.isArray(w) && w.length === 2 && w.every((v) => typeof v === 'number' && Number.isFinite(v));
  if (d.deactivation === 'none' || !valid) {
    d.deactivateRpm = null;
    return;
  }
  const [a, b] = w as [number, number];
  const lo = Math.max(500, Math.round(Math.min(a, b) / 10) * 10);
  const hi = Math.min(Math.floor(d.rpmLimit / 10) * 10, Math.round(Math.max(a, b) / 10) * 10);
  d.deactivateRpm = hi - lo >= 200 ? [lo, hi] : null;
}

/** Speeds between which cylinders may rest: the manufacturer's, or one estimated from idle and the rev limit. */
export function deactivationWindow(d: Design, idleRpm: number, redlineRpm: number): [number, number] {
  // VW rests two cylinders from 1400 to 4000 rpm, Porsche from 1600 to 3000. The estimate is given to 50 rpm, no finer.
  const fifty = (v: number): number => Math.round(v / 50) * 50;
  return d.deactivateRpm ?? [fifty(Math.max(1000, idleRpm * 1.4)), fifty(Math.min(4000, redlineRpm * 0.55))];
}

/** Crank degrees each phaser travels. Zero where there is none. */
export function phaserRanges(d: Design): { intake: number; exhaust: number } {
  switch (d.camPhaser) {
    case 'none':
      return { intake: 0, exhaust: 0 };
    case 'intake':
      return { intake: d.intakePhaseRange, exhaust: 0 };
    case 'dual':
      return { intake: d.intakePhaseRange, exhaust: d.exhaustPhaseRange };
    case 'coupled':
      return { intake: d.intakePhaseRange, exhaust: d.intakePhaseRange };
  }
}

/** Park position, crank degrees later than the middle of the travel. */
export function parkOffset(d: Design): { intake: number; exhaust: number } {
  const r = phaserRanges(d);
  if (d.camPhaser === 'coupled') return { intake: -r.intake / 2, exhaust: -r.intake / 2 };
  return { intake: r.intake / 2, exhaust: -r.exhaust / 2 };
}

/** Shifts the phasers can reach, later than park. */
export function shiftLimits(d: Design): { intake: [number, number]; exhaust: [number, number] } {
  const r = phaserRanges(d);
  switch (d.camPhaser) {
    case 'none':
      return { intake: [0, 0], exhaust: [0, 0] };
    case 'coupled':
      return { intake: [0, r.intake], exhaust: [0, r.intake] };
    default:
      return { intake: [-r.intake, 0], exhaust: [0, r.exhaust] };
  }
}

export interface CamChoice {
  /** Later than park, crank degrees. */
  intakeShift?: number;
  exhaustShift?: number;
  /** The high cam when there are two. */
  high?: boolean;
  /** Share of full intake lift asked of a lever or MultiAir, 0..1. */
  liftShare?: number;
}

/** Events from the lobe centre lines, as valveEvents in physics.ts computes them. */
function eventsFrom(intakeCentre: number, exhaustCentre: number, intakeDuration: number, exhaustDuration: number): ValveEvents {
  const intakeOpenBtdc = intakeDuration / 2 - intakeCentre;
  const intakeCloseAbdc = intakeCentre + intakeDuration / 2 - 180;
  const exhaustOpenBbdc = exhaustCentre + exhaustDuration / 2 - 180;
  const exhaustCloseAtdc = exhaustDuration / 2 - exhaustCentre;
  return {
    exhaustOpen: 180 - exhaustOpenBbdc,
    exhaustClose: 360 + exhaustCloseAtdc,
    intakeOpen: 360 - intakeOpenBtdc,
    intakeClose: 540 + intakeCloseAbdc,
    ivcAbdc: intakeCloseAbdc,
    evoBbdc: exhaustOpenBbdc,
    overlap: intakeOpenBtdc + exhaustCloseAtdc,
  };
}

/** Recomputes the derived fields after moving the open and close angles. */
export function withEvents(e: Pick<ValveEvents, 'exhaustOpen' | 'exhaustClose' | 'intakeOpen' | 'intakeClose'>): ValveEvents {
  return {
    ...e,
    ivcAbdc: e.intakeClose - 540,
    evoBbdc: 180 - e.exhaustOpen,
    overlap: 360 - e.intakeOpen + (e.exhaustClose - 360),
  };
}

const camSwitched = (d: Design, side: 'intake' | 'exhaust'): boolean => d.camSwitch === 'both' || d.camSwitch === side;

/** Cam position and profile for one choice of the engine computer. */
export function camAt(d: Design, choice: CamChoice = {}): CamState {
  const park = parkOffset(d);
  const low = d.camSwitch !== 'none' && !choice.high;
  const intakeLow = low && camSwitched(d, 'intake');
  const exhaustLow = low && camSwitched(d, 'exhaust');
  const intakeDuration = intakeLow ? d.lowDuration : d.intakeDuration;
  const exhaustDuration = exhaustLow ? d.lowDuration + (d.exhaustDuration - d.intakeDuration) : d.exhaustDuration;
  let intakeLift = intakeLow ? d.lowLift : d.lift;
  const exhaustLift = exhaustLow ? d.lowLift : d.lift;
  const intakeCentre = d.lobeSeparation - 4 + park.intake + (choice.intakeShift ?? 0);
  const exhaustCentre = d.lobeSeparation + 4 - park.exhaust - (choice.exhaustShift ?? 0);
  let events = eventsFrom(intakeCentre, exhaustCentre, intakeDuration, Math.max(120, exhaustDuration));
  let throttling = false;
  if (d.liftControl !== 'cam' && choice.liftShare !== undefined && choice.liftShare < 1) {
    const s = Math.min(1, Math.max(0.005, choice.liftShare));
    const span = events.intakeClose - events.intakeOpen;
    throttling = true;
    if (d.liftControl === 'continuous') {
      const centre = (events.intakeOpen + events.intakeClose) / 2;
      const kept = span * (2 / Math.PI) * Math.asin(Math.sqrt(s));
      events = withEvents({ ...events, intakeOpen: centre - kept / 2, intakeClose: centre + kept / 2 });
      intakeLift *= s;
    } else {
      const share = 0.08 + 0.92 * s;
      events = withEvents({ ...events, intakeClose: events.intakeOpen + Math.min(span, span * share + 10) });
      intakeLift *= Math.sin(Math.PI * Math.min(share, 0.5)) ** 2;
    }
  }
  return { events, intakeLift, exhaustLift, throttling };
}

/** The cam an engine idles on: park, low profile, full lift. */
export const parkCam = (d: Design): CamState => camAt(d);

/** The main cam at park, which the 3D model and the sound take as their base. */
export const parkMainCam = (d: Design): CamState => camAt(d, { high: true });

export const timingOf = (e: ValveEvents): ValveTiming => ({ exhaustOpen: e.exhaustOpen, exhaustClose: e.exhaustClose, intakeOpen: e.intakeOpen, intakeClose: e.intakeClose });

/** Distance of the piston below top dead centre at a crank angle from it, mm. */
export function pistonTravel(stroke: number, rod: number, angleDeg: number): number {
  const a = stroke / 2;
  const g = angleDeg * DEG;
  const s = a * Math.sin(g);
  return a + rod - (a * Math.cos(g) + Math.sqrt(rod * rod - s * s));
}

/**
 * Compression from the moment the intake closes, after Heywood: the volume above the piston then over the
 * chamber. Closing late after bottom dead centre and closing early before it trap the same volume.
 */
export function effectiveCompression(d: Design, events: ValveEvents): number {
  const r = d.compression;
  if (isRotary(d)) return r;
  const gamma = 180 - Math.min(180, Math.abs(events.ivcAbdc));
  return 1 + ((r - 1) * pistonTravel(d.stroke, d.rodLength, gamma)) / d.stroke;
}

/** Share of the swept volume the cylinder has drawn in when the intake closes before bottom dead centre. */
export function earlyCloseFill(d: Design, events: ValveEvents): number {
  if (isRotary(d) || events.ivcAbdc >= 0) return 1;
  return pistonTravel(d.stroke, d.rodLength, 180 + events.ivcAbdc) / d.stroke;
}

const overlapCache = new WeakMap<CamState, number>();

/** Crank-angle integral of the smaller of the two curtain areas while both valves are open, m2 x deg. */
export function overlapArea(d: Design, cam: CamState): number {
  const cached = overlapCache.get(cam);
  if (cached !== undefined) return cached;
  let sum = 0;
  if (!isRotary(d)) {
    const { intake, exhaust } = valveSplit(d);
    const e = cam.events;
    const inPer = intake * Math.PI * (d.intakeValve / 1000) * (cam.intakeLift / 1000);
    const exPer = exhaust * Math.PI * (d.exhaustValve / 1000) * (cam.exhaustLift / 1000);
    const from = Math.floor(e.intakeOpen);
    const to = Math.ceil(e.exhaustClose);
    for (let phi = from; phi <= to; phi += 1) {
      const ai = inPer * liftWindow(phi, e.intakeOpen, e.intakeClose);
      const ae = exPer * liftWindow(phi, e.exhaustOpen, e.exhaustClose);
      sum += Math.min(ai, ae);
    }
  }
  overlapCache.set(cam, sum);
  return sum;
}

/** Firing order starting from cylinder 1, as the manufacturers count it. */
export function firingOrderFromOne(d: Design): number[] {
  const order = firingFromCrank(d, d.throws).order;
  const at = Math.max(0, order.indexOf(1));
  return [...order.slice(at), ...order.slice(0, at)];
}

/**
 * Cylinders that rest: every other one in the firing order, so the rest fire evenly. Taken from the order
 * rather than stored, so a new crank or cylinder count can't leave a stale list. GM's 1-7-6-4, Honda's rear
 * bank, VW's 2 and 3 and Porsche's one bank all come out of this rule.
 */
export function deactivationSets(d: Design): number[][] {
  if (d.deactivation === 'none') return [];
  const order = firingOrderFromOne(d);
  const first = order.filter((_, i) => i % 2 === 0);
  const second = order.filter((_, i) => i % 2 === 1);
  if (d.deactivateGroup === 'second') return [second];
  if (d.deactivateGroup === 'alternate') return [first, second];
  return [first];
}

/** Gaps between the firings that remain, crank degrees. */
export function remainingIntervals(d: Design, off: number[]): number[] {
  const plan = firingFromCrank(d, d.throws);
  const fires: number[] = [];
  let angle = 0;
  plan.order.forEach((n, i) => {
    if (!off.includes(n)) fires.push(angle);
    angle += plan.intervals[i]!;
  });
  return fires.map((f, i) => (i + 1 < fires.length ? fires[i + 1]! - f : 720 - f + fires[0]!));
}

/** Deepest valve relief a piston crown can carry, mm. */
export const reliefLimit = (d: Design): number => Math.min(2.5, 0.03 * d.bore);

/** Every corner the phasers can reach, on the main cam: where a valve comes closest to the piston. */
export function phaserCorners(d: Design): CamState[] {
  const lim = shiftLimits(d);
  const list: CamState[] = [];
  for (const i of new Set(lim.intake)) {
    for (const e of new Set(lim.exhaust)) {
      if (d.camPhaser === 'coupled' && i !== e) continue;
      list.push(camAt(d, { high: true, intakeShift: i, exhaustShift: e }));
    }
  }
  return list;
}

/**
 * Extra friction of the mechanisms, bar. Estimates, see docs/engine-designer-model.md. A locking pin and a
 * sliding cam block cost the same here: nothing published tells them apart, and switchKind is only drawn.
 */
export function mechanismFrictionBar(d: Design): number {
  const phasers = d.camPhaser === 'none' ? 0 : d.camPhaser === 'dual' ? 2 : 1;
  const switching = d.camSwitch === 'none' ? 0 : 0.008;
  const lift = d.liftControl === 'continuous' ? 0.02 : d.liftControl === 'multiair' ? 0.01 : 0;
  return 0.004 * phasers + switching + lift;
}

/** Extra mass of the mechanisms, kg. */
export function mechanismMassKg(d: Design): number {
  if (isRotary(d)) return 0;
  const banks = ['vee', 'flatvee', 'boxer', 'w'].includes(d.layout) ? 2 : 1;
  const phasers = (d.camPhaser === 'none' ? 0 : d.camPhaser === 'dual' ? 2 : 1) * (d.valvetrain === 'ohv' ? 1 : banks);
  const switching = d.camSwitch === 'none' ? 0 : 0.3 * d.cylinders;
  const lift = d.liftControl === 'cam' ? 0 : 3 * banks;
  const rest = d.deactivation === 'none' ? 0 : 3;
  return 0.6 * phasers + switching + lift + rest;
}
