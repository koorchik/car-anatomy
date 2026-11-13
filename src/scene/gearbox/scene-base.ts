// What every gearbox model does the same way (stage K6a-3d took it out for the transaxle; gearbox-model.ts still holds
// its own copy and can move onto this when its page is done): owned materials, glass shells, the power glow, the
// highlight, a failed part, ghosting, render bands, views, pulling apart, anchors and giving back cached geometry.
//
// The whole-car plan's SceneModel contract (setHighlight, setGhost, setRenderBand, anchors) is implemented
// structurally; O2b adds the type to model-types.ts.

import * as THREE from 'three';
import { MM } from '../geometry.ts';
import { glassMaterial } from '../materials.ts';
import type { ViewMode } from '../model-types.ts';
import { releaseGeometry } from './geometry-cache.ts';

/** Power path colour (the colour table of the whole-car plan; moves to palette.ts with O2b) and how bright a full share glows. */
export const POWER_GLOW = new THREE.Color('#ea6a15');
export const GLOW_GAIN = 0.3;
/** Hover highlight of the whole box in the car overview. */
const HIGHLIGHT = new THREE.Color('#3d7fd9').multiplyScalar(0.22);
const DAMAGE = new THREE.Color('#ff2a10');

export abstract class GearboxSceneBase {
  readonly group = new THREE.Group();
  /** The gearbox frame, lifted onto the floor and centred along its length. */
  readonly mounted = new THREE.Group();
  protected readonly shells: Array<{ mesh: THREE.Mesh; solid: THREE.Material; glass: THREE.Material }> = [];
  protected readonly peripheral: THREE.Object3D[] = [];
  protected readonly solidOnly: THREE.Object3D[] = [];
  protected readonly explodables: Array<{ object: THREE.Object3D; base: THREE.Vector3; direction: THREE.Vector3 }> = [];
  /** Every material the model owns, for highlight, ghost, failure and dispose. */
  protected readonly materials = new Set<THREE.MeshStandardMaterial>();
  private readonly glow = new Map<THREE.MeshStandardMaterial, number>();
  private readonly damaged = new Set<THREE.MeshStandardMaterial>();
  /** Named points in the gearbox frame (scene units). */
  protected readonly points: Record<string, THREE.Vector3> = {};
  /** Geometry taken from the cache, once per acquire: dispose() gives back exactly these. */
  protected readonly acquired: THREE.BufferGeometry[] = [];
  private disposed = false;
  private highlighted = false;
  private view: ViewMode = 'xray';

  constructor() {
    this.group.add(this.mounted);
  }

  protected own<T extends THREE.MeshStandardMaterial>(material: T): T {
    this.materials.add(material);
    return material;
  }

  /** Glass that a ghost can fade: the engine's glass with its opacity applied on top. */
  protected glass(color: THREE.ColorRepresentation, base: number, edge: number): THREE.MeshStandardMaterial {
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

  /** Moved by `direction` (in units of `scale` mm) when pulled apart. */
  protected explode(object: THREE.Object3D, direction: THREE.Vector3, scale: number): void {
    this.explodables.push({ object, base: object.position.clone(), direction: direction.multiplyScalar(scale * MM) });
  }

  /** Sets a material's share of the power glow, 0–1, and repaints it when it changed. */
  protected setGlow(material: THREE.MeshStandardMaterial, value: number): void {
    if (Math.abs((this.glow.get(material) ?? 0) - value) < 1e-3) return;
    this.glow.set(material, value);
    this.paint(material);
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

  /** Marks a part as failed: a gear by its id or every part with a key ('gbx-synchro-sleeve'). Null clears. */
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

  /** Named points in the group's frame. */
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
export function lathe(profile: Array<[number, number]>, segments: number): THREE.BufferGeometry {
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
export function ring(rIn: number, rOut: number, width: number, z: number, segments: number): THREE.BufferGeometry {
  const h = width / 2;
  const g = lathe([[rIn, -h], [rOut, -h], [rOut, h], [rIn, h], [rIn, -h]], segments);
  g.translate(0, 0, z * MM);
  return g;
}
