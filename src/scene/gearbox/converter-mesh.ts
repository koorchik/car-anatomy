// The torque converter in 3D (stage K12a): the pump's half of the torus with its blades behind, the turbine's half
// with its blades in front, the stator's blades on their hub inside the torus, the lock-up clutch's plate and the
// cover. The blades are instances, one InstancedMesh per wheel turned as a group, so they cannot be explodables.
// In the X-ray arrows run round the torus' cross-section the way the oil circulates: out through the pump, across
// into the turbine at the outer edge, in through the turbine, back through the stator at the inner edge. Their speed
// and size follow the circulation, which is what the slip between the pump and the turbine drives: at the coupling
// point and with the clutch locked it nearly stops.
//
// Sizes are an estimate from the 6T40's Ø 273 mm (converter.ts): the working circuit from 62 to 125 mm, 60 mm deep;
// 24 pump, 26 turbine and 13 stator blades, flat rather than curved. Frame: the axis Z, the engine side +Z, the middle
// of the torus at z = 0 of the group, millimetres scaled by MM.

import * as THREE from 'three';
import { MM } from '../geometry.ts';
import { tag } from '../model-types.ts';
import { lathe } from './scene-base.ts';

/** What the converter draws in a frame. */
export interface ConverterFrame {
  /** Angles of the pump (with the cover), the turbine and the stator, rad. */
  pump: number;
  turbine: number;
  stator: number;
  /** Phase of the circulation round the torus, rad, and its strength 0…1. */
  flow: number;
  strength: number;
}

/** Torus of the working circuit, mm: inner and outer radius, half depth. */
const R_IN = 62;
const R_OUT = 125;
const HALF = 30;
const RC = (R_IN + R_OUT) / 2;
const A = (R_OUT - R_IN) / 2;
const PUMP_BLADES = 24;
const TURBINE_BLADES = 26;
const STATOR_BLADES = 13;
const BLADE = 1.4;
/** Arrows: places round the axis and arrows round each cross-section. */
const VORTEX_PLACES = 6;
const VORTEX_ARROWS = 7;
const VORTEX_K = 0.55;
/** Where the cover's front face and the lock-up plate stand, mm in front of the torus' middle. */
const COVER_FRONT = HALF + 26;
const LOCKUP_Z = HALF + 13;
/** The lock-up plate drawn as its friction ring only, so the turbine shows behind it (the clutch is 105–130 mm). */
const LOCKUP_IN = 100;

export const PUMP_COLOR = '#d9904f';
export const TURBINE_COLOR = '#5ea8dc';
export const STATOR_COLOR = '#79c27c';
const VORTEX_COLOR = '#ffe08a';

/** The half-torus shell of one wheel: side −1 behind (the pump), +1 in front (the turbine). */
function halfTorus(side: 1 | -1, segments: number): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= 16; i++) {
    const th = (i / 16) * Math.PI;
    profile.push([RC + A * Math.cos(th), side * HALF * Math.sin(th)]);
  }
  return lathe(profile, segments);
}

/** One blade spanning a half of the cross-section, in the plane through the axis at angle 0 (toward +Y). */
function bladeGeometry(side: 1 | -1): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(R_IN * MM, 0);
  for (let i = 1; i <= 16; i++) {
    const th = Math.PI - (i / 16) * Math.PI;
    shape.lineTo((RC + 0.97 * A * Math.cos(th)) * MM, side * 0.97 * HALF * Math.sin(th) * MM);
  }
  shape.lineTo(R_IN * MM, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: BLADE * MM, bevelEnabled: false });
  g.translate(0, 0, (-BLADE / 2) * MM);
  // Shape (r, z, thickness) to the world's (x = thickness, y = r, z = z).
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return g;
}

export class ConverterView {
  readonly group = new THREE.Group();
  readonly pump = new THREE.Group();
  readonly turbine = new THREE.Group();
  readonly stator = new THREE.Group();
  /** The cover: glass in the X-ray (the model's shells). */
  readonly cover: THREE.Mesh;
  /** The pump's and the turbine's half-torus shells: glass in the X-ray too, so the blades and the flow show. */
  readonly pumpShell: THREE.Mesh;
  readonly turbineShell: THREE.Mesh;
  readonly vortex: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly turn = new THREE.Quaternion();
  private readonly at = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private shownFlow = Number.NaN;

