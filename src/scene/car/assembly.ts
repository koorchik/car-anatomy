// A whole car in 3D (stage C1a; the whole-car plan, how the car goes together in 3D): the engine of its record, the
// gearbox bolted to it, the chassis with its body shell, the exhaust line, the radiator, the intercooler and the fuel
// tank, each a model of its own section. CarAssembly holds no part of an engine, a gearbox or a suspension itself; it
// only places them and lets the stage treat the lot as one model (model-types.ts, several models at once).
//
// Frames. The assembly's group is the front-axle frame of car.ts drawn as scene = (y, z, x)·10 (car-frame.ts). The
// engine stands where mountMatrix (vehicle/mount.ts) puts it: its kinematics frame turned by the record's mount and
// moved to packaging.crankFront, a rotation and a shift only, so the engine is drawn exactly as large as on its page.
// The gearbox meets the engine's flywheel plane (attach.ts); the chassis, built in the CG frame, goes in by
// carFrameToCg (its group sits at the centre of mass on the road).
//
// Transparency. Glass shells of several models nest (the body round the engine's block round its cylinders), and
// three.js sorts transparent meshes whole, so every model draws in a renderOrder band of its own (CAR_BANDS): the
// engine 10–19, the gearbox 20–29, the chassis 30–39, the car's own bodies 40–49 and the body shell 90, last.
//
// Clicks. Each system's root carries userData.system (Stage.pick reads it), and in the overview every part answers
// with its system's card (SYSTEM_CARDS), so a click names the system.

import * as THREE from 'three';
import { carById } from '../../data/cars.ts';
import { CHASSIS_CARS } from '../../data/chassis.ts';
import { DRIVE_CARS } from '../../data/drive-cars.ts';
import { engineById } from '../../data/engines.ts';
import { gearboxById } from '../../data/gearboxes.ts';
import { gearboxSpec } from '../../drivetrain/catalogue.ts';
import { buildGearbox, type Gearbox } from '../../drivetrain/topology.ts';
import { buildEngine, type Engine } from '../../engine/kinematics.ts';
import { systemsOf } from '../../engine/systems-spec.ts';
import { carChassis, type CarChassis } from '../../suspension/car-chassis.ts';
import { sumpLayout } from '../../systems/sump.ts';
import { cgPoint, type CarRecord, type Vec3 } from '../../vehicle/car.ts';
import { transaxleStubs } from '../../vehicle/gearbox-place.ts';
import { mountMatrix } from '../../vehicle/mount.ts';
import { bayOverflow, crankFrontZMm, flywheelRadiusMm, type BayOverflow } from '../../vehicle/packaging.ts';
import type { GearboxFrame } from '../gearbox/gearbox-model.ts';
import { TransaxleModel } from '../gearbox/transaxle-model.ts';
import type { FrameState, SceneModel, ViewMode } from '../model-types.ts';
import { HIGHLIGHT } from '../palette.ts';
import type { PartInfo } from '../parts-info.ts';
import { PistonEngineModel } from '../piston-engine.ts';
import { ChassisModel, chassisFrame, type ChassisFrame } from '../suspension/chassis-model.ts';
import { airPlan } from '../systems/routes-air.ts';
import { coolantPlan } from '../systems/routes-coolant.ts';
import type { PistonAnchors } from '../systems/anchors.ts';
import type { LayerPlan } from '../systems/route.ts';
import { FuelTankModel, IntercoolerModel, RadiatorModel, type HoseEnd } from './ancillaries.ts';
import { attachGearbox } from './attach.ts';
import { CAR_TO_SCENE, fromScene, toScene } from './car-frame.ts';
import { EXHAUST, ExhaustModel, exhaustRoute } from './exhaust.ts';
import { HighlightOverlay } from './highlight-overlay.ts';
import { SYSTEM_CARDS, type CarSystem } from './parts.ts';

export type { CarSystem } from './parts.ts';

/**
 * The smaller system a part of a model belongs to, by its key (the whole-car plan's list of systems): the final drive
 * and the halfshaft stubs in the gearbox's case, the steering, wheels and brakes of the chassis, the driven axle's
 * halfshafts, and the engine's pan for the oil. A part not listed stays its model's.
 */
