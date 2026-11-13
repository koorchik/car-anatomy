import * as THREE from 'three';
import { turboParts, turboSize } from './turbo.ts';
import {
  DEG,
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
import { GAS, disposeTree, markDamaged, tag, type EngineModel, type FrameState, type ViewMode } from './model-types.ts';
import type { PistonAnchors, SystemsLook, TurboAnchor } from './systems/anchors.ts';
import { panDims, panShape, type PanShape } from '../systems/sump.ts';
import { systemsOf } from '../engine/systems-spec.ts';

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

/** A heavier flywheel is drawn larger, within what fits under the engine. */
const clampScale = (ratio: number): number => Math.min(1.25, Math.max(0.72, Math.cbrt(ratio)));

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
  readonly mounted = new THREE.Group();
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
  private readonly collectors: Array<{ point: THREE.Vector3; sign: number; z: number; downFrom: Engine['cylinders'][number] }> = [];
  private plenumEnd = new THREE.Vector3();
  private readonly solidOnly: THREE.Object3D[] = [];
  private readonly explodables: Explodable[] = [];
  private readonly chainMaterials: THREE.Texture[] = [];
  private readonly vib: VibrationTable;
  private heat = 0;
  private roll = 0;
  private rollVel = 0;
  private readonly valveLift: number;
  private readonly shakeGain: number;

  private readonly deck: number;
  private readonly bore: number;
  /** Recorded while building, for the systems layers (systemsAnchors). */
  private readonly record = {
    heads: [] as THREE.Group[],
    linerBottom: 0,
    crankcaseR: 0,
    section: [] as THREE.Vector2[],
    cams: [] as Array<{ bank: number; x: number; y: number; zMin: number; zMax: number; side: number }>,
    blockCam: null as { x: number; y: number } | null,
    ends: { front: 0, rear: 0, pulleyZ: 0, pulleyR: 0, alternator: new THREE.Vector3() },
    plenum: { x: 0, y: 0, r: 0, zMin: 0, zMax: 0 },
    runners: [] as Array<{ n: number; points: THREE.Vector3[]; r: number }>,
    supercharger: null as PistonAnchors['supercharger'],
    turbos: [] as TurboAnchor[],
    filter: null as PistonAnchors['filter'],
    /** Intake manifold and charge pipes: glass while the air or fuel layer shows. */
    intake: [] as THREE.Mesh[],
  };
  private systemsLook: SystemsLook = { intakeGlass: false, ownSparks: true };

  constructor(engine: Engine) {
    this.engine = engine;
    this.vib = vibrationTable(engine);
    const spec = engine.spec;
    this.materials = createMaterials(spec.coverColor, spec.blockMaterial);
    this.bore = spec.bore * MM;
    this.deck = engine.deck * MM;
    this.valveLift = spec.valves ? spec.valves.lift * MM : this.bore * 0.115;
    this.shakeGain = spec.tuning?.vibrationGain ?? 1;
    this.group.add(this.mounted);

    this.crank = this.buildCrank();
    this.buildCylinders();
    const heads = this.buildHeads();
    this.record.heads = heads;
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
    const counterweight = e.spec.tuning?.counterweightMm ? e.spec.tuning.counterweightMm * MM : r + b * 0.3;
    const geo = crankGeometry(throws, r, pinR, mainR, counterweight, webWidth, e.zMin * MM - b * 0.3, e.zMax * MM + b * 0.3);
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
    this.record.linerBottom = this.deck - (r * 2 + crown + skirt + b * 0.1);

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
    this.record.crankcaseR = crankcaseR;
    this.record.section = section.getPoints();
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

    // Sump below the crankcase: a shallow tray with a deeper well that holds the oil, or a shallow dry-sump pan.
    // Its shape lives in panShape, which the oil layer and the oil-on-track physics read too.
    const pan = panShape(e, systemsOf(e.spec));
    this.pan = pan;
    const sump = tag(new THREE.Mesh(merge(panGeometries(pan, b)), m.sump), 'sump');
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

      // Coil packs, only on the assembled look, and only where each plug has its own coil.
      if (e.spec.fuel !== 'diesel' && (e.spec.systems?.ignition ?? 'coil-on-plug') === 'coil-on-plug') {
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

  /** Pipes from one collector can't cross the engine, so each bank gets its own set in the picture. */
  private visualExhaustGroups(): Cylinder[][] {
    const e = this.engine;
    return e.spec.exhaust.groups.flatMap((group) => {
      const cyls = group.map((n) => e.cylinders.find((c) => c.n === n)!);
      return e.banks.map((_, bank) => cyls.filter((c) => c.bank === bank)).filter((list) => list.length > 0);
    });
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
    const sizes = spec.valves;
    const intakeR = sizes ? (sizes.intake * MM) / 2 : b * (count === 2 ? 0.2 : 0.155) * 1.06;
    const exhaustR = sizes ? (sizes.exhaust * MM) / 2 : b * (count === 2 ? 0.2 : 0.155) * 0.92;
    const timing = e.timing;
    const stemLen = b * (dohc ? 0.72 : 0.62);
    const stemR = b * 0.024;
    const crossOffset = dohc ? b * 0.2 : 0;
    const tilt = dohc ? 15 * DEG : 0;
    const intakeCount = count === 2 ? 1 : count === 3 ? 2 : count === 4 ? 2 : 3;
    const exhaustCount = count - intakeCount;
    const spread = (n: number, width: number): number[] => (n === 1 ? [0] : n === 2 ? [width, -width] : [width * 1.35, 0, -width * 1.35]);
    const rowOffsets = (exhaust: boolean): number[] => {
      if (dohc) return spread(exhaust ? exhaustCount : intakeCount, b * 0.2);
      // One cam: all valves stand in a line along the engine.
      const n = exhaust ? exhaustCount : intakeCount;
      const centre = exhaust ? b * 0.2 : -b * 0.2;
      return n === 1 ? [centre] : spread(n, b * 0.1).map((z) => z + centre);
    };

    const camBase = b * 0.115;
    const halfSpanFor = (exhaust: boolean): number => (exhaust ? timing.exhaustClose - timing.exhaustOpen : timing.intakeClose - timing.intakeOpen) / 4;
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
    this.record.blockCam = blockCam;

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

          const peak = exhaust ? (timing.exhaustOpen + timing.exhaustClose) / 2 : (timing.intakeOpen + timing.intakeClose) / 2;
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
            blockLobes.push({ z: tipLocal.z, rotation: (thetaPeak / 2) * DEG + aim, halfSpan: halfSpanFor(exhaust) });
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
            cam.lobes.push({ z: tipBank.z, rotation: (thetaPeak / 2) * DEG + aim, halfSpan: halfSpanFor(exhaust) });
          }
        }
      }
    }

    // Shared instanced meshes for valves and springs.
    const valveGeoIn = valveGeometry(intakeR, stemR, stemLen);
    const valveGeoEx = valveGeometry(exhaustR, stemR, stemLen);
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
        const geo = camshaftGeometry(cam.lobes, camBase, this.valveLift, lobeWidth, b * 0.078, zMin, zMax);
        const mesh = tag(new THREE.Mesh(geo, m.cam), 'cam');
        mesh.position.set(cam.x, cam.y, 0);
        mesh.castShadow = true;
        heads[Number(bankIndex)]!.add(mesh);
        this.cams.push(mesh);
        this.record.cams.push({ bank: Number(bankIndex), x: cam.x, y: cam.y, zMin, zMax, side: Number(key.split('/')[1]) });
      }
    } else if (blockCam) {
      const zs = blockLobes.map((l) => l.z);
      const geo = camshaftGeometry(blockLobes, camBase, this.valveLift, lobeWidth, b * 0.078, Math.min(...zs) - b * 0.4, Math.max(...zs) + b * 0.4);
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
    const flyKg = e.spec.tuning?.flywheelKg;
    const flyR = Math.max(b * 1.28, r + b * 1.05) * (flyKg ? clampScale(flyKg / 10) : 1);
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
    this.record.ends = { front, rear, pulleyZ, pulleyR, alternator: new THREE.Vector3(altX, altY, pulleyZ - b * 0.5) };
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
    this.plenumEnd = new THREE.Vector3(plenumPos.x, plenumPos.y, zMin);
    this.record.plenum = { x: plenumPos.x, y: plenumPos.y, r: plenumR, zMin, zMax };
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
      this.record.runners.push({ n: cyl.n, points: pts, r: runnerR });
    }
    if (spec.aspiration === 'supercharged') {
      // A Roots blower on top of the plenum, belt-driven from the crank.
      const blowerW = b * 0.62;
      const body = extrude(roundedRect(-blowerW, 0, blowerW, b * 0.72, b * 0.2), (zMax - zMin) * 0.75, { thickness: 0.012, segments: 1 });
      body.translate(plenumPos.x, plenumPos.y + plenumR * 0.8, (zMin + zMax) / 2);
      runnerParts.push(body);
      this.record.supercharger = { x: plenumPos.x, y: plenumPos.y + plenumR * 0.8, halfW: blowerW, height: b * 0.72, zMin: (zMin + zMax) / 2 - (zMax - zMin) * 0.375, zMax: (zMin + zMax) / 2 + (zMax - zMin) * 0.375 };
      const pulley = zCylinder(b * 0.2, b * 0.14, 24, plenumPos.x, plenumPos.y + plenumR * 0.8 + b * 0.36, (zMin + zMax) / 2 + (zMax - zMin) * 0.375 + b * 0.09);
      runnerParts.push(pulley);
    }
    const intake = tag(new THREE.Mesh(merge(runnerParts), m.intake), 'intake');
    intake.castShadow = true;
    this.mounted.add(intake);
    this.record.intake.push(intake);
    this.peripheral.push(intake);
    this.explodables.push({ object: intake, direction: new THREE.Vector3(vee || flat ? 0 : -1, vee || flat ? 3 : 1, 0).multiplyScalar(1.1) });

    // Exhaust: one primary per cylinder into a collector per group.
    const pipeR = b * 0.1;
    const maxY = -e.r * MM - b * 0.2;
    this.visualExhaustGroups().forEach((cyls) => {
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
      this.collectors.push({ point: collector, sign, z: zEnd, downFrom: cyls[0]! });
      // A turbo takes the exhaust from here and has its own down-pipe.
      if (spec.aspiration.includes('turbo')) return;
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
    const turbos = { na: 0, turbo: 1, 'twin-turbo': 2, 'quad-turbo': 4, supercharged: 0 }[spec.aspiration];
    if (turbos === 0) return;
    const b = this.bore;
    const m = this.materials;
    const groupCount = this.collectors.length;
    const size = turboSize(spec.turboHp || 200);
    const parts = turboParts(size);

    for (let i = 0; i < turbos; i++) {
      const { point, sign, z, downFrom } = this.collectors[i % groupCount]!;
      const stack = Math.floor(i / groupCount);
      const unit = new THREE.Group();
      // The scroll's neck meets the collector; further turbos of the group stack below it, on the outside.
      unit.scale.set(-sign, 1, 1);
      unit.position.set(point.x + sign * parts.inlet.x + sign * stack * size * 0.95, point.y - parts.inlet.y - stack * size * 0.3, z);
      const hot = tag(new THREE.Mesh(parts.hot, m.turboHot), 'turbo');
      const cold = tag(new THREE.Mesh(parts.cold, m.turboCold), 'turbo');
      const fittings = tag(new THREE.Mesh(parts.fittings, m.sprocket), 'turbo');
      const rotor = tag(new THREE.Mesh(parts.rotor, m.turboWheel), 'turbo');
      hot.castShadow = cold.castShadow = true;
      unit.add(hot, cold, fittings, rotor);
      this.shellMeshes.push({ mesh: hot, solid: m.turboHot, glass: m.turboHotGlass }, { mesh: cold, solid: m.turboCold, glass: m.turboColdGlass });
      this.mounted.add(unit);
      this.peripheral.push(unit);
      // The mirrored side turns the other way, as it would seen from its own end.
      this.spinners.push({ object: rotor, ratio: 18 });
      this.explodables.push({ object: unit, direction: new THREE.Vector3(sign * 1.5, -0.5, 0) });
      unit.updateMatrix();
      const turbo: TurboAnchor = { unit, size, sign, stack, oilIn: parts.oilIn, oilOut: parts.oilOut, coolantIn: parts.coolantIn, coolantOut: parts.coolantOut, airIn: parts.airIn, charge: null };
      this.record.turbos.push(turbo);

      // Exhaust leaves along the shaft and turns towards the rear of the car.
      const out = parts.outlet.clone().applyMatrix4(unit.matrix);
      const downPoints = [out, out.clone().add(new THREE.Vector3(0, -b * 0.1, -b * 0.3)), out.clone().add(new THREE.Vector3(0, -b * 0.6, -b * 1.1))];
      const { material: downMaterial, uniforms: downUniforms } = hotPipeMaterial();
      const down = tag(new THREE.Mesh(tubeAlong(downPoints, size * 0.17, 16, 12), downMaterial), 'header');
      down.castShadow = true;
      this.mounted.add(down);
      this.peripheral.push(down);
      this.headers.push({ cyl: downFrom, uniforms: downUniforms });

      // Compressed air on its way round to the plenum. Turbos stacked in a group share their first one's pipe.
      if (stack > 0) continue;
      const air = parts.chargeOut.clone().applyMatrix4(unit.matrix);
      const end = this.plenumEnd;
      // It runs past the end of the engine, so it only has to clear the plenum.
      const clearance = Math.max(end.y, air.y) + b * 0.3;
      const chargePoints = [
        air,
        air.clone().add(new THREE.Vector3(0, b * 0.5, 0)),
        new THREE.Vector3(air.x * 0.75 + sign * b * 0.2, clearance, Math.min(air.z, end.z - b * 0.55)),
        new THREE.Vector3((air.x + end.x) * 0.5, clearance, end.z - b * 0.7),
        new THREE.Vector3(end.x, end.y + b * 0.1, end.z - b * 0.5),
        end,
      ];
      const charge = tag(new THREE.Mesh(tubeAlong(chargePoints, Math.min(size * 0.09, b * 0.11), 44, 12), m.intake), 'charge-pipe');
      charge.castShadow = true;
      this.mounted.add(charge);
      turbo.charge = chargePoints;
      this.record.intake.push(charge);
      this.peripheral.push(charge);
      this.explodables.push({ object: charge, direction: new THREE.Vector3(sign * 0.6, 1.2, -0.4) });
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
      this.record.filter = { position: can.position.clone(), rotationZ: can.rotation.z };
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
    this.setSystemsLook(this.systemsLook);
  }

  setSystemsLook(look: SystemsLook): void {
    this.systemsLook = look;
    const glass = look.intakeGlass && this.viewMode === 'xray';
    for (const mesh of this.record.intake) {
      mesh.material = glass ? this.materials.intakeGlass : this.materials.intake;
      mesh.castShadow = !glass;
    }
    // A diesel has no spark: its fire starts from the heat of compression.
    const sparks = this.viewMode !== 'solid' && look.ownSparks && this.engine.spec.fuel !== 'diesel';
    for (const c of this.cylinders) c.spark.visible = sparks;
  }

  systemsAnchors(): PistonAnchors {
    const e = this.engine;
    const b = this.bore;
    const r = this.record;
    const dohc = e.spec.valvetrain === 'dohc';
    const stemLength = b * (dohc ? 0.72 : 0.62);
    const counterweight = e.spec.tuning?.counterweightMm ? e.spec.tuning.counterweightMm * MM : e.r * MM + b * 0.3;
    return {
      kind: 'piston',
      crank: this.crank,
      bore: b,
      deck: this.deck,
      headHeight: this.headHeight(),
      crankcaseR: r.crankcaseR,
      crankR: e.r * MM,
      mainR: b * 0.27,
      pinR: b * 0.22,
      crankSweep: Math.max(counterweight, e.r * MM + b * 0.22),
      linerBottom: r.linerBottom,
      linerR: b / 2 + 0.008,
      section: r.section,
      front: r.ends.front,
      rear: r.ends.rear,
      banks: e.banks.map((bank, i) => {
        const zs = bank.cylinders.map((n) => e.cylinders.find((c) => c.n === n)!.z * MM);
        return { alpha: bank.alpha, halfWidth: this.bankHalfWidth(bank.alpha, bank.cylinders), zMin: Math.min(...zs) - b * 0.6, zMax: Math.max(...zs) + b * 0.6, exhaustSide: this.exhaustSide(i), frame: r.heads[i]! };
      }),
      cylinders: this.cylinders.map((c) => ({ n: c.def.n, bank: c.def.bank, alpha: c.def.alpha, z: c.def.z * MM, frame: c.frame })),
      cams: r.cams.map((c) => ({ bank: c.bank, x: c.x, y: c.y, zMin: c.zMin, zMax: c.zMax, exhaust: c.side === 0 ? null : c.side === this.exhaustSide(c.bank) })),
      camBase: b * 0.115,
      valveLift: this.valveLift,
      valves: this.valves.map((v) => ({ n: v.cyl.n, exhaust: v.exhaust, base: v.base })),
      stemLength,
      springR: b * 0.062,
      blockCam: r.blockCam,
      pushrods: this.valves.flatMap((v) => (v.ohv ? [{ n: v.cyl.n, bank: v.cyl.bank, exhaust: v.exhaust, lifter: v.ohv.camCenter.clone().addScaledVector(v.ohv.camDir, v.ohv.camBase), rodEnd: v.ohv.rodEnd, pivot: v.ohv.pivot }] : [])),
      plenum: r.plenum,
      runners: r.runners,
      collectors: this.collectors.map((c) => ({ point: c.point, sign: c.sign })),
      turbos: r.turbos,
      supercharger: r.supercharger,
      pulley: { z: r.ends.pulleyZ, r: r.ends.pulleyR },
      alternator: r.ends.alternator,
      filter: r.filter,
      pan: panDims(e),
    };
  }

  /** The pan as built, for the oil-on-track page. */
  pan: PanShape | null = null;

  private viewMode: ViewMode = 'xray';
  private explodeAmount = 0;

  private undoFailure: (() => void) | null = null;

  setFailure(part: string | null): void {
    this.undoFailure?.();
    this.undoFailure = null;
    if (!part) return;
    const m = this.materials;
    const target = { rod: m.rod, piston: m.piston, valve: m.valveExhaust, exhaust: m.valveExhaust, gasket: m.head, turbo: m.turboHot, mounts: m.sump }[part];
    if (target) this.undoFailure = markDamaged(target);
  }

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
      const l = (v.exhaust ? exhaustLift(phi, e.timing) : intakeLift(phi, e.timing)) * this.valveLift;
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
      const x = (phi - e.timing.exhaustOpen) / 150;
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
    const a = state.shake * 0.0075 * speed * this.shakeGain;
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

/** The pan's body: a tray over the whole flange and, on a wet pan, the well under it, with ribs on the well. */
function panGeometries(pan: PanShape, b: number): THREE.BufferGeometry[] {
  const L = pan.zMax - pan.zMin;
  const trayBottom = pan.yShelf - 0.02;
  const tray = extrude(roundedRect(-pan.halfW, trayBottom, pan.halfW, pan.top + pan.lip, pan.round), L, { thickness: 0.02, segments: 2 });
  tray.translate(0, 0, (pan.zMax + pan.zMin) / 2);
  const parts: THREE.BufferGeometry[] = [tray];
  const w = pan.well;
  const wellDepth = pan.yShelf - pan.yFloor;
  if (wellDepth > 0.02) {
    const wellGeo = extrude(roundedRect(w.x0, pan.yFloor, w.x1, pan.yShelf, pan.round), w.z1 - w.z0, { thickness: 0.02, segments: 2 });
    wellGeo.translate(0, 0, (w.z0 + w.z1) / 2);
    parts.push(wellGeo);
    const count = Math.max(2, Math.round((w.z1 - w.z0) / (b * 0.32)));
    for (let i = 0; i < count; i++) {
      const z = (w.z0 + w.z1) / 2 + (i - (count - 1) / 2) * (((w.z1 - w.z0) * 0.86) / count);
      const fin = new THREE.BoxGeometry(w.x1 - w.x0 + b * 0.05, wellDepth * 0.5, b * 0.035);
      fin.translate((w.x0 + w.x1) / 2, pan.yFloor + wellDepth * 0.42, z);
      parts.push(fin);
    }
  }
  return parts;
}
