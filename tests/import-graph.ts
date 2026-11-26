// The site's import graph read from the sources, for the tests of what reaches what: which dictionaries are
// registered before a file can run (i18n.test.ts), and what the audio worklet pulls in (worklet-imports.test.ts).
// Imports only of types are left out: they are erased and load nothing.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const ROOT = join(import.meta.dirname, '..');
export const rel = (file: string): string => relative(ROOT, file).split('\\').join('/');

export interface ImportEdge {
  /** Repo-relative path of the imported TypeScript file. */
  to: string;
  /** import('…'): a chunk of its own that loads later. */
  dynamic: boolean;
  /** For import('…') inside withDictionaries([…], () => import('…')): the dictionaries registered before it. */
  dictionaries: string[];
}

const STATIC = /^[ \t]*(?:import|export)[ \t]+(?!type[ \t{*])(?:[^;=()'"]*?[ \t\n}*]from[ \t]*)?['"]([^'"]+)['"]/gm;
const DYNAMIC = /(?<!typeof\s*)\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const WITH_DICTIONARIES = /withDictionaries\(\s*\[([^\]]*)\]\s*,\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Whole lines of comment go: they may name an import as an example. */
const code = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

const resolveFrom = (file: string, spec: string): string | null => {
  // A worker's own bundle (?worker&url) is a URL here, not code of this graph.
  if (!spec.startsWith('.') || spec.includes('?')) return null;
  const target = join(dirname(join(ROOT, file)), spec);
  return target.endsWith('.ts') && existsSync(target) ? rel(target) : null;
};

const cache = new Map<string, ImportEdge[]>();

/** The imports of a repo-relative TypeScript file that load code. */
export function importsOf(file: string): ImportEdge[] {
  const known = cache.get(file);
  if (known) return known;
  const text = code(readFileSync(join(ROOT, file), 'utf8'));
  const edges: ImportEdge[] = [];
  for (const m of text.matchAll(STATIC)) {
    const to = resolveFrom(file, m[1]!);
    if (to) edges.push({ to, dynamic: false, dictionaries: [] });
  }
  const named = new Map<number, string[]>();
  for (const m of text.matchAll(WITH_DICTIONARIES)) {
    const at = m.index! + m[0].lastIndexOf('import(');
    named.set(at, [...m[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((n) => n[1]!));
  }
  for (const m of text.matchAll(DYNAMIC)) {
    const to = resolveFrom(file, m[1]!);
    if (to) edges.push({ to, dynamic: true, dictionaries: named.get(m.index!) ?? [] });
  }
  cache.set(file, edges);
  return edges;
}

/** Every file reachable from `start` by imports that load code, static ones only unless `dynamic` is set. */
export function reachable(start: string, dynamic = false): Map<string, string | null> {
  const from = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift()!;
    for (const edge of importsOf(file)) {
      if ((!dynamic && edge.dynamic) || from.has(edge.to)) continue;
      from.set(edge.to, file);
      queue.push(edge.to);
    }
  }
  return from;
}

/** The chain of imports from the start to a file found by reachable(). */
export function chain(from: Map<string, string | null>, file: string): string {
  const path = [file];
  for (let at = from.get(file); at; at = from.get(at) ?? null) path.unshift(at);
  return path.join(' → ');
}

/**
 * For every file the site loads from `start`, the dictionaries surely registered before it runs: a dynamic import
 * inside withDictionaries adds its names to those of the importer, and a file reached along several ways keeps only
 * what all of them have, since any of them may come first.
 */
export function dictionariesBefore(start: string): Map<string, Set<string>> {
  const known = new Map<string, Set<string>>([[start, new Set()]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift()!;
    const have = known.get(file)!;
    for (const edge of importsOf(file)) {
      const offered = new Set([...have, ...edge.dictionaries]);
      const before = known.get(edge.to);
      const after = before ? new Set([...before].filter((name) => offered.has(name))) : offered;
      if (before && after.size === before.size) continue;
      known.set(edge.to, after);
      queue.push(edge.to);
    }
  }
  return known;
}
