# How a suspensions section maps onto the existing engines section (codebase analysis)

All paths are repo-relative. Citations are `file:line` at commit `0bd7521` with only the untracked `AGENTS.md` in the working tree (byte-identical to `CLAUDE.md`, checked with `diff`). "Inferences" are this researcher's judgement about a section that does not exist yet. Nothing about suspension physics here comes from sources: other researchers cover that.

## 1. Routes, pages, menu, state: how main.ts works and what a second section must change

### Takeaway
There is no router and no page abstraction. `src/main.ts` is one 960-line module that builds a single DOM once, keeps about 28 module-level mutable variables, and toggles one boolean (`onDesigner`) between two modes of the same engine page. The 3D `Stage` is nearly section-agnostic, but the shell, the frame loop, the keyboard and the dashboard are engine-specific, so README's claim that the shell is independent of the engine is only true of the stage and lighting.

### Cited Findings

**How the route is decided**
- Only two route tests exist: `onDesignerRoute = location.hash.startsWith('#/designer')` (`src/main.ts:198`) and the regex `^#\/engines\/([\w-]+(?:\/[\w-]+)?)` in `resolveEngine` (`src/main.ts:200-206`).
- Any other hash silently resolves to the default engine `v8-cross` (`src/main.ts:28`, `src/main.ts:204`). So `#/suspensions/...` today shows a V8 with the address unchanged.
- Route handling is spread over `applyRoute` (`src/main.ts:392-427`), the `hashchange` listener (`src/main.ts:669-682`), and `DesignerPage.designFromRoute` (`src/ui/designer/designer-page.ts:229-242`), which strips `^#\/designer\/?`.
- Any new route beginning with `#/designer` would be swallowed by the `startsWith` test (`src/main.ts:198`).
- Variant ids use a slash, and the "same page" logic relies on `spec.id.split('/')[0]` (`src/main.ts:662`, `src/main.ts:677`).

**How pages are built**
- All DOM comes from one template string assigned to `app.innerHTML` (`src/main.ts:40-184`, 145 lines). "Pages" are the same elements hidden or shown: `applyRoute` toggles `article`, `designer-host`, `results-panel`, `prev`, `next`, `to-designer`, `variants`, `health`, `to-catalog` and `body.designer-mode` (`src/main.ts:397-409`).
- The dashboard is always present and engine-only: ignition, health, volume, listen, tacho, pedal, latch, firing diagram, spectrum (`src/main.ts:139-172`). Its CSS is a fixed five-column grid (`src/style.css:524-535`) with a fixed `--dash-h: 212px` (`src/style.css:12`), which the stage area and tools also read (`src/style.css:76`, `src/style.css:217`).
- `DesignerPage` is the only page-like class. It is created unconditionally at load (`src/main.ts:332-381`) and talks back through the `DesignerHost` interface (`src/ui/designer/designer-page.ts:28-44`). That interface is the existing precedent for a section-to-shell contract, though its methods are engine-typed (`soundEngine`, `zones`, `health`).

**Menu**
- Hardcoded in the template: two links plus two `<span>` placeholders "Коробки передач" and "Підвіски" with "готуємо" (`src/main.ts:46-51`). The `current` class is toggled by element id for the two links only (`src/main.ts:399-400`). The English strings already exist (`src/i18n/en/ui.ts:10-11`).

**Where state lives**
- Module-level `let`s: 19 in one block (`src/main.ts:217-236`), plus `stage`, `engine`, `shownScale`, `tachoScale`, `lastDistress`, `lastZones`, `lastFrame`, `firingTextShown`, `spectrumTextShown` (`src/main.ts:188`, `:208`, `:245`, `:317-319`, `:864-866`).
- Persistent state: the designer's design in the URL and in `localStorage` under `car-anatomy.design` (`src/ui/designer/designer-page.ts:23`, `:358-370`), `parts-learned` (`src/main.ts:684`), and `locale` (`src/i18n/locale.ts:6`).
- Everything is exposed for manual checks on `window.__engine` (`src/main.ts:955-960`).

**Size and tangle: map of `src/main.ts`**

| Lines | Content | Engine-specific? |
|---|---|---|
| 1-38 | imports, constants | mostly |
| 40-184 | whole-page template | mixed |
| 186-236 | Stage, Drive, Tacho, FiringDiagram, Spectrum, state | Stage no, rest yes |
| 239-255 | `pageFrameScale` (uses displacement) and scale bar | scale bar no, frame scale yes |
| 258-315 | `showEngine`, `renderVariants`, `loadEngine` | yes |
| 317-389 | tacho zones and `DesignerPage` wiring | yes |
| 392-464 | `applyRoute`, `layoutPanels` | mixed; hard-coded panel widths and firing/spectrum resize at `:460-463` |
| 468-485 | view and speed segments | view no, speed yes (`drive.lock` at `:484`) |
| 487-565 | ignition, pedal | yes |
| 567-659 | control wiring, language switch, table overlay | mixed |
| 661-682 | `stepEngine`, `hashchange` | yes |
| 684-778 | part callout, hover tip, click card | no, uses only `stage.pick` |
| 780-851 | keyboard | mixed: Space and ArrowUp are the throttle, S starts, arrows step engines, 1/2/3 pick a view |
| 853-947 | `frame` loop | yes |
| 949-960 | boot and debug handle | yes |

**Hidden engine coupling**
- *Stage:* the coupling is mostly type-level. It imports `PARTS` and the `EngineModel` type (`src/scene/stage.ts:3-4`) but only ever uses `model.group` and `model.dispose()` (`src/scene/stage.ts:142-147`, `:155-156`, `:204`). Real coupling points: `pick` looks up one global part dictionary (`src/scene/stage.ts:215-218`), and `enablePan = false` (`src/scene/stage.ts:75`) means the camera can only orbit the model's centre. Framing and shadow numbers are also scaled for an engine-sized object (see question 4).
- *Speed modes:* they live in `frame` and in `setSpeed`, and depend on crank concepts: `visualTheta % engine.cycle`, `readableDegreesPerSecond(rpm)`, `snap.angle`, `drive.lock(rpm)` (`src/main.ts:480-485`, `:854-859`, `:891-907`).
- *Drive:* constructed from an `Engine` at module load (`src/main.ts:209`) and ticked every frame unconditionally (`src/main.ts:882`). It also owns the sim fallback and the `visibilitychange` audio suspend (`src/audio/drive.ts:56-64`).
- *FrameState:* crank-and-combustion fields only (`theta`, `rpm`, `load`, `fuelCut`, `running`, `boost`, `dt`, `shake`) (`src/scene/model-types.ts:5-18`).
- *Frame body:* firing rates, spectrum and tacho are written directly into the loop (`src/main.ts:922-939`).
- *Model selection:* `engine.isRotary ? new RotaryEngineModel : new PistonEngineModel` (`src/main.ts:261`).
- *Copy:* the canvas `aria-label`, the WebGL error, the hint, the catalogue button and the panel titles all say "двигун" (`src/main.ts:42`, `:57`, `:59`, `:108`, `:194`).
- *Leaving a page does not stop the engine:* returning from the designer calls `loadEngine(resolveEngine(), true)` with the engine still running (`src/main.ts:415-419`). That is intended within one section, but a suspension route would otherwise keep playing engine audio.
- *README overstates:* "Сцена, студійне світло й оболонка сторінки не залежать від двигуна" (`README.md:93`). The evidence above supports that for the scene and lighting, not for the page shell.

