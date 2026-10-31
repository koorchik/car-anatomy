import * as THREE from 'three';
import { DEG, cyclePhase, mod, strokeAt, type Cylinder, type Engine } from '../engine/kinematics.ts';
import { MM, extrude, flywheelGeometry, gearShape, merge, pulleyGeometry, tubeAlong, zCylinder } from './geometry.ts';
import { createMaterials, glowTexture, hotPipeMaterial, type EngineMaterials, type HotPipeUniforms } from './materials.ts';
import { GAS, disposeTree, tag, type EngineModel, type FrameState, type ViewMode } from './model-types.ts';

/** Point on the housing's inner surface, parameter in degrees. Matches the apex path. */
export function housingPoint(psiDeg: number, R: number, e: number): [number, number] {
  const p = psiDeg * DEG;
  return [e * Math.sin(3 * p) + R * Math.sin(p), e * Math.cos(3 * p) + R * Math.cos(p)];
}

/** Bulge of a rotor flank beyond the chord, as a fraction of R. Tuned against the housing clearance test. */
export const FLANK_BULGE = 0.165;

/** Point on a rotor flank in the rotor's own frame. `face` is the flank index, t runs from apex to apex. */
export function flankPoint(face: number, t: number, R: number): [number, number] {
  const a0 = (face * 120) * DEG;
  const a1 = ((face + 1) * 120) * DEG;
  const x0 = R * Math.sin(a0);
  const y0 = R * Math.cos(a0);
  const x1 = R * Math.sin(a1);
  const y1 = R * Math.cos(a1);
  const mid = (a0 + a1) / 2;
  const bulge = FLANK_BULGE * R * Math.sin(Math.PI * t);
  return [x0 + (x1 - x0) * t + Math.sin(mid) * bulge, y0 + (y1 - y0) * t + Math.cos(mid) * bulge];
}

const STRIP = 22;

interface Chamber {
  def: Cylinder;
  /** Which rotor flank forms this chamber. */
  face: number;
  rotor: RotorParts;
  positions: THREE.BufferAttribute;
  material: THREE.MeshBasicMaterial;
}

interface RotorParts {
  group: THREE.Group;
  rotor: THREE.Mesh;
  gearOnShaft: THREE.Mesh;
  /** Crank angle offset so all rotor geometry is written in one rotor's own terms. */
  phase: number;
}

export class RotaryEngineModel implements EngineModel {
  readonly group = new THREE.Group();
  private readonly mounted = new THREE.Group();
  private readonly engine: Engine;
  private readonly materials: EngineMaterials;
  private readonly R: number;
  private readonly e: number;
  private readonly width: number;
  private readonly rotors: RotorParts[] = [];
  private readonly chambers: Chamber[] = [];
  private readonly shaft: THREE.Group;
  private readonly spinners: Array<{ object: THREE.Object3D; ratio: number }> = [];
  private readonly shellMeshes: Array<{ mesh: THREE.Mesh; solid: THREE.Material; glass: THREE.Material }> = [];
  private readonly peripheral: THREE.Object3D[] = [];
  private readonly solidOnly: THREE.Object3D[] = [];
  private readonly sparks: THREE.Sprite[][] = [];
  private readonly pipes: HotPipeUniforms[] = [];
  private readonly flash: THREE.PointLight;
  private readonly explodables: Array<{ object: THREE.Object3D; direction: THREE.Vector3 }> = [];
  private viewMode: ViewMode = 'xray';
  private heat = 0;
  private roll = 0;
  private rollVel = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    const layout = engine.spec.layout;
    if (layout.kind !== 'wankel') throw new Error('RotaryEngineModel needs a wankel layout');
    this.R = layout.R * MM;
    this.e = layout.e * MM;
    this.width = layout.width * MM;
    this.materials = createMaterials(engine.spec.coverColor, engine.spec.blockMaterial);
    this.group.add(this.mounted);
    this.shaft = new THREE.Group();
    this.mounted.add(this.shaft);
    this.buildShaftAndEnds(layout.rotors);
    for (let i = 0; i < layout.rotors; i++) this.buildRotorSection(i, layout.rotors);
    this.buildPlumbing(layout.rotors);

    this.flash = new THREE.PointLight('#ff8a3a', 0, this.R * 6, 2);
    this.mounted.add(this.flash);

