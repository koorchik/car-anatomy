// The model viewer: one 3D model without the site around it, for checking a model before any page shows it.
// Open /dev/models.html?m=<id> on the dev server. Models register themselves as dev/models/<id>.ts (see model-api.ts),
// picked up here with import.meta.glob. Every control and the camera are kept in the address, so a shot repeats.
//
// It must not import src/main.ts, src/ui/ or src/scene/stage.ts (tests/dev-viewer.test.ts), and vite build leaves
// it out: only index.html is an entry.

import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import './models.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RESERVED_KEYS, type Control, type ModelDef, type PartCard, type Value, type Values, type ViewerModel } from './model-api.ts';
import { Studio } from './studio.ts';
import type { ViewMode } from '../src/scene/model-types.ts';

// The cast and crinkle bump maps of the engine materials are noise. Seeded, they come out the same on every load,
// and so does a shot.
let seed = 1;
Math.random = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const MODULES = import.meta.glob<{ default: ModelDef }>('./models/*.ts');
const MODEL_IDS = Object.keys(MODULES)
  .map((path) => path.slice('./models/'.length, -'.ts'.length))
  .sort();

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const flag = (key: string): boolean => params.get(key) === '1';

const DEG = Math.PI / 180;
/** How much of the free area the model's bounding sphere fills, as Stage.fitScale. */
const FIT = 0.8;
const HOME: [number, number, number] = [0.82, 0.42, 0.92];
const PRESETS: Array<{ name: string; label: string; dir: [number, number, number] | null }> = [
  { name: 'home', label: 'Дім', dir: null },
  { name: 'front', label: 'Спереду', dir: [0, 0, 1] },
  { name: 'side', label: 'Збоку', dir: [1, 0, 0] },
  { name: 'rear', label: 'Ззаду', dir: [0, 0, -1] },
  { name: 'top', label: 'Зверху', dir: [0, 1, 0.001] },
];
const SCALE_STEPS_CM = [1, 2, 5, 10, 20, 50, 100, 200, 500];

// ---- Scene ----

const canvas = $<HTMLCanvasElement>('canvas');
const studio = new Studio(canvas);
const { renderer, scene } = studio;
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
camera.position.set(6, 3.2, 7);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.98;
controls.zoomSpeed = 1.4;

// ---- State ----

interface Loaded {
  id: string;
  def: ModelDef;
  /** The model's own controls, then the viewer's for what the model can do. */
  controls: Control[];
  values: Values;
  model: ViewerModel;
}

let current: Loaded | null = null;
let time = 0;
let still = flag('still');
let keepCamera = false;
/** The camera was moved by hand or by the address, so it is written back to the address. */
let cameraSet = params.has('cam') || params.has('dist') || params.has('at');
/** Where fitting put the target, to tell a pan from it. */
const fittedTarget = new THREE.Vector3();

const viewerApi = {
  ready: false,
  frames: 0,
  ids: MODEL_IDS,
  scene,
  camera,
  controls,
  renderer,
  studio,
  get model(): ViewerModel | null {
    return current?.model ?? null;
  },
  get values(): Values {
    return { ...(current?.values ?? {}) };
  },
  /** Same as moving a control by hand. */
  set: (key: string, value: Value): void => {
    change(key, value);
    renderPanel();
  },
  /** home, front, side, rear or top. */
  cameraPreset: (preset: string): void => applyPreset(preset),
  pause: (on: boolean): void => setStill(on),
};
(window as unknown as { __viewer: typeof viewerApi }).__viewer = viewerApi;

// ---- Values and the address ----

function parseValue(c: Control, raw: string | null): Value {
  if (raw === null) return c.value;
  switch (c.kind) {
    case 'range': {
      const v = Number(raw);
      return Number.isFinite(v) ? Math.min(c.max, Math.max(c.min, v)) : c.value;
    }
    case 'toggle':
      return raw === '1' || raw === 'true';
    case 'choice':
      return c.options.some((o) => o.value === raw) ? raw : c.value;
  }
}

