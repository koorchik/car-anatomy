import * as THREE from 'three';
import {
  DEG,
  EXHAUST_CLOSE,
  EXHAUST_OPEN,
  EXHAUST_PEAK,
  INTAKE_PEAK,
  cyclePhase,
  exhaustLift,
  intakeLift,
  mod,
  pistonPin,
  strokeAt,
  vibrationTable,
  type Cylinder,
  type Engine,
  type VibrationTable,
} from '../engine/kinematics.ts';
import {
  MM,
  hullShape,
  beltCurve,
  blockSection,
  camshaftGeometry,
  crankGeometry,
  extrude,
  flywheelGeometry,
  gearShape,
  merge,
  pistonGeometry,
  pulleyGeometry,
  rodGeometry,
  roundedRect,
  springGeometry,
  tubeAlong,
  valveGeometry,
  zCylinder,
  type LobeDef,
} from './geometry.ts';
import { createMaterials, glowTexture, hotPipeMaterial, type EngineMaterials, type HotPipeUniforms } from './materials.ts';
import { GAS, disposeTree, tag, type EngineModel, type FrameState, type ViewMode } from './model-types.ts';

interface CylinderParts {
  def: Cylinder;
  frame: THREE.Group;
  piston: THREE.Group;
  rod: THREE.Mesh;
  gas: THREE.Mesh;
  gasMaterial: THREE.MeshBasicMaterial;
  spark: THREE.Sprite;
  crownOffset: number;
}

interface ValveDef {
  cyl: Cylinder;
  exhaust: boolean;
  /** Valve-seat frame inside the engine. */
  base: THREE.Matrix4;
  /** Rocker details for pushrod engines. */
  ohv?: { pivot: THREE.Vector3; camDir: THREE.Vector3; camCenter: THREE.Vector3; rodEnd: THREE.Vector3; valveTip: THREE.Vector3; camBase: number };
}

interface HeaderPipe {
  cyl: Cylinder;
  uniforms: HotPipeUniforms;
}

interface Explodable {
  object: THREE.Object3D;
  direction: THREE.Vector3;
}

const scratch = new THREE.Color();

/** Colour and opacity of the gas for a given cycle position. Also tells if the spark is visible. */
function gasAppearance(phase: number, firing: boolean): { color: THREE.Color; opacity: number } {
  const stroke = strokeAt(phase);
  switch (stroke) {
    case 'power': {
      if (!firing) return { color: scratch.copy(GAS.compression).lerp(GAS.exhaust, phase * 4), opacity: 0.2 };
      const t = phase * 4;
      if (t < 0.12) return { color: scratch.copy(GAS.flash).lerp(GAS.fire, t / 0.12), opacity: 0.95 };
      return { color: scratch.copy(GAS.fire).lerp(GAS.smoke, (t - 0.12) / 0.88), opacity: 0.85 - t * 0.45 };
    }
    case 'exhaust':
      return { color: scratch.copy(GAS.smoke).lerp(GAS.exhaust, (phase - 0.25) * 4), opacity: 0.38 - (phase - 0.25) * 0.8 };
    case 'intake':
      return { color: GAS.intake, opacity: 0.12 + (phase - 0.5) * 0.9 };
    case 'compression': {
      const t = (phase - 0.75) * 4;
      return { color: scratch.copy(GAS.intake).lerp(GAS.compression, t), opacity: 0.34 + t * 0.34 };
    }
  }
}

export class PistonEngineModel implements EngineModel {
  readonly group = new THREE.Group();
  private readonly mounted = new THREE.Group();
  private readonly engine: Engine;
  private readonly materials: EngineMaterials;
  private readonly crank: THREE.Mesh;
  private readonly cylinders: CylinderParts[] = [];
  private readonly cams: THREE.Mesh[] = [];
  private readonly spinners: Array<{ object: THREE.Object3D; ratio: number }> = [];
  private readonly valves: ValveDef[] = [];
  private valveMeshIn!: THREE.InstancedMesh;
  private valveMeshEx!: THREE.InstancedMesh;
  private springMesh!: THREE.InstancedMesh;
  private rockerMesh: THREE.InstancedMesh | null = null;
  private pushrodMesh: THREE.InstancedMesh | null = null;
  private lifterMesh: THREE.InstancedMesh | null = null;
  private readonly headers: HeaderPipe[] = [];
  private readonly flash: THREE.PointLight[] = [];
  private readonly shellMeshes: Array<{ mesh: THREE.Mesh; solid: THREE.Material; glass: THREE.Material }> = [];
  private readonly peripheral: THREE.Object3D[] = [];
  private readonly solidOnly: THREE.Object3D[] = [];
  private readonly explodables: Explodable[] = [];
  private readonly chainMaterials: THREE.Texture[] = [];
  private readonly vib: VibrationTable;
  private heat = 0;
  private roll = 0;
  private rollVel = 0;
  private readonly valveLift: number;

  private readonly deck: number;
  private readonly bore: number;

  constructor(engine: Engine) {
    this.engine = engine;
    this.vib = vibrationTable(engine);
    const spec = engine.spec;
    this.materials = createMaterials(spec.coverColor, spec.blockMaterial);
    this.bore = spec.bore * MM;
    this.deck = engine.deck * MM;
    this.valveLift = this.bore * 0.115;
    this.group.add(this.mounted);

    this.crank = this.buildCrank();
    this.buildCylinders();
    const heads = this.buildHeads();
    this.buildBlock();
    this.buildValvetrain(heads);
    this.buildEnds();
    this.buildManifolds(heads);
    this.buildTurbos();
    this.buildSolidDetails(heads);

    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight('#ff8a3a', 0, this.bore * 9, 2);
      this.flash.push(light);
      this.mounted.add(light);
    }

