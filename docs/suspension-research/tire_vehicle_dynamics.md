# Tire models and vehicle dynamics models for a real-time browser simulation

**Evidence tags used on every claim**

| Tag | Meaning |
|---|---|
| **[V]** | Verified: I read this in the linked page, PDF, property file or source code |
| **[V-S]** | Weakly verified: seen only in a search-result summary of the linked page; the page itself was not opened |
| **[C]** | Computed by me from the cited open data, or measured with throwaway code. Reproducible, but it is my calculation, not a published result |
| **[D]** | Derived by me from statics or algebra. Not a quotation. A cross-check is named where one exists |
| **[NV]** | Not verified: recalled from a textbook or general knowledge, not checked against the source |

**Sources I could not read.** Pacejka, Rajamani, Milliken, Gillespie, Guiggiani, Abe, and Blundell & Harty are all paywalled, so I did not read them. Wherever those books are named below, the content comes through another source or is tagged [NV]. The Hirschberg/Rill TMeasy paper returned 403. So did Dressel's bicycle-tyre thesis on core.ac.uk. The Marco Monster mirror sits behind a bot check.

**Throwaway code.** "Sim14" and "qs" are throwaway scripts I wrote for these notes: a 14-DoF model and a quasi-static axle solver. They were not validated against a real car. Their numbers show numerical behaviour, cost and trends, not vehicle truth.

---

## Tire models: what each captures, coefficients, camber numbers, open parameters

### Takeaway
- **Recommended model:** Magic Formula 6.1 equations (pure slip plus cosine-weighted combined slip) with relaxation-length states. It is the only model here that captures load sensitivity, camber, aligning torque, combined slip and pressure, and it costs about 0.09 microseconds per evaluation in JavaScript.
- **Biggest trap:** public road-tyre fits model camber *thrust* well (about 1.6% of Fz per degree) but mostly do not model the *peak-grip-vs-camber* curve (`PDY3 = 0`). "Camber's effect on grip" needs an explicit, separately calibrated term.

### Cited Findings

#### Capability matrix

| Model | Load sensitivity | Camber thrust | Peak vs camber | Mz | Relaxation | Combined slip | Pressure | Temperature |
|---|---|---|---|---|---|---|---|---|
| Linear `Fy = -C·α` | Only by scaling with Fz/Fznom | No | No | No | Added on the slip state | No | No | No |
| Dugoff | Via f(z) only; C is constant | Additive `γ·Cγ` | No | MathWorks gives a Fiala-like form | Yes in the MathWorks block | Yes, built in | MathWorks block: rolling resistance only | No |
| Fiala | Same as Dugoff | Additive `γ·Cγ` (MathWorks); none in Chrono | No | Yes | MathWorks block only | Friction-ellipse style | No | No |
| MF 5.2 / 6.1 | Yes, in stiffness and peak | Yes | `PDY3` (often 0 in fits) | Yes | σ = K/C | Yes, with its own fitted coefficients | 6.1 only | Not in the equations I read |
| TMeasy (Chrono version) | Yes, quadratic between Fz,n and 2·Fz,n | **No** (γ is used only for Mx) | No | Yes (trail curve) | Not in Chrono; yes in the commercial model | Yes, no extra parameters | Only `pn ∝ (p/p_li)^0.8` | No |
| TMsimple (Chrono) | Yes | No | No | Not checked | Not checked | Yes | Same family | No |

