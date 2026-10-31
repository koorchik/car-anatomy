# Suspension kinematics and alignment geometry: computable reference

Evidence tags, on every claim:

- **[V]** verified: I read the source text itself (the link is what I read).
- **[S]** verified only as a search-result excerpt. The full text was not read, usually because the page returned 403 to the fetcher. Treat as weaker. The search tool summarised several results together, so where a claim came from a group of similar pages (forum threads especially) the link is the best match, not a confirmed one.
- **[C]** computed by me with throwaway solvers on the stated inputs. Not an external source.
- **[D]** derived by me from statics or geometry. No external source was retrieved for it. Check it against RCVD or Dixon before relying on it.
- **[NV]** not verified: recollection only. Listed under Gaps.

Unless noted, formulas use the ISO frame: X forward, Y left, Z up, origin on the road plane at the vehicle centreline. `σ = +1` for a left wheel, `-1` for a right wheel. Lengths in metres, angles in radians unless stated. Bump (jounce) is `dz > 0` of the wheel relative to the body.

Main caveat: none of the suggested textbooks (Milliken RCVD, Dixon, Reimpell, Staniforth, Gillespie, Heißing & Ersoy) were read. The per-type numbers below come from open papers, tool vendors, code and search excerpts. Their quality is uneven and is flagged line by line.

## 1. Definitions and sign conventions (SAE J670 vs ISO 8855)

### Takeaway
The axis systems differ in Y and Z direction. Side-referenced quantities (camber, toe, caster, KPI, scrub, trail) do not change between them, but steer, inclination, pitch and yaw do flip sign. Roll-steer sign conventions vary between sources even within one frame, so the project should store one frame and name every coefficient by its understeer or oversteer effect.

### Cited Findings

