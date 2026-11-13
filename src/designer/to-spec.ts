// Turns a resolved design into the same EngineSpec the catalogue uses, so 3D, sound and charts need no special cases.

import type { Aspiration, EngineSpec, Family, Fuel } from '../engine/spec.ts';
import { ruleSchedule, type VariableValves } from '../engine/valve-control.ts';
import { firingFromCrank, layoutDef } from './crank.ts';
import { safeCounterweight } from './constraints.ts';
import { effectiveOpen, effectivePops, effectiveRasp, exhaustGroups, isRotary, isTurbo, type Design } from './design.ts';
import { FUELS } from './fuels.ts';
import { Model, reciprocatingMass, rotatingMass, rotorMass, type Performance } from './physics.ts';
import { systemsOfDesign } from './systems.ts';
import { camAt, deactivationSets, deactivationWindow, hasVariableValves, phaserRanges, timingOf } from './valvetrain.ts';

const FAMILY: Record<Design['layout'], Family> = {
  inline: 'inline',
  vee: 'vee',
  boxer: 'flat',
  flatvee: 'flat',
  vr: 'narrow',
  w: 'narrow',
  rotary: 'rotary',
};

const LAYOUT_LETTER: Record<Design['layout'], string> = {
  inline: 'I',
  vee: 'V',
  boxer: 'B',
  flatvee: 'F',
  vr: 'VR',
  w: 'W',
  rotary: 'R',
};

export const designBadge = (d: Design): string => (isRotary(d) ? `${d.cylinders}R` : `${LAYOUT_LETTER[d.layout]}${d.cylinders}`);

const aspiration = (d: Design): Aspiration => {
  switch (d.charger) {
    case 'none':
      return 'na';
    case 'turbo':
      return 'turbo';
    case 'twinturbo':
      return 'twin-turbo';
    case 'quadturbo':
      return 'quad-turbo';
    case 'roots':
    case 'centrifugal':
      return 'supercharged';
  }
};

/** Unequal primaries spread evenly around the nominal length, in a fixed pattern along the engine. */
const primaryLengths = (d: Design): number | number[] => {
  if (d.headerLengths) return d.headerLengths.map((mm) => mm / 1000);
  const nominal = d.headerLength / 1000;
  if (d.headerSpread <= 0) return nominal;
  const pattern = [0.5, -0.5, 0.15, -0.2, 0.35, -0.35, 0.05, -0.05];
  return Array.from({ length: d.cylinders }, (_, i) => nominal * (1 + d.headerSpread * pattern[i % pattern.length]! * 1.4));
};

/** The figures a spec takes from the performance model. The schedule comes from it only after an engineering change. */
export type SpecInputs = Pick<Performance, 'events' | 'idleRpm' | 'redlineRpm' | 'revTimeS' | 'roughness' | 'torqueTable' | 'boostLagS' | 'catches'> &
  Partial<Pick<Performance, 'valvetrain' | 'cruise'>>;

/** The same figures for a design on factory calibration, with no need to run the model. */
const BLOWOFF_LEVEL = { recirculated: 0, soft: 0.35, vented: 1 };

export function factoryInputs(d: Design): SpecInputs {
  const f = d.factory;
  if (!f) throw new Error(`${d.name} has no factory calibration`);
  return {
    events: camAt(d, { high: true }).events,
    idleRpm: f.idleRpm,
    redlineRpm: d.rpmLimit,
    revTimeS: f.revTimeS,
    roughness: f.rough,
    torqueTable: [],
    boostLagS: 0,
    catches: true,
  };
}

/**
 * Charge trapped on the high cam over the low one at the schedule speeds. Sound needs it even on factory
 * calibration, so an engine with a cam switch pays for a handful of model points, and only that engine.
 */
function cheapHighGain(d: Design, rpms: number[]): number[] {
  const model = new Model(d);
  const fill = (rpm: number, high: boolean): number => model.at(rpm, { throttle: 1, lambda: d.lambda, noBoost: false, cam: camAt(d, { high }) }).fillRatio;
  return rpms.map((rpm) => fill(rpm, true) / Math.max(fill(rpm, false), 1e-6));
}

