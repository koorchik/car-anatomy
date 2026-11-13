// Figures of the sump that need the engine's shape: how high the crank sits over the pan's floor and how big a dry
// sump's tank is. Builds a cheap engine from the design, without running the performance model.

import { buildEngine } from '../engine/kinematics.ts';
import { panShape, tankSize } from '../systems/sump.ts';
import { steadyImmersionMm } from '../lubrication/steady.ts';
import { isRotary, type Design } from './design.ts';
import { effectiveOilL, effectiveSump, sumpMassKg } from './lubrication.ts';
import { valveEvents } from './physics.ts';
import { designToSpec } from './to-spec.ts';

export interface LubricationFigures {
  /** Crank axis to the pan's lowest point, mm. NaN on a rotary. */
  crankHeightMm: number;
  oilL: number;
  /** Oil the pan of a full engine holds at rest, litres. */
  panOilL: number;
  /** A dry sump's tank, litres. Null otherwise. */
  tankL: number | null;
  massKg: number;
  /** Oil over the pickup's bell at the limiter on a level road, mm. Infinity on a dry sump or a rotary. */
  immersionMm: number;
}

const cache = new Map<string, LubricationFigures>();

export function lubricationFigures(d: Design): LubricationFigures {
  const key = JSON.stringify([d.layout, d.cylinders, d.bore, d.stroke, d.rodLength, d.veeAngle, d.narrowAngle, d.wAngle, d.rotorR, d.rotorE, d.rotorWidth, d.sump, d.oilL, d.throws, d.numbering, d.rpmLimit, d.charger, d.fuel, d.pistonJets, d.oilPump]);
  const hit = cache.get(key);
  if (hit) return hit;
  const oilL = effectiveOilL(d);
  let figures: LubricationFigures;
  if (isRotary(d)) {
    figures = { crankHeightMm: Number.NaN, oilL, panOilL: Number.NaN, tankL: null, massKg: sumpMassKg(d), immersionMm: Infinity };
  } else {
    const spec = designToSpec(d, { events: valveEvents(d), idleRpm: 800, redlineRpm: d.rpmLimit, revTimeS: 1, roughness: 0.3, torqueTable: [], boostLagS: 0, catches: true });
    const engine = buildEngine(spec);
    const shape = panShape(engine, spec.systems!);
    figures = {
      crankHeightMm: shape.crankHeightMm,
      oilL,
      panOilL: shape.panOilL,
      tankL: effectiveSump(d) === 'dry' ? tankSize(engine, oilL).litres : null,
      massKg: sumpMassKg(d),
      immersionMm: steadyImmersionMm(engine, spec.systems!),
    };
  }
  if (cache.size > 32) cache.clear();
  cache.set(key, figures);
  return figures;
}
