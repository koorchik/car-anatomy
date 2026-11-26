// A ring gear (internal teeth) as BufferGeometry: the toothed inner outline from toothOutline() of gear-geometry.ts,
// the same outline the interference check samples, and a plain rim outside. Spur only for now: the planetary sets in
// the catalogue are drawn straight-cut, so two layers do (a helical ring would turn its layers like gear-mesh.ts).
//
// Frame as gear-mesh.ts: axis Z, front face +Z, tooth 0 at +Y with the ring at angle 0, angles clockwise seen from
// the front. Like every drawn gear, the ring gives up VISIBLE_CLEARANCE·m of its tooth thickness, so a gap shows.

import * as THREE from 'three';
import { gearGeometry, toothOutline, type GearShape } from '../../drivetrain/gear-geometry.ts';
import { MM } from '../geometry.ts';
import { DETAIL, VISIBLE_CLEARANCE, type MeshQuality } from './gear-mesh.ts';
import { acquireGeometry } from './geometry-cache.ts';

export interface RingMeshSpec extends GearShape {
  /** Outer radius of the rim, mm. */
  outerRadius: number;
}

export const ringMeshKey = (spec: RingMeshSpec, quality: MeshQuality): string =>
  ['ring', spec.teeth, spec.module, spec.helix, spec.pressureAngle, spec.faceWidth, spec.outerRadius, quality].join(':');

/** The cached geometry of a ring gear; give it back with releaseGeometry() from geometry-cache.ts. */
export const acquireRingGeometry = (spec: RingMeshSpec, quality: MeshQuality = 'high'): THREE.BufferGeometry =>
  acquireGeometry(ringMeshKey(spec, quality), () => buildRingGeometry(spec, quality));

export function buildRingGeometry(spec: RingMeshSpec, quality: MeshQuality = 'high'): THREE.BufferGeometry {
  if (spec.helix !== 0) throw new Error(`ring gear ${spec.teeth}: only straight-cut rings are drawn so far`);
  const g = gearGeometry({ ...spec, internal: true }, VISIBLE_CLEARANCE * spec.module);
  if (spec.outerRadius <= g.rf) throw new Error(`ring gear ${spec.teeth}: a ${spec.outerRadius} mm rim is inside the root circle`);
  const raw = toothOutline(g, Math.max(3, DETAIL[quality].steps - 2));
  const inner: THREE.Vector2[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const p = new THREE.Vector2(raw[i]!, raw[i + 1]!);
    const last = inner[inner.length - 1];
    if (!last || last.distanceTo(p) > 1e-6) inner.push(p);
  }
  if (inner[0]!.distanceTo(inner[inner.length - 1]!) < 1e-6) inner.pop();
  const segments = quality === 'low' ? 64 : 120;
  const outer: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    outer.push(new THREE.Vector2(spec.outerRadius * Math.sin(a), spec.outerRadius * Math.cos(a)));
  }
  const half = spec.faceWidth / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  // Inner toothed wall, facing the axis: each point twice per face so the flanks get sharp edges at the corners.
  const wall = (ring: THREE.Vector2[], inward: boolean) => {
    const start = positions.length / 3;
    const n = ring.length;
    for (const z of [half, -half]) for (const p of ring) positions.push(p.x * MM, p.y * MM, z * MM);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = start + i;
      const b = start + j;
      const c = start + n + i;
      const d = start + n + j;
      // The outlines run clockwise seen from the front; the outer wall faces out, the toothed one in.
      if (inward) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  };
  wall(inner, true);
  wall(outer, false);
  const faces = THREE.ShapeUtils.triangulateShape(outer, [inner]);
  const flat = [...outer, ...inner];
  for (const [face, z] of [[1, half], [-1, -half]] as const) {
    const start = positions.length / 3;
    for (const p of flat) positions.push(p.x * MM, p.y * MM, z * MM);
    for (const [i0, i1, i2] of faces as Array<[number, number, number]>) {
      const a = flat[i0]!;
      const b = flat[i1]!;
      const c = flat[i2]!;
      const up = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
      if (up === (face > 0)) indices.push(start + i0, start + i1, start + i2);
      else indices.push(start + i0, start + i2, start + i1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
