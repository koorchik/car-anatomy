// The absolute torque map a loaded crank runs on, built from the performance model. The dyno on a catalogue page,
// on a variant page and in the designer all take it from here.

import { engineFacts } from '../data/engines.ts';
import type { EngineSpec } from '../engine/spec.ts';
import type { EngineTorqueMap } from '../engine/torque-map.ts';
import { anchorFor, anchoredTorque, noAnchor } from './anchor.ts';
import { isTurbo, type Design, type PublishedFigures } from './design.ts';
import { FUELS } from './fuels.ts';
import { evaluate, type Performance, type RpmPoint } from './physics.ts';
import { designFromSpec } from './presets.ts';

/**
 * Turbo time constant on a loaded crank as a share of the designer's turbo lag, which is set for the free-revving
 * engine whose whole motion is slowed fourfold. Calibrated so that a small single turbo reaches 90 % of its boost at
 * 1500 rpm in about 1.5 s and near its full-boost speed in under a second, as Honda R&D measured (Technical Review,
 * October 2009, "Numerical Analysis of Turbocharger Response Delay Mechanism").
 */
export const K_SPOOL = 0.3;

const ATM_BAR = 1.013;

/** Value of an off-boost point series at a speed, linear between its points. */
const along = (points: RpmPoint[], of: (p: RpmPoint) => number, rpm: number): number => {
  if (rpm <= points[0]!.rpm) return of(points[0]!);
  for (let i = 1; i < points.length; i++) {
    const b = points[i]!;
    if (rpm <= b.rpm) {
      const a = points[i - 1]!;
      return of(a) + ((of(b) - of(a)) * (rpm - a.rpm)) / (b.rpm - a.rpm);
    }
  }
  return of(points[points.length - 1]!);
};

/**
 * @param published Figures to bring the curve to: what the catalogue article quotes. Leave null in the designer,
 *   which shows the model as it is.
 */
export function torqueMapFor(design: Design, perf: Performance = evaluate(design), published: PublishedFigures | null = null): EngineTorqueMap {
  const points = perf.points;
  const anchor = published ? anchorFor(points, published) : noAnchor(points);
  const rpm = points.map((p) => p.rpm);
  const turbo = isTurbo(design) && perf.offBoost.length > 1;
  const wotModel = points.map((p) => p.torqueNm);
  // Without its compressor a turbo engine also loses the turbine's back pressure, which can leave it a touch
  // stronger at low speed than with the turbo fitted. Full load never falls below what it does off boost.
  const baseModel = turbo ? rpm.map((n, i) => Math.min(along(perf.offBoost, (p) => p.torqueNm, n), wotModel[i]!)) : wotModel;
  const pressureRatio = points.map((p) => 1 + Math.max(0, p.boostBar) / ATM_BAR);

  let spoolRpm = design.rpmLimit;
  let flowShare = rpm.map(() => 1);
  if (turbo) {
    const top = Math.max(...points.map((p) => p.boostBar));
    spoolRpm = points.find((p) => p.boostBar >= 0.9 * top)?.rpm ?? design.rpmLimit;
    const flow = (n: number): number => along(perf.offBoost, (p) => p.fillRatio, n) * n;
    const reference = flow(spoolRpm);
    flowShare = rpm.map((n) => flow(n) / reference);
  }

  return {
    rpm,
    wotNm: wotModel.map((v, i) => anchoredTorque(anchor, rpm[i]!, v)),
    baseNm: baseModel.map((v, i) => anchoredTorque(anchor, rpm[i]!, v)),
    interceptNm: [...perf.motoring.interceptNm],
    atmosphereNm: perf.motoring.atmosphereNm,
    pressureRatio,
    topPressureRatio: Math.max(...pressureRatio),
    flowShare,
    idleRpm: perf.idleRpm,
    limitRpm: design.rpmLimit,
    inertia: perf.inertia,
    boostKind: turbo ? 'turbo' : design.charger === 'none' ? 'none' : 'mechanical',
    diesel: FUELS[design.fuel].diesel,
    spoolS: K_SPOOL * perf.boostLagS,
    spoolRpm,
    anchor: {
      scale: anchor.scale,
      clamped: anchor.clamped,
      published: published ? { ...published } : null,
      modelHp: anchor.modelHp,
      modelNm: anchor.modelNm,
    },
  };
}

const catalogueMaps = new Map<string, EngineTorqueMap>();

/** A catalogue engine or variant, its curve brought to the figures its article quotes. */
export function catalogueTorqueMap(spec: EngineSpec): EngineTorqueMap {
  const cached = catalogueMaps.get(spec.id);
  if (cached) return cached;
  const design = designFromSpec(spec);
  const facts = engineFacts(spec.id);
  const published = facts ? { powerHp: facts.powerHp, powerRpm: facts.powerRpm, torqueNm: facts.torqueNm, torqueRpm: facts.torqueRpm } : null;
  const map = torqueMapFor(design, evaluate(design), published);
  catalogueMaps.set(spec.id, map);
  return map;
}
