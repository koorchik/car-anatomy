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
