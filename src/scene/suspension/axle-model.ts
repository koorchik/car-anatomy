// One axle of a car in 3D (stage P7-geom). `AxleModel` is what a chassis holds of an axle, whatever the axle is: the
// independent axle here, the twist beam (stage 6a) and the solid axles (stage 6b) build their own on the same type.
//
// The independent axle is two corners (CornerModel) of the same resolved corner, the right one mirrored across the
// car's centre line (a group with scale x = −1, scene x being ISO y), plus what joins them: the subframe the lower
// links hang from, a tower round each top mount, the anti-roll bar with its two links, and on a steered axle the
// whole rack in its housing with a boot at each end. The corners leave out their own road, body pieces and rack end.
// Scene = (y, z, x)·10 of the axle's own frame (origin on the road under the middle of the axle), like a corner's.
//
// The subframe, the towers, the bar and the rack are typical drawing: the hardpoints say where links meet the body,
// not what the body or the bar look like (docs/suspension-model.md, the chassis section). The bar's ends turn about its
// torsion section to keep each link its length, so the links never stretch as a steered strut turns them.
//
// Implements the shell's SceneModel<AxleFrame> structurally (whole-car plan, the Stage section) until O2b adds the type.

import * as THREE from 'three';
import { markDamaged, tag, type ViewMode } from '../model-types.ts';
import { merge } from '../geometry.ts';
import { glassMaterial } from '../materials.ts';
import type { PartInfo } from '../parts-info.ts';
import type { ResolvedCorner } from '../../suspension/setup.ts';
import type { AxleSpec, Vec3 } from '../../suspension/spec.ts';
import { CornerModel, cornerFrame, spacedKey, type CornerFrame, type CornerModelOptions } from './corner-model.ts';
import { Bellows, boss, latheAlong, rodBetween, slab, toScene } from './geometry.ts';
import type { RodView } from './link-builder.ts';
import { AXLE_PARTS } from './parts.ts';

/** What an axle shows this frame. */
export interface AxleFrame {
  /** Travel of the left and right wheels relative to the body from design, bump positive, m. */
  travel: [number, number];
  /** Rack displacement along +y (left), m; 0 on an axle that does not steer. */
  rack: number;
  /** Left and right wheels turned forward since the start, rad. */
  spin: [number, number];
}

export const axleFrame = (): AxleFrame => ({ travel: [0, 0], rack: 0, spin: [0, 0] });

/** An axle as a chassis holds it. */
export interface AxleModel {
  readonly group: THREE.Group;
  readonly which: 'front' | 'rear';
  /** Cards of every part key the axle tags; keys are in the axle's space (susp.front.spring). */
  readonly parts: Record<string, PartInfo>;
  update(frame: AxleFrame): void;
  setView(view: ViewMode): void;
  /** 0 = assembled, 1 = fully pulled apart. */
  setExplode(amount: number): void;
  setFailure(part: string | null): void;
  setHighlight(on: boolean): void;
  setGhost(alpha: number): void;
  setRenderBand(base: number): void;
  /** Named points in the axle's frame, scene units: 'left.wheelCentre', 'right.diffOutput', 'left.rackEnd', … */
  anchors(): Record<string, THREE.Vector3>;
  dispose(): void;
}

export interface IndependentAxleOptions {
  which: 'front' | 'rear';
  /** The left corner, resolved; the right is its mirror. */
  corner: ResolvedCorner;
  /** The car's wheel (CornerModelOptions.wheel). */
  wheel?: CornerModelOptions['wheel'];
  antiRollBar: boolean;
}

const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const iso = (x: number, y: number, z: number): THREE.Vector3 => toScene([x, y, z]);

