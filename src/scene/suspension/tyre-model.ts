// The tyre scene's wheel (suspensions plan, stage 11): a wheel standing on a glass road, seen from the side and from
// below, with the contact patch painted on the road as the brush model has it. In the X-ray the tyre is cut open to
// show its layers: tread, steel belt, carcass with its cords, bead with the bead wire, sidewall and inner liner; the
// mechanism view keeps only the cords and wires. A radial carcass runs its cords at 90° to the direction of rolling;
// a bias one crosses two plies at about 35° and has no belt. The size comes from the sidewall code (TyreSize), so the
// 3D wheel is the one the decoder describes. Scene units (1 = 100 mm); the wheel's spin axis is +X, the road is y = 0,
// the direction of travel +Z.
//
// A SceneModel<TyreFrame> (model-types.ts). Cards of its parts: tyre-parts.ts.

import * as THREE from 'three';
import type { ContactPatch } from '../../vehicle/tyre-patch.ts';
import { outerDiameterM, type TyreSize } from '../../vehicle/tyre-size.ts';
import { glassMaterial } from '../materials.ts';
import { disposeTree, markDamaged, tag, type SceneModel, type ViewMode } from '../model-types.ts';
import { tyreProfile } from './geometry.ts';
import { paintPatch } from './patch-paint.ts';
import { TYRE_PARTS } from './tyre-parts.ts';
import { wheelGeometry } from './wheel-geometry.ts';

export type Carcass = 'radial' | 'bias';

export interface TyreLook {
  size: TyreSize;
  carcass: Carcass;
}

export interface TyreFrame {
  /** Slip angle, rad: positive turns the wheel's heading to the right of the direction of travel (the tyre's α). */
  alpha: number;
  /** Camber, rad (ISO: negative leans the top towards the car). The wheel is a left one: the car is towards −X. */
  camber: number;
  /** The patch to paint and the tyre's deflection under the load, m. */
  patch: ContactPatch;
}

/** Rim width as a share of the section width: 8.5 in on a 245 mm tyre is 0.88 (our estimate for the drawing). */
const RIM_SHARE = 0.86;
/** Cord angle of a bias carcass from the direction of rolling, deg (suspensions plan: an estimate of 30–40°). */
export const BIAS_CORD_DEG = 35;
/** Steel belt cords from the direction of rolling, deg (drawing only). */
const BELT_CORD_DEG = 22;
/** The cut-away wedge of the X-ray, centred on the front of the wheel, rad. */
const CUT = THREE.MathUtils.degToRad(90);
const SEGMENTS = 72;

// Layer thicknesses, scene units, drawn thicker than life so that each reads in the cut.
const T = { liner: 0.022, carcass: 0.02, belt: 0.035, tread: 0.11, side: 0.05 };

const ROAD_SIZE = 9;

type Pt = [number, number];

/** The carcass line of the section as [radius, axial], from the inboard bead over the crown to the outboard bead. */
function carcassPath(outerR: number, rimR: number, width: number, beadHalf: number, n = 72): Pt[] {
  const wall = outerR - rimR;
  const crownR = outerR - T.tread - T.belt - T.carcass / 2;
  const half = width / 2 - T.side;
  const cr = rimR + wall * 0.5;
  const rr = crownR - cr;
  const e = 2 / 5;
  const upper: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = -Math.PI / 2 + (i / 40) * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    upper.push([cr + rr * Math.sign(c) * Math.abs(c) ** e, half * Math.sign(s) * Math.abs(s) ** e]);
  }
  // Down the sidewall to the bead: a quadratic from the widest point (vertical there) to just above the rim seat.
  const lower = (side: -1 | 1): Pt[] => {
    const pts: Pt[] = [];
    const a: Pt = [rimR + 0.09, side * beadHalf];
    const c: Pt = [rimR + wall * 0.2, side * half];
    const b: Pt = [cr, side * half];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
    return pts;
  };
  const raw = [...lower(-1), ...upper.slice(1, -1), ...lower(1).reverse()];
  return resample(raw, n);
}

/** The same line with points evenly spaced along it. */
function resample(pts: Pt[], n: number): Pt[] {
  const len: number[] = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = len[len.length - 1]!;
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * total;
    while (j < len.length - 2 && len[j + 1]! < s) j++;
    const f = (s - len[j]!) / (len[j + 1]! - len[j]! || 1);
    out.push([pts[j]![0] + (pts[j + 1]![0] - pts[j]![0]) * f, pts[j]![1] + (pts[j + 1]![1] - pts[j]![1]) * f]);
  }
  return out;
}

