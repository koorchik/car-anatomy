// The pushrod page's third spring (stage P14): measured through both rockers, it stiffens the axle in heave and leaves
// its roll stiffness almost where it was. Both rockers turn alike in heave and against each other in roll, so the
// spring's length changes in the first case and, to first order, not in the second.

import { describe, expect, it } from 'vitest';
import { suspensionPage } from '../src/data/suspensions.ts';
import { pageCorner } from '../src/suspension-designer/page-cars.ts';
import { axleModes, ownThirdWheelNm } from '../src/suspension/third-spring.ts';

const page = suspensionPage('pushrod')!;
const corners = [null, ...page.cars].map((car) => [car?.link.car ?? 'page', pageCorner(page, car)] as const);

describe.each(corners)('the third spring of %s', (_name, corner) => {
  const none = axleModes(corner.axle, 0);
  const stiff = axleModes(corner.axle, 100_000);

  it('adds nothing when it is not there', () => {
    expect(none.thirdHeaveNm).toBe(0);
    expect(none.thirdRollNm).toBe(0);
    expect(none.heaveNm).toBe(none.springWheelNm);
  });

  it('changes the heave stiffness and not the roll stiffness', () => {
    // 100 N/mm at each wheel by the design-position ratio; the 10 mm the modes are measured over sees it within 15 %.
    expect(stiff.thirdHeaveNm).toBeGreaterThan(85_000);
    expect(stiff.thirdHeaveNm).toBeLessThan(115_000);
    expect(stiff.heaveNm / none.heaveNm).toBeGreaterThan(2);
    // In roll it is a second-order effect: under 1 % of the springs' roll stiffness, under 1 % of what it adds in heave.
    expect(stiff.rollNmRad / none.rollNmRad - 1).toBeLessThan(0.01);
    expect(stiff.thirdRollNm / stiff.thirdHeaveNm).toBeLessThan(0.01);
    // The corner springs alone do not care about it.
    expect(stiff.springWheelNm).toBe(none.springWheelNm);
  });

  it('has its own rate from the design, which the panel starts at', () => {
    const own = ownThirdWheelNm(corner.axle);
    expect(own).toBeGreaterThan(0);
    expect(axleModes(corner.axle, own).thirdHeaveNm / own).toBeCloseTo(1, 0);
  });
});
