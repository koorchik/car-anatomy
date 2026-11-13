// The wheel end of a corner, built in the hub frame (+X outboard along the spin axis, origin at the wheel centre):
// the ventilated disc with its hat, the wheel with five spokes, and the caliper straddling the disc. Scene units.

import * as THREE from 'three';
import { merge } from '../geometry.ts';
import { annulus, lathe, rimProfile } from './geometry.ts';
import { DRAWING } from './drawing.ts';

/** Ventilated disc with its hat, built along +X from the wheel centre (hub frame). */
export function discGeometry(face: number, ringIn: number, ringOut: number): THREE.BufferGeometry {
  const outer = DRAWING.discOuterM * 10;
  const inner = DRAWING.discInnerM * 10;
  const plate = (ringOut - ringIn) * 0.32;
  const parts = [
    annulus(inner, outer, ringIn, ringIn + plate, 64),
    annulus(inner, outer, ringOut - plate, ringOut, 64),
    // Hat: a cylinder from the ring up to the hub face and the face itself, with the hub's bore.
    lathe(
      [
        [inner, ringOut],
        [0.78, ringOut],
        [0.78, face + 0.07],
        [0.36, face + 0.07],
        [0.36, face],
        [0.72, face],
        [0.72, ringOut + 0.04],
        [inner, ringOut + 0.04],
      ],
      48,
      true,
    ),
  ];
  const vanes = 36;
  for (let i = 0; i < vanes; i++) {
    const a = (i / vanes) * Math.PI * 2;
    const r = (inner + outer) / 2;
    const vane = new THREE.BoxGeometry(outer - inner - 0.06, ringOut - ringIn - 2 * plate + 0.01, 0.05);
    vane.rotateZ(Math.PI / 2);
    vane.rotateY(-a + Math.PI / 2);
    vane.translate(Math.cos(a) * r, (ringIn + ringOut) / 2, Math.sin(a) * r);
    parts.push(vane);
  }
  return merge(parts).rotateZ(-Math.PI / 2);
}

/** Wheel: the rim and five spokes from the centre disc to the outer lip, along +X from the wheel centre. */
export function wheelGeometry(rimR: number, rimW: number, face: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [lathe(rimProfile(rimR, rimW), 72)];
  // Centre disc with the bore, at the hub face.
  parts.push(lathe([[0.36, face], [0.9, face], [0.95, face + 0.08], [0.85, face + 0.2], [0.36, face + 0.2], [0.36, face]], 48, true));
  // Lathe frame: y is the axle, x and z are radial. Spokes slope outboard from the centre disc to the outer lip.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // From inside the centre disc into the barrel by the outer flange, so each spoke grows out of both.
    const p0 = new THREE.Vector3(c * 0.62, face + 0.14, s * 0.62);
    const p1 = new THREE.Vector3(c * (rimR - 0.03), rimW / 2 - 0.02, s * (rimR - 0.03));
    parts.push(capsuleFlat(p0, p1, 0.6, 0.36, 0.22));
  }
  return merge(parts).rotateZ(-Math.PI / 2);
}

/** A flat spoke from p0 to p1 (lathe frame: x and z radial, y axial), wider at the hub. */
function capsuleFlat(p0: THREE.Vector3, p1: THREE.Vector3, w0: number, w1: number, thick: number): THREE.BufferGeometry {
  const len = p0.distanceTo(p1);
  const shape = new THREE.Shape();
  shape.moveTo(-w0 / 2, 0);
  shape.lineTo(w0 / 2, 0);
  shape.lineTo(w1 / 2, len);
  shape.lineTo(-w1 / 2, len);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  geo.translate(0, 0, -thick / 2);
  // Local Y along the spoke, local Z across the wheel's face (the axial direction, roughly).
  const y = p1.clone().sub(p0).normalize();
  const axial = new THREE.Vector3(0, 1, 0);
  const z = axial.clone().addScaledVector(y, -axial.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p0));
  return geo;
}

/**
 * Caliper straddling the disc's ring: an inboard body over the pistons, an outboard finger and the bridge over the
 * disc's edge, an arc about the hub axis centred at the rear. Built in the hub frame (+X outboard).
 */
export function caliperGeometry(ringIn: number, ringOut: number, span: number): THREE.BufferGeometry {
  const r0 = 1.05;
  const r1 = DRAWING.discOuterM * 10 + 0.07;
  const r2 = r1 + 0.2;
  const sector = (ra: number, rb: number): THREE.Shape => {
    const s = new THREE.Shape();
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (-span + (2 * span * i) / steps);
      const x = Math.cos(a) * rb;
      const y = Math.sin(a) * rb;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const a = Math.PI + (-span + (2 * span * i) / steps);
      s.lineTo(Math.cos(a) * ra, Math.sin(a) * ra);
    }
    return s;
  };
  const block = (ra: number, rb: number, x0: number, x1: number): THREE.BufferGeometry => {
    const g = new THREE.ExtrudeGeometry(sector(ra, rb), { depth: x1 - x0, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, x0);
    // Shape plane (x, y) → (scene Z, Y) round the hub axis; extrusion along +X.
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
    return g;
  };
  return merge([block(r0, r2, ringIn - 0.38, ringIn - 0.03), block(r0 + 0.12, r2, ringOut + 0.03, ringOut + 0.2), block(r1, r2, ringIn - 0.03, ringOut + 0.03)]);
}