/** Outward normal of the path at each point (out of the tyre's inside). */
function normals(path: Pt[]): Pt[] {
  return path.map((_, i) => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(path.length - 1, i + 1)]!;
    const tr = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tr, ty) || 1;
    return [ty / l, -tr / l];
  });
}

/** A closed section between two offsets of the path, over the share [u0, u1] of it. */
function band(path: Pt[], nrm: Pt[], u0: number, u1: number, inner: number, outer: number | ((u: number) => number)): Pt[] {
  const i0 = Math.round(u0 * (path.length - 1));
  const i1 = Math.round(u1 * (path.length - 1));
  const out: Pt[] = [];
  const at = (i: number, d: number): Pt => [path[i]![0] + nrm[i]![0] * d, path[i]![1] + nrm[i]![1] * d];
  for (let i = i0; i <= i1; i++) out.push(at(i, typeof outer === 'number' ? outer : outer(i / (path.length - 1))));
  for (let i = i1; i >= i0; i--) out.push(at(i, inner));
  return out;
}

/**
 * A section turned about the lathe axis (+Y, later the spin axis) over [phiStart, phiStart + phiLength], with the two
 * cut faces capped when it is not a full turn. Points are [radius, axial].
 */
function turned(section: Pt[], phiStart: number, phiLength: number, segments = SEGMENTS): THREE.BufferGeometry {
  const pts = section.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const closed = [...pts, pts[0]!];
  const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(closed, segments, phiStart, phiLength)];
  if (phiLength < Math.PI * 2 - 1e-6) {
    for (const phi of [phiStart, phiStart + phiLength]) {
      const cap = new THREE.ShapeGeometry(new THREE.Shape(pts));
      // The shape lies in the lathe's meridian plane at φ = π/2 (+X); turn it to φ.
      cap.rotateY(phi - Math.PI / 2);
      parts.push(cap);
    }
  }
  const merged = mergeLoose(parts);
  merged.computeVertexNormals();
  // Lathe +Y onto the spin axis +X; the meridian at φ then points to (0, −sin φ, cos φ): φ = 0 is the front.
  return merged.rotateZ(-Math.PI / 2);
}

/** Merges geometries keeping only positions (and indices), whatever attributes each had. */
function mergeLoose(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (const g of parts) {
    const geo = g;
    const pos = geo.getAttribute('position');
    const base = positions.length / 3;
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (geo.index) for (let i = 0; i < geo.index.count; i++) index.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) index.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setIndex(index);
  return out;
}

/**
 * Cords on the carcass (or the belt) between path points i0 and i1: each starts at φ0 and turns round the axis as it
 * goes up the section so that it runs at `angleDeg` from the direction of rolling (90° = straight across, radial).
 * Two plies cross with ±angle. Only cords that start inside [phiMin, phiMax] are drawn.
 */
