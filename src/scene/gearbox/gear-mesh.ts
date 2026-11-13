// Helical involute gears as BufferGeometry (gearboxes plan, «3D» → gear-mesh.ts; research §19).
//
// The transverse outline comes from toothOutline() of gear-geometry.ts, the same outline the interference check
// samples, so what is drawn is what is checked. ExtrudeGeometry cannot twist, so the gear is built here: the outline
// is laid down in layers across the face, each turned by Δθ = s·tan β/r_p (s the distance behind the middle of the
// face, toward the back), side quads join the layers, and the two faces are triangulated with ShapeUtils around the
// bore. Vertices are split where the outline turns sharply (tip corners), so the edges stay crisp while the flanks
// shade smoothly.
//
// Each gear gives up VISIBLE_CLEARANCE·m_n of its tooth thickness on the reference circle, so a visible gap stays
// between flanks in mesh and the surfaces never flicker against each other.
//
// Frame: the gear axis is Z, the front face is +Z, tooth 0 points at +Y with the gear at angle 0, and angles run
// clockwise seen from the front (kinematics.ts). A right hand (β > 0) turns its teeth clockwise going back, so a pair
// with opposite hands stays in mesh in every section: tan β_B = −tan β_A is exactly what the phase formula of
// research §2.2 asks for at every s.

import * as THREE from 'three';
import { gearGeometry, toothOutline, type GearGeometry, type GearShape } from '../../drivetrain/gear-geometry.ts';
import { MM } from '../geometry.ts';
import { acquireGeometry } from './geometry-cache.ts';

export type MeshQuality = 'high' | 'low';

export interface GearMeshSpec extends GearShape {
  /** Radius of the hole through the gear, mm; 0 for a gear cut on its shaft. */
  boreRadius: number;
  /** Tip shortening of the pair, in modules (PairGeometry.tipShortening). */
  tipShortening?: number;
}

/** Tooth thickness each gear gives up on its reference circle, in normal modules (plan: a visible gap of 0.03·m). */
export const VISIBLE_CLEARANCE = 0.03;

/**
 * Points per flank (20–28 per tooth on 'high'), the largest turn of the teeth between two layers, and the bore's
 * segments. A layer step of 6° leaves a chord 0.04 mm inside the helix on a 26 mm pinion: inside the tooth, so the
 * drawn teeth never reach into the mate.
 */
export const DETAIL: Record<MeshQuality, { steps: number; maxStepDeg: number; boreSegments: number }> = {
  high: { steps: 6, maxStepDeg: 6, boreSegments: 40 },
  low: { steps: 4, maxStepDeg: 10, boreSegments: 24 },
};

/** Where the outline turns by more than this, the vertex is split for a crisp edge. */
const CREASE = (32 * Math.PI) / 180;
const DEG = Math.PI / 180;

/** The drawn gear's geometry: thinned for the visible gap, tips shortened as its pair needs. */
export const drawnGear = (spec: GearMeshSpec): GearGeometry => gearGeometry(spec, VISIBLE_CLEARANCE * spec.module, spec.tipShortening ?? 0);

/** How far the teeth turn from the front face to the back one, rad, clockwise seen from the front. */
export const faceTwist = (g: GearGeometry): number => (g.faceWidth * Math.tan(g.beta)) / g.r;

/** The turn of the teeth at local z (mm, +z toward the front face) against the middle of the face, rad. */
export const twistAt = (g: GearGeometry, z: number): number => (-z * Math.tan(g.beta)) / g.r;

/** Layers across the face: enough that no layer turns more than a few degrees past the last; a spur gear has two. */
export const layerCount = (g: GearGeometry, quality: MeshQuality = 'high'): number =>
  Math.min(12, Math.max(1, Math.ceil(Math.abs(faceTwist(g)) / (DETAIL[quality].maxStepDeg * DEG) - 1e-9)) + 1);

export const gearMeshKey = (spec: GearMeshSpec, quality: MeshQuality): string =>
  ['gear', spec.teeth, spec.module, spec.helix, spec.shift, spec.pressureAngle, spec.faceWidth, spec.boreRadius, spec.tipShortening ?? 0, quality].join(':');

/** The cached geometry of a gear; give it back with releaseGeometry() from geometry-cache.ts. */
export const acquireGearGeometry = (spec: GearMeshSpec, quality: MeshQuality = 'high'): THREE.BufferGeometry =>
  acquireGeometry(gearMeshKey(spec, quality), () => buildGearGeometry(spec, quality));

/** One layer of side vertices: `count` vertices from `start`, the outline in order (split vertices appear twice). */
export interface GearLayer {
  /** Local z, scene units. */
  z: number;
  start: number;
  count: number;
}

