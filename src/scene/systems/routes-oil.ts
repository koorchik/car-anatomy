// Where the oil goes in a piston engine: pan, pickup, pump, relief valve, filter, main gallery, the drillings to the
// main bearings and through the crank to the rod bearings, up to the head, the turbo, the piston jets and back down.
// One plausible layout per engine shape, derived from the model's own parts (anchors). Positions keep clear of the
// liners, valves, cams and the crank's sweep; tests/systems-routes.test.ts checks every catalogue engine.

import * as THREE from 'three';
import { DEG, type Engine } from '../../engine/kinematics.ts';
import type { SystemsSpec } from '../../engine/systems-spec.ts';
import type { SumpLayout } from '../../systems/sump.ts';
import type { PistonAnchors } from './anchors.ts';
import { addRoute, bankPoint, emptyPlan, insideWithMargin, toBank, type LayerPlan } from './route.ts';

const MM = 0.01;

/** Main gallery, drilling and line sizes, in bores. */
export const OIL_SIZES = { gallery: 0.035, drilling: 0.022, suction: 0.05, line: 0.025, drain: 0.04 };

const isFlat = (a: PistonAnchors): boolean => a.banks.length === 2 && Math.abs(a.banks[0]!.alpha - a.banks[1]!.alpha) > 150;

/** Side of the engine the filter and the gallery are on: the intake side of an inline engine. */
const filterSide = (a: PistonAnchors): number => (a.filter ? Math.sign(a.filter.position.x) || -1 : -1);

/**
 * The main gallery's place in the block section: on the filter side of an inline engine, under the valley of a V,
 * above the crank of a boxer. Then moved along its radius until it sits inside the casting and outside the
 * counterweights' sweep, with room for its own radius.
 */
export function galleryPoint(a: PistonAnchors): THREE.Vector2 {
  const b = a.bore;
  const rc = a.crankcaseR;
  const gr = OIL_SIZES.gallery * b;
  const margin = gr + 0.02 * b;
  const sweep = a.crankSweep + gr + 0.04 * b;
  let dir: THREE.Vector2;
  let radius: number;
  if (isFlat(a)) {
    dir = new THREE.Vector2(0, 1);
    radius = Math.max(0.8 * rc, sweep);
  } else if (a.banks.length === 2) {
    // The valley floor is the section's corner between the banks, closer to the crank than the decks.
    const lo = Math.min(a.banks[0]!.alpha, a.banks[1]!.alpha);
    const hi = Math.max(a.banks[0]!.alpha, a.banks[1]!.alpha);
    const floor = a.section
      .filter((p) => p.length() < a.deck * 0.95)
      .map((p) => ({ p, angle: Math.atan2(p.x, p.y) / DEG }))
      .filter(({ angle }) => angle > lo + 1 && angle < hi - 1)
      .sort((x, y) => x.p.length() - y.p.length())[0]?.p;
    const mid = ((lo + hi) / 2) * DEG;
    dir = floor ? floor.clone().normalize() : new THREE.Vector2(Math.sin(mid), Math.cos(mid));
    radius = Math.min(0.9 * rc, (floor?.length() ?? rc) - 0.06 * b);
  } else {
    const p = bankPoint(a.banks[0]!.alpha, filterSide(a) * 0.7 * rc, 0.55 * rc, 0);
    dir = new THREE.Vector2(p.x, p.y).normalize();
    radius = Math.hypot(p.x, p.y);
  }
  const fits = (r: number, d: THREE.Vector2): boolean => r >= sweep && insideWithMargin(d.x * r, d.y * r, margin, a.section);
  // Nearest radius along this direction that fits; if none, turn the direction a little at a time.
  for (let turn = 0; turn <= 24; turn++) {
    const angle = (turn % 2 ? 1 : -1) * Math.ceil(turn / 2) * 4 * DEG;
    const d = dir.clone().rotateAround(new THREE.Vector2(), angle);
    for (let step = 0; step < 200; step++) {
      for (const r of [radius - step * 0.01 * b, radius + step * 0.01 * b]) if (fits(r, d)) return d.multiplyScalar(r);
    }
  }
  return dir.multiplyScalar(radius);
}

