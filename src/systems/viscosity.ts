// Oil viscosity over temperature by Walther's equation (ASTM D341): lg lg(nu + 0.7) = A - B lg T.
// Fitted through two points of a 5W-30 data sheet (Royal Purple): 62.4 mm2/s at 40 C and 10.54 mm2/s at 100 C.

const NU40 = 62.4;
const NU100_SHEET = 10.54;

const lglg = (nu: number): number => Math.log10(Math.log10(nu + 0.7));
const lgT = (tC: number): number => Math.log10(tC + 273.15);

const B = (lglg(NU40) - lglg(NU100_SHEET)) / (lgT(100) - lgT(40));
const A = lglg(NU40) + B * lgT(40);

/** Kinematic viscosity, mm2/s. Density barely changes (5 %), so dynamic viscosity follows it. */
export function viscosity(tC: number): number {
  const t = Math.max(tC, -40);
  return 10 ** 10 ** (A - B * lgT(t)) - 0.7;
}

export const NU100 = viscosity(100);

/** How many times thicker than at 100 C. */
export const viscosityRatio = (tC: number): number => viscosity(tC) / NU100;