### Inferences
- Minimum needed for a second section:
  1. A small route table in the shell (`engines`, `designer`, `suspensions`, `suspension-designer`), replacing the two boolean tests.
  2. A `Section` interface, something like `enter(route)`, `leave()`, `frame(dt, now)`, `layout(insets)`, plus a declaration of its own dashboard and tools.
  3. The engine code moved as one block behind that interface, with its `frame` body, keyboard map and dashboard.
  4. A section body class such as `body.section-suspensions` to replace the column layout of `.dash`.
- Shell keeps: topbar, language switch, `Stage`, view segment, explode slider, scale bar, part hover and click, panel layout.
- `leave()` for engines must stop or suspend the engine explicitly, because no such step exists today.
- Use a route such as `#/suspensions/<page>/<car>` and `#/suspension-designer/<code>`. Do not start a new route with `#/designer`.
- Make the suspension section a dynamic `import()`. It is optional for a first cut, but today every visitor loads the engine data unconditionally (207 KB and 68 KB of source for `src/data/engine-variants.ts` and `src/data/engines.ts`, byte counts from `wc -c`). The reverse should not be added too.

### Gaps
- `src/style.css` was only sampled (`.dash`, `designer-mode` selectors, media queries). How many of its 2343 lines assume the engine dashboard was not counted.
- Not run in a browser in this research, so the "V8 at an unknown hash" behaviour is read from code, not observed.

## 2. Inventory of abstractions: reuse as is, small generalisation, or engine-specific

### Takeaway
Three-layer verdict. Reusable as is: the rendering primitives and the i18n runtime. Reusable after a small generalisation: `Stage`, `EngineModel`, the part dictionary, codec, sensitivity, constraint shape and control rendering. Engine-specific in content but worth copying as a pattern: diagnostics, reliability, article, table, results. Generalise only the pure pipeline pieces when a second consumer exists; keep the content files separate.

### Cited Findings

The Verdict column is this researcher's judgement, based on the cited coupling.