/** Main bearing positions along Z: before the first throw, between each pair and after the last. */
export function mainBearingZ(engine: Engine, a: PistonAnchors): number[] {
  const b = a.bore;
  const web = engine.rodWidth * MM * 0.58;
  const throws = [...engine.throws].sort((p, q) => q.z - p.z);
  const zs = [throws[0]!.z * MM + (throws[0]!.length * MM) / 2 + web + 0.08 * b];
  for (let i = 1; i < throws.length; i++) zs.push(((throws[i - 1]!.z + throws[i]!.z) / 2) * MM);
  const last = throws[throws.length - 1]!;
  zs.push(last.z * MM - (last.length * MM) / 2 - web - 0.08 * b);
  return zs;
}

export function oilPlan(engine: Engine, systems: SystemsSpec, a: PistonAnchors, sump: SumpLayout): LayerPlan {
  const plan = emptyPlan();
  const b = a.bore;
  const pan = sump.pan;
  const flat = isFlat(a);
  const side = filterSide(a);
  const gr = OIL_SIZES.gallery * b;
  const dr = OIL_SIZES.drilling * b;
  const lr = OIL_SIZES.line * b;
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const g = galleryPoint(a);
  const galleryFront = a.front - 0.14 * b;
  const galleryRear = a.rear + 0.14 * b;
  const below = -(a.crankSweep + 0.07 * b);

  // Pump: a gerotor round the crank nose under the timing cover, or a body in the pan with its own drive.
  const onCrank = systems.oilPump === 'crank';
  const zPump = onCrank ? a.front + 0.12 * b : pan.zMax - 0.2 * b;
  const pumpY = onCrank ? 0 : Math.max(pan.bottom + 0.35 * pan.depth, sump.levelY - 0.1 * b);
  const inlet = onCrank ? v(0, -0.34 * b, zPump) : v(0, pumpY - 0.16 * b, zPump);
  const outlet = onCrank ? v(side * 0.32 * b, -0.12 * b, zPump) : v(side * 0.1 * b, pumpY + 0.16 * b, zPump);
  if (onCrank) {
    plan.parts.push({ part: 'oil-pump', shape: 'ring', position: v(0, 0, zPump), radius: 0.36 * b, inner: 0.24 * b, length: 0.08 * b, material: 'metal' });
    // The inner rotor turns with the crank.
    plan.parts.push({ part: 'oil-pump', shape: 'ring', position: v(0, 0, zPump), radius: 0.23 * b, inner: 0.15 * b, length: 0.06 * b, material: 'tint', space: 'crank' });
  } else {
    plan.parts.push({ part: 'oil-pump', shape: 'box', position: v(0, pumpY, zPump), half: v(0.2 * b, 0.16 * b, 0.12 * b), material: 'metal' });
    if (systems.oilPump === 'chain') {
      // A chain from a second sprocket on the crank nose, just behind the timing drive.
      const zc = a.front - 0.05 * b;
      const loop = [v(0.2 * b, 0, zc), v(0.12 * b, pumpY, zc), v(-0.12 * b, pumpY, zc), v(-0.2 * b, 0, zc)];
      plan.parts.push({ part: 'oil-pump', shape: 'cylinder', position: v(0, pumpY, (zc + zPump) / 2), radius: 0.03 * b, length: Math.abs(zc - zPump), material: 'metal' });
      addRoute(plan, { part: 'oil-pump', channel: 'pump-drive', points: [...loop, loop[0]!], radius: 0.014 * b });
    } else {
      // A shaft down from the camshaft or an auxiliary shaft beside it.
      const top = a.blockCam ? v(a.blockCam.x, a.blockCam.y, zPump) : v(side * 0.45 * b, 0.35 * a.crankcaseR, zPump);
      plan.parts.push({ part: 'oil-pump', shape: 'cylinder', position: top.clone().lerp(v(0, pumpY + 0.16 * b, zPump), 0.5), axis: v(0, pumpY + 0.16 * b, zPump).sub(top).normalize(), radius: 0.025 * b, length: top.distanceTo(v(0, pumpY + 0.16 * b, zPump)), material: 'metal' });
    }
  }

  // Pickup under the oil, its screen, and the suction tube that keeps below the crank's sweep. With a tank the
  // pressure stage draws from the tank instead (addScavenge), and the pan has only the scavenge pickups.
  if (!sump.tank) {
    const pick = sump.pressureInlet;
    plan.parts.push({ part: 'oil-pickup', shape: 'disc', position: pick.clone(), axis: v(0, 1, 0), radius: 0.2 * b, length: 0.03 * b, material: 'mesh' });
    const suction = onCrank
      ? [pick.clone(), v(0, Math.min(below, pick.y + 0.25 * b), pick.z), v(0, Math.min(below, pick.y + 0.25 * b), zPump), inlet]
      : [pick.clone(), v(0, pick.y + 0.08 * b, pick.z), v(0, inlet.y - 0.06 * b, zPump), inlet];
    addRoute(plan, { part: 'oil-pickup', channel: 'suction', points: suction, radius: OIL_SIZES.suction * b });
  }

  // Relief valve on the pump outlet, returning the surplus to the inlet.
  plan.parts.push({ part: 'oil-relief', shape: 'cylinder', position: outlet.clone().add(v(side * 0.08 * b, -0.04 * b, 0)), axis: v(0, 1, 0), radius: 0.05 * b, length: 0.16 * b, material: 'metal' });
  addRoute(plan, { part: 'oil-relief', channel: 'relief', points: [outlet.clone(), outlet.clone().add(v(side * 0.12 * b, -0.12 * b, 0)), inlet.clone().add(v(side * 0.14 * b, 0, 0)), inlet.clone()], radius: lr });

  // Filter: where the solid look hangs its can, or under the front of a boxer.
  let filterIn: THREE.Vector3;
  let filterOut: THREE.Vector3;
  let filterZ: number;
  if (a.filter && !flat) {
    const axis = v(-Math.sin(a.filter.rotationZ), Math.cos(a.filter.rotationZ), 0);
    const mount = a.filter.position.clone().addScaledVector(axis, axis.y < 0 ? 0.36 * b : -0.36 * b);
    filterZ = mount.z;
    const can = a.filter.position.clone();
    if (systems.oilFilter) plan.parts.push({ part: 'oil-filter', shape: 'cylinder', position: can, axis, radius: 0.3 * b, length: 0.68 * b, material: 'dark' });
    filterIn = mount.clone().add(v(0, 0.05 * b, 0.06 * b));
    filterOut = mount.clone().add(v(0, -0.05 * b, -0.06 * b));
  } else {
    filterZ = a.front + 0.24 * b;
    const can = v(0, -(a.pulley.r + 0.42 * b), filterZ);
    if (systems.oilFilter) plan.parts.push({ part: 'oil-filter', shape: 'cylinder', position: can, axis: v(0, 1, 0), radius: 0.28 * b, length: 0.62 * b, material: 'dark' });
    filterIn = can.clone().add(v(0.06 * b, 0.32 * b, 0));
    filterOut = can.clone().add(v(-0.06 * b, 0.32 * b, 0));
  }
  const sideX = side * (a.crankcaseR - 0.1 * b);
  const toFilter = flat
    ? [outlet.clone(), v(outlet.x, outlet.y, filterZ - 0.08 * b), filterIn]
    : [outlet.clone(), v(sideX, -0.15 * a.crankcaseR, zPump - 0.05 * b), v(sideX, -0.15 * a.crankcaseR, filterZ + 0.06 * b), filterIn];
  addRoute(plan, { part: systems.oilFilter ? 'oil-filter' : 'oil-pump', channel: 'pressure', points: toFilter, radius: lr });

  // Oil cooler between the filter and the block, or out in the airflow.
  let feedStart = filterOut;
  if (systems.oilCooler === 'coolant') {
    const pack = filterOut.clone().lerp(v(g.x, g.y, filterZ), 0.35);
    plan.parts.push({ part: 'oil-cooler', shape: 'box', position: pack, half: v(0.16 * b, 0.16 * b, 0.12 * b), material: 'metal' });
  } else if (systems.oilCooler === 'air') {
    const out = flat ? v(0.6 * b, filterOut.y, a.front + 0.9 * b) : v(side * (a.crankcaseR + 0.5 * b), filterOut.y, a.front + 0.7 * b);
    plan.parts.push({ part: 'oil-cooler', shape: 'box', position: out.clone().add(v(0, 0, 0.22 * b)), half: v(0.32 * b, 0.22 * b, 0.05 * b), material: 'mesh' });
    addRoute(plan, { part: 'oil-cooler', channel: 'pressure', points: [filterOut.clone(), v(out.x - 0.1 * b, out.y, filterZ), v(out.x - 0.1 * b, out.y, out.z + 0.2 * b)], radius: lr });
    const back = v(out.x + 0.1 * b, out.y - 0.08 * b, out.z + 0.2 * b);
    addRoute(plan, { part: 'oil-cooler', channel: 'pressure', points: [back, v(back.x, back.y, filterZ - 0.1 * b), filterOut.clone().add(v(0, -0.06 * b, -0.1 * b))], radius: lr });
    feedStart = filterOut.clone().add(v(0, -0.06 * b, -0.1 * b));
  }

  // Main gallery along the block, fed at the filter and running both ways.
  const entry = v(g.x, g.y, Math.min(Math.max(filterZ, galleryRear + 0.2 * b), galleryFront - 0.2 * b));
  addRoute(plan, { part: 'oil-gallery', channel: 'pressure', points: [feedStart.clone(), entry.clone().lerp(feedStart, 0.5).setZ(entry.z), entry.clone()], radius: lr });
  addRoute(plan, { part: 'oil-gallery', channel: 'gallery', points: [entry.clone(), v(g.x, g.y, galleryFront)], radius: gr });
  addRoute(plan, { part: 'oil-gallery', channel: 'gallery', points: [entry.clone(), v(g.x, g.y, galleryRear)], radius: gr });

  // Drillings down to every main bearing, and through the crank from each main to its neighbour's crankpin.
  const mains = mainBearingZ(engine, a);
  const toAxis = new THREE.Vector2(g.x, g.y).normalize();
  for (const z of mains) {
    addRoute(plan, { part: 'oil-gallery', channel: 'mains', points: [v(g.x, g.y, z), v(toAxis.x * a.mainR, toAxis.y * a.mainR, z)], radius: dr });
  }
  const sortedThrows = [...engine.throws].sort((p, q) => q.z - p.z);
  sortedThrows.forEach((t, i) => {
    const zMain = mains[i]!;
    const angle = t.angle * DEG;
    addRoute(plan, {
      part: 'crank-drilling',
      channel: 'crank',
      points: [v(0, 0, zMain), v(a.crankR * Math.sin(angle), a.crankR * Math.cos(angle), t.z * MM)],
      radius: dr * 0.9,
      space: 'crank',
      overlay: true,
    });
  });

  // Up to each head at its rear end, then along the head clear of the valves, with drillings to the cam journals.
  const ohv = engine.spec.valvetrain === 'ohv';
  a.banks.forEach((bank, bi) => {
    const intake = -bank.exhaustSide;
    const hw = bank.halfWidth;
    const cyls = a.cylinders.filter((c) => c.bank === bi).map((c) => c.z).sort((p, q) => p - q);
    const zRear = cyls[0]! - 0.58 * b;
    const zFront = cyls[cyls.length - 1]! + 0.5 * b;
    const x = intake * (hw - 0.08 * b);
    const yHead = a.deck + 0.35 * b;
    const gb = toBank(bank.alpha, v(g.x, g.y, 0));
    const wallY = Math.sqrt(Math.max(0, a.crankcaseR ** 2 - (hw - 0.08 * b) ** 2));
    const risePoints = [v(g.x, g.y, zRear), bankPoint(bank.alpha, x, Math.max(gb.y, wallY + 0.05 * b), zRear), bankPoint(bank.alpha, x, ohv ? a.deck - 0.1 * b : yHead, zRear)];
    addRoute(plan, { part: 'cam-oil', channel: 'riser', points: risePoints, radius: dr });
    if (ohv) {
      // Lifter galleries beside the camshaft; the hollow pushrods carry the oil up to the rockers.
      const rods = a.pushrods.filter((p) => p.bank === bi);
      if (rods.length) {
        const avg = rods.reduce((s, p) => s.add(p.lifter), new THREE.Vector3()).multiplyScalar(1 / rods.length);
        const zs = rods.map((p) => p.lifter.z);
        const lz0 = Math.min(...zs) - 0.2 * b;
        const lz1 = Math.max(...zs) + 0.2 * b;
        addRoute(plan, { part: 'cam-oil', channel: 'head', points: [v(g.x, g.y, lz0), v(avg.x, avg.y, lz0)], radius: dr });
        addRoute(plan, { part: 'cam-oil', channel: 'head', points: [v(avg.x, avg.y, lz0), v(avg.x, avg.y, lz1)], radius: dr });
        for (const p of rods) addRoute(plan, { part: 'cam-oil', channel: 'head', points: [p.rodEnd.clone(), p.pivot.clone()], radius: dr * 0.8 });
      }
      return;
    }
    addRoute(plan, { part: 'cam-oil', channel: 'head', points: [bankPoint(bank.alpha, x, yHead, zRear), bankPoint(bank.alpha, x, yHead, zFront)], radius: dr * 1.3 });
    // Cam journals sit between the cylinders and at the ends, where no valve is in the way.
    const valveZ = a.valves.filter((vv) => a.cylinders.find((c) => c.n === vv.n)!.bank === bi).map((vv) => new THREE.Vector3().setFromMatrixPosition(vv.base).z);
    const journals = [cyls[0]! - 0.42 * b, ...cyls.slice(1).map((z, i) => (z + cyls[i]!) / 2), cyls[cyls.length - 1]! + 0.42 * b].filter((z) =>
      valveZ.every((vz) => Math.abs(vz - z) > a.springR + 0.03 * b),
    );
    for (const cam of a.cams.filter((c) => c.bank === bi)) {
      for (const z of journals) {
        if (z < cam.zMin || z > cam.zMax) continue;
        addRoute(plan, { part: 'cam-oil', channel: 'head', points: [bankPoint(bank.alpha, x, yHead, z), bankPoint(bank.alpha, cam.x, cam.y - 0.1 * b, z)], radius: dr * 0.8 });
      }
    }
  });

  // A jet onto the timing chain.
  addRoute(plan, { part: 'oil-gallery', channel: 'chain', points: [v(g.x, g.y, galleryFront), v(g.x * 0.6, g.y * 0.6 + 0.1 * b, a.front - 0.02 * b)], radius: dr * 0.8 });

  // Piston cooling jets under each cylinder, fed by a gallery of their own.
  if (systems.pistonJets) {
    a.banks.forEach((bank, bi) => {
      const js = bank.exhaustSide;
      const y = a.linerBottom - 0.06 * b;
      const cyls = a.cylinders.map((c, i) => ({ c, i })).filter(({ c }) => c.bank === bi);
      const zs = cyls.map(({ c }) => c.z);
      const z0 = Math.max(...zs) + 0.45 * b;
      const z1 = Math.min(...zs) - 0.3 * b;
      const x = js * 0.38 * b;
      addRoute(plan, { part: 'piston-jet', channel: 'jets', points: [v(g.x, g.y, galleryFront - 0.05 * b), bankPoint(bank.alpha, x, y, z0)], radius: dr });
      addRoute(plan, { part: 'piston-jet', channel: 'jets', points: [bankPoint(bank.alpha, x, y, z0), bankPoint(bank.alpha, x, y, z1)], radius: dr });
      for (const { c, i } of cyls) {
        const nozzle = new THREE.Vector2(js * 0.38 * b, y + 0.04 * b);
        plan.pistonSprays.push({ part: 'piston-jet', channel: 'jets', cylinder: i, from: nozzle, toX: js * 0.12 * b, aboveWrist: 0.08 * b, radius: 0.05 * b });
        const p = bankPoint(c.alpha, nozzle.x, nozzle.y, c.z);
        plan.parts.push({ part: 'piston-jet', shape: 'cylinder', position: p, axis: v(0, 1, 0), radius: 0.02 * b, length: 0.06 * b, material: 'metal' });
      }
    });
  }

  // Turbo bearings: a feed from the gallery, and a fat drain falling to the crankcase above the oil.
  for (const t of a.turbos) {
    t.unit.updateMatrix();
    const oilIn = t.oilIn.clone().applyMatrix4(t.unit.matrix);
    const oilOut = t.oilOut.clone().applyMatrix4(t.unit.matrix);
    const zg = Math.min(Math.max(oilIn.z, galleryRear), galleryFront);
    const wall = v(t.sign * (a.crankcaseR + 0.08 * b), g.y, zg);
    addRoute(plan, { part: 'turbo-oil', channel: 'turbo', points: [v(g.x, g.y, zg), wall, v(oilIn.x, Math.max(oilIn.y, wall.y) + 0.25 * b, oilIn.z), oilIn], radius: lr * 0.8 });
    const entryY = Math.max(sump.levelY + 0.12 * b, Math.min(oilOut.y - 0.3 * b, pan.top - 0.05 * b));
    const entry = v(t.sign * (pan.halfW - 0.02 * b), entryY, Math.min(Math.max(oilOut.z, pan.zMin + 0.1 * b), pan.zMax - 0.1 * b));
    if (oilOut.y - entryY > 0.1 * b) {
      // Straight down from the bearing housing, then into the crankcase above the oil.
      const knee = v(oilOut.x, oilOut.y - (oilOut.y - entryY) * 0.55, oilOut.z);
      addRoute(plan, { part: 'turbo-oil', channel: 'turbo-drain', points: [oilOut, knee, entry], radius: OIL_SIZES.drain * b });
    } else {
      // A turbo hung below the oil in the crankcase can't drain by gravity: a scavenge pump lifts its oil back.
      const pump = v(oilOut.x, oilOut.y - 0.3 * b, oilOut.z);
      plan.parts.push({ part: 'turbo-scavenge', shape: 'box', position: pump.clone().add(v(0, -0.06 * b, 0)), half: v(0.09 * b, 0.07 * b, 0.09 * b), material: 'metal' });
      addRoute(plan, { part: 'turbo-oil', channel: 'turbo-drain', points: [oilOut, pump], radius: OIL_SIZES.drain * b });
      addRoute(plan, { part: 'turbo-scavenge', channel: 'turbo', points: [pump.clone().add(v(t.sign * 0.09 * b, 0, 0)), v(entry.x + t.sign * 0.3 * b, pump.y, entry.z), v(entry.x + t.sign * 0.3 * b, entry.y + 0.1 * b, entry.z), entry], radius: lr * 0.8 });
    }
  }

  // Oil running back from the heads down the outer walls into the pan, above the surface.
  a.banks.forEach((bank) => {
    const xo = bank.exhaustSide * (bank.halfWidth - 0.05 * b);
    const z = bank.zMax - 0.12 * b;
    const wallY = Math.sqrt(Math.max(0, a.crankcaseR ** 2 - (bank.halfWidth - 0.05 * b) ** 2));
    const top = bankPoint(bank.alpha, xo, a.deck + 0.12 * b, z);
    const mid = bankPoint(bank.alpha, xo, wallY, z);
    const into = v(Math.sign(mid.x || bank.exhaustSide) * Math.min(Math.abs(mid.x), pan.halfW - 0.05 * b), Math.min(mid.y - 0.05 * b, pan.top - 0.05 * b), Math.min(z, pan.zMax - 0.1 * b));
    const out = v(into.x, sump.levelY + 0.1 * b, into.z);
    addRoute(plan, { part: 'oil-drain', channel: 'drain', points: [top, mid, into, out], radius: OIL_SIZES.drain * b * 0.8 });
  });

  plan.level = { y: sump.levelY, halfW: pan.halfW - 0.015 * b, zMin: pan.zMin + 0.02 * b, zMax: pan.zMax - 0.02 * b, bottom: pan.bottom + 0.015 * b, top: pan.top };
  // Dry sump: scavenge stages beside the pressure pump, each with its pickup, and the tank feeding the pressure stage.
  addScavenge(plan, sump, inlet, b);
  return plan;
}