Basis for the table:
- Linear with Fz/Fznom scaling and relaxation: [MathWorks Vehicle Body 3DOF](https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html) [V]
- Dugoff: [MathWorks Dugoff Wheel 2DOF](https://www.mathworks.com/help/vdynblks/ref/dugoffwheel2dof.html) [V]
- Fiala: [MathWorks Fiala Wheel 2DOF](https://www.mathworks.com/help/vdynblks/ref/fialawheel2dof.html) and [Chrono ChFialaTire.cpp](https://github.com/projectchrono/chrono/blob/main/src/chrono_vehicle/wheeled_vehicle/tire/ChFialaTire.cpp) [V]
- MF: [MFeval Solver.m](https://github.com/mathworks/Simscape-Vehicle-Templates/blob/master/Libraries/Vehicle/Tire/MFEval/MFeval_4p0/MFeval/+mfeval/Solver.m), which carries equation numbers from Pacejka's book [V]
- TMeasy: [Chrono ChTMeasyTire.cpp](https://github.com/projectchrono/chrono/blob/main/src/chrono_vehicle/wheeled_vehicle/tire/ChTMeasyTire.cpp) [V]. That the commercial TMeasy has relaxation and combined slip without extra parameters comes from a [Chrono docs summary](https://api.projectchrono.org/5.0.0/wheeled_tire.html) and the [Hirschberg paper](https://graz.elsevierpure.com/files/1925147/tmeasy_prt.pdf) [V-S; the PDF itself returned 403]
- TMsimple: [Chrono ChTMsimpleTire.cpp](https://github.com/projectchrono/chrono/blob/main/src/chrono_vehicle/wheeled_vehicle/tire/ChTMsimpleTire.cpp) [V]
- Bracketed "Not checked" and "Not in the equations I read" cells are gaps, not negative findings.

#### Equations

**Dugoff** [V: MathWorks page; its extraction was garbled, so the grouping is reconstructed]
- `z = μ·Fz·(1−κ) / (2·√((Cκ·κ)² + (Cα·tan α)²))`
- `f(z) = z·(2−z)` if z < 1, otherwise 1
- `Fx = Cκ·κ/(1−κ)·f(z)`
- `Fy = Cα·tan α/(1−κ)·f(z) + γ·Cγ`
- `μ = μ0·(1 − As·Vs)`, `Vs = u·√(κ² + tan²α)`
- Variables: κ = slip ratio, α = slip angle, γ = camber, Fz = load, u = velocity in the wheel plane, As = friction reduction factor

**Fiala** [V: cross-checked between the MathWorks page and Chrono source; they agree]
- `U = μmax − (μmax − μmin)·min(1, √(κ² + tan²α))`
- `κcrit = |U·Fz / (2·Cκ)|`, `αcrit = atan(3·U·Fz / Cα)`, `H = 1 − Cα·|tan α| / (3·U·Fz)`
- `Fx = Cκ·κ` if |κ| ≤ κcrit, otherwise `sign(κ)·(U·Fz − |(U·Fz)² / (4·κ·Cκ)|)`
- `Fy = −U·Fz·(1 − H³)·sign α` if |α| ≤ αcrit, otherwise `−U·Fz·sign α`
- `Mz = U·Fz·w·(1 − H)·H³·sign α` if |α| ≤ αcrit, otherwise 0, where w = tyre width

**Magic Formula 6.1, pure lateral** [V: MFeval Solver.m, book equation numbers in brackets]
- Definitions: `dfz = (Fz − Fz0)/Fz0`, `dpi = (p − p0)/p0`, `γ* = sin γ`
- `Kyα = PKY1·Fz0·(1 + PPY1·dpi)·(1 − PKY3·|γ*|)·sin(PKY4·atan((Fz/Fz0) / ((PKY2 + PKY5·γ*²)·(1 + PPY2·dpi))))`
- `Kyγ0 = Fz·(PKY6 + PKY7·dfz)·(1 + PPY5·dpi)` (4.E30)
- `SVyγ = Fz·(PVY3 + PVY4·dfz)·γ*` (4.E28)
- `SHy = PHY1 + PHY2·dfz + (Kyγ0·γ* − SVyγ)/Kyα` (4.E27)
- `SVy = Fz·(PVY1 + PVY2·dfz) + SVyγ` (4.E29)
- `αy = α* + SHy` (4.E20)
- `μy = (PDY1 + PDY2·dfz)·(1 + PPY3·dpi + PPY4·dpi²)·(1 − PDY3·γ*²)` (4.E23)
- `Dy = μy·Fz` (4.E22), `Cy = PCY1`
- `Ey = (PEY1 + PEY2·dfz)·(1 + PEY5·γ*² − (PEY3 + PEY4·γ*)·sign αy)`, capped at 1 (4.E24)
- `By = Kyα/(Cy·Dy)` (4.E26)
- `Fy0 = Dy·sin(Cy·atan(By·αy − Ey·(By·αy − atan(By·αy)))) + SVy` (4.E19)

In MF 5.2-style files the camber path differs: `Kyγ0 = PHY3·Kyα0 + Fz·(PVY3 + PVY4·dfz)` and `SHy = PHY1 + PHY2·dfz + PHY3·γ` [V: Solver.m lines 940 and 1021].

**Magic Formula, pure longitudinal** [V: Solver.m]
- `Kxκ = Fz·(PKX1 + PKX2·dfz)·exp(PKX3·dfz)·(1 + PPX1·dpi + PPX2·dpi²)` (4.E15)
- `Ex = (PEX1 + PEX2·dfz + PEX3·dfz²)·(1 − PEX4·sign κ)`
- `Bx = Kxκ/(Cx·Dx)`
- `Fx0 = Dx·sin(Cx·atan(Bx·κ − Ex·(Bx·κ − atan(Bx·κ)))) + SVx`

**Magic Formula, combined slip** [V: Solver.m]
- `Bxα = (RBX1 + RBX3·γ*²)·cos(atan(RBX2·κ))` (4.E54)
- `Gxα = cos(Cxα·atan(Bxα·α − Exα·(Bxα·α − atan(Bxα·α)))) / Gxα0`, `Fx = Gxα·Fx0` (4.E50–51)
- `Byκ = (RBY1 + RBY4·γ*²)·cos(atan(RBY2·(α* − RBY3)))` (4.E62)
- `Gyκ = cos(Cyκ·atan(Byκ·κ − Eyκ·(…))) / Gyκ0`, `Fy = Gyκ·Fy0 + SVyκ` (4.E58–59)
- `SVyκ` is the kappa-induced ply-steer term (4.E66–67)

**Relaxation** [V: Solver.m lines 1945–1954]
- MF 6.x: `σx = |Kxκ/Cx|`, `σy = |Kyα/Cy|`, where Cx and Cy are carcass stiffnesses
- MF 5.2: `σy = PTY1·sin(2·atan(Fz/(PTY2·Fz0)))·R0`
- MF 5.2 file meaning of PTY1: "Peak value of relaxation length SigAlp0/R0" [V: [pac2002_235_60R16.tir](https://github.com/jcmadsen/PacTire_Matlab/blob/master/pac2002_235_60R16.tir)]
- General definition: distance to reach 63.2% of steady-state force [V-S: [US patent 6761060](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6761060)]

**Low speed in MF** [V: Solver.m lines 337–382; `VXLOW = 1` m/s in the car property files]
- `Wvlow = 0.5·(1 + cos(π·Vcx/VXLOW))` fades slip below VXLOW.

**TMeasy (Chrono)** [V: ChTMeasyTire.cpp lines 160–170 and 223–260]
- Generalised slip: `s = √(sx² + sy²)`, `cα = sx/s`, `sα = sy/s`
- Combined curve parameters: `dF0 = √((dFx0·cα)² + (dFy0·sα)²)`, and the same form for `Fm`, `sm`, `Fs`, `ss`
- With `sn = s/sm` and `p = dF0·sm/Fm − 2`:
  - `s < sm`: `F = dF0·sm·sn / (1 + (sn + p)·sn)`
  - `sm ≤ s ≤ ss`: two parabolas joined at `s* = sm + (Fm − Fs) / (a·(ss − sm))`, with `a = (Fm/sm)²/(dF0·sm)`
  - `s > ss`: `F = Fs`
- `Fx = F·cα`, `Fy = F·sα`
- Mz is trail times Fy, with trail length proportional to patch length `2·√(R0·depth)`.
- Below 1–3 m/s it blends to a Dahl bristle friction state (below).

**TMsimple (Chrono)** [V: ChTMsimpleTire.cpp lines 283–300]
- `Qcrit = Fs/Fmax`, `B = π − asin(Qcrit)`, `A = Fmax·B/dF0`
- `F = Fmax·sin(B·(1 − exp(−s/A)))`

#### Published and open coefficients

Pacejka-book-derived defaults, MF 6.1 at Fz0 = 4000 N, p = 220 kPa, R0 = 0.3135 m ([PacejkaBook_Defaults.tir](https://github.com/mathworks/Simscape-Vehicle-Templates/blob/master/Libraries/Vehicle/Tire/MFEval/MFeval_4p0/doc/examples/PacejkaBook_Defaults.tir)) [V]:
- Lateral: `PCY1=1.3`, `PDY1=1`, `PDY2=−0.05`, `PKY1=−15`, `PKY2=2`, `PKY4=2`, `PKY6=−1`
- Longitudinal: `PCX1=1.6`, `PDX1=1`, `PDX2=−0.1`, `PKX1=16`
- Combined: `RBX1=8.3`, `RBX2=5`, `RCX1=0.9`, `RBY1=4.9`, `RBY2=2.2`, `RCY1=1`
- Aligning: `QBZ1=10`, `QCZ1=1.1`, `QDZ1=0.12`, `QDZ8=−0.05`
- Carcass: `VERTICAL_STIFFNESS=200000`, `LONGITUDINAL_STIFFNESS=400000`, `LATERAL_STIFFNESS=100000`

Measured-style open property files [V for the coefficients; the derived columns are C]:

| File | Tyre | Fz0 (N) | μy at Fz0 | `PDY2` | Kα at Fz0 (N/deg) | Kα/Fz (1/deg) | σα (m) |
|---|---|---|---|---|---|---|---|
| [TNO_car205_60R15](https://github.com/CHO0928/CarSim2021.0_Data/blob/HEAD/Extensions/TNO_DelftTyre/TNO_car205_60R15.tir) | 205/60R15 road | 4000 | 0.878 | −0.065 | 931 | 0.233 | 0.52 |
| [KT_MF_Tool_245_60_R16](https://github.com/mathworks/Vehicle-Dynamics-14DOF-Simscape-Multibody/blob/HEAD/Scripts_Data/KT_MF_Tool_245_60_R16.tir) | 245/60R16 | 5000 | 0.840 | −0.056 | 1684 | 0.337 | 0.68 |
| [C100_Continental_225_50R18](https://github.com/Tencent/TAD_Sim/blob/HEAD/simcore/catalogs/Dynamics/C100_Continental_225_50R18.tir) | 225/50R18 | 6762 | 1.006 | −0.370 | 1907 | 0.282 | 0.94 |
| [pac2002_235_60R16](https://github.com/jcmadsen/PacTire_Matlab/blob/master/pac2002_235_60R16.tir) | 235/60R16 (MF 5.2) | 4850 | 1.049 | −0.180 | 1484 | 0.306 | 0.59 |
| [TNO_mc180_55ZR17](https://github.com/CHO0928/CarSim2021.0_Data/blob/HEAD/Extensions/TNO_DelftTyre/TNO_mc180_55ZR17.tir) | 180/55ZR17 motorcycle | 1475 | 1.519 | 0 | 364 | 0.247 | not computed |
| [Hoosier LC0 8 psi](https://github.com/Brandonscampbs/Endurance-Sim/blob/HEAD/Real-Car-Data-And-Stats/Tire%20Models%20from%20TTC/Round_8_Hoosier_LC0_16x7p5_10_on_8in_8psi_PAC02_UM2.tir) | FSAE slick (TTC fit) | 657 | 2.528 | magnitude 0.355 | 475 | 0.723 | no data |
| [Hoosier LC0 14 psi](https://github.com/Brandonscampbs/Endurance-Sim/blob/HEAD/Real-Car-Data-And-Stats/Tire%20Models%20from%20TTC/Round_8_Hoosier_LC0_16x7p5_10_on_8in_14psi_PAC02_UM2.tir) | same, 14 psi | 657 | 2.360 | magnitude 0.194 | 391 | 0.595 | no data |

More TNO 205/60R15 coefficients [V]:
- Lateral: `PCY1=1.338`, `PEY1=−0.804`, `PEY2=−0.6099`, `PKY1=−15.323`, `PKY2=1.7132`, `PKY3=0.3699`, `PKY6=−0.8998`, `PKY7=−0.231`, `PVY3=−0.1616`, `PVY4=−0.4855`, `PPY1=−0.6242`
- Longitudinal: `PCX1=1.579`, `PDX1=1.0422`, `PDX2=−0.08285`, `PKX1=21.687`, `PKX2=13.728`, `PKX3=−0.4098`
- Combined: `RBX1=12.535`, `RBX2=9.524`, `RCX1=1.019`, `RBY1=11.974`, `RBY2=8.742`
- Trail: `QDZ1=0.09216`
- Carcass: `VERTICAL_STIFFNESS=217751`, `LONGITUDINAL_STIFFNESS=371840`, `LATERAL_STIFFNESS=102674`
- From these, [C]: `Kxκ = 86.7 kN` per unit slip, `σκ = 0.233 m`, trail at α→0 ≈ `R0·QDZ1 = 29 mm`

TMeasy normalised parameters, passenger car, ratio 70%, "gained from data set containing original data from Pacejka book" [V: ChTMeasyTire.cpp `GuessPassCar70Par`]:

| Quantity | At Fz,n | At 2·Fz,n |
|---|---|---|
| dFx0 per Fz | 18.3741 | 19.4669 |
| Fxm per Fz | 1.1292 | 1.0896 |
| Fxs per Fz | 0.80149 | 0.76917 |
| sxm | 0.13913 | 0.13913 |
| sxs | 0.66667 | 0.66667 |
| dFy0 per Fz | 15.9826 | 12.8509 |
| Fym per Fz | 1.0009 | 0.91367 |
| Fys per Fz | 0.8336 | 0.77336 |
| sym | 0.14852 | 0.18504 |
| sys | 0.96524 | 1.0714 |
| nL0 | 0.178 | 0.19 |

Same function [V]: `pn = 0.5·tireLoad·(p/p_li)^0.8`, `pn_max = 3.5·pn`, section height = width × ratio, `defl_max = 0.16·secth`, `CZ = tireLoad/defl_max`, rolling resistance 0.015. So tyre parameters can be guessed from the size marking alone, which suits a "no per-car fudge" rule.

Default values worth *not* copying: MathWorks Fiala and Dugoff defaults (`Cα = 4.5e4 N/rad`, `Cκ = 1e7 N`, `Cγ = 1e3 N/rad`) [V] are placeholders, not tyre data. `Cκ` is about 100× the TNO value [C]. MathWorks' surface table (B, C, D, E = 10, 1.9, 1, 0.97 dry) is generic and not a fitted tyre [V-S: [MathWorks](https://www.mathworks.com/help/sdl/ref/tireroadinteractionmagicformula.html)].

#### Camber thrust per degree

All values are at Fz0 and α = 0, by central difference with my MF evaluator using file coefficients [C]. Road values cross-check against `PKY6` directly [V].

| Tyre | Thrust (N/deg) | % of Fz per degree | Kγ/Fz (1/rad) | Kγ/Kα: slip-equivalent of 1° camber | Valid camber range in file |
|---|---|---|---|---|---|
| 205/60R15 road (TNO) | 62.8 | 1.57 | 0.90 | 0.067° | ±10° (`CAMMAX=0.1745`) |
| Pacejka book defaults | 69.8 | 1.75 | 1.00 | 0.083° | ±10° |
| 245/60R16 | 77.9 | 1.56 | 0.89 | 0.046° | not checked |
| 225/50R18 | 106.7 | 1.58 | 0.91 | 0.056° | ±10° |
| 235/60R16 (MF 5.2) | 74.4 | 1.53 | 0.88 | 0.050° | not checked |
| 180/55ZR17 motorcycle | 23.8 | 1.61 | 0.93 | 0.065° | ±55° (`CAMMAX=0.96`) |
| FSAE slick LC0 at 14 psi | 36.0 | 5.5 | 3.14 | 0.092° | fit range not checked |
| FSAE slick LC0 at 8 psi | 65.2 | 9.9 | 5.69 | 0.137° | fit range not checked |

Load dependence of Kγ/Fz (1/rad) [C]:
- TNO road: 0.78 at 0.5·Fz0 → 1.13 at 2·Fz0
- Motorcycle: 1.02 → 0.74
- LC0 at 8 psi: 6.28 → 4.31

Other camber points:
- Motorcycle at large lean: `Fy(α=0)` = 875 N at 40° (0.59·Fz), 1041 N at 50° (0.71·Fz) [C from the TNO file]. Lean equilibrium needs `tan 40° = 0.84·Fz`, so slip angle provides the rest [D].
- Bicycle tyres: normalised camber stiffness about 0.0075–0.015 and normalised cornering stiffness about 0.15–0.35 [V-S: [Dressel](https://core.ac.uk/download/217184479.pdf); the units are not shown in the summary and are presumably 1/deg].
- Bias vs radial: bias-ply tyres generate more camber thrust than radials [V: [Wikipedia Camber thrust](https://en.wikipedia.org/wiki/Camber_thrust), citing Wong]. No number was given.
- For small angles, thrust ≈ camber stiffness × camber angle, per Pacejka [V: same Wikipedia page].
- Motorcycles: camber thrust can be the largest contributor to centripetal force, and in some cases the only one [V: same page, citing Foale and Cossalter].
- Front/rear balance of camber stiffness matters more than balance of cornering stiffness for faster motorcycles [V-S: [Da Lio et al., FISITA 1999](https://go.fisita.com/store/papers/eaec99/sta99c211)].

#### Peak grip vs camber

Each row gives the peak in the better direction at Fz0, relative to that same direction at γ = 0 [C]:

| Tyre | 2° | 4° | 6° | 8° | 10° | Comment |
|---|---|---|---|---|---|---|
| TNO 205/60R15 | +0.6% | +1.3% | +1.9% | +2.5% | +3.2% | `PDY3 = 0`: rise comes only from the vertical shift, no optimum exists |
| LC0 at 14 psi | +0.7% | −0.4% | −3.4% | −8.2% | −14.7% | Optimum about 2°; within 1% across 0–4° |
| LC0 at 8 psi | +2.4% | +3.9% | +4.5% | +4.1% | +2.8% | Optimum about 6°; within 1% across about 4–8° |
| Motorcycle 180/55 | +1.3% | +2.4% | +3.4% | +4.2% | +4.9% | Maximum about +6% at 15–20°; above 0-lean baseline until about 40° |

Conflicts and warnings:
- **Sign conflict in slick fits.** In the two LC0 files, the peak *grows* in the direction *opposite* to the α = 0 thrust, because `PVY3 > 0` while `PHY3·Kyα` has the other sign. Physically one expects peak grip when the tyre leans into the force. The fits are [Stackpole PAC2002 for TTC](https://github.com/Brandonscampbs/Endurance-Sim/blob/HEAD/Real-Car-Data-And-Stats/Tire%20Models%20from%20TTC/Round_8_Hoosier_LC0_16x7p5_10_on_8in_8psi_PAC02_UM2.tir). Use the *magnitude and location* of the optimum, not the fitted sign. [C, inference on cause]
- **Fits disagree.** A [UBC R25B MF6.2 fit](https://github.com/UBCFormulaElectric/sim/blob/HEAD/tires/Hoosier_R25B_B1464_MF.tir) has `PKY6=+2.22`, `PVY3=+8.35`; a [Longhorn "Modified" R25B file](https://github.com/LonghornRacingElectric/simulation_toolkit/blob/HEAD/src/_1_model_inputs/Modified_Round_8_Hoosier_R25B_16x7p5_10_on_7in_12psi_PAC02_UM2.tir) has zeroed thrust terms (`PVY3=0`, `PHY3=0`) [V]. Fitted camber terms are fragile.
- **Overfit example.** `pac2002_235_60R16` has `PEY4=−760` and `PDY3=−2.88` [V], which gives unreal peak growth at high camber in my evaluation [C]. The same coefficients are what [CommonRoad's tire parameters](https://github.com/TeoIlie/commonroad-vehicle-models/blob/master/vehiclemodels/parameters/parameters_tire.yaml) use [V: `p_ky1=−21.92`, `p_dy3=−2.8821`].
- **Anecdotal optima, low quality:** roughly 4–7° for V8 Supercar or NASCAR-type tyres [V-S: [overtake.gg](https://www.overtake.gg/threads/how-do-you-find-the-right-camber-values.135080/)]; about −3.3° for a GT tyre [V-S: same thread family]. Camber forces fall off above 5° for wide street and race radials [V-S: [suspensionsecrets](https://suspensionsecrets.co.uk/camber)]. Peak camber rises with load [V-S: forum summary]. Peak force camber is not peak contact-patch camber [V-S: [iRacing](https://www.iracing.com/?p=227875)].
- **Axle-level point:** one forum analysis argues maximum rear-axle force can occur at zero camber, because outer-tyre gain is outweighed by inner-tyre loss [V-S: [f1technical](https://www.f1technical.net/forum/viewtopic.php?p=531223)]. Forum-level evidence only.
- **Game precedent:** TORCS multiplies peak by `1 + 0.05·sin(−γstatic·18)`, i.e. +5% at 5° [V: [wheel.cpp](https://github.com/ugo-nama-kun/gym_torcs/blob/master/vtorcs-RL-color/src/modules/simu/simuv2/wheel.cpp)]. It uses static camber only and adds no thrust term.

#### Pressure effect

- TNO 205/60R15 at Fz0 [C]: −20% pressure gives Kα +11.8%, peak +4.4%. +20% gives Kα −11.9%, peak −2.2%. `PPY1=−0.62`.
- 245/60R16: same direction [C].
- **Conflict:** the Continental C100 file has `PPY1=+0.27`, so Kα *falls* slightly as pressure drops [C]. Direction is tyre-specific.
- Slick LC0: 8 psi vs 14 psi gives Kα 475 vs 391 N/deg, Kγ 65 vs 36 N/deg, μ 2.53 vs 2.36 [C].
- `PPY5 = 0` in the road 6.1 files I checked [V], so camber thrust does not respond to pressure there.
- The MF 6.1 pressure extension needs test data from at least three pressures [V-S: [arXiv 2305.18422](https://arxiv.org/pdf/2305.18422), citing Schmeitz et al.]. Its origin is [Besselink, Schmeitz & Pacejka 2010](https://trid.trb.org/view/1086180) [V-S].

#### Temperature

- Speed Dreams `simuv4` uses `tireCond = 1 − muTmult·(Ttire − Topt)²`, default `Topt = 350 K`, with heating and air/speed cooling multipliers [V: [wheel.cpp](https://github.com/argos-research/speed-dreams/blob/master/src/modules/simu/simuv4/wheel.cpp)]. This is a game model.
- The MF 6.1 equations I read carry no temperature term [V: Solver.m].

#### Where to get open parameters

- **MFeval examples and Simscape templates** [V]: [Data_TIR folder](https://github.com/mathworks/Simscape-Vehicle-Templates/tree/master/Libraries/Vehicle/Tire/Data_TIR) (car145_70R13, car205_60R19, car235_50R24, fsae190_50R10, and others). Warning: the `fsae190_50R10` header says "generic magic formula parameter values. The dimensions have been scaled… no other parameters have been adjusted" [V], so it is not a measured FSAE tyre.
- **TNO samples via CarSim data copy** [V]: `TNO_car205_60R15`, `TNO_mc180_55ZR17`, `CS_car225_60R18`. Files state "Copyright TNO 2008".
- **Tencent TAD_Sim** [V]: `TASS_car205_60R15`, `C100_Continental_225_50R18`.
- **FSAE TTC fits in student repos** [V]: Hoosier LC0, R25B, 43075. Files state "Copyright Stackpole Engineering Services" and "Customer: TTC".
- **Licences** [V via GitHub API]: Chrono is BSD-3-Clause, VDrift GPL-3.0. Simscape-Vehicle-Templates and TAD_Sim return NOASSERTION. Do not ship any `.tir` values without checking; TTC data redistribution terms are restricted as I recall [NV].

#### How open simulators model tyres

- TORCS `simuv2`: one MF curve on combined slip magnitude, `μ·(lfMin + (lfMax − lfMin)·exp(lfK·Fz/opLoad))` for load sensitivity, first-order force smoothing `RELAXATION2(Fn, preFn, 50)` [V: wheel.cpp].
- VDrift: selectable tyre models; `cartire2` has `PacejkaFx/Fy/Mz`, camber input, `PacejkaGx/Gy` combined slip, `max_camber(15)` [V: [cartire2.cpp](https://github.com/VDrift/vdrift/blob/master/src/physics/cartire2.cpp)].
- Speed Dreams: TORCS base plus temperature and tread wear [V].

### Inferences
- **MF 6.1 is the right core, used with a reduced coefficient set.** Keep `PCY1, PDY1, PDY2, PEY1, PEY2, PKY1, PKY2, PKY4, PKY6, PKY7` plus the longitudinal and combined counterparts. Drop the shift and asymmetry terms; they only reproduce conicity and ply-steer that a teaching site does not need.
- **Tyre classes, not tyres.** A small global table (touring, sport, slick, off-road) fits the project's "no per-engine fudge" rule. Size and pressure then scale `Fz0` and R0, as TMeasy's guess function does.
- **Add an explicit peak-vs-camber term.** For example `μ(γ) = μ0·(1 − c·(γ − γopt)²)` calibrated per class. Measured-style evidence gives γopt about 2–6° for slicks with about 1–5% gain. For road tyres no public fit gives this curve, so γopt and c would be an openly declared assumption.
- **Camber thrust is nearly universal per load.** Road car, motorcycle and bicycle all sit near 1–2% of Fz per degree, which is striking. A motorcycle tyre is not "more camber-sensitive" per degree; it stays usable to ±55° because of its profile. Slicks at low load are 3–6× higher.
- **Toe beats camber at small angles.** On a road tyre 1° of camber is worth about 0.05–0.08° of slip. So 0.1° of toe per wheel produces as much force as 1.3–2° of camber.
- Fiala or Dugoff would be a false economy: MF costs about 90 ns, and they lack load-dependent stiffness (the mechanism behind LLTD balance).

### Gaps
- No public passenger-tyre data set found with a measured peak-vs-camber optimum. Actual road-tyre γopt remains unverified.
- No racing *road-circuit* tyre (full-size slick) parameters found; FSAE slicks at about 650 N are the only proxy. TTC testing on an abrasive belt may overstate μ [NV], and μ of 2.4–2.5 should not be taken as road friction.
- TMeasy's published parameter table and camber treatment could not be read (403). Chrono's version is a subset.
- MF temperature extensions, TameTire and FTire were not researched. Whether any recent MF revision includes temperature is not established.
- Cossalter's motorcycle stiffness tables were not reachable; the only motorcycle figures here come from one TNO sample.
- Hindiyeh/Gerdes Fiala parameters not found. Stanford's use of Fiala with `Cα` and friction-circle saturation is confirmed only at summary level [V-S: [Springer chapter](https://link.springer.com/chapter/10.1007/978-3-031-70392-8_4)]. The [Takumi Supra paper](https://arxiv.org/html/2407.13760v1) reports −7° front camber and 6° caster for drifting [V], but no tyre values.

---

## Weight transfer: geometric, elastic, unsprung; LLTD; longitudinal transfer and anti-dive

### Takeaway
- Total lateral transfer is fixed by mass, CG height, track and acceleration. Suspension only decides **how fast** it arrives and **how it divides between axles**.
- Load sensitivity turns that division into balance. In my example with a road MF tyre, moving LLTD from 40% to 80% front changes the 0.6–0.8 g understeer gradient from about 0.02 to about 3.9 deg/g.

### Cited Findings

**Total transfer** [V-S with snippet of formula on page: [Wavey Dynamics](https://waveysite.pages.dev/blog/weight-transfer-rc), which I opened and which gives this form, so V]:
- `ΔW = m·ay·h / t`

**Per-axle split.** Tags: formula form [D]. The sprung geometric and elastic parts agree with Wavey Dynamics [V]. The sum-cancels property and the unsprung "locked in" part agree with a Milliken-citing thread [V-S: [f1technical](https://www.f1technical.net/forum/viewtopic.php?p=535169)]. Milliken p. 587 is cited there but not read.

```
ΔFz,f = (1/t_f) · [ m_sf·ay·h_rf                      geometric: lateral force acts at roll centre
                  + (K_φf/K_φ)·M_φ                    elastic: reacted through springs and bars
                  + m_uf·ay·h_uf ]                    unsprung: goes directly through the tyres

ΔFz,r = (1/t_r) · [ m_sr·ay·h_rr
                  + (K_φr/K_φ)·M_φ
                  + m_ur·ay·h_ur ]

M_φ = m_s·d·(ay·cos φ + g·sin φ) ≈ m_s·d·ay + m_s·g·d·φ      sprung roll moment
φ   = m_s·d·ay / (K_φ − m_s·g·d)                              steady roll angle
d   = h_s − h_ra,  h_ra = h_rf + (h_rr − h_rf)·(a_s/L)         CG height above the roll axis
K_φ = K_φf + K_φr
```

Variables:
- `ΔFz` = load moved from inner to outer wheel on that axle
- `m_s, m_u` = sprung, unsprung mass; `m_sf = m_s·b_s/L`, `m_sr = m_s·a_s/L`
- `a_s, b_s` = sprung CG distance to front and rear axle; L = wheelbase
- `h_s` = sprung CG height; `h_rf, h_rr` = roll centre heights; `h_uf, h_ur` = unsprung CG heights (about wheel radius)
- `t` = track; `K_φ` = roll stiffness (N·m/rad); `φ` = roll angle

**Roll stiffness:**
- OptimumG form: `K_φ = (π/180)·t²·K_L·K_R / (K_L + K_R)` in N·m/deg, plus anti-roll bar [V: [OptimumG Tech Tips Springs & Dampers](https://lfs.net/attachment/32094)]. With equal wheel rates this reduces to `0.5·K_w·t²` in N·m/rad [D], matching [a UNCA page](https://sites.google.com/unca.edu/suspension/learning/vehicle-dynamics-basics/roll-stiffness) [V-S].
- Wheel rate = spring rate / MR² [V: OptimumG]. MR = wheel/spring motion ratio.
- Roll gradient `φ/Ay = W·H / (K_φF + K_φR)` in deg/g [V: OptimumG]. W = vehicle weight, H = CG to roll axis distance.

**Worked identity check** [C]: `m_s = 1320 kg`, `m_u = 180 kg`, `a = 1.25`, `b = 1.45`, `h_s = 0.58`, `h_rf = 0.08`, `h_rr = 0.12`, `h_u = 0.30`, `t = 1.5`, `K_φf/K_φr = 2`, `ay = 0.8 g`. The gravity term is omitted in this check.

| | Geometric (N) | Elastic (N) | Unsprung (N) | Axle total (N) |
|---|---|---|---|---|
| Front | 297 | 2217 | 141 | 2655 |
| Rear | 384 | 1108 | 141 | 1633 |

Sum is 4288 N, exactly equal to `m·ay·h_cg/t` with the combined CG, confirming the split. LLTD = 61.9%. With road-car roll centres, about 77% of transfer is elastic in this example.

**Limit cases** [V-S: [HP Academy](https://www.hpacademy.com/courses/suspension-tuning-and-optimization/lateral-load-transfer-basics-suspended-mass-geometric-load-transfer)]:
- RC at sprung CG: all sprung transfer is geometric; RC at ground: all elastic.
- Raising one axle's RC raises that axle's geometric transfer.
- Unsprung contribution is usually small [V-S: same course family].
- Elastic transfer is more transient than geometric [V-S: same course family].

**Definition of LLTD and baseline:**
- `LLTD = ΔFz,f·t_f / (ΔFz,f·t_f + ΔFz,r·t_r)` [D; this exact form is not from a read source]
- OptimumG "Magic Number" (Milliken's TLLTD): percentage of roll gradient taken by the front. **Baseline: static front weight % + 5%** [V: OptimumG]. Note it is defined on roll stiffness, not total transfer, and it is a race-car baseline.
- CommonRoad-derived elastic split on road cars [C from [parameters_vehicle1–3](https://github.com/dawsonc/commonroad-vehicle-models/tree/main/PYTHON/vehiclemodels), `K_φ = 0.5·K_s·T² + K_ts`, RC at ground in those data]:

| Vehicle | Static front weight | Elastic front split |
|---|---|---|
| Ford Escort | 63.1% | 60.5% |
| BMW 320i | 55.2% | 59.5% |
| VW Vanagon | 53.4% | 58.2% |

**How load sensitivity creates balance.** Stiffness vs load in TNO 205/60R15, Kα in N/deg [C]:

| Fz (N) | 1500 | 2000 | 3000 | 4000 | 5000 | 6000 |
|---|---|---|---|---|---|---|
| Kα | 447 | 575 | 786 | 931 | 1019 | 1060 |

Axle at Fz = Fz0 with transfer q = ΔFz/Fz, per wheel pair [C]:

| q | Axle Kα (N/deg): TNO | Axle peak relative to q = 0: TNO | KT 245/60 | pac2002 | C100 | LC0 14 psi | LC0 8 psi |
|---|---|---|---|---|---|---|---|
| 0 | 1863 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| 0.25 | 1805 | 0.992 | 0.988 | 0.989 | 0.978 | 0.994 | 0.992 |
| 0.50 | 1636 | 0.975 | 0.961 | 0.955 | 0.910 | 0.977 | 0.967 |
| 0.75 | 1375 | 0.965 | 0.934 | 0.900 | 0.797 | 0.949 | 0.926 |
| 1.00 (inner wheel lifts) | 1057 | 0.953 | 0.918 | 0.825 | 0.643 | 0.909 | 0.869 |

Takeaways from this table:
- **Stiffness falls much faster than peak.** On TNO at q = 1, axle stiffness is down 43% and peak only 4.7%. So LLTD mostly changes balance *below* the limit [C].
- **Peak load sensitivity varies by a factor of about 7 between fits** (0.953 vs 0.643). The choice of `PDY2` will dominate limit balance [C].
- This matches the stated mechanism: moving transfer to an axle reduces that axle's grip more than it adds elsewhere [V-S: [HP Academy](https://www.hpacademy.com/courses/suspension-tuning-and-optimization/lateral-load-transfer-basics-total-lateral-load-transfer-distribution-and-tuning)]. A stiffer front promotes understeer, a stiffer rear oversteer [V-S: [bikes.fan](https://bikes.fan/corpus/gen-582/vehicle-dynamics/weight-transfer-and-load-distribution-in-vehicle-dynamics.html)].

Understeer gradient vs LLTD from the qs solver [C], generic 1500 kg car, 53.7% front, h = 0.55, t = 1.5, TNO tyre, 1.5 deg/g roll gradient, 0.5 camber loss per degree of roll, no compliance:

| LLTD (front) | U at 0.1–0.3 g (deg/g) | U at 0.4–0.6 g | U at 0.6–0.8 g | Peak ay (g) |
|---|---|---|---|---|
| 40% | 0.25 | 0.12 | 0.02 | 0.86 |
| 50% | 0.28 | 0.36 | 0.96 | 0.86 |
| 54% | 0.29 | 0.46 | 1.34 | 0.86 |
| 60% | 0.31 | 0.61 | 1.91 | 0.86 |
| 70% | 0.34 | 0.86 | 2.88 | 0.86 |
| 80% | 0.37 | 1.11 | 3.86 | 0.86 |

Peak ay is unchanged because with this tyre the front axle limits in all cases on a 0.02 g grid. A more load-sensitive tyre would change that.

**Worked load-transfer scale:** in a 0.9 g turn with 1650 mm track and 550 mm CG, 30% of vehicle weight transfers; outer wheels +60%, inner −60%, with about 6% total grip drop [V: [Wikipedia Weight transfer](https://en.wikipedia.org/wiki/Weight_transfer); that section is flagged as lacking citations]. CG shift of ≤30 mm gives under 2% extra transfer [V, same]. Grip drop of about 6% is in line with TNO/KT above at q ≈ 0.6 [C].

**Longitudinal:**
- `ΔFz = a·h·m / L` [V: [Wikipedia Weight transfer](https://en.wikipedia.org/wiki/Weight_transfer)]
- `Fzf = [b·m·g − (ẍ − ẏ·r)·m·h + …]/(a+b)`, `Fzr = [a·m·g + (ẍ − ẏ·r)·m·h − …]/(a+b)` [V: [MathWorks 3DOF](https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html)]
- Dual-track lateral addition: `Fzfl = Fzf + [m·h·(ÿ + ẋ·r) − …]/(2·wf)` [V: same]. It uses a single h, with no RC or roll split.

**Anti-dive:**
- `%AD = %Bf · (h_svsa / l_svsa) / (h / L)` [V-S: [formuladen calculator](https://www.formuladen.com/en/percentage-anti-dive-on-front-formula/Formula-32231)]. The site's inversions were reported not to reconcile, so only this forward form is used; its form matches what I recall from Milliken [NV].
- Variables: %Bf = front brake share, h_svsa and l_svsa = side-view swing arm height and length, h = CG height, L = wheelbase.
- Side-view swing arm from instant centre to wheel centre sets anti-dive at the front, anti-squat at the rear [V-S: [suspensionsecrets](https://suspensionsecrets.co.uk/anti-squat-dive-and-lift-geometry/) (403 on direct fetch)].
- Pitch angle [D]: `θ = [ΔFz·(1 − AD)/(2·K_wf) + ΔFz·(1 − AL)/(2·K_wr)] / L`, with `ΔFz = m·ax·h/L`, K_w = wheel rate, AD/AL = anti-dive and anti-lift fractions.
- Anti geometry changes suspension deflection only; it cannot change total ΔFz, since `m·ax·h/L` is statics [D]. Geometric vs elastic longitudinal split is the same idea as lateral [D].

### Inferences
- Show the three components as live bars. Students can then see: track and CG set the total; bars set the split; RC sets the speed.
- Elastic transfer needs the time-domain model to show its lag behind geometric transfer. A quasi-static model will show the end state only.
- A teaching corollary: at normal road-driving accelerations the LLTD effect is small (U 0.25–0.37 at 0.1–0.3 g in the table), and it grows quickly near the limit.

### Gaps
- I could not check the exact per-axle equations against Milliken. The form is derived and internally verified.
- Typical road-car LLTD measured values (with RCs) not found; the table above is elastic split only.
- Force-based vs kinematic roll centre: a kinematic RC "neglects jacking" [V-S: [SAE 2000-01-0693 summary](https://saemobilus.sae.org/papers/fidelity-vehicle-models-using-roll-center-principles-2000-01-0693)]. SWOV's [Vehicle roll and jacking effects](https://swov.nl/en/publicatie/vehicle-roll-and-jacking-effects-part-one) was only seen as a record.

---

## Vehicle models by fidelity: equations, states, and what each must show

### Takeaway
A **14-DoF model (6 body, 4 wheel-vertical, 4 wheel-spin) plus 8 tyre deflection states, using per-wheel kinematic curves for camber and toe vs travel**, shows every required phenomenon except a nonlinear swing-axle jack, which also needs the curves to be nonlinear. Multibody is not needed. Quarter-car and bicycle models stay valuable as teaching overlays because they have closed-form answers.

### Cited Findings

**Quarter car, 2 DoF, 4 states** [V for model and modes: [Gillespie-derived notes](https://bamason2.github.io/ttc066-module/notes/Section_5.html)]
- `M·z̈ = Ks·(zu − z) + Cs·(żu − ż)`
- `m·z̈u = Kt·(zr − zu) − Ks·(zu − z) − Cs·(żu − ż)`
- `Kbb = Ks·Kt/(Ks + Kt)`, `ωn = √(Kbb/M)`, `ζ = Cs/√(4·Kbb·M)`, `ωd = ωn·√(1 − ζ²)`
- Wheel hop: `ωn = √((Ks + Kt)/m)`
- Typical large saloon: `M = 300 kg`, `m = 30 kg`, `Ks = 20000 N/m`, `Kt = 160000 N/m`, `Cs = 1500 N·s/m`. Expected wheel hop 11–13 Hz; damping 0.2–0.4.
- **Source error flagged:** the notes print `√(180000/30) = 6000 rad/s`. 6000 is ω²; correct is 77.5 rad/s = 12.3 Hz [C].

Exact modes by polynomial root solve [C]:

| Case | Body mode | Wheel mode | Simple estimates: body f, ζ, hop f |
|---|---|---|---|
| Saloon baseline | 1.25 Hz, ζ 0.259 | 12.12 Hz, ζ 0.334 | 1.23 Hz, 0.325, 12.33 Hz |
| Unsprung mass +50% | 1.25 Hz, ζ 0.259 | 9.90 Hz, ζ 0.276 | |
| Spring ×2 | 1.66 Hz, ζ 0.154 | 12.86 Hz, ζ 0.321 | |
| Damper ×2 | 1.33 Hz, ζ 0.544 | 11.34 Hz, ζ 0.708 | ζ estimate 0.650 |
| CommonRoad Escort (per corner) | 0.96 Hz, ζ 0.180 | 12.65 Hz, ζ 0.281 | |

The handy ζ formula overstates true body-mode damping by about 25% on the saloon [C].

Road input for ride [V: same notes]: PSD `Gz(ν) = G0·[1 + (ν0/ν)²] / (2π·ν²)`, with `G0 = 1.25e5` rough and `1.25e6` smooth as printed, `ν0 = 0.02` and `0.05` cycle/ft. Note: printed magnitudes look wrong (rough smaller than smooth, and huge); values probably need a negative exponent. Verify before use [C, inference].

**Half car, 4 DoF, 8 states** [D]
- States: `z, θ, zuf, zur` and rates.
- Same equations with `zcf = z − a·θ`, `zcr = z + b·θ`, `Iy·θ̈ = −a·Fsf + b·Fsr`, and a road input delayed by `L/V` at the rear.
- Purpose: pitch, and flat-ride tuning. Rear frequency above front lets the rear catch up, reducing pitch over a bump [V: [OptimumG](https://lfs.net/attachment/32094)].

**4-wheel ride model, 7 DoF, 14 states** [D, equations run in Sim14]
- States: `z, φ, θ, zu1..4` and rates.
- `zci = z − xi·θ + yi·φ`
- `Fsi = Ks·(zui − zci) + Cs·(żui − żci) + Karb·[(zui − zci) − (zuj − zcj)]`, j = same-axle partner
- `m_s·z̈ = ΣFsi`, `Ix·φ̈ = Σ yi·Fsi`, `Iy·θ̈ = −Σ xi·Fsi`, `mu·z̈ui = Kt·(zri − zui) − Fsi`
- Sign: x forward, y left, z up; +φ raises the left side; +θ nose down.

**Bicycle model, 2 DoF, 2 states (v, r)** [V for EOM: [MathWorks 3DOF](https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html)]
- `v̇ = −u·r + (Fyf + Fyr)/m`, `ṙ = (a·Fyf − b·Fyr)/Iz`
- `αf = atan((v + a·r)/u) − δ`, `αr = atan((v − b·r)/u)`, `Fy = −Cy·α`

Closed forms:
- Understeer gradient: `Kus = Wf/Cαf − Wr/Cαr` (>0 understeer) [V-S: [LiU TSFS02 Lecture 4](https://www.fs.isy.liu.se/Edu/Courses/TSFS02/Lectures/lecture4.pdf), which now 404s]; also [IITH project](https://people.iith.ac.in/ashok/VD/VD_Project_2016/GroupB.pdf) [V-S] with g in the denominator.
- Characteristic speed: `Vch = √(57.3·L·g/K)`, K in deg/g; critical speed: same with −K [V-S: IITH]. Definition: speed where steer is twice Ackermann [V: [Wikipedia](https://en.wikipedia.org/wiki/Understeer_and_oversteer)].
- Steady steer and gain [D]: `δ = L/R + K·ay`, `r/δ = u/(L + K·u²)` with K in rad/(m/s²). Gain peaks at `Vch` for K>0, diverges at `Vcrit` for K<0; agrees in words with [Paddocklink](https://paddocklink-docs.pages.dev/lms/vehicle-dynamics-ii-theory/steady-state-handling-balance/characteristic-speed-and-critical-speed/) [V].
- Yaw mode from the 2×2 matrix [D]:
  - `ωn² = (Cf·Cr·L²/(m·Iz·u²))·(1 + K·u²/L)`
  - `2·ζ·ωn = [m·(a²·Cf + b²·Cr) + Iz·(Cf + Cr)]/(m·Iz·u)`
  - With `K = m·(b·Cr − a·Cf)/(Cf·Cr·L)`. Sign and identity checked by hand: numerator reduces to `Cf·Cr·L²`.

Check with TNO tyres on a 1500 kg car, a = 1.25, b = 1.45 [C]: `Cf = 1852`, `Cr = 1706` N/deg axle, K = **0.27 deg/g**, Vch = 268 km/h. Sim14 gives U ≈ 0.29 deg/g, consistent.

**Real cars understeer far more than that:** average 4.4 deg/g for American cars and 2.6 deg/g for European cars in an SAE survey [V-S: summary of a result in [this search set](https://www.scribd.com/doc/264095331/Handling-Fundamentals), exact page not opened]; 2–3 deg/g for recent cars, trucks 3+ [V-S: [eng-tips](https://eng-tips.com/threads/understeer-gradient-of-modern-passenger-cars.190555), direct fetch 403, anecdotal]. Test method also matters [V-S: same]. With K = 2.6 and 4.4, Vch = 87 and 67 km/h for L = 2.7 m [C].

**4-wheel handling model, 14 DoF** [D, run in Sim14 at 28 + 8 states]
- Body: x, y, ψ, u, v, r, z, ż, φ, p, θ, q
- Wheels: `zu1..4`, `żu1..4`, `ω1..4`
- Tyre deflections: `u'1..4`, `v'1..4`

```
Wheel velocity (hub i at xi, yi):  vx = u − r·yi;  vy = v + r·xi
Wheel frame:                       Vw = vx·cos δi + vy·sin δi;  Vl = −vx·sin δi + vy·cos δi
Slip with deflection states:       u̇' = (ω·R − Vw) − |Vw|·u'/σκ;   κ = u'/σκ
                                   v̇' = −Vl − |Vw|·v'/σα;          α = v'/σα
Tyre force (MF):                   Fxt, Fyt = f(κ, α, Fz, γ)
Rotate to body:                    Fx = Fxt·cos δ − Fyt·sin δ;  Fy = Fxt·sin δ + Fyt·cos δ
Vertical:                          Fz = Fz0 + Kt·(zr − zu) − Ct·żu  (≥ 0)
Roll-centre force (per wheel):     Ji = −sign(yi)·Fy·hrc/|yi|
Translation:                       u̇ = v·r + ΣFx/m;   v̇ = −u·r + ΣFy/m
Yaw:                               Iz·ṙ = Σ(xi·Fy − yi·Fx)
Heave:                             m_s·z̈ = Σ(Fsi + Ji)
Roll:                              Ix·φ̈ = Σ yi·(Fsi + Ji) + h·ΣFy + m_s·g·d·φ
Pitch:                             Iy·θ̈ = −Σ xi·(Fsi + Ji) − h·ΣFx
Wheel vertical:                    mu·z̈u = Fz − Fz0 − (Fsi + Ji)
Wheel spin:                        Iw·ω̇ = T − Fxt·R − RR·Fz·R·tanh(ω)
Camber:                            γi = γstatic,i − cg·φ   (or a curve of wheel travel)
Toe:                               δi = δsteer + toe,i     (or a curve of wheel travel)
```

Sum of `Ji` moments plus `h·ΣFy` yields the correct `(h − hrc)·ΣFy` elastic moment [D].

**CommonRoad, open reference family** [V: [vehicleModels_commonRoad.pdf](https://github.com/dawsonc/commonroad-vehicle-models/blob/main/vehicleModels_commonRoad.pdf), a fork of [upstream](https://gitlab.lrz.de/tum-cps/commonroad-vehicle-models), which timed out]
- Models: point mass, kinematic single-track, single-track, single-track drift, multi-body.
- Multi-body uses **29 states**: position, steer, u, yaw, r, roll, roll rate, pitch, pitch rate, v, z, ż, front axle roll/roll rate/v/z/ż, rear axle same, 4 wheel speeds, 2 compliance states `delta_y_f/r` [V: [vehicle_dynamics_mb.py](https://github.com/TeoIlie/commonroad-vehicle-models/blob/master/vehiclemodels/vehicle_dynamics_mb.py)]
- It models the axles as bodies with separate roll, so it is a rigid-axle-style MB, not a true independent suspension [V for state list; "rigid-axle-style" is inference].

CommonRoad parameter sets [V: [parameters_vehicle1–3.py](https://github.com/dawsonc/commonroad-vehicle-models/tree/main/PYTHON/vehiclemodels), converted from imperial; the ride columns are C]:

| | Ford Escort | BMW 320i | VW Vanagon |
|---|---|---|---|
| m / m_s (kg) | 1226 / 1095 | 1093 / 966 | 1479 / 1317 |
| m_uf, m_ur per axle (kg) | 65.7, 65.7 | 63.8, 63.8 | 81.1, 81.1 |
| a, b (m) | 0.884, 1.509 | 1.156, 1.422 | 1.150, 1.322 |
| I_z (kg·m²) | 1539 | 1792 | 2473 |
| Sprung roll / pitch inertia | 244 / 1342 | 207 / 1566 | 480 / 2204 |
| Spring per wheel f, r (N/m) | 21891, 21891 | 24445, 19629 | 33566, 39112 |
| Damper per wheel f, r (N·s/m) | 1459, 1459 | 1786, 1649 | 2406, 2770 |
| Track f, r (m) | 1.39, 1.42 | 1.39, 1.36 | 1.57, 1.54 |
| Aux roll stiffness f, r (magnitude, N·m/rad) | 12880, 0 | 6915, 2644 | 33948, 7731 |
| Tyre vertical (N/m) | 189721 | 158240 | 212569 |
| h_cg (m) | 0.558 | 0.574 | 0.748 |
| **C:** ride f, r (Hz) | 1.27, 1.66 | 1.52, 1.52 | 1.55, 1.80 |
| **C:** ride damping ζ f, r | 0.27, 0.35 | 0.35, 0.40 | 0.35, 0.40 |
| **C:** wheel hop (Hz) | 12.8 | 12.0 | 12.4 |
| **C:** roll gradient (deg/g, RC at ground) | 6.5 | 6.5 | 4.6 |
| **C:** T/(2h) | 1.25 | 1.21 | 1.05 |

**Phenomenon vs minimum model** [Inference from the states above, except where a [C] result is noted]

| Phenomenon | Minimum model | Required ingredients | Sim14 evidence |
|---|---|---|---|
| Camber's effect on grip | Single axle plus tyre (quasi-static) | MF with thrust and μ(γ); roll-camber coupling; load transfer | qs: F −2° reduces U at 0.4–0.6 g from 0.46 to 0.30 deg/g |
| Toe on turn-in and stability | 2-track with load transfer, relaxation | Per-wheel α; load-dependent Kα; relaxation states | Table below |
| Bump over one wheel | 7 DoF | Per-wheel vertical; ARB coupling | 50 mm bump: peak roll 0.28°, stable for all steps |
| Ride comfort | Quarter car; 7 DoF for pitch and roll | Road PSD or bumps; vertical acceleration metric | Modes above |
| Brake dive | Half car or 14 DoF | Anti-dive geometry; longitudinal transfer | Not simulated with anti |
| Brake-in-turn | 14 DoF | Combined slip; load transfer; wheel spin | Yaw rate rises from 0.250 to 0.365 rad/s before front saturates; at higher torque yaw drops |
| Snap oversteer (lift-off, limit) | 14 DoF with nonlinear tyre | Falling MF curve; combined slip; relaxation; `Vcrit` behaviour | Not demonstrated in my runs. TNO car reached 0.81 g ramp without spinning |
| Swing-axle jacking | 14 DoF plus nonlinear kinematic curves | RC or `h_svsa` varying with travel; large camber change; Fy-driven lift | Statics below; not simulated |
| Rollover propensity | Static formula; 14 DoF for dynamic | CG height; track; roll shift of CG; tyre μ | SSF below |

**Toe and camber trend, step steer 1° at 100 km/h** [C, Sim14, generic car, semi-implicit 1 ms]

| Setup | Steady yaw (rad/s) | t63 (s) | t90 (s) | Overshoot (%) | ay (g) |
|---|---|---|---|---|---|
| Baseline | 0.1459 | 0.188 | 0.323 | 5.3 | 0.395 |
| Front toe-in 0.25°/wheel | 0.1530 | 0.198 | 0.348 | 4.5 | 0.413 |
| Front toe-out 0.25°/wheel | 0.1380 | 0.179 | 0.299 | 6.4 | 0.375 |
| Rear toe-in 0.25°/wheel | 0.1392 | 0.180 | 0.305 | 5.9 | 0.378 |
| Rear toe-out 0.25°/wheel | 0.1552 | 0.200 | 0.352 | 4.7 | 0.419 |
| All wheels −2° static camber | 0.1484 | 0.193 | 0.336 | 4.7 | 0.402 |
| No roll camber (coefficient 0) | 0.1475 | 0.190 | 0.330 | 4.7 | 0.400 |
| Full roll camber (coefficient 1) | 0.1442 | 0.186 | 0.316 | 5.9 | 0.391 |

Quasi-static qs confirms the direction [C]: U at 0.1–0.3 g changes from baseline 0.29 to 0.25 (front toe-in), 0.37 (front toe-out), 0.34 (rear toe-in), 0.21 (rear toe-out) deg/g.

Mechanism [D]: with load transfer the outer tyre has larger Kα, so an axle's net toe force is `(C_outer − C_inner)·toe`, toward the turn for toe-in. Rear toe-in therefore adds rear force and front toe-in adds front force. The classic rules of thumb (rear toe-in stabilises; front toe-out sharpens turn-in) are reproduced for time-to-respond; note the faster t63 with front toe-out goes with a *lower* steady gain, and "sharper" may be partly normalisation.

**Swing-axle jacking** [D, statics]
- Lift on sprung mass with pivot at centre height `hp`, half-track `t/2`: `FJ = (Fy,o − Fy,i)·hp/(t/2)`, upward when `Fy,o > Fy,i`, plus roll moment `−(Fy,o + Fy,i)·hp`.
- As it lifts, outer wheel moves to positive camber (tucks), which drops Fy of that tyre and raises `hp` relative to ground in the rebound direction, a positive feedback. Nonlinear kinematic curves can represent this.
- Forum-level support for the concept and for the Beetle as the example [V-S: [Autosport](https://forums.autosport.com/topic/25351-ride-height-and-mechanical-grip)]. The search tool's own closed-form suggestion was uncited, so I do not rely on it.

**Rollover**
- `SSF = T/(2H)` [V: [NHTSA DOT HS 809 868](https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/809868)]. Range across vehicle types about 1.00–1.50; most passenger cars 1.30–1.50; SUVs, pickups, vans usually 1.00–1.30 [V].
- Sales-weighted averages, model year 2003: cars 1.41, SUV 1.17, pickup 1.18, minivan 1.24, full-size van 1.12 [V].
- Quasi-static tip-over [D]: `ay/g = (T/2 − Δy)/H`, where `Δy` = CG lateral shift from body roll, approximately `φ·(H − hrc)`.
- Tyre μ near 0.9–1.0 vs SSF above that implies untripped rollover on flat road is rare without a trip [inference].

**Inertia and CG data** [V: [Heydinger et al., SAE 1999-01-1336](https://www.lfs.net/attachment/44487), table columns]:

| Vehicle (1998) | CG height (m) | Pitch (kg·m²) | Roll (kg·m²) |
|---|---|---|---|
| Honda Civic | 0.513 | 1617 | 365 |
| Ford Explorer | 0.697 | 3561 | 740 |
| Chevrolet Tahoe | 0.722 | 5004 | 1197 |

Explorer yaw is 3682 kg·m² [V]. The database holds 496 entries [V-S: [SAE record](https://saemobilus.sae.org/papers/measured-vehicle-inertial-parameters-nhtsas-data-november-1998-1999-01-1336)].

### Inferences
- **Use one 14-DoF core, and derive the simpler views from it or beside it.** The quarter-car and bicycle closed forms give correct formulas to print next to sliders and act as unit tests of the full model, like the project's physics-derived checks in `tests/synth.test.ts`.
- **Add compliance.** A tyre-only K of 0.27 deg/g versus real 2.6–4.4 deg/g means most production understeer is not in the tyres. Without a global steer-compliance and roll-steer term the model will look nervous at speed and misreport Vch by 3×. Gillespie decomposes K into tyre, camber, roll-steer, lateral compliance and aligning-torque terms [NV].
- **Multibody is not needed.** Kinematic curves (camber, toe, RC height, anti-dive vs travel) solved once per design from hardpoints capture the same geometry. CommonRoad and my model both show that a kinematic-style model is enough for the listed manoeuvres. That hardpoint solver belongs to the suspension-geometry scope.
- Vehicle templates should be calibrated by global constants against public measures, in the spirit of `tests/real-engines.ts`: skidpad g, 100–0 km/h stopping distance, SSF, published understeer gradient where available. No per-vehicle tyre fudge.

### Gaps
- My Sim14 was not validated against measured car data.
- Snap oversteer was not reproduced in my runs. It likely needs a rear-limited setup and lift-off or a load-sensitive tyre; that remains to be tested.
- Roll-steer and compliance magnitudes for road cars not found.
- I did not read Rajamani, Abe, Guiggiani, or Blundell & Harty for their state formulations. MathWorks' 6DOF block was not read.
- Marco Monster's "Car Physics for Games" was unreachable (bot check). Formulas from that source are not included.

---

## Quasi-static approaches: Milliken moment method, MMM, g-g, steady-state solvers

### Takeaway
They are **more useful for explaining "why", less useful for showing "what happens"**. Build both: a moment diagram solved on each slider change (about a millisecond of compute) and a time-domain drive. Moment-method plots show stability and control margin directly, which a drive cannot.

### Cited Findings
- MMM is steady state: "there is no need for a time-based integration procedure" [V: [Milliken Research](https://millikenresearch.com/mmmsolution.html)].
- It offers approximate transient calculations and trim change analysis [V: same].
- Two diagrams [V: same]:
  - CN-AY: normalised yawing moment vs lateral acceleration at constant speed
  - CN-CY: normalised yawing moment vs lateral force at constant radius
- Body has 6 DoF; x, y and yaw are constrained; heave, roll and pitch stay free [V: same].
- Each curve family is constant steer or constant sideslip; unlike a handling diagram it plots the non-steady unbalanced moment [V-S: [core.ac.uk rally paper](https://core.ac.uk/download/228150063.pdf)].
- Metrics read from CN-AY: stability index, understeer gradient, steering sensitivity, max steady lateral acceleration, control moment gain [V-S: [MDPI](https://MDPI.com/2624-8921/5/2/29); [Springer](https://springerlink.bibliotecabuap.elogim.com/10.1007/978-3-031-07305-2_77)].
- It can also be driven by a controlled dynamic simulation [V-S: [SAE 2005-01-0417](https://saemobilus.sae.org/papers/implementing-milliken-moment-method-using-controlled-dynamic-simulation-2005-01-0417)].
- FSAE discussion of including weight transfer in moment diagrams exists [V-S: [fsae.com](https://fsae.com/forums/archive/index.php/t-6982.html)].

**Algorithm for this site** [D]
1. For a grid of sideslip β and steer δ at speed V, set yaw rate `r = ay/V` (iterate on ay).
2. From ay and ax, compute per-wheel Fz using the load transfer equations, and roll and camber from the roll gradient.
3. Compute per-wheel slip angle, then MF force; sum Fy and yaw moment N.
4. Update ay = ΣFy/m until converged, 5–10 iterations.
5. Plot N vs ay, one line per β and per δ. Trim points are where N = 0.

Definitions: `CN = N/(m·g·L)`. Stability = `∂N/∂β`; control = `∂N/∂δ` [D; consistent with Milliken Research's axes].

**Compute cost** [C]: 15×15 grid × 8 iterations × 4 tyres = 7200 MF evals × 0.09 µs ≈ 0.65 ms. Cheap enough for live redraw on a slider.

**Other steady solvers**
- Handling diagram from the qs solver: for each ay find αf and αr so axle forces balance, then `U = d(αf − αr)/d(ay)` [C: used for the tables above].
- g-g: repeat with ax sweep; max ay at each ax [D].
- Radius gives `R = V²/ay = V/r` [V: [Paddocklink](https://paddocklink-docs.pages.dev/lms/vehicle-dynamics-ii-theory/steady-state-handling-balance/characteristic-speed-and-critical-speed/)].

### Inferences

| Teaching need | Moment or quasi-static | Time domain |
|---|---|---|
| Why alignment changes balance | Best: shows force shift directly | Indirect |
| Peak grip, stability margin at limit | Best | Hard to read |
| Camber sweep, optimum, axle-level trade-off | Best | Possible, slow |
| Toe turn-in feel, yaw overshoot | No | Required |
| Lift-off, snap, brake-in-turn | Limited (trim change only) | Required |
| Bumps, ride comfort | No | Required |
| Visceral "see the car behave" | No | Required |

- A moment diagram is hard to read for a lay visitor. On the site, simplify to a "balance meter": front grip use vs rear grip use, derived from the same solver. Show the full CN-AY plot only in an expert section.
- The same MF code should serve the two: no second tyre model.

### Gaps
- No published comparison of how well learners understand MMM vs a time-domain sim. The table above is my judgement.
- Original Milliken text on MMM (RCVD ch. 8) not read; the MRA manual pages were available only as an unattributed excerpt, so not cited.

---

## Numerics: integrator, step size, stiffness, low-speed singularity, JavaScript budget

### Takeaway
**Use semi-implicit Euler at 1 kHz (about 17 sub-steps per 60 Hz frame), tyre deflection (relaxation) states with an implicit linear update, and a low-speed damping blend.** CPU is not the constraint: about 0.012 ms per frame per car. The hazard is silent: too large a step gives a bounded *limit cycle with wrong forces*, not a crash, so tests must check values, not just finite-ness.

### Cited Findings

**Stiffness sources** with `h_max = 2/|λ|` for forward Euler and `≈ 2.785/|λ|` for RK4 on real negative eigenvalues [standard stability limits; NV for 2.785, and borne out below]

Stiffness values from TNO 205/60R15 and the saloon model, Iw = 1 kg·m² and R = 0.3 m assumed [C]:

| Source | Rate formula | Value | Euler `h_max` | RK4 `h_max` |
|---|---|---|---|---|
| Wheel spin, steady slip, V = 27.8 m/s | `Kxκ·R²/(Iw·V)` | 281 /s | 7.1 ms | 9.9 ms |
| Same, V = 10 m/s | | 781 /s | 2.6 ms | 3.6 ms |
| Same, slip floor V = 1 m/s | | 7807 /s | 0.26 ms | 0.36 ms |
| Wheel on tyre carcass (with deflection state) | `√(Cfx·R²/Iw)` | 183 rad/s (29 Hz) | oscillator; see below | |
| Lateral deflection decay, V = 27.8 m/s | `V/σα` | 53 /s | implicit update: unlimited | 53 ms |
| Wheel hop | `√((Ks + Kt)/m)` | 77.5 rad/s (12.3 Hz) | stable to about 8.3 ms in test | |
| Damper on wheel | `Cs/m` | 50 /s | | |

**Measured behaviour, Sim14** [C]; generic car; Node v26.7.0 on this machine; "stable" means no divergence.

A. Step steer 2° at 100 km/h, deflection states on. Reference: RK4 at 0.1 ms; ay ≈ 0.64 g.

| h (ms) | Semi-implicit yaw RMS error (rad/s) | RK4 yaw RMS error (rad/s) |
|---|---|---|
| 0.25 | 2.3e-5 | 2.6e-14 |
| 0.5 | 4.6e-5 | 4.2e-13 |
| 1 | 9.3e-5 | 6.9e-12 |
| 2 | 1.9e-4 | 1.2e-10 |
| 8.33 | 8.1e-4 | 5.9e-5 |
| 16.67 | **2.5e-2** with wheel-hop limit cycle | 1.1e-2 |

Semi-implicit converges at first order. At 1 ms the error is 0.04% of the 0.245 rad/s yaw rate. The 4 ms row was dropped because samples misaligned with the grid.

A2. Same, steady slip without deflection states, floor 1 m/s. Correct steady yaw is 0.2450 rad/s:

| h (ms) | Semi-implicit yaw | RK4 yaw |
|---|---|---|
| ≤ 4 | 0.2450 | 0.2450 |
| 8.33 | **0.2115** (wheel-spread 5.5 rad/s) | 0.2450 |
| 16.67 | **0.1756** (spread 12.5 rad/s) | **0.2216** |

No NaN in any row. The instability saturates on the tyre curve and silently loses 14–28% of yaw rate. The break points match the table above (7.1 ms; 9.9 ms).

B. Braking from 30 m/s to stop, then hold. Residual speed RMS after stop (m/s):

| h (ms) | Steady slip, semi | Steady slip, RK4 | Deflection, semi | Deflection, RK4 |
|---|---|---|---|---|
| 0.25 | 5.7e-4 | 6e-50 | 2.2e-9 | 2.2e-9 |
| 0.5 | 8.4e-3 | 1.1e-2 | 2.2e-9 | 2.2e-9 |
| 1 | 0.18 | 2.4e-3 | 2.8e-4 | 2.2e-6 |
| 2 | 0.08 | 0.20 | 1.8e-3 | 2.1e-5 |
| 4 | 0.017, stop at 5.56 s vs 4.47 s | **never reached stop** | 0.05 | 6.0e-4 |
| 8.33 | stop at 8.28 s | **never reached stop** | 0.20 | 0.16 |

Break points again match `h_max` at the floor (0.26, 0.36 ms). Deflection states remove the low-speed step limit; the added low-speed damping blend (1500 N·s/m below 3 m/s, hand-chosen) keeps them quiet.

C. Single-wheel bump 50 mm × 0.5 m at 60 km/h. Reference peak wheel travel 37.6 mm, roll 0.284°. Up to 4 ms, either method is within 1 mm. At 8.33 ms semi-implicit overshoots to 40.8 mm. A shorter bump would be stricter.

D. CPU, Node v26 single thread [C]:

| Item | Time |
|---|---|
| One MF combined-slip evaluation | 0.09 µs |
| One semi-implicit step of the full model | 0.74 µs (1.36 M steps/s) |
| One RK4 step | 2.2 µs |
| 60 Hz frame at 1 kHz, semi-implicit (16.7 steps) | **0.012 ms** |
| Same, RK4 | 0.037 ms |

A 16.7 ms frame leaves about three orders of magnitude of margin.

**Low-speed singularity in practice:**
- Slip divides by `U`; regardless of the tyre force model, the singularity remains [V: [Zhan et al., arXiv 2411.17334](https://arxiv.org/pdf/2411.17334)].
- Slip ratio is ill-conditioned near zero speed, which can prevent a simulated full stop [V-S: [US patent 7509204](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7509204)]. My test B reproduces this.
- CarSim's compromise: slip angle as a filtered state `dα/dt` with relaxation length, plus a lower speed bound on the denominator [V: Zhan et al. sec. 3, describing CarSim].
- Zhan et al. model: backward Euler on lateral speed and yaw rate, forward Euler on others, with linear tyre. Their tests: stable for Ts = 0.001, 0.01, 0.1 s over 0–25 m/s; about 0.01 ms per step; compared with CarSim (Adams-Moulton second order) [V]. Applies to a bicycle with linear tyre, not to my full model.
- Bernard & Clover, SAE 950311: "Tire modeling for low-speed and high-speed calculations", brings a vehicle to a stop without numerical problems [V-S: [Penn catalogue record](https://find.library.upenn.edu/catalog/9979907222503681)]. Paywalled.
- Clover & Bernard 1998 "Longitudinal tire dynamics" extends the relaxation approach to longitudinal, for real-time use [V-S: [record](https://data.zhenzhi.com/details/1/875789748)].
- Dynamic tyre model is the commonly cited route over pure slip [V-S: [IFAC 2002](https://skoge.folk.ntnu.no/prost/proceedings/ifac2002/data/content/00284/284.pdf)].

**Other implementations:**
- MF-Tyre: `VXLOW = 1 m/s` cosine fade [V: Solver.m, .tir].
- Chrono TMeasy: `m_vnum = 0.01` in slip denominator; Dahl friction bristles `ż = v − σ0·z·|v|/Fc` blended with TMeasy between 1 and 3 m/s, integrated by backward Euler or trapezoidal rule [V: ChTMeasyTire.cpp]. The file calls this "experimental".
- CommonRoad MB: switches to kinematic model when `|vx| < 0.1 m/s` [V: vehicle_dynamics_mb.py].
- MathWorks 3DOF: `xdot_tol = 0.1 m/s` [V: docs]. How it is applied is not documented on the page.
- TORCS: fixed `RCM_MAX_DT_SIMU = 0.002` (500 Hz) [V: [raceman.h](https://github.com/ugo-nama-kun/gym_torcs/blob/master/vtorcs-RL-color/src/interfaces/raceman.h)]; force smoothing `RELAXATION2(F, pre, 50)` [V: wheel.cpp]. The macro's exact definition was not read.

### Inferences

Recommended configuration:
1. **Fixed 1 kHz semi-implicit Euler**: velocities first, then positions, with fixed-step accumulator in the frame loop (same pattern as the project's sim). 2 ms is acceptable for high speed only.
2. **Deflection states with implicit update:** `u'ₙ₊₁ = (u'ₙ + h·(ωR − Vw)) / (1 + h·|Vw|/σκ)`, same for v'. Unconditionally stable and needs no speed floor, and it brings relaxation length for free. [Run in Sim14.]
3. **Low-speed damping blend** below about 3 m/s to damp the undamped carcass oscillation. Static hold on a slope needs friction states; not tested.
4. **RK4 not needed.** Its accuracy is much higher, but MF kinks (sign switches, Fz ≥ 0) and bump inputs erode that. Semi-implicit at 1 ms has error far below visible levels. If used, 2 ms RK4 costs about the same CPU as 1 ms semi-implicit ×1.5.
5. **Tests must assert values, not just absence of NaN.** Check A2-style steady yaw and low-speed stop. The instability is a saturated limit cycle.
6. **Thread:** the budget allows the main thread. Moving it to a worker or worklet is optional here, unlike the engine audio. Pure code without DOM, same as `src/engine/*`, lets `scripts/` and `tests/` run it.
7. **60 Hz without sub-steps is not acceptable** (A: 10% yaw error, hop limit cycle; A2: 28%).

### Gaps
- No browser or mobile measurement. Chrome shares V8 with Node, so it should be near, but a low-end phone was not tested. Allow 10× margin; the budget supports it.
- Measured cost excludes kinematic curve lookups and rendering. Lookups should be small versus MF; not measured.
- I did not test wheel lock on a coarse step, a rough road, or a stiff bump-stop, each of which may need smaller steps.
- Static holding on a slope and creep were not tested.
- Stability numbers depend on Iw = 1 kg·m². CommonRoad uses 1.7 kg·m², which relaxes limits by 1.7× [V for the value; C for the effect].
- Implicit tyre solvers (Newton on wheel spin) were not explored because they were not needed.

---

## Effects of springs, dampers, bars, ride frequency, damping, unsprung mass, CG, track, wheelbase

### Takeaway
All of these have simple first-order formulas that can be printed beside the sliders and tested against the full model. Sourced values for family cars and SUVs are reasonably solid; there is no equally good source for road sports cars.

### Cited Findings

**First-order formulas**

| Quantity | Formula | Effect | Status |
|---|---|---|---|
| Ride frequency | `f = (1/2π)·√(K/m)` | Stiffer = more acceleration transmission | [V: [OptimumG](https://lfs.net/attachment/32094); [notes](https://bamason2.github.io/ttc066-module/notes/Section_5.html)] |
| Spring rate from target | `Ks = 4π²·f²·m_sm·MR²`; MR = wheel/spring travel | | [V: OptimumG]; check: 200 kg, 2 Hz, MR 1.25 → 49.3 N/mm |
| Series tyre and spring | `Kbb = Ks·Kt/(Ks + Kt)` | Tyre softens ride rate | [V: notes] |
| Damping ratio | `ζ = C/(2·√(K·m))` | | [V: notes as `C/√(4Km)`] |
| Baseline damper slope | `C = 4π·ζ·f·m` | | [V: OptimumG, printed as "Initial Slope = 4πζωm" with ω in Hz] |
| Wheel hop | `f = (1/2π)·√((Ks + Kt)/mu)` | More unsprung mass lowers hop frequency | [V: notes]; +50% mu: 12.1 → 9.9 Hz [C] |
| Roll stiffness | `Kφ ≈ 0.5·Kw·t²` + ARB | Track² | [D from OptimumG] |
| Roll gradient | `φ/ay = m_s·g·d/Kφ` | CG above roll axis | [V: OptimumG] |
| Lateral transfer | `ΔW = m·ay·h/t` | CG up, track down → more | [V: [Wavey](https://waveysite.pages.dev/blog/weight-transfer-rc)] |
| Longitudinal transfer | `ΔF = m·ax·h/L` | CG up, wheelbase down → more | [V: [Wikipedia](https://en.wikipedia.org/wiki/Weight_transfer)] |
| Understeer gradient | `K = Wf/Cf − Wr/Cr` | Forward CG → understeer; compliance adds | [V-S: LiU] |
| Rollover index | `SSF = T/(2H)` | | [V: NHTSA] |
| Yaw response | see bicycle section | Wheelbase and Iz set ωn | [D] |

Qualitative effects:
- Softer: more mechanical grip over bumps, but higher required travel and ride height [V: OptimumG]. Limits on going softer: travel, fluctuating tyre load, nausea at very low frequency [V: notes].
- Higher damping reduces the resonance peak but increases high-frequency transmission [V: notes]. Unstated limit: 200% damping [V: notes, figure discussion].
- Damping trades response time vs overshoot [V: OptimumG]. Wheel hop mode is mostly damped by the shock absorber [V-S: [ntnu CDC 2008](https://folk.ntnu.no/skoge/prost/proceedings/cdc-2008/data/papers/1685.pdf)].
- Stiffer roll: faster transient at expense of grip over bumps [V: OptimumG].
- Chassis torsion: compare with suspension roll rate, since it acts as a series spring [V: OptimumG].

qs sensitivity [C], generic car, U at 0.4–0.6 g (base 0.46 deg/g): CG height 0.45 m → 0.43; 0.75 m → 0.54; track 1.6 m → 0.45. These are limited by the tyre chosen. Peak ay unchanged at 0.86 g.

**Typical values**

| Parameter | Family car | Sports car | SUV | Source and status |
|---|---|---|---|---|
| Ride frequency (Hz) | 0.5–1.5 (OptimumG); 0.5–1 low-performance road (HPA); computed 1.25–1.66 (Escort, 320i, saloon); 1.0–1.6 (blog) | 1–1.5 (HPA); 1.5–2.0 (Skill-Lync); 1.6–2.3 (CorkSport blog) | Computed 1.55–1.80 for Vanagon (van, not SUV) | [OptimumG](https://lfs.net/attachment/32094) V; [HP Academy](https://hpacademy.com/courses/suspension-tuning-and-optimization/foundation-concepts-suspension-frequency) V; [Skill-Lync](https://resources.skill-lync.com/branches/automobile-engineering/questions/vehicle-dynamics/ride-frequency-optimization) V-S; [CorkSport](https://corksport.com/blog/?p=11274) V-S. **Sources disagree**; SUV figure is a gap |
| Front/rear split | Rear 10–30% above front | Same, racecars may reverse | Same | [V: OptimumG, principle; V-S: forum for numbers](https://www.fiestastforum.com/goto/post?id=483550) |
| Ride damping ratio | ≈ 0.25 (OptimumG); 0.2–0.4 (notes); computed 0.27–0.40 (CommonRoad) | Not sourced; race baseline 0.65–0.70 for comparison | Computed 0.35–0.40 (Vanagon) | V; C |
| Roll gradient (deg/g) | Computed 6.5 with RC at ground | 1.0–1.8 for low-downforce race sedans, not road sports | Computed 4.6 (Vanagon) | V: OptimumG; C. Road-car published value is a gap |
| Unsprung/sprung per corner | 0.10 (saloon); 0.095–0.12 (CommonRoad) | Not sourced | 0.115 (Vanagon) | V, C |
| Tyre vertical (kN/m) | 158–218 | 250 (225/50R18 file) | 213 (Vanagon) | V: files |
| CG height (m) | 0.51 (Civic), 0.56–0.57 (CommonRoad) | Not sourced | 0.70 (Explorer), 0.72 (Tahoe) | V: Heydinger; CommonRoad |
| SSF | Average 1.41; range 1.30–1.50 | Not sourced | Average 1.17; range 1.00–1.30 | V: NHTSA |
| Yaw inertia (kg·m²) | 1539–1792 | Not sourced | 3682 (Explorer) | V |
| Understeer gradient (deg/g) | 2.6–4.4 | Not sourced | About 3+ for trucks, anecdotal | V-S |

Conflict: CommonRoad T/(2h) values of 1.21–1.25 for the Escort and 320i sit below NHTSA's 1.30–1.50 car range [C, V]. Likely old or non-representative CommonRoad h values; do not treat as typical.

Also seen: race bands (HPA): low-downforce racing 1.5–2.5 Hz; medium 2–3.5 Hz; high 3.5–5+ Hz; rally 1–2 Hz [V]. A 0.5–1 Hz low-performance band seems low against the 1.25 Hz computed for real parameter sets [C, note on conflict].

### Inferences
- These formulas double as **test oracles**: full-model tests can assert f, ζ within a tolerance, like the project's physics-derived expectations.
- Sliders should show computed f, ζ, roll gradient, LLTD, SSF immediately, without running the time-domain model, mirroring `DesignerPage`'s fast path for numbers.
- A sensible family-car default: f 1.2–1.5 Hz with rear above front, ζ 0.25–0.35, mu/ms about 0.1, Kt about 200 kN/m, h about 0.55 m. These sit inside the sourced ranges but are my selection, not a published set.

### Gaps
- No primary source found for road sports cars or modern SUVs (spring rates, ride frequency, damping, CG). Search returned only forums and vendor blogs. Heydinger's table has performance cars in a part of its data I did not extract.
- Road-car roll gradient from a measured source not found.
- Damper asymmetry (bump vs rebound) values not sourced from an authority; forum claims of low-speed damping at 50–70% critical refer to tuned cars [V-S: [fiestastforum](https://fiestastforum.com/goto/post?id=483558)].
- Gillespie's actual tables were not read; the notes are "an extremely condensed" version of his Chapter 5 [V].
- **Textbook pass not done.** Textbook use was approved late and the session ended first, so these notes contain no [B] items. No book was consulted. Still open: Milliken's optimal damping figures for comfort vs road holding; Gillespie's ride frequency and roll gradient by car class; book values for camber thrust, peak grip vs camber, MF coefficient sets, load sensitivity and LLTD balance.
- **Fetch method caveat.** Some curl downloads used a browser user-agent string: the arXiv PDF, Chrono sources, the course notes, the Wavey Dynamics page and the Heydinger PDF on lfs.net (and failed attempts on the TMeasy paper and Dressel thesis, both 403). The last two had already refused a plain fetch. No content from a refused host is used here beyond search summaries.
