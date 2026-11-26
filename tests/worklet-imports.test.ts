// The audio worklet carries no text: its import graph (imports only of types left out) reaches neither src/i18n/ nor
// src/data/. The shared core (src/engine/, src/vehicle/, src/drivetrain/) imports neither either, so nothing it
// calls t() for at module level can stay Ukrainian when a section whose dictionary lacks the text loads it first,
// and VehicleLoad in the worklet can import from src/vehicle/ without pulling the translation in.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chain, importsOf, reachable, ROOT } from './import-graph.ts';

const WORKLET = 'src/audio/worklet.ts';
const TEXT = (file: string): boolean => file.startsWith('src/i18n/') || file.startsWith('src/data/');
const CORE = ['src/engine', 'src/vehicle', 'src/drivetrain'];

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(ROOT, path)).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });

describe('the audio worklet', () => {
  it('reaches no text', () => {
    const from = reachable(WORKLET);
    expect(from.size).toBeGreaterThan(5);
    expect([...from.keys()].filter(TEXT).map((file) => chain(from, file))).toEqual([]);
  });
});

describe('the shared core', () => {
  it.each(CORE)('%s imports no text', (dir) => {
    const bad = walk(dir).flatMap((file) => importsOf(file).filter((edge) => TEXT(edge.to)).map((edge) => `${file} → ${edge.to}`));
    expect(bad).toEqual([]);
  });
});