| Abstraction | File | Purpose | Verdict |
|---|---|---|---|
| `Stage` | `src/scene/stage.ts:36-250` | Renderer, studio env map, orbit, shadow light, framing, picking, adaptive pixel ratio | Small generalisation: `SceneModel` type instead of `EngineModel`, injected part lookup, optional pan |
| `EngineModel` | `src/scene/model-types.ts:20-29` | `group`, `update(FrameState)`, `setView`, `setExplode`, `setFailure`, `dispose` | Small generalisation: make generic over frame state. All but `update` is section-neutral |
| `FrameState` | `src/scene/model-types.ts:5-18` | Per-frame engine state | Engine-specific |
| `ViewMode` | `src/scene/model-types.ts:3` | solid, xray, mechanism | As is |
| `tag`, `disposeTree`, `markDamaged` | `src/scene/model-types.ts:32-35`, `:59-75`, `:48-57` | Part tagging, cleanup, red damage tint | As is. `disposeTree` frees geometries and materials, not textures |
| `GAS` | `src/scene/model-types.ts:38-45` | Combustion colours | Engine-specific |
| `PARTS` + `tag` + `pick` | `src/scene/parts-info.ts:8-37`, `src/scene/stage.ts:215-218`, `src/main.ts:737`, `:763` | Click-to-explain | Mechanism as is, dictionary needs a small generalisation. Keys collide: `spring` means valve spring (`src/scene/parts-info.ts:18`), and `rod` and `housing` are taken (`:15`, `:35`). Use per-model or merged, namespaced dictionaries |
| View lists: `shellMeshes`, `peripheral`, `solidOnly` | `src/scene/piston-engine.ts:114-118`, `:896-910`; rotary repeats them at `src/scene/rotary-engine.ts:60-62`, `:343-351` | How parts react to the view | Pattern reusable, duplicated in both models. A helper could own it. Note: shells cast shadows only in solid view (`src/scene/piston-engine.ts:900`) |
| `explodables` | `src/scene/piston-engine.ts:65-68`, `:119`, `:926-932` | Exploded view as object plus direction | Pattern as is; distance is scaled by `this.bore` (`:930`), so a suspension needs its own unit. Instanced parts need their own handling (`:1001-1041`, factor 2.6) |
| `MM`, `merge`, `extrude`, `roundedRect`, `zCylinder`, `tubeAlong` | `src/scene/geometry.ts:7`, `:9`, `:29`, `:43`, `:59`, `:354` | Generic parametric geometry | As is. `geometry.ts` imports `DEG` from engine kinematics (`:5`), harmless but worth moving |
| `springGeometry` | `src/scene/geometry.ts:183-193` | Helix of unit height, 6 radial segments, 12 per turn | Small generalisation for a hero coil spring. Stretching by Y scale would distort the wire section |
| Piston, rod, crank, valve, cam, flywheel, pulley, belt, block geometry | `src/scene/geometry.ts:66`, `:104`, `:148`, `:165`, `:222`, `:256`, `:279`, `:340`, `:358` | Engine parts | Engine-specific |
| `glassMaterial` | `src/scene/materials.ts:56-79` | X-ray shell: Fresnel transparent, no depth write | As is. This is the visual signature to keep |
| `hotPipeMaterial`, `glowTexture` | `src/scene/materials.ts:88-118`, `:206-221` | Heat and pulse shader, sprite | Engine-specific (possibly damper heat later) |
| `createMaterials`, `EngineMaterials` | `src/scene/materials.ts:120-201` | 29 named materials | Engine-specific. Palette can be copied; `noiseTexture` and `castTexture` are module-private (`:3`, `:17`) and need exporting |
| Scale bar | `src/main.ts:244-255`, `src/scene/stage.ts:129-132` | Ruler from pixels per unit | As is |
| `articleHtml` | `src/ui/article.ts:157-195` | Knowledge panel as a string | Engine-specific. Pattern matters: it returns strings, so tests can run it in Node (`tests/i18n.test.ts:81`, `:97`). `num` and `escapeHtml` are duplicated privately (`src/ui/article.ts:10-12`, `src/ui/table.ts:9`) |
| `Article` | `src/engine/spec.ts:44-55` | lead, how, sound, pros, cons, cars | Small generalisation: `sound` is engine-only |
| `factsHtml`, `EngineFacts` | `src/ui/article.ts:140-155`, `src/designer/catalogue.ts:33-50` | Real-unit facts, sources, unverified list | Pattern reusable; fields are engine-typed |
| `tableHtml`, `layoutGlyph` | `src/ui/table.ts:39-66`, `:14-36` | Catalogue overlay, computed layout glyph | Engine-specific code; overlay markup and CSS reusable |
| `pageFrameScale` | `src/main.ts:239-242` | Same camera scale on a page, by cube root of displacement | Small generalisation: needs a size measure from the section |
| Codec | `src/designer/codec.ts:17-51` | Diff against defaults, base64url, tolerant decode, then resolve | Small generalisation: `DEFAULT_DESIGN`, the `throws` special case and `resolveDesign` become parameters |
| `Design` | `src/designer/design.ts:33-131` | Flat object of visitor choices | Engine-specific. Pattern to copy, not to extend |
| `resolveDesign`, `paramRange`, `adjustedKeys` | `src/designer/constraints.ts:201-236`, `:82`, `:282-284` | Pure, idempotent, hostile-input-safe geometry limits, with reasons in `minWhy`/`maxWhy` | Shape reusable (`Range` at `:9-15`), content engine-specific |
| `editDesign` | `src/designer/presets.ts:65-92` | One panel edit, resets dependent fields, clears `factory` | Pattern to copy |
| `diagnose` | `src/designer/diagnostics.ts:14-20`, `:33-161` | fatal, warning, note with text and fix | `Diagnostic` type as is; content engine-specific |
| `assessReliability`, `wearNow` | `src/designer/reliability.ts:17-31`, `:47-53`, `:76` onward | Loads 0-1, verdicts, zones, wear | Structure reusable after replacing `at(rpm, throttle)` and rev zones; content engine-specific |
| Sensitivity | `src/designer/sensitivity.ts:20-143` | Runs the model twice for every cause-and-effect claim | Small generalisation: make generic over design, with `evaluate`, `edit`, `paramRange` and `metricsOf` injected. `describe` and `compareMetrics` are already generic apart from the `'rpm'` format |
| `designToSpec`, `factoryInputs` | `src/designer/to-spec.ts:58`, `:63-140` | Design to spec, optionally without running the model | Pattern to copy |
| `catalogueDesign`, `catalogueSpec` | `src/designer/catalogue.ts:76-102` | Catalogue entry through the designer path | Pattern to copy |
| `presets`: odd, random | `src/designer/presets.ts:104-211` | Starting points; `randomDesign` takes `random` for seeding (`:162`) | Pattern to copy |
| `params.ts` | `src/ui/designer/params.ts:10-75` | Declarative controls, plain data, Node-safe | Shape reusable; `key` unions are engine-typed (`:12`, `:32`, `:46`) |
| `DesignerControls` | `src/ui/designer/controls.ts:73-133`, `:588-692` | Controls, sliders, effects, flash | Medium generalisation: direct imports of `paramRange`, `previewEffects` and `PARAM_GROUPS` (`:3-11`, `:594`), group ids (`:596`), "На цьому двигуні" (`:50`), three engine widgets (`:611`) |
| `RpmChart` | `src/ui/designer/chart.ts:25` onward, tooltip at `:240-243` | Single-metric canvas chart, baseline ghost, marker, zones | Small generalisation: x axis is rpm throughout |
| `DesignerResults` | `src/ui/designer/results.ts:47-240` | Hero figures, verdict, compare, charts, diagnoses, energy | Engine-specific; layout reusable as a pattern |
| `DesignerPage` scheduling | `src/ui/designer/designer-page.ts:24-26`, `:273-290`, `:304-370` | Different update rates per consumer | Pattern to copy. Do not abstract until the second page shows what is common |
| `Tacho` | `src/ui/tacho.ts:20`, `:46`, `:100`, `:108` | Dial with zones | Small generalisation for any gauge (API read only) |
| `FiringDiagram`, `Spectrum`, `Drive`, `EngineSim`, `EngineSynth`, worklet | `src/ui/firing-diagram.ts:30`, `src/ui/spectrum.ts:40`, `src/audio/drive.ts:38`, `src/engine/sim.ts:38`, `src/audio/worklet.ts` | Engine timeline, spectrum from `AnalyserNode`, thread bridge, crank dynamics, sound | Engine-specific. `EngineSim` is the pattern for a DOM-free `step(dt)` class |
| Catalogue snapshot | `tests/catalog-snapshot.test.ts:8-74` | Fingerprint of everything 3D and sound read | Test pattern: copy, with a suspension `describe` function. `round` and `fingerprint` (`:8-25`) can be shared |
| Calibration | `scripts/calibrate.ts`, `src/designer/loudness.ts` | Rewrites loudness trims | Engine sound only. No suspension need unless sound is added |
| Real-figure checks | `tests/real-engines.ts:3-29`, `tests/designer-physics.test.ts:15-22`, `tests/variants.test.ts:38-55`, `scripts/designer-table.ts` | Model versus published data within fixed bands, and a table script | Pattern to copy |
| `no control is dead` | `tests/reliability.test.ts:155` onward | Each control changes figures, sound or looks | Pattern to copy; `only` label comes from `src/ui/designer/params.ts:24-25` |
| Link and fuzz tests | `tests/designer.test.ts:25-81`, `:255-303` | Hostile input, idempotence, random designs, round trips | Pattern to copy |
| `t()`, `locale.ts` | `src/i18n/t.ts:7-14`, `src/i18n/locale.ts:16-25` | Ukrainian as key, English lookup, Node-safe detection | As is, plus one line to merge a new dictionary |
| `applyEnglish` | `src/i18n/en/apply.ts:12` | Swaps catalogue text | Engine-typed; write a sibling |
| i18n test | `tests/i18n.test.ts:18-22`, `:29-51`, `:53-72`, `:76-119` | No Cyrillic outside `t()`, placeholders match, no unused keys, whole site in English | Scans all of `src` automatically (`:19`). `SOURCE_DATA` and `ENGLISH` are hard-coded lists, and `t.ts:7` repeats the merge. The English site run names engine modules only, so suspension modules need adding |
| Terminology table | `docs/i18n.md:16-77` | One term, one translation | Needs a suspension block |

Docs-versus-code discrepancy: `CLAUDE.md:108` tells readers to put per-engine corrections in presets called `REAL_TUNE`, but `REAL_TUNE` appears nowhere in `src`, `tests`, `scripts` or `docs` (grep).

### Inferences
- The highest-value extraction is `sensitivity.ts`. Its generic part is small and pure, and it directly delivers CLAUDE.md's rule that cause-and-effect text is computed, not written (`CLAUDE.md:106`).
- `DesignerControls` is the costliest piece to generalise. Copying the page first and factoring afterwards is safer than parameterising it up front.
- Part keys could be namespaced (`susp.spring`) or each model could supply its own dictionary. The second also shrinks what `Stage` imports, and is the cleaner choice.

