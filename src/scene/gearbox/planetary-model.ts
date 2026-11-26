// Parametric 3D model of a planetary automatic (stage K11): for each simple set the sun, the planets (one
// InstancedMesh per set, so they cannot be explodables or have a material of their own), the carrier's plates and
// pins, the ring gear with its rim; the drums and sleeves of the permanent joins; the input and output shafts; a
// plate pack per brake and clutch; the case.
//
// Everything that turns together has one tint (the joins S1 = S2, C1 = R4… of the 8HP; element-colors.ts, the same
// as on the lever diagram), so the mechanism view shows which parts are one body. A closed element's pack closes up and glows in the element's colour (element-colors.ts,
// the same as its button and its marks on the lever diagram). Meshes that carry torque glow warm as in the other
// gearbox models.
//
// Frame (`mounted`): the axis is Z at x = y = 0; spec millimetres behind the case's front face map to −z·MM, so the
// engine side is +Z. Each member on the axis is one group turned by its angle; a planet copy stands on its carrier's
// group at its angle round the axis and turns by its own angle less the carrier's. Where the packs and sets stand
// along the axis is a layout estimate (layouts/planetary.ts), drawn schematically: the packs show which element is
// closed, not how its drums reach its members.
//
// A SceneModel<PlanetaryFrame> (model-types.ts); what every gearbox model does the same way is in scene-base.ts.

import * as THREE from 'three';
import type { GearDef, PackPlace } from '../../drivetrain/spec.ts';
import type { Gearbox } from '../../drivetrain/topology.ts';
import { merge, MM, zCylinder } from '../geometry.ts';
import { castAluminiumMaterial } from '../materials.ts';
import { tag, type SceneModel, type ViewMode } from '../model-types.ts';
import { bodyTints, elementColor } from './element-colors.ts';
import { acquireGearGeometry, drawnGear, type MeshQuality } from './gear-mesh.ts';
import { acquireRingGeometry } from './ring-mesh.ts';
import { GearboxSceneBase, lathe, ring } from './scene-base.ts';

/** What the model draws in a frame; PlanetaryPose of src/drivetrain/planetary-table.ts has this shape. */
export interface PlanetaryFrame {
  /** Angle of every member, rad, in `Gearbox.members` order. */
  angles: ArrayLike<number>;
  /** Share of the input power through each mesh, 0–1, in `Gearbox.meshes` order. */
  meshPower: ArrayLike<number>;
  /** Closed elements by id. */
  closed: ReadonlySet<string>;
}

export interface PlanetaryModelOptions {
  quality?: MeshQuality;
}

// Layout estimates (not data), mm.
const SHAFT_IN = 11;
const SHAFT_OUT = 15;
const WALL = 3;
const PLATE = 3;
const RIM_MODULES = 3;
const FRICTION = 1.8;
const STEEL_PLATE = 1.6;
/** Extra gap at each face of an open pack, mm. */
const OPEN_GAP = 1.4;
/** Bars of a join that reaches over other sets. */
const CAGE_BARS = 8;

const TAU = Math.PI * 2;
const wrap = (angle: number): number => angle - Math.floor(angle / TAU) * TAU;

interface MemberView {
  id: string;
  index: number;
  frame: THREE.Group;
  spin: THREE.Group;
  material: THREE.MeshStandardMaterial;
}

interface SetView {
  k: number;
  z: number;
  width: number;
  sun: GearDef;
  planet: GearDef;
  ring: GearDef;
  planetMember: string;
  carrier: string;
  sunMember: string;
  ringMember: string;
  hub: number;
  plateIn: number;
  plateOut: number;
  rim: number;
  planets: THREE.InstancedMesh;
  phases: number[];
  angles: number[];
  radius: number;
}

interface PackView {
  place: PackPlace;
  friction: THREE.InstancedMesh;
  steel: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  open: number;
}

export class PlanetaryModel extends GearboxSceneBase implements SceneModel<PlanetaryFrame> {
  readonly box: Gearbox;
  private readonly quality: MeshQuality;
  private readonly members: MemberView[] = [];
  private readonly sets: SetView[] = [];
  private readonly packs: PackView[] = [];
  private readonly gearMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly gearMeshes = new Map<string, number[]>();
  private readonly labels: THREE.Object3D[] = [];
  /** Label textures and materials: the base disposes only meshes' geometry and owned materials. */
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly turn = new THREE.Quaternion();
  private readonly at = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private maxRim = 0;
  private back = 0;

