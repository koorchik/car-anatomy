# Wheel alignment (camber, toe, caster) by suspension type: the measured evidence

How to read these notes. Every cited claim carries two tags.

Verification:
- **[READ]** I opened the page or PDF and read the content myself (or the fetch tool extracted it from the page).
- **[EXCERPT]** Seen only through the search tool's digest of the page. The page itself was not opened, usually because it returned HTTP 403. Wording is close to the source, but the context is unchecked and a digest does not always map a sentence to the exact URL. Check before quoting on the site.
- **NOT VERIFIED** Claim circulates, no primary source found. These sit in the Gaps sections or are flagged explicitly.

Evidence grade: **A** controlled measurement. **B** instrumented or stopwatch magazine test with limited control. **C** statement by a manufacturer or engineer, or a schematic with no data. **D** vendor marketing, forum, anecdote.

**CALC** marks my own arithmetic. It is not evidence, and its assumptions are stated.

Attribution caveat for [EXCERPT] items: where one search digest summarised several pages at once, the URL given is my best match. This applies most to the caster sentences, the suspension type statements (swing-arm length, solid axle), the MINI temperature spread (it may come from [GRM's MINI project page](https://grassrootsmotorsports.com/project-cars/2002-mini-cooper-s/minis-track) rather than "Tilt!"), and the three ND Miata items, which may sit on different pages of that project. Confirm the page before citing.

Overall honesty note: this search found very little grade A evidence for passenger cars. Much of what is "known" about alignment is sound physics plus repetition. Lack of a source here means "not found in this search", not "does not exist". SAE and Tire Science and Technology full texts were not accessible, and neither were Milliken, Gillespie, or Haney's book.

Exclusion: GTPlanet is a Gran Turismo community. Its "camber testing" threads, including the one reporting no detectable braking effect from 0 to 2° of camber ([thread](https://www.gtplanet.net/forum/threads/camber-testing-results-attached.128086/post-3886518)), appear to be video game tests. I did not open them. The same applies to the iRacing and rFactor material. None of it counts as evidence about real cars.

## Measured effect of static camber on grip, lap time, braking, wear and rolling resistance

### Takeaway
Physics and racing practice agree that moderate negative camber adds cornering grip, and that loss of contact patch under braking sets the upper limit. I found one quantified lap time result that isolates camber on a street car (about 1 s per lap, from a magazine, seen only as an excerpt). I found no controlled passenger car numbers for grip percentage, braking distance, shoulder wear, or rolling resistance.

### Cited Findings
Peak lateral grip:
- Camber thrust adds lateral force even at zero slip angle, "free grip, no extra heating", and peak force arrives at a slightly smaller slip angle, so induced drag is lower. The accompanying curve is a schematic for a race tyre, with no readable data. Grade C, [READ] — [Paul Haney, Tire Behavior webinar slides, 2015](https://speedsecrets.com/wp-content/uploads/2015/03/Tire-Webinar-Slides-Part-3.pdf)
- "Wider tires [are] more affected by camber changes." Grade C, [READ] — [Haney slides](https://speedsecrets.com/wp-content/uploads/2015/03/Tire-Webinar-Slides-Part-3.pdf)
- A forum poster's MATLAB work with Tire Test Consortium formulas peaked at about -3.3° of camber. In the thread Claude Rouelle asks which tyre, rim and pressure that figure came from, which shows the optimum is specific to a tyre. It is an FSAE tyre, not a road tyre. Grade D, [EXCERPT] — [FSAE forum](https://www.fsae.com/forums/archive/index.php/t-10979.html)
- A forum discussion describes the trade-off: negative camber raises the force curve at low slip but can reduce peak force, and too much leaves the peak below the zero-camber value. Grade D, [EXCERPT] — [SCCA Super Touring forum](https://sccasupertouring.com/threads/optimum-amount-of-camber.17870)

Lap time:
- A 2007 Grassroots Motorsports MINI test (MacPherson strut, stopwatch and pyrometer): the four-lap average fell by "nearly a full second" at -2°. The team ended up at about -3° and said that a strut car needs this for track use. Grade B, single car, full controls unread, [EXCERPT] — [GRM, "Tilt!"](https://grassrootsmotorsports.com/articles/tilt-how-get-faster-lap-times-adding-negative-camb)
- Before and after pyrometer results on a MINI session: a spread of more than 40 degrees across the tread narrowed to 13 degrees between inside and middle. Units are not stated in the excerpt, presumably °F. It is unclear whether the session changed only camber. Grade B, [EXCERPT] — [GRM article](https://grassrootsmotorsports.com/articles/tilt-how-get-faster-lap-times-adding-negative-camb)

Braking:
- "CP area loss in front tire during braking is the usual upper limit" on camber. Grade C, [READ] — [Haney slides](https://speedsecrets.com/wp-content/uploads/2015/03/Tire-Webinar-Slides-Part-3.pdf)
- At -2° the GRM team noted more ABS chatter and suspected the smaller contact patch. They did not measure distance. Grade B, qualitative, [EXCERPT] — [GRM, "Tilt!"](https://grassrootsmotorsports.com/articles/tilt-how-get-faster-lap-times-adding-negative-camb)
- Contradiction: a guest writer calls the braking penalty a "myth" and reports that the best braking g traces on a 2024 Mustang Dark Horse came with the most front negative camber. No published data or control seen. Grade D, [EXCERPT] — [Classic Motorsports forum](https://classicmotorsports.com/forum/grm/how-adding-negative-camber-can/271096/page1/)

Tyre wear:
- Tire Rack says too much negative camber wears the inner edges, and that camber and toe matter most for wear while caster has "little influence". No numbers. Grade C, [EXCERPT] — [Tire Rack winter tyre guide](https://www.tirerack.com/tires/tiretech/techpage.jsp?techid=121)
- Contradiction: the same guest writer claims that big camber does not cause adverse wear and that most premature street car wear is toe-out. Unverified, tuner opinion. Grade D, [EXCERPT] — [Classic Motorsports forum](https://classicmotorsports.com/forum/grm/how-adding-negative-camber-can/271096/page1/)
- Three identical tyres were tested at Calspan TIRF (new, half evenly worn, camber-worn): "camber wear can actually improved certain tire performance characteristics under dry weather conditions." The abstract gives no numbers. This is the closest thing to a controlled result on camber-worn tyres. Grade A, abstract only, [READ] — [SAE 2010-01-0766](https://saemobilus.sae.org/papers/force-moment-characteristics-a-low-aspect-ratio-asymmetrically-worn-passenger-car-tire-2010-01-0766)
- On an indoor drum, truck and bus radials lost durability hours as camber increased, with failure at the shoulder. That measures structural durability, not wear rate, and not on passenger tyres. Grade A, [EXCERPT] — [SAE 2024-26-0358](https://saemobilus.sae.org/papers/a-novel-method-evaluation-tire-structural-durability-performance-2024-26-0358)

### Inferences
- The honest statement is "negative camber adds grip up to a tyre-specific limit", not a number such as "1° gives X% grip". Any percentage in the model should be labelled as illustrative.
- The two braking claims can both be true. On a car that keeps the tyre flat in pitch, or with stiff race tyres, a moderate camber penalty may be undetectable. Neither source settles it.

### Gaps
- No measured percentage for peak lateral force against camber on a passenger tyre. The most promising thesis returned 403: [Popat, UNC Charlotte](https://ninercommons.charlotte.edu/record/425/files/Popat_uncc_0694N_11013.pdf).
- No measured braking distance against camber for a real car.
- No measured shoulder wear rate (mm per 1000 km against camber) from any source.
- No measured rolling resistance against camber. Only theory and forum remarks were found.

## Measured effect of toe on wear, rolling resistance and fuel, turn-in, stability and tramlining

### Takeaway
The "1 mm of toe costs X% fuel" claim has no primary source that I could find. The drag from toe grows with the square of the angle, so a fixed percentage per millimetre cannot be right. Small errors cost almost nothing in fuel, and the measured large penalties come from very large angles or from unspecified misalignment. The wear claim is far better founded than the fuel claim, although the famous "feet per mile" figure is geometry, not a measurement.

### Cited Findings
Scrub:
- "If the toe setting is just 1/16-inch off of its appropriate setting, each tire on that axle will scrub almost seven feet sideways every mile." Grade C, geometry not measurement, [EXCERPT] — [Tire Rack](https://www.tirerack.com/upgrade-garage/what-are-the-different-alignment-settings)
- Conflict: 1/8 in equals about 14 ft per mile per [Bimmertips](https://bimmertips.com/understanding-toe-alignment-geometry/), but about 28 ft per mile per [AA1Car](https://www.aa1car.com/library/wheel_alignment.htm). Both [EXCERPT].
- A truck trade article works an example: 0.10 in (0.06°) of drive axle misalignment over 125,000 miles per year equals about 100 miles dragged sideways. Illustrative, by an author at a truck service chain. Grade D, [READ] — [Fleet Maintenance](https://www.fleetmaintenance.com/in-the-bay/tools/article/10329336/adding-to-your-bottom-line)

Rolling resistance and fuel, in order of evidence quality:
- Volvo and Michelin test at Hällered, 2010: two identical 40 t Volvo FH 4x2 rigs, one as reference, just over 1,000 km across all cycles, one hour of warm-up, with an SP (Technical Research Institute of Sweden) observer checking protocol and calibration. Adjusting alignment could cut fuel use by "up to 2.5%", against up to 11% for tyre choice and about 1% for pressure. **The misaligned settings are not stated ("various")**, so no per-mm figure can be derived. Best real measurement found. Grade A-/B, press release from interested parties, [READ] — [Volvo Group](https://www.volvogroup.com/en/news-and-media/news/2010/sep/news-87944.html)
- EPA report by Yurko, 1978 (LDTP-78-12, 13 pp): analysed toe-in and toe-out against rolling resistance using EPA road-load results and slip-angle literature, plus safety inspection data on how many vehicles are misaligned. This is the key primary source for passenger cars. **I could not read its numbers**: the abstract has none, and the [full PDF](https://permanent.fdlp.gov/gpo128946/ZyPDF.pdf) returned 403. [READ, abstract only] — [TRID record](https://trid.trb.org/View/78063)
- A 2022 conference paper summarises Yurko as finding that small toe-in changes between 0° and 0.5° cause only a very small rolling resistance increase. Second-hand. [EXCERPT] — [ICMIEE22-184](https://cse.kuet.ac.bd/icmiee2022/pdf_files/paper/ICMIEE22-184.pdf)
- The same paper, on a Toyota Echo: fuel consumption rose by up to 38.22% at 2.53° of front-left toe-in. Single vehicle, conference paper, and a huge angle (about 29 mm on that wheel across a 650 mm tyre). Grade B-, site unreachable, [EXCERPT] — [ICMIEE22-184](https://cse.kuet.ac.bd/icmiee2022/pdf_files/paper/ICMIEE22-184.pdf)
- Rolling resistance rose about 128.86% as front toe-in went from 0.00° to 4.20° on a light vehicle. Method unconfirmed, page returned 403. [EXCERPT] — [Journal of Engineering, 2024, via DOAJ](https://doaj.org/article/1289c45533394e14ae558b55b469a090)
- Semi-trailer modelling paper: axle misalignment of 0.57° gave +12% rolling resistance coefficient, 1.25° gave +17.8%, 2.11° gave +26.2%. Modelling, and the digest described it that way. [EXCERPT] — [EEJET](https://journals.uran.ua/eejet/article/view/115019)
- "A vehicle that is out of alignment at each tire position can lose more than 2% in fuel economy." Said by a tyre data company executive. No method. Grade D, [READ] — [FleetOwner](https://www.fleetowner.com/refrigerated-transporter/refrigerated-vehicles-equipment/article/21223761/trailer-alignment-impacts-fuel-economy)
- Vendor figures with no cited test, such as 25% tyre life loss from 0.3° of toe and 3-5% fuel loss. Treat as NOT VERIFIED. Grade D, [EXCERPT] — [OxMaint](https://oxmaint.com/industries/fleet-management/alignment-suspension-tire-wear-fleet-guide-2026)
- Consumer sites quote 1-2% typical and up to 10% severe with no source. NOT VERIFIED. [EXCERPT] — [OK.com](https://us.ok.com/ask/will-an-alignment-improve-gas-mileage/)

Mechanism:
- Induced drag "gets bigger with slip angle and lateral force". Grade C, [READ] — [Haney slides](https://speedsecrets.com/wp-content/uploads/2015/03/Tire-Webinar-Slides-Part-3.pdf)
- At a 1° slip angle most of the contact patch still grips, and sliding appears at the trailing part and grows with slip angle. Schematic. Grade C, [READ] — [Haney slides](https://speedsecrets.com/wp-content/uploads/2015/03/Tire-Webinar-Slides-Part-3.pdf)

Turn-in, stability, tramlining:
- Track-focused advice mostly favours zero or slight front toe-out, and forum posters commonly suggest 1/16 in total. Grade D, [EXCERPT] — [GRM forum](https://grassrootsmotorsports.com/forum/grm/miata-alignment-question/99825/page1/)
- Nothing measured was found. Tire Rack has a [tramlining page](https://www.tirerack.com/upgrade-garage/what-causes-tramlining), but it returned 403, so its content is unknown.

### Inferences
CALC: scrub geometry. Assumes total toe measured across a tyre of diameter D, split evenly.
- 1 mm total toe across 650 mm is 0.77 m/km per wheel (0.044° per wheel). That answers "scrub per km per mm of toe": about **770 mm per km per wheel for each 1 mm of total toe**, as an upper geometric bound.
- 1/16 in total across 600 mm gives 6.99 ft per mile per tyre, which reproduces Tire Rack's figure. 1/8 in gives 14 ft per tyre. AA1Car's 28 ft is then most likely the axle sum, not an error.
- The figure is often read as tyres being dragged 7 feet. It is the lateral distance the slip angle implies. At such a small angle, most of it is taken up by elastic tread shear, and only a part is actual sliding. That makes it a bound, not a measured sliding distance.

CALC: rolling drag against toe. Assumes a cornering stiffness of 1000 N/° (my round number, not sourced), 4 kN load per tyre, Crr 0.01 (40 N). Drag = Cα·α².

| Total toe on one axle | Per wheel | Drag per wheel | Share of that wheel's rolling resistance | Share of the whole car's rolling resistance |
|---|---|---|---|---|
| 1 mm | 0.044° | 0.03 N | 0.08% | 0.04% |
| 2 mm | 0.088° | 0.14 N | 0.34% | 0.17% |
| 5 mm | 0.22° | 0.85 N | 2.1% | 1.1% |
| 10 mm | 0.44° | 3.4 N | 8.5% | 4.2% |

- Rolling resistance is only part of road load, so the fuel effect is smaller again.
- Cross-check: at 2.53° on one wheel the same formula gives about 112 N, the same order as a large road-load increase, so the Echo's 38% is not absurd. It says nothing about a 2 mm error, though.
- The real lesson: doubling toe quadruples the drag. A static "per mm" percentage is a marketing shape, not physics. The model should draw a parabola.
- The Volvo 2.5% cannot be converted to cars. Trucks have more axles, higher loads and unspecified settings, and it is an "up to" figure.
- Wear is probably the correct headline for toe, fuel is not. This matches the qualitative agreement of sources on wear but remains unquantified.

### Gaps
- **"1 mm of toe costs X% fuel": NOT VERIFIED, no primary source found.** Yurko 1978 is the place to look, and someone with access should read it.
- No measured wear rate against toe for a passenger car.
- No measured turn-in or yaw response against toe. No measured tramlining data. No front against rear toe-out test on a real car.
- The Tire Review article cited for "2.2%" returned 403, and its figure was seen only through a [Kal Tire sheet](https://commercial-assets.kaltire.com/files/uploads/2025/08/01101109/Heavy-Duty-Alignment.pdf).

## Effect of caster on steering effort, self-centring, dynamic camber and high-speed stability

### Takeaway
Caster mechanisms are textbook geometry and can be calculated reliably. I found no measured tests of effect size. Its main benefit for grip is that it adds negative camber to the outside wheel on steering lock, and that scales with steering angle.

### Cited Findings
- More rake gives more mechanical trail and more self-aligning torque, so "the driver must work harder". Grade C, [EXCERPT] — [The Contact Patch](https://the-contact-patch.com/book/road/c1405-front-wheel-set-up)
- Total aligning torque is lateral force times the sum of mechanical and pneumatic trail. Grade C, [EXCERPT] — [Wikipedia, Self aligning torque](https://en.wikipedia.org/wiki/Self_aligning_torque)
- At peak cornering force the self-aligning torque falls towards zero and the steering goes slack. This is how a driver feels the limit. Grade C, [EXCERPT] — [The Contact Patch](https://the-contact-patch.com/book/road/c1405-front-wheel-set-up)
- The main drawback of caster, higher steering effort, "is not an issue" with power steering. Grade C, [EXCERPT] — [Suspension Secrets](https://suspensionsecrets.co.uk/caster)
- Caster changes wheel camber during steering. Grade C, [EXCERPT] — [Suspension Secrets](https://suspensionsecrets.co.uk/caster)
- Practical use: a GRM ND Miata maximised static camber, then added as much caster as possible without losing camber, reaching about -1.8° camber and 5° caster. Unmeasured for caster alone. Grade B-, [EXCERPT] — [GRM, Project Triple Threat](https://grassrootsmotorsports.com/project-cars/2019-nd-mx-5/maximizing-nd-chassis-miata-street-autocross-and-t)
- Caster has "little influence" on tyre wear. Grade C, [EXCERPT] — [Tire Rack](https://www.tirerack.com/tires/tiretech/techpage.jsp?techid=121)

### Inferences
CALC: geometry. Ignores wheel offset, assumes 320 mm radius.
- Mechanical trail is about R·tan(caster): 5° gives 28 mm, 7° gives 39 mm.
- Outer wheel camber from caster on lock is about atan(sin(steer)·tan(caster)): 5° caster at 20° steer gives 1.7°, 7° gives 2.4°. At 2° of steer, typical of a fast corner, it gives only 0.17 to 0.25°.
- KPI works against this on both wheels: 13° KPI at 20° steer adds about +0.8°. Net at 5° caster is roughly -0.9° on the outer wheel.
- So caster camber matters in tight corners and autocross, and is minor in fast sweepers. That contradicts the common advice to treat it as a general grip gain.
- High-speed stability from trail is the accepted mechanism, but I have no measurement. Do not put a number on it.

### Gaps
- No measured steering torque against caster for a production car.
- No measured straight-line stability against caster.
- No source for a typical caster side-to-side tolerance and its link to pull. Tire Rack gives only the general tolerance covered in the next section.

## Why alignment tolerances are what they are, how factory specs are chosen, and what fleet studies show

### Takeaway
I could not find an authoritative source on how carmakers choose specs. The compliance explanation is plausible and has one supporting manufacturer statement, but forum explanations disagree on the sign for FWD. Fleet figures widely repeat "TMC: 30% tyre life, 2% fuel", but I traced that only as far as a trade article. The only physically measured fuel test is Volvo's "up to 2.5%".

### Cited Findings
Tolerances:
- Manufacturers publish preferred, minimum and maximum angles, and the range for camber and caster typically stays within about ±1° of preferred. Tire Rack recommends aiming for the preferred value. Grade C, [EXCERPT] — [Tire Rack](https://www.tirerack.com/upgrade-garage/what-are-the-different-alignment-settings)

Compliance and toe-in:
- Volvo gives the example of correct truck toe as 1 mm of toe-in on both wheels, with the wheels spreading outwards at about 80 km/h until parallel. A manufacturer statement of the compliance idea, for a truck. Grade C, [READ] — [Volvo Group](https://www.volvogroup.com/en/news-and-media/news/2010/sep/news-87944.html)
- Forum explanations of FWD and RWD specs conflict. One says tractive force pulls the arms forward and causes toe-out, another that driven wheels toe in under power so FWD uses a bit of toe-out. Typical FWD is quoted at 0.00 to 0.15° toe-in. Grade D, [EXCERPT] — [BITOG](https://bobistheoilguy.com/forums/threads/macpherson-strut-alignment-relationships.176241/), [EcoModder](https://ecomodder.com/forum/138808-post17.html), [Fiat Forum](https://www.fiatforum.com/threads/tracking-settings.163991/)

Fleet studies:
- Scheduled alignment programmes: average +30% tyre mileage and +2% fuel economy, attributed to TMC materials. The same article says over 70% of heavy trucks have misaligned tandem axles, an unsourced estimate. The author is at a chain selling truck service. Grade D for the attribution, [READ] — [Fleet Maintenance](https://www.fleetmaintenance.com/in-the-bay/tools/article/10329336/adding-to-your-bottom-line)
- 100 truck fleet: tyre cost 0.79 cents per mile with correct rear axle alignment against 1.8 cents misaligned, and about 0.3 mpg gained. Teaching page citing a 1991 Fleet Equipment article. Grade D, [EXCERPT] — [Louisiana DNR](https://www.dnr.louisiana.gov/assets/tad/education/ecep/diesel/g/g.htm)
- Goodyear technical manager: feel-able sharp edges usually point to toe wear, and scrub adds rolling resistance. Qualitative. Grade C, [EXCERPT] — [Overdrive](https://www.overdriveonline.com/business/article/14872103/staying-straight)

### Inferences
- A toe-in spec that exists mainly to end up near zero under load fits the Volvo statement. That is why static toe on the alignment rack is not necessarily the running toe. The model should show static toe and running toe separately if it shows this at all.
- The 0.79 and 1.8 cents figures are confounded: a fleet that aligns axles is likely to manage tyres better overall. Fleet comparisons of this kind are not controlled.
- Heavy trucks have much more to gain than cars, because of mileage, tyre cost and rear axles that are not set by a shop as a routine. Numbers should not be transferred to cars.

### Gaps
- The TMC primary document was not found. **"TMC 30% / 2%" is NOT VERIFIED beyond the trade article.**
- Nothing relevant from NREL, Bridgestone, or Continental in this search. Michelin appears only as Volvo's partner and in a track tyre guide.
- Gillespie and Milliken on specs and compliance were not accessible. The FWD/RWD explanation therefore stays unverified, and the sign of the effect should not be stated confidently on the site.

## How the benefit of static camber depends on suspension type, and which types can be adjusted

### Takeaway
Qualitatively well supported: a strut loses camber in roll, so it depends most on static camber, a double wishbone can gain camber kinematically, a twist beam changes camber only with relative wheel motion, and a solid axle holds wheels square to the road in pure body roll. I found no measured figures (degrees of camber per degree of roll) for any type. These should come from kinematics and compliance data, which this search did not locate.

### Cited Findings
MacPherson strut:
- "Three degrees sounds like a lot, but for a MacPherson strut car like the MINI, that's what track use required." Grade B-, [EXCERPT] — [GRM, "Tilt!"](https://grassrootsmotorsports.com/articles/tilt-how-get-faster-lap-times-adding-negative-camb)
- A strut provides negative camber gain only at the beginning of jounce, while a double wishbone keeps gaining up to full jounce. Grade C, Wikipedia mirror, [EXCERPT] — [Double wishbone text](https://strikeengine.com/double-wishbone-suspension-information-from-wikipedia/)
- A strut loses more negative camber in cornering than a double wishbone at any ride height. Grade D, [EXCERPT] — [Rennlist](https://rennlist.com/forums/944-turbo-and-turbo-s-forum/1110388-explanation-of-camber-change-under-load-on-a-lowered-car.html)

Double wishbone and multilink:
- Upper arm length and angle mainly set camber gain, and gain is inversely proportional to effective swing-arm length. Grade C-D, [EXCERPT] — [Rennlist](https://rennlist.com/forums/944-turbo-and-turbo-s-forum/1110388-explanation-of-camber-change-under-load-on-a-lowered-car.html), [Eng-Tips](https://eng-tips.com/threads/mcpherson.207159)
- Trade-off: "excess camber gain with roll or suspension travel can cause tire shoulder overload". Grade C, [READ] — [Haney slides](https://speedsecrets.com/wp-content/uploads/2015/03/Tire-Webinar-Slides-Part-3.pdf)

Twist beam:
- "The camber and toe changes are the result of one wheel being compressed relative to the other", and "the closer the cross beam to the axle stubs, the more the camber and toe change under deflection." If both wheels compress together, camber stays the same. Grade C, [READ] — [Wikipedia, Twist-beam](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)
- "Alignment geometry is factory-set and not generally adjustable." Grade C, [READ] — [Wikipedia, Twist-beam](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)
- Deviation from spec may mean a bent axle or damaged mountings. Patented adjusters exist, using threaded bushes between spindle and bracket. Grade C, [EXCERPT] — [Patent US7334805](https://patents.google.com/patent/US7334805)

Solid axle:
- The camber of the two wheels is linked and static camber is set by the axle housing. Grade C-D, [EXCERPT] — [ATE Up With Motor](https://ateupwithmotor.com/terms-technology/macpherson-strut/2/)
- Conflict: one source in the digest says a beam axle "forces the wheels to lose camber as the body leans". That disagrees with the brief's premise and with basic geometry. See Inferences. Grade D, [EXCERPT], [same source set](https://ateupwithmotor.com/terms-technology/macpherson-strut/2/)

Adjustment:
- Bolt-in camber correction exists as a product category, including Whiteline, SPC and Eibach kits. Product pages, Grade D, [EXCERPT] — [Tire Rack alignment products](https://www.tirerack.com/suspension/category.jsp?category=Alignment)
- Most street cars have very little negative camber, often about -1° at best. Adding camber on a front-steer car increases toe-out, so toe must be rechecked. Grade C, [EXCERPT] — [GRM, 2024](https://grassrootsmotorsports.com/articles/how-to-go-faster-by-adding-negative-camber)

### Inferences
- Geometry, not sourced: in pure body roll, a solid axle stays square to the road, apart from tyre deflection, and neither gains nor loses camber relative to the road. When one wheel hits a bump, the whole axle tilts and both wheels change camber. So "no camber change in roll" is correct and "static adjustment is impossible" is too absolute for racing, but correct for ordinary production cars.
- A wheel fixed rigidly to a rolling body would lose 1° of camber for each degree of roll. How much a suspension recovers of that is the number that determines how much static camber it needs. This is the variable for the model. Its values by type must come from data, not from this file.
- Static camber is a workaround for poor camber recovery. So a strut benefits most, a good double wishbone needs less, and a solid axle has no roll loss to offset. This ordering fits the sources but has not been shown by a comparative test.
- In a twist beam the roll behaviour resembles a trailing arm or a solid axle depending on beam position, and the Wikipedia sentence implies this. The strength of the effect is not quantified.

### Gaps
- No measured camber gain per degree of roll for any type. Also no comparative test of static camber across types on one platform.
- No authoritative table of which architectures have which factory adjustments. The following are from my general knowledge and are **NOT VERIFIED** here: eccentric bolts on lower arms or struts, shims on upper arms, camber plates at strut tops, and tie rods for toe on nearly all cars. Check per car in service manuals.
- Multilink has no specific evidence in this search.

## Real comparisons: stock against track alignment on the same car

### Takeaway
I did not find a well-controlled stock against track comparison for a Miata, E46, E36, Civic, Golf GTI or GT3. Available evidence is magazine project cars, where alignment usually changes with other parts. The MINI test is the only quantified result I found that is attributed to camber.

### Cited Findings

| Car | Change | Result | Control | Grade | Status | Source |
|---|---|---|---|---|---|---|
| MINI (strut) | Added negative camber: -2° measured, about -3° named as what track use required | Four-lap average "nearly a full second" faster at -2°, tread spread narrowed, more ABS chatter | Same track and stopwatch. Rest unread | B | [EXCERPT] | [GRM, "Tilt!", 2007](https://grassrootsmotorsports.com/articles/tilt-how-get-faster-lap-times-adding-negative-camb) |
| ND Miata (wishbone) | Factory to maximum front negative camber, rear matched to front | "Whole seconds" on the test track, not quantified | Paddock change, conditions unknown | B- | [EXCERPT] | [GRM, Project Triple Threat](https://grassrootsmotorsports.com/project-cars/2019-nd-mx-5/maximizing-nd-chassis-miata-street-autocross-and-t) |
| ND Miata | About -1.8° camber, 5° caster, with other changes | About 0.7 s at Harris Hill | **Combined changes, not attributable to alignment** | C | [EXCERPT] | [GRM, Time Trials update](https://grassrootsmotorsports.com/project-cars/2019-nd-mx-5/moving-autocross-time-trials-project-triple-threat) |
| 2024 Mustang Dark Horse | More front negative camber | Best braking g traces at most camber | Guest post, no data shown | D | [EXCERPT] | [Classic Motorsports forum](https://classicmotorsports.com/forum/grm/how-adding-negative-camber-can/271096/page1/) |

Track targets, not tests:
- Michelin's Pilot Sport Cup guide lists typical road course camber targets of about -1.5 to -3.0°. Grade C, [EXCERPT] — [Michelin Care and Feeding](https://www.tirerack.com/images/pdf/Michelin_Care_and_Feeding.pdf)
- An Italian forum post claims best lap times with front camber up to 4° more negative than the rear, and warns that on a stock Miata this makes the car loose. Grade D, [EXCERPT] — [MX-5 Italia](https://mx5italia.com/forum/thread-716.html)

### Inferences
- A second per lap fits a car that starts with too little camber for its strut geometry. It does not generalise to a car with good geometry, and magnitude depends on lap length, which the excerpt does not fully give.
- Stopwatch tests with one driver and no temperature control typically carry errors of a few tenths, so a full second is plausibly real, while differences of a tenth would not be. This is my judgement, not a sourced figure.

### Gaps
- Nothing found for E46, E36, Civic, Golf GTI, or GT3. No skidpad g comparison with camber as the only change. No published tyre temperature table with control.
- [Mazda Motorsports Engineering Tip 4](https://www.mazdamotorsports.com/2020/03/31/alignment-secrets-and-tricks/) looks useful, but the site refused the connection. Grassroots articles returned 403, so someone should read them in a browser to confirm the numbers above.
- A Tire Rack test crew reportedly fitted Whiteline bolts for -2.0° front camber to protect outer shoulders during tests. It is a fixed setup, not a comparison, and I could not tie the excerpt to a specific URL.

## Extreme cases and myths

### Takeaway
The one hard number here comes from Pirelli and the FIA: F1 camber is capped at about -3° at the front, and the cap is enforced. I could not substantiate a figure of -6° and found no tests of stance camber, drag camber, or toe against top speed.

### Cited Findings
F1:
- 2026 Miami Grand Prix prescription from Pirelli, under F1 Sporting Regulations Article B6.13 a): camber limit on slicks -3.00° front and -1.75° rear, and on intermediates and wets -3.25° front and -2.25° rear. Grade A as a rule document, [READ, table read directly from the PDF] — [FIA document 46](https://www.fia.com/system/files/decision-document/2026_miami_grand_prix_-_competition_notes_-_pirelli_preview_v2.pdf)
- "EOS Camber" (end-of-straight), starting pressures, cold pressures and reheat pressures are subject to FIA checks. [READ] — [same document](https://www.fia.com/system/files/decision-document/2026_miami_grand_prix_-_competition_notes_-_pirelli_preview_v2.pdf)
- Limits vary by event. Belgium front limits were -2.75° and -3°, Barcelona -3.00°. [EXCERPT] — [Belgium 2026](https://www.fia.com/system/files/decision-document/2026_belgian_grand_prix_-_competition_notes_-_pirelli_preview.pdf), [Barcelona 2026](https://www.fia.com/system/files/decision-document/2026_barcelona-catalunya_grand_prix_-_competition_notes_-_pirelli_preview_v2.pdf)
- Pirelli's technical chief says starting parameters, including pressure and end-of-straight camber, are the only things it can directly control. [EXCERPT] — [The Race](https://the-race.com/formula-1/how-f1-teams-surprised-pirelli-with-legal-tyre-workarounds)

Extreme negative camber:
- Enthusiast articles say extreme camber never flattens the tyre even in hard cornering, leaving a small patch on the inner edge. No measurements. Grade D, [EXCERPT] — [Car Throttle](https://www.carthrottle.com/news/ins-and-outs-camber?page=1), [Carlist](https://www.carlist.my/news/what-is-camber-and-can-you-have-too-much-of-it/81704/)

Myth status:

| Claim | Status |
|---|---|
| "1 mm of toe costs X% fuel" | **NOT VERIFIED.** No primary source. Wrong in form, because drag is quadratic |
| "1/16 in toe scrubs 7 ft per mile" | Geometrically correct, but it is a bound and not measured sliding |
| "TMC: 30% tyre life, 2% fuel" | Attribution only, primary document not found |
| "Camber does not hurt braking" | Disputed. Single unsupported tuner claim against Haney's stated upper limit and GRM's ABS note |
| "Camber does not wear tyres" | Disputed, and against Tire Rack. No measurements on either side |
| "Racing cars run -3° to -6°" | F1 limit of about -3.25° and Michelin -1.5 to -3° found. **-6° NOT VERIFIED** |
| "Stance camber gives grip" | No test found. Physics and Haney's limits point against it |
| "Drag cars run zero camber" | NOT VERIFIED by any source here, though consistent with Haney's contact patch argument |
| "Toe affects top speed" | No test found. Negligible by my estimate below |

### Inferences
- The F1 limit is telling: teams want more camber than the tyre maker allows, and the rule exists at all because more camber brings lap time and costs tyre integrity. That reading of the motive is my inference, and the document itself gives no reason.
- CALC: toe and top speed. Assumes 1000 N/°, 5 mm total toe on one axle, giving 1.7 N. CdA 0.7 at 250 km/h gives about 2025 N of aero drag. Toe adds about 0.08% to force, or about 0.03% to top speed, about 0.07 km/h. So the effect at sane values is unmeasurable. Stiffness at high speed could differ, but not by enough to change the conclusion.
- Worn-tyre testing at Calspan shows a camber-worn tyre is not necessarily worse in the dry, which adds to the point that uneven wear is mainly a cost issue, not an immediate dry grip loss. Wet performance is not addressed by that abstract, and shoulder-worn tyres may lose tread depth where it matters.

### Gaps
- No controlled stance data. No drag racing alignment source. No source explaining how Pirelli picks limits by circuit.
- Toe against top speed: nothing measured, only the estimate above.

## When alignment is a waste of money for an ordinary driver, and when it actually matters

### Takeaway
There is no controlled passenger car study to answer this directly. The evidence suggests the following: fix toe when it is genuinely off, because that is cheap and protects tyres. Fuel is not a good reason for most drivers. Track camber is worth it only for track use, and matters most on strut cars. This whole section is judgement based on the above, not measured fact.

### Cited Findings
- Tire Rack advises aligning to the preferred value, within the published range. Grade C, [EXCERPT] — [Tire Rack](https://www.tirerack.com/upgrade-garage/what-are-the-different-alignment-settings)
- The aim is enough negative camber for cornering without loading the inner edge too much in straight-line driving. Grade C, [EXCERPT] — [Tire Rack](https://www.tirerack.com/upgrade-garage/what-are-the-different-alignment-settings)
- Twist-beam geometry is factory set, and deviation may indicate a bent axle. Grade C, [READ] and [EXCERPT] — [Wikipedia, Twist-beam](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension), [Patent US7334805](https://patents.google.com/patent/US7334805)

### Inferences
Likely to matter:
- Visible feathering or inner or outer shoulder wear, a pull, or an off-centre steering wheel.
- After suspension or steering work, lowering, or a heavy kerb strike. Lowering changes camber and toe, which then need resetting.
- Track or autocross use, especially on strut cars with little static camber. This is the case with the best supporting evidence (MINI, -2° and about 1 s).
- High-mileage operation such as trucks and fleets, where wear and cost compound.

Likely a waste:
- Paying for a routine alignment on a car with even wear, no pull and no impact, for fuel savings. CALC above: 1 to 2 mm costs under 0.2% of rolling resistance.
- Street driving with track camber on a car that never reaches the limit. Probable wear cost, no daily benefit. Evidence is qualitative.
- Paying to adjust a twist-beam rear axle without any symptoms. It usually has no adjustment, so it can only be checked.
- Chasing small numbers inside tolerance. Tire Rack's ±1° range for camber suggests that this tolerance is not safety-critical, although that is my reading.

Suggested shape for the interactive model (design implications, not evidence):
- Toe: drag grows as a parabola, and wear is the main cost. Show "scrub per km" as a geometric upper bound, and never a flat "X% per mm".
- Camber: show the balance between cornering gain and braking contact patch as a curve with a tyre-specific optimum, labelled illustrative. No exact percentages are available.
- Suspension type: expose camber recovery in roll as the variable, and make clear that its values are representative or computed from the site's own geometry, not measured.
- Caster: calculable geometry (trail, camber on lock) can be shown confidently. Stability and effort should stay qualitative.
- Show an evidence label beside each statement. The site's question "does it make sense at all?" has the honest answer: yes for toe and wear, yes for camber at the limit, and mostly no for fuel, with measurements thinner than the common advice suggests.

### Gaps
- No controlled study of ordinary drivers' total running costs with and without routine alignment. I searched for such data and found only vendor claims.
- Prevalence of misalignment in passenger cars: Yurko 1978 used inspection data, but I could not read the numbers.
