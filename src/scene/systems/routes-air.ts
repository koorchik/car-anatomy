// The air: airbox and mass airflow sensor beside the engine, the throttle, the plenum and a pulse down each runner
// while its intake valve is open; through the compressors and out to the intercooler and back on a boosted engine,
// through the blower on a supercharged one. The plenum and runners are glass while this layer shows.

import * as THREE from 'three';
import type { Engine } from '../../engine/kinematics.ts';
import type { SystemsSpec } from '../../engine/systems-spec.ts';
import type { PistonAnchors, RotaryAnchors } from './anchors.ts';
import { addRoute, emptyPlan, type LayerPlan } from './route.ts';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Channel of a runner: one each, so each pulses with its own valve. */
export const runnerChannel = (n: number): string => `runner-${n}`;

/** The highest point of a path and its index: where the charge leaves for the intercooler and comes back. */
function highest(points: THREE.Vector3[]): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) if (points[i]!.y > points[best]!.y) best = i;
  return best;
}

export function airPlan(engine: Engine, _systems: SystemsSpec, a: PistonAnchors): LayerPlan {
  const plan = emptyPlan();
  plan.movers = [];
  const b = a.bore;
  const duct = 0.09 * b;
  const p = a.plenum;
  const diesel = engine.spec.fuel === 'diesel';
  const turbo = a.turbos.length > 0;
  const blower = a.supercharger;
  // Airbox off the rear end of the plenum, on the intake side.
  const side = Math.sign(p.x) || -Math.sign(a.alternator.x || 1);
  const box = v(p.x + side * 0.6 * b, p.y + 0.2 * b, p.zMin - 1.0 * b);
  plan.parts.push({ part: 'airbox', shape: 'box', position: box.clone(), half: v(0.6 * b, 0.3 * b, 0.4 * b), material: 'dark' });
  const snorkel = box.clone().add(v(side * 0.75 * b, 0.1 * b, -0.2 * b));
  addRoute(plan, { part: 'airbox', channel: 'snorkel', points: [snorkel.clone().add(v(side * 0.4 * b, 0, -0.2 * b)), snorkel], radius: duct * 0.9 });
  const out = box.clone().add(v(0, 0, 0.42 * b));
  const maf = out.clone().add(v(0, 0, 0.2 * b));
  plan.parts.push({ part: 'maf', shape: 'ring', position: maf.clone(), axis: v(0, 0, 1), radius: duct * 1.5, inner: duct * 1.05, length: 0.12 * b, material: 'dark' });

  // Where the air meets the throttle: the plenum's end, a blower's inlet, or the charge pipe's last stretch.
  const plenumEnd = v(p.x, p.y, p.zMin - 0.05 * b);
  const throttleAt = (at: THREE.Vector3, along: THREE.Vector3): void => {
    if (diesel) return;
    plan.parts.push({ part: 'throttle', shape: 'cylinder', position: at.clone(), axis: along.clone().normalize(), radius: duct * 1.35, length: 0.16 * b, material: 'metal' });
    plan.movers!.push({ part: 'throttle', position: at.clone(), axis: along.clone().normalize(), radius: duct * 1.1, travel: 0, channel: 'throttle', turn: true });
  };

  if (turbo) {
    // Fresh air to each compressor, out hot along the charge pipe, out to the intercooler at its top and back cool.
    for (const t of a.turbos) {
      t.unit.updateMatrix();
      const inlet = t.airIn.clone().applyMatrix4(t.unit.matrix);
      const mouth = inlet.clone().add(v(0, 0, 0.35 * t.size));
      addRoute(plan, { part: 'intake-duct', channel: 'duct', points: [maf.clone(), v(maf.x, Math.max(maf.y, mouth.y) + 0.3 * b, mouth.z + 0.6 * b), v(mouth.x, mouth.y + 0.2 * b, mouth.z + 0.3 * b), mouth, inlet], radius: duct });
      if (!t.charge) continue;
      const path = t.charge;
      const top = Math.max(1, highest(path));
      const hot = path.slice(0, top + 1);
      const cool = path.slice(top);
      const away = v(t.sign * 1.2 * b, 0.1 * b, 0);
      const ic = path[top]!;
      addRoute(plan, { part: 'charge-pipe', channel: 'charge-hot', points: [...hot.slice(0, -1), ic.clone().lerp(hot[hot.length - 2]!, 0.15)], radius: duct * 0.8 });
      addRoute(plan, { part: 'intercooler', channel: 'charge-hot', points: [ic.clone().lerp(hot[hot.length - 2]!, 0.15), ic.clone().add(away)], radius: duct * 0.8 });
      addRoute(plan, { part: 'intercooler', channel: 'charge-cool', points: [ic.clone().add(away).add(v(0, -0.2 * b, 0.25 * b)), ic.clone().lerp(cool[1] ?? ic, 0.15)], radius: duct * 0.8 });
      for (const end of [ic.clone().add(away), ic.clone().add(away).add(v(0, -0.2 * b, 0.25 * b))]) {
        plan.parts.push({ part: 'intercooler', shape: 'ring', position: end, axis: v(1, 0, 0), radius: duct * 1.3, inner: duct * 0.8, length: 0.05 * b, material: 'rubber' });
      }
      const rest = [ic.clone().lerp(cool[1] ?? ic, 0.15), ...cool.slice(1)];
      addRoute(plan, { part: 'charge-pipe', channel: 'charge-cool', points: rest, radius: duct * 0.8 });
      // The throttle sits on the last stretch into the plenum.
      const last = rest[rest.length - 1]!;
      const before = rest[rest.length - 2] ?? last;
      throttleAt(last.clone().lerp(before, 0.35), last.clone().sub(before));
    }
  } else if (blower) {
    const inlet = v(blower.x, blower.y + blower.height * 0.6, blower.zMin - 0.25 * b);
    addRoute(plan, { part: 'intake-duct', channel: 'duct', points: [maf.clone(), v(maf.x, inlet.y + 0.2 * b, maf.z + 0.5 * b), v(inlet.x, inlet.y, inlet.z - 0.5 * b), inlet], radius: duct });
    throttleAt(inlet.clone().add(v(0, 0, -0.2 * b)), v(0, 0, 1));
    addRoute(plan, { part: 'supercharger', channel: 'charge-hot', points: [inlet.clone(), v(blower.x, blower.y + blower.height * 0.5, (blower.zMin + blower.zMax) / 2), v(p.x, p.y + p.r * 0.3, (blower.zMin + blower.zMax) / 2)], radius: duct * 0.9 });
  } else {
    addRoute(plan, { part: 'intake-duct', channel: 'duct', points: [maf.clone(), v(maf.x, maf.y, (maf.z + plenumEnd.z) / 2), v(plenumEnd.x, plenumEnd.y, plenumEnd.z - 0.4 * b), plenumEnd.clone().add(v(0, 0, -0.1 * b))], radius: duct });
    throttleAt(plenumEnd.clone().add(v(0, 0, -0.25 * b)), v(0, 0, 1));
  }

  // The plenum and a pulse down each runner.
  addRoute(plan, { part: 'intake', channel: 'plenum', points: [v(p.x, p.y, p.zMin), v(p.x, p.y, p.zMax)], radius: p.r * 0.55 });
  for (const runner of a.runners) {
    const pts = [...runner.points].reverse();
    addRoute(plan, { part: 'intake', channel: runnerChannel(runner.n), points: pts, radius: runner.r * 0.6 });
  }
  return plan;
}

