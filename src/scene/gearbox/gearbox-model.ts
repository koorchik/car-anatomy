// Parametric 3D model of a gearbox with a countershaft (gearboxes plan, «3D» → gearbox-model.ts; stage K1b-3d).
//
// Everything is built from the derived Gearbox of topology.ts: shafts on their axes, every gear on its member at its
// z with the phase of topology.ts, a hub and a sleeve at each sleeve place of the spec, the reverse idler on its own
// axis, and a case sized from the gears it holds: the tip circles plus 6 mm, a bellhousing in front, ribs, an
// extension at the back with a shifter mount. Proportions the data does not give (shaft and synchroniser sizes, wall
// thickness, the bellhousing and extension) are layout estimates below, scaled on the centre distance.
//
// Frame (the gearbox's own, `mounted`): the input axis is Z at x = y = 0, z = 0 is the case's front face, and spec
// millimetres behind it map to −z·MM, so the engine sits at +Z as in kinematics.ts. The countershaft hangs below.
//
// Each member is one group turned by its own angle, and a gear sits in it at its phase, so a gear's angle is
// phase + member angle exactly as topology.ts states it; nothing is integrated here (research §2.3). The sleeves
// slide by their pose, and the warm glow of the power path is the share of the input power each mesh rolls.
//
// It implements the SceneModel<GearboxFrame> contract of the whole-car plan structurally: O2b adds the type to
// model-types.ts, and this class then declares `implements SceneModel<GearboxFrame>`.

import * as THREE from 'three';
import type { GearDef, SleevePlace } from '../../drivetrain/spec.ts';
import type { Gearbox } from '../../drivetrain/topology.ts';
import { extrude, hullShape, gearShape, merge, MM, roundedRect, zCylinder, type Pulley2D } from '../geometry.ts';
import { brassMaterial, castAluminiumMaterial, glassMaterial } from '../materials.ts';
import { tag, type ViewMode } from '../model-types.ts';
import { DAMAGE as DAMAGE_COLOR, HIGHLIGHT as HIGHLIGHT_COLORS, POWER } from '../palette.ts';
import { acquireGearGeometry, drawnGear, type MeshQuality } from './gear-mesh.ts';
import { releaseGeometry } from './geometry-cache.ts';

/** What the model draws in a frame; TablePose of src/drivetrain/table-drive.ts has this shape. */
export interface GearboxFrame {
  /** Angle of every member, rad, positive in the crank's direction, in `Gearbox.members` order. */
  angles: ArrayLike<number>;
  /** Sleeve positions by id: −1 engaged at the front, 0 neutral, 1 engaged at the back. */
  sleeves: Readonly<Record<string, number>>;
  /** Share of the input power through each mesh, 0–1, in `Gearbox.meshes` order. */
  meshPower: ArrayLike<number>;
}

export interface GearboxModelOptions {
  /** Points per tooth and layers: 'low' for phones and slow machines. */
  quality?: MeshQuality;
  /** Layout estimates the gearbox data does not hold, mm: the flywheel the bellhousing wraps, its depth, the extension. */
  flywheelRadiusMm?: number;
  bellhousingDepthMm?: number;
  extensionMm?: number;
}

/** Power path colour (palette.ts) and how bright a full share glows. */
const POWER_GLOW = new THREE.Color(POWER);
const GLOW_GAIN = 0.3;
/** Hover highlight of the whole box in the car overview. */
const HIGHLIGHT = new THREE.Color(HIGHLIGHT_COLORS.gearbox).multiplyScalar(0.22);
const DAMAGE = new THREE.Color(DAMAGE_COLOR);

// Layout estimates (not data), as fractions of the centre distance a unless marked mm.
const INPUT_SHAFT = 0.17;
const MAIN_SHAFT = 0.2;
const COUNTER_SHAFT = 0.19;
const IDLER_SHAFT = 0.12;
/** mm: how far the reverse idler's standing shaft reaches past its gear, and the least it keeps from another gear. */
const IDLER_STUB = 8;
const STUB_CLEAR = 1;
/** Needle bearing under a loose gear. */
const NEEDLE = 0.07;
/** Synchroniser hub (the sleeve's inner splines) and sleeve outer radius. */
const HUB = 0.42;
const SLEEVE = 0.56;
const GROOVE_DEPTH = 0.06;
const RAIL = 0.085;
/** Rails above the tips of the main shaft's gears. */
const RAIL_CLEAR = 0.13;
/** mm: tip circles to the case (gearboxes plan), case walls, the space layshaft.ts leaves before the first gear. */
const CASE_MARGIN = 6;
const WALL = 10;
const FRONT_SPACE = 12;
const DEFAULTS = { flywheelRadiusMm: 150, bellhousingDepthMm: 120, extensionMm: 190 };

const TAU = Math.PI * 2;
const wrap = (angle: number): number => angle - Math.floor(angle / TAU) * TAU;

interface MemberView {
  id: string;
  index: number;
  /** Axis position, mm, relative to the input axis. */
  x: number;
  y: number;
  /** Carries its own shaft (input, output, countershaft); otherwise it turns on one. */
  shaft: boolean;
  /** Moved when pulled apart. */
  frame: THREE.Group;
  /** Turned by the member's angle. */
  spin: THREE.Group;
}

