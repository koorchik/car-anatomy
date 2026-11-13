// The dyno in 3D: absorber on trunnion pedestals, its torque arm on a load cell, the cardan shaft to the flywheel and,
// when the absorber is taller than the engine's crank, a stand under the engine. It lives in the stage's extras,
// not in the model, because the model shakes and rolls on its mounts and a floor-standing absorber must not.
// One scene unit is 100 mm. Proportions are estimates; only the lever arm is used in the readouts too.

import * as THREE from 'three';
import type { AbsorberKind, DynoSpec } from '../engine/dyno-load.ts';
import { glassMaterial } from './materials.ts';
import { tag, type EngineModel, type ViewMode } from './model-types.ts';
import { merge, zCylinder } from './geometry.ts';

const DEG = Math.PI / 180;
/** Lever arm to the load cell, scene units: 0.35 m, as the readout uses. */
const ARM = 3.5;
/** Stator tilt at full absorber torque, exaggerated so it can be seen. */
const TILT_DEG = 1.5;

const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export class DynoRig {
  readonly group = new THREE.Group();
  private readonly stator = new THREE.Group();
  private readonly spinning = new THREE.Group();
  private readonly engineSide = new THREE.Group();
  private readonly frame: THREE.Object3D[] = [];
  private housing: THREE.Mesh | null = null;
  private readonly solid = new THREE.MeshStandardMaterial({ color: '#cbd0cc', roughness: 0.45, metalness: 0.35 });
  private readonly glass = glassMaterial('#cbd0cc', 0.05, 0.45);
  private readonly steel = new THREE.MeshStandardMaterial({ color: '#9aa3a6', roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide });
  private readonly dark = new THREE.MeshStandardMaterial({ color: '#3f484c', roughness: 0.7, metalness: 0.4 });
  private readonly rotorMaterial = new THREE.MeshStandardMaterial({ color: '#b57a45', roughness: 0.4, metalness: 0.7 });
  private readonly cell = new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.4, metalness: 0.3 });
  private model: EngineModel | null = null;
  private axis = new THREE.Vector2();
  private view: ViewMode = 'xray';
  private exploded = false;
  /** Floor the rig stands on, in scene units: below zero when the engine needs a stand. */
  floorY = 0;

  constructor() {
    this.group.visible = false;
    this.group.add(this.stator, this.spinning, this.engineSide);
  }

  /** Builds the rig behind this model's flywheel, sized for this absorber. */
  attach(model: EngineModel, spec: DynoSpec): void {
    this.clear();
    this.model = model;
    const g = model.group;
    // Measure the engine at rest, whatever its mounts are doing this frame.
    const position = g.position.clone();
    const rotation = g.rotation.clone();
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    g.updateMatrixWorld(true);
    let flywheel: THREE.Object3D | null = null;
    g.traverse((o) => {
      if (!flywheel && o.userData.part === 'flywheel') flywheel = o;
    });
    const engineBox = new THREE.Box3().setFromObject(g);
    const fly = flywheel ? new THREE.Box3().setFromObject(flywheel) : engineBox;
    g.position.copy(position);
    g.rotation.copy(rotation);
    g.updateMatrixWorld(true);

    const axisX = (fly.min.x + fly.max.x) / 2;
    const axisY = (fly.min.y + fly.max.y) / 2;
    this.axis.set(axisX, axisY);
    const rear = Math.min(fly.min.z, engineBox.min.z);
    const s = Math.cbrt(spec.ratedNm / 600);
    const R = 2.4 * s;
    const L = 4.2 * s;
    const shaftLength = 3.5;
    const front = rear - shaftLength;
    const centre = front - L / 2;
    const base = Math.min(0, axisY - R - 0.6);
    this.floorY = base;

    // Stator: the housing that hangs on its trunnions, the arm and the top of the load cell. It turns about the axis.
    this.stator.position.set(axisX, axisY, centre);
    const housing = tag(new THREE.Mesh(zCylinder(R, L, 48), this.solid), 'dyno-absorber');
    housing.castShadow = true;
    this.housing = housing;
    // Bands round the ends of the casing, open so they do not fight its end caps.
    const flange = tag(new THREE.Mesh(zCylinder(R * 1.05, 0.3, 48, 0, 0, L / 2 - 0.15, true), this.steel), 'dyno-absorber');
    const backFlange = tag(new THREE.Mesh(zCylinder(R * 1.05, 0.3, 48, 0, 0, -L / 2 + 0.15, true), this.steel), 'dyno-absorber');
    const arm = tag(new THREE.Mesh(box(ARM, 0.22 * s + 0.1, 0.3, ARM / 2, 0, 0), this.dark), 'dyno-loadcell');
    const cellTop = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 20).translate(ARM, -0.4, 0), this.cell), 'dyno-loadcell');
    this.stator.add(housing, flange, backFlange, arm, cellTop);
    this.frame.push(housing, flange, backFlange, arm, cellTop);

    // Rotor and shaft turn with the crank.
    this.spinning.position.set(axisX, axisY, 0);
    const rotor = tag(new THREE.Mesh(this.rotorGeometry(spec.absorber, R * 0.85, L * 0.3), this.rotorMaterial), 'dyno-absorber');
    rotor.position.z = centre;
    const shaft = tag(new THREE.Mesh(zCylinder(0.3, shaftLength - 0.6, 20, 0, 0, rear - shaftLength / 2), this.steel), 'dyno-shaft');
    const yokeAbsorber = tag(new THREE.Mesh(this.yokeGeometry(0.55, front + 0.3), this.steel), 'dyno-shaft');
    const through = tag(new THREE.Mesh(zCylinder(0.35, L + 0.8, 20, 0, 0, centre), this.steel), 'dyno-shaft');
    this.spinning.add(rotor, shaft, yokeAbsorber, through);

    // The flange on the flywheel moves with the engine on its mounts.
    const yokeEngine = tag(new THREE.Mesh(this.yokeGeometry(0.55, rear - 0.3), this.steel), 'dyno-shaft');
    this.engineSide.add(yokeEngine);

    // Bedplate, pedestals and the load cell's pillar stand on the floor.
    const fixed: THREE.Mesh[] = [];
    const rail = (x: number): THREE.Mesh => new THREE.Mesh(box(0.5, 0.35, L + 2.2, x, base + 0.175, centre), this.dark);
    fixed.push(rail(axisX - R * 0.7), rail(axisX + R * 0.7));
    const pedestalHeight = axisY - base;
    for (const z of [centre + L / 2 + 0.25, centre - L / 2 - 0.25]) {
      fixed.push(new THREE.Mesh(box(R * 1.5, pedestalHeight - 0.3, 0.4, axisX, base + (pedestalHeight - 0.3) / 2, z), this.dark));
      fixed.push(new THREE.Mesh(zCylinder(0.45, 0.5, 20, axisX, axisY, z), this.steel));
    }
    const pillarHeight = axisY - 0.65 - base;
    fixed.push(tag(new THREE.Mesh(box(0.5, pillarHeight, 0.5, axisX + ARM, base + pillarHeight / 2, centre), this.dark), 'dyno-loadcell'));
    if (base < -0.05) fixed.push(...this.stand(engineBox, base));
    for (const m of fixed) {
      m.castShadow = true;
      this.group.add(m);
      this.frame.push(m);
    }
    this.setView(this.view);
    this.group.visible = !this.exploded;
  }

  /** Legs and rails under the engine, up to its lowest point, for a rig standing below the engine's own base. */
  private stand(engine: THREE.Box3, base: number): THREE.Mesh[] {
    const top = engine.min.y;
    const height = top - base;
    const out: THREE.Mesh[] = [];
    const inset = 0.6;
    const xs = [engine.min.x + inset, engine.max.x - inset];
    const zs = [engine.min.z + inset, engine.max.z - inset];
    for (const x of xs) {
      for (const z of zs) out.push(new THREE.Mesh(box(0.35, height, 0.35, x, base + height / 2, z), this.dark));
      out.push(new THREE.Mesh(box(0.35, 0.3, zs[1]! - zs[0]! + 0.35, x, top - 0.15, (zs[0]! + zs[1]!) / 2), this.dark));
    }
    return out;
  }

  private rotorGeometry(kind: AbsorberKind, radius: number, depth: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [zCylinder(radius * 0.92, depth * 0.5, 40)];
    // An eddy-current rotor is a toothed steel disc; a water brake's has vanes that throw the water outwards.
    const count = kind === 'eddy' ? 18 : 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const vane = kind === 'eddy' ? new THREE.BoxGeometry(radius * 0.16, radius * 0.22, depth) : new THREE.BoxGeometry(radius * 0.06, radius * 0.6, depth * 0.9);
      vane.translate(0, kind === 'eddy' ? radius * 0.92 : radius * 0.6, 0);
      vane.rotateZ(a);
      parts.push(vane);
    }
    return merge(parts);
  }

  private yokeGeometry(radius: number, z: number): THREE.BufferGeometry {
    return merge([zCylinder(radius, 0.35, 24, 0, 0, z), new THREE.BoxGeometry(radius * 2.2, 0.25, 0.35).translate(0, 0, z - 0.3)]);
  }

  detach(): void {
    this.clear();
    this.model = null;
    this.floorY = 0;
    this.group.visible = false;
  }

  private clear(): void {
    for (const holder of [this.group, this.stator, this.spinning, this.engineSide]) {
      for (const child of [...holder.children]) {
        if (child === this.stator || child === this.spinning || child === this.engineSide) continue;
        holder.remove(child);
        (child as THREE.Mesh).geometry?.dispose();
      }
    }
    this.frame.length = 0;
    this.housing = null;
  }

  setView(view: ViewMode): void {
    this.view = view;
    if (this.housing) this.housing.material = view === 'solid' ? this.solid : this.glass;
    const mechanism = view === 'mechanism';
    for (const o of this.frame) o.visible = !mechanism;
  }

  /** The rig would be in the way of a flywheel sliding off the back. */
  setExplode(amount: number): void {
    this.exploded = amount > 0;
    this.group.visible = !!this.model && !this.exploded;
  }

  /** Shaft and rotor at the crank's angle, the stator tilted by the absorber's torque. */
  update(theta: number, absorberShare: number): void {
    if (!this.model || !this.group.visible) return;
    this.spinning.rotation.z = -theta * DEG;
    this.engineSide.rotation.z = -theta * DEG;
    const g = this.model.group;
    this.engineSide.position.set(this.axis.x + g.position.x, this.axis.y + g.position.y, g.position.z);
    this.engineSide.rotation.x = g.rotation.x;
    this.engineSide.rotation.y = g.rotation.y;
    this.stator.rotation.z = -Math.min(1, Math.max(0, absorberShare)) * TILT_DEG * DEG;
  }

  get attached(): boolean {
    return this.model !== null;
  }

  dispose(): void {
    this.clear();
    for (const m of [this.solid, this.glass, this.steel, this.dark, this.rotorMaterial, this.cell]) m.dispose();
  }
}
