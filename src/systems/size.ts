// Sizes the systems models need, worked out the same way for piston and rotary engines.

import type { Engine } from '../engine/kinematics.ts';
import type { EngineSpec } from '../engine/spec.ts';

/**
 * Air taken in per crank (or eccentric shaft) turn, litres. Every chamber breathes once per cycle, so this is
 * chambers x chamber volume x 360/cycle. A rotor's three faces breathe once per three shaft turns each, so a rotor
 * takes in one chamber per turn: displacementCc counts one chamber per rotor, which makes a 13B 1.31 L per turn.
 */
export const litresPerRev = (engine: Engine): number =>
  ((engine.cylinders.length * (engine.displacementCc / engine.spec.cylinders)) / 1000) * (360 / engine.cycle);

/** Displacement as a four-stroke engine taking the same air in two turns: 2.6 L for a 13B. */
export const fourStrokeLitres = (engine: Engine): number => 2 * litresPerRev(engine);

export const turboCountOf = (spec: EngineSpec): number => ({ turbo: 1, 'twin-turbo': 2, 'quad-turbo': 4 } as Record<string, number>)[spec.aspiration] ?? 0;

/** Stroke as the designer's model counts it, metres: a rotor's chamber sweeps four eccentricities. */
export const strokeM = (spec: EngineSpec): number => (spec.layout.kind === 'wankel' ? (2 * spec.stroke) / 1000 : spec.stroke / 1000);
