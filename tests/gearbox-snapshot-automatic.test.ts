// What the page automatic shows of its gearbox, pinned: the gears the 3D draws, the planet copies, the states the
// buttons select with their power path, and the lever diagram of every gear. If this fails, visitors get another
// gearbox. Update the snapshot only for an intended change (vitest -u), and list it in the commit. Each gearbox page
// has its own snapshot file, so pages built in parallel do not touch one file.

import { describe, expect, it } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { levers, leverSpeeds } from '../src/drivetrain/nomogram.ts';
import { analyseState, buildGearbox } from '../src/drivetrain/topology.ts';
import { matrixSteps } from '../src/ui/gearboxes/automatic/demo.ts';
import { nomogramSvg } from '../src/ui/gearboxes/automatic/nomogram-svg.ts';

const box = buildGearbox(gearboxSpec(gearboxById('automatic')!));
const round = (v: number, digits = 4): number => Math.round(v * 10 ** digits) / 10 ** digits;

describe('the gearbox page automatic', () => {
  it('shows the Toyota GR Supra ZF 8HP51 as pinned', () => {
    const shown = {
      gears: box.spec.gears.map((g) => ({ id: g.id, member: g.member, teeth: g.teeth, module: g.module, internal: !!g.internal, z: g.z, faceWidth: g.faceWidth })),
      planets: Object.fromEntries(Object.entries(box.planets).map(([id, p]) => [id, { carrier: p.carrier, radius: round(p.radius, 3), count: p.angles.length }])),
      packs: box.spec.packs,
      states: box.states.map((s) => ({
        name: s.name,
        closed: s.closed,
        kind: s.kind,
        ratio: s.ratio === null ? null : round(s.ratio),
        efficiency: s.efficiency === null ? null : round(s.efficiency),
        meshPower: s.meshLoads?.map((m) => round(m.power, 3)) ?? null,
        levers: s.speeds ? levers(box).map((l) => leverSpeeds(box, l, s.speeds!).map((v) => round(v))) : null,
      })),
    };
    expect(shown).toMatchSnapshot();
  });

  it('draws the lever diagram for every combination the buttons can make, and the demonstration has its nine steps', () => {
    const ids = box.spec.elements.map((e) => e.id);
    for (let mask = 0; mask < 1 << ids.length; mask++) {
      const closed = ids.filter((_, i) => mask & (1 << i));
      const svg = nomogramSvg(box, analyseState(box, closed), closed);
      expect(svg.startsWith('<svg'), closed.join('')).toBe(true);
      expect(svg).not.toContain('NaN');
    }
    expect(matrixSteps(box)).toHaveLength(9);
  });
});