    const box = new THREE.Box3().setFromObject(this.mounted);
    const centre = box.getCenter(new THREE.Vector3());
    this.mounted.position.set(-centre.x, -box.min.y, -centre.z);
    this.setView('xray');
  }

  private zOf(rotor: number, count: number): number {
    const pitch = this.width + 22 * MM;
    return ((count - 1) / 2 - rotor) * pitch;
  }

  private buildShaftAndEnds(rotors: number): void {
    const m = this.materials;
    const front = this.zOf(0, rotors) + this.width / 2 + 0.3;
    const rear = this.zOf(rotors - 1, rotors) - this.width / 2 - 0.3;
    const shaftR = this.R * 0.2;
    const shaftGeo = zCylinder(shaftR, front - rear + 0.5, 32, 0, 0, (front + rear) / 2);
    const lobes: THREE.BufferGeometry[] = [shaftGeo];
    for (let i = 0; i < rotors; i++) {
      const phase = this.rotorPhase(i);
      // Rotor journal: offset from the shaft by the eccentricity, at its own firing phase.
      const a = (90 - phase) * DEG;
      lobes.push(zCylinder(this.R * 0.46, this.width * 0.92, 40, this.e * Math.sin(a), this.e * Math.cos(a), this.zOf(i, rotors)));
    }
    const shaft = tag(new THREE.Mesh(merge(lobes), m.crank), 'eccentric');
    shaft.castShadow = true;
    this.shaft.add(shaft);

    const flywheel = tag(new THREE.Mesh(flywheelGeometry(this.R * 1.1, this.R * 0.26), m.flywheel), 'flywheel');
    flywheel.position.z = rear - 0.15;
    flywheel.castShadow = true;
    this.mounted.add(flywheel);
    this.spinners.push({ object: flywheel, ratio: 1 });
    this.explodables.push({ object: flywheel, direction: new THREE.Vector3(0, 0, -1.2) });

    const pulley = tag(new THREE.Mesh(pulleyGeometry(this.R * 0.5, this.R * 0.28), m.sprocket), 'pulley');
    pulley.position.z = front + 0.1;
    pulley.castShadow = true;
    this.mounted.add(pulley);
    this.spinners.push({ object: pulley, ratio: 1 });
    this.peripheral.push(pulley);
  }

  private rotorPhase(rotor: number): number {
    return this.engine.cylinders.find((c) => c.bank === rotor)!.fire % 360;
  }

  private buildRotorSection(index: number, count: number): void {
    const m = this.materials;
    const z = this.zOf(index, count);
    const R = this.R;
    const e = this.e;
    const section = new THREE.Group();
    section.position.z = z;
    this.mounted.add(section);

    // Housing: rounded body with the trochoid cut out of it.
    const outer = new THREE.Shape();
    const half = R * 1.32;
    const tall = (R + e) * 1.28;
    const round = R * 0.32;
    outer.moveTo(-half + round, -tall);
    outer.lineTo(half - round, -tall);
    outer.quadraticCurveTo(half, -tall, half, -tall + round);
    outer.lineTo(half, tall - round);
    outer.quadraticCurveTo(half, tall, half - round, tall);
    outer.lineTo(-half + round, tall);
    outer.quadraticCurveTo(-half, tall, -half, tall - round);
    outer.lineTo(-half, -tall + round);
    outer.quadraticCurveTo(-half, -tall, -half + round, -tall);
    const hole = new THREE.Path();
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const [x, y] = housingPoint(-(i / steps) * 360, R, e);
      if (i === 0) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    outer.holes.push(hole);
    const housingGeo = extrude(outer, this.width + 0.04, { thickness: 0.015, segments: 1 }, 12);
    const housing = tag(new THREE.Mesh(housingGeo, m.housing), 'housing');
    housing.castShadow = true;
    housing.renderOrder = 6;
    section.add(housing);
    this.shellMeshes.push({ mesh: housing, solid: m.housing, glass: m.blockGlass });
    this.explodables.push({ object: section, direction: new THREE.Vector3(0, 0, ((count - 1) / 2 - index) * 1.1) });

    // Side plates close the chambers front and rear.
    const plateShape = new THREE.Shape();
    plateShape.moveTo(-half + round, -tall);
    plateShape.lineTo(half - round, -tall);
    plateShape.quadraticCurveTo(half, -tall, half, -tall + round);
    plateShape.lineTo(half, tall - round);
    plateShape.quadraticCurveTo(half, tall, half - round, tall);
    plateShape.lineTo(-half + round, tall);
    plateShape.quadraticCurveTo(-half, tall, -half, tall - round);
    plateShape.lineTo(-half, -tall + round);
    plateShape.quadraticCurveTo(-half, -tall, -half + round, -tall);
    const shaftHole = new THREE.Path();
    shaftHole.absarc(0, 0, R * 0.24, 0, Math.PI * 2, true);
    plateShape.holes.push(shaftHole);
    const plateGeo = extrude(plateShape, 0.08, { thickness: 0.01, segments: 1 }, 12);
    const boltParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const plate = tag(new THREE.Mesh(plateGeo, m.block), 'housing');
      plate.position.z = side * (this.width / 2 + 0.06);
      plate.castShadow = true;
      plate.renderOrder = 7;
      section.add(plate);
      this.shellMeshes.push({ mesh: plate, solid: m.block, glass: m.coverGlass });
      // Tension bolts through the whole stack, at the rim of the plate.
      const count = 14;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const q = Math.max(Math.abs(Math.cos(a)) / (half - 0.06), Math.abs(Math.sin(a)) / (tall - 0.06));
        const bolt = new THREE.CylinderGeometry(R * 0.035, R * 0.035, 0.03, 6);
        bolt.rotateX(Math.PI / 2);
        bolt.translate(Math.cos(a) / q, Math.sin(a) / q, side * (this.width / 2 + 0.11));
        boltParts.push(bolt);
      }
    }
    const bolts = tag(new THREE.Mesh(merge(boltParts), m.pin), 'housing');
    section.add(bolts);
    this.solidOnly.push(bolts);
    // Painted band on the outer face, so a section reads as one unit from above.
    const finParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const fin = new THREE.BoxGeometry(half * 1.5, 0.03, this.width * 0.92);
      fin.translate(0, side * (tall + 0.015), 0);
      finParts.push(fin);
    }
    const coverStrip = tag(new THREE.Mesh(merge(finParts), m.cover), 'housing');
    coverStrip.castShadow = true;
    section.add(coverStrip);
    this.solidOnly.push(coverStrip);

    // Rotor.
    const rotorGroup = new THREE.Group();
    section.add(rotorGroup);
    const rotorShape = new THREE.Shape();
    for (let face = 0; face < 3; face++) {
      for (let k = 0; k < STRIP; k++) {
        const [x, y] = flankPoint(face, k / STRIP, R * 0.995);
        if (face === 0 && k === 0) rotorShape.moveTo(x, y);
        else rotorShape.lineTo(x, y);
      }
    }
    rotorShape.closePath();
    const bearingHole = new THREE.Path();
    bearingHole.absarc(0, 0, R * 0.48, 0, Math.PI * 2, true);
    rotorShape.holes.push(bearingHole);
    const rotorGeo = extrude(rotorShape, this.width * 0.97, { thickness: 0.012, segments: 1 }, 24);
    const ringGear = extrude(gearShape(R * 0.46, R * 0.42, 30, R * 0.34), this.width * 0.2, undefined, 6);
    ringGear.translate(0, 0, this.width * 0.5);
    const rotor = tag(new THREE.Mesh(merge([rotorGeo, ringGear]), m.piston), 'rotor');
    rotor.castShadow = true;
    rotorGroup.add(rotor);

    // Fixed gear on the side plate, which the rotor rolls around.
    const stationary = tag(new THREE.Mesh(extrude(gearShape(R * 0.3, R * 0.27, 20, R * 0.22), this.width * 0.2, undefined, 6), m.sprocket), 'rotor');
    stationary.position.z = this.width * 0.5;
    section.add(stationary);

    const parts: RotorParts = { group: rotorGroup, rotor, gearOnShaft: stationary, phase: this.rotorPhase(index) };
    this.rotors.push(parts);

    // Dynamic chamber fills between each flank and the housing.
    for (let i = 0; i < 3; i++) {
      const def = this.engine.cylinders.find((c) => c.bank === index && c.n === index * 3 + i + 1)!;
      const face = mod(-i, 3);
      const vertexCount = (STRIP + 1) * 2 * 2;
      const positions = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
      const indices: number[] = [];
      const strip = STRIP + 1;
      for (let k = 0; k < STRIP; k++) {
        // Front and rear walls of the chamber.
        for (const layer of [0, strip * 2]) {
          const a = layer + k * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', positions);
      geo.setIndex(indices);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        color: '#ffffff',
      });
      const fill = tag(new THREE.Mesh(geo, material), 'chamber');
      fill.renderOrder = 3;
      fill.frustumCulled = false;
      section.add(fill);
      this.chambers.push({ def, face, rotor: parts, positions, material });
    }

    // Two spark plugs on the short side of the housing.
    const sparkTex = glowTexture();
    const plugs: THREE.Sprite[] = [];
    for (const dy of [-R * 0.16, R * 0.16]) {
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      spark.position.set(R - e + 0.01, dy, 0);
      spark.scale.setScalar(R * 0.42);
      spark.renderOrder = 4;
      section.add(spark);
      plugs.push(spark);
    }
    this.sparks.push(plugs);
  }

  private buildPlumbing(rotors: number): void {
    const R = this.R;
    const half = R * 1.32;
    const m = this.materials;
    const pipeR = R * 0.14;
    const zRear = this.zOf(rotors - 1, rotors) - this.width - 0.4;
    for (let i = 0; i < rotors; i++) {
      const z = this.zOf(i, rotors);
      // Exhaust leaves the long-axis side of the housing.
      const pts = [
        new THREE.Vector3(-half, -R * 0.42, z),
        new THREE.Vector3(-half - R * 0.48, -R * 0.5, z),
        new THREE.Vector3(-half - R * 0.8, -R * 0.82, z - 0.15),
        new THREE.Vector3(-half - R * 0.92, -R * 0.95, zRear),
      ];
      const { material, uniforms } = hotPipeMaterial();
      const pipe = tag(new THREE.Mesh(tubeAlong(pts, pipeR, 32, 10), material), 'header');
      pipe.castShadow = true;
      this.mounted.add(pipe);
      this.peripheral.push(pipe);
      this.pipes.push(uniforms);
      // Intake runner rises from the same side, above the port.
      const runner = [
        new THREE.Vector3(-half, R * 0.52, z),
        new THREE.Vector3(-half - R * 0.5, R * 0.72, z),
        new THREE.Vector3(-half - R * 0.62, R * 1.1, z),
      ];
      const intake = tag(new THREE.Mesh(tubeAlong(runner, pipeR * 0.86, 14, 10), m.intake), 'intake');
      intake.castShadow = true;
      this.mounted.add(intake);
      this.peripheral.push(intake);
    }
    const zs = [this.zOf(0, rotors), this.zOf(rotors - 1, rotors)];
    const plenum = tag(new THREE.Mesh(zCylinder(pipeR * 1.5, zs[0]! - zs[1]! + 0.5, 20, -half - R * 0.62, R * 1.14, (zs[0]! + zs[1]!) / 2), m.intake), 'intake');
    plenum.castShadow = true;
    this.mounted.add(plenum);
    this.peripheral.push(plenum);
  }

  setView(view: ViewMode): void {
    this.viewMode = view;
    for (const { mesh, solid, glass } of this.shellMeshes) {
      mesh.visible = view !== 'mechanism';
      mesh.material = view === 'solid' ? solid : glass;
      mesh.castShadow = view === 'solid';
    }
    for (const p of this.peripheral) p.visible = view !== 'mechanism';
    for (const o of this.solidOnly) o.visible = view === 'solid';
    for (const c of this.chambers) {
      const mesh = this.chamberMesh(c);
      if (mesh) mesh.visible = view !== 'solid';
    }
    for (const list of this.sparks) for (const s of list) s.visible = view !== 'solid';
    this.flash.intensity = 0;
  }

  private chamberMesh(c: Chamber): THREE.Object3D | null {
    const section = c.rotor.group.parent;
    return section?.children.find((o) => (o as THREE.Mesh).material === c.material) ?? null;
  }

  setExplode(amount: number): void {
    for (const { object, direction } of this.explodables) {
      const base = object.userData.basePos ?? (object.userData.basePos = object.position.clone());
      object.position.copy(base).addScaledVector(direction, amount);
    }
  }

  update(state: FrameState): void {
    const e = this.engine;
    const { theta } = state;
    const R = this.R;
    const ecc = this.e;

    this.shaft.rotation.z = -theta * DEG;
    for (const s of this.spinners) s.object.rotation.z = -theta * s.ratio * DEG;

    // Rotor position: theta 0 of a rotor's own frame sits 90 degrees before TDC on the plug side.
    for (const parts of this.rotors) {
      const own = theta - parts.phase + 90;
      const a = own * DEG;
      const centreX = ecc * Math.sin(a);
      const centreY = ecc * Math.cos(a);
      parts.group.position.set(centreX, centreY, 0);
      parts.group.rotation.z = -(own / 3) * DEG;
    }

    const firing = state.running && !state.fuelCut;
    let brightest = 0;
    let brightZ = 0;
    this.sparks.forEach((list) => list.forEach((s) => ((s.material as THREE.SpriteMaterial).opacity = 0)));

    const frontZ = this.width * 0.485;

    for (const c of this.chambers) {
      const parts = c.rotor;
      const own = theta - parts.phase + 90;
      const rotorAngle = own / 3;
      const a = own * DEG;
      const cx = ecc * Math.sin(a);
      const cy = ecc * Math.cos(a);
      const rot = -rotorAngle * DEG;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const start = rotorAngle + c.face * 120;
      const pos = c.positions;
      const strip = STRIP + 1;
      for (let k = 0; k <= STRIP; k++) {
        const t = k / STRIP;
        const [hx, hy] = housingPoint(start + t * 120, R, ecc);
        const [fx, fy] = flankPoint(c.face, t, R * 0.995);
        const wx = fx * cos - fy * sin + cx;
        const wy = fx * sin + fy * cos + cy;
        // Front face strip then rear face strip.
        pos.setXYZ(k * 2, hx, hy, frontZ);
        pos.setXYZ(k * 2 + 1, wx, wy, frontZ);
        pos.setXYZ(strip * 2 + k * 2, hx, hy, -frontZ);
        pos.setXYZ(strip * 2 + k * 2 + 1, wx, wy, -frontZ);
      }
      pos.needsUpdate = true;

      const phase = cyclePhase(e, c.def, theta);
      const stroke = strokeAt(phase);
      const color = c.material.color;
      let opacity = 0.3;
      switch (stroke) {
        case 'power': {
          const u = phase * 4;
          if (!firing) {
            color.copy(GAS.exhaust);
            opacity = 0.18;
          } else if (u < 0.12) {
            color.copy(GAS.flash).lerp(GAS.fire, u / 0.12);
            opacity = 0.95;
          } else {
            color.copy(GAS.fire).lerp(GAS.smoke, (u - 0.12) / 0.88);
            opacity = 0.85 - u * 0.5;
          }
          if (firing && phase < 0.06) {
            const list = this.sparks[e.cylinders.find((x) => x.n === c.def.n)!.bank]!;
            for (const s of list) (s.material as THREE.SpriteMaterial).opacity = 1 - phase / 0.06;
            const glow = 1 - phase / 0.1;
            if (glow > brightest) {
              brightest = glow;
              brightZ = c.def.z * MM;
            }
          }
          break;
        }
        case 'exhaust':
          color.copy(GAS.smoke).lerp(GAS.exhaust, (phase - 0.25) * 4);
          opacity = 0.42 - (phase - 0.25) * 0.8;
          break;
        case 'intake':
          color.copy(GAS.intake);
          opacity = 0.16 + (phase - 0.5) * 1.0;
          break;
        case 'compression': {
          const u = (phase - 0.75) * 4;
          color.copy(GAS.intake).lerp(GAS.compression, u);
          opacity = 0.4 + u * 0.32;
          break;
        }
      }
      c.material.opacity = opacity;
    }

    if (this.viewMode !== 'solid' && firing) {
      this.flash.position.set(R * 0.72, 0, brightZ);
      this.flash.intensity = brightest * (2.5 + state.load * 8);
    } else {
      this.flash.intensity = 0;
    }

    const nRpm = state.rpm / e.spec.redlineRpm;
    const targetHeat = state.running ? Math.pow(state.load * 0.6 + nRpm * 0.5, 1.4) : 0;
    this.heat += (targetHeat - this.heat) * Math.min(1, state.dt * (targetHeat > this.heat ? 0.35 : 0.14));
    this.pipes.forEach((u, i) => {
      u.uHeat.value = this.heat;
      const rotorFire = this.rotors[i]!.phase;
      const phi = mod(theta - rotorFire, 360) / 360;
      const x = (phi - 0.6) / 0.4;
      if (firing && x >= 0) {
        u.uPulsePos.value = x;
        u.uPulseAmp.value = (1 - x * 0.7) * (0.3 + state.load * 0.7);
      } else {
        u.uPulseAmp.value = 0;
      }
    });

    // A rotary hardly shakes. Only torque roll remains.
    const target = firing ? state.load * 0.018 : 0;
    const acc = (target - this.roll) * 60 - this.rollVel * 7;
    this.rollVel += acc * state.dt;
    this.roll += this.rollVel * state.dt;
    this.group.rotation.z = this.roll * Math.max(state.shake, 0.2);
  }

  dispose(): void {
    disposeTree(this.group);
  }
}
