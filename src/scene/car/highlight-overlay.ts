// A tint laid over some parts of a model without touching the model's materials: for the systems of a car that are a
// part of one section's model (the wheels and the brakes of the chassis, the final drive in the gearbox's case). Each
// tinted mesh gets a child that shares its geometry and draws it once more in the system's colour, added to what is
// there; the child moves with its mesh and hides with it. An instanced mesh's child shares its instance matrices and
// gives the instances of other systems black, which adds nothing, so one draw tints exactly the instances asked for.
// The children take no part in picking.

import * as THREE from 'three';

/** Over every band of the car's glass (the body shell draws at 90), so the tint shows through it. */
const OVERLAY_ORDER = 95;

export class HighlightOverlay {
  private readonly children: THREE.Mesh[] = [];
  private readonly material: THREE.MeshBasicMaterial;

  /** `parts` is the mesh to tint and, for an instanced mesh, which of its instances. */
  constructor(parts: ReadonlyArray<{ mesh: THREE.Mesh; instances?: readonly number[] }>, color: THREE.ColorRepresentation) {
    this.material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // Drawn on the very surface it tints: pulled a little toward the camera so the depth test lets it through.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    for (const { mesh, instances } of parts) {
      let child: THREE.Mesh;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const source = mesh as THREE.InstancedMesh;
        const instanced = new THREE.InstancedMesh(source.geometry, this.material, source.count);
        instanced.instanceMatrix = source.instanceMatrix;
        const on = new Set(instances ?? []);
        const colors = new Float32Array(source.count * 3);
        for (let i = 0; i < source.count; i++) if (on.has(i)) colors.set([1, 1, 1], i * 3);
        instanced.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        instanced.frustumCulled = false;
        child = instanced;
      } else {
        child = new THREE.Mesh(mesh.geometry, this.material);
      }
      child.renderOrder = OVERLAY_ORDER;
      child.raycast = () => {};
      child.castShadow = false;
      child.receiveShadow = false;
      child.userData.noFit = true;
      mesh.add(child);
      this.children.push(child);
    }
  }

  /** Takes the tint off and frees what it made (the shared geometry stays its mesh's). */
  dispose(): void {
    for (const child of this.children) child.removeFromParent();
    this.children.length = 0;
    this.material.dispose();
  }
}
