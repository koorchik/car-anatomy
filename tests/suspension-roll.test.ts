// The roll scene (stage P7): the acceptance of the suspensions plan, the roll scene. Without bars the car rolls more and
// the understeer caption changes; on the hot hatch a stiff rear bar lifts the inner rear wheel at 0.9 g and a thick
// front one does not; the roll centre moves as the body rolls; the article sets Chrysler's measurement beside the model.

import { describe, expect, it } from 'vitest';
import { ROLL_HOT_HATCH, rollChassis, rollSpec, withBars, type BarChoice } from '../src/suspension-designer/roll-cars.ts';
import { axleRollCentre, rigidRollGradient, steadyRoll, type RollState } from '../src/suspension/roll.ts';
import { rollModel, understeerGradient } from '../src/suspension/statics.ts';
import { chryslerHtml, understeerCaption, wheelsCaption } from '../src/ui/suspensions/roll-text.ts';
import { SCENES } from '../src/ui/suspensions/scenes.ts';

const G = 9.81;

const car = (front: BarChoice, rear: BarChoice) => rollChassis(rollSpec(withBars(ROLL_HOT_HATCH, front, rear), null));

function turn(front: BarChoice, rear: BarChoice, g: number): RollState {
  const s = steadyRoll(car(front, rear), g * G);
  expect(s).not.toBeNull();
  return s!;
}

describe('the roll scene', () => {
  it('is on the suspension pages', () => {
    expect(SCENES).toContain('roll');
  });

  it('rolls more without bars, and the understeer caption says so', () => {
    const factory = turn('factory', 'factory', 0.6);
    const none = turn('none', 'none', 0.6);
    expect(Math.abs(none.roll)).toBeGreaterThan(1.5 * Math.abs(factory.roll));
    const us0 = understeerGradient(car('factory', 'factory'), 0.5 * G);
    const us = understeerGradient(car('none', 'none'), 0.5 * G);
    // The front bar is the hot hatch's only one: without it the front takes less of the transfer and understeers less.
    expect(us).toBeLessThan(us0);
    const before = understeerCaption({ now: us0, factory: us0, share: 0.77, factoryShare: 0.77, changed: false });
    const after = understeerCaption({ now: us, factory: us0, share: 0.6, factoryShare: 0.77, changed: true });
    expect(after).not.toBe(before);
    expect(after).toContain('замість');
  });

  it('lifts the inner rear wheel of the hot hatch at 0.9 g with a stiff rear bar, and not with a thick front one', () => {
    const stiffRear = turn('factory', 'thick', 0.9);
    expect(stiffRear.fz[2]).toBeLessThanOrEqual(1);
    const c = car('factory', 'thick');
    expect(wheelsCaption(stiffRear, c.restSupportN, true)).toContain('Внутрішнє заднє колесо в повітрі');
    const thickFront = turn('thick', 'factory', 0.9);
    expect(thickFront.fz[2]).toBeGreaterThan(500);
  });

  it('moves the roll centre as the body rolls', () => {
    const c = car('factory', 'factory');
    const s = turn('factory', 'factory', 0.9);
    const rest = axleRollCentre(c, 0, 0, 0, { y: 0, z: 0 })!;
    const rolled = axleRollCentre(c, 0, s.travel[0]!, s.travel[1]!, { y: 0, z: 0 })!;
    expect(Math.abs(rest.y)).toBeLessThan(1e-6);
    // It leaves the centre line towards the outside of the turn (the right) and drops.
    expect(rolled.y).toBeGreaterThan(0.1);
    expect(rolled.z).toBeLessThan(rest.z);
  });

  it('sets Chrysler measurement beside the rigid model, which does change with the roll centre', () => {
    const c = car('factory', 'factory');
    const m = rollModel(c);
    const rows = [0, 65, 132].map((mm) => ({ heightMm: mm, gradient: rigidRollGradient(c, m, mm / 1000) }));
    // In the rigid model a higher front roll centre means less roll; on Chrysler's car the steady roll did not change.
    expect(rows[2]!.gradient).toBeLessThan(rows[0]!.gradient);
    const html = chryslerHtml(rows);
    expect(html).toContain('Chrysler');
    expect(html).toContain('4,43–4,46');
    expect(html).toContain('Lukianov');
  });
});
