// The tyre scene's wheel as the 3D draws it, without WebGL (stage P11): the sidewall code builds a wheel of exactly the
// size it describes, the cut shows every layer with its card, a bias carcass loses its belt, and the scene's numbers
// follow its sliders.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const { TyreModel } = await import('../src/scene/suspension/tyre-model.ts');
const { TYRE_PARTS } = await import('../src/scene/suspension/tyre-parts.ts');
const { decodeSidewall } = await import('../src/vehicle/tyre-sidewall.ts');
const { contactPatch } = await import('../src/vehicle/tyre-patch.ts');
const { tyreAt } = await import('../src/vehicle/tyre.ts');
const { readTyre, TYRE_DEFAULT } = await import('../src/ui/suspensions/tyre-scene.ts');

const patch = contactPatch({ set: tyreAt('street', 4000).set, fz: 4000, alpha: 0.07, kappa: 0, camber: 0, freeRadiusM: 0.3266, ktNm: 280835, widthM: 0.196 });

/** Size of what is visible under `root`, scene units. */
function visibleBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    let shown = true;
    for (let p: THREE.Object3D | null = o; p && p !== root.parent; p = p.parent) shown &&= p.visible;
    const mesh = o as THREE.Mesh;
    if (shown && mesh.isMesh && mesh.userData.part === 'susp.tyre') box.expandByObject(mesh);
  });
  return box;
}

describe('the tyre scene wheel', () => {
  it('is as big as the sidewall code says', () => {
    for (const text of ['245/40 R18 97Y', '185/80 R14 90T', '315/30 R21 105Y']) {
      const code = decodeSidewall(text)!;
      const model = new TyreModel({ size: code.size, carcass: 'radial' });
      model.update({ alpha: 0, camber: 0, patch: { ...patch, deflectionM: 0 } });
      model.setView('solid');
      const box = visibleBox(model.group);
      const size = box.getSize(new THREE.Vector3());
      // Height and length of the unloaded wheel: the outer diameter, in scene units of 100 mm (to 1 mm).
      expect(size.y * 100).toBeCloseTo(code.outerDiameterMm, 0);
      expect(size.z * 100).toBeCloseTo(code.outerDiameterMm, 0);
      expect(model.outerRadiusM * 2000).toBeCloseTo(code.outerDiameterMm, 6);
      // The section is no wider than the tyre.
      expect(size.x * 100).toBeLessThanOrEqual(code.size.widthMm + 1);
      model.dispose();
    }
  });

  it('stands on the road pressed by its deflection', () => {
    const code = decodeSidewall('245/40 R18 97Y')!;
    const model = new TyreModel({ size: code.size, carcass: 'radial' });
    model.update({ alpha: 0, camber: 0, patch });
    model.setView('solid');
    const box = visibleBox(model.group);
    expect(box.min.y * 100).toBeCloseTo(-patch.deflectionM * 1000, 0);
    model.dispose();
  });

  it('builds again for a new size, and a bias carcass has no belt', () => {
    const a = decodeSidewall('245/40 R18 97Y')!;
    const b = decodeSidewall('185/80 R14 90T')!;
    const model = new TyreModel({ size: a.size, carcass: 'radial' });
    model.update({ alpha: 0, camber: 0, patch: { ...patch, deflectionM: 0 } });
    model.setLook({ size: b.size, carcass: 'bias' });
    model.setView('solid');
    expect(visibleBox(model.group).getSize(new THREE.Vector3()).y * 100).toBeCloseTo(b.outerDiameterMm, 0);
    const keys = new Set<string>();
    model.group.traverse((o) => o.userData.part && keys.add(o.userData.part as string));
    expect(keys.has('susp.tyre-belt')).toBe(false);
    model.setLook({ size: b.size, carcass: 'radial' });
    keys.clear();
    model.group.traverse((o) => o.userData.part && keys.add(o.userData.part as string));
    expect(keys.has('susp.tyre-belt')).toBe(true);
    model.dispose();
  });

  it('cuts the tyre open in the X-ray, with a card for every layer, and keeps only cords and wires in the mechanism', () => {
    const code = decodeSidewall('245/40 R18 97Y')!;
    const model = new TyreModel({ size: code.size, carcass: 'radial' });
    model.update({ alpha: 0.05, camber: -0.03, patch });
    const shown = (): Set<string> => {
      const keys = new Set<string>();
      model.group.updateMatrixWorld(true);
      model.group.traverseVisible((o) => o.userData.part && keys.add(o.userData.part as string));
      return keys;
    };
    model.setView('xray');
    const xray = shown();
    for (const key of ['susp.tyre-tread', 'susp.tyre-belt', 'susp.tyre-carcass', 'susp.tyre-bead', 'susp.tyre-sidewall', 'susp.tyre-liner', 'susp.contact-patch']) {
      expect(xray.has(key), key).toBe(true);
      expect(TYRE_PARTS[key], key).toBeTruthy();
    }
    expect(xray.has('susp.tyre')).toBe(false);
    model.setView('mechanism');
    const mech = shown();
    expect(mech.has('susp.tyre-tread')).toBe(false);
    expect(mech.has('susp.tyre-carcass')).toBe(true);
    expect(mech.has('susp.wheel')).toBe(false);
    model.setView('solid');
    expect(shown().has('susp.tyre-tread')).toBe(false);
    expect(shown().has('susp.tyre')).toBe(true);
    model.dispose();
  });
});

describe('the tyre scene numbers', () => {
  it('reads the patch off the wheel the sidewall code builds, and the pressure off the shared stiffness law', () => {
    const base = readTyre(TYRE_DEFAULT);
    expect(base.code.outerDiameterMm).toBeCloseTo(653.2, 6);
    const small = readTyre({ ...TYRE_DEFAULT, code: '185/80 R14 90T' });
    expect(small.patch.widthM).toBeLessThan(base.patch.widthM);
    // +10 % pressure: +8 % vertical stiffness, a shorter patch.
    const pumped = readTyre({ ...TYRE_DEFAULT, pressurePct: 10 });
    expect(pumped.ktNm / base.ktNm).toBeCloseTo(1.08, 9);
    expect(pumped.patch.lengthM).toBeLessThan(base.patch.lengthM);
    // A code that is not one falls back to the default wheel rather than breaking the scene.
    expect(readTyre({ ...TYRE_DEFAULT, code: 'nonsense' }).code.outerDiameterMm).toBeCloseTo(653.2, 6);
  });

  it('slides more of the patch at a larger slip angle', () => {
    const shares = [1, 3, 5, 7, 9].map((alphaDeg) => readTyre({ ...TYRE_DEFAULT, alphaDeg }).patch.adhesion);
    for (let i = 1; i < shares.length; i++) expect(shares[i]!).toBeLessThan(shares[i - 1]!);
  });
});
