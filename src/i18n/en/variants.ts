/** English for what a page says about one real engine. Key: page id, or `page/variant`. */
export interface FactsTextEn {
  name: string;
  note: string;
  cars: string[];
  years: string;
  /** Only where the source language writes the code in Cyrillic. */
  engineCode?: string;
  sumpNote?: string;
}

export const VARIANT_TEXT_EN: Record<string, FactsTextEn> = {
  i1: {
    name: 'Royal Enfield Bullet 500',
    note: 'A long 90 mm stroke, pushrods, and peak power at just 5250 rpm produce sparse, separate exhaust beats that the high-revving single-cylinder engines on this page do not have.',
    cars: [],
    years: '',
  },
  'i1/honda-cg125': {
    name: 'Honda CG125',
    note: 'The smallest engine on this page at 124 cc. It also uses pushrods, but it revs to a power peak at 8500 rpm. At peak power that is about 71 firing events per second versus 44 for the Bullet, so the tone is higher and each firing pulse is much weaker.',
    cars: ['Honda CG125 (motorcycle)'],
    years: '1976-2008',
  },
  'i1/ktm-690-duke': {
    name: 'KTM 690 Duke (LC4)',
    note: 'The largest bore on this page at 105 mm. With a short stroke and four valves it makes 73 hp versus 27.6 for the Bullet. At peak power there are 67 firing events per second versus 44, so the sound is higher and sharper, but the firing interval is the same 720°.',
    cars: ['KTM 690 Duke (motorcycle)'],
    years: '2016-2019',
  },
  'i1/vespa-gts-300-hpe': {
    name: 'Vespa GTS 300 hpe',
    note: 'A concrete example of a scooter engine: 278 cc, liquid cooling, and four valves. Power is almost the same as the Bullet, but it peaks at 8250 rpm instead of 5250, and the enclosed scooter muffler gives an even hum instead of separate beats.',
    cars: ['Vespa GTS 300 hpe (scooter)'],
    years: '2019-',
  },

  i2: {
    name: 'Fiat 0.9 TwinAir',
    note: 'The only engine on this page with a turbocharger and electrohydraulic MultiAir. From 875 cc it makes 85 hp, and 145 N·m from as low as 1900 rpm.',
    cars: [],
    years: '',
  },
  'i2/fiat-500-f': {
    name: 'Fiat 500 F (499.5 cc)',
    note: 'The oldest on this page: air cooling, pushrods, and 18 hp. The 360° firing interval is the same as the TwinAir, but with no turbine, nothing but a small muffler quiets the exhaust, so you hear the clatter and the cooling fan.',
    cars: ['Fiat 500 F', 'Fiat 500 L'],
    years: '1965-1973',
  },
  'i2/fiat-126-594': {
    name: 'Fiat 126 (594 cc)',
    note: 'The same Fiat 500 engine, bored out to 594 cc with the old 70 mm stroke. At peak power there are 80 firing events per second versus 92 for the TwinAir, so the tone is lower, and torque is only 39 N·m.',
    cars: ['Fiat 126'],
    years: '1972-1977',
  },
  'i2/bmw-i3-rex': {
    name: 'BMW i3 REx (generator)',
    note: 'The only uneven firing interval on this page, 270° and 450°, because the crankpins are offset by 90°. The rhythm limps instead of running evenly. The engine only drives a generator, so its rpm has no link to vehicle speed. It comes from the BMW C 600 Sport scooter.',
    cars: ['BMW i3 Range Extender'],
    years: '2017-2021',
  },
  'i2/tata-nano': {
    name: 'Tata Nano 624 cc',
    note: 'A square engine (73.5 by 73.5 mm) with one camshaft and two valves per cylinder, the simplest of the modern engines here. Firing events are as sparse as in the TwinAir, but with no turbine and half as strong, so the burble is quiet and nothing muffles it.',
    cars: ['Tata Nano'],
    years: '2008-2018',
  },
  'i2/honda-n360': {
    name: 'Honda N360',
    note: 'An engine of motorcycle origin (CB450): just 354 cc, air cooling, and a power peak at 8500 rpm. The crankshaft is also 360°, but at peak power that is 142 firing events per second versus 92 for the TwinAir, so the tone is noticeably higher.',
    cars: ['Honda N360', 'Honda Vamos'],
    years: '1967-1972',
  },

  b2: {
    name: 'Citroën 2CV (602 cc)',
    note: 'This two-valve 602 cc air-cooled engine makes only 29 hp but revs to 5750 rpm, much faster than the Tatra 11 and far calmer than the BMW R 1250.',
    cars: [],
    years: '',
  },
  'b2/bmw-r1250': {
    name: 'BMW R 1250 GS 1254 cc ShiftCam',
    note: 'Twice the displacement, with four valves per cylinder and ShiftCam variable valve timing. Firing events still come every 360°, but peak power is at 7750 rpm versus 5750 for the 2CV, so the beat sounds louder and higher.',
    cars: ['BMW R 1250 GS', 'BMW R 1250 GS Adventure', 'BMW R 1250 R'],
    years: '2019-2023',
  },
  'b2/tatra-11': {
    name: 'Tatra 11 1056 cc',
    note: 'A long 100 mm stroke, a 4.8 compression ratio, and just 2800 rpm. There are half as many firing events per second as the 2CV at its power peak, so the engine sounds like a slow, dull beat.',
    cars: ['Tatra 11'],
    years: '1923-1927',
  },
  'b2/panhard-tigre': {
    name: 'Panhard PL 17 Tigre 848 cc',
    note: 'A short-stroke two-cylinder with roller bearings on the crankshaft and torsion-bar valve springs. In 1962 Motor Sport wrote that it barely pulls below 3000 rpm, so it was kept at 4000-6000 rpm. That is the same rpm as the 2CV, but with almost twice the power.',
    cars: ['Panhard PL 17 Tigre'],
    years: '1959-1965',
  },
  'b2/toyota-sports-800': {
    name: 'Toyota Sports 800 2U 790 cc',
    note: 'A Japanese sports version of the same layout: two carburetors, a 9.0 compression ratio, and fan-driven air cooling. It differs from the 2CV in its larger displacement and higher output, so the beat is stronger at similar rpm.',
    cars: ['Toyota Sports 800'],
    years: '1965-1969',
  },
  'b2/bmw-700': {
    name: 'BMW 700 697 cc',
    note: 'A rear-mounted BMW boxer twin of 697 cc with air cooling. Power is close to the 2CV, but the peak is lower, 5000 rpm versus 5750, so the beat is lower too.',
    cars: ['BMW 700'],
    years: '1959-1965',
  },

  v2: {
    name: 'Harley-Davidson Milwaukee-Eight 107',
    note: 'The smallest bank angle on this page. 45° with a shared crankpin gives firing intervals of 315° and 405° of crankshaft rotation, and the 111 mm stroke with peak power around 5250 rpm makes these uneven beats sparse and individually audible.',
    cars: [],
    years: '',
  },
  'v2/ducati-1299-panigale': {
    name: 'Ducati 1299 Panigale Superquadro',
    note: 'A very short 60.8 mm stroke with a 116 mm piston allows more than 10,000 rpm, twice the base engine. The 90° bank angle sets firing intervals of 270° and 450°, so at high rpm the uneven rhythm blends into a sharp crackle.',
    cars: ['Ducati 1299 Panigale', 'Ducati 1299 Panigale S'],
    years: '2015-2017',
  },
  'v2/ktm-1290-super-duke-r': {
    name: 'KTM 1290 Super Duke R LC8',
    note: "The 75° bank angle sits between the Ducati and the Harley, with firing intervals of 285° and 435°. The stroke is longer than the Ducati's, so peak torque arrives earlier and the sound is heavier at mid rpm. The real compression ratio is 13.5:1, but the knock model does not accept it, so here it is lowered to 13.25:1.",
    cars: ['KTM 1290 Super Duke R'],
    years: '2020-2023',
  },
  'v2/hd-pan-america-revolution-max': {
    name: 'Harley-Davidson Pan America Revolution Max 1250',
    note: 'The bank angle is only 60°, but the crankpins are offset by 30°, so the firing intervals are 270° and 450°, like a 90° engine. It is the same rhythm as the Ducati in a narrow engine, and nothing like the rhythm of the base 45° Harley.',
    cars: ['Harley-Davidson Pan America 1250'],
    years: '2021-',
  },
  'v2/moto-guzzi-v85-tt': {
    name: 'Moto Guzzi V85 TT',
    note: 'The same 90° bank angle and the same 270° and 450° firing intervals as the Ducati, but with 853 cc, air cooling, and pushrods instead of overhead camshafts. Peak power is at 7750 rpm versus 10,500 for the Ducati, so the same uneven rhythm sounds slower and the individual beats are more distinct.',
    cars: ['Moto Guzzi V85 TT'],
    years: '2019-',
  },

  i3: {
    name: 'Toyota GR Yaris G16E-GTS',
    note: 'The largest displacement on this page: 1618 cc and 261 hp at 6500 rpm in the European GR Yaris, so at peak power it has the most frequent firing events of the inline-threes here.',
    cars: [],
    years: '',
  },
  'i3/fiesta-10-ecoboost': {
    name: 'Ford Fiesta 1.0 EcoBoost',
    note: 'The smallest turbocharged inline-three on this page at 999 cc. It has no balance shaft. A deliberately unbalanced flywheel and pulley cancel the vibration, so idle is slightly rougher than an inline-four. The turbine muffles the exhaust, and you hear more hum than distinct tone.',
    cars: ['Ford Fiesta Mk6/Mk7', 'Ford Focus Mk3', 'Ford EcoSport', 'Ford B-Max'],
    years: '2012-2023',
  },
  'i3/fiesta-st-15-ecoboost': {
    name: 'Ford Fiesta ST 1.5 EcoBoost',
    note: 'One and a half liters in an aluminum block, with one cylinder deactivated at light load. Unlike the 1.0 EcoBoost, the exhaust is tuned for sound. Reviewers describe a burble at idle and a low growl near the rev limiter, although the turbine still damps some of the pulses.',
    cars: ['Ford Fiesta ST Mk8'],
    years: '2018-2020',
  },
  'i3/bmw-i8-15': {
    name: 'BMW i8 1.5',
    note: 'In its geometry this is half a BMW inline-six: cylinders of 82 by 94.6 mm, and the long stroke puts peak torque at 3700 rpm. It works with an electric motor, so it often starts only under load, and the turbine smooths the exhaust pulses.',
    cars: ['BMW i8'],
    years: '2014-2020',
  },
  'i3/daewoo-matiz-08': {
    name: 'Daewoo Matiz 0.8',
    note: 'The only inline-three on this page without boost: 796 cc and just two valves per cylinder. With no turbine, the three-cylinder rhythm is clearly audible even through a quiet muffler, but at 52 hp it is much weaker.',
    cars: ['Daewoo Matiz'],
    years: '1998-2015',
  },

  i4: {
    name: 'Honda K20A Type R',
    note: 'A naturally aspirated engine with VTEC cam switching. At its 8000 rpm power peak it makes 267 firing events per second, the most of the inline-fours on this page.',
    cars: [],
    years: '',
  },
  'i4/corolla-18-2zr-fe': {
    name: 'Toyota Corolla 1.8',
    note: 'An engine for daily driving: a long 88.3 mm stroke and a power peak at only 6000 rpm. At peak power there are about 200 firing events per second versus 267 for the K20A, and the quiet exhaust barely stands out in the cabin.',
    cars: ['Toyota Corolla E150', 'Toyota Corolla E170', 'Toyota Auris E150'],
    years: '2007-2019',
  },
  'i4/bmw-m3-e30-s14': {
    name: 'BMW M3 E30 (S14)',
    note: 'A cast-iron block, a large 93.4 mm bore, and an individual throttle plate for each cylinder. The peak is lower than the K20A at 225 firing events per second, but the individual throttles add a sharp intake noise, and each firing pulse is stronger because of the larger 2302 cc displacement.',
    cars: ['BMW M3 E30'],
    years: '1986-1989',
  },
  'i4/zaz-1102-memz-245': {
    name: 'ZAZ-1102 Tavria (MeMZ-245)',
    note: 'The Ukrainian engine of the Tavria, built in Melitopol, and the smallest on this page: 1091 cc, a single camshaft with rocker arms, and a two-barrel carburetor. The maker quotes 51 hp at 5300–5500 rpm and 78.5 N·m at 3000–3500 rpm, and its 5600 rpm limit is the lowest here. At peak power there are about 180 firing events per second versus 267 for the K20A, so the sound is lower and simpler.',
    cars: ['ZAZ-1102 Tavria'],
    years: '1988-1997',
    engineCode: 'MeMZ-245',
  },
  'i4/civic-type-r-k20c1': {
    name: 'Honda Civic Type R FK8',
    note: 'Nearly the same geometry as the K20A, 86 by 85.9 mm, but a turbocharger and direct injection give 400 N·m from 2500 rpm instead of 202 N·m at 7000 rpm. The turbine muffles the pulses and the rev limit is 1400 rpm lower, so the sound is duller than the naturally aspirated K20A.',
    cars: ['Honda Civic Type R FK8'],
    years: '2017-2021',
  },

  i4d: {
    name: 'Volkswagen 1.9 TDI PD',
    note: 'Unit injectors on each cylinder and two valves give very abrupt combustion, so this engine clatters louder than the common-rail engines on this page.',
    cars: [],
    years: '',
  },
  'i4d/vw-20-tdi-ea288': {
    name: 'Volkswagen 2.0 TDI (EA288)',
    note: 'The same 95.5 mm stroke, but common rail instead of unit injectors and four valves per cylinder. Injecting fuel in small portions softens combustion, so the clatter is quieter than the 1.9 PD even though power is higher.',
    cars: ['Volkswagen Golf VII 2.0 TDI', 'Škoda Octavia III 2.0 TDI', 'SEAT Leon III 2.0 TDI', 'Audi A3 8V 2.0 TDI'],
    years: '2012-2020',
  },
  'i4d/bmw-320d-n47': {
    name: 'BMW 320d (N47)',
    note: 'The most powerful inline-four on this page: 184 hp from 1995 cc, with a shorter 90 mm stroke and a larger 84 mm bore. The compression ratio is lower than the 1.9 PD, 16.5 versus 19, so the combustion hit is softer.',
    cars: ['BMW 320d E90 LCI', 'BMW 320d F30'],
    years: '2010-2014',
  },
  'i4d/mercedes-240d-om616': {
    name: 'Mercedes-Benz 240 D (OM616)',
    note: 'The only one without boost. Fuel goes into a prechamber, not directly into the cylinder, and it makes only 72 hp from 2399 cc. A prechamber clatters more softly than direct injection, but with no turbine nothing muffles the exhaust.',
    cars: ['Mercedes-Benz 240 D W123'],
    years: '1978-1985',
  },
  'i4d/peugeot-16-hdi': {
    name: 'Peugeot 1.6 HDi 110',
    note: 'The smallest displacement on this page, 1560 cc, with a small 75 mm bore and a variable-geometry turbine. Each firing pulse is weaker than in the VW 1.9, so the engine clatters more quietly, but peak torque is only 240 N·m.',
    cars: ['Peugeot 307', 'Peugeot 308', 'Peugeot 3008', 'Citroën C4', 'MINI Cooper D'],
    years: '2005-2011',
  },

  b4: {
    name: 'Subaru EJ257 (WRX STI)',
    note: 'The only turbocharged EJ on this page. The primary pipes for cylinders 2 and 4 are longer, so the pulses reach the turbine unevenly and produce the characteristic burble, which the turbine partly muffles.',
    cars: [],
    years: '',
  },
  'b4/impreza-ej201': {
    name: 'Subaru Impreza 2.0 EJ201',
    note: 'The same EJ, but naturally aspirated, with one camshaft per cylinder head and 125 hp. There is no turbine in the path, so the uneven pulses reach the muffler without smoothing, although the exhaust has less energy than in the STI.',
    cars: ['Subaru Impreza GD/GG 2.0'],
    years: '2000-2005',
  },
  'b4/subaru-ej253': {
    name: 'Subaru Forester / Outback 2.5 EJ253',
    note: 'The same bore and stroke as the STI, 99.5 by 79 mm, but with no turbo, one camshaft per cylinder head, a 10:1 compression ratio and, from 2006, two intake cam profiles (i-AVLS). The figures here are from the Forester SH; the Outback ranges from 167 to 173 hp depending on the market. The exhaust manifold of naturally aspirated cars is described as nearly equal in length, so the burble here is weaker than in turbocharged EJ engines.',
    cars: ['Subaru Forester SG/SH', 'Subaru Outback BP/BR'],
    years: '2005-2012',
  },
  'b4/subaru-fb25': {
    name: 'Subaru Forester / Outback 2.5 FB25',
    note: 'The successor to the EJ253, with the same displacement but different proportions: a smaller bore and a longer stroke, 94 by 90 mm, and two camshafts per cylinder head with variable timing on both intake and exhaust. Its 235 N·m arrives by 4100 rpm. The exhaust manifold was redesigned for faster catalytic converter warm-up and freer flow. It is set to equal length here, so the tone is more even than in the EJ253.',
    cars: ['Subaru Forester SH (from 2011)', 'Subaru Forester SJ', 'Subaru Outback BR/BS (2013-2019)'],
    years: '2011-2019',
  },
  'b4/gr86-fa24': {
    name: 'Toyota GR86 / Subaru BRZ 2.4 FA24',
    note: 'The same firing order as the EJ, but with an equal-length 4-2-1 exhaust manifold. The pulses arrive evenly, so there is no burble, only a more even tone without pulsation. The injectors feed both the cylinder and the intake, and the compression ratio is 12.5.',
    cars: ['Toyota GR86', 'Subaru BRZ (second generation)'],
    years: '2021-present',
  },
  'b4/beetle-1600': {
    name: 'Volkswagen Beetle 1.6 air-cooled',
    note: 'Pushrods, two valves per cylinder, and a power peak at only 4000 rpm. The cylinders are separate and cooled by a fan, so you hear the fan along with the low, calm beat.',
    cars: ['Volkswagen Beetle 1303 LS/S', 'Volkswagen Beetle 1600 (Typ 113)'],
    years: '1970-1992',
  },
  'b4/porsche-718-2-0': {
    name: 'Porsche 718 Cayman 2.0 turbo',
    note: 'A single turbocharger with a conventional wastegate sits where a six-cylinder would have two cylinders and makes 1.4 bar. Porsche deliberately uses exhaust pipes of different lengths to remove the rough tone, and the turbine smooths the pulses, so Car and Driver describes the sound as raspy and unlike a WRX.',
    cars: ['Porsche 718 Cayman', 'Porsche 718 Boxster'],
    years: '2016-2025',
  },
  'b4/porsche-718-2-5': {
    name: 'Porsche 718 Cayman S 2.5 turbo VTG',
    note: 'A larger 102 mm bore and a variable-geometry turbine. Boost is lower at 1.0 bar, and torque is higher. The exhaust is the same, so the tone is close to the 2.0 L, but the larger displacement gives the pulses more energy.',
    cars: ['Porsche 718 Cayman S', 'Porsche 718 Boxster S'],
    years: '2016-2025',
  },

  i5: {
    name: 'Audi 2.5 TFSI (RS 3)',
    note: 'The most powerful inline-five on this page: 400 hp up to 7000 rpm gives 292 firing events per second, the highest tone of these engines.',
    cars: [],
    years: '',
  },
  'i5/audi-quattro-wr': {
    name: 'Audi Quattro (WR)',
    note: 'The same 1-2-4-5-3 firing order as the RS 3, but one camshaft, two valves per cylinder, and a compression ratio of only 7.0. The power peak at 5500 rpm gives 229 firing events per second versus 292, so the tone is lower and the turbine is more audible.',
    cars: ['Audi Quattro'],
    years: '1980-1987',
  },
  'i5/volvo-850-t5': {
    name: 'Volvo 850 T5',
    note: 'A family car with a transverse inline-five and a broad torque band from 2000 rpm. The same inline-five rhythm sounds quieter than the Audi or the Ford: the turbine and a regular road-car exhaust system damp most of the pulses.',
    cars: ['Volvo 850 T5'],
    years: '1994-1996',
  },
  'i5/ford-focus-rs-mk2': {
    name: 'Ford Focus RS Mk2',
    note: 'A Volvo-designed engine reworked by Ford with different pistons, connecting rods, and turbocharger, and 1.4 bar of boost versus 0.7 on the Focus ST. At peak power there are 271 firing events per second. The turbine muffles the exhaust, but the press still notes the characteristic inline-five voice.',
    cars: ['Ford Focus RS Mk2'],
    years: '2009-2011',
  },
  'i5/mercedes-300d-om617': {
    name: 'Mercedes-Benz 300 D Turbodiesel (OM617)',
    note: 'The only diesel on this page: prechamber, cast-iron block and cylinder head, and two valves per cylinder. The inline-five rhythm is the same, but the power peak at 4350 rpm gives only 181 firing events per second, and the abrupt combustion is heard as a clatter over the low tone.',
    cars: ['Mercedes-Benz 300 D Turbodiesel W123', 'Mercedes-Benz 300 TD Turbodiesel S123', 'Mercedes-Benz 300 SD W126'],
    years: '1981-1985',
  },

  i6: {
    name: 'Toyota 2JZ-GTE',
    note: 'Two sequential turbochargers on a cast-iron block give 431 N·m at 3600 rpm, and the exhaust is noticeably muffled, unlike the naturally aspirated S54.',
    cars: [],
    years: '',
  },
  'i6/bmw-m3-e46-s54': {
    name: 'BMW M3 E46 (S54)',
    note: 'The only naturally aspirated engine on this page. With no turbines, nothing muffles the exhaust, and the power peak at 7900 rpm gives 395 firing events per second. This is the highest and loudest tone of these inline-sixes.',
    cars: ['BMW M3 E46', 'BMW Z4 M', 'BMW M Coupe/Roadster'],
    years: '2000-2006',
    sumpNote: 'A wet pan with several compartments: a separate pump returns oil from the front compartment when the car brakes. The heads are not scavenged, so it is not a dry sump.',
  },
  'i6/skyline-gtr-rb26dett': {
    name: 'Nissan Skyline GT-R (RB26DETT)',
    note: 'The same 86 mm bore as the 2JZ, but a short 73.7 mm stroke and only 2568 cc, so it revs more eagerly. At peak power there are 340 firing events per second versus 280 for the 2JZ, and two parallel turbochargers muffle the exhaust just the same.',
    cars: ['Nissan Skyline GT-R R32', 'Nissan Skyline GT-R R33', 'Nissan Skyline GT-R R34'],
    years: '1989-2002',
  },
  'i6/mercedes-m256': {
    name: 'Mercedes-Benz CLS 450 (M256)',
    note: 'A modern inline-six: aluminum block, one twin-scroll turbocharger, an electric compressor, and a 48 V system. The 500 N·m of torque is there from 1600 rpm, and the turbine and particulate filter make it the quietest on this page.',
    cars: ['Mercedes-Benz CLS 450 C257', 'Mercedes-Benz E 450 W213', 'Mercedes-Benz S 450 W222/W223', 'Mercedes-Benz GLE 450 V167'],
    years: '2017-',
  },
  'i6/toyota-supra-b58': {
    name: 'Toyota GR Supra (B58)',
    note: 'The modern successor to the 2JZ in the Supra: an aluminum closed-deck block, direct injection, and one turbocharger instead of two sequential ones. Torque is higher and arrives earlier, from 1600 rpm, and the turbine and particulate filter damp the exhaust more than in the A80.',
    cars: ['Toyota GR Supra A90', 'BMW Z4 M40i'],
    years: '2019-',
  },

  i6d: {
    name: 'Cummins 5.9 12V',
    note: 'The only engine on this page with a mechanical injection pump and two valves per cylinder. The abrupt combustion is heard as a loud clatter that the modern diesels here do not have.',
    cars: [],
    years: '',
  },
  'i6d/bmw-530d-b57': {
    name: 'BMW 530d (B57)',
    note: 'Nearly half the displacement of the Cummins, but an aluminum block, common rail, and 4000 rpm at peak power give more power. At peak power there are 200 firing events per second, and the turbine and particulate filter turn the clatter into an even hum.',
    cars: ['BMW 530d G30', 'BMW 330d G20', 'BMW X5 30d G05'],
    years: '2017-',
  },
  'i6d/bmw-m550d-b57s': {
    name: 'BMW M550d (B57S, four turbochargers)',
    note: 'The same 3-liter block as the 530d, but four turbochargers give 400 hp and 760 N·m. The gas passes through several turbines, so the exhaust pulses are damped the most, and the sound is quiet and even.',
    cars: ['BMW M550d G30', 'BMW X5 M50d G05', 'BMW 750d G11'],
    years: '2016-2020',
  },
  'i6d/mercedes-s400d-om656': {
    name: 'Mercedes-Benz S 400 d (OM656)',
    note: 'An aluminum block, a sprayed steel coating on the cylinder walls, and the lowest compression ratio on this page, 15.5. The 700 N·m of torque is there from 1200 rpm, and softer combustion and two turbochargers give a very even sound.',
    cars: ['Mercedes-Benz S 400 d W222', 'Mercedes-Benz S 400 d W223'],
    years: '2017-',
  },
  'i6d/mercedes-actros-om471': {
    name: 'Mercedes-Benz Actros (OM 471)',
    note: 'A 12.8 L truck engine: 530 hp at just 1600 rpm and 2600 N·m. At peak power there are 80 firing events per second versus 130 for the Cummins, so the tone is very low, although each firing pulse is much stronger.',
    cars: ['Mercedes-Benz Actros (truck)', 'Mercedes-Benz Arocs (truck)', 'Setra (bus)'],
    years: '2015-',
  },
  'i6d/toyota-1hd-fte': {
    name: 'Toyota Land Cruiser 100 (1HD-FTE)',
    note: 'Midway between the Cummins and passenger-car diesels: 4.2 L and four valves per cylinder driven from one camshaft through bridges. The 4200 rpm rev limit and 170 firing events per second at peak power give a low tone, but not a clattering one.',
    cars: ['Toyota Land Cruiser 100', 'Toyota Land Cruiser 70'],
    years: '1998-2007',
  },

  'v6-60': {
    name: 'Nissan VQ35DE',
    note: 'A naturally aspirated engine from a sports coupe: even firing events every 120° of crankshaft rotation, a 95.5 mm bore with a short 81.4 mm stroke, and 287 hp at 6200 rpm.',
    cars: [],
    years: '',
  },
  'v6-60/alfa-147-gta-busso-32': {
    name: 'Alfa Romeo 147 GTA 3.2 V6 Busso',
    note: 'Smaller displacement (3.2 L) and a smaller bore than the VQ35DE, a slightly shorter stroke, and firing events just as even, every 120°. Peak power is at the same 6200 rpm, so the firing frequency is identical, and the difference in sound comes from less displacement per firing event and the exhaust tuning.',
    cars: ['Alfa Romeo 147 GTA', 'Alfa Romeo 156 GTA'],
    years: '2002-2005',
  },
  'v6-60/camry-2gr-fe': {
    name: 'Toyota Camry V6 2GR-FE',
    note: 'Nearly the same displacement and even firing events as the base engine, but it is built for 87-octane gasoline and a quiet sedan cabin. The firing rhythm is the same, and the exhaust muffling removes most of the sharpness.',
    cars: ['Toyota Camry XV40', 'Toyota Camry XV50'],
    years: '2006-2017',
  },
  'v6-60/nissan-gtr-vr38dett': {
    name: 'Nissan GT-R VR38DETT',
    note: 'The same 95.5 mm bore and the same 60° layout, but with two turbochargers, twice the power, and a lower 9:1 compression ratio. The turbines muffle the exhaust pulses, so you hear less V6 character and more boost whistle.',
    cars: ['Nissan GT-R R35'],
    years: '2017-2025',
    sumpNote: 'Nissan calls it a hybrid wet and dry sump: a scavenge pump returns oil to the pan, but there is no separate tank.',
  },
  'v6-60/nissan-370z-vq37vhr': {
    name: 'Nissan 370Z VQ37VHR',
    note: 'The same bore and a longer stroke than the VQ35DE, but a higher 11:1 compression ratio and a rev limiter at 7500 rpm. At peak power the firing frequency is 350 Hz versus 310 Hz for the base engine, so it sounds higher.',
    cars: ['Nissan 370Z', 'Infiniti G37 Coupe'],
    years: '2009-2020',
  },

  'v6-90': {
    name: 'Buick 231 (pre-1977)',
    note: 'The largest displacement among the Buick engines on this page. Three crankpins at 120° give firing intervals of 90° and 150°, so the 3.8 L shakes and runs unevenly at idle.',
    cars: [],
    years: '',
  },
  'v6-90/buick-special-198': {
    name: 'Buick Special 198 Fireball',
    note: "The smallest engine on this page and the first V6 in an American production car. The firing intervals are the same 90° and 150° as the base engine, so the uneven rhythm remains, and the smaller displacement weakens each individual beat. Power is quoted gross, the standard of the time, so a direct comparison with the base engine's net figure overstates the difference.",
    cars: ['Buick Special', 'Buick Skylark'],
    years: '1962-1963',
  },
  'v6-90/jeep-cj5-dauntless-225': {
    name: 'Jeep CJ-5 Dauntless 225',
    note: 'The same block as the Buick, but in the off-roader it had a much heavier flywheel to absorb the vibration from the 90° and 150° firing intervals. The heavier flywheel smooths the idle and slows how fast the engine gains rpm, so it seems calmer even though the rhythm has not changed.',
    cars: ['Jeep CJ-5', 'Jeep CJ-6', 'Jeepster Commando'],
    years: '1966-1971',
  },
  'v6-90/maserati-merak-c114': {
    name: 'Maserati Merak C114',
    note: 'The only engine on this page with two overhead camshafts per bank and a short 75 mm stroke: 3 L, with power at 6000 rpm instead of 4000-4600 in the American V6s. The 90° bank angle is inherited from the Maserati V8, so the uneven rhythm is the same, only the beats come faster at higher rpm.',
    cars: ['Maserati Merak'],
    years: '1972-1983',
  },
  'v6-90/delorean-dmc12-prv': {
    name: 'DeLorean DMC-12 PRV ZMJ-159',
    note: 'The only aluminum block with one overhead camshaft per bank among these engines: the first-generation PRV with firing intervals of 90° and 150°. Offset crankpins arrived only in the next generation. The rhythm is as uneven as the Buick, but the short 73 mm stroke moves peak power to 5500 rpm.',
    cars: ['DeLorean DMC-12'],
    years: '1981-1983',
  },

  vr6: {
    name: 'Volkswagen 3.2 VR6 (Golf R32)',
    note: 'The largest naturally aspirated 15° VR6 on this page: 3.2 L, 24 valves, and one cylinder head shared by both banks give an even 120° between firing events, but a denser tone than the 2.8 L.',
    cars: [],
    years: '',
  },
  'vr6/passat-vr6-2-8': {
    name: 'Volkswagen Passat VR6 2.8 AAA',
    note: 'The first VR6: 12 valves and one camshaft per bank. Smaller displacement and a power peak 450 rpm lower make the sound calmer and lower than the 3.2 L, although the 1-5-3-6-2-4 firing order is the same.',
    cars: ['Volkswagen Passat B3', 'Volkswagen Passat B4', 'Volkswagen Corrado (North America)'],
    years: '1991-1996',
  },
  'vr6/audi-tt-3-2': {
    name: 'Audi TT 3.2 VR6 BHE',
    note: 'Essentially the base R32 engine with slightly more power: the same 84 by 95.9 mm and 320 N·m. The firing order and displacement are identical, so the difference in sound is small and depends mostly on the exhaust system.',
    cars: ['Audi TT 3.2 quattro (8N)', 'Volkswagen Golf R32 Mk5', 'Audi A3 3.2'],
    years: '2003-2009',
  },
  'vr6/porsche-cayenne-3-2': {
    name: 'Porsche Cayenne 3.2 VR6',
    note: "Nearly the same engine as the VW, but with Porsche's own intake manifold and tuning for a heavy SUV, with a power peak at 6000 rpm. In the cabin it sounds quieter than the Golf R32 because the muffling is tuned for comfort.",
    cars: ['Porsche Cayenne (955)'],
    years: '2004-2007',
  },
  'vr6/passat-r36': {
    name: 'Volkswagen Passat R36 3.6 FSI',
    note: 'The largest VR6: a narrow bank angle of about 10.6°, direct injection, and a power peak 350 rpm higher than the R32. The 3.6 L displacement and higher power give a fuller, louder tone at high rpm.',
    cars: ['Volkswagen Passat R36'],
    years: '2008-2010',
  },

  b6: {
    name: 'Porsche 911 GT3 4.0 (991.2)',
    note: 'A naturally aspirated 4.0 L with titanium connecting rods and solid valve lifters. It revs to 9000 rpm and has the highest power peak on this page at 8250 rpm.',
    cars: [],
    years: '',
  },
  'b6/porsche-992-carrera-3-0': {
    name: 'Porsche 911 Carrera (992) 3.0 twin-turbo',
    note: 'Smaller displacement, 3.0 L, and two turbochargers, one per bank. Peak torque of 450 N·m arrives from 1950 rpm, but the turbines take the sharpness out of the pulses, so the sound is lower and duller than the naturally aspirated GT3, and it revs 1500 rpm less.',
    cars: ['Porsche 911 Carrera (992)', 'Porsche 911 Carrera 4 (992)', 'Porsche 911 Carrera T (992)'],
    years: '2019-2024',
  },
  'b6/porsche-718-gt4-4-0': {
    name: 'Porsche 718 Cayman GT4 4.0',
    note: 'The same bore and stroke as the GT3 (102 by 81.5 mm), but a different design and a rev limit of 8000 rpm instead of 9000. There are 11% fewer firing events at the top of the range, so the naturally aspirated tone is lower than the GT3.',
    cars: ['Porsche 718 Cayman GT4', 'Porsche 718 Spyder'],
    years: '2019-2023',
  },
  'b6/porsche-cayman-981-3-4': {
    name: 'Porsche Cayman S (981) 3.4',
    note: 'A road-going naturally aspirated engine, 97 by 77.5 mm, with a 12.5 compression ratio, direct injection, variable intake timing and lift, and hydraulic lifters. Its 7800 rpm limit is 1200 rpm below the GT3, so the top-end tone is lower. This is the standard exhaust; the factory valved sport exhaust was an option. The figures are from the Cayman S, and the same engine makes 340 hp in the GTS.',
    cars: ['Porsche Cayman S (981)', 'Porsche Cayman GTS (981, 340 hp)', 'Porsche Boxster S (981, 315 hp)'],
    years: '2013-2016',
  },
  'b6/subaru-ez30-30r': {
    name: 'Subaru Legacy 3.0R EZ30D',
    note: 'A road-going Subaru boxer six of 245 hp, with three exhaust ports per cylinder head in the second version. The even 120° spacing gives the same even tone as the Porsche, but at lower rpm and, by estimate, more quietly.',
    cars: ['Subaru Legacy 3.0R', 'Subaru Outback 3.0R', 'Subaru Tribeca (2006-2007)'],
    years: '2004-2009',
  },
  'b6/porsche-993-carrera': {
    name: 'Porsche 911 Carrera (993) 3.6 air-cooled',
    note: 'The last air-cooled generation: two valves per cylinder, two spark plugs per cylinder, and a fan you can hear along with the exhaust. The rev limit is 2300 rpm below the GT3, so the sound is lower and more mechanical.',
    cars: ['Porsche 911 Carrera (993, 1994-1995)'],
    years: '1993-1995',
  },

  i8: {
    name: 'Duesenberg Model J',
    note: 'The largest engine on this page at 6.9 L, with two overhead camshafts and four valves per cylinder in a 1929 road car, so it combines a smooth pull with an intake unusual for its time.',
    cars: [],
    years: '',
  },
  'i8/bugatti-type-35': {
    name: 'Bugatti Type 35',
    note: 'Only 1991 cc, or 250 cc per cylinder, with one camshaft and three valves: two intake, one exhaust. The 6000 rpm rev limit gives 400 firing events per second versus 280 for the Model J, and the open race exhaust makes the tone high and sharp.',
    cars: ['Bugatti Type 35'],
    years: '1924-1930',
  },
  'i8/packard-one-sixty': {
    name: 'Packard One-Sixty (356 cu in)',
    note: 'A flathead (L-head) engine, with the valves in the block beside the cylinders, and nine main bearings. The power peak at only 3500 rpm gives 233 firing events per second, so the sound is low, soft, and quiet.',
    cars: ['Packard Super Eight One-Sixty', 'Packard Custom Super Eight One-Eighty'],
    years: '1940-1942',
  },
  'i8/mercedes-w196': {
    name: 'Mercedes-Benz W196 R (M196)',
    note: 'A 2.5 L race engine with desmodromic valves, direct injection, and power taken from the middle of the crankshaft. At the 8500 rpm power peak that is 567 firing events per second, twice as often as the Model J, and with no muffler, so the sound is sharp and very high.',
    cars: ['Mercedes-Benz W196 R'],
    years: '1954-1955',
  },
  'i8/alfa-romeo-8c-2300': {
    name: 'Alfa Romeo 8C 2300',
    note: 'Two aluminum blocks of four cylinders each and a Roots supercharger driven from the crankshaft. There is no turbine, so nothing damps the exhaust, and the supercharger whine is added to it. At peak power there are 333 firing events per second.',
    cars: ['Alfa Romeo 8C 2300'],
    years: '1931-1935',
  },

  'v8-cross': {
    name: 'Chevrolet LS3',
    note: 'A pushrod, naturally aspirated V8 with two valves per cylinder and a rev limiter at 6600 rpm. The cross-plane crankshaft gives each bank uneven exhaust pulses, and with no boost nothing muffles the low burble.',
    cars: [],
    years: '',
  },
  'v8-cross/camaro-ss-lt1': {
    name: 'Chevrolet Camaro SS 6.2 LT1',
    note: 'Nearly the same engine as the LS3: the same 6.2 L and firing order, but with direct injection and an 11.5:1 compression ratio. The exhaust rhythm and low burble have barely changed, but there is 42 N·m more torque at mid rpm.',
    cars: ['Chevrolet Camaro SS'],
    years: '2016-2024',
  },
  'v8-cross/mustang-gt-coyote-50': {
    name: 'Ford Mustang GT 5.0 Coyote',
    note: 'Smaller displacement and four valves per cylinder let it rev to 7500 rpm, 900 more than the LS3. The crankshaft is the same cross-plane type, so the burble stays at low rpm, but the sound is higher up top because the firing frequency reaches 500 Hz.',
    cars: ['Ford Mustang GT'],
    years: '2018-2023',
  },
  'v8-cross/challenger-srt-392': {
    name: 'Dodge Challenger SRT 392 6.4 HEMI',
    note: 'The largest engine on this page: 6.4 L, a cast-iron block, pushrods, and even more torque than the LS3. The large displacement in the same layout gives the strongest exhaust pulses on this page, and the 6400 rpm rev limiter is even lower than the 6600 on the LS3, so the sound comes mostly from the low range.',
    cars: ['Dodge Challenger SRT 392', 'Dodge Charger SRT 392'],
    years: '2015-2023',
  },
  'v8-cross/amg-c63s-m177': {
    name: 'Mercedes-AMG C 63 S M177',
    note: 'Displacement is just 4 L, but two turbochargers in the V give 700 N·m from as low as 1750 rpm. Each turbocharger sits on its own bank, so the cross-plane rhythm partly remains, but the turbine muffles the pulses and the sound is softer than the naturally aspirated V8s.',
    cars: ['Mercedes-AMG C 63 S W205'],
    years: '2015-2021',
  },
  'v8-cross/bmw-m5-f90-s63': {
    name: 'BMW M5 F90 S63',
    note: 'The crankshaft is cross-plane, but the exhaust manifold links cylinders across the banks so that each turbocharger gets a pulse every 180°. The uneven bank rhythm disappears before the turbines, so there is almost no typical V8 burble, and the sound is more even than the M177.',
    cars: ['BMW M5 F90'],
    years: '2018-2023',
  },

  'v8-flat': {
    name: 'Ferrari F136 FB (458 Italia)',
    note: 'A naturally aspirated engine with the highest rpm on this page. The flat-plane crankshaft alternates the banks evenly, and at 9000 rpm the firing frequency reaches 600 Hz, which gives a sharp, high sound with no burble.',
    cars: [],
    years: '',
  },
  'v8-flat/ferrari-488-gtb-f154': {
    name: 'Ferrari 488 GTB F154',
    note: 'A smaller 3.9 L displacement and two turbochargers give over 40% more torque than the F136 at half the rpm. The flat-plane crankshaft still alternates the banks, but the turbines take the exhaust pulses, so the sound is duller and lacks the top-end shriek of the 458.',
    cars: ['Ferrari 488 GTB', 'Ferrari 488 Spider'],
    years: '2015-2019',
  },
  'v8-flat/mclaren-720s-m840t': {
    name: 'McLaren 720S M840T',
    note: 'The shortest stroke on this page (73.5 mm) and a rev limiter at 8500 rpm, which is very high for a turbocharged engine. Peak torque is at 5500 rpm, later than the 488, and the flat-plane crankshaft and turbochargers give a sharp but muffled sound with boost whistle.',
    cars: ['McLaren 720S'],
    years: '2017-2023',
  },
  'v8-flat/mustang-gt350-voodoo-52': {
    name: 'Ford Mustang Shelby GT350 5.2 Voodoo',
    note: 'The longest stroke on this page, 93 mm, with a displacement of 5.2 L. The banks alternate evenly, as in the Ferrari, but at the redline the firing frequency is 550 Hz versus 600 Hz for the F136, and each firing pulse is larger, so the sound is lower and heavier.',
    cars: ['Ford Mustang Shelby GT350', 'Ford Mustang Shelby GT350R'],
    years: '2016-2020',
  },
  'v8-flat/corvette-z06-c8-lt6': {
    name: 'Chevrolet Corvette Z06 C8 LT6',
    note: 'The largest piston (104.25 mm) and 5.5 L displacement with a short 80 mm stroke, so the engine makes 670 hp without boost. At 8600 rpm the firing frequency is about 573 Hz, nearly matching the F136, but the large displacement makes each firing pulse heavier and the sound is lower than the Ferrari.',
    cars: ['Chevrolet Corvette Z06 C8'],
    years: '2023-',
  },

  v10: {
    name: 'Lexus LFA 1LR-GUE',
    note: 'The only engine on this page with a 72° bank angle. Ordinary shared crankpins give even firing intervals of 72° without split crankpins, and at 9000 rpm the firing frequency reaches 750 Hz.',
    cars: [],
    years: '',
  },
  'v10/audi-r8-52-fsi': {
    name: 'Audi R8 5.2 FSI V10',
    note: 'A 90° bank angle and shared crankpins give uneven firing intervals of 90° and 54°, unlike the even 72° of the LFA. The paired firing events add a component at half the fundamental frequency, so the sound is lower and raspier than the LFA.',
    cars: ['Audi R8 Type 42'],
    years: '2009-2015',
  },
  'v10/huracan-lp610-4': {
    name: 'Lamborghini Huracan LP 610-4',
    note: 'Mechanically the same 5.2 L as the R8, with the same 90° and 54° firing intervals, but 84 hp more and a power peak at 8250 rpm instead of 8000. The rhythm does not change, so the difference in sound comes only from slightly higher rpm and exhaust tuning. From model year 2016 one bank shuts off at light load and the V10 runs as a five-cylinder.',
    cars: ['Lamborghini Huracan LP 610-4'],
    years: '2014-2019',
  },
  'v10/bmw-m5-e60-s85': {
    name: 'BMW M5 E60 S85',
    note: 'The shortest stroke of the 90° V10s here (75.2 mm) and an individual throttle for each cylinder. The firing intervals are just as uneven, 90° and 54°, and the individual throttles shorten the air path to the cylinder. Throttle response is sharp, and at 8250 rpm you hear not just the exhaust but the intake too.',
    cars: ['BMW M5 E60', 'BMW M5 E61', 'BMW M6 E63'],
    years: '2005-2010',
    sumpNote: 'Two pans: electric pumps move oil from the smaller to the larger in corners. The heads are not scavenged, so it is not a dry sump.',
  },
  'v10/dodge-viper-84': {
    name: 'Dodge Viper 8.4 V10',
    note: 'Nearly twice the displacement, pushrods, and only two valves per cylinder, with power at 6150 rpm instead of 8700. The uneven 54° and 90° firing intervals at low rpm and very large firing pulses give a heavy, ragged drone unlike the LFA.',
    cars: ['SRT Viper', 'Dodge Viper ACR'],
    years: '2013-2017',
  },
  'v10/gallardo-50-even-fire': {
    name: 'Lamborghini Gallardo 5.0',
    note: 'The same 90° bank angle as its successors, but the crankpins are split by 18°, so the firing intervals are even at 72°. This is a clear comparison: the same bank angle with no component at half the firing frequency, so its rhythm is closer to the LFA than the later 5.2 L.',
    cars: ['Lamborghini Gallardo'],
    years: '2003-2005',
  },

  v12: {
    name: 'BMW S70/2 (McLaren F1)',
    note: 'A naturally aspirated V12 with a 60° bank angle, even 60° firing intervals, and individual throttles. At the 7500 rpm rev limiter the firing frequency is 750 Hz, lower than the F140 and L539, but no turbines muffle the exhaust.',
    cars: [],
    years: '',
  },
  'v12/ferrari-812-superfast-f140': {
    name: 'Ferrari 812 Superfast F140 GA',
    note: 'The 65° bank angle with shared crankpins gives slightly uneven firing intervals of 65° and 55°, not the even 60° of the S70/2. By ear this difference is almost undetectable. What changes the sound most is rpm: at 8900 rpm the firing frequency is about 890 Hz, so the sound is much higher than the base engine.',
    cars: ['Ferrari 812 Superfast', 'Ferrari 812 GTS'],
    years: '2017-2024',
  },
  'v12/aventador-lp700-4-l539': {
    name: 'Lamborghini Aventador LP 700-4 L539',
    note: 'The same 60° layout and even firing intervals as the S70/2, but a short 76.4 mm stroke and a higher power peak at 8250 rpm. At that rpm the firing frequency reaches 825 Hz, so the sound is higher than the base engine, but without the unevenness of the 65° Ferrari.',
    cars: ['Lamborghini Aventador LP 700-4'],
    years: '2011-2016',
  },
  'v12/aston-db11-ae31': {
    name: 'Aston Martin DB11 5.2 V12',
    note: 'A smaller 5.2 L displacement and two twin-scroll turbochargers: 700 N·m from as low as 1500 rpm, while the naturally aspirated S70/2 reaches its peak only at 5600. The turbines take the exhaust pulses, so the 12 cylinders are heard as an even, low noise rather than a high sound.',
    cars: ['Aston Martin DB11'],
    years: '2016-2018',
  },
  'v12/mercedes-s600-m275': {
    name: 'Mercedes-Benz S 600 M275',
    note: 'The least sporty engine on this page: one overhead camshaft per bank and three valves per cylinder, power at 5000 rpm, and 830 N·m from as low as 1900 rpm. It was built for silence: even 60° firing intervals, turbochargers, and mufflers nearly eliminate the exhaust sound.',
    cars: ['Mercedes-Benz S 600 W221'],
    years: '2005-2013',
  },

  f12: {
    name: 'Ferrari Tipo F113 (Testarossa)',
    note: 'A 4.9 L with four valves per cylinder and 390 hp, where each pair of opposing connecting rods shares one crankpin, which makes it a 180° V12 and not a true boxer.',
    cars: [],
    years: '',
  },
  'f12/ferrari-512bb': {
    name: 'Ferrari BB 512 4.9 F102B',
    note: "The same bore, stroke, and 180° layout with shared crankpins as the Testarossa, but two valves per cylinder and carburetors. Peak power is lower, 340 hp per the owner's manual, and the even 60° between firing events gives the same continuous tone.",
    cars: ['Ferrari 512 BB'],
    years: '1976-1981',
  },
  'f12/ferrari-f512m': {
    name: 'Ferrari F512 M 4.9 F113G',
    note: 'The last road version of the Testarossa engine: the same displacement, a 10.4 compression ratio, and a 7500 rpm rev limit. The power peak is 450 rpm higher, so the tone is higher in pitch than the Testarossa.',
    cars: ['Ferrari F512 M'],
    years: '1994-1996',
  },
  'f12/ferrari-312t': {
    name: 'Ferrari 312T 3.0 Tipo 015',
    note: 'A Formula 1 race engine with a very short 49.6 mm stroke and a power peak at 12,200 rpm. It has almost twice as many firing events per second as the Testarossa, so the tone is sharply higher and, without mufflers, much louder.',
    cars: ['Ferrari 312T', 'Ferrari 312T2', 'Ferrari 312T3', 'Ferrari 312T4', 'Ferrari 312T5'],
    years: '1975-1980',
  },
  'f12/porsche-917-912': {
    name: 'Porsche 917 4.5 Type 912',
    note: 'A German 180° V12 with shared crankpins, not a true boxer, despite the flat-twelve name. It has only two valves per cylinder and fan-driven air cooling, so fan noise joins the V12 tone.',
    cars: ['Porsche 917 (1969)'],
    years: '1969-1971',
  },
  'f12/alfa-115-12': {
    name: 'Alfa Romeo 3.0 Tipo 115-12',
    note: 'A rival to the Ferrari 312T from the same era: a 180° V12 in which each of the six crankpins carries two adjacent connecting rods. A smaller bore and longer stroke than the 312T put the power peak a little lower in rpm, and the tone is close.',
    cars: ['Brabham BT45', 'Brabham BT46', 'Alfa Romeo 33TT12'],
    years: '1973-1979',
  },

  w12: {
    name: 'Bentley 6.0 W12 (Continental GT)',
    note: 'The first W12 with two turbochargers, one per bank: 650 N·m from as low as 1600 rpm, and the turbines muffle the exhaust compared with the naturally aspirated W12s from Audi and VW.',
    cars: [],
    years: '',
  },
  'w12/a8-phaeton-6-0-420': {
    name: 'Audi A8 / VW Phaeton 6.0 W12 420 hp',
    note: 'The first production version of the family, naturally aspirated, for Audi and VW luxury sedans. There are no turbines, but heavy muffling makes it quiet, and the even 60° between firing events gives a very even tone.',
    cars: ['Audi A8 W12 (D2)', 'Volkswagen Phaeton W12'],
    years: '2001-2005',
  },
  'w12/a8-phaeton-6-0-450': {
    name: 'Audi A8 D3 / VW Phaeton 6.0 W12 450 hp',
    note: 'A naturally aspirated 6.0 L retuned to 450 hp. The figures are for the Audi. The Phaeton BRN makes the same power with 560 N·m at 2750-5000 rpm, so the sound is the same in character and quiet.',
    cars: ['Audi A8 W12 (D3)', 'Volkswagen Phaeton W12 (BRN, from 2005)'],
    years: '2003-2010',
  },
  'w12/touareg-6-0': {
    name: 'Volkswagen Touareg 6.0 W12',
    note: 'Tuned for a heavy SUV: 600 N·m, more than the sedans, and a lower torque peak at 3250 rpm. The displacement and firing order are the same, so the character of the tone is close, and the only difference is in the exhaust tuning.',
    cars: ['Volkswagen Touareg W12'],
    years: '2005-2010',
  },
  'w12/continental-supersports': {
    name: 'Bentley Continental Supersports 6.0 W12 710 hp',
    note: 'The same twin-turbocharged engine as the base, but 150 hp and 367 N·m stronger. The turbines muffle the pulses just the same, so the difference is felt more in the pull than heard in the tone.',
    cars: ['Bentley Continental Supersports (2017)'],
    years: '2017-2018',
  },

  w16: {
    name: 'Bugatti Veyron 8.0',
    note: 'The first production W16: 1001 hp and 1250 N·m from 2200 rpm on four turbochargers smaller than those on the Chiron, which makes it the weakest engine in the family.',
    cars: [],
    years: '',
  },
  'w16/veyron-super-sport': {
    name: 'Bugatti Veyron 16.4 Super Sport',
    note: 'The same 8.0 L as the base engine, but 200 hp and 250 N·m stronger. Four turbochargers damp most of the pulses, so you hear little of the beat, and the difference shows more in power than in tone.',
    cars: ['Bugatti Veyron 16.4 Super Sport', 'Bugatti Veyron Grand Sport Vitesse'],
    years: '2010-2015',
  },
  'w16/chiron': {
    name: 'Bugatti Chiron / Divo 8.0 W16',
    note: 'Larger turbochargers than the Veyron and 32 injectors give 1500 hp, with 1600 N·m at 2000-6000 rpm. The larger turbochargers take more exhaust energy, so you hear even less of the beat.',
    cars: ['Bugatti Chiron', 'Bugatti Chiron Sport', 'Bugatti Chiron Pur Sport', 'Bugatti Divo'],
    years: '2016-2022',
  },
  'w16/chiron-super-sport': {
    name: 'Bugatti Chiron Super Sport 8.0 W16 1600 hp',
    note: 'The most powerful road-going W16. The power peak is moved up to 7050 rpm by larger turbochargers and stronger pistons. The firing frequency at the top is higher than the Chiron, so the upper tone is slightly higher.',
    cars: ['Bugatti Chiron Super Sport', 'Bugatti Chiron Super Sport 300+', 'Bugatti Centodieci', 'Bugatti Mistral', 'Bugatti Bolide (production)'],
    years: '2019-2026',
  },
  'w16/bolide-race': {
    name: 'Bugatti Bolide 8.0 W16 on race fuel',
    note: 'A track version on 110-octane fuel with larger turbine blades. It makes 1850 hp at 7000 rpm, and minimal muffling makes it much louder than the road-going W16s.',
    cars: ['Bugatti Bolide (concept)'],
    years: '2020',
  },

  r2: {
    name: 'Mazda 13B-REW (RX-7 FD)',
    note: 'The only turbocharged engine on this page. Two sequential turbochargers on 654 cc per rotor give 294 N·m and muffle the sharp exhaust from the peripheral ports.',
    cars: [],
    years: '',
  },
  'r2/rx8-renesis': {
    name: 'Mazda RX-8 Renesis 13B-MSP',
    note: 'The same 654 cc per rotor, but with no turbocharger and with side exhaust ports. Less port overlap and a high 9000 rpm rev limit give an even, high tone without boost, and torque is much lower than the 13B-REW.',
    cars: ['Mazda RX-8 (250 hp version)'],
    years: '2003-2012',
  },
  'r2/rx7-sa22-12a': {
    name: 'Mazda RX-7 SA22C 12A',
    note: 'A naturally aspirated engine with narrower rotors, 70 mm versus 80 for the 13B. The 130 hp figure applies only to the Japanese version, and the US version has 100 hp. With no turbine the exhaust sound is sharper and higher than the RX-7 FD.',
    cars: ['Mazda Savanna RX-7 (SA22C)', 'Mazda RX-7 (first generation)'],
    years: '1978-1985',
  },
  'r2/cosmo-l10a': {
    name: 'Mazda Cosmo Sport 110S 10A',
    note: 'The first production twin-rotor Mazda: rotors only 60 mm wide and 491 cc per rotor. The smaller displacement gives a thinner, less full sound than the later 12A and 13B with the same chamber shape.',
    cars: ['Mazda Cosmo Sport 110S (L10A)'],
    years: '1967-1968',
  },

  r4: {
    name: 'Mazda R26B (787B)',
    note: 'The most powerful known four-rotor: 700 hp at 9000 rpm, three spark plugs per rotor, and variable intake length for high rpm.',
    cars: [],
    years: '',
  },
  'r4/mazda-767-13j': {
    name: 'Mazda 767 13J-M four-rotor',
    note: "Mazda's first four-rotor race engine, with the same 654 cc per rotor. The peak is lower than the R26B, 550 hp at 8500 rpm, so the tone is similar but lacks the R26B's top end.",
    cars: ['Mazda 767'],
    years: '1988',
  },
  'r4/mercedes-c111-ii': {
    name: 'Mercedes-Benz C111-II M 950 four-rotor',
    note: 'An experimental Mercedes prototype, not a race engine: about 602 cc per rotor and a power peak of 350 hp at 6000 rpm. With half the power and lower rpm, the sound is calmer and lower than the R26B.',
    cars: ['Mercedes-Benz C111-II'],
    years: '1970',
  },
};
