// Parametric part geometry. All dimensions in scene units (1 unit = 100 mm).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEG } from '../engine/kinematics.ts';

export const MM = 0.01;

export const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  // mergeGeometries requires matching attributes, so drop what we never use and un-index everything.
  const clean = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(ng.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
    }
    return ng;
  });
  const out = mergeGeometries(clean, false);
  if (!out) throw new Error('Could not merge geometries');
  return out;
};

export interface Bevel {
  thickness: number;
  segments?: number;
}

/** Extrudes a shape along Z, centred on z = 0. */
export const extrude = (shape: THREE.Shape, depth: number, bevel?: Bevel, curveSegments = 24): THREE.BufferGeometry => {
  const size = bevel?.thickness ?? 0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - size * 2,
    bevelEnabled: !!bevel,
    bevelThickness: size,
    bevelSize: size,
    bevelSegments: bevel?.segments ?? 2,
    curveSegments,
  });
  geo.translate(0, 0, -depth / 2 + size);
  return geo;
};

export const roundedRect = (x0: number, y0: number, x1: number, y1: number, radius: number): THREE.Shape => {
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
};

/** Cylinder along Z. */
export const zCylinder = (radius: number, length: number, segments = 32, x = 0, y = 0, z = 0, open = false): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
};

export function pistonGeometry(bore: number, crownAbovePin: number, skirtBelowPin: number): { body: THREE.BufferGeometry; rings: THREE.BufferGeometry } {
  const R = bore / 2 - 0.004;
  const top = crownAbovePin;
  const groove = R - 0.03;
  const land = bore * 0.038;
  const groove1 = top - bore * 0.07;
  const profile: Array<[number, number]> = [
    [0, top - bore * 0.012],
    [R * 0.72, top - bore * 0.012],
    [R * 0.8, top],
    [R - 0.01, top],
    [R, top - 0.01],
  ];
  let y = groove1;
  for (let i = 0; i < 3; i++) {
    profile.push([R, y], [groove, y], [groove, y - land * 0.55], [R, y - land * 0.55]);
    y -= land * 1.35;
  }
  profile.push([R, y], [R, -skirtBelowPin], [R * 0.9, -skirtBelowPin], [R * 0.88, top - bore * 0.2], [0, top - bore * 0.17]);
  const body = new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(r, h)),
    40,
  );
  body.computeVertexNormals();
  const ringParts: THREE.BufferGeometry[] = [];
  y = groove1;
  for (let i = 0; i < 3; i++) {
    const thick = land * 0.5;
    const t = new THREE.TorusGeometry(R - 0.012, thick * 0.5, 6, 40);
    t.rotateX(Math.PI / 2);
    t.translate(0, y - land * 0.27, 0);
    ringParts.push(t);
    y -= land * 1.35;
  }
  return { body, rings: merge(ringParts) };
}

/** Connecting rod with the big end at the origin, small end at +Y. */
export function rodGeometry(length: number, bigR: number, smallR: number, pinR: number, wristR: number, width: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const neck = smallR * 0.62;
  const shoulder = bigR * 0.68;
  const a = Math.acos(Math.min(1, shoulder / bigR));
  s.absarc(0, 0, bigR, Math.PI - a, 2 * Math.PI + a, false);
  s.bezierCurveTo(shoulder * 0.8, bigR * 1.5, neck, length * 0.28, neck, length * 0.5);
  s.bezierCurveTo(neck, length * 0.72, smallR * 0.9, length - smallR * 1.5, smallR * 0.98, length - smallR * 0.2);
  s.absarc(0, length, smallR, 0, Math.PI, false);
  s.bezierCurveTo(-smallR * 0.9, length - smallR * 1.5, -neck, length * 0.72, -neck, length * 0.5);
  s.bezierCurveTo(-neck, length * 0.28, -shoulder * 0.8, bigR * 1.5, -bigR * Math.cos(a), bigR * Math.sin(a));
  const hole1 = new THREE.Path();
  hole1.absarc(0, 0, pinR, 0, Math.PI * 2, true);
  const hole2 = new THREE.Path();
  hole2.absarc(0, length, wristR, 0, Math.PI * 2, true);
  s.holes.push(hole1, hole2);
  return extrude(s, width, { thickness: width * 0.09, segments: 1 });
}

/** Crank web with its counterweight, pin at (0, r). */
const webGeometry = (r: number, pinR: number, mainR: number, cwR: number, width: number): THREE.BufferGeometry => {
  const s = new THREE.Shape();
  const lobe = pinR * 1.28;
  const cwSpan = 62 * DEG;
  const base = -Math.PI / 2;
  s.moveTo(-lobe, r);
  s.absarc(0, r, lobe, Math.PI, 0, true);
  const edge = Math.max(lobe, mainR * 1.12);
  s.lineTo(edge, 0);
  s.lineTo(cwR * Math.cos(base + cwSpan), cwR * Math.sin(base + cwSpan));
  s.absarc(0, 0, cwR, base + cwSpan, base - cwSpan, true);
  s.lineTo(-edge, 0);
  s.lineTo(-lobe, r);
  return extrude(s, width, { thickness: width * 0.1, segments: 1 });
};

