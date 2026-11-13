// Names of the engine core's ids, for pages to show. The core (src/engine/) holds ids only and never calls t(): it
// reaches the audio worklet, and a section may load it before its own dictionary.

import type { Aspiration, Family, Valvetrain } from '../engine/spec.ts';
import { t } from '../i18n/t.ts';

export const FAMILY_NAMES: Record<Family, string> = {
  inline: t('Рядні'),
  vee: t('V-подібні'),
  flat: t('Опозитні та плоскі'),
  narrow: t('VR і W'),
  rotary: t('Роторні'),
};

export const ASPIRATION_NAMES: Record<Aspiration, string> = {
  na: t('атмосферний'),
  turbo: t('турбо'),
  'twin-turbo': t('дві турбіни'),
  'quad-turbo': t('чотири турбіни'),
  supercharged: t('механічний нагнітач'),
};

export const VALVETRAIN_NAMES: Record<Valvetrain, string> = {
  dohc: t('два розподільчі вали в головці'),
  sohc: t('один розподільчий вал у головці'),
  ohv: t('нижній розподільчий вал і штанги'),
};
