// Tyre sizes as printed on the sidewall and in makers' data: '245/30 R20', '235/40 ZR 19', '245/40 R18 97W'.
// A record stores the size, never a radius: radii come from here, so they cannot disagree with the size.

export interface TyreSize {
  /** Section width, mm. */
  widthMm: number;
  /** Sidewall height as a percentage of the width. */
  aspect: number;
  /** Rim diameter, inches. */
  rimIn: number;
  /** Speed letters printed before the R ('Z', 'V'), empty when there are none. */
  speed: string;
}

const SIZE = /^\s*(\d{3})\s*\/\s*(\d{2})\s*([A-Z]?)\s*R\s*(\d{2}(?:\.\d)?)\b/;

/** Reads a metric size. Throws on anything else, so a mistyped record fails its test instead of rolling wrong. */
export function parseTyreSize(size: string): TyreSize {
  const m = SIZE.exec(size);
  if (!m) throw new Error(`Not a tyre size: ${size}`);
  return { widthMm: Number(m[1]), aspect: Number(m[2]), rimIn: Number(m[4]), speed: m[3]! };
}

/** Unloaded outer diameter, m: the rim plus two sidewalls. */
export const outerDiameterM = (s: TyreSize): number => (s.rimIn * 25.4 + (2 * s.widthMm * s.aspect) / 100) / 1000;

/** Share of the unloaded radius the tyre rolls on under load (docs/vehicle-model.md). */
export const ROLLING_SHARE = 0.97;

/** Rolling radius, m: 0.97 of half the outer diameter. */
export const rollingRadiusM = (s: TyreSize): number => (ROLLING_SHARE * outerDiameterM(s)) / 2;
