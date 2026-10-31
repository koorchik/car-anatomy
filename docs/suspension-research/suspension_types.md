# Automotive suspension types: taxonomy, kinematics, media, myths

**How to read the evidence marks.** Every sourced claim carries one of these:
- `[R]` the page was opened and read through an extraction tool. Wording is paraphrased, not guaranteed verbatim.
- `[E]` search-result excerpt only, the page itself was not opened. Weaker. Check before quoting.
- Source class is named in the link text: mfr (manufacturer or supplier), gov, univ, SAE, press, wiki (crowd-edited), blog/forum (lowest).
- Anything without a source sits in Inferences or Gaps and is explicitly **not verified**.

**Biggest limitation.** None of the suggested textbooks (Milliken, Reimpell, Dixon, Gillespie, Heißing/Ersoy) could be read; only bibliographic pages were reachable. No textbook claim is made first-hand here. Much of the taxonomy rests on English and German Wikipedia, with German pages citing Matschinsky and the Fahrwerkhandbuch. Several primary documents (Honda Accord press kit, Alfa Romeo PDF, Toyota KDSS article, the NHTSA Corvair PDF) failed to open or timed out, so they appear only as `[E]`. Unsprung mass has almost no published per-type numbers in what I could reach.

## Which suspension types exist, how they are built and constrained, and why manufacturers choose them

### Takeaway
A wheel carrier has 6 degrees of freedom and an independent suspension leaves 1, so every independent type is a different way of removing 5; a rigid axle must keep 2 (heave and roll) and remove 4. Types form continua rather than boxes (trailing arm to twist beam to torsion crank to solid axle; swing axle to semi-trailing arm to trailing arm), and choice is driven at least as much by cost, packaging, crash structure and NVH as by kinematics.

### Cited Findings