interface GearView {
  id: string;
  def: GearDef;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** Indices of the meshes it is in, `Gearbox.meshes` order. */
  meshes: number[];
  glow: number;
  /** Tip radius and bore as drawn, mm. */
  tip: number;
  bore: number;
}

interface SleeveView {
  place: SleevePlace;
  /** Slide along z with the sleeve: the sleeve (turning with its hub) and its fork and rail (standing). */
  sliders: THREE.Object3D[];
  /** Scene units from neutral to engaged. */
  travel: number;
}

export class GearboxModel {
  readonly group = new THREE.Group();
  /** The gearbox frame (see the top of the file), lifted onto the floor and centred along its length. */
  readonly mounted = new THREE.Group();
  readonly box: Gearbox;
  private readonly quality: MeshQuality;
  private readonly members: MemberView[] = [];
  private readonly gears: GearView[] = [];
  private readonly sleeves: SleeveView[] = [];
  private readonly shells: Array<{ mesh: THREE.Mesh; solid: THREE.Material; glass: THREE.Material }> = [];
  private readonly peripheral: THREE.Object3D[] = [];
  private readonly solidOnly: THREE.Object3D[] = [];
  private readonly explodables: Array<{ object: THREE.Object3D; base: THREE.Vector3; direction: THREE.Vector3 }> = [];
  /** Every material the model owns, for highlight, ghost, failure and dispose. */
  private readonly materials = new Set<THREE.MeshStandardMaterial>();
  private readonly glow = new Map<THREE.MeshStandardMaterial, number>();
  private readonly damaged = new Set<THREE.MeshStandardMaterial>();
  private readonly points: Record<string, THREE.Vector3> = {};
  /** Gear geometry taken from the cache, once per acquire: dispose() gives back exactly these. */
  private readonly acquired: THREE.BufferGeometry[] = [];
  private disposed = false;
  private highlighted = false;
  private view: ViewMode = 'xray';

  /** Centre distance (countershaft to the input axis), mm. */
  private readonly a: number;
  /** Case interior length, mm, from the front face back. */
  private readonly length: number;
  private readonly steel: THREE.MeshStandardMaterial;

  constructor(box: Gearbox, options: GearboxModelOptions = {}) {
    this.box = box;
    this.quality = options.quality ?? 'high';
    const o = { ...DEFAULTS, ...options };
    const spec = box.spec;
    const axes = new Map(spec.axes.map((ax) => [ax.id, ax]));
    const inputAxis = axes.get(spec.members.find((m) => m.id === spec.input)!.axis)!;
    const at = (axisId: string) => {
      const ax = axes.get(axisId)!;
      return { x: ax.x - inputAxis.x, y: ax.y - inputAxis.y };
    };
    this.a = Math.max(...spec.axes.map((ax) => Math.hypot(ax.x - inputAxis.x, ax.y - inputAxis.y)));
    this.length =
      Math.max(...spec.gears.map((g) => g.z + g.faceWidth / 2), ...(spec.sleeves ?? []).map((s) => s.z + s.width / 2 + s.gap)) + FRONT_SPACE;
    this.group.add(this.mounted);
    this.steel = this.own(new THREE.MeshStandardMaterial({ color: '#a9adb1', metalness: 1, roughness: 0.32 }));

    // Members: one group each on its axis. A member alone on its axis with several gears is a shaft of its own.
    const perAxis = new Map<string, number>();
    for (const m of spec.members) perAxis.set(m.axis, (perAxis.get(m.axis) ?? 0) + 1);
    spec.members.forEach((m, index) => {
      const p = at(m.axis);
      const gearCount = spec.gears.filter((g) => g.member === m.id).length;
      const shaft = m.id === spec.input || m.id === spec.output || (perAxis.get(m.axis) === 1 && gearCount > 1);
      const frame = new THREE.Group();
      frame.position.set(p.x * MM, p.y * MM, 0);
      const spin = new THREE.Group();
      frame.add(spin);
      this.mounted.add(frame);
      this.members.push({ id: m.id, index, x: p.x, y: p.y, shaft, frame, spin });
    });

    try {
      this.buildGears();
      this.buildShafts(o);
      this.buildSynchros();
      this.buildCase(o);
    } catch (error) {
      // A box that cannot be drawn gives back what it took from the cache.
      this.dispose();
      throw error;
    }

    // Stand it on the floor, centred along its length, the input axis at x = 0.
    this.mounted.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.mounted);
    this.mounted.position.set(0, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    this.setView('xray');
  }

  // ---- Building ----

  private own<T extends THREE.MeshStandardMaterial>(material: T): T {
    this.materials.add(material);
    return material;
  }

  /** Glass that a ghost can fade: the engine's glass with its opacity applied on top. */
  private glass(color: THREE.ColorRepresentation, base: number, edge: number): THREE.MeshStandardMaterial {
    const m = glassMaterial(color, base, edge);
    const inner = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      inner.call(m, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= opacity;\n#include <opaque_fragment>');
    };
    const key = m.customProgramCacheKey();
    m.customProgramCacheKey = () => `${key}-fade`;
    return this.own(m);
  }

