// A build in a link (#/car/designer/<code>): base64url JSON of only what differs from the donor as made, with the
// nested designs as their sections' own codes, so a link stays short and each section reads its own part. Decoding
// tolerates anything: a text that is not base64url JSON gives null, and any object goes through resolveBuild (and the
// nested codes through their decoders), so the result always builds.

import { decodeDesign, encodeDesign } from '../designer/codec.ts';
import { decodeGearboxDesign, encodeGearboxDesign } from '../gearbox-designer/codec.ts';
import { decodeChassis, encodeChassis } from '../suspension-designer/codec.ts';
import type { CarBuild } from './build.ts';
import { resolveBuild } from './resolve.ts';

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (text: string): string => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Record<string, unknown>, key: string): unknown => (Object.hasOwn(o, key) ? o[key] : undefined);

export function encodeBuild(b: CarBuild): string {
  const out: Record<string, unknown> = { donor: b.donor };
  out.engine = 'catalogue' in b.engine ? { catalogue: b.engine.catalogue } : { code: encodeDesign(b.engine.design) };
  if (b.gearbox) out.gearbox = 'design' in b.gearbox ? { code: encodeGearboxDesign(b.gearbox.design) } : b.gearbox;
  if (b.finalDrive !== null) out.finalDrive = b.finalDrive;
  if (b.differential !== null) out.differential = b.differential;
  if (b.suspension) out.suspension = 'design' in b.suspension ? { code: encodeChassis(b.suspension.design) } : b.suspension;
  if (b.tyre) out.tyre = b.tyre;
  if (b.lubrication) out.lubrication = b.lubrication;
  return toBase64Url(JSON.stringify(out));
}

/** A nested code back into its design; anything else passes on for resolveBuild to judge. */
function unwrap(part: unknown, decode: (code: string) => unknown): unknown {
  if (!isObject(part)) return part;
  const code = own(part, 'code');
  if (typeof code !== 'string') return part;
  const design = decode(code);
  return design ? { design } : null;
}

/** The build of a link, resolved; null when the text is not a build at all. */
export function decodeBuild(text: string): CarBuild | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(text));
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  return resolveBuild({
    ...raw,
    engine: unwrap(own(raw, 'engine'), decodeDesign),
    gearbox: unwrap(own(raw, 'gearbox'), decodeGearboxDesign),
    suspension: unwrap(own(raw, 'suspension'), decodeChassis),
  });
}
