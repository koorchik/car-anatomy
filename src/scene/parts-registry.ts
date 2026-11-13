// What each part of a model is called and does, for the name that follows the pointer and the card a click opens (the
// plan of the whole car, «Stage для всіх розділів» → «Реєстр деталей»). The stage finds a part here by the key its mesh
// carries (tag() in model-types.ts), whichever section drew it.
//
// Each section registers its own dictionary when its code arrives: the engines their parts with the dyno's and the
// valve gear's, the systems layers and the oil page theirs as their code loads. Gearboxes key their parts with 'gbx-',
// suspensions with 'susp.', the car with 'car.'; the engines' keys have no prefix. A key belongs to one dictionary
// only: two sections with the same key would explain one part in the other's words, so that throws, and
// tests/parts-registry.test.ts registers every dictionary of the site to catch it before a visitor does.

export interface PartInfo {
  name: string;
  text: string;
}

export type PartDictionary = Readonly<Record<string, PartInfo>>;

const entries = new Map<string, PartInfo>();
/** The dictionary each key came from, to tell a dictionary registered again from two that share a key. */
const owners = new Map<string, PartDictionary>();
const registered = new Set<PartDictionary>();

/**
 * Adds a section's part dictionary. The same dictionary again changes nothing, so every module that draws its parts
 * can register it; a key another dictionary has already registered throws, and then nothing of this one is added.
 */
export function registerParts(parts: PartDictionary): void {
  if (registered.has(parts)) return;
  const taken = Object.keys(parts).filter((key) => owners.has(key));
  if (taken.length > 0) throw new Error(`Part keys already registered by another dictionary: ${taken.join(', ')}`);
  registered.add(parts);
  for (const [key, info] of Object.entries(parts)) {
    entries.set(key, info);
    owners.set(key, parts);
  }
}

/** The part a key names, or null when no registered dictionary has it. */
export function partInfo(key: string): PartInfo | null {
  return entries.get(key) ?? null;
}
