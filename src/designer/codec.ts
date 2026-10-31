// A design in a link: only what differs from the default, so links stay short.

import { resolveDesign } from './constraints.ts';
import { DEFAULT_DESIGN, type Design } from './design.ts';

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (text: string): string => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
};

export function encodeDesign(d: Design): string {
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(d)) {
    if (key === 'throws') continue;
    if (value !== (DEFAULT_DESIGN as unknown as Record<string, unknown>)[key]) diff[key] = value;
  }
  // The crank table is only worth storing when it can't be regenerated from its preset.
  if (d.crankPreset === 'custom') diff.throws = d.throws.map((t) => [Math.round(t.pin * 10) / 10, t.turn]);
  return toBase64Url(JSON.stringify(diff));
}

/** Tolerates anything: unknown keys are dropped, wrong types fall back, and the result is always buildable. */
export function decodeDesign(text: string): Design | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(text));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const out: Design = { ...DEFAULT_DESIGN, throws: [] };
  const target = out as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(input)) {
    if (key === 'throws' || !(key in DEFAULT_DESIGN)) continue;
    // Optional fields start as null, so their type can't be compared. resolveDesign checks them instead.
    if (typeof value === typeof target[key] || target[key] === null) target[key] = value;
  }
  if (Array.isArray(input.throws)) {
    out.throws = input.throws
      .filter((t): t is [number, number] => Array.isArray(t) && typeof t[0] === 'number')
      .map(([pin, turn]) => ({ pin, turn: turn ? 1 : 0 }));
  }
  return resolveDesign(out);
}
