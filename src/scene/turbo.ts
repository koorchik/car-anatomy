// A turbocharger as the real part is shaped: two scrolls on one shaft with the bearing housing between them.
// The turbine sits at z = 0, the compressor further along +z. One unit is 100 mm, so `size` follows the real airflow.

import * as THREE from 'three';
import { merge as mergeParts, zCylinder } from './geometry.ts';

/** The scrolls and blades are built by hand and have no texture coordinates, and nothing here needs them. */
const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  for (const part of parts) part.deleteAttribute('uv');
  return mergeParts(parts);
};

/** Scroll around Z whose tube narrows as it wraps inwards, with a straight tangential neck at its wide end. */
function scrollGeometry(innerR: number, tubeStart: number, tubeEnd: number, neck: number, wrap = 0.93): THREE.BufferGeometry {
  const radial = 14;
  const along = 64;
  const rings: Array<{ centre: THREE.Vector3; radius: number; tangent: THREE.Vector3 }> = [];
  const neckSteps = 6;
  // The neck runs in along -y to the point where the scroll begins.
  for (let i = 0; i < neckSteps; i++) {
    const t = i / neckSteps;
    rings.push({ centre: new THREE.Vector3(innerR + tubeStart, neck * (1 - t), 0), radius: tubeStart, tangent: new THREE.Vector3(0, -1, 0) });
  }
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const angle = t * wrap * Math.PI * 2;
    const tube = tubeStart + (tubeEnd - tubeStart) * t;
    const r = innerR + tube;
    rings.push({
      centre: new THREE.Vector3(r * Math.cos(angle), -r * Math.sin(angle), 0),
      radius: tube,
      tangent: new THREE.Vector3(-Math.sin(angle), -Math.cos(angle), 0),
    });
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const axis = new THREE.Vector3(0, 0, 1);
  rings.forEach(({ centre, radius, tangent }) => {
    const out = new THREE.Vector3().crossVectors(tangent, axis).normalize();
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const p = centre.clone().addScaledVector(out, Math.cos(a) * radius).addScaledVector(axis, Math.sin(a) * radius);
      positions.push(p.x, p.y, p.z);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Surface of revolution around Z, from [radius, z] pairs. Walk the profile with the outside on the left. */
function revolve(profile: Array<[number, number]>, segments = 36): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Curved blades on a cone: they start small at `tipZ` and sweep out to `outerR` at z = 0. */
function wheelGeometry(outerR: number, inducerR: number, tipZ: number, blades: number, sweep: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [revolve([[0.0001, tipZ], [outerR * 0.22, tipZ * 0.8], [outerR * 0.4, tipZ * 0.3], [outerR * 0.96, 0.002], [0.0001, 0.002]], 24)];
  const steps = 10;
  for (let n = 0; n < blades; n++) {
    const start = (n / blades) * Math.PI * 2;
    const positions: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = tipZ * (1 - t) * (1 - t);
      const hub = outerR * (0.14 + 0.82 * t * t);
      const tip = Math.max(hub + outerR * 0.02, inducerR + (outerR - inducerR) * t * t);
      const angle = start + sweep * (1 - t) * (1 - t);
      positions.push(hub * Math.cos(angle), hub * Math.sin(angle), z, tip * Math.cos(angle), tip * Math.sin(angle), z);
    }
    const indices: number[] = [];
    for (let i = 0; i < steps; i++) {
      const a = i * 2;
      // Both faces: a blade is seen from either side.
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    blade.setIndex(indices);
    blade.computeVertexNormals();
    parts.push(blade);
  }
  return merge(parts);
}

export interface TurboParts {
  /** Hot cast-iron turbine housing. */
  hot: THREE.BufferGeometry;
  /** Aluminium compressor housing and the bearing housing between. */
  cold: THREE.BufferGeometry;
  /** Both wheels and their shaft, turning together around Z. */
  rotor: THREE.BufferGeometry;
  /** Wastegate actuator and its rod, oil feed included. */
  fittings: THREE.BufferGeometry;
  /** Local point where the exhaust comes in. */
  inlet: THREE.Vector3;
  /** Local point where the exhaust leaves, along -z. */
  outlet: THREE.Vector3;
  /** Local point where compressed air leaves. */
  chargeOut: THREE.Vector3;
  /** Local top of the bearing housing, where the oil feed arrives. */
  oilIn: THREE.Vector3;
}

export function turboParts(size: number): TurboParts {
  const s = size;
  const neck = 0.34 * s;
  const coldZ = 0.62 * s;

  const turbineR = 0.2 * s;
  const hot = merge([
    scrollGeometry(0.24 * s, 0.15 * s, 0.05 * s, neck),
    // Dished back, and the exit bore the exhaust leaves through.
    revolve([[0.27 * s, 0.09 * s], [0.42 * s, 0.05 * s], [0.46 * s, 0], [0.42 * s, -0.05 * s], [0.25 * s, -0.11 * s], [0.2 * s, -0.2 * s], [0.2 * s, -0.27 * s], [0.17 * s, -0.27 * s], [0.17 * s, -0.12 * s], [turbineR * 1.08, -0.02 * s]]),
    zCylinder(0.3 * s, 0.03 * s, 28, 0, 0, 0.1 * s),
    // Flange the manifold bolts to.
    new THREE.BoxGeometry(0.42 * s, 0.05 * s, 0.34 * s).translate(0.39 * s, neck, 0),
  ]);

  const compressorR = 0.26 * s;
  const cold = merge([
    scrollGeometry(0.3 * s, 0.15 * s, 0.05 * s, neck * 0.9).translate(0, 0, coldZ),
    // Shroud around the wheel, opening into a flared intake.
    revolve([[0.5 * s, 0.05 * s], [0.46 * s, 0.1 * s], [0.3 * s, 0.17 * s], [0.23 * s, 0.26 * s], [0.21 * s, 0.38 * s], [0.25 * s, 0.44 * s], [0.25 * s, 0.47 * s], [0.18 * s, 0.47 * s], [0.18 * s, 0.26 * s], [compressorR * 1.06, 0.03 * s]].map(([r, z]) => [r!, z! + coldZ] as [number, number])),
    // Back plate.
    zCylinder(0.44 * s, 0.05 * s, 36, 0, 0, coldZ - 0.05 * s),
    // Bearing housing, with cooling flanges at both ends.
    zCylinder(0.13 * s, 0.42 * s, 24, 0, 0, 0.33 * s),
    zCylinder(0.22 * s, 0.03 * s, 28, 0, 0, 0.16 * s),
    zCylinder(0.2 * s, 0.03 * s, 28, 0, 0, 0.26 * s),
    zCylinder(0.2 * s, 0.03 * s, 28, 0, 0, 0.5 * s),
    // Outlet hose stub.
    new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 0.1 * s, 18, 1, true).translate(0.45 * s, neck * 0.9, 0).translate(0, 0, coldZ),
  ]);

  const rotor = merge([
    zCylinder(0.035 * s, coldZ + 0.1 * s, 12, 0, 0, coldZ / 2 - 0.02 * s),
    // The turbine wheel faces the exit bore, and the compressor wheel faces the intake.
    wheelGeometry(turbineR, turbineR * 0.65, 0.14 * s, 11, 0.7).scale(1, 1, -1).translate(0, 0, 0.02 * s),
    wheelGeometry(compressorR, compressorR * 0.55, 0.22 * s, 7, 1.1).translate(0, 0, coldZ + 0.02 * s),
  ]);

  const canX = -0.2 * s;
  const canY = -0.6 * s;
  const canZ = coldZ - 0.05 * s;
  const can = new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.1 * s, 18);
  can.rotateX(Math.PI / 2);
  can.translate(canX, canY, canZ);
  const rod = zCylinder(0.012 * s, coldZ - 0.1 * s, 8, canX, canY + 0.02 * s, (coldZ - 0.1 * s) / 2 + 0.02 * s);
  const arm = new THREE.BoxGeometry(0.03 * s, 0.14 * s, 0.03 * s).translate(canX, canY + 0.08 * s, 0.05 * s);
  const fittings = merge([can, rod, arm]);

  return {
    hot,
    cold,
    rotor,
    fittings,
    inlet: new THREE.Vector3(0.39 * s, neck + 0.02 * s, 0),
    outlet: new THREE.Vector3(0, 0, -0.27 * s),
    chargeOut: new THREE.Vector3(0.45 * s, neck * 0.9 + 0.05 * s, coldZ),
    oilIn: new THREE.Vector3(0, 0.13 * s, 0.33 * s),
  };
}

/** Size scale of a turbo that feeds this much power. A wheel's flow goes roughly with the square of its size. */
export const turboSize = (hp: number): number => 1.05 * Math.pow(Math.max(hp, 40) / 200, 0.4);
