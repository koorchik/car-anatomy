# Real-car suspension data for calibrating and verifying a simulation model

**How to read these notes.** Every number carries a source and an evidence level. Cells are empty where no source was found. Nothing is filled in from memory.

| Level | Meaning |
|---|---|
| **R** | I read the document's own text (PDF text extraction or the raw data file). Safe to transcribe. |
| **X** | Read through the web-fetch tool, which passes the page through an extraction step. Numbers are probably right, but table columns can be mis-mapped. Recheck against the page when transcribing. |
| **E** | Seen only as a search-engine excerpt. I could not open the page. Treat as a lead, not a value. The search tool does not tie each excerpt to one URL, so the link is the best match among its results and may be a neighbouring page or thread. |
| **W** | Wikipedia via fetch. Use for classifying layouts, not for calibration. |
| **D** | Derived by me from a cited number (unit conversion, slope). The arithmetic is mine, not the source's. |

Research effort: this ran well past the suggested tool-call budget because the car list is long, and many cells are still empty. Several sites could not be opened at all: caranddriver.com (blocked for the search tool), edmunds.com, s2ki.com and jlwranglerforums.com (403), core.ac.uk (403), vazbook.ru and aubito.ru (DNS failure), gitlab.lrz.de (timeout), mazdausa portal (connection refused).

## Which real cars have verified numbers, and for which parameters?

### Takeaway
No car has a complete record. Across about 30 cars the public record splits into three layers: **NHTSA measurements** (mass, CG position and height, inertias, track, wheelbase), **workshop-manual alignment tables**, and **magazine track numbers**. These layers rarely cover the same car and trim, so a single row should not merge them unless the trim matches. Spring rates and anti-roll bars are almost entirely absent from primary sources.

### Cited Findings

