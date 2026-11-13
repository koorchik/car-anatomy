// Straight bevel gears as BufferGeometry (gearboxes plan, «3D»: the Tredgold approximation; stage K6a-3d draws the
// 911's crown wheel and pinion with it).
//
// The tooth lives on the back cone: developed into the plane, the back cone is a spur gear with z_v = z/cos δ teeth
// and pitch radius r/cos δ (Tredgold), so its outline comes from the same singleTooth() as the spur gears. A point at
// distance R_v from the back cone's apex and ψ_v from the tooth's middle lands on the real gear at radius R_v·cos δ,
// at ψ_v/cos δ round the axis and (R_v − r_v)·sin δ off the pitch cone along the axis. The toe is the heel scaled
// toward the pitch cones' apex, so every flank line runs to the apex and two layers make the whole tooth.
//
// Frame: the gear's axis is Z with the pitch cone's apex at the origin; the gear lies on −Z and its teeth face +Z, the
// apex. Tooth 0 points at +Y with the gear at angle 0, angles clockwise seen from +Z, as gear-mesh.ts.

import * as THREE from 'three';
import { gearGeometry, halfToothAngle, singleTooth } from '../../drivetrain/gear-geometry.ts';
import { MM } from '../geometry.ts';
import { DETAIL, type MeshQuality } from './gear-mesh.ts';
import { acquireGeometry } from './geometry-cache.ts';

export interface BevelMeshSpec {
  teeth: number;
  /** Outer transverse module, mm. */
  module: number;
  pressureAngle: number;
  shift: number;
  faceWidth: number;
  /** Pitch cone angle, degrees. */
  cone: number;
  /** Radius of a hole through the gear, mm; 0 for a pinion cut on its shaft. */
  boreRadius: number;
}

/**
 * Tooth thickness each bevel gear gives up on its pitch circle, in modules: twice the spur gears' visible gap, since
 * the equivalent gears of a straight bevel pair are conjugate only on the back cone.
 */
export const BEVEL_CLEARANCE = 0.06;

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
/** Where the outline turns by more than this, the vertex is split for a crisp edge (as gear-mesh.ts). */
const CREASE = (32 * Math.PI) / 180;

export const bevelMeshKey = (spec: BevelMeshSpec, quality: MeshQuality): string =>
  ['bevel', spec.teeth, spec.module, spec.pressureAngle, spec.shift, spec.faceWidth, spec.cone, spec.boreRadius, quality].join(':');

/** The cached geometry of a bevel gear; give it back with releaseGeometry() from geometry-cache.ts. */
export const acquireBevelGeometry = (spec: BevelMeshSpec, quality: MeshQuality = 'high'): THREE.BufferGeometry =>
  acquireGeometry(bevelMeshKey(spec, quality), () => buildBevelGeometry(spec, quality));

/** Outer pitch radius, cone distance and the heel's tip radius as drawn, mm. */
export function bevelSize(spec: BevelMeshSpec): { r: number; cone: number; tip: number; heelZ: number; toeScale: number } {
  const delta = spec.cone * DEG;
  const r = (spec.module * spec.teeth) / 2;
  const cone = r / Math.sin(delta);
  const addendum = spec.module * (1 + spec.shift);
  return { r, cone, tip: r + addendum * Math.cos(delta), heelZ: -cone * Math.cos(delta), toeScale: (cone - spec.faceWidth) / cone };
}

