// The tyre scene's wheel (stage P11): built from a sidewall code, cut open in the X-ray to show its layers, on a glass
// road with the contact patch the brush model paints for the load, the slip angle and the camber.

import { TyreModel, type Carcass } from '../../src/scene/suspension/tyre-model.ts';
import { TYRE_PARTS } from '../../src/scene/suspension/tyre-parts.ts';
import { tyreAt } from '../../src/vehicle/tyre.ts';
import { tyreVertical, verticalStiffness } from '../../src/vehicle/tyre-data.ts';
import { contactPatch } from '../../src/vehicle/tyre-patch.ts';
import { decodeSidewall } from '../../src/vehicle/tyre-sidewall.ts';
import { defineModel, type Values } from '../model-api.ts';

const DEG = Math.PI / 180;
const CODES = ['245/40 R18 97Y', '185/80 R14', '205/55 R16 91V', '315/30 R21 105Y'];

export default defineModel({
  title: 'Шина в розрізі',
  defaults: { view: 'xray' },
  controls: [
    { key: 'code', label: 'Розмір', kind: 'choice', value: CODES[0]!, rebuild: true, options: CODES.map((c) => ({ value: c, label: c })) },
    { key: 'carcass', label: 'Каркас', kind: 'choice', buttons: true, value: 'radial', rebuild: true, options: [{ value: 'radial', label: 'Радіальна' }, { value: 'bias', label: 'Діагональна' }] },
    { key: 'load', label: 'Навантаження, кН', kind: 'range', min: 2, max: 8, step: 0.1, value: 4 },
    { key: 'alpha', label: 'Кут відведення, °', kind: 'range', min: 0, max: 15, step: 0.1, value: 4 },
    { key: 'camber', label: 'Розвал, °', kind: 'range', min: -5, max: 3.5, step: 0.1, value: 0 },
  ],
  create(values) {
    const code = decodeSidewall(values.code as string)!;
    const model = new TyreModel({ size: code.size, carcass: values.carcass as Carcass });
    const tyre = tyreAt('street', 4000);
    const vertical = tyreVertical('street');
    const draw = (v: Values): void => {
      const patch = contactPatch({
        set: tyre.set,
        fz: (v.load as number) * 1000,
        alpha: (v.alpha as number) * DEG,
        kappa: 0,
        camber: (v.camber as number) * DEG,
        freeRadiusM: code.outerDiameterMm / 2000,
        ktNm: verticalStiffness(vertical, vertical.nominalBar),
        widthM: (code.size.widthMm / 1000) * 0.8,
      });
      model.update({ alpha: (v.alpha as number) * DEG, camber: (v.camber as number) * DEG, patch });
    };
    draw(values);
    return {
      group: model.group,
      groundY: 0,
      home: [0.8, -0.28, 0.55],
      set: (_key, next) => draw(next),
      setView: (view) => model.setView(view),
      setExplode: (amount) => model.setExplode(amount),
      part: (key) => TYRE_PARTS[key],
      dispose: () => model.dispose(),
    };
  },
});
