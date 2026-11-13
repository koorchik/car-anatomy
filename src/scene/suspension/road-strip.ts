// A strip of road under one wheel: the scene's profile (bump, pothole, kerb) drawn as a slab whose top follows it and
// whose asphalt slides under the wheel as the road goes by. The same height function feeds the tyre's press
// (tyre-press.ts), so the tyre lies on exactly what is drawn. It sits outside the model's framing (noFit).

import * as THREE from 'three';
import { tag } from '../model-types.ts';
import type { RoadProfile } from '../../suspension/road.ts';

/** Columns along the road: 2 cm apart over ±1.6 m. */
const COLUMNS = 161;
const HALF_LENGTH = 16;
const PER_COLUMN = 6;
/** Depth of the slab's sides, scene units. */
const SKIRT = 0.6;
/** One tile of the asphalt texture along the road, m. */
const TILE_M = 1.2;

/** Where the road is under the wheel: the profile, how far along it the wheel is, and how high the road sits. */
export interface RoadView {
  profile: RoadProfile | null;
  /** Road position (m) under the wheel centre at design. */
  x: number;
  /** Height of the whole road (m): a rig's pad that follows the wheel, 0 on a road. */
  lift: number;
}

export class RoadStrip {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly z0: number;
  private readonly x0: number;
  private readonly width: [number, number];
  private lastX = Number.NaN;
  private lastLift = Number.NaN;
  private lastProfile: RoadProfile | null | undefined = undefined;

  /**
   * `centreX`, `fromX`, `toX`: the wheel's design x along the road (ISO, m) and the strip's sides (scene X).
   */
  constructor(material: THREE.MeshStandardMaterial, centreX: number, fromX: number, toX: number) {
    this.x0 = centreX;
    this.z0 = centreX * 10;
    this.width = [fromX, toX];
    // Six vertices per column, so the top and the two sides keep their own normals: outer bottom, outer top (side),
    // outer top (top), inner top (top), inner top (side), inner bottom.
    const count = COLUMNS * PER_COLUMN;
    this.positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i < COLUMNS; i++) {
      const u = (i / (COLUMNS - 1)) * ((2 * HALF_LENGTH) / (TILE_M * 10));
      uvs.set([u, 0.99, u, 0.96, u, 0.96, u, 0.04, u, 0.04, u, 0.01], i * 2 * PER_COLUMN);
      if (i === COLUMNS - 1) continue;
      const a = i * PER_COLUMN;
      const b = a + PER_COLUMN;
      index.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      index.push(a, a + 1, b, a + 1, b + 1, b);
      index.push(a + 5, b + 5, a + 4, a + 4, b + 5, b + 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(index);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.mesh = tag(new THREE.Mesh(geo, material), 'susp.road');
    this.mesh.receiveShadow = true;
    this.mesh.userData.noFit = true;
    this.mesh.frustumCulled = false;
  }

  /** Road height (m) at scene Z (model frame) for this view. */
  heightAt(view: RoadView, z: number): number {
    return view.lift + (view.profile ? view.profile.heightAt(view.x + z / 10 - this.x0) : 0);
  }

  update(view: RoadView): void {
    const map = (this.mesh.material as THREE.MeshStandardMaterial).map;
    if (map) map.offset.x = view.x / TILE_M;
    if (view.x === this.lastX && view.lift === this.lastLift && view.profile === this.lastProfile) return;
    this.lastX = view.x;
    this.lastLift = view.lift;
    this.lastProfile = view.profile;
    const P = this.positions;
    const [xa, xb] = this.width;
    for (let i = 0; i < COLUMNS; i++) {
      const z = this.z0 - HALF_LENGTH + (i / (COLUMNS - 1)) * 2 * HALF_LENGTH;
      const y = this.heightAt(view, z) * 10;
      const k = i * PER_COLUMN * 3;
      for (let j = 0; j < PER_COLUMN; j++) {
        P[k + 3 * j] = j < 3 ? xb : xa;
        P[k + 3 * j + 1] = j === 0 || j === 5 ? y - SKIRT : y;
        P[k + 3 * j + 2] = z;
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes.position!.needsUpdate = true;
    geo.computeVertexNormals();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
