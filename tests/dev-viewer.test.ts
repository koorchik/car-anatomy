// The model viewer (dev/models.html) checks 3D models while the shell is rebuilt around them, so it must not pull in
// the shell: src/main.ts, src/ui/ or src/scene/stage.ts, directly or through anything it imports.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const rel = (file: string): string => relative(ROOT, file).split('\\').join('/');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []));

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

/** Relative imports of a file that resolve to TypeScript sources, queries such as ?worker&url dropped. */
function importsOf(file: string): string[] {
  const out: string[] = [];
  for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
    const spec = match[1]!.split('?')[0]!;
    if (!spec.startsWith('.') || !spec.endsWith('.ts')) continue;
    const target = join(dirname(file), spec);
    if (existsSync(target)) out.push(target);
  }
  return out;
}

const forbidden = (file: string): boolean => {
  const r = rel(file);
  return r === 'src/main.ts' || r === 'src/scene/stage.ts' || r.startsWith('src/ui/');
};

const DEV = join(ROOT, 'dev');
const devFiles = walk(DEV);

describe('model viewer', () => {
  it('reaches nothing of the shell', () => {
    const from = new Map<string, string | null>(devFiles.map((f) => [f, null]));
    const queue = [...devFiles];
    const bad: string[] = [];
    while (queue.length > 0) {
      const file = queue.shift()!;
      for (const next of importsOf(file)) {
        if (from.has(next)) continue;
        from.set(next, file);
        if (forbidden(next)) {
          const chain = [next];
          for (let at = from.get(next); at; at = from.get(at) ?? null) chain.unshift(at);
          bad.push(chain.map(rel).join(' → '));
          continue;
        }
        queue.push(next);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has a model file per id, each with a default export', () => {
    const models = walk(join(DEV, 'models'));
    expect(models.length).toBeGreaterThan(0);
    for (const file of models) {
      expect(rel(file), 'an id that reads well in ?m=').toMatch(/^dev\/models\/[a-z0-9]+(-[a-z0-9]+)*\.ts$/);
      expect(readFileSync(file, 'utf8'), rel(file)).toMatch(/export default defineModel\(/);
    }
  });
});
