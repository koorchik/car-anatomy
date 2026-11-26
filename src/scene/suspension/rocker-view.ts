// The pushrod's rod, its rocker and the third spring (stage P14, the pushrod page). The rod runs from its seat on the
// lower arm to the rocker; the rocker turns about its axis on the body (rocker.ts solves its angle from where the rod's
// outer end is) and works the coilover from its other arm; the third spring runs across the car from a third rocker
// point, and the corner shows its half up to the car's centre line, where its mirror on the other rocker meets it.
// Points in scene units in the body frame, as the corner model draws (toScene: ISO metres → scene).

import * as THREE from 'three';
import { tag } from '../model-types.ts';
import { Rocker } from '../../suspension/rocker.ts';
import type { RockerSpec, Vec3 } from '../../suspension/spec.ts';
import { rodBetween, toScene } from './geometry.ts';
import { LoneSpring } from './damper-unit.ts';
import { DRAWING } from './drawing.ts';
import type { CornerMaterials } from './materials.ts';

const UP = new THREE.Vector3(0, 1, 0);
/** Radii, scene units: the rod, the rocker's plates and its pivot. */
const ROD_R = 0.11;
const PLATE_R = 0.16;
const PIVOT_R = 0.22;

export class RockerView {
  readonly group = new THREE.Group();
  readonly rocker: Rocker;
  readonly rod: THREE.Mesh;
  /** The rocker's plates and pivot, turned about the axis through the pivot. */
  readonly plate = new THREE.Group();
  readonly third: LoneSpring | null;
  /** The rocker's angle this frame, rad, and the force along the rod per newton along the element (statics). */
  theta = 0;
  rodPerElement = 1;
  private readonly pivot: THREE.Vector3;
  private readonly axis: THREE.Vector3;
  /** The third spring's rocker point at design, from the pivot (scene): the plate's turn carries it. */
  private readonly third0: THREE.Vector3 | null;
  private readonly iso = [0, 0, 0] as unknown as Vec3;
  private readonly p = [0, 0, 0];
  private readonly rodEnd = new THREE.Vector3();
  private readonly elementEnd = new THREE.Vector3();
  private readonly thirdAt = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly u = new THREE.Vector3();

  constructor(spec: RockerSpec, rodOuter: Vec3, third: Vec3 | null, wire: number, m: CornerMaterials) {
    this.rocker = new Rocker(spec, rodOuter);
    this.pivot = toScene(spec.pivot);
    this.axis = toScene(spec.axis).normalize();
    this.third0 = third ? toScene(third).sub(this.pivot) : null;
    // The rod: a unit cylinder along +Y, stretched and turned onto its two ends each frame.
    this.rod = tag(new THREE.Mesh(new THREE.CylinderGeometry(ROD_R, ROD_R, 1, 12).translate(0, 0.5, 0), m.chrome), 'susp.pushrod');
    // The plates at design, about the pivot: a triangle of bars between the pivot and the two arm ends, and the shaft.
    const c = new THREE.Vector3();
    const rodEnd = toScene(spec.rodEnd).sub(this.pivot);
    const elementEnd = toScene(spec.elementEnd).sub(this.pivot);
    const bars = [
      rodBetween(c, rodEnd, PLATE_R),
      rodBetween(c, elementEnd, PLATE_R),
      rodBetween(rodEnd, elementEnd, PLATE_R * 0.7),
    ];
    const half = this.axis.clone().multiplyScalar(0.35);
    const shaft = rodBetween(half.clone().negate(), half, PIVOT_R, 16);
    for (const g of bars) this.plate.add(tag(new THREE.Mesh(g, m.steel), 'susp.rocker'));
    this.plate.add(tag(new THREE.Mesh(shaft, m.steel), 'susp.rocker'));
    if (third) {
      const t = toScene(third).sub(this.pivot);
      this.plate.add(tag(new THREE.Mesh(rodBetween(c, t, PLATE_R * 0.8), m.steel), 'susp.rocker'));
      this.third = new LoneSpring(DRAWING.coiloverSpringMeanRadiusM * 10 * 0.8, DRAWING.springTurns, DRAWING.springEndTurns, wire, m);
      tag(this.third.mesh, 'susp.third-spring');
      tag(this.third.seats, 'susp.third-spring');
      tag(this.third.lowerSeat, 'susp.third-spring');
    } else this.third = null;
    this.plate.position.copy(this.pivot);
    this.group.add(this.rod, this.plate);
    if (this.third) this.group.add(this.third.group);
  }

  /**
   * The rocker for the rod's outer end at `rodOuter` and the element's body end at `top` (scene, body frame): the
   * element's rocker end into `out`.
   */
  update(rodOuter: THREE.Vector3, top: THREE.Vector3, out: THREE.Vector3, explode: number, thinCoil: boolean): THREE.Vector3 {
    // Scene → ISO metres: ISO (x, y, z) = scene (z, x, y)/10.
    const iso = this.iso as unknown as number[];
    iso[0] = rodOuter.z / 10;
    iso[1] = rodOuter.x / 10;
    iso[2] = rodOuter.y / 10;
    const r = this.rocker;
    try {
      this.theta = r.solveAngle(this.iso);
    } catch {
      // The rod cannot reach (a travel past the tables): the rocker stays where it was.
    }
    const p = this.p;
    r.rodEndAt(this.theta, p);
    toScene(p as unknown as Vec3, this.rodEnd);
    r.elementEndAt(this.theta, p);
    toScene(p as unknown as Vec3, this.elementEnd);
    this.plate.quaternion.setFromAxisAngle(this.axis, this.theta);
    // The rod from its seat to the rocker.
    const d = this.v.copy(this.rodEnd).sub(rodOuter);
    const len = d.length();
    d.divideScalar(len);
    this.rod.position.copy(rodOuter);
    this.rod.quaternion.setFromUnitVectors(UP, d);
    this.rod.scale.set(1, len, 1);
    // Torque balance about the axis: the force along the rod per newton along the element, for the force arrows.
    const rodLever = this.lever(this.rodEnd, d);
    const e = this.w.copy(this.elementEnd).sub(top).normalize();
    this.rodPerElement = rodLever > 1e-6 ? this.lever(this.elementEnd, e) / rodLever : 1;
    if (this.third && this.third0) {
      // The plate turns about the axis through the pivot, as Rocker.pointOf does, without a new array each frame.
      this.thirdAt.copy(this.third0).applyQuaternion(this.plate.quaternion).add(this.pivot);
      // The half up to the centre line, where the other rocker's half meets it.
      this.centre.set(0, this.thirdAt.y, this.thirdAt.z);
      this.third.update(this.centre, this.thirdAt, explode, thinCoil);
    }
    return out.copy(this.elementEnd);
  }

  /** The moment arm about the rocker's axis of a force along `dir` (unit) at `point`, scene units. */
  private lever(point: THREE.Vector3, dir: THREE.Vector3): number {
    return Math.abs(this.u.copy(point).sub(this.pivot).cross(dir).dot(this.axis));
  }

  /** The rod's direction from the arm to the rocker this frame, unit, into `out`. */
  rodDirection(rodOuter: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.rodEnd).sub(rodOuter).normalize();
  }
}