/** The outline of one transverse section, mm, without repeated points: x, y pairs. */
function outlinePoints(g: GearGeometry, steps: number): Array<[number, number]> {
  const raw = toothOutline(g, steps);
  const points: Array<[number, number]> = [];
  const close = (a: [number, number], x: number, y: number) => Math.hypot(a[0] - x, a[1] - y) < 1e-7 * g.ra;
  for (let i = 0; i < raw.length; i += 2) {
    const x = raw[i]!;
    const y = raw[i + 1]!;
    const last = points[points.length - 1];
    if (last && close(last, x, y)) continue;
    points.push([x, y]);
  }
  if (points.length > 1 && close(points[0]!, ...points[points.length - 1]!)) points.pop();
  return points;
}

/** Builds the geometry of one external gear (not cached: use acquireGearGeometry). */
export function buildGearGeometry(spec: GearMeshSpec, quality: MeshQuality = 'high'): THREE.BufferGeometry {
  const detail = DETAIL[quality];
  const g = drawnGear(spec);
  if (spec.boreRadius >= g.rf) throw new Error(`gear ${spec.teeth}: a ${spec.boreRadius} mm bore cuts through the root circle ${g.rf.toFixed(2)} mm`);
  const points = outlinePoints(g, detail.steps);
  const n = points.length;

  // The ring of side vertices: every outline point, twice where the outline turns sharply.
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[(i - 1 + n) % n]!;
    const [bx, by] = points[i]!;
    const [cx, cy] = points[(i + 1) % n]!;
    const turn = Math.abs(Math.atan2((bx - ax) * (cy - by) - (by - ay) * (cx - bx), (bx - ax) * (cx - bx) + (by - ay) * (cy - by)));
    ring.push(i);
    if (turn > CREASE) ring.push(i);
  }
  const R = ring.length;

  const layers = layerCount(g, quality);
  const half = spec.faceWidth / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const layerInfo: GearLayer[] = [];
  const turned = (i: number, angle: number, z: number): [number, number, number] => {
    const [x, y] = points[i]!;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // Clockwise by `angle` seen from the front.
    return [(x * c + y * s) * MM, (-x * s + y * c) * MM, z * MM];
  };

  for (let k = 0; k < layers; k++) {
    const z = half - (2 * half * k) / (layers - 1);
    const angle = twistAt(g, z);
    layerInfo.push({ z: z * MM, start: positions.length / 3, count: R });
    for (const i of ring) positions.push(...turned(i, angle, z));
  }
  for (let k = 0; k + 1 < layers; k++) {
    for (let j = 0; j < R; j++) {
      const j1 = (j + 1) % R;
      if (ring[j] === ring[j1]) continue;
      const a = k * R + j;
      const b = k * R + j1;
      const c = (k + 1) * R + j;
      const d = (k + 1) * R + j1;
      // The outline runs clockwise seen from the front, so (a, b, c) faces outward.
      indices.push(a, b, c, b, d, c);
    }
  }

  // The two faces, with a hole for the shaft when the gear turns on one.
  const contour = points.map(([x, y]) => new THREE.Vector2(x, y));
  const holes: THREE.Vector2[][] = [];
  if (spec.boreRadius > 0) {
    const hole: THREE.Vector2[] = [];
    for (let i = 0; i < detail.boreSegments; i++) {
      const a = (i / detail.boreSegments) * Math.PI * 2;
      hole.push(new THREE.Vector2(spec.boreRadius * Math.sin(a), spec.boreRadius * Math.cos(a)));
    }
    holes.push(hole);
  }
  const flat = [...contour, ...holes.flat()];
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  for (const [face, z] of [[1, half], [-1, -half]] as const) {
    const angle = twistAt(g, z);
    const start = positions.length / 3;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const p of flat) positions.push((p.x * c + p.y * s) * MM, (-p.x * s + p.y * c) * MM, z * MM);
    for (const [i0, i1, i2] of faces as Array<[number, number, number]>) {
      // Wind each triangle so its normal points out of the face, whatever order the triangulation gave.
      const ax = flat[i0]!;
      const bx = flat[i1]!;
      const cx = flat[i2]!;
      const up = (bx.x - ax.x) * (cx.y - ax.y) - (bx.y - ax.y) * (cx.x - ax.x) > 0;
      if (up === (face > 0)) indices.push(start + i0, start + i1, start + i2);
      else indices.push(start + i0, start + i2, start + i1);
    }
  }
  if (spec.boreRadius > 0) {
    // The bore's wall, facing the axis.
    const segments = detail.boreSegments;
    const front = positions.length / 3;
    for (const z of [half, -half]) {
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(spec.boreRadius * Math.sin(a) * MM, spec.boreRadius * Math.cos(a) * MM, z * MM);
      }
    }
    for (let i = 0; i < segments; i++) {
      const i1 = (i + 1) % segments;
      const a = front + i;
      const b = front + i1;
      const c = front + segments + i;
      const d = front + segments + i1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.layers = layerInfo;
  return geometry;
}
