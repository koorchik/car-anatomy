// Ride of the macpherson page corner on rough roads and on the shaker: the damping sweep of the frequency-domain
// estimate, a time run on an ISO 8608 road against it, and the stepped sine against the analytic curves. Tables to
// stdout, curves as CSV in .tmp/suspension-ride/.
// node scripts/suspension-ride.ts [class=B] [speed=90] [seed=1] [seconds=60] [damper=comfort|worn|sport|track|0.3]
//                                 [unsprung=40]
// Speed in km/h, unsprung mass in kg.

import { mkdirSync, writeFileSync } from 'node:fs';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import { factorySetup, resolveCorner, type DamperPreset } from '../src/suspension/setup.ts';
import { QuarterSim } from '../src/suspension/quarter.ts';
import { Iso8608Road, RoadBuffer, type RoadClass } from '../src/suspension/road.ts';
import { comfortBands, RideMeter } from '../src/suspension/comfort.ts';
import {
  evaluateQuarter, lineariseQuarter, newQuarterGains, quarterGains, roughRoadEstimate,
} from '../src/suspension/evaluate.ts';
import { logFrequencies, SteppedSine } from '../src/suspension/shaker.ts';
import { tyreAt } from '../src/vehicle/tyre.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const num = (key: string, fallback: number): number => (args[key] !== undefined ? Number(args[key]) : fallback);
const roadClass = (args.class ?? 'B') as RoadClass;
const speed = num('speed', 90) / 3.6;
const seed = num('seed', 1);
const seconds = num('seconds', 60);
const damperArg = args.damper;
const corner = { ...jtektCorner(), unsprungKg: num('unsprung', 40) };
const factory = factorySetup(corner);
const damper = damperArg === undefined ? factory.damper : Number.isFinite(Number(damperArg)) ? Number(damperArg) : (damperArg as DamperPreset);
const rc = resolveCorner(corner, { ...factory, damper });
const dir = '.tmp/suspension-ride';
mkdirSync(dir, { recursive: true });
const road = { roadClass, speedMs: speed };
const fix = (v: number, d = 3): string => v.toFixed(d);

// The corner.
const ev = evaluateQuarter(rc);
console.log(`Corner: ${corner.sprungKg}/${corner.unsprungKg} kg, ζ ${fix(rc.zeta, 2)}, ride ${fix(rc.bodyHz, 2)} Hz`);
console.log(`Modes: body ${fix(ev.body.hz, 2)} Hz ζ ${fix(ev.body.zeta, 3)}, hop ${fix(ev.hop.hz, 2)} Hz ζ ${fix(ev.hop.zeta, 3)}`);
console.log(`Invariant points: ${fix(ev.invariant.bodyHz, 2)} Hz (body ${fix(ev.invariant.bodyGain)} of the road), ` +
  `${fix(ev.invariant.travelHz, 2)} Hz (travel ${fix(ev.invariant.travelGain)})`);
console.log(`Travel reserve on class C at 15 m/s: ${fix(ev.travelReserveM * 1000, 1)} mm\n`);

// Damping sweep in the frequency domain.
console.log(`Class ${roadClass} at ${fix(speed * 3.6, 0)} km/h, frequency domain`);
console.log('ζ      a_w (Wk)  a RMS   DLC     travel mm  grip %   air %');
const sweep = ['zeta,aw,acc_rms,dlc,travel_mm,grip,air'];
for (let zeta = 0.05; zeta <= 1.0001; zeta += 0.05) {
  const r = resolveCorner(corner, { ...factory, damper: zeta });
  const lin = lineariseQuarter(r);
  const e = roughRoadEstimate(lin, road, { patchM: r.tyre.patchM, tyre: tyreAt(corner.tyre, lin.staticN) });
  console.log(`${fix(zeta, 2)}   ${fix(e.comfortAw)}     ${fix(e.bodyAccRms)}   ${fix(e.dlc, 4)}  ${fix(e.travelRmsM * 1000, 2).padStart(6)}     ` +
    `${fix(e.availableGrip * 100, 2)}   ${fix(e.airShare * 100, 3)}`);
  sweep.push([zeta, e.comfortAw, e.bodyAccRms, e.dlc, e.travelRmsM * 1000, e.availableGrip, e.airShare].map((v) => +v.toFixed(6)).join(','));
}
writeFileSync(`${dir}/damping-sweep.csv`, sweep.join('\n') + '\n');

