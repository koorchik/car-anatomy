// Zero-dimensional engine performance model: wide-open-throttle state at each engine speed.
// It computes in microseconds so the charts follow a slider. It estimates, it doesn't simulate gas flow.
//
// Sources and the status of each relation are listed in docs/engine-designer-model.md.

import { DEG, liftWindow } from '../engine/kinematics.ts';
import {
  displacementL,
  effectiveOpen,
  exhaustGroups,
  isRotary,
  isTurbo,
  sweptPerChamber,
  turboCount,
  valveSplit,
  type Design,
} from './design.ts';
import { firingFromCrank } from './crank.ts';
import { FUELS, heatReleaseFactor } from './fuels.ts';
import {
  camAt,
  earlyCloseFill,
  effectiveCompression,
  hasVariableValves,
  mechanismFrictionBar,
  mechanismMassKg,
  overlapArea,
  parkCam,
  phaserCorners,
  reliefLimit,
  shiftLimits,
  type CamChoice,
} from './valvetrain.ts';

const P_ATM = 101.3e3; // Pa
const T_ATM = 298; // K
const R_AIR = 287;
const CP_AIR = 1005;
const CP_EXH = 1150;
const COMPRESSOR_EXP = 0.286; // (gamma - 1) / gamma for air
const TURBINE_EXP = 0.248; // the same for exhaust gas

// Global calibration, fixed against the validation table in tests/designer-physics.test.ts.
const CYCLE_REALISM = 0.82; // real indicated efficiency relative to the ideal fuel-air cycle
const KNOCK_END_GAS_SHARE = 0.21; // share of the burn during which the end gas sits at its peak state
const HP_PER_KW = 1.35962;
// Residual gas and dilution. Structure after Fox, Cheng and Heywood (SAE 931025), constants mine.
const BACKFLOW_CD = 0.6; // discharge coefficient of the overlap opening, as of a plain orifice
const DILUTION_GAIN = 0.15; // cooler burn per unit of residual above 6 %
const DILUTION_LIMIT = 0.2; // past this share of residual gas the burn turns unstable
const DILUTION_LIMIT_K = 8;
/** Least valve-to-piston gap the reliefs are cut for, mm. */
const RELIEF_GAP = 1.5;
/** Retard a calibrator accepts from the variable valve gear before it backs off, degrees. My estimate. */
const KNOCK_MARGIN = 10;
/** Heat lost by the gas trapped in a resting cylinder each time it is squeezed, bar of mean pressure. */
const GAS_SPRING_BAR = 0.1;

export interface ValveEvents {
  /** All in crank degrees after firing TDC, as kinematics uses them. */
  exhaustOpen: number;
  exhaustClose: number;
  intakeOpen: number;
  intakeClose: number;
  /** Intake closing after bottom dead centre. */
  ivcAbdc: number;
  /** Exhaust opening before bottom dead centre. */
  evoBbdc: number;
  overlap: number;
}

/** What the cams do at one moment: events in crank degrees after firing TDC, and lifts in mm. */
export interface CamState {
  events: ValveEvents;
  intakeLift: number;
  exhaustLift: number;
  /** The intake valve sets the load, so its small opening throttles the flow as a butterfly would. */
  throttling?: boolean;
}

/** Share of fuel energy that reaches the shaft. BSFC in g/kWh, heating value in MJ/kg; 1 kWh is 3.6 MJ. */
export const brakeEfficiency = (bsfc: number, lhv: number): number => 3600 / (bsfc * lhv);

