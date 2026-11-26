// The radiator, the intercooler and the fuel tank of a car (stage C1a; the whole-car plan, the overview): simple
// parametric bodies at the record's packaging points, with hoses from the open ends the systems layers leave on the
// engine (the coolant layer's radiator hoses, the air layer's pipes to the intercooler) to their ports. The systems
// plan leaves the radiator off the engine page on purpose, as it would shrink the engine on screen; in a car it stands
// where it is and shrinks nothing. The fuel line to the tank comes with stage C8.
//
// Front-axle frame (car.ts), metres; scene = (y, z, x)·10. Sizes are typical, not measured: no record gives them, and
// the cards say so.

import * as THREE from 'three';
import type { PlacedPart, Vec3 } from '../../vehicle/car.ts';
import { placedPoints, type Box3 } from '../../vehicle/packaging.ts';
import { tubeAlong } from '../geometry.ts';
import { toScene } from './car-frame.ts';
import { SimpleModel } from './simple-model.ts';

/** Sizes, m: typical of a car of this size. Width across the car, height, depth along it. */
export const ANCILLARY = {
  radiator: { width: 0.66, height: 0.42, depth: 0.04, tank: 0.045 },
  /** A pair of radiators behind the front corners ('both') is narrower each. */
  radiatorPair: { width: 0.36, height: 0.36, depth: 0.04, tank: 0.04 },
  intercooler: { width: 0.62, height: 0.16, depth: 0.065, tank: 0.07 },
  intercoolerPair: { width: 0.3, height: 0.08, depth: 0.25, tank: 0.05 },
  fuelTank: { width: 0.72, height: 0.22, depth: 0.46 },
  coolantHoseR: 0.016,
  chargePipeR: 0.028,
} as const;

/** An open end on the engine a hose leaves from, front-axle frame, and the way it points. */
export interface HoseEnd {
  at: Vec3;
  /** Unit direction the stub points out of the engine, front-axle frame. */
  out: Vec3;
}

interface CoreSize {
  width: number;
  height: number;
  depth: number;
  tank: number;
}

/** A heat exchanger's ports: the end tanks' tops and bottoms on each side, front-axle frame. */
interface Ports {
  left: { top: Vec3; bottom: Vec3; middle: Vec3 };
  right: { top: Vec3; bottom: Vec3; middle: Vec3 };
}

function portsOf(at: Vec3, size: CoreSize): Ports {
  const side = (s: number) => {
    const y = at[1] + s * (size.width / 2 - size.tank / 2);
    const back = at[0] - size.depth / 2 - 0.01;
    return { top: [back, y, at[2] + size.height / 2 - 0.05] as Vec3, bottom: [back, y, at[2] - size.height / 2 + 0.05] as Vec3, middle: [back, y, at[2]] as Vec3 };
  };
  return { left: side(1), right: side(-1) };
}

/** A box with its centre at `at` (front-axle frame) and sizes along y, z and x, in the scene. */
function box(at: Vec3, width: number, height: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(width * 10, height * 10, depth * 10);
  g.translate(...toScene(at).toArray());
  return g;
}

/** A hose from an open end on the engine to a port: out of the stub, then round to the port from behind it. */
function hoseCurve(from: HoseEnd, to: Vec3): THREE.Vector3[] {
  const a = from.at;
  const lead: Vec3 = [a[0] + from.out[0] * 0.08, a[1] + from.out[1] * 0.08, a[2] + from.out[2] * 0.08];
  const approach: Vec3 = [to[0] - 0.08, to[1], to[2]];
  const middle: Vec3 = [(lead[0] + approach[0]) / 2, (lead[1] + approach[1]) / 2, Math.max(lead[2], approach[2]) - 0.02];
  return [a, lead, middle, approach, to].map((p) => toScene(p));
}

