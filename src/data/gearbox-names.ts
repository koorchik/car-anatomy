// The maker's name of each gearbox page's own gearbox, the same in every language. A link from another section (the
// gearbox row of an engine article) names the gearbox from here, without loading the gearbox data and its text; the
// page's record takes its name from here too, so the two cannot differ. One line per page and per variant.

export const GEARBOX_PAGE_NAMES: Readonly<Record<string, string>> = {
  'manual-rwd': 'Getrag 265/5',
  'manual-transaxle': 'Honda 6MT',
  'manual-transaxle/porsche-911-carrera-t-992': 'Porsche 7MT',
  automatic: 'ZF 8HP51',
};
