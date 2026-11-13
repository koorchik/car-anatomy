// The halfshaft of a driven corner: a tripod plunging joint at the differential, a straight shaft, and a fixed ball
// joint at the hub, with a boot over each joint. Each pose comes from two points, the inner joint centre on the body
// and the outer one on the knuckle, the way kinematics.ts measures the shaft.
//
// The shaft is rigid: its spider sits on the line to the outer joint at the shaft's design length from it, so a shaft
// that the corner pushes in slides the spider deeper into the tulip (plunge), as on the car. Both joints turn red when
// their angle or the plunge is past the maker's limit (HalfshaftSpec).

import * as THREE from 'three';
import { tag } from '../model-types.ts';
import type { HalfshaftSpec } from '../../suspension/spec.ts';
import { Bellows, boss, lathe, rodBetween, toScene } from './geometry.ts';
import { merge } from '../geometry.ts';
import { glassMaterial } from '../materials.ts';
import type { CornerMaterials } from './materials.ts';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/** Sizes of the joints, scene units (1 = 100 mm). Typical of a compact car's shaft, drawing only. */
const TULIP_R = 0.48;
const TULIP_MOUTH = 0.42;
const TULIP_BACK = 0.5;
const STUB_TO_CUT = 1.0;
const ROLLER_AT = 0.3;
const BELL_R = 0.46;
const BELL_MOUTH = 0.36;
const BOOT_CLAMP = 0.95;

export interface HalfshaftState {
  /** Joint angles, rad, and the plunge (positive pushed in), m. */
  innerAngle: number;
  outerAngle: number;
  plunge: number;
  innerOver: boolean;
  outerOver: boolean;
}

/** A joint past its limit glows red. */
const paint = (mat: THREE.MeshStandardMaterial, on: boolean): void => {
  mat.emissive.set(on ? '#ff2a10' : '#000000');
  mat.emissiveIntensity = on ? 0.9 : 1;
};

export class HalfshaftView {
  /** Parts on the body: the tulip, the spider, the shaft and the boots. */
  readonly group = new THREE.Group();
  readonly tulip: THREE.Mesh;
  readonly spider: THREE.Mesh;
  readonly shaft: THREE.Mesh;
  readonly innerBoot: THREE.Mesh;
  readonly outerBoot: THREE.Mesh;
  /** Parts on the hub, added to the spinning hub by the corner: the bell and its balls. */
  readonly bell: THREE.Mesh;
  readonly balls: THREE.Mesh;
  readonly state: HalfshaftState = { innerAngle: 0, outerAngle: 0, plunge: 0, innerOver: false, outerOver: false };
  readonly spec: HalfshaftSpec;
  /** Design length of the shaft, joint centre to joint centre, scene units. */
  readonly length: number;
  /** Inner joint centre on the body, scene. */
  readonly inner: THREE.Vector3;
  /** Spider centre and the shaft's direction (towards the hub) after update(). */
  readonly spiderAt = new THREE.Vector3();
  readonly dir = new THREE.Vector3();
  private readonly innerMaterial: THREE.MeshStandardMaterial;
  private readonly outerMaterial: THREE.MeshStandardMaterial;
  private readonly innerGlass: THREE.MeshStandardMaterial;
  private readonly outerGlass: THREE.MeshStandardMaterial;
  private readonly innerBellows = new Bellows(0.4, 0.17, 5, 0.06);
  private readonly outerBellows = new Bellows(0.17, 0.4, 6, 0.06);
  private readonly shaftRadius: number;
  private xray = false;
  /** Whether each joint is drawn red now; null: write it on the next update. Written only when it changes, so a
   *  highlight on the joints stays, and never while `held` (a failure's own mark is on). */
  private innerRed: boolean | null = null;
  private outerRed: boolean | null = null;
  private held = { inner: false, outer: false };
  // Scratch
  private readonly q = new THREE.Quaternion();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly d = new THREE.Vector3();

