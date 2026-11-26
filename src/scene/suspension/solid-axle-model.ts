// A solid axle in 3D (stage P6b): a live axle (the differential in the housing) or a de Dion tube (the differential on
// the body, half-shafts to the hubs), held by trailing links, a Panhard rod, Watt's linkage or two leaf springs. It is
// an AxleModel (axle-model.ts), so a chassis holds it as it holds an independent axle.
//
// Every frame the axle's pose is solved by the solid axle's own solver (solid-kinematics.ts, warm from the last frame)
// at the travels the frame asks for. The housing (or tube) with both wheels, brakes, link brackets and seats is one rigid
// group posed by that solution; each rod points from its body end to its axle end; a Watt rocker turns on its pivot by
// the solver's own turn ψ; each leaf is a band bent through its front eye, the clamp on the axle and the eye on its
// shackle, rewritten in place, so its deflection shows; a coil and a damper stand between the axle and the body.
//
// A set with more rods than freedoms (four parallel links and a Panhard rod) cannot roll without stretching a rod; the
// solver finds the least stretch, and the bushes of each rod turn from rubber black to red with that rod's stretch
// (BIND_FULL_M for full red). The stretch itself is far below a pixel, so the rods are drawn at their own length.
//
// Sizes not in the hardpoints (tube and housing radii, the leaf's section, the floor the brackets hang from) are
// typical drawing, an estimate (docs/suspension-model.md, the solid axles' pages). Scene = (y, z, x)·10 of the axle's
// own frame (origin on the road under the middle of the axle), like a corner's.

import * as THREE from 'three';
import { markDamaged, tag, type ViewMode } from '../model-types.ts';
import { HIGHLIGHT } from '../palette.ts';
import { merge } from '../geometry.ts';
import { glassMaterial } from '../materials.ts';
import type { PartInfo } from '../parts-info.ts';
import { SolidAxle } from '../../suspension/solid-kinematics.ts';
import { LEAF_LINK_SHARE } from '../../suspension/solve-axle.ts';
import type { AxleSpec, SolidAxleLinkage, Vec3 } from '../../suspension/spec.ts';
import { mirrorY } from '../../suspension/vec.ts';
import { axleFrame, type AxleFrame, type AxleModel } from './axle-model.ts';
import { spacedKey } from './corner-model.ts';
import { DRAWING, springWireM } from './drawing.ts';
import { boss, CoilSpring, lathe, latheAlong, ringProfile, rodBetween, slab, toScene, tyreProfile } from './geometry.ts';
import { linkGeometry } from './link-builder.ts';
import { SPRING_COLOR } from './materials.ts';
import { solidAxleParts } from './solid-parts.ts';
import { caliperGeometry, discGeometry, wheelGeometry } from './wheel-geometry.ts';

/** A rod's stretch that turns its bushes fully red, m: half a millimetre of rubber squeezed along the rod. */
export const BIND_FULL_M = 0.0005;

export interface SolidAxleModelOptions {
  which: 'front' | 'rear';
  spec: AxleSpec<SolidAxleLinkage>;
  /** Wheel: rim radius and width, tyre section width, m. The tyre is drawn at the loaded radius (the wheel centre's
   *  height), so it stands on the road without the pressed tyre of a corner. */
  wheel: { rimRadiusM: number; rimWidthM: number; tyreWidthM: number };
  /** A space put into every part key (corner-model.ts' partSpace), or none on a page of its own. */
  partSpace?: string;
}

const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Drawing sizes, m: typical. */
const SIZE = {
  housingR: 0.038,
  tubeR: 0.034,
  /** Differential: the round case, its cover, the pinion nose ahead of it. */
  diffR: 0.12,
  noseR: 0.05,
  noseM: 0.16,
  /** A de Dion tube bows back this far behind the differential, from this far in from the hubs. */
  bowBackM: 0.17,
  bowInM: 0.2,
  bushR: 0.016,
  bushM: 0.05,
  bracketM: 0.03,
  leafWidthM: 0.06,
  leafThickM: 0.008,
  /** Leaves under the main one and how much shorter each is (share of the main leaf's length from each end). */
  leaves: 3,
  leafStep: 0.14,
  eyeR: 0.022,
  /** Glass floor over the axle: this far over the highest body point, this thick. */
  floorGapM: 0.03,
  floorM: 0.012,
  shaftR: 0.013,
  jointR: 0.035,
  damperR: 0.022,
  damperRodR: 0.009,
  coilR: 0.055,
} as const;

interface Materials {
  housing: THREE.MeshStandardMaterial;
  housingGlass: THREE.MeshStandardMaterial;
  link: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  spring: THREE.MeshStandardMaterial;
  damper: THREE.MeshStandardMaterial;
  damperGlass: THREE.MeshStandardMaterial;
  body: THREE.MeshStandardMaterial;
  bodyXray: THREE.MeshStandardMaterial;
  wheel: THREE.MeshStandardMaterial;
  wheelGlass: THREE.MeshStandardMaterial;
  tyre: THREE.MeshStandardMaterial;
  tyreGlass: THREE.MeshStandardMaterial;
  disc: THREE.MeshStandardMaterial;
  caliper: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
}

