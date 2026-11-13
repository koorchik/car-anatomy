// The pickup on a level road at the limiter, once the oil in circulation has settled: the designer's check that an
// engine holds enough oil before it ever sees a corner.

import type { Engine } from '../engine/kinematics.ts';
import type { SystemsSpec } from '../engine/systems-spec.ts';
import { newOilState, oilParams, oilStep } from '../systems/oil.ts';
import { fixedOilL } from '../systems/oil-capacity.ts';
import { fourStrokeLitres } from '../systems/size.ts';
import { panShape } from '../systems/sump.ts';
import { HEAD_FLOW_SHARE, HEAD_TAU_S, headCapacityL, T_OIL_TRACK, WALL_TAU_S } from './constants.ts';
import { newLevelSolve, panGrid, solveLevel } from './pan.ts';

/** Surface over the top of the pickup's bell at the limiter on a level road, mm. Infinity on a dry sump. */
export function steadyImmersionMm(engine: Engine, systems: SystemsSpec): number {
  if (systems.sump === 'dry' || engine.isRotary) return Infinity;
  const shape = panShape(engine, systems);
  const litres = fourStrokeLitres(engine);
  const out = newOilState();
  oilStep(oilParams(engine, systems), { rpm: engine.spec.redlineRpm, tempC: T_OIL_TRACK, supply: 1, running: true, live: false }, out);
  const q = (out.mains + out.head + out.chain + out.turbo + out.jets) / 60;
  const heads = engine.banks.length > 1 ? 2 : 1;
  const inHeads = Math.min(heads * headCapacityL(litres, heads), HEAD_FLOW_SHARE * q * HEAD_TAU_S);
  const hung = inHeads + (1 - HEAD_FLOW_SHARE) * q * WALL_TAU_S;
  const pan = systems.oilL - fixedOilL(litres) - hung;
  const solve = newLevelSolve();
  solveLevel(panGrid(shape).all, Math.max(0, pan), 0, 0, shape.yFull, solve);
  const p = shape.pickup!;
  return (solve.h - (p.y + p.bell)) * 100;
}