### Gaps
- Read only by exports or API: `src/ui/tacho.ts`, `src/ui/spectrum.ts`, `src/ui/firing-diagram.ts`, `src/designer/crank.ts`, and most of `src/designer/physics.ts`. Read only in part: `src/ui/designer/controls.ts` (widgets at lines 134-586) and `src/ui/designer/results.ts` (from line 240), `src/scene/piston-engine.ts`, `src/scene/rotary-engine.ts`. Verdicts on them rest on those parts.

## 3. Data to derived to consumers: the suspension equivalent and the file layout

### Takeaway
The engine pipeline is `CatalogueEntry` or `Design` → `resolveDesign` → (`factoryInputs` or `evaluate`) → `designToSpec` → `EngineSpec` → `buildEngine` → `Engine` → 3D, sound, charts. The same chain fits suspensions well, with one structural difference: engine motion is a closed-form function of one scalar, while a suspension's motion is a linkage solve driven by a multi-degree-of-freedom state. That difference belongs inside `buildSuspension` and the sim, and no consumer should need to see it.

### Cited Findings
- Pipeline statement: `CLAUDE.md:84`, code at `src/ui/designer/designer-page.ts:298-302` and `src/designer/catalogue.ts:92-102`. The stated plan rationale is that 3D, sound and charts "work without separate branches" (`docs/superpowers/plans/2026-10-31-engine-designer.md:7`).
- Derived rather than given: crank pin angle is `pin = alpha - fire` (`src/engine/kinematics.ts:269`, `CLAUDE.md:40`). A wrong input gives an unreal crank rather than an error, and tests catch that by asserting known constructions (`tests/kinematics.test.ts:45-108`) and "engineering folklore" (`tests/kinematics.test.ts:157-222`).
- Second mechanism type on the same path: a rotor face is presented as a "cylinder" with a 1080° cycle, and only `RotaryEngineModel` and `buildRotary` differ (`CLAUDE.md:46`, `src/engine/kinematics.ts:254`). Variants of layout are a discriminated union (`src/engine/spec.ts:12-27`).
- Cheap motion at render time: `pistonPin(engine, cyl, theta)` is evaluated per frame (`src/scene/piston-engine.ts:943`). Expensive derivations are tabulated once per engine and then read, as with `vibrationTable` (`src/engine/kinematics.ts:457`, `src/scene/piston-engine.ts:133`).
- Sim: `EngineSim` is a plain class with public inputs and outputs and a `step(dt)` (`src/engine/sim.ts:38-65`, `:135`). Running it in the audio thread, in the main thread and in scripts is the reason it must stay DOM-free (`src/engine/sim.ts:1-2`, `CLAUDE.md:52`).
- Two bands of constraints: geometry versus engineering (`CLAUDE.md:86-88`, `docs/engine-designer-model.md:59-62`).
- Factory calibration holds real figures until the first engineering change (`src/designer/design.ts:25-31`, `src/designer/presets.ts:89-90`). The catalogue is built without running the model (`src/designer/to-spec.ts:60-76`, `CLAUDE.md:92`).
- Rules for new code:
  - Node runs scripts with no bundler, so imports carry `.ts` and syntax must be erasable: no `enum`, no parameter properties (`CLAUDE.md:30`, `tsconfig.json` `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`).
  - `src/engine/*`, `synth.ts` and `dsp.ts` may not touch DOM or Web Audio (`CLAUDE.md:52`).
  - `t()` is safe in pure code because locale detection tolerates no `location` (`src/i18n/locale.ts:17-18`). `spec.ts` already uses it (`src/engine/spec.ts:4`).
  - Vite-only imports like `worklet.ts?worker&url` (`src/audio/drive.ts:8`) must stay in a module scripts and tests never import. No test imports `drive.ts` (grep).
  - User text in Ukrainian, identifiers and comments in English (`CLAUDE.md:9`).
  - Temporary output goes to `.tmp/` (`CLAUDE.md:136`).

### Inferences

**Equivalence table**

| Engine | Suspension (suggested) | Note |
|---|---|---|
| `Design` | `SuspensionDesign` | Flat, plus a hardpoint table as `throws` is a table with a preset (`crankPreset`, `custom`) |
| `resolveDesign` | `resolveSuspension` | Same contract: pure, idempotent, hostile-input-safe |
| `evaluate` → `Performance` | `evaluateSuspension` → `SuspensionPerformance` | Must be fast; see question 4 |
| `designToSpec`, `factoryInputs` | same names in a suspension module | Published figures until the first engineering change |
| `EngineSpec` | `SuspensionSpec` | A `topology` discriminated union, as `LayoutDef` |
| `buildEngine` → `Engine` | `buildSuspension` → `Suspension` | Solves hardpoints; tabulates camber, toe, motion ratio, roll centre over travel |
| `pistonPin(θ)` | `corner.at(travel, steer)` | Table read or a cheap interpolation at render time |
| `EngineSim` | `SuspensionSim` | `step(dt, inputs)`, SI units |
| `synthConfig` | none in v1 | Simple config for the sim if needed |
| `PistonEngineModel`, `RotaryEngineModel` | `IndependentSuspensionModel`, plus `AxleSuspensionModel` | Beam and live axles as the "rotary-like" branch |
| `torqueCurve`, `balance` | camber and toe curves, natural frequencies | Same pattern: pure function from the built object, drawn by the article |
| `CATALOGUE`, `ENGINE_VARIANTS` | `SUSPENSIONS`, `SUSPENSION_VARIANTS` | `verifyNote` and `unverified` matter more, because hardpoints are rarely published |
| `tests/kinematics.test.ts` | `tests/suspension-kinematics.test.ts` | Link lengths constant over travel; known behaviour of each topology |

The rule corresponding to "crank pin angles are derived, not given" would be: motion ratio, instant centre, roll centre and camber gain are always derived from hardpoints, never entered as data. That gives the same protection: a wrong hardpoint yields a visibly wrong curve that tests catch.

**File layout that respects the rules**

```
src/suspension/spec.ts            types, topology union, names via t()
src/suspension/kinematics.ts      buildSuspension, conventions at the top. No three, no DOM
src/suspension/sim.ts             SuspensionSim.step(dt, inputs). No DOM
src/suspension/road.ts            road and test-event profiles, seedable
src/suspension-designer/design.ts, constraints.ts, physics.ts, diagnostics.ts,
                        limits.ts, to-spec.ts, codec.ts, presets.ts, catalogue.ts
src/data/suspensions.ts           catalogue entries (Ukrainian source text)
src/data/suspension-variants.ts   real cars per topology
src/scene/suspension-model.ts     implements the generic scene model
src/scene/suspension-geometry.ts  arms, uprights, dampers, wheels, tyres
src/scene/suspension-parts.ts     part dictionary
src/ui/suspension/*               page, article, table, controls, results, charts
src/i18n/en/suspension.ts         UI strings
src/i18n/en/suspension-text.ts    catalogue text
src/sections/                     engines.ts, suspensions.ts: the section contract and shell code
src/shared/ (only when a second consumer exists)  math, html helpers, sensitivity core
tests/suspension-*.test.ts, tests/real-suspensions.ts, scripts/suspension-table.ts
docs/suspension-model.md          formula and status table, modelled on docs/engine-designer-model.md:29-44, plus "what the model cannot do"
```