function materials(): Materials {
  return {
    housing: new THREE.MeshStandardMaterial({ color: '#7d8186', metalness: 0.75, roughness: 0.55 }),
    housingGlass: glassMaterial('#bcd9e4', 0.05, 0.42),
    link: new THREE.MeshStandardMaterial({ color: '#2f3236', metalness: 0.55, roughness: 0.5 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3a3d41', metalness: 0.6, roughness: 0.45 }),
    steel: new THREE.MeshStandardMaterial({ color: '#8d9093', metalness: 0.85, roughness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e4e7ea', metalness: 1, roughness: 0.12 }),
    spring: new THREE.MeshStandardMaterial({ color: SPRING_COLOR, metalness: 0.35, roughness: 0.42 }),
    damper: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.6, roughness: 0.45 }),
    damperGlass: glassMaterial('#bcd9e4', 0.05, 0.42),
    body: glassMaterial('#bcd9e4', 0.07, 0.5),
    bodyXray: glassMaterial('#bcd9e4', 0.03, 0.32),
    wheel: new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 0.9, roughness: 0.3 }),
    wheelGlass: glassMaterial('#d8e3e8', 0.03, 0.38),
    tyre: new THREE.MeshStandardMaterial({ color: '#1e1f21', metalness: 0, roughness: 0.85 }),
    tyreGlass: glassMaterial('#4a5056', 0.04, 0.45),
    disc: new THREE.MeshStandardMaterial({ color: '#8d9093', metalness: 0.8, roughness: 0.5 }),
    caliper: new THREE.MeshStandardMaterial({ color: '#6b6f74', metalness: 0.7, roughness: 0.55 }),
    boot: new THREE.MeshStandardMaterial({ color: '#232427', metalness: 0, roughness: 0.6 }),
  };
}

/** Rubber of a bush at rest, and the red it turns to at BIND_FULL_M. */
const BUSH_COLOR = new THREE.Color('#2a2b2e');
const BIND_COLOR = new THREE.Color('#e5412f');

/** A rod (trailing link, Panhard rod, Watt rod): a link with an eye at each end and a bush in each eye. */
interface RodPart {
  /** The solver's row name and its index in the solver's rows (−1 if it has none). */
  row: string;
  rowIndex: number;
  object: THREE.Group;
  bushes: THREE.Mesh;
  bush: THREE.MeshStandardMaterial;
  body: THREE.Vector3;
  /** The axle end: a point of the axle (design, ISO), or a Watt rocker end. */
  axle: Vec3 | { watt: 'upper' | 'lower' };
  /** Where it moves when pulled apart: away from the axle, scene units per unit of explode. */
  out: THREE.Vector3;
}

/** One leaf spring: the pack bent through its points, its eyes, its shackle. */
interface LeafPart {
  side: 'left' | 'right';
  pack: LeafBand[];
  front: THREE.Vector3;
  pivot: THREE.Vector3;
  shackle: THREE.Mesh;
  rearEye: THREE.Mesh;
  /** Clamp ends and seat on the axle, design (ISO). */
  A: Vec3;
  B: Vec3;
  seat: Vec3;
  /** The main leaf's line through the front eye, the clamp, the seat and the rear eye; its points rewritten in place. */
  curve: THREE.CatmullRomCurve3;
}

/** Step along a leaf's curve for its tangent, a share of the curve. */
const TANGENT_DU = 1e-3;

/**
 * A band of rectangular section along a curve, rewritten in place: the leaves of a spring. The section is `width` wide
 * across the car (scene x) and `thick` deep, set off `offset` below the curve.
 */
class LeafBand {
  readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly n: number;
  private readonly width: number;
  private readonly thick: number;
  private readonly offset: number;
  /** The share of the curve the band leaves out at each end. */
  private readonly trim: number;

