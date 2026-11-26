// The part registry (src/scene/parts-registry.ts): every section's dictionary goes into one registry, so two sections
// that name a part with the same key would explain it in each other's words. This registers every dictionary of the
// site, the way the sections do when their code arrives, and checks that every part key written in the 3D code has a
// card.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEARBOX_PARTS } from '../src/scene/gearbox/parts.ts';
import { BODY_PARTS, CAR_PARTS } from '../src/scene/car/parts.ts';
import { SUMP_PARTS } from '../src/scene/lubrication/parts.ts';
import { PARTS } from '../src/scene/parts-info.ts';
import { partInfo, registerParts, type PartDictionary } from '../src/scene/parts-registry.ts';
import { AXLE_PARTS, SUSPENSION_PARTS, SUSPENSION_REGISTERED } from '../src/scene/suspension/parts.ts';
import { SYSTEM_PARTS } from '../src/scene/systems/parts.ts';
import { ROOT, rel } from './import-graph.ts';

/** Each section's dictionaries with the prefix its keys carry; the engines' keys have none. */
const SECTIONS: Array<{ name: string; prefix: string | null; dictionaries: PartDictionary[] }> = [
  { name: 'engines', prefix: null, dictionaries: [PARTS, SYSTEM_PARTS, SUMP_PARTS] },
  { name: 'gearboxes', prefix: 'gbx-', dictionaries: [GEARBOX_PARTS] },
  { name: 'suspensions', prefix: 'susp.', dictionaries: [SUSPENSION_REGISTERED] },
  { name: 'car', prefix: 'car.', dictionaries: [BODY_PARTS, CAR_PARTS] },
];
const PREFIXES = SECTIONS.flatMap((s) => (s.prefix ? [s.prefix] : []));

for (const section of SECTIONS) for (const dictionary of section.dictionaries) registerParts(dictionary);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** The last argument of every tag(object, 'key') call whose key is written out, with the file it is in. */
function taggedKeys(): Array<{ key: string; file: string }> {
  const found: Array<{ key: string; file: string }> = [];
  for (const file of sourceFiles(join(ROOT, 'src/scene'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?<![\w.])tag\(/g)) {
      // Walk to the call's closing bracket, keeping the start of its last top-level argument.
      let depth = 1;
      let last = match.index + match[0].length;
      let i = last;
      for (; i < text.length && depth > 0; i++) {
        const c = text[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 1) last = i + 1;
      }
      const argument = text.slice(last, i - 1).trim();
      const literal = /^'([^']+)'$/.exec(argument);
      if (literal) found.push({ key: literal[1]!, file: rel(file) });
    }
    for (const match of text.matchAll(/userData\.part = '([^']+)'/g)) found.push({ key: match[1]!, file: rel(file) });
  }
  return found;
}

describe('the part registry', () => {
  it('takes the same dictionary twice without complaint', () => {
    expect(() => registerParts(PARTS)).not.toThrow();
  });

  it('refuses a key another dictionary has, and then adds nothing of it', () => {
    const clash = { 'gbx-fresh-test-key': { name: 'x', text: 'x' }, block: { name: 'Інший блок', text: 'x' } };
    expect(() => registerParts(clash)).toThrow(/block/);
    expect(partInfo('gbx-fresh-test-key')).toBeNull();
    expect(partInfo('block')).toBe(PARTS.block);
  });

  it('takes every suspension card: a corner\'s and an axle\'s, with the corner\'s rack end', () => {
    for (const key of Object.keys({ ...AXLE_PARTS, ...SUSPENSION_PARTS })) expect(partInfo(key), key).not.toBeNull();
    expect(partInfo('susp.rack')).toBe(SUSPENSION_PARTS['susp.rack']);
  });

  it('knows nothing of a key no one registered', () => {
    expect(partInfo('no-such-part')).toBeNull();
  });

  it.each(SECTIONS.map((s) => [s.name, s] as const))('keys %s with its own prefix', (_name, section) => {
    for (const dictionary of section.dictionaries) {
      for (const key of Object.keys(dictionary)) {
        if (section.prefix) expect(key.startsWith(section.prefix), key).toBe(true);
        else expect(PREFIXES.some((p) => key.startsWith(p)), key).toBe(false);
        expect(partInfo(key), key).toBe(dictionary[key]);
      }
    }
  });

  it('has a card for every part key written in the 3D code', () => {
    const keys = taggedKeys();
    // The scan itself must see the code: every section tags its parts.
    expect(keys.length).toBeGreaterThan(40);
    for (const prefix of PREFIXES) expect(keys.some((k) => k.key.startsWith(prefix)), prefix).toBe(true);
    const missing = keys.filter((k) => !partInfo(k.key)).map((k) => `${k.file}: ${k.key}`);
    expect(missing).toEqual([]);
  });

  it('gives every card a name and a text', () => {
    for (const section of SECTIONS) {
      for (const dictionary of section.dictionaries) {
        for (const [key, info] of Object.entries(dictionary)) {
          expect(info.name.trim(), key).not.toBe('');
          expect(info.text.trim(), key).not.toBe('');
        }
      }
    }
  });
});
