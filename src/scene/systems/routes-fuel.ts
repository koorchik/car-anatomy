// Fuel and ignition: the fuel line from the tank, rails, injectors in the ports or in the chambers, the cam-driven
// high-pressure pump, carburettor or mechanical injection, the diesel's pump and lines, glow plugs, spark plugs and
// what fires them. Injections and sparks are events the fuel model times; this plan only says where they show.

import * as THREE from 'three';
import { DEG, type Engine } from '../../engine/kinematics.ts';
import { hasDirectInjectors, hasPortInjectors, isDieselSystem, type SystemsSpec } from '../../engine/systems-spec.ts';
import type { PistonAnchors, RotaryAnchors } from './anchors.ts';
import { addRoute, bankPoint, emptyPlan, pointAlong, type LayerPlan } from './route.ts';

const MM = 0.01;
const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Event slots of the fuel layer, in the order the fuel model fills them. */
export interface FuelSlots {
  spark(i: number): number;
  inject(i: number): number;
  pilot(i: number): number;
  glow: number;
  continuous: number;
  count: number;
}

export function fuelSlots(engine: Engine): FuelSlots {
  const sparks = engine.isRotary ? engine.banks.length * 2 : engine.cylinders.length;
  const chambers = engine.cylinders.length;
  return {
    spark: (i) => i,
    inject: (i) => sparks + i,
    pilot: (i) => sparks + chambers + i,
    glow: sparks + 2 * chambers,
    continuous: sparks + 2 * chambers + 1,
    count: sparks + 2 * chambers + 2,
  };
}

/** A cylinder-frame point to the engine frame. */
const cyl = (alpha: number, x: number, y: number, z: number): THREE.Vector3 => bankPoint(alpha, x, y, z);

/** High-pressure lines light with their cylinder's injection, leads with their spark. */
function linkSlots(plan: LayerPlan, slots: FuelSlots, engine: Engine): void {
  plan.channelSlots = {};
  engine.cylinders.forEach((_, i) => {
    plan.channelSlots![`line-${i}`] = slots.inject(i);
  });
  const sparks = engine.isRotary ? engine.banks.length * 2 : engine.cylinders.length;
  for (let i = 0; i < sparks; i++) plan.channelSlots[`ht-${i}`] = slots.spark(i);
}