export interface ThrowDef {
  /** Pin angle, degrees clockwise from +Y. */
  angle: number;
  z: number;
  length: number;
}

/** Whole crankshaft. Pins, webs and a continuous run of main journals. */
export function crankGeometry(throws: ThrowDef[], r: number, pinR: number, mainR: number, cwR: number, webWidth: number, zMin: number, zMax: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [zCylinder(mainR, zMax - zMin, 36, 0, 0, (zMax + zMin) / 2)];
  const web = webGeometry(r, pinR, mainR, cwR, webWidth);
  for (const t of throws) {
    const a = t.angle * DEG;
    parts.push(zCylinder(pinR, t.length + webWidth * 0.5, 28, r * Math.sin(a), r * Math.cos(a), t.z));
    for (const side of [-1, 1]) {
      const w = web.clone();
      w.rotateZ(-a);
      w.translate(0, 0, t.z + side * (t.length / 2 + webWidth / 2));
      parts.push(w);
    }
  }
  return merge(parts);
}

/** Valve with its face at y = 0 and the stem running up +Y. */
export function valveGeometry(headR: number, stemR: number, stemLength: number): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [
    [0, -headR * 0.05],
    [headR * 0.96, -headR * 0.05],
    [headR, 0],
    [headR * 0.92, headR * 0.1],
    [stemR * 2.4, headR * 0.45],
    [stemR, headR * 0.9],
    [stemR, stemLength],
    [0, stemLength],
  ];
  return new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    20,
  );
}

/** Coil spring standing on y = 0 with height 1, meant to be scaled in Y. */
export function springGeometry(radius: number, wire: number, turns = 6): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const steps = turns * 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, t, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, wire, 6, false);
}

/** Cam lobe profile matching the valve lift law. Nose points to -Y. */
const lobeShape = (baseR: number, lift: number, halfSpanCamDeg: number): THREE.Shape => {
  const s = new THREE.Shape();
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const fromNose = Math.abs(((a / DEG + 180) % 360) - 180);
    let rad = baseR;
    if (fromNose < halfSpanCamDeg) {
      const c = Math.cos((Math.PI / 2) * (fromNose / halfSpanCamDeg));
      rad += lift * c * c;
    }
    const x = Math.sin(a) * rad;
    const y = -Math.cos(a) * rad;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
};

export interface LobeDef {
  z: number;
  /** Rotation of the lobe on the shaft, radians. */
  rotation: number;
  /** Half the lobe's opening, in cam degrees. */
  halfSpan: number;
}

export function camshaftGeometry(lobes: LobeDef[], baseR: number, lift: number, width: number, shaftR: number, zMin: number, zMax: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [zCylinder(shaftR, zMax - zMin, 16, 0, 0, (zMin + zMax) / 2)];
  for (const def of lobes) {
    const g = extrude(lobeShape(baseR, lift, def.halfSpan), width);
    g.rotateZ(def.rotation);
    g.translate(0, 0, def.z);
    parts.push(g);
  }
  return merge(parts);
}

/** Toothed ring: flywheel or sprocket. */
export function gearShape(outerR: number, rootR: number, teeth: number, holeR: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const p = (angle: number, rad: number): [number, number] => [Math.cos(angle) * rad, Math.sin(angle) * rad];
    const [x0, y0] = p(a0, rootR);
    if (i === 0) s.moveTo(x0, y0);
    else s.lineTo(x0, y0);
    s.lineTo(...p(a0 + step * 0.2, outerR));
    s.lineTo(...p(a0 + step * 0.5, outerR));
    s.lineTo(...p(a0 + step * 0.7, rootR));
  }
  s.closePath();
  if (holeR > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

export function flywheelGeometry(radius: number, depth: number): THREE.BufferGeometry {
  const ring = extrude(gearShape(radius, radius * 0.965, 96, radius * 0.88), depth * 0.55, undefined, 16);
  ring.translate(0, 0, depth * 0.2);
  const profile: Array<[number, number]> = [
    [radius * 0.05, depth * 0.5],
    [radius * 0.32, depth * 0.5],
    [radius * 0.36, depth * 0.18],
    [radius * 0.82, depth * 0.18],
    [radius * 0.9, depth * 0.48],
    [radius * 0.92, -depth * 0.05],
    [radius * 0.84, -depth * 0.48],
    [radius * 0.3, -depth * 0.48],
    [radius * 0.05, -depth * 0.48],
  ];
  const disc = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    72,
  );
  disc.rotateX(Math.PI / 2);
  disc.computeVertexNormals();
  return merge([disc, ring]);
}