/** A core's outer box with its end tanks, front-axle frame. */
function coreBox(at: Vec3, size: CoreSize): Box3 {
  const half: Vec3 = [(size.depth + 0.01) / 2, size.width / 2, (size.height + 0.02) / 2];
  return { min: [at[0] - half[0], at[1] - half[1], at[2] - half[2]], max: [at[0] + half[0], at[1] + half[1], at[2] + half[2]] };
}

/** Room left between a pipe's wall and a core it passes, m. */
const CLEAR_M = 0.015;

/**
 * A charge pipe from a port under an end tank of a core ahead of `keepOut` (the radiator behind a front intercooler):
 * down out of the tank, back under every core in the way, then up behind them to the open end on the engine. A pipe
 * drawn straight back would run through the radiator's fins.
 */
function underCurve(from: HoseEnd, port: Vec3, front: Box3, keepOut: readonly Box3[], radius: number): THREE.Vector3[] {
  const a = from.at;
  const lead: Vec3 = [a[0] + from.out[0] * 0.08, a[1] + from.out[1] * 0.08, a[2] + from.out[2] * 0.08];
  const low = Math.min(front.min[2], ...keepOut.map((b) => b.min[2])) - radius - CLEAR_M;
  const back = Math.min(...keepOut.map((b) => b.min[0])) - radius - CLEAR_M;
  const y = port[1];
  const points: Vec3[] = [port, [port[0], y, low], [back, y, low], [back - 0.04, y, low + 0.06], [(back + lead[0]) / 2, (y + lead[1]) / 2, (low + lead[2]) / 2], lead, a];
  return points.reverse().map((p) => toScene(p));
}

class ExchangerModel extends SimpleModel {
  /** A core of fins between two end tanks, standing across the car. */
  protected core(at: Vec3, size: CoreSize, part: string): void {
    const finSolid = this.material('#4e5a60', 0.6, 0.55);
    const tankSolid = this.material('#2f3438', 0.3, 0.6);
    const glass = this.glass('#cfe3ea', 0.06, 0.45);
    this.shell(box(at, size.width - 2 * size.tank, size.height, size.depth), finSolid, glass, part);
    for (const s of [1, -1]) {
      const y = at[1] + s * (size.width / 2 - size.tank / 2);
      this.shell(box([at[0], y, at[2]], size.tank, size.height + 0.02, size.depth + 0.01), tankSolid, glass, part);
    }
  }

  protected hose(points: THREE.Vector3[], radius: number, material: THREE.MeshStandardMaterial, part: string): void {
    this.solid(tubeAlong(points, radius * 10, 32, 10), material, part);
  }

  protected rubber(): THREE.MeshStandardMaterial {
    return this.material('#1d2124', 0.05, 0.85);
  }

  protected aluminium(): THREE.MeshStandardMaterial {
    return this.material('#aab0b3', 0.85, 0.35);
  }
}

/** The radiator (or the pair of them) and the hoses from the coolant layer's open ends: the higher to a top port. */
export class RadiatorModel extends ExchangerModel {
  /** Each core's outer box, front-axle frame: what the intercooler's pipes go round. */
  readonly boxes: Box3[];

  constructor(part: PlacedPart, hoses: HoseEnd[], highlight: THREE.ColorRepresentation) {
    super(highlight);
    const size = part.side === 'both' ? ANCILLARY.radiatorPair : ANCILLARY.radiator;
    const cores = placedPoints(part);
    this.boxes = cores.map((at) => coreBox(at, size));
    for (const at of cores) this.core(at, size, 'car.radiator');
    const rubber = this.rubber();
    // Hot coolant to the top of the nearer tank, back from the bottom of the same side: as in a cross-flow radiator
    // with both pipes on one side. A pair takes them on the nearer radiator.
    const ends = [...hoses].sort((a, b) => b.at[2] - a.at[2]);
    ends.forEach((end, i) => {
      const at = cores.reduce((best, c) => (Math.abs(c[1] - end.at[1]) < Math.abs(best[1] - end.at[1]) ? c : best));
      const ports = portsOf(at, size);
      const side = end.at[1] >= at[1] ? ports.left : ports.right;
      this.hose(hoseCurve(end, i === 0 ? side.top : side.bottom), ANCILLARY.coolantHoseR, rubber, 'car.coolant-hose');
    });
  }
}

