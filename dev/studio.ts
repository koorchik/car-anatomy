// The light of the site's Stage (src/scene/stage.ts), which the viewer must not import: the shell rewrites Stage while
// the 3D stages are checked here. Keep the two in step until Stage takes its lighting from a shared module.

import * as THREE from 'three';

/** Studio lighting captured as an environment map, so metal has something to reflect. */
function buildStudioEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#10262e');
  const panel = (color: string, intensity: number, w: number, h: number, x: number, y: number, z: number): void => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel('#fff4e4', 7, 8, 5, 0, 9, 2); // overhead softbox
  panel('#ffe2c4', 4, 3, 9, -9, 2, 4); // warm side
  panel('#a9dcf0', 3.2, 3, 9, 9, 2, -3); // cool side
  panel('#d6f1ff', 1.8, 10, 1.5, 0, 1, -9.5); // rim strip
  panel('#3e6a78', 1, 20, 20, 0, -7, 0); // floor bounce
  panel('#bcd6df', 1.5, 14, 8, 0, 1, 10); // large front fill, so metal facing the viewer isn't black
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.035).texture;
  pmrem.dispose();
  return env;
}

const KEY_OFFSET = new THREE.Vector3(5, 9, 6);

/** Renderer, environment, key and rim light, and a floor that catches shadows: the same as on the site. */
export class Studio {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly key: THREE.DirectionalLight;
  private readonly floor: THREE.Mesh;
  /** 100 mm cells, two metres across: a second way to read size besides the scale bar. */
  readonly grid: THREE.GridHelper;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene.environment = buildStudioEnv(this.renderer);
    this.scene.environmentIntensity = 0.95;

    this.key = new THREE.DirectionalLight('#fff1e0', 2.1);
    this.key.position.copy(KEY_OFFSET);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 5;
    this.scene.add(this.key);
    const rim = new THREE.DirectionalLight('#a7dcf0', 0.85);
    rim.position.set(-6, 3, -6);
    this.scene.add(rim);

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.42, color: '#04141a' }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.grid = new THREE.GridHelper(20, 20, '#6f97a3', '#3d6672');
    const gridMaterial = this.grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.35;
    gridMaterial.depthWrite = false;
    this.grid.raycast = () => {};
    this.grid.visible = false;
    this.scene.add(this.grid);
  }

  /** Puts the floor under the model and points the shadow camera at it, as Stage.fit does. */
  place(groundY: number, target: THREE.Vector3, radius: number): void {
    this.floor.position.y = groundY - 0.02;
    this.grid.position.y = groundY - 0.019;
    const s = radius * 1.7;
    const cam = this.key.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.near = 0.5;
    cam.far = 40;
    cam.updateProjectionMatrix();
    this.key.position.copy(target).add(KEY_OFFSET);
    this.key.target.position.copy(target);
    this.key.target.updateMatrixWorld();
  }
}
