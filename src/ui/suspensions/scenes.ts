// The scenes of the suspension page and the address that picks one (`?s=`, suspensions plan, addresses). The bump
// scene opens by default; the rough road and the shaker are stage P3's; the travel scene is the rig of stage P1b, where
// a slider holds the wheel at any travel; the roll scene (stage P7) turns the whole car. More scenes come with their
// stages and join this list; ↑ and ↓ go through it.

import { t } from '../../i18n/t.ts';

export type SceneId = 'bump' | 'road' | 'shaker' | 'travel' | 'roll';
export const SCENES: readonly SceneId[] = ['bump', 'road', 'shaker', 'travel', 'roll'];
export const DEFAULT_SCENE: SceneId = 'bump';

export const sceneLabel = (id: SceneId): string => ({ bump: t('Перешкода'), road: t('Погана дорога'), shaker: t('Стенд'), travel: t('Хід колеса'), roll: t('Крен') })[id];

/** The scenes of the ride (stage P3): they share the wheel's mass and the article on measuring a suspension. */
export const isRideScene = (id: SceneId): id is 'road' | 'shaker' => id === 'road' || id === 'shaker';

/** The scene a route's `s=` names, or the default for anything else. */
export const sceneOf = (query: Record<string, string>): SceneId => (SCENES.includes(query.s as SceneId) ? (query.s as SceneId) : DEFAULT_SCENE);

/** The scene `direction` steps away from `id`, round the list. */
export const stepScene = (id: SceneId, direction: -1 | 1): SceneId => SCENES[(SCENES.indexOf(id) + direction + SCENES.length) % SCENES.length]!;
