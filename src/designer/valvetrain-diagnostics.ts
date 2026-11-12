// What the variable valve gear does wrong, in plain words. Like the rest of the diagnostics it forbids
// nothing: a cam switch at the wrong speed still works, it just leaves torque behind.

import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { isRotary, type Design } from './design.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { Performance } from './physics.ts';
import { deactivationSets, parkCam, reliefLimit, remainingIntervals } from './valvetrain.ts';

const rpm = (v: number): string => (Math.round(v / 100) * 100).toLocaleString(numberLocale);

export function valvetrainDiagnostics(d: Design, perf: Performance): Diagnostic[] {
  const out: Diagnostic[] = [];
  const vt = perf.valvetrain;
  if (!vt || isRotary(d)) return out;
  const add = (id: string, severity: Diagnostic['severity'], title: string, text: string, fix?: string): void => {
    out.push({ id, severity, title, text, fix });
  };

  if (d.camSwitch !== 'none') {
    if (vt.crossoverRpm === null) {
      add('switch-useless', 'note', t('Високий кулачок нічого не дає'), t('На жодних обертах високий кулачок не дає більше моменту, ніж низький, тож перемикання тільки додає деталей.'), t('Збільш фазу чи підйом основного кулачка або зменш низький.'));
    } else if (Math.abs(d.switchRpm - vt.crossoverRpm) > 600 && vt.switchDeficitNm > 1) {
      const early = d.switchRpm < vt.crossoverRpm;
      add(
        early ? 'switch-early' : 'switch-late',
        'warning',
        early ? t('Кулачки перемикаються зарано') : t('Кулачки перемикаються запізно'),
        t('Перемикання стоїть на {at} об/хв, а криві моменту двох кулачків перетинаються на {cross} об/хв. Між ними двигун недодає до {nm} Н·м.', { at: rpm(d.switchRpm), cross: rpm(vt.crossoverRpm), nm: Math.round(vt.switchDeficitNm) }),
        t('Постав перемикання ближче до {cross} об/хв.', { cross: rpm(vt.crossoverRpm) }),
      );
    }
  }

  if (d.camPhaser !== 'none' && vt.reliefMm > 0.8 * reliefLimit(d)) {
    add('relief-deep', 'note', t('Глибокі виборки в поршні'), t('Щоб клапан не вдарив поршень у крайньому положенні фазообертача, у днищі потрібні виборки {mm} мм. Вони псують форму камери, тому виробники рідко дають фазообертачу більше 50–70°.', { mm: vt.reliefMm.toFixed(1) }), t('Менший діапазон фазообертача або менший підйом.'));
  }
  if (d.camPhaser !== 'none' && parkCam(d).events.overlap > 40) {
    add('phaser-idle', 'note', t('Фазообертач не врятує холостий хід'), t('Навіть у вихідному положенні клапани перекриваються на {deg}°, тож на холостому ходу частина газів повертається у впуск.', { deg: Math.round(parkCam(d).events.overlap) }), t('Більший кут між кулачками або коротші фази.'));
  }

  if (d.deactivation !== 'none') {
    for (const set of deactivationSets(d)) {
      const gaps = remainingIntervals(d, set);
      const low = Math.min(...gaps);
      const high = Math.max(...gaps);
      if (high - low > 60) {
        add('deact-uneven', 'warning', t('Після вимкнення спалахи нерівні'), t('Коли циліндри {list} відпочивають, решта спалахує через {low}°…{high}°, і двигун трусить. Виробники вимикають кожен другий за порядком запалювання на колінвалі з рівними спалахами, і залишок спалахує рівно.', { list: set.join(', '), low: Math.round(low), high: Math.round(high) }), t('Рівні спалахи на колінвалі дадуть рівний залишок.'));
        break;
      }
    }
    if (perf.cruise.reachable && perf.cruise.activeCylinders === d.cylinders) {
      add('deact-unused', 'note', t('Вимкнення циліндрів на круїзі не вмикається'), t('Половині циліндрів на круїзі не вистачає сили або вигоди, тож блок керування тримає всі. Вимкнення спрацює хіба що при ще меншому навантаженні.'));
    }
  }

  if (!isRotary(d) && perf.effectiveCompression < 0.8 * d.compression) {
    add('atkinson', 'note', t('Цикл Аткінсона'), t('Впуск закривається так, що стискається лише {eff} : 1, а розширюється на всі {geo} : 1. Детонації менше, ККД вищий, але момент на літр нижчий.', { eff: perf.effectiveCompression.toFixed(1), geo: d.compression.toFixed(1) }));
  }
  return out;
}
