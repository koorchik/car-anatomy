// The article under the scene's controls: on a car's page the block about the car comes first and the article about
// the layout goes under a heading about the layout in general (pages.ts), as on the engine pages. Here is the macpherson page's
// own article: what the strut is, how to read the scenes, what the setup changes, where the strut came from and where
// the numbers come from. Each page's article has its own dictionary (src/i18n/en/suspension-<page>.ts); the other
// pages' articles are in articles/.

import { t } from '../../i18n/t.ts';
import { doubleWishboneArticleHtml } from './articles/double-wishbone.ts';
import { multilinkArticleHtml } from './articles/multilink.ts';
import { semiTrailingArticleHtml } from './articles/semi-trailing.ts';
import { swingAxleArticleHtml } from './articles/swing-axle.ts';
import { trailingArmArticleHtml } from './articles/trailing-arm.ts';
import { carBlockHtml, type PageChoice } from './pages.ts';

const source = (href: string, text: string): string => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

export const macphersonArticleHtml = (): string => `<section class="susp-article">
      <h3>${t('Про стійку Макферсон')}</h3>
      <p>${t('У стійці Макферсон амортизатор жорстко затиснутий у поворотному кулаці й сам працює верхньою ланкою, а низ кулака тримає один поперечний важіль. Пружина сидить на амортизаторі, а вісь, навколо якої повертається колесо, іде від верхньої опори стійки до кульової опори важеля. Деталей мало, і вони займають мало місця впоперек, тому так влаштована передня підвіска більшості компактних авто.')}</p>
      <h3>${t('Як читати сцену')}</h3>
      <p>${t('Колесо котиться на перешкоду, а дорога пливе під ним. Стрілки показують сили, що діють на колесо з кулаком: зелена від пружини, синя від амортизатора, жовта від дороги в плямі контакту, сіра — вага колеса, помаранчеві — сили в ланках. Масштаб один для всіх: 1 кН — 40 мм. Червона лінія на колесі — лазер розвалу, червона лінія на дорозі — лазер сходження, біла поруч показує напрямок прямо.')}</p>
      <p>${t('Сцена спершу рахує весь проїзд, а потім показує його з вибраним уповільненням. Тому цифри під стрічкою з’являються одразу після будь-якої зміни, а «Уповільнення ×0,1» показує той самий проїзд, що й «Реально», лише в десять разів повільніше.')}</p>
      <h3>${t('Розворот розвалу')}</h3>
      <p>${t('Сцена «Хід колеса» показує головну слабкість стійки. Розвал набирається лише до певного ходу, тут близько +60 мм, а далі нижній важіль і стійка розходяться, і розвал повертає назад: це видно і на кривій, і на лазері розвалу. «Занизити на 40 мм» з’їдає більшу частину цього запасу, а центр крену опускається майже до дороги. Тому заниженій стійці часто ставлять подовжені кульові опори або проставки під важіль.')}</p>
      <h3>${t('Як це відчувається')}</h3>
      <p>${t('Пружина тримає кузов, а амортизатор гасить гойдання: зі зношеним колесо після горба підстрибує кілька разів, і шина на мить зовсім не тисне на дорогу, а з трековим кузов смикається сильніше. Кузов і колесо мають різні власні частоти, близько 1 Гц і близько 14 Гц, тому коротка перешкода на швидкості трясе колесо, а повільний горб гойдає кузов. Легше колесо швидше повертається на дорогу, а кузов цієї різниці майже не помічає.')}</p>
      <h3>${t('Що змінює «Налаштувати»')}</h3>
      <p>${t('Жорсткість пружини змінює частоту кузова, але авто стоїть на тій самій висоті: опора пружини підлаштовується, як у різьбовій підвісці. Висота кузова переставляє опору, тож колесо в спокої опиняється в іншій точці ходу, і розвал зі сходженням змінюються самі. Розвал змінюють зсувом верхньої опори стійки, сходження — довжиною рульової тяги, і після зсуву опори сходження виставляють знову, як у майстерні. Тиск у шині змінює лише її вертикальну жорсткість.')}</p>
      <h3>${t('Звідки взялася')}</h3>
      <p>${t('Ерл Макферсон придумав стійку в General Motors для малого авто Chevrolet Cadet, проєкт якого закрили в 1947 році. Патенти на неї отримали GM (1947) і Ford (1949), а першим серійним авто зі стійками став британський Ford Consul 1950 року. Ford Vedette 1949 року часто називають першим помилково: спершу він мав подвійні важелі.')} ${source('https://en.wikipedia.org/wiki/MacPherson_strut', t('Вікіпедія'))}</p>
      <h3>${t('Звідки цифри')}</h3>
      <p class="susp-note">${t('Точки кріплення стійки, важеля й рульової тяги виміряні на справжньому компактному передньопривідному авто: JTEKT Engineering Journal 1019E (2023), таблиця 1. Модель авто стаття не називає. Висота центра колеса, межі ходу, пружина, відбійник і піввісь типові: їх у статті немає.')}</p>
      <p class="susp-note">${t('Не звірено: маси кута (400 кг кузова й 40 кг колеса — еталонна чверть авто з розрахунків, а не маси авто JTEKT); заводський амортизатор (ступінь демпфування 0,25, пресет «Комфорт»); зміна маси колеса з дисками. Сталевий диск важчий за литий приблизно на 2,3 кг (5 фунтів для 16 дюймів, за даними продавця коліс), кований легший за литий до чверті (за MotorTrend), а маса литого диска 8 кг — наша оцінка.')}</p>
    </section>`;

/** The article of a page or a car's page. */
export function pageArticleHtml(c: PageChoice): string {
  const articles: Partial<Record<string, () => string>> = {
    'double-wishbone': doubleWishboneArticleHtml,
    multilink: multilinkArticleHtml,
    'trailing-arm': trailingArmArticleHtml,
    'semi-trailing': semiTrailingArticleHtml,
    'swing-axle': swingAxleArticleHtml,
  };
  const own = (articles[c.page.id] ?? macphersonArticleHtml)();
  return c.car ? carBlockHtml(c.car) + own : own;
}
