// The engine's full-throttle torque for the lap. Temporary: once feature/dyno is merged, the full-throttle row of its
// torqueMapFor(design, perf, published) replaces this, so the dyno and the track show the same absolute curve.

import type { RpmPoint } from '../designer/physics.ts';

export interface LapTorque {
  /** Torque at the crank, N·m, at a speed: linear between the model's points. */
  at: (rpm: number) => number;
  /** Highest power, watts. */
  peakPowerW: number;
}

/**
 * The model's curve shape at the level of a published peak power, or as it is when none is given (the designer).
 * Replaced by torqueMapFor's full-throttle row after feature/dyno.
 */
export function lapTorqueCurve(points: RpmPoint[], publishedHp: number | null): LapTorque {
  const modelPeak = Math.max(...points.map((p) => p.powerHp));
  const scale = publishedHp && modelPeak > 0 ? publishedHp / modelPeak : 1;
  const rpm = points.map((p) => p.rpm);
  const nm = points.map((p) => Math.max(0, p.torqueNm * scale));
  const at = (n: number): number => {
    if (n <= rpm[0]!) return nm[0]!;
    for (let i = 1; i < rpm.length; i++) {
      if (n <= rpm[i]!) return nm[i - 1]! + ((nm[i]! - nm[i - 1]!) * (n - rpm[i - 1]!)) / (rpm[i]! - rpm[i - 1]!);
    }
    return nm[nm.length - 1]!;
  };
  let peak = 0;
  for (let i = 0; i < rpm.length; i++) peak = Math.max(peak, (nm[i]! * rpm[i]! * 2 * Math.PI) / 60);
  return { at, peakPowerW: peak };
}
