// A gearbox design in a link: only what differs from the starting design, so links stay short. Decoding tolerates
// anything: unknown keys are dropped, wrong types fall back to the default, and resolveGearboxDesign checks the rest
// as it checks everything a link carries, so a broken or old link never breaks the page.

import { resolveGearboxDesign } from './constraints.ts';
import { DEFAULT_GEARBOX_DESIGN, type GearboxDesign } from './design.ts';

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (text: string): string => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function encodeGearboxDesign(d: GearboxDesign): string {
  const diff: Record<string, unknown> = {};
  const base = DEFAULT_GEARBOX_DESIGN as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(d)) if (!same(value, base[key])) diff[key] = value;
  return toBase64Url(JSON.stringify(diff));
}

/** Fields that may be null or hold an object or a list; resolveGearboxDesign checks what is inside. */
const LOOSE = new Set(['ratios', 'pairs', 'mainPair', 'reverse', 'finalPair', 'cones', 'factory']);

/** Null when the text is not a design at all; otherwise a resolved design. */
export function decodeGearboxDesign(text: string): GearboxDesign | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(text));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out = { ...DEFAULT_GEARBOX_DESIGN } as unknown as Record<string, unknown>;
  const base = DEFAULT_GEARBOX_DESIGN as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.hasOwn(base, key)) continue;
    if (LOOSE.has(key) || typeof value === typeof base[key]) out[key] = value;
  }
  // A link that changes the number of gears without its lists gets the default lists resized by the resolver.
  return resolveGearboxDesign(out as unknown as GearboxDesign);
}