#### Table A1: NHTSA measured inertial parameters (level R)
All rows come from Heydinger et al., SAE 1999-01-1336, "Measured Vehicle Inertial Parameters - NHTSA's Data Through November 1998": [full-text copy](https://www.lfs.net/attachment/44487), [SAE record](https://saemobilus.sae.org/content/1999-01-1336). kg and %front are level D (N ÷ 9.80665; 1 − x_cg/L).

I recomputed SSF = mean track / (2·h) for all 17 rows below. It matched the printed SSF within ±0.001, which confirms the columns were read correctly. The paper names the model but usually not the trim. "Occ." is the printed occupant count. All rows have a full tank.

| Year, car (body as printed) | Test ID | Device | Occ. | L (m) | Track F/R (m) | Weight (N) | kg (D) | %F (D) | x_cg from front axle (m) | **CG height (m)** | Pitch / Roll / Yaw (kg·m²) | SSF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1998 Honda Civic (2S) | 452 | VIMF | 1 | 2.621 | 1.471/1.468 | 11217 | 1144 | 60.4 | 1.038 | 0.513 | 1617 / 365 / 1785 | 1.431 |
| 1983 Honda Civic (3H) | T526 | 5 | 0 | 2.235 | 1.377/1.379 | 8621 | 879 | 63.0 | 0.827 | 0.519 | 1122 / 250 / 1216 | 1.328 |
| 1998 Mazda Protégé (4S) | 482 | VIMF | 1 | 2.601 | 1.453/1.461 | 11289 | 1151 | 61.4 | 1.005 | 0.522 | 1558 / 426 / 1737 | 1.395 |
| 1998 Mazda Protégé (4S, GVWR) | 481 | VIMF | 5 + 703 N | 2.601 | 1.453/1.461 | 14949 | 1524 | | 1.261 | 0.529 | 1797 / 465 / 2182 | 1.376 |
| 1986 BMW 325i (2S) | V107 | 1 | 0 | 2.570 | 1.402/1.394 | 12277 | 1252 | 53.3 | 1.201 | 0.533 | 2011 / 381 / 2027 | 1.311 |
| 1987 Mercedes 190 (4S) | V158 | 2 | 0 | 2.664 | 1.438/1.417 | 12766 | 1302 | 54.4 | 1.216 | 0.559 | 2083 / 444 / 2095 | 1.276 |
| 1987 Mercedes 190 (4S) | V159 | 2 | 0 | 2.664 | 1.438/1.417 | 12722 | | | 1.211 | 0.554 | 2099 / 449 / 2113 | 1.287 |
| 1987 Mercedes 190 E (4S) | V164 | 2 | 0 | 2.653 | 1.419/1.400 | 12766 | 1302 | 54.4 | 1.211 | 0.558 | 2123 / 443 / 2137 | 1.264 |
| 1984 Audi 4000 Quattro (4S) | V210 | 2 | 0 | 2.520 | 1.389/1.405 | 12161 | 1240 | 55.4 | 1.124 | 0.506 | 2328 / 404 / 2352 | 1.381 |
| 1988 Ford Mustang GL (2S) | V167 | 2 | 0 | 2.553 | 1.454/1.445 | 12322 | 1256 | 56.3 | 1.115 | 0.529 | 2150 / 408 / 2225 | 1.370 |
| 1988 Ford Mustang GT (2S) | V168 | 2 | 0 | 2.559 | 1.467/1.461 | 14412 | 1470 | 57.4 | 1.090 | 0.532 | 2568 / 453 / 2620 | 1.375 |
| 1987 Jeep Wrangler | V113 | 1 | 0 | 2.362 | 1.473/1.473 | 13300 | 1356 | 54.8 | 1.067 | 0.637 | 1749 / 480 / 1800 | 1.157 |
| 1988 Jeep Wrangler | V184A | 2 | 0 | 2.375 | 1.467/1.467 | 12922 | 1318 | 50.8 | 1.168 | 0.597 | 1735 / 431 / 1851 | 1.228 |
| 1988 Jeep Wrangler | V184B | 2 | 2 | 2.375 | 1.467/1.467 | 14417 | | | 1.215 | 0.632 | 1817 / 502 / 1893 | 1.160 |
| 1988 Jeep Wrangler | V184C | 2 | 4 | 2.375 | 1.467/1.467 | 15858 | | | 1.311 | 0.663 | 2050 / 541 / 2092 | 1.106 |
| 1971 Volkswagen Beetle (2S) | V199 | 2 | 0 | 2.408 | 1.313/1.328 | 8403 | 857 | 41.4 | 1.412 | 0.499 | 1196 / 235 / 1289 | 1.324 |
| 1987 Yugo GV (3H) | V135 | 1 | 0 | 2.134 | 1.321/1.270 | 8051 | 821 | 65.2 | 0.743 | 0.530 | 919 / 251 / 940 | 1.222 |
| 1988 Yugo GV (3H) | V344 | 5 | 1 | 2.159 | 1.321/1.270 | 9065 | 924 | 63.5 | 0.787 | 0.531 | 1018 / 265 / 1073 | 1.220 |
| 1976 Toyota Corolla (2C) | V201 | 2 | 0 | 2.372 | 1.372/1.349 | 10462 | 1067 | 55.6 | 1.054 | 0.514 | 1619 / 300 / 1706 | 1.322 |
| 1987 Toyota Corolla FX (3H) | V143A | 1 | 0 | 2.431 | 1.425/1.405 | 9768 | 996 | 61.2 | 0.944 | 0.543 | 1485 / 324 / 1594 | 1.303 |
| 1991 Volvo 240 (4S) | T323 | 5 | 1 | 2.647 | 1.435/1.356 | 14403 | 1469 | 50.8 | 1.303 | 0.567 | 2560 / 476 / 2663 | 1.231 |
| 1980 BMW 320i (2S), tilt table only | n/a | TT | 1 | 2.591 | 1.384/1.384 | 11766 | 1200 | 54.7 | 1.175 | | | |

The tilt-table ratio for the 1980 320i is 1.156. The database has no inertia or CG height for this car.

#### Table A2: Layout, mass and dimensions outside NHTSA
Blank means not found. Units are as published.

| Car, exact variant | Front / rear suspension | Mass | Weight split F/R | Wheelbase | Track F/R | CG height | Tyres | Source, level |
|---|---|---|---|---|---|---|---|---|
| 2012 VW GTI (US, 2.0T, 6-speed manual) | struts / multilink, coil, ARB both ends | 3052 lb curb | 61.5/38.5 | 101.5 in | 60.4/59.7 in | 22.0 in | Pirelli P Zero Nero All Season 225/40R-18 92H M+S | [C/D test sheet](https://s3.amazonaws.com/amv-prod-cad-assets/files/2013-ford-focus-st-vs-2012-volkswagen-gti-comparison-test-car-and-driver2013-ford-focus-st-vs-2012-volkswagen-gti.pdf), R |
| 2013 Ford Focus ST (US) | struts / multilink, coil, ARB both ends | 3219 lb curb | 59.8/40.2 | 104.3 in | 61.2/60.4 in | 22.5 in | Goodyear Eagle F1 Asymmetric 2 235/40R-18 95Y XL | same sheet, R |
| 2016 Mazda MX-5 Club (US, preproduction test car, $32,950 as tested) | double wishbone / multi-link ([pre-launch report](https://www.cars.co.za/motoring-news/2016-mazda-mx-5-details-revealed/66328/), E) | 2309 lb | | 90.9 in | | | 17-inch | [C/D test, third-party reprint](https://integrityexports.com/wp-content/uploads/2015/06/2016-mazda-mx-5-miata-club-test-review), X |
| 2016 Mazda MX-5 Sport (US) | | | | | | | 195/50R16 | [Mazda USA spec sheet](https://portal.mazdausa.com/m176/MusaWeb/musa2/pdf/specs/2016_MX-5_Features_Specs.pdf), E (the PDF refused connection) |
| VW Golf VI 1.2 TSI (build 09/2008-08/2012, test 12/2009) | / independent, with transverse and trailing links | 1271 kg ([article text](https://www.auto-motor-und-sport.de/test/vw-golf-1-2-tsi-im-einzeltest/)) | | 2575 mm | 1541/1514 mm | | Michelin Energy Saver 205/55 R 16 V | [AMS data](https://www.auto-motor-und-sport.de/test/vw-golf-1-2-tsi-im-einzeltest/technische-daten/), X |
| VW Golf VIII facelift 1.5 TSI Life, 85 kW (ADAC, per search excerpt 12/2024) | | | | | | | optional all-season tyres on the test car | [ADAC Autotest](https://assets.adac.de/image/upload/Autodatenbank/Autotest/at6463-vw-golf-15-tsi-life/vw-golf-15-tsi-life.pdf), R |
| Porsche 911 Carrera (992), coupe, RWD, 8-speed DCT (build 08/2019-05/2024) | MacPherson struts, wishbones / coil springs, wishbones and trailing arms, ARB both ends | | | 2450 mm | 1591/1557 mm | | | [AMS data](https://www.auto-motor-und-sport.de/test/porsche-911-carrera-992-im-test/technische-daten/), X |
| 1999 Porsche 911 Carrera (one specific private car) | | static corners LF 700, RF 645, LR 1173, RR 1093 lb (3611 lb total, D) | 37.2/62.8 (D) | | | | | [Paradkar 2019 thesis](https://ninercommons.charlotte.edu/record/1710/files/Paradkar_uncc_0694N_12198.pdf), R |
| 2011 Ford Mustang GT coupe | MacPherson / live axle, three-link, Panhard rod ([W, stated for 2005-09](https://en.wikipedia.org/wiki/Ford_Mustang_(fifth_generation))) | Ford claim 3605 lb; Edmunds scales 3620 lb | | | | | | [Edmunds](https://www.edmunds.com/car-news/tested-ford-mustang-performance-numbers.html), E |
| Tesla Model S 2021+ | | | | 2960 mm | 1690/1700 mm at wheel-centre height | | | [Tesla service manual](https://service.tesla.com/docs/ModelS/ServiceManual/Palladium/en-us/GUID-6537652C-5A32-4F97-95B9-A624A267EA2C.html), X |
| BMW 3 Series E30, 1982-94 | MacPherson / semi-trailing arm | 1080-1200 kg range | | 2570 mm | | | | [W](https://en.wikipedia.org/wiki/BMW_3_Series_(E30)) |
| Mercedes W201, 1983-93 | / 5-link | | | | | | | [W](https://en.wikipedia.org/wiki/Mercedes-Benz_W201) |
| Porsche 944 | / semi-trailing arms (new cast-alloy arms from 1985) | pre-1988 1180 kg, 1988 on 1330 kg, 944 S 1296 kg, 1986 Turbo 1360 kg ("some figures are dry weight") | 50.7/49.3 | 2400 mm | | | | [W](https://en.wikipedia.org/wiki/Porsche_944) |
| Jeep Wrangler YJ, 1987-95 | leaf springs, track bars, ARBs; Dana 30 front, Dana 35 rear (Dana 44 optional some years) | | | | | | | [W](https://en.wikipedia.org/wiki/Jeep_Wrangler_(YJ)) |
| UAZ-469, standard wheelbase | live axle, coil / live axle, leaf | 1700 kg infobox vs 1650 kg with fuel in the specs section (the article does not reconcile them) | | 2380 mm | 1453/1453 mm | | 215 SR 15 | [W](https://en.wikipedia.org/wiki/UAZ-469) |
| Lada Riva 2105/2107 (2107: 1982-2012) | "coil spring suspension all round" | | | 2424 mm | | | | [W](https://en.wikipedia.org/wiki/Lada_Riva) |
| VAZ-2107, 1.5 L, 72 hp | independent coil / dependent coil | | | | | | | [Auto.ru](https://auto.ru/catalog/cars/vaz/2107/2307270/2307271/specifications/), E |
| Daewoo/ZAZ Lanos | "built upon that of a Daewoo Nexia" | 990-1177 kg range | | 2520 mm | | | | [W](https://en.wikipedia.org/wiki/Daewoo_Lanos) |
| VW Golf Mk3 (1H) FWD; syncro variants | spring strut / torsion beam; syncro semi-trailing arm | | | | | | | [Workshop manual](https://workshop-manuals.com/volkswagen/golf-mk3/running_gear/wheels_tyres._axle_align/wheel_alignment/specifications_for_wheel_alignment_vehicles_with_front_and_four-wheel_drive/), X |
| Skoda Octavia Mk1 (1U) FWD | spring strut / twist beam | | | | | | | [Workshop manual](https://workshop-manuals.com/skoda/octavia-mk1/chassis/technical_data/technical_data/chassis_specified_values/), X |
| Dacia Logan, 1st gen, sedan (L90, 2004) | | 1090-1360 kg across the range | | 2630 mm | | | | [W](https://en.wikipedia.org/wiki/Dacia_Logan) |
| Alfa Romeo 75 2.0 / 3.0 V6 | "wheel struts with transverse wishbones, torsion" / De Dion, Watt linkage, ARB | | | 2510 mm | 2.0: 1368/1358 mm; 3.0 V6: 1396/1382 mm | | | [cars-data](https://cars-data.com/en/alfa-romeo/75/1985/3-0-v6--3407/specs), E; aggregator |
| Smart Fortwo 451 | / De Dion, coil, ARB | 730 kg (2007-era CDI road test) | | | | | | [Auto123](https://www.auto123.com/en/news/smart-fortwo-coupe-cdi-road-test/47737/?page=3), [cars-data](https://cars-data.com/en/smart/fortwo/2007-hatchback/coupe-pulse-33kw-cdi-44739--44739/specs), E |
| Citroën 2CV, 1971-91 | independent, front-to-rear interconnected springs, per [Citroën Argentina table](https://www.citroenet.org.uk/foreign/latin-america/argentina/argentina8.html), E | 560 kg (1970 2CV 4 / 2CV 6) ([Citroënët](https://citroenet.org.uk/passenger-cars/michelin/2cv/technical.html), X) | | 2400 mm ([AMS](https://www.auto-motor-und-sport.de/oldtimer/kaufberatung-citroen-2-cv-enten-rosten-alle-fast-ueberall/technische-daten/), X) | | | | |
| Citroën DS, saloon | hydropneumatic; double wishbones front, trailing arms rear | 1270 kg (not broken down by year) | | 3124 mm | front and rear differ, values not stated | | | [W](https://en.wikipedia.org/wiki/Citro%C3%ABn_DS) |
| Mercedes S-Class W222 | Magic Body Control on many models (not on 4Matic as of 2017); Airmatic on S 63 4Matic | 1910-2275 kg range | | SWB 3035 / LWB 3165 mm | | | | [W](https://en.wikipedia.org/wiki/Mercedes-Benz_S-Class_(W222)) |

#### Table B: Factory alignment specs

| Car, exact variant | Front camber | Caster | Front toe | Rear camber | Rear toe | Adjustable | Reference condition | Source, level |
|---|---|---|---|---|---|---|---|---|
| Skoda Octavia Mk2 (1Z), standard 2UA | −30′ ±30′ | 7°34′ ±30′ | total 10′ ±10′ | | | toe; 20° toe difference and max lock not adjustable | stationary height 391 ±10 mm | [Manual](https://workshop-manuals.com/skoda/octavia-mk2/axles_steering/wheels_tyres._axle_align/chassis_specified_values_of_steering_geometry/front_axle_specified_values_of_steering_geometry/), X |
| Octavia Mk2, sport RS 2UC | −41′ ±30′ | 7°47′ ±30′ | total 10′ ±10′ | | | | 376 ±10 mm | same |
| Octavia Mk2, rough road 2UB | −8′ ±30′ | 7°14′ ±30′ | total 10′ ±10′ | | | | 416 ±10 mm | same |
| Octavia Mk1 (1U) FWD, standard | −30′ ±30′ | 7°40′ ±30′ to MY2000; +30′/−60′ from MY2001 | 0° ±10′ | −1°36′ ±20′ to 11/96; −1°27′ ±20′ from 12/96 | 20′ ±10′ | front camber via subframe shift; front toe; caster no; rear camber no; rear toe to mean value via brackets | | [Manual](https://workshop-manuals.com/skoda/octavia-mk1/chassis/technical_data/technical_data/chassis_specified_values/), X |
| Octavia Mk1 FWD, sport | −33′ ±30′ | 7°50′ (same tolerances) | 0° ±10′ | −1°27′ ±20′ | 30′ ±10′ | same | | same |
| Octavia Mk1 FWD, rough road | −16′ ±30′ | 7°15′ (same tolerances) | 0° ±10′ | −1°27′ ±20′ (from 12/96) | 15′ ±10′ | same | | same |
| VW Golf Mk3 (1H), basic | −30′ ±20′ | +1°45′ ±30′ | total 0° ±10′ | torsion beam −1°30′ ±10′ | total +20′ ±10′ | front camber at bearing housing/strut joint; caster no | column order inferred | [Manual](https://workshop-manuals.com/volkswagen/golf-mk3/running_gear/wheels_tyres._axle_align/wheel_alignment/specifications_for_wheel_alignment_vehicles_with_front_and_four-wheel_drive/), X |
| Golf Mk3, plus (lowered ~20 mm) | −40′ ±20′ | +3°25′ ±30′ | as above | as above | as above | | | same |
| Golf Mk3, basic (lowered ~10 mm) | −36′ ±20′ | +1°50′ ±30′ | as above | as above | as above | | | same |
| Golf Mk3, heavy-duty 1BB | −20′ ±20′ | +1°40′ ±30′ | as above | as above | as above | | | same |
| Golf Mk3 syncro, semi-trailing arm | | | | −1°30′ ±30′ | +17′ ±20′ | | | same |
| Daewoo Lanos S sedan 1.6 DOHC, 2001 (US) | −1°10′ to +20′ (sign unclear in source) | manual steering 30′ to 2°30′; power steering 1°45′ to 3°45′ | per wheel −10′ to +10′ | −2°10′ to −1°10′ | per wheel −10′ to +40′ | [front toe only](https://workshop-manuals.com/daewoo/lanos_s_sedan/l4-1.6l_dohc_d-tec_mfi/maintenance/alignment/system_information/service_and_repair/alignment_procedures/) (E); front camber, caster and rear toe no | 2-person load; rocker-to-ground 195 mm front, 191 mm rear | [Manual](https://workshop-manuals.com/daewoo/lanos_s_sedan/l4-1.6l_dohc_d-tec_mfi/maintenance/alignment/system_information/specifications/), X |
| Mazda MX-5 NC 2008, 16-inch | ride-height table: −0°41′ at 354-365 mm up to +0°21′ at 396-405 mm, all ±1° | ride-height table: 6°27′ at rear 354-363 mm down to 5°31′ at 394-403 mm, all ±1° | total 2 ±4 mm (0°11′ ±21′) | not on this page | not on this page | camber before caster; ±1° L/R | unloaded: full tank, jack and tools in place | [Manual mirror](https://2008-mx-5-wiring-diagram-and-workshop-manual.pages.dev/src/g5w02/html/id021100800200), X |
| Mazda MX-5 NC 2008, 17-inch | −0°51′ at 351-360 mm up to +0°15′ at 391-400 mm, ±1° | 6°34′ at 349-358 mm down to 5°39′ at 389-398 mm, ±1° | same | | | | | same |
| Honda S2000, all years, US spec | −0°30′ ±10′ | 6° ±15′ | total 0 ±2 mm | −1°30′ ±10′ | see below | front and rear camber, caster, toe via eccentric bolts | | [Robinette PDF quoting Honda spec](https://robrobinette.com/images/S2000/Honda_S2000_Alignment_by_Rob_Robinette.pdf), R (secondary) |
| S2000 rear toe by version | | | | | AP1 2000-03: total 6 ±2 mm. AP2 2004+ non-CR: 3.7 ±2 mm. CR: 0.22 in ±0.08 in total | | | same |
| S2000 AP1, UK spec | −1° | 6°45′ | total 0° | −2° | total 0°40′ | | "AP1 only" | same |
| Honda Civic Si '02-03 | −0°30′ ±45′ | 1°40′ ±1° | | | | front camber, front toe, rear toe; caster no | | [Manual](https://workshop-manuals.com/honda/civic_si/l4-2.0l/maintenance/alignment/system_information/specifications/page_1099/), X |
| Honda Civic Si '04-05 | −0°10′ ±45′ | 1°35′ ±1° | | | | same | | same |
| Honda Civic Si 2008 | | | 0 ±2 mm | | 2 (+2/−1) mm | | | [Manual](https://manuals.autorepairshq.com/Honda/2008/Civic%20Si%20L4-2.0L/Repair%20and%20Diagnosis/Maintenance/Alignment/Specifications), E |
| Tesla Model S 2021+, non-Track Package | −0.75° ±0.45° | 4.90° ±0.50° | limits in 0.10° / out 0.20° | −1.75° ±1.00° | limits in 0.05° / in 0.35° | not stated on this page | unladen chassis height 134.2 mm F, 133.5 mm R | [Tesla manual](https://service.tesla.com/docs/ModelS/ServiceManual/Palladium/en-us/GUID-6537652C-5A32-4F97-95B9-A624A267EA2C.html), X |
| Tesla Model S 2021+, Track Package | −1.0° (min −0.8°, max −1.5°) | 5.00° ±0.30° | in 0.05° / out 0.15° | | in 0.15° / in 0.25° | | revised 2023-09-26 | same |
| Renault Logan, generation not stated | 0°10′ ±30′ | 2°42′ ±30′ | 0°10′ ±10′ | | | [camber, castor, pivot not adjustable; toe by track rod sleeves](https://www.scribd.com/doc/287080102/Service-Logan) (E, garbled) | | [aubito.ru](https://aubito.ru/en/renault-logan/wheel-alignment-angles-for-renault-logan), E, could not open |
| VAZ-2103/-2106/-2107 | | 3°40′…4°20′ (E, from a search excerpt whose source page I could not identify among the results) | | | | [caster set by suspension geometry, adjusted at lower arm mounts, most labour-intensive](https://www.zr.ru/archive/zr/2010/10/temnyi-ugol) (X) | | none usable |

#### Table C: Independent performance data

| Car, exact variant | Tyres | Skidpad | Braking | Accel | Lane change / slalom | Source, level |
|---|---|---|---|---|---|---|
| 2012 VW GTI 2.0T manual | Pirelli all-season 225/40R-18 | 0.86 g, 300 ft dia | 70-0: 187 ft | 0-60: 6.4 s | 610-ft slalom 42.7 mph (flagged † on the sheet) | [C/D](https://s3.amazonaws.com/amv-prod-cad-assets/files/2013-ford-focus-st-vs-2012-volkswagen-gti-comparison-test-car-and-driver2013-ford-focus-st-vs-2012-volkswagen-gti.pdf), R |
| 2013 Ford Focus ST | Goodyear F1 Asym 2 235/40R-18 | 0.93 g, 300 ft | 70-0: 164 ft | 0-60: 6.3 s | 610-ft slalom 45.2 mph | same |
| 2016 Mazda MX-5 Club, preproduction | 17-inch, make not stated | 0.90 g, 300 ft | 70-0: 158 ft | 0-60: 5.9 s | | [C/D reprint](https://integrityexports.com/wp-content/uploads/2015/06/2016-mazda-mx-5-miata-club-test-review), X |
| 2011 Ford Mustang GT, Motor Trend | | 0.94 g avg | 60-0: 105 ft | | figure eight 25.3 s @ 0.75 g avg | [reprint](https://carmodifiedwithnitrousoxidesystem.blogspot.com/2010/03/motortrend-gets-even-better-numbers-128.html), [MT video transcript](https://www.dailymotion.com/video/x8ph25u), E |
| 2011 Ford Mustang GT, Edmunds | | 0.92 g (attribution between cars not fully clear) | 60-0: 109 ft | | | [Edmunds](https://www.edmunds.com/car-reviews/track-tests/track-tested-2012-ford-mustang-boss-302-vs-2011-ford-mustang-gt.html), E |
| VW Golf VIII 1.5 TSI Life | optional all-season | | 100-0: 36.7 m, mean of ten; ADAC says about 35 m or less with suitable tyres | | ADAC evasion test at 90 km/h: verbal rating only | [ADAC](https://assets.adac.de/image/upload/Autodatenbank/Autotest/at6463-vw-golf-15-tsi-life/vw-golf-15-tsi-life.pdf), R |
| VW Golf VI 1.2 TSI (12/2009) | Michelin Energy Saver 205/55 R16 | | 100-0: 39.4 m (E) | | slalom about 63/62 km/h and VDA lane change 70/69 km/h (E). Fetched AMS pages showed empty measurement fields | [AMS](https://www.auto-motor-und-sport.de/test/vw-golf-1-2-tsi-im-einzeltest/technische-daten/), E |
| 2021 Tesla Model S Plaid | | 1.08 g; previous Performance 0.92 g | | | | [C/D via Yahoo](https://sports.yahoo.com/tested-2021-tesla-model-plaid-140000565.html), E |
| 1960-63 Corvair, standard suspension | | moderate understeer to moderate oversteer at 0.4-0.5 g; approximate limit of control 0.6 g | | | | [NHTSA DOT HS-820 198, 1972](https://rosap.ntl.bts.gov/view/dot/92396/dot_92396_DS1.pdf), R |
| 1967 Corvair | | limit of control about 0.7 g | | | | same |

The Corvair report's comparison fleet was a [1962 Falcon, 1960 Valiant, 1962 VW Beetle and 1963 Renault](https://ateupwithmotor.com/model-histories/compact-economy-cars/reconsidering-the-1972-nhtsa-report-on-the-corvair/).

Moose test figures (all secondary, Teknikens Värld originals not reached):
- Xantia Activa V6: 85 km/h, 1999 — [Citroën museum](https://www.citromuseum.com/en/2025/02/06/xantia-activa-v6-1997/), which also gives McLaren 675LT 83 km/h.
- Slowest pass, Reliant Rialto: 42.5 km/h. First-generation Mercedes A-Class overturned at 60 km/h in 1997. IM Motors IM5: 90.96 km/h, 2025, "ISO 3888-2 NV" — [Wikipedia](https://en.wikipedia.org/wiki/Moose_test).
- A Wikipedia variant claims a [Porsche Cayman GT4 RS Manthey broke the Xantia record](https://en.wikipedia.org/wiki/Citro%C3%ABn_Xantia) (E, unconfirmed). The record is therefore contested.
- RAV4 68 km/h, Qashqai 84, Kia Sorento 78; Peugeot 508 78; C-Class wagon 74 — [secondary reports](https://www.carscoops.com/?p=2041796) (E; the excerpts name no trim).
- Passat GTE wagon 68, Golf Mk8 TSI 65, W205 C200 wagon 68 — [Carscoops 2020](https://www.carscoops.com/2020/06/skoda-superb-iv-and-vw-passat-gte-both-failed-the-moose-test/) (E).
- Model 3 Standard Range passed at 72 km/h — [inkl](https://www.inkl.com/news/watch-tesla-model-3-standard-range-perform-flawless-moose-test) (E).

#### Table D: Springs, anti-roll bars, motion ratios, ride frequency
This table is nearly empty, and that emptiness is itself a finding.

| Car | Data | Status | Source |
|---|---|---|---|
| S2000 2000-01 | springs 218/291 lb/in (3.9/5.2 kg/mm), described by the poster as "published" | forum, E | [S2KI](https://www.s2ki.com/s2000/topic/880680-spring-rates/page__view__findpost__p__20762222) |
| S2000 2002-03 | 4.3/4.1 kgf/mm; a conflicting value appears elsewhere in the thread family | forum, E, disputed | [S2KI](https://s2ki.com/forums/s2000-under-hood-22/02-03-spring-rates-107101/page2) |
| S2000 2008 | 284/299 lb/in (5.07/5.33 kg/mm) | forum, E | [S2KI characterization thread](https://www.s2ki.com/forums/s2000-brakes-suspension-249/characterization-oe-suspension-springs-818884-printthread/) |
| S2000 motion ratios | spring F 0.70 ±0.01, R 0.67 ±0.01; ARB F 0.492, R 0.343 | community-measured, E | [S2KI spring MR thread](https://www.s2ki.com/forums/s2000-racing-competition-11/suspension-motion-ratios-s-380006/), [S2KI ARB MR thread](https://www.s2ki.com/forums/s2000-brakes-suspension-249/actual-s2000-suspension-motion-ratios-1160445-printthread/) |
| S2000 lowered 1 in, AP1 rear | roll centre about 6 in by owner's construction; stock 2001 rear bar about 75 lb/in wheel-rate equivalent | enthusiast, X | [Robinette](https://robrobinette.com/S2000RollCenters.htm) |
| MX-5 ND | factory front bar about 16 N/mm | aftermarket vendor claim, E | [Eibach sheet via retailer](https://rudysdiesel.com/products/eibach-anti-roll-kit-front-and-rear-sway-bar-kit-27mm-16mm-for-2016-2026-mazda-mx-5-miata-nd-and-2016-2020-fiat-124-spider) |
| 944 Turbo S, M030 option | 26.8 mm hollow front bars | W | [Wikipedia](https://en.wikipedia.org/wiki/Porsche_944) |
| ZAZ-1102 | **no factory anti-roll bar**. A bar from another car, tested on a physical rig, gave 0.9 kgf/mm at 0-30 mm travel, then 1.2 kgf/mm after shortening its active part by 100 mm | academic, R, not a production part | [Kubich & Koshelev, Zaporizhzhia Polytechnic](https://eir.zp.edu.ua/bitstreams/fe3baf4d-f834-4ea3-930c-c59a35d85260/download) |

All S2KI rows come from search excerpts, and the pages returned 403, so the thread-to-number mapping above is a best match and must be rechecked.

Do not use aftermarket spring values as OEM. Examples are ND [Swift 4.8/2.4 kg/mm](https://www.springrates.com/products/swift-spec-r-springs-2016-mazda-miata-mx-5-nd), [RS-R 2.86/1.53 kg/mm](https://stillen.com/collections/rs-r/products/rs-r-2016-nd-mazda-mx-5-down-suspension-m032d) and NC [Flyin' Miata 300/196 lb/in](https://flyinmiata.com/products/nc-flyin-miata-springs).

**Corrections to the brief's classification:**
- The ND's rear is [multi-link, not double wishbone](https://www.cars.co.za/motoring-news/2016-mazda-mx-5-details-revealed/66328/) (E, pre-launch).
- The Mk6 GTI is [multilink rear](https://s3.amazonaws.com/amv-prod-cad-assets/files/2013-ford-focus-st-vs-2012-volkswagen-gti-comparison-test-car-and-driver2013-ford-focus-st-vs-2012-volkswagen-gti.pdf), and the [Mk6 1.2 TSI is independent too](https://www.auto-motor-und-sport.de/test/vw-golf-1-2-tsi-im-einzeltest/technische-daten/). "Golf base = twist beam" holds for the [Mk3](https://workshop-manuals.com/volkswagen/golf-mk3/running_gear/wheels_tyres._axle_align/wheel_alignment/specifications_for_wheel_alignment_vehicles_with_front_and_four-wheel_drive/) but is not a generation-free fact.
- ["Swing axle" in Wikipedia's Beetle article is generic and is not tied to a year](https://en.wikipedia.org/wiki/Volkswagen_Beetle). The same article says the 1968 1200 received "fully independent suspension". So the 1971 NHTSA Beetle is **not** a confirmed swing-axle reference.

### Inferences
- Roughly 30 cars have usable numbers, but only about 22 NHTSA rows and 7 alignment families are strong enough for a test limit. They overlap on no exact trim.
- Most directly useful NHTSA values for a model: CG height (0.50-0.57 m for these sedans, coupes and hatchbacks, 0.60-0.66 m for the Wrangler), roll inertia and %front.
- Coverage is thin for several requested types. For multilink, the strongest rows are the W201 (NHTSA) and 996/992 (partial). For De Dion, hydropneumatic and air, only layout and mass are sourced, not dynamics.

### Gaps
- **No primary-source spring rate or ARB diameter was found for any car.**
- No usable record was found for these requested cars or items: Corolla modern, Clio, Polo, Yaris, Mazda3 BP, Civic EG/EK alignment, BMW F30, Audi A4, C-Class, 2CV dynamics, C5, Renault Logan verified specs, ZAZ-968/Tavria mass and dimensions, VAZ camber and toe.
- MX-5 ND alignment: an [ND owner found no official Mazda spec](https://forum.mx5oc.co.uk/t/nd-alignment-spec/121103), and forum caster figures disagree (about 6° vs 8°). I did not treat these as values.
- E30 alignment: only [third-party Beissbarth targets via a forum](https://bimmersport.co.nz/topic/9937-wheel-alignment) (rear camber −2°00′ ±0°30′, caster +8°30′ ±0°30′). Not BMW-sourced.
- Suspension type for the 1988 Mustang, 1976 Corolla, Yugo and Audi 4000 was not sourced. Civic rear layouts were not sourced either. A classification from memory would break the rule above, so those cells stay empty.
- Octavia Mk1 4WD: the extraction labelled the rear "twist-beam". That looks wrong to me, so I left it out rather than repeat it.

## Are there published hardpoints, roll centre heights or motion ratios for real cars?

### Takeaway
I found no public hardpoint table for any named production car, despite targeted searches. Roll centres and motion ratios appear only as enthusiast measurements (S2000). The model should treat hardpoints as a modelling assumption, not as verified data.

### Cited Findings
- Searches for Logan and Golf MacPherson hardpoints returned only generic method papers: [SAE 2016-28-0184](https://saemobilus.sae.org/content/2016-28-0184) lists hardpoints as inputs, [IAENG WCE2009](https://www.iaeng.org/publication/WCE2009/WCE2009_pp1532-1537.pdf) gives a kinematic model. Neither excerpt showed real-car coordinates (E).
- Closest leads, none confirmed to contain a usable table: [Yanshan University double-wishbone paper](https://www.scribd.com/document/443562328/analysis-in-adams), with a garbled table and unidentified vehicle; [Politecnico di Torino LCV thesis](https://webthesis.biblio.polito.it/27121/1/tesi.pdf) and [a second Torino thesis on a real front double wishbone](https://webthesis.biblio.polito.it/19561/1/tesi.pdf) (E, not opened).
- Published FSAE and worked-example numbers are not production data: [FSAE note with RC 0.04/0.06 m](https://www.tots.upol.cz/pdfs/tot/2010/04/06.pdf). The general design range of [0-120 mm front and 80-150 mm rear](https://scitepress.org/publishedPapers/2019/88689/pdf/index.html) for independent suspension is a textbook range, not a measurement (E).
- CommonRoad's BMW 320i file sets [roll axis height h_raf = h_rar = 0](https://pypi.org/project/commonroad-vehicle-models/) (R, in wheel 3.0.2), so it provides no roll centre data.
- S2000 community motion ratios and the owner-built roll centre figure are in Table D.
- Commercial sources exist but are closed: [Michelin SIMIX](https://chassis-simulation-datasets.michelin.com/) sells KnC, CoG and inertia characterisation behind a login or quote, with a free sample dataset offered (X). Its pages do not name the vehicles.

### Inferences
- A roll-centre test against "real" values is not currently possible. The closest honest check is a plausibility range plus S2000-level enthusiast numbers marked unverified.

### Gaps
- A2Mac1 and Modelon's Vehicle Dynamics Library were not examined. I have no findings on their content, price or terms.
- Leads to try (not verified): Mazda Technical Review, Honda R&D Technical Review, VW Self-Study Programmes.
- I did not open the two Torino theses in full, and they may contain real coordinates, though at least one is a light commercial vehicle.

## Are public K&C data sets or camber/toe vs travel curves available?

### Takeaway
One usable public real-car data point exists: a thesis on a 1999 Porsche 911 Carrera, with values read from a professional K&C test. Everything else is paywalled, withheld or closed.

### Cited Findings
- **Paradkar, UNC Charlotte MS thesis, 2019.** The car is a 1999 Porsche 911 Carrera, measured by Morse Measurements, with "bounce test, roll test on fixed axis and natural axis, steering test, cornering test and braking test". K&C trends matched static measurements — [thesis](https://ninercommons.charlotte.edu/record/1710/files/Paradkar_uncc_0694N_12198.pdf), R. It is the professor's personal car, so its condition is unknown. The K&C data file itself also held 2017 Mercedes and 2018 Miata runs, but no numeric tables for those appear in the extracted text.
- Thesis Tables 5.2-5.9 give load, wheel-to-body displacement, toe and camber (toe sign as used by the thesis):

| Corner | Load (lb) | Disp. (in) | Toe (°) | Camber (°) | | Load (lb) | Disp. (in) | Toe (°) | Camber (°) |
|---|---|---|---|---|---|---|---|---|---|
| LF | 700 | 0.3743 | −0.0891 | −0.11 | | 1028 | 2.02 | −0.6305 | −0.7885 |
| RF | 645 | 0.3019 | 0.0139 | −0.2965 | | 987 | 2.0183 | −0.6 | −1.0186 |
| LR | 1173 | 0.618 | 0.45 | −1.7584 | | 1449 | 1.6455 | 0.6777 | −2.781 |
| RR | 1093 | 0.3754 | 0.2113 | −1.587 | | 1313 | 1.2421 | 0.3625 | −2.399 |

- Level D slopes from those endpoints:

| Corner | Camber (°/mm) | Toe (°/mm) | Wheel rate lb/in (N/mm) | Indicative ride frequency |
|---|---|---|---|---|
| LF | −0.0162 | −0.0130 | 199 (35) | 1.67 Hz |
| RF | −0.0166 | −0.0141 | 199 (35) | |
| LR | −0.0392 | +0.0087 | 269 (47) | 1.50 Hz |
| RR | −0.0369 | +0.0069 | 254 (45) | |

  Ride frequency here is f = (1/2π)√(k/m), using the corner mass without separating unsprung mass or tyre compliance. Treat it as indicative only.
- The thesis also notes that [Mazda Miata and Mini Cooper specify camber as a function of ride height](https://ninercommons.charlotte.edu/record/1710/files/Paradkar_uncc_0694N_12198.pdf) (R), which the [NC manual](https://2008-mx-5-wiring-diagram-and-workshop-manual.pages.dev/src/g5w02/html/id021100800200) (X) confirms.
- [SAE 2015-01-1497](https://saemobilus.sae.org/papers/elastokinematic-characteristics-torsion-beam-suspensions-2015-01-1497) reports K&C on two test torsion-beam suspensions that differ only in trailing-arm rigidity, with larger toe and camber change on the softer arm. Paywalled, and the suspensions are test units (E).
- [Braking compliance paper, listed as "steering drift and wheel movement during braking"](https://typeset.io/pdf/steering-drift-and-wheel-movement-during-braking-static-and-50lzl3cqfb.pdf): K&C rig plus an instrumented car, with good static/dynamic agreement. The [core.ac.uk copy](https://core.ac.uk/download/6143.pdf) returned 403. Not read (E).
- [*Mechanika* 2023 paper](https://mechanika.ktu.lt/index.php/Mech/article/view/31983/15889) validates against K&C but withholds the values for confidentiality (E).
- [SAE 1999-01-1323 side-pull test](https://saemobilus.sae.org/content/1999-01-1323) measures camber and steer vs roll. The [related Ohio State thesis record](https://openaccess.library.uitm.edu.my/Record/ndltd-OhioLink-oai-etd.ohiolink.edu-osu1392212782/Details) may have open numbers (E, not opened).
- [MTS K&C brochure](https://www.mts.com/-/media/ground_vehicles/pdfs/brochures/050-000-706-KCdeflection.pdf?as=1) describes outputs but gives no sample data (E).

### Inferences
- The rear camber gain of about −0.04°/mm and the front gain of about −0.016°/mm give one real-world anchor, for this 1999 911 only. As a single car of unknown condition, it can only support a soft test.
- These gains are level D slopes over level R table values. In `verifyNote` terms this means "derived from a thesis, unverified against the factory".

### Gaps
- Figures in the thesis (K&C graphs for roll, bounce and bump steer) are images and were not read. They may contain more data, including roll stiffness.
- I found no open K&C archive for any car.

## How reliable are public databases of vehicle parameters?

### Takeaway
NHTSA is the only strong public database. CommonRoad is a usable cross-check at most. CarSim's own documentation says its examples are not real cars, MATLAB defaults are generic, and Euro NCAP is not a vehicle-dynamics source.

### Cited Findings
- **NHTSA Light Vehicle Inertial Parameter Database.** 496 entries through 1998. Quoted CG error bounds: [VIMF ±0.5% of value; IPMD v5 ±6 mm; v3-4 ±19 mm; v2 ±25 mm; v1 worse than ±25 mm. Inertia about 3% on v5; VIMF 1% pitch and yaw, 2% roll](https://www.lfs.net/attachment/44487) (R).
- Extensions: [SAE 2010-01-0086](https://saemobilus.sae.org/content/2010-01-0086) lists [CG locations with no inertia data for NCAP vehicles](https://search.library.wisc.edu/catalog/9912688899602121), and [SAE 2021-01-0970](https://saemobilus.sae.org/content/2021-01-0970/) adds 448 NCAP vehicles for 2009-2020 to a prior 1024 (E, paywalled). The newer lists are the likely source for modern Golf or Civic CG heights.
- Pairs of same-model cars in the 1999 paper give a practical noise estimate. The two 1987 Mercedes 190 rows (separate test cars, same device) differ by 5 mm in CG height (0.559 vs 0.554 m) and by 16 / 5 / 18 kg·m² in pitch / roll / yaw. The 1987 and 1988 Wranglers (no occupants, different model years and test devices) differ by 40 mm (0.637 vs 0.597 m) — [source](https://www.lfs.net/attachment/44487) (R).
- Occupants matter: the 1988 Wrangler CG rises 0.597 → 0.632 → 0.663 m for 0, 2, 4 occupants on one vehicle — [source](https://www.lfs.net/attachment/44487) (R).
- **CommonRoad** ([package 3.0.2](https://pypi.org/project/commonroad-vehicle-models/), R, YAML files read directly). Vehicle files say "based on the DOT vehicle dynamics; values taken from a Ford Escort / BMW 320i / VW Vanagon". No year or trim is given.
  - BMW 320i values: m 1093 kg, a 1.1562 m, b 1.4227 m, h_cg 0.5749 m, h_s 0.6137 m, sprung inertias roll 207 / pitch 1566 / yaw 1792 kg·m², K_sf 24453 N/m, K_sr 19636 N/m, track 1.387/1.364 m.
  - Vanagon: a+b 2.472 m vs NHTSA's 2.464 m. 320i: a+b 2.579 m and rear track 1.364 m vs NHTSA's 1980 row at 2.591 m and 1.384 m — similar but not the same record.
  - Mixed provenance is visible inside the files: wheel inertia "from internet forum for 235/65 R 17", radius "taken from ADAMS documentation", and tyre parameters "from ADAMS handbook".
- **CarSim:** ["none of the examples provided with CarSim represent specific existing vehicles"](https://carsim.com/products/carsim/data.php) (E, vendor statement).
- **MATLAB/Simulink:** a [Simulation 3D Physics Vehicle block default mass of 1500 kg](https://kr.mathworks.com/help/vdynblks/ref/simulation3dphysicsvehicle.html) and an [old demo with a 1200 kg body](https://globec.whoi.edu/data/matlabr14sp2/toolbox/simulink/simdemos/automotive/sldemo_suspdat.m) are generic values (E). I could not confirm the Reference Application defaults without MATLAB.
- **Euro NCAP:** protocols [define unladen kerb mass and reference load](https://cdn.euroncap.com/media/1474/euro-ncap-side-protocol-version-52.pdf), and a [data bulletin asks for ESC type-approval certificates](https://cdn.euroncap.com/media/32296/tb-018-manufacturer-data-v11.pdf) (E). I found no published handling figures.

### Inferences
- NHTSA rows with VIMF or IPMD v5 are safe as hard references. Rows on v1-v2 should carry the ±25 mm bound in any test.
- Use NHTSA, not CommonRoad, whenever both exist. CommonRoad's roll stiffness terms might be useful as sanity values, but a BMW 320i of unknown year is not a verified car.
- NHTSA cars are US-market, mostly pre-1999. That fits Mustang, Wrangler, W201, E30 and Beetle, but not Ukrainian-market cars.

### Gaps
- A text search of the 1999 listing finds no Skoda, Lada, Daewoo, Zastava, Citroën, Porsche, Alfa Romeo, Smart, Peugeot or Fiat entries. Renault appears only as a 1982 LeCar tilt-table row. The Yugo GV is the nearest thing to the cars Ukrainian readers know. I could not check the paywalled 2010 and 2021 lists.
- I could not read the CommonRoad PDF that documents the parameters (gitlab timed out), so the "DOT" origin is taken from the YAML comments.
- NHTSA's rollover Phase IV reports were found ([presentation](https://www.nhtsa.gov/sites/nhtsa.gov/files/031402rollover_short.pdf), [document](https://www.nhtsa.gov/document/light-vehicle-dynamic-rollover-propensity-phases-iv-v-and-vi)) but roll gradient tables were not confirmed.

## What is the best independent source for skidpad and braking numbers?

### Takeaway
Use Car and Driver for skidpad (fixed 300 ft circle, tyre model and mass printed), and ADAC for European 100-0 km/h braking with a documented procedure. Treat moose results as a qualitative ranking, and never mix braking figures without normalising the speed, load and tyre.

### Cited Findings
- **C/D** prints skidpad on a [300 ft diameter circle, 70-0 mph, curb weight, %front/rear and tyre model on one sheet, sometimes including CG height and a 610-ft slalom](https://s3.amazonaws.com/amv-prod-cad-assets/files/2013-ford-focus-st-vs-2012-volkswagen-gti-comparison-test-car-and-driver2013-ford-focus-st-vs-2012-volkswagen-gti.pdf) (R). The sheet does not explain how CG height was obtained, so treat it as unverified.
- **ADAC** procedure: [half-loaded, series summer tyres, full stop from 100 km/h, GPS-measured, mean of ten; evasion test at 90 km/h assessed for vehicle reaction](https://res.cloudinary.com/adacde/image/upload/v1572512158/ADAC-eV/KOR/Text/PDF/So_testet_der_ADAC_Autotest_30012_zdhfn4.pdf) (R). The [Golf VIII test](https://assets.adac.de/image/upload/Autodatenbank/Autotest/at6463-vw-golf-15-tsi-life/vw-golf-15-tsi-life.pdf) (R) shows a practical limit: the car ran optional all-season tyres. ADAC publishes many historic Golf tests, including a [1.9 TDI Comfortline with 37.5 m from 100 km/h at half load](https://assets.adac.de/image/upload/Autodatenbank/Autotest/AT1097_VW_Golf_1_9_TDI_Comfortline_5_Gang/VW_Golf_1_9_TDI_Comfortline_5_Gang.pdf) (E).
- **Auto Motor und Sport** publishes slalom, VDA lane change and braking in its [test data](https://www.auto-motor-und-sport.de/test/vw-golf-1-2-tsi-im-einzeltest/technische-daten/). Values were visible only in search excerpts. [AMS itself changed its braking method](https://www.zwischengas.com/assets/a71cc16f-4136-4f6a-a7e0-f337b2c51dad), so old and new figures may differ (E).
- **Moose test.** [ISO 3888-2 course, 72 km/h pass entry speed in one account, repeated at rising speed, dry surface, belted occupants and boot weights for maximum load; Teknikens Värld publishes results](https://en.wikipedia.org/wiki/Moose_test) (W). [Another report cites a 70 km/h minimum](https://www.torquenews.com/1083/other-side-toyota-rav-primes-moose-test-failure) (E). The rule therefore changed or is misreported.
- **Tyre Reviews:** [110 km/h entry, measured 100-5 km/h window](https://www.tyrereviews.com/Tyre-Tests/The-FASTEST-Track-Tyres-In-The-World-Tested.htm) in a track test, and an [80-5 km/h window with four runs averaged](https://www.tyrereviews.com/Article/2021-Tyre-Reviews-UHP-Summer-Tyre-Test.htm) in a UHP test (E). [TÜV SÜD uses 100-0](https://es.slideshare.net/estoril2011/tuv-sud-methodolgy-and-tests-results), and [IDIADA extrapolates 100-0 from 100-5 with at least five valid runs](https://tomket.com/pdf/complete_test_tomket_idiada.pdf) (E). These test tyres on one car, so they bound tyre effects rather than characterising cars.
- Same-car spread: 2011 Mustang GT at 0.94 g/105 ft ([MT](https://carmodifiedwithnitrousoxidesystem.blogspot.com/2010/03/motortrend-gets-even-better-numbers-128.html)) vs 0.92 g/109 ft ([Edmunds](https://www.edmunds.com/car-reviews/track-tests/track-tested-2012-ford-mustang-boss-302-vs-2011-ford-mustang-gt.html)) (E).

### Inferences
- Observed spread supports tolerances of at least about ±0.03 g and ±5% on braking for any single-source test, in the spirit of the engine model's ±20% power band. These are starting points only.
- C/D's GTI on all-seasons vs the Focus on summer tyres (0.86 g vs 0.93 g, 187 ft vs 164 ft) shows tyres can move results as much as a suspension class. A suspension model has to fix the tyre to compare any layouts.

### Gaps
- Teknikens Värld's own pages were not reached, so no moose figure here is first-hand.
- Motor Trend's skidpad diameter and Edmunds' test setup could not be confirmed from accessible pages.
- C/D's site could not be used for direct search, so the C/D rows here depend on the items reachable by other routes.
- No source for ride frequency or measured roll gradient (deg/g) on any production car was found, except the derived 996 estimate above. Roll gradient should be presumed effectively unpublished until a specific source is found.

## What is safe to treat as verified, and what are the common sources of error?

### Takeaway
Treat only manufacturer manuals and NHTSA rows, keyed to the exact year and variant, as verified. Forum, aggregator and vendor values go in `unverified`. The largest errors come from chassis variants, ride-height dependence, tyres and load state.

### Cited Findings
Common error sources, each with a real example:
- **Chassis variant inside one model:** Octavia Mk2 [camber −30′ / −41′ / −8′ and height 391 / 376 / 416 mm for 2UA / 2UC / 2UB](https://workshop-manuals.com/skoda/octavia-mk2/axles_steering/wheels_tyres._axle_align/chassis_specified_values_of_steering_geometry/front_axle_specified_values_of_steering_geometry/) (X). Golf Mk3 [caster +1°45′ vs +3°25′](https://workshop-manuals.com/volkswagen/golf-mk3/running_gear/wheels_tyres._axle_align/wheel_alignment/specifications_for_wheel_alignment_vehicles_with_front_and_four-wheel_drive/) (X).
- **Ride height:** MX-5 NC [camber runs from −0°41′ to +0°21′ across about 50 mm of ride height](https://2008-mx-5-wiring-diagram-and-workshop-manual.pages.dev/src/g5w02/html/id021100800200) (X). There is no single "factory camber" for this car. The S2000 note also says [ride height greatly affects camber](https://robrobinette.com/images/S2000/Honda_S2000_Alignment_by_Rob_Robinette.pdf) (R).
- **Model-year splits:** Octavia Mk1 [rear camber changes at 12/96 and caster tolerance changes at MY2001](https://workshop-manuals.com/skoda/octavia-mk1/chassis/technical_data/technical_data/chassis_specified_values/) (X). S2000 [rear toe differs for AP1, AP2 and CR](https://robrobinette.com/images/S2000/Honda_S2000_Alignment_by_Rob_Robinette.pdf) (R).
- **Market:** the [S2000 AP1 UK spec is caster 6°45′, front camber −1°, rear −2°, against the US spec of 6°, −0°30′, −1°30′](https://robrobinette.com/images/S2000/Honda_S2000_Alignment_by_Rob_Robinette.pdf) (R, secondary). The ZAZ Lanos may also differ from the [US 2001 Lanos manual](https://workshop-manuals.com/daewoo/lanos_s_sedan/l4-1.6l_dohc_d-tec_mfi/maintenance/alignment/system_information/specifications/). I could not check this.
- **Manual revisions:** [Tesla's alignment page has dated revisions in 2023 and 2026](https://service.tesla.com/docs/ModelS/ServiceManual/Palladium/en-us/GUID-6537652C-5A32-4F97-95B9-A624A267EA2C.html) (X). Older [air vs coil values reported by TeslaRati](https://www.teslarati.com/tesla-model-s-tire-rotation-care-tips/) (E) have no stated revision.
- **Mass definition:** a single model's mass appears as [2,901 vs 2,693 lb in aggregators](https://www.autoblog.com/es-us/buy/2015-Volkswagen-Golf/review/) (E). [A Model S listing shows 2,500 lb curb weight](https://rajibsalui.github.io/CarX/models.html) (E, clearly wrong). The [944 page warns some figures are dry weight](https://en.wikipedia.org/wiki/Porsche_944) (W). NHTSA rows include fuel and sometimes occupants.
- **Trims in aggregators:** [Alfa 75 track by engine](https://cars-data.com/en/alfa-romeo/75/1985/3-0-v6--3407/specs) and a [Group A race car at 1425 mm](https://www.ultimatecarpage.com/spec/7937/Alfa-Romeo-75-Turbo-Evoluzione-Group-A.html) (E).
- **Test car status:** the [C/D MX-5 was a preproduction car](https://integrityexports.com/wp-content/uploads/2015/06/2016-mazda-mx-5-miata-club-test-review) (X).
- **Equal-looking units:** 60-0 mph, 70-0 mph, 100-0 km/h, and measured windows of 100-5 or 80-5 km/h are all reported as "braking". Skidpad figures depend on circle size. C/D's 300 ft (91.4 m, D) is not interchangeable with other circles.
- **Toe sign and basis:** toe appears per wheel or total, in angles or mm, as in the [Lanos](https://workshop-manuals.com/daewoo/lanos_s_sedan/l4-1.6l_dohc_d-tec_mfi/maintenance/alignment/system_information/specifications/) and [S2000](https://robrobinette.com/images/S2000/Honda_S2000_Alignment_by_Rob_Robinette.pdf). Tesla's rear limits are both "in" in the extract and need rechecking.

### Inferences
Proposed trust tiers for the project (my judgment):

| Tier | What | Use |
|---|---|---|
| 1 Verified | NHTSA VIMF or IPMD v3+ rows; workshop-manual alignment tables after direct recheck (Octavia, Lanos with sign checked, Golf Mk3, MX-5 NC, Tesla) | hard test limits, keyed by exact year and variant |
| 2 Verified with caveats | NHTSA IPMD v1-v2 (use the ±25 mm bound); C/D track numbers with tyre recorded; ADAC braking; Paradkar K&C-derived 996 values; S2000 alignment via Robinette | soft limits, show the caveat in the article |
| 3 Unverified | Moose figures from secondary reports, S2000 spring rates and motion ratios, AMS values seen only in excerpts, CommonRoad, Wikipedia masses | `verifyNote` text only, never a test limit |
| 4 Reject | Aftermarket spring sheets as OEM values, aggregator specs with conflicts, Scribd garbled tables, CarSim and MATLAB defaults as real cars | do not use |

- The project's existing pattern (global constants against a real table, plus `unverified` fields) fits: calibrate roll and mass against tier 1-2 rows, and show the rest only as commentary.
- A realistic first verification table would be: CG height and inertias (NHTSA), alignment ranges (manuals), skidpad and braking (C/D, ADAC), each on its own trim, with no attempt to merge them into one row.
- Spring rates, ARBs and hardpoints will have to stay modelling assumptions, explicitly labelled. This is the biggest difference from the engine model, where factory power and torque are public for nearly every car.

### Gaps
- All level X and E values above need a direct recheck before being committed as data. This applies especially to the Golf Mk3 column order, the Lanos signs, and Tesla's rear toe.
- A paid route (SAE 2021-01-0970, the Michelin sample dataset, A2Mac1) could fill modern CG height and K&C gaps. I did not assess cost.
- The Heydinger full text I read is a third-party copy of an SAE-copyrighted paper. Cite the [SAE DOI](https://doi.org/10.4271/1999-01-1336) in project materials, and consider whether the project should link to the copy at all.
