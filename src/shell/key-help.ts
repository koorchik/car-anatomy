// The help of the keys, «?»: what each key does on the page shown, read from the KeyMap's bindings. Pure, so the test
// of the keys can check that the help lists every binding.

import { t } from '../i18n/t.ts';
import { SHELL_KEYS } from './keys.ts';
import { MENU_ORDER, sectionLabel, tabLabel } from './menu-model.ts';
import type { KeyBinding, SectionId } from './section.ts';

export interface HelpRow {
  /** The keys as printed on them: 'S', '←', and Space in the page's language. */
  caps: string[];
  label: string;
}

export interface HelpGroup {
  context: string;
  title: string;
  rows: HelpRow[];
}

const NAMED: Record<string, () => string> = {
  Space: () => t('Пробіл'),
  Escape: () => 'Esc',
  Enter: () => 'Enter',
  Slash: () => '?',
  ArrowUp: () => '↑',
  ArrowDown: () => '↓',
  ArrowLeft: () => '←',
  ArrowRight: () => '→',
};

/** The key as printed on it, from KeyboardEvent.code. */
export function keyCap(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return NAMED[code]?.() ?? code;
}

/** Whether keyCap() knows a code, rather than printing it as it is. */
export function knownKey(code: string): boolean {
  return /^Key[A-Z]$/.test(code) || /^Digit\d$/.test(code) || code in NAMED;
}

/** The heading of a context in the help: the shell's keys, a section's, or a page's ('engines/sump'). */
export function contextTitle(context: string): string {
  if (context === SHELL_KEYS) return t('На кожній сторінці');
  if ((MENU_ORDER as readonly string[]).includes(context)) return sectionLabel(context as SectionId);
  return tabLabel(context) ?? context;
}

/**
 * The help for contexts that listen in this order (the most specific first, the shell's last). Each key is listed once,
 * under the first context that binds it: a later binding of the same key never gets it. A binding without a label
 * lists nothing and still holds its keys back from the contexts after it, as it does when a key is pressed.
 */
export function keyHelp(stack: readonly string[], bindingsOf: (context: string) => readonly KeyBinding[]): HelpGroup[] {
  const taken = new Set<string>();
  const groups: HelpGroup[] = [];
  for (const context of stack) {
    const rows: HelpRow[] = [];
    for (const binding of bindingsOf(context)) {
      const codes = binding.codes.filter((code) => !taken.has(code));
      for (const code of codes) taken.add(code);
      if (binding.label === null || !codes.length) continue;
      // Two keys for one thing share a row: Space and ↑ for the gas.
      const same = rows.find((row) => row.label === binding.label);
      if (same) same.caps.push(...codes.map(keyCap));
      else rows.push({ caps: codes.map(keyCap), label: binding.label });
    }
    if (rows.length) groups.push({ context, title: contextTitle(context), rows });
  }
  return groups;
}

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

/** The help as markup: a list of keys and what they do under each context's heading. */
export function helpHtml(groups: readonly HelpGroup[]): string {
  return groups
    .map(
      (group) =>
        `<section><h3>${esc(group.title)}</h3><dl>${group.rows
          .map((row) => `<div><dt>${row.caps.map((cap) => `<kbd>${esc(cap)}</kbd>`).join(' ')}</dt><dd>${esc(row.label)}</dd></div>`)
          .join('')}</dl></section>`,
    )
    .join('');
}
