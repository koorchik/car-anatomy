// Brings the model's full-load curve to the figures a catalogue article quotes, so the dyno on that page reads the
// same numbers as the article. Used on catalogue pages only: the designer always shows the model as it is.
//
// One factor scales the whole curve, and the published torque and power then act as ceilings: where the scaled
// model would go above either, the curve follows that line instead. Below the ceilings the shape is the model's.
// Both published peaks are met, and the curve never claims more than the maker does. A linear tilt between the two
// peaks was tried first and could not meet both on engines whose model torque peak sits close to the power peak.

import type { PublishedFigures } from './design.ts';
import type { RpmPoint } from './physics.ts';

const HP_PER_KW = 1.35962;
const RPM_PER_KW_NM = 9549.296585513721;
const K_MIN = 0.5;
const K_MAX = 1.6;

export interface Anchor {
  /** Factor on the whole curve. */
  scale: number;
  /** Ceiling from the published torque, N·m, or null when no torque is published. */
  torqueCapNm: number | null;
  /** Ceiling from the published power, kW. */
  powerCapKw: number | null;
  /** The factor hit its limit, so the curve only partly reaches the published figures. */
  clamped: boolean;
  /** The model's own peaks. */
  modelHp: number;
  modelNm: number;
}

/** The model as it is. */
export function noAnchor(points: RpmPoint[]): Anchor {
  const modelNm = Math.max(...points.map((p) => p.torqueNm));
  const modelKw = Math.max(...points.map((p) => p.powerKw));
  return { scale: 1, torqueCapNm: null, powerCapKw: null, clamped: false, modelHp: modelKw * HP_PER_KW, modelNm };
}

/** Torque of the anchored curve where the model gives `modelNm`. */
export function anchoredTorque(a: Anchor, rpm: number, modelNm: number): number {
  let v = a.scale * modelNm;
  if (a.torqueCapNm !== null) v = Math.min(v, a.torqueCapNm);
  if (a.powerCapKw !== null && rpm > 0) v = Math.min(v, (a.powerCapKw * RPM_PER_KW_NM) / rpm);
  return v;
}

export function anchorFor(points: RpmPoint[], published: PublishedFigures | null): Anchor {
  const plain = noAnchor(points);
  if (!published || !(published.powerHp > 0) || !(plain.modelNm > 0) || !(plain.modelHp > 0)) return plain;
  const wantKw = published.powerHp / HP_PER_KW;
  const wantNm = published.torqueNm !== null && published.torqueNm > 0 ? published.torqueNm : null;
  const kPower = wantKw / (plain.modelHp / HP_PER_KW);
  let scale = wantNm === null ? kPower : Math.max(wantNm / plain.modelNm, kPower);
  let a: Anchor = { ...plain, scale, torqueCapNm: wantNm, powerCapKw: wantKw };
  // The ceilings can cut a peak short when one figure would need the other's speed. Raise the factor until both
  // published figures are reached somewhere on the curve.
  for (let pass = 0; pass < 40; pass++) {
    let nm = 0;
    let kw = 0;
    for (const p of points) {
      const v = anchoredTorque(a, p.rpm, p.torqueNm);
      nm = Math.max(nm, v);
      kw = Math.max(kw, (v * p.rpm) / RPM_PER_KW_NM);
    }
    const short = Math.max(wantNm === null ? 1 : wantNm / nm, wantKw / kw);
    if (short < 1 + 1e-4) break;
    scale *= short;
    a = { ...a, scale };
  }
  const limited = Math.min(K_MAX, Math.max(K_MIN, scale));
  return { ...a, scale: limited, clamped: limited !== scale };
}