export function fuelPlan(engine: Engine, systems: SystemsSpec, a: PistonAnchors): LayerPlan {
  const plan = emptyPlan();
  const slots = fuelSlots(engine);
  plan.slots = slots.count;
  linkSlots(plan, slots, engine);
  plan.flashes = [];
  plan.spinners = [];
  plan.movers = [];
  const b = a.bore;
  const hh = a.headHeight;
  const spec = engine.spec;
  const system = systems.fuelSystem;
  const diesel = isDieselSystem(system);
  const dohc = spec.valvetrain === 'dohc';
  const ohv = spec.valvetrain === 'ohv';
  const crown = spec.stroke * 0.42 * MM;
  const line = 0.022 * b;
  const intakeOf = (bank: number): number => -a.banks[bank]!.exhaustSide;
  const zs = a.cylinders.map((c) => c.z);
  const zFront = Math.max(...zs) + 0.6 * b;
  const zRear = Math.min(...zs) - 0.6 * b;

  // Fuel from the tank: along the intake side of the block from the rear, ending in an open stub.
  const bank0 = a.banks[0]!;
  const feedSide = intakeOf(0);
  const feedStart = bankPoint(bank0.alpha, feedSide * (bank0.halfWidth + 0.25 * b), a.deck * 0.55, a.rear - 0.9 * b);
  plan.parts.push({ part: 'fuel-line', shape: 'ring', position: feedStart.clone(), axis: v(0, 0, 1), radius: line * 1.8, inner: line, length: 0.04 * b, material: 'rubber' });

  // Injectors in the ports: in each runner, looking at the intake valve, topped by a rail along each bank.
  const portTops: THREE.Vector3[][] = a.banks.map(() => []);
  if (hasPortInjectors(system)) {
    for (const runner of a.runners) {
      const i = a.cylinders.findIndex((c) => c.n === runner.n);
      const c = a.cylinders[i]!;
      const tip = pointAlong(runner.points, 0.18);
      const along = pointAlong(runner.points, 0.24).sub(tip).normalize();
      const up = v(Math.sin(c.alpha * DEG), Math.cos(c.alpha * DEG), 0);
      const axis = up.clone().addScaledVector(along, 0.6).normalize();
      const top = tip.clone().addScaledVector(axis, runner.r + 0.3 * b);
      plan.parts.push({ part: 'injector-port', shape: 'cylinder', position: tip.clone().lerp(top, 0.55), axis, radius: 0.045 * b, length: tip.distanceTo(top) * 0.9, material: 'dark' });
      plan.fixedSprays.push({ part: 'injector-port', channel: 'spray', from: tip.clone(), to: runner.points[0]!.clone().lerp(tip, 0.15), radius: runner.r * 0.7, slot: system === 'mechanical' ? slots.continuous : slots.inject(i) });
      portTops[c.bank]!.push(top);
    }
  }
  // Direct injectors at the edge of each chamber, nose in the cylinder, body out through the head on the intake side.
  const directTops: THREE.Vector3[][] = a.banks.map(() => []);
  if (hasDirectInjectors(system)) {
    a.cylinders.forEach((c, i) => {
      const s = intakeOf(c.bank);
      const tip = cyl(c.alpha, s * 0.4 * b, a.deck - 0.02 * b, c.z);
      const top = cyl(c.alpha, s * (0.4 + 0.5 * Math.cos(25 * DEG)) * b, a.deck - 0.02 * b + 0.5 * Math.sin(25 * DEG) * b, c.z);
      plan.parts.push({ part: 'injector-direct', shape: 'cylinder', position: tip.clone().lerp(top, 0.5), axis: top.clone().sub(tip).normalize(), radius: 0.04 * b, length: tip.distanceTo(top), material: 'dark' });
      plan.pistonSprays.push({ part: 'injector-direct', channel: 'spray', cylinder: i, from: new THREE.Vector2(s * 0.38 * b, a.deck - 0.04 * b), toX: -s * 0.1 * b, aboveWrist: crown, radius: 0.08 * b, slot: system === 'dual' ? slots.pilot(i) : slots.inject(i) });
      directTops[c.bank]!.push(top);
    });
  }
  const railOf = (tops: THREE.Vector3[], part: string, channel: string, r: number): void => {
    if (tops.length === 0) return;
    const sorted = [...tops].sort((p, q) => q.z - p.z);
    const lift = sorted.map((p) => p.clone().add(v(0, 0.06 * b, 0)));
    addRoute(plan, { part, channel, points: lift.length === 1 ? [lift[0]!, lift[0]!.clone().add(v(0, 0, -0.3 * b))] : lift, radius: r });
  };
  portTops.forEach((tops) => railOf(tops, 'fuel-rail', 'rail', 0.04 * b));
  directTops.forEach((tops) => railOf(tops, 'fuel-rail', 'hp-rail', 0.04 * b));
  const firstRail = portTops.flat().concat(directTops.flat()).sort((p, q) => p.z - q.z)[0];
  if (firstRail && !hasDirectInjectors(system)) addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feedStart.clone(), v(feedStart.x, feedStart.y, firstRail.z - 0.3 * b), firstRail.clone().add(v(0, 0.06 * b, 0))], radius: line });
  if (hasDirectInjectors(system)) {
    // A plunger pump on the end of an intake cam lifts the rail to 50-200 bar; a pushrod engine has it in the valley.
    const banks = ohv ? [0] : a.banks.length === 2 ? [0, 1] : [0];
    for (const bi of banks) {
      const cam = a.cams.find((x) => x.bank === bi && x.exhaust !== true);
      const bank = a.banks[bi]!;
      const pump = cam && !ohv ? bankPoint(bank.alpha, cam.x, cam.y + 0.05 * b, cam.zMin - 0.25 * b) : v(0, (a.blockCam?.y ?? a.deck) + 0.35 * b, zRear - 0.1 * b);
      plan.parts.push({ part: 'hp-pump', shape: 'cylinder', position: pump.clone(), axis: v(0, 1, 0), radius: 0.12 * b, length: 0.24 * b, material: 'metal' });
      plan.movers!.push({ part: 'hp-pump', position: pump.clone().add(v(0, 0.16 * b, 0)), axis: v(0, 1, 0), radius: 0.05 * b, travel: 0.06 * b, channel: 'hp-rail' });
      addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feedStart.clone(), v(feedStart.x, feedStart.y, pump.z), pump.clone().add(v(0, -0.12 * b, 0))], radius: line });
      const rail = directTops[bi]!.sort((p, q) => p.z - q.z)[0];
      if (rail) addRoute(plan, { part: 'hp-pump', channel: 'hp-rail', points: [pump.clone().add(v(0, 0.1 * b, 0)), v(pump.x, rail.y + 0.06 * b, pump.z), rail.clone().add(v(0, 0.06 * b, 0))], radius: line });
    }
  }

  // Carburettor on the plenum, fed by a mechanical pump on the block; or a fuel distributor at the throttle.
  if (system === 'carburettor' || system === 'mechanical') {
    const p = a.plenum;
    const zc = system === 'carburettor' ? (p.zMin + p.zMax) / 2 : p.zMin - 0.25 * b;
    const body = v(p.x, p.y + p.r + (system === 'carburettor' ? 0.2 * b : 0.1 * b), zc);
    plan.parts.push({ part: system === 'carburettor' ? 'carburettor' : 'fuel-distributor', shape: 'box', position: body.clone(), half: v(0.2 * b, 0.18 * b, 0.2 * b), material: 'metal' });
    if (system === 'carburettor') {
      plan.parts.push({ part: 'carburettor', shape: 'box', position: body.clone().add(v(0.26 * b, -0.04 * b, 0)), half: v(0.08 * b, 0.12 * b, 0.14 * b), material: 'metal' });
      plan.fixedSprays.push({ part: 'carburettor', channel: 'spray', from: body.clone().add(v(0, 0.05 * b, 0)), to: v(p.x, p.y, zc), radius: 0.16 * b, slot: slots.continuous });
      const pumpAt = a.blockCam ? v(a.blockCam.x + feedSide * 0.5 * b, a.blockCam.y, zFront - 0.3 * b) : bankPoint(bank0.alpha, feedSide * (bank0.halfWidth + 0.08 * b), a.crankcaseR * 0.6, zFront - 0.3 * b);
      plan.parts.push({ part: 'fuel-pump', shape: 'box', position: pumpAt.clone(), half: v(0.1 * b, 0.1 * b, 0.08 * b), material: 'metal' });
      addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feedStart.clone(), v(feedStart.x, pumpAt.y, pumpAt.z), pumpAt.clone()], radius: line });
      addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [pumpAt.clone(), v(pumpAt.x, body.y + 0.1 * b, pumpAt.z), body.clone().add(v(0.26 * b, 0.1 * b, 0))], radius: line });
    } else {
      addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feedStart.clone(), v(feedStart.x, body.y, body.z), body.clone()], radius: line });
      for (const tops of portTops) for (const top of tops) addRoute(plan, { part: 'fuel-distributor', channel: 'rail', points: [body.clone(), v(top.x, body.y, (top.z + body.z) / 2), top.clone().add(v(0, 0.06 * b, 0))], radius: 0.014 * b });
    }
  }

  // Diesel: injectors in the chambers, fed by a common rail, by unit injectors under the cam, or by a pump's own lines.
  if (diesel) {
    const tops: THREE.Vector3[] = [];
    a.cylinders.forEach((c, i) => {
      const s = intakeOf(c.bank);
      const pre = system === 'diesel-idi';
      const x = pre ? s * 0.3 * b : dohc ? 0 : s * 0.18 * b;
      const tip = cyl(c.alpha, x, a.deck + (pre ? 0.2 * b : 0.01 * b), c.z);
      const tilt = dohc && !pre ? 0 : s * 0.1;
      const top = cyl(c.alpha, x + tilt * (hh + 0.1 * b), a.deck + hh + (system === 'unit-injector' ? -0.2 * b : 0.12 * b), c.z);
      const part = system === 'unit-injector' ? 'unit-injector' : 'injector-diesel';
      plan.parts.push({ part, shape: 'cylinder', position: tip.clone().lerp(top, 0.5), axis: top.clone().sub(tip).normalize(), radius: (system === 'unit-injector' ? 0.07 : 0.045) * b, length: tip.distanceTo(top), material: 'dark' });
      if (pre) {
        plan.parts.push({ part: 'prechamber', shape: 'sphere', position: cyl(c.alpha, x, a.deck + 0.1 * b, c.z), radius: 0.1 * b, material: 'tint' });
        plan.fixedSprays.push({ part: 'prechamber', channel: 'spray', from: tip.clone(), to: cyl(c.alpha, x * 0.6, a.deck + 0.02 * b, c.z), radius: 0.07 * b, slot: slots.inject(i) });
      } else {
        plan.pistonSprays.push({ part, channel: 'spray', cylinder: i, from: new THREE.Vector2(x, a.deck), toX: x * 0.3, aboveWrist: crown, radius: 0.09 * b, slot: slots.inject(i) });
        if (system !== 'diesel-pump') plan.pistonSprays.push({ part, channel: 'spray', cylinder: i, from: new THREE.Vector2(x, a.deck), toX: -x * 0.3, aboveWrist: crown + 0.1 * b, radius: 0.05 * b, slot: slots.pilot(i) });
      }
      tops.push(top);
    });
    if (system === 'common-rail') {
      a.banks.forEach((bank, bi) => {
        const own = tops.filter((_, i) => a.cylinders[i]!.bank === bi);
        const railY = a.deck + hh + 0.5 * b;
        const rail = own.map((t) => bankPoint(bank.alpha, intakeOf(bi) * 0.3 * b, railY, t.z)).sort((p, q) => q.z - p.z);
        addRoute(plan, { part: 'fuel-rail', channel: 'hp-rail', points: rail.length > 1 ? rail : [rail[0]!, rail[0]!.clone().add(v(0, 0, -0.3 * b))], radius: 0.05 * b });
        for (const t of own) addRoute(plan, { part: 'injection-line', channel: 'hp-rail', points: [bankPoint(bank.alpha, intakeOf(bi) * 0.3 * b, railY, t.z), t.clone().add(v(0, 0.05 * b, 0))], radius: line * 0.8 });
      });
      const pump = bankPoint(bank0.alpha, feedSide * (bank0.halfWidth + 0.2 * b), a.deck * 0.6, a.front + 0.05 * b);
      plan.parts.push({ part: 'injection-pump', shape: 'cylinder', position: pump.clone(), axis: v(0, 0, 1), radius: 0.14 * b, length: 0.3 * b, material: 'metal' });
      addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feedStart.clone(), v(feedStart.x, pump.y, pump.z - 0.3 * b), pump.clone().add(v(0, 0, -0.15 * b))], radius: line });
      addRoute(plan, { part: 'injection-pump', channel: 'hp-rail', points: [pump.clone().add(v(0, 0.1 * b, 0.1 * b)), v(pump.x, a.deck + hh + 0.5 * b, pump.z), bankPoint(bank0.alpha, feedSide * 0.3 * b, a.deck + hh + 0.5 * b, zFront - 0.6 * b)], radius: line });
    } else if (system === 'unit-injector') {
      a.banks.forEach((bank, bi) => {
        const g = (z: number): THREE.Vector3 => bankPoint(bank.alpha, intakeOf(bi) * (bank.halfWidth - 0.12 * b), a.deck + 0.3 * hh, z);
        addRoute(plan, { part: 'fuel-rail', channel: 'feed', points: [g(zFront), g(zRear)], radius: 0.035 * b });
        tops.forEach((t, i) => {
          if (a.cylinders[i]!.bank !== bi) return;
          addRoute(plan, { part: 'unit-injector', channel: 'feed', points: [g(t.z), t.clone().add(v(0, -0.1 * b, 0))], radius: line * 0.8 });
        });
        addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feedStart.clone(), v(feedStart.x, g(zRear).y, zRear - 0.4 * b), g(zRear)], radius: line });
      });
    } else {
      // An inline (or rotary) pump on the side of the block, one steel line per injector, each lit by its own shot.
      const pumpX = feedSide * (a.crankcaseR + 0.25 * b);
      const len = zFront - zRear;
      const body = bankPoint(bank0.alpha, pumpX, 0.25 * a.crankcaseR, (zFront + zRear) / 2);
      plan.parts.push({ part: 'injection-pump', shape: 'box', position: body.clone(), half: v(0.16 * b, 0.2 * b, len * 0.32), material: 'metal' });
      addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feedStart.clone(), v(feedStart.x, body.y, body.z - len * 0.36)], radius: line });
      const order = [...a.cylinders.keys()].sort((p, q) => a.cylinders[q]!.z - a.cylinders[p]!.z);
      order.forEach((i, k) => {
        const t = tops[i]!;
        const outlet = body.clone().add(v(0, 0.2 * b, len * 0.3 - (k / Math.max(1, order.length - 1)) * len * 0.6));
        const high = v(outlet.x, Math.max(t.y, outlet.y) + 0.25 * b + k * 0.012 * b, outlet.z);
        addRoute(plan, { part: 'injection-line', channel: `line-${i}`, points: [outlet, high, v(t.x, high.y, t.z), t.clone().add(v(0, 0.04 * b, 0))], radius: 0.018 * b });
      });
    }
    // Glow plugs lean in from the exhaust side; their tips glow after a cold start.
    if (systems.glowPlugs) {
      a.cylinders.forEach((c) => {
        const s = a.banks[c.bank]!.exhaustSide;
        const tip = cyl(c.alpha, s * 0.3 * b, a.deck + 0.01 * b, c.z);
        const dir = v(Math.sin((c.alpha + s * 35) * DEG), Math.cos((c.alpha + s * 35) * DEG), 0);
        plan.parts.push({ part: 'glow-plug', shape: 'cylinder', position: tip.clone().addScaledVector(dir, 0.3 * b), axis: dir, radius: 0.03 * b, length: 0.6 * b, material: 'metal' });
        plan.flashes!.push({ part: 'glow-plug', position: tip, slot: slots.glow, color: '#ff7a2a', size: 0.7 });
      });
    }
    return plan;
  }

  // Spark plugs: between the cams of a twin-cam head, leaning in from the intake side under one cam, from the
  // exhaust side in a pushrod head. A second plug sits opposite.
  const plugsPerCyl = systems.sparkPlugs;
  const plugTops: THREE.Vector3[] = [];
  a.cylinders.forEach((c, i) => {
    const s = intakeOf(c.bank);
    const places: Array<{ x: number; z: number; lean: number }> = [];
    if (dohc) {
      if (plugsPerCyl === 2) places.push({ x: 0, z: 0.3 * b, lean: 0 }, { x: 0, z: -0.3 * b, lean: 0 });
      else places.push({ x: 0, z: 0, lean: 0 });
    } else {
      const side = ohv ? -s : s;
      places.push({ x: side * 0.3 * b, z: 0, lean: side * 20 });
      if (plugsPerCyl === 2) places.push({ x: -side * 0.3 * b, z: 0, lean: -side * 20 });
    }
    for (const p of places) {
      const tip = cyl(c.alpha, p.x, a.deck + 0.02 * b, c.z + p.z);
      const dir = v(Math.sin((c.alpha + p.lean) * DEG), Math.cos((c.alpha + p.lean) * DEG), 0);
      const length = hh + 0.12 * b;
      plan.parts.push({ part: 'spark-plug', shape: 'cylinder', position: tip.clone().addScaledVector(dir, length / 2), axis: dir, radius: 0.045 * b, length, material: 'metal' });
      plan.flashes!.push({ part: 'spark-plug', position: tip.clone(), slot: slots.spark(i) });
      const top = tip.clone().addScaledVector(dir, length);
      plugTops.push(top);
      if (systems.ignition === 'coil-on-plug') plan.flashes!.push({ part: 'coil', position: top, slot: slots.spark(i), size: 0.5, color: '#9fd0ff' });
    }
  });
  const leadFrom = (from: THREE.Vector3, to: THREE.Vector3, i: number): void => {
    const lift = Math.max(from.y, to.y) + 0.3 * b;
    addRoute(plan, { part: 'ht-lead', channel: `ht-${i}`, points: [from, v(from.x, lift, from.z), v(to.x, lift, to.z), to], radius: 0.014 * b });
  };
  if (systems.ignition === 'wasted-spark' && plugsPerCyl > 0) {
    // One coil per pair of cylinders 360 degrees apart, with a lead to each.
    const done = new Set<number>();
    engine.cylinders.forEach((c, i) => {
      if (done.has(i)) return;
      const j = engine.cylinders.findIndex((d, k) => k !== i && !done.has(k) && Math.abs(((((d.fire - c.fire) % 720) + 720) % 720) - 360) < 1);
      done.add(i);
      if (j >= 0) done.add(j);
      const coil = plugTops[i * plugsPerCyl]!.clone().add(v(0, 0.12 * b, 0));
      plan.parts.push({ part: 'coil', shape: 'box', position: coil.clone(), half: v(0.12 * b, 0.07 * b, 0.12 * b), material: 'dark' });
      if (j >= 0) leadFrom(coil.clone(), plugTops[j * plugsPerCyl]!.clone(), j);
    });
  } else if (systems.ignition === 'distributor' && plugsPerCyl > 0) {
    // The distributor turns at camshaft speed: on the end of a cam, or above a pushrod engine's cam at the front.
    const cam = a.cams.find((x) => x.exhaust !== true);
    const cap = cam && !ohv ? bankPoint(a.banks[cam.bank]!.alpha, cam.x, cam.y, cam.zMax + 0.25 * b) : v(a.blockCam?.x ?? 0, (a.blockCam?.y ?? a.deck) + 0.45 * b, zFront - 0.1 * b);
    const axis = cam && !ohv ? v(0, 0, 1) : v(0, 1, 0);
    plan.parts.push({ part: 'distributor', shape: 'cylinder', position: cap.clone(), axis, radius: 0.18 * b, length: 0.2 * b, material: 'dark' });
    plan.spinners!.push({ part: 'distributor', position: cap.clone().addScaledVector(axis, 0.11 * b), axis, length: 0.14 * b, radius: 0.025 * b, ratio: 0.5 });
    const coil = cap.clone().add(v(0.35 * b, 0.1 * b, 0));
    plan.parts.push({ part: 'coil', shape: 'cylinder', position: coil.clone(), axis: v(0, 1, 0), radius: 0.08 * b, length: 0.26 * b, material: 'dark' });
    a.cylinders.forEach((_, i) => {
      for (let k = 0; k < plugsPerCyl; k++) leadFrom(cap.clone(), plugTops[i * plugsPerCyl + k]!.clone(), i);
    });
  }
  return plan;
}

