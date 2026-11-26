// The automatic on the table (demonstration 8) and its lever diagram: what every combination of closed elements
// does with the input and the output, and that the levers show the ratio.

import { describe, expect, it } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { leverBend, levers, leverSpeeds } from '../src/drivetrain/nomogram.ts';
import { PlanetaryTable, speedsWith } from '../src/drivetrain/planetary-table.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';

const box = buildGearbox(gearboxSpec(gearboxById('automatic')!));
const input = box.members.indexOf('C2');
const output = box.members.indexOf('C4');

describe('the lever diagram', () => {
  const all = levers(box);

  it('has one lever per set, S at 0, R at 1 and C at z_r/(z_s + z_r)', () => {
    expect(all.map((l) => l.carrier)).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(all[3]!.nodes.map((n) => n.member)).toEqual(['S4', 'C4', 'R4']);
    expect(all[3]!.nodes[1].pos).toBeCloseTo(102 / 126, 12);
  });

  it('in every gear every lever is straight and the output stands at 1/i of the input', () => {
    for (const state of box.states.filter((s) => s.kind === 'gear')) {
      for (const lever of all) expect(Math.abs(leverBend(lever, leverSpeeds(box, lever, state.speeds!))), `${state.name} ${lever.carrier}`).toBeLessThan(1e-12);
      const out = leverSpeeds(box, all[3]!, state.speeds!)[1];
      expect(out, state.name).toBeCloseTo(1 / state.ratio!, 12);
      expect(leverSpeeds(box, all[1]!, state.speeds!)[1]).toBeCloseTo(1, 12);
    }
  });

  it('the brakes hold their node at zero and the clutches give their two nodes one height', () => {
    for (const state of box.states.filter((s) => s.kind === 'gear')) {
      const v = (m: string) => state.speeds![box.members.indexOf(m)]!;
      if (state.closed.includes('A')) expect(v('S1')).toBeCloseTo(0, 12);
      if (state.closed.includes('B')) expect(v('R1')).toBeCloseTo(0, 12);
      if (state.closed.includes('C')) expect(v('R3')).toBeCloseTo(v('C2'), 12);
      if (state.closed.includes('D')) expect(v('C3')).toBeCloseTo(v('C4'), 12);
      if (state.closed.includes('E')) expect(v('R2')).toBeCloseTo(v('R3'), 12);
    }
  });
});

describe('on the table', () => {
  it('a gear turns the output at the input over the ratio', () => {
    const table = new PlanetaryTable(box);
    table.select('1');
    expect(table.gear).toBe('1');
    table.step(0.5, 600);
    const pose = table.frame();
    expect(pose.angles[input]!).toBeCloseTo((600 * Math.PI) / 30 * 0.5, 9);
    expect(pose.angles[output]!).toBeCloseTo(((600 * Math.PI) / 30) * 0.5 / 5.25, 9);
  });

  it('two elements: the input turns, the free output stands, the links still hold', () => {
    const table = new PlanetaryTable(box, ['A', 'B']);
    expect(table.state.kind).toBe('neutral');
    expect(table.gear).toBeNull();
    table.step(0.2, 600);
    const pose = table.frame();
    expect(pose.angles[output]!).toBeCloseTo(0, 12);
    expect(pose.angles[input]!).toBeGreaterThan(0);
    for (const row of box.links) expect(row.reduce((s, v, i) => s + v * pose.angles[i]!, 0)).toBeCloseTo(0, 9);
  });

  it('A+C+E holds the input and lets the output roll; four elements stop everything', () => {
    const table = new PlanetaryTable(box, ['A', 'C', 'E']);
    expect(table.state.kind).toBe('input-locked');
    table.step(1, 600, 100);
    expect(table.frame().angles[input]!).toBeCloseTo(0, 12);
    expect(table.frame().angles[output]!).toBeCloseTo((100 * Math.PI) / 30, 9);
    table.toggle('B');
    expect(table.closed).toEqual(['A', 'B', 'C', 'E']);
    expect(table.state.kind).toBe('locked');
    const before = [...table.frame().angles];
    table.step(1, 600, 100);
    expect(table.frame().angles).toEqual(before);
  });

  it('a jammed box cannot turn its input, and a gear cannot hold its output still while the input turns', () => {
    expect(speedsWith(box, ['A', 'B', 'C', 'D'], 1, 0)).toBeNull();
    expect(speedsWith(box, ['A', 'B', 'C'], 1, 0)).toBeNull();
    expect(speedsWith(box, ['A', 'B', 'C'], 5.25, 1)![output]).toBeCloseTo(1, 12);
  });
});
