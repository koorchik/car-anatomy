# How suspension effectiveness is measured: metrics, standard manoeuvres, road inputs

Tags used on every claim:
- **[V]** verified: I read the fetched page or PDF text and the claim is in it.
- **[S]** snippet only: the claim came from a search-result summary. I did not read the page, so the exact attribution to that URL within the result list is not fully checked.
- **[NOT VERIFIED]** from memory or textbook recollection, with no source read in this session. All of these sit under Gaps.
- **[OWN CALC]** my own derivation or scratch calculation. It is not a published figure, and all of these sit under Inferences.

ISO, SAE and most road-test archives are paywalled. Only ISO 3888-2:2011 (free iTeh preview) was read as a primary standard text. FMVSS 126 was read in codified form via a summary of the Cornell page. Everything else on ISO standards is secondary.

Reference model for all [OWN CALC] figures: quarter car with ms 300 kg, mu 30 kg, ks 20 000 N/m, kt 160 000 N/m, taken from a university "large saloon" example ([Mason TTC066 notes](https://bamason2.github.io/ttc066-module/notes/Section_5.html) [V]). It is linear, with point-contact tyre and no seat, unless stated otherwise.

## Handling tests and their definitions

### Takeaway
Standards define procedures and raw outputs, not good/bad thresholds. Only FMVSS 126 has a pass/fail, and it tests ESC more than suspension. I could not find a reliable published table of typical values by car class. The few numbers available are forum-grade or single-car figures and are labelled as such.

### Cited Findings
**ISO 4138 (steady-state circular driving)**
- ISO 7401 refers to ISO 4138 for steady-state properties, which makes 4138 the understeer-gradient reference — [ISO 7401:2011 summary](https://standards.iteh.ai/catalog/standards/iso/a1f9fdfd-8c82-4209-8d6a-f5dc0717bf00/iso-7401-2011) [S]; my fetch of that page returned only the site header.
- Understeer gradient is the rate of change of understeer angle with lateral acceleration on a level road, and speed and lateral acceleration must be stated with any figure — [Wikipedia: Understeer and oversteer](https://en.wikipedia.org/wiki/Understeer_and_oversteer) [S].
- Weight distribution and suspension geometry have the largest effect on the steady-state value. Power distribution and tyres also matter — [Wikipedia: Understeer and oversteer](https://en.wikipedia.org/wiki/Understeer_and_oversteer) [S].
- Typical values, all weak: average 4.4 deg/g for American cars and 2.6 deg/g for European cars (2003 SAE-based reference); 2 to 3 deg/g for recent cars (forum post); about 1 deg/g for a laden light truck (forum post) — [eng-tips thread](https://eng-tips.com/threads/understeer-gradient-of-modern-passenger-cars.190555) [S]; a direct fetch returned 403, so the origin of each figure is unconfirmed.
- A teaching exercise sets a target of < 2.5 deg/g. This is a course target, not a norm — [HS Kempten course page](https://moodle.hs-kempten.de/course/section.php?id=6484) [S].

**ISO 7401 (transient open-loop response)**
- Scope: passenger cars and light trucks. Time-domain outputs include response time (from 50% steering change to 90% of steady state), peak response time and overshoot. Lateral acceleration gain and yaw velocity gain are also covered — [ISO 7401:2011 summary](https://standards.iteh.ai/catalog/standards/iso/a1f9fdfd-8c82-4209-8d6a-f5dc0717bf00/iso-7401-2011) [S].
- Yaw velocity gain is yaw velocity divided by steering-wheel angle. Time lags between steering angle, lateral acceleration and yaw velocity are further criteria (1988 edition) — [ISO 7401:1988 sample](https://cdn.standards.iteh.ai/samples/14121/3c80614e547f43a88926f799ed1ccc8e/ISO-7401-1988.pdf) [S]; the PDF is a scan and I could not extract text from it.

**ISO 3888-1 and -2 (lane change, moose)**
- ISO 3888-2 defines the track "for subjectively determining the obstacle avoidance performance". It therefore defines a track, not a numeric score, and applies to cars and light commercial vehicles up to 3.5 t — [ISO 3888-2:2011 preview](https://cdn.standards.iteh.ai/samples/57253/5e8cdcc7c2fe4c0c8fe6f1de8beb5dba/ISO-3888-2-2011.pdf) [V].
- ISO 3888-2:2011 Table 1, total length 61 m — same source [V]:

| Section | Length, m | Lane offset, m | Width b, m |
|---|---|---|---|
| 1 | 12 | n/a | 1.1 × vehicle width + 0.25 |
| 2 | 13.5 | n/a | n/a |
| 3 | 11 | 1 | vehicle width + 1 |
| 4 | 12.5 | n/a | n/a |
| 5 | 12 | n/a | 1.3 × vehicle width + 0.25, not less than 3 m |

- Section 4 is 1 m shorter than section 2 "to ensure high lateral accelerations at the end of the track". Cones are at least 500 mm high — same source [V] for the first; [iTeh summary](https://standards.iteh.ai/catalog/standards/iso/e0dedc5d-b4b0-4f35-aee0-88a100611ddf/iso-3888-2-2011) [S] for the second.
- Current edition is ISO 3888-2:2025, with re-drawn figures and minor rephrasing listed as the changes. I read only the 2011 dimensions — [ISO](https://www.iso.org/standard/86381.html) [S].
- ISO 3888-1:2018 is the closed-loop double lane-change track, last confirmed in 2024 with a new edition in preparation. Its dimensions were not found — [ISO](https://www.iso.org/standard/67973.html) [S].
- Teknikens Värld's moose test: one belted person per seat plus boot weights to maximum load, dry surface, speed raised until the car skids, hits cones or spins. Typical failure speed is 70 to 80 km/h. Xantia Activa V6 record 85 km/h, Reliant Rialto slowest pass 42.5 km/h, Mercedes A-Class overturned at 60 km/h in 1997, and Dacia Logan's initial failure was later attributed to tyre wear from over-testing — [Wikipedia mirror: Moose test](https://ipfs.ssi.eecc.de/ipns/en.wikipedia-on-ipfs.org/wiki/Moose_test) [V, tertiary].
- 72 km/h with full load is the reported pass mark: Volvo V60 best 74 km/h, Tesla Model 3 SR+ 76 km/h, Toyota RAV4 at most 68 km/h before and 72 km/h after an ESC upgrade — [Yahoo/Toyota RAV4](https://www.yahoo.com/now/toyota-rav4-passes-moose-test-170500856.html), [inkl/Tesla](https://www.inkl.com/news/watch-tesla-model-3-standard-range-perform-flawless-moose-test), [AutoUA/Volvo](https://autonews.autoua.net/en/novosti/38110-volvo-v60-aces-moose-test-ensuring-safety-and-control-road.amp) [S]. The RAV4 case shows the result moves with electronics alone.

**ISO 7975, ISO 9816, ISO 13674**
- ISO 7975:2019 is an open-loop test of how braking in a turn affects course holding and directional behaviour — [BSI](https://knowledge.bsigroup.com/products/passenger-cars-braking-in-a-turn-open-loop-test-method-1), [SCC](https://scc-ccn.ca/standardsdb/standards/8163110) [S].
- ISO 9816:2018 covers the power-off reaction of a vehicle in a turn, open loop. ISO 13674 quantifies on-centre handling: Part 1 is the weave test and Part 2 the transition test — [DIN catalogue listing](https://www.din.de/de/mitwirken/normenausschuesse/naautomobil/veroeffentlichungen/wdc-beuth:din21:90013319/toc-9724920/download) [S]. Output definitions were not obtained.

**FMVSS 126 / UN R13-H / Euro NCAP sine with dwell**
- Steering: sine at 0.7 Hz with a 500 ms delay at the second peak, starting while coasting in high gear at 80 ± 2 km/h. Amplitude starts at 1.5A and rises by 0.5A per run up to the greater of 6.5A or 270 deg (6.5A applies only if ≤ 300 deg) — [49 CFR 571.126](https://www.law.cornell.edu/cfr/text/49/571.126) [V].
- Yaw-rate pass criteria: at 1.0 s after steering ends ≤ 35% of the first peak after steering sign change; at 1.75 s ≤ 20% — same source [V].
- Responsiveness: lateral displacement at 1.07 s after beginning of steer ≥ 1.83 m for GVWR ≤ 3 500 kg, ≥ 1.52 m above that — same source [V]. It applies only at amplitude scalar ("gain") ≥ 5.0 — [CarSim note](https://www.carsim.com/downloads/pdf/sine_w_dwell.pdf) [S].
- Reference test, Slowly Increasing Steer: 80 ± 2 km/h, 13.5 deg/s, until about 0.5 g — [49 CFR 571.126](https://www.law.cornell.edu/cfr/text/49/571.126) [V].
- Euro NCAP's test followed ECE R13H and ran from 2011 on eligible cars. Euro NCAP stopped dynamic ESC testing in November 2014 once ESC became mandatory — [Euro NCAP 2010 ESC page](https://www.euroncap.com/zh/车辆安全/安全活动/2010-年电子稳定控制系统试验) [S]. The protocol PDF returned 404.

**Skidpad and slalom**
- Skidpad: drive a known-radius circle and raise speed until the car cannot hold the radius — [ISDA post](https://isdacenter.org/impressive-skidpad-tests-for-executive-vehicles/) [S]. It cites one Car and Driver figure of 0.92 g for a 2022 Mercedes S 500 (secondhand, one car).
- Road & Track's slalom used eight cones at 100 ft spacing — [Grassroots Motorsports article](https://grassrootsmotorsports.com/articles/g-whiz/) [S]. The exact source within the search result list is unconfirmed.
- Consumer Reports' avoidance manoeuvre is a left-right-left path-following cone test, scored by maximum speed. Older results: Veloster Turbo R-Spec 60.0 mph, Porsche 718 Boxster about 59 mph, Cadillac Escalade 45.0 mph — [CR best safety performance](https://www.consumerreports.org/car-safety/best-car-safety-performance-a2791501054), [Jalopnik](https://www.jalopnik.com/2183901/consumer-reports-emergency-handling-avoidance-maneuver-test-traffic-cones/) [S]. These are dated and are not ISO 3888-2.

### Inferences
- [OWN CALC] Steady-state bicycle model: steer = L/R + K·ay, yaw gain r/δ = V / (L + K·V²/g), characteristic speed V_ch = √(g·L/K) with K in rad/g. For L = 2.7 m and K = 2.5 deg/g: V_ch ≈ 24.6 m/s (89 km/h). At 100 km/h with steering ratio 15, gain is about 0.30 deg/s per deg of steering-wheel angle. A simplified model reproduces this class of output exactly, provided K is produced by modelled load transfer, tyre load sensitivity and compliance steer rather than typed in.
- ISO 3888-2 and sine-with-dwell are poor primary suspension metrics. The first is closed-loop and driver-dependent, and the second is designed to judge ESC. The RAV4 case supports this: speed moved through an electronics change only.
- "Lane-change speed" is still valuable as a public-facing scenario, but the number depends on the simulated driver and on ESC assumptions. It must be labelled as model-relative and not compared with Teknikens Värld figures.
- [OWN CALC] Treating the Table 1 lane offset as the gap between adjacent cone lines, the required centre-line shift is about 1.05·w + 1.63 m, which is about 3.6 m for a 1.85 m wide car. Please verify against the figure before reuse.

### Gaps
- [NOT VERIFIED] ISO 4138 methods (constant radius, constant steer, constant speed) and the SAE J266/J670 wording of understeer gradient. No free text was read.
- [NOT VERIFIED] ISO 7401 typical conditions (100 km/h, 4 m/s² steady state) and its frequency-domain outputs.
- [NOT VERIFIED] Typical yaw response times (recollection: about 0.1 to 0.2 s) and any class split. No source found.
- [NOT VERIFIED] A = steering-wheel angle at 0.3 g from Slowly Increasing Steer. The fetched text did not show it.
- [NOT VERIFIED] ISO 7975 and ISO 9816 outputs (yaw and path deviation against a reference at a set time after the event) and ISO 13674-1 weave conditions.
- [NOT VERIFIED] ISO 3888-2 annex procedure: entry speed and throttle release. The 72 km/h pass mark is a magazine convention in secondary sources, not found in the ISO text I read.
- No reliable typical skidpad, slalom or understeer values for family, sports and SUV classes were found. Recollection (mainstream about 0.8 to 0.9 g, sports above 0.95 g, SUV about 0.75 to 0.85 g) is [NOT VERIFIED] and should not be published without compiling a road-test table.
- No ADAC test method or result was obtained (searched once in combination with CR, no hits).

## Ride tests and metrics

### Takeaway
ISO 2631-1 weighted RMS with its comfort labels and ISO 8608 random roads are the standard pair, and both are directly computable. Beware of the ISO 8608 table confusion: values differing by a factor of 16 circulate because of two reference conventions.

### Cited Findings
**ISO 2631-1**
- Seated: Wd on x and y, Wk on z. Comfort multipliers are 1.0 on all axes (health x and y: 1.4). Total value aT = √(kx²·awx² + ky²·awy² + kz²·awz²) — [Prosig](https://blog.prosig.com/?p=4847) [V, secondary].
- Comfort scale in m/s², overlapping and assessed top-down: ≤ 0.315 not uncomfortable; 0.315–0.63 a little uncomfortable; 0.5–1.0 fairly uncomfortable; 0.8–1.6 uncomfortable; 1.25–2.5 very uncomfortable; ≥ 2.5 extremely uncomfortable — [Prosig](https://blog.prosig.com/?p=4847) [V, secondary]. Other secondary tables render the 1.25–2.5 boundary inconsistently — [arXiv 2501.17664](https://arxiv.org/pdf/2501.17664) [S]. A later search summary described one table's top band as "above 2.0", so the standard should be checked before quoting the top two bands.
- Signals must be tri-axial, minimum 227 s, 600 s or more recommended — [Prosig](https://blog.prosig.com/?p=4847) [V].
- Health bounds are separate: EU 2002/44/EC daily A8 action 0.5 m/s², limit 1.15 m/s²; VDV action 9.1, limit 21.0 m/s^1.75 — [Prosig](https://blog.prosig.com/?p=4847) [V]. These are occupational exposure limits, not comfort scores.
- VDV is the fourth root of the time integral of the fourth power of weighted acceleration — [arXiv 2501.17664](https://arxiv.org/pdf/2501.17664) [S]. RMS suffices below crest factor 9; VDV applies above it — [Scribd ride comfort document](https://www.scribd.com/document/385036592/ride-comfort-pdf) [S, weak].
- Wk band limits are 0.4 Hz and 100 Hz — [Prosig weighting article](https://blog.prosig.com/?p=4829) [S]. Wf is for motion sickness — [DADiSP](https://dadisp.com/iso2631.htm) [V].
- The 1997 edition left the choice between overall RMS, VDV, running RMS and no time dependency open, and this has been criticised — [Southampton eprint](https://eprints.soton.ac.uk/407916) [S].

**Ride frequencies**
- Body bounce is tuned to 1–2 Hz, and frequencies well below 1 Hz risk nausea. Abdominal resonance at 4–8 Hz is to be avoided. Damping ratio 0.2–0.4 is typical practice. Wheel hop is 11–13 Hz for a large saloon. Heavy damping merges both resonances near 3.5 Hz — [Mason notes](https://bamason2.github.io/ttc066-module/notes/Section_5.html) [V]. The notes print a wheel-hop value of 6000 rad/s, which is a typo; √(180000/30) gives 77.5 rad/s.
- Forum-grade: front about 1.2 Hz, rear about 1.5 Hz; sports about 2 Hz; street setup at 2.7 Hz called very stiff — [eng-tips](https://www.eng-tips.com/viewthread.cfm?qid=21552), [eng-tips](https://eng-tips.com/threads/spring-frequency.82047/page-2) [S].

**ISO 8608**
- Gd(n) = Gd(n0)·(n/n0)^(−w), n0 = 0.1 cycles/m, w = 2 for the class fit, eight classes A–H — [Agostinacchio et al. 2014](https://link.springer.com/article/10.1007/s12544-013-0127-8) [S]; the fetch redirected to a login.
- In the n convention, units 10⁻⁶ m³: A below 32, D 512–2 048 — [J. Modern Transportation 2017 paper](https://link.springer.com/article/10.1007/s40534-017-0122-1) [S]. A table in the same convention shows A 16–32, B 32–128, C 128–512, D 512–2 048, E 2 048–8 192 — [SpringerOpen article table](https://jmsg.springeropen.com/articles/10.1186/s40712-018-0096-8/tables/4) [S]; extraction was garbled.
- Conflicting tables: geometric means 1, 4, 16, 64, 256 labelled with n0 = 0.1 — [arXiv 2605.09175](https://arxiv.org/pdf/2605.09175) [S]; B 2–8 and C 8–32 with no units — [Altair COSIN](https://help.altair.com/2024/hwdesktop/hwx/topics/motionview/cosin_io_2d_road_type_stochastic_uneven.htm) [S].
- Generation: sum of N sinusoids with PSD-derived amplitudes and uniform random phases; alternatively, filtered noise — same sources [S].
- Paved roads rarely belong in classes worse than D. Artificial profiles are stationary, unlike real ones — [J. Modern Transportation 2017 paper](https://link.springer.com/article/10.1007/s40534-017-0122-1) [S].

**IRI**
- IRI is the average rectified relative suspension velocity of a fixed "golden car" quarter car at 80 km/h divided by speed, in m/km, computed per wheelpath. It describes the road, not the car. FHWA: good < 1.50 m/km, acceptable 1.51–2.68, poor > 2.68 — [Wikipedia: IRI](https://en.wikipedia.org/wiki/International_roughness_index) [V, tertiary citing FHWA].
- Normalised golden-car values: c/ms = 6 1/s, kt/ms = 653 1/s², ks/ms = 63.3 1/s², mu/ms = 0.15 — [Ahlin & Granlund slides](https://es.slideshare.net/JohanGranlund/iri-vs-iso2631) [S].

**Bumps and potholes**
- TRL: peak vertical acceleration (average of absolute max and min) tracks discomfort on road humps; occupants are unwilling to accept a peak above about 0.7 g — [TRL 614](https://trl.co.uk/uploads/trl/documents/TRL614(1).pdf), [TRL LR597](https://www.trl.co.uk/uploads/trl/documents/LR597.pdf) [S]; which report carries the figure is unchecked. This is hump-design data, not a car rating.
- Journalistic accelerometer test: trapezoidal hump at 10 mph, stiff setup about 1.3 g peak-to-peak, improved to about 0.5 g in each direction, with about 1 s of ringing also reported — [The Truth About Cars](https://www.thetruthaboutcars.com/2012/10/supension-truth-4-once-upon-a-bump) [S]. Not comparable across vehicles.
- Simulation studies track vertical suspension force, vertical acceleration and wheel adhesion index across hump shapes — [Mercu Buana CarSim paper](https://publikasi.mercubuana.ac.id/index.php/ijimeam/article/view/26135) [S].

### Inferences
- [OWN CALC] The ISO 8608 conflict resolves numerically. Converting Gd(n0) at n0 = 0.1 cycles/m to Gd(Ω) at Ω0 = 1 rad/m uses Gd(Ω) = Gd(n)/2π and the w = 2 law, giving a factor 0.0628 = 1/16. So A = 16 ↔ 1, B = 64 ↔ 4, C = 256 ↔ 16, D = 1024 ↔ 64. Therefore 1, 4, 16 … belong to Ω0 = 1 rad/m, and pairing them with n0 = 0.1 cycles/m (as arXiv 2605.09175 appears to) gives a road 4× too small in amplitude. The Altair bands fit the same convention.
- [OWN CALC] Generator, one-sided PSD: h(x) = Σ √(2·Gd(n_i)·Δn)·cos(2π·n_i·x + φ_i), with φ_i uniform in [0, 2π). This follows from variance = A²/2 per component. Time-domain input is z_r(t) = h(v·t).
- [OWN CALC] Frequency-domain quarter car, ζ = 0.3, n = 0.011–2.83 cycles/m, class geometric means:

| Class | km/h | RMS body accel, m/s² | Wk-weighted, m/s² | RMS travel, mm | Tyre force CoV |
|---|---|---|---|---|---|
| A | 90 | 0.38 | 0.31 | 3.0 | 0.053 |
| B | 50 / 90 / 130 | 0.56 / 0.75 / 0.91 | 0.46 / 0.62 / 0.74 | 4.4 / 6.0 / 7.1 | 0.077 / 0.105 / 0.127 |
| C | 50 / 90 / 130 | 1.12 / 1.51 / 1.81 | 0.92 / 1.23 / 1.48 | 8.9 / 11.9 / 14.3 | 0.153 / 0.210 / 0.255 |
| D | 90 | 3.02 | 2.47 | 23.8 | 0.421 |

- Absolute comfort labels are risky. Class C at 90 km/h lands at 1.23 m/s² ("uncomfortable" to "very uncomfortable"). A model without seat, tyre enveloping, or the averaging from four wheels and wheelbase filtering likely overstates what a passenger feels. I found no measured production-car a_w values to calibrate against. Show the ISO labels only after calibration, or present relative change.
- [OWN CALC] Hump (80 mm high, 1 m long, sin² profile; nonlinear tyre lift-off, time domain). Harshness rises with damping while settling falls, so a single number hides a trade-off:

| km/h | ζ | Peak body g | Min tyre force / static | Peak travel, mm | Time to |a| < 0.05 g, s |
|---|---|---|---|---|---|
| 20 | 0.1 / 0.3 / 0.6 | 0.66 / 0.96 / 1.27 | 0.44 / 0.14 / 0.00 | 77 / 66 / 55 | 2.78 / 1.05 / 0.59 |
| 40 | 0.1 / 0.3 / 0.6 | 1.04 / 1.59 / 2.07 | 0.00 / 0.00 / 0.00 | 103 / 78 / 59 | 2.71 / 0.66 / 0.51 |

These figures are likely high because the tyre is a point contact and the hump is short. Use them for trend, not for labels.

### Gaps
- [NOT VERIFIED] Wk transfer parameters: f1 0.4, f2 100, f3 = f4 = 12.5 Hz, Q4 0.63, f5 2.37, Q5 0.91, f6 3.35, Q6 0.91, with no extra gain factor on the step filter. These reproduce gains 0.482 (1 Hz), 0.531 (2), 0.967 (4), 1.039 (5), 1.054 (6.3), 1.036 (8), 0.988 (10), 0.769 (16), matching my recollection of ISO Table 3. Both sides are from memory, so this is not independent verification. The search found no source listing f3 to f6. Check against ISO 2631-1 or ISO 8041 before implementing. Wd parameters were also not verified.
- [NOT VERIFIED] ISO 8608 spatial range 0.011–2.83 cycles/m, and the F–H class values.
- [NOT VERIFIED] BS 6841 and MTVV rules.
- No standard single-wheel cleat or harshness test was found. It appears to be manufacturer practice.
- No standard pothole test for ride evaluation was found.

## Road holding, the conflict triangle, and workshop tests

### Takeaway
Dynamic tyre load variation (RMS / static, the coefficient of variation) plus travel and comfort forms the honest triangle, and Hedrick & Butsuen prove the trade-off is structural. Workshop EUSAMA figures diagnose dampers on a shaker and do not measure quality on the road.

### Cited Findings
- Hedrick & Butsuen 1990 (Proc. IMechE D, vol. 204, D1): a dynamic constraint equation for the quarter car shows only one of three transfer functions (acceleration, suspension deflection, tyre deflection) can be specified independently. Acceleration and suspension deflection have invariant points. Improvement in all three is possible near the unsprung frequency, but severe trade-offs exist at all other frequencies — [TRID record](https://trid.trb.org/View/359313) [V, abstract].
- Soft spring limits: more working space needed and more fluctuating tyre load — [Mason notes](https://bamason2.github.io/ttc066-module/notes/Section_5.html) [V].
- Dynamic load coefficient is a coefficient of variation, RMS dynamic load over static, depending on road, speed, suspension and static load; it comes from truck and pavement literature — [Buhari et al., via core.ac.uk](https://core.ac.uk/download/42954042.pdf), [Politechnika Gdańska](https://pub.pg.edu.pl/pl/publication/159692/contribution-of-dynamic-vehicle-loads-to-pavement-failure) [S].
- A Polish quarter-car paper reports road-holding efficacy as minimum dynamic force relative to static quarter-vehicle weight — [PAN journal](https://czasopisma.pan.pl/Content/94968) [S].
- Three-index framing: mean square of sprung acceleration, rattle space, tyre deflection. For typical passenger cars, a hybrid semi-active policy gave a better compromise than skyhook or groundhook — [Ahmadian & Blanchard 2011](https://ro.uow.edu.au/engpapers/573) [S]; the fetch returned 403.
- Cost function trading ride, handling and stroke with LQR; best result is fully active with road preview — [Cvok et al.](https://www.bib.irb.hr/1025479) [S].
- Hrovat surveys: 1993 ASME DSMC review and 1997 Automatica 33(10) 1781–1817. Their content was not read — [Hrovat 1997 listing](https://data.zhenzhi.com/details/1/906878882) [S].
- Scenario-driven passive optimisation with ISO 8608 and ISO 2631 metrics plus contact-force variability and settling time. Symmetric damping is often enough at moderate excitation and asymmetry becomes necessary under severe excitation; rebound/compression ratios are scenario-dependent — [Ribeiro & Cunha 2026, arXiv 2605.05235](https://arxiv.org/abs/2605.05235) [V, abstract summary].
- Milliken as quoted on a forum: damping ratio 0.15 best ride for a compact car, about 0.45 best road holding — [eng-tips](https://www.eng-tips.com/viewthread.cfm?qid=308932) [S, secondhand].

**EUSAMA and phase**
- Test as run in the study: 3 mm amplitude sine, about 25 Hz down to zero at about 1.67 Hz/s. Results are determined around 10–20 Hz. The EUSAMA indicator rises degressively with damping and varies by less than 35 points even over a wide damping range; on a test Opel Agila rear it was hard to exceed 50%. Adding 180 N of sliding friction inflated it by up to 30 points. EUSAMA above 40% is treated as "good" in this paper, and viscous damper force stays below about 500 N — [Guzek & Zdanowicz 2020](https://bibliotekanauki.pl/articles/263600.pdf) [V].
- Phase method: minimum phase angle between excitation and contact force. It is roughly linear with damping (about 0.6 rad range) but friction can overstate it by 0.9 rad, and the minimum may disappear at high damping. The authors call it the most promising — same source [V].
- On class C at 90 km/h, a nominal damper delivers about 3× the force seen in the EUSAMA test, and friction is about 10% of damping force. Hence, the conditions correspond poorly to real use — same source [V].
- EUSAMA bands: about 20% unsatisfactory, rising through fair and good to excellent above 60% — [US patent 5369974](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5369974) [S].
- EGEA is standardising a tester for vehicles under 3.5 t, adding a minimum phase shift expressed as a percentage within a limit. The limit is not stated, and the article is undated within my read — [Autopromotec](https://www.autopromotec.com/en/EGEA-at-work-to-define-a-suspension-test-standard/a146) [V].

### Inferences
- [OWN CALC] Invariant points, from ms·z̈s + mu·z̈u = kt(zr − zu). At ω² = kt/mu, |z̈s/zr| = kt/ms for any spring or damper. At ω² = kt/(ms + mu), |travel/zr| = (ms + mu)/ms. With the reference model: 11.62 Hz at 533 s⁻² and 3.50 Hz at 1.100. I confirmed both numerically at ζ = 0.1, 0.3 and 1. They can be plotted as a site explainer: "the damper does nothing at this frequency".
- [OWN CALC] Damping sweep, class C at 90 km/h: comfort best near ζ ≈ 0.1, road holding best near ζ ≈ 0.4, and travel keeps falling with damping. This agrees with the secondhand Milliken figures in direction and magnitude, and it demonstrates the triangle directly. It also shows why unweighted RMS misleads: its minimum is near ζ 0.2 versus Wk near 0.1.

| ζ | a RMS | a_w (Wk) | Travel RMS, mm | Tyre CoV |
|---|---|---|---|---|
| 0.05 | 2.01 | 1.15 | 29.2 | 0.421 |
| 0.1 | 1.56 | 1.01 | 20.6 | 0.303 |
| 0.2 | 1.43 | 1.09 | 14.6 | 0.231 |
| 0.3 | 1.51 | 1.23 | 11.9 | 0.210 |
| 0.4 | 1.63 | 1.38 | 10.3 | 0.207 |
| 0.6 | 1.90 | 1.66 | 8.4 | 0.216 |
| 1.0 | 2.38 | 2.11 | 6.5 | 0.252 |
| 1.5 | 2.89 | 2.58 | 5.3 | 0.299 |

- A simulated EUSAMA is feasible and educational as "what a workshop tester sees", but the site should not present it as a suspension quality score, given Guzek & Zdanowicz.

### Gaps
- Thompson's 1971 quarter-car result: no source confirmed specifics. [NOT VERIFIED] Do not quote.
- [NOT VERIFIED] Skyhook definition (damper force proportional to absolute body velocity). Not read in a source here, though it is standard.
- [NOT VERIFIED] Attribution of phase shift to Boge. I could not confirm it; my recollection is that Boge testers measure amplitude at resonance and that phase came via SAE and GOCA. The Autopromotec article credits an SAE proposal adopted by GOCA.
- [NOT VERIFIED] Commonly cited phase limit (φ_min around 35°). No threshold was found in a source.
- Original EUSAMA TS-02-76 text not found.
- Dixon's *The Shock Absorber Handbook* was not accessible.

## Braking

### Takeaway
On a smooth road, the tyre sets the limit and suspension affects only how load is shared and how much the car pitches. Evidence that suspension changes stopping distance mostly concerns worn dampers, and it is thin and partly from manufacturers.

### Cited Findings
- Anti-dive does not change steady-state total load transfer, which depends on braking force, CG height and wheelbase. It changes how the load gets to the body and how much it pitches — [Suspension Secrets](https://suspensionsecrets.co.uk/anti-squat-dive-and-lift-geometry/), [EVKX](https://evkx.net/dictionary/anti-dive-and-anti-squat) [S]. A forum poster argues that transient load transfer can differ — [FSAE forum](https://www.fsae.com/forums/archive/index.php/t-11897.html) [S, weak].
- Too much anti-dive can worsen brake feel and make tyre breakaway sharper — [VDI](https://vdi.mydigitalpublication.co.uk/may-2023/page-50) [S]. Excess dive can cause early lockup at one end — [Intrax](https://www.intraxracing.nl/en/?p=48898) [S, manufacturer].
- Front camber gain under braking helps keep the contact patch flat, and this is qualitative only — [Suspension Secrets](https://suspensionsecrets.co.uk/anti-squat-dive-and-lift-geometry/) [S].
- Worn dampers: 80 km/h braking with dampers at 50% effectiveness, worst case about 14.1% longer with ABS, and reduced ESP effectiveness — [Konieczny 2018](https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-a5a86717-564b-4662-af1f-91077e0767d8/c/konieczny_braking_tp_2_2018.pdf) [S]; fetch 403.
- Damaged damper on a class-A 4WD car: longer stopping, yaw about 1 m off line — [Parczewski 2011](https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-article-BUJ5-0040-0043/c/httpwww_bg_utp_edu_plartjok32011jok32011331.pdf) [S].
- Industry claims: 2.6 m longer from 80 km/h on a straight road, attributed to TÜV Rheinland via KYB — [KYB Europe](https://kyb-europe.com/?p=134) [S, marketing]. Over 10% longer in a curve from 31 mph with ABS and one faulty damper — [Commercial Motor 1989, Monroe tests](https://archive.commercialmotor.com/article/31st-august-1989/108/monroe-shocks-fitters) [S, marketing].
- A study plan states that no prior tests had determined damper condition and road-surface effects on stopping distance — [Janulin et al. 2016](https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-f1a8bc5d-4ba9-4ba5-84bf-2fed0795325d/c/janulin_gonera_witkowicz_diagnostic_3_2016.pdf) [S]. This suggests a thin evidence base.
- A "University of Cologne" study is cited only via a Q&A site and could not be confirmed — [JustAnswer](https://www.justanswer.com/car/16pgz-university-worn-shocks-struts-braking-efficiency-as.html) [S]. Do not use.

### Inferences
- [OWN CALC] d = v²/(2·μ·g): 100 km/h at μ = 1.0 gives 39.3 m. Load transfer ΔFz = m·a·h/L: at 1 g with h = 0.55 m and L = 2.7 m, 20% of vehicle weight moves forward.
- [OWN CALC] Dive scales with (1 − anti-dive) and inversely with front ride rate, so springs and anti-dive give an honest, visible pitch-angle result.
- For the "no control is dead" rule: on a smooth road, a spring or damper change should barely change stopping distance in an honest model. The site should show this explicitly, with distance changing only through balance loss (load sensitivity and brake bias) and road-surface load fluctuation. Otherwise, a simplified model would invent a benefit.
- Modelling rough-road braking needs tyre load sensitivity and relaxation plus some ABS model. Without this, label the distance "tyre-limited" and do not attribute it to the suspension.

### Gaps
- No peer-reviewed quantified link between anti-dive or camber and stopping distance was found. Recollections about this are [NOT VERIFIED].
- Full texts of the Polish studies were not read.
- Dive deg/g typical values were not found.

## Roll, rollover and SSF

### Takeaway
Roll gradient is easy and exact to compute but sparsely documented. SSF is a well-documented, easy geometry metric that says little about suspension.

### Cited Findings
- Roll gradient: about 3 deg/g sports car and about 7 deg/g passenger car, relayed from a study on ball-bank indicators — [eng-tips](https://eng-tips.com/viewthread.cfm?qid=206572) [S, secondhand; exact thread unconfirmed].
- Formula SAE: 0.6–1.0 deg/g — [FSAE forum](https://www.fsae.com/forums/archive/index.php/t-3500.html) [S]. Sporty student target: 3.50–3.80 deg/g — [Skill-Lync](https://skill-lync.com/student-projects/fggfg) [S, weak].
- SSF = T/(2H), with driver-only load. Higher is safer — [NHTSA FAQ archive](https://webharvest.gov/peth04/20041029175459/https:/www.nhtsa.dot.gov/cars/problems/Rollover/pages/faqs.htm) [V], [NHTSA SSF procedure](https://webarchive.library.unt.edu/web/20161101030520/http://www.safercar.gov/staticfiles/safercar/NCAP/SSF_Test_Procedure-March2013.pdf) [S].
- SSF ranges from about 1.00 to 1.50; most cars 1.30–1.50; SUVs, pickups and vans usually 1.00–1.30 — [NHTSA FAQ archive](https://webharvest.gov/peth04/20041029175459/https:/www.nhtsa.dot.gov/cars/problems/Rollover/pages/faqs.htm) [V].
- About 95% of rollovers are tripped, which is why SSF weighs more than the dynamic test. The fishhook tip-up counts if both inside tyres lift at least 2 inches. Example at SSF 1.20: 19% risk and 4 stars without tip-up; 22% and 3 stars with tip-up — same source [V, 2004 archive].
- Star bands: 0–10% five stars, 10–20% four stars, above 40% one star — [NRC report](https://www.nationalacademies.org/read/10308/chapter/2) [V]. The middle bands (20–30%, 30–40%) appear only in a secondary table — [Bosch ESP slides on Scribd](https://es.scribd.com/document/235471397/Bosch-ESP) [S]. SSF 1.03 to 1.45 spans over 40% to under 10% — [CPSC document](https://www.cpsc.gov/s3fs-public/pdfs/blk_pdf_commcanvass12152009.pdf) [S].
- NRC: SSF risk statistically significant for higher-risk scenarios, but the exponential model lacks confidence to discriminate within a vehicle class. Five levels are coarse, and dynamic metrics are needed as complement — [NRC report](https://www.nationalacademies.org/read/10308/chapter/2) [V].
- Heavy-load fishhook was found most useful among manoeuvres for predicting rollover risk — [NHTSA analysis, ESV paper](https://www-esv.nhtsa.dot.gov/Proceedings/19/05-0450-O.pdf) [S].

### Inferences
- [OWN CALC] Roll gradient φ/ay ≈ m·g·h_r / (K_φ − m·g·h_r), with h_r the CG height above roll axis and K_φ the total roll stiffness (rad/g form). It is exact within the rigid-body assumption and gives a visible result for springs, bars, track and roll centre.
- SSF should be treated as rollover-related geometry, not suspension quality: a suspension control has an effect only by moving track or CG. The published ratings describe a 2004-era method, and they should not be presented as the current rating without checking.
- Sites can honestly compute "rollover threshold minus suspension effect" from CG shift under roll, but this should be labelled as a steady-state estimate.

### Gaps
- No reliable roll gradient values for SUVs were found. No primary source for the 3 and 7 deg/g figures was obtained. Recollection of about 4–8 deg/g for road cars is [NOT VERIFIED].
- Current NHTSA star formula and post-2004 risk model were not checked. A 2026 Federal Register notice surfaced but was not read.

## Kinematics & Compliance rig outputs

### Takeaway
K&C is a quasi-static rig that characterises the suspension as a set of slopes (gain per mm or per kN). Most of it lives inside the tuning and is not itself a measure of quality, but it explains why a car has its handling figures.

### Cited Findings
- Kinematic tests: vertical bounce, bounce with pitch, roll (fixed axis, constant axle load), steering geometry. Compliance tests: lateral in-phase and anti-phase, longitudinal braking and acceleration (full, LHS, RHS), single axle acceleration, aligning torque in-phase and anti-phase, bounce at constant lateral or longitudinal load — [Multimatic VDC](https://vdc.multimaticmotorsports.com/kinematics-and-compliance) [V].
- Outputs: motion ratios, wheel rates, roll bar rates, camber gains, caster, friction, roll centres (kinematic and force-based), anti-dive, anti-squat, anti-lift; toe, camber, wheel centre, subframe and rack compliance — same source [V].
- Six string encoders per corner resolve X, Y, Z, steer, camber and spin to 10 microns, with runs of 2–4 minutes — same source [V].
- Bump test with chassis moved vertically and steering locked at straight ahead, about ±100 mm on road cars; roll test similarly, with and without anti-roll bars; lateral test about ±4000 N per tyre (about 0.8 g) — [Multimatic synopsis](https://www.multimatic.com/case-studies/kinematics-compliance-testing-synopsis) [S]; direct fetch returned 404 at this session's URL, so the figures come from the search summary only.
- Manufacturers use K&C data to refine alignment, roll steer and camber compliance and to validate simulations. Altair applies loads at the contact patches — [Altair](https://help.altair.com/hwdesktop/hwx/topics/motionview/kinematics_compliance_event_r.htm) [S].

### Inferences
- K&C translates well into the site's explanatory layer: bump steer, camber gain, roll centre and lateral-force steer can be plotted from a parametric kinematic model, and they are correct insofar as the geometry is correct.
- Compliance items need bush stiffness data, which is rarely public. A simplified site should include these only as assumed inputs.

### Gaps
- No free source gave typical values or reading rules, e.g. bump steer in deg/m, roll steer in deg/deg, lateral-force steer in deg/kN, or the compliance share of the understeer budget (Bundorf). Recollections of these conventions are [NOT VERIFIED]. The Lund thesis [lup.lub.lu.se](https://lup.lub.lu.se/search/files/221377258/MT.pdf) surfaced and was not read, and could be a starting point.

## Subjective evaluation

### Takeaway
SAE J1441 is the named 1–10 scale, and its own scope warns about objective correlation. Magazines combine timed cones with expert judgement, and there is no public formula.

### Cited Findings
- SAE J1441 (current revision August 2024): subjective rating scale for ride and handling. Validity is limited to specific manoeuvres, road, vehicle and environment conditions; it warns about suitability for certain populations or for correlation with objective measures, and points to alternatives in an appendix — [SAE J1441_202408](https://saemobilus.sae.org/standards/j1441_202408-subjective-rating-scale-vehicle-ride-handling) [S].
- Expert ratings on a 1–10 scale were compared with steering-robot objective measures using regression and neural networks. Scale use and repeatability were examined — [Nybacka listing](https://scite.ai/authors/mikael-nybacka-yZw85a?page=3) [S]. A 2021 Windsor thesis found strong objective–subjective correlations for suspension changes in driver-in-the-loop simulation — [Windsor](https://scholar.uwindsor.ca/etd/8866) [S].
- Consumer Reports handling judges agility in routine driving and emergency handling, including the avoidance manoeuvre and a handling course — [CR guide via Yahoo](https://autos.yahoo.com/news/guide-car-ratings-reviews-170000386.html), [How CR tests](https://www.consumerreports.org/cars/cars-driving/how-consumer-reports-tests-cars-auto-test-center-a3516544374/) [S].
- ISO 3888-2 itself describes the test as "subjectively determining" performance — [ISO 3888-2 preview](https://cdn.standards.iteh.ai/samples/57253/5e8cdcc7c2fe4c0c8fe6f1de8beb5dba/ISO-3888-2-2011.pdf) [V].

### Inferences
- A site's plain-language verdict can follow the journalists' framing ("floaty, jittery, composed") but should be derived from the computed metrics and shown with the numbers, as the engine designer does.

### Gaps
- [NOT VERIFIED] J1441 scale anchors (1 unacceptable … 10 excellent). Full text is paywalled.
- CR's ride rating method and scale: nothing found.
- ADAC's method: nothing found.
- [NOT VERIFIED] An "ISO" 1–10 rating scale: I found no such ISO scale. The request's "ISO/SAE 1-10" may refer to SAE J1441 only.
- Teknikens Värld's own pages were not found; figures above are secondary.

## Small metric set, misleading metrics, composite scores

### Takeaway
Recommended: eight metrics, four of them forming the road-input triangle plus the bump, and four covering body control and handling. I found no composite score with scientific backing. Show a triangle of trade-offs rather than a single rating.

### Cited Findings
- The triangle's three indices are the established academic framing — [Ahmadian & Blanchard](https://ro.uow.edu.au/engpapers/573) [S], [UTS paper](https://opus.cloud1.lib.uts.edu.au/bitstream/10453/11058/1/2009003178OK.pdf) [S], and Hedrick & Butsuen's result on the three transfer functions — [TRID](https://trid.trb.org/View/359313) [V].
- A recent paper picks the same trio of comfort (ISO 2631), contact-force variability and settling time for passive damper optimisation — [arXiv 2605.05235](https://arxiv.org/abs/2605.05235) [V].
- LQ cost J = weighted sum of ride, handling and stroke terms is the classic scalarisation, and the weights are chosen by the designer rather than derived — [Cvok et al.](https://www.bib.irb.hr/1025479) [S].
- Skidpad "almost completely removes the driver" and reveals grip, and forum commenters warn against over-reliance on skidpad and slalom numbers — [forum thread](https://maxima.org/forums/autocrossing-road-course-racing/126962-how-you-judge-handling-slalom-skidpad-track.html) [S, opinion].

### Inferences
**Recommended metrics** (feasibility is my judgement based on the sections above):

| # | Metric (plain name) | Definition | Scenario | Good is | Honest from a simple model? |
|---|---|---|---|---|---|
| 1 | Comfort ("як трясе") | a_w: Wk-weighted RMS body vertical acceleration | Rough road, ISO 8608 class B/C at chosen speed | Lower; ISO bands as a guide only | Yes for comparison; absolute value needs seat and enveloping calibration |
| 2 | Road holding ("контакт шини") | Tyre force CoV: σ(Fz)/Fz_static; plus % of time below e.g. 50% static or lift-off | Same road | Lower | Yes, the most direct result of the quarter car |
| 3 | Travel budget | RMS travel and hits on bump stop, or margin against available travel | Same road and hump | Margin remains | Yes |
| 4 | Bump response | Peak body g, tyre lift-off, time to settle | Hump or pothole | Low peak and fast settling; these conflict | Yes for trend; tyre enveloping is needed for sharp edges |
| 5 | Roll | Roll gradient deg/g, and roll at 0.5 g | Steady-state circle | Depends on the class; low is sporty | Yes, nearly exact |
| 6 | Balance | Understeer gradient deg/g and front/rear load transfer split | Steady-state circle | Small positive; speed-stable; no oversteer at limit | Yes, if K comes from load transfer and tyre load sensitivity. Needs a tyre model |
| 7 | Response | Yaw gain, response time and overshoot, ISO 7401-style step at 100 km/h | Step steer | Short time, low overshoot | Medium: bicycle model with roll and tyre lag. Open-loop, so no driver model |
| 8 | Dive and braking balance | Pitch deg under 1 g, stopping distance on flat and rough road | Straight-line braking | Low dive, stable distance | Dive: yes. Distance: only with tyre and ABS model, and shown as small effect |

**Optional, as scenario rather than score:** lane-change or moose-style maximum speed. It is what people recognise, but it needs a driver model and is sensitive to ESC. Report it relative to a reference car in the same simulation. Maximum lateral g can be shown on the skidpad as a bound, but it is dominated by tyres. Suspension's honest effect is the loss through load transfer and camber.

**Misleading if presented alone:**
- Maximum lateral g, slalom speed: mostly tyres.
- Sine with dwell: mostly ESC. Moose speed: driver, tyres, load, ESC.
- SSF: geometry and CG, with no suspension content.
- EUSAMA %: friction-sensitive and tested at low damper velocity.
- Ride frequency or spring rate alone: an input, not an outcome.
- Unweighted RMS: my sweep shows a different optimum than Wk.
- ISO 2631 absolute labels from a seatless quarter-car.
- A single bump peak: hides settling and the trade-off.
- IRI: rates the road, not the car.
- Stopping distance on a smooth road as a suspension score.

**Composite score:** I found no scientifically backed composite for consumer use. The LQ cost is the nearest formalism, and it has arbitrary weights. For a non-engineer, the honest display is the triangle (comfort, road holding, travel) as a moving point, with a verdict in words and a measured consequence. This also fits the existing "no control is dead" test: spring, damper and unsprung mass all move the triangle on a road input, while bars, roll centre and track move 5 and 6.

### Gaps
- No user study was found on which suspension metrics non-engineers understand. The selection is my judgement.
- The 50% tyre-load threshold in row 2 and any bottoming margin are my suggestions, not standards.
- I did not compute spring-rate or unsprung-mass sweeps. The claim that they move the triangle follows from the Mason notes and the model structure, not from a run. It should be confirmed before relying on it as a test expectation.