export function partSystem(key: string, root: CarSystem, drive: CarRecord['drive']): CarSystem {
  if (root === 'engine') return key === 'sump' ? 'oil' : root;
  if (root === 'gearbox') {
    if (key === 'gbx-final-drive' || key === 'gbx-diff-case') return 'final-drive';
    if (key === 'gbx-halfshaft' || key === 'gbx-cv-joint') return 'halfshafts';
    return root;
  }
  if (root !== 'front-suspension' && root !== 'rear-suspension') return root;
  const m = /^susp\.(front|rear)\.(.+)$/.exec(key);
  if (!m) return root;
  const part = m[2]!;
  if (part === 'rack' || part === 'tie-rod') return 'steering';
  if (part === 'wheel' || part === 'tyre' || part === 'hub') return 'wheels';
  if (part === 'brake-disc' || part === 'caliper') return 'brakes';
  const driven = drive === 'awd' || (drive === 'fwd') === (m[1] === 'front');
  if (driven && (part === 'halfshaft' || part === 'cv-inner' || part === 'cv-outer' || part === 'cv-boot')) return 'halfshafts';
  return root;
}

/** Systems whose models tint themselves (setHighlight): each is a whole model. The others are tinted part by part. */
const MODEL_TINTED: readonly CarSystem[] = ['engine', 'exhaust', 'cooling', 'air', 'fuel', 'body'];

/** The colour a system tinted part by part takes: its section's. */
const TINT: Partial<Record<CarSystem, string>> = {
  gearbox: HIGHLIGHT.gearbox,
  'final-drive': HIGHLIGHT.gearbox,
  halfshafts: HIGHLIGHT.gearbox,
  oil: HIGHLIGHT.engine,
};

/** How faint the rest of the car is while one system is in focus. */
export const GHOST_ALPHA = 0.15;

/** A mesh of a system and, for an instanced mesh, which of its instances. */
interface SystemPart {
  mesh: THREE.Mesh;
  instances?: number[];
}

/** renderOrder bands of the models in a car; the body shell lands on 90 (ChassisModel's BODY_BAND over the chassis's). */
export const CAR_BANDS = { engine: 10, gearbox: 20, chassis: 30, ancillary: 40 } as const;

export interface CarFrame {
  engine: FrameState;
  gearbox: GearboxFrame;
  chassis: ChassisFrame;
}

/** The car standing still with its engine off. */
export const carFrame = (): CarFrame => ({
  engine: { theta: 0, rpm: 0, load: 0, fuelCut: false, running: false, boost: 0, dt: 0, shake: 0, held: true },
  gearbox: { angles: [], sleeves: {}, meshPower: [] },
  chassis: chassisFrame(),
});

/** What a car is built from: its record and the data of each section, resolved. */
export interface CarInputs {
  car: CarRecord;
  engine: Engine;
  gearbox: Gearbox;
  chassis: CarChassis;
  /** The left inner joint of the driven axle's halfshafts (DriveCar.driveline.diffOutputs). */
  joint: Vec3;
}

/** Why a car cannot be assembled yet: a missing piece of data. Null when it can. */
export function missingForAssembly(car: CarRecord): string | null {
  if (!car.dimensions || !car.packaging) return 'dimensions and packaging';
  if (!car.gearbox || !gearboxById(car.gearbox)?.car) return 'a gearbox record';
  if (!CHASSIS_CARS[car.id]) return 'a chassis';
  const drive = DRIVE_CARS[car.id];
  if (!drive || !(drive.driveline.diffOutputs.front ?? drive.driveline.diffOutputs.rear)) return 'the inner joints of the halfshafts';
  const spec = engineById(car.engine);
  if (!spec) return 'its engine';
  if (spec.layout.kind === 'wankel') return 'a piston engine';
  const record = gearboxById(car.gearbox)!;
  if (!gearboxSpec(record).finalDrive) return 'a transaxle (a gearbox with its final drive)';
  return null;
}