function cords(path: Pt[], nrm: Pt[], offset: number, i0: number, i1: number, angleDeg: number, plies: 1 | 2, pitch: number, phiMin: number, phiMax: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const cot = 1 / Math.tan(THREE.MathUtils.degToRad(angleDeg));
  for (let ply = 0; ply < plies; ply++) {
    const sign = ply === 0 ? 1 : -1;
    const d = offset + ply * 0.008;
    for (let phi0 = phiMin; phi0 <= phiMax; phi0 += pitch) {
      let phi = phi0;
      let prev: THREE.Vector3 | null = null;
      for (let i = i0; i <= i1; i++) {
        const r = path[i]![0] + nrm[i]![0] * d;
        const y = path[i]![1] + nrm[i]![1] * d;
        if (i > i0) {
          const ds = Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
          phi += (sign * ds * cot) / r;
        }
        if (phi < phiMin || phi > phiMax) {
          prev = null;
          continue;
        }
        const p = new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
        if (prev) positions.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g.rotateZ(-Math.PI / 2);
}

interface Layer {
  key: string;
  /** The layer cut open, or its cords: shown in the X-ray (and the mechanism view for cords, wires and beads). */
  cut: THREE.Object3D;
  /** Where it goes when the tyre is taken apart, along the spin axis, scene units. */
  explode: number;
}

export class TyreModel implements SceneModel<TyreFrame> {
  readonly group = new THREE.Group();
  readonly parts = TYRE_PARTS;
  /** Turns with the slip angle and leans with the camber, on the road; the wheel's centre at its loaded height. */
  private readonly pivot = new THREE.Group();
  /** The wheel's own frame at its centre, spin axis +X. */
  private readonly wheelFrame = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private readonly solid: THREE.Object3D[] = [];
  private readonly layers: Layer[] = [];
  private readonly wires: THREE.Object3D[] = [];
  private readonly rim: THREE.Mesh;
  private readonly rimSolid: THREE.MeshStandardMaterial;
  private readonly rimGlass: THREE.MeshStandardMaterial;
  private readonly patchMesh: THREE.Mesh;
  private readonly patchCanvas: HTMLCanvasElement;
  private readonly patchTexture: THREE.CanvasTexture;
  private readonly gridTexture: THREE.CanvasTexture;
  private readonly heading: THREE.Line;
  private view: ViewMode = 'solid';
  private explode = 0;
  private outerR = 3;
  private look: TyreLook;
  private frame: TyreFrame | null = null;
  private failures: Array<() => void> = [];
  private built: THREE.Object3D[] = [];
  private lastPatchKey = '';
  private readonly eye = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();

  constructor(look: TyreLook) {
    this.look = look;
    this.group.add(this.pivot);
    this.pivot.add(this.wheelFrame);

    // The road: dark glass with a grid of 100 mm, so the patch shows from below as well as from above.
    const grid = document.createElement('canvas');
    grid.width = grid.height = 256;
    const g = grid.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#7a8d94';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
    const gridTex = (this.gridTexture = new THREE.CanvasTexture(grid));
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(ROAD_SIZE, ROAD_SIZE);
    gridTex.colorSpace = THREE.SRGBColorSpace;
    const roadMat = new THREE.MeshStandardMaterial({ color: '#25363c', map: gridTex, transparent: true, opacity: 0.55, roughness: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.materials.push(roadMat);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_SIZE, ROAD_SIZE), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.renderOrder = 1;
    this.group.add(road);

    // The direction of travel (white, fixed) and the wheel's heading (yellow, turns with the slip angle).
    const lineMat = (color: string): THREE.LineBasicMaterial => {
      const m = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
      this.materials.push(m);
      return m;
    };
    const travel = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.01, -4.2), new THREE.Vector3(0, 0.01, 4.2)]), lineMat('#f1efe6'));
    travel.renderOrder = 4;
    this.group.add(travel);
    this.heading = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.012, -3.8), new THREE.Vector3(0, 0.012, 3.8)]), lineMat('#ffd166'));
    this.heading.renderOrder = 4;
    this.group.add(this.heading);

    // The patch, painted on the road under the wheel; it turns with the heading but does not lean.
    this.patchCanvas = document.createElement('canvas');
    this.patchCanvas.width = 512;
    this.patchCanvas.height = 256;
    this.patchTexture = new THREE.CanvasTexture(this.patchCanvas);
    this.patchTexture.colorSpace = THREE.SRGBColorSpace;
    const patchMat = new THREE.MeshBasicMaterial({ map: this.patchTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.materials.push(patchMat);
    this.patchMesh = tag(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), patchMat), 'susp.contact-patch');
    this.patchMesh.rotation.x = -Math.PI / 2;
    this.patchMesh.position.y = 0.015;
    this.patchMesh.renderOrder = 3;
    // Seen from below the road, the patch lies in front of the tyre, whose drawn bottom dips through the road by the
    // deflection: it is drawn over it then. From above, the tyre hides it as it should.
    this.patchMesh.onBeforeRender = (_r, _s, camera) => {
      patchMat.depthTest = camera.getWorldPosition(this.eye).y > this.group.getWorldPosition(this.origin).y;
    };
    this.group.add(this.patchMesh);

    this.rimSolid = new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 0.9, roughness: 0.3 });
    // In the X-ray the wheel is glass, so the layers of the cut read through it.
    this.rimGlass = glassMaterial('#d8e3e8', 0.03, 0.3);
    this.materials.push(this.rimSolid, this.rimGlass);
    this.rim = tag(new THREE.Mesh(new THREE.BufferGeometry(), this.rimSolid), 'susp.wheel');
    this.rim.castShadow = true;
    this.wheelFrame.add(this.rim);
    this.build();
    this.setView('solid');
  }

  /** The tyre's outer radius, m, as the sidewall code gives it. */
  get outerRadiusM(): number {
    return this.outerR / 10;
  }

  /** A new size or carcass: the wheel is built again. */
  setLook(look: TyreLook): void {
    if (look.size.widthMm === this.look.size.widthMm && look.size.aspect === this.look.size.aspect && look.size.rimIn === this.look.size.rimIn && look.carcass === this.look.carcass) return;
    this.look = look;
    this.build();
    this.setView(this.view);
    if (this.frame) this.update(this.frame);
  }

  private build(): void {
    for (const o of this.built) {
      o.removeFromParent();
      disposeTree(o);
    }
    this.built = [];
    this.solid.length = 0;
    this.layers.length = 0;
    this.wires.length = 0;
    // Materials made by a build belong to its meshes and go with them (disposeTree); this.materials are the
    // constructor's.

    const { size, carcass } = this.look;
    const outerR = (outerDiameterM(size) / 2) * 10;
    const rimR = ((size.rimIn * 25.4) / 2000) * 10;
    const width = size.widthMm / 100;
    const rimW = width * RIM_SHARE;
    const beadHalf = rimW / 2 - 0.02;
    this.outerR = outerR;
    this.rim.geometry.dispose();
    this.rim.geometry = wheelGeometry(rimR, rimW, Math.min(0.35, rimW / 2 - 0.15));

    const add = (o: THREE.Object3D): void => {
      this.wheelFrame.add(o);
      this.built.push(o);
    };
    // The whole tyre for the solid view.
    const rubber = new THREE.MeshStandardMaterial({ color: '#1e1f21', metalness: 0, roughness: 0.82, side: THREE.DoubleSide });
    const tyre = tag(new THREE.Mesh(turned(tyreProfile(outerR, rimR, width, rimW).reverse(), 0, Math.PI * 2, 120), rubber), 'susp.tyre');
    tyre.castShadow = true;
    add(tyre);
    this.solid.push(tyre);

    // The layers, cut open at the front.
    const path = carcassPath(outerR, rimR, width, beadHalf);
    const nrm = normals(path);
    const phiStart = CUT / 2;
    const phiLength = Math.PI * 2 - CUT;
    const layer = (key: string, section: Pt[], material: THREE.Material, explode: number): void => {
      const mesh = tag(new THREE.Mesh(turned(section, phiStart, phiLength), material), key);
      add(mesh);
      this.layers.push({ key, cut: mesh, explode });
    };
    // Each layer its own colour, a little self-lit so the thin ones read in the cut.
    const lined = (color: string, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.18 });
    const half = T.carcass / 2;
    layer('susp.tyre-liner', band(path, nrm, 0.02, 0.98, -half - T.liner, -half), lined('#8a5a44'), -2.4);
    layer('susp.tyre-carcass', band(path, nrm, 0, 1, -half, half), lined('#e0c27a', 0.7), -0.8);
    const crown0 = 0.3;
    const crown1 = 0.7;
    if (carcass === 'radial') layer('susp.tyre-belt', band(path, nrm, crown0 + 0.02, crown1 - 0.02, half, half + T.belt), lined('#b9c2c8', 0.35, 0.7), 0.8);
    // Tread over the crown, thinning into the shoulders; sidewalls down to the beads.
    const treadOuter = (u: number): number => {
      const k = Math.min(1, Math.min(u - (crown0 - 0.04), crown1 + 0.04 - u) / 0.08);
      return half + T.belt + T.tread * Math.max(0.35, k);
    };
    layer('susp.tyre-tread', band(path, nrm, crown0 - 0.04, crown1 + 0.04, half + (carcass === 'radial' ? T.belt : 0), carcass === 'radial' ? treadOuter : (u) => treadOuter(u) - T.belt * 0.5), lined('#3a3d42', 0.85), 2.4);
    layer('susp.tyre-sidewall', band(path, nrm, 0.04, crown0 - 0.02, half, half + T.side), lined('#565a60', 0.75), 1.6);
    layer('susp.tyre-sidewall', band(path, nrm, crown1 + 0.02, 0.96, half, half + T.side), lined('#565a60', 0.75), 1.6);
    // Bead: the wire bundle and the rubber round it, at each end of the carcass.
    const beadMat = new THREE.MeshStandardMaterial({ color: '#d08a50', metalness: 0.6, roughness: 0.35, emissive: '#d08a50', emissiveIntensity: 0.2 });
    const beadRubber = lined('#4a4d52', 0.75);
    for (const end of [0, path.length - 1]) {
      const [r, y] = path[end]!;
      const ring = (radius: number, n: number): Pt[] => Array.from({ length: n }, (_, k): Pt => [r - 0.05 + radius * Math.cos((k / n) * Math.PI * 2), y + radius * Math.sin((k / n) * Math.PI * 2)]);
      layer('susp.tyre-bead', ring(0.075, 18), beadRubber, -1.6);
      layer('susp.tyre-bead', ring(0.04, 6), beadMat, -1.6);
    }

    // Cords: the carcass's across the section (or crossed on a bias tyre), the belt's crossed under the tread; the
    // bead wire as a few turns.
    const cordMat = new THREE.LineBasicMaterial({ color: '#f3e2b0' });
    const steelMat = new THREE.LineBasicMaterial({ color: '#cfd6da' });
    const n = path.length - 1;
    const carcassCords = new THREE.LineSegments(
      cords(path, nrm, half + 0.004, 0, n, carcass === 'radial' ? 90 : BIAS_CORD_DEG, carcass === 'radial' ? 1 : 2, carcass === 'radial' ? 0.045 : 0.09, phiStart, phiStart + phiLength),
      cordMat,
    );
    tag(carcassCords, 'susp.tyre-carcass');
    add(carcassCords);
    this.wires.push(carcassCords);
    this.layers.push({ key: 'susp.tyre-carcass', cut: carcassCords, explode: -0.8 });
    if (carcass === 'radial') {
      const belt = new THREE.LineSegments(cords(path, nrm, half + T.belt + 0.004, Math.round((crown0 + 0.02) * n), Math.round((crown1 - 0.02) * n), BELT_CORD_DEG, 2, 0.05, phiStart, phiStart + phiLength), steelMat);
      tag(belt, 'susp.tyre-belt');
      add(belt);
      this.wires.push(belt);
      this.layers.push({ key: 'susp.tyre-belt', cut: belt, explode: 0.8 });
    }
  }

  setView(view: ViewMode): void {
    this.view = view;
    for (const o of this.solid) o.visible = view === 'solid';
    for (const l of this.layers) {
      const wire = this.wires.includes(l.cut);
      l.cut.visible = view === 'xray' || (view === 'mechanism' && (wire || l.key === 'susp.tyre-bead'));
    }
    this.rim.visible = view !== 'mechanism';
    this.rim.material = view === 'xray' ? this.rimGlass : this.rimSolid;
    this.rim.castShadow = view === 'solid';
    this.place();
  }

  setExplode(amount: number): void {
    this.explode = Math.min(1, Math.max(0, amount));
    this.place();
  }

  private place(): void {
    for (const l of this.layers) l.cut.position.x = l.explode * this.explode;
    this.rim.position.x = -3.4 * this.explode;
  }

  setFailure(part: string | null): void {
    for (const undo of this.failures) undo();
    this.failures = [];
    if (!part) return;
    this.wheelFrame.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (o.userData.part === part && mesh.material instanceof THREE.MeshStandardMaterial) this.failures.push(markDamaged(mesh.material));
    });
  }

  update(frame: TyreFrame): void {
    this.frame = frame;
    const p = frame.patch;
    const loadedR = this.outerR - p.deflectionM * 10;
    // Slip angle: the heading turns about the vertical; camber leans the wheel about its heading, at the patch.
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.rotateY(-frame.alpha);
    this.pivot.rotateZ(-frame.camber);
    this.pivot.position.set(0, 0, 0);
    this.wheelFrame.position.set(0, loadedR, 0);
    this.heading.rotation.y = -frame.alpha;
    // The plane's +X (the canvas's leading edge) along the heading, its +Y (the canvas's up) to the wheel's left.
    this.patchMesh.rotation.set(-Math.PI / 2, 0, -frame.alpha - Math.PI / 2);
    // Length along the heading, width across it, at least a sliver so the patch never vanishes.
    this.patchMesh.scale.set(Math.max(0.05, p.lengthM * 10), Math.max(0.05, p.widthM * 10), 1);
    const key = `${p.phi.toFixed(3)}|${p.dirY.toFixed(2)}`;
    if (key !== this.lastPatchKey) {
      this.lastPatchKey = key;
      const ctx = this.patchCanvas.getContext('2d')!;
      const { width: w, height: h } = this.patchCanvas;
      ctx.clearRect(0, 0, w, h);
      paintPatch(ctx, { phi: p.phi, across: p.dirY, x0: 4, y0: 4, w: w - 8, h: h - 8, leadRight: true, lines: false });
      this.patchTexture.needsUpdate = true;
    }
  }

  anchors(): Record<string, THREE.Vector3> {
    return { patch: new THREE.Vector3(0, 0, 0), centre: new THREE.Vector3(0, this.outerR, 0) };
  }

  dispose(): void {
    disposeTree(this.group);
    for (const m of this.materials) m.dispose();
    this.patchTexture.dispose();
    this.gridTexture.dispose();
  }
}