/** A rotary: injectors in the ports (or a carburettor), and the leading and trailing plugs of each rotor. */
export function rotaryFuelPlan(engine: Engine, systems: SystemsSpec, a: RotaryAnchors): LayerPlan {
  const plan = emptyPlan();
  const slots = fuelSlots(engine);
  plan.slots = slots.count;
  linkSlots(plan, slots, engine);
  plan.flashes = [];
  plan.spinners = [];
  const R = a.R;
  const b = R * 0.9;
  const system = systems.fuelSystem;
  const tops: THREE.Vector3[] = [];
  if (hasPortInjectors(system) || hasDirectInjectors(system)) {
    for (const runner of a.runners) {
      const tip = pointAlong(runner.points, 0.3);
      const top = tip.clone().add(v(-0.25 * R, 0.25 * R, 0));
      plan.parts.push({ part: 'injector-port', shape: 'cylinder', position: tip.clone().lerp(top, 0.5), axis: top.clone().sub(tip).normalize(), radius: 0.04 * b, length: tip.distanceTo(top), material: 'dark' });
      // The rotor's three faces breathe through this port in turn: the injector fires for whichever face is filling.
      const faces = engine.cylinders.map((c, i) => ({ c, i })).filter(({ c }) => c.bank === runner.rotor);
      for (const { i } of faces) plan.fixedSprays.push({ part: 'injector-port', channel: 'spray', from: tip.clone(), to: runner.points[0]!.clone().lerp(tip, 0.2), radius: runner.r * 0.6, slot: system === 'mechanical' ? slots.continuous : slots.inject(i) });
      tops.push(top);
    }
    const rail = tops.map((t) => t.clone().add(v(0, 0.05 * R, 0))).sort((p, q) => q.z - p.z);
    addRoute(plan, { part: 'fuel-rail', channel: 'rail', points: rail.length > 1 ? rail : [rail[0]!, rail[0]!.clone().add(v(0, 0, -0.3))], radius: 0.035 * b });
    const feed = v(rail[rail.length - 1]!.x, rail[rail.length - 1]!.y, a.rear - 0.9 * R);
    addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [feed, rail[rail.length - 1]!.clone()], radius: 0.022 * b });
    plan.parts.push({ part: 'fuel-line', shape: 'ring', position: feed, axis: v(0, 0, 1), radius: 0.04 * b, inner: 0.022 * b, length: 0.04 * b, material: 'rubber' });
  } else if (system === 'carburettor') {
    const p = a.plenum;
    const body = v(p.x, p.y + p.r + 0.2 * R, (p.zMin + p.zMax) / 2);
    plan.parts.push({ part: 'carburettor', shape: 'box', position: body.clone(), half: v(0.2 * R, 0.18 * R, 0.25 * R), material: 'metal' });
    plan.fixedSprays.push({ part: 'carburettor', channel: 'spray', from: body.clone(), to: v(p.x, p.y, body.z), radius: 0.15 * R, slot: slots.continuous });
    addRoute(plan, { part: 'fuel-line', channel: 'feed', points: [v(body.x, body.y, a.rear - 0.9 * R), body.clone().add(v(0, 0.1 * R, -0.25 * R))], radius: 0.022 * b });
  }
  // Leading plug below the short axis, trailing above, both through the housing on the plug side.
  a.plugs.forEach((p, r) => {
    for (const [tip, slot] of [[p.leading, slots.spark(r * 2)], [p.trailing, slots.spark(r * 2 + 1)]] as const) {
      const part = slot % 2 === 0 ? 'plug-leading' : 'plug-trailing';
      const out = tip.clone().add(v(a.half - tip.x + 0.3 * R, 0, 0));
      plan.parts.push({ part, shape: 'cylinder', position: tip.clone().lerp(out, 0.5), axis: v(1, 0, 0), radius: 0.05 * b, length: tip.distanceTo(out), material: 'metal' });
      plan.flashes!.push({ part, position: tip.clone(), slot });
    }
  });
  if (systems.ignition === 'distributor') {
    const cap = v(0.4 * R, 0.6 * R, a.front + 0.25);
    plan.parts.push({ part: 'distributor', shape: 'cylinder', position: cap.clone(), axis: v(0, 0, 1), radius: 0.16 * R, length: 0.18 * R, material: 'dark' });
    // One spark of each plug per shaft turn: the rotor arm turns with the shaft.
    plan.spinners!.push({ part: 'distributor', position: cap.clone().add(v(0, 0, 0.1 * R)), axis: v(0, 0, 1), length: 0.12 * R, radius: 0.02 * R, ratio: 1 });
    a.plugs.forEach((p, r) => {
      for (const [tip, k] of [[p.leading, 0], [p.trailing, 1]] as const) {
        const end = tip.clone().add(v(a.half - tip.x + 0.3 * R, 0, 0));
        addRoute(plan, { part: 'ht-lead', channel: `ht-${r * 2 + k}`, points: [cap.clone(), v(end.x + 0.1 * R, cap.y, (cap.z + end.z) / 2), end], radius: 0.014 * b });
      }
    });
  } else if (systems.ignition === 'wasted-spark') {
    // Both leading plugs share one coil; each trailing plug has its own (13B-REW).
    const coil = v(a.half + 0.45 * R, 0, (a.rotorZ[0]! + a.rotorZ[a.rotorZ.length - 1]!) / 2);
    plan.parts.push({ part: 'coil', shape: 'box', position: coil.clone(), half: v(0.08 * R, 0.1 * R, 0.14 * R), material: 'dark' });
    a.plugs.forEach((p, r) => {
      const end = p.leading.clone().add(v(a.half - p.leading.x + 0.3 * R, 0, 0));
      addRoute(plan, { part: 'ht-lead', channel: `ht-${r * 2}`, points: [coil.clone(), v(coil.x, end.y, end.z), end], radius: 0.014 * b });
    });
  }
  return plan;
}