/** Resolves a car's data from the catalogues. `engine` replaces its own, for the builder's swaps and the bay check. */
export function carInputs(carId: string, engine?: Engine): CarInputs {
  const car = carById(carId);
  if (!car) throw new Error(`No car ${carId}`);
  const missing = missingForAssembly(car);
  if (missing) throw new Error(`${car.id} cannot be assembled yet: it has no ${missing}`);
  const drive = DRIVE_CARS[car.id]!;
  return {
    car,
    engine: engine ?? buildEngine(engineById(car.engine)!),
    gearbox: buildGearbox(gearboxSpec(gearboxById(car.gearbox!)!)),
    chassis: carChassis(car, CHASSIS_CARS[car.id]!, drive.driveline.diffOutputs),
    joint: (drive.driveline.diffOutputs.front ?? drive.driveline.diffOutputs.rear)!,
  };
}

/** A placed part on a layer plan: the open end of a hose, in the engine's kinematics frame (scene units). */
interface PlanEnd {
  position: THREE.Vector3;
  axis: THREE.Vector3;
}

export class CarAssembly implements SceneModel<CarFrame> {
  readonly group = new THREE.Group();
  readonly car: CarRecord;
  readonly engine: Engine;
  readonly engineModel: PistonEngineModel;
  readonly gearboxModel: TransaxleModel;
  readonly chassisModel: ChassisModel;
  readonly exhaust: ExhaustModel;
  readonly radiator: RadiatorModel | null;
  readonly intercooler: IntercoolerModel | null;
  readonly fuelTank: FuelTankModel | null;
  /** The engine's kinematics frame (scene units) placed in the car: what mountMatrix gives, in the scene's axes. */
  readonly powertrain = new THREE.Group();
  /** Where the engine leaves the bay, if it does: the lid is cut open where this says. */
  readonly overflow: BayOverflow;
  /** Each system's root, under which its parts are. */
  readonly systems: Partial<Record<CarSystem, THREE.Object3D>> = {};
  /** In the overview every part answers with its system's card. */
  readonly parts: Record<string, PartInfo> = {};
  private readonly models: Array<{ system: CarSystem; model: SceneModel<unknown> }> = [];
  private highlighted: CarSystem | null = null;
  private overlay: HighlightOverlay | null = null;
  private focused: CarSystem | null = null;
  /** The system of every part key. */
  readonly partSystems = new Map<string, CarSystem>();
  /** Each system's meshes. */
  private readonly systemParts = new Map<CarSystem, SystemPart[]>();
  /** The models each system has parts in: these stay whole while it is in focus, the others fade. */
  private readonly systemModels = new Map<CarSystem, Set<SceneModel<unknown>>>();