    // Sit the whole thing on the floor at the origin.
    const box = new THREE.Box3().setFromObject(this.mounted);
    const centre = box.getCenter(new THREE.Vector3());
    this.mounted.position.set(-centre.x, -box.min.y, -centre.z);
    this.setView('xray');
  }

  private buildCrank(): THREE.Mesh {
    const e = this.engine;
    const b = this.bore;
    const r = e.r * MM;
    const pinR = b * 0.22;
    const mainR = b * 0.27;
    const webWidth = e.rodWidth * MM * 0.58;
    const throws = e.throws.map((t) => ({ angle: t.angle, z: t.z * MM, length: t.length * MM }));
    const geo = crankGeometry(throws, r, pinR, mainR, r + b * 0.3, webWidth, e.zMin * MM - b * 0.3, e.zMax * MM + b * 0.3);
    const mesh = tag(new THREE.Mesh(geo, this.materials.crank), 'crank');
    mesh.castShadow = true;
    this.mounted.add(mesh);
    return mesh;
  }

  private buildCylinders(): void {
    const e = this.engine;
    const m = this.materials;
    const b = this.bore;
    const l = e.l * MM;
    const r = e.r * MM;
    const crown = e.spec.stroke * 0.42 * MM;
    const skirt = b * 0.34;
    const { body, rings } = pistonGeometry(b, crown, skirt);
    const wristR = b * 0.115;
    const rodGeo = rodGeometry(l, Math.max(b * 0.31, r * 0.58), b * 0.17, b * 0.22 + 0.005, wristR, e.rodWidth * MM * 0.82);
    const wrist = zCylinder(wristR, b * 0.78, 18);
    const linerGeo = new THREE.CylinderGeometry(b / 2 + 0.008, b / 2 + 0.008, r * 2 + crown + skirt + b * 0.1, 40, 1, true);
    const gasGeo = new THREE.CylinderGeometry(b / 2 - 0.006, b / 2 - 0.006, 1, 32);
    gasGeo.translate(0, 0.5, 0);
    const sparkTex = glowTexture();

    for (const def of e.cylinders) {
      const frame = new THREE.Group();
      frame.position.z = def.z * MM;
      frame.rotation.z = -def.alpha * DEG;
      this.mounted.add(frame);

      const piston = new THREE.Group();
      const pistonBody = tag(new THREE.Mesh(body, m.piston), 'piston');
      pistonBody.castShadow = true;
      const ringMesh = tag(new THREE.Mesh(rings, m.ring), 'piston');
      const pin = tag(new THREE.Mesh(wrist, m.pin), 'piston');
      piston.add(pistonBody, ringMesh, pin);
      frame.add(piston);

      const rod = tag(new THREE.Mesh(rodGeo, m.rod), 'rod');
      rod.castShadow = true;
      frame.add(rod);

      const liner = tag(new THREE.Mesh(linerGeo, m.linerGlass), 'liner');
      liner.position.y = this.deck - (r * 2 + crown + skirt + b * 0.1) / 2;
      liner.renderOrder = 2;
      frame.add(liner);

      const gasMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, color: '#ffffff' });
      const gas = tag(new THREE.Mesh(gasGeo, gasMaterial), 'gas');
      gas.renderOrder = 3;
      frame.add(gas);

      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      spark.position.y = this.deck - b * 0.04;
      spark.scale.setScalar(b * 0.7);
      spark.renderOrder = 4;
      frame.add(spark);

      this.cylinders.push({ def, frame, piston, rod, gas, gasMaterial, spark, crownOffset: crown });
    }
  }

  /** Half-width of the head of a bank, including the spread of a VR zig-zag. */
  private bankHalfWidth(alpha: number, cylinders: number[]): number {
    const spread = cylinders
      .map((n) => this.engine.cylinders.find((c) => c.n === n)!)
      .reduce((max, c) => Math.max(max, Math.abs(Math.sin((c.alpha - alpha) * DEG)) * this.deck), 0);
    return this.bore * 0.6 + spread;
  }

  private buildBlock(): void {
    const e = this.engine;
    const m = this.materials;
    const b = this.bore;
    const banks = e.banks.map((bank) => ({ alpha: bank.alpha, halfWidth: this.bankHalfWidth(bank.alpha, bank.cylinders) }));
    const crankcaseR = e.r * MM + b * 0.55;
    const section = blockSection(banks, this.deck, crankcaseR);
    const length = (e.zMax - e.zMin) * MM + b * 0.2;
    const geo = extrude(section, length, { thickness: 0.018, segments: 1 });
    geo.translate(0, 0, ((e.zMax + e.zMin) / 2) * MM);
    const block = tag(new THREE.Mesh(geo, m.block), 'block');
    block.castShadow = true;
    block.receiveShadow = true;
    block.renderOrder = 5;
    this.mounted.add(block);
    this.shellMeshes.push({ mesh: block, solid: m.block, glass: m.blockGlass });
    this.explodables.push({ object: block, direction: new THREE.Vector3(0, 0.55, 0) });

    // Sump below the crankcase; boxer engines get a shallow one between the banks.
    const flat = e.banks.length === 2 && Math.abs(e.banks[0]!.alpha - e.banks[1]!.alpha) > 150;
    const depth = flat ? b * 0.42 : e.r * MM + b * 1.05;
    const halfW = flat ? crankcaseR * 0.6 : crankcaseR * 0.93;
    const top = flat ? -crankcaseR * 0.86 : -crankcaseR * 0.42;
    const sumpShape = roundedRect(-halfW, top - depth, halfW, top + b * 0.08, b * 0.12);
    const sumpGeo = extrude(sumpShape, length * 0.96, { thickness: 0.02, segments: 2 });
    sumpGeo.translate(0, 0, ((e.zMax + e.zMin) / 2) * MM);
    const finCount = Math.max(3, Math.round(length / (b * 0.32)));
    const fins: THREE.BufferGeometry[] = [sumpGeo];
    if (!flat) {
      for (let i = 0; i < finCount; i++) {
        const z = (e.zMax + e.zMin) * 0.5 * MM + (i - (finCount - 1) / 2) * ((length * 0.86) / finCount);
        const fin = new THREE.BoxGeometry(halfW * 2 + b * 0.05, depth * 0.5, b * 0.035);
        fin.translate(0, top - depth * 0.68, z);
        fins.push(fin);
      }
    }
    const sump = tag(new THREE.Mesh(merge(fins), m.sump), 'sump');
    sump.castShadow = true;
    sump.renderOrder = 5;
    this.mounted.add(sump);
    this.shellMeshes.push({ mesh: sump, solid: m.sump, glass: m.sumpGlass });
    this.explodables.push({ object: sump, direction: new THREE.Vector3(0, -1.5, 0) });
  }

  private headHeight(): number {
    return this.engine.spec.valvetrain === 'ohv' ? this.bore * 0.72 : this.bore * 0.92;
  }

  private buildHeads(): THREE.Group[] {
    const e = this.engine;
    const m = this.materials;
    const b = this.bore;
    const hh = this.headHeight();
    const groups: THREE.Group[] = [];
    for (const bank of e.banks) {
      const frame = new THREE.Group();
      frame.rotation.z = -bank.alpha * DEG;
      this.mounted.add(frame);
      groups.push(frame);

      const zs = bank.cylinders.map((n) => e.cylinders.find((c) => c.n === n)!.z * MM);
      const zMin = Math.min(...zs) - b * 0.6;
      const zMax = Math.max(...zs) + b * 0.6;
      const length = zMax - zMin;
      const zMid = (zMin + zMax) / 2;
      const halfW = this.bankHalfWidth(bank.alpha, bank.cylinders);

      const headShape = roundedRect(-halfW, this.deck, halfW, this.deck + hh, b * 0.05);
      const headGeo = extrude(headShape, length, { thickness: 0.012, segments: 1 });
      headGeo.translate(0, 0, zMid);
      const head = tag(new THREE.Mesh(headGeo, m.head), 'head');
      head.castShadow = true;
      head.renderOrder = 6;
      frame.add(head);
      this.shellMeshes.push({ mesh: head, solid: m.head, glass: m.blockGlass });

      const coverY = this.deck + hh;
      const dohc = e.spec.valvetrain === 'dohc';
      const coverH = b * (dohc ? 0.36 : 0.32);
      const coverW = halfW * (dohc ? 0.98 : 0.92);
      const coverShape = new THREE.Shape();
      const flatTop = coverW * 0.72;
      coverShape.moveTo(-coverW, coverY);
      coverShape.lineTo(coverW, coverY);
      coverShape.bezierCurveTo(coverW, coverY + coverH * 0.7, flatTop + (coverW - flatTop) * 0.5, coverY + coverH, flatTop, coverY + coverH);
      coverShape.lineTo(-flatTop, coverY + coverH);
      coverShape.bezierCurveTo(-flatTop - (coverW - flatTop) * 0.5, coverY + coverH, -coverW, coverY + coverH * 0.7, -coverW, coverY);
      const coverGeo = extrude(coverShape, length * 0.98, { thickness: 0.02, segments: 2 });
      coverGeo.translate(0, 0, zMid);
      const cover = tag(new THREE.Mesh(coverGeo, m.cover), 'cover');
      cover.castShadow = true;
      cover.renderOrder = 7;
      frame.add(cover);
      this.shellMeshes.push({ mesh: cover, solid: m.cover, glass: m.coverGlass });

      // Coil packs, only on the assembled look.
      if (e.spec.fuel !== 'diesel') {
        const coilGeo = merge(
          zs.map((z) => {
            const c = extrude(roundedRect(-b * 0.2, 0, b * 0.2, b * 0.07, b * 0.03), b * 0.18, { thickness: 0.008, segments: 1 });
            c.translate(0, coverY + coverH + 0.012, z);
            return c;
          }),
        );
        const coils = tag(new THREE.Mesh(coilGeo, m.plastic), 'coil');
        coils.castShadow = true;
        frame.add(coils);
        this.peripheral.push(coils);
      }

      const out = new THREE.Vector3(Math.sin(bank.alpha * DEG), Math.cos(bank.alpha * DEG), 0);
      this.explodables.push({ object: frame, direction: out.multiplyScalar(2.6) });
    }
    return groups;
  }

  private exhaustSide(bankIndex: number): number {
    return this.engine.banks[bankIndex]!.alpha >= 0 ? 1 : -1;
  }

  private buildValvetrain(heads: THREE.Group[]): void {
    const e = this.engine;
    const spec = e.spec;
    const m = this.materials;
    const b = this.bore;
    const count = spec.valvesPerCyl;
    const dohc = spec.valvetrain === 'dohc';
    const ohv = spec.valvetrain === 'ohv';
    const valveR = b * (count === 2 ? 0.2 : 0.155);
    const stemLen = b * (dohc ? 0.72 : 0.62);
    const stemR = b * 0.024;
    const crossOffset = dohc ? b * 0.2 : 0;
    const tilt = dohc ? 15 * DEG : 0;
    const zOffsets = count === 2 ? [0] : [b * 0.2, -b * 0.2];
    const rowOffsets = (exhaust: boolean): number[] => {
      if (dohc) return zOffsets;
      if (count === 2) return [exhaust ? b * 0.2 : -b * 0.2];
      return exhaust ? [b * 0.31, b * 0.1] : [-b * 0.1, -b * 0.31];
    };

    const camBase = b * 0.115;
    const halfSpan = (EXHAUST_CLOSE - EXHAUST_OPEN) / 4;
    const lobeWidth = b * 0.11;
    const camsByKey = new Map<string, { group: THREE.Group; lobes: LobeDef[]; zs: number[]; x: number; y: number }>();

    const camFor = (bankIndex: number, side: number): { lobes: LobeDef[]; zs: number[]; x: number; y: number } => {
      const key = `${bankIndex}/${side}`;
      let cam = camsByKey.get(key);
      if (!cam) {
        cam = { group: heads[bankIndex]!, lobes: [], zs: [], x: 0, y: 0 };
        camsByKey.set(key, cam);
      }
      return cam;
    };

    // Lifter camshaft for pushrod engines: one in the block.
    const blockLobes: LobeDef[] = [];
    const blockCam = ohv ? this.blockCamPosition() : null;

    const pushrodValves: ValveDef[] = [];

    for (const cyl of e.cylinders) {
      const parent = this.cylinders.find((p) => p.def.n === cyl.n)!;
      const bankFrame = heads[cyl.bank]!;
      bankFrame.updateMatrix();
      parent.frame.updateMatrix();
      const bankAlpha = e.banks[cyl.bank]!.alpha;
      const exhaustSign = this.exhaustSide(cyl.bank);

      for (const exhaust of [false, true]) {
        const offsets = rowOffsets(exhaust);
        const sideSign = exhaust ? exhaustSign : -exhaustSign;
        for (const dz of offsets) {
          // Position inside the cylinder frame.
          const local = new THREE.Matrix4()
            .makeTranslation(sideSign * crossOffset, this.deck, dz)
            .multiply(new THREE.Matrix4().makeRotationZ(-sideSign * tilt));
          const base = new THREE.Matrix4().multiplyMatrices(parent.frame.matrix, local);
          const valve: ValveDef = { cyl, exhaust, base };
          this.valves.push(valve);

          const peak = exhaust ? EXHAUST_PEAK : INTAKE_PEAK;
          const thetaPeak = cyl.fire + peak;

          if (ohv) {
            const bankInv = new THREE.Matrix4().makeRotationZ(bankAlpha * DEG);
            const tipLocal = new THREE.Vector3(0, stemLen, 0).applyMatrix4(base);
            const tipBank = tipLocal.clone().applyMatrix4(bankInv);
            const side = this.ohvPushrodSide(cyl.bank);
            const pivotBank = new THREE.Vector3(tipBank.x + side * b * 0.17, tipBank.y + b * 0.1, tipBank.z);
            const rodEndBank = new THREE.Vector3(pivotBank.x + side * b * 0.17, pivotBank.y - b * 0.06, pivotBank.z);
            const toEngine = new THREE.Matrix4().makeRotationZ(-bankAlpha * DEG);
            const pivot = pivotBank.clone().applyMatrix4(toEngine);
            const rodEnd = rodEndBank.clone().applyMatrix4(toEngine);
            const camCenter = new THREE.Vector3(blockCam!.x, blockCam!.y, tipLocal.z);
            const camDir = rodEnd.clone().sub(camCenter).setZ(0).normalize();
            // Nose must aim at the lifter when this valve is at full lift. Nose at rest points to -Y.
            const aim = Math.atan2(camDir.x, -camDir.y);
            blockLobes.push({ z: tipLocal.z, rotation: (thetaPeak / 2) * DEG + aim });
            valve.ohv = { pivot, camDir, camCenter, rodEnd, valveTip: tipLocal, camBase };
            pushrodValves.push(valve);
          } else {
            const key = dohc ? sideSign : 0;
            const cam = camFor(cyl.bank, key);
            const tipBank = new THREE.Vector3(0, stemLen, 0)
              .applyMatrix4(base)
              .applyMatrix4(new THREE.Matrix4().makeRotationZ(bankAlpha * DEG));
            const dirBank = new THREE.Vector3(0, 1, 0)
              .applyMatrix4(new THREE.Matrix4().extractRotation(local))
              .applyMatrix4(new THREE.Matrix4().makeRotationZ(-(cyl.alpha - bankAlpha) * DEG));
            const camPos = tipBank.clone().addScaledVector(dirBank, camBase);
            cam.x = dohc ? (cam.x === 0 ? camPos.x : (cam.x + camPos.x) / 2) : 0;
            cam.y = camPos.y;
            cam.zs.push(tipBank.z);
            const aim = -Math.atan2(dirBank.x, dirBank.y);
            cam.lobes.push({ z: tipBank.z, rotation: (thetaPeak / 2) * DEG + aim });
          }
        }
      }
    }

    // Shared instanced meshes for valves and springs.
    const valveGeoIn = valveGeometry(valveR * 1.06, stemR, stemLen);
    const valveGeoEx = valveGeometry(valveR * 0.92, stemR, stemLen);
    const inCount = this.valves.filter((v) => !v.exhaust).length;
    const exCount = this.valves.length - inCount;
    this.valveMeshIn = tag(new THREE.InstancedMesh(valveGeoIn, m.valveIntake, inCount), 'valveIn');
    this.valveMeshEx = tag(new THREE.InstancedMesh(valveGeoEx, m.valveExhaust, exCount), 'valveEx');
    const springGeo = springGeometry(b * 0.062, b * 0.0085);
    this.springMesh = tag(new THREE.InstancedMesh(springGeo, m.spring, this.valves.length), 'spring');
    for (const mesh of [this.valveMeshIn, this.valveMeshEx, this.springMesh]) {
      mesh.frustumCulled = false;
      this.mounted.add(mesh);
    }

    if (!ohv) {
      for (const [key, cam] of camsByKey) {
        const [bankIndex] = key.split('/');
        const zMin = Math.min(...cam.zs) - b * 0.5;
        const zMax = Math.max(...cam.zs) + b * 0.5;
        const geo = camshaftGeometry(cam.lobes, camBase, this.valveLift, lobeWidth, b * 0.078, zMin, zMax, halfSpan);
        const mesh = tag(new THREE.Mesh(geo, m.cam), 'cam');
        mesh.position.set(cam.x, cam.y, 0);
        mesh.castShadow = true;
        heads[Number(bankIndex)]!.add(mesh);
        this.cams.push(mesh);
      }
    } else if (blockCam) {
      const zs = blockLobes.map((l) => l.z);
      const geo = camshaftGeometry(blockLobes, camBase, this.valveLift, lobeWidth, b * 0.078, Math.min(...zs) - b * 0.4, Math.max(...zs) + b * 0.4, halfSpan);
      const mesh = tag(new THREE.Mesh(geo, m.cam), 'cam');
      mesh.position.set(blockCam.x, blockCam.y, 0);
      this.mounted.add(mesh);
      this.cams.push(mesh);

      const rockerGeo = new THREE.BoxGeometry(1, b * 0.05, b * 0.07);
      this.rockerMesh = tag(new THREE.InstancedMesh(rockerGeo, m.rod, pushrodValves.length), 'pushrod');
      const pushGeo = new THREE.CylinderGeometry(b * 0.018, b * 0.018, 1, 8);
      pushGeo.translate(0, 0.5, 0);
      this.pushrodMesh = tag(new THREE.InstancedMesh(pushGeo, m.pin, pushrodValves.length), 'pushrod');
      const lifterGeo = new THREE.CylinderGeometry(b * 0.05, b * 0.05, b * 0.16, 12);
      lifterGeo.translate(0, b * 0.08, 0);
      this.lifterMesh = tag(new THREE.InstancedMesh(lifterGeo, m.pin, pushrodValves.length), 'pushrod');
      for (const mesh of [this.rockerMesh, this.pushrodMesh, this.lifterMesh]) {
        mesh.frustumCulled = false;
        this.mounted.add(mesh);
      }
    }
  }

  private blockCamPosition(): { x: number; y: number } {
    const e = this.engine;
    const b = this.bore;
    if (e.banks.length === 2) {
      const flat = Math.abs(e.banks[0]!.alpha - e.banks[1]!.alpha) > 150;
      // Above the crank in the valley; on a flat twin, below it where the real cam sits.
      return flat ? { x: 0, y: e.r * MM + b * 0.55 } : { x: 0, y: e.r * MM + b * 0.85 };
    }
    return { x: -b * 0.78, y: e.r * MM + b * 0.42 };
  }

  private ohvPushrodSide(bankIndex: number): number {
    const e = this.engine;
    if (e.banks.length === 1) return -1;
    // Toward the cam, which is in the valley.
    return e.banks[bankIndex]!.alpha > 0 ? -1 : 1;
  }

  private buildEnds(): void {
    const e = this.engine;
    const m = this.materials;
    const b = this.bore;
    const r = e.r * MM;
    const front = e.zMax * MM + b * 0.2;
    const rear = e.zMin * MM - b * 0.2;

    // Flywheel at the rear.
    const flyR = Math.max(b * 1.28, r + b * 1.05);
    const flywheel = tag(new THREE.Mesh(flywheelGeometry(flyR, b * 0.26), m.flywheel), 'flywheel');
    flywheel.position.z = rear - b * 0.22;
    flywheel.castShadow = true;
    this.mounted.add(flywheel);
    this.spinners.push({ object: flywheel, ratio: 1 });
    this.explodables.push({ object: flywheel, direction: new THREE.Vector3(0, 0, -1.4) });

    // Timing drive at the front.
    const sprocketGeo = (radius: number, teeth: number): THREE.BufferGeometry => extrude(gearShape(radius, radius * 0.9, teeth, 0), b * 0.06, undefined, 8);
    const crankSprocket = tag(new THREE.Mesh(sprocketGeo(b * 0.26, 20), m.sprocket), 'chain');
    crankSprocket.position.z = front + b * 0.03;
    this.mounted.add(crankSprocket);
    this.spinners.push({ object: crankSprocket, ratio: 1 });
    const chainPulleys: Array<{ x: number; y: number; r: number }> = [{ x: 0, y: 0, r: b * 0.27 }];

    for (const cam of this.cams) {
      const camSprocket = tag(new THREE.Mesh(sprocketGeo(b * 0.26, 20), m.sprocket), 'chain');
      const parent = cam.parent!;
      camSprocket.position.set(cam.position.x, cam.position.y, front + b * 0.03);
      parent.add(camSprocket);
      this.spinners.push({ object: camSprocket, ratio: 0.5 });
      const world = new THREE.Vector3(cam.position.x, cam.position.y, 0);
      parent.updateMatrix();
      world.applyMatrix4(parent.matrix);
      chainPulleys.push({ x: world.x, y: world.y, r: b * 0.27 });
    }

    // Cover over the chain: hull of the sprockets with some room around them.
    const coverOutline = hullShape(chainPulleys.map((p) => ({ x: p.x, y: p.y, r: p.r + b * 0.13 })));
    const timingGeo = extrude(coverOutline, b * 0.2, { thickness: 0.015, segments: 2 }, 12);
    timingGeo.translate(0, 0, front + b * 0.08);
    const timing = tag(new THREE.Mesh(timingGeo, m.head), 'chain');
    timing.castShadow = true;
    timing.renderOrder = 6;
    this.mounted.add(timing);
    this.shellMeshes.push({ mesh: timing, solid: m.head, glass: m.blockGlass });
    this.explodables.push({ object: timing, direction: new THREE.Vector3(0, 0, 1.6) });

    const chainCurve = beltCurve(chainPulleys, front + b * 0.03);
    const chainTexture = this.stripeTexture();
    const chainMat = m.chain.clone();
    chainMat.map = chainTexture;
    chainMat.needsUpdate = true;
    const chainGeo = new THREE.TubeGeometry(chainCurve, 240, b * 0.017, 6, true);
    const chain = tag(new THREE.Mesh(chainGeo, chainMat), 'chain');
    this.mounted.add(chain);
    this.chainMaterials.push(chainTexture);

    // Crank pulley and accessories, outside the timing cover.
    const pulleyR = b * 0.62;
    const pulleyZ = front + b * 0.34;
    const pulley = tag(new THREE.Mesh(pulleyGeometry(pulleyR, b * 0.32), m.sprocket), 'pulley');
    pulley.position.z = pulleyZ;
    pulley.castShadow = true;
    this.mounted.add(pulley);
    this.spinners.push({ object: pulley, ratio: 1 });

    const altR = b * 0.46;
    const altPulleyR = b * 0.24;
    const flat = e.banks.length === 2 && Math.abs(e.banks[0]!.alpha - e.banks[1]!.alpha) > 150;
    const altX = flat ? b * 0.85 : r + b * 1.12;
    const altY = flat ? r + b * 1.0 : r + b * 0.45;
    const altBody = tag(new THREE.Mesh(zCylinder(altR, b * 0.74, 30), m.housing), 'alternator');
    altBody.position.set(altX, altY, pulleyZ - b * 0.5);
    altBody.castShadow = true;
    const altPulley = tag(new THREE.Mesh(pulleyGeometry(altPulleyR, b * 0.24), m.sprocket), 'alternator');
    altPulley.position.set(altX, altY, pulleyZ);
    this.spinners.push({ object: altPulley, ratio: pulleyR / altPulleyR });
    const beltGeo = new THREE.TubeGeometry(
      beltCurve(
        [
          { x: 0, y: 0, r: pulleyR + 0.012 },
          { x: altX, y: altY, r: altPulleyR + 0.012 },
        ],
        pulleyZ,
      ),
      120,
      b * 0.028,
      6,
      true,
    );
    const belt = tag(new THREE.Mesh(beltGeo, m.rubber), 'belt');
    this.mounted.add(altBody, altPulley, belt);
    this.peripheral.push(altBody, altPulley, belt, pulley);
  }

  private stripeTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 4;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#9da1a6';
    ctx.fillRect(0, 0, 64, 4);
    ctx.fillStyle = '#30343a';
    ctx.fillRect(0, 0, 18, 4);
    ctx.fillRect(32, 0, 18, 4);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(48, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildManifolds(heads: THREE.Group[]): void {
    const e = this.engine;
    const m = this.materials;
    const b = this.bore;
    const hh = this.headHeight();
    const spec = e.spec;
    const flat = e.banks.length === 2 && Math.abs(e.banks[0]!.alpha - e.banks[1]!.alpha) > 150;
    const vee = e.banks.length === 2 && !flat;

    // Intake: plenum above the valley on a V, on the far side on an inline, on top on a flat.
    const allZ = e.cylinders.map((c) => c.z * MM);
    const zMin = Math.min(...allZ) - b * 0.4;
    const zMax = Math.max(...allZ) + b * 0.4;
    const plenumR = b * (spec.cylinders > 8 ? 0.42 : 0.36);
    const engineTop = this.deck + hh;
    let plenumPos: THREE.Vector3;
    if (vee) {
      const spread = Math.abs(e.banks[0]!.alpha - e.banks[1]!.alpha) / 2;
      plenumPos = new THREE.Vector3(0, Math.cos(spread * DEG) * engineTop + b * 0.15, 0);
    } else if (flat) {
      plenumPos = new THREE.Vector3(0, b * 1.2 + e.r * MM, 0);
    } else {
      plenumPos = new THREE.Vector3(-this.bore * 1.5, this.deck + b * 0.25, 0);
    }
    const plenumGeo = zCylinder(plenumR, zMax - zMin, 24, plenumPos.x, plenumPos.y, (zMin + zMax) / 2);
    const plenumCaps = [new THREE.SphereGeometry(plenumR, 20, 12), new THREE.SphereGeometry(plenumR, 20, 12)];
    plenumCaps.forEach((cap) => cap.scale(1, 1, 0.42));
    plenumCaps[0]!.translate(plenumPos.x, plenumPos.y, zMin);
    plenumCaps[1]!.translate(plenumPos.x, plenumPos.y, zMax);
    const runnerParts: THREE.BufferGeometry[] = [plenumGeo, ...plenumCaps];
    const runnerR = b * 0.12;
    for (const cyl of e.cylinders) {
      const sign = -this.exhaustSide(cyl.bank);
      const bankFrame = heads[cyl.bank]!;
      const halfW = this.bankHalfWidth(e.banks[cyl.bank]!.alpha, e.banks[cyl.bank]!.cylinders);
      const port = new THREE.Vector3(sign * halfW, this.deck + hh * 0.5, cyl.z * MM).applyMatrix4(bankFrame.matrix);
      const start = new THREE.Vector3(plenumPos.x, plenumPos.y, cyl.z * MM);
      const outward = new THREE.Vector3(sign * b * 0.6, b * 0.1, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(-e.banks[cyl.bank]!.alpha * DEG));
      const pts = [port, port.clone().add(outward.clone().multiplyScalar(0.5)), port.clone().add(outward).lerp(start, 0.25), start];
      runnerParts.push(tubeAlong(pts, runnerR, 18, 10));
    }
    const intake = tag(new THREE.Mesh(merge(runnerParts), m.intake), 'intake');
    intake.castShadow = true;
    this.mounted.add(intake);
    this.peripheral.push(intake);
    this.explodables.push({ object: intake, direction: new THREE.Vector3(vee || flat ? 0 : -1, vee || flat ? 3 : 1, 0).multiplyScalar(1.1) });

    // Exhaust: one primary per cylinder into a collector per group.
    const pipeR = b * 0.1;
    const maxY = -e.r * MM - b * 0.2;
    spec.exhaust.groups.forEach((group) => {
      const cyls = group.map((n) => e.cylinders.find((c) => c.n === n)!);
      const bankIdx = cyls[0]!.bank;
      const sign = this.exhaustSide(bankIdx);
      const bankFrame = heads[bankIdx]!;
      const halfW = this.bankHalfWidth(e.banks[bankIdx]!.alpha, e.banks[bankIdx]!.cylinders);
      const al = e.banks[bankIdx]!.alpha * DEG;
      const outDir = new THREE.Vector3(sign * Math.cos(al), sign * -Math.sin(al), 0);
      const outerX = sign * Math.max(Math.abs(Math.sin(al)) * (this.deck + hh * 0.5), b * 0.6);
      const zEnd = Math.min(...cyls.map((c) => c.z * MM)) - b * 0.65;
      const collectorY = flat ? maxY - b * 0.15 : Math.min(this.deck * 0.2, b * 0.1) + maxY * 0.15;
      const collector = new THREE.Vector3(outerX + outDir.x * b * 0.85, collectorY, zEnd);
      for (const cyl of cyls) {
        const port = new THREE.Vector3(sign * halfW, this.deck + hh * 0.36, cyl.z * MM).applyMatrix4(bankFrame.matrix);
        const p1 = port.clone().addScaledVector(outDir, b * 0.42);
        const p2 = p1.clone().lerp(collector, 0.5);
        p2.y -= b * 0.06;
        p2.x += sign * b * 0.08;
        const pts = [port, p1, p2, collector];
        const { material, uniforms } = hotPipeMaterial();
        const pipe = tag(new THREE.Mesh(tubeAlong(pts, pipeR, 36, 10), material), 'header');
        pipe.castShadow = true;
        this.mounted.add(pipe);
        this.peripheral.push(pipe);
        this.headers.push({ cyl, uniforms });
      }
      // Collector down-pipe heading to the rear of the car.
      const outPoints = [collector, collector.clone().add(new THREE.Vector3(0, -b * 0.15, -b * 0.55)), collector.clone().add(new THREE.Vector3(0, -b * 0.35, -b * 1.5))];
      const { material: downMaterial, uniforms: downUniforms } = hotPipeMaterial();
      const down = tag(new THREE.Mesh(tubeAlong(outPoints, pipeR * 1.5, 16, 10), downMaterial), 'header');
      down.castShadow = true;
      this.mounted.add(down);
      this.peripheral.push(down);
      this.headers.push({ cyl: cyls[0]!, uniforms: downUniforms });
    });
  }

  private buildTurbos(): void {
    const spec = this.engine.spec;
    const turbos = { na: 0, turbo: 1, 'twin-turbo': 2, 'quad-turbo': 4 }[spec.aspiration];
    if (turbos === 0) return;
    const e = this.engine;
    const b = this.bore;
    const m = this.materials;
    const groupCount = spec.exhaust.groups.length;
    const flat = e.banks.length === 2 && Math.abs(e.banks[0]!.alpha - e.banks[1]!.alpha) > 150;

    const snail = new THREE.TorusGeometry(b * 0.36, b * 0.16, 12, 36);
    const hub = zCylinder(b * 0.27, b * 0.26, 28);
    const coreGeo = zCylinder(b * 0.14, b * 0.44, 18);
    const bladeGeo = new THREE.BufferGeometry();
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const blade = new THREE.BoxGeometry(b * 0.26, b * 0.012, b * 0.12);
      blade.translate(b * 0.14, 0, 0);
      blade.rotateZ((i / 9) * Math.PI * 2);
      blades.push(blade);
    }
    bladeGeo.copy(merge(blades));

    for (let i = 0; i < turbos; i++) {
      const groupIndex = i % groupCount;
      const group = spec.exhaust.groups[groupIndex]!;
      const cyls = group.map((n) => e.cylinders.find((c) => c.n === n)!);
      const bank = cyls[0]!.bank;
      const sign = this.exhaustSide(bank);
      const al = e.banks[bank]!.alpha * DEG;
      const outer = Math.max(Math.abs(Math.sin(al)) * (this.deck + b * 0.5), b * 0.6) + b * 0.75;
      const y = flat ? -b * 1.4 : -b * 0.2;
      const stack = Math.floor(i / groupCount);
      const unit = new THREE.Group();
      unit.position.set(sign * outer, y + stack * b * 0.9, Math.min(...cyls.map((c) => c.z * MM)) - b * 0.65 - b * 0.1);
      const hot = tag(new THREE.Mesh(snail, m.turboHot), 'turbo');
      const hotHub = tag(new THREE.Mesh(hub, m.turboHot), 'turbo');
      const wheelHot = tag(new THREE.Mesh(bladeGeo, m.sprocket), 'turbo');
      const core = tag(new THREE.Mesh(coreGeo, m.turboCold), 'turbo');
      core.position.z = b * 0.3;
      const cold = tag(new THREE.Mesh(snail, m.turboCold), 'turbo');
      cold.position.z = b * 0.56;
      const coldHub = tag(new THREE.Mesh(hub, m.turboCold), 'turbo');
      coldHub.position.z = b * 0.56;
      unit.add(hot, hotHub, wheelHot, core, cold, coldHub);
      hot.castShadow = cold.castShadow = true;
      this.mounted.add(unit);
      this.peripheral.push(unit);
      this.spinners.push({ object: wheelHot, ratio: 18 });
      this.explodables.push({ object: unit, direction: new THREE.Vector3(sign * 1.5, -0.5, 0) });
    }
  }

  /** Casting ribs, bolts and an oil filter. They make the assembled look read as a real engine. */
  private buildSolidDetails(heads: THREE.Group[]): void {
    const e = this.engine;
    const m = this.materials;
    const b = this.bore;
    const hh = this.headHeight();
    const deck = this.deck;
    const crankTop = e.r * MM + b * 0.3;

    e.banks.forEach((bank, bankIndex) => {
      const frame = heads[bankIndex]!;
      const halfW = this.bankHalfWidth(bank.alpha, bank.cylinders);
      const zs = bank.cylinders.map((n) => e.cylinders.find((c) => c.n === n)!.z * MM).sort((p, q) => q - p);
      const zHi = zs[0]! + b * 0.6;
      const zLo = zs[zs.length - 1]! - b * 0.6;

      const ribs: THREE.BufferGeometry[] = [];
      // Water-jacket bulges between the cylinders and a heavy rail along the deck.
      const spacing = Math.max(b * 0.55, (zHi - zLo) / (zs.length + 1));
      for (const side of [-1, 1]) {
        for (let z = zHi - spacing / 2; z > zLo; z -= spacing) {
          const rib = new THREE.BoxGeometry(b * 0.05, deck - crankTop, b * 0.05);
          rib.translate(side * (halfW + b * 0.012), (deck + crankTop) / 2, z);
          ribs.push(rib);
        }
        const rail = new THREE.BoxGeometry(b * 0.07, b * 0.09, zHi - zLo);
        rail.translate(side * (halfW + b * 0.02), deck - b * 0.04, (zHi + zLo) / 2);
        ribs.push(rail);
        const headRail = new THREE.BoxGeometry(b * 0.05, b * 0.06, zHi - zLo);
        headRail.translate(side * (halfW + b * 0.012), deck + hh - b * 0.05, (zHi + zLo) / 2);
        ribs.push(headRail);
      }
      const ribMesh = tag(new THREE.Mesh(merge(ribs), bank.alpha === 0 && e.spec.blockMaterial === 'iron' ? m.block : m.head), 'block');
      ribMesh.castShadow = true;
      frame.add(ribMesh);
      this.solidOnly.push(ribMesh);

      // Cover bolts along both edges.
      const bolts: THREE.BufferGeometry[] = [];
      const coverY = deck + hh;
      const dohc = e.spec.valvetrain === 'dohc';
      const coverW = halfW * (dohc ? 0.98 : 0.92);
      for (const side of [-1, 1]) {
        for (let z = zHi - b * 0.3; z > zLo + b * 0.2; z -= b * 0.72) {
          const bolt = new THREE.CylinderGeometry(b * 0.038, b * 0.038, b * 0.035, 6);
          bolt.translate(side * coverW * 0.93, coverY + b * 0.075, z);
          bolts.push(bolt);
        }
      }
      if (bolts.length) {
        const boltMesh = tag(new THREE.Mesh(merge(bolts), m.pin), 'cover');
        frame.add(boltMesh);
        this.solidOnly.push(boltMesh);
      }
    });

    // Oil filter on the side of the crankcase. Not on engines whose side is taken by a bank.
    const flat = e.banks.length === 2 && Math.abs(e.banks[0]!.alpha - e.banks[1]!.alpha) > 150;
    if (!flat) {
      const crankcaseR = e.r * MM + b * 0.55;
      const can = new THREE.Group();
      const body = tag(new THREE.Mesh(new THREE.CylinderGeometry(b * 0.3, b * 0.3, b * 0.68, 28), m.plastic), 'block');
      const band = tag(new THREE.Mesh(new THREE.CylinderGeometry(b * 0.305, b * 0.305, b * 0.2, 28), m.valveExhaust), 'block');
      can.add(body, band);
      can.rotation.z = Math.PI / 2 + 0.25;
      can.position.set(-crankcaseR - b * 0.36, -crankcaseR * 0.15, (e.zMax + e.zMin) * 0.5 * MM - b * 0.3);
      can.traverse((o) => (o.castShadow = true));
      this.mounted.add(can);
      this.solidOnly.push(can);
    }
  }

  setView(view: ViewMode): void {
    for (const { mesh, solid, glass } of this.shellMeshes) {
      mesh.visible = view !== 'mechanism';
      mesh.material = view === 'solid' ? solid : glass;
      mesh.castShadow = view === 'solid';
    }
    for (const p of this.peripheral) p.visible = view !== 'mechanism';
    for (const c of this.cylinders) {
      c.gas.visible = view !== 'solid';
      c.spark.visible = view !== 'solid';
    }
    for (const m of this.solidOnly) m.visible = view === 'solid';
    this.viewMode = view;
    for (const light of this.flash) light.intensity = 0;
  }

  private viewMode: ViewMode = 'xray';
  private explodeAmount = 0;

  setExplode(amount: number): void {
    this.explodeAmount = amount;
    for (const { object, direction } of this.explodables) {
      const base = object.userData.basePos ?? (object.userData.basePos = object.position.clone());
      object.position.copy(base).addScaledVector(direction, amount * this.bore);
    }
  }

  update(state: FrameState): void {
    const e = this.engine;
    const { theta, fuelCut, running } = state;
    const rPos = e.r * MM;

    this.crank.rotation.z = -theta * DEG;

    for (const c of this.cylinders) {
      const def = c.def;
      const d = pistonPin(e, def, theta) * MM;
      c.piston.position.y = d;
      const gamma = (theta + def.pin - def.alpha) * DEG;
      const bx = rPos * Math.sin(gamma);
      const by = rPos * Math.cos(gamma);
      c.rod.position.set(bx, by, 0);
      c.rod.rotation.z = Math.atan2(bx, d - by);

      const crownY = d + c.crownOffset;
      const gap = Math.max(0.004, this.deck - crownY);
      c.gas.position.y = crownY;
      c.gas.scale.y = gap;

      if (this.viewMode !== 'solid') {
        const phase = cyclePhase(e, def, theta);
        const firing = running && !fuelCut;
        const look = gasAppearance(phase, firing);
        c.gasMaterial.color.copy(look.color);
        c.gasMaterial.opacity = look.opacity;
        const sparkOn = firing && phase < 0.035;
        const sparkMat = c.spark.material as THREE.SpriteMaterial;
        sparkMat.opacity = sparkOn ? 1 - phase / 0.035 : 0;
      }
    }

    // Cams turn at half crank speed in the same direction.
    for (const cam of this.cams) cam.rotation.z = -theta * 0.5 * DEG;
    for (const s of this.spinners) {
      s.object.rotation.z = -theta * s.ratio * DEG;
    }
    const chainShift = (theta / 360) * 1.2;
    for (const tex of this.chainMaterials) tex.offset.x = -chainShift % 1;

    this.updateValves(theta);

    this.updateHeaders(state);
    this.updateFlash(state);
    this.updateMounts(state);
  }

  private updateValves(theta: number): void {
    const e = this.engine;
    const b = this.bore;
    const stemLen = b * (e.spec.valvetrain === 'dohc' ? 0.72 : 0.62);
    const m = new THREE.Matrix4();
    const lift = new THREE.Matrix4();
    const scale = new THREE.Matrix4();
    let inIndex = 0;
    let exIndex = 0;
    let springIndex = 0;
    let rockerIndex = 0;
    const seat = b * 0.2;
    const springHeight = stemLen - seat - b * 0.02;
    const axis = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const offset = new THREE.Matrix4();
    const exploded = this.explodeAmount;

    for (const v of this.valves) {
      const phi = mod(theta - v.cyl.fire, 720);
      const l = (v.exhaust ? exhaustLift(phi) : intakeLift(phi)) * this.valveLift;
      lift.makeTranslation(0, -l, 0);
      const bankAlpha = e.banks[v.cyl.bank]!.alpha * DEG;
      offset.makeTranslation(Math.sin(bankAlpha) * exploded * 2.6 * b, Math.cos(bankAlpha) * exploded * 2.6 * b, 0);
      m.multiplyMatrices(v.base, lift).premultiply(offset);
      if (v.exhaust) this.valveMeshEx.setMatrixAt(exIndex++, m);
      else this.valveMeshIn.setMatrixAt(inIndex++, m);

      // Spring stands on the head and is squeezed by the moving retainer.
      lift.makeTranslation(0, seat, 0);
      scale.makeScale(1, springHeight - l, 1);
      m.multiplyMatrices(v.base, lift).multiply(scale).premultiply(offset);
      this.springMesh.setMatrixAt(springIndex++, m);

      if (v.ohv && this.rockerMesh && this.pushrodMesh && this.lifterMesh) {
        const o = v.ohv;
        const lifterBase = o.camCenter.clone().addScaledVector(o.camDir, o.camBase + l);
        // Lifter
        quat.setFromUnitVectors(up, o.camDir);
        m.compose(lifterBase, quat, pos.set(1, 1, 1));
        this.lifterMesh.setMatrixAt(rockerIndex, m);
        // Pushrod runs from the lifter to the rocker's near end, which rises with lift.
        const lifterTop = lifterBase.clone().addScaledVector(o.camDir, b * 0.16);
        const rodEnd = o.rodEnd.clone().addScaledVector(o.camDir, l);
        rodEnd.x += Math.sin(bankAlpha) * exploded * 2.6 * b;
        rodEnd.y += Math.cos(bankAlpha) * exploded * 2.6 * b;
        axis.subVectors(rodEnd, lifterTop);
        const len = axis.length();
        quat.setFromUnitVectors(up, axis.normalize());
        m.compose(lifterTop, quat, pos.set(1, len, 1));
        this.pushrodMesh.setMatrixAt(rockerIndex, m);
        // Rocker arm from the pushrod end to the valve tip.
        const valveTip = o.valveTip.clone();
        valveTip.y -= l * Math.cos(bankAlpha);
        valveTip.x -= l * Math.sin(bankAlpha);
        valveTip.x += Math.sin(bankAlpha) * exploded * 2.6 * b;
        valveTip.y += Math.cos(bankAlpha) * exploded * 2.6 * b;
        const mid = rodEnd.clone().add(valveTip).multiplyScalar(0.5);
        axis.subVectors(rodEnd, valveTip);
        const rl = axis.length();
        axis.normalize();
        quat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
        m.compose(mid, quat, pos.set(rl, 1, 1));
        this.rockerMesh.setMatrixAt(rockerIndex, m);
        rockerIndex++;
      }
    }
    this.valveMeshIn.instanceMatrix.needsUpdate = true;
    this.valveMeshEx.instanceMatrix.needsUpdate = true;
    this.springMesh.instanceMatrix.needsUpdate = true;
    if (this.rockerMesh && this.pushrodMesh && this.lifterMesh) {
      this.rockerMesh.instanceMatrix.needsUpdate = true;
      this.pushrodMesh.instanceMatrix.needsUpdate = true;
      this.lifterMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateHeaders(state: FrameState): void {
    const e = this.engine;
    const nRpm = state.rpm / e.spec.redlineRpm;
    const targetHeat = state.running ? Math.pow(state.load * 0.6 + nRpm * 0.5, 1.4) : 0;
    this.heat += (targetHeat - this.heat) * Math.min(1, state.dt * (targetHeat > this.heat ? 0.35 : 0.14));
    const firing = state.running && !state.fuelCut;
    for (const h of this.headers) {
      h.uniforms.uHeat.value = this.heat;
      const phi = mod(state.theta - h.cyl.fire, 720);
      const x = (phi - EXHAUST_OPEN) / 150;
      if (firing && x >= 0 && x <= 1.2) {
        h.uniforms.uPulsePos.value = x;
        h.uniforms.uPulseAmp.value = (1 - x * 0.7) * (0.25 + state.load * 0.75);
      } else {
        h.uniforms.uPulseAmp.value = 0;
      }
    }
  }

  private updateFlash(state: FrameState): void {
    const e = this.engine;
    if (this.viewMode === 'solid' || !state.running || state.fuelCut) {
      for (const l of this.flash) l.intensity = 0;
      return;
    }
    // Two most recent fires light up the inside of the engine.
    const ranked = this.cylinders
      .map((c) => ({ c, phase: cyclePhase(e, c.def, state.theta) }))
      .sort((a, b) => a.phase - b.phase);
    this.flash.forEach((light, i) => {
      const item = ranked[i];
      if (!item) {
        light.intensity = 0;
        return;
      }
      const t = item.phase * 4;
      const glow = t < 0.6 ? Math.pow(1 - t / 0.6, 1.6) : 0;
      const c = item.c;
      const pos = new THREE.Vector3(0, this.deck - this.bore * 0.2, 0).applyMatrix4(c.frame.matrix);
      light.position.copy(pos);
      light.intensity = glow * (1.6 + state.load * 6);
    });
  }

  private updateMounts(state: FrameState): void {
    const e = this.engine;
    if (state.shake <= 0 || (!state.running && state.rpm < 10)) {
      this.group.position.x = 0;
      this.group.position.y = 0;
      this.group.rotation.set(0, 0, 0);
      return;
    }
    const i = Math.floor(mod(state.theta, 360));
    const vib = this.vib;
    const speed = Math.min(1, state.rpm / e.spec.idleRpm);
    const a = state.shake * 0.0075 * speed;
    const x = (vib.fx[i] ?? 0) * a;
    const y = (vib.fy[i] ?? 0) * a;
    const pitch = (vib.pitch[i] ?? 0) * a * 0.28;
    const yaw = (vib.yaw[i] ?? 0) * a * 0.28;

    // Torque reaction: the engine rolls on its mounts against the crank.
    const target = state.running && !state.fuelCut ? state.load * 0.028 : 0;
    const springK = 60;
    const damp = 7;
    const acc = (target - this.roll) * springK - this.rollVel * damp;
    this.rollVel += acc * state.dt;
    this.roll += this.rollVel * state.dt;

    this.group.position.x = x;
    this.group.position.y = y;
    this.group.rotation.x = pitch;
    this.group.rotation.y = yaw;
    this.group.rotation.z = this.roll * state.shake;
  }

  dispose(): void {
    disposeTree(this.group);
    for (const tex of this.chainMaterials) tex.dispose();
  }
}
