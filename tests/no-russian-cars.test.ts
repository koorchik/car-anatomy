// The site shows no Russian cars, car brands or engine makers, and links to no Russian websites: not in the catalogue,
// articles, part cards, presets or source links, in either language. Everything a visitor sees comes from src/ and
// index.html, so the test searches their text. Ukrainian makers (ЗАЗ, МеМЗ, ЛуАЗ, КрАЗ) are welcome and not listed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Case-sensitive names that in car text mean a Russian or Soviet-Russian maker or model. Ukrainian words that only
// look alike in lower case («нива», «лада», «газ» as gas) do not match, and Latin «ValveState» is not «Vesta».
const BRANDS = [
  'ВАЗ', 'АвтоВАЗ', 'Лада', 'ЛАДА', 'Жигулі', 'Жигули', 'Нива', 'Волга', 'ГАЗ', 'ГАЗель', 'Газель', 'УАЗ', 'Москвич',
  'АЗЛК', 'ЗІЛ', 'ЗИЛ', 'КамАЗ', 'КАМАЗ', 'ЗМЗ', 'УМЗ', 'ЯМЗ', 'ІЖ', 'ИЖ', 'Урал', 'Аурус', 'ТагАЗ', 'Соллерс',
  'Пріора', 'Приора', 'Гранта', 'Веста', 'Побєда', 'Победа',
  'VAZ', 'AvtoVAZ', 'AutoVAZ', 'Lada', 'LADA', 'Zhiguli', 'Niva', 'Volga', 'GAZ', 'UAZ', 'Moskvich', 'AZLK', 'ZIL',
  'KamAZ', 'KAMAZ', 'ZMZ', 'UMZ', 'YaMZ', 'IZh', 'Izh', 'Ural', 'Aurus', 'Marussia', 'TagAZ', 'Sollers', 'Priora',
  'Granta', 'Vesta', 'Pobeda',
];
const BRAND = new RegExp(`(?<![\\p{L}\\p{N}])(?:${BRANDS.join('|')})(?![\\p{L}])`, 'gu');
// A link to a Russian site: a .ru, .su or .рф host, or the Russian Wikipedia.
const SITE = /https?:\/\/(?:[^\s'"`/]+\.(?:ru|su|рф)(?=[/:'"`\s]|$)|ru\.(?:m\.)?wikipedia\.org)/gu;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(?:ts|css|html|json|svg|md)$/.test(path) ? [path] : [];
  });
const files = [...walk('src'), 'index.html'];

const offences = (text: string): string[] => [...text.matchAll(BRAND), ...text.matchAll(SITE)].map((m) => m[0]);

describe('no Russian cars', () => {
  it('the search would find what it is for', () => {
    expect(offences("cars: ['ВАЗ-2101', 'ВАЗ-21013'], name: 'VAZ-2101 (Lada)', «Нива» і Volga")).toEqual(['ВАЗ', 'ВАЗ', 'VAZ', 'Lada', 'Нива', 'Volga']);
    expect(offences("sources: ['https://auto.ru/catalog/', 'https://ru.wikipedia.org/wiki/x', 'https://www.zr.ru']")).toEqual(['https://auto.ru', 'https://ru.wikipedia.org', 'https://www.zr.ru']);
    expect(offences('ValveState, газ, нива, лада, PLURAL, натуральний, ЗАЗ-1102 «Таврія», МеМЗ-245, https://www.auto-data.net/ru-x')).toEqual([]);
  });

  it.each(files)('%s names none and links to no Russian site', (file) => {
    expect(offences(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
