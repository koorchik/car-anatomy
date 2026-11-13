// The oil-on-track model for the cars of the sump page: every sump kind, tyre and oil level on the same lap.
// node scripts/sump-table.ts [engine id...]   Calibration targets: docs/lubrication-model.md.

import { engineById, engineFacts } from '../src/data/engines.ts';
import { SUMP_CARS } from '../src/data/sump-cars.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { systemsOf, SUMP_KINDS } from '../src/engine/systems-spec.ts';
import { lapFor, oilRun } from '../src/lubrication/scenario.ts';
import { TYRE_IDS } from '../src/vehicle/vehicle.ts';

const wanted = process.argv.slice(2);
const cars = wanted.length ? SUMP_CARS.filter((c) => wanted.includes(c.engineId)) : SUMP_CARS;
const pad = (s: string | number, n: number): string => String(s).padStart(n);
for (const car of cars) {
  const spec = engineById(car.engineId)!;
  const engine = buildEngine(spec);
  const systems = systemsOf(spec);
  const design = designFromSpec(spec);
  const facts = engineFacts(car.engineId);
  console.log(`\n${car.vehicle.name} (${car.engineId}), factory sump ${systems.sump}, ${systems.oilL} L`);
  console.log('sump            tyres   oil   lap s   min bar  below s  longest  wear %/lap  band');
  for (const tyre of TYRE_IDS) {
    const t0 = performance.now();
    const lap = lapFor(design, facts?.powerHp ?? null, car.vehicle, tyre);
    const lapMs = performance.now() - t0;
    for (const kind of SUMP_KINDS) {
      for (const delta of [0, -1, -2]) {
        const t1 = performance.now();
        const run = oilRun(engine, systems, car.vehicle, lap, { kind, oilDeltaL: delta, accumulator: false, place: car.well });
        const ms = performance.now() - t1;
        const s = run.summary;
        console.log(`${kind.padEnd(15)} ${tyre.padEnd(6)} ${pad(delta, 4)}  ${pad(lap.lapTime.toFixed(1), 6)}  ${pad(s.minPressure.toFixed(2), 7)}  ${pad(s.belowNeedS.toFixed(2), 7)}  ${pad(s.longestDipS.toFixed(2), 7)}  ${pad((s.wearPerLap * 100).toFixed(2), 10)}  ${s.band}   (${ms.toFixed(0)} ms, lap ${lapMs.toFixed(0)} ms)`);
      }
    }
  }
}
