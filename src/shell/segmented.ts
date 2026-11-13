/** Marks the button of a segmented control whose data-v is `value` as pressed, and the others as not. */
export function setSegment(group: HTMLElement, value: string): void {
  group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
}

/** Calls `pick` with the data-v of the button clicked in a segmented control. */
export function onSegment(group: HTMLElement, pick: (value: string) => void): void {
  group.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button?.dataset.v) pick(button.dataset.v);
  });
}