const formatValue = (v: Value): string => (typeof v === 'boolean' ? (v ? '1' : '0') : String(v));

/** The viewer's own controls, for what this model can do. */
function builtinControls(def: ModelDef, model: ViewerModel): Control[] {
  const list: Control[] = [];
  if (model.setView) {
    list.push({
      key: 'view',
      label: 'Вигляд',
      kind: 'choice',
      buttons: true,
      value: def.defaults?.view ?? 'solid',
      options: [
        { value: 'solid', label: 'Ззовні' },
        { value: 'xray', label: 'Рентген' },
        { value: 'mechanism', label: 'Механізм' },
      ],
    });
  }
  if (model.setExplode) list.push({ key: 'explode', label: 'Розбирання', kind: 'range', min: 0, max: 1, step: 0.01, value: def.defaults?.explode ?? 0 });
  if (model.setHighlight) list.push({ key: 'highlight', label: 'Підсвітка', kind: 'toggle', value: false });
  if (model.setGhost) list.push({ key: 'ghost', label: 'Привид', kind: 'range', min: 0, max: 1, step: 0.01, value: 1 });
  return list;
}

const isBuiltin = (key: string): boolean => key === 'view' || key === 'explode' || key === 'highlight' || key === 'ghost';

function applyBuiltin(model: ViewerModel, key: string, value: Value, initial: boolean): void {
  if (key === 'view') model.setView?.(value as ViewMode);
  else if (key === 'explode') model.setExplode?.(value as number);
  // A model starts unlit and solid: only a change is passed on.
  else if (key === 'highlight' && (!initial || value)) model.setHighlight?.(value as boolean);
  else if (key === 'ghost' && (!initial || value !== 1)) model.setGhost?.(value as number);
}

let addressTimer = 0;
function writeAddress(): void {
  window.clearTimeout(addressTimer);
  addressTimer = window.setTimeout(() => {
    if (!current) return;
    const out = new URLSearchParams();
    out.set('m', current.id);
    for (const c of current.controls) {
      const v = current.values[c.key]!;
      if (v !== c.value) out.set(c.key, formatValue(v));
    }
    if (cameraSet) {
      const dir = camera.position.clone().sub(controls.target);
      const dist = dir.length();
      dir.normalize();
      out.set('cam', [dir.x, dir.y, dir.z].map((v) => v.toFixed(3)).join(','));
      out.set('dist', dist.toFixed(3));
      if (controls.target.distanceTo(fittedTarget) > 1e-3) out.set('at', [controls.target.x, controls.target.y, controls.target.z].map((v) => v.toFixed(3)).join(','));
    }
    if (still) out.set('still', '1');
    if (studio.grid.visible) out.set('grid', '1');
    const ui = params.get('ui');
    if (ui) out.set('ui', ui);
    const lang = params.get('lang');
    if (lang) out.set('lang', lang);
    history.replaceState(null, '', `?${out.toString().replace(/%2C/g, ',')}`);
  }, 150);
}

// ---- Camera ----

const vec = (raw: string | null): THREE.Vector3 | null => {
  const parts = raw?.split(',').map(Number);
  return parts && parts.length === 3 && parts.every(Number.isFinite) ? new THREE.Vector3(parts[0], parts[1], parts[2]) : null;
};

/** Bounds of a model without what sits outside it on purpose (userData.noFit), as Stage frames it. */
function fitBox(root: THREE.Object3D): THREE.Box3 {
  const skipped: Array<[THREE.Object3D, THREE.Object3D]> = [];
  root.traverse((o) => {
    if (o !== root && o.userData.noFit && o.parent) skipped.push([o, o.parent]);
  });
  for (const [o, parent] of skipped) parent.remove(o);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  for (const [o, parent] of skipped) parent.add(o);
  return box;
}

let fitted = { center: new THREE.Vector3(), radius: 1, distance: 5 };

function fitDistance(radius: number): number {
  const vFov = camera.fov * DEG;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  return Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * FIT;
}