  private member(id: string): MemberView {
    return this.members.find((m) => m.id === id)!;
  }

  /** Radius of the shaft on a member's axis, mm: the member's own, or the one it turns on. */
  private shaftRadius(m: MemberView): number {
    const spec = this.box.spec;
    if (m.id === spec.input) return INPUT_SHAFT * this.a;
    const onMain = Math.hypot(m.x, m.y) < 1e-6;
    if (m.id === spec.output || (onMain && !m.shaft)) return MAIN_SHAFT * this.a;
    if (m.shaft) return COUNTER_SHAFT * this.a;
    // A lone gear on a standing shaft of its own (the reverse idler): thin enough to leave the gear a ring.
    const rf = Math.min(...this.box.spec.gears.filter((g) => g.member === m.id).map((g) => drawnGear({ ...g, boreRadius: 0 }).rf));
    return Math.min(IDLER_SHAFT * this.a, 0.5 * rf);
  }

  /** The hole of a gear that turns on a shaft rather than being cut on it, mm. */
  private looseBore(m: MemberView, rf: number): number {
    const shaft = this.shaftRadius(m);
    return Math.min(shaft + NEEDLE * this.a, shaft + 0.5 * (rf - shaft));
  }

  private partOfGear(m: MemberView): string {
    const spec = this.box.spec;
    if (m.id === spec.input) return 'gbx-input';
    if (m.id === spec.output) return 'gbx-mainshaft';
    if (m.shaft) return 'gbx-gear-fixed';
    return Math.hypot(m.x, m.y) < 1e-6 ? 'gbx-gear-loose' : 'gbx-reverse-idler';
  }

  private buildGears(): void {
    const box = this.box;
    for (const def of box.spec.gears) {
      const m = this.member(def.member);
      const meshes = box.meshes.flatMap((mesh, j) => (mesh.a === def.id || mesh.b === def.id ? [j] : []));
      const tipShortening = Math.max(0, ...meshes.map((j) => box.meshes[j]!.geometry.tipShortening));
      const drawn = drawnGear({ ...def, boreRadius: 0, tipShortening });
      const boreRadius = m.shaft ? 0 : this.looseBore(m, drawn.rf);
      const geometry = acquireGearGeometry({ ...def, boreRadius, tipShortening }, this.quality);
      this.acquired.push(geometry);
      const material = this.own(new THREE.MeshStandardMaterial({ color: '#b9bdc1', metalness: 1, roughness: 0.28 }));
      const mesh = tag(new THREE.Mesh(geometry, material), this.partOfGear(m));
      mesh.userData.gear = def.id;
      mesh.position.z = -def.z * MM;
      mesh.rotation.z = -(box.phases[def.id] ?? 0);
      mesh.castShadow = true;
      m.spin.add(mesh);
      this.gears.push({ id: def.id, def, mesh, material, meshes, glow: 0, tip: drawn.ra, bore: boreRadius });
    }
  }

  private buildShafts(o: typeof DEFAULTS): void {
    const spec = this.box.spec;
    const segments = this.quality === 'low' ? 20 : 32;
    const gearsOf = (id: string) => spec.gears.filter((g) => g.member === id);
    const back = (gears: GearDef[]) => Math.max(...gears.map((g) => g.z + g.faceWidth / 2));
    const gap = Math.max(4, ...(spec.sleeves ?? []).map((s) => s.gap));
    for (const m of this.members) {
      const r = this.shaftRadius(m);
      let from: number;
      let to: number;
      if (m.id === spec.input) {
        // From the clutch splines inside the bellhousing to just behind the input gear's dog ring.
        from = -WALL - o.bellhousingDepthMm * 0.85;
        to = back(gearsOf(m.id)) + gap * 0.5;
      } else if (m.id === spec.output) {
        // The front end runs in a pilot bearing inside the input gear; the back end carries the output flange.
        from = back(gearsOf(spec.input)) - 6;
        to = this.length + WALL + o.extensionMm + 4;
      } else if (m.shaft) {
        from = -WALL * 0.5;
        to = this.length + WALL * 0.5;
      } else if (Math.hypot(m.x, m.y) > 1e-6) {
        // A standing shaft for a lone gear, held by bosses of the case. Its ends stop short of a gear on another axis
        // whose tips sweep past it (a speed pair right behind reverse on the countershaft).
        const gears = gearsOf(m.id);
        const front = Math.min(...gears.map((g) => g.z - g.faceWidth / 2));
        const rear = back(gears);
        from = front - IDLER_STUB;
        to = rear + IDLER_STUB;
        for (const g of this.gears) {
          const other = this.member(g.def.member);
          if (other === m || Math.hypot(other.x - m.x, other.y - m.y) >= g.tip + r + STUB_CLEAR) continue;
          const gFront = g.def.z - g.def.faceWidth / 2;
          const gBack = g.def.z + g.def.faceWidth / 2;
          if (gBack <= front) from = Math.max(from, gBack + STUB_CLEAR);
          else if (gFront >= rear) to = Math.min(to, gFront - STUB_CLEAR);
        }
      } else {
        continue;
      }
      const geometry = zCylinder(r * MM, (to - from) * MM, segments, 0, 0, -((from + to) / 2) * MM);
      const shaft = new THREE.Mesh(geometry, this.steel);
      if (m.id === spec.input) {
        tag(shaft, 'gbx-input');
        // Clutch splines on the front end.
        const splineLength = o.bellhousingDepthMm * 0.35;
        const splines = extrude(gearShape(r * 1.08 * MM, r * 0.92 * MM, 18, 0), splineLength * MM, undefined, 8);
        splines.translate(0, 0, (WALL + o.bellhousingDepthMm * 0.85 - splineLength / 2) * MM);
        const splineMesh = tag(new THREE.Mesh(splines, this.steel), 'gbx-input');
        splineMesh.castShadow = true;
        m.spin.add(splineMesh);
        this.points.input = new THREE.Vector3(0, 0, -from * MM);
      } else if (m.id === spec.output) {
        tag(shaft, 'gbx-mainshaft');
      } else if (m.shaft) {
        tag(shaft, 'gbx-countershaft');
      } else {
        tag(shaft, 'gbx-reverse-idler');
      }
      shaft.castShadow = true;
      // A standing shaft does not turn with its gear.
      (m.shaft ? m.spin : m.frame).add(shaft);
    }
  }