/** Builds one straight bevel gear (not cached: use acquireBevelGeometry). */
export function buildBevelGeometry(spec: BevelMeshSpec, quality: MeshQuality = 'high'): THREE.BufferGeometry {
  const delta = spec.cone * DEG;
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const { r, cone, toeScale } = bevelSize(spec);
  // The equivalent spur gear on the back cone.
  const zv = spec.teeth / cos;
  const virtual = gearGeometry({ teeth: zv, module: spec.module, helix: 0, pressureAngle: spec.pressureAngle, shift: spec.shift, faceWidth: spec.faceWidth }, BEVEL_CLEARANCE * spec.module);
  const rv = virtual.r;
  const tooth = singleTooth(virtual, DETAIL[quality].steps);
  // One tooth's points (radius, angle, axial offset) on the heel, without the repeated last point.
  const heel: Array<[number, number, number]> = [];
  for (let i = 0; i + 1 < tooth.length; i += 2) {
    const Rv = tooth[i]!;
    const last = heel[heel.length - 1];
    const point: [number, number, number] = [Rv * cos, tooth[i + 1]! / cos, (Rv - rv) * sin];
    if (last && Math.abs(last[0] - point[0]) < 1e-9 && Math.abs(last[1] - point[1]) < 1e-12) continue;
    heel.push(point);
  }
  if (heel.length > 1) {
    const a = heel[0]!;
    const b = heel[heel.length - 1]!;
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] + TAU / spec.teeth - b[1]) < 1e-9) heel.pop();
  }
  const ring: Array<[number, number, number]> = [];
  for (let k = 0; k < spec.teeth; k++) for (const [rho, angle, dz] of heel) ring.push([rho, angle + (TAU * k) / spec.teeth, dz]);
  const n = ring.length;
  if (spec.boreRadius > 0 && spec.boreRadius >= toeScale * (r - spec.module * (1.25 - spec.shift) * cos)) {
    throw new Error(`bevel gear ${spec.teeth}: a ${spec.boreRadius} mm bore cuts through the toe's root`);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const point = (rho: number, angle: number, z: number, s: number) =>
    positions.push(s * rho * Math.sin(angle) * MM, s * rho * Math.cos(angle) * MM, z * MM);
  const contour = ring.map(([rho, angle]) => new THREE.Vector2(rho * Math.sin(angle), rho * Math.cos(angle)));
  // Side vertices: every outline point, twice where the outline turns sharply (tip corners), for crisp edges.
  const side: number[] = [];
  for (let i = 0; i < n; i++) {
    const A = contour[(i - 1 + n) % n]!;
    const B = contour[i]!;
    const C = contour[(i + 1) % n]!;
    const turn = Math.abs(Math.atan2((B.x - A.x) * (C.y - B.y) - (B.y - A.y) * (C.x - B.x), (B.x - A.x) * (C.x - B.x) + (B.y - A.y) * (C.y - B.y)));
    side.push(i);
    if (turn > CREASE) side.push(i);
  }
  const S = side.length;
  // Heel (s = 1) and toe (s = toeScale) rings: the pitch circle sits at z = −s·cone·cos δ.
  for (const s of [1, toeScale]) {
    for (const i of side) {
      const [rho, angle, dz] = ring[i]!;
      point(rho, angle, s * (-cone * cos + dz), s);
    }
  }
  for (let j = 0; j < S; j++) {
    const j1 = (j + 1) % S;
    if (side[j] === side[j1]) continue;
    const a = j;
    const b = j1;
    const c = S + j;
    const d = S + j1;
    // The outline runs clockwise seen from +Z and the toe lies toward +Z: (a, c, b) faces away from the axis.
    indices.push(a, c, b, b, c, d);
  }

  // Heel and toe faces, triangulated on the projection, with a hole for the bore.
  const segments = DETAIL[quality].boreSegments;
  const hole: THREE.Vector2[] = [];
  if (spec.boreRadius > 0) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * TAU;
      hole.push(new THREE.Vector2(spec.boreRadius * Math.sin(a), spec.boreRadius * Math.cos(a)));
    }
  }
  const faces = THREE.ShapeUtils.triangulateShape(contour, hole.length ? [hole] : []);
  // The heel faces −Z (away from the apex), the toe +Z.
  for (const [s, toward] of [[1, -1], [toeScale, 1]] as const) {
    const start = positions.length / 3;
    const pitchZ = -s * cone * cos;
    ring.forEach(([rho, angle, dz]) => point(rho, angle, s * (-cone * cos + dz), s));
    // The bore's rim sits at the pitch circle's depth: the hole wall below joins heel and toe.
    for (const p of hole) positions.push(p.x * MM, p.y * MM, pitchZ * MM);
    const flat = [...contour, ...hole];
    for (const [i0, i1, i2] of faces as Array<[number, number, number]>) {
      const A = flat[i0]!;
      const B = flat[i1]!;
      const C = flat[i2]!;
      const up = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) > 0;
      if (up === (toward > 0)) indices.push(start + i0, start + i1, start + i2);
      else indices.push(start + i0, start + i2, start + i1);
    }
  }
  if (hole.length) {
    // The bore's wall, from the heel's rim to the toe's, facing the axis.
    const heelStart = positions.length / 3;
    for (const s of [1, toeScale]) for (const p of hole) positions.push(p.x * MM, p.y * MM, -s * cone * cos * MM);
    for (let i = 0; i < segments; i++) {
      const i1 = (i + 1) % segments;
      const a = heelStart + i;
      const b = heelStart + i1;
      const c = heelStart + segments + i;
      const d = heelStart + segments + i1;
      // Heel first, then the toe toward +Z: (a, b, c) faces the axis.
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.bevel = { r, cone, toeScale, virtualTeeth: zv };
  return geometry;
}

/**
 * How far a point lies inside a bevel gear's teeth, mm along the circle round the axis (zero or less: outside), in the
 * gear's own frame (mm, apex at the origin, axis Z, gear at angle 0). The ray from the apex through the point meets
 * the back cone where the developed spur gear tells whether it falls in a tooth (halfToothAngle, as penetration() in
 * gear-geometry.ts for spur gears); the point is in the tooth if that ray crosses the face between toe and heel.
 */
export function bevelPenetration(spec: BevelMeshSpec, x: number, y: number, z: number, thinning = BEVEL_CLEARANCE * spec.module): number {
  const delta = spec.cone * DEG;
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const { cone, toeScale } = bevelSize(spec);
  const virtual = gearGeometry({ teeth: spec.teeth / cos, module: spec.module, helix: 0, pressureAngle: spec.pressureAngle, shift: spec.shift, faceWidth: spec.faceWidth }, thinning);
  const radial = Math.hypot(x, y);
  // The back cone: apex on the axis at zB, its points at radial = (z − zB)·cot δ.
  const zB = -cone * cos - virtual.r * sin;
  const den = radial - (z * cos) / sin;
  if (den <= 0) return -Infinity;
  const t = (-zB * cos) / sin / den;
  // t scales the point onto the heel: inside the face only for 1 ≤ t ≤ 1/toe.
  if (t < 1 - 1e-12 || t > 1 / toeScale + 1e-12) return -Infinity;
  const Rv = (t * radial) / cos;
  if (Rv >= virtual.ra) return (virtual.ra - Rv) / t;
  const pitch = TAU / spec.teeth;
  const theta = Math.atan2(x, y);
  const local = ((theta % pitch) + pitch) % pitch;
  const fromCentre = Math.min(local, pitch - local) * cos;
  if (Rv <= virtual.rf) return (virtual.rf - Rv) / t + 1;
  return ((halfToothAngle(virtual, Rv) - fromCentre) * Rv) / t;
}
