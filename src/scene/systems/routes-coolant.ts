// Where the coolant goes: pump, the jacket along both sides of the cylinders, up through the gasket into the head,
// along the hot exhaust side to the thermostat, then the radiator or the bypass back to the pump. Radiator and heater
// are off the model: their hoses end in open stubs. An air-cooled engine gets fins, a fan and the air through them.

import * as THREE from 'three';
import { DEG, type Engine } from '../../engine/kinematics.ts';
import type { SystemsSpec } from '../../engine/systems-spec.ts';
import type { SumpLayout } from '../../systems/sump.ts';
import { housingPoint } from '../rotary-engine.ts';
import type { PistonAnchors, RotaryAnchors } from './anchors.ts';
import { oilPlan } from './routes-oil.ts';
import { addRoute, bankPoint, emptyPlan, type LayerPlan } from './route.ts';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Jacket ribbon radius and its place between liner and wall, in bores. */
export const JACKET = { radius: 0.02, inset: 0.045 };

/** Height of the block jacket in a bank's frame: between the crankcase and the deck. */
export const jacketY = (a: PistonAnchors): number => a.deck - 0.35 * (a.deck - a.crankcaseR);

const isFlat = (a: PistonAnchors): boolean => a.banks.length === 2 && Math.abs(a.banks[0]!.alpha - a.banks[1]!.alpha) > 150;

export function coolantPlan(engine: Engine, systems: SystemsSpec, a: PistonAnchors, sump: SumpLayout): LayerPlan {
  return systems.cooling === 'liquid' ? liquidPlan(engine, systems, a, sump) : airPlan(engine, systems, a);
}

