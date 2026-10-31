// Model against published figures: `node scripts/designer-table.ts`.
import { ENGINES } from '../src/data/engines.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { REAL_FIGURES } from '../tests/real-engines.ts';

console.log('id        hp real  model  ratio @rpm(real)   Nm real  model  ratio @rpm(real)  bsfc  L/h(cr) boost back EGT  VE   Z   ret');
let hp = 0;
let nm = 0;
const n = Object.keys(REAL_FIGURES).length;
for (const [id, real] of Object.entries(REAL_FIGURES)) {
  const p = evaluate(designFromSpec(ENGINES.find((e) => e.id === id)!));
  const a = p.peakPower;
  const t = p.peakTorque;
  hp += a.powerHp / real.hp;
  nm += t.torqueNm / real.nm;
  console.log(
    id.padEnd(9), String(real.hp).padStart(5), a.powerHp.toFixed(0).padStart(6), (a.powerHp / real.hp).toFixed(2).padStart(6),
    `${a.rpm.toFixed(0)}(${real.hpRpm})`.padStart(12), String(real.nm).padStart(7), t.torqueNm.toFixed(0).padStart(6), (t.torqueNm / real.nm).toFixed(2).padStart(6),
    `${t.rpm.toFixed(0)}(${real.nmRpm})`.padStart(12), p.bestBsfc.bsfc.toFixed(0).padStart(5), p.cruise.fuelLh.toFixed(1).padStart(6),
    a.boostBar.toFixed(2).padStart(6), a.backpressureBar.toFixed(2).padStart(5), a.egtC.toFixed(0).padStart(5), a.volumetricEfficiency.toFixed(2).padStart(5), a.machIndex.toFixed(2).padStart(5), Math.max(...p.points.map((x) => x.knockRetard)).toString().padStart(3),
  );
}
console.log('mean ratio power', (hp / n).toFixed(3), 'torque', (nm / n).toFixed(3));