  constructor(inputs: CarInputs) {
    const { car, engine, gearbox, chassis, joint } = inputs;
    this.car = car;
    this.engine = engine;
    const packaging = car.packaging!;

    // ---- Engine and gearbox, in the engine's kinematics frame ----
    this.engineModel = new PistonEngineModel(engine);
    const stubs = transaxleStubs(car, engine, gearbox.spec, joint);
    this.gearboxModel = new TransaxleModel(gearbox, { flywheelRadiusMm: flywheelRadiusMm(engine), stubs });
    const toMetres = new THREE.Matrix4().makeScale(0.1, 0.1, 0.1);
    const mount = new THREE.Matrix4().fromArray(mountMatrix(car.mount, packaging, crankFrontZMm(engine) / 1000));
    this.powertrain.matrixAutoUpdate = false;
    this.powertrain.matrix.copy(CAR_TO_SCENE).multiply(mount).multiply(toMetres);
    // The engine's group shakes on its own, so it sits in a frame that undoes its centring; the gearbox beside it.
    const inner = new THREE.Group();
    inner.position.copy(this.engineModel.mounted.position).negate();
    inner.add(this.engineModel.group, this.gearboxModel.group);
    this.gearboxModel.group.applyMatrix4(attachGearbox(this.engineModel, this.gearboxModel));
    this.powertrain.add(inner);
    this.group.add(this.powertrain);
    this.group.updateMatrixWorld(true);

    // ---- Chassis and body, with the lid open where the engine comes through ----
    this.overflow = bayOverflow(car, engine);
    const cut = this.overflow.throughLid;
    this.chassisModel = new ChassisModel(chassis, { lidCutouts: cut ? [cut] : [] });
    this.chassisModel.group.position.copy(toScene(cgPoint(car)).setY(0));
    this.group.add(this.chassisModel.group);

    // ---- The car's own bodies ----
    const ancillary = HIGHLIGHT.ancillary;
    const anchors = this.engineModel.anchors();
    const inCar = (local: THREE.Vector3): Vec3 => fromScene(this.engineModel.group.localToWorld(local.clone()));
    this.exhaust = new ExhaustModel(exhaustRoute(car, inCar(anchors.exhaust!), engine.spec.exhaust.pipeM), ancillary);
    this.group.add(this.exhaust.group);
    const ends = this.hoseEnds();
    this.radiator = packaging.radiator ? new RadiatorModel(packaging.radiator, ends.coolant, ancillary) : null;
    this.intercooler = packaging.intercooler ? new IntercoolerModel(packaging.intercooler, ends.air, ancillary, this.radiator?.boxes ?? []) : null;
    const tunnel = this.exhaust.route.tunnel;
    this.fuelTank = packaging.fuelTank ? new FuelTankModel(packaging.fuelTank, ancillary, { y: tunnel.y, halfWidth: EXHAUST.pipeR, top: tunnel.z + EXHAUST.pipeR }) : null;
    for (const m of [this.radiator, this.intercooler, this.fuelTank]) if (m) this.group.add(m.group);

    // ---- Systems, bands and cards ----
    const add = (system: CarSystem, model: SceneModel<unknown>, root: THREE.Object3D, band: number): void => {
      root.userData.system = system;
      this.systems[system] = root;
      this.models.push({ system, model });
      model.setRenderBand?.(band);
    };
    add('engine', this.engineModel, this.engineModel.group, CAR_BANDS.engine);
    add('gearbox', this.gearboxModel, this.gearboxModel.group, CAR_BANDS.gearbox);
    add('front-suspension', this.chassisModel.front, this.chassisModel.front.group, CAR_BANDS.chassis);
    add('rear-suspension', this.chassisModel.rear, this.chassisModel.rear.group, CAR_BANDS.chassis);
    if (this.chassisModel.shell) {
      // The chassis bands its shell over its own band, so the body lands on 90.
      this.chassisModel.shell.group.userData.system = 'body';
      // The body wraps every other system: a click through it finds what is inside first.
      this.chassisModel.shell.group.traverse((o) => (o.userData.pickLast = true));
      this.systems.body = this.chassisModel.shell.group;
      this.models.push({ system: 'body', model: this.chassisModel.shell as unknown as SceneModel<unknown> });
      this.chassisModel.setRenderBand(CAR_BANDS.chassis);
    }
    add('exhaust', this.exhaust, this.exhaust.group, CAR_BANDS.ancillary);
    if (this.radiator) add('cooling', this.radiator, this.radiator.group, CAR_BANDS.ancillary);
    if (this.intercooler) add('air', this.intercooler, this.intercooler.group, CAR_BANDS.ancillary);
    if (this.fuelTank) add('fuel', this.fuelTank, this.fuelTank.group, CAR_BANDS.ancillary);
    for (const { system, model } of this.models) this.classify(system, model, this.systems[system]!);
    for (const [key, system] of this.partSystems) this.parts[key] ??= SYSTEM_CARDS[system];
    this.setView('xray');
    this.update(carFrame());
  }

  /**
   * The open ends the coolant and air layers leave on the engine, in the front-axle frame: the radiator hoses (the
   * stubs point along the crank, to the engine's front) and the pipes to the intercooler (out to the turbo's side).
   */
  private hoseEnds(): { coolant: HoseEnd[]; air: HoseEnd[] } {
    const engine = this.engine;
    const anchors = this.engineModel.systemsAnchors() as PistonAnchors;
    const systems = systemsOf(engine.spec);
    const coolant = coolantPlan(engine, systems, anchors, sumpLayout(engine, systems));
    const air = airPlan(engine, systems, anchors);
    const rings = (plan: LayerPlan, part: string): PlanEnd[] =>
      plan.parts.filter((p) => p.part === part && p.shape === 'ring' && p.axis).map((p) => ({ position: p.position, axis: p.axis! }));
    const mounted = this.engineModel.mounted;
    const turn = new THREE.Matrix3().setFromMatrix4(mounted.matrixWorld);
    const toEnd = (end: PlanEnd, out: THREE.Vector3): HoseEnd => {
      const at = fromScene(mounted.localToWorld(end.position.clone()));
      const dir = out.clone().applyMatrix3(turn).normalize();
      return { at, out: [dir.z, dir.x, dir.y] };
    };
    return {
      coolant: rings(coolant, 'radiator-hose').map((e) => toEnd(e, e.axis)),
      air: rings(air, 'intercooler').map((e) => toEnd(e, e.axis.clone().multiplyScalar(Math.sign(e.position.x) || 1))),
    };
  }