  constructor(box: Gearbox, options: PlanetaryModelOptions = {}) {
    super();
    if (box.spec.kind !== 'planetary') throw new Error(`${box.spec.id}: not a planetary box`);
    this.box = box;
    this.quality = options.quality ?? 'high';
    const tints = bodyTints(box.spec);
    box.spec.members.forEach((m, index) => {
      if (m.carrier) return;
      const frame = new THREE.Group();
      const spin = new THREE.Group();
      frame.add(spin);
      this.mounted.add(frame);
      const material = this.own(new THREE.MeshStandardMaterial({ color: tints.get(m.id)!, metalness: 0.85, roughness: 0.34 }));
      this.members.push({ id: m.id, index, frame, spin, material });
    });
    try {
      this.buildSets();
      this.buildJoins();
      this.buildShafts();
      this.buildPacks();
      this.buildCase();
    } catch (error) {
      this.dispose();
      throw error;
    }
    this.mounted.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.mounted);
    this.mounted.position.set(0, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    this.setView('xray');
  }

  // ---- Building ----

  private member(id: string): MemberView {
    const m = this.members.find((x) => x.id === id);
    if (!m) throw new Error(`${this.box.spec.id}: no member ${id} on the axis`);
    return m;
  }

  private gearMaterial(def: GearDef, base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    // Its own copy of the body's tint, so the power glow lights this gear alone.
    const material = this.own(base.clone());
    this.gearMaterials.set(def.id, material);
    this.gearMeshes.set(def.id, this.box.meshes.flatMap((mesh, j) => (mesh.a === def.id || mesh.b === def.id ? [j] : [])));
    return material;
  }

  private buildSets(): void {
    const box = this.box;
    const segments = this.quality === 'low' ? 32 : 64;
    for (const [planetMember, copies] of Object.entries(box.planets)) {
      const planet = box.spec.gears.find((g) => g.member === planetMember)!;
      const mates = box.meshes.filter((m) => m.a === planet.id || m.b === planet.id).map((m) => box.spec.gears.find((g) => g.id === (m.a === planet.id ? m.b : m.a))!);
      const sun = mates.find((g) => !g.internal)!;
      const ringDef = mates.find((g) => g.internal)!;
      const k = this.sets.length + 1;
      const sunRoot = drawnGear({ ...sun, boreRadius: 0 }).rf;
      const hub = Math.max(SHAFT_IN + 4, 0.55 * sunRoot);
      const pin = (planet.bore ?? 0) / 2;
      const planetTip = drawnGear({ ...planet, boreRadius: 0 }).ra;
      const ringR = (ringDef.module * ringDef.teeth) / 2;
      const rim = ringR + RIM_MODULES * ringDef.module;
      this.maxRim = Math.max(this.maxRim, rim);
      const z = -sun.z;
      const width = sun.faceWidth;
      this.back = Math.max(this.back, sun.z + width / 2);

      // Sun on its sleeve.
      const sunView = this.member(sun.member);
      const sunGeo = acquireGearGeometry({ ...sun, boreRadius: hub }, this.quality);
      this.acquired.push(sunGeo);
      const sunMesh = tag(new THREE.Mesh(sunGeo, this.gearMaterial(sun, sunView.material)), 'gbx-pl-sun');
      sunMesh.userData.gear = sun.id;
      sunMesh.position.z = z * MM;
      sunMesh.rotation.z = -(box.phases[sun.id] ?? 0);
      sunView.spin.add(sunMesh);
      sunView.spin.add(tag(new THREE.Mesh(ring(hub - WALL, hub, width + 8, z, segments), sunView.material), 'gbx-pl-sun'));

      // Ring with its rim.
      const ringView = this.member(ringDef.member);
      const ringGeo = acquireRingGeometry({ ...ringDef, outerRadius: rim }, this.quality);
      this.acquired.push(ringGeo);
      const ringMesh = tag(new THREE.Mesh(ringGeo, this.gearMaterial(ringDef, ringView.material)), 'gbx-pl-ring');
      ringMesh.userData.gear = ringDef.id;
      ringMesh.position.z = z * MM;
      ringMesh.rotation.z = -(box.phases[ringDef.id] ?? 0);
      ringView.spin.add(ringMesh);
      this.explode(ringView.frame, new THREE.Vector3(1, 0, 0), 1.6 * rim);

      // Carrier: two plates and the pins.
      const carrierView = this.member(copies.carrier);
      const plateIn = copies.carrier === box.spec.input ? SHAFT_IN : copies.carrier === box.spec.output ? hub + 2 : hub + 2;
      const plateOut = Math.min(copies.radius + 0.6 * planetTip, ringR - 1.6 * ringDef.module);
      const plates = merge([
        ring(plateIn, plateOut, PLATE, z + width / 2 + 2 + PLATE / 2, segments),
        ring(copies.carrier === box.spec.output ? SHAFT_OUT : plateIn, plateOut, PLATE, z - width / 2 - 2 - PLATE / 2, segments),
        ...copies.angles.map((a) => zCylinder(pin * MM, (width + 4 + 2 * PLATE) * MM, 16, copies.radius * Math.sin(a) * MM, copies.radius * Math.cos(a) * MM, z * MM)),
      ]);
      carrierView.spin.add(tag(new THREE.Mesh(plates, carrierView.material), 'gbx-pl-carrier'));

      // Planets: one instance per copy on the carrier.
      const planetGeo = acquireGearGeometry({ ...planet, boreRadius: pin }, this.quality);
      this.acquired.push(planetGeo);
      const planetMaterial = this.gearMaterial(planet, this.own(new THREE.MeshStandardMaterial({ color: '#c9cdd1', metalness: 0.9, roughness: 0.3 })));
      const planets = tag(new THREE.InstancedMesh(planetGeo, planetMaterial, copies.angles.length), 'gbx-pl-planet');
      planets.userData.gear = planet.id;
      planets.castShadow = true;
      carrierView.spin.add(planets);
      const set: SetView = {
        k, z, width, sun, planet, ring: ringDef, planetMember, carrier: copies.carrier, sunMember: sun.member, ringMember: ringDef.member,
        hub, plateIn, plateOut, rim, planets, phases: copies.phases[planet.id]!, angles: copies.angles, radius: copies.radius,
      };
      this.sets.push(set);
      this.placePlanets(set, 0, 0);
    }
  }

