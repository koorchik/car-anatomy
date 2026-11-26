// What the car's own bodies share (stage C1a): the exhaust line, the radiator, the intercooler and the fuel tank are
// a few fixed meshes each, solid in the car's view and glass in the X-ray, gone in the mechanism view, which keeps only
// what moves. Each is a small SceneModel of its own, so the overview highlights, ghosts and bands it like the section
// models (model-types.ts).

import * as THREE from 'three';
import { glassMaterial } from '../materials.ts';
import { markDamaged, tag, type SceneModel, type ViewMode } from '../model-types.ts';

export class SimpleModel implements SceneModel<unknown> {
  readonly group = new THREE.Group();
  private readonly shells: Array<{ mesh: THREE.Mesh; solid: THREE.MeshStandardMaterial; glass: THREE.MeshStandardMaterial }> = [];
  private readonly solids: THREE.Mesh[] = [];
  private readonly materials = new Set<THREE.MeshStandardMaterial>();
  private readonly highlight: THREE.Color;
  private readonly orders = new Map<THREE.Object3D, number>();
  private undo: Array<() => void> = [];
  private failures: Array<() => void> = [];

  constructor(highlight: THREE.ColorRepresentation) {
    this.highlight = new THREE.Color(highlight).multiplyScalar(0.25);
  }

  protected material(color: THREE.ColorRepresentation, metalness: number, roughness: number): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    this.materials.add(m);
    return m;
  }

  /** Glass whose Fresnel alpha a ghost can fade, as the gearbox's (scene-base.ts). */
  protected glass(color: THREE.ColorRepresentation, base = 0.05, edge = 0.4): THREE.MeshStandardMaterial {
    const m = glassMaterial(color, base, edge);
    const inner = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      inner.call(m, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= opacity;\n#include <opaque_fragment>');
    };
    const key = m.customProgramCacheKey();
    m.customProgramCacheKey = () => `${key}-fade`;
    this.materials.add(m);
    return m;
  }

  /** A body solid in the car's view and glass in the X-ray. */
  protected shell(geometry: THREE.BufferGeometry, solid: THREE.MeshStandardMaterial, glass: THREE.MeshStandardMaterial, part: string, order = 1): THREE.Mesh {
    const mesh = tag(new THREE.Mesh(geometry, solid), part);
    mesh.renderOrder = order;
    this.shells.push({ mesh, solid, glass });
    this.group.add(mesh);
    return mesh;
  }

  /** A part solid in every view but the mechanism: a pipe, a hose. */
  protected solid(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, part: string): THREE.Mesh {
    const mesh = tag(new THREE.Mesh(geometry, material), part);
    this.solids.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  update(): void {}

  setView(view: ViewMode): void {
    for (const { mesh, solid, glass } of this.shells) {
      mesh.material = view === 'xray' ? glass : solid;
      mesh.castShadow = view === 'solid';
    }
    for (const mesh of this.solids) mesh.castShadow = view === 'solid';
    this.group.visible = view !== 'mechanism';
  }

  setExplode(): void {}

  setFailure(part: string | null): void {
    for (const undo of this.failures) undo();
    this.failures = [];
    if (!part) return;
    for (const mesh of [...this.shells.map((s) => s.mesh), ...this.solids]) {
      if (mesh.userData.part !== part) continue;
      const m = mesh.material;
      if (m instanceof THREE.MeshStandardMaterial) this.failures.push(markDamaged(m));
    }
  }

  setHighlight(on: boolean): void {
    for (const undo of this.undo) undo();
    this.undo = [];
    if (!on) return;
    for (const m of this.materials) {
      const before = m.emissive.clone();
      const intensity = m.emissiveIntensity;
      m.emissive.add(this.highlight);
      m.emissiveIntensity = 1;
      this.undo.push(() => {
        m.emissive.copy(before);
        m.emissiveIntensity = intensity;
      });
    }
  }

  setGhost(alpha: number): void {
    const a = Math.min(1, Math.max(0, alpha));
    for (const m of this.materials) {
      m.userData.ghostBase ??= { transparent: m.transparent, depthWrite: m.depthWrite };
      const base = m.userData.ghostBase as { transparent: boolean; depthWrite: boolean };
      const transparent = base.transparent || a < 1;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = a;
      m.depthWrite = base.depthWrite && a >= 1;
    }
  }

  setRenderBand(base: number): void {
    if (this.orders.size === 0) this.group.traverse((o) => this.orders.set(o, o.renderOrder));
    for (const [o, order] of this.orders) o.renderOrder = order + base;
  }

  dispose(): void {
    const seen = new Set<THREE.BufferGeometry>();
    this.group.traverse((o) => {
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (g && !seen.has(g)) {
        seen.add(g);
        g.dispose();
      }
    });
    for (const m of this.materials) m.dispose();
  }
}
