// The links of any independent corner in 3D, built from its `links` set (CornerLinkage): every wishbone as an A-arm
// that turns about its bush axis until its ball joint meets the knuckle's, every rod as a straight link that points
// from its body end to its knuckle end. Each is rigid geometry of the solver's own length, posed from its two ends
// each frame, so nothing stretches (tests/suspension-scene.test.ts). Scene axes and units as in geometry.ts.
//
// A steered rod is a tie rod with ball joints at both ends; any other rod is a link with a rubber bush in an eye at
// each end (a toe link, the links of a multilink). The bushes of all the rods are one instanced mesh.

import * as THREE from 'three';
import { tag } from '../model-types.ts';
import { merge } from '../geometry.ts';
import type { CornerLinkage, Rod, Wishbone } from '../../suspension/spec.ts';
import { boss, capsule, latheAlong, rodBetween, toScene } from './geometry.ts';
import type { CornerMaterials } from './materials.ts';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const X = new THREE.Vector3(1, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** A link as drawn: the object that carries it and both ends in that object's own frame, for the stretch test. */
export interface DrawnLink {
  /** The solver's row: `<wishbone id>.front`, `<wishbone id>.rear`, or the rod's id. */
  name: string;
  object: THREE.Object3D;
  /** End on the body (or rack) and end on the knuckle, local to `object`. */
  bodyEnd: THREE.Vector3;
  knuckleEnd: THREE.Vector3;
}

/** Sizes of the links, scene units (1 = 100 mm): typical, drawing only. */
const LINK_R = 0.1;
const EYE_R = 0.2;
const EYE_LENGTH = 0.36;
const BUSH_R = 0.15;
const BUSH_LENGTH = 0.44;

/** A wishbone: two tubes and a web from its bushes to its ball joint, turning about the bush axis. */
export class ArmView {
  readonly object = new THREE.Group();
  readonly spec: Wishbone;
  /** Bush pivots and the ball joint at design, body frame (scene). */
  readonly front: THREE.Vector3;
  readonly rear: THREE.Vector3;
  readonly ball0: THREE.Vector3;
  /** The ball joint now: where the knuckle (or a split knuckle's carrier) holds it. */
  readonly ball = new THREE.Vector3();
  readonly arm: THREE.Mesh;
  readonly bushes: THREE.Mesh;
  readonly joint: THREE.Mesh;
  private readonly axis: THREE.Vector3;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();

  /**
   * `below`: the ball joint sits below the wheel centre, so its housing in the arm is under the ball and the stud goes
   * up into the knuckle (a lower arm); otherwise the other way round. `radius`: of the arm's tubes.
   */
  constructor(w: Wishbone, m: CornerMaterials, below: boolean, radius: number) {
    this.spec = w;
    this.front = toScene(w.front);
    this.rear = toScene(w.rear);
    this.ball0 = toScene(w.ball);
    this.ball.copy(this.ball0);
    this.axis = this.rear.clone().sub(this.front).normalize();
    const web = webGeometry(this.front, this.rear, this.ball0, radius * 0.625);
    this.arm = tag(new THREE.Mesh(merge([capsule(this.front, this.ball0, radius, radius * 0.9), capsule(this.rear, this.ball0, radius, radius * 0.9), web]), m.arm), w.part);
    const s = radius / 0.16;
    this.bushes = tag(
      new THREE.Mesh(merge([boss(this.front, this.axis, 0.32 * s, 0.62 * s, 20), boss(this.rear, this.axis, 0.34 * s, 0.7 * s, 20)]), m.rubber),
      'susp.bush',
    );
    // The housing in the arm on the far side of the ball from the knuckle, and the boot over the stud towards it.
    const away = below ? DOWN : UP;
    this.joint = tag(
      new THREE.Mesh(
        merge([
          boss(this.ball0.clone().addScaledVector(away, 0.12), UP, 0.27, 0.26, 20),
          new THREE.SphereGeometry(0.17, 16, 12).translate(this.ball0.x, this.ball0.y, this.ball0.z),
          latheAlong([[0.22, 0], [0.24, 0.06], [0.17, 0.16], [0.1, 0.22]], this.ball0.clone().addScaledVector(away, -0.02), below ? UP : DOWN, 18),
        ]),
        m.boot,
      ),
      'susp.ball-joint',
    );
    this.object.add(this.arm, this.bushes, this.joint);
  }

  /** The two legs as the solver's distance rows. */
  drawn(): DrawnLink[] {
    return [
      { name: `${this.spec.id}.front`, object: this.object, bodyEnd: this.front.clone(), knuckleEnd: this.ball0.clone() },
      { name: `${this.spec.id}.rear`, object: this.object, bodyEnd: this.rear.clone(), knuckleEnd: this.ball0.clone() },
    ];
  }

  /** Turns the arm about its bush axis until its ball joint is at `this.ball`; exploded, away from the knuckle. */
  pose(explode: number): void {
    const u = this.axis;
    const a = this.a.copy(this.ball0).sub(this.front);
    a.addScaledVector(u, -a.dot(u));
    const b = this.b.copy(this.ball).sub(this.front);
    b.addScaledVector(u, -b.dot(u));
    const angle = Math.atan2(this.c.crossVectors(a, b).dot(u), a.dot(b));
    this.object.quaternion.setFromAxisAngle(u, angle);
    this.object.position.copy(this.front).sub(this.c.copy(this.front).applyQuaternion(this.object.quaternion));
    const away = this.a.copy(this.front).add(this.rear).multiplyScalar(0.5).sub(this.ball);
    const len = away.length();
    this.object.position.addScaledVector(away.divideScalar(len), explode * 0.6 * len);
  }
}

/**
 * A rod along its local +Y from its body end (the origin) to its knuckle end at (0, length, 0). A tie rod points along
 * the shortest turn from +Y, as on the strut corner; a link keeps its eyes' axes as near the car's length as it can.
 */
export class RodView {
  readonly object = new THREE.Group();
  readonly spec: Rod;
  readonly tie: boolean;
  readonly mesh: THREE.Mesh;
  /** Body end at design (scene); the rack moves a steered rod's along X. */
  readonly body0: THREE.Vector3;
  readonly knuckle0: THREE.Vector3;
  /** Both ends now, body frame (scene). */
  readonly bodyEnd = new THREE.Vector3();
  readonly knuckleEnd = new THREE.Vector3();
  readonly link: DrawnLink;
  private len: number;
  private readonly d = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();

  constructor(rod: Rod, length: number, m: CornerMaterials) {
    this.spec = rod;
    this.tie = !!rod.steer;
    this.body0 = toScene(rod.body);
    this.knuckle0 = toScene(rod.knuckle);
    this.bodyEnd.copy(this.body0);
    this.knuckleEnd.copy(this.knuckle0);
    this.len = length;
    this.mesh = tag(new THREE.Mesh(this.geometry(length), this.tie ? m.steel : m.arm), rod.part);
    this.object.add(this.mesh);
    this.link = { name: rod.id, object: this.object, bodyEnd: new THREE.Vector3(), knuckleEnd: new THREE.Vector3(0, length, 0) };
  }

  get length(): number {
    return this.len;
  }

  /** A turnbuckle: the rod's new length (scene units). */
  setLength(length: number): void {
    if (length === this.len) return;
    this.len = length;
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometry(length);
    this.link.knuckleEnd.set(0, length, 0);
  }

  private geometry(length: number): THREE.BufferGeometry {
    return this.tie ? tieRodGeometry(length) : linkGeometry(length);
  }

  /** Points the rod from `bodyEnd` to `knuckleEnd`; exploded, back towards the body along itself. */
  pose(explode: number): void {
    const d = this.d.copy(this.knuckleEnd).sub(this.bodyEnd);
    const len = d.length();
    d.divideScalar(len);
    if (this.tie) {
      this.object.quaternion.setFromUnitVectors(UP, d);
    } else {
      // Local Y along the rod, local Z (the eyes' axes) as near the car's length as the rod lets it.
      const ref = Math.abs(d.z) > 0.9 ? UP : FORWARD;
      this.x.crossVectors(d, ref).normalize();
      this.z.crossVectors(this.x, d);
      this.object.quaternion.setFromRotationMatrix(this.m.makeBasis(this.x, d, this.z));
    }
    this.object.position.copy(this.bodyEnd).addScaledVector(d, -explode * 0.6 * len);
  }
}

/** Every link of a corner, and one instanced mesh for the rubber bushes in the eyes of its links. */
export class LinkSet {
  readonly group = new THREE.Group();
  readonly arms: ArmView[];
  readonly rods: RodView[];
  readonly drawn: DrawnLink[] = [];
  readonly bushes: THREE.InstancedMesh | null;
  private readonly bushAt: Array<{ rod: RodView; y: () => number }> = [];
  private readonly local = new THREE.Matrix4();
  private readonly out = new THREE.Matrix4();

  /** `rodLengths`: the solver's length of each rod (scene units), in the order of `link.rods`. */
  constructor(link: CornerLinkage, rodLengths: number[], wheelCentreY: number, m: CornerMaterials) {
    this.arms = link.wishbones.map((w) => {
      const below = toScene(w.ball).y < wheelCentreY;
      return new ArmView(w, m, below, below ? 0.16 : 0.13);
    });
    this.rods = link.rods.map((r, i) => new RodView(r, rodLengths[i]!, m));
    for (const arm of this.arms) {
      this.group.add(arm.object);
      this.drawn.push(...arm.drawn());
    }
    for (const rod of this.rods) {
      this.group.add(rod.object);
      this.drawn.push(rod.link);
      if (!rod.tie) this.bushAt.push({ rod, y: () => 0 }, { rod, y: () => rod.length });
    }
    if (this.bushAt.length > 0) {
      const geo = new THREE.CylinderGeometry(BUSH_R, BUSH_R, BUSH_LENGTH, 16).rotateX(Math.PI / 2);
      this.bushes = new THREE.InstancedMesh(geo, m.rubber, this.bushAt.length);
      this.bushes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.bushes.userData.instanceParts = this.bushAt.map(() => 'susp.bush');
      this.bushes.frustumCulled = false;
      this.group.add(this.bushes);
    } else {
      this.bushes = null;
    }
  }

  /** Poses every link from the ends set on its view (arm.ball, rod.bodyEnd, rod.knuckleEnd). */
  update(explode: number): void {
    for (const arm of this.arms) arm.pose(explode);
    for (const rod of this.rods) rod.pose(explode);
    if (!this.bushes) return;
    for (let i = 0; i < this.bushAt.length; i++) {
      const { rod, y } = this.bushAt[i]!;
      rod.object.updateMatrix();
      this.bushes.setMatrixAt(i, this.out.multiplyMatrices(rod.object.matrix, this.local.makeTranslation(0, y(), 0)));
    }
    this.bushes.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.bushes?.dispose();
  }
}

/** Tie rod along +Y from its inner ball joint (origin) to the outer joint at `length`. */
export function tieRodGeometry(length: number): THREE.BufferGeometry {
  const o = new THREE.Vector3();
  const end = new THREE.Vector3(0, length, 0);
  return merge([
    new THREE.SphereGeometry(0.17, 16, 12),
    rodBetween(o.clone().setY(0.1), end.clone().setY(length - 0.35), 0.1, 14),
    rodBetween(end.clone().setY(length - 0.5), end.clone().setY(length - 0.18), 0.15, 6),
    new THREE.SphereGeometry(0.21, 16, 12).translate(0, length, 0),
    // The joint's housing across the rod: upright on the car, where the rod runs across it.
    boss(end.clone(), X, 0.2, 0.18, 16),
  ]);
}

/** A link along +Y from the eye at its body end (origin) to the eye at its knuckle end, the eyes' axes along Z. */
export function linkGeometry(length: number): THREE.BufferGeometry {
  return merge([
    rodBetween(new THREE.Vector3(0, EYE_R * 0.7, 0), new THREE.Vector3(0, length - EYE_R * 0.7, 0), LINK_R, 12),
    boss(new THREE.Vector3(), FORWARD, EYE_R, EYE_LENGTH, 20),
    boss(new THREE.Vector3(0, length, 0), FORWARD, EYE_R, EYE_LENGTH, 20),
  ]);
}

/** The arm's web: a plate inside the triangle of its pivots and ball joint, inset so the tubes stay visible. */
export function webGeometry(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, thickness: number): THREE.BufferGeometry {
  const centre = a.clone().add(b).add(c).divideScalar(3);
  const inset = (p: THREE.Vector3): THREE.Vector3 => p.clone().lerp(centre, 0.22);
  const [pa, pb, pc] = [inset(a), inset(b), inset(c)];
  const e1 = pb.clone().sub(pa).normalize();
  const n = new THREE.Vector3().crossVectors(pb.clone().sub(pa), pc.clone().sub(pa)).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1);
  const to2 = (p: THREE.Vector3): THREE.Vector2 => new THREE.Vector2(p.clone().sub(pa).dot(e1), p.clone().sub(pa).dot(e2));
  const shape = new THREE.Shape([to2(pa), to2(pb), to2(pc)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(e1, e2, n).setPosition(pa));
  return geo;
}