  private buildSynchros(): void {
    const spec = this.box.spec;
    const places = spec.sleeves ?? [];
    if (!places.length) return;
    const a = this.a;
    const segments = this.quality === 'low' ? 28 : 48;
    const output = this.member(spec.output);
    const outputR = MAIN_SHAFT * a;
    const hubR = HUB * a;
    const sleeveR = SLEEVE * a;
    const groove = GROOVE_DEPTH * a;
    const railR = RAIL * a;
    const onInputAxis = (g: GearView) => {
      const m = this.member(g.def.member);
      return Math.hypot(m.x, m.y) < 1e-6;
    };
    const mainTip = Math.max(...this.gears.filter(onInputAxis).map((g) => g.tip));
    const railY = Math.max(mainTip, sleeveR) + RAIL_CLEAR * a;
    const syncSteel = this.own(new THREE.MeshStandardMaterial({ color: '#9da2a7', metalness: 1, roughness: 0.36 }));
    const dogSteel = this.own(new THREE.MeshStandardMaterial({ color: '#c4c7ca', metalness: 1, roughness: 0.3 }));
    const brass = this.own(brassMaterial());
    const forkSteel = this.own(new THREE.MeshStandardMaterial({ color: '#7d8288', metalness: 0.9, roughness: 0.45 }));
    const railSteel = this.own(new THREE.MeshStandardMaterial({ color: '#cfd2d4', metalness: 1, roughness: 0.2 }));
    const elements = new Map(spec.elements.map((e) => [e.id, e]));
    const hubs: THREE.BufferGeometry[] = [];
    const blockers: THREE.BufferGeometry[] = [];
    const sorted = [...places].sort((p, q) => p.z - q.z);
    sorted.forEach((place, i) => {
      const w = place.width;
      // Hub: on the output shaft's splines, standing at its place.
      hubs.push(ring(outputR, hubR - 0.3, w - 1, -place.z, segments));
      // Sleeve: over the hub, a groove for the fork in the middle.
      const half = (w - 1) / 2;
      const gw = 0.3 * w;
      const sleeve = lathe(
        [
          [hubR, half], [hubR, -half], [sleeveR, -half], [sleeveR, -gw / 2], [sleeveR - groove, -gw / 2],
          [sleeveR - groove, gw / 2], [sleeveR, gw / 2], [sleeveR, half], [hubR, half],
        ],
        segments,
      );
      const sleeveMesh = tag(new THREE.Mesh(sleeve, syncSteel), 'gbx-synchro-sleeve');
      sleeveMesh.position.z = -place.z * MM;
      sleeveMesh.castShadow = true;
      output.spin.add(sleeveMesh);
      // Fork in the groove and its rail above the shafts; they slide with the sleeve but do not turn.
      const railX = (i - (sorted.length - 1) / 2) * 0.22 * a;
      const forkR = sleeveR - groove + gw * 0.4;
      const tube = gw * 0.4;
      const torus = new THREE.TorusGeometry(forkR * MM, tube * MM, 8, this.quality === 'low' ? 16 : 28, Math.PI);
      const arm = new THREE.BoxGeometry(5 * MM, Math.hypot(railX, railY - forkR) * MM, gw * MM);
      arm.rotateZ(-Math.atan2(railX, railY - forkR));
      arm.translate((railX / 2) * MM, ((forkR + railY) / 2) * MM, 0);
      const boss = zCylinder((railR + 3) * MM, (gw + 10) * MM, 16, railX * MM, railY * MM, 0);
      const fork = tag(new THREE.Mesh(merge([torus, arm, boss]), forkSteel), 'gbx-fork');
      const rail = tag(new THREE.Mesh(zCylinder(railR * MM, (this.length - 4) * MM, 16, railX * MM, railY * MM, (place.z - this.length / 2) * MM), railSteel), 'gbx-rail');
      const slider = new THREE.Group();
      slider.position.z = -place.z * MM;
      slider.add(fork, rail);
      fork.castShadow = true;
      rail.castShadow = true;
      output.frame.add(slider);
      this.sleeves.push({ place, sliders: [sleeveMesh, slider], travel: (place.gap - 1) * MM });

      // Each side: a dog ring on the gear's face and a brass blocker ring between it and the hub.
      for (const [side, id] of [[-1, place.front], [1, place.back]] as const) {
        if (!id) continue;
        const element = elements.get(id);
        if (!element) continue;
        const engaged = this.member(element.a);
        const dogW = 0.45 * place.gap;
        const blockW = 0.3 * place.gap;
        const face = place.z + side * (w / 2 + place.gap);
        const inner = engaged.id === spec.input ? outputR + 1 : engaged.shaft ? this.shaftRadius(engaged) : Math.max(...this.gears.filter((g) => g.def.member === engaged.id).map((g) => g.bore));
        const dogOuter = hubR - 0.6;
        const teeth = Math.max(12, Math.round((TAU * dogOuter) / 4));
        const dog = extrude(gearShape(dogOuter * MM, (dogOuter - 1.6) * MM, teeth, inner * MM), dogW * MM, undefined, 16);
        dog.translate(0, 0, -(face - side * (dogW / 2)) * MM);
        const dogMesh = tag(new THREE.Mesh(dog, dogSteel), 'gbx-dog-ring');
        dogMesh.castShadow = true;
        engaged.spin.add(dogMesh);
        blockers.push(ring(hubR - 4.5, hubR - 1, blockW, -(face - side * (dogW + 0.5 + blockW / 2)), this.quality === 'low' ? 20 : 32));
      }
    });
    const hubMesh = tag(new THREE.Mesh(merge(hubs), syncSteel), 'gbx-synchro-hub');
    const blockerMesh = tag(new THREE.Mesh(merge(blockers), brass), 'gbx-blocker-ring');
    hubMesh.castShadow = blockerMesh.castShadow = true;
    output.spin.add(hubMesh, blockerMesh);
    this.railTop = railY + railR + 3;
    this.railXs = sorted.map((_, i) => (i - (sorted.length - 1) / 2) * 0.22 * a);
  }

