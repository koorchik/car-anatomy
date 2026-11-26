// A chassis design in a link: only what differs from the default design, as base64url JSON, so links stay short. The
// same principle as the engine designer's codec (src/designer/codec.ts). Decoding tolerates anything: a text that is
// not base64url JSON gives null, and any object goes through resolveChassis, which drops unknown keys and prototypes,
// takes the default for a wrong type and clamps every number, so the result always builds.

import { DEFAULT_CHASSIS } from './defaults.ts';
import { resolveChassis } from './constraints.ts';
import type { ChassisDesign } from './design.ts';

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (text: string): string => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
};

export function encodeChassis(d: ChassisDesign): string {
  const diff: Record<string, unknown> = {};
  const base = DEFAULT_CHASSIS as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(d)) {
    if (Object.hasOwn(base, key) && value !== base[key]) diff[key] = value;
  }
  return toBase64Url(JSON.stringify(diff));
}

/** The design of a link, resolved; null when the text is not a design at all. */
export function decodeChassis(text: string): ChassisDesign | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(text));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return resolveChassis(raw);
}