  /** Where a member of a set joins a drum: the sun's sleeve, the carrier's plate, the ring's rim (mm). */
  private attach(member: string): { set: SetView; r: number } {
    const set = this.sets.find((s) => s.sunMember === member || s.carrier === member || s.ringMember === member)!;
    const r = member === set.sunMember ? set.hub - WALL / 2 : member === set.carrier ? set.plateOut - WALL : set.rim - WALL / 2;
    return { set, r };
  }

  /** The permanent joins: a disc behind the first set, a drum or sleeve along the axis, a disc in front of the second. */
  private buildJoins(): void {
    const segments = this.quality === 'low' ? 32 : 64;
    for (const [x, y] of this.box.spec.couplings) {
      let a = this.attach(x);
      let b = this.attach(y);
      let owner = x;
      if (a.set.k > b.set.k) {
        [a, b] = [b, a];
        owner = y;
      }
      const view = this.member(owner);
      // Spec depth (mm behind the front): behind set a, in front of set b.
      const za = -a.set.z + a.set.width / 2 + 2 + PLATE + 3;
      const zb = -b.set.z - b.set.width / 2 - 2 - PLATE - 3;
      const mid = b.set.k - a.set.k > 1 ? this.maxRim + 10 : b.r;
      const parts: THREE.BufferGeometry[] = [];
      const face = (r: number, z: number, set: SetView) => {
        // From the member's own face to the join's plane.
        const from = -set.z + (z > -set.z ? set.width / 2 : -set.width / 2);
        if (Math.abs(z - from) > 0.5) parts.push(ring(r - WALL / 2, r + WALL / 2, Math.abs(z - from), -(z + from) / 2, segments));
      };
      face(a.r, za, a.set);
      face(b.r, zb, b.set);
      if (Math.abs(mid - a.r) > 0.5) parts.push(ring(Math.min(mid, a.r) - WALL / 2, Math.max(mid, a.r) + WALL / 2, WALL, -za, segments));
      if (b.set.k - a.set.k > 1) {
        // A drum round the sets between would hide them: an open cage of bars turns with the join instead.
        for (let i = 0; i < CAGE_BARS; i++) {
          const angle = (i / CAGE_BARS) * Math.PI * 2;
          parts.push(zCylinder(WALL * MM, (zb - za) * MM, 10, mid * Math.sin(angle) * MM, mid * Math.cos(angle) * MM, (-(za + zb) / 2) * MM));
        }
      } else {
        parts.push(ring(mid - WALL / 2, mid + WALL / 2, zb - za, -(za + zb) / 2, segments));
      }
      if (Math.abs(mid - b.r) > 0.5) parts.push(ring(Math.min(mid, b.r) - WALL / 2, Math.max(mid, b.r) + WALL / 2, WALL, -zb, segments));
      view.spin.add(tag(new THREE.Mesh(merge(parts), view.material), 'gbx-pl-drum'));
    }
  }