/**
 * Drawn only when feature/oil-sump gives the layout pickups and a tank; a wet sump has neither. The scavenge stages
 * return the oil to the tank, and the pressure stage draws from the tank's outlet (sump.pressureInlet).
 */
export function addScavenge(plan: LayerPlan, sump: SumpLayout, pumpInlet: THREE.Vector3, b: number): void {
  const stage = (i: number): THREE.Vector3 => pumpInlet.clone().add(new THREE.Vector3(0, -0.04 * b, -(i + 1) * 0.14 * b));
  sump.scavengePickups.forEach((p, i) => {
    plan.parts.push({ part: 'oil-pickup', shape: 'disc', position: p.clone(), axis: new THREE.Vector3(0, 1, 0), radius: 0.12 * b, length: 0.03 * b, material: 'mesh' });
    addRoute(plan, { part: 'oil-pump', channel: 'scavenge', points: [p.clone(), new THREE.Vector3(p.x, p.y + 0.12 * b, p.z), stage(i)], radius: OIL_SIZES.suction * b * 0.8 });
  });
  if (!sump.tank) return;
  const tank = sump.tank;
  plan.parts.push({ part: 'oil-tank', shape: 'cylinder', position: tank.position.clone(), axis: new THREE.Vector3(0, 1, 0), radius: tank.radius, length: tank.height, material: 'metal' });
  const top = tank.position.clone().add(new THREE.Vector3(0, tank.height / 2, 0));
  if (sump.scavengePickups.length) {
    const last = stage(sump.scavengePickups.length - 1);
    addRoute(plan, { part: 'oil-tank', channel: 'scavenge', points: [last, new THREE.Vector3(top.x, last.y, last.z), top], radius: OIL_SIZES.line * b });
  }
  // From the tank's outlet, where the layout says the pressure stage draws, down and across to the pump.
  const outlet = sump.pressureInlet.clone();
  addRoute(plan, { part: 'oil-tank', channel: 'tank', points: [outlet, new THREE.Vector3(outlet.x, Math.min(pumpInlet.y, outlet.y - 0.05 * b), outlet.z), pumpInlet.clone()], radius: OIL_SIZES.suction * b });
}