**Axes**
- ISO 8855:2011 vehicle axis system: right-handed, X_V forwards, Y_V to the left, Z_V upward. The "intermediate axis system" has X and Y parallel to the ground plane, with X the projection of X_V. This separates body-referenced angles from road-referenced ones. [V] — [ISO 8855:2011 publisher preview](https://cdn.standards.iteh.ai/samples/51180/622bf2fe26e14d0980ee6354e95efa9f/ISO-8855-2011.pdf)
- SAE J670e historically used X forward, Y right, Z down. The revised J670 accepts both orientations and is described as a harmonised superset. [S] — [SAE J670 listing](https://saemobilus.sae.org/content/J670_200801). A 2022 revision is listed as current. [S] — [SAE J670-2022 listing](https://eshop.normservis.sk/norma/sae-j670-1.6.2022.html)
- Rotation signs: ISO pitch is positive nose-down, roll is positive left-side-up, yaw is positive anticlockwise from above. In SAE FRD, pitch is positive nose-up, roll is the same as ISO, yaw is opposite. [V] — [Technia/Claytex VeSyMA sign convention](https://blog.technia.com/en/mbse/vesyma-sign-convention/). I checked this table against the right-hand rule and it is consistent. [D]

**Side-referenced angles**
- Camber: positive when the top of the tyre leans away from the vehicle centreline. Toe: positive (toe-in) when the front of the wheel points toward the vehicle. [V] — [Technia/Claytex](https://blog.technia.com/en/mbse/vesyma-sign-convention/)
- Camber vs inclination are different quantities. Inclination is positive when the top of the wheel leans toward the vehicle's right. This equals positive camber on the right wheel and negative camber on the left. [V] — [MRA Moment Method manual §4.5.3](https://millikenresearch.com/MMM410man.pdf)
- That manual (SAE-style frame): steer is positive for a right turn. Roll is positive when the right side moves down. A positive axle roll angle occurs in a right-hand turn, while chassis roll in a right-hand turn is negative. [V] — [MRA manual §4.5.1, §4.5.5](https://millikenresearch.com/MMM410man.pdf)

**Roll-steer sign is convention-dependent**
- Volvo S60 data: a negative front roll-steer coefficient means understeer, and the opposite applies at the rear. Roll is positive when the car leans right seen from behind. [V] — [Angelis et al., AVEC'14](https://www.diva-portal.org/smash/get/diva2:800853/FULLTEXT01.pdf)
- MRA manual: front solid-axle coefficient is "negative for roll understeer" and a positive rear coefficient is understeer. [V] — [MRA manual §4.5.5–4.5.6](https://millikenresearch.com/MMM410man.pdf)
- Bundorf tables instead use positive = understeer on both axles. [V] — [Wikipedia: Bundorf analysis](https://en.wikipedia.org/wiki/Bundorf_analysis)

**Other definitions**
- Force-based roll centre (SAE wording): the point in the transverse vertical plane through a pair of wheel centres at which lateral forces may be applied to the sprung mass without producing suspension roll. The geometric roll centre comes from geometry alone, via instant centres. [V] — [Wikipedia: Roll center](https://en.wikipedia.org/wiki/Roll_center)
- Scrub radius terminology varies. "Ground offset" is sometimes used for it, and US practice sometimes defines scrub radius differently. [S] — [ScienceDirect topic: Steering axis](https://www.sciencedirect.com/topics/engineering/steering-axis)
- K&C rigs report these named quantities per test. Bounce: bump steer, bump camber, bump caster, wheel recession, wheelbase change, track change, kinematic anti-dive/anti-squat angles, VSA length and angle, kinematic roll-centre height and locus, wheel rates. Roll: roll steer, roll camber, roll stiffness, axle steer. Longitudinal: wheel-centre, toe, caster and camber stiffness, jacking forces, force anti-dive/anti-squat angles. Lateral: toe, camber and wheel-centre stiffness, jacking forces, force-based roll-centre height and locus (parallel test only). [V] — [Morse Measurements, Description of K&C Tests](https://www.morsemeasurements.com/wp-content/uploads/2019/01/Description_of_K_and_C_Tests.pdf). This list is a good target for the project's output vocabulary.

### Inferences

**Frame conversion** [D]: `Y_ISO = -Y_SAE`, `Z_ISO = -Z_SAE`, X unchanged. Roll keeps its sign. Pitch, yaw and road-wheel steer flip. Camber, toe-in, caster, KPI, scrub and trail are side-referenced and do not change.

**Formulas from hardpoints.** Inputs: `s` = unit spin axis pointing **outboard** on either side. `W` = wheel centre. `L`, `U` = lower and upper steering pivots (ball joints, or lower ball joint and strut top mount). `k = unit(U - L)` points up. The road plane is Z = 0. All formulas below were exercised in my scratch solvers, except where stated. [C]/[D]

| Quantity | Formula | Sign |
|---|---|---|
| Camber γ | `γ = -asin(s·Z)` | + top leans outboard |
| Toe-in τ | `τ = atan2(s_x, abs(s_y))` | + front points inboard (both sides) |
| ISO steer δ | `δ_left = -τ_left`, `δ_right = +τ_right` | + left turn |
| Caster θ | `θ = atan2(-k_x, k_z)` | + top rearward |
| KPI / SAI λ | `λ = atan2(-σ k_y, k_z)` | + top inboard |
| Contact point C | `r = unit(Z - (Z·s)s)`; `C = W - r·(W_z / r_z)` | point where the wheel plane's radial line meets the road |
| Axis ground point G | `G = L + k·(-L_z / k_z)` | |
| Scrub radius | `r_s = σ(C_y - G_y)` | + G inboard of C (common convention, see Gaps) |
| Mechanical trail | `t = G_x - C_x` | + G ahead of C |
| Spindle length | `d = abs(k × (W - L))` (perpendicular distance) | see Gaps: other definitions exist |
| Half track, track change | `y_C = abs(C_y)`, `T = y_C,L + y_C,R`, `ΔT` over travel | |
| Wheelbase change | `Δ(C_x,front - C_x,rear)`; recession is `dW_x/dz` | |
| Bump steer | `dτ/dz` (deg/m) at both wheels moving together | |
| Camber gain | `dγ/dz` (deg/m); relates to front-view swing arm: `abs(dγ/dz) ≈ 1/FVSA` | negative = more negative camber in bump |
| Roll camber | `dγ/dφ`: state whether body-relative or road-relative | |
| Roll steer | `dτ/dφ` per wheel; axle roll steer = mean steer per roll angle | name the effect (US/OS) |
| Motion ratio | `MR = ds/dz` (spring travel per wheel travel); wheel rate `K_w = K_s·MR²` by virtual work | |
| Ackermann, ideal | `cot δ_o - cot δ_i = B/L_wb` (B = kingpin ground-point spacing, L_wb = wheelbase) | |

**Road-vs-body roll camber** [D]: with body roll φ and symmetric double bump `z = ±(T/2)φ`, the road-relative factor is `RCF = 1 - (T/2)·abs(dγ/dz)`, with `dγ/dz` in rad/m. This reconciles apparently conflicting published numbers: Volvo's ≈0.25 deg/deg and the ≈0.85 factor are consistent if the first is body-relative and the second road-relative. That is my inference. The Volvo paper says only "with respect to the body".

### Gaps
- The full text of SAE J670 and ISO 8855 §7.1 (steer and camber definitions) is paywalled and was not read. The iTeh preview stops before those clauses. A site offering a copy of J670 was blocked by the permission system and I did not work around that. So the formal wording of caster, KPI, kingpin offset, roll-centre clauses and any J670-specific toe or camber text is **not verified**.
- [NV] Scrub radius positive when the axis meets the ground inboard of the contact centre. [NV] Caster positive with top rearward. These are the conventions I used and they are common, but no fetched source states them directly.
- [NV] Spindle length: I recall RCVD using a front-view horizontal distance at wheel-centre height, while "kingpin offset at hub" is a separate term. I report the perpendicular form because it is unambiguous.
- [NV] Ackermann percentage has several definitions, e.g. `A% = 100·(δ_i - δ_o)/(δ_i,ideal - δ_o)`. No source retrieved.

## 2. Computing everything from 3D hardpoints: the solver per type

### Takeaway
All link-type suspensions reduce to one pattern: rigid-body pose unknowns, one distance residual per link, one driver per free DOF, solved by Newton with continuation or by Levenberg-Marquardt (LM). Derivatives such as roll centre, anti percentages and motion ratio all follow from the same constraint Jacobian. Trailing and semi-trailing arms have closed forms. Twist beams are not a pure linkage and need a modelling choice. Solid axles couple both wheels by construction.

### Cited Findings

**Solver practice in published or open work**
- Cartesian point-coordinate formulation with constraint equations that are "mostly linear or quadratic", solved iteratively, for MacPherson and double wishbone. [S] — [Attia, MacPherson numerical analysis](https://koreascience.kr/article/JAKO200311922064199.page?lang=en); [Mohamed & Attia, double wishbone](https://next.sciencegate.app/document/10.1139/tcsme-2000-0031)
- Newton-Raphson on equilibrium equations, including bushing elastokinematics. [S] — [Magri, Gadola, Chindamo, Sandrini 2024](https://iris.unibs.it/handle/11379/606485)
- `suspension-explorer-core` (Python, AGPL-3.0): models rigid parts and joints for double wishbone, MacPherson, five-rod multilink and semi-trailing arm. It uses `scipy.optimize.least_squares` in LM mode with analytical Jacobians (a code comment gives LM's damped least squares as the reason for handling awkward systems), and evaluates motion ratios and response derivatives from the solved constraint Jacobian, not by finite differencing sweep steps. It reports multilink steering geometry through a virtual screw-axis family because no physical kingpin exists. It does not support offset-axis MacPherson struts or twist beams. [V] — [README and `solver.py`](https://github.com/suspension-explorer/suspension-explorer-core). AGPL means this is usable as an algorithm reference only, not for copying into the site.
- Closed-form alternatives: trilateration plus arbitrary-axis rotation for double wishbone. [V] — [Dendengzel/double-wishbone-kinematics](https://github.com/Dendengzel/double-wishbone-kinematics). Circle intersection on planar constraints, used for real-time vehicle simulation. [V] — [GripRush UE5 plugin](https://github.com/fgrenoville/Async-Physics-Suspension-Kinematics)
- MacPherson with steering has mobility F = 3 by the spatial Grübler count: F = 6(6−1) − [(6−1)·3 + (6−3)·4] = 3. These are the rack, the arm/strut motion, and an idle tie-rod spin about its own axis. The kingpin axis runs through the lower ball joint and the strut top, and is distinct from the strut axis. [V] — [Iwatsuki, JTEKT Eng. Journal 1019E, 2023](https://www.jtekt.co.jp/e/engineering-journal/assets/1019/1019e_02.pdf)
- **That paper gives measured hardpoints of a real compact FWD MacPherson** (Table 1; +x right, +y forward, z up, right-front wheel, mm): wheel centre (730, 0, 0); arm axis point (350, 220, −68), direction (0.0324, 0.9947, −0.0972); strut upper (560, −57, 470); strut bottom (590, −5, 54); kingpin lower (680, 17, −86); rack (0, 77, 48); inner tie-rod (280, 77, 48); outer tie-rod (690, 120, 6); W = 1460, L = 2500, L_T = 414.38, L_S = 387.86. [V] — [same paper](https://www.jtekt.co.jp/e/engineering-journal/assets/1019/1019e_02.pdf). It also notes vehicle design data are generally a corporate trade secret, which limits how many real hardpoint sets can be found.

**Roll centres**
- Kinematic roll centre (KRC) comes from the bounce test and force-based roll centre (FBRC) from the parallel lateral test, so a measured K&C report contains both. [V] — [Morse](https://www.morsemeasurements.com/wp-content/uploads/2019/01/Description_of_K_and_C_Tests.pdf)
- The classic KRC construction ignores the tie rod: five links connect the upright to the body, not four. That tie rod accounts for much of the KRC–FBRC difference, and minimising bump steer reduces the gap. [S] — [Mitchell, SAE 2006-01-3617](https://saemobilus.sae.org/papers/force-based-roll-centers-improved-kinematic-roll-center-2006-01-3617)
- In the simple 2D symmetric case the two are identical. KRC ignores jacking force. [S] — [Mitchell, "Roll Center: Myths and Reality"](https://files.engineering.com/download.aspx?folder=57b695a8-0a45-4a89-bfe7-2af98bf192c8&file=Vehicle_Dynamics2007_%281%29_Mitchell.pdf)
- Kinematic and force roll centres are really different points. KRC is most meaningful at small lateral acceleration, and the force version suits high lateral acceleration. [S] — [Dixon, Proc. IMechE 1987](https://journals.sagepub.com/doi/10.1243/PIME_PROC_1987_201_159_02)
- Simulations in a practitioner thread differed mainly at large roll and with high or below-ground roll centres, because the geometric method omits jacking or lowering. Results were similar with the roll centre near the ground. Practitioner opinion. [S] — [DSR forum](https://www.tapatalk.com/groups/dsrforum/roll-center-height-t1566-s40.html)
- A third definition, the Dynamic Roll Axis, has been proposed. [S] — [Badiru, SAE 2014-01-0136](https://saemobilus.sae.org/papers/three-suspension-roll-centers-application-vehicle-dynamics-2014-01-0136). Screw theory review of validity. [S] — [Lee & Shim 2011](https://link.springer.com/article/10.1007/s12239-011-0089-6)
- 2D construction for a sanity page: line intersection of arm lines for IC, then contact-patch-to-IC line crossed with the centreline. [V] — [jrfoster09 simulator](https://jrfoster09.github.io/portfolio/projects/suspension.html)

**Anti percentages**
- From `anti_geometry.py` (ISO frame; T = contact centre, SVIC = side-view instant centre, L = wheelbase, h = CG height, b_f = front brake fraction). [V] — [suspension-explorer-core, `src/kinematics/core/metrics/anti_geometry.py`](https://github.com/suspension-explorer/suspension-explorer-core)
  - Anti-dive: `100·b_f·(L/h)·tanθ`, with `tanθ = (SVIC_z - T_z)/(T_x - SVIC_x)`
  - Anti-lift: `100·(1-b_f)·(L/h)·tanθ`, with `tanθ = (SVIC_z - T_z)/(SVIC_x - T_x)`
  - Anti-squat: `100·(L/h)·tanθ`, with reference WC (wheel centre) for inboard-sprung drive: rear `tanθ = (SVIC_z - WC_z)/(SVIC_x - WC_x)`, front `(SVIC_z - WC_z)/(WC_x - SVIC_x)`
- The search summary of a [formula sheet](https://www.formuladen.com/PDF/Nodes/7571/List-of-Important-Suspension-geometry-Formulas.PDF) described anti-squat as tanθ times "CG height over wheelbase". That conflicts with L/h above. Statics supports L/h: vertical force `F_x·tanθ` over load transfer `m·a·h/L`. [D] Use L/h.
- K&C rigs report kinematic and force versions of these angles separately. [V] — [Morse](https://www.morsemeasurements.com/wp-content/uploads/2019/01/Description_of_K_and_C_Tests.pdf)

**Twist beam**
- Kinematic analogy: treat the beam as a semi-trailing arm whose rotation axis runs from the bushing to the shear centre. Roll centre height, roll camber, roll steer and roll stiffness follow, in terms of shear centre, hardpoints and spring rates. [S] — [torsion-beam paper, core.ac.uk](https://core.ac.uk/download/357197116.pdf)
- Shear-centre height drives rear roll steer. Twist beams naturally produce roll oversteer, and raising the shear centre above the wheel centre moves toward roll understeer. [S] — [patent application 20100301579](https://patents.justia.com/patent/20100301579)
- Roll steer and durability relate to the warping constant and shear centre of the section. [S] — [Korean study](https://www.koreascience.or.kr/article/JAKO199911920267351.page?lang=ko)
- Commercial models treat twist beams through measured K&C gradients and tables, not hardpoints. [V] — [MathWorks Twist-Beam Suspension K and C](https://www.mathworks.com/help/vdynblks/ref/twistbeamsuspensionkandc.html)

### Inferences

**General numerical pattern** [D], exercised [C]:

```
Unknowns: rigid-body pose q = (t, r) of each hub or axle (6), or Cartesian joint points.
Residuals, for each link:
  distance:  |p_body - T(q)·p_hub|² - L² = 0
  line:      n1·(p_top - T(q)·p_clamp) = 0, n2·(...) = 0   (strut slides through top mount)
  driver:    W_z(q) - z_target = 0, plus rack position for steering
Iterate:     J(q)·Δq = -r(q);  q ← q + Δq
Sweep:       warm-start from the previous step (continuation)
Accept:      max|r| < 1e-9 m or similar, and check sign(det J) has not flipped
```

Derivatives come from the implicit function theorem. With `J·dq = e_driver`, `dq/dz` gives instantaneous velocities of every point with no finite differences. The instant screw of the hub follows: `ω` from relative point velocities, `p_axis = P + (ω × v_P)/|ω|²`, pitch `h = (ω·v)/|ω|²`.

**Per-type setup** [D], with results from my scratch solvers [C]. All hardpoints invented except the JTEKT row.

| Type | Unknowns | Constraints | Drivers / free DOF | Notes and results |
|---|---|---|---|---|
| Double wishbone | 9 (LBJ, UBJ, TRO points) | 2+2 arm spheres, 1 tie rod, 3 rigid-upright distances = 8 | 1 bump | Newton converged in 4–5 iterations from the static guess at ±100 mm. Residual fell 1e-1, 1e-2, 3e-4, 4e-7, 1e-12 (quadratic). Closed form also possible via circle-sphere intersection. |
| MacPherson | 6 pose | 2 arm (or revolute arm), 2 line-through-top, 1 tie rod | 1 bump + 1 rack | 3 iterations at ±80 mm, on the JTEKT published hardpoints and on invented ones. |
| 5-link | 6 pose | 5 distances | 1 bump + (if steered) rack | Hardest to author. See warning below. |
| Trailing / semi-trailing | 1 angle θ | Revolute axis fixed in body | 1 | Closed form: rotate about axis A→B. Scalar root-find for target z. |
| Twist beam | 2 angles | Analogy axes | 2 (heave, roll) | See below. |
| Solid axle | 6 pose of one axle | Links | 2 (heave, axle roll) | Both wheels come from one pose. See below. |

**5-link warning** [C]: with two hardpoint layouts I invented, the solve was unreliable. On layout A, a naive start at −40 mm jumped to a wrong branch (toe −75°, 38 iterations) while 5 mm continuation gave a different answer with toe +29°. On layout B, Newton hit 40 iterations without converging at −40 mm and returned NaN at −80 mm. Rank at design was full for layout A (rank 6), yet toe sensitivity was about 325 deg/m. Conclusions: Newton itself is not the problem, plausible-looking hardpoints are. A 5-link data file needs real geometry, continuation, a sign(det J) check, and a loud failure when a link toggles. I did not get a clean, realistic 5-link sweep, so this type is **not validated** in my checks.

**Semi-trailing** [C]: axis swept 16.7° with the outer pivot forward, wheel centre 0.78 m out, 0.30 m high. Roll centre was 128.4 mm by both the IC construction and `y_C·dy_C/dz`. Camber gain was −36 deg/m. With a horizontal axis, toe has zero first-order rate but is toe-in in both directions at second order (0.25° at ±80 mm). My first try had the axis swept the wrong way (RC −247 mm), so a wrong-sign sweep is easy to enter by mistake and tests should catch it.

**Twist beam proposal** [D]: decompose wheel motion into heave and roll.

- `θ_h = (θ_L + θ_R)/2` rotates both arms about the bush–bush axis, like plain trailing arms.
- `θ_r = (θ_L - θ_R)/2` rotates each side about its own axis from bush `B` to shear-centre point `S` on the centreline.
- Compose `R = R_heave(θ_h)·R_side(±θ_r)`. The order of composition is a modelling choice and small at real travel. The model is a published first-order analogy, not exact: the beam deforms and warps.

Roll centre from the analogy [C], for pivot x = 0.5 m, wheel at x = 0, half track 0.75 m, S at height 0.30 m:

| Shear-centre x position | Roll centre height |
|---|---|
| 0.45 m (near pivots) | 34 mm |
| 0.30 m | 130 mm |
| 0.15 m | 219 mm |
| 0.05 m | 274 mm |
| 0 (at wheel plane) | 300 mm |

This reproduces the expected limit behaviour: near the pivots it behaves like a trailing arm, and at the wheel plane like a rigid axle with roll centre at the beam. Good test oracle.

**Solid axle** [C]: rank analysis at design.

| Links | Rank | DOF |
|---|---|---|
| Triangulated 4-link | 4 | 2 |
| 3-link + Panhard | 4 | 2 |
| Exactly parallel 4-link + Panhard (5 links) | 4 | 2, Jacobian singular as a square system |
| 4-link with 20 mm plan offset + Panhard | 5 | 1 (kinematically cannot roll) |

Best-fit link stretch at 3° axle roll for the offset cases was 0.06 mm (20 mm offset) to 0.25 mm (100 mm offset). The parallel case stretched 0.001 mm. So parallel or nearly parallel 4-link + Panhard needs LM or pseudo-inverse, not a square Newton solve, and roll is taken by very small bushing deflection. These values are for one invented layout only. Left/right coupling is automatic since both wheels are rigid to the axle: `z_L = heave + (T/2)φ_a`, `z_R = heave - (T/2)φ_a`. Leaf springs need an equivalent-link model, which I did not investigate.

**Roll centre by three routes** [C]. Validates the formula set.

| Check | Route 1 | Route 2 | Result |
|---|---|---|---|
| Double wishbone, invented | Arm planes ∩ wheel plane | `z_RC = y_C·dy_C/dz` | 156.40 vs 156.33 mm |
| Camber gain vs 1/FVSA, same | 1/FVSA = 43.61 deg/m | Finite difference | 43.59 deg/m |
| IC by screw axis vs arm planes | y −0.5331, z 0.2636 | y −0.5333, z 0.2633 | Matches |
| MacPherson, invented | IC: arm plane ∩ plane normal to strut through top | `y_C·dy_C/dz` | 77.7 vs 80.1 mm |
| Semi-trailing | Axis ∩ wheel plane | `y_C·dy_C/dz` | 128.4 = 128.4 mm |

Recommended definition for the site: **`z_RC = y_C·(dy_C/dz)`** for symmetric bump. It is the virtual-work form, needs no line intersection, and does not blow up when arms are parallel. Report ICs separately, and handle parallel arms (IC at infinity).

**Unified statics** [D]: for a 1-DOF corner, virtual work gives the vertical load fed through the linkage rather than the spring:

```
F_z,linkage = F_y·(dC_y/dz) + F_x·(dP_x/dz)
```

with `P` = contact point for outboard brakes and wheel centre for inboard-sprung drive. This matches the anti and roll-centre forms above. For an inclined force line, `tanβ = dC_y/dz` per side and `tanθ = dP_x/dz`.

**Force-based quantities** [D] with outer and inner lateral forces `F_o`, `F_i`, and tanβ positive for a force line rising inboard:

```
Jacking:              J   = F_o·tanβ_o - F_i·tanβ_i
Force roll height:    h_F = (T/2)·(F_o·tanβ_o + F_i·tanβ_i)/(F_o + F_i)
Geometric RC height:  z_G = T·tanβ_o·tanβ_i/(tanβ_o + tanβ_i)
Geometric RC offset:  y_G = (T/2)·(tanβ_o - tanβ_i)/(tanβ_o + tanβ_i)
```

These coincide only at `tanβ_o = tanβ_i` with `F_o = F_i`. The geometric point misleads when load split is uneven (`h_F` is force-weighted, `z_G` a harmonic mean), when the car is rolled, when it is below ground or high up (jacking sign and size), or when the tie rod contributes. For a real 5-link or steered corner, get `tanβ` from the Jacobian, which includes the toe link, instead of from a 4-link construction.

**Scale of jacking** [D], with assumed numbers: axle load 8000 N, 1 g, ΔF_z ±2400 N per side, μ = 1, RC 100 mm, half track 750 mm gives `tanβ = 0.133`, `J ≈ 4800·0.133 ≈ 640 N`, about 11 mm rise at an assumed 30 N/mm wheel rate each side. An illustration only, but at a roll centre of 100 mm this is not negligible.

**Test oracles for the project** (mirrors how `tests/kinematics.test.ts` checks engines) [D]:

1. Equal-length parallel arms: zero camber in bump.
2. `abs(dγ/dz) = 1/FVSA` for double wishbone, within the 0.05% seen above.
3. All link lengths constant to solver tolerance across the sweep.
4. Left/right mirror symmetry.
5. RC by IC vs by `y_C·dy_C/dz`, exact for the revolute case.
6. Twist-beam limit cases above.
7. Regression against the JTEKT real hardpoints from Q3.

### Gaps
- Full texts of Attia, Mohamed & Attia, Magri et al. and the torsion-beam paper returned errors or 403, so formulations are known only from abstracts and excerpts.
- A paper from Houdek (2019), Newton-Raphson in MATLAB, was unreachable (DNS failure on the host).
- No validated 5-link sweep (see warning). No public production 5-link hardpoint set was found.
- Leaf-spring equivalent-link formulation not researched in detail.
- Twist-beam composition order and the treatment of beam warping have no source I could read. My composition is a proposal.
- Whether the Volvo, MRA, or J670 definitions use contact-patch or wheel-centre travel in their "bump" denominators can differ. K&C reports must be read carefully.

## 3. Typical real curves and values per type

### Takeaway
Measured data is scarce in open sources. The best anchors found are a Volvo S60 K&C set, a compilation of ranges known only by excerpt, and one real MacPherson hardpoint set that I ran through a solver. Rough road-car orders: camber gain 8–20 deg/m, road-relative roll camber factor 0.6–0.9 for independent, roll centres about 50–130 mm front and up to about 240 mm rear, anti-dive 20–50%. Many per-type cells stay unverified.

### Cited Findings

**Vehicle-level K&C anchor**
- Volvo S60 (CAE authors, K&C-measured). Suspension type not stated in the paper. [V] — [Angelis et al., AVEC'14](https://www.diva-portal.org/smash/get/diva2:800853/FULLTEXT01.pdf)
  - Roll steer per roll, deg/deg: front −0.135 / −0.111 L/R, mean −0.123 (understeer). Rear −0.00 / −0.01, negligible. The parameter table prints 0.123 / 0.007.
  - Camber per roll, deg/deg: front +0.243 / −0.264 L/R, rear +0.452 / +0.434. The sign pattern is odd (front antisymmetric, rear symmetric). Quoted as printed.
  - Roll centre height front/rear 0.12 / 0.24 m, CG 0.5 m. Roll stiffness 45 / 37.5 kNm/rad.
  - Static camber magnitude 0.7° front, 1.3° rear (minus signs lost in PDF text extraction). Wheel radius 0.316 m, pneumatic trail 0.033 m.

**Per-type roll camber**
- "Roll camber factor": MacPherson ≈0.85, double wishbone ≈0.80, longitudinal link ≈1.05, compound crank ≈0.55, rigid axle 0.0. Units not stated in the excerpt, consistent with deg/deg road-relative. [S] — [ScienceDirect topic: Camber angle](https://www.sciencedirect.com/topics/engineering/camber-angle-gamma)
- Compilation ranges, sign by understeer effect. Front roll steer +0.2 (US) to −0.1 (OS) deg/deg, rear +0.13 to −0.06. Front roll camber 0.61–0.88, rear 0–0.86 deg/deg. Undated, hard-to-read layout. [S] — [Summary of Typical Vehicle Parameter Measurements](https://www.researchgate.net/publication/329552571_SUMMARY_OF_TYPICAL_VEHICLE_PARAMETER_MEASUREMENTS_Mass_and_Inertia_Properties_SUMMARY_OF_TYPICAL_VEHICLE_PARAMETER_MEASUREMENTS_Compliance_Parameters)
- Rigid axle with steering gear on the axle beam: zero roll steer, and small camber change against the ground. [S] — [ScienceDirect rigid-axle study](https://www.sciencedirect.com/science/article/abs/pii/S0389430402002291)

**Camber gain and bump steer**
- Multilink −1.5 deg/100 mm, MacPherson −0.8 deg/100 mm (= −15 and −8 deg/m; the search summary misconverted this as −1.5/−0.8 deg/m). Single study, setup unread. [S] — [Comparative Study of Macpherson and Multi-Link](https://www.researchgate.net/publication/400956794_Comparative_Study_of_the_Performance_of_Macpherson_and_Multi-Link_Suspensions_in_Dynamic_Conditions)
- Double wishbone demo (simulation): bump camber −20.3 deg/m, roll camber −20.4 deg/m, bump steer −3 deg/m on centre and −1.7 deg/m at 25 mm bump. [S] — [RACE Software KPI report](https://race.software/wp-content/uploads/2024/05/RACE_Software_Demo_Simulation_Double_Wishbone_Suspension_ADVANCED.pdf)
- Multilink tuned model ≈ −20 deg/m with near-zero bump steer (simulation only). [S] — [Diokle PR](https://github.com/ferax564/Diokle/pull/5)
- Bump-steer sensitivity: a 10 mm shift of the outer tie-rod joint changed bump steer by 11.1 deg/m on a MacPherson (virtual K&C). [S] — [RACE Software, hardpoint accuracy](https://race.software/impact-of-suspension-hardpoint-accuracy-on-suspension-performance/)
- MRA manual: a "typical toe-out response" with jounce. Sample inputs 0.10 deg/in steer and −0.213 deg/in, −0.07 deg/in² inclination are illustrations, not benchmarks. [V] — [MRA manual](https://millikenresearch.com/MMM410man.pdf)
- FSAE target of 0.6–0.8 deg camber per deg roll. Racing students, not road cars. [S] — [UT Austin write-up](https://cloud.wikis.utexas.edu/wiki/display/RMD/Camber+Gain+Optimization+for+Double+Wishbone+Suspension+-+Parker+Randall)
- Double wishbone gives more consistent camber gains while MacPherson sees diminishing returns after initial gain (student notes). [S] — [Midnight Sun design wiki](https://uwmidsun.atlassian.net/wiki/x/EQDf3w)

**Steering axis**
- KPI 6–14° average, caster 0.5–7° (literature cited by student design notes). Scrub about ±10–20 mm targets. Low quality. [S] — [Midnight Sun wiki](https://uwmidsun.atlassian.net/wiki/x/EQDf3w)
- MacPherson caster: FWD about 4°, RWD about 7°. Informal forum claim. [S] — [Eng-Tips thread](https://www.eng-tips.com/threads/kingpin-inclination-caster-etc-for-mcpherson-strut.113181/)

**Roll centres, other**
- MacPherson baseline RC 45 mm, −90 mm after lowering, 40 mm after correction. One worked example, shows how fast MacPherson RC moves with ride height. [S] — [RACE Software, lowered ride height](https://race.software/suspension-modifications-performance-impact-of-lowered-ride-height-and-wheel-spacers/)
- Twist beam: RC barely moves with travel, set by axle height and arm geometry. Forum post. [S] — [ClioSport](https://cliosport.net/threads/rear-roll-center-change-when-lowering.734253/)

**Anti percentages** (no production-car survey found)
- 20–50% anti-dive, 30–70% anti-squat. [S] — [Skill-Lync Q&A](https://resources.skill-lync.com/branches/automobile-engineering/questions/vehicle-dynamics/anti-dive-anti-squat-geometry)
- 20–40% both. [S] — [coilovers.com guide](https://coilovers.com/blogs/guides/suspension-kinematics-geometric-principles)
- Anti-dive seldom over 50%, 20–25% often the sweet spot, some street cars under 30%. Racing-oriented. [S] — [Paddocklink](https://paddocklink-docs.pages.dev/lms/suspension-and-chassis-design/advanced-geometry-strategies/anti-dive-and-anti-squat/)

### Inferences

**Real MacPherson computed by me** [C], using the [JTEKT Table 1](https://www.jtekt.co.jp/e/engineering-journal/assets/1019/1019e_02.pdf) hardpoints. Assumptions not in the paper: rolling radius 300 mm, zero static camber and toe, arm as a revolute about the published axis. Check: tie-rod length reproduces 414.38 mm. Kingpin-to-arm-axis radius came out 338.4 mm, while the paper's L_S is 387.86, whose meaning I could not confirm.

Static: KPI 12.18°, caster 7.58°, scrub 3.8 mm, trail 45.5 mm. The scrub and trail values depend on the assumed radius; KPI and caster do not.

| Bump (mm) | Camber (°) | Toe-in (°) | Half-track (mm) | KPI (°) | Caster (°) | Scrub (mm) | Trail (mm) |
|---|---|---|---|---|---|---|---|
| −80 | +2.09 | +0.60 | 706.7 | 9.08 | 6.02 | 23.6 | 28.5 |
| −40 | +0.87 | +0.35 | 720.6 | 10.76 | 6.74 | 14.3 | 36.0 |
| 0 | 0 | 0 | 730.0 | 12.18 | 7.58 | 3.8 | 45.5 |
| +40 | −0.48 | −0.35 | 734.1 | 13.31 | 8.58 | −8.0 | 57.1 |
| +60 | −0.55 | −0.48 | 733.8 | 13.75 | 9.14 | −14.6 | 63.9 |
| +80 | −0.49 | −0.56 | 731.7 | 14.09 | 9.77 | −21.5 | 71.5 |

At design: camber gain −17.1 deg/m, bump steer −9.2 deg/m (toe-out in bump), `dy_C/dz` = 0.173, **roll centre ≈ 126 mm**, road-relative RCF ≈ 0.78, recession `dW_x/dz` = +0.05 (wheel moves forward in bump). Camber gain **reverses** around +60 mm. This matches the "diminishing returns" description of MacPherson and the "typical toe-out" description. The RCF falls in the published 0.61–0.88 range and near the 0.85 average. These agreements are encouraging, but they are one car under assumptions, not a validation.

**Rough consistency check** [D]: RCF 0.8 at half track 0.75 m implies `dγ/dz ≈ 15 deg/m`. This fits the −15 and −20 deg/m bump camber figures above and my computed −17 deg/m.

**Working per-type table** assembled from the above. Blank means no usable source found.

| Type | Bump camber (deg/m) | Road RCF (deg/deg) | Roll steer | RC height | Evidence |
|---|---|---|---|---|---|
| MacPherson | −8 [S], −17 [C] | ≈0.85 [S], 0.78 [C] | Toe-out in bump, understeer front [V, type unstated] | 45 mm [S], 126 mm [C] | One real geometry, two weak sources |
| Double wishbone | −20 [S, simulation] | ≈0.80 [S] | −3 deg/m bump steer [S, simulation] | | Weak |
| Multilink | −15 [S], −20 [S, simulation] | | | | Weak |
| Trailing arm | ≈0 by geometry when axis is transverse and level [D] | ≈1.05 [S] | ≈0 [D] | ≈0 with level axis [D] | Weak |
| Semi-trailing | | | Second-order toe-in with level axis [C] | Depends on sweep [C] | Geometry only |
| Twist beam | | ≈0.55 [S] | Roll oversteer tendency [S] | Depends on beam position [C] | Weak |
| Solid axle | ≈0 in equal bump [D] | 0.0 [S] | Zero with steering on axle [S] | Set by links [D] | Weak |

**Vehicle reference S60** [V] sits outside the table because its suspension type is not stated: RC 120 mm front, 240 mm rear, consistent with a rear roll centre above the front.

### Gaps
- No verified per-type numbers from RCVD, Dixon, Reimpell, Gillespie or Heißing & Ersoy. Those books are the obvious next step, ideally through a licensed copy. They would likely fill most blanks. I downloaded one unofficial copy of Dixon's book from a third-party site, saw its contents and some keyword-search lines, then deleted it after the permission system blocked a similar copy of J670. **No number here comes from it.**
- Typical roll-centre range per type: searches found no authoritative table. I searched specifically for a Reimpell figure and could not confirm one.
- Anti-dive, anti-squat and anti-lift per production type: no survey. The ranges are secondary and racing-tinged.
- Scrub radius and trail per production type: only weak student or forum sources plus my single computed car. [NV] Modern FWD with negative scrub for brake stability is widely stated, but no source retrieved.
- The MathWorks defaults (e.g. BumpCamber ±1.7189° at ±0.1 m) are **placeholders, not typical values**. Do not cite them as benchmarks.

## 4. Elastokinematics and compliance

### Takeaway
In open data, compliance moves toe and camber by the same order as kinematics at cornering loads, and sometimes more. A linear gradient matrix per wheel, as measured on K&C rigs, is the industry's own reporting format and a shipping commercial model, valid to about 0.4 g. It is honest if each coefficient is labelled measured or illustrative, because it cannot be derived from hardpoints alone without bushing stiffness data, which is rarely public.

### Cited Findings

**Magnitudes**
- Most mainstream production cars: lateral compliance steer about 0.1–0.2 deg/kN; below about 0.05 deg/kN is low for a production car. [S] — [RACE Software, Compliance Steer](https://race.software/ulp_lesson/compliance-steer/)
- Compilation: front lateral-force compliance steer about 0.60 deg/kN (understeer sign), rear about 0.02 and up to 0.22 toward oversteer. Lateral-force compliance camber front 0.24–0.75, rear 0.20–0.82 deg/kN. Undated, layout unclear. The 0.60 figure conflicts with RACE's 0.1–0.2, so treat it with care. [S] — [Summary of Typical Vehicle Parameter Measurements](https://www.researchgate.net/publication/329552571_SUMMARY_OF_TYPICAL_VEHICLE_PARAMETER_MEASUREMENTS_Mass_and_Inertia_Properties_SUMMARY_OF_TYPICAL_VEHICLE_PARAMETER_MEASUREMENTS_Compliance_Parameters)
- Stiff double wishbone demo: −0.036 deg/kN compliance steer, 0.061 deg/kN camber compliance. Simulation. [S] — [RACE Software demo](https://race.software/wp-content/uploads/2024/05/RACE_Software_Demo_Simulation_Double_Wishbone_Suspension_STANDARD.pdf)
- K&C lateral input for road cars typically about ±4000 N per tyre, roughly 0.8 g. The page now returns 404; figure from the search excerpt. [S] — [Multimatic K&C synopsis](https://www.multimatic.com/case-studies/kinematics-compliance-testing-synopsis)
- Bundorf example, deg/g, positive = understeer. [V] — [Wikipedia: Bundorf analysis](https://en.wikipedia.org/wiki/Bundorf_analysis)

  | Contribution | Front | Rear |
  |---|---|---|
  | Load transfer and tyre cornering stiffness | 8.0 | 7.0 |
  | Aligning torque | 0.2 | −0.2 |
  | Roll camber | 1.2 | 0.0 |
  | Roll steer | 0.6 | −0.4 |
  | Fy compliance steer | 0.3 | −0.1 |
  | Aligning-torque compliance steer | 0.7 | 0.6 |
  | Total | 11.0 | 6.9 |

  Net 4.1 deg/g. The analysis holds up to about 0.4 g. Illustrative values, not a measured car.

**Rig method and model structure**
- Tests apply separate parallel and opposed lateral loads. Parallel captures left/right connections (steering, subframe, anti-roll bar), and opposed isolates a corner. Braking and traction are separate tests with different force paths. Lateral force can be offset to mimic pneumatic trail. Output is curve fits with a coefficient spreadsheet. [V] — [Morse](https://www.morsemeasurements.com/wp-content/uploads/2019/01/Description_of_K_and_C_Tests.pdf)
- The Volvo paper applies lateral force at the contact centre and at 30 mm behind it (pneumatic trail) and interpolates between the two. [V] — [Angelis et al.](https://www.diva-portal.org/smash/get/diva2:800853/FULLTEXT01.pdf)
- A commercial model "multiplies the suspension geometry states by either gradient or table values", with units deg/kN (longitudinal and lateral steer and camber, caster), mm/kN (wheel centre), deg/kNm (aligning torque). [V] — [MathWorks Twist-Beam K and C](https://www.mathworks.com/help/vdynblks/ref/twistbeamsuspensionkandc.html)

**Linear vs nonlinear**
- Blundell's comparison of rigid, linear and nonlinear bushes found little difference over the vertical travel of a handling model, except plots such as steer change. [S] — [Influence of rubber bush compliance](https://www.sciencedirect.com/science/article/abs/pii/S0261306997001015)
- Decoupled K&C assumes orthogonal decomposition, which may be inaccurate. A multi-axis data-driven model reported higher accuracy. [S] — [Data-driven K&C model](https://www.researchgate.net/publication/376566699_A_data-driven_suspension_kinematics_and_compliance_model_considering_multi-axis_coupling_effects)
- Linear bushes cannot express amplitude and frequency dependence, and joint forces are sensitive to nonlinear stiffness. [S] — [Practical bushing model](https://www.researchgate.net/publication/264814342_A_practical_model_for_bushing_components_for_vehicle_dynamic_analysis); [Double wishbone air suspension K&C](https://www.sciencedirect.com/science/article/abs/pii/S0094114X20303426)
- In a four-link study, usually only one of a bushing's six stiffnesses matters, because of its location and orientation. Nonlinear curves were modelled as piecewise linear at five sections. Batches scatter widely. [S] — [Four-Link bushing analysis](https://www.researchgate.net/publication/267595394_Functional_Analysis_of_Bushing_in_Four-Link_Suspension_on_KC_Characteristics_Using_Multibody_Dynamics_Method)

**Weissach axle**
- Porsche developed and patented it as a passive rear-wheel steering system on the front-engined 928. [S] — [Total 911](https://www.total911.com/technology-explained-the-weissach-effect-axle/)
- Mechanism: the front pivot bush of the trailing arm is replaced by a short link, so a rearward wheel force under deceleration produces toe-in. Enthusiast source. [S] — [Rennlist](https://rennlist.com/forums/928-forum/637907-rear-steering.html)
- Goal: remove lift-throttle oversteer. Rubber flex matters: stiffer bushes reduce the effect, and one thread warns the link can over-react with polyurethane and wide tyres. Forum claims, one early post says toe-out, later ones dispute it. [S] — [Rennlist threads](https://rennlist.com/forums/928-forum/238298-rear-wheel-steering-anyone-know-how-the-rears-move.html); [Polyurethane bushings](https://rennlist.com/forums/928-forum/781592-polyurethane-weissach-bushings-available.html)

### Inferences

**Scale comparison** [D], with the assumption of 3° body roll at 4 kN per tyre:

| Effect | Compliance | Kinematics |
|---|---|---|
| Toe, front | 0.1–0.2 deg/kN × 4 kN = 0.4–0.8° | Volvo 0.123 deg/deg × 3° = 0.37° |
| Camber | 0.24–0.75 deg/kN × 4 kN = 1–3° (weak source) | 0.25 deg/deg × 3° = 0.75° (body-relative) |

So kinematics-only charts could be off by a factor of about two at cornering loads. A site page based only on hardpoints must say so. For bump steer vs roll steer, kinematics still dominates at low load, and in straight-line ride no lateral load exists to deflect bushes.

**Is a linear matrix honest?** Yes, with four conditions [D]:

```
[Δτ, Δγ, Δθ_caster, ΔW_x, ΔW_y]ᵀ = C(z)·[F_x, F_y, M_z]ᵀ
```

1. Keep kinematics `f(z, rack)` from hardpoints and add a compliance term, as K&C reports do. Separate braking and traction columns for `F_x`, since the force paths differ.
2. Validity label up to about 0.4 g per the Bundorf limit. No hysteresis, amplitude or frequency dependence.
3. Each coefficient carries `measured | illustrative`, like `verifyNote` and `voiceEvidence` in this project's data.
4. Do not claim a car-specific value without a K&C source. These are rarely public; I found no open vehicle-specific matrix.

**Deriving C from hardpoints when data is missing** [D]: for a link-type corner, let `G` map the hub twist to link-axis deformations and `K_b = diag(k_i)` be the bushing or link series stiffness along each link. Then `K_w = Gᵀ K_b G` and `C = K_w⁻¹`, with the spring included as one of the elements. This gives a physically consistent pattern (sign and direction of compliance steer) from geometry. Its size is only as good as the `k_i`, so show it as illustrative. It also gives a way to demonstrate a Weissach-style effect without overclaiming. The four-link finding that one stiffness per bush dominates supports this reduction. Untested by me.

**Weissach**: for the site, it is best shown qualitatively (brake or lift force → toe-in on the rear). Magnitude cannot currently be cited.

### Gaps
- No open dataset of wheel-centre longitudinal compliance (mm/kN) or brake and traction compliance steer per type. A paper on steering drift and wheel movement during braking looked relevant, but its text would not load. MathWorks defaults (±2 kN → ±10 mm) are placeholders.
- No quantified comparison of linear vs nonlinear compliance-matrix prediction error from a primary source. A secondary claim of "≤2.3%" error was seen only in a search summary and is rejected as unverified; the [MDPI paper on elastokinematics](https://www.mdpi.com/2075-1702/13/11/1047) returned 403.
- Weissach toe-in magnitude and bush rates: only forum content, no Porsche document or patent text read.
- ABD and MTS pages describe rigs, not results. No published K&C results for specific current cars were found.

## 5. Behavioural effect: what is first-order, second-order, or overrated

### Takeaway
At vehicle level, the front-to-rear balance of roll camber, roll steer and compliance steer sets most of the difference in understeer, in the only quantified budget found, even though tyres and load transfer are the largest absolute terms. Geometric roll-centre height is widely over-interpreted: it is a small-motion approximation and only one way of expressing load path. Ranking is partly my judgement, because I found no single source that ranks all quantities.

### Cited Findings
- Bundorf budget, as in the table in Q4: per-axle tyre and load-transfer terms are the largest (8.0 and 7.0 deg/g), but the understeer is the front-minus-rear difference (4.1 deg/g), and holds up to about 0.4 g. [V] — [Wikipedia: Bundorf analysis](https://en.wikipedia.org/wiki/Bundorf_analysis)
- Lateral load transfer, roll moment distribution, understeer gradient, turning circle, Ackermann, static toe, camber and caster, RC height at design load, trail, anti-dive and anti-squat, KPI, scrub, motion ratios, bump steer, roll steer, force steer, roll camber, RC gain, Ackermann change and track gain are listed as distinct design targets. No magnitudes given. [V] — [Wikipedia: Automotive suspension design process](https://en.wikipedia.org/wiki/Automotive_suspension_design_process)
- KRC and FBRC are close enough in the linear range for small motions to be useful in early design. [S] — [Autosport forum](https://forums.autosport.com/topic/83276-roll-centre-question). "Nothing wrong with the concept of geometric roll center... except perhaps that it is entirely misnamed". [S] — [Autosport forum](https://forums.autosport.com/topic/84282-roll-center)
- Jacking occurs because outer lateral force exceeds inner. [S] — [FSAE forum archive](https://fsae.com/forums/archive/index.php/t-5029.html). Mitchell's presentation also says KRC neglects jacking force. [S] — [Mitchell](https://files.engineering.com/download.aspx?folder=57b695a8-0a45-4a89-bfe7-2af98bf192c8&file=Vehicle_Dynamics2007_%281%29_Mitchell.pdf)
- Modern cars do not use pure Ackermann, partly because it ignores dynamic and compliance effects. It still holds at low speed. Some racing cars use reverse Ackermann for high-speed slip differences. [V] — [Wikipedia: Ackermann steering geometry](https://en.wikipedia.org/wiki/Ackermann_steering_geometry)
- The turning-centre fluctuation and steering angle difference for a real compact FWD car are evaluated in [Iwatsuki 2023](https://www.jtekt.co.jp/e/engineering-journal/assets/1019/1019e_02.pdf). [V]
- Large kingpin angles lead to large scrub radius (per this paper, not good for comfort, helpful for braking). [S] — [Belluomo et al., Univ. Padua](https://www.research.unipd.it/bitstream/11577/3402873/1/Belluomo2018design.pdf)
- Anti-geometry reduces pitch travel at the cost of suspension compliance and tyre grip. [S] — [Paddocklink](https://paddocklink-docs.pages.dev/lms/suspension-and-chassis-design/advanced-geometry-strategies/anti-dive-and-anti-squat/), [HP Academy](https://www.hpacademy.com/courses/suspension-tuning-and-optimization/suspension-geometry-anti-effects/)
- Volvo uses a camber stiffness constant of 2000 per tyre (units garbled in PDF extraction, presumably N/rad), so camber thrust is about 35 N per degree in that model, against a ≈4 kN tyre lateral force. [V, units unverified] — [Angelis et al.](https://www.diva-portal.org/smash/get/diva2:800853/FULLTEXT01.pdf)

### Inferences

**Budget read** [D] from the Bundorf example, front minus rear, deg/g: roll camber 1.2, roll steer 1.0, tyre and load transfer 1.0, aligning torque 0.4, Fy compliance 0.4, aligning-torque compliance 0.1. Total 4.1. So everything other than the tyre and load-transfer term contributes 3.1 of 4.1 deg/g in this example (2.7 without the aligning-torque term), because the large per-axle tyre terms mostly cancel. It is an illustrative example, so use this as a pattern, not a law.

**Tentative ranking** (my judgement from the above, not a citation):

| Tier | Quantity | Why |
|---|---|---|
| First-order for handling balance | Roll steer, compliance steer, roll camber per axle | Direct terms in the budget. About 0.3–1.2 deg/g each. |
| First-order at design | Bump steer, because of sensitivity | 10 mm of tie-rod error → 11 deg/m. My computed real MacPherson shows 0.35° of toe over 40 mm. |
| First-order for steering feel | Caster, trail, KPI, scrub | Steering torque, self-centring, brake stability. Swing a lot with travel on MacPherson (trail 28–72 mm in my computation). Magnitudes on handling not quantified here. |
| Important but indirect | Motion ratio | `MR²` scales wheel rate. Easy to compute, and easy to mislabel. |
| Second-order or situational | Anti-dive, anti-squat, anti-lift | Transient pitch, not steady-state load transfer. Under braking and traction, not cornering. Force and kinematic values differ. |
| Second-order at normal speed | Ackermann | Low-speed tyre scrub and turning. Modern cars deviate on purpose. |
| Small | Wheelbase change, recession in the kinematic term | Ride harshness and pitch-feel more than handling; hold it as a display value. |

**Commonly overrated** [D]:

1. **Geometric roll-centre height as a handling number.** Total lateral load transfer of an axle pair is `m·a_y·h_CG/T` whatever the roll centre height (statics). The roll centre only splits elastic from geometric load path and sets jacking. Front/rear RC height matters mainly through roll moment distribution, and through `J` when RC is high.
2. **Its precise location.** It moves quickly with ride height (45 → −90 mm in the lowered MacPherson example [S]) and is not a point the body physically rotates around at high lateral force. Showing a moving locus, labelled small-motion, is more honest than a single fixed point.
3. **Camber gain in isolation.** In roll, camber relative to the road matters, and this depends on `T/2·dγ/dz` and on roll angle itself, so the same camber gain reads differently at different roll stiffness.
4. **Pure Ackermann percentage.** Compliance and slip dominate at speed per the source above.

**For the site's charts**, this suggests: toe vs bump, camber (road-relative) vs roll, RC locus with its label, and steering-axis values vs travel (MacPherson shows strong movement). Add compliance as a separate, labelled overlay.

### Gaps
- No single sourced ranking of these quantities exists in what I read. RCVD, Gillespie and Dixon most likely address it. The ranking above is my judgement.
- No quantified effect found for scrub radius (torque steer, split-μ pull), caster (steering torque), or static camber (grip) on real cars.
- Anti-dive's effect on actual pitch or grip was not quantified by a primary source.
- The statics claim that roll centre height does not change total axle-pair lateral load transfer is standard, [NV] as to a retrieved citation, though derivable directly.
