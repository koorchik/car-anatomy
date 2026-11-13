// The spring and damper of a corner in 3D: a MacPherson strut, or a coilover between the body and an arm, a link or
// the knuckle. Both hang the same parts from the top mount along the unit's axis (local −Y of `top`): the chrome rod
// with its piston, the upper spring seat, the bump stop and the coil. The damper's body differs: a strut's tube is
// rigid with the knuckle (or a split knuckle's carrier), so the corner adds `tube` and `oil`, built in that frame, to
// it; a coilover's tube hangs from its lower eye in `bottom`, which points at the top mount each frame.
//
// Lengths along the unit come from the corner: the tube's top meets the bump stop exactly at the stop's contact length
// (resolveCorner), and the rod keeps the piston under the rod guide at top-out.

import * as THREE from 'three';
import { tag } from '../model-types.ts';
import { merge } from '../geometry.ts';
import { boss, CoilSpring, lathe, latheAlong, ringProfile, rodBetween } from './geometry.ts';
import type { CornerMaterials } from './materials.ts';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

export interface DamperUnitSize {
  /** A MacPherson strut (tube on the knuckle, bearing in the top mount) or a coilover. */
  strut: boolean;
  /** Part of the damper's body: 'susp.strut' or 'susp.damper'. */
  part: string;
  /** Radii of the tube and the rod, the coil's mean radius, its turns and closed end turns, scene units. */
  tubeR: number;
  rodR: number;
  springMeanR: number;
  springTurns: number;
  springEndTurns: number;
  /** Upper seat below the top mount and lower seat above the lower point, along the axis, scene units. */
  upperSeat: number;
  lowerSeat: number;
  /** The bump stop's length, the damper's length where the stop touches and at top-out, and its shortest length over
   *  the travel, scene units. */
  stopLength: number;
  contact: number;
  topOut: number;
  shortest: number;
  /** Rod guide at the top of the tube, scene units. */
  guide: number;
  /** Wire diameter of the coil, scene units; null: no coil on this unit (the spring sits elsewhere). */
  wire: number | null;
  /** Lower spring seat's outer radius, scene units. */
  seatR: number;
}

export class DamperUnit {
  /** Hung from the top mount: rod, piston, upper seat, bump stop, coil. Local −Y runs down the axis. */
  readonly top = new THREE.Group();
  readonly topMount: THREE.Mesh;
  /** The upper seat assembly and the rod (and the coil and stop), for the views. */
  readonly upper: THREE.Mesh;
  readonly rod: THREE.Mesh;
  readonly piston: THREE.Mesh;
  readonly bumpStop: THREE.Mesh;
  readonly spring: CoilSpring | null;
  readonly springMesh: THREE.Mesh | null;
  /** A coilover's tube, oil and lower eye hang here: origin at the lower point, +Y towards the top mount. */
  readonly bottom = new THREE.Group();
  readonly tube: THREE.Mesh;
  readonly oil: THREE.Mesh;
  readonly size: DamperUnitSize;
  /** Where the tube's top is, above the lower point along the axis, scene units. */
  readonly tubeTop: number;
  readonly rodLength: number;
  readonly tubeBottom: number;
  /** How far the bump stop is squeezed, 0..1 of its length, after update(). */
  squeeze = 0;
  /** Length top mount to lower point after update(), scene units. */
  length = 0;
  wire: number;
  private readonly d = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();