function homeDir(): THREE.Vector3 {
  return new THREE.Vector3(...(current?.model.home ?? HOME)).normalize();
}

/** Frames the model. `fromAddress` takes cam, dist and at from the address when they are there. */
function frameModel(direction: THREE.Vector3 | null, fromAddress: boolean): void {
  if (!current) return;
  const box = fitBox(current.model.group);
  const sphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 1) : box.getBoundingSphere(new THREE.Sphere());
  const distance = fitDistance(sphere.radius);
  fitted = { center: sphere.center.clone(), radius: sphere.radius, distance };
  fittedTarget.copy(sphere.center);
  const groundY = current.model.groundY ?? (box.isEmpty() ? 0 : box.min.y);
  studio.place(groundY, sphere.center, sphere.radius);

  let dir = direction ?? homeDir();
  let dist = distance;
  let target = sphere.center.clone();
  if (fromAddress) {
    const cam = params.get('cam');
    const preset = PRESETS.find((p) => p.name === cam);
    dir = preset ? (preset.dir ? new THREE.Vector3(...preset.dir).normalize() : homeDir()) : (vec(cam)?.normalize() ?? dir);
    const d = Number(params.get('dist'));
    if (params.has('dist') && Number.isFinite(d) && d > 0) dist = d;
    target = vec(params.get('at')) ?? target;
  }
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(dir, dist);
  controls.minDistance = sphere.radius * 0.05;
  controls.maxDistance = Math.max(distance * 4, dist);
  controls.update();
}

function applyPreset(name: string): void {
  const preset = PRESETS.find((p) => p.name === name);
  if (!preset) return;
  const dir = preset.dir ? new THREE.Vector3(...preset.dir).normalize() : homeDir();
  controls.target.copy(fitted.center);
  camera.position.copy(fitted.center).addScaledVector(dir, fitted.distance);
  controls.update();
  cameraSet = name !== 'home';
  writeAddress();
}

// Written while it moves too: damping carries the camera on after the pointer lets go.
controls.addEventListener('start', () => {
  cameraSet = true;
});
controls.addEventListener('change', () => {
  if (cameraSet) writeAddress();
});

// ---- Size and scale ----

let width = 1;
let height = 1;
new ResizeObserver(() => {
  const box = $('view').getBoundingClientRect();
  width = Math.max(1, Math.round(box.width));
  height = Math.max(1, Math.round(box.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}).observe($('view'));

let shownScale = 0;
/** The site's ruler: the length of a round number of centimetres at the depth of the target. */
function updateScaleBar(): void {
  const distance = camera.position.distanceTo(controls.target);
  const perCm = height / (2 * distance * Math.tan((camera.fov * DEG) / 2)) / 10;
  if (Math.abs(perCm - shownScale) < 0.02) return;
  shownScale = perCm;
  const cm = SCALE_STEPS_CM.filter((v) => v * perCm <= 150).pop() ?? SCALE_STEPS_CM[0]!;
  $('scale-line').style.width = `${Math.round(cm * perCm)}px`;
  $('scale-label').textContent = cm >= 100 ? `${cm / 100} м` : `${cm} см`;
}

// ---- Parts: hover, click, and which have no card ----

const raycaster = new THREE.Raycaster();

/** Part key under a ray hit: a merged mesh keeps one per vertex, an instanced one per instance. As Stage reads it. */
function partKeyOf(hit: THREE.Intersection): string | undefined {
  const o = hit.object;
  const table = o.userData.partOf as string[] | undefined;
  const index = (o as THREE.Mesh).geometry?.getAttribute('aPart');
  if (table && index && hit.face) return table[index.getX(hit.face.a)];
  const instances = o.userData.instanceParts as string[] | undefined;
  if (instances && hit.instanceId !== undefined) return instances[hit.instanceId];
  return o.userData.part as string | undefined;
}

const shown = (o: THREE.Object3D): boolean => {
  for (let obj: THREE.Object3D | null = o; obj; obj = obj.parent) if (!obj.visible) return false;
  return true;
};

/** The part under a point of the canvas. A glass shell gives way to a solid part behind it, as on the site. */
function pick(clientX: number, clientY: number): string | null {
  if (!current) return null;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  let fallback: string | null = null;
  for (const hit of raycaster.intersectObject(current.model.group, true)) {
    if (!shown(hit.object)) continue;
    const key = partKeyOf(hit);
    if (!key) continue;
    if (hit.object.userData.overlay) return key;
    const material = (hit.object as THREE.Mesh).material as THREE.Material | undefined;
    if (material && !Array.isArray(material) && material.transparent) {
      fallback ??= key;
      continue;
    }
    return key;
  }
  return fallback;
}

const cardOf = (key: string): PartCard | undefined => current?.model.part?.(key);

let pointer: { x: number; y: number } | null = null;
let pointerMoved = false;
let dragging = false;
let downAt: { x: number; y: number } | null = null;

canvas.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  pointerMoved = true;
  if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5) dragging = true;
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
  $('tip').hidden = true;
});
canvas.addEventListener('pointerdown', (event) => {
  downAt = { x: event.clientX, y: event.clientY };
  dragging = false;
});
canvas.addEventListener('pointerup', (event) => {
  const click = downAt && !dragging;
  downAt = null;
  dragging = false;
  if (!click) return;
  const key = pick(event.clientX, event.clientY);
  showCard(key);
});
document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) return;
  if (event.key === 'Escape') showCard(null);
  else if (event.key === ' ') {
    event.preventDefault();
    setStill(!still);
    renderPanel();
  }
});

