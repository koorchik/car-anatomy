// The systems of a Wankel engine, after the 13B: oil pump in the front cover driven by a chain from the eccentric
// shaft, oil coolers out front, filter, the shaft's axial drilling feeding the main and rotor bearings, jets into the
// rotors, and the metering pump that feeds oil into the chambers for the apex seals.

import * as THREE from 'three';
import { DEG, type Engine } from '../../engine/kinematics.ts';
import type { SystemsSpec } from '../../engine/systems-spec.ts';
import type { SumpLayout } from '../../systems/sump.ts';
import type { RotaryAnchors } from './anchors.ts';
import { addScavenge, OIL_SIZES } from './routes-oil.ts';
import { addRoute, emptyPlan, pointAlong, type LayerPlan } from './route.ts';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Centre of a rotor's journal in the shaft's own frame, as RotaryEngineModel builds it. */
export const journalCentre = (a: RotaryAnchors, rotor: number): THREE.Vector3 => {
  const angle = (90 - a.rotorPhase[rotor]!) * DEG;
  return v(a.e * Math.sin(angle), a.e * Math.cos(angle), a.rotorZ[rotor]!);
};

export function rotaryOilPlan(_engine: Engine, systems: SystemsSpec, a: RotaryAnchors, sump: SumpLayout): LayerPlan {
  const plan = emptyPlan();
  const R = a.R;
  // Sizes in rotor radii: about the same scale a bore gives a piston engine.
  const b = R * 0.9;
  const lr = OIL_SIZES.line * b;
  const dr = OIL_SIZES.drilling * b;
  const zFrontPlate = a.rotorZ[0]! + a.width / 2 + 0.1;
  const zRearPlate = a.rotorZ[a.rotorZ.length - 1]! - a.width / 2 - 0.1;
  const zPump = zFrontPlate + 0.07;
  const pump = v(0, -0.62 * R, zPump);
  const inlet = pump.clone().add(v(0, -0.14 * R, 0));
  const outlet = pump.clone().add(v(0.16 * R, 0.04 * R, 0));

  plan.parts.push({ part: 'oil-pump', shape: 'box', position: pump, half: v(0.2 * R, 0.13 * R, 0.06), material: 'metal' });
  addRoute(plan, { part: 'oil-pump', channel: 'pump-drive', points: [v(0.12 * R, 0, zPump + 0.07), v(0.08 * R, pump.y, zPump + 0.07), v(-0.08 * R, pump.y, zPump + 0.07), v(-0.12 * R, 0, zPump + 0.07), v(0.12 * R, 0, zPump + 0.07)], radius: 0.012 * b });

  // With a tank the pressure stage draws from it instead (addScavenge).
  if (!sump.tank) {
    const pick = sump.pressureInlet;
    plan.parts.push({ part: 'oil-pickup', shape: 'disc', position: pick.clone(), axis: v(0, 1, 0), radius: 0.2 * b, length: 0.03 * b, material: 'mesh' });
    addRoute(plan, { part: 'oil-pickup', channel: 'suction', points: [pick.clone(), v(0, pick.y + 0.1 * R, pick.z), v(0, inlet.y - 0.1 * R, zPump), inlet], radius: OIL_SIZES.suction * b });
  }
  plan.parts.push({ part: 'oil-relief', shape: 'cylinder', position: outlet.clone().add(v(0.06 * R, -0.05 * R, 0)), axis: v(0, 1, 0), radius: 0.04 * b, length: 0.14 * b, material: 'metal' });
  addRoute(plan, { part: 'oil-relief', channel: 'relief', points: [outlet.clone(), outlet.clone().add(v(0.1 * R, -0.12 * R, 0)), inlet.clone().add(v(0.12 * R, 0, 0)), inlet.clone()], radius: lr });

  // Out to the coolers at the front of the car and back to the filter on the side of the front housing.
  const filter = v(a.half + 0.26 * R, -0.42 * a.tall, a.rotorZ[0]!);
  let from = outlet.clone();
  if (systems.oilCooler !== 'none') {
    const out = v(0.55 * R, -0.5 * R, zFrontPlate + 1.0 * R);
    plan.parts.push({ part: 'oil-cooler', shape: 'box', position: out.clone().add(v(0, 0, 0.18 * R)), half: v(0.3 * R, 0.2 * R, 0.05 * R), material: systems.oilCooler === 'air' ? 'mesh' : 'metal' });
    addRoute(plan, { part: 'oil-cooler', channel: 'pressure', points: [outlet.clone(), v(out.x - 0.1 * R, outlet.y, zPump + 0.1), v(out.x - 0.1 * R, out.y, out.z + 0.16 * R)], radius: lr });
    from = v(out.x + 0.12 * R, out.y - 0.06 * R, out.z + 0.16 * R);
  }
  if (systems.oilFilter) plan.parts.push({ part: 'oil-filter', shape: 'cylinder', position: filter, axis: v(1, -0.3, 0).normalize(), radius: 0.24 * R, length: 0.55 * R, material: 'dark' });
  const filterMount = v(a.half + 0.02, filter.y + 0.05 * R, filter.z);
  addRoute(plan, { part: systems.oilFilter ? 'oil-filter' : 'oil-pump', channel: 'pressure', points: [from, v(filterMount.x + 0.1 * R, from.y, filter.z + 0.2 * R), filterMount.clone().add(v(0.06 * R, 0, 0))], radius: lr });

  // Gallery in the housings' lower wall, between the trochoid and the outside, from the front cover to the rear.
  const yg = -1.14 * (R + a.e);
  addRoute(plan, { part: 'oil-gallery', channel: 'pressure', points: [filterMount.clone(), v(0.3 * R, yg, filter.z), v(0, yg, zFrontPlate)], radius: lr });
  addRoute(plan, { part: 'oil-gallery', channel: 'gallery', points: [v(0, yg, zFrontPlate), v(0, yg, zRearPlate)], radius: OIL_SIZES.gallery * b });
  // Main bearings in the end housings, and the way into the shaft's axial drilling at the front.
  for (const z of [zFrontPlate - 0.04, zRearPlate + 0.04]) addRoute(plan, { part: 'oil-gallery', channel: 'mains', points: [v(0, yg, z), v(0, -0.22 * R, z)], radius: dr });
  addRoute(plan, { part: 'crank-drilling', channel: 'crank', points: [v(0, 0, zFrontPlate + 0.02), v(0, 0, zRearPlate - 0.02)], radius: dr, space: 'shaft', overlay: true });
  a.rotorZ.forEach((_z, i) => {
    const c = journalCentre(a, i);
    const dir = v(c.x, c.y, 0).normalize();
    addRoute(plan, { part: 'crank-drilling', channel: 'crank', points: [v(0, 0, c.z), c.clone().addScaledVector(dir, 0.4 * R)], radius: dr, space: 'shaft', overlay: true });
    // Jets out of the journal cool the rotor from inside.
    for (const s of [-0.22, 0.22]) {
      const zj = c.z + s * a.width;
      plan.fixedSprays.push({ part: 'rotor-cooling', channel: 'rotor-jets', from: c.clone().setZ(zj).addScaledVector(dir, 0.44 * R), to: c.clone().setZ(zj).addScaledVector(dir, 0.8 * R), radius: 0.1 * R, space: 'shaft', overlay: true });
    }
  });

  // Metering pump beside the oil pump, with lines to two nozzles per rotor: in the intake port and on top of the housing.
  const meter = v(-0.4 * R, -0.5 * R, zPump);
  plan.parts.push({ part: 'metering-pump', shape: 'box', position: meter, half: v(0.1 * R, 0.08 * R, 0.05), material: 'tint' });
  const up = v(-a.half - 0.08, meter.y, zPump + 0.04);
  a.rotorZ.forEach((z, i) => {
    const runner = a.runners.find((r) => r.rotor === i);
    if (runner) {
      const port = pointAlong(runner.points, 0.2);
      addRoute(plan, { part: 'oil-nozzle', channel: 'metering', points: [meter.clone(), up.clone(), v(port.x - 0.06, port.y - 0.15 * R, z), port], radius: 0.012 * b });
      plan.parts.push({ part: 'oil-nozzle', shape: 'cylinder', position: port.clone(), axis: v(0, 1, 0), radius: 0.03 * R, length: 0.1 * R, material: 'metal' });
    }
    const top = v(0, 0.95 * a.tall, z);
    addRoute(plan, { part: 'oil-nozzle', channel: 'metering', points: [meter.clone(), up.clone().setY(0.95 * a.tall), v(-0.25 * R, 0.95 * a.tall, z), top], radius: 0.012 * b });
    plan.parts.push({ part: 'oil-nozzle', shape: 'cylinder', position: top.clone(), axis: v(0, 1, 0), radius: 0.03 * R, length: 0.12 * R, material: 'metal' });
  });

  // Oil falls back from the end housings into the pan.
  for (const z of [zFrontPlate - 0.05, zRearPlate + 0.05]) {
    addRoute(plan, { part: 'oil-drain', channel: 'drain', points: [v(-0.35 * R, -0.25 * R, z), v(-0.35 * R, sump.pan.top - 0.04, z), v(-0.35 * R, sump.levelY + 0.08 * R, z)], radius: OIL_SIZES.drain * b * 0.7 });
  }
  plan.level = { y: sump.levelY, halfW: sump.pan.halfW - 0.02, zMin: sump.pan.zMin + 0.02, zMax: sump.pan.zMax - 0.02, bottom: sump.pan.bottom + 0.01, top: sump.pan.top };
  addScavenge(plan, sump, inlet, b);
  return plan;
}