`tests/i18n.test.ts:18` must list the new source-language data files, or its Cyrillic check fails on them.

### Gaps
- Whether a table read is adequate for 3D linkage in steer-plus-travel (two inputs) depends on the solver, which other research should settle. The code offers precedent for tabulation, not proof that two-dimensional tables suffice.

## 4. Performance: render loop, sim timing, main thread versus worker

### Takeaway
There is one always-on `requestAnimationFrame` loop that ticks the sim and renders each frame, with no idle skipping. Engine physics sits on the audio thread only so that sound and picture stay locked, not for performance. A suspension sim without sound has no such reason and belongs on the main thread with sub-stepping, kept DOM-free so it can move later. The real hazard is not the physics but `Stage`'s resolution ratchet, which permanently lowers image quality after sustained slow frames and is in tension with the saved no-quality-loss preference.

### Cited Findings

**Render loop**
- One loop: `frame` (`src/main.ts:868-947`), started at `:952`. `requestAnimationFrame` occurs only here and in the coalesced designer draw (`src/ui/designer/designer-page.ts:307`). There is no `setInterval` and no `new Worker` in `src` (grep).
- `dt` is capped at 0.1 s (`src/main.ts:870`). Each frame runs `drive.tick`, `model.update`, `stage.render`, gauges, the firing diagram and the spectrum (`src/main.ts:882`, `:909-929`).
- Picking is throttled to one ray cast per 90 ms on hover (`src/main.ts:727-736`).

**Sim timing**
- With sound off, `Drive.tick` sub-steps `EngineSim` in steps of 5 ms or less on the main thread (`src/audio/drive.ts:212-217`).
- With sound on, the crank angle lives on the audio thread (`src/audio/worklet.ts:1-2`), reports every 512 samples (`src/audio/worklet.ts:33`, `:87-99`), and the main thread extrapolates and eases toward it (`src/audio/drive.ts:219-230`).
- The stated reason is that "firing and the picture cannot drift apart" (`src/audio/worklet.ts:1-2`), not cost.

**Designer pacing**
- Numbers on each input, 3D rebuild at most every 130 ms and only when `geometryKey` changes, sound after 240 ms, trim after 700 ms, URL after 300 ms (`src/ui/designer/designer-page.ts:24-26`, `:73-76`, `:319-332`, `:358-370`).
- The reason given is that `setConfig` causes a short dip in the audio (`CLAUDE.md:104`).
- A rebuild disposes the whole model and creates another (`src/scene/stage.ts:142-147`).
- Each input does `evaluate` + `assessReliability` + `buildEngine` (`:298-302`) and a `snapshot` for effects (`:283`), plus one `snapshot` the first time a control moves (`:277`).
- `causesOf` runs a snapshot for every probe and every try (`src/designer/sensitivity.ts:120-136`), and re-runs on change while open (`src/ui/designer/results.ts:224-230`).

**Measured (Node 26, warm, this machine; not a browser; run with a read-only script outside the repo)**

| Call | Time per run |
|---|---|
| `evaluate` on a V8 | 0.60 ms |
| `assessReliability` | 0.48 ms |
| `snapshot` (both of the above plus metrics) | 0.94 ms |
| `buildEngine` | 0.003 ms |
| `EngineSim.step` | 0.0001 ms |
| Importing the data modules, including building the catalogue | 31 ms |

- The physics header says the model "computes in microseconds" (`src/designer/physics.ts:2`); the measurement is hundreds of microseconds. The test budget is below 15 ms per `evaluate` (`tests/designer-physics.test.ts:276-281`).

**Stage quality and the saved preference**
- The saved project memory `no-visual-quality-tradeoffs` says: no removing flash lights, shadows or detail; no quality tiers for weaker devices; rendering changes must leave the image unchanged and be proved by a pixel comparison, judged on the X-ray view first.
- `Stage.render` already lowers resolution. After a net 45 frames slower than 1/28 s it cuts `qualityScale` by 0.2, down to a floor of 0.6 (`src/scene/stage.ts:238-245`). Nothing in `stage.ts` ever raises it again. It lives in the one `Stage` shared by the whole page.
- Engine-scale assumptions in `Stage`:
  - The shadow light has a fixed offset (5, 9, 6) from the target (`:187`), length about 11.9 units, with `near = 0.5`, `far = 40` (`:184-185`).
  - The shadow frustum half-size is `1.7 × radius` over a 2048 map (`:90`, `:178`).
  - The floor is 60 × 60 units, that is 6 × 6 m (`:99`), and catches shadows only (`ShadowMaterial`).
  - `controls.minDistance = radius × 0.6` (`:175`). The camera far plane is 200 (`:69`).
- Engine lighting costs: two `PointLight` flashes per engine (`src/scene/piston-engine.ts:152-156`).

### Inferences
- **Main thread is right for the sim.** `EngineSim.step` costs 0.1 µs. Even at 100 times that, 1 kHz stepping costs about 0.17 ms per 60 Hz frame, far inside the budget. This is an estimate from one measured class, not a measurement of a suspension sim. A full nonlinear 3D linkage solve in every sub-step could break it, which argues for tabulating kinematics in `buildSuspension`.
- **Worker only if measured to need it.** It would need the same reporting and easing as `Drive` (`src/audio/drive.ts:219-230`) and adds input latency for no user-visible gain. Keeping `SuspensionSim` DOM-free leaves the door open, and tests and scripts need that anyway.
- **Use a fixed step with an accumulator**, not `Drive`'s `dt / steps` (`src/audio/drive.ts:214-215`). A fixed step makes runs deterministic and comparable in tests. A seedable road follows `randomDesign`'s precedent (`src/designer/presets.ts:162`).
- **The ratchet is the sharp edge.** Any sustained jank, including from charts or a slow sim, permanently softens the picture for the session, and also for the engine pages afterwards if the same `Stage` is kept. This existing behaviour also looks at odds with "no quality tiers for weaker devices", though it may predate the preference or be accepted. It should be raised with the user, not changed unilaterally: restoring or removing it changes the picture.
- **Do not plan a whole-car view on today's Stage without checking.**
  - A corner (about 0.5 m radius) or a full axle (about 1 m radius) fits the shadow setup, since casters closer than about 11.4 units (1.14 m) toward the light stay inside the near plane.
  - A whole car (radius about 24 units) exceeds that and would clip casters. Its shadow frustum would also be several times larger than an engine's, so about 6 times coarser per texel assuming an engine radius of 4 units. That is a quality loss the preference would not accept without compensation, so the shadow setup would have to scale.
