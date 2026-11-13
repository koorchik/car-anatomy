import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CATALOGUE } from '../src/data/engines.ts';
import { ENGINE_VARIANTS } from '../src/data/engine-variants.ts';
import { DESIGNER_EN } from '../src/i18n/en/designer.ts';
import { LUBRICATION_EN } from '../src/i18n/en/lubrication.ts';
import { SYSTEMS_EN } from '../src/i18n/en/systems.ts';
import { ENGINE_TEXT_EN } from '../src/i18n/en/engines.ts';
import { UI_EN } from '../src/i18n/en/ui.ts';
import { VARIANT_TEXT_EN } from '../src/i18n/en/variants.ts';

const CYRILLIC = /[\u0400-\u04FF]/;
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });
// The catalogue is written in the source language and has its own English files.
const SOURCE_DATA = ['src/data/engines.ts', 'src/data/engine-variants.ts'];
const files = walk('src').filter((f) => !f.startsWith('src/i18n/') && !SOURCE_DATA.includes(f));
const CALL = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/gs;
const unescape = (text: string): string => text.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
const ENGLISH = { ...UI_EN, ...DESIGNER_EN, ...SYSTEMS_EN, ...LUBRICATION_EN };
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe.each(files)('%s', (file) => {
  const source = readFileSync(file, 'utf8');
  const keys = [...source.matchAll(CALL)].map((m) => unescape(m[2]!));

  it('has no Ukrainian outside t()', () => {
    const left = source.replace(CALL, 't(').split('\n').filter((line) => CYRILLIC.test(line));
    expect(left).toEqual([]);
  });

  it('has English for every string, with the same placeholders', () => {
    for (const key of keys) {
      expect(ENGLISH[key], `no English for: ${key}`).toBeDefined();
      expect(placeholders(ENGLISH[key]!), key).toEqual(placeholders(key));
    }
  });
});

describe('English', () => {
  it('has no Ukrainian left in it', () => {
    const texts = [...Object.values(ENGLISH), JSON.stringify(ENGINE_TEXT_EN), JSON.stringify(VARIANT_TEXT_EN)];
    for (const text of texts) expect(CYRILLIC.test(text), text.slice(0, 200)).toBe(false);
  });

  it('has no dictionary entry that nothing uses', () => {
    const used = new Set(files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(CALL)].map((m) => unescape(m[2]!))));
    expect(Object.keys(ENGLISH).filter((key) => !used.has(key))).toEqual([]);
  });

  it.each(CATALOGUE.map((e) => e.id))('page %s has its article', (id) => {
    const text = ENGINE_TEXT_EN[id];
    expect(text, id).toBeDefined();
    const source = CATALOGUE.find((e) => e.id === id)!;
    expect(text!.article.pros).toHaveLength(source.article.pros.length);
    expect(text!.article.cons).toHaveLength(source.article.cons.length);
    expect(text!.article.cars).toHaveLength(source.article.cars.length);
    expect(!!text!.verifyNote).toBe(!!source.verifyNote);
    if (ENGINE_VARIANTS[id]) expect(VARIANT_TEXT_EN[id], `${id} facts`).toBeDefined();
  });

  it('every real engine has its text', () => {
    for (const [page, { variants }] of Object.entries(ENGINE_VARIANTS)) {
      for (const variant of variants) {
        const text = VARIANT_TEXT_EN[`${page}/${variant.id}`];
        expect(text, `${page}/${variant.id}`).toBeDefined();
        expect(text!.cars).toHaveLength(variant.cars.length);
      }
    }
  });
});

describe('the site running in English', () => {
  it('shows no Ukrainian in any article, diagnosis or control', async () => {
    vi.resetModules();
    vi.stubGlobal('location', { search: '?lang=en' });
    try {
      const { ENGINES, engineById, pageChoices } = await import('../src/data/engines.ts');
      const { articleHtml } = await import('../src/ui/article.ts');
      const { tableHtml } = await import('../src/ui/table.ts');
      const { buildEngine } = await import('../src/engine/kinematics.ts');
      const { PARAM_GROUPS } = await import('../src/ui/designer/params.ts');
      const { designFromSpec, ODD_PRESETS } = await import('../src/designer/presets.ts');
      const { diagnose } = await import('../src/designer/diagnostics.ts');
      const { evaluate } = await import('../src/designer/physics.ts');
      const { assessReliability } = await import('../src/designer/reliability.ts');
      const clean = (text: string, where: string): void => {
        expect(CYRILLIC.test(text), `${where}: ${text.match(/.{0,40}[\u0400-\u04FF].{0,40}/)?.[0]}`).toBe(false);
      };
      clean(tableHtml(''), 'catalog');
      for (const page of ENGINES) {
        for (const choice of pageChoices(page.id)) {
          const spec = engineById(choice.id)!;
          // A link to a source may have any address, the text around it may not.
          clean(articleHtml(buildEngine(spec)).replace(/href="[^"]*"/g, ''), choice.id);
          clean(spec.title + spec.example, choice.id);
          const design = { ...designFromSpec(spec), factory: null };
          const perf = evaluate(design);
          clean(JSON.stringify(diagnose(design, perf)), `${choice.id} diagnoses`);
          clean(JSON.stringify(assessReliability(design, perf).items.map((i) => [i.name, i.detail, i.failure, i.fix])), `${choice.id} limits`);
        }
      }
      for (const preset of ODD_PRESETS) {
        const design = preset.design();
        const perf = evaluate(design);
        clean(preset.name + preset.note, preset.id);
        clean(JSON.stringify(diagnose(design, perf)), `${preset.id} diagnoses`);
      }
      for (const group of PARAM_GROUPS) {
        clean(group.title + group.intro, group.id);
        for (const param of group.params) clean(param.label + param.help, param.key);
      }
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