function showCard(key: string | null): void {
  const card = $('card');
  if (!key) {
    card.hidden = true;
    return;
  }
  const info = cardOf(key);
  card.hidden = false;
  card.classList.toggle('missing', !info);
  $('card-name').textContent = info?.name ?? 'Немає картки';
  $('card-text').textContent = info?.text ?? (current?.model.part ? 'Модель не знає цієї деталі.' : 'Модель не дає карток деталей.');
  $('card-key').textContent = key;
}

function updateHover(): void {
  const tip = $('tip');
  if (!pointer || !pointerMoved || downAt) {
    if (downAt) tip.hidden = true;
    return;
  }
  pointerMoved = false;
  const key = pick(pointer.x, pointer.y);
  if (!key) {
    tip.hidden = true;
    return;
  }
  const info = cardOf(key);
  tip.hidden = false;
  tip.classList.toggle('missing', !info);
  tip.textContent = info ? info.name : `${key}: немає картки`;
  const rect = $('view').getBoundingClientRect();
  tip.style.left = `${pointer.x - rect.left + 14}px`;
  tip.style.top = `${pointer.y - rect.top + 12}px`;
}

/** Every part key the model tags, and those without a card: a page would show nothing on a click there. */
function auditParts(): void {
  const out = $('parts');
  if (!current) {
    out.textContent = '';
    return;
  }
  const keys = new Set<string>();
  current.model.group.traverse((o) => {
    const own = o.userData.part as string | undefined;
    if (own) keys.add(own);
    for (const list of [o.userData.partOf, o.userData.instanceParts] as Array<string[] | undefined>) for (const k of list ?? []) keys.add(k);
  });
  if (!current.model.part) {
    out.textContent = keys.size > 0 ? `Деталей: ${keys.size}. Модель не дає карток.` : '';
    return;
  }
  const missing = [...keys].filter((k) => !current!.model.part!(k)).sort();
  out.classList.toggle('missing', missing.length > 0);
  out.textContent = missing.length > 0 ? `Деталей: ${keys.size}. Без картки: ${missing.join(', ')}.` : `Деталей: ${keys.size}, у всіх є картки.`;
}

// ---- Panel ----