function liquidPlan(engine: Engine, systems: SystemsSpec, a: PistonAnchors, sump: SumpLayout): LayerPlan {
  const plan = emptyPlan();
  const b = a.bore;
  const hh = a.headHeight;
  const flat = isFlat(a);
  const vee = a.banks.length === 2 && !flat;
  const yj = jacketY(a);
  const hose = 0.075 * b;
  const line = 0.03 * b;
  // Pump at the front, clear of the timing cover and the crank pulley, on the side away from the alternator.
  const pumpSide = -Math.sign(a.alternator.x || 1);
  const zPump = a.front + 0.3 * b;
  const pumpY = Math.max(0.5 * a.crankcaseR, a.pulley.r + 0.32 * b);
  const pump = a.banks.length === 1 ? v(pumpSide * (a.crankcaseR + 0.05 * b), Math.max(0.45 * a.crankcaseR, 0.1 * b), a.front + 0.12 * b) : v(0, pumpY, zPump);
  plan.parts.push({ part: 'water-pump', shape: 'cylinder', position: pump.clone(), axis: v(0, 0, 1), radius: 0.26 * b, length: 0.14 * b, material: 'metal' });
  plan.parts.push({ part: 'water-pump', shape: 'disc', position: pump.clone().add(v(0, 0, 0.09 * b)), axis: v(0, 0, 1), radius: 0.16 * b, length: 0.03 * b, material: 'tint' });
  const pumpIn = pump.clone().add(v(0, -0.2 * b, 0.05 * b));

  // Jacket: a thin ribbon each side of the cylinders, between liners and the block wall.
  const exitPoints: THREE.Vector3[] = [];
  a.banks.forEach((bank, bi) => {
    const cyls = a.cylinders.filter((c) => c.bank === bi).map((c) => c.z).sort((p, q) => p - q);
    const zf = cyls[cyls.length - 1]! + 0.45 * b;
    const zr = cyls[0]! - 0.45 * b;
    const x = bank.halfWidth - JACKET.inset * b;
    for (const s of [-1, 1]) {
      const front = bankPoint(bank.alpha, s * x, yj, zf);
      addRoute(plan, { part: 'water-pump', channel: 'pump', points: [pump.clone().add(v(0, 0, -0.08 * b)), front.clone().setZ(pump.z - 0.1 * b), front], radius: line });
      addRoute(plan, { part: 'water-jacket', channel: 'jacket', points: [front, bankPoint(bank.alpha, s * x, yj, zr)], radius: JACKET.radius * b });
      // Up through the gasket between the cylinders and at the rear end.
      const gaps = [zr, ...cyls.slice(1).map((z, i) => (z + cyls[i]!) / 2)];
      for (const z of gaps) {
        addRoute(plan, { part: 'water-jacket', channel: 'transfer', points: [bankPoint(bank.alpha, s * x, yj, z), bankPoint(bank.alpha, s * (bank.halfWidth - 0.1 * b), a.deck + 0.12 * hh, z)], radius: JACKET.radius * b * 0.8 });
      }
      // Along the head from the rear to the front; the exhaust side runs hotter and is the larger passage.
      const hot = s === bank.exhaustSide;
      const exit = bankPoint(bank.alpha, s * (bank.halfWidth - 0.1 * b), a.deck + 0.15 * hh, zf + 0.15 * b);
      addRoute(plan, { part: 'water-jacket', channel: 'head', points: [bankPoint(bank.alpha, s * (bank.halfWidth - 0.1 * b), a.deck + 0.15 * hh, zr), exit], radius: JACKET.radius * b * (hot ? 1.3 : 1) });
      exitPoints.push(exit);
    }
  });

  // Thermostat housing where the heads' outlets meet: on the intake side of an inline, at the front of a V's valley,
  // on a bridge over the front of a boxer.
  let stat: THREE.Vector3;
  if (vee) {
    const tops = a.banks.map((bank) => bankPoint(bank.alpha, -bank.exhaustSide * (bank.halfWidth - 0.1 * b), a.deck + 0.5 * hh, bank.zMax + 0.2 * b));
    stat = tops[0]!.clone().lerp(tops[1]!, 0.5);
  } else if (flat) {
    stat = v(0, a.crankcaseR + 0.45 * b, Math.max(...a.banks.map((x) => x.zMax)) + 0.2 * b);
  } else {
    const bank = a.banks[0]!;
    stat = bankPoint(bank.alpha, -bank.exhaustSide * (bank.halfWidth + 0.12 * b), a.deck + 0.5 * hh, bank.zMax + 0.2 * b);
  }
  plan.parts.push({ part: 'thermostat', shape: 'cylinder', position: stat.clone(), axis: v(0, 1, 0), radius: 0.17 * b, length: 0.2 * b, material: 'metal' });
  plan.movers = [{ part: 'thermostat', position: stat.clone().add(v(0, -0.04 * b, 0)), axis: v(0, 1, 0), radius: 0.11 * b, travel: 0.09 * b, channel: 'radiator' }];
  for (const exit of exitPoints) addRoute(plan, { part: 'water-jacket', channel: 'outlet', points: [exit, exit.clone().lerp(stat, 0.5).setY(Math.max(exit.y, stat.y)), stat.clone()], radius: line });

  // Radiator hoses leave the model as stubs; the bypass goes straight back to the pump.
  const ahead = Math.max(stat.z, a.pulley.z) + 1.3 * b;
  addRoute(plan, { part: 'radiator-hose', channel: 'radiator', points: [stat.clone().add(v(0, 0.08 * b, 0)), stat.clone().add(v(0, 0.18 * b, 0.3 * b)), v(stat.x, stat.y + 0.18 * b, ahead)], radius: hose });
  const lowAhead = v(pumpIn.x, pumpIn.y - 0.35 * b, a.pulley.z + 1.2 * b);
  addRoute(plan, { part: 'radiator-hose', channel: 'radiator', points: [lowAhead, v(pumpIn.x, pumpIn.y - 0.35 * b, pumpIn.z + 0.2 * b), pumpIn.clone()], radius: hose });
  for (const end of [v(stat.x, stat.y + 0.18 * b, ahead), lowAhead]) plan.parts.push({ part: 'radiator-hose', shape: 'ring', position: end, axis: v(0, 0, 1), radius: hose * 1.35, inner: hose * 0.8, length: 0.05 * b, material: 'rubber' });
  addRoute(plan, { part: 'coolant-bypass', channel: 'bypass', points: [stat.clone().add(v(0, -0.1 * b, 0)), stat.clone().lerp(pumpIn, 0.5).add(v(0, 0.1 * b, 0.1 * b)), pumpIn.clone().add(v(0, 0.08 * b, 0))], radius: line * 1.3 });

  // Heater: fed from the rear of the first head, back past the flywheel; its return comes to the pump.
  const bank0 = a.banks[0]!;
  const heaterOut = bankPoint(bank0.alpha, -bank0.exhaustSide * (bank0.halfWidth - 0.1 * b), a.deck + 0.4 * hh, bank0.zMin - 0.05 * b);
  const heaterEnd = heaterOut.clone().add(v(0, 0.1 * b, -1.0 * b));
  addRoute(plan, { part: 'heater-hose', channel: 'heater', points: [heaterOut, heaterOut.clone().add(v(0, 0.1 * b, -0.3 * b)), heaterEnd], radius: line * 1.3 });
  const heaterBack = v(pumpIn.x + 0.25 * b * Math.sign(pumpIn.x || 1), pumpIn.y, a.rear - 0.8 * b);
  addRoute(plan, { part: 'heater-hose', channel: 'heater', points: [heaterBack, v(heaterBack.x, pumpIn.y, pumpIn.z - 0.3 * b), pumpIn.clone()], radius: line * 1.3, reverse: false });
  for (const end of [heaterEnd, heaterBack]) plan.parts.push({ part: 'heater-hose', shape: 'ring', position: end, axis: v(0, 0, 1), radius: line * 2.2, inner: line * 1.2, length: 0.04 * b, material: 'rubber' });

  // A petrol turbo's bearing housing is water-cooled: in from the exhaust-side jacket, out to the thermostat.
  if (engine.spec.fuel !== 'diesel') {
    for (const t of a.turbos) {
      t.unit.updateMatrix();
      const cin = t.coolantIn.clone().applyMatrix4(t.unit.matrix);
      const cout = t.coolantOut.clone().applyMatrix4(t.unit.matrix);
      // The jacket on the side the turbo hangs on.
      const bk = a.banks.find((x) => Math.sign(bankPoint(x.alpha, x.exhaustSide, 0, 0).x) === t.sign) ?? a.banks[0]!;
      const from = bankPoint(bk.alpha, bk.exhaustSide * (bk.halfWidth - JACKET.inset * b), yj, Math.min(Math.max(cin.z, bk.zMin), bk.zMax));
      addRoute(plan, { part: 'turbo-coolant', channel: 'turbo-coolant', points: [from, from.clone().lerp(cin, 0.5).add(v(0, -0.1 * b, 0)), cin], radius: line * 0.7 });
      addRoute(plan, { part: 'turbo-coolant', channel: 'turbo-coolant', points: [cout, cout.clone().add(v(0, 0.35 * b, 0)), v(stat.x, cout.y + 0.35 * b, stat.z), stat.clone()], radius: line * 0.7 });
    }
  }

  // Oil-to-coolant heat exchanger: two short lines from the jacket.
  if (systems.oilCooler === 'coolant') {
    const pack = oilPlan(engine, systems, a, sump).parts.find((p) => p.part === 'oil-cooler');
    if (pack) {
      const bank = a.banks[0]!;
      const side = Math.sign(pack.position.x) || -1;
      const j = bankPoint(bank.alpha, side * (bank.halfWidth - JACKET.inset * b), yj, pack.position.z);
      addRoute(plan, { part: 'oil-cooler', channel: 'oil-cooler', points: [j, pack.position.clone().add(v(0, 0.1 * b, 0.06 * b))], radius: line * 0.8 });
      addRoute(plan, { part: 'oil-cooler', channel: 'oil-cooler', points: [pack.position.clone().add(v(0, 0.1 * b, -0.06 * b)), j.clone().add(v(0, 0, -0.15 * b))], radius: line * 0.8 });
    }
  }
  return plan;
}