  constructor(samples: number, width: number, thick: number, offset: number, trim: number) {
    this.n = samples;
    this.width = width;
    this.thick = thick;
    this.offset = offset;
    this.trim = trim;
    this.positions = new Float32Array(samples * 4 * 3);
    const index: number[] = [];
    // Corners per sample: 0 top outer, 1 top inner, 2 bottom inner, 3 bottom outer; four faces between samples.
    for (let i = 0; i + 1 < samples; i++) {
      for (let f = 0; f < 4; f++) {
        const a = i * 4 + f;
        const b = i * 4 + ((f + 1) % 4);
        const c = a + 4;
        const d = b + 4;
        index.push(a, c, b, b, c, d);
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
  }

  /** Writes the band along `curve` (scene), its section across scene x; `p`, `t`, `t2` are scratch. */
  update(curve: THREE.Curve<THREE.Vector3>, p: THREE.Vector3, t: THREE.Vector3, t2: THREE.Vector3): void {
    const P = this.positions;
    const half = this.width / 2;
    for (let i = 0; i < this.n; i++) {
      const u = this.trim + ((1 - 2 * this.trim) * i) / (this.n - 1);
      // The tangent by a central difference into scratch: Curve.getTangent makes two vectors on every call.
      curve.getPoint(Math.min(1, u + TANGENT_DU), t);
      curve.getPoint(Math.max(0, u - TANGENT_DU), t2);
      t.sub(t2);
      curve.getPoint(u, p);
      // The section's up: square to the tangent in the side view (scene y, z), pointing up.
      let ny = t.z;
      let nz = -t.y;
      if (ny < 0) {
        ny = -ny;
        nz = -nz;
      }
      const l = Math.hypot(ny, nz) || 1;
      ny /= l;
      nz /= l;
      const top = -this.offset;
      const bottom = top - this.thick;
      // Corners 0 top outer, 1 top inner, 2 bottom inner, 3 bottom outer.
      for (let k = 0; k < 4; k++) {
        const dx = k === 0 || k === 3 ? half : -half;
        const dn = k < 2 ? top : bottom;
        const o = 3 * (i * 4 + k);
        P[o] = p.x + dx;
        P[o + 1] = p.y + ny * dn;
        P[o + 2] = p.z + nz * dn;
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

/** A mesh with a solid and a glass look. */
interface Shell {
  mesh: THREE.Mesh;
  solid: THREE.Material;
  glass: THREE.Material;
}

export class SolidAxleModel implements AxleModel {
  readonly group = new THREE.Group();
  readonly which: 'front' | 'rear';
  readonly parts: Record<string, PartInfo>;
  readonly spec: AxleSpec<SolidAxleLinkage>;
  readonly axle: SolidAxle;
  /** The solved state shown, warm for the next frame. */
  readonly state: Float64Array;
  /** Every row's residual at the state shown (the solver's order), m or rad. */
  readonly residuals: Float64Array;
  private readonly m = materials();
  private readonly key: (k: string) => string;
  /** The rigid axle: housing or tube, wheels, brakes, brackets, seats. Posed by the solved state. */
  private readonly axleGroup = new THREE.Group();
  private readonly wheels: THREE.Group[] = [];
  /** The turning parts of each wheel (tyre, wheel, disc, hub), left then right, turned by the frame's spin. */
  private readonly spinners: THREE.Group[] = [];
  private readonly rods: RodPart[] = [];
  private readonly leaves: LeafPart[] = [];
  private readonly rocker: { mesh: THREE.Mesh; upper: Float64Array; lower: Float64Array } | null = null;
  private readonly coils: Array<{ coil: CoilSpring; mesh: THREE.Mesh; seat: Vec3; top: THREE.Vector3; wire: number }> = [];
  private readonly dampers: Array<{ tube: THREE.Mesh; rod: THREE.Mesh; lower: Vec3; top: THREE.Vector3 }> = [];
  private readonly shafts: Array<{ shaft: THREE.Mesh; inner: THREE.Vector3; outer: Vec3; joint: THREE.Mesh }> = [];
  private readonly floor: THREE.Group = new THREE.Group();
  private readonly shells: Shell[] = [];
  /** Meshes hidden in the mechanism view (wheels, tyres, body, springs and dampers). */
  private readonly notMechanism: THREE.Object3D[] = [];
  private readonly frame = axleFrame();
  private explode = 0;
  private readonly shown: [number, number] = [Number.NaN, Number.NaN];
  /** Whether the pose drawn is stale: the state or the explode changed since. */
  private dirty = true;
  private failures: Array<() => void> = [];
  /** Materials shown as failed: the binding colour leaves their glow alone. */
  private readonly damaged = new Set<THREE.Material>();
  private highlightUndo: Array<() => void> = [];
  private readonly ghostBase = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>();
  private readonly orders = new Map<THREE.Object3D, number>();
  // Scratch
  private readonly p = new Float64Array(3);
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly mat = new THREE.Matrix4();
  private readonly xAxis = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3();
  private readonly tp = new THREE.Vector3();
  private readonly tt = new THREE.Vector3();

  constructor(options: SolidAxleModelOptions) {
    this.which = options.which;
    this.spec = options.spec;
    this.key = (k) => spacedKey(k, options.partSpace);
    const key = this.key;
    const spec = options.spec;
    const link = spec.linkage;
    const m = this.m;
    this.axle = new SolidAxle(spec);
    this.state = this.axle.rest();
    this.residuals = new Float64Array(this.axle.solver.rows.length);
    const deDion = spec.diff === 'body' || link.axlePart === 'susp.de-dion-tube';
    const W = spec.wheelCentre;
    const zW = W[2];
    const half = W[1];

    // ---- The housing or the tube, with its differential (live axle) ----
    const axlePart = key(link.axlePart);
    const tubeR = (deDion ? SIZE.tubeR : SIZE.housingR) * 10;
    const hubIn = half - 0.09;
    const across: THREE.BufferGeometry[] = [];
    if (deDion) {
      // Bowed back behind the differential, which stays on the body.
      const pts = [
        toScene([0, hubIn, zW]),
        toScene([-SIZE.bowBackM * 0.6, half - SIZE.bowInM - 0.06, zW]),
        toScene([-SIZE.bowBackM, half - SIZE.bowInM - 0.2, zW]),
        toScene([-SIZE.bowBackM, -(half - SIZE.bowInM - 0.2), zW]),
        toScene([-SIZE.bowBackM * 0.6, -(half - SIZE.bowInM - 0.06), zW]),
        toScene([0, -hubIn, zW]),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      across.push(new THREE.TubeGeometry(curve, 48, tubeR, 14, false));
    } else {
      across.push(rodBetween(toScene([0, -hubIn, zW]), toScene([0, hubIn, zW]), tubeR, 20));
      // The banjo: the round differential case, its cover behind and the pinion nose ahead.
      across.push(new THREE.SphereGeometry(SIZE.diffR * 10, 28, 20).scale(1, 1, 0.8).translate(0, zW * 10, 0));
      across.push(latheAlong([[0.0001, 0], [SIZE.diffR * 8, 0], [SIZE.diffR * 8, 0.15], [0.0001, 0.2]], toScene([-0.06, 0, zW]), new THREE.Vector3(0, 0, -1), 28, true));
      across.push(latheAlong([[SIZE.noseR * 10, 0], [SIZE.noseR * 10, SIZE.noseM * 6], [SIZE.noseR * 7, SIZE.noseM * 10], [0.0001, SIZE.noseM * 10]], toScene([0.06, 0, zW]), FORWARD, 20));
    }
    // Hub ends: a flange at each end of the tube.
    for (const s of [1, -1]) across.push(boss(toScene([0, s * hubIn, zW]), X, tubeR * 1.5, 0.25, 20));
    const housing = tag(new THREE.Mesh(merge(across), m.housing), axlePart);
    housing.castShadow = true;
    this.axleGroup.add(housing);
    this.shells.push({ mesh: housing, solid: m.housing, glass: m.housingGlass });

    // ---- Brackets for the rods' axle ends, seats for the coils, the Watt pivot ----
    const brackets: THREE.BufferGeometry[] = [];
    const tubeAt = (p: Vec3): THREE.Vector3 => {
      // Where a bracket at p meets the tube: straight in to the tube's line (a de Dion tube's bow is drawn, not solved).
      const y = p[1];
      if (!deDion) return toScene([0, y, zW]);
      const inBow = Math.abs(y) < half - SIZE.bowInM - 0.06;
      return toScene([inBow ? -SIZE.bowBackM : 0, y, zW]);
    };
    for (const r of link.rods) brackets.push(slab(tubeAt(r.knuckle), toScene(r.knuckle), FORWARD, SIZE.bracketM * 10, SIZE.bracketM * 6));
    if (link.lateral.kind === 'panhard') brackets.push(slab(tubeAt(link.lateral.axle), toScene(link.lateral.axle), FORWARD, SIZE.bracketM * 10, SIZE.bracketM * 6));
    if (link.lateral.kind === 'watt') {
      const pv = link.lateral.spec.pivotOnAxle;
      brackets.push(slab(tubeAt(pv), toScene(pv), UP, SIZE.bracketM * 12, SIZE.bracketM * 6));
      brackets.push(boss(toScene(pv), FORWARD, 0.25, 0.4, 16));
    }
    const springSeat = spec.spring.wheel as Vec3;
    const damperLower = spec.damper.wheel as Vec3;
    const leaf = link.lateral.kind === 'leaf' ? link.lateral.spec : null;
    for (const s of [springSeat, mirrorY(springSeat)]) {
      if (leaf) continue;
      brackets.push(latheAlong([[0.0001, 0], [SIZE.coilR * 13, 0], [SIZE.coilR * 13, 0.08], [0.0001, 0.08]], toScene(s), UP, 24, true));
      brackets.push(slab(tubeAt(s), toScene(s), FORWARD, 0.4, 0.2));
    }
    for (const s of [damperLower, mirrorY(damperLower)]) {
      brackets.push(slab(tubeAt(s), toScene(s), UP, 0.25, 0.2));
      brackets.push(boss(toScene(s), X, 0.18, 0.4, 14));
    }
    if (leaf) {
      // Spring pads and U-bolts at each seat.
      for (const s of [leaf.axleSeat, mirrorY(leaf.axleSeat)]) {
        const at = toScene(s);
        brackets.push(new THREE.BoxGeometry(SIZE.leafWidthM * 14, 0.18, 1.1).translate(at.x, at.y + 0.09, at.z));
        for (const dz of [-0.35, 0.35]) {
          brackets.push(rodBetween(new THREE.Vector3(at.x, at.y - 0.25, at.z + dz), new THREE.Vector3(at.x, zW * 10 + tubeR, at.z + dz), 0.06, 8));
        }
        brackets.push(slab(tubeAt(s), new THREE.Vector3(at.x, at.y + 0.18, at.z), FORWARD, 0.8, 0.25));
      }
    }
    const bracketMesh = tag(new THREE.Mesh(merge(brackets), m.steel), axlePart);
    bracketMesh.castShadow = true;
    this.axleGroup.add(bracketMesh);

    // ---- Wheels with their brakes, on the axle ----
    const rimR = options.wheel.rimRadiusM * 10;
    const rimW = options.wheel.rimWidthM * 10;
    const tyreW = options.wheel.tyreWidthM * 10;
    const face = DRAWING.wheelOffsetM * 10;
    const ringOut = face - DRAWING.hatDepthM * 10;
    const ringIn = ringOut - DRAWING.discThickM * 10;
    const tyreGeo = lathe(tyreProfile(zW * 10, rimR, tyreW, rimW), 96).rotateZ(-Math.PI / 2);
    const wheelGeo = wheelGeometry(rimR, rimW, face);
    const discGeo = discGeometry(face, ringIn, ringOut);
    const caliperGeo = caliperGeometry(ringIn, ringOut, Math.PI - 0.5);
    const hubGeo = merge([
      lathe(ringProfile(0.12, 0.7, face - 0.19, face - 0.07), 36, true),
      lathe(ringProfile(0.12, 0.34, -0.6, face - 0.19), 28, true),
    ]).rotateZ(-Math.PI / 2);
    for (const s of [1, -1]) {
      const hub = new THREE.Group();
      hub.position.copy(toScene([W[0], s * half, zW]));
      // Hub frame: +X outboard. The right wheel is the left one turned half round, not mirrored.
      if (s < 0) hub.rotation.y = Math.PI;
      const tyre = tag(new THREE.Mesh(tyreGeo, m.tyre), key('susp.tyre'));
      const wheel = tag(new THREE.Mesh(wheelGeo, m.wheel), key('susp.wheel'));
      const disc = tag(new THREE.Mesh(discGeo, m.disc), key('susp.brake-disc'));
      const caliper = tag(new THREE.Mesh(caliperGeo, m.caliper), key('susp.caliper'));
      const hubMesh = tag(new THREE.Mesh(hubGeo, m.steel), key('susp.hub'));
      for (const o of [tyre, wheel, disc, caliper, hubMesh]) o.castShadow = true;
      // The caliper stays on the axle end; the rest turns with the wheel.
      const spin = new THREE.Group();
      spin.add(tyre, wheel, disc, hubMesh);
      hub.add(spin, caliper);
      this.spinners.push(spin);
      this.shells.push({ mesh: tyre, solid: m.tyre, glass: m.tyreGlass }, { mesh: wheel, solid: m.wheel, glass: m.wheelGlass });
      this.notMechanism.push(tyre, wheel, disc, caliper);
      this.wheels.push(hub);
      this.axleGroup.add(hub);
    }
    this.group.add(this.axleGroup);

    // ---- Rods: trailing links, the Panhard rod, Watt's rods ----
    const centre = toScene([W[0], 0, zW]);
    const addRod = (row: string, part: string, body: Vec3, axle: RodPart['axle'], axleAt: Vec3): void => {
      const b = toScene(body);
      const length = b.distanceTo(toScene(axleAt));
      const object = new THREE.Group();
      const rodMesh = tag(new THREE.Mesh(linkGeometry(length), m.link), key(part));
      rodMesh.castShadow = true;
      const bush = new THREE.MeshStandardMaterial({ color: BUSH_COLOR, metalness: 0, roughness: 0.75 });
      const bushes = tag(
        new THREE.Mesh(merge([boss(new THREE.Vector3(), FORWARD, 0.15, 0.44, 16), boss(new THREE.Vector3(0, length, 0), FORWARD, 0.15, 0.44, 16)]), bush),
        key('susp.bush'),
      );
      object.add(rodMesh, bushes);
      this.group.add(object);
      const out = b.clone().add(toScene(axleAt)).multiplyScalar(0.5).sub(centre).setY(0).normalize().multiplyScalar(3);
      this.rods.push({ row, rowIndex: this.axle.solver.rows.indexOf(row), object, bushes, bush, body: b, axle, out });
    };
    for (const r of link.rods) addRod(r.id, r.part, r.body, r.knuckle, r.knuckle);
    if (link.lateral.kind === 'panhard') addRod('panhard', 'susp.panhard-rod', link.lateral.body, link.lateral.axle, link.lateral.axle);
    if (link.lateral.kind === 'watt') {
      const w = link.lateral.spec;
      const h = w.centreLinkM / 2;
      const upperEnd: Vec3 = [w.pivotOnAxle[0], w.pivotOnAxle[1], w.pivotOnAxle[2] + h];
      const lowerEnd: Vec3 = [w.pivotOnAxle[0], w.pivotOnAxle[1], w.pivotOnAxle[2] - h];
      addRod('watt.upper', 'susp.watt-linkage', w.upperBody, { watt: 'upper' }, upperEnd);
      addRod('watt.lower', 'susp.watt-linkage', w.lowerBody, { watt: 'lower' }, lowerEnd);
      const len = w.centreLinkM * 10;
      const rocker = tag(
        new THREE.Mesh(
          merge([
            new THREE.BoxGeometry(0.28, len, 0.16),
            boss(new THREE.Vector3(0, len / 2, 0), FORWARD, 0.2, 0.3, 16),
            boss(new THREE.Vector3(0, -len / 2, 0), FORWARD, 0.2, 0.3, 16),
            boss(new THREE.Vector3(), FORWARD, 0.26, 0.34, 16),
          ]),
          m.steel,
        ),
        key('susp.watt-linkage'),
      );
      rocker.castShadow = true;
      this.group.add(rocker);
      this.rocker = { mesh: rocker, upper: new Float64Array(3), lower: new Float64Array(3) };
    }

    // ---- Leaf springs ----
    if (leaf) {
      for (const side of ['left', 'right'] as const) {
        const mir = (p: Vec3): Vec3 => (side === 'right' ? mirrorY(p) : p);
        const seat = mir(leaf.axleSeat);
        const front = mir(leaf.frontEye);
        const rear = mir(leaf.rearEye);
        const share = 1 - LEAF_LINK_SHARE;
        const A: Vec3 = [seat[0] + (front[0] - seat[0]) * share, seat[1] + (front[1] - seat[1]) * share, seat[2] + (front[2] - seat[2]) * share];
        const B: Vec3 = [seat[0] + (rear[0] - seat[0]) * share, seat[1] + (rear[1] - seat[1]) * share, seat[2] + (rear[2] - seat[2]) * share];
        const pack: LeafBand[] = [];
        for (let i = 0; i < SIZE.leaves; i++) {
          const band = new LeafBand(40, SIZE.leafWidthM * 10, SIZE.leafThickM * 10, i * SIZE.leafThickM * 10, i * SIZE.leafStep);
          const mesh = tag(new THREE.Mesh(band.geometry, m.leaf), key('susp.leaf-spring'));
          mesh.castShadow = true;
          mesh.frustumCulled = false;
          this.group.add(mesh);
          pack.push(band);
        }
        const eyeGeo = boss(new THREE.Vector3(), X, SIZE.eyeR * 10, SIZE.leafWidthM * 12, 16);
        const frontEye = tag(new THREE.Mesh(eyeGeo, m.steel), key('susp.leaf-spring'));
        frontEye.position.copy(toScene(front));
        const rearEye = tag(new THREE.Mesh(eyeGeo, m.steel), key('susp.leaf-spring'));
        const pivot = toScene([rear[0], rear[1], rear[2] + leaf.shackleM]);
        const shackle = tag(
          new THREE.Mesh(
            merge([
              new THREE.BoxGeometry(0.08, 1, 0.22).translate(0.42, -0.5, 0),
              new THREE.BoxGeometry(0.08, 1, 0.22).translate(-0.42, -0.5, 0),
              boss(new THREE.Vector3(), X, 0.12, 0.92, 12),
            ]),
            m.steel,
          ),
          key('susp.leaf-shackle'),
        );
        shackle.position.copy(pivot);
        this.group.add(frontEye, rearEye, shackle);
        const points = [toScene(front), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
        this.leaves.push({ side, pack, front: toScene(front), pivot, shackle, rearEye, A, B, seat, curve });
      }
    }

    // ---- Coils and dampers, between the axle and the body ----
    if (!leaf) {
      const rate = spec.spring.rate;
      const wire = springWireM(rate, SIZE.coilR) * 10;
      for (const s of [1, -1]) {
        const seat: Vec3 = s > 0 ? springSeat : mirrorY(springSeat);
        const top = toScene(s > 0 ? spec.spring.body : mirrorY(spec.spring.body));
        const coil = new CoilSpring(SIZE.coilR * 10, DRAWING.springTurns, DRAWING.springEndTurns);
        const mesh = tag(new THREE.Mesh(coil.geometry, m.spring), key('susp.spring'));
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.coils.push({ coil, mesh, seat, top, wire });
        this.notMechanism.push(mesh);
      }
    }
    for (const s of [1, -1]) {
      const lower: Vec3 = s > 0 ? damperLower : mirrorY(damperLower);
      const top = toScene(s > 0 ? (spec.damper.body as Vec3) : mirrorY(spec.damper.body as Vec3));
      const tube = tag(new THREE.Mesh(new THREE.CylinderGeometry(SIZE.damperR * 10, SIZE.damperR * 10, 1, 16).translate(0, 0.5, 0), m.damper), key('susp.damper'));
      const rod = tag(new THREE.Mesh(new THREE.CylinderGeometry(SIZE.damperRodR * 10, SIZE.damperRodR * 10, 1, 10).translate(0, 0.5, 0), m.chrome), key('susp.damper'));
      tube.castShadow = true;
      this.group.add(tube, rod);
      this.shells.push({ mesh: tube, solid: m.damper, glass: m.damperGlass });
      this.dampers.push({ tube, rod, lower, top });
      this.notMechanism.push(tube, rod);
    }

    // ---- De Dion: the differential on the body and the half-shafts to the hubs on the tube ----
    const shaft = spec.halfshaft;
    if (shaft) {
      const diff = tag(
        new THREE.Mesh(
          merge([
            new THREE.SphereGeometry(SIZE.diffR * 10, 28, 20).scale(1, 0.9, 0.85).translate(0, zW * 10, 0.2),
            latheAlong([[SIZE.noseR * 10, 0], [SIZE.noseR * 10, 1.2], [0.0001, 1.6]], toScene([0.1, 0, zW]), FORWARD, 20),
            boss(toScene([0, 0, zW + SIZE.diffR + 0.04]), UP, 0.3, 0.6, 8),
          ]),
          m.housing,
        ),
        key('susp.differential'),
      );
      diff.castShadow = true;
      this.group.add(diff);
      this.shells.push({ mesh: diff, solid: m.housing, glass: m.housingGlass });
      for (const s of [1, -1]) {
        const inner = toScene(s > 0 ? shaft.diffOutput : mirrorY(shaft.diffOutput));
        const outer: Vec3 = s > 0 ? shaft.outerJoint : mirrorY(shaft.outerJoint);
        const shaftMesh = tag(new THREE.Mesh(new THREE.CylinderGeometry(SIZE.shaftR * 10, SIZE.shaftR * 10, 1, 12).translate(0, 0.5, 0), m.steel), key('susp.halfshaft'));
        const innerJoint = tag(new THREE.Mesh(new THREE.SphereGeometry(SIZE.jointR * 10, 18, 12), m.boot), key('susp.cv-inner'));
        innerJoint.position.copy(inner);
        const outerJoint = tag(new THREE.Mesh(new THREE.SphereGeometry(SIZE.jointR * 10, 18, 12), m.boot), key('susp.cv-outer'));
        this.group.add(shaftMesh, innerJoint, outerJoint);
        this.shafts.push({ shaft: shaftMesh, inner, outer, joint: outerJoint });
      }
    }

    // ---- The body: a glass floor over the axle, a hanger down to each body point ----
    const bodyPoints: Vec3[] = [
      ...link.rods.map((r) => r.body),
      ...(link.lateral.kind === 'panhard' ? [link.lateral.body] : []),
      ...(link.lateral.kind === 'watt' ? [link.lateral.spec.upperBody, link.lateral.spec.lowerBody] : []),
      ...(leaf ? [leaf.frontEye, mirrorY(leaf.frontEye), [leaf.rearEye[0], leaf.rearEye[1], leaf.rearEye[2] + leaf.shackleM] as Vec3, mirrorY([leaf.rearEye[0], leaf.rearEye[1], leaf.rearEye[2] + leaf.shackleM])] : []),
    ];
    const tops: Vec3[] = [spec.damper.body as Vec3, mirrorY(spec.damper.body as Vec3), ...(leaf ? [] : [spec.spring.body, mirrorY(spec.spring.body)])];
    const all = [...bodyPoints, ...tops];
    const floorZ = Math.max(...all.map((p) => p[2])) + SIZE.floorGapM;
    const xs = all.map((p) => p[0]);
    const floorY = half - 0.14;
    const floorGeo: THREE.BufferGeometry[] = [];
    const x0 = Math.min(...xs) - 0.12;
    const x1 = Math.max(...xs) + 0.12;
    floorGeo.push(new THREE.BoxGeometry(floorY * 20, SIZE.floorM * 10, (x1 - x0) * 10).translate(0, (floorZ + SIZE.floorM / 2) * 10, ((x0 + x1) / 2) * 10));
    for (const p of bodyPoints) {
      if (floorZ - p[2] < 0.02) continue;
      const at = toScene(p);
      floorGeo.push(slab(at, new THREE.Vector3(at.x, floorZ * 10, at.z), FORWARD, 0.36, 0.3));
      floorGeo.push(boss(at, FORWARD, 0.2, 0.5, 14));
    }
    // A cup over each coil and each damper's top mount.
    for (const p of tops) floorGeo.push(rodBetween(toScene(p), new THREE.Vector3(p[1] * 10, floorZ * 10, p[0] * 10), (SIZE.coilR + 0.015) * 10, 20));
    const floorMesh = tag(new THREE.Mesh(merge(floorGeo), m.body), key('susp.body'));
    floorMesh.renderOrder = 2;
    this.floor.add(floorMesh);
    this.shells.push({ mesh: floorMesh, solid: m.body, glass: m.bodyXray });
    this.notMechanism.push(this.floor);
    this.group.add(this.floor);

    this.parts = solidAxleParts(spec, key);
    this.group.traverse((o) => {
      if (!this.orders.has(o)) this.orders.set(o, o.renderOrder);
    });
    this.setView('solid');
    this.update(this.frame);
  }

  /** Scene position of an axle point (design, ISO) at the state shown. */
  private axlePoint(a: Vec3, out: THREE.Vector3): THREE.Vector3 {
    this.axle.solver.point(this.state, a, this.p);
    return out.set(this.p[1] * 10, this.p[2] * 10, this.p[0] * 10);
  }

  /** Points a link (built along +Y from the origin) from `from` to `to`, its eyes' axes as near the car's length as it
   *  lets them; `stretch` scales it to reach. */
  private pointLink(object: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, stretch: boolean): void {
    const d = this.d.copy(to).sub(from);
    const len = d.length();
    d.divideScalar(len);
    const ref = Math.abs(d.z) > 0.9 ? UP : FORWARD;
    this.xAxis.crossVectors(d, ref).normalize();
    this.zAxis.crossVectors(this.xAxis, d);
    object.quaternion.setFromRotationMatrix(this.mat.makeBasis(this.xAxis, d, this.zAxis));
    object.position.copy(from);
    if (stretch) object.scale.set(1, len, 1);
  }

  update(frame: AxleFrame): void {
    if (frame !== this.frame) {
      this.frame.travel[0] = frame.travel[0];
      this.frame.travel[1] = frame.travel[1];
      this.frame.rack = frame.rack;
      this.frame.spin[0] = frame.spin[0];
      this.frame.spin[1] = frame.spin[1];
    }
    const f = this.frame;
    if (f.travel[0] !== this.shown[0] || f.travel[1] !== this.shown[1]) {
      this.axle.solve(this.state, f.travel[0], f.travel[1]);
      this.axle.solver.residuals(this.state, this.residuals);
      this.shown[0] = f.travel[0];
      this.shown[1] = f.travel[1];
      this.dirty = true;
    }
    // Wheels turned forward: the right hub is the left one turned half round about the vertical, so its local x points
    // inboard and the same forward turn is the opposite angle.
    this.spinners[0]!.rotation.x = f.spin[0];
    this.spinners[1]!.rotation.x = -f.spin[1];
    if (this.dirty) this.pose();
  }

  /**
   * Shows a state the caller has solved already (the page's rig solves the same axle for its numbers): copies it and
   * draws it, without solving again.
   */
  showState(state: Float64Array): void {
    this.state.set(state);
    this.axle.solver.travels(this.state, this.p);
    this.frame.travel[0] = this.p[0];
    this.frame.travel[1] = this.p[1];
    this.shown[0] = this.p[0];
    this.shown[1] = this.p[1];
    this.axle.solver.residuals(this.state, this.residuals);
    this.pose();
  }

  private pose(): void {
    this.dirty = false;
    const s = this.state;
    const solver = this.axle.solver;
    const e = this.explode;
    // The rigid axle: world = Q·v + pos, with v the design point in scene and Q the state's turn in scene axes.
    const c0 = solver.c0;
    this.q.set(s[4]!, s[5]!, s[3]!, s[6]!);
    this.axleGroup.quaternion.copy(this.q);
    const c = this.v1.set(c0[1] * 10, c0[2] * 10, c0[0] * 10);
    const turned = this.v2.copy(c).applyQuaternion(this.q);
    this.axleGroup.position.set(c.x + s[1]! * 10 - turned.x, c.y + s[2]! * 10 - turned.y, c.z + s[0]! * 10 - turned.z);
    this.axleGroup.position.y -= e * 1.5;
    // Exploded, the wheels come off outward along the axle.
    this.wheels[0]!.position.x = this.spec.wheelCentre[1] * 10 + e * 3.5;
    this.wheels[1]!.position.x = -this.spec.wheelCentre[1] * 10 - e * 3.5;
    const drop = this.v1.set(0, -e * 1.5, 0);

    if (this.rocker) {
      solver.rockerEnd(s, true, this.rocker.upper);
      solver.rockerEnd(s, false, this.rocker.lower);
    }
    for (const r of this.rods) {
      let to: THREE.Vector3;
      if ('watt' in r.axle) {
        const at = r.axle.watt === 'upper' ? this.rocker!.upper : this.rocker!.lower;
        to = this.tp.set(at[1]! * 10, at[2]! * 10, at[0]! * 10);
      } else {
        to = this.axlePoint(r.axle, this.tp);
      }
      to.add(drop);
      this.pointLink(r.object, r.body, to, false);
      r.object.position.addScaledVector(r.out, e);
      const stretch = r.rowIndex >= 0 ? Math.abs(this.residuals[r.rowIndex]!) : 0;
      const k = Math.min(1, stretch / BIND_FULL_M);
      r.bush.color.copy(BUSH_COLOR).lerp(BIND_COLOR, k);
      // A bush shown as failed keeps the failure's glow (setFailure).
      if (!this.damaged.has(r.bush)) r.bush.emissive.copy(BIND_COLOR).multiplyScalar(0.55 * k);
    }
    if (this.rocker) {
      const u = this.rocker.upper;
      const l = this.rocker.lower;
      const a = this.tp.set(u[1]! * 10, u[2]! * 10, u[0]! * 10);
      const b = this.tt.set(l[1]! * 10, l[2]! * 10, l[0]! * 10);
      const mesh = this.rocker.mesh;
      mesh.position.copy(a).add(b).multiplyScalar(0.5).add(drop);
      this.d.copy(a).sub(b).normalize();
      mesh.quaternion.setFromUnitVectors(UP, this.d);
    }

    for (const lf of this.leaves) {
      // The main leaf's top runs through the eyes' centres and over the pad on the seat.
      const pts = lf.curve.points;
      this.axlePoint(lf.A, pts[1]!).add(drop);
      this.axlePoint(lf.seat, pts[2]!).add(drop);
      this.axlePoint(lf.B, pts[3]!).add(drop);
      solver.shackleEnd(s, lf.side, this.p);
      const E = pts[4]!.set(this.p[1] * 10, this.p[2] * 10, this.p[0] * 10);
      for (const band of lf.pack) band.update(lf.curve, this.tp, this.tt, this.v3);
      lf.rearEye.position.copy(E);
      this.d.copy(E).sub(lf.pivot);
      const len = this.d.length();
      lf.shackle.scale.set(1, len, 1);
      lf.shackle.quaternion.setFromUnitVectors(this.v2.set(0, -1, 0), this.d.divideScalar(len));
    }

    for (const cl of this.coils) {
      const seat = this.axlePoint(cl.seat, this.tp).add(drop);
      // The coil is built down from its upper seat along −Y.
      const top = this.tt.copy(cl.top).addScaledVector(UP, e * 2);
      const dir = this.d.copy(seat).sub(top);
      const len = dir.length();
      cl.mesh.position.copy(top);
      cl.mesh.quaternion.setFromUnitVectors(this.v2.set(0, -1, 0), dir.divideScalar(len));
      cl.coil.update(len, cl.wire);
    }
    for (const dm of this.dampers) {
      const lower = this.axlePoint(dm.lower, this.tp).add(drop);
      const top = this.tt.copy(dm.top).addScaledVector(UP, e * 2);
      const dir = this.d.copy(top).sub(lower);
      const len = dir.length();
      dir.divideScalar(len);
      const tubeLen = Math.min(len * 0.62, DRAWING.coiloverLowerSeatM * 10 + 2.2);
      dm.tube.position.copy(lower);
      dm.tube.quaternion.setFromUnitVectors(UP, dir);
      dm.tube.scale.set(1, tubeLen, 1);
      dm.rod.position.copy(lower).addScaledVector(dir, tubeLen);
      dm.rod.quaternion.copy(dm.tube.quaternion);
      dm.rod.scale.set(1, len - tubeLen, 1);
    }
    for (const sh of this.shafts) {
      const outer = this.axlePoint(sh.outer, this.tp).add(drop);
      sh.joint.position.copy(outer);
      this.pointLink(sh.shaft, sh.inner, outer, true);
    }
    this.floor.position.y = e * 4;
  }

  setView(view: ViewMode): void {
    for (const s of this.shells) s.mesh.material = view === 'xray' ? s.glass : s.solid;
    const mech = view === 'mechanism';
    for (const o of this.notMechanism) o.visible = !mech;
    for (const s of this.shells) s.mesh.castShadow = view === 'solid' && !s.solid.transparent;
  }

  setExplode(amount: number): void {
    this.explode = Math.min(1, Math.max(0, amount));
    this.pose();
  }

  private meshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  }

  /** Every material the model owns, the bushes' included. */
  private allMaterials(): THREE.MeshStandardMaterial[] {
    return [...Object.values(this.m), ...this.rods.map((r) => r.bush)];
  }

  setFailure(part: string | null): void {
    for (const undo of this.failures) undo();
    this.failures = [];
    this.damaged.clear();
    // The undo brings back the glow of the moment it was marked; the binding's own is redrawn from the state.
    this.dirty = true;
    if (!part) {
      this.pose();
      return;
    }
    const seen = new Set<THREE.Material>();
    for (const mesh of this.meshes()) {
      if (mesh.userData.part !== part) continue;
      const looks = [mesh.material as THREE.Material, ...this.shells.filter((s) => s.mesh === mesh).flatMap((s) => [s.solid, s.glass])];
      for (const mat of looks) {
        if (seen.has(mat) || !(mat instanceof THREE.MeshStandardMaterial)) continue;
        seen.add(mat);
        this.damaged.add(mat);
        this.failures.push(markDamaged(mat));
      }
    }
  }

  setHighlight(on: boolean): void {
    for (const undo of this.highlightUndo) undo();
    this.highlightUndo = [];
    if (!on) return;
    for (const mat of Object.values(this.m)) {
      const before = mat.emissive.clone();
      const intensity = mat.emissiveIntensity;
      mat.emissive.set(HIGHLIGHT.suspension);
      mat.emissiveIntensity = 0.28;
      this.highlightUndo.push(() => {
        mat.emissive.copy(before);
        mat.emissiveIntensity = intensity;
      });
    }
  }

  setGhost(alpha: number): void {
    const a = Math.min(1, Math.max(0, alpha));
    for (const mat of this.allMaterials()) {
      let base = this.ghostBase.get(mat);
      if (!base) {
        base = { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite };
        this.ghostBase.set(mat, base);
      }
      const ghost = a < 1;
      mat.opacity = base.opacity * a;
      if (mat.transparent !== (ghost || base.transparent)) {
        mat.transparent = ghost || base.transparent;
        mat.needsUpdate = true;
      }
      mat.depthWrite = ghost ? false : base.depthWrite;
    }
  }

  setRenderBand(base: number): void {
    for (const [o, order] of this.orders) o.renderOrder = order + base;
  }

  anchors(): Record<string, THREE.Vector3> {
    const W = this.spec.wheelCentre;
    const out: Record<string, THREE.Vector3> = {
      'left.wheelCentre': this.axlePoint(W, new THREE.Vector3()),
      'right.wheelCentre': this.axlePoint(mirrorY(W), new THREE.Vector3()),
    };
    const shaft = this.spec.halfshaft;
    if (shaft) {
      out['left.diffOutput'] = toScene(shaft.diffOutput);
      out['right.diffOutput'] = toScene(mirrorY(shaft.diffOutput));
    }
    return out;
  }

  dispose(): void {
    const seen = new Set<THREE.BufferGeometry>();
    for (const mesh of this.meshes()) {
      if (seen.has(mesh.geometry)) continue;
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    for (const mat of this.allMaterials()) mat.dispose();
  }
}