  update(frame: CarFrame): void {
    this.engineModel.update(frame.engine);
    this.gearboxModel.update(frame.gearbox);
    this.chassisModel.update(frame.chassis);
  }

  setView(view: ViewMode): void {
    this.engineModel.setView(view);
    this.gearboxModel.setView(view);
    this.chassisModel.setView(view);
    for (const m of [this.exhaust, this.radiator, this.intercooler, this.fuelTank]) m?.setView(view);
    // Views swap materials, so a highlight and a focus are laid on again.
    this.highlightSystem(this.highlighted);
    this.focusSystem(this.focused);
  }

  setExplode(amount: number): void {
    this.engineModel.setExplode(amount);
    this.gearboxModel.setExplode(amount);
    this.chassisModel.setExplode(amount);
  }

  setFailure(part: string | null): void {
    for (const { model } of this.models) model.setFailure(part);
  }

  /** Sorts a model's meshes into the systems their part keys belong to. */
  private classify(root: CarSystem, model: SceneModel<unknown>, group: THREE.Object3D): void {
    const note = (system: CarSystem, part: SystemPart): void => {
      const list = this.systemParts.get(system) ?? [];
      list.push(part);
      this.systemParts.set(system, list);
      const models = this.systemModels.get(system) ?? new Set();
      models.add(model);
      this.systemModels.set(system, models);
    };
    const drive = this.car.drive;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const instances = o.userData.instanceParts as string[] | undefined;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh && instances) {
        const bySystem = new Map<CarSystem, number[]>();
        instances.forEach((key, i) => {
          const system = partSystem(key, root, drive);
          this.partSystems.set(key, system);
          bySystem.set(system, [...(bySystem.get(system) ?? []), i]);
        });
        for (const [system, list] of bySystem) note(system, { mesh, instances: list });
        return;
      }
      const keys = [...(o.userData.part ? [o.userData.part as string] : []), ...((o.userData.partOf as string[] | undefined) ?? [])];
      for (const key of keys) this.partSystems.set(key, partSystem(key, root, drive));
      // A mesh without a key, or a merged one, goes with its first part's system.
      note(keys.length ? partSystem(keys[0]!, root, drive) : root, (mesh as THREE.InstancedMesh).isInstancedMesh ? { mesh, instances: [...Array((mesh as THREE.InstancedMesh).count).keys()] } : { mesh });
    });
  }

  /** Whether this car has the system in its 3D. */
  has(system: CarSystem): boolean {
    return this.systemParts.has(system);
  }

  /** Tints one system, or none: a whole model through its own setHighlight, a part of one by an overlay. */
  highlightSystem(system: CarSystem | null): void {
    this.highlighted = system;
    for (const { model } of this.models) model.setHighlight?.(false);
    this.overlay?.dispose();
    this.overlay = null;
    if (!system) return;
    if (MODEL_TINTED.includes(system)) {
      for (const { system: s, model } of this.models) if (s === system) model.setHighlight?.(true);
      return;
    }
    const parts = this.systemParts.get(system);
    if (parts) this.overlay = new HighlightOverlay(parts, TINT[system] ?? HIGHLIGHT.suspension);
  }

  /** The system tinted now. */
  get highlight(): CarSystem | null {
    return this.highlighted;
  }

  /** Puts one system in focus: the models it has no part in fade to a ghost. Null brings the whole car back. */
  focusSystem(system: CarSystem | null): void {
    this.focused = system;
    const keep = system ? (this.systemModels.get(system) ?? new Set()) : null;
    for (const { model } of this.models) model.setGhost?.(keep && !keep.has(model) ? GHOST_ALPHA : 1);
  }

  /** The system in focus now. */
  get focus(): CarSystem | null {
    return this.focused;
  }

  /**
   * The bounds of a system's parts as the view shows them, in the world; all of its parts when the view hides every
   * one (the mechanism view hides the radiator's core).
   */
  systemBox(system: CarSystem): THREE.Box3 {
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const shown = (o: THREE.Object3D): boolean => {
      for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false;
      return true;
    };
    const parts = this.systemParts.get(system) ?? [];
    const one = new THREE.Box3();
    const matrix = new THREE.Matrix4();
    const add = (visibleOnly: boolean): void => {
      for (const { mesh, instances } of parts) {
        if (visibleOnly && !shown(mesh)) continue;
        const geometry = mesh.geometry;
        geometry.boundingBox ?? geometry.computeBoundingBox();
        if (instances) {
          const inst = mesh as THREE.InstancedMesh;
          for (const i of instances) {
            inst.getMatrixAt(i, matrix);
            box.union(one.copy(geometry.boundingBox!).applyMatrix4(matrix.premultiply(mesh.matrixWorld)));
          }
        } else {
          box.union(one.copy(geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
        }
      }
    };
    add(true);
    if (box.isEmpty()) add(false);
    return box;
  }

  /**
   * The cards the parts answer with. In the overview every part names its system (`cards`, over SYSTEM_CARDS); the
   * parts of the system in focus answer with their own cards from their section's model or registry.
   */
  setCards(cards: Partial<Record<CarSystem, PartInfo>>, focus: CarSystem | null): void {
    for (const [key, system] of this.partSystems) {
      if (system === focus) {
        const own = this.models.map(({ model }) => model.parts?.[key]).find((info) => info) ?? this.chassisModel.parts[key];
        if (own) this.parts[key] = own;
        else delete this.parts[key];
      } else {
        this.parts[key] = cards[system] ?? SYSTEM_CARDS[system];
      }
    }
  }

  setHighlight(on: boolean): void {
    for (const { model } of this.models) model.setHighlight?.(on);
  }

  setGhost(alpha: number): void {
    for (const { model } of this.models) model.setGhost?.(alpha);
  }

  setRenderBand(base: number): void {
    this.engineModel.setRenderBand(base + CAR_BANDS.engine);
    this.gearboxModel.setRenderBand(base + CAR_BANDS.gearbox);
    this.chassisModel.setRenderBand(base + CAR_BANDS.chassis);
    for (const m of [this.exhaust, this.radiator, this.intercooler, this.fuelTank]) m?.setRenderBand(base + CAR_BANDS.ancillary);
  }

  /**
   * Named points in the assembly's frame (front-axle frame in scene units): the engine's flywheel plane and the
   * gearbox's bellhousing, which meet; the record's crankFront as the engine draws it; the exhaust line's end; and every
   * chassis anchor ('front.left.wheelCentre', 'front.left.diffOutput', …).
   */
  anchors(): Record<string, THREE.Vector3> {
    this.group.updateMatrixWorld(true);
    const world = (o: THREE.Object3D, p: THREE.Vector3): THREE.Vector3 => this.group.worldToLocal(o.localToWorld(p.clone()));
    const engine = this.engineModel.anchors();
    const out: Record<string, THREE.Vector3> = {
      flywheel: world(this.engineModel.group, engine.flywheel!),
      crankFront: world(this.engineModel.group, engine.crankFront!),
      bellhousing: world(this.gearboxModel.group, this.gearboxModel.anchors().bellhousing!),
      exhaustEnd: world(this.exhaust.group, this.exhaust.route.curve.getPointAt(1)),
    };
    for (const [k, v] of Object.entries(this.chassisModel.anchors())) out[k] = world(this.chassisModel.group, v);
    return out;
  }

  dispose(): void {
    this.overlay?.dispose();
    this.engineModel.dispose();
    this.gearboxModel.dispose();
    this.chassisModel.dispose();
    for (const m of [this.exhaust, this.radiator, this.intercooler, this.fuelTank]) m?.dispose();
  }
}