  private buildShafts(): void {
    const spec = this.box.spec;
    const packs = spec.packs ?? [];
    const input = this.member(spec.input);
    const output = this.member(spec.output);
    // The input reaches from the converter's side to the last pack it drives; the output leaves behind the last set.
    const inputSet = this.attach(spec.input).set;
    const inputPacks = packs.filter((p) => spec.elements.find((e) => e.id === p.element && (e.a === spec.input || e.b === spec.input)));
    const inputEnd = Math.max(-inputSet.z + inputSet.width / 2, ...inputPacks.map((p) => p.z + 6));
    input.spin.add(tag(new THREE.Mesh(zCylinder(SHAFT_IN * MM, (inputEnd + 60) * MM, 24, 0, 0, -((inputEnd - 60) / 2) * MM), input.material), 'gbx-pl-input'));
    for (const p of inputPacks) input.spin.add(tag(new THREE.Mesh(ring(SHAFT_IN, p.rIn - 2, WALL, -p.z, 32), input.material), 'gbx-pl-input'));
    const outSet = this.attach(spec.output).set;
    const from = -outSet.z + outSet.width / 2;
    output.spin.add(tag(new THREE.Mesh(zCylinder(SHAFT_OUT * MM, 70 * MM, 24, 0, 0, -(from + 35) * MM), output.material), 'gbx-pl-output'));
    this.back = Math.max(this.back, from + 70);
  }

