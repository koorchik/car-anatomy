// The code moulded on a tyre's sidewall, read the way the tyre scene explains it: «245/40 R18 97Y» is a section width
// of 245 mm, a sidewall 40 % of it high (98 mm), radial construction, an 18-inch rim, load index 97 (730 kg per tyre)
// and speed symbol Y (300 km/h). The wheel's outer diameter (653 mm) follows from the same numbers, and the 3D wheel of
// the scene is built from the TyreSize this returns, so the picture and the decoder cannot disagree. No DOM and no text:
// names of the parts live in the UI.
//
// Tables: load index (LI 50–130) and speed symbols as in the ETRTO tables reproduced by Wikipedia, «Tire code», read
// 2026-11-26 (secondary source: the ETRTO standards manual and UN Regulation 30 annexes are not openly readable).

import { outerDiameterM, type TyreSize } from './tyre-size.ts';

/** How the carcass plies run: R radial; D diagonal (cross-ply), also written as a dash; B bias-belted. */
export type Construction = 'radial' | 'bias' | 'bias-belted';

/** Load per tyre, kg, for load index 50–130 (the passenger-car and light-truck range). */
export const LOAD_INDEX_KG: Readonly<Record<number, number>> = {
  50: 190, 51: 195, 52: 200, 53: 206, 54: 212, 55: 218, 56: 224, 57: 230, 58: 236, 59: 243,
  60: 250, 61: 257, 62: 265, 63: 272, 64: 280, 65: 290, 66: 300, 67: 307, 68: 315, 69: 325,
  70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437,
  80: 450, 81: 462, 82: 475, 83: 487, 84: 500, 85: 515, 86: 530, 87: 545, 88: 560, 89: 580,
  90: 600, 91: 615, 92: 630, 93: 650, 94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775,
  100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000, 109: 1030,
  110: 1060, 111: 1090, 112: 1120, 113: 1150, 114: 1180, 115: 1215, 116: 1250, 117: 1285, 118: 1320, 119: 1360,
  120: 1400, 121: 1450, 122: 1500, 123: 1550, 124: 1600, 125: 1650, 126: 1700, 127: 1750, 128: 1800, 129: 1850,
  130: 1900,
};

/**
 * Highest speed for each speed symbol, km/h; `above` marks the open-ended ones ((W), (Y) and the old Z in «ZR»), whose
 * number is the bound the tyre is rated over, not its limit.
 */
export const SPEED_SYMBOL_KMH: Readonly<Record<string, { kmh: number; above?: true }>> = {
  L: { kmh: 120 }, M: { kmh: 130 }, N: { kmh: 140 }, P: { kmh: 150 }, Q: { kmh: 160 }, R: { kmh: 170 },
  S: { kmh: 180 }, T: { kmh: 190 }, U: { kmh: 200 }, H: { kmh: 210 }, V: { kmh: 240 }, Z: { kmh: 240, above: true },
  W: { kmh: 270 }, '(W)': { kmh: 270, above: true }, Y: { kmh: 300 }, '(Y)': { kmh: 300, above: true },
};

/** The letter printed before the R on codes before 1991 (SR, HR, VR, ZR): VR meant over 210 km/h, not 240. */
export const OLD_SPEED_KMH: Readonly<Record<string, { kmh: number; above?: true }>> = {
  S: { kmh: 180 }, H: { kmh: 210 }, V: { kmh: 210, above: true }, Z: { kmh: 240, above: true },
};

export interface SidewallCode {
  size: TyreSize;
  construction: Construction;
  /** Sidewall height, mm: width × aspect / 100. */
  sidewallMm: number;
  /** Rim diameter, mm. */
  rimMm: number;
  /** Unloaded outer diameter of the wheel, mm: the rim plus two sidewalls. */
  outerDiameterMm: number;
  /** Load index and the load it stands for, kg per tyre; null when the code has none or it is off the table. */
  loadIndex: number | null;
  loadKg: number | null;
  /** Speed symbol as printed after the load index ('Y', '(Y)'), or the letter before the R on an old code ('Z'). */
  speedSymbol: string | null;
  speedKmh: number | null;
  /** True when speedKmh is a bound the tyre is rated above. */
  speedAbove: boolean;
}

// Width / aspect, an optional old speed letter, the construction (R, D, B or a dash; «R-18» as some makers print it),
// the rim, the C of a van tyre, then whatever follows.
const CODE = /^\s*(?:P|LT)?\s*(\d{3})\s*\/\s*(\d{2})\s*([SHVZ]?)\s*(R|D|B|-)\s*-?\s*(\d{2}(?:\.\d)?)(?![\d.])\s*C?(?![A-Z])(.*)$/;
// The service description after the rim: a load index and a speed symbol, «97Y», or open-ended in parentheses, «(97Y)»
// or «97(Y)». A van tyre gives two indices, single and dual fitting, «104/102R»: the first is the tyre's own.
const SERVICE = /^(\()?(\d{2,3})(?:\/\d{2,3})?(\()?([A-Z])?\)?$/;
// Marks printed after the service description that change none of its numbers: XL or RF (reinforced: the load index
// already says how much more it carries), SL (standard load).
const TRAILING = /(?:XL|RF|SL|REINFORCED|EXTRALOAD)$/;

/** Reads a sidewall code; null for anything that is not one, so the visitor's typing never throws. */
export function decodeSidewall(code: string): SidewallCode | null {
  const m = CODE.exec(code.toUpperCase());
  if (!m) return null;
  const widthMm = Number(m[1]);
  const aspect = Number(m[2]);
  const rimIn = Number(m[5]);
  if (widthMm < 100 || aspect < 20 || rimIn < 8 || rimIn > 26) return null;
  const rest = m[6]!.replace(/\s+/g, '').replace(TRAILING, '');
  const service = rest ? SERVICE.exec(rest) : null;
  if (rest && !service) return null;
  const oldSpeed = m[3] ?? '';
  const size: TyreSize = { widthMm, aspect, rimIn, speed: oldSpeed };
  const construction: Construction = m[4] === 'R' ? 'radial' : m[4] === 'B' ? 'bias-belted' : 'bias';
  const loadIndex = service ? Number(service[2]) : null;
  const loadKg = loadIndex !== null ? (LOAD_INDEX_KG[loadIndex] ?? null) : null;
  const letter = service?.[4];
  const open = Boolean(service?.[1] || service?.[3]);
  const speedSymbol = letter ? (open && SPEED_SYMBOL_KMH[`(${letter})`] ? `(${letter})` : letter) : oldSpeed || null;
  const speed = letter ? SPEED_SYMBOL_KMH[speedSymbol!] : oldSpeed ? OLD_SPEED_KMH[oldSpeed] : undefined;
  return {
    size,
    construction,
    sidewallMm: (widthMm * aspect) / 100,
    rimMm: rimIn * 25.4,
    outerDiameterMm: outerDiameterM(size) * 1000,
    loadIndex,
    loadKg,
    speedSymbol: speed ? speedSymbol : null,
    speedKmh: speed ? speed.kmh : null,
    speedAbove: speed?.above === true,
  };
}