  /** Materials are the model's (it owns and disposes them); `cover` comes as solid and glass. */
  constructor(materials: { pump: THREE.MeshStandardMaterial; turbine: THREE.MeshStandardMaterial; stator: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial; cover: THREE.Material; vortex: THREE.MeshStandardMaterial }, segments: number) {
    this.group.add(this.pump, this.turbine, this.stator);
    const place = (mesh: THREE.InstancedMesh, count: number) => {
      for (let i = 0; i < count; i++) {
        this.turn.setFromAxisAngle(this.zAxis, (i / count) * Math.PI * 2);
        this.matrix.compose(this.at.set(0, 0, 0), this.turn, this.size.set(1, 1, 1));
        mesh.setMatrixAt(i, this.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    // The pump: its shell behind, the blades, the hub that drives the gearbox's oil pump.
    this.pumpShell = tag(new THREE.Mesh(halfTorus(-1, segments), materials.pump), 'gbx-impeller');
    this.pump.add(this.pumpShell);
    const pumpBlades = tag(new THREE.InstancedMesh(bladeGeometry(-1), materials.pump, PUMP_BLADES), 'gbx-impeller');
    place(pumpBlades, PUMP_BLADES);
    this.pump.add(pumpBlades);
    this.pump.add(tag(new THREE.Mesh(lathe([[16, -HALF - 4], [R_IN - 4, -HALF - 4], [R_IN - 4, -HALF + 2], [16, -HALF + 2]], segments), materials.pump), 'gbx-impeller'));

    // The turbine: its shell in front, the blades, its hub on the gearbox input.
    this.turbineShell = tag(new THREE.Mesh(halfTorus(1, segments), materials.turbine), 'gbx-turbine');
    this.turbine.add(this.turbineShell);
    const turbineBlades = tag(new THREE.InstancedMesh(bladeGeometry(1), materials.turbine, TURBINE_BLADES), 'gbx-turbine');
    place(turbineBlades, TURBINE_BLADES);
    this.turbine.add(turbineBlades);
    this.turbine.add(tag(new THREE.Mesh(lathe([[12, HALF + 4], [R_IN - 6, HALF + 4], [R_IN - 6, HALF - 2], [12, HALF - 2]], segments), materials.turbine), 'gbx-turbine'));
    // The lock-up plate rides on the turbine; with the clutch closed it turns with the cover.
    this.turbine.add(tag(new THREE.Mesh(lathe([[LOCKUP_IN, LOCKUP_Z - 2], [R_OUT, LOCKUP_Z - 2], [R_OUT, LOCKUP_Z + 2], [LOCKUP_IN, LOCKUP_Z + 2]], segments), materials.steel), 'gbx-lockup'));

    // The stator: a hub on its one-way clutch and blades across the inner edge of the torus, set at an angle.
    this.stator.add(tag(new THREE.Mesh(lathe([[22, -12], [R_IN - 20, -12], [R_IN - 20, 12], [22, 12]], segments), materials.stator), 'gbx-stator'));
    const statorBlade = new THREE.BoxGeometry(BLADE * 2 * MM, 20 * MM, 24 * MM);
    statorBlade.applyMatrix4(new THREE.Matrix4().makeRotationY(0.6));
    statorBlade.translate(0, (R_IN - 10) * MM, 0);
    const statorBlades = tag(new THREE.InstancedMesh(statorBlade, materials.stator, STATOR_BLADES), 'gbx-stator');
    place(statorBlades, STATOR_BLADES);
    this.stator.add(statorBlades);

    // The cover: bolted to the flexplate, round the turbine to the pump's outer edge. It turns with the pump.
    this.cover = tag(
      new THREE.Mesh(
        lathe([[R_OUT + 2, -4], [R_OUT + 10, 4], [R_OUT + 10, COVER_FRONT - 8], [R_OUT, COVER_FRONT], [30, COVER_FRONT]], segments),
        materials.cover,
      ),
      'gbx-impeller',
    );
    this.pump.add(this.cover);

    // The circulation: cones round each cross-section, the same pattern at several places round the axis.
    const cone = new THREE.ConeGeometry(5 * MM, 14 * MM, 10);
    this.vortex = new THREE.InstancedMesh(cone, materials.vortex, VORTEX_PLACES * VORTEX_ARROWS);
    this.vortex.renderOrder = 40;
    this.vortex.userData.ownOrder = 40;
    this.vortex.raycast = () => undefined;
    this.group.add(this.vortex);
    this.update({ pump: 0, turbine: 0, stator: 0, flow: 0, strength: 0 });
  }

  update(frame: ConverterFrame): void {
    this.pump.rotation.z = -frame.pump;
    this.turbine.rotation.z = -frame.turbine;
    this.stator.rotation.z = -frame.stator;
    // The oil turns round the axis too; the pattern goes round with the turbine.
    this.vortex.rotation.z = -frame.turbine;
    const s = Math.min(1, Math.max(0, frame.strength));
    this.vortex.visible = s > 0.02;
    if (!this.vortex.visible || Math.abs(frame.flow - this.shownFlow) < 1e-4) return;
    this.shownFlow = frame.flow;
    const scale = 0.5 + 0.7 * s;
    let i = 0;
    for (let p = 0; p < VORTEX_PLACES; p++) {
      const phi = ((p + 0.5) / VORTEX_PLACES) * Math.PI * 2;
      const ex = Math.sin(phi);
      const ey = Math.cos(phi);
      for (let k = 0; k < VORTEX_ARROWS; k++) {
        // Increasing psi runs out through the pump (z < 0) and in through the turbine (z > 0).
        const psi = frame.flow + (k / VORTEX_ARROWS) * Math.PI * 2;
        const r = RC + VORTEX_K * A * Math.cos(psi);
        const z = VORTEX_K * HALF * Math.sin(psi);
        this.at.set(r * ex * MM, r * ey * MM, z * MM);
        const dr = -A * Math.sin(psi);
        const dz = HALF * Math.cos(psi);
        this.dir.set(dr * ex, dr * ey, dz).normalize();
        this.turn.setFromUnitVectors(this.up, this.dir);
        this.matrix.compose(this.at, this.turn, this.size.set(scale, scale, scale));
        this.vortex.setMatrixAt(i++, this.matrix);
      }
    }
    this.vortex.instanceMatrix.needsUpdate = true;
  }
}

/** Front of the cover over the torus' middle, mm: where the converter ends toward the engine. */
export const CONVERTER_FRONT_MM = COVER_FRONT;
/** Back of the pump's hub behind the torus' middle, mm. */
export const CONVERTER_BACK_MM = HALF + 4;
/** Outer radius with the cover, mm. */
export const CONVERTER_RADIUS_MM = R_OUT + 10;
export { VORTEX_COLOR };