  private buildPacks(): void {
    const spec = this.box.spec;
    const segments = this.quality === 'low' ? 32 : 64;
    (spec.packs ?? []).forEach((place, i) => {
      const element = spec.elements.find((e) => e.id === place.element)!;
      const color = new THREE.Color(elementColor(element.id, i));
      const part = element.kind === 'brake' ? 'gbx-pl-brake' : 'gbx-pl-clutch';
      const material = this.own(new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.7, emissive: color, emissiveIntensity: 0 }));
      const steelMaterial = this.own(new THREE.MeshStandardMaterial({ color: '#c3c7cb', metalness: 0.9, roughness: 0.3 }));
      const friction = tag(new THREE.InstancedMesh(ring(place.rIn, place.rOut - 3, FRICTION, 0, segments), material, place.plates), part);
      const steel = tag(new THREE.InstancedMesh(ring(place.rIn + 3, place.rOut, STEEL_PLATE, 0, segments), steelMaterial, place.plates), part);
      friction.userData.element = element.id;
      steel.userData.element = element.id;
      const group = new THREE.Group();
      group.add(friction, steel);
      // The hub inside the plates and the drum round them.
      const length = this.packLength(place, 1) + 4;
      const frame = merge([ring(place.rIn - 4, place.rIn - 1, length, 0, segments), ring(place.rOut + 1, place.rOut + 3, length, 0, segments)]);
      group.add(tag(new THREE.Mesh(frame, steelMaterial), part));
      group.position.z = -place.z * MM;
      this.mounted.add(group);
      this.explode(group, new THREE.Vector3(0, 1, 0), 1.4 * spec.packs!.length * 12);
      const view: PackView = { place, friction, steel, material, color, open: 1 };
      this.packs.push(view);
      this.layPack(view);
      this.label(element.id, color, place);
    });
  }

  /** Axial length of a pack's plates, mm, from closed (0) to open (1). */
  private packLength(place: PackPlace, open: number): number {
    return place.plates * (FRICTION + STEEL_PLATE) + (2 * place.plates - 1) * OPEN_GAP * open;
  }

  private layPack(view: PackView): void {
    const { place, open } = view;
    const pitch = (FRICTION + STEEL_PLATE) / 2 + OPEN_GAP * open;
    const start = -this.packLength(place, open) / 2;
    for (let i = 0; i < place.plates; i++) {
      // Friction, steel, friction, steel… from the front face of the pack backward.
      const zf = start + FRICTION / 2 + 2 * i * pitch;
      const zs = zf + pitch;
      this.matrix.makeTranslation(0, 0, -zf * MM);
      view.friction.setMatrixAt(i, this.matrix);
      this.matrix.makeTranslation(0, 0, -zs * MM);
      view.steel.setMatrixAt(i, this.matrix);
    }
    view.friction.instanceMatrix.needsUpdate = true;
    view.steel.instanceMatrix.needsUpdate = true;
  }

  /** The element's letter over its pack, where a canvas can draw it (not in Node). */
  private label(text: string, color: THREE.Color, place: PackPlace): void {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    canvas.width = 64;
    canvas.height = 64;
    ctx.fillStyle = `#${color.getHexString()}`;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#10161d';
    ctx.font = 'bold 38px "Fira Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(24 * MM);
    sprite.position.set(0, (place.rOut + 16) * MM, -place.z * MM);
    sprite.renderOrder = 60;
    sprite.userData.ownOrder = 60;
    sprite.raycast = () => undefined;
    this.mounted.add(sprite);
    this.labels.push(sprite);
    this.disposables.push(texture, material);
  }

  private buildCase(): void {
    const spec = this.box.spec;
    const packs = spec.packs ?? [];
    const outer = Math.max(this.maxRim + 16, ...packs.map((p) => p.rOut + 8));
    const front = -2;
    const back = this.back - 50;
    const solid = this.own(castAluminiumMaterial());
    const glass = this.glass('#bcd9e4', 0.025, 0.34);
    const segments = this.quality === 'low' ? 40 : 72;
    // lathe() takes scene-side z (toward the engine is +), so the depths behind the front face go in negated.
    const geometry = lathe(
      [
        [SHAFT_OUT + 3, -(back + 8)],
        [outer, -(back + 8)],
        [outer + 4, -(back + 4)],
        [outer + 4, -(front - 4)],
        [outer, -front],
        [SHAFT_IN + 3, -front],
      ],
      segments,
    );
    const mesh = tag(new THREE.Mesh(geometry, solid), 'gbx-pl-case');
    mesh.userData.ownOrder = 5;
    mesh.renderOrder = 5;
    this.shells.push({ mesh, solid, glass });
    this.mounted.add(mesh);
    this.explode(mesh, new THREE.Vector3(0, 1, 0), 2.6 * outer);
  }

  // ---- Frame ----

  private placePlanets(set: SetView, planetAngle: number, carrierAngle: number): void {
    for (let c = 0; c < set.angles.length; c++) {
      const a = set.angles[c]!;
      this.at.set(set.radius * Math.sin(a) * MM, set.radius * Math.cos(a) * MM, set.z * MM);
      this.turn.setFromAxisAngle(this.zAxis, -wrap(set.phases[c]! + planetAngle - carrierAngle));
      this.matrix.compose(this.at, this.turn, this.one);
      set.planets.setMatrixAt(c, this.matrix);
    }
    set.planets.instanceMatrix.needsUpdate = true;
  }

  update(frame: PlanetaryFrame): void {
    for (const m of this.members) m.spin.rotation.z = -wrap(frame.angles[m.index] ?? 0);
    const index = (id: string) => this.box.members.indexOf(id);
    for (const set of this.sets) this.placePlanets(set, frame.angles[index(set.planetMember)] ?? 0, frame.angles[index(set.carrier)] ?? 0);
    for (const [id, material] of this.gearMaterials) {
      let glow = 0;
      for (const j of this.gearMeshes.get(id)!) glow = Math.max(glow, frame.meshPower[j] ?? 0);
      this.setGlow(material, glow);
    }
    for (const view of this.packs) {
      const target = frame.closed.has(view.place.element) ? 0 : 1;
      if (Math.abs(view.open - target) > 1e-3) {
        view.open += (target - view.open) * 0.35;
        if (Math.abs(view.open - target) < 0.02) view.open = target;
        this.layPack(view);
      }
      view.material.emissiveIntensity = 0.75 * (1 - view.open);
    }
  }

  setView(view: ViewMode): void {
    super.setView(view);
    for (const label of this.labels) label.visible = view !== 'solid';
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    super.dispose();
  }

  // ---- For tests and the page ----

  /** The packs' openness, 0 closed to 1 open, by element. */
  packOpenness(): Record<string, number> {
    return Object.fromEntries(this.packs.map((p) => [p.place.element, p.open]));
  }

  /** World positions of a set's planet centres after the last update, for tests. */
  planetCentres(k: number): THREE.Vector3[] {
    const set = this.sets[k - 1]!;
    this.group.updateMatrixWorld(true);
    return set.angles.map((_, c) => {
      set.planets.getMatrixAt(c, this.matrix);
      return new THREE.Vector3().setFromMatrixPosition(this.matrix).applyMatrix4(set.planets.matrixWorld);
    });
  }

  gearMesh(id: string): THREE.Mesh | undefined {
    let found: THREE.Mesh | undefined;
    this.group.traverse((o) => {
      if (!found && (o as THREE.Mesh).isMesh && o.userData.gear === id) found = o as THREE.Mesh;
    });
    return found;
  }
}
