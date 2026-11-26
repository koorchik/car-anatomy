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
// A link to a Russian site: a .ru, .su or .рф host, the Russian Wikipedia, or a Russian car site on a generic domain.
const SITE =
  /https?:\/\/(?:[^\s'"`/]+\.(?:ru|su|рф|xn--p1ai)|ru\.(?:m\.)?wikipedia\.org|(?:[\w-]+\.)*(?:avtotachki\.com|drive2\.(?:com|net)))(?![\w.-])/gu;
// Inside a link a Latin name is often lower case (auto-data.net/en/lada-2107-…), where no Ukrainian word can clash, and
// Cyrillic is often percent-encoded, so each link is decoded and searched again, Latin names without regard to case.
const LINK = /https?:\/\/[^\s'"`]+/gu;
const LATIN = BRANDS.filter((name) => /^[A-Za-z]/.test(name));
const LINK_BRAND = new RegExp(`(?<![a-z0-9])(?:${LATIN.join('|')})(?![a-z])`, 'gi');
const decoded = (url: string): string => {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(?:ts|css|html|json|svg|md)$/.test(path) ? [path] : [];
  });
const files = [...walk('src'), 'index.html'];

/** Every distinct offending name or site in the text. */
const offences = (text: string): string[] => {
  const links = [...text.matchAll(LINK)].map(([url]) => decoded(url));
  const found = [text, ...links].flatMap((part) => [...part.matchAll(BRAND), ...part.matchAll(SITE)]);
  const lowerCase = links.flatMap((link) => [...link.matchAll(LINK_BRAND)]);
  return [...new Set([...found, ...lowerCase].map((m) => m[0]))];
};

describe('no Russian cars', () => {
  it('the search would find what it is for', () => {
    expect(offences("cars: ['ВАЗ-2101', 'ВАЗ-21013'], name: 'VAZ-2101 (Lada)', «Нива» і Volga")).toEqual(['ВАЗ', 'VAZ', 'Lada', 'Нива', 'Volga']);
    expect(offences("sources: ['https://auto.ru/catalog/', 'https://ru.wikipedia.org/wiki/x', 'https://www.zr.ru']")).toEqual(['https://auto.ru', 'https://ru.wikipedia.org', 'https://www.zr.ru']);
    expect(offences("'https://zr.ru?id=1', 'https://en.avtotachki.com/dvigatel/', 'https://www.drive2.com/r/x'")).toEqual(['https://zr.ru', 'https://en.avtotachki.com', 'https://www.drive2.com']);
    expect(offences("'https://www.auto-data.net/en/lada-2107-1.5-71hp', 'https://uk.wikipedia.org/wiki/%D0%92%D0%90%D0%97-2101'")).toEqual(['ВАЗ', 'lada']);
    expect(offences('ValveState, газ, нива, лада, PLURAL, натуральний, ЗАЗ-1102 «Таврія», МеМЗ-245, https://www.auto-data.net/ru-x')).toEqual([]);
    expect(offences("'https://uk.wikipedia.org/wiki/Природний_газ', 'https://en.wikipedia.org/wiki/Natural_gas_vehicle', 'https://www.ultimatespecs.com/car-specs/Brazil', 'https://magazine.example.com/thesaurus', 'https://ru.example.com.ua/'")).toEqual([]);
  });

  it.each(files)('%s names none and links to no Russian site', (file) => {
    expect(offences(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