/** Sizes of the drawing, m: typical. */
const BAR = {
  /** Bar diameter on a front and on a rear axle. */
  diameter: { front: 0.024, rear: 0.019 },
  /** How far up the strut from its lower point the link's bracket sits, and how far inboard of the strut's axis. */
  strutUpM: 0.12,
  bracketInM: 0.05,
  /**
   * The link: hanging from a strut it reaches below the lower arm and the halfshaft, so the bar passes under them and
   * the subframe; standing on a link it stays short, under a halfshaft. How far inboard its lower end leans.
   */
  linkM: { strut: 0.3, rod: 0.1 },
  linkInM: 0.02,
  /** Where a link sits on the spring link of a multilink, as a share of its length from the body. */
  onRod: 0.85,
  /** The torsion section: behind the links' lower ends, and this much inboard of them. */
  backM: 0.17,
  inM: 0.12,
  /** Radius of the bends. */
  bendM: 0.05,
};

const RACK = {
  housingR: 0.03,
  barR: 0.012,
  /** The housing stops this far inboard of the inner tie-rod joints. */
  endM: 0.075,
  /** The pinion's boss: its y (the left, a left-hand-drive car), radius and length. */
  pinionY: 0.16,
  pinionR: 0.035,
  pinionM: 0.13,
};

/** The tower round a top mount: radius, how far its wall reaches below and above the mount, the dome over it, m. */
const TOWER = { radiusM: 0.095, belowM: 0.115, aboveM: 0.04, domeM: 0.008 };

/**
 * The top of the body's tower round the left corner's top mount (a strut's, or a coilover's), axle frame, m. Nothing of
 * the axle rises higher, so this is what the body shell must keep under its top (body-shell.ts).
 */
export function towerTop(spec: AxleSpec): { x: number; y: number; z: number; radius: number } {
  const top = spec.linkage.strut ? spec.linkage.strut.top : spec.damper.body;
  return { x: top[0], y: top[1], z: top[2] + TOWER.aboveM + TOWER.domeM, radius: TOWER.radiusM };
}

interface AxleMaterials {
  bar: THREE.MeshStandardMaterial;
  link: THREE.MeshStandardMaterial;
  joint: THREE.MeshStandardMaterial;
  subframe: THREE.MeshStandardMaterial;
  subframeGlass: THREE.MeshStandardMaterial;
  housing: THREE.MeshStandardMaterial;
  housingGlass: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  bootGlass: THREE.MeshStandardMaterial;
  tower: THREE.MeshStandardMaterial;
}

function axleMaterials(): AxleMaterials {
  return {
    bar: new THREE.MeshStandardMaterial({ color: '#2f3236', metalness: 0.55, roughness: 0.45 }),
    link: new THREE.MeshStandardMaterial({ color: '#8d9093', metalness: 0.85, roughness: 0.45 }),
    joint: new THREE.MeshStandardMaterial({ color: '#7b8086', metalness: 0.9, roughness: 0.35 }),
    subframe: new THREE.MeshStandardMaterial({ color: '#3d4146', metalness: 0.6, roughness: 0.5 }),
    subframeGlass: glassMaterial('#9fb8c2', 0.06, 0.4),
    housing: new THREE.MeshStandardMaterial({ color: '#a9abac', metalness: 0.85, roughness: 0.55 }),
    housingGlass: glassMaterial('#bcd9e4', 0.04, 0.42),
    chrome: new THREE.MeshStandardMaterial({ color: '#e4e7ea', metalness: 1, roughness: 0.12 }),
    boot: new THREE.MeshStandardMaterial({ color: '#232427', metalness: 0, roughness: 0.6 }),
    bootGlass: glassMaterial('#5d6670', 0.06, 0.5),
    tower: glassMaterial('#bcd9e4', 0.07, 0.5),
  };
}

/** A mesh with a solid and a glass look; the X-ray takes the glass. */
interface Shell {
  mesh: THREE.Mesh;
  solid: THREE.Material;
  glass: THREE.Material;
}