export function pulleyGeometry(radius: number, depth: number): THREE.BufferGeometry {
  const grooves = 5;
  const pts: Array<[number, number]> = [[radius * 0.15, -depth / 2], [radius * 0.72, -depth / 2], [radius * 0.72, -depth / 2 + depth * 0.1]];
  pts.push([radius, -depth / 2 + depth * 0.1]);
  for (let i = 0; i < grooves; i++) {
    const y = -depth / 2 + depth * (0.14 + (0.72 * (i + 0.5)) / grooves);
    pts.push([radius * 0.95, y], [radius, y + depth * 0.07]);
  }
  pts.push([radius, depth / 2], [radius * 0.25, depth / 2], [radius * 0.15, depth * 0.5]);
  const g = new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    48,
  );
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Outer hull of a set of 2D points, counter-clockwise. */
const convexHull = (points: THREE.Vector2[]): THREE.Vector2[] => {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: THREE.Vector2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
};

export interface Pulley2D {
  x: number;
  y: number;
  r: number;
}

/** Flat outline around a set of circles, used for the timing cover. */
export function hullShape(circles: Pulley2D[]): THREE.Shape {
  const samples: THREE.Vector2[] = [];
  for (const p of circles) {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      samples.push(new THREE.Vector2(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r));
    }
  }
  const hull = convexHull(samples);
  const shape = new THREE.Shape();
  hull.forEach((h, i) => (i === 0 ? shape.moveTo(h.x, h.y) : shape.lineTo(h.x, h.y)));
  shape.closePath();
  return shape;
}

/** Closed tube running around a set of pulleys, as a belt or chain does. */
export function beltCurve(pulleys: Pulley2D[], z: number): THREE.Curve<THREE.Vector3> {
  const samples: THREE.Vector2[] = [];
  for (const p of pulleys) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      samples.push(new THREE.Vector2(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r));
    }
  }
  const hull = convexHull(samples);
  // Thin out long-run points so the spline stays tight on the pulleys.
  const pts = hull.map((h) => new THREE.Vector3(h.x, h.y, z));
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.05);
}

export const tubeAlong = (points: THREE.Vector3[], radius: number, tubular = 48, radial = 12): THREE.TubeGeometry =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), tubular, radius, radial, false);

/** Block cross-section built from the banks, with a valley between them where there is room. */
export function blockSection(banks: Array<{ alpha: number; halfWidth: number }>, deck: number, crankcaseR: number): THREE.Shape {
  const dir = (deg: number): THREE.Vector2 => new THREE.Vector2(Math.sin(deg * DEG), Math.cos(deg * DEG));
  const perp = (deg: number): THREE.Vector2 => new THREE.Vector2(Math.cos(deg * DEG), -Math.sin(deg * DEG));
  const sorted = [...banks].sort((a, b) => a.alpha - b.alpha);
  const pts: THREE.Vector2[] = [];
  const count = sorted.length;
  for (let i = 0; i < count; i++) {
    const b = sorted[i]!;
    const a = dir(b.alpha);
    const p = perp(b.alpha);
    // Walking clockwise from above: the left corner of the deck then the right one.
    pts.push(a.clone().multiplyScalar(deck).addScaledVector(p, -b.halfWidth));
    pts.push(a.clone().multiplyScalar(deck).addScaledVector(p, b.halfWidth));
    const next = sorted[(i + 1) % count]!;
    const gap = i === count - 1 ? next.alpha + 360 - b.alpha : next.alpha - b.alpha;
    if (gap < 170) {
      // Line down this bank's right wall meets the next bank's left wall: that's the valley floor.
      const a2 = dir(next.alpha);
      const p2 = perp(next.alpha);
      const start = a.clone().multiplyScalar(deck).addScaledVector(p, b.halfWidth);
      const start2 = a2.clone().multiplyScalar(deck).addScaledVector(p2, -next.halfWidth);
      const det = a.x * -a2.y - a.y * -a2.x;
      if (Math.abs(det) > 1e-4) {
        const rx = start2.x - start.x;
        const ry = start2.y - start.y;
        // Solve start - t a = start2 - u a2
        const t = -(rx * -a2.y - ry * -a2.x) / det;
        if (t > 0) {
          const v = start.clone().addScaledVector(a, -t);
          // Keep a floor above the crank so the valley doesn't cut into the crankcase.
          const minR = crankcaseR * 0.74;
          if (v.length() < minR) v.setLength(minR);
          pts.push(v);
        }
      }
    } else {
      // Round crankcase bottom between the banks.
      const startAngle = b.alpha + (Math.asin(Math.min(0.95, b.halfWidth / crankcaseR)) / DEG);
      const endAngle = (i === count - 1 ? next.alpha + 360 : next.alpha) - (Math.asin(Math.min(0.95, next.halfWidth / crankcaseR)) / DEG);
      const start = a.clone().multiplyScalar(Math.sqrt(Math.max(0, crankcaseR * crankcaseR - b.halfWidth * b.halfWidth))).addScaledVector(p, b.halfWidth);
      pts.push(start);
      const n = 16;
      for (let k = 1; k < n; k++) {
        const ang = startAngle + ((endAngle - startAngle) * k) / n;
        pts.push(dir(ang).multiplyScalar(crankcaseR));
      }
    }
  }
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
  s.closePath();
  return s;
}