- **Do not lower detail to pay for simulation.** Plan suspensions on the X-ray view first: glass shells for tyre, rim and damper tube, and solid moving parts. Any change to `Stage`, materials or shared geometry needs the pixel comparison, using the harness details in question 7.
- **Design-time budget:** keep `evaluateSuspension` in the same order as `evaluate`, about 1 ms. If each `snapshot` ran a time-domain scenario, `causesOf` (tens of probes times tries) and the per-input double snapshot would become noticeable. Use analytic or frequency-domain metrics in `evaluate`, with time-domain results only for the live view. The `computes fast enough` test can be copied as the guard.

### Gaps
- No browser or GPU frame-time data was taken, so the frame budget that X-ray already uses on a typical device is unknown here. The memory note refers to measured options from 2026-10-31, but those measurements are not in the repo.
- Git history is too coarse (nine commits) to say whether the resolution ratchet predates the preference.

## 5. Concept mapping: every engine feature and its suspension equivalent

### Takeaway
Roughly two thirds of the features map directly. The exceptions are real: sound and everything hanging off it, the cyclic firing diagram, ignition, and the single-axis reliability verdict do not transfer honestly. The natural replacement for "start and rev" is "press the car and let go" or "drive over a bump".

### Cited Findings
The left column is cited fact from the code. The middle column is a suggestion (inference) and the right column is the fit.

| Engine feature | Suspension equivalent (suggested) | Fit |
|---|---|---|
| Views solid, X-ray, mechanism, with keys 1/2/3 (`src/main.ts:77-81`, `:474-478`, `:828-836`) | Solid: wheel, tyre, body stub. X-ray: tyre, rim, body and damper tube in glass, showing the damper piston and valving. Mechanism: bare links, hardpoints, maybe instant centre lines | Good, but a suspension is already exposed, so X-ray reveals less than on an engine unless the damper and hub interiors are modelled |
| Speed modes: slow locks rpm, readable uses a separate angle, real uses sim angle (`src/main.ts:85-89`, `:899-907`, `CLAUDE.md:54-57`) | Real time; slow as a time scale; "readable" as a quasi-static sweep through travel | Good. Simpler: no sound to desynchronise, so no split between shown and true state |
| Slow-speed slider (`src/main.ts:91-94`) | Time-scale slider | Direct |
| Explode (`src/main.ts:95-98`, `src/scene/piston-engine.ts:926-932`) | Links pulled along their axes, wheel off, spring off the damper | Direct |
| Exaggerate vibration, multiplier 0.45 or 2.6 (`src/main.ts:99-102`, `:606-608`) | Exaggerate motion: camber, roll, toe | Direct; label it as exaggeration, as the engine does |
| Hover name, click card (`src/main.ts:709-778`) | Same code; needs a part dictionary | Direct |
| Page navigation, keys, variants list, catalogue overlay with glyphs (`src/main.ts:66-67`, `:278-296`, `src/ui/table.ts:14-66`) | Topology pages, real cars per page, front-view glyph computed from hardpoints, families independent, semi-independent, dependent | Direct |
| Scale bar and same-scale camera on a page (`src/main.ts:239-255`) | Same, framed by largest track or wheel size | Direct |
| Demo mode: gentle motion before the first gesture (`src/main.ts:891-898`) | Gentle road from the start. No audio gesture needed, so the live state can run from the first frame | Direct and simpler |
| Ignition, start sequence, stop (`src/main.ts:487-508`, `src/engine/sim.ts:155-185`) | No honest equivalent. Nearest is "Поїхали" start of a road run or test event | Does not map |
| Throttle pedal, latch, Space (`src/main.ts:157-161`, `:519-565`, `:802-808`) | Speed over the road; Space fires a bump or event. The most natural gesture is dragging a corner down and releasing it, a bounce test. Pedal's ARIA slider and latch could be reused | Partial |
| Sound: volume, mute, listen position, synth, calibration (`src/main.ts:145-153`, `CLAUDE.md:59-67`) | Leave out at first. A thin bump-stop and tyre sound would not be the same kind of feature as a synth built from physics. Replacement for listen: where the measurement is taken, such as seat or axle | Does not map |
| Tacho with safe and failure zones (`src/ui/tacho.ts:100`, `src/main.ts:322-330`) | Gauges for travel per corner with zones up to the bump stop | Partial; four small gauges instead of one dial |
| Firing diagram: cyclic, driven by `theta` (`src/ui/firing-diagram.ts:155`) | Scrolling strip chart of wheel travel or tyre load per corner. Road input is aperiodic, so a wrap-around cycle has no meaning | Concept partial, code does not transfer |
| Live spectrum from `AnalyserNode` (`src/ui/spectrum.ts:40`) | Frequency response of body and wheel, with the two modes marked. Calculated, not from an analyser | Concept good, code does not transfer |
| Article: figures, lead, how, sound, pros, cons, cars (`src/ui/article.ts:157-195`) | Same, with `sound` replaced by something like "how it feels" | Direct |
| Balance bars from geometry (`src/ui/article.ts:48-73`) | Natural frequencies, damping ratios, roll gradient | Direct pattern |
| Torque over a cycle (`src/ui/article.ts:75-105`) | Camber and toe over travel, motion ratio curve, roll centre migration | Direct pattern |
| Compare sound with siblings, engine keeps running (`src/ui/article.ts:161-165`, `:109`) | Compare on the same obstacle: state and road kept when switching | Good, cheaper to do honestly than audio comparison |
| Link into designer from a real engine (`src/main.ts:312`, `src/ui/designer/designer-page.ts:231-234`) | Direct | Direct |
| Designer: presets odd and real, random, reset, copy link (`src/ui/designer/designer-page.ts:132-199`) | Direct; odd machines fit well: too-soft, bump-steering, high roll centre | Direct |
| Controls with `?`, computed preview, limits that say why, flashes on moved parameters (`src/ui/designer/controls.ts:54-71`, `:683-692`, `src/designer/constraints.ts:12-14`) | Direct. Geometry limits: arm reach, spring solid height, damper stroke versus wheel travel, tyre and body clearance | Direct, and a very good fit for the two-level constraint model |
| `withLayout`: a layout brings a typical exhaust (`src/designer/presets.ts:24-63`) | Topology change brings typical hardpoints and packaging | Direct |
| Hero figures and "what moves this" (`src/ui/designer/results.ts:178-200`, `src/designer/sensitivity.ts:120-136`) | Direct, once `evaluate` is fast | Direct |
| Baseline ghost on charts (`src/ui/designer/results.ts:202-211`, `src/ui/designer/chart.ts:88`) | Direct on curves. A ghost in 3D would need `Stage` to show two models (`src/scene/stage.ts:44`), and a side-by-side sim needs two sim instances | Charts direct, 3D later |
| Diagnoses, computed text with fix (`src/designer/diagnostics.ts:33-161`) | Direct: bump steer, bottoming, wheel lift, high jacking | Direct |
| Verdict scale "надійний" to "приречений" on a worst-load axis (`src/designer/reliability.ts:47-58`) | One axis misleads: comfort and grip trade off, and most bad suspensions do not break. Use a character label from a small set of margins, plus an honest failure scale for bottoming, wheel lift and rollover | Partial |
| Wear accelerated to about 30 s and live health bar (`src/designer/reliability.ts:285`, `:304-319`, `src/main.ts:364-377`) | Weak. Replace with events: bump-stop strikes, wheel off the ground, rollover. `setFailure` and `markDamaged` still work for an overloaded spring or joint | Weak |
| Wreck banner with restart outlook (`src/main.ts:347-359`, `src/designer/reliability.ts:297-302`) | Rollover or bottoming event banner | Partial |
| Energy flow chart (`src/ui/designer/results.ts:27-34`) | Possibly energy into damper heat versus body and tyre. Not obviously useful | Weak |
| Real engines with facts, sources, `unverified`, `voiceEvidence` (`src/designer/catalogue.ts:33-58`, `CLAUDE.md:126`) | Real cars with published facts and evidence level of each figure. Evidence labels matter even more here, because hardpoints are mostly unpublished | Direct, data harder |
| Share link and local save (`src/ui/designer/designer-page.ts:212-226`, `:358-370`, `src/designer/codec.ts`) | Direct | Direct |
| Language switch reloads the page (`src/i18n/locale.ts:34-43`) | Unchanged | Direct |
| Ideas list: force arrows in 3D (`docs/ideas.md:30-35`) | Force and instant-centre overlays are close cousins | Worth sharing an overlay helper |