/** A rotary: airbox, throttle at the plenum, a runner per rotor; its turbos aren't drawn, so the air arrives from a stub. */
export function rotaryAirPlan(engine: Engine, _systems: SystemsSpec, a: RotaryAnchors): LayerPlan {
  const plan = emptyPlan();
  plan.movers = [];
  const R = a.R;
  const b = R * 0.9;
  const duct = 0.09 * b;
  const p = a.plenum;
  const end = v(p.x, p.y, p.zMin - 0.05);
  const turbo = engine.spec.aspiration !== 'na';
  const start = turbo ? end.clone().add(v(-0.6 * R, 0.4 * R, -1.0 * R)) : end.clone().add(v(-0.4 * R, 0.2 * R, -1.1 * R));
  if (turbo) {
    plan.parts.push({ part: 'intercooler', shape: 'ring', position: start.clone(), axis: v(0, 0, 1), radius: duct * 1.3, inner: duct * 0.8, length: 0.05 * b, material: 'rubber' });
  } else {
    plan.parts.push({ part: 'airbox', shape: 'box', position: start.clone().add(v(0, 0, -0.3 * R)), half: v(0.45 * R, 0.25 * R, 0.3 * R), material: 'dark' });
    plan.parts.push({ part: 'maf', shape: 'ring', position: start.clone().add(v(0, 0, 0.15 * R)), axis: v(0, 0, 1), radius: duct * 1.5, inner: duct * 1.05, length: 0.1 * b, material: 'dark' });
  }
  addRoute(plan, { part: turbo ? 'intercooler' : 'intake-duct', channel: turbo ? 'charge-cool' : 'duct', points: [start, v(start.x, start.y, end.z - 0.4 * R), end.clone().add(v(0, 0, -0.15))], radius: duct });
  const throttle = end.clone().add(v(0, 0, -0.25 * R));
  plan.parts.push({ part: 'throttle', shape: 'cylinder', position: throttle.clone(), axis: v(0, 0, 1), radius: duct * 1.35, length: 0.14 * b, material: 'metal' });
  plan.movers!.push({ part: 'throttle', position: throttle.clone(), axis: v(0, 0, 1), radius: duct * 1.1, travel: 0, channel: 'throttle', turn: true });
  addRoute(plan, { part: 'intake', channel: 'plenum', points: [v(p.x, p.y, p.zMin), v(p.x, p.y, p.zMax)], radius: p.r * 0.55 });
  for (const runner of a.runners) {
    addRoute(plan, { part: 'intake', channel: runnerChannel(runner.rotor + 1), points: [...runner.points].reverse(), radius: runner.r * 0.6 });
  }
  return plan;
}