#### Framing: degrees of freedom and classification
- A wheel carrier has six DOF; each of five links removes one, leaving only spring travel — [de.wikipedia Mehrlenkerachse, wiki, R](https://de.wikipedia.org/wiki/Mehrlenkerachse)
- A rigid axle keeps two DOF, vertical travel and rotation, and must lose the other four — [The Autopian on Ranger Raptor, press, R](https://www.theautopian.com/how-the-ford-ranger-raptors-watts-link-rear-suspension-works-and-why-its-not-on-every-truck/)
- German classification is three-way: Starrachse (rigid), Einzelradaufhängung (independent, a one-DOF mechanism), Verbundaufhängung/Halbstarrachse (semi-rigid). Rigid axles need four rod links for a kinematically defined guide, and overdetermined variants are common — [de.wikipedia Radaufhängung, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung)
- Real links and bushings deflect under load, and designers exploit this as elastokinematics to cancel deformation or turn it into useful motion — [de.wikipedia Radaufhängung, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung)

#### Independent: MacPherson strut
- **Parts:** strut (spring + damper, top mount to body, lower end fixed to hub carrier), lower wishbone on subframe, knuckle, outer tie rod, hub; optional radius rod that an anti-roll bar can replace. **Steering axis:** line from strut top mount to lower ball joint — [Wikipedia MacPherson strut, wiki, R](https://en.wikipedia.org/wiki/MacPherson_strut)
- **Weaknesses:** camber changes with travel and there is less freedom over camber and roll centre than with double wishbone or multilink; damper moves nearly as far as the wheel, giving little leverage to break seal stiction; standard designs have positive scrub, which can produce torque steer — same source
- **Why chosen:** compact, pre-assemblable, leaves engine-bay width for transverse engines, fits unibody crash structures (small-overlap crash performance cited for Honda Accord, Civic, Mercedes E-Class), frees front space on rear- and mid-engined cars (911, Boxster) — same source
- **History:** MacPherson's Chevrolet Cadet prototypes (project cancelled 1947); patents for GM 1947 and Ford 1949, the Ford patent citing mid-1920s Fornaca/FIAT designs; first production strut car is the British 1950 Ford Consul. The 1949 Ford Vedette is often wrongly credited, it was originally on wishbones and Simca switched it to struts in 1954 — same source. Note [Wikipedia Double wishbone, wiki, R](https://en.wikipedia.org/wiki/Double_wishbone_suspension) says 1951, probably production year versus launch year
- Honda dropped its double-wishbone front for struts on the 2013 ninth-generation Accord: 15.2 kg saving reported in a review, Honda material cites improved ride and handling and reduced NVH — [search excerpts including Inquirer Motion Cars, press, E](https://motioncars.inquirer.net/?p=25342); [Honda Accord Mk9 press kit, mfr, E](https://australiancar.reviews/_pdfs/Honda_Accord_Mk9_PressKit_201305.pdf). Crash compliance as a Honda reason is secondhand — [TTAC, press, E](https://TheTruthAboutCars.com/2011/11/piston-slap-strut-yo-stuff-or-make-a-wish/). Cost as the motive is commentary, not a Honda statement

#### Independent: dual-axis struts (RevoKnuckle, HiPer Strut, Honda Dual Axis, Renault)
- **Common idea:** split the strut into separate components for vertical movement and steering, improving contact patch and reducing torque steer, at a weight penalty but cheaper than double wishbone or multilink — [Wikipedia MacPherson strut, wiki, R](https://en.wikipedia.org/wiki/MacPherson_strut)
- **RevoKnuckle mechanism:** strut lower end is C-shaped, its arms hold the knuckle, the knuckle pivots between them, and those pivots define the steering axis, closer to the wheel centreline; both steering offset and kingpin inclination fall — [CarTechnical, press, R](https://cartechnical.co.uk/jargonbuster/23-r/137-revoknuckle). Ford's release confirms the goal (less steering offset, less torque steer, paired with a Quaife LSD, developed with Ford's Aachen research centre) but gives no numbers — [Ford press release mirror, mfr, R](https://ophelia.sdsu.edu:8443/ford/03-03-2012/news-center/press-releases-detail/pr-new-ford-focus-rs-a-legend-returns-28565.html)
- **RevoKnuckle numbers, weak:** kingpin offset about 20-30 mm "versus about 40 mm for double wishbones", Ford claiming lighter and cheaper — [Wikipedia RevoKnuckle, wiki, R](https://en.wikipedia.org/wiki/RevoKnuckle), an article flagged as over-reliant on primary sources. A different source says "less than half a conventional strut" — not directly comparable. Reviewers found torque steer reduced, not eliminated — [CarAdvice, press, E](https://www.caradvice.com.au/83904/ford-focus-rs-review/)
- **HiPer Strut:** keeps the strut, adds a second ball joint on top of the knuckle, shortening the spindle; adds 18-22 lb (8-10 kg); 4.5 years in-house; "not a cheap part"; 2010 Buick LaCrosse CXS and Opel Insignia OPC; testing "effectively eliminated" torque steer with 304 hp V6 — [WardsAuto, press, R](https://www.wardsauto.com/news/archive-wards-gm-s-hiper-strut-rethinks-macpherson-suspension/775253/). Ward's also says reduced negative camber, puts more tyre on the road. Dual-path top mounts — [GM Authority, press, E](https://gmauthority.com/blog/gm/general-motors-technology/gm-chassis-suspension-technology/gm-hiper-strut-chassis-suspension-technology/)
- **Honda Dual Axis (Civic Type R):** separated knuckle and strut with two kingpins; centre offset reduced about 50% from the standard Civic; torque steer reduction quoted as 50% or 55%, one source says only together with revised driveshafts — [Honda Info Center, mfr, E](https://www.hondainfocenter.com/2025/civic-type-r/feature-guide/engine-chassis-features/dual-axis-front-suspension/); [The Drive, press, E](https://www.thedrive.com/news/45013/the-honda-civic-type-r-is-a-great-handler-thanks-to-this-special-suspension-setup); [Vehicle Dynamics International, press, E](https://vehicledynamicsinternational.com/?p=3072). The FK8 is documented; whether the FK2 also had it was not confirmed
- **Renault Mégane RS (2004):** a French test calls it an "independent pivot" front axle — [automobile-sportive.com, press, E](https://www.automobile-sportive.com/guide/renault/meganers.php). No technical source found
- **Related, double pivot:** splitting the lower wishbone into two links for better steering geometry and scrub radius — [Wikipedia MacPherson strut, wiki, R](https://en.wikipedia.org/wiki/MacPherson_strut)

#### Independent: double wishbone, SLA, high-mount, virtual axis
- **Parts:** two A- or L-shaped arms, each with two chassis mounts and a knuckle joint; spring and damper on an arm; ball joints replacing older kingpins. **Kinematics:** a four-bar linkage in front view, so camber gain is calculable from joint positions; angling joints tunes anti-dive and anti-squat — [Wikipedia Double wishbone, wiki, R](https://en.wikipedia.org/wiki/Double_wishbone_suspension)
- **SLA:** shorter upper arm induces negative camber on rise; in roll the outer wheel gains negative and the inner gains positive. Camber gain stays negative through full compression, unlike a strut. Short-spindle SLAs need stiffer bushings and have poorer kingpin geometry; long-spindle SLAs have better kingpin geometry but limit tyre and snow-chain fitment. Bump steer needs care — same source
- **History and cars:** Citroën Rosalie and Traction Avant 1934; Packard One-Twenty 1935. Aston DB7, MX-5, Honda Accord generations 3-8; SLA front on Peugeot 407, Citroën C5, first two Mazda6 — same source
- **High-mount and virtual axis:** a Stellantis document describes the Giulia and Stelvio front as double wishbone with semi-virtual steering axis: upper arm, two decoupled lower links, tie rod, coaxial coil-over, chosen over a strut for control of suspension angles — [Alfa Romeo Accademia di Guida, mfr, E](https://www.media.stellantis.com/uploads/me/ME/2018/Alfa-Romeo/Files/121218_Accademia_Di_Guida_Alfa_Romeo_E.pdf). A patent defines a virtual axis as set by fictitious hinges at the intersections of the extended arm lines — [Patent ITTO931009A1, E](https://patents.google.com/patent/ITTO931009A1/en). Alfa 156 "high double wishbone" comes only from low-tier sources — [autozine and others, press, E](https://www.autozine.org/Archive/Alfa/old/156.html)
- 992 Porsche 911 GT3 moved from strut to double wishbones, a racing layout from the 911 RSR and RS Spyder and new to a Porsche road car, with claimed gains in turn-in, cornering performance and braking stability; the lower arm's front joint is set lower for anti-dive — [Porsche Newsroom, mfr, E](https://newsroom.porsche.com/en/press-kits/911-GT3/Chassis-and-dynamics.html). Letting front stiffness rise without hurting bump absorption — [CarExpert, press, E](https://carexpert.com.au/car-news/how-the-2021-porsche-911-gt3-blurs-the-line-between-road-and-race)

#### Independent: multilink
- **Definition conflict:** "three or more control links per wheel" — [Wikipedia Multi-link, wiki, R](https://en.wikipedia.org/wiki/Multi-link_suspension); "four or five links" — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Mehrlenkerachse); "a loose term" — [Road & Track syndicated on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html)
- **Function by plane:** plan view, a pair of separated arms controls toe and lateral compliance; front view, arms control camber through jounce and rebound; side view, a longitudinal link carries traction and braking and helps caster. Brake torque needs a second longitudinal link, hub rotation, or a link rigidly fixed to the hub. Each arm has a ball joint or bush at each end and so works in tension or compression, not bending. On a front axle the tie rod replaces one lateral arm — [Wikipedia Multi-link, wiki, R](https://en.wikipedia.org/wiki/Multi-link_suspension)
- **Variants:** five-link (all straight two-joint links); four-link (two upper links merged into a triangle); trapezoidal (lower trapezoid arm plus auxiliary link, BMW E31, Audi Q5 8R); integral-link (the fifth link couples upper and lower arms and reduces elastic wind-up in braking, BMW 5 and 7); sword-link (flexible longitudinal arm with three lateral links, Ford Focus); strut-based with split lower wishbone (BMW and Mercedes fronts). Audi and VW "four-link" fronts are actually five links counting the tie rod — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Mehrlenkerachse)
- **Audi five-link front (primary):** one support link and one control arm below, two arms above, track rod as the fifth. Longitudinal and lateral forces handled separately, bearings stiff laterally and softer longitudinally; aluminium links reduce unsprung mass — [Audi Technology Portal, mfr, R](https://www.audi-technology-portal.de/en/chassis/wheel-suspension-steering/front-suspension). B5 A4 virtual steering axis with about 10 mm steering-axis offset, taken from the A8 to cut torque steer and improve road feel — [WardsAuto, press, E](https://www.wardsauto.com/news/archive-wards-refining-the-ride/762096/). Steering gear sits high with short tie rods and a defined bump toe-in — [ZF Aftermarket, mfr, E](https://aftermarket.zf.com/en/aftermarket-portal/for-workshops/useful-tips/steering/wheel-alignment-on-four-link-suspension)
- **W201 five-link:** five links at different heights, conceived by Kurt Enke, designed after his death by Manfred von der Ohe, unveiled November 1982, standard for later Mercedes rear axles — [Daimler text on MarketScreener, mfr, R](https://in.marketscreener.com/quote/stock/MERCEDES-BENZ-GROUP-AG-436541/news/Daimler-AG-The-significance-of-the-W-201-The-compact-vehicle-successfully-opened-up-a-new-market-17820344). Experimental C111 late 1960s — [Wikipedia Multi-link, wiki, R](https://en.wikipedia.org/wiki/Multi-link_suspension). Mercedes reportedly evaluated seven rear layouts including De Dion — [Road & Track on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html). Development-cost figures conflict and should not be used
- **Why chosen:** separate links let ride and handling be tuned separately; recession helps comfort; friction is low since only the damper slides; less height needed than a strut, suiting SUVs; more bushes and cost. Doug Milliken: "gets rid of a lot of trade-offs" — [Road & Track on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html). Costly, geometry hard to tune without 3D CAD, compliance must be checked in multibody software — [Wikipedia Multi-link, wiki, R](https://en.wikipedia.org/wiki/Multi-link_suspension)
- **Integral link on the S550 Mustang (2015):** small vertical link carries torque and prevents spindle wind-up, hence the H-shaped lower arm; intended to resist wheel hop without hard bushes. Only enthusiast and aftermarket sources; no Ford engineering statement found — [KingAutos, press, E](https://www.kingautos.net/138093); [Steeda, blog, E](https://www.steeda.com/superpro-spf4742k-mustang-rear-integral-vertical-links-w-polyurethane-bushings)
- **BMW Z-axle:** Z1 (1989), two transverse arms and one longitudinal per one source, then E36 and Rover 75. A spec table describes it differently, so layout detail conflicts — [Wikipedia BMW Z1 and others, wiki, E](https://en.wikipedia.org/wiki/BMW_Z1)
- **Ford Control Blade (Focus Mk1, 1998):** wide pressed-steel trailing arm with hub carrier replacing two longitudinal rods and avoiding a cast knuckle, with double-wishbone-like geometry. It pushed rivals such as the Golf V to multilink — [Wikipedia Ford Focus first generation, wiki, E](https://en.wikipedia.org/wiki/Ford_Focus_(first_generation)). The Parry-Jones attribution has no primary source
- Jaguar uses multilink from the 1998 S-Type onward, replacing its long-running layout — [Wikipedia Jaguar IRS, wiki, R](https://en.wikipedia.org/wiki/Jaguar_independent_rear_suspension)

#### Independent: halfshaft as a link (the missing transitional family)
- **Jaguar IRS 1961-1996:** fixed-length driveshaft with a universal joint at each end is the upper link, lower tube wishbone, two radius arms, two coil-overs per side, inboard discs at the differential on a rubber-mounted steel crossbeam. Heat from inboard brakes damaged differential seals. Roll flexes the crossbeam mounts and radius-arm angles cause small passive rear steer. E-Type, Mark X, XJ, XJS, DB7 derivative until 2004 — [Wikipedia Jaguar IRS, wiki, R](https://en.wikipedia.org/wiki/Jaguar_independent_rear_suspension)
- **Corvair 1965, from the 1963 Sting Ray:** long trailing arms, small lateral links, double-jointed halfshafts as upper arms, called a three-link rear. Some jacking remained because halfshafts remained control arms, but lower roll centre and longer effective swing arm reduced it — [Ate Up With Motor, press, R](https://www.ateupwithmotor.com/model-histories/chevrolet-corvair-history/3/)
- C4 Corvette: two trailing arms, a toe arm, a camber link, and the halfshaft — [Road & Track on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html)

#### Independent: trailing arm
- **Parts:** rigid arm combined with wheel carrier, transverse pivot axis, no extra links, often on a rubber-isolated subframe. **Kinematics:** wheel centre moves on arcs in a longitudinal plane. Instantaneous centre sits at road level, giving significant tilt in corners. Heavy arm loads in bending and torsion limit it to lighter cars. **Why chosen:** uses the space between wheels, very narrow arches with torsion bars or horizontal dampers, no strut domes — [de.wikipedia Längslenkerachse, wiki, R](https://de.wikipedia.org/wiki/Längslenkerachse)
- **History:** Adler Trumpf Junior 1934; 2CV, Renault 4 and 16, Citroën DS, Mini, ADO17; French makers into the 2000s (Peugeot 306), then largely replaced by twist beam — same source

#### Independent: semi-trailing arm
- **Parts:** wheel carrier on one pivot axis formed by two widely spaced bearings, oriented diagonally toward the vehicle centre and rearward. In bump, gains toe-in and negative camber. Smaller camber change and lower instant centre than a swing axle. Two joints per driveshaft. Tends to oversteer under lateral force — [de.wikipedia Schräglenkerachse, wiki, R](https://de.wikipedia.org/wiki/Schräglenkerachse)
- **History:** Lancia patent 1947, Aurelia 1950; Renault Frégate 1951; Fiat 600 1955; BMW Neue Klasse 1962; Mercedes W114/115 1968, marketed as "Diagonalpendelachse"; replaced on rear-drive cars by multilink from the W201 — same source. This Mercedes label may explain why Road & Track calls W123 rear axles "swing axles"; that reading is my inference
- **Weissach axle:** a short link replaces a bushing at the front of the arm, so as the arms drop in deceleration the hubs pull in, toe-in, less lift-off oversteer. 1978 Porsche 928 — [Wikipedia Weissach axle, wiki, R](https://en.wikipedia.org/wiki/Weissach_axle). **Conflict:** Wikipedia calls it a semi-trailing variant; Porsche's page calls it a double-wishbone rear with toe-in stabilising effect — [Porsche, mfr, E](https://www.porsche.com/pap/accessoriesandservice/classic/models/928/928/); de.wikipedia lists it among multilink axles. Similar systems: Mazda RX-7 FC DTSS, Lotus Carlton toe link — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Weissach_axle)

#### Independent: swing axle
- **Parts:** differential on chassis, universal joint at inner end only, no outer joint, so the wheel stays perpendicular to the shaft. Rumpler patent 1903; Tatra 17 front and rear, Beetle torsion bars, Mercedes coils — [Wikipedia Swing axle, wiki, R](https://en.wikipedia.org/wiki/Swing_axle)
- **Kinematics:** large camber change because half-shaft radius is less than half that of a whole axle; very high roll centre causing jacking toward positive camber on rebound; oversteer worse with rear engine; no sympathetic camber on opposite wheel; lower unsprung mass — same source
- **Jacking mechanism:** the outside halfshaft drops below its joint's pivot, acts as a lever lifting the tail, the outer wheel tucks under, positive camber rises, and the tyre loses grip in a burst of non-linear oversteer. Excess rear roll stiffness in the early Corvair made it worse — [Ate Up With Motor, press, R](https://www.ateupwithmotor.com/model-histories/chevrolet-corvair-history/3/)
- **Mitigations:** tyre pressure split on Dauphine, Beetle, Corvair; front bar; Mercedes low single pivot below the differential (W108/W109 280SE, 300SEL to 1972); VW Z-bar; camber compensator transverse leaf (1964 Corvair, Porsche 356 Super 90). Front use: Hillman Imp, Lotus Eleven 1956, Jeep Wagoneer 1963 — [Wikipedia Swing axle, wiki, R](https://en.wikipedia.org/wiki/Swing_axle). Ford Twin I-Beam is a related truck design with opposite-rail pivots — same source
- The same Wikipedia page says swing axles were "largely replaced by de Dion tubes" in the late 1960s. Evidence elsewhere in this file points to semi-trailing and multilink instead, so I treat this as wrong

#### Independent: sliding pillar
- **Parts:** stub axle and wheel on a vertical pillar sliding in bushes on chassis outriggers; springs cushion; the pillar also rotates to steer. **Kinematics:** purely vertical, camber change "almost nonexistent", but track varies with differential travel. **History:** Bollée 1873; Decauville 1898; Morgan 1909, inverted with a sleeve on a fixed pillar; Lancia Lambda c.1922 into the Appia and Aurelia; Nash 600 briefly. Rare — [Wikipedia Sliding pillar, wiki, R](https://en.wikipedia.org/wiki/Sliding_pillar)
- **Correction to Wikipedia's "up to the present":** Morgan replaced it with double wishbones on the CX platform: Plus Six 2019, Plus Four March 2020 — [Autocar, press, E](https://www.autocar.co.uk/car-news/motor-shows-geneva-motor-show/new-morgan-plus-four-arrives-bmw-power-new-chassis); [Hagerty, press, E](https://www.hagerty.co.uk/articles/the-last-steel-chassis-morgan-leaves-the-factory/)

#### Independent: leading arm and Dubonnet (historical)
- 2CV front and DS listed as leading-arm uses — [Wikipedia Trailing arm, wiki, R](https://en.wikipedia.org/wiki/Semi-trailing_arm_suspension)
- **Dubonnet:** rigid beam with sprung arms pivoting on kingpins at its ends; sealed coil-spring-and-damper unit outboard of the kingpin. Kingpins and steering gear inboard of the suspension, so counted out of unsprung mass. Dubonnet's Hispano-Suiza special 1933; GM "Knee-action"; Vauxhall, Fiat, Alfa P3; last on Iso and BMW Isetta, BMW 600 and 700. Leaks are the main weakness — [Wikipedia Dubonnet, wiki, R](https://en.wikipedia.org/wiki/Dubonnet_suspension)

#### Independent: pushrod and pullrod (actuation variant, not its own geometry)
- Wishbones still locate the wheel; a rod and rocker move the spring and damper inboard, lowering unsprung mass and aiding aero, while adding total mass — [Wikipedia Double wishbone, wiki, R](https://en.wikipedia.org/wiki/Double_wishbone_suspension)
- **Pushrod:** rocker high, rod in compression and needing a larger section against buckling. **Pullrod:** rocker low, rod in tension, "a piece of wire would be adequate". Gary Anderson rates structure 70/30 for pullrod, blockage 70/30 for pullrod, alignment about 50/50, rising rate 70/30 for pullrod (double or triple rate in compression), and estimates about 15 kg moved 30 cm or more lower. Top four teams in early 2024 were split 50/50. BRM P261 1965 used rocker-driven coil-overs — [The Race, press, R](https://www.the-race.com/formula-1/gary-anderson-key-design-dilemma-facing-every-f1-team/)
- Pushrod raises the spring and damper and thus CoG, with easier access; 2023 grid used all combinations, for example Red Bull pull front and push rear, Mercedes the reverse — [Formula1.com, press, R](https://www.formula1.com/en/latest/article/explainer-whats-the-difference-between-pull-rod-and-push-rod-suspension.1I3wL4LEL0nQZbKZbx1Dhz)
- **Road:** Lamborghini Aventador (2011) with transverse dampers under the windscreen and near the engine at the rear; low profile is the main benefit; marketed as the first series-production pushrod car — [AutoGuide, press, E](https://www.autoguide.com/auto-news/2011/01/lamborghini-confirms-lp700-will-be-first-production-car-with-a-pushrod-suspension.html); [Motor Authority, press, E](https://www.motorauthority.com/news/1054165_geneva-auto-show-preview-lamborghini-murcielago-replacement-gets-pushrod-suspension). The "first" claim is suspect, see Gaps

#### Semi-dependent: twist beam family
- **Parts:** two trailing arms joined by a cross member stiff in bending and soft in torsion, usually U or T section; two body bushes; often no separate bar since the beam acts as one. Coil on a pad beside the stub axle — [de.wikipedia Verbundlenkerachse, wiki, R](https://de.wikipedia.org/wiki/Verbundlenkerachse); [Wikipedia Twist-beam, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)
- **The continuum:** Torsion crank (cross member at the ends, DKW Junior 1958, Audi 100 C1, close to a rigid axle); Koppellenker (mid-arm, Audi 50); Verbundlenker (near pivot, VW Scirocco and Golf 1974) — [de.wikipedia Radaufhängung, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung); [de.wikipedia Verbundlenkerachse, wiki, R](https://de.wikipedia.org/wiki/Verbundlenkerachse)
- **Kinematics:** with both wheels compressed equally camber does not change; changes come from relative wheel motion. Closer to the stubs, more camber and toe change under deflection — [Wikipedia Twist-beam, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension). Strong roll camber, tends to oversteer under lateral force. Asymmetric toe-correcting bushes from Passat B2 (1981) largely fixed this — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung)
- **Elastic properties define the kinematics:** roll steer and durability depend on the section's warping constant and shear centre — [KoreaScience paper, univ, E](https://www.koreascience.or.kr/article/JAKO199911920267351.page?lang=ko); a vertical load at the shear centre produces bending without twist — [US Patent 10442268, E](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10442268); analytical roll-steer equations exist from hard points — [core.ac.uk thesis, univ, E](https://core.ac.uk/download/357197116.pdf), the PDF refused to open
- **Weaknesses:** limited camber control, poor impact harshness, wheel moves forward on rise, limited recession compliance, exhaust routing around the beam, welds in fatigue, no alignment adjustment. **Strengths:** cost, durability, light, few bushes — [Wikipedia Twist-beam, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension). About 5 major parts versus roughly 10 per side for multilink — [Jalopnik, press, R](https://jalopnik.com/2043199/pros-cons-torsion-beam-suspension/). Saving of about €100 per car compared with multilink — [Wikipedia Twist-beam, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)
- **Watt-link twist beam:** 2009-2018 Opel Astra at about €20 per car — same source. Beam sits about halfway between bush and wheel; engineers estimate the linkage takes around 80% of lateral loads (2011 GTC article), and softer bushes are allowed since they no longer manage toe; Opel claimed multilink-like performance at lower mass and cost — [The Auto Channel, press, E](https://theautochannel.com/news/2011/07/22/000342-opel-astra-gtc-exclusive-high-performance-chassis.html); [OneShift, press, E](https://www.oneshift.com/articles/news/europe-driver-appeal-and-comfort-will-be-hallmarks-of-new-astras-chassis/)
- **Nissan Multi-Link Beam (Maxima, Sentra, 1995):** a beam axle with Scott-Russell link, described by a 1998 magazine as avoiding Panhard asymmetry and simpler than a Watt. Paper aims: better cornering limit, traction, and stability during decel in a turn; no measured results on the abstract page — [Kato, Tateishi, Ogawa, SAE 950585, SAE, R](https://saemobilus.sae.org/papers/development-a-multi-link-beam-rear-suspension-front-wheel-drive-cars-950585); [Sport Compact Car via se-r.net, press, E](https://se-r.net/about/g20/scc/oct98/tb.html)
- **VW arc:** Golf I through IV beam; Mk5 multilink 2004; returned on Golf VII up to 92 kW "for cost reasons" — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Verbundlenkerachse); [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)

#### Dependent: leaf-sprung Hotchkiss
- Axle housing firmly fixed to leaf springs that carry axle torque into the body and locate it, with no extra links; two universal joints and a slip joint on the propshaft. Dominant in 20th-century front-engine RWD; still common in pickups and SUVs as of 2016 — [Wikipedia Hotchkiss, wiki, R](https://en.wikipedia.org/wiki/Hotchkiss_drive). Springs guide the axle longitudinally and laterally and torque makes the axle wind up — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung)

#### Dependent: torque tube
- Stationary tube around the driveshaft ties diff housing to transmission, with a torque ball at the front; thrust goes through the engine and gearbox mounts. Needs a Panhard rod with coils; Ford through 1948, Buick from 1906 and with coils 1938-61, Rambler 1956-66, Chevette 1976-88. Allows soft coils; heavier and adds unsprung mass; can hop on washboard — [Wikipedia Torque tube, wiki, R](https://en.wikipedia.org/wiki/Torque_tube)
- **Thrust-ball or central-joint axle:** a related drawbar with body-side ball joint taking thrust and torque, needing an additional lateral link — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung)
- The word also labels Corvette C5 and SLS transaxle tubes, which align the engine with the transaxle — [Wikipedia Torque tube, wiki, R](https://en.wikipedia.org/wiki/Torque_tube). See Inferences

#### Dependent: coil-sprung live axle location (links, Panhard, Watt, Scott-Russell)
- Four rod links define the axle exactly; lateral location by triangular link, Panhard rod, or Watt; overdetermined variants common — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung)
- **Four-link:** rubber bushes required for comfort let the axle shift sideways, and small deflection at link angles gives large lateral movement — [The Autopian, press, R](https://www.theautopian.com/how-the-ford-ranger-raptors-watts-link-rear-suspension-works-and-why-its-not-on-every-truck/)
- **Panhard:** single lateral rod, body moves in an arc of rod length relative to axle, worse with a short rod. Jaguar Mark 2, Suzuki Jimny — [Wikipedia Panhard rod, wiki, R](https://en.wikipedia.org/wiki/Panhard_rod). It conflicts with the links' straight travel and bushes absorb this; non-horizontal rod pushes the body up or down differently left and right — [The Autopian, press, R](https://www.theautopian.com/how-the-ford-ranger-raptors-watts-link-rear-suspension-works-and-why-its-not-on-every-truck/)
- **Watt:** two equal horizontal rods and a centre bar pivoted on the axle; central point traces a figure-eight, so near-vertical, not true straight line, and the axle stays on centreline; inverted version with pivot on body reduces unsprung mass, used in V8 Supercars until 2012 — [Wikipedia Watt's linkage, wiki, R](https://en.wikipedia.org/wiki/Watt%27s_linkage). Tension and compression in the rods give no net vertical force and are symmetric left and right; more parts and cost; Ford Everest and Ranger Raptor — [The Autopian, press, R](https://www.theautopian.com/how-the-ford-ranger-raptors-watts-link-rear-suspension-works-and-why-its-not-on-every-truck/). Roll centre is set by the pivot and is adjustable via bell-crank height — [Street Muscle, press, E](https://www.streetmusclemag.com/?p=4040). All Falcon sedans XE 1982 to EL 1998 — [Canberra Times, press, E](https://www.canberratimes.com.au/story/7315895)
- **Modern use:** Jeep Wrangler JL five-link coil solid axles front and rear; reasons in coverage are off-road ability and owner loyalty, no Jeep statement found — [Expedition Portal, press, E](https://expeditionportal.com/the-jeep-wrangler-jl-has-arrived/). 2018 G-Class went to double wishbones in front, directly on the ladder frame, with a rigid rear axle, for front-end rigidity and on-road behaviour — [Mercedes press release, mfr, E](https://www.slideshare.net/sagar1122/new-mercedes-g-class-global-debut-press-release); [Car and Driver via Yahoo, press, E](https://autos.yahoo.com/mercedes-g-class-gets-independent-175821275.html)
- NASCAR kept solid-axle truck arms until the 2022 Next Gen car moved to double wishbones and a transaxle; a Ford engineer called the old axle 1960s and 70s tech — [Racer, press, E](https://racer.com/racerpedia/series-guides/nascar/all-about-nascar-s-next-gen-car); [Motorsport.com, press, E](https://us.motorsport.com/nascar-cup/news/next-gen-hidden-secrets-nascar/6503741/?nrt=119)

#### Dependent: De Dion
- Rigid tube holds wheels parallel; differential on chassis; universal or CV joints at both ends of each driveshaft; separate lateral location. Camber changes only on single-wheel bump with sympathetic change opposite. Lower unsprung mass than live axle, near-zero camber helps traction with wide tyres, less hop; each wheel can be aligned individually. Complexity and weight of joints. Named for De Dion, invented about 1894 by Trépardoux. Alfa Alfetta, GTV, 75; Aston 1967-89; Rover P6; Lancia Aurelia and Flaminia; W125, W154; Ferrari 312T6; Smart Fortwo; Caterham 7. New EV uses: Ford Ranger EV 1998, EQG 2024, Hilux EV 2025 — [Wikipedia De Dion, wiki, R](https://en.wikipedia.org/wiki/De_Dion_tube)
- **Rover P6:** split axle casing with a sliding joint; four links and driveshafts act as extra transverse links — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung)

### Inferences
**Not verified by any source: these are my own derivations or judgement. Check against Dixon or Milliken before publishing.**

- **Page list by teaching value.** Tier 1 pages: MacPherson, double wishbone (SLA), multilink (five-link as reference), twist beam, semi-trailing arm, swing axle, Hotchkiss, De Dion. Tier 2 variant toggles on those pages: dual-axis strut, high-mount or virtual axis, integral link, Watt on twist beam, Panhard or Watt or Scott-Russell on live axle, pushrod and pullrod, low-pivot swing axle, torsion crank. Tier 3 history: sliding pillar, trailing arm, torque tube, Dubonnet. Trailing arm could also go in Tier 1 because it is the base case for the camber-in-roll story.
- **Types the brief did not list:** halfshaft-as-link IRS (Jaguar, Corvette, Corvair 1965), Weissach/passive rear steer, Control Blade/sword link, trapezoidal link, double-pivot strut, rear struts (Boxster), torsion crank and Koppellenker, Scott-Russell/multilink beam, thrust-ball axle, Twin I-Beam, leading arm, Dubonnet, Rover-style sliding De Dion, transverse-leaf IRS, 2CV interconnected.
- **DOF as the model's backbone.** All types reduce to a chain of constraints. Most can be solved in closed form (single revolute axis: swing axle, trailing, semi-trailing, sliding pillar as prismatic). Double wishbone needs a four-bar in 3D, MacPherson a distance constraint plus prismatic, five-link five distance constraints with iterative solving. Rigid axle needs 2-DOF solving of heave and roll.
- **Redundancy in live axles.** Three-link plus Panhard or Watt has four rod constraints, so it is exact. Triangulated four-link alone is also exact. Parallel four-link plus Panhard has five, so it is over-constrained and the bushes are forced to deform in roll. A leaf-sprung axle is compliance-located. This agrees with de.wikipedia's "overdetermined variants" and Autopian's bushing conflict, but the counts are mine.
- **Torque tube is two different things.** In a beam-axle Buick it is a locating member. On a C5 or SLS transaxle it only joins engine and gearbox, with no suspension role. An article should separate them.
- **Rear-axle De Dion and track.** A De Dion tube is rigid while driveshafts have fixed length if the joints do not plunge, so something must slide: telescoping tube (Rover P6), plunging joints, or sliding splines. Wikipedia mentions this only for the EQG.
- **Parametric hard points per type:**

| Type | Hard points or parameters | Output path |
|---|---|---|
| Strut | Top mount, lower arm two inner pivots, lower ball joint, tie-rod ends, strut axis | Lower joint arc, knuckle slides on strut axis |
| Dual-axis strut | Strut plus upper and lower knuckle pivots on C bracket | As strut, but steering axis moves separately |
| Double wishbone | Upper and lower pairs of inner pivots, both ball joints, tie rod | Four-bar front view, separate side view |
| Five-link | Ten end points of five links, spring and damper mounts | One-DOF spatial curve |
| Trailing arm | Transverse axis, arm length | Arc in a longitudinal plane |
| Semi-trailing | Axis with plan and side angle | Arc in a tilted plane |
| Swing axle | Inner joint centre, half-shaft length | Arc in the transverse plane about the joint |
| Twist beam | Bush points, beam position along arm, stub position | Not rigid-body: axle-like in heave, about a beam-derived axis in roll |
| Sliding pillar | Pillar line | Straight line |
| Live axle | Link ends, lateral device, axle width | Axle heave and roll |
| De Dion | Tube width, diff on body, links, lateral device | Same as live axle, plus visibly angling shafts |

- **Honest twist-beam modelling caveat.** A beam twists elastically, so a plain rigid-body solve is only an approximation of an elastic shear-centre behaviour. A single roll-axis approximation, with the axis passing near the beam's shear centre, seems the honest simplification, and the article should say so.

### Gaps
- **Unsprung mass by type:** I found no reputable table comparing types in kg. Only qualitative direction, plus 8-10 kg added for HiPer Strut, and aluminium links on Audi. A Fahrwerkhandbuch copy would be the place.
- **Semi-trailing arm angles:** 15-25° plan and 3-8° side, BMW E30 at 15°, and a camber-gain formula appear only in an [unsourced Firgelli blog, E](https://www.firgelliauto.com/blogs/mechanisms/semi-trailing-arm-suspension). Treat as not verified. Forum and patent hints agree qualitatively that plan-view angle sets camber gain.
- **Camber and toe values in degrees per unit travel** for any production type: none found. Do not invent them.
- **"First series pushrod car" (Aventador):** from memory, without source, earlier road cars such as the Ferrari F50 used pushrod-operated inboard units, so the marketing claim may be false. **Not verified.**
- **Three-link live axle examples:** from memory, Alfa Romeo 105 with T-link and some Fox-era Mustang descriptions. **Not verified**, and no good source found for 3-link production cars.
- **Watt on RX-7 and Crown Victoria:** from memory. Search returned nothing, so **not verified**.
- **Renault PerfoHub:** name and mechanism from memory only. One excerpt confirms an "independent pivot" Mégane RS. Mk3 Focus RS and Mk3 ST status **not verified**.
- **Renault 5 unequal wheelbase from staggered transverse torsion bars:** from memory, the search found nothing. **Not verified.**
- **BMW Z-axle layout:** sources conflict.
- **MacPherson patent and Guy-Mollart:** no source read mentions Guy-Mollart.
- **Why Ford dropped the live axle in 2015:** no primary statement found, only enthusiast explanations.

## What each spring, damper and interconnection medium changes physically

### Takeaway
The media axis is independent of the linkage axis, and it changes the force law, not the wheel path: steel gives a fixed rate, gas gives a rate that scales with load, rubber gives a rising rate, active systems add energy and can move the body, semi-active can only dissipate, and interconnection makes stiffness differ by mode (roll versus warp versus pitch). A few media (leaf, some bars) also locate or couple the wheels, so they cross into kinematics.

### Cited Findings

#### Steel springs
- **Coil:** coils do not locate, so they require extra links on live axles — [Wikipedia Hotchkiss, wiki, R](https://en.wikipedia.org/wiki/Hotchkiss_drive). They allow softer ride on torque-tube axles — [Wikipedia Torque tube, wiki, R](https://en.wikipedia.org/wiki/Torque_tube)
- **Leaf, steel:** spring and locator in one, see Hotchkiss. **Leaf, composite transverse:** Volvo XC90 (2015) rear, saving about 4.5 kg per car per supplier — [Reinforced Plastics, press, E](https://www.reinforcedplastics.com/content/news/volvo-xc90-features-polyurethane-composite-leaf-spring); [CompositesWorld, press, E](https://www.compositesworld.com/news/benteler-sgl-to-supply-composite-leaf-springs-for-new-volvo-xc90). Wikipedia says 5 kg — [mirror, wiki, E](https://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq.ipfs.4everland.io/wiki/Corvette_leaf_spring.html). Corvette FRP mono-leaf replaced a 22 kg steel spring with a 3 kg one on the C3 option — [Wikiwand, wiki, E](https://www.wikiwand.com/en/Corvette_leaf_spring); a forum source says 15 kg saved, and that conflicts — [ForABodiesOnly, forum, E](https://forabodiesonly.com/mopar/posts/1974106538/printfriendly)
- **Torsion bar:** the bar twists around its axis, stiffness from length, section, shape, material; preload adjusts ride height — [Wikipedia mirror, wiki, E](https://ipfs.ssi.eecc.de/ipns/en.wikipedia-on-ipfs.org/wiki/Torsion_bar_suspension). Traction Avant 1934; Porsche 356 and 911 until the 964 in 1989; Chrysler Torsion-Aire — same source. Packaging: very narrow arches with no strut domes — [de.wikipedia Längslenkerachse, wiki, R](https://de.wikipedia.org/wiki/Längslenkerachse)

#### Gas
- **Air:** compressor, reinforced rubber bellows, height depends on pressure, so ride height holds regardless of load; kneeling and lowering at speed possible. Cadillac Eldorado Brougham 1957 is the first major production standard; Buick 1958, Rambler dropped for 1960; Borgward P 100 1960; Mercedes W112; Range Rover Classic 1993 ECAS — [Wikipedia Air suspension, wiki, R](https://en.wikipedia.org/wiki/Air_suspension). Mercedes 600 dated 1963 — [Wikipedia ABC, wiki, R](https://en.wikipedia.org/wiki/Active_Body_Control), versus 1964 on the air page
- **Key physics:** supporting force equals internal pressure times effective area; rate changes in proportion to body weight while body natural frequency stays constant — [Audi SSP 242 via ManualsLib, mfr, E](https://www.manualslib.com/manual/807466/Audi-A6-242.html?page=21)
- **Porsche three-chamber:** switching chambers doubles stiffness "practically" across four settings — [Vibracoustic, mfr, E](https://vibracoustic.com/en/press-release/new-porsche-cayenne-equipped-with-vibracoustic-three-chamber-air-springs/)
- **Hydropneumatic (Citroën):** sphere with a rubber membrane, nitrogen up to 75 bar on top, incompressible fluid underneath; piston forces fluid and compresses gas. Damping through a two-way leaf valve at the sphere neck. Engine-driven pump at about 150-180 bar also powered brakes and steering. Height correctors linked to anti-roll bars, slow to avoid reacting to bumps — [Wikipedia Hydropneumatic, wiki, R](https://en.wikipedia.org/wiki/Hydropneumatic_suspension)
- **Hydropneumatic timeline:** Traction Avant 15CVH rear 1954; DS 1955; LHM fluid 1967; Silver Shadow licence 1965; Hydractive 1 (XM 1989) with auto switch to firm; Hydractive 3 (C5 2001) with no central pressure; Hydractive 3+ extra spheres; Activa with active bars on Xantia from 1993, option 1995; BYD Yangwang U8 and U9 2023 — same source. Magès wartime origins — [Paul Magès Wikipedia, wiki, E](https://www.wikipedia.org/wiki/Paul_Mag%C3%A8s)
- **End and successor:** C5 X7 2007-2017 — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Hydropneumatic_suspension). PHC is a conventional spring and damper with hydraulic stops at both ends of damper travel, replacing spheres because of cost and to reach small cars — [Motor Authority, press, E](https://www2.motorauthority.com/news/1104533_citroen-advanced-comfort-suspension-bids-adieu-to-hydropneumatics); [OneShift, press, E](https://www.oneshift.com/articles/news/allnew-2019-citroen-c5-aircross-suv-progressive-hydraulic-cushions-for-a-magic-carpet-ride). So PHC is not a gas spring, and the name invites confusion

#### Rubber and fluid (Moulton)
- **Dry cone:** Mini 1959-2000 rubber and steel cone, ball-jointed to the strut. Early work as engine mounts — [Moulton sources, search excerpt, E](https://moultontrust.org/moulton-and-the-mini)
- **Hydrolastic:** fluid displacers with rubber spring and damper valves, interconnected front and rear on each side. Pitch moves fluid front to rear, pressure roughly constant, so it stays soft. Roll transfers no fluid, pressure rises, it stays stiff. Rising rate from growth of effective area. Cars squat and dive. ADO16 1962, Mini 1964-71, ADO17, Maxi, 3-Litre — [Wikipedia Hydrolastic, wiki, R](https://en.wikipedia.org/wiki/Hydrolastic)
- **Hydragas:** nitrogen spheres replace rubber, pre-charged, no engine-driven pump unlike Citroën. Allegro 1973, Princess, Ambassador, Rover Metro, MGF — same source. MGF last, Longbridge 2002 — [search excerpt, E](https://Www.wikipedia.org/wiki/Hydragas). Mini reversion date conflicts between 1969 and 1971

#### Interconnection
- **2CV:** horizontal cylinders hold two springs, one for each wheel, with pull rods from front leading and rear trailing arms, so a front bump pulls the cylinder forward and drops the rear wheel on that side. Reduces pitch, weakens when both compress — [Wikipedia 2CV, wiki, R](https://en.wikipedia.org/wiki/Citro%C3%ABn_2CV). The 2CV also used tuned mass and friction dampers — same source
- **KDSS (Toyota and Lexus):** hydraulic cylinders on front and rear stabilisers, piping and control cylinder on the rail, purely mechanical, no driver action; GX 470 2004; Land Cruiser 2008; 2024 Land Cruiser moved to a front Stabilizer Disconnect (SDM) instead — [Wikipedia KDSS, wiki, R](https://en.wikipedia.org/wiki/Kinetic_Dynamic_Suspension_System). Passive with no switch — [Capital One Auto, press, E](https://www.capitalone.com/cars/learn/finding-the-right-car/what-is-toyotas-kdss/2948); [Trail4Runner, blog, E](https://trail4runner.com/2024/02/06/what-is-toyota-kdss-why-do-you-want-it/). No circuit diagram found
- **McLaren hydraulically linked dampers (P1, 650S, 720S, Senna):** compression chamber on one side linked to rebound chamber on the other; accumulators change roll stiffness by mode; no bars — [Car and Driver via Yahoo, press, R](https://autos.yahoo.com/explained-myriad-ways-modern-vehicles-162000518.html)

#### Anti-roll bars
- Torsion rod linking left and right, moving force from the compressing side to the other. Cost: a straight-line one-wheel bump also disturbs the other side — [Car and Driver via Yahoo, press, R](https://autos.yahoo.com/explained-myriad-ways-modern-vehicles-162000518.html)
- **Split actuator:** motor or hydraulic servo twists two half-bars (Bentayga, X5, LC500, Cayenne, Panamera). **PDCC on 911:** hydraulic active end links. **Disconnect:** Wrangler Rubicon since 2007, 30% larger ramp index on two-door JL, reconnects at 18 mph — same source. PDCC Sport: 48 V motor, sensor board, gearbox, only draws when active — [Porsche newsroom, mfr, E](https://newsroom.porsche.com/en/christophorus/porsche-christophorus-panamera-pdcc-sport-system-13424.html). Bentley up to 959 lb-ft per bar, about 0.06 s — [repost of Car and Driver, forum, E](https://foreverpontiac.com/forums/topic/9331-car-and-driver-deep-dive-bentley-dynamic-ride-explained/). Lexus 42 V system 2005 precedes Bentley's "first 48 V" claim — same source

#### Dampers: semi-active and valve
- **MR:** synthetic oil with iron particles; coils in the piston align them into chains and raise resistance, with no mechanical valves; third-generation two coils reduced eddy-current delay. Delphi; Seville STS 2002.5; C5 Corvette 2003; BWI bought IP 2009; Ferrari, Lamborghini, Audi — [Wikipedia MagneRide, wiki, R](https://en.wikipedia.org/wiki/MagneRide). Up to 1000 adjustments per second, 1-10 micron carbonyl iron at 20-40% by volume — [Autocar Professional, press, E](https://autocarpro.in/feature/design-development-applications-magneride-suspension-6686)
- **DSSV (Multimatic):** passive spool valve with ported spool instead of shim stacks; claimed force loss from 30°C to 120°C under 4% versus 14% poppet and 16% shim. Aston One-77, Camaro Z/28 2014 — [Multimatic, mfr, E](https://www.multimatic.com/case-studies/multimatic-dssv-in-the-beginning); [GM Authority, press, E](https://gmauthority.com/blog/2017/11/whats-going-on-inside-a-multimatic-dssv-damper/). Figures are the maker's own
- **Lexus Roll Posture Control (LC500, LS500):** adjustable dampers make small wheel movements, 10-12 ms, 650 steps; roll must start first — [Car and Driver via Yahoo, press, R](https://autos.yahoo.com/explained-myriad-ways-modern-vehicles-162000518.html)
- Semi-active approximates skyhook damper force by setting damping closest to the wanted force. Skyhook: Karnopp 1974. Lotus modal control ran in parallel. Broad-band active was too costly in energy and money — [D. Williams, SAE 10-02-02-0010, SAE, E](https://saemobilus.sae.org/content/10-02-02-0010); [MDPI, journal, E](https://www.mdpi.com/2075-1702/13/8/727)

#### Fully active
- **ABC (Mercedes, 1999 CL C215):** hydraulic servo at each strut extending or shortening, 13 sensors at 10 ms, pump about 3000 psi, control up to about 5 Hz. ABC Plus 2006 cut roll 45%. Magic Body Control W222 2013: stereo camera up to 15 m, up to 130 km/h. Active Curve Tilting C217 2014 at 2.5° and RWD only — [Wikipedia ABC, wiki, R](https://en.wikipedia.org/wiki/Active_Body_Control). Car and Driver gives 2.7° — [Yahoo, press, R](https://autos.yahoo.com/explained-myriad-ways-modern-vehicles-162000518.html)
- **E-ABC (GLE V167, 2019):** Airmatic air springs plus 48 V electrohydraulics. Each damper has adjustable valves on both chambers and an accumulator, and a motor-pump unit builds a pressure difference that gives active force — [Bilstein, mfr, R](https://bilstein.com/de/das-vielleicht-intelligenteste-suv-fahrwerk-der-welt). Tilt up to 3° and 30-160 km/h come from excerpts, not on the Bilstein page when read; check Mercedes sources — [MB Passion, blog, E](https://mbpassion.de/2018/10/das-neue-e-active-body-control-des-neuen-gle/); [Carbiketech, blog, E](https://carbiketech.com/?p=19354)
- **Audi A8 predictive active:** motor at each corner, gears, tube with internal titanium torsion bar, lever up to 1100 Nm via a coupling rod, working with air springs; camera 18 scans per second; raises the struck side 80 mm in 0.5 s before side impact, claim of up to 50% lower occupant load — [New Atlas, press, E](https://newatlas.com/audi-a8-proactive-48v-suspension/50172); [Vehicle Dynamics International, press, E](https://www.vehicledynamicsinternational.com/news/oem-news/audis-48v-active-suspension-has-electrifying-potential.html). 2.7 hp motor and heavy, redundant springs — [Car and Driver via Yahoo, press, R](https://autos.yahoo.com/explained-myriad-ways-modern-vehicles-162000518.html)

#### Inerter
- Force is proportional to relative acceleration between terminals, inertance in kg. Rack and flywheel or differential constructions; effect similar to adding sprung inertia; tuned, it reduces tyre load oscillation. Smith paper 2002 — [Wikipedia Inerter, wiki, R](https://en.wikipedia.org/wiki/Inerter_(mechanical_networks))
- Conceived 1997; McLaren won the 2005 Spanish GP; "J-damper" decoy name; plunger spins a flywheel; Penske licence — [University of Cambridge, univ, R](https://www.cam.ac.uk/research/news/secrets-of-the-inerter-revealed). Filled the missing analogue of a capacitor in spring and damper networks; 2007 spy scandal link; first at Imola 2005 — [Cambridge Engineering and Autosport excerpts, univ, E](https://www.eng.cam.ac.uk/node/552). Road car benefit undetermined — [Design News, press, E](https://www.designnews.com/automotive-engineering/inventing-the-race-car-stabilizing-inerter)

### Inferences
**Not verified: standard mechanics and my mapping, not from a cited source.**

| Medium | Force law | Modes affected | Wheel path changes? | Show on a model |
|---|---|---|---|---|
| Coil | F = kx | All equally, except via geometry | No | Spring compresses, no novelty |
| Leaf | Bending plus location | All, plus axle wind-up | Yes on Hotchkiss | Leaves flex, axle rotates under torque |
| Torsion bar | T = kθ | All | No | Bar twists, moved packaging |
| Air | Pressure × area, stiffening with compression | Rate scales with load | No | Pressure gauge, load slider with same bounce frequency |
| Hydropneumatic | Gas spring plus valve | As air, self-levels | No | Sphere diaphragm, height holds under load |
| Rubber cone | Rising rate | Heave | No | Short travel, non-linear curve |
| Hydrolastic and Hydragas | Pressure shared front to rear | Pitch soft, roll and heave stiff | No | Fluid moves on a front bump, not in roll |
| Passive bar | Torque ∝ left-right difference | Roll, single-wheel only | No | Bar twists only in roll |
| Active bar | Commanded torque | Roll | No | Motor counters lean |
| KDSS, McLaren | Hydraulic mode split | Roll stiff, warp soft | No | Switch between roll and articulation |
| MR or adaptive damper | F = c(v), c varies | Damping only | No | Particle chains, no spring change |
| Active (ABC, e-ABC, Audi) | Adds force or length | Heave, pitch, roll, can tilt | No | Body leans inward |
| Inerter | F = b·a(rel) | Transient, tyre load | No | Flywheel spins with bump speed |

- Semi-active dampers cannot push, only resist, so they can only reduce roll speed and never hold the body against steady cornering. That is the sharp line between MR and ABC.
- A fair way to explain interconnection on the site: show four corners, and a mode selector (heave, pitch, roll, warp), with a stiffness per mode. That single diagram explains bars, Hydrolastic, KDSS, and McLaren together.
- Air springs do not "make a car soft". They mainly decouple ride frequency from load, and they can be stiffer in a sport setting.

### Gaps
- No textbook-level comparison of natural frequency or rate curves by medium was reachable.
- **KDSS hydraulic circuit:** the roll-versus-warp behaviour is partly inferred. Toyota's explainer returned HTTP 410. Worth finding a patent.
- **Last hydropneumatic Citroën:** no exact end date. The 2017 figure is Wikipedia's range for C5 X7.
- **PDCC, Bentley and Audi first-production dates:** not fully confirmed. Lexus 2005 is excerpt-only.
- **Bose electromagnetic suspension and ClearMotion:** not researched. Porsche Active Ride: not researched.
- **Moulton cone rate curves:** none found.
- **Conflict left unresolved:** Mercedes curve-tilt angle is 2.5°, 2.7° or 3° depending on source and generation.

## Which common beliefs are myths or oversimplifications

### Takeaway
Almost every "X is better" claim fails because type names hide huge variation, and because comparisons mix suspension with tyres, power and tuning; but most myths also contain a real limit, and this should be taught rather than erased. Lap records are weak evidence, and manufacturer statements need the same scepticism as folklore.

### Cited Findings

#### "Multilink is always better"
- The number of possible designs grows disproportionately with link count, so no single performance profile can be stated — [de.wikipedia Radaufhängung, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung). "Multi-link" is a loose term — [Road & Track on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html)
- Mazda's Fujiwara on the 2019 Mazda3: the torsion beam switch was "definitely not on cost grounds", and is "much, much better than multi-link suspension in terms of road noise"; Mazda benchmarked the Peugeot 308 T9 bushes — [GoAuto, press, R](https://www.goauto.com.au/motor-show/frankfurt/2017/65426.html). This is a manufacturer defending its decision; no independent measurement found
- For balance, Milliken says it "gets rid of a lot of trade-offs" and W201 was a real leap over semi-trailing rivals — [Road & Track on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html)

#### "Torsion beam is bad, only used to save money"
- Honda Civic Type R FK2 with a torsion beam rear lapped the Nürburgring in 7:50.63 as a FWD record; FK8 multilink later beat it by nearly seven seconds — [Car Throttle, press, E](https://www.carthrottle.com/news/watch-fk8-and-fk2-honda-civic-type-r-ring-laps-side-side?page=0); [Powerflex, mfr, E](https://powerflex.co.uk/blog/nl2024-28-honda-civic-type-r-fk2-rear-beam-bush)
- Renault Mégane RS Trophy-R with torsion beam took the FWD record, at 7:40.100 or 7:45.389 depending on the source and likely the course length — [evo and Top Gear excerpts, press, E](https://www.evo.co.uk/renault/megane-275-trophy/201699/renault-megane-trophy-r-2020-review-is-renaults-record-breaker); [Top Gear, press, E](https://www.topgear.com/car-news/hot-hatch/watch-honda-civic-type-r-rip-new-nurburgring-lap-record)
- Peugeot 308 II passed the moose test at 82 km/h; good handling is possible, but real limits on camber, toe under force, harshness and recession — [Wikipedia Twist-beam, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)
- **Yet cost is real:** VW brought it back on Golf VII "for cost reasons" — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Verbundlenkerachse); about €100 per car saved — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)

#### "Solid axle is primitive"
- Four rod links give a kinematically defined axle path — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung). On the De Dion form, camber changes only on one-wheel bumps, near-zero camber helps traction with wide tyres, and unsprung mass is lower than a live axle — [Wikipedia De Dion, wiki, R](https://en.wikipedia.org/wiki/De_Dion_tube)
- **Mustang case:** the IRS was dropped for 2005 to save "$100 per car", and the axle later reportedly cost $98 more after being made acceptable; report via AutoGuide citing Motor Trend — [AutoGuide, press, R](https://www.autoguide.com/auto-news/2009/06/independent-rear-scrapped-for-mustang-so-ford-could-save-100-a-car.html)
- Top-flight racing used solid axles until recently (NASCAR through 2021, V8 Supercars with Watt until 2012) — see links above. A Ford engineer's opposite view: 1960s-70s technology, and adjustability was limited
- Aftermarket sources report S550 IRS wheel hop and weakness on drag slicks, commercial and needing care — [Steeda, blog, E](https://www.steeda.com/solid-rear-axle-vs-independent-rear-suspension)
- De Dion is returning on EVs. See Wikipedia list above

#### "MacPherson is a cheap, non-sporty design"
- Porsche 911 ran front struts from the 964 (1989) until the double-wishbone 992 GT3; Cayman GT4 keeps them; Boxster and Cayman use rear struts because they package well with a mid engine — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/MacPherson_strut); [Road & Track on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html)
- Honda's material credits the Accord's move to struts with lower NVH and weight, while crash compliance as a reason is only secondhand — see Accord above
- **Real limit:** even Porsche moved its most track-focused road 911 away from them — [Porsche Newsroom, mfr, E](https://newsroom.porsche.com/en/press-kits/911-GT3/Chassis-and-dynamics.html); dual-axis designs exist precisely because of the kingpin offset limit

#### "Swing axle Corvair was inherently a killer"
- NHTSA's 1972 evaluation found the 1960-63 Corvair's handling and stability did not create abnormal potential for loss of control or rollover, and compared favourably with contemporaries — [NTRL abstract, gov, E](https://ntrl.ntis.gov/NTRL/dashboard/searchResults/titleDetail/PB211015.xhtml); testing by Texas Transportation Institute under NHTSA, with an independent panel — [NHTSA report PDF, gov, E](https://rosap.ntl.bts.gov/view/dot/92396/dot_92396_DS1.pdf); [NTRL panel, gov, E](https://ntrl.ntis.gov/NTRL/dashboard/searchResults/titleDetail/PB211014.xhtml)
- The car understeered to about 0.4 g and shifted to oversteer around 0.4-0.5 g — [GM Authority, press, E](https://gmauthority.com/blog/?p=788194). Nader rejected the earlier 1970 study. The jacking mechanism is real — [Ate Up With Motor, press, R](https://www.ateupwithmotor.com/model-histories/chevrolet-corvair-history/3/)
- Low-pivot swing axles stayed on the Mercedes 280SE and 300SEL until 1972, and the 300SEL 6.3 was reportedly the fastest production sedan of its time — [Wikipedia Swing axle, wiki, R](https://en.wikipedia.org/wiki/Swing_axle)

#### "Less unsprung mass is always decisive"
- Anderson (Lotus) and Harty (Dunamos), AVEC 2010, ballasted a 2007 Focus with 30 kg per wheel: noticeable to a trained driver, small, moved it from "class leading to mid class", recoverable through usual tuning of bushes, top mounts, steering and damping. Tyre and tuning differences matter more — [TTAC report, press, R](https://www.thetruthaboutcars.com/2013/04/heresy-unsprung-lotus-engineering-unsprung-weight-doesnt-really-matter-much/?print=1); [Protean abstract, mfr, R](https://www.proteanelectric.com/resource-centre/a-study-on-unsprung-mass/)
- **Conflict of interest:** commissioned by Protean, an in-wheel-motor maker — same. Autocar was sceptical — [Autocar, press, E](https://autocar.co.uk/node/154309). Also "class leading to mid class" is still a loss

#### "W201 was the first multilink"
- Definition-dependent: W201 1982 is the usual answer — [Daimler text, mfr, R](https://in.marketscreener.com/quote/stock/MERCEDES-BENZ-GROUP-AG-436541/news/Daimler-AG-The-significance-of-the-W-201-The-compact-vehicle-successfully-opened-up-a-new-market-17820344), but Weissach 1978 is multilink in one account and C4 Corvette appeared months later. Earlier Corvette and Jaguar designs used separate links plus the halfshaft

#### "Pushrod is the racing answer" and "pull beats push"
- 2023 and 2024 grids split both ways, with Anderson's scores showing a preference and conceding hard-to-research factors. Formula1.com says teams often mix front and rear — [The Race, press, R](https://www.the-race.com/formula-1/gary-anderson-key-design-dilemma-facing-every-f1-team/); [Formula1.com, press, R](https://www.formula1.com/en/latest/article/explainer-whats-the-difference-between-pull-rod-and-push-rod-suspension.1I3wL4LEL0nQZbKZbx1Dhz)

### Inferences
**Not verified: my derivations.**

- **"A solid axle has no camber change" is only true in pure roll and heave.** One-wheel bump tilts the whole axle and changes camber on both wheels.
- **"Swing axles have terrible camber" needs splitting.** A central-pivot swing axle in pure body roll keeps each wheel's camber relative to the road nearly unchanged, since the shaft stays still and the body rotates around it. All the trouble is in heave and jacking. That is a surprising, teachable finding.
- **General relationship.** With front-view swing arm length L measured to the instant centre, and track t, camber change in roll relative to the road is about φ(1 − t/2L), and in bump relative to the body is z/L. So L → ∞ (parallel equal arms, trailing arm) gives full body-roll camber. L = t/2 (centre-pivot swing axle) gives zero in roll but maximum in heave. This one equation unifies the types and shows the fundamental trade-off. Should be checked against Dixon or Milliken.
- **Lap records prove a low bar, not superiority.** They show a beam does not prevent a very fast FWD car, since on FWD the rear does little driving work. It would be dishonest to generalise to RWD. [Evo Malaysia, press, E](https://evomalaysia.com/2019-mazda-3-malaysia-review) notes multilink is superior for on-the-edge driving but the rear does less work on FWD.
- **Bushes confound NVH claims.** Mazda's NVH claim and Opel's softer bushes behind a Watt suggest the real variable is often the bush and its separation from location duties, not link count.

### Gaps
- I found no independent, controlled measurement comparing beam and multilink on the same car, in NVH or handling. All comparisons are confounded.
- Autoguide's $100/$98 claim comes through a secondary report; the Motor Trend original not read.
- Full Anderson and Harty paper not read, only abstract and press.
- NHTSA PDF exceeded the size limit and the abstract page timed out, so those are excerpts.
- Racecar Engineering pieces did not appear in search results, so not used.
- "Double wishbone gives perfect camber" and "stiffer is better" were not researched as distinct myths.

## Which kinematic distinctions a learner can actually see on a 3D model

### Takeaway
The visible differences are in the path and in the coupling (which plane the wheel arcs in, whether wheels tilt with body or road, whether the opposite wheel reacts, whether track changes), not in small camber numbers. The one quantified example I found moves camber by only 0.25° for a 20 mm pickup change, so differences between well-sorted independents probably need reference overlays, a graph, or labelled exaggeration (no production camber curves were found to confirm this generally); compliance effects such as recession, Weissach toe and NVH can only be shown as an honest animation or text.

### Cited Findings
- **Scale warning:** on a double wishbone, lowering inboard upper pickups about 20 mm changed mid-corner camber about 0.25° per side and gave about 2.1% grip, about 1 km/h at 93 km/h, by tyre-model calculation — [OptimumG, consultancy, R](https://optimumg.com/suspension-kinematics-and-its-effect-on-performance/)
- **Instant centre and swing arm:** lines through the arms intersect at an instant centre; line from contact patch to it gives the roll centre; a longer virtual swing arm produces less camber change, and parallel equal wishbones make it effectively infinite — [HP Academy, training, E](https://www.hpacademy.com/courses/suspension-tuning-and-optimization/suspension-geometry-instant-centre/); [Firgelli, blog, E](https://www.firgelliauto.com/en-de/blogs/mechanisms/double-wishbone-suspension). Rolls and pitch move the centre — [HP Academy forum, forum, E](https://www.hpacademy.com/forum/suspension-tuning-and-optimization/show/what-should-my-roll-center-movement-look-like/)
- **Trade-offs framed:** low or high roll centre, large or zero camber gain in roll; non-linear motion ratio may shift balance — [OptimumG, consultancy, R](https://optimumg.com/suspension-kinematics-and-its-effect-on-performance/)
- **Directly visible per sources:**
  - Trailing arm: wheel parallel to the body centre plane, so wheel leans with body — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Verbundlenkerachse); arcs in a longitudinal plane — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Längslenkerachse)
  - Twist beam: both up equals no camber change, one up shows camber and toe — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Twist-beam_rear_suspension)
  - Semi-trailing: toe-in and negative camber in bump, pivot axis oblique — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Schräglenkerachse)
  - Swing axle: wheel perpendicular to shaft, big camber — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Swing_axle)
  - Sliding pillar: no camber change, track varies by hypotenuse — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Sliding_pillar)
  - De Dion: opposite wheel changes camber — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/De_Dion_tube)
  - Panhard: body and axle shift sideways by the rod's arc — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Panhard_rod)
  - Watt: figure-eight centre trace — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Watt%27s_linkage)
  - Multilink wheel recession on bump — [Road & Track on AOL, press, R](https://www.aol.com/why-multi-rear-suspension-popular-171500831.html)
  - Dual-axis: separate steering axis nearer the wheel centre, can be drawn — [CarTechnical, press, R](https://cartechnical.co.uk/jargonbuster/23-r/137-revoknuckle)
  - Bars twist in roll and are disturbed by a one-wheel bump — [Car and Driver via Yahoo, press, R](https://autos.yahoo.com/explained-myriad-ways-modern-vehicles-162000518.html)
- **Hard to see:** elastokinematic effects, because they come from bush deflection — [de.wikipedia, wiki, R](https://de.wikipedia.org/wiki/Radaufhängung); Weissach toe under deceleration — [Wikipedia, wiki, R](https://en.wikipedia.org/wiki/Weissach_axle); Twist-beam toe under lateral force and its bush-based correction; torque steer from offset

### Inferences
**Not verified: my teaching proposals, derived from geometry.**

| Distinction | Demonstrates | Visibility at true scale | Suggested device |
|---|---|---|---|
| Wheel-tilt in body roll | Solid vs trailing vs SLA vs swing axle | Strong for solid and trailing, weak among good independents | Rear view with road plane, roll slider, degrees label |
| Opposite-wheel reaction on one-wheel bump | Solid and De Dion vs twist beam vs independent | Very strong | Lift one wheel; colour the other |
| Plane of wheel arc | Trailing vs semi-trailing vs swing | Strong from above and rear | Trace the wheel-centre path as a line |
| Track change | Swing axle, strut, sliding pillar vs parallel | Strong for swing axle, modest otherwise | Ground trace of contact patch |
| Jacking | Swing axle vs low pivot | Strong | Lateral-force slider, body rises |
| Instant centre and roll centre | SLA vs strut vs swing axle | Abstract but very clear | Extended link lines, live intersection |
| Steering axis and offset | Strut vs dual-axis vs virtual axis | Strong as a line, invisible as a force | Draw axis line and offset at hub, torque-steer arrow marked as schematic |
| Link roles | Multilink | Strong with colour | Highlight one link, freeze it or remove it and show which DOF returns. Removing a link and watching the wheel go loose would be a great way to teach constraints |
| Panhard vs Watt | Live axle | Modest at true scale, very strong when exaggerated | Top-of-axle marker with trace |
| Axle wind-up | Leaf | Moderate | Torque slider, leaves form an S |
| De Dion vs live | Unsprung visible as coloured mass | Strong | Colour sprung and unsprung parts |
| Twist-beam twist | Beam | Moderate | Heat-map or exaggerated twist |
| Bar twist, modes | Bars, Hydrolastic, KDSS | Strong in mode selector | Heave, pitch, roll and warp buttons |
| Toe | Most types | Weak, fractions of a degree | Long laser lines on the wheel plus a graph |
| Camber number differences | SLA vs strut | Weak | Graph with curves overlaid against a reference type |
| Recession, compliance steer | Multilink, Weissach, twist beam | Weak or none in rigid model | Explicit schematic mode |

- **Always plot next to the model:** camber versus travel, toe versus travel, track versus travel, and camber relative to road versus roll. For true-scale honesty, the graph should remain the source of truth when the 3D is exaggerated.
- **Exaggeration should be labelled**, as the site's existing «Наочно» mode already separates demonstration from real motion.
- **A shared "same car" base** with identical track and wheel size would make type comparisons legitimate, otherwise differences reflect hard points chosen, not type.
- **Real hard points are mostly unpublished**, so a page should say "typical schematic, not the actual car". Do not imply that a model is the geometry of a named production car.
- **Honest-model warning:** a rigid-body solver has no bushes. So a page should state that NVH, recession tuning and compliance steer, which are the reason for much of multilink's existence, are outside the model. That also helps with the myth section: it stops a learner concluding that a type's value is its visible motion.

### Gaps
- No published production hard points or factory camber curves were found for any named car. Representative values must be labelled schematic or sourced from Dixon, or teardown data.
- [Suspension Secrets FVSA page](https://suspensionsecrets.co.uk/front-view-swing-arm) returned HTTP 403, so its rules were not read.
- No study of what learners perceive in suspension animations was found or searched.