### Inferences
- The features visitors value most are probably "see it move" and "see why". Sound is the engine section's signature, and suspensions need a different hook to feel equally alive. The bounce-test gesture and "same bump, two suspensions" are the strongest candidates.
- A section-specific dashboard is unavoidable: at least three of five columns would change.

### Gaps
- Which mapped items earn a place in v1 is a product decision not settled by the code.

## 6. Later integration: keeping "engine + gearbox + suspension" possible

### Takeaway
The repo hints at a common system but has no code for it. Its engine sim is normalised, unloaded, and has no external port; its model is single-subject. Keeping the door open means: SI units and explicit ports in the suspension sim, a shared vehicle coordinate frame, a separate `vehicle` block for mass data, composable scene groups, and per-subsystem designs and codecs. The things that would close it are normalised physics, suspension fields inside `Design` or `EngineSpec`, and section-specific branches inside the shared loop.

### Cited Findings
- Hints in the docs: engines run unloaded "як у нейтралі: коробки передач і ваги авто в моделі немає" (`README.md:56`); the dyno idea notes "Чого бракує: зовнішнього навантаження в `src/engine/sim.ts`" and calls it "природний місток до розділу про коробки передач" (`docs/ideas.md:7-14`). The menu has placeholders (`src/main.ts:49-50`).
- `EngineSim` has no load input, and its acceleration is normalised, scaled to `revTimeS` in rpm per second rather than from torque and inertia (`src/engine/sim.ts:94-98`, `:100-106`, `:108-110`). Its torque table has peak 1 (`src/engine/sim.ts:17`).
- Physical numbers do exist in the design model: absolute torque per rpm, `massKg`, rotating inertia (`src/designer/physics.ts:111-121`, `:663-664`, `:718`). The catalogue path skips the model and passes an empty torque table (`src/designer/to-spec.ts:63-76`).
- Coordinates: crank along Z, front of engine +Z, X to the right seen from the front, Y up (`src/engine/kinematics.ts:3-7`). Scene unit is 100 mm (`src/scene/geometry.ts:1`, `:7`).
- Engine models centre themselves and sit on the floor through an inner `mounted` group (`src/scene/piston-engine.ts:140`, `:158-161`), and write `group.position` for visible shake (`src/scene/piston-engine.ts:1106-1109`). So a parent cannot position `group` directly; it needs a wrapper.
- `Stage` holds exactly one model and disposes the previous one (`src/scene/stage.ts:44`, `:139-150`). It reads only `group` and `dispose`.
- `vibrationTable` computes residual engine forces (`src/engine/kinematics.ts:457`), read by the model's shake (`src/scene/piston-engine.ts:133`).
- Links store a flat diff of one `Design` (`src/designer/codec.ts:17-26`).

### Inferences

**Decisions now that keep it open**
1. SI state and forces in `SuspensionSim`, not normalised values like `accelWot`.
2. Explicit ports on `step(dt, inputs)`: road height per wheel, plus optional longitudinal and lateral acceleration or forces and steering, defaulting to zero. Later, engine torque reaction and driveline torque enter there without changing the class's shape.
3. A separate `vehicle` block (sprung mass, CG height, wheelbase, track, front share) passed in as data rather than embedded in a topology's catalogue entry. Later an engine's `massKg` feeds it.
4. Use the engine's frame for vehicle coordinates: +Z forward, Y up, X to the right seen from the front. A longitudinal engine then sits in the car frame by translation alone. State this at the top of `src/suspension/kinematics.ts`, as `kinematics.ts` does.
5. State per corner in arrays from day one, even if v1 shows one corner, so quarter car and full car share a shape. A v1 quarter-car model is a good teaching start, but its API should not assume one corner.
6. A generic scene model (`SceneModel<Frame>`, with `update(frame)`), where each model owns its frame type and a `CarModel` can later hold child models. Keep the suspension model's origin at ground under the axle centre so a car can place it.
7. Per-subsystem design, codec and `resolve`. A later car link is a composition such as `#/car/<engine>.<suspension>`.
8. A `Section` contract instead of branches in `frame`. A car page becomes one more section composed of the others.

**What would close it or make it costly**
- Adding suspension fields to `Design`, `EngineSpec` or `FrameState`. Those flow into `ORDERED_KEYS`, the link codec and the snapshot (`src/designer/constraints.ts:192-198`, `tests/catalog-snapshot.test.ts:27-65`).
- `if (section === 'suspension')` branches inside `frame`, `layoutPanels` or `DesignerPage`.
- Normalised or tuned-to-feel physics, so that no real force can be exchanged.
- A second copy of `Stage`, which forks the visual identity and the shadow and quality decisions.
- Mass and CG hidden in per-topology constants.
- Calibration against body dimensions embedded in geometry, leaving no separate vehicle input.

**Not needed now:** building a car page, composing models, or adding a load port to `EngineSim`. The dyno idea (`docs/ideas.md:7`) would add it for its own reasons, and should use physical units when it does.