/**
 * The intercooler and the charge pipes from the air layer's open ends: the end nearer the car's left goes to the left
 * tank, the other to the right, so the air crosses the core. `keepOut` are the cores behind it (the radiator): the pipes
 * leave from under the end tanks and pass beneath them.
 */
export class IntercoolerModel extends ExchangerModel {
  /** Each core's outer box, front-axle frame. */
  readonly boxes: Box3[];

  constructor(part: PlacedPart, ends: HoseEnd[], highlight: THREE.ColorRepresentation, keepOut: readonly Box3[] = []) {
    super(highlight);
    const size = part.side === 'both' ? ANCILLARY.intercoolerPair : ANCILLARY.intercooler;
    const cores = placedPoints(part);
    for (const at of cores) this.core(at, size, 'car.intercooler');
    this.boxes = cores.map((at) => coreBox(at, size));
    if (cores.length !== 1 || ends.length === 0) return;
    const at = cores[0]!;
    const ports = portsOf(at, size);
    const metal = this.aluminium();
    const sorted = [...ends].sort((a, b) => b.at[1] - a.at[1]);
    const behind = keepOut.filter((b) => b.max[0] < this.boxes[0]!.min[0] + 1e-9);
    sorted.forEach((end, i) => {
      const side = i === 0 ? ports.left : ports.right;
      const under: Vec3 = [at[0], side.middle[1], at[2] - size.height / 2 - 0.01];
      const curve = behind.length > 0 ? underCurve(end, under, this.boxes[0]!, behind, ANCILLARY.chargePipeR) : hoseCurve(end, side.middle);
      this.hose(curve, ANCILLARY.chargePipeR, metal, 'car.charge-pipe');
    });
  }
}

/** Room between the exhaust pipe and the tank's tunnel over it, m. */
const TUNNEL_GAP_M = 0.02;

/**
 * The fuel tank: a flat box under the rear seat, at the record's point. Where the exhaust runs under it (`tunnel`: the
 * pipe's centre y, its top's height), the tank is a saddle with a tunnel over the pipe, as real tanks over a centre
 * tunnel are; a flat bottom would sit on the pipe.
 */
export class FuelTankModel extends SimpleModel {
  constructor(at: Vec3, highlight: THREE.ColorRepresentation, tunnel: { y: number; halfWidth: number; top: number } | null = null) {
    super(highlight);
    const { width, height, depth } = ANCILLARY.fuelTank;
    const w = width / 2;
    const h = height / 2;
    // The cross-section across the car, relative to the tank's centre: scene x is the car's y, scene y its z.
    const shape = new THREE.Shape().moveTo(-w * 10, -h * 10);
    const ty = tunnel ? tunnel.y - at[1] : 0;
    const tw = tunnel ? tunnel.halfWidth + TUNNEL_GAP_M : 0;
    const tz = tunnel ? tunnel.top + TUNNEL_GAP_M - at[2] : -h;
    if (tunnel && tz > -h && tz < h && Math.abs(ty) + tw < w) {
      shape.lineTo((ty - tw) * 10, -h * 10).lineTo((ty - tw) * 10, tz * 10).lineTo((ty + tw) * 10, tz * 10).lineTo((ty + tw) * 10, -h * 10);
    }
    shape.lineTo(w * 10, -h * 10).lineTo(w * 10, h * 10).lineTo(-w * 10, h * 10).closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: depth * 10, bevelEnabled: false });
    g.translate(0, 0, (-depth / 2) * 10);
    g.translate(...toScene(at).toArray());
    this.shell(g, this.material('#3a4247', 0.2, 0.7), this.glass('#d8e6c8', 0.06, 0.4), 'car.fuel-tank');
  }
}