/** The variable valve gear as the crank simulation, the sound and the 3D model read it. */
export function variableValves(d: Design, perf: SpecInputs): VariableValves | undefined {
  if (!hasVariableValves(d) || isRotary(d)) return undefined;
  const ranges = phaserRanges(d);
  const model = !d.factory && perf.valvetrain && perf.cruise ? perf : null;
  const rule = ruleSchedule(d.camPhaser, ranges.intake, ranges.exhaust, d.rpmLimit);
  const schedule = model
    ? { wotRpm: model.valvetrain!.nodeRpm, wotIntake: model.valvetrain!.wotIntake, wotExhaust: model.valvetrain!.wotExhaust, partIntake: model.cruise!.intakeShift, partExhaust: model.cruise!.exhaustShift }
    : rule;
  const sets = deactivationSets(d);
  const [rpmMin, rpmMax] = deactivationWindow(d, perf.idleRpm, perf.redlineRpm);
  const round = (v: number): number => Math.round(v * 100) / 100;
  return {
    phaser: d.camPhaser,
    intakeRange: ranges.intake,
    exhaustRange: ranges.exhaust,
    wotRpm: schedule.wotRpm.map(Math.round),
    wotIntake: schedule.wotIntake.map(round),
    wotExhaust: schedule.wotExhaust.map(round),
    partIntake: round(schedule.partIntake),
    partExhaust: round(schedule.partExhaust),
    switching:
      d.camSwitch === 'none'
        ? null
        : {
            cams: d.camSwitch,
            rpm: d.switchRpm,
            kind: d.switchKind,
            low: timingOf(camAt(d, { high: false }).events),
            lowShare: Math.round((d.lowLift / d.lift) * 1000) / 1000,
            highGain: (model ? model.valvetrain!.highGain : cheapHighGain(d, schedule.wotRpm)).map(round),
          },
    lift: d.liftControl === 'cam' ? null : { kind: d.liftControl, maxLift: d.lift },
    deactivation:
      d.deactivation === 'none'
        ? null
        : {
            kind: d.deactivation,
            sets,
            rpmMin,
            rpmMax,
            documented: d.deactivateRpm !== null,
            loadMax: 0.3,
          },
  };
}

export function designToSpec(d: Design, perf: SpecInputs): EngineSpec {
  const rotary = isRotary(d);
  const firing = rotary ? null : firingFromCrank(d, d.throws);
  const fuel: Fuel = FUELS[d.fuel].diesel ? 'diesel' : 'petrol';
  const groups = exhaustGroups(d);
  const factory = d.factory;
  const events = perf.events;
  return {
    id: 'designer',
    family: FAMILY[d.layout],
    badge: designBadge(d),
    cylinders: d.cylinders,
    title: d.name,
    example: d.name,
    fuel,
    aspiration: aspiration(d),
    bore: rotary ? d.rotorR : d.bore,
    stroke: rotary ? d.rotorE * 2 : d.stroke,
    rodRatio: rotary ? 1 : d.rodLength / d.stroke,
    compression: d.compression,
    layout: layoutDef(d),
    firingOrder: firing ? firing.order : d.rotorOrder ?? Array.from({ length: d.cylinders }, (_, i) => i + 1),
    firingIntervals: firing ? firing.intervals : undefined,
    valvetrain: d.valvetrain,
    valvesPerCyl: d.valvesPerCyl,
    idleRpm: perf.idleRpm,
    redlineRpm: perf.redlineRpm,
    revTimeS: perf.revTimeS,
    rough: perf.roughness,
    pops: effectivePops(d),
    turboWhine: isTurbo(d) ? d.turboWhine : 0,
    turboHp: isTurbo(d) ? d.turboSizeHp : 0,
    // A diesel has no throttle to close against the boost.
    blowoff: isTurbo(d) && fuel !== 'diesel' ? BLOWOFF_LEVEL[d.blowoff] : 0,
    exhaust: {
      groups,
      pans: d.pans ?? (groups.length > 1 ? groups.map((_, i) => (groups.length === 1 ? 0 : -0.55 + (1.1 * i) / (groups.length - 1))) : undefined),
      headerM: primaryLengths(d),
      pipeM: d.pipeLength / 1000,
      open: effectiveOpen(d),
      rasp: effectiveRasp(d),
    },
    coverColor: d.coverColor ?? COVER_COLORS[d.layout],
    blockMaterial: d.blockMaterial,
    systems: systemsOfDesign(d),
    article: { lead: '', how: '', sound: '', pros: [], cons: [], cars: [] },
    timing: rotary
      ? undefined
      : { exhaustOpen: events.exhaustOpen, exhaustClose: events.exhaustClose, intakeOpen: events.intakeOpen, intakeClose: events.intakeClose },
    valves: rotary ? undefined : { intake: d.intakeValve, exhaust: d.exhaustValve, lift: d.lift },
    vvt: variableValves(d, perf),
    tuning: {
      // Factory figures come with the catalogue's own behaviour. The model takes over after the first change.
      torqueTable: factory ? undefined : perf.torqueTable,
      boostLagS: factory ? undefined : perf.boostLagS,
      catches: factory ? undefined : perf.catches,
      trim: factory?.trim,
      intakeM: d.runnerLength / 1000,
      supercharger: d.charger === 'roots' || d.charger === 'centrifugal',
      flywheelKg: d.flywheelKg,
      vibrationGain: d.balanceShafts === 2 ? 0.2 : d.balanceShafts === 1 ? 0.55 : 1,
      counterweightMm: rotary ? undefined : safeCounterweight(d.bore, d.stroke, d.rodLength),
      reciprocatingKg: rotary ? undefined : reciprocatingMass(d),
      rotatingKg: rotary ? undefined : rotatingMass(d),
      rotorKg: rotary ? rotorMass(d) : undefined,
      balanceShafts: rotary ? undefined : d.balanceShafts,
    },
  };
}

const COVER_COLORS: Record<Design['layout'], string> = {
  inline: '#a81c20',
  vee: '#b8141a',
  boxer: '#5a6066',
  flatvee: '#b8141a',
  vr: '#37404a',
  w: '#1c4e8c',
  rotary: '#a51e22',
};