/** Fins on cylinders and heads, a fan on the crank nose (or nothing on a motorcycle), and the air through the fins. */
function airPlan(_engine: Engine, systems: SystemsSpec, a: PistonAnchors): LayerPlan {
  const plan = emptyPlan();
  const b = a.bore;
  const finR = a.linerR + 0.14 * b;
  for (const c of a.cylinders) {
    const axis = v(Math.sin(c.alpha * DEG), Math.cos(c.alpha * DEG), 0);
    const top = a.deck - 0.04 * b;
    const span = (a.deck - a.linerBottom) * 0.7;
    for (let k = 0; k < 8; k++) {
      const h = top - (k / 7) * span;
      plan.parts.push({ part: 'cooling-fins', shape: 'ring', position: axis.clone().multiplyScalar(h).setZ(c.z), axis, radius: finR, inner: a.linerR, length: 0.018 * b, material: 'metal' });
    }
  }
  a.banks.forEach((bank) => {
    for (let k = 0; k < 4; k++) {
      const y = a.deck + a.headHeight * (0.15 + 0.22 * k);
      const centre = bankPoint(bank.alpha, 0, y, (bank.zMin + bank.zMax) / 2);
      const across = v(Math.cos(bank.alpha * DEG), -Math.sin(bank.alpha * DEG), 0);
      plan.parts.push({ part: 'cooling-fins', shape: 'box', position: centre, axis: across, half: v(0.012 * b, (bank.zMax - bank.zMin) / 2, bank.halfWidth + 0.14 * b), material: 'metal' });
    }
  });
  const fan = systems.cooling === 'fan';
  const zFan = a.pulley.z + 0.28 * b;
  if (fan) {
    plan.parts.push({ part: 'cooling-fan', shape: 'disc', position: v(0, 0, zFan), axis: v(0, 0, 1), radius: 0.22 * b, length: 0.06 * b, material: 'dark', space: 'crank' });
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const dir = v(Math.sin(ang), Math.cos(ang), 0);
      plan.parts.push({ part: 'cooling-fan', shape: 'box', position: dir.clone().multiplyScalar(0.48 * b).setZ(zFan), axis: dir.clone().applyAxisAngle(v(0, 0, 1), Math.PI / 2).add(v(0, 0, 0.5)).normalize(), half: v(0.13 * b, 0.008 * b, 0.26 * b), material: 'dark', space: 'crank' });
    }
  }
  // The air: from the fan, or from ahead of a motorcycle, back across each cylinder's fins.
  const start = fan ? zFan : a.front + 0.9 * b;
  for (const c of a.cylinders) {
    const axis = v(Math.sin(c.alpha * DEG), Math.cos(c.alpha * DEG), 0);
    const side = v(axis.y, -axis.x, 0);
    for (const s of [-1, 1]) {
      const mid = axis.clone().multiplyScalar(a.deck - 0.25 * b).addScaledVector(side, s * (finR + 0.04 * b));
      addRoute(plan, { part: 'cooling-fins', channel: 'cooling-air', points: [v(mid.x * 0.5, mid.y * 0.5, start), v(mid.x, mid.y, c.z + 0.6 * b), v(mid.x, mid.y, c.z - 0.6 * b)], radius: 0.012 * b });
    }
  }
  if (systems.oilCooler === 'air') {
    plan.parts.push({ part: 'oil-cooler', shape: 'box', position: v(0, a.crankcaseR + 0.3 * b, a.front + 0.05 * b), half: v(0.3 * b, 0.18 * b, 0.05 * b), material: 'mesh' });
  }
  return plan;
}

