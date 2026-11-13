// Road surfaces as a share of the dry friction of the same tyre, per wheel (the differential page puts the left and
// the right wheels on different ones). Estimates [T]: textbook shares, docs/vehicle-model.md.

export type SurfaceId = 'dry' | 'wet' | 'snow' | 'ice';

export const SURFACE_MU: Readonly<Record<SurfaceId, number>> = { dry: 1, wet: 0.7, snow: 0.3, ice: 0.1 };

export const SURFACE_IDS: readonly SurfaceId[] = ['dry', 'wet', 'snow', 'ice'];
