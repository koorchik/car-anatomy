// Kinematic curves of the macpherson page corner and its quarter car over a bump, as CSV in .tmp/suspension-sweep/.
// node scripts/suspension-sweep.ts [speed=30] [bump=50] [length=0.5] [spring=25] [damper=comfort|worn|sport|track|0.3]
//                                  [ride=0] [camber=0] [toe=0] [pressure=2.3]
// Speed in km/h, bump height in mm, length in m, spring in N/mm, ride height in mm, angles in degrees, pressure in bar.

import { mkdirSync, writeFileSync } from 'node:fs';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import { factorySetup, resolveCorner, type CornerSetup, type DamperPreset } from '../src/suspension/setup.ts';
import { newCornerSample } from '../src/suspension/kinematics.ts';
import { QuarterSim } from '../src/suspension/quarter.ts';
import { EventRoad, RoadBuffer } from '../src/suspension/road.ts';
import { G } from '../src/suspension/forces.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const num = (key: string, fallback: number): number => (args[key] !== undefined ? Number(args[key]) : fallback);
const corner = jtektCorner();
const factory = factorySetup(corner);
const damperArg = args.damper;
const setup: CornerSetup = {
  springNmm: num('spring', factory.springNmm),
  damper: damperArg === undefined ? factory.damper : Number.isFinite(Number(damperArg)) ? Number(damperArg) : (damperArg as DamperPreset),
  rideHeightM: num('ride', 0) / 1000,
  camberDeg: num('camber', factory.camberDeg),
  toeDeg: num('toe', factory.toeDeg),
  pressureBar: num('pressure', factory.pressureBar),
};
const rc = resolveCorner(corner, setup);
const DEG = 180 / Math.PI;
const dir = '.tmp/suspension-sweep';
mkdirSync(dir, { recursive: true });

// Kinematic curves over the whole travel.
const s = newCornerSample();
const rows = ['travel_mm,camber_deg,toe_deg,contact_y_mm,wheel_x_mm,strut_mm,spring_mm,mr_spring,tan_beta,roll_centre_mm,kpi_deg,caster_deg,scrub_mm,trail_mm,plunge_mm,cv_inner_deg,cv_outer_deg'];
const travel = corner.axle.travel;
for (let z = -travel.droopM; z <= travel.bumpM + 1e-9; z += 0.002) {
  rc.axle.sample('left', z, 0, s);
  rows.push([
    z * 1000, s.camber * DEG, s.toe * DEG, s.contactY * 1000, s.wheelX * 1000, s.damperLen * 1000, s.springLen * 1000, s.mrSpring,
    s.tanBeta, s.contactY * s.tanBeta * 1000, s.kpi * DEG, s.caster * DEG, s.scrub * 1000, s.trail * 1000, s.plunge * 1000,
    s.cvInner * DEG, s.cvOuter * DEG,
  ].map((v) => +v.toFixed(5)).join(','));
}
writeFileSync(`${dir}/kinematics.csv`, rows.join('\n') + '\n');

// Quarter car over the bump.
const speed = num('speed', 30) / 3.6;
const bumpM = num('bump', 50) / 1000;
const lengthM = num('length', 0.5);
const at = 3;
const road = new RoadBuffer(new EventRoad([{ kind: 'bump', atM: at, lengthM, heightM: bumpM }]), rc.tyre.freeRadiusM, rc.tyre.patchM);
const sim = new QuarterSim(rc, road, speed);
sim.reset(0);
const staticN = (corner.sprungKg + corner.unsprungKg) * G;
const out = ['t_s,x_m,road_mm,body_mm,wheel_mm,travel_mm,tyre_n,spring_n,damper_n,stop_n,body_g'];
let peakAcc = 0;
let minTyre = Infinity;
let maxTyre = 0;
let maxTravel = -Infinity;
let air = 0;
let settled = 0;
const seconds = (at + lengthM) / speed + 2.5;
for (let i = 0; i < Math.round(seconds / 0.001); i++) {
  sim.step();
  const o = sim.out;
  peakAcc = Math.max(peakAcc, Math.abs(o.bodyAcc));
  minTyre = Math.min(minTyre, o.tyreN);
  maxTyre = Math.max(maxTyre, o.tyreN);
  maxTravel = Math.max(maxTravel, o.travel);
  if (o.inAir) air += 0.001;
  if (Math.abs(o.bodyZ - rc.bodyStaticM) > 0.001) settled = o.t;
  out.push([o.t, o.x, o.roadZ * 1000, o.bodyZ * 1000, o.wheelZ * 1000, o.travel * 1000, o.tyreN, o.springN, o.damperN, o.stopN, o.bodyAcc / G].map((v) => +v.toFixed(4)).join(','));
}
writeFileSync(`${dir}/bump.csv`, out.join('\n') + '\n');

const leave = (at + lengthM) / speed;
const toStop = (rc.atRest.damperLen - rc.bumpStop.contactM) / rc.atRest.mrDamper;
console.log(`setup: spring ${setup.springNmm} N/mm, damper ${setup.damper} (ζ ${rc.zeta.toFixed(2)}), ride ${(setup.rideHeightM * 1000).toFixed(0)} mm, camber ${setup.camberDeg}°, toe ${setup.toeDeg}°, ${setup.pressureBar} bar`);
console.log(`corner: top shift ${(rc.topShiftM * 1000).toFixed(2)} mm, tie rod ${(rc.tieRodM * 1000).toFixed(2)} mm, perch ${(rc.spring.perchM * 1000).toFixed(1)} mm, wheel rate ${(rc.wheelRate / 1000).toFixed(1)} kN/m, body ${rc.bodyHz.toFixed(2)} Hz, hop ${rc.hopHz.toFixed(1)} Hz, tyre ${(rc.tyre.kt / 1000).toFixed(0)} kN/m, patch ${(rc.tyre.patchM * 1000).toFixed(0)} mm`);
console.log(`at rest: roll centre ${(rc.atRest.contactY * rc.atRest.tanBeta * 1000).toFixed(0)} mm, camber gain ${((rc.axle.value('camber', rc.staticTravelM + 0.001) - rc.axle.value('camber', rc.staticTravelM - 0.001)) / 0.002 * DEG).toFixed(1)}°/m, ${(toStop * 1000).toFixed(0)} mm to the bump stop`);
console.log(`bump ${(bumpM * 1000).toFixed(0)} mm × ${lengthM} m at ${(speed * 3.6).toFixed(0)} km/h: body up to ${(peakAcc / G).toFixed(2)} g, tyre ${(minTyre / staticN).toFixed(2)}–${(maxTyre / staticN).toFixed(2)} of static, in the air ${(air * 1000).toFixed(0)} ms, travel up to ${((maxTravel - rc.staticTravelM) * 1000).toFixed(0)} mm of ${(toStop * 1000).toFixed(0)}, settled ${Math.max(0, settled - leave).toFixed(2)} s after the bump`);
console.log(`wrote ${dir}/kinematics.csv and ${dir}/bump.csv`);