  /**
   * `outerDesign`: the outer joint centre at design, body frame (scene). `outerInHub`: the same point in the frame of
   * the spinning hub, whose local +X is the spin axis (outboard): the bell and its balls are built there and the
   * corner adds them to the hub.
   */
  constructor(spec: HalfshaftSpec, outerDesign: THREE.Vector3, outerInHub: THREE.Vector3, m: CornerMaterials) {
    this.spec = spec;
    this.inner = toScene(spec.diffOutput);
    this.length = this.inner.distanceTo(outerDesign);
    this.shaftRadius = (spec.diameterM / 2) * 10;
    // Own materials, so one joint can turn red alone.
    this.innerMaterial = m.joint.clone();
    this.outerMaterial = m.joint.clone();
    // Not clones of m.jointGlass: Material.clone() drops the glass shader (onBeforeCompile).
    this.innerGlass = glassMaterial('#c3ccd2', 0.05, 0.45);
    this.outerGlass = glassMaterial('#c3ccd2', 0.05, 0.45);

    // Tulip: a stub from the cut by the gearbox, then the housing open towards the hub. Built along +X from its centre.
    const tulipGeo = merge([
      lathe(
        [
          [0.18, -STUB_TO_CUT],
          [0.18, -TULIP_BACK - 0.12],
          [0.3, -TULIP_BACK - 0.05],
          [TULIP_R, -TULIP_BACK],
          [TULIP_R, TULIP_MOUTH - 0.04],
          [TULIP_R - 0.04, TULIP_MOUTH],
          [TULIP_R - 0.08, TULIP_MOUTH],
        ],
        28,
      ),
      // The cut face at the gearbox end.
      lathe([[0.0001, -STUB_TO_CUT], [0.18, -STUB_TO_CUT]], 28, true),
    ]);
    tulipGeo.rotateZ(-Math.PI / 2);
    this.tulip = tag(new THREE.Mesh(tulipGeo, this.innerMaterial), 'susp.cv-inner');
    this.tulip.position.copy(this.inner);

    // Spider: hub on the shaft and three rollers on trunnions at 120°, in the plane across the shaft (local XZ, shaft
    // along local Y).
    const spiderParts: THREE.BufferGeometry[] = [boss(new THREE.Vector3(), Y, 0.2, 0.2, 18)];
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      spiderParts.push(rodBetween(new THREE.Vector3(), out.clone().multiplyScalar(ROLLER_AT + 0.08), 0.07, 10));
      spiderParts.push(boss(out.clone().multiplyScalar(ROLLER_AT), out, 0.16, 0.13, 18));
    }
    this.spider = tag(new THREE.Mesh(merge(spiderParts), m.piston), 'susp.cv-inner');

    // Shaft: a unit-length bar along local Y, from the spider to the outer joint.
    const shaftGeo = merge([
      new THREE.CylinderGeometry(this.shaftRadius, this.shaftRadius, 1, 14, 1, false).translate(0, 0.5, 0),
    ]);
    this.shaft = tag(new THREE.Mesh(shaftGeo, m.steel), 'susp.halfshaft');

    this.innerBoot = tag(new THREE.Mesh(this.innerBellows.geometry, m.boot), 'susp.cv-boot');
    this.outerBoot = tag(new THREE.Mesh(this.outerBellows.geometry, m.boot), 'susp.cv-boot');
    for (const boot of [this.innerBoot, this.outerBoot]) boot.frustumCulled = false;

