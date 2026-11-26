// From the car to the engine. Car frame (ISO 8855): x forward, y left, z up. Engine frame (kinematics.ts): Z along
// the crank to the engine's front (the timing end), Y up, X to the right of someone facing the engine's front, which
// is the left of a driver looking the way the engine's front points. Every mapping keeps the frame right-handed.

import type { EngineMount } from './vehicle.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A car-frame vector in the engine frame. Writes into `out`. */
export function carToEngine(mount: EngineMount, x: number, y: number, z: number, out: Vec3): void {
  switch (mount.front) {
    case 'forward':
      out.x = y;
      out.z = x;
      break;
    case 'rearward':
      out.x = -y;
      out.z = -x;
      break;
    case 'right':
      out.x = x;
      out.z = -y;
      break;
    case 'left':
      out.x = -x;
      out.z = y;
      break;
  }
  out.y = z;
}

/**
 * Slope of a still liquid's surface in the engine frame under the car's accelerations (m/s², car frame), as
 * dy/dX and dy/dZ: the surface stays square to the felt gravity (-a_x, -a_y, -(g + a_v)), so tan φ_u = -a_u / (g + a_v).
 */
export function surfaceSlope(mount: EngineMount, ax: number, ay: number, av: number, g: number, out: Vec3): void {
  carToEngine(mount, ax, ay, 0, out);
  const down = Math.max(0.5, g + av);
  out.x = -out.x / down;
  out.z = -out.z / down;
  out.y = down;
}

/**
 * Where an engine stands in its car (the whole-car plan, how the car goes together in 3D): the engine frame
 * (kinematics.ts, metres, origin on the crank axis where kinematics has Z = 0) to the front-axle frame (car.ts). The
 * turn is the inverse of carToEngine, a proper rotation (determinant +1, so nothing is mirrored or scaled), and the
 * shift brings the crankshaft's front end, `crankFrontZM` along the crank, to the record's packaging.crankFront.
 * Column-major 4×4, as THREE.Matrix4.fromArray reads it; plain numbers, so the shared core stays free of three.js.
 */
export function mountMatrix(mount: EngineMount, packaging: { crankFront: readonly [number, number, number] }, crankFrontZM: number): number[] {
  // The car-frame images of the engine's X, Y and Z axes (engineToCar in packaging.ts).
  const axes: Record<EngineMount['front'], [[number, number, number], [number, number, number]]> = {
    forward: [[0, 1, 0], [1, 0, 0]],
    rearward: [[0, -1, 0], [-1, 0, 0]],
    right: [[1, 0, 0], [0, -1, 0]],
    left: [[-1, 0, 0], [0, 1, 0]],
  };
  const [ex, ez] = axes[mount.front];
  const ey: [number, number, number] = [0, 0, 1];
  const [cx, cy, cz] = packaging.crankFront;
  const t = [cx - crankFrontZM * ez[0], cy - crankFrontZM * ez[1], cz - crankFrontZM * ez[2]];
  return [...ex, 0, ...ey, 0, ...ez, 0, t[0]!, t[1]!, t[2]!, 1];
}
