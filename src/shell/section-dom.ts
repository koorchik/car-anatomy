// What each section has put into the skeleton's shared places, so that only the shown section's is seen. Sections
// fill the places through their slots, and some later on their own (a lazy feature appends its card to the page), so
// the shell does not count what goes in: when a section stops being shown, every element in the places that is
// neither the skeleton's nor already claimed is that section's. The others' elements carry SECTION_AWAY, which
// shell.css hides; a section shown again gets its own back exactly as they were, attributes and all.

/** The attribute that hides an element of a section not shown. */
export const SECTION_AWAY = 'data-section-away';

/** The little of the DOM this needs, so that tests can hand it plain objects. */
export interface DomElement {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  readonly isConnected: boolean;
}

export interface DomPlace {
  readonly children: ArrayLike<DomElement>;
}

export class SectionDom {
  private readonly places: readonly DomPlace[];
  private readonly skeleton = new Set<DomElement>();
  private readonly owners = new Map<DomElement, string>();

  /** `places` are the elements sections put content into; what they hold now is the skeleton's. */
  constructor(places: readonly DomPlace[]) {
    this.places = places;
    for (const place of places) for (const el of Array.from(place.children)) this.skeleton.add(el);
  }

  /** The section `id` stops being shown: whatever is new in the places is its. */
  claim(id: string): void {
    for (const place of this.places) {
      for (const el of Array.from(place.children)) if (!this.skeleton.has(el) && !this.owners.has(el)) this.owners.set(el, id);
    }
  }

  /** Shows the elements of the section `id` and hides every other section's. What is not claimed yet stays seen. */
  show(id: string): void {
    for (const [el, owner] of this.owners) {
      if (!el.isConnected) {
        this.owners.delete(el);
        continue;
      }
      if (owner === id) el.removeAttribute(SECTION_AWAY);
      else el.setAttribute(SECTION_AWAY, '');
    }
  }
}
