// A section's own content in the shared skeleton. Section.leave() hides what the section shows, and the next enter()
// brings it back, so this finds every element the section put into the places of its slots and hides them at once.
//
// What the section adds through the slots is its own. Some of its features put their elements straight into a slot's
// parent (a switch into the row of tools, a card onto the page root); on leaving, every element under those parents
// that was not there when the section mounted and that no other section owns becomes the leaving section's too.
// An element keeps its own `hidden`: the section may have hidden one of them itself, and coming back must not show it.
//
// A section's pages may also style the shared skeleton through classes on <body> (the oil page hides the view tools and
// the dash with `sump-mode`). The section names them, and the ones that are on go off while it is away and come back
// with it, so the next section does not inherit a page it never showed.

import type { ShellSlots, Slot } from './section.ts';

export interface OwnedSlots {
  /** The same slots, recording what goes in. A section hands these on to everything that fills its slots. */
  readonly slots: ShellSlots;
  /** Hides (true) or shows again (false) everything the section put into the skeleton. */
  setAway(away: boolean): void;
}

/** Which section's content each element is. */
const owners = new WeakMap<Element, OwnedSlots>();

export function ownSlots(slots: ShellSlots, bodyClasses: readonly string[] = []): OwnedSlots {
  /** The body classes that were on when the section left. */
  let bodyOn: string[] = [];
  const parents = [...new Set([slots.root, slots.backdrop, slots.actions, slots.title, slots.tools, slots.status, slots.panel, slots.results, slots.dash, slots.afterDash, slots.table.head].map((s) => ('parent' in s ? s.parent : s)))];
  /** What stood in those places before this section came: the skeleton and other sections' content. */
  const before = new Set(parents.flatMap((p) => Array.from(p.children)));
  const added = new Set<HTMLElement>();
  let away = false;
  const hide = (el: HTMLElement, on: boolean): void => {
    if (on) el.style.setProperty('display', 'none', 'important');
    else el.style.removeProperty('display');
  };
  const own = (slot: Slot): Slot => ({
    parent: slot.parent,
    add(...content) {
      const there = new Set(Array.from(slot.parent.children));
      slot.add(...content);
      for (const el of Array.from(slot.parent.children)) {
        if (there.has(el) || !(el instanceof HTMLElement)) continue;
        added.add(el);
        owners.set(el, result);
        if (away) hide(el, true);
      }
    },
  });
  const owned: ShellSlots = {
    ...slots,
    backdrop: own(slots.backdrop),
    actions: own(slots.actions),
    title: own(slots.title),
    tools: own(slots.tools),
    status: own(slots.status),
    panel: own(slots.panel),
    results: own(slots.results),
    dash: own(slots.dash),
    afterDash: own(slots.afterDash),
    table: {
      head: own(slots.table.head),
      body: slots.table.body,
      get isOpen() {
        return slots.table.isOpen;
      },
      open: (on) => slots.table.open(on),
    },
  };
  const result: OwnedSlots = {
    slots: owned,
    setAway(next) {
      away = next;
      if (next) {
        for (const parent of parents) {
          for (const el of Array.from(parent.children)) {
            if (before.has(el) || !(el instanceof HTMLElement) || (owners.get(el) ?? result) !== result) continue;
            owners.set(el, result);
            added.add(el);
          }
        }
      }
      for (const el of added) hide(el, next);
      if (next) {
        bodyOn = bodyClasses.filter((c) => document.body.classList.contains(c));
        for (const c of bodyOn) document.body.classList.remove(c);
      } else {
        for (const c of bodyOn) document.body.classList.add(c);
        bodyOn = [];
      }
    },
  };
  return result;
}
