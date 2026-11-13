// Every catalogue engine on the dyno: `node scripts/dyno-table.ts`.
// Published and anchored peaks, the anchor factor, inertias, the absorber each gets, the turbo time constant and
// how much a 300 rpm/s sweep reads under the steady curve without the inertia correction.
// J_e per litre flags a flywheel that does not fit the engine: tests/torque-map.test.ts keeps it within 0.01-0.3.

import { ENGINES, engineById, engineFacts, pageChoices } from '../src/data/engines.ts';
import { displacementL } from '../src/designer/design.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { sizeAbsorber } from '../src/engine/dyno-load.ts';
import { HP_PER_KW, peakPower, peakTorque, spoolTime } from '../src/engine/torque-map.ts';
import { catalogueTorqueMap } from '../src/designer/torque-map.ts';

const RAD = Math.PI / 30;
const pad = (v: string | number, n: number): string => String(v).padStart(n);
console.log(`${'engine'.padEnd(36)} ${pad('hp pub', 7)} ${pad('hp', 6)} ${pad('Nm pub', 7)} ${pad('Nm', 6)} ${pad('k', 5)} ${pad('J_e', 6)} ${pad('J_e/l', 6)} ${pad('abs Nm', 7)} ${pad('abs kW', 7)} ${pad('J_abs', 6)} ${pad('n_s', 6)} ${pad('tau_s', 6)} ${pad('300/s', 6)}`);
const rows: Array<{ id: string; k: number; short: number }> = [];
for (const page of ENGINES) {
  for (const choice of pageChoices(page.id)) {
    const spec = engineById(choice.id)!;
    const facts = engineFacts(choice.id)!;
    const map = catalogueTorqueMap(spec);
    const absorber = sizeAbsorber(map, 'eddy');
    const torque = peakTorque(map);
    const hp = peakPower(map).kw * HP_PER_KW;
    // A sweep at 300 rpm/s reads low by J·ε at the torque peak.
    const short = (map.inertia * 300 * RAD) / torque.nm;
    const perLitre = map.inertia / displacementL(designFromSpec(spec));
    rows.push({ id: choice.id, k: map.anchor.scale, short });
    console.log(
      `${choice.id.padEnd(36)} ${pad(facts.powerHp, 7)} ${pad(hp.toFixed(0), 6)} ${pad(facts.torqueNm ?? '-', 7)} ${pad(torque.nm.toFixed(0), 6)} ${pad(map.anchor.scale.toFixed(2), 5)} ${pad(map.inertia.toFixed(3), 6)} ${pad(perLitre.toFixed(3), 6)} ${pad(absorber.ratedNm, 7)} ${pad(absorber.ratedKw, 7)} ${pad(absorber.inertia.toFixed(3), 6)} ${pad(map.boostKind === 'turbo' ? map.spoolRpm.toFixed(0) : '-', 6)} ${pad(map.boostKind === 'turbo' ? spoolTime(map, map.spoolRpm, true).toFixed(2) : '-', 6)} ${pad((short * 100).toFixed(1) + '%', 6)}`,
    );
  }
}
const ks = rows.map((r) => r.k).sort((a, b) => a - b);
console.log(`\n${rows.length} engines. Anchor factor ${ks[0]!.toFixed(2)}–${ks[ks.length - 1]!.toFixed(2)}.`);
console.log(`Sweep at 300 rpm/s reads over 2 % low on: ${rows.filter((r) => r.short > 0.02).map((r) => `${r.id} ${(r.short * 100).toFixed(1)}%`).join(', ') || 'none'}`);