  /**
   * `tubeAt`: a strut's tube is built at the design lower point along the design axis, in the knuckle's frame; a
   * coilover's is built in `bottom` (pass null).
   */
  constructor(size: DamperUnitSize, m: CornerMaterials, tubeAt: { lower: THREE.Vector3; dir: THREE.Vector3 } | null) {
    this.size = size;
    const s = size;
    this.wire = s.wire ?? 0;
    // The tube's top meets the bump stop exactly when the damper is as short as the stop's contact length.
    this.tubeTop = s.contact - s.upperSeat - s.stopLength;
    // The rod is long enough to keep the piston under the guide at top-out.
    this.rodLength = s.topOut - this.tubeTop + s.guide + 0.1;
    this.tubeBottom = Math.min(-0.1, s.shortest - this.rodLength - 0.25);

    // ---- Top mount on the body: rubber, with the bearing a strut turns on ----
    const k = s.strut ? 1 : 0.72;
    this.topMount = tag(
      new THREE.Mesh(
        merge([
          latheAlong(ringProfile(0.12, 0.72 * k, -0.12 * k, 0.05 * k), new THREE.Vector3(), UP, 32, true),
          latheAlong(ringProfile(0.12, 0.62 * k, 0.05 * k, 0.12 * k), new THREE.Vector3(), UP, 32, true),
        ]),
        m.rubber,
      ),
      'susp.top-mount',
    );

    // ---- Hung from the top: upper seat, rod, piston, bump stop, coil ----
    this.top.name = s.strut ? 'strut-top' : 'damper-top';
    const seatR = s.seatR;
    const upperParts = s.strut
      ? [
          // Bearing under the mount, a neck down to the upper spring seat, and the seat itself.
          latheAlong(ringProfile(0.15, 0.5, -0.2, -0.12), new THREE.Vector3(), UP, 28, true),
          latheAlong(ringProfile(0.15, 0.36, -s.upperSeat + 0.04, -0.2), new THREE.Vector3(), UP, 28, true),
          latheAlong(ringProfile(0.15, seatR, -s.upperSeat, -s.upperSeat + 0.04), new THREE.Vector3(), UP, 36, true),
          // The nut on the rod's end above the mount: the same steel, so the same draw call.
          boss(new THREE.Vector3(0, 0.3, 0), UP, 0.17, 0.12, 6),
        ]
      : [
          latheAlong(ringProfile(s.rodR, 0.3, -s.upperSeat + 0.04, -0.1), new THREE.Vector3(), UP, 24, true),
          // The spring's upper seat, only when the coil is on this unit.
          ...(s.wire !== null ? [latheAlong(ringProfile(s.rodR, seatR, -s.upperSeat, -s.upperSeat + 0.04), new THREE.Vector3(), UP, 32, true)] : []),
          boss(new THREE.Vector3(0, 0.22, 0), UP, 0.14, 0.1, 6),
        ];
    this.upper = tag(new THREE.Mesh(merge(upperParts), m.steel), 'susp.top-mount');
    this.rod = tag(new THREE.Mesh(rodBetween(new THREE.Vector3(0, s.strut ? 0.35 : 0.25, 0), new THREE.Vector3(0, -this.rodLength, 0), s.rodR, 16), m.chrome), 'susp.damper-rod');
    const pistonY = -this.rodLength;
    const pr = s.tubeR - 0.07;
    this.piston = tag(
      new THREE.Mesh(
        merge([
          boss(new THREE.Vector3(0, pistonY, 0), UP, pr, 0.1, 24),
          boss(new THREE.Vector3(0, pistonY + 0.09, 0), UP, pr - 0.04, 0.025, 24),
          boss(new THREE.Vector3(0, pistonY + 0.12, 0), UP, pr - 0.07, 0.02, 24),
          boss(new THREE.Vector3(0, pistonY - 0.09, 0), UP, pr - 0.04, 0.025, 24),
          boss(new THREE.Vector3(0, pistonY - 0.12, 0), UP, pr - 0.07, 0.02, 24),
          boss(new THREE.Vector3(0, pistonY - 0.17, 0), UP, 0.08, 0.06, 6),
        ]),
        m.piston,
      ),
      'susp.damper-piston',
    );
    // Bump stop: corrugated, hung under the upper seat, squeezed by scaling along the rod.
    const stopProfile: Array<[number, number]> = [];
    const folds = 4;
    const r0 = s.rodR + 0.13;
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      stopProfile.push([r0 + 0.06 * (0.5 - 0.5 * Math.cos(2 * Math.PI * folds * u)) + 0.03 * u, -u * s.stopLength]);
    }
    stopProfile.reverse();
    this.bumpStop = tag(new THREE.Mesh(lathe([[s.rodR + 0.01, -s.stopLength], ...stopProfile, [s.rodR + 0.01, 0]], 28), m.bumpStop), 'susp.bump-stop');
    this.bumpStop.position.y = -s.upperSeat;
    this.top.add(this.upper, this.rod, this.piston, this.bumpStop);
    if (s.wire !== null) {
      this.spring = new CoilSpring(s.springMeanR, s.springTurns, s.springEndTurns);
      this.springMesh = tag(new THREE.Mesh(this.spring.geometry, m.spring), 'susp.spring');
      this.springMesh.position.y = -s.upperSeat;
      this.springMesh.frustumCulled = false;
      this.top.add(this.springMesh);
    } else {
      this.spring = null;
      this.springMesh = null;
    }