export function valveEvents(d: Design): ValveEvents {
  // Centre lines around the lobe separation, with the customary 4 degree intake advance.
  const intakeCentre = d.lobeSeparation - 4;
  const exhaustCentre = d.lobeSeparation + 4;
  const intakeOpenBtdc = d.intakeDuration / 2 - intakeCentre;
  const intakeCloseAbdc = intakeCentre + d.intakeDuration / 2 - 180;
  const exhaustOpenBbdc = exhaustCentre + d.exhaustDuration / 2 - 180;
  const exhaustCloseAtdc = d.exhaustDuration / 2 - exhaustCentre;
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

export interface RpmPoint {
  rpm: number;
  torqueNm: number;
  powerKw: number;
  powerHp: number;
  bmepBar: number;
  /** Air trapped relative to what fills the displacement at outside air density. */
  fillRatio: number;
  /** Relative to the manifold's own density, the classic volumetric efficiency. */
  volumetricEfficiency: number;
  /** Manifold pressure above atmospheric. */
  boostBar: number;
  /** Exhaust pressure above atmospheric, seen by the cylinder. */
  backpressureBar: number;
  /** The part of it caused by the pipe, catalyst and muffler. */
  pipeBackBar: number;
  /** Air speed in the intake runner, as a Mach number. */
  runnerMach: number;
  bsfc: number;
  fuelLh: number;
  fuelKgs: number;
  egtC: number;
  pistonSpeed: number;
  peakPressureBar: number;
  /** Degrees the ignition computer had to retard. */
  knockRetard: number;
  /** Share of the charge that is exhaust left over from the last cycle. */
  residual: number;
  /** Mean pressure spent pumping the gas in and out, bar. */
  pumpingBar: number;
  /** Phasers, crank degrees later than park. */
  intakeShift: number;
  exhaustShift: number;
  highCam: boolean;
  /** Above 1: still knocking with retard exhausted. */
  knockSeverity: number;
  machIndex: number;
  /** Shares of fuel energy. */
  energy: EnergyBalance;
}

export interface EnergyBalance {
  brake: number;
  friction: number;
  pumping: number;
  coolant: number;
  exhaust: number;
  unburned: number;
}

export interface Performance {
  points: RpmPoint[];
  peakPower: RpmPoint;
  peakTorque: RpmPoint;
  bestBsfc: RpmPoint;
  displacementL: number;
  /** At 2500 rpm and 30 kW, about a motorway cruise. */
  cruise: CruiseState;
  massKg: number;
  /** Reciprocating mass of one cylinder, kg. */
  reciprocatingKg: number;
  inertia: number;
  idleRpm: number;
  /** Highest speed the engine can actually pull to, free-revving. */
  topRpm: number;
  /** What the crank-speed simulation treats as redline: topRpm, kept above idle. */
  redlineRpm: number;
  revTimeS: number;
  /** Valve spring starts to lose control of the valve. */
  floatRpm: number;
  /** Rod or piston fails from inertia. */
  failureRpm: number;
  /** Peak piston acceleration at the rev limit, m/s2. */
  pistonAccel: number;
  rodStressMpa: number;
  /** Least piston-to-valve distance through the cycle, mm. Negative means they hit. */
  valveClearance: number;
  intakeTuneRpm: number;
  exhaustTuneRpm: number;
  events: ValveEvents;
  /** 0 silky to 1 lumpy. */
  roughness: number;
  /** Normalised net torque per normalised speed, for the crank-speed simulation. */
  torqueTable: number[];
  /** Compression temperature at the end of a cold-start stroke, K. */
  coldCompressionK: number;
  catches: boolean;
  /** Seconds for a turbo to come up to speed. */
  boostLagS: number;
  firingIntervals: number[];
  firingOrder: number[];
  /** Variable valve gear. Null without any. */
  valvetrain: ValvetrainPerformance | null;
  /** Compression counted from the moment the intake closes, with the cam in the middle of its travel. */
  effectiveCompression: number;
}

export interface CruiseState {
  fuelLh: number;
  bsfc: number;
  efficiency: number;
  reachable: boolean;
  /** Phasers, crank degrees later than park. */
  intakeShift: number;
  exhaustShift: number;
  /** Cylinders firing. */
  activeCylinders: number;
  /** Intake valve lift, mm. */
  liftMm: number;
  pumpingBar: number;
  residual: number;
}

export interface ValvetrainPerformance {
  /** Full-load schedule nodes. */
  nodeRpm: number[];
  wotIntake: number[];
  wotExhaust: number[];
  /** Torque at the nodes on each cam with its own best phase. Equal arrays without switching. */
  lowTorque: number[];
  highTorque: number[];
  /** Charge trapped on the high cam over the low one at the nodes. */
  highGain: number[];
  /** Lowest speed above which the high cam is never worse. Null when it is never better. */
  crossoverRpm: number | null;
  /** Torque given away between the switch and the crossover, N·m. */
  switchDeficitNm: number;
  /** Depth of the valve reliefs the phasers need, mm. */
  reliefMm: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Taylor's limit: flow falls off sharply past an inlet Mach index of about 0.6 and cannot pass about 0.75/Z. */
const choked = (z: number): number => Math.min(1 / (1 + (z / 0.9) ** 3.5), 0.78 / Math.max(z, 0.01));

/** Gaussian bump around a speed, on a ratio scale. */
const tuneBump = (n: number, centre: number, width: number): number => {
  const x = Math.log(n / centre) / width;
  return Math.exp(-x * x);
};

export const intakeTuneRpm = (d: Design): number => {
  // Runner tuning: the suction wave returns as the valve is about to close. Heuristic, see the model notes.
  const closedDeg = 480;
  const a = 345;
  const effective = (d.runnerLength + d.runnerDia * 0.5) / 1000;
  return (closedDeg * a) / (96 * effective);
};

export const exhaustTuneRpm = (d: Design, events: ValveEvents): number => {
  // Primary-pipe tuning after A. Graham Bell: L[in] = 850 ED / N - 3, with ED = 180 + EVO BBDC.
  const lengthIn = d.headerLength / 25.4;
  return (850 * (180 + events.evoBbdc)) / (lengthIn + 3);
};

/** Peak inertia mass, kg. Pistons scale with the cube of the bore, rods with their own size. */
function reciprocatingMass(d: Design): number {
  const piston = 0.55e-6 * d.bore ** 3 * { cast: 1.08, forged: 1, light: 0.78 }[d.pistonMaterial];
  const rod = 5.35e-7 * d.rodLength * d.bore ** 2 * { steel: 1, titanium: 0.62 }[d.rodMaterial];
  return piston + rod / 3;
}

const pistonAccelAt = (d: Design, rpm: number): number => {
  const w = (rpm * Math.PI) / 30;
  const r = d.stroke / 2000;
  return r * w * w * (1 + d.stroke / 2 / d.rodLength);
};

const rodStressAt = (d: Design, rpm: number): number => {
  // Rod section area grows with the bore square. Stress in MPa.
  const area = 0.028 * d.bore * d.bore;
  return (reciprocatingMass(d) * pistonAccelAt(d, rpm)) / area;
};

/** Stress where we expect the rod or its bolts to fail, MPa. */
const rodFailStress = (d: Design): number => ({ steel: 235, titanium: 250 })[d.rodMaterial];

const failureRpm = (d: Design): number => {
  if (isRotary(d)) return 14000 * (15 / d.rotorE) ** 0.5;
  const reference = 1000;
  return reference * Math.sqrt(rodFailStress(d) / rodStressAt(d, reference));
};

const floatRpm = (d: Design): number => {
  if (isRotary(d)) return Infinity;
  const train = { dohc: 0.1, sohc: 0.13, ohv: 0.17 }[d.valvetrain] * (d.intakeValve / 34);
  const halfSpan = (d.intakeDuration / 4) * DEG;
  // Real cams are asymmetric: the deceleration the spring must follow is well under the symmetric peak.
  const shape = (((Math.PI / halfSpan) ** 2 * (d.lift / 1000)) / 2) * 0.4;
  // F = m a, with cam angular speed half of the crank's.
  const camW = Math.sqrt(d.springForce / (train * shape));
  return ((camW * 2) * 30) / Math.PI;
};

/** Loss coefficient of a muffler by how open it is. Passes through the three typical mufflers. */
const mufflerLoss = (open: number): number => {
  const points: Array<[number, number]> = [[0, 5], [0.25, 3], [0.62, 1.15], [0.95, 0.25], [1, 0.2]];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (open <= x1) return y0 + ((open - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 0.2;
};

export interface OperatingPoint {
  /** Fraction of atmospheric pressure the throttle lets through. 1 is wide open. */
  throttle: number;
  lambda: number;
  /** Compressor bypassed: a cruise condition. */
  noBoost: boolean;
  /** Cam position and profile. The design's own cam when left out. */
  cam?: CamState;
  /** Share of cylinders firing, 1 when all are. */
  active?: number;
}

/** Turbine inlet pressure from Stodola's ellipse law: p3^2 - p4^2 grows with flow^2 and with T3. */
export const turbineInletPressure = (p4: number, flow: number, t3: number): number => Math.hypot(p4, P_ATM * 1.96 * flow * Math.sqrt(t3 / 1150));

/** Below this end-of-compression temperature on a cold start, diesel fuel won't light by itself, glow plugs or not. */
export const COLD_IGNITION_K = 600;

export class Model {
  readonly d: Design;
  readonly fuel: (typeof FUELS)[keyof typeof FUELS];
  readonly vdM3: number;
  readonly events: ValveEvents;
  readonly floatAt: number;
  readonly intakeTune: number;
  readonly exhaustTune: number;
  readonly baseCam: CamState;

  constructor(d: Design) {
    this.d = d;
    this.fuel = FUELS[d.fuel];
    // A rotor chamber fires once per shaft turn, not per two, so in four-stroke terms it counts double.
    this.vdM3 = ((isRotary(d) ? 2 : 1) * sweptPerChamber(d) * d.cylinders) / 1e9;
    this.events = valveEvents(d);
    this.floatAt = floatRpm(d);
    this.intakeTune = intakeTuneRpm(d);
    this.exhaustTune = exhaustTuneRpm(d, this.events);
    this.baseCam = camAt(d, { high: true });
  }

  /** Calls of at(), to keep the schedule search honest about its cost. */
  calls = 0;

  private strokeM(): number {
    return isRotary(this.d) ? (4 * this.d.rotorE) / 1000 : this.d.stroke / 1000;
  }

  /** Breathing of the valves: Taylor's inlet Mach index. */
  private machIndex(rpm: number, sound: number, cam: CamState): number {
    const d = this.d;
    const sp = (2 * this.strokeM() * rpm) / 60;
    if (isRotary(d)) {
      // Ports sized like Mazda's: index reaches about 0.5 at 9000 rpm on the 13B. A wider runner means a bigger port.
      return ((0.5 * rpm * d.rotorE) / (9000 * 15)) * (345 / sound) * (40 / d.runnerDia);
    }
    const { intake } = valveSplit(d);
    const ratio = (d.bore / d.intakeValve) ** 2 / intake;
    const liftShape = (1 - Math.exp((-cam.intakeLift / d.intakeValve) / 0.13)) / 0.865;
    const duration = cam.events.intakeClose - cam.events.intakeOpen;
    const flow = 0.4 * liftShape * (duration / 245) ** 0.8;
    return (ratio * sp) / (sound * flow);
  }

  private breathing(rpm: number, z: number, sound: number, valves: CamState): number {
    const d = this.d;
    const { ivcAbdc, overlap } = valves.events;
    let cam = 1;
    if (!isRotary(d)) {
      // Speed index without the cam's own help, because the cam timing decides which speed it suits.
      const speed = z * ((valves.events.intakeClose - valves.events.intakeOpen) / 245) ** 0.8;
      const late = Math.max(ivcAbdc, 5);
      const zCam = 0.42 * (late / 50) ** 0.75;
      if (speed < zCam) cam -= 0.22 * (late / 60) ** 1.6 * (1 - speed / zCam) ** 2;
      cam += 0.05 * (late / 60) * Math.exp(-(((speed - zCam) / 0.14) ** 2));
      const ov = Math.max(overlap, 0);
      cam -= 0.12 * (ov / 60) ** 1.4 * Math.max(0, 1 - z / 0.3) ** 2;
    } else {
      cam -= 0.16 * Math.max(0, 1 - z / 0.3) ** 2;
    }

    // Long narrow runners make stronger waves; a wide runner barely resonates and is free of loss.
    const mach = this.runnerMach(rpm, sound);
    const wave = clamp(mach / 0.22, 0.25, 1);
    const intakeTune = 0.07 * wave * (tuneBump(rpm, this.intakeTune, 0.2) + 0.45 * tuneBump(rpm, this.intakeTune / 1.55, 0.14)) - 0.012;
    const ductLoss = 0.55 * mach * mach;

    // Primary pipes only tune a free-flowing exhaust. A turbine right behind them erases the wave.
    const lengthEffect = clamp(d.headerLength / 450, 0.25, 1);
    // Fast gas in a narrow primary keeps pulling after the valve starts to close, which helps at low speed.
    const headerMach = (1.3 * ((2 * this.strokeM() * rpm) / 60) * (this.pistonAreaMm2() / ((Math.PI / 4) * d.headerDia ** 2))) / 600;
    const pull = clamp(headerMach / 0.1, 0, 1);
    const exhaustTune = isTurbo(d) ? 0 : 0.055 * lengthEffect * clamp(pull, 0.4, 1) * tuneBump(rpm, this.exhaustTune, 0.22) - 0.012 * lengthEffect + 0.03 * pull;

    const float = rpm > this.floatAt ? Math.exp(-(((rpm - this.floatAt) / (0.09 * this.floatAt)) ** 2)) : 1;
    return 0.965 * choked(z) * cam * (1 + intakeTune + exhaustTune - ductLoss) * float;
  }

  private pistonAreaMm2(): number {
    const d = this.d;
    return isRotary(d) ? d.rotorR * d.rotorWidth * 0.55 : (Math.PI / 4) * d.bore ** 2;
  }

  private runnerMach(rpm: number, sound: number): number {
    const sp = (2 * this.strokeM() * rpm) / 60;
    return (sp * (this.pistonAreaMm2() / ((Math.PI / 4) * this.d.runnerDia ** 2))) / sound;
  }

  /** Pressure lost pushing gas past the exhaust valves, Pa. Not capped at sonic: a tiny valve really does choke. */
  private exhaustValveDrop(sp: number, rhoExh: number, cam: CamState): number {
    const d = this.d;
    if (isRotary(d)) return 0;
    const { exhaust } = valveSplit(d);
    const ratio = (d.bore / d.exhaustValve) ** 2 / exhaust;
    const liftShape = (1 - Math.exp((-cam.exhaustLift / d.exhaustValve) / 0.13)) / 0.865;
    const flow = 0.4 * liftShape * ((cam.events.exhaustClose - cam.events.exhaustOpen) / 245) ** 0.8;
    const speed = (sp * ratio) / flow;
    return Math.min(0.35 * 0.5 * rhoExh * speed * speed, 4e5);
  }

  /** Heywood's ideal-cycle volumetric efficiency: back pressure leaves more residual gas behind. */
  private residualEffect(pe: number, pi: number, cam: CamState): number {
    const d = this.d;
    const g = 1.35;
    const r = d.compression;
    const ratio = clamp(pe / pi, 0.3, 4);
    const ideal = (g - 1) / g + (r - ratio) / (g * (r - 1));
    const baseline = (g - 1) / g + (r - 1) / (g * (r - 1));
    // Gas pushed back through the overlap is counted in at(), so only blow-through under boost remains here.
    const scavenge = !isRotary(d) ? 0.0012 * clamp(cam.events.overlap, 0, 90) * clamp(1 - ratio, 0, 0.4) : 0;
    return (ideal / baseline) * (1 + scavenge);
  }

  private cycleEfficiency(sp: number, lambda: number, ignitionError: number): number {
    const d = this.d;
    const r = d.compression;
    let ideal: number;
    if (this.fuel.diesel) {
      const g = 1.33;
      // Fuel injected later as load rises: cut-off ratio grows with the fuelling.
      const cutoff = 1 + 1.6 / Math.max(lambda, 1);
      ideal = 1 - (r ** (1 - g) * (cutoff ** g - 1)) / (g * (cutoff - 1));
    } else {
      const g = 1.3 + 0.05 * clamp(1 - 1 / lambda, -0.2, 0.35);
      ideal = 1 - r ** (1 - g);
    }
    // Heat escapes through the walls: worse in small chambers and at low speed.
    const shape = isRotary(d) ? 0.058 : 2 / d.bore + 1 / d.stroke;
    const wall = 0.075 * (shape / 0.0349) * (12 / Math.max(sp, 2)) ** 0.3;
    const heat = 1 - clamp(wall, 0, 0.6);
    const spark = 1 - 0.0006 * ignitionError * ignitionError;
    const rotaryShape = isRotary(d) ? 0.93 : 1;
    return ideal * CYCLE_REALISM * heat * Math.max(spark, 0.3) * rotaryShape;
  }

  private frictionBar(sp: number, peakBar: number): number {
    const d = this.d;
    if (isRotary(d)) return 0.35 + 0.004 * peakBar + 0.0016 * sp * sp + 0.012 * sp;
    const ratio = d.rodLength / d.stroke;
    const sideLoad = 1 + 0.25 * Math.max(0, 1.7 / ratio - 1);
    const train = { dohc: 0.06, sohc: 0.04, ohv: 0.02 }[d.valvetrain] + 0.012 * d.valvesPerCyl + 0.1 * Math.max(0, d.springForce / 700 - 1);
    const smallBore = (86 / d.bore) ** 0.5;
    const shafts = 0.05 * d.balanceShafts + (d.directInjection ? 0.03 : 0);
    return (0.34 * smallBore + train + shafts + mechanismFrictionBar(d)) + 0.0055 * peakBar + sideLoad * (0.012 * sp + 0.00105 * sp * sp);
  }

  /**
   * End of compression from the charge actually trapped: what the cylinder held when the intake closed,
   * squeezed from that moment on. Late or early closing traps less and squeezes it less: the Atkinson and
   * Miller cycles get their knock margin from this alone. Pressure in bar, temperature in K.
   */
  private endOfCompression(pIm: number, tIm: number, cam: CamState, ve: number, residual: number): { p: number; t: number } {
    const d = this.d;
    const r = d.compression;
    const rIvc = effectiveCompression(d, cam.events);
    const p = (pIm / 101325) * (ve * (r - 1) + 1) * rIvc ** 0.32;
    // Fresh charge warmed by the walls, and by whatever exhaust stayed behind.
    const tIvc = tIm + 20 + residual * (800 - tIm - 20);
    return { p, t: tIvc * rIvc ** 0.32 };
  }

  /** Spark-ignition knock: Douaud-Eyzat ignition delay against the time the end gas spends compressed. */
  private knock(pEc: number, tEc: number, peakRatio: number, sp: number, offset: number): { retard: number; severity: number } {
    const d = this.d;
    if (this.fuel.diesel) return { retard: 0, severity: 0 };
    const flame = 1.6 * sp + 5;
    const size = isRotary(d) ? d.rotorR * 0.9 : d.bore;
    // Fuel injected late leaves the end gas little time as a mixture.
    const burnMs = ((size * 0.7) / 1000 / flame) * 1000 * (d.directInjection ? 0.7 : 1);
    const octane = this.fuel.octane / 100;
    const ratio = (p: number): number => {
      const tEg = tEc * (p / pEc) ** 0.25;
      const tau = 17.68 * octane ** 3.402 * p ** -1.7 * Math.exp(3800 / tEg);
      return (KNOCK_END_GAS_SHARE * burnMs) / tau;
    };
    const base = pEc * peakRatio * 0.85 * (1 + 0.013 * offset);
    let retard = 0;
    let p = base;
    while (retard < 25 && ratio(p) > 1) {
      retard += 1;
      p *= 0.987;
    }
    const severity = ratio(p);
    return { retard, severity: severity > 1 ? severity : 0 };
  }

  /** Solves the boost loop and returns the full state at one speed. */
  at(rpm: number, op: OperatingPoint): RpmPoint {
    const d = this.d;
    const fuel = this.fuel;
    const sp = (2 * this.strokeM() * rpm) / 60;
    const cycles = rpm / 120;
    const stoich = fuel.afr;
    const lambda = op.lambda;
    const cam = op.cam ?? this.baseCam;
    this.calls++;

    let pressureRatio = 1;
    let pExhaust = P_ATM * 1.03;
    let t3 = 1050;
    let compressorKw = 0;
    let state = {} as {
      airKgs: number; fuelKgs: number; pIm: number; tIm: number; ve: number; z: number;
      pmepBar: number; imepBar: number; peakBar: number; retard: number; severity: number;
      indicated: number; heatW: number; efficiency: number; pipeBackBar: number; runnerMach: number; residual: number;
    };
    const active = clamp(op.active ?? 1, 0.1, 1);
    const valvesShut = active < 1 && d.deactivation !== 'fuel';

    const charger = d.charger;
    const turbo = isTurbo(d) && !op.noBoost;
    const count = turboCount(d) || 1;
    const passes = turbo ? 80 : charger === 'none' || op.noBoost ? 4 : 6;

    let lastRatio = 1;
    for (let pass = 0; pass < passes; pass++) {
      // Back pressure feeds back on the flow that causes it, so a small turbine chatters unless the steps shrink.
      const relax = Math.max(0.06, 0.55 / (1 + pass * 0.18));
      const t2 = T_ATM * (1 + (pressureRatio ** COMPRESSOR_EXP - 1) / 0.72);
      const cooled = charger === 'none' ? T_ATM : t2 - d.intercooler * (t2 - T_ATM);
      const icDrop = charger !== 'none' && d.intercooler > 0 ? 3000 * clamp(pressureRatio - 1, 0, 2) : 0;
      const pIm = Math.max(5e3, (P_ATM * pressureRatio - icDrop) * op.throttle);
      const tIm = Math.max(240, cooled - fuel.chargeCooling - (d.directInjection && !fuel.diesel ? 8 : 0));
      const sound = Math.sqrt(1.4 * R_AIR * tIm);
      const rho = pIm / (R_AIR * tIm);
      const z = this.machIndex(rpm, sound, cam);
      const veRaw = Math.max(0.02, this.breathing(rpm, z, sound, cam) * this.residualEffect(pExhaust, Math.max(pIm, 1e3), cam)) * earlyCloseFill(d, cam.events);
      // Exhaust pushed back into the intake through the overlap: an orifice flow over the overlap's area and time.
      const perCylinder = this.vdM3 / d.cylinders;
      const tResidual = Math.max(t3 * 0.75, 400);
      const rhoE = pExhaust / (R_AIR * tResidual);
      const fresh0 = rho * veRaw * perCylinder;
      const back = BACKFLOW_CD * (overlapArea(d, cam) / (6 * Math.max(rpm, 100))) * Math.sqrt(2 * rhoE * Math.max(0, pExhaust - pIm));
      const ve = veRaw * (1 - back / Math.max(back + fresh0, 1e-12));
      const clearance = (pExhaust * (perCylinder / Math.max(d.compression - 1, 0.5))) / (R_AIR * tResidual);
      const residual = (clearance + back) / Math.max(clearance + back + rho * ve * perCylinder, 1e-12);
      // A resting cylinder with its valves shut moves no air; with only its fuel cut it still pumps.
      const airKgs = rho * ve * this.vdM3 * cycles * (valvesShut ? active : 1);
      const burntAir = valvesShut ? airKgs : airKgs * active;
      const fuelKgs = burntAir / (stoich * lambda);

      const peakRatio = fuel.diesel ? 1.5 : 2.9 * clamp(heatReleaseFactor(lambda, false), 0.55, 1.05);
      const ec = this.endOfCompression(pIm, tIm, cam, ve, residual);
      const { retard, severity } = this.knock(ec.p, ec.t, peakRatio, sp, d.ignitionOffset);
      const ignitionError = d.ignitionOffset - retard;
      const peakBar = ec.p * 1.01325 * peakRatio * (1 + 0.012 * ignitionError);

      const heatW = (burntAir / stoich) * fuel.lhv * 1e6 * heatReleaseFactor(lambda, fuel.diesel);
      const dilution = fuel.diesel ? 1 : 1 + DILUTION_GAIN * Math.max(0, residual - 0.06) - DILUTION_LIMIT_K * Math.max(0, residual - DILUTION_LIMIT) ** 2;
      const efficiency = this.cycleEfficiency(sp, lambda, ignitionError) * Math.max(0.3, dilution);
      const indicated = heatW * efficiency;
      const swept = this.vdM3 * cycles;
      const imepBar = indicated / Math.max(swept, 1e-9) / 1e5;

      // Exhaust system restriction: losses in the pipes grow with the square of the gas speed.
      const exhaustKgs = airKgs + fuelKgs;
      const cooling = fuel.diesel ? 0.2 : 0.24;
      // From the heat actually released: unburnt fuel in a rich mixture only absorbs heat and cools the gas.
      // The share below 1 is lost on the way out of the cylinder and in dissociation.
      const egtGain = Math.max(0, (0.92 * heatW * (1 - efficiency - cooling)) / Math.max(exhaustKgs * CP_EXH, 1));
      t3 = clamp(tIm + egtGain, 500, 1500);
      const pipes = isRotary(d) ? 1 : exhaustGroups(d).length;
      const pipeArea = pipes * (Math.PI / 4) * (d.pipeDia / 1000) ** 2;
      const rhoExh = P_ATM / (R_AIR * Math.max(t3 * 0.75, 400));
      // The gas can't leave the pipe faster than sound, however narrow it is.
      const gasSpeed = Math.min(exhaustKgs / rhoExh / pipeArea, 480);
      const k = mufflerLoss(effectiveOpen(d) + (d.mufflerOpen === null && d.catalyst ? 0.05 : 0)) + (d.catalyst ? 0.9 : 0) + (0.02 * d.pipeLength) / d.pipeDia;
      const pipeDrop = k * 0.5 * rhoExh * gasSpeed * gasSpeed;
      const primaryArea = (Math.PI / 4) * d.headerDia ** 2;
      const primarySpeed = Math.min(1.3 * sp * (this.pistonAreaMm2() / primaryArea), 480);
      const primaryDrop = 0.6 * 0.5 * rhoExh * primarySpeed * primarySpeed + this.exhaustValveDrop(sp, rhoExh, cam);
      const p4 = P_ATM + pipeDrop;

      let turbineDriven = pExhaust;
      compressorKw = 0;
      if (turbo) {
        // Turbines on road cars are sized well under peak flow, and the wastegate passes the rest.
        const rated = d.turboSizeHp * 0.00045;
        const flow = exhaustKgs / count / rated;
        const pMax = turbineInletPressure(p4, flow, t3);
        const turbineEff = 0.7 * clamp(1 - 0.12 * Math.max(0, flow - 1) ** 2, 0.25, 1) * clamp(Math.sqrt(flow / 0.25), 0.35, 1);
        const compressorEff = 0.74 * clamp(1 - 0.12 * Math.max(0, flow - 1) ** 2, 0.35, 1);
        const target = 1 + d.boostBar;
        const specific = airKgs * CP_AIR * T_ATM;
        const power = (p3: number): number => exhaustKgs * CP_EXH * t3 * turbineEff * (1 - (p4 / p3) ** TURBINE_EXP) * 0.96;
        const reachable = Math.min((power(pMax) * compressorEff) / Math.max(specific, 1) + 1, 2);
        const nextRatio = Math.min(target, reachable ** (1 / COMPRESSOR_EXP));
        // With the target met the wastegate opens, so the turbine only makes the power the compressor takes.
        const need = (specific * (nextRatio ** COMPRESSOR_EXP - 1)) / compressorEff;
        const share = clamp(need / Math.max(0.96 * exhaustKgs * CP_EXH * t3 * turbineEff, 1), 0, 0.85);
        turbineDriven = Math.min(pMax, p4 / (1 - share) ** (1 / TURBINE_EXP));
        lastRatio = pressureRatio;
        pressureRatio += (nextRatio - pressureRatio) * relax;
      } else if ((charger === 'roots' || charger === 'centrifugal') && !op.noBoost) {
        // The drive ratio is fixed by the pulleys, not by the rev limit: sized for a piston speed of 17 m/s.
        const speedShare = (rpm * 2 * this.strokeM()) / 60 / 17;
        pressureRatio = 1 + d.boostBar * (charger === 'roots' ? clamp(speedShare / 0.28, 0, 1) : clamp(speedShare, 0, 1) ** 2);
        const eff = charger === 'roots' ? 0.55 : 0.72;
        compressorKw = (airKgs * CP_AIR * T_ATM * (pressureRatio ** COMPRESSOR_EXP - 1)) / eff / 0.95 / 1000;
        turbineDriven = p4;
      } else {
        pressureRatio = 1;
        turbineDriven = p4;
      }
      pressureRatio = clamp(pressureRatio, 1, 8);
      const targetExhaust = Math.min(turbineDriven + primaryDrop, P_ATM * 10);
      const lastExhaust = pExhaust;
      pExhaust = turbo ? pExhaust * (targetExhaust / pExhaust) ** relax : targetExhaust;

      // A small intake opening chokes the flow and the piston pulls against it, as against a closed butterfly.
      // It only pulls while the valve is open: after an early close the trapped charge expands and returns its work.
      const openShare = Math.min(1, (cam.events.intakeClose - cam.events.intakeOpen) / (this.baseCam.events.intakeClose - this.baseCam.events.intakeOpen));
      const valveThrottling = cam.throttling ? (pIm * Math.max(0, 1 - choked(z) / choked(this.machIndex(rpm, sound, this.baseCam))) * openShare) / 1e5 : 0;
      const pumpingActive = (pExhaust - pIm) / 1e5 + valveThrottling;
      const pmepBar = valvesShut ? active * pumpingActive + (1 - active) * GAS_SPRING_BAR : pumpingActive;
      state = { airKgs, fuelKgs, pIm, tIm, ve, z, pmepBar, imepBar, peakBar, retard, severity, indicated, heatW, efficiency, pipeBackBar: pipeDrop / 1e5, runnerMach: this.runnerMach(rpm, sound), residual };
      if (turbo && pass > 3 && Math.abs(pressureRatio - lastRatio) < 2e-4 && Math.abs(pExhaust - lastExhaust) / lastExhaust < 2e-4) break;
    }

    const { airKgs, fuelKgs, pIm, ve, z, pmepBar, imepBar, peakBar, retard, severity, heatW } = state;
    const frictionBar = this.frictionBar(sp, peakBar);
    const accessories = 0.08 + (compressorKw * 1000) / Math.max(this.vdM3 * cycles, 1e-9) / 1e5;
    const bmepBar = imepBar - pmepBar - frictionBar - accessories;
    const torqueNm = (bmepBar * 1e5 * this.vdM3) / (4 * Math.PI);
    const powerW = torqueNm * ((rpm * Math.PI) / 30);
    const powerKw = powerW / 1000;
    const fuelEnergy = Math.max(fuelKgs * fuel.lhv * 1e6, 1);
    const swept = this.vdM3 * cycles * 1e5;
    const coolant = Math.max(0, ((state.heatW - state.indicated) * (fuel.diesel ? 0.38 : 0.42)) / fuelEnergy);
    const friction = Math.max(0, ((frictionBar + accessories) * swept) / fuelEnergy);
    const pumping = Math.max(0, (pmepBar * swept) / fuelEnergy);
    const brake = Math.max(0, powerW / fuelEnergy);
    const unburned = Math.max(0, 1 - heatW / fuelEnergy);
    const exhaustShare = Math.max(0, 1 - brake - friction - pumping - coolant - unburned);
    // Where the engine can't even turn itself the losses exceed the fuel's energy: show them as proportions.
    const total = brake + friction + pumping + coolant + unburned + exhaustShare || 1;
    const bsfc = powerKw > 0.05 ? (fuelKgs * 3600 * 1000) / powerKw : Infinity;

    return {
      rpm,
      torqueNm,
      powerKw,
      powerHp: powerKw * HP_PER_KW,
      bmepBar,
      fillRatio: (airKgs / (this.vdM3 * cycles)) / (P_ATM / (R_AIR * T_ATM)),
      volumetricEfficiency: ve,
      boostBar: (pIm - P_ATM) / 1e5,
      backpressureBar: (pExhaust - P_ATM) / 1e5,
      pipeBackBar: state.pipeBackBar,
      runnerMach: state.runnerMach,
      bsfc,
      fuelLh: (fuelKgs * 3600) / fuel.density,
      fuelKgs,
      egtC: t3 - 273,
      pistonSpeed: sp,
      peakPressureBar: peakBar,
      knockRetard: retard,
      knockSeverity: severity,
      residual: state.residual,
      pumpingBar: pmepBar,
      intakeShift: 0,
      exhaustShift: 0,
      highCam: true,
      machIndex: z,
      energy: { brake: brake / total, friction: friction / total, pumping: pumping / total, coolant: coolant / total, exhaust: exhaustShare / total, unburned: unburned / total },
    };
  }
}

/** Smallest piston-to-valve distance through the overlap, mm. */
export function valveClearance(d: Design, events: ValveEvents): number {
  if (isRotary(d)) return Infinity;
  const r = d.stroke / 2;
  const l = d.rodLength;
  const headroom = (d.stroke / (d.compression - 1)) * 0.65 + 0.8;
  const depth = (phi: number): number => {
    const g = phi * DEG;
    const s = r * Math.sin(g);
    return r + l - (r * Math.cos(g) + Math.sqrt(l * l - s * s));
  };
  let least = Infinity;
  for (let phi = 250; phi <= 470; phi += 1) {
    const inLift = liftWindow(phi, events.intakeOpen, events.intakeClose) * d.lift;
    const exLift = liftWindow(phi, events.exhaustOpen, events.exhaustClose) * d.lift;
    least = Math.min(least, headroom + depth(phi) - Math.max(inLift, exLift));
  }
  return least;
}

function estimateMass(d: Design): number {
  const litres = displacementL(d) * (isRotary(d) ? 2 : 1);
  const material = d.blockMaterial === 'aluminium' ? 0.72 : 1;
  const banks = ['vee', 'flatvee', 'boxer', 'w'].includes(d.layout) ? 2 : 1;
  const base = 78 * litres ** 0.62 * material * (1 + 0.012 * d.cylinders) * (isRotary(d) ? 0.45 : 1);
  const heads = isRotary(d) ? 0 : banks * (d.valvetrain === 'dohc' ? 11 : 7) * (d.bore / 86) ** 1.3 * (d.cylinders / banks / 4) ** 0.7;
  const diesel = FUELS[d.fuel].diesel ? 1.25 : 1;
  const charger = turboCount(d) * 14 + (d.charger === 'roots' ? 22 : d.charger === 'centrifugal' ? 14 : 0) + (d.charger !== 'none' && d.intercooler > 0 ? 6 + d.intercooler * 8 : 0);
  return (base + heads) * diesel + charger + d.flywheelKg + d.balanceShafts * 5;
}

function rotatingInertia(d: Design, reciprocating: number): number {
  const flyR = 0.13 * (d.flywheelKg / 9) ** (1 / 3);
  const fly = 0.5 * d.flywheelKg * flyR * flyR;
  if (isRotary(d)) {
    const rotor = 0.5 * 4.5 * (d.rotorWidth / 80) * (d.rotorR / 105) ** 2 * d.cylinders * ((d.rotorE / 1000) ** 2 + 0.002);
    return fly + 0.012 + rotor;
  }
  const r = d.stroke / 2000;
  const crank = 0.0065 * displacementL(d) * (d.stroke / 86);
  return fly + crank + (d.cylinders * reciprocating * r * r) / 2;
}

function firingRoughness(d: Design, intervals: number[]): number {
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const spread = Math.sqrt(intervals.reduce((a, v) => a + (v - mean) ** 2, 0) / intervals.length) / mean;
  // Idle runs at park on the low cam, which is what lets a wild top-end cam idle smoothly.
  const events = parkCam(d).events;
  return clamp(0.12 + spread * 0.75 + 1.2 / (d.cylinders + 1) ** 1.2 + Math.max(0, events.overlap - 25) / 90, 0.08, 1);
}

/** Phases at the schedule nodes, crank degrees later than park, and what they give. */
interface NodeChoice {
  intake: number;
  exhaust: number;
  share: number;
  point: RpmPoint;
}

const spread = (from: number, to: number, count: number): number[] => (from === to ? [from] : Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1)));

/** Speeds the engine computer's full-load schedule is set at, as shares of the rev limit. */
const NODES = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05];

/** MultiAir closes early at full load on the low end, which stops the piston pushing the charge back. */
const MULTIAIR_SHARES = [1, 0.837, 0.674];

/**
 * The engine computer's best choice at one speed and one load, found by coordinate descent: intake phase
 * first, then exhaust, then how early MultiAir closes. Park is always among the candidates, so the
 * mechanisms never make a node worse than the plain cam.
 */
function bestChoice(d: Design, score: (choice: CamChoice) => RpmPoint | null, better: (a: RpmPoint, b: RpmPoint) => boolean, high: boolean, warm: { exhaust: number }): NodeChoice | null {
  const lim = shiftLimits(d);
  const coupled = d.camPhaser === 'coupled';
  const intakes = spread(lim.intake[0], lim.intake[1], 5);
  const exhausts = d.camPhaser === 'dual' ? spread(lim.exhaust[0], lim.exhaust[1], 4) : [0];
  const shares = d.liftControl === 'multiair' ? MULTIAIR_SHARES : [1];
  let best: NodeChoice | null = null;
  const tried = new Map<string, RpmPoint | null>();
  const tryOne = (intake: number, exhaust: number, share: number): void => {
    const key = `${intake}/${exhaust}/${share}`;
    if (tried.has(key)) return;
    const point = score({ intakeShift: intake, exhaustShift: coupled ? intake : exhaust, high, liftShare: share });
    tried.set(key, point);
    if (point && (!best || better(point, best.point))) best = { intake, exhaust: coupled ? intake : exhaust, share, point };
  };
  tryOne(0, 0, 1);
  // The middle of the travel is where the plain cam would sit, so it is always tried as well.
  if (d.camPhaser !== 'none') tryOne((lim.intake[0] + lim.intake[1]) / 2, (lim.exhaust[0] + lim.exhaust[1]) / 2, 1);
  const startExhaust = exhausts.includes(warm.exhaust) ? warm.exhaust : 0;
  for (const i of intakes) tryOne(i, startExhaust, 1);
  const afterIntake = best as NodeChoice | null;
  if (exhausts.length > 1 && afterIntake) for (const e of exhausts) tryOne(afterIntake.intake, e, 1);
  const afterExhaust = best as NodeChoice | null;
  if (shares.length > 1 && afterExhaust) for (const sh of shares) tryOne(afterExhaust.intake, afterExhaust.exhaust, sh);
  return best;
}

/**
 * Solves for the setting that makes the target power, by regula falsi: power is close to linear in the
 * butterfly, the lift share and the mixture, so a few steps do what bisection needed 26 for.
 */
function solvePower(at: (x: number) => RpmPoint, lo: number, hi: number, target: number, rising: boolean, seed?: number): RpmPoint | null {
  const f = (p: RpmPoint): number => (p.powerKw - target) * (rising ? 1 : -1);
  let a = lo;
  let b = hi;
  let pb = at(b);
  if (f(pb) < 0) return null;
  let pa: RpmPoint;
  if (seed !== undefined && seed > lo && seed < hi) {
    const ps = at(seed);
    if (f(ps) >= 0) {
      b = seed;
      pb = ps;
    } else {
      a = seed;
    }
    pa = f(ps) >= 0 ? at(a) : ps;
  } else {
    pa = at(a);
  }
  let fa = f(pa);
  let fb = f(pb);
  if (fa >= 0) return pa;
  let side = 0;
  let last = pb;
  for (let i = 0; i < 14; i++) {
    const x = clamp(b - (fb * (b - a)) / (fb - fa), Math.min(a, b), Math.max(a, b));
    const p = at(x);
    last = p;
    const fx = f(p);
    if (Math.abs(p.powerKw - target) < 2e-3) return p;
    if (fx > 0) {
      b = x;
      fb = fx;
      if (side === 1) fa /= 2;
      side = 1;
    } else {
      a = x;
      fa = fx;
      if (side === -1) fb /= 2;
      side = -1;
    }
    if (Math.abs(b - a) < 1e-7) break;
  }
  return last;
}

/** Recent results by design, because the page asks for the same engine several times per change. */
const MEMO: Array<{ key: string; perf: Performance }> = [];

export function evaluate(d: Design): Performance {
  const key = JSON.stringify(d);
  const hit = MEMO.find((m) => m.key === key);
  if (hit) return hit.perf;
  const perf = compute(d);
  MEMO.unshift({ key, perf });
  MEMO.length = Math.min(MEMO.length, 4);
  return perf;
}

/** Calls of the model's single-point solver in the last evaluation, for the cost test. */
export let lastEvaluateCalls = 0;

function compute(d: Design): Performance {
  const model = new Model(d);
  const fuel = model.fuel;
  const limit = d.rpmLimit;
  const steps = 72;
  const low = Math.max(500, Math.min(800, limit * 0.15));
  const points: RpmPoint[] = [];
  const variable = hasVariableValves(d) && !isRotary(d);
  const switching = variable && d.camSwitch !== 'none';
  const wot = (rpm: number, choice: CamChoice): RpmPoint => {
    const p = model.at(rpm, { throttle: 1, lambda: d.lambda, noBoost: false, cam: camAt(d, choice) });
    p.intakeShift = choice.intakeShift ?? 0;
    p.exhaustShift = choice.exhaustShift ?? 0;
    p.highCam = choice.high ?? true;
    return p;
  };
  // A calibrator keeps a margin from knock: no phase may need more retard than the plain cam does there, or
  // than a modest amount, however much torque it promises.
  const torqueBetterWithin = (allowed: number) => (a: RpmPoint, b: RpmPoint): boolean => {
    const over = (p: RpmPoint): number => Math.max(0, p.knockRetard - allowed) + (p.knockSeverity > 1 ? p.knockSeverity : 0);
    const ka = over(a);
    const kb = over(b);
    if (ka !== kb) return ka < kb;
    return a.torqueNm > b.torqueNm + 1e-9;
  };

  let valvetrain: ValvetrainPerformance | null = null;
  let nodeRpm: number[] = [];
  let active: NodeChoice[] = [];
  if (variable) {
    nodeRpm = NODES.map((n) => n * limit);
    const lim = shiftLimits(d);
    const middle = { intakeShift: (lim.intake[0] + lim.intake[1]) / 2, exhaustShift: (lim.exhaust[0] + lim.exhaust[1]) / 2 };
    const search = (high: boolean): NodeChoice[] => {
      const warm = { exhaust: 0 };
      return nodeRpm.map((rpm) => {
        const plain = wot(rpm, { ...middle, high });
        const allowed = Math.max(KNOCK_MARGIN, plain.knockRetard);
        const best = bestChoice(d, (c) => wot(rpm, c), torqueBetterWithin(allowed), high, warm)!;
        warm.exhaust = best.exhaust;
        return best;
      });
    };
    const high = search(true);
    const lowCam = switching ? search(false) : high;
    active = nodeRpm.map((rpm, i) => (switching && rpm < d.switchRpm ? lowCam[i]! : high[i]!));
    const lowTorque = lowCam.map((c) => c.point.torqueNm);
    const highTorque = high.map((c) => c.point.torqueNm);
    let crossoverRpm: number | null = null;
    if (switching) {
      const diff = nodeRpm.map((_, i) => highTorque[i]! - lowTorque[i]!);
      let k = diff.length;
      while (k > 0 && diff[k - 1]! >= 0) k--;
      if (k === 0) crossoverRpm = nodeRpm[0]!;
      else if (k < diff.length) {
        // Bisect between the two nodes, each cam at its own interpolated best phase.
        const shiftsOf = (list: NodeChoice[], rpm: number, high: boolean): CamChoice => ({
          high,
          intakeShift: interpolateTable(nodeRpm, list.map((c) => c.intake), rpm),
          exhaustShift: interpolateTable(nodeRpm, list.map((c) => c.exhaust), rpm),
          liftShare: interpolateTable(nodeRpm, list.map((c) => c.share), rpm),
        });
        let a = nodeRpm[k - 1]!;
        let b = nodeRpm[k]!;
        for (let step = 0; step < 4; step++) {
          const mid = (a + b) / 2;
          const gain = wot(mid, shiftsOf(high, mid, true)).torqueNm - wot(mid, shiftsOf(lowCam, mid, false)).torqueNm;
          if (gain >= 0) b = mid;
          else a = mid;
        }
        crossoverRpm = (a + b) / 2;
      }
    }
    // Torque left on the table around the switch: the better curve minus the one in use, at the speeds between.
    let switchDeficitNm = 0;
    if (switching && crossoverRpm !== null) {
      const from = Math.min(d.switchRpm, crossoverRpm);
      const to = Math.max(d.switchRpm, crossoverRpm);
      for (let rpm = from; rpm <= to; rpm += Math.max(50, (to - from) / 20)) {
        const lowNm = interpolateTable(nodeRpm, lowTorque, rpm);
        const highNm = interpolateTable(nodeRpm, highTorque, rpm);
        const used = rpm < d.switchRpm ? lowNm : highNm;
        switchDeficitNm = Math.max(switchDeficitNm, Math.max(lowNm, highNm) - used);
      }
    }
    // Phasers only move the cam: a valve comes closest at one of the corners of their travel. The crown gets
    // reliefs just deep enough to keep a working gap there, as long as the crown can carry them.
    const reference = valveClearance(d, model.events);
    const worst = Math.min(...phaserCorners(d).map((c) => valveClearance(d, c.events)));
    const reliefMm = clamp(Math.min(reference, RELIEF_GAP) - worst, 0, reliefLimit(d));
    valvetrain = {
      nodeRpm,
      wotIntake: active.map((c) => c.intake),
      wotExhaust: active.map((c) => c.exhaust),
      lowTorque,
      highTorque,
      highGain: nodeRpm.map((_, i) => high[i]!.point.fillRatio / Math.max(lowCam[i]!.point.fillRatio, 1e-6)),
      crossoverRpm,
      switchDeficitNm,
      reliefMm,
    };
  }

  for (let i = 0; i <= steps; i++) {
    const rpm = low + ((limit - low) * i) / steps;
    if (!variable) {
      points.push(model.at(rpm, { throttle: 1, lambda: d.lambda, noBoost: false }));
      continue;
    }
    const high = !switching || rpm >= d.switchRpm;
    const shares = active.map((c) => c.share);
    points.push(
      wot(rpm, {
        high,
        intakeShift: interpolateTable(nodeRpm, active.map((c) => c.intake), rpm),
        exhaustShift: interpolateTable(nodeRpm, active.map((c) => c.exhaust), rpm),
        liftShare: interpolateTable(nodeRpm, shares, rpm),
      }),
    );
  }
  const peakPower = points.reduce((a, b) => (b.powerKw > a.powerKw ? b : a), points[0]!);
  const peakTorque = points.reduce((a, b) => (b.torqueNm > a.torqueNm ? b : a), points[0]!);
  const bestBsfc = points.reduce((a, b) => (b.bsfc < a.bsfc ? b : a), points[0]!);

  const cruise = cruiseState(d, model, limit);

  const reciprocatingKg = isRotary(d) ? 0 : reciprocatingMass(d);
  const inertia = rotatingInertia(d, reciprocatingKg);
  const events = model.baseCam.events;
  const overlapIdle = Math.max(0, parkCam(d).events.overlap - 20) * 7;
  const lightFlywheel = Math.max(0, 7 - d.flywheelKg) * 12;
  const idleRpm = d.factory?.idleRpm ?? Math.round(clamp(560 + 1000 / d.cylinders ** 0.9 + overlapIdle + lightFlywheel, 500, Math.min(2200, limit * 0.4)) / 10) * 10;

  // Free-revving ceiling: past this point the engine has no torque left to accelerate.
  let topRpm = limit;
  for (const p of points) {
    if (p.rpm > peakTorque.rpm && p.torqueNm <= Math.max(1, peakTorque.torqueNm * 0.02)) {
      topRpm = Math.max(p.rpm, idleRpm + 200);
      break;
    }
  }
  const usefulPeak = Math.max(peakTorque.torqueNm, 1);
  const redlineRpm = d.factory ? limit : Math.max(topRpm, idleRpm + 300);
  const torqueTable: number[] = [];
  const tableSize = 25;
  for (let i = 0; i < tableSize; i++) {
    const n = (i / (tableSize - 1)) * 1.2;
    const rpm = n * redlineRpm;
    const p = points.reduce((a, b) => (Math.abs(b.rpm - rpm) < Math.abs(a.rpm - rpm) ? b : a), points[0]!);
    torqueTable.push(clamp(p.torqueNm / usefulPeak, -0.3, 1));
  }

  // Time to climb from idle: rotating inertia over torque, plus what a real throttle and manifold add.
  let climb = 0;
  for (const p of points) {
    if (p.rpm < idleRpm || p.rpm > topRpm) continue;
    const stepW = (((limit - low) / steps) * Math.PI) / 30;
    climb += (inertia * stepW) / Math.max(p.torqueNm, usefulPeak * 0.08);
  }
  const revTimeS = d.factory?.revTimeS ?? clamp(climb * 4 + 0.15, 0.25, 8);

  const failure = failureRpm(d);
  const stress = isRotary(d) ? 0 : rodStressAt(d, limit);
  const coldCompressionK = 263 * d.compression ** 0.33;
  const noCompressionIgnition = fuel.diesel && coldCompressionK < COLD_IGNITION_K;
  const catches = !noCompressionIgnition && peakTorque.torqueNm > 0;

  const firing = isRotary(d) ? { order: [], intervals: [] as number[] } : firingFromCrank(d, d.throws);
  const count = turboCount(d) || 1;
  lastEvaluateCalls = model.calls;
  return {
    points,
    peakPower,
    peakTorque,
    bestBsfc,
    displacementL: displacementL(d),
    cruise,
    massKg: estimateMass(d) + mechanismMassKg(d),
    reciprocatingKg,
    inertia,
    idleRpm,
    topRpm,
    redlineRpm,
    revTimeS,
    floatRpm: floatRpm(d),
    failureRpm: failure,
    pistonAccel: isRotary(d) ? 0 : pistonAccelAt(d, limit),
    rodStressMpa: stress,
    valveClearance: valvetrain ? Math.min(...phaserCorners(d).map((c) => valveClearance(d, c.events))) + valvetrain.reliefMm : valveClearance(d, events),
    intakeTuneRpm: model.intakeTune,
    exhaustTuneRpm: model.exhaustTune,
    events,
    roughness: d.factory?.rough ?? (firing.intervals.length ? firingRoughness(d, firing.intervals) : 0.6),
    torqueTable,
    coldCompressionK,
    catches,
    boostLagS: isTurbo(d) ? clamp(0.35 + (d.turboSizeHp / 500) * (count === 1 ? 1.2 : 0.8), 0.3, 3.5) : 0.05,
    firingIntervals: firing.intervals,
    firingOrder: firing.order,
    valvetrain,
    effectiveCompression: effectiveCompression(d, model.events),
  };
}

const interpolateTable = (xs: number[], ys: number[], x: number): number => {
  if (x <= xs[0]!) return ys[0]!;
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]!) return ys[i - 1]! + ((ys[i]! - ys[i - 1]!) * (x - xs[i - 1]!)) / (xs[i]! - xs[i - 1]!);
  }
  return ys[ys.length - 1]!;
};