### Gaps
- The docs do not state an intention to build a combined car; the hints above are the whole of the evidence. `docs/ideas.md` covers only the engines section (`docs/ideas.md:1`). Whether the owner wants the combined system is a question for them.

## 7. Risks: where refactoring the engine section can hurt, and what tests would catch

### Takeaway
The pure pipeline is very well guarded (1260 tests, all passing in 18 s), so generalising it is low risk. Everything that runs in the browser is not tested at all: `main.ts`, `Stage`, `PistonEngineModel`, `Drive`, `DesignerPage`, `controls`, `results`, and the CSS. Splitting `main.ts` and touching `Stage` are the riskiest steps, and they require a browser check that does not yet exist.

### Cited Findings

**Baseline** (run for this research with `CI=true`, so no snapshots could be written; `git status` afterwards unchanged): 11 test files, 1260 tests passed, 18.28 s. `vite.config.ts` sets no test environment, and neither jsdom nor Playwright appears in `tests` or `package.json` (grep).

**What is and is not covered**

| Layer | Covered by | Would a regression be caught? |
|---|---|---|
| Engine definition, derived geometry, sound config | `tests/catalog-snapshot.test.ts:27-70`, `tests/kinematics.test.ts` | Yes, for the 25 page engines. `it.each` runs over `ENGINES`, which is page engines only (`src/data/engines.ts:1183`), so the 106 real engines (`docs/ideas.md:68`) are not in the snapshot |
| Real engines | `tests/variants.test.ts:38-63` | Within a band: power ±20%, torque −30/+35%, not fatal, opens in the designer |
| Designer identity with catalogue, including samples | `tests/designer-identity.test.ts:48-90` | Yes, for page engines |
| Constraints, links, fuzz | `tests/designer.test.ts:25-81`, `:255-303` | Yes |
| Sensitivity, reliability, dead controls | `tests/reliability.test.ts:124-153`, `:155` onward | Yes |
| Sim, sound | `tests/sim.test.ts`, `tests/synth.test.ts` | Yes, offline. Not thread bridging |
| Text and translation | `tests/i18n.test.ts` | Yes. Note it runs `articleHtml`, `tableHtml` and `PARAM_GROUPS` in Node |
| 3D models | `tests/rotary.test.ts:75-101` only: rotor geometry and which part glows, using a stubbed `document` | Barely. `PistonEngineModel` has no test (grep of `tests/`) |
| `Stage`, `main.ts`, `Drive`, `DesignerPage`, `controls.ts`, `results.ts`, `chart.ts` | None. Grep across `tests/` finds no import of any of them | **No** |
| CSS and layout at phone width | None. The designer plan describes manual checks at four sizes (`docs/superpowers/plans/2026-10-31-engine-designer.md:58`) | **No** |
| Pixels | None | **No** |

**Specific hazards in splitting `main.ts`**
- Declaration-order traps: `showEngine` uses `tachoScale` (`src/main.ts:269`), declared at `:317`. `applyZones` and heading sync touch `designer` (`:332`, `:386`). This works today only because the first calls happen at `:949-951`, after all declarations. Moved code can hit temporal-dead-zone errors at runtime, and `tsc` may not flag them.
- Implicit call order at boot: `loadEngine`, then `layoutPanels`, then `applyRoute`, then the frame loop (`src/main.ts:949-952`). `applyRoute` itself depends on `onDesigner` starting false.
- Transitions: leaving the designer resets panels, restores insets and keeps the engine running (`src/main.ts:395-420`). The original plan called this out as a danger point (`docs/superpowers/plans/2026-10-31-engine-designer.md:67`).
- Global key handling depends on focus and on which overlay is open (`src/main.ts:781-845`). Suspension keys must not rev the engine.
- `Stage.fitScale` is set by the route (`src/main.ts:398`), and `stage.fit` reframes from the current pose on every resize (`src/scene/stage.ts:118`, `:153-191`).

**Requirements for pixel comparison**
- The memory note requires it for rendering changes, judged on X-ray first.
- Two sources of non-determinism: bump textures use `Math.random` (`src/scene/materials.ts:22-24`, `:38-44`), and the view moves by itself through auto-rotate and demo motion.
- `prefers-reduced-motion: reduce` stops both orbit and demo motion (`src/main.ts:861-862`, `:893`), which gives a still frame if emulated. `Math.random` would need seeding by an init script.
- Browser flags are documented (`CLAUDE.md:132`), as is the `window.__engine` handle (`CLAUDE.md:134`).

**Guards that help:** `tsc --noEmit` catches type-level renames such as `EngineModel` to `SceneModel` (`package.json` build script, `CLAUDE.md:17`). The i18n test fails when new Cyrillic text appears outside `t()` or when a key is untranslated (`tests/i18n.test.ts:29-40`).

### Inferences

**Ranked risk**
1. **Splitting `main.ts`.** Largest and completely untested, with hidden ordering and global state. Keep the first step mechanical: move the block into `sections/engines.ts`, no logic changes, then check in a browser.
2. **`Stage` changes.** Any change affects every engine picture, and there is no automated way to see it. Add part lookup and types only; no behaviour changes in the same commit. Do not change lighting or framing for suspensions without a pixel comparison. Take the engine X-ray baseline before the refactor.
3. **Shared material or geometry changes.** They need the same pixel check. Add new helpers rather than edit existing ones. `springGeometry` in particular is used by valve springs (`src/scene/piston-engine.ts:488`), so use a new one for coil springs.
4. **CSS: dash grid and `designer-mode` selectors.** Scope new rules under a section class. Check at phone width.
5. **Generalising `DesignerControls` and `DesignerPage`.** Low value early and untested. Copy first, then extract once both exist.
6. **Sensitivity, codec and constraint shape extraction.** Low risk, well covered, and the i18n, identity and snapshot tests would catch mistakes.
7. **`resolveDesign` or `Design` edits.** Should not be necessary at all. A failure in `tests/catalog-snapshot.test.ts` from a suspension PR would mean the separation has already failed (`CLAUDE.md:94` says updating that snapshot is only allowed for intended changes).

**Suggested safe order** (for the plan writer)
1. Build a small Playwright golden harness: 4 to 6 engines, X-ray first, plus solid and mechanism, reduced motion, seeded random, plus a click-through of routes (catalogue, variant, designer, back, with the engine running). Store output in `.tmp/`.
2. Add a `Section` contract with engines moved behind it. No features.
3. Make `Stage` generic with no pixel change.
4. Add suspension pure code and tests in Node, fully independent.
5. Add the suspension section with its own files.
6. Extract shared helpers only where two working consumers exist.

Step 4 can happen in parallel with, or before, 1 to 3, because it does not touch any engine code.

### Gaps
- Whether the golden harness can be pixel-stable on software rendering was not tried. `CLAUDE.md:132` only says smoothness cannot be judged there, so the harness needs a tolerance check before it can be trusted.
- The runtime behaviour of the `main.ts` transitions was read in code, not exercised.