    // ---- The damper's body: tube with the lower spring seat, and the oil inside ----
    const tubeR = s.tubeR;
    const tubeProfile: Array<[number, number]> = [
      [0.0001, this.tubeBottom],
      [tubeR, this.tubeBottom],
      [tubeR, this.tubeTop - 0.06],
      [tubeR - 0.06, this.tubeTop],
      [s.rodR + 0.02, this.tubeTop],
    ];
    const seat = ringProfile(tubeR, seatR, s.lowerSeat - 0.05, s.lowerSeat);
    const oilProfile: Array<[number, number]> = [
      [0.0001, this.tubeBottom + 0.04],
      [tubeR - 0.04, this.tubeBottom + 0.04],
      [tubeR - 0.04, this.tubeTop - 0.35],
      [0.0001, this.tubeTop - 0.35],
    ];
    const tubeParts: THREE.BufferGeometry[] = [];
    let oilGeo: THREE.BufferGeometry;
    if (tubeAt) {
      tubeParts.push(latheAlong(tubeProfile, tubeAt.lower, tubeAt.dir, 28, true));
      if (s.wire !== null) tubeParts.push(latheAlong(seat, tubeAt.lower, tubeAt.dir, 36, true));
      oilGeo = latheAlong(oilProfile, tubeAt.lower, tubeAt.dir, 24, true);
    } else {
      tubeParts.push(lathe(tubeProfile, 28, true));
      if (s.wire !== null) tubeParts.push(lathe(seat, 36, true));
      // The lower eye across the unit, on the arm's bolt, and the stem from the tube's bottom down to it.
      tubeParts.push(boss(new THREE.Vector3(), FORWARD, 0.2, 0.34, 20), rodBetween(new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0, this.tubeBottom + 0.02, 0), 0.14, 16));
      oilGeo = lathe(oilProfile, 24, true);
    }
    this.tube = tag(new THREE.Mesh(merge(tubeParts), m.strut), s.part);
    this.oil = tag(new THREE.Mesh(oilGeo, m.oil), 'susp.damper-oil');
    this.oil.renderOrder = 1;
    if (!tubeAt) this.bottom.add(this.tube, this.oil);
  }

  /**
   * Poses the unit between the top mount and the lower point (body frame, scene): the rod hangs from `top` towards
   * `lower`, and a coilover's tube stands on `lower` towards `top`. Exploded, the top's parts go up the axis.
   */
  update(top: THREE.Vector3, lower: THREE.Vector3, explode: number, thinCoil: boolean): void {
    const s = this.size;
    const d = this.d.copy(lower).sub(top);
    const L = d.length();
    this.length = L;
    d.divideScalar(L);
    const e = explode;
    this.top.quaternion.setFromUnitVectors(DOWN, d);
    this.top.position.copy(top).addScaledVector(d, -e * 0.6 * L);
    this.topMount.position.copy(top).addScaledVector(UP, e * 0.6 * L + e * 1.2);
    if (!s.strut) {
      // The tube's eye stays on its bolt; the tube's axis points at the top mount, its eye's axis along the car.
      const up = this.w.copy(d).negate();
      const ref = Math.abs(up.z) > 0.9 ? UP : FORWARD;
      this.x.crossVectors(up, ref).normalize();
      this.z.crossVectors(this.x, up);
      this.bottom.quaternion.setFromRotationMatrix(this.m.makeBasis(this.x, up, this.z));
      this.bottom.position.copy(lower);
    }
    if (this.spring && this.springMesh) {
      this.spring.update(L - s.upperSeat - s.lowerSeat, thinCoil ? 0.035 : this.wire / 2);
      this.springMesh.position.y = -s.upperSeat + e * 2.2;
    }
    // Bump stop: squeezed by the tube's top once the gap closes.
    const room = L - this.tubeTop - s.upperSeat;
    this.squeeze = Math.min(0.85, Math.max(0, 1 - room / s.stopLength));
    this.bumpStop.scale.y = 1 - this.squeeze;
  }
}

/**
 * A coil that does not sit on the damper (its own points on the body and on an arm, a link or the knuckle): the coil
 * between two seat cups, hung from its body end along local −Y like a unit's top.
 */
export class LoneSpring {
  readonly group = new THREE.Group();
  readonly spring: CoilSpring;
  readonly mesh: THREE.Mesh;
  readonly seats: THREE.Mesh;
  readonly lowerSeat: THREE.Mesh;
  wire: number;
  length = 0;
  private readonly seat: number;
  private readonly d = new THREE.Vector3();

  constructor(meanR: number, turns: number, endTurns: number, wire: number, m: CornerMaterials) {
    this.wire = wire;
    this.seat = 0.04;
    this.spring = new CoilSpring(meanR, turns, endTurns);
    this.mesh = tag(new THREE.Mesh(this.spring.geometry, m.spring), 'susp.spring');
    this.mesh.position.y = -this.seat;
    this.mesh.frustumCulled = false;
    const cup = (y0: number, y1: number): THREE.BufferGeometry => latheAlong(ringProfile(meanR - 0.12, meanR + 0.12, y0, y1), new THREE.Vector3(), UP, 32, true);
    this.seats = tag(new THREE.Mesh(cup(-this.seat, 0), m.steel), 'susp.spring');
    this.lowerSeat = tag(new THREE.Mesh(cup(0, this.seat), m.steel), 'susp.spring');
    this.group.add(this.mesh, this.seats, this.lowerSeat);
  }

  update(top: THREE.Vector3, lower: THREE.Vector3, explode: number, thinCoil: boolean): void {
    const d = this.d.copy(lower).sub(top);
    const L = d.length();
    this.length = L;
    d.divideScalar(L);
    this.group.quaternion.setFromUnitVectors(DOWN, d);
    this.group.position.copy(top).addScaledVector(d, -explode * 0.6 * L);
    this.spring.update(L - 2 * this.seat, thinCoil ? 0.035 : this.wire / 2);
    this.lowerSeat.position.y = -L;
  }
}