function controlRow(c: Control, value: Value, onChange: (v: Value) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = `control ${c.kind}`;
  if (c.kind === 'toggle') {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value as boolean;
    input.dataset.key = c.key;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, ` ${c.label}`);
    row.append(label);
    return row;
  }
  const label = document.createElement('label');
  label.className = 'control-label';
  label.textContent = c.label;
  row.append(label);
  if (c.kind === 'range') {
    const readout = document.createElement('output');
    readout.textContent = String(value);
    label.append(readout);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(c.min);
    input.max = String(c.max);
    input.step = String(c.step ?? (c.max - c.min) / 100);
    input.value = String(value);
    input.dataset.key = c.key;
    input.setAttribute('aria-label', c.label);
    input.addEventListener('input', () => {
      readout.textContent = input.value;
      onChange(Number(input.value));
    });
    row.append(input);
  } else if (c.buttons) {
    const group = document.createElement('div');
    group.className = 'buttons';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', c.label);
    for (const option of c.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.dataset.key = c.key;
      button.dataset.value = option.value;
      button.setAttribute('aria-pressed', String(option.value === value));
      button.addEventListener('click', () => {
        for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
        onChange(option.value);
      });
      group.append(button);
    }
    row.append(group);
  } else {
    const select = document.createElement('select');
    select.dataset.key = c.key;
    select.setAttribute('aria-label', c.label);
    for (const option of c.options) select.append(new Option(option.label, option.value, false, option.value === value));
    select.addEventListener('change', () => onChange(select.value));
    row.append(select);
  }
  return row;
}

function renderPanel(): void {
  const box = $('controls');
  box.replaceChildren();
  if (current) {
    const own = current.def.controls ?? [];
    const groups: Array<[string, Control[]]> = [
      ['Модель', own],
      ['Показ', current.controls.filter((c) => isBuiltin(c.key))],
    ];
    for (const [title, list] of groups) {
      if (list.length === 0) continue;
      const set = document.createElement('fieldset');
      set.className = 'group';
      const legend = document.createElement('legend');
      legend.textContent = title;
      set.append(legend);
      for (const c of list) set.append(controlRow(c, current.values[c.key]!, (v) => change(c.key, v)));
      box.append(set);
    }
  }
  const settings = $('viewer-settings');
  settings.querySelectorAll('.control').forEach((n) => n.remove());
  settings.append(
    controlRow({ key: 'still', label: 'Пауза (пробіл)', kind: 'toggle', value: false }, still, (v) => setStill(v as boolean)),
    controlRow({ key: 'grid', label: 'Сітка 10 см', kind: 'toggle', value: false }, studio.grid.visible, (v) => {
      studio.grid.visible = v as boolean;
      writeAddress();
    }),
    controlRow({ key: 'keep', label: 'Тримати камеру при перебудові', kind: 'toggle', value: false }, keepCamera, (v) => {
      keepCamera = v as boolean;
    }),
  );
}

function setStill(on: boolean): void {
  still = on;
  writeAddress();
}

const presetsBox = $('camera-presets');
for (const preset of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = preset.label;
  button.addEventListener('click', () => applyPreset(preset.name));
  presetsBox.append(button);
}

$('panel-toggle').addEventListener('click', () => {
  const open = !document.body.classList.toggle('panel-closed');
  $('panel-toggle').setAttribute('aria-expanded', String(open));
});
if (params.get('ui') === '0') document.body.classList.add('no-ui');
studio.grid.visible = flag('grid');

// ---- Loading and changes ----

function showMessage(text: string | null): void {
  const box = $('message');
  box.hidden = !text;
  box.textContent = text ?? '';
}

function create(loaded: Omit<Loaded, 'model' | 'controls'>): ViewerModel {
  const model = loaded.def.create(loaded.values);
  model.group.updateMatrixWorld(true);
  return model;
}

/** A control changed: by hand, or through window.__viewer.set. */
function change(key: string, value: Value): void {
  if (!current) return;
  const c = current.controls.find((x) => x.key === key);
  if (!c) return;
  current.values[key] = value;
  if (isBuiltin(key)) {
    applyBuiltin(current.model, key, value, false);
    auditParts();
  } else if (c.rebuild) {
    rebuild();
  } else {
    current.model.set?.(key, current.values);
  }
  writeAddress();
}

