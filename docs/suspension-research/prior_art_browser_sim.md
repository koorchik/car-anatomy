# Prior art for interactive suspension tools and browser simulation

Notes compiled 2026-10-31. All library versions and sizes are as of this date.

Evidence tags used on every claim:
- **[V1]** verified: I opened the page or inspected the package myself.
- **[V2]** verified only through a search-result summary of that URL. I did not read the full page, so treat exact wording with care.
- **[M]** measured by me locally. Method is stated beside the number.
- **Not verified** claims appear only under Gaps. Everything under Inferences is my reasoning, not a sourced fact.

Access limits that shape these notes: YouTube pages returned titles only, overtake.gg returned HTTP 403, `aws.carsim.com` did not resolve, and Context7 was not available in this session (only its authentication stub), so library facts come from npm tarballs, typings and the vendors' own docs.

## Professional and enthusiast tools: what they output and which visualisations are standard

### Takeaway
Curves of geometry versus wheel travel are the universal output, and they are usually paired with roll-centre and instant-centre positions. MMM and g-g diagrams belong to a separate vehicle-dynamics layer that the geometry tools I could check do not offer. I found no tool that connects both layers in a browser.

### Cited findings

| Tool | Scope and outputs | Evidence |
|---|---|---|
| Lotus Suspension Analysis / SHARK | Results as curves of geometry change as one element varies, with several curves open at once to compare modifications. Outputs include camber, castor, toe, kingpin angle, spring and damper ratios, CG and roll-centre position, brake steer. | [V2] [Machine Design](https://www.machinedesign.com/archive/auto-suspension-design-made-easy) |
| Lotus (continued) | Graphs and numerical listings that can feed other software; curves for bump steer, roll-centre height and tyre vertical forces. | [V2] [Machine Design](https://www.machinedesign.com/archive/article/21817564/auto-suspension-design-made-easy) |
| Lotus (continued) | Hardpoint tolerance effects on derivatives, and a compliance analysis with bush stiffness. Source is a user-uploaded product sheet, not Lotus. | [V2] [Scribd](https://www.scribd.com/document/700211654/Shark-insert) |
| OptimumKinematics | Roll, pitch, heave and steering can be defined at once, with real-time 3D visualisation of the combined motion. Points are editable directly in 3D. Older help file, may not match the current version. | [V2] [Scribd help file](https://www.scribd.com/document/111202422/OptimumKinematics-Help-File) |
| OptimumG suite | Brochure claims more than 500 inputs and outputs in 2D and 3D graphs, tables and animations. This appears to describe the suite, not OptimumKinematics alone. | [V2] [Brochure](https://www.epartrade.com/uploads/contents/048623fb-5dc7-11e8-be4b-560001755c9c/2018/05/OptimumGCompanyBrochure.pdf) |
| SusProg3D | Over 40 suspension systems. Roll centre, swing-axle lengths, camber, castor and scrub in roll and bump, bump steer, toe-out in turn, wheel rate through travel, anti-roll bar rates, dynamic chassis roll with weight transfer, driveshaft plunge. 64-bit Windows with OpenGL. | [V1] [Developer page](https://www.bevenyoung.com.au/suswin.htm) |
| SuspensionSim (CarSim family) | Quasi-static K&C tests, parametric models and reusable templates. | [V2] [Handout](https://aws.carsim.com/downloads/pdf/SuspensionSim_Handout_Letter.pdf) (direct fetch failed) |
| Adams/Car | Only indirect evidence: a Formula Student thesis simulated roll centre, scrub radius, camber, caster and toe. | [V2] [UiS thesis](https://uis.brage.unit.no/uis-xmlui/handle/11250/219965) |
| Adams/Car (continued) | A paper-level example of steady-state and transient analysis used to set suspension parameter changes. | [V2] [SAE 2007-01-0861](https://saemobilus.sae.org/papers/a-new-hybrid-bi-fuel-vehicle-suspension-development-2007-01-0861) |
| Racing Aspirations | Multi-link calculator with drag-and-drop placement and plotted roll and instant centres. | [V2] [App Store](https://apps.apple.com/app/id1076512172) |
| Racing Aspirations (continued) | A MacPherson calculator released in 2014 with roll centre, instant centre and bump steer. | [V2] [750MC](https://750mc.co.uk/news,free-geometry-calculator-from-racingaspirationscom_223.htm) |
| Racing Aspirations (continued) | Company replies say the roll centre is visualised only after subscribing. | [V2] [Trustpilot NZ](https://nz.trustpilot.com/review/racingaspirations.com) |
| Performance Trends analyzer | Some users need second-order curve fits of camber and bump steer, which suggests curve data export. | [V2] [Vendor page](https://performancetrends.com/SuspAnzr.htm) |

Standard visualisations, by evidence:
- **Camber, toe and track versus travel:** present across the tools above, and also in [ChassisCalc](https://chassiscalc.xyz/) [V1] and [GearheadCalc](https://gearheadcalc.com/a-arm-calculator) [V1].
- **Roll-centre migration:** ChassisCalc names "roll centre height and migration" [V1]. OptimumG's video material shows roll and pitch centres moving with vehicle motion [V2, [Scribd help file](https://www.scribd.com/doc/257619149/Help-File-Optimum-Kinematics)].
- **MMM / Milliken Moment Diagram:** yaw moment versus lateral acceleration, across ranges of sideslip and steer [V2, [SAE 2005-01-0417](https://saemobilus.sae.org/papers/implementing-milliken-moment-method-using-controlled-dynamic-simulation-2005-01-0417)].
- **MMM variants and metrics:** CN-AY (constant speed) gives stability index, understeer gradient, steering sensitivity, limit over/understeer and maximum steady-state lateral acceleration. CN-CY is constant radius [V2, [Milliken Research](https://millikenresearch.com/mmmsolution.html)].
- **g-g and g-g-g-v envelopes:** described as closely related to the MMM idea, using quasi-steady-state runs with constrained degrees of freedom [V2, [arXiv 2504.10225](https://arxiv.org/pdf/2504.10225)].

### Inferences
- The professional convention is a stack: hardpoints, then kinematic curves, then K&C, then steady-state handling diagrams. A teaching site can keep that order and hide the lower layers until the learner asks.
- MMM is expert-facing because it needs reading across two swept parameters. A simplified "balance through the corner" trace would carry the same message for a general reader.
- Commercial tools are Windows or licensed desktop products, so they are reference points for outputs, not competitors for this audience.

### Gaps
- **Not verified:** Lotus output names and plotting options from Lotus itself; I found no official manual.
- **Not verified:** official Adams/Car and CarSim output lists. Vendor documentation was not reached, and the [Applied Intuition page](https://appliedintuition.com/products/suspensionsim) I opened [V1] does not mention SuspensionSim, although the URL suggests it should. Current ownership or naming of the product is therefore unclear.
- **Not verified:** VSusp features. One forum reply from 2016 mentioned `vsusp.com` as free, and I could not identify or check more.
- **Not verified:** WinGeo3 features. Only forum mentions appeared, including a comparison with the Performance Trends analyzer.
- **Not verified:** tyre force ellipse or friction-circle plots as a standard output. No source in this research describes them, although they are widely assumed.

## Web and educational material: what teaches well, the common failure, and misconceptions

### Takeaway
Existing browser tools are calculators built around a 2D front view. The strongest evidence on teaching says interaction works only when the learner's own question drives it, and that open sandboxes without an authored path fail. I found no explorable in the style of Ciechanowski for suspensions.

### Cited findings

Existing web tools:
- **Jack Foster, Suspension Geometry Simulator:** 2D front-view double wishbone. Wheel travel is the main slider, with arm lengths, mount heights and F1, road and rally presets. Outputs are camber, roll-centre height, instant-centre distance and a camber curve. It adds a written walkthrough, a "skip to simulator" link and "?" buttons that link to theory. This is the closest pedagogical precedent I found [V1, [page](https://jrfoster09.github.io/portfolio/projects/suspension.html)].
- **Suspension Geometry Studio:** vanilla JS and SVG, MIT licence, double wishbone and MacPherson. Pivots are draggable. A mirror view shows roll-centre construction. The solver is circle intersection plus bisection, and it is front-view only [V1, [GitHub](https://github.com/drewtuttle/suspension-calculator)].
- **GearheadCalc A-arm calculator:** 3D orbit, draggable front view, travel slider and curves versus travel. The solver previews its result as a ghost with Apply or Discard. The model is a planar four-bar, and the page covers no dynamics [V1, [page](https://gearheadcalc.com/a-arm-calculator)].
- **ChassisCalc:** browser tool based on 2D kinematic theory, with anti-dive, bump steer, ride frequency and damper targets. Compare mode requires Pro at €19 per month excluding VAT. It describes no load transfer, tyre model or lap simulation [V1, [page](https://chassiscalc.xyz/)].
- **Speed-Wiz:** drag or roll the chassis while dotted instant-centre, roll-centre and kingpin lines update and can be toggled. A numeric list updates in real time. The page does not say whether this runs in a browser or is a download, so it may not be a web tool [V1, [page](https://speed-wiz.com/calculations/suspension/index.htm)].
- **RV Engine:** upload a car and adjust mass, suspension strength and damping, on a cannon-es raycast vehicle. It is a driving tool rather than an explainer [V2, [three.js forum](https://discourse.threejs.org/t/rv-engine-upload-drive-your-favorite-car-model-on-the-web-and-generate-physics-code/73549.md)].

Explorable structure:
- Ciechanowski's "Internal Combustion Engine" (2021-04-29) builds up from a crank and a toy engine with valves that open "magically", then adds real parts one by one. It uses a draggable 3D model at the top, cross-sections with hatching, sliders placed at the moment a concept appears, and a global pause. It says openly where things are simplified or not to scale [V1, [article](https://ciechanow.ski/internal-combustion-engine/)].

Evidence on learning (PhET, mostly college physics and chemistry):
- Students who only watch animations "rarely develop new ideas", and sense-making begins only after they interact [V1, [PhET interview study](https://phet.colorado.edu/publications/archive/PhET%20interview%20Paper%20Part%20I.htm)].
- Simulations are effective "only if the student's interaction with the simulation is directed by the student's own questioning" [V1, same source].
- Letting students change variables that do not matter makes misconceptions surface [V1, same source].
- Things that hurt, per the same study: lab-workbook looks with dense numbers, too-wordy labels, fun features that distract, controls disabled for non-physical reasons, and flawed defaults, because students trust the simulation heavily [V1, same source].
- "The more the students believe they know, the less they engage with the simulation" [V1, same source]. This matters here, since car enthusiasts arrive with confident beliefs.
- PhET's own evidence is more than 250 think-aloud interviews [V2, [PhET paper](https://phet.colorado.edu/publications/PhET%20Interview%20Paper%20Final.pdf), exact PDF not confirmed among the PhET results].

Common pedagogical failure:
- Most interactive widgets "dump the user in a sandbox and say 'figure it out for yourself'", and the author must provide structure [V2, [simblob post, mirror](https://scriptagc.wasmer.app/https_simblob_blogspot_com/2018/05/thoughts-on-explorable-explanations_html)].
- Controlled evidence is thin. One crowdsourced study (two studies of 125 participants each) found no significant differences among explanation methods, but it measured acceptance of visualisation design changes rather than learning [V2, [arXiv 2309.01445](https://ar5iv.labs.arxiv.org/html/2309.01445)].
- A Racing Aspirations reviewer said the tools work but wanted more explanation and found not everything intuitive [V2, [Trustpilot NL](https://nl.trustpilot.com/review/racingaspirations.com)].

Misconceptions with a source:
- "Roll centre" is used without saying which one. The kinematic roll centre, force-based roll centre and dynamic roll axis mean significantly different things, which "can lead to confusion about how roll centers influence vehicle behavior" [V1, [SAE 2014-01-0136 abstract](https://saemobilus.sae.org/papers/three-suspension-roll-centers-application-vehicle-dynamics-2014-01-0136)].
- The kinematic roll centre is easy to draw but hard to analyse, which leads to myths [V2, [Mitchell paper on Scribd](https://www.scribd.com/doc/196497829/Vehicle-Dynamics2007)]. A forum post makes a similar point about books and magazines [V2, [F1Technical](https://www.f1technical.net/forum/viewtopic.php?p=528166)].
- The setup slider is not the actual camber. Forum users note that the value in the setup is an adjustment, and that live camber differs because of tyre flex [V2, [LFS forum](https://www.lfs.net/forum/post/125412), exact post not identified].
- The inside wheel runs effectively inverse camber in a turn, so axle grip rather than single-wheel grip is what counts [V1, [camber-extravaganza](https://github.com/neilser/camber-extravaganza), describing AC's model].
- Popular explanations can oversimplify. The GT7 manual says negative camber gives "more grip while cornering" and that an excessive angle "will impede your driving" [V2, [GT7 manual](https://www.gran-turismo.com/us/gt7/manual/carsettings/02)].
- The LFS community guide says "more camber makes a car faster in a straight line". I could not reconcile this with other sources in this research, and it should not be repeated without a physics check [V1, [LFS guide](https://en.lfsmanual.net/wiki/Basic_Setup_Guide)].

### Inferences
- The closest thing to a recipe is a narrow path that opens out: toy model first, one control at a time, prediction prompts, then a free sandbox. This is an adaptation of Ciechanowski's order and PhET's findings, not a tested design.
- Calling something "more grip" is the core teaching trap. Static camber matters only through what it becomes at the contact patch after roll, gain and tyre deflection.
- Foster's "?" buttons and "skip to simulator" link are cheap and suit readers with mixed backgrounds.
- A dense OptimumK-style numeric panel would probably repel beginners, given PhET's lab-workbook finding. Numbers should be few and tied to what is in view.

### Gaps
- **Not verified:** what Driver61, Engineering Explained, Donut or How a Car Works actually do well. Searches returned no matching suspension videos I could attribute, YouTube pages gave only titles, and I did not watch anything. A [Driver61 F1 setup article](https://driver61.com/motorsport-engineering/formula-1-car-setup-precision/) [V2] and a basic [How a Car Works page](https://www.howacarworks.com/basics/how-car-suspension-works.amp) [V2] were the only related items. Do not claim their pedagogy from these notes.
- **Not verified:** that no Ciechanowski-style suspension explorable exists. Two targeted searches found none, which is weak evidence. I opened only his engine article.
- **Not verified, hypotheses to check with the physics researcher:** learners treat the roll centre as a literal pivot, believe more negative camber is always better, and assume toe only affects tyre wear. I found no study listing suspension misconceptions.
- No study measures learning gains specifically for suspension or vehicle-dynamics simulation in this search.

## Games and sims: setup screens and how they represent camber and toe

### Takeaway
Sims have the dynamics but hide the geometry, and setup screens explain settings in one or two sentences of text. Their useful legacy is cheap camber models and instant visual feedback through tyre colour, not their explanations.

### Cited findings

Assetto Corsa:
- A community `suspensions.ini` sets `TYPE` (DWB or STRUT) per axle with values such as `BASEY`, `TRACK`, `ROD_LENGTH`, `SPRING_RATE`, plus attach points such as `WBCAR_TOP_FRONT` [V2, [assettocorsamods](https://assettocorsamods.net/posts/13295/)].
- Forum users say stock AC offers strut, double wishbone, solid axle (rear only) and a multilink option, and that the double wishbone can show force bugs when imitating other designs. This is a community claim [V2, [overtake.gg](https://www.overtake.gg/threads/does-asseto-corsa-simulate-different-suspension-configs-wishbone-macfereson-multilink.178492/), direct fetch 403].
- Custom Shaders Patch docs: AC's "(relatively low) default physics rate means that certain suspension types will not function well", and "the more complicated and stiff the linkage, the more difficulty the Open Dynamics Engine physics solver will have" [V1, [CSP docs](https://cup.acstuff.club/docs/csp/cars/cosmic-suspension)].
- Tyre model camber term, from a comment in an AC config in a University of Melbourne GitLab repo (`mur-assettocorsa`), not from Kunos: `D = D·(1 − (camberRAD·DCAMBER_0 + camberRAD²·DCAMBER_1))`, with camber in radians and absolute value [V2, [repo diff](https://gitlab.eng.unimelb.edu.au/fwongkwok/mur-assettocorsa/-/commit/07ff084ffe1200666d41062774d16e39b08243f7.diff)].
- camber-extravaganza overlay: live and peak camber per wheel, optional history graph, colours blue, green and red relative to an optimum computed from config. Single-wheel grip peaks around −3.3°, while axle grip peaks at a somewhat less negative angle [V1, [GitHub](https://github.com/neilser/camber-extravaganza)].

rFactor 2:
- "The TGM is in essence a brush model, using a 6-DOF rigid ring to simulate frequency modes" [V1, [Studio 397 TGM tool guide, PDF](https://www.studio-397.com/wp-content/uploads/2016/12/rF2_TGM_TyreTool_QuickStart_V3.pdf)].
- The same guide suggests about 33 to 49 lateral nodes and says computation time grows with nodes, with doubling nodes and sections leading to a roughly 4-fold increase [V1, same source, read as extracted excerpts].
- A longer contact patch raises trailing-edge sliding speed with slip angle, which makes tyres more prone to overheating at high speed [V2, [Studio 397](https://www.studio-397.com/2017/12/6512/)].

Live for Speed:
- The community manual teaches camber through the F9 tyre temperature screen (blue cold, green optimum, red hot), with examples such as 70 / 81 / 110 meaning too much camber and 90 / 80 / 55 meaning too little. Toe-in gives stability, toe-out gives turn-in and nervousness, and either adds rolling resistance [V1, [LFS manual](https://en.lfsmanual.net/wiki/Basic_Setup_Guide)].
- Forum users report a live camber value in the garage, shown beside the adjustment, that reflects the contact patch rather than the rim [V2, [LFS forum](https://www.lfs.net/forum/post/125412), exact post not identified].

Gran Turismo 7:
- The official manual defines camber and toe in two or three sentences each, including the trade-off that toe-in improves straight-line stability but raises the risk of understeer [V2, [GT7 manual](https://www.gran-turismo.com/us/gt7/manual/carsettings/02), direct fetch returned no body].
- Update 1.31 fixed an incorrect toe angle display in Car Settings [V2, [GT7 update notes](https://www.gran-turismo.com/sg/gt7/news/00_1533234.html)].

Forza:
- A forum user calls tyre temperatures an unreliable tuning tool and recommends testing and logging lap times [V2, [Forza forum](https://forums.forzamotorsport.net/t/camber-tuning-question-help/73716)]. This is opinion, the search summary did not make clear which of the two linked threads it came from, and Forza's official explanation was not found.
- Users also disagree about what the telemetry camber value means, and one reports it as the angle of the road to the tyre surface [V2, [Forza forum](https://forums.forza.net/t/camber-tuning-techniques/6150), exact thread not identified].

BeamNG:
- Vehicles are nodes joined by massless beams acting as springs. Suspension arms are very stiff beams, and the steering rack needs extra stiffness to hold alignment. Beams do not transmit twist and "cannot be bent". Overly stiff beams or excess damping can cause vibration or explosion [V1, [BeamNG physics page](https://beamng.com/game/about/physics)].
- Physics runs at 2000 updates per second [V2, [BeamNG docs](https://documentation.beamng.com/beamng_tech/architecture/)].

### Inferences
- AC's quadratic grip factor, applied per wheel on top of a slip curve, is a usable first camber model because it is small, tunable and easy to explain. A brush-based patch model is needed only if the site shows pressure across the patch.
- A hardpoint-accurate, kinematically constrained linkage is more robust than a general joint solver at low rates, as the CSP remarks suggest. This favours a dedicated closed-loop solver over a general physics engine.
- BeamNG's approach gives geometry and compliance for free but needs high update rates and many stiff elements, which is the wrong trade here. No real workload was measured for a JS port.
- LFS's three-zone tyre colours are an established, low-cost way to convey camber. They also carry a risk, because temperature is a delayed, indirect signal, which is the Forza user's complaint.

### Gaps
- **Not verified:** official Kunos documentation for `suspensions.ini` and `tyres.ini`; I found community and third-party sources only.
- **Not verified:** the meanings of `FRICTION_LIMIT_ANGLE` and `CAMBER_GAIN`. Example values appeared, but with no authoritative definition.
- **Not verified:** Forza's official setup text, whether GT and Forza use hardpoint kinematics, and how they compute camber and toe effects internally. These models are not public in what I found.
- **Not verified:** how BeamNG represents tyre camber. The physics page does not discuss tyres.
- I did not review screenshots of setup screens, so comparative comments on layout are not supported here.

## Browser vehicle physics: libraries, custom solver, CPU budget, Worker or main thread

### Takeaway
None of the browser physics libraries provide suspension kinematics. Their vehicles are raycast wheels with fixed axis vectors, so a custom TypeScript solver is the right path. My benchmark puts a full corner solve around 1 µs on a desktop CPU, so live simulation fits the main thread while batch sweeps belong in a Worker.

### Cited findings

Library survey (npm registry and tarballs checked 2026-10-31; sizes [M] measured with `gzip -9` on the published files):

| Package | Version, last registry change | Size | Licence | Suspension-relevant facts |
|---|---|---|---|---|
| `@dimforge/rapier3d-compat` | 0.21.0, 2026-09-25 | `rapier.mjs` 4.34 MB, 1.65 MB gz (embedded wasm). Separate wasm 3.08 MB, 1.17 MB gz | Apache-2.0 | Wheel API has axle, direction, rest length, friction slip and side friction stiffness. No camber or toe option [V1, [API docs](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html)]. Zero `.d.ts` files in 0.21.0 mention camber [V1, inspected] |
| `jolt-physics` | 1.1.1, 2026-10-23 | wasm 2.02 MB, 746 KB gz, plus JS 970 KB, 136 KB gz. `wasm-compat` 3.23 MB, 910 KB gz | MIT | `mWheelUp`, `mWheelForward`, `mSteeringAxis` exist in JS typings. `OnTireMaxImpulseCallback` allows a custom tyre function [V1, inspected `types.d.ts`] |
| `cannon-es` | 0.20.0, 2022-08-12 | 346 KB, 74.5 KB gz (not minified) | MIT | `RaycastVehicle` wheels have `chassisConnectionPointLocal`, `directionLocal`, `axleLocal`, `rollInfluence`. No "camber" in typings [V1, inspected] |
| `ammo.js` | 0.0.10, 2022-06-13 | 1.56 MB, 317 KB gz | not listed in registry output | npm maintainer is not the upstream author's account listed in the repo URL [V1, npm view] |
| `crashcat` | 0.0.5, 2026-10-30 | `dist` 5.1 MB including maps | MIT | README has a raycast vehicle example. Early version, not evaluated further [V1, inspected] |

- Rapier's implementation was ported from Bullet's `btRaycastVehicle` [V2, [Rapier docs](https://rapier.rs/docs/user_guides/templates/vehicle_controller)].
- Jolt's wheel settings are described for the "neutral steering position". The page I fetched says nothing about camber or toe changing with travel [V1, [Jolt docs](https://jrouwe.github.io/JoltPhysics/class_wheel_settings.html)]. A search summary says `mWheelUp` and `mWheelForward` can be tilted to give static camber and toe [V2, [Jolt docs](https://jrouwe.github.io/JoltPhysics/class_wheel_settings.html)].
- three.js 0.187.0, the project's version, ships `AmmoPhysics`, `JoltPhysics` and `RapierPhysics` addons. The Jolt addon points to a CDN copy of `jolt-physics@1.0.0` [V1, inspected `node_modules`].
- Project Chrono documents a WebAssembly build with Emscripten. Each demo produces a `.wasm` and a `.js` wrapper, and compilation can take "15 - 25 minutes". The page does not mention Chrono::Vehicle, binary sizes or a hosted demo [V1, [Chrono docs](https://api.projectchrono.org/tutorial_install_chrono_emscripten.html)].
- GitHub search on 2026-10-31 found no maintained JS hardpoint solver of note. `suspension-explorer-core` (Python, 37 stars) and `Async-Physics-Suspension-Kinematics` (C++/UE5, 41 stars) lead the results [V1, `gh search repos`].
- Suspension Explorer Core solves each sweep step by Levenberg-Marquardt with analytical Jacobians, seeding each step from the last. It supports double wishbone, MacPherson, five-rod multi-link and semi-trailing arm. It is AGPL-3.0-only from 0.6.0 and Apache-2.0 up to 0.5.1. It models rigid geometry only, publishes no timing, and asks users to validate results independently [V1, [GitHub](https://github.com/nickmccleery/open-kinematics)].
- The UE5 project solves each corner every physics step by circle intersection, publishes no timing, and flags failed solves in a diagnostic [V1, [GitHub](https://github.com/fgrenoville/Async-Physics-Suspension-Kinematics)].

Own benchmark [M]. Toy geometry I invented, not validated against a reference tool. Node v26.7.0, i9-13900H, one thread, JIT warmed; the first round ran about 2× slower. The solve is dense Newton-Raphson on 9 unknowns (lower ball joint, upper ball joint, tie-rod outer) with 8 length constraints and a travel target:

| Operation | Time | Notes |
|---|---|---|
| Corner solve, warm start, up to 1 mm step | about 0.7 µs | about 2 Newton updates |
| Corner solve, cold start, 50 mm jump | about 1.55 µs | 4 Newton updates |
| Magic-Formula-style force evaluation | about 0.023 µs | sin/atan form with a camber term |
| 41-point travel sweep of one corner | about 41 µs | 3 updates per point on average |

Threading on GitHub Pages:
- `SharedArrayBuffer` requires cross-origin isolation, while `ArrayBuffer` messaging does not [V1, [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)].
- GitHub Pages still has no custom COOP/COEP headers. The only staff response is from 2023-07-10 with no ETA, and the latest comment is a +1 on 2026-10-25. Commenters report reload loops and other problems with `coi-serviceworker` [V1, [GitHub discussion](https://github.com/orgs/community/discussions/13309)].
- In this repo, `src/engine/*` is deliberately DOM-free so tests and scripts run the same code, and `Drive` runs a local `EngineSim` on the main thread when sound is off [V1, project `CLAUDE.md`].

### Inferences
- **Recommendation: custom TypeScript solver with no physics library, which adds nothing to the bundle.** The alternatives add from about 75 KB gz (cannon-es) to about 880 KB gz (Jolt) to 1.65 MB gz (Rapier compat), and still leave kinematics to you.
- The site does not need the things those libraries are good at, namely collision and stacking. The road can be a function of position, which removes the main reason to adopt one.
- Keep Jolt as a fallback only if free driving on arbitrary terrain becomes a goal. Its custom tyre callback makes it the most adaptable of the group. Kinematic camber would have to be applied by updating wheel vectors, and I did not test whether that works at runtime.
- Chrono is a poor fit: no documented vehicle build, likely heavy binary, and large integration effort.
- Budget estimate from my numbers: one physics step needs 4 warm solves plus about 8 tyre force evaluations, so about 3 µs. At 1 kHz this is about 50 µs per 16.67 ms frame. This excludes rigid-body integration, load transfer and rendering, and desktop numbers will not hold on a phone, so treat it as an order of magnitude.
- Batch estimates, by the same arithmetic: a 21 × 21 MMM grid at 20 iterations is about 26 ms, and a 20 s manoeuvre at 1 kHz is about 60 ms, or 120 ms for an A/B pair. Those exceed a frame budget and would cause visible hitches.
- **Thread recommendation:** run the single live simulation on the main thread, in line with the project's `Drive` pattern, which keeps latency and code simple. Run sweeps, MMM, g-g and A/B replays in a Web Worker and move results back with transferable `ArrayBuffer`s. No `SharedArrayBuffer` is needed, so the Pages header limit does not matter.
- Solver design suggestion: solve live during editing, then bake per-corner tables of travel and steer so the simulation interpolates. This is similar in spirit to how `DesignerPage` updates different things at different rates. With solve costs this low, baking may prove unnecessary, so measure on a phone first.
- Licensing note: read Suspension Explorer for method only. AGPL code should not be copied into the site without a deliberate licence decision.

### Gaps
- **Not verified:** any published benchmark of Newton-Raphson hardpoint solves or tyre integration in JS. I found none, so my numbers are the only ones here, and they are from a single machine.
- **Not measured:** phones, browser (not Node) timing, Worker round-trip latency, or a full vehicle step including integration. All three should be measured before committing to the main-thread choice.
- **Not verified:** whether Rapier or Jolt honour per-step changes to axle and wheel vectors, and how stable that is. Their docs do not cover this use.
- **Not verified:** a working Chrono::Vehicle WASM build. The docs are silent and I did not attempt one.
- `@dimforge/rapier3d` (non-compat) sizes after bundling, and tree-shaken sizes in Vite for any library, were not measured. The sizes above are raw published files.
- Context7 could not be used, so "current docs" here means the vendor pages and package contents listed above.

## 3D visualisation: showing tiny geometric effects

### Takeaway
I found no perceptual research specific to suspension visualisation, so the ranking below is my judgement based on adjacent practice. FEA tools have settled the honest way to exaggerate: a labelled scale factor, a superimposed undeformed ghost, and true values shown as numbers.

### Cited findings
- **Exaggeration:** Creo Simulate documents a scale factor for displacement display, with a worked case where 0.05 inch at factor 3 is drawn as 0.15 inch [V2, [PTC docs](https://support.ptc.com/help/creo/creo_pma/r13/usascii/simulate/simulate/int_disp_deformed.html)].
- **Auto-scale is common:** Altair Inspire enables auto-scaling by default because true displacement is usually too small to see, and warns that exaggerated shapes do not represent true magnitude [V2, [Altair community](https://community.altair.com/discussion/21959/displacement-results-interpreted)].
- **Read the number, not the shape:** a PTC forum post recommends reading displacement from the scale rather than trusting the drawn shape [V2, [PTC community](https://www.ptcusercommunity.com/t5/Analysis/How-to-get-accurate-displacement/m-p/478752)].
- **Ghost overlay:** Creo can superimpose the undeformed wireframe, or a transparent filled version, on the deformed model [V2, [PTC docs](https://support.ptc.com/help/creo/creo_pma/r13/usascii/simulate/simulate/int_disp_deformed.html)]. GearheadCalc previews solver results as a ghost with Apply or Discard [V1, [page](https://gearheadcalc.com/a-arm-calculator)].
- **Superposition reveals subtle differences:** subtle differences that are hard to see across separate charts become salient when superposed. Spatial position is where it is especially useful [V1, [L'Yi, Jo, Seo 2020](https://arxiv.org/pdf/2009.00192)].
- **Construction lines:** Speed-Wiz shows instant-centre, roll-centre, static tyre and kingpin lines as dotted lines with individual toggles, and zooms out when lines run far beyond the car [V1, [page](https://speed-wiz.com/calculations/suspension/index.htm)]. Foster and Suspension Geometry Studio draw the same construction [V1, [Foster](https://jrfoster09.github.io/portfolio/projects/suspension.html), [Studio](https://github.com/drewtuttle/suspension-calculator)].
- **Colour feedback:** camber-extravaganza colours each wheel by distance from optimum [V1, [GitHub](https://github.com/neilser/camber-extravaganza)]. LFS uses tyre temperature colours [V1, [LFS manual](https://en.lfsmanual.net/wiki/Basic_Setup_Guide)].
- **Honesty about scale:** Ciechanowski states when a demo's gaps are not to scale and when parts are colour-separated for clarity [V1, [article](https://ciechanow.ski/internal-combustion-engine/)].
- **Avoid colour blending:** superposed heatmaps are ineffective because blended colours are hard to read. Alternatives include glyphs, separate colour channels and stacked or diagonal arrangements [V1, [L'Yi, Jo, Seo 2020](https://arxiv.org/pdf/2009.00192)].

### Inferences
Ranking by likely teaching value, my judgement only:
1. **Contact-patch footprint view from below or above, with load distribution across the width.** This is where camber matters, and it turns an invisible 1° into a visible shift in where the load sits. It must be labelled as modelled, since no real pressure data exists.
2. **Ghost of the rest pose plus a labelled exaggeration control** (×1, ×5, ×20). The true value stays on screen in degrees at all times. Reset to ×1 on request, so that the learner sees the true size at least once.
3. **Local zoom or inset of the wheel in front view** with the ground line and a vertical reference. A large wheel with a thin reference line makes 1° readable without any exaggeration.
4. **Force arrows at the contact patch.** Lateral and longitudinal only by default, with a fixed scale so that lengths are comparable between runs.
5. **Instant-centre and roll-centre construction lines**, toggled and auto-zoomed. These are expert-friendly and should arrive after the basic idea.
6. **Plots tied to a playhead**, with a moving marker on camber versus travel while the 3D plays.
7. **Tyre heat colours** as a secondary, delayed signal. They are familiar from sims but explain causes poorly.

Further points:
- A force ellipse or friction circle at each wheel would suit braking-in-a-corner well, but it is untested here and unsourced as a standard.
- Exaggeration should apply only to the wheel angle and not to the linkage, or the solved mechanism will visibly stop being rigid. This is a design hazard, so an alternative is to exaggerate in the inset only.
- In this project, x-ray view is valued and three.js instancing is already used, so overlays should work on the transparent view too.

### Gaps
- **Not verified:** perceptual studies on optimal exaggeration, ghost-overlay effectiveness or force arrow reading for mechanisms. My search turned up vendor docs only, and I did not search IEEE VIS or CHI further.
- **Not verified:** any existing tool with a contact-patch pressure heatmap tied to suspension geometry in the browser. None appeared, but this is absence of evidence from limited search.
- Whether a learner misreads exaggerated camber as real has not been tested. A short think-aloud session in the PhET manner would answer this at low cost.

## Comparison modes: side by side, A/B on one manoeuvre, overlay plots

### Takeaway
Use superposition for plots and for the same wheel's ghost, and side-by-side only for whole-car views, with both locked to the same manoeuvre and camera. The research here is strong for charts and thin for 3D scenes.

### Cited findings
- Gleicher et al. (2011) group comparison designs into juxtaposition, superposition and explicit encoding, from a survey of over 100 tools [V2, [Gleicher abstract](https://rivic.ac.uk/research/Publication/visual-comparison-information-visualization.html); [arXiv 2208.03785](https://arxiv.org/pdf/2208.03785)].
- A systematic review of 127 papers including 15 with quantitative user studies gives seven guidelines [V1, [L'Yi, Jo, Seo 2020](https://arxiv.org/pdf/2009.00192)]. Those relevant here:
  - Avoid separate side-by-side charts for local comparison. They "almost never outperformed" other layouts for such tasks.
  - If side-by-side is unavoidable, provide landmarks such as grids or reference lines, or highlight the targets.
  - Align comparison targets in superposition, beyond merely sharing axes.
  - Avoid blending colours in superposition.
  - Avoid relying solely on explicit encoding (the guideline heading; I did not read the full rationale).
- Mirrored, adjacent side-by-side charts showed the best performance for correlation tasks in one study, so global tasks can favour juxtaposition [V1, same review].
- A study comparing overlaid charts, small multiples, mirror-symmetric layouts and animated transitions found overlaid charts best, with gains for mirror-symmetric layouts and animation that ran against many earlier studies [V2, [Aarhus study](https://cs.au.dk/~elm/pdf/face2face.pdf)].

Existing products:
- Lotus lets several curves stay open to compare modifications [V2, [Machine Design](https://www.machinedesign.com/archive/auto-suspension-design-made-easy)].
- ChassisCalc restricts compare mode to its paid tier [V1, [page](https://chassiscalc.xyz/)].
- GearheadCalc's ghost preview is a form of A/B with an Apply or Discard decision [V1, [page](https://gearheadcalc.com/a-arm-calculator)].
- Suspension Geometry Studio's mirror view shows both sides for roll-centre construction [V1, [GitHub](https://github.com/drewtuttle/suspension-calculator)].

### Inferences
- **Plots:** superpose A and B on the same axes, with a toggle for the difference curve. Use direct labels and aligned x-axes, such as travel or distance along the manoeuvre.
- **Time alignment:** align by distance along the path, not by time, so that the same corner point lines up when one car is slower. This follows the "align comparison targets" guideline.
- **3D:** two options, chosen by task. A ghost car in one scene suits small differences in line and roll, and split view with linked cameras suits comparing different suspension layouts, where overlap would produce clutter.
- **Contact patches:** show A and B side by side or mirrored rather than blending heatmaps, given the blending guideline.
- **Determinism:** the same model, seed and input trace should give identical runs. Pre-simulating both runs in a Worker lets the user scrub both together, which live side-by-side simulation cannot do as cleanly.
- **Sharing:** encode A and B in the URL hash, in the pattern `resolveDesign` already handles for shared designs.

### Gaps
- **Not verified:** any user study comparing A/B modes for 3D mechanisms or vehicle dynamics specifically. The chart findings are being extended by analogy.
- I could not confirm Robertson et al.'s original animation versus small multiples results. I saw them only through the Aarhus paper, which reports they used 8 to 80 multiples on Gapminder data [V2, same source].
- I did not check how motorsport data tools such as MoTeC or AiM do lap overlays. They are the obvious prior art for distance alignment and are worth a short look.

## Strongest features nobody else has

### Takeaway
The clear gap is linking geometry to consequences. Browser tools I checked stop at kinematics, while sims hide geometry, so a site that goes from hardpoint to contact patch to car behaviour on one screen would be different in kind. "Nobody else" means only within what this limited search found.

### Cited findings
- GearheadCalc covers no dynamics, forces or handling [V1, [page](https://gearheadcalc.com/a-arm-calculator)]. ChassisCalc describes no load transfer, tyre modelling or lap simulation [V1, [page](https://chassiscalc.xyz/)]. Foster's tool and Suspension Geometry Studio are 2D front-view geometry [V1, [Foster](https://jrfoster09.github.io/portfolio/projects/suspension.html), [Studio](https://github.com/drewtuttle/suspension-calculator)].
- SusProg3D reaches dynamic roll with weight transfer but is a Windows package, and its page lists no tyre or contact-patch feature [V1, [page](https://www.bevenyoung.com.au/suswin.htm)].
- Sims have the dynamics but explain settings with short texts [V2, [GT7 manual](https://www.gran-turismo.com/us/gt7/manual/carsettings/02)] or community-made overlays [V1, [camber-extravaganza](https://github.com/neilser/camber-extravaganza)].
- Prediction questions focused students on specific concepts in PhET's interviews [V1, [PhET study](https://phet.colorado.edu/publications/archive/PhET%20interview%20Paper%20Part%20I.htm)].
- The project already has useful patterns: `sensitivity.ts` derives claims about controls by running the model twice, a `no control is dead` test, verified real-engine variants with `unverified` fields, and shareable designs [V1, project `CLAUDE.md`].

### Inferences
Candidates, most distinctive first. All are proposals, not verified market gaps.
1. **One causal chain on one screen.** Change a hardpoint, then see gain curves, contact patch, tyre force and the car's path in the same manoeuvre.
2. **The same manoeuvre, two suspensions, one scrubber.** Strut against wishbone against multi-link against beam axle, with mass and tyres held equal. The comparison is deterministic and shareable by URL. ChassisCalc charges for a far narrower compare mode.
3. **Model-generated explanations.** Reuse the `sensitivity.ts` idea so that any statement like "this increases understeer" is measured from a double model run on the user's own design. This is a direct answer to oversimplified manual text, and it stays true after edits.
4. **"Why this isn't simply more grip" scenarios.** The learner picks a static camber to maximise grip, predicts the result, then sees the inside wheel, roll and braking trade-offs. Axle-level grip against single-wheel grip gives a natural first demonstration.
5. **Predict-then-run prompts** before each manoeuvre, as a lightweight form of PhET's prediction questions.
6. **Honest three-roll-centre view.** Label the kinematic and force-based roll centres separately, instead of the generic term that the SAE paper criticises. Physics scope needs confirming with the dynamics researcher.
7. **Labelled exaggeration with truth always on screen.** This is standard in FEA but appears absent from the suspension tools I reviewed.
8. **Real cars with sourced geometry and marked uncertainty,** extending the `unverified` convention. Hardpoint data is rarely public, so this could be limited in scope.
9. **Ukrainian-language explanation.** Likely a real differentiator, but it was not searched for.

Items worth avoiding: a dense numeric dashboard (PhET's lab-workbook finding), an open sandbox with no path, a full MMM as a first-level view, and any heat or pressure display that does not say it is modelled.

### Gaps
- **Not verified:** a true absence of these features. Paid desktop tools were judged from public pages, and I saw no screenshots or demos of most of them.
- **Not verified:** existence of Ukrainian-language suspension tools; not searched.
- **Not verified:** whether a site-level dynamics model can stay credible when comparing suspension layouts. This depends on the physics model and needs validation against published test data or a reference tool.
- No user testing exists for any of these proposals. Feature value here is inferred from teaching research on other subjects.
