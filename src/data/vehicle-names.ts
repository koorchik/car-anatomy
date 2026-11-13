// Names of the vehicle core's ids, for pages to show. The core (src/vehicle/) holds ids only and never imports t(),
// so a module that reaches the audio worklet or loads before a section's dictionary never carries text.

import { t } from '../i18n/t.ts';
import type { TestSectorId } from '../vehicle/track.ts';
import type { TyreId } from '../vehicle/vehicle.ts';

export const TYRE_NAMES: Record<TyreId, string> = {
  classic: t('Класичні'),
  street: t('Дорожні'),
  semi: t('Напівсліки'),
  slick: t('Сліки'),
};

export const SECTOR_NAMES: Record<TestSectorId, string> = {
  'start-finish': t('Пряма старт-фініш'),
  hairpin: t('Шпилька'),
  chicane: t('Шикана'),
  slalom: t('Слалом'),
  'fast-sweeper': t('Швидка дуга'),
  'back-straight': t('Задня пряма з горбом'),
  carousel: t('Карусель'),
  'right-hander': t('Правий'),
};

export const TRACK_NAMES: Record<string, string> = {
  test: t('Тестове коло'),
};
