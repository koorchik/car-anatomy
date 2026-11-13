// Shared geometry for gearbox models, by a key of everything the shape depends on. A model rebuilt after one pair's
// teeth changed (the settings panel, the designer) builds only the gears that changed and takes the rest from here.
//
// A model acquires what it uses and releases it on dispose, and must never dispose a cached geometry itself.
// Released geometry is kept for a while, so that going back to the factory teeth costs nothing either.

import type * as THREE from 'three';

interface Entry {
  key: string;
  geometry: THREE.BufferGeometry;
  users: number;
}

/** Released geometries kept for reuse; the oldest beyond this are disposed. */
const IDLE_LIMIT = 96;

const entries = new Map<string, Entry>();
const byGeometry = new Map<THREE.BufferGeometry, Entry>();
/** Keys with no users, oldest first. */
const idle: string[] = [];

/** How many geometries were built and how many were taken from the cache, since the page loaded. */
export const geometryCacheStats = { built: 0, reused: 0 };

/** The geometry for `key`, built by `build` the first time. Release it when done. */
export function acquireGeometry(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let entry = entries.get(key);
  if (entry) {
    geometryCacheStats.reused++;
    if (entry.users === 0) idle.splice(idle.indexOf(key), 1);
  } else {
    geometryCacheStats.built++;
    entry = { key, geometry: build(), users: 0 };
    entry.geometry.userData.cached = true;
    entries.set(key, entry);
    byGeometry.set(entry.geometry, entry);
  }
  entry.users++;
  return entry.geometry;
}

/**
 * Gives back a geometry from acquireGeometry(). Returns false for one the cache does not hold. A release with no
 * user left changes nothing: queued twice, the key would later evict the geometry while a new user still draws it.
 */
export function releaseGeometry(geometry: THREE.BufferGeometry): boolean {
  const entry = byGeometry.get(geometry);
  if (!entry) return false;
  if (entry.users === 0) return true;
  entry.users--;
  if (entry.users > 0) return true;
  idle.push(entry.key);
  while (idle.length > IDLE_LIMIT) {
    const old = entries.get(idle.shift()!)!;
    entries.delete(old.key);
    byGeometry.delete(old.geometry);
    old.geometry.dispose();
  }
  return true;
}

/** Number of geometries held, in use or idle. */
export const cachedGeometryCount = (): number => entries.size;