/** A rotary: coolant round each trochoid in the housing wall, joined across the sections. */
export function rotaryCoolantPlan(_engine: Engine, _systems: SystemsSpec, a: RotaryAnchors): LayerPlan {
  const plan = emptyPlan();
  const R = a.R;
  const b = R * 0.9;
  const line = 0.03 * b;
  const zFront = a.rotorZ[0]! + a.width / 2 + 0.1;
  const pump = v(0, 0.75 * R, zFront + 0.12);
  plan.parts.push({ part: 'water-pump', shape: 'cylinder', position: pump.clone(), axis: v(0, 0, 1), radius: 0.24 * R, length: 0.12 * R, material: 'metal' });
  const ring = (z: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const [x, y] = housingPoint((i / 48) * 360, R, a.e);
      pts.push(v(x * 1.12, y * 1.12, z));
    }
    return pts;
  };
  a.rotorZ.forEach((z, i) => {
    addRoute(plan, { part: 'housing-coolant', channel: 'jacket', points: ring(z), radius: 0.03 * R });
    if (i > 0) {
      for (const psi of [45, 135, 225, 315]) {
        const [x, y] = housingPoint(psi, R, a.e);
        addRoute(plan, { part: 'housing-coolant', channel: 'transfer', points: [v(x * 1.12, y * 1.12, a.rotorZ[i - 1]!), v(x * 1.12, y * 1.12, z)], radius: 0.025 * R });
      }
    }
  });
  const [x0, y0] = housingPoint(0, R, a.e);
  addRoute(plan, { part: 'water-pump', channel: 'pump', points: [pump.clone(), v(x0 * 1.12, y0 * 1.12, zFront), v(x0 * 1.12, y0 * 1.12, a.rotorZ[0]!)], radius: line });
  const stat = v(0.45 * R, 0.95 * a.tall, zFront + 0.1);
  plan.parts.push({ part: 'thermostat', shape: 'cylinder', position: stat.clone(), axis: v(0, 1, 0), radius: 0.15 * R, length: 0.18 * R, material: 'metal' });
  plan.movers = [{ part: 'thermostat', position: stat.clone().add(v(0, -0.03 * R, 0)), axis: v(0, 1, 0), radius: 0.1 * R, travel: 0.08 * R, channel: 'radiator' }];
  const [x1, y1] = housingPoint(20, R, a.e);
  addRoute(plan, { part: 'water-jacket', channel: 'outlet', points: [v(x1 * 1.12, y1 * 1.12, a.rotorZ[0]!), v(x1 * 1.12, y1 * 1.12, zFront), stat.clone()], radius: line });
  const ahead = v(stat.x, stat.y + 0.15 * R, zFront + 1.3 * R);
  addRoute(plan, { part: 'radiator-hose', channel: 'radiator', points: [stat.clone(), stat.clone().add(v(0, 0.15 * R, 0.25 * R)), ahead], radius: 0.07 * b });
  const lowAhead = v(pump.x - 0.3 * R, pump.y - 0.3 * R, zFront + 1.2 * R);
  addRoute(plan, { part: 'radiator-hose', channel: 'radiator', points: [lowAhead, v(lowAhead.x, lowAhead.y, pump.z + 0.15), pump.clone().add(v(-0.15 * R, -0.1 * R, 0))], radius: 0.07 * b });
  for (const end of [ahead, lowAhead]) plan.parts.push({ part: 'radiator-hose', shape: 'ring', position: end, axis: v(0, 0, 1), radius: 0.095 * b, inner: 0.055 * b, length: 0.05 * b, material: 'rubber' });
  addRoute(plan, { part: 'coolant-bypass', channel: 'bypass', points: [stat.clone().add(v(0, -0.08 * R, 0)), stat.clone().lerp(pump, 0.5), pump.clone().add(v(0.1 * R, 0.08 * R, 0))], radius: line });
  const heaterEnd = v(-0.3 * R, 0.95 * a.tall, a.rotorZ[a.rotorZ.length - 1]! - a.width / 2 - 1.0 * R);
  addRoute(plan, { part: 'heater-hose', channel: 'heater', points: [v(-0.3 * R, 0.9 * a.tall, a.rotorZ[a.rotorZ.length - 1]!), v(-0.3 * R, 0.95 * a.tall, a.rotorZ[a.rotorZ.length - 1]! - a.width), heaterEnd], radius: line });
  plan.parts.push({ part: 'heater-hose', shape: 'ring', position: heaterEnd, axis: v(0, 0, 1), radius: line * 2.2, inner: line * 1.2, length: 0.04 * b, material: 'rubber' });
  return plan;
}