function rebuild(): void {
  if (!current) return;
  const direction = camera.position.clone().sub(controls.target).normalize();
  const before = current.model;
  scene.remove(before.group);
  before.dispose();
  showCard(null);
  try {
    const model = create(current);
    current.model = model;
    scene.add(model.group);
    for (const c of current.controls) if (isBuiltin(c.key)) applyBuiltin(model, c.key, current.values[c.key]!, true);
    model.frame?.(time, 0);
    if (!keepCamera) frameModel(direction, false);
    showMessage(null);
  } catch (error) {
    console.error(error);
    showMessage(`Модель не збудувалася: ${(error as Error).message}`);
  }
  auditParts();
}

async function load(id: string): Promise<void> {
  const select = $<HTMLSelectElement>('model');
  for (const other of MODEL_IDS) select.append(new Option(other, other, false, other === id));
  select.addEventListener('change', () => {
    // A fresh page per model: the noise seed and the address start over, so its shots repeat too.
    location.search = `?m=${encodeURIComponent(select.value)}`;
  });
  const importer = MODULES[`./models/${id}.ts`];
  if (!importer) {
    showMessage(MODEL_IDS.length > 0 ? `Немає моделі «${id}». Є: ${MODEL_IDS.join(', ')}.` : 'Ще немає жодної моделі в dev/models/.');
    renderPanel();
    return;
  }
  try {
    const def = (await importer()).default;
    document.title = `${def.title} · Стенд моделей`;
    $('title').textContent = def.title;
    const own = def.controls ?? [];
    const clash = own.filter((c, i) => (RESERVED_KEYS as readonly string[]).includes(c.key) || own.findIndex((o) => o.key === c.key) !== i);
    if (clash.length > 0) throw new Error(`ключі контролів зайняті: ${clash.map((c) => c.key).join(', ')}`);
    const values: Values = {};
    for (const c of own) values[c.key] = parseValue(c, params.get(c.key));
    const model = create({ id, def, values });
    const builtins = builtinControls(def, model);
    for (const c of builtins) values[c.key] = parseValue(c, params.get(c.key));
    current = { id, def, controls: [...own, ...builtins], values, model };
    scene.add(model.group);
    for (const c of builtins) applyBuiltin(model, c.key, values[c.key]!, true);
    model.frame?.(time, 0);
    frameModel(null, true);
  } catch (error) {
    console.error(error);
    showMessage(`Модель «${id}» не завантажилася: ${(error as Error).message}`);
  }
  renderPanel();
  auditParts();
}

// ---- Frame loop ----

let last = performance.now();
let readyAt = -1;
let statsAt = 0;
let statsFrames = 0;

function loop(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const step = still ? 0 : dt;
  time += step;
  current?.model.frame?.(time, step);
  controls.update();
  renderer.render(scene, camera);
  updateScaleBar();
  updateHover();
  viewerApi.frames++;
  statsFrames++;
  if (readyAt < 0 && current) readyAt = viewerApi.frames;
  // Two frames after the model came: textures are up and the shadow map is drawn.
  if (!viewerApi.ready && readyAt >= 0 && viewerApi.frames >= readyAt + 2) viewerApi.ready = true;
  if (now - statsAt > 500) {
    const info = renderer.info.render;
    const fps = (statsFrames * 1000) / Math.max(1, now - statsAt);
    $('stats').textContent = `${info.calls} викликів · ${Math.round(info.triangles / 1000)} тис. трикутників · ${Math.round(fps)} к/с`;
    statsAt = now;
    statsFrames = 0;
  }
  requestAnimationFrame(loop);
}

const wanted = params.get('m') ?? MODEL_IDS[0] ?? '';
void load(wanted).then(() => {
  if (!current) viewerApi.ready = true;
});
requestAnimationFrame(loop);
