// The car builder's figures as the "what this changes" checks compare them (src/shared/sensitivity-core.ts) and as the
// page and scripts/car-table.ts list them. Each says which model gave it and at what level (`level`), as the plan
// wants beside every figure.

import { t } from '../i18n/t.ts';
import type { Metric } from '../shared/sensitivity-core.ts';
import { G } from '../vehicle/constants.ts';
import type { CarPerformance } from './evaluate.ts';

const DEG = 180 / Math.PI;

export type MetricLevel = 'estimate' | 'quasi-static' | 'lap' | 'chassis' | 'geometry';

export interface CarMetric extends Metric {
  level: MetricLevel;
}

/** Figures of a build; NaN where a model has nothing to say (no chassis, a gear that cannot pull). */
export function carMetrics(p: CarPerformance): CarMetric[] {
  const pct = (id: string, name: string, value: number | null, level: MetricLevel): CarMetric => ({ id, name, value: value ?? Number.NaN, format: 'percent', level });
  const val = (id: string, name: string, value: number | null, unit: string, digits: number, scale: number, level: MetricLevel): CarMetric => ({
    id, name, value: value ?? Number.NaN, format: 'value', unit, digits, scale, level,
  });
  const s = t('с');
  const c = p.chassis;
  return [
    val('mass', t('Маса'), p.massKg, t('кг'), 0, 50, 'estimate'),
    val('frontShare', t('Вага на передній осі'), p.frontShare * 100, '%', 1, 5, 'estimate'),
    val('cgHeight', t('Висота центру мас'), p.cgHeightM * 1000, t('мм'), 0, 20, 'estimate'),
    val('zeroTo100', t('0–100 км/год'), p.zeroTo100S, s, 2, 0.5, 'quasi-static'),
    val('zeroTo400', t('0–400 м'), p.zeroTo400mS, s, 2, 0.5, 'quasi-static'),
    val('eightyTo120', t('80–120 км/год на п\'ятій'), p.eightyTo120S, s, 2, 0.5, 'quasi-static'),
    val('vmax', t('Максимальна швидкість'), p.vmaxKmh, t('км/год'), 0, 10, 'quasi-static'),
    val('lap', t('Час кола'), p.lapTimeS, s, 2, 1, 'lap'),
    val('fuel90', t('Витрата на 90 км/год'), p.fuel90, t('л/100 км'), 1, 0.5, 'estimate'),
    val('fuel120', t('Витрата на 120 км/год'), p.fuel120, t('л/100 км'), 1, 0.5, 'estimate'),
    pct('gearboxLoad', t('Навантаження зубців коробки'), p.gearboxReliability.worst.load, 'quasi-static'),
    val('clutch', t('Запас зчеплення'), p.gearbox.clutch.margin, '', 2, 0.1, 'quasi-static'),
    val('spin', t('Буксування до'), p.spinKmh, t('км/год'), 0, 10, 'quasi-static'),
    val('fit', t('Двигун виходить за відсік'), Math.max(...Object.values(p.fit.overMm)), t('мм'), 0, 20, 'geometry'),
    val('crankDrop', t('Двигун нижче, ніж у донора'), p.fit.crankDropMm, t('мм'), 0, 10, 'geometry'),
    pct('braking', t('Гальмівний шлях 100–0'), c ? c.brakingM : null, 'chassis'),
    pct('skidpad', t('Межа на скідпеді'), c ? c.skidpadAcc / G : null, 'chassis'),
    val('understeer', t('Недостатня поворотність'), c ? c.understeerPerG * DEG : null, t('°/g'), 2, 1, 'chassis'),
    pct('rideF', t('Частота кузова спереду'), c ? c.axles[0].rideHz : null, 'chassis'),
    pct('rideR', t('Частота кузова ззаду'), c ? c.axles[1].rideHz : null, 'chassis'),
    pct('comfort', t('Прискорення кузова на дорозі'), c ? c.comfortAw : null, 'chassis'),
  ];
}