  /** Top of the rail bosses and the rails' x, mm: the case must hold them. */
  private railTop = 0;
  private railXs: number[] = [];

  private buildCase(o: typeof DEFAULTS): void {
    const a = this.a;
    const L = this.length;
    const segments = this.quality === 'low' ? 32 : 56;
    const solid = this.own(castAluminiumMaterial());
    const glass = this.glass('#bcd9e4', 0.025, 0.34);

    // Section: every axis's largest tip circle plus the margin, and the rails, wrapped tight.
    const circles: Pulley2D[] = [];
    for (const m of this.members) {
      const tips = this.gears.filter((g) => g.def.member === m.id).map((g) => g.tip);
      if (!tips.length) continue;
      circles.push({ x: m.x * MM, y: m.y * MM, r: (Math.max(...tips) + CASE_MARGIN) * MM });
    }
    if (this.box.spec.sleeves?.length) circles.push({ x: 0, y: 0, r: (SLEEVE * a + CASE_MARGIN) * MM });
    for (const x of this.railXs) circles.push({ x: x * MM, y: (this.railTop - RAIL * a - 3) * MM, r: (RAIL * a + 3 + CASE_MARGIN) * MM });
    const section = hullShape(circles);
    const outline = section.getPoints();
    const reach = Math.max(...outline.map((p) => p.length())) / MM;

    const shell = (geometry: THREE.BufferGeometry, part: string, order: number): THREE.Mesh => {
      const mesh = tag(new THREE.Mesh(geometry, solid), part);
      mesh.userData.ownOrder = order;
      mesh.renderOrder = order;
      this.shells.push({ mesh, solid, glass });
      this.mounted.add(mesh);
      return mesh;
    };

    const caseGeo = extrude(section, (L + 2 * WALL) * MM, { thickness: 2 * MM, segments: 2 }, 12);
    caseGeo.translate(0, 0, -(L / 2) * MM);
    const caseMesh = shell(caseGeo, 'gbx-case', 5);
    this.explode(caseMesh, new THREE.Vector3(0, 2.2, 0));

    // Bellhousing: a cone from the case's front face out to the flywheel, open toward the engine.
    const rBack = reach + 4;
    const rFront = Math.max(o.flywheelRadiusMm + 14, rBack + 10);
    const y0 = WALL;
    const y1 = WALL + o.bellhousingDepthMm;
    const bore = INPUT_SHAFT * a + 0.22 * a;
    const bell = lathe(
      [
        [bore, y0], [rBack + 8, y0], [rBack + 8, y0 + 8], [rBack, y0 + 8], [rFront, y1 - 8], [rFront + 10, y1 - 8],
        [rFront + 10, y1], [rFront - 5, y1], [rBack - 5, y0 + 6], [bore, y0 + 6], [bore, y0],
      ],
      segments,
    );
    const bellMesh = shell(bell, 'gbx-bellhousing', 6);
    this.explode(bellMesh, new THREE.Vector3(0, 0, 2.6));
    this.points.bellhousing = new THREE.Vector3(0, 0, y1 * MM);

    // Extension: from the case's back face, tapering round the output shaft.
    const e0 = -(L + WALL);
    const e1 = e0 - o.extensionMm;
    const rStart = Math.max(0.75 * a, MAIN_SHAFT * a + 0.3 * a);
    const rEnd = 0.5 * a;
    const hole = MAIN_SHAFT * a + 1;
    const ext = lathe(
      [[hole, e1], [rEnd, e1], [rEnd + 3, e1 + 12], [rStart, e0 - 8], [rStart + 8, e0 - 8], [rStart + 8, e0], [hole, e0], [hole, e1]],
      segments,
    );
    const extMesh = shell(ext, 'gbx-extension', 6);
    this.explode(extMesh, new THREE.Vector3(0, 0, -2.6));

    // Shifter mount on top of the extension, and the stub of the lever.
    const towerFrom = e0 - 0.25 * o.extensionMm;
    const towerTo = e0 - 0.7 * o.extensionMm;
    const towerLen = towerFrom - towerTo;
    const radiusAt = (z: number) => rStart + ((rEnd - rStart) * (e0 - 8 - z)) / (e0 - 8 - e1 - 12);
    const towerBase = radiusAt(towerFrom) - 10;
    const towerTop = Math.max(towerBase + 0.55 * a, this.railTop + 8);
    const tower = extrude(roundedRect(-0.38 * a * MM, towerBase * MM, 0.38 * a * MM, towerTop * MM, 0.12 * a * MM), towerLen * MM, { thickness: 2 * MM, segments: 2 }, 8);
    tower.translate(0, 0, ((towerFrom + towerTo) / 2) * MM);
    const towerMesh = shell(tower, 'gbx-shift-tower', 7);
    this.explode(towerMesh, new THREE.Vector3(0, 1.2, -2.6));
    const rubber = this.own(new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0, roughness: 0.7 }));
    const leverZ = (towerFrom + towerTo) / 2;
    const boot = new THREE.CylinderGeometry(0.1 * a * MM, 0.26 * a * MM, 0.32 * a * MM, 20);
    boot.translate(0, (towerTop + 0.16 * a) * MM, leverZ * MM);
    const bootMesh = tag(new THREE.Mesh(boot, rubber), 'gbx-shift-lever');
    const lever = new THREE.CylinderGeometry(0.07 * a * MM, 0.08 * a * MM, 1.1 * a * MM, 16);
    lever.translate(0, (towerTop + 0.55 * a) * MM, leverZ * MM);
    const leverMesh = tag(new THREE.Mesh(lever, this.steel), 'gbx-shift-lever');
    for (const part of [bootMesh, leverMesh]) {
      part.castShadow = true;
      this.mounted.add(part);
      this.peripheral.push(part);
      this.explode(part, new THREE.Vector3(0, 1.2, -2.6));
    }

    // Ribs: flanges at both faces, a ring in the middle, and ribs along the sides and the bottom (solid view only).
    const grown = (extra: number) => hullShape(circles.map((c) => ({ ...c, r: c.r + extra * MM })));
    const ribs: THREE.BufferGeometry[] = [];
    for (const [z, extra, thick] of [[-WALL + 4, 9, 8], [L + WALL - 4, 7, 8], [L / 2, 4, 6], [L * 0.22, 4, 6], [L * 0.78, 4, 6]] as const) {
      const g = extrude(grown(extra), thick * MM, undefined, 12);
      g.translate(0, 0, -z * MM);
      ribs.push(g);
    }
    const ribLength = (L + 2 * WALL - 8) * MM;
    for (const [px, py] of ribSpots(outline)) {
      const rib = new THREE.BoxGeometry(6 * MM, 6 * MM, ribLength);
      const angle = Math.atan2(px, py);
      rib.rotateZ(-angle);
      rib.translate(px + Math.sin(angle) * 2 * MM, py + Math.cos(angle) * 2 * MM, -(L / 2) * MM);
      ribs.push(rib);
    }
    const ribMesh = tag(new THREE.Mesh(merge(ribs), solid), 'gbx-case');
    ribMesh.castShadow = true;
    this.mounted.add(ribMesh);
    this.solidOnly.push(ribMesh);
    this.explode(ribMesh, new THREE.Vector3(0, 2.2, 0));

    // Bearings in the walls: one standing ring per shaft end.
    const bearingSteel = this.own(new THREE.MeshStandardMaterial({ color: '#6e7378', metalness: 0.95, roughness: 0.4 }));
    const bearings: THREE.BufferGeometry[] = [];
    const spec = this.box.spec;
    for (const m of this.members) {
      if (!m.shaft) continue;
      const r = this.shaftRadius(m) + 0.3;
      const width = 0.22 * a;
      const ends = m.id === spec.input ? [-WALL / 2] : m.id === spec.output ? [L + WALL / 2] : [-WALL / 2, L + WALL / 2];
      for (const z of ends) {
        const g = ring(r, r + width, WALL - 1, -z, this.quality === 'low' ? 20 : 32);
        g.translate(m.x * MM, m.y * MM, 0);
        bearings.push(g);
      }
    }
    const bearingMesh = tag(new THREE.Mesh(merge(bearings), bearingSteel), 'gbx-bearing');
    this.mounted.add(bearingMesh);
    this.peripheral.push(bearingMesh);
    // They sit in the walls, so they leave with the case.
    this.explode(bearingMesh, new THREE.Vector3(0, 2.2, 0));

    // Output flange: a three-armed flange for a flexible coupling, turning with the output shaft.
    const output = this.member(spec.output);
    const arms: Pulley2D[] = [{ x: 0, y: 0, r: 0.32 * a * MM }];
    for (let k = 0; k < 3; k++) {
      const phi = (k / 3) * TAU;
      arms.push({ x: Math.sin(phi) * 0.62 * a * MM, y: Math.cos(phi) * 0.62 * a * MM, r: 0.17 * a * MM });
    }
    const flangeShape = hullShape(arms);
    for (let k = 0; k < 3; k++) {
      const phi = (k / 3) * TAU;
      const boltHole = new THREE.Path();
      boltHole.absarc(Math.sin(phi) * 0.62 * a * MM, Math.cos(phi) * 0.62 * a * MM, 0.055 * a * MM, 0, TAU, true);
      flangeShape.holes.push(boltHole);
    }
    const flange = extrude(flangeShape, 10 * MM, { thickness: 1.5 * MM, segments: 1 }, 12);
    const flangeZ = -e1 + 2 + 5;
    flange.translate(0, 0, -flangeZ * MM);
    const flangeMesh = tag(new THREE.Mesh(flange, this.steel), 'gbx-output-flange');
    flangeMesh.castShadow = true;
    output.spin.add(flangeMesh);
    this.points.output = new THREE.Vector3(0, 0, -(flangeZ + 5) * MM);

    // Pulled apart: the input forward, the output and its gears back, the other shafts away from the input axis.
    for (const m of this.members) {
      const away = Math.hypot(m.x, m.y);
      if (m.id === spec.input) this.explode(m.frame, new THREE.Vector3(0, 0, 1.4));
      else if (away > 1e-6) this.explode(m.frame, new THREE.Vector3((m.x / away) * 1.3, (m.y / away) * 1.3, 0));
      else if (m.id === spec.output) this.explode(m.frame, new THREE.Vector3(0, 0, -1.1));
      else {
        // Loose gears slide off along the shaft, those further back further.
        const z = Math.min(...spec.gears.filter((g) => g.member === m.id).map((g) => g.z));
        this.explode(m.frame, new THREE.Vector3(0, 0, -1.1 - (0.9 * z) / L));
      }
    }
  }

  private explode(object: THREE.Object3D, direction: THREE.Vector3): void {
    this.explodables.push({ object, base: object.position.clone(), direction: direction.multiplyScalar(this.a * MM) });
  }

  // ---- SceneModel ----

  update(frame: GearboxFrame): void {
    for (const m of this.members) m.spin.rotation.z = -wrap(frame.angles[m.index] ?? 0);
    for (const s of this.sleeves) {
      const p = Math.max(-1, Math.min(1, frame.sleeves[s.place.id] ?? 0));
      for (const o of s.sliders) o.position.z = -s.place.z * MM - p * s.travel;
    }
    for (const g of this.gears) {
      let glow = 0;
      for (const j of g.meshes) glow = Math.max(glow, frame.meshPower[j] ?? 0);
      if (Math.abs(glow - g.glow) < 1e-3) continue;
      g.glow = glow;
      this.glow.set(g.material, glow);
      this.paint(g.material);
    }
  }

  setView(view: ViewMode): void {
    this.view = view;
    for (const { mesh, solid, glass } of this.shells) {
      mesh.visible = view !== 'mechanism';
      mesh.material = view === 'solid' ? solid : glass;
      mesh.castShadow = view === 'solid';
    }
    for (const p of this.peripheral) p.visible = view !== 'mechanism';
    for (const p of this.solidOnly) p.visible = view === 'solid';
  }

  get viewMode(): ViewMode {
    return this.view;
  }

  setExplode(amount: number): void {
    for (const { object, base, direction } of this.explodables) object.position.copy(base).addScaledVector(direction, amount);
  }

  /** Marks a part as failed: a gear by its id ('main-2') or every part with a key ('gbx-synchro-sleeve'). Null clears. */
  setFailure(part: string | null): void {
    const before = [...this.damaged];
    this.damaged.clear();
    if (part) {
      this.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (o.userData.gear !== part && o.userData.part !== part)) return;
        for (const m of this.materialsOf(mesh)) this.damaged.add(m);
      });
    }
    for (const m of new Set([...before, ...this.damaged])) this.paint(m);
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
    for (const m of this.materials) this.paint(m);
  }

  /** 1 = as the view draws it, toward 0 a faint ghost. */
  setGhost(alpha: number): void {
    const a = Math.max(0, Math.min(1, alpha));
    for (const m of this.materials) {
      // Glass is transparent already and writes no depth; its own alpha is scaled by the opacity (see glass()).
      m.userData.ghostBase ??= { transparent: m.transparent, depthWrite: m.depthWrite };
      const base = m.userData.ghostBase as { transparent: boolean; depthWrite: boolean };
      const transparent = base.transparent || a < 1;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = a;
      m.depthWrite = base.depthWrite && a >= 1;
    }
  }

  /** Adds `base` to the model's render orders, so nested glass of several models sorts in bands. */
  setRenderBand(base: number): void {
    this.group.traverse((o) => {
      o.renderOrder = base + ((o.userData.ownOrder as number | undefined) ?? 0);
    });
  }

  /** Named points in the group's frame: the bellhousing's engine face, the input shaft's front end, the output flange. */
  anchors(): Record<string, THREE.Vector3> {
    this.mounted.updateMatrix();
    return Object.fromEntries(Object.entries(this.points).map(([k, p]) => [k, p.clone().applyMatrix4(this.mounted.matrix)]));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Cached geometry goes back to the cache, never disposed here; the rest belongs to this model alone.
    const seen = new Set<THREE.BufferGeometry>(this.acquired);
    for (const geometry of this.acquired) releaseGeometry(geometry);
    this.acquired.length = 0;
    this.group.traverse((o) => {
      const geometry = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!geometry || seen.has(geometry)) return;
      seen.add(geometry);
      geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }

  // ---- For tests, demonstrations and the budget ----

  /** The group of a member (its axis, moved when pulled apart), holding everything that turns or slides with it. */
  memberFrame(id: string): THREE.Group | undefined {
    return this.members.find((m) => m.id === id)?.frame;
  }

  /** The drawn mesh of a gear by its id. */
  gearMesh(id: string): THREE.Mesh | undefined {
    return this.gears.find((g) => g.id === id)?.mesh;
  }

  /** How many objects are drawn and how many triangles they hold, in this view. */
  drawStats(): { draws: number; triangles: number } {
    let draws = 0;
    let triangles = 0;
    this.group.updateMatrixWorld(true);
    this.group.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      draws++;
      const g = mesh.geometry;
      triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    return { draws, triangles };
  }

  private materialsOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
    const shell = this.shells.find((s) => s.mesh === mesh);
    const list = shell ? [shell.solid, shell.glass] : Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return list.filter((m): m is THREE.MeshStandardMaterial => this.materials.has(m as THREE.MeshStandardMaterial));
  }

  /** Emissive from the power glow, the highlight and a failure, in that order of strength. */
  private paint(m: THREE.MeshStandardMaterial): void {
    m.emissiveIntensity = 1;
    if (this.damaged.has(m)) {
      m.emissive.copy(DAMAGE).multiplyScalar(1.3);
      return;
    }
    m.emissive.copy(POWER_GLOW).multiplyScalar(GLOW_GAIN * (this.glow.get(m) ?? 0));
    if (this.highlighted) m.emissive.add(HIGHLIGHT);
  }
}