// The same road in time.
const lin = lineariseQuarter(rc);
const tyre = tyreAt(corner.tyre, lin.staticN);
const estimate = roughRoadEstimate(lin, road, { patchM: rc.tyre.patchM, tyre });
const sim = new QuarterSim(rc, new RoadBuffer(new Iso8608Road({ roadClass, seed }), rc.tyre.freeRadiusM, rc.tyre.patchM), speed);
sim.reset(0);
const meter = new RideMeter({ sampleHz: 1000, staticN: lin.staticN, tyre, staticTravelM: rc.staticTravelM, bumpStopTravelM: rc.bumpStop.travelM });
const trace = ['t_s,road_mm,travel_mm,body_acc,tyre_n'];
const t0 = performance.now();
for (let i = 0; i < (seconds + 2) * 1000; i++) {
  sim.step();
  if (i < 2000) continue;
  meter.push(sim.out);
  if (i % 10 === 0) {
    const o = sim.out;
    trace.push([o.t, o.roadZ * 1000, (o.travel - rc.staticTravelM) * 1000, o.bodyAcc, o.tyreN].map((v) => +v.toFixed(4)).join(','));
  }
}
const ms = performance.now() - t0;
writeFileSync(`${dir}/time.csv`, trace.join('\n') + '\n');
const r = meter.result();
console.log(`\nζ ${fix(rc.zeta, 2)}, seed ${seed}, ${seconds} s in time (${fix(ms, 0)} ms) against the estimate:`);
console.log(`  a_w (Wk)   ${fix(r.comfortAw)} / ${fix(estimate.comfortAw)} m/s², last 10 s ${fix(r.comfortAwWindow)}, bands ${comfortBands(r.comfortAw).join(', ')}`);
console.log(`  a RMS      ${fix(r.bodyAccRms)} / ${fix(estimate.bodyAccRms)} m/s²`);
console.log(`  DLC        ${fix(r.load.dlc, 4)} / ${fix(estimate.dlc, 4)}`);
console.log(`  travel     ${fix(r.travelRmsM * 1000, 2)} / ${fix(estimate.travelRmsM * 1000, 2)} mm RMS, ` +
  `${fix(r.travelMaxM * 1000, 1)} mm deepest, ${fix(r.bumpStopMarginM * 1000, 1)} mm left to the stop`);
console.log(`  grip       ${fix(r.load.availableGrip * 100, 2)} / ${fix(estimate.availableGrip * 100, 2)} %, ` +
  `off the road ${fix(r.load.airShare * 100, 3)} / ${fix(estimate.airShare * 100, 3)} %, lowest load ${fix(r.load.minN, 0)} N`);

// The shaker.
const sine = new SteppedSine(rc, { freqsHz: logFrequencies(0.5, 25, 30), velocityMs: 0.02 });
const points = sine.run();
const g = newQuarterGains();
const shaker = ['hz,body_acc_sim,body_acc_lin,tyre_sim,tyre_lin,travel_sim,travel_lin,left_post'];
let worst = 0;
for (const p of points) {
  quarterGains(lin, p.hz, g);
  worst = Math.max(worst, Math.abs(p.bodyAcc / g.bodyAcc - 1), Math.abs(p.tyreForce / g.tyreForce - 1), Math.abs(p.travel / g.travel - 1));
  shaker.push([p.hz, p.bodyAcc, g.bodyAcc, p.tyreForce, g.tyreForce, p.travel, g.travel, p.leftPost ? 1 : 0].map((v) => +v.toFixed(5)).join(','));
}
writeFileSync(`${dir}/shaker.csv`, shaker.join('\n') + '\n');
console.log(`\nShaker, 30 points at 0.02 m/s: worst ${fix(worst * 100, 2)} % from the linear curves (CSV in ${dir}/)`);