/** Cruise: 30 kW at 2500 rpm, about a motorway at 100 km/h. The computer picks phases, cylinders and lift for the least fuel. */
function cruiseState(d: Design, model: Model, limit: number): CruiseState {
  const fuel = model.fuel;
  const cruiseRpm = Math.min(2500, limit * 0.7);
  const targetKw = 30;
  const variable = hasVariableValves(d) && !isRotary(d);
  const high = d.camSwitch === 'none' || cruiseRpm >= d.switchRpm;
  // The valve sets the load and the butterfly stays almost open: a little vacuum is kept for crankcase ventilation.
  const liftControlled = d.liftControl !== 'cam' && !fuel.diesel;
  // Off boost if it can manage that, and with the turbo's help if it needs it.
  let noBoost = true;
  const pointAt = (choice: CamChoice, active: number) => (x: number): RpmPoint => {
    const cam = variable ? camAt(d, liftControlled ? { ...choice, high, liftShare: x } : { ...choice, high }) : undefined;
    const op = fuel.diesel ? { throttle: 1, lambda: x, noBoost, cam, active } : { throttle: liftControlled ? 0.95 : x, lambda: 1, noBoost, cam, active };
    const p = model.at(cruiseRpm, op);
    p.intakeShift = choice.intakeShift ?? 0;
    p.exhaustShift = choice.exhaustShift ?? 0;
    p.highCam = high;
    return p;
  };
  const lo = fuel.diesel ? 1.2 : liftControlled ? 0.005 : 0.08;
  const hi = fuel.diesel ? 9 : 1;
  const solve = (choice: CamChoice, active: number, seed?: number): { point: RpmPoint; x: number } | null => {
    const at = pointAt(choice, active);
    const settings = new Map<RpmPoint, number>();
    const track = (v: number): RpmPoint => {
      const p = at(v);
      settings.set(p, v);
      return p;
    };
    const point = solvePower(track, lo, hi, targetKw, !fuel.diesel, seed);
    return point ? { point, x: settings.get(point)! } : null;
  };

  let found = solve({}, 1);
  if (!found && d.charger !== 'none') {
    noBoost = false;
    found = solve({}, 1);
  }
  const reachable = found !== null;
  let best = { choice: {} as CamChoice, active: 1, point: found ? found.point : pointAt({}, 1)(fuel.diesel ? lo : hi), x: found?.x ?? hi };
  const bsfcBetter = (a: RpmPoint, b: RpmPoint): boolean => a.bsfc < b.bsfc - 1e-9;
  if (reachable && variable && d.camPhaser !== 'none') {
    let seed = best.x;
    const choice = bestChoice(
      d,
      (c) => {
        const r = solve(c, 1, seed);
        if (r) seed = r.x;
        return r?.point ?? null;
      },
      bsfcBetter,
      high,
      { exhaust: 0 },
    );
    if (choice && bsfcBetter(choice.point, best.point)) best = { choice: { intakeShift: choice.intake, exhaustShift: choice.exhaust }, active: 1, point: choice.point, x: seed };
  }
  if (reachable && variable && d.deactivation !== 'none') {
    const half = 0.5;
    // Half the cylinders have to make it without opening the butterfly wide: otherwise all of them stay on.
    const room = pointAt(best.choice, half)(fuel.diesel ? lo : liftControlled ? 0.9 : 0.9);
    if (room.powerKw >= targetKw) {
      const r = solve(best.choice, half, fuel.diesel ? undefined : Math.min(0.9, best.x * 1.6));
      if (r && bsfcBetter(r.point, best.point)) best = { choice: best.choice, active: half, point: r.point, x: r.x };
    }
  }
  const p = best.point;
  const cam = variable ? camAt(d, liftControlled ? { ...best.choice, high, liftShare: best.x } : { ...best.choice, high }) : model.baseCam;
  return {
    fuelLh: p.fuelLh,
    bsfc: p.bsfc,
    efficiency: Number.isFinite(p.bsfc) ? brakeEfficiency(p.bsfc, fuel.lhv) : 0,
    reachable,
    intakeShift: best.choice.intakeShift ?? 0,
    exhaustShift: best.choice.exhaustShift ?? 0,
    activeCylinders: Math.round(d.cylinders * best.active),
    liftMm: cam.intakeLift,
    pumpingBar: p.pumpingBar,
    residual: p.residual,
  };
}

export { rodFailStress, rodStressAt };
