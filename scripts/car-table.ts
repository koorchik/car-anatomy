// The car builder's model (stage C4): `node scripts/car-table.ts [preset id...]` (every donor and odd preset without
// an id). For each donor as made, the model against the maker's figures within the bounds of tests/car-build
// (src/car-designer/published.ts); for every build, what the sections' models give (mass and its split, the engine's
// fit in the bay, 0–100 km/h, 80–120 km/h, v_max, the lap, braking and skidpad, cruise fuel) and its diagnoses. Ends
// with the slices of two "what this changes" passes on the Civic, against the plan's 50 ms.

import { factoryBuild } from '../src/car-designer/build.ts';
import { diagnoseBuild } from '../src/car-designer/diagnostics.ts';
import { evaluateBuild, oilAndWear, type CarPerformance } from '../src/car-designer/evaluate.ts';
import { factoryPresets, oddPresets, type BuildPreset } from '../src/car-designer/presets.ts';
import { publishedRows } from '../src/car-designer/published.ts';
import { sensitivityPass } from '../src/car-designer/sensitivity.ts';

const asked = process.argv.slice(2);
const presets: Array<BuildPreset & { odd: boolean }> = [
  ...factoryPresets().map((p) => ({ ...p, odd: false })),
  ...oddPresets().map((p) => ({ ...p, odd: true })),
].filter((p) => !asked.length || asked.includes(p.id));

const f = (v: number | null, digits = 1): string => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits));
const pct = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} %`;

function figures(p: CarPerformance): void {
  const c = p.chassis;
  const over = Object.entries(p.fit.overMm).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v} mm`);
  console.log(`  engine ${p.engine.name}: ${f(p.engine.peakKw * 1.35962, 0)} hp at ${f(p.engine.peakKwRpm, 0)} rpm, ${f(p.engine.peakNm, 0)} N·m; ${f(p.engine.massKg, 0)} kg (the donor's ${f(p.engine.donorMassKg, 0)} kg)`);
  console.log(`  gearbox (${p.gearboxKind}): ${p.gearbox.gears.length} speeds, final ${f(p.gearbox.finalDrive, 2)}, ${f(p.gearboxMassKg, 0)} kg; verdict ${p.gearboxReliability.verdict}, clutch margin ${f(p.gearbox.clutch.margin, 2)}`);
  console.log(`  mass ${f(p.massKg, 0)} kg with the driver (${p.massDeltaKg >= 0 ? '+' : ''}${f(p.massDeltaKg, 0)}), ${f(p.frontShare * 100)} % on the front axle, centre of mass ${f(p.cgHeightM * 1000, 0)} mm (${p.cgShiftMm >= 0 ? '+' : ''}${p.cgShiftMm}), crank ${p.fit.crankDropMm} mm lower`);
  console.log(`  bay: ${p.fit.fits ? 'fits' : `sticks out: ${over.join(', ')}`}; lowest point ${p.fit.clearanceMm} mm over the ground clearance`);
  console.log(`  0–100 ${f(p.zeroTo100S, 2)} s, 0–400 m ${f(p.zeroTo400mS, 2)} s, 80–120 in ${p.elasticGear} ${f(p.eightyTo120S, 2)} s, v_max ${f(p.vmaxKmh)} km/h in ${p.vmaxGear}${p.vmaxAtLimiter ? ' (limiter)' : ''}, first-gear wheelspin to ${f(p.spinKmh, 0)} km/h`);
  console.log(`  lap ${f(p.lapTimeS, 2)} s (${p.lapLevel}); cruise ${f(p.fuel90)} / ${f(p.fuel120)} l/100 km at 90 / 120 km/h`);
  console.log(c ? `  chassis: 100–0 in ${f(c.brakingM)} m, skidpad ${f(c.skidpadAcc / 9.80665, 2)} g, understeer ${f((c.understeerPerG * 180) / Math.PI, 2)} °/g, ride ${f(c.axles[0].rideHz, 2)} / ${f(c.axles[1].rideHz, 2)} Hz` : '  chassis: no model of this suspension yet');
}

for (const preset of presets) {
  const t0 = performance.now();
  const p = evaluateBuild(preset.build);
  const ms = performance.now() - t0;
  console.log(`\n${preset.odd ? 'Odd preset' : 'Donor'}: ${preset.name} (${preset.id}), ${ms.toFixed(0)} ms`);
  if (!preset.odd) {
    for (const r of publishedRows(p)) {
      const unit = r.figure === 'vmax' ? 'km/h' : 's';
      console.log(`  ${r.figure}: model ${f(r.model, r.figure === 'vmax' ? 1 : 2)} ${unit}, published ${r.published} ${unit}: ${pct(r.error)} (bound ±${(r.bound * 100).toFixed(0)} %) ${r.ok ? 'ok' : 'OUT'}`);
      if (r.note) console.log(`    exception: ${r.note}`);
    }
  }
  figures(p);
  const ow = oilAndWear(p);
  console.log(`  oil on the lap: ${ow.oil ? `${ow.oil.band}, lowest ${f(ow.oil.minPressure, 2)} bar, ${f(ow.oil.starvedS, 2)} s starved` : 'not modelled'}; engine wear ${f(ow.wearPerLap * 100, 3)} % of its life per lap`);
  const diagnoses = diagnoseBuild(p);
  if (!diagnoses.length) console.log('  diagnoses: none');
  for (const d of diagnoses) console.log(`  [${d.severity}] ${d.title}: ${d.text}`);
}

// "What this changes" on the Civic, slice by slice: the first pass meets models not run yet (a new engine, chassis or
// gearbox compiles and fills its caches), the second is what a page sees from then on.
const civic = factoryBuild('civic-type-r-fk8');
evaluateBuild(civic);
for (const label of ['first', 'second']) {
  const pass = sensitivityPass(civic);
  let longest = 0;
  let total = 0;
  let slices = 0;
  for (;;) {
    const t0 = performance.now();
    const r = pass.next();
    const ms = performance.now() - t0;
    longest = Math.max(longest, ms);
    total += ms;
    slices++;
    if (r.done) break;
  }
  console.log(`${label === 'first' ? '\n' : ''}"What this changes" on the Civic, ${label} pass: ${slices} slices, the longest ${longest.toFixed(1)} ms (plan: 50 ms), ${total.toFixed(0)} ms in all`);
}