/** One end of the anti-roll bar: its arm turns about the torsion section's axis to keep its link's length. */
interface BarEnd {
  /** Arm and its link, under the side's group (the right side's is mirrored). */
  arm: THREE.Mesh;
  link: THREE.Mesh;
  /** The link's top on the corner at design, scene, and where it is carried: a point of the carrier, or of a rod. */
  top0: THREE.Vector3;
  seat: { kind: 'carrier' } | { kind: 'rod'; rod: number; along: number };
  /** The bar's end at design and the bend the arm turns about (both on the torsion axis's line along scene x). */
  end0: THREE.Vector3;
  pivot: THREE.Vector3;
  length: number;
  corner: CornerModel;
}

/** Points of the bar's half: the end, the bend, the middle; for the right half the same, mirrored by its group. */
interface BarLayout {
  top: THREE.Vector3;
  end: THREE.Vector3;
  bend: THREE.Vector3;
  middle: THREE.Vector3;
  seat: BarEnd['seat'];
}

/** A polyline with its inner corners rounded off by quadratic arcs of `r`. */
function roundedPath(points: THREE.Vector3[], r: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let from = points[0]!.clone();
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const a = p.clone().addScaledVector(points[i - 1]!.clone().sub(p).normalize(), Math.min(r, p.distanceTo(points[i - 1]!) / 2));
    const b = p.clone().addScaledVector(points[i + 1]!.clone().sub(p).normalize(), Math.min(r, p.distanceTo(points[i + 1]!) / 2));
    path.add(new THREE.LineCurve3(from, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    from = b;
  }
  path.add(new THREE.LineCurve3(from, points[points.length - 1]!.clone()));
  return path;
}

/** An independent axle: two mirrored corners, the subframe, towers, anti-roll bar and rack. */
export class IndependentAxleModel implements AxleModel {
  readonly group = new THREE.Group();
  readonly which: 'front' | 'rear';
  readonly parts: Record<string, PartInfo>;
  readonly left: CornerModel;
  readonly right: CornerModel;
  /** The right side: its corner and its half of the axle's own parts, mirrored. */
  private readonly rightSide = new THREE.Group();
  private readonly leftSide = new THREE.Group();
  private readonly m = axleMaterials();
  private readonly shells: Shell[] = [];
  private readonly subframe: THREE.Group = new THREE.Group();
  private readonly towers: THREE.Group = new THREE.Group();
  private readonly barGroup: THREE.Group = new THREE.Group();
  private readonly ends: BarEnd[] = [];
  private readonly rack: {
    group: THREE.Group;
    housing: THREE.Mesh;
    bar: THREE.Mesh;
    boots: [Bellows, Bellows];
    bootMeshes: THREE.Mesh[];
    /** The left and the right corner's tie rods, found once so update() allocates nothing. */
    ties: [RodView | null, RodView | null];
    /** Scene x of the housing's ends and of the inner joints at design; the rack's y and z. */
    housingEnd: number;
    inner: number;
    y: number;
    z: number;
  } | null;
  private readonly frames: [CornerFrame, CornerFrame] = [cornerFrame(), cornerFrame()];
  private readonly frame = axleFrame();
  private view: ViewMode = 'solid';
  private explode = 0;
  private failures: Array<() => void> = [];
  private highlightUndo: Array<() => void> = [];
  private readonly ghostBase = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>();
  private readonly orders = new Map<THREE.Object3D, number>();
  // Scratch
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly d = new THREE.Vector3();

  constructor(options: IndependentAxleOptions) {
    this.which = options.which;
    const space = options.which;
    const key = (k: string): string => spacedKey(k, space);
    const cornerOptions: CornerModelOptions = { road: false, bodyPieces: false, rackEnd: false, partSpace: space, ...(options.wheel ? { wheel: options.wheel } : {}) };
    this.left = new CornerModel(options.corner, null, cornerOptions);
    this.right = new CornerModel(options.corner, null, cornerOptions);
    for (const c of [this.left, this.right]) c.setOverlays({ forces: false, laser: false });
    this.rightSide.scale.x = -1;
    this.leftSide.add(this.left.group);
    this.rightSide.add(this.right.group);
    this.group.add(this.leftSide, this.rightSide);
    const spec = options.corner.axle.spec;
    const link = spec.linkage;
    const m = this.m;

    // ---- Subframe: a rail along the lower pivots on each side, crossmembers at both ends, a bracket to each pivot ----
    const wheelZ = spec.wheelCentre[2];
    const pivots: Vec3[] = [];
    for (const w of link.wishbones) if (w.ball[2] < wheelZ) pivots.push(w.front, w.rear);
    for (const r of link.rods) if (!r.steer && r.body[2] < wheelZ) pivots.push(r.body);
    const xs = pivots.map((p) => p[0]);
    const x0 = Math.min(...xs) - 0.08;
    const x1 = Math.max(...xs) + 0.08;
    const yr = Math.min(...pivots.map((p) => p[1])) - 0.045;
    // 20 mm under the lowest pivot, so an inner joint's housing above the rail clears it.
    const zr = Math.min(...pivots.map((p) => p[2])) - 0.02;
    const half: THREE.BufferGeometry[] = [slab(iso(x0, yr, zr), iso(x1, yr, zr), UP, 0.6, 0.5)];
    for (const p of pivots) {
      if (Math.abs(p[2] - zr) < 0.03) continue;
      half.push(slab(iso(p[0], p[1] - 0.045, zr - 0.03), iso(p[0], p[1] - 0.045, p[2] + 0.03), X, 0.45, 0.4));
    }
    const across = [x0 + 0.03, x1 - 0.03].map((x) => slab(iso(x, -yr, zr), iso(x, yr, zr), UP, 0.6, 0.5));
    const steer = link.rods.find((r) => r.steer) ?? null;
    if (steer) {
      // A crossmember under the rack and a bracket up to its housing on each side.
      const [rx, , rz] = steer.body;
      const yb = steer.body[1] - RACK.endM - 0.08;
      across.push(slab(iso(rx, -yr, zr), iso(rx, yr, zr), UP, 0.5, 0.4));
      for (const s of [1, -1]) across.push(slab(iso(rx, s * yb, zr), iso(rx, s * yb, rz), X, 0.5, 0.35));
    }
    const halfGeo = merge(half);
    const subLeft = tag(new THREE.Mesh(halfGeo, m.subframe), key('susp.subframe'));
    const subRight = tag(new THREE.Mesh(halfGeo, m.subframe), key('susp.subframe'));
    const subMiddle = tag(new THREE.Mesh(merge(across), m.subframe), key('susp.subframe'));
    this.subframe.add(subMiddle);
    this.addSides(this.subframe, subLeft, subRight);
    for (const mesh of [subLeft, subRight, subMiddle]) this.shells.push({ mesh, solid: m.subframe, glass: m.subframeGlass });

    // ---- Towers round the top mounts: the body the strut or the coilover pushes on ----
    const top = link.strut ? link.strut.top : spec.damper.body;
    const towerGeo = latheAlong(
      [
        [TOWER.radiusM * 10, -TOWER.belowM * 10],
        [TOWER.radiusM * 10, TOWER.aboveM * 10],
        [TOWER.radiusM * 10 - 0.15, (TOWER.aboveM + TOWER.domeM) * 10],
        [0.0001, (TOWER.aboveM + TOWER.domeM) * 10],
      ],
      toScene(top),
      UP,
      32,
    );
    const towerLeft = tag(new THREE.Mesh(towerGeo, m.tower), key('susp.body'));
    const towerRight = tag(new THREE.Mesh(towerGeo, m.tower), key('susp.body'));
    towerLeft.renderOrder = towerRight.renderOrder = 2;
    this.addSides(this.towers, towerLeft, towerRight);

    // ---- Anti-roll bar ----
    if (options.antiRollBar) this.buildBar(this.barLayout(options.corner), options.which, key);

    // ---- Rack ----
    if (steer) {
      const inner = toScene(steer.body);
      const housingEnd = inner.x - RACK.endM * 10;
      const housingGeo = merge([
        latheAlong(
          [
            [0.0001, -housingEnd],
            [RACK.housingR * 10, -housingEnd],
            [RACK.housingR * 10, housingEnd],
            [0.0001, housingEnd],
          ],
          new THREE.Vector3(0, inner.y, inner.z),
          X,
          28,
          true,
        ),
        boss(new THREE.Vector3(RACK.pinionY * 10, inner.y + 0.3, inner.z - 0.2), new THREE.Vector3(0, 0.8, -0.6), RACK.pinionR * 10, RACK.pinionM * 10, 20),
      ]);
      const housing = tag(new THREE.Mesh(housingGeo, m.housing), key('susp.rack'));
      const bar = tag(new THREE.Mesh(rodBetween(new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 0, 0), RACK.barR * 10, 14), m.chrome), key('susp.rack'));
      const boots: [Bellows, Bellows] = [new Bellows(0.3, 0.16, 7, 0.07), new Bellows(0.3, 0.16, 7, 0.07)];
      const bootMeshes = boots.map((b) => {
        const mesh = tag(new THREE.Mesh(b.geometry, m.boot), key('susp.rack'));
        mesh.frustumCulled = false;
        this.shells.push({ mesh, solid: m.boot, glass: m.bootGlass });
        return mesh;
      });
      this.shells.push({ mesh: housing, solid: m.housing, glass: m.housingGlass });
      const group = new THREE.Group();
      group.add(housing, bar, ...bootMeshes);
      this.group.add(group);
      const tie = (c: CornerModel): RodView | null => c.linkSet.rods.find((rod) => rod.tie) ?? null;
      const ties: [RodView | null, RodView | null] = [tie(this.left), tie(this.right)];
      this.rack = { group, housing, bar, boots, bootMeshes, ties, housingEnd, inner: inner.x, y: inner.y, z: inner.z };
    } else {
      this.rack = null;
    }
    this.group.add(this.subframe, this.towers, this.barGroup);

    // ---- Cards: the corners', then the axle's own (the whole rack over a corner's rack end) ----
    this.parts = { ...this.left.parts, ...Object.fromEntries(Object.entries(AXLE_PARTS).map(([k, info]) => [key(k), info])) };
    if (!options.antiRollBar) {
      delete this.parts[key('susp.anti-roll-bar')];
      delete this.parts[key('susp.bar-link')];
    }
    // An axle that does not steer has no rack, and no card for one.
    if (!this.rack) delete this.parts[key('susp.rack')];

    this.group.traverse((o) => {
      if (this.orders.has(o)) return;
      this.orders.set(o, o.renderOrder);
    });
    // Shadows from the solid parts of the axle's own (the corners decide theirs).
    for (const o of [subLeft, subRight, subMiddle, ...this.ends.flatMap((e) => [e.arm, e.link])]) o.castShadow = true;
    if (this.rack) this.rack.housing.castShadow = true;
    this.setView('solid');
    this.update(this.frame);
  }

  /** Adds a part to the left side and its mirror twin to the right side, both under `parent`'s place in the axle. */
  private addSides(parent: THREE.Group, left: THREE.Object3D, right: THREE.Object3D): void {
    const l = new THREE.Group();
    const r = new THREE.Group();
    r.scale.x = -1;
    l.add(left);
    r.add(right);
    parent.add(l, r);
  }

  /**
   * Where the bar's link sits on the left corner and where the bar runs: on a strut, a bracket up the strut tube
   * (the carrier, on a split knuckle), the link hanging down from it; on links, the outer end of the spring link (a
   * multilink's lower rear link), the link standing up from it. The torsion section runs behind the links' ends.
   */
  private barLayout(resolved: ResolvedCorner): BarLayout {
    const spec = resolved.axle.spec;
    const link = spec.linkage;
    let top: THREE.Vector3;
    let seat: BarEnd['seat'];
    let end: THREE.Vector3;
    if (link.strut) {
      const lower = toScene(link.strut.lower);
      const dir = toScene(link.strut.top).sub(lower).normalize();
      top = lower.addScaledVector(dir, BAR.strutUpM * 10);
      top.x -= BAR.bracketInM * 10;
      seat = { kind: 'carrier' };
      end = top.clone().add(new THREE.Vector3(-BAR.linkInM * 10, -BAR.linkM.strut * 10, 0));
    } else {
      const onId = spec.spring.on ?? link.rods.find((r) => !r.steer)?.id;
      const rod = link.rods.findIndex((r) => r.id === onId);
      if (rod < 0) throw new Error('An anti-roll bar on links needs a link to stand on');
      const r = link.rods[rod]!;
      top = toScene(r.body).lerp(toScene(r.knuckle), BAR.onRod);
      seat = { kind: 'rod', rod, along: BAR.onRod };
      end = top.clone().add(new THREE.Vector3(-BAR.linkInM * 10, BAR.linkM.rod * 10, 0));
    }
    const bend = new THREE.Vector3(end.x - BAR.inM * 10, end.y, end.z - BAR.backM * 10);
    const middle = new THREE.Vector3(0, end.y, bend.z);
    return { top, end, bend, middle, seat };
  }

  private buildBar(layout: BarLayout, which: 'front' | 'rear', key: (k: string) => string): void {
    const m = this.m;
    const r = (BAR.diameter[which] / 2) * 10;
    // The torsion section across the car, from bend to bend, and on each side the arm from its bend to its end.
    const middle = tag(new THREE.Mesh(rodBetween(new THREE.Vector3(-layout.bend.x, layout.bend.y, layout.bend.z), layout.bend, r, 14), m.bar), key('susp.anti-roll-bar'));
    middle.castShadow = true;
    this.barGroup.add(middle);
    const inward = new THREE.Vector3(-1, 0, 0);
    const armPath = roundedPath([layout.bend.clone().addScaledVector(inward, BAR.bendM * 10), layout.bend, layout.end], BAR.bendM * 10);
    const armGeo = merge([
      new THREE.TubeGeometry(armPath, 24, r, 12, false),
      // An eye at the end for the link.
      new THREE.SphereGeometry(r * 1.6, 14, 10).translate(layout.end.x, layout.end.y, layout.end.z),
    ]);
    // The arm turns about the torsion axis (scene x through the bend): its geometry is built round the bend.
    armGeo.translate(-layout.bend.x, -layout.bend.y, -layout.bend.z);
    const linkGeo = merge([
      new THREE.CylinderGeometry(0.08, 0.08, 1, 10).translate(0, 0.5, 0),
      new THREE.SphereGeometry(0.17, 12, 8),
      new THREE.SphereGeometry(0.17, 12, 8).translate(0, 1, 0),
    ]);
    const sides: Array<[CornerModel, THREE.Group]> = [
      [this.left, new THREE.Group()],
      [this.right, new THREE.Group()],
    ];
    sides[1]![1].scale.x = -1;
    for (const [corner, side] of sides) {
      const arm = tag(new THREE.Mesh(armGeo, m.bar), key('susp.anti-roll-bar'));
      arm.position.copy(layout.bend);
      const link = tag(new THREE.Mesh(linkGeo, m.link), key('susp.bar-link'));
      side.add(arm, link);
      this.barGroup.add(side);
      this.ends.push({ arm, link, top0: layout.top.clone(), seat: layout.seat, end0: layout.end.clone(), pivot: layout.bend.clone(), length: layout.top.distanceTo(layout.end), corner });
    }
  }

  /** The link's top now (the side's own frame, scene): on the corner's carrier, or on its rod. */
  private linkTop(end: BarEnd, out: THREE.Vector3): THREE.Vector3 {
    const c = end.corner;
    if (end.seat.kind === 'carrier') {
      const carrier = c.carrier ?? c.knuckle;
      carrier.updateMatrix();
      out.copy(end.top0).applyMatrix4(carrier.matrix);
    } else {
      const rod = c.linkSet.rods[end.seat.rod]!;
      out.copy(rod.bodyEnd).lerp(rod.knuckleEnd, end.seat.along);
    }
    return out.add(c.body.position);
  }

  /**
   * Turns the bar's arm about its torsion axis (scene x through the bend) until its end is the link's length from the
   * link's top, and draws the link between them. The end runs on a circle about the axis, so the turn has a closed
   * form: a·cos φ + b·sin φ = k.
   */
  private poseBar(end: BarEnd): void {
    const top = this.linkTop(end, this.v1);
    // The arm's end relative to the pivot in the (y, z) plane of the scene, and the top's.
    const ey = end.end0.y - end.pivot.y;
    const ez = end.end0.z - end.pivot.z;
    const ex = end.end0.x - end.pivot.x;
    const ty = top.y - end.pivot.y;
    const tz = top.z - end.pivot.z;
    const tx = top.x - end.pivot.x;
    // |t − R(φ)e|² = L²  →  (ty·ey + tz·ez)·cos φ + (tz·ey − ty·ez)·sin φ = (|t|² + |e|² − L²) / 2
    const a = ty * ey + tz * ez;
    const b = tz * ey - ty * ez;
    const k = (tx * tx + ty * ty + tz * tz + ex * ex + ey * ey + ez * ez - end.length * end.length) / 2 - tx * ex;
    const rr = Math.sqrt(a * a + b * b);
    const base = Math.atan2(b, a);
    const c = Math.min(1, Math.max(-1, k / rr));
    // The root nearer zero turn.
    const d = Math.acos(c);
    const p1 = base + d;
    const p2 = base - d;
    const wrap = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));
    const phi = Math.abs(wrap(p1)) < Math.abs(wrap(p2)) ? wrap(p1) : wrap(p2);
    end.arm.rotation.x = phi;
    // The end now: rotate (ey, ez) by φ about x (scene y up, z forward: rotation.x turns y toward z).
    const cy = Math.cos(phi);
    const sy = Math.sin(phi);
    const now = this.v2.set(end.pivot.x + ex, end.pivot.y + ey * cy - ez * sy, end.pivot.z + ey * sy + ez * cy);
    // The link: a unit cylinder up its local y, from the bar's end to the top.
    const dir = this.d.copy(top).sub(now);
    const len = dir.length();
    end.link.position.copy(now);
    end.link.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
    end.link.scale.set(1, len, 1);
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
    // The right corner is the left one mirrored: the rack moving left moves its inner joint inboard.
    for (let i = 0; i < 2; i++) {
      const cf = this.frames[i]!;
      cf.travel = f.travel[i]!;
      cf.rack = i === 0 ? f.rack : -f.rack;
      cf.spin = f.spin[i]!;
      cf.roadLift = 0;
      cf.bodyZ = 0;
      (i === 0 ? this.left : this.right).update(cf);
    }
    const e = this.explode;
    if (this.rack) {
      const r = this.rack;
      // Bar from joint to joint, moved along with the rack; boots from the housing's ends to the tie rods.
      r.bar.position.set(f.rack * 10, r.y, r.z);
      r.bar.scale.set(2 * r.inner, 1, 1);
      r.group.position.set(0, -e * 1.2, e * 1.5);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? 1 : -1;
        const tie = r.ties[i];
        if (!tie) continue;
        // The tie rod in the axle's frame: the right corner's mirrored back.
        const a = this.v1.copy(tie.bodyEnd);
        const b = this.v2.copy(tie.knuckleEnd);
        a.x *= s;
        b.x *= s;
        const dir = this.d.copy(b).sub(a).normalize();
        // Both ends in the rack's group, which the explode moves away from the tie rods.
        const to = a.addScaledVector(dir, 0.45).sub(r.group.position);
        const from = this.v3.set(s * r.housingEnd, r.y, r.z);
        r.boots[i]!.update(from, i === 0 ? X : this.v2.set(-1, 0, 0), to, dir);
      }
    }
    for (const end of this.ends) this.poseBar(end);
    this.subframe.position.y = -e * 1.5;
    this.barGroup.position.y = -e * 2.4;
    this.towers.position.y = e * 6;
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.left.setView(view);
    this.right.setView(view);
    const mech = view === 'mechanism';
    for (const s of this.shells) {
      s.mesh.material = view === 'xray' ? s.glass : s.solid;
      s.mesh.castShadow = view === 'solid' && !s.solid.transparent;
    }
    this.subframe.visible = !mech;
    this.towers.visible = !mech;
    if (this.rack) {
      this.rack.housing.visible = !mech;
      for (const b of this.rack.bootMeshes) b.visible = !mech;
    }
  }

  setExplode(amount: number): void {
    this.explode = Math.min(1, Math.max(0, amount));
    this.left.setExplode(this.explode);
    this.right.setExplode(this.explode);
    this.update(this.frame);
  }

  /** The axle's own meshes (not the corners'). */
  private ownMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const g of [this.subframe, this.towers, this.barGroup, ...(this.rack ? [this.rack.group] : [])]) {
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
      });
    }
    return out;
  }

  setFailure(part: string | null): void {
    for (const undo of this.failures) undo();
    this.failures = [];
    this.left.setFailure(part);
    this.right.setFailure(part);
    if (!part) return;
    const seen = new Set<THREE.Material>();
    for (const mesh of this.ownMeshes()) {
      if (mesh.userData.part !== part) continue;
      const looks = [mesh.material as THREE.Material, ...this.shells.filter((s) => s.mesh === mesh).flatMap((s) => [s.solid, s.glass])];
      for (const mat of looks) {
        if (seen.has(mat) || !(mat instanceof THREE.MeshStandardMaterial)) continue;
        seen.add(mat);
        this.failures.push(markDamaged(mat));
      }
    }
  }

  setHighlight(on: boolean): void {
    this.left.setHighlight(on);
    this.right.setHighlight(on);
    for (const undo of this.highlightUndo) undo();
    this.highlightUndo = [];
    if (!on) return;
    for (const mat of Object.values(this.m)) {
      const before = mat.emissive.clone();
      const intensity = mat.emissiveIntensity;
      mat.emissive.set('#ffb35c');
      mat.emissiveIntensity = 0.28;
      this.highlightUndo.push(() => {
        mat.emissive.copy(before);
        mat.emissiveIntensity = intensity;
      });
    }
  }

  setGhost(alpha: number): void {
    const a = Math.min(1, Math.max(0, alpha));
    this.left.setGhost(a);
    this.right.setGhost(a);
    for (const mat of Object.values(this.m)) {
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
    this.left.setRenderBand(base);
    this.right.setRenderBand(base);
    for (const [o, order] of this.orders) if (!this.isCornerObject(o)) o.renderOrder = order + base;
  }

  private isCornerObject(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === this.left.group || p === this.right.group) return true;
    return false;
  }

  anchors(): Record<string, THREE.Vector3> {
    const out: Record<string, THREE.Vector3> = {};
    for (const [k, v] of Object.entries(this.left.anchors())) out[`left.${k}`] = v;
    for (const [k, v] of Object.entries(this.right.anchors())) out[`right.${k}`] = v.setX(-v.x);
    return out;
  }

  /** The view shown now. */
  get viewMode(): ViewMode {
    return this.view;
  }

  dispose(): void {
    this.left.dispose();
    this.right.dispose();
    const seen = new Set<THREE.BufferGeometry>();
    for (const mesh of this.ownMeshes()) {
      if (seen.has(mesh.geometry)) continue;
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    for (const mat of Object.values(this.m)) mat.dispose();
  }
}