    // Bell of the fixed joint, on the hub's axis (built along +X), with its stub into the hub.
    const bellGeo = lathe(
      [
        [BELL_R - 0.1, -BELL_MOUTH],
        [BELL_R, -BELL_MOUTH + 0.1],
        [BELL_R, 0.05],
        [BELL_R - 0.12, 0.3],
        [0.27, 0.36],
        [0.25, 0.95],
        [0.0001, 0.95],
      ],
      28,
    ).rotateZ(-Math.PI / 2);
    this.bell = tag(new THREE.Mesh(bellGeo, this.outerMaterial), 'susp.cv-outer');
    // Six balls in their cage, across the hub axis.
    const ballParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      ballParts.push(new THREE.SphereGeometry(0.1, 12, 8).translate(0, Math.cos(ang) * 0.3, Math.sin(ang) * 0.3));
    }
    ballParts.push(lathe([[0.36, -0.06], [0.4, -0.06], [0.4, 0.06], [0.36, 0.06], [0.36, -0.06]], 28, true).rotateZ(-Math.PI / 2));
    this.balls = tag(new THREE.Mesh(merge(ballParts), m.piston), 'susp.cv-outer');
    this.bell.position.copy(outerInHub);
    this.balls.position.copy(outerInHub);

    this.group.add(this.tulip, this.spider, this.shaft, this.innerBoot, this.outerBoot);
  }

  setXray(on: boolean): void {
    this.xray = on;
    this.tulip.material = on ? this.innerGlass : this.innerMaterial;
    this.bell.material = on ? this.outerGlass : this.outerMaterial;
    this.innerBoot.material = on ? this.innerBoot.userData.glass : this.innerBoot.userData.solid;
    this.outerBoot.material = on ? this.outerBoot.userData.glass : this.outerBoot.userData.solid;
    this.spider.visible = on;
    this.balls.visible = on;
  }

  /** The joints' own materials, both views: for a highlight or a ghost of the whole corner. */
  materials(): THREE.MeshStandardMaterial[] {
    return [this.innerMaterial, this.outerMaterial, this.innerGlass, this.outerGlass];
  }

  /**
   * Has the next update write both joints' red marks afresh (after a highlight or a failure tinted them), and leaves a
   * joint's mark alone while `held` (its failure is shown).
   */
  refreshMarks(held = { inner: false, outer: false }): void {
    this.held = held;
    this.innerRed = null;
    this.outerRed = null;
  }

  /** Boot materials for the X-ray swap (the corner owns them). */
  setBootMaterials(solid: THREE.Material, glass: THREE.Material): void {
    for (const boot of [this.innerBoot, this.outerBoot]) {
      boot.userData.solid = solid;
      boot.userData.glass = glass;
      boot.material = this.xray ? glass : solid;
    }
  }

  /**
   * Poses the shaft for the outer joint centre `outer` and the hub axis `hubAxis` (outboard), both in the body frame,
   * scene units; `spin` turns the shaft with the wheel. `explode` pulls the inner parts towards the car's centre and
   * `outerExplode` is how far the hub's own parts moved outboard (scene units).
   */
  update(outer: THREE.Vector3, hubAxis: THREE.Vector3, spin: number, explode: number, outerExplode: number): void {
    const { a, b, c, d, q } = this;
    const s = this.state;
    const spec = this.spec;
    // Shaft direction from the inner joint centre to the outer one, and the measures kinematics.ts reports.
    this.dir.copy(outer).sub(this.inner);
    const span = this.dir.length();
    this.dir.divideScalar(span);
    s.plunge = (this.length - span) / 10;
    s.innerAngle = Math.acos(Math.min(1, this.dir.dot(X)));
    s.outerAngle = Math.acos(Math.min(1, this.dir.dot(hubAxis)));
    s.innerOver = s.innerAngle > spec.innerMaxDeg * DEG || s.plunge < spec.plungeM[0] || s.plunge > spec.plungeM[1];
    s.outerOver = s.outerAngle > spec.outerMaxDeg * DEG;
    if (s.innerOver !== this.innerRed && !this.held.inner) {
      this.innerRed = s.innerOver;
      paint(this.innerMaterial, s.innerOver);
      paint(this.innerGlass, s.innerOver);
    }
    if (s.outerOver !== this.outerRed && !this.held.outer) {
      this.outerRed = s.outerOver;
      paint(this.outerMaterial, s.outerOver);
      paint(this.outerGlass, s.outerOver);
    }

    // Exploded: the tulip goes furthest towards the car's centre, the shaft and spider half as far.
    const inward = explode * 2.4;
    const shaftShift = explode * 1.2;
    this.tulip.position.copy(this.inner).addScaledVector(X, -inward);
    this.tulip.rotation.set(spin, 0, 0);
    // Spider on the line from the outer joint, the shaft's length from it.
    this.spiderAt.copy(outer).addScaledVector(this.dir, -this.length);
    a.copy(this.spiderAt).addScaledVector(X, -shaftShift);
    q.setFromUnitVectors(Y, this.dir);
    this.spider.position.copy(a);
    this.spider.quaternion.copy(q);
    this.spider.rotateY(spin);
    // Shaft from the spider to the outer joint (a bar of the shaft's own length).
    this.shaft.position.copy(a);
    this.shaft.quaternion.copy(q);
    this.shaft.scale.set(1, this.length, 1);
    this.shaft.rotateY(spin);
    // Inner boot: from the tulip's mouth along its axis to a clamp on the shaft.
    b.copy(this.tulip.position).addScaledVector(X, TULIP_MOUTH - 0.02);
    c.copy(a).addScaledVector(this.dir, BOOT_CLAMP);
    this.innerBellows.update(b, X, c, this.dir);
    // Outer boot: from a clamp on the shaft to the bell's mouth along the hub axis.
    b.copy(a).addScaledVector(this.dir, this.length - BOOT_CLAMP - 0.25);
    c.copy(outer).addScaledVector(hubAxis, -BELL_MOUTH + 0.02 + outerExplode);
    d.copy(hubAxis);
    this.outerBellows.update(b, this.dir, c, d);
  }

  /** The two ends of the shaft as drawn, world frame: the spider centre and the outer joint centre. */
  shaftEnds(outA: THREE.Vector3, outB: THREE.Vector3): void {
    outA.set(0, 0, 0).applyMatrix4(this.shaft.matrixWorld);
    outB.set(0, 1, 0).applyMatrix4(this.shaft.matrixWorld);
  }

  dispose(): void {
    for (const mesh of [this.tulip, this.spider, this.shaft, this.innerBoot, this.outerBoot, this.bell, this.balls]) mesh.geometry.dispose();
    for (const mat of [this.innerMaterial, this.outerMaterial, this.innerGlass, this.outerGlass]) mat.dispose();
  }
}