/** A solid of revolution round Z from (radius, z) points in mm; every corner stays sharp. */
function lathe(profile: Array<[number, number]>, segments: number): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  profile.forEach(([r, z], i) => {
    const p = new THREE.Vector2(r * MM, z * MM);
    points.push(p);
    // A repeated point gives the corner two normals instead of one smoothed across it.
    if (i > 0 && i < profile.length - 1) points.push(p.clone());
  });
  const g = new THREE.LatheGeometry(points, segments);
  g.rotateX(Math.PI / 2);
  return g;
}

/** A flat ring round Z: radii and width in mm, its middle at scene z. */
function ring(rIn: number, rOut: number, width: number, z: number, segments: number): THREE.BufferGeometry {
  const h = width / 2;
  const g = lathe([[rIn, -h], [rOut, -h], [rOut, h], [rIn, h], [rIn, -h]], segments);
  g.translate(0, 0, z * MM);
  return g;
}

/**
 * Where ribs run along the case: on its outline at the sides and underneath, as (x, y) in scene units. The outline
 * is searched along rays from the input axis.
 */
function ribSpots(outline: THREE.Vector2[]): Array<[number, number]> {
  const spots: Array<[number, number]> = [];
  for (const deg of [70, 110, 155, 205, 250, 290]) {
    const dir = new THREE.Vector2(Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180));
    let best = 0;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i]!;
      const q = outline[(i + 1) % outline.length]!;
      // Ray from the origin along dir against segment p–q.
      const e = new THREE.Vector2().subVectors(q, p);
      const den = dir.x * e.y - dir.y * e.x;
      if (Math.abs(den) < 1e-12) continue;
      const t = (p.x * e.y - p.y * e.x) / den;
      const u = (p.x * dir.y - p.y * dir.x) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    if (best > 0) spots.push([dir.x * best, dir.y * best]);
  }
  return spots;
}
