# Throwaway checks behind the 2026-11-13 plan revision (docs/research/suspensions.md, section 13).
# Plain Python 3, no dependencies: python3 plan-review-checks.py
import math, cmath
g=9.81
# --- MF PAC2002 lateral, Sedan_Pac02Tire
S=dict(FNOMIN=4850,PCY1=1.3507,PDY1=1.0489,PDY2=-0.18033,PDY3=-2.8821,PEY1=-0.0074722,PEY2=-0.0063208,PEY3=-9.9935,PEY4=-760.14,
       PKY1=-21.92,PKY2=2.0012,PKY3=-0.024778,PHY1=0.0026747,PHY2=8.9094e-5,PHY3=0.031415,PVY1=0.037318,PVY2=-0.010049,PVY3=-0.32931,PVY4=-0.69553)
C=dict(FNOMIN=3800,PDY1=0.94002,PDY2=-0.17669,PDY3=-0.69602,PEY1=0.0040023,PEY2=0.00085719,PEY3=41.465,PEY4=665.25,PVY3=-0.38166,PVY4=-0.033117,PHY3=0.037561,PKY1=-12.536,PKY2=1.3856,PKY3=-0.93342,PCY1=1.3,PHY1=0,PHY2=0,PVY1=0.031255,PVY2=-0.0017359)
def fy(p,Fz,alpha,gam,Fz0=None,LMUY=1.0):
    Fz0=Fz0 or p['FNOMIN']; dfz=(Fz-Fz0)/Fz0
    mu=(p['PDY1']+p['PDY2']*dfz)*(1-p['PDY3']*gam**2)*LMUY
    D=mu*Fz; Cy=p['PCY1']
    Ky=p['PKY1']*Fz0*math.sin(2*math.atan(Fz/(p['PKY2']*Fz0)))*(1-p['PKY3']*abs(gam))
    B=Ky/(Cy*D)
    SH=p['PHY1']+p['PHY2']*dfz+p['PHY3']*gam
    SV=Fz*((p['PVY1']+p['PVY2']*dfz)+(p['PVY3']+p['PVY4']*dfz)*gam)*LMUY
    a=alpha+SH
    E=(p['PEY1']+p['PEY2']*dfz)*(1-(p['PEY3']+p['PEY4']*gam)*(1 if a>=0 else -1))
    return D*math.sin(Cy*math.atan(B*a-E*(B*a-math.atan(B*a))))+SV, E
def peak(p,Fz,gam,sign=1,**k):
    best=0;Em=None
    for i in range(1,400):
        a=sign*i*0.0005
        f,E=fy(p,Fz,a,gam,**k)
        if abs(f)>abs(best): best=f;Em=E
    return best,Em
# First pass uses FNOMIN without LFZO; the "max E_y vs camber" block at the end uses LFZO*FNOMIN = 3929 N.
print("E_y range Sedan over camber, load, sign (no LFZO):")
for gd in [-6,-4,-2,0,2,4,6,8,10]:
    gam=math.radians(gd); Es=[]
    for Fz in [1500,3000,4850,7000,9000]:
        for s in (1,-1):
            Es.append(fy(S,Fz,s*0.05,gam)[1])
    print(f" gamma {gd:+d}°: E min {min(Es):.2f} max {max(Es):.2f}")
print("Classic E_y:")
for gd in [-6,-3,0,3,6]:
    gam=math.radians(gd); Es=[]
    for Fz in [1500,3000,3800,6000]:
        for s in (1,-1): Es.append(fy(C,Fz,s*0.05,gam)[1])
    print(f" gamma {gd:+d}°: E min {min(Es):.2f} max {max(Es):.2f}")
# camber effect on peak Fy at Fz0 (sign: positive alpha gives negative Fy with PKY1<0 ... just compare both)
Fz=4850
for gd in [-2,0,2]:
    gam=math.radians(gd)
    pp,_=peak(S,Fz,gam,1); pn,_=peak(S,Fz,gam,-1)
    print(f"Sedan gamma {gd:+d}: peak Fy(+alpha) {pp:.0f}  peak Fy(-alpha) {pn:.0f}  mu {abs(pp)/Fz:.3f} {abs(pn)/Fz:.3f}")
print("PDY3 term at 2deg:", -S['PDY3']*math.radians(2)**2)
print("SVy shift per deg camber /Fz:", (S['PVY3'])*math.radians(1))
# mu at static corner loads for lap cars, Fz0 = FNOMIN, LMUY so mu(Fz0)=1.0 (normalised by PDY1)
cars={'Camaro':1670,'WRX':1540,'Civic':1415,'Cayman':1320,'GT3':1413,'Z06':1560,'hothatch':1250}
for n,m in cars.items():
    Fzs=m*g/4; dfz=(Fzs-4850)/4850
    mu=(S['PDY1']+S['PDY2']*dfz)/S['PDY1']
    print(f"{n}: Fz {Fzs:.0f} N mu_rel {mu:.3f}")
# 60/40 concavity
p=S['PDY2']/S['PDY1']
f=1.2*(1+p*0.2)+0.8*(1+p*(-0.2)); print("60/40: sum of peak forces / equal-load sum", f/2)
# --- hot hatch inner rear lift
m=1250; fr=0.62; ay=0.9*g; h=0.55; t=1.50
rear_static=m*g*(1-fr)/2; total=m*ay*h/t
print("hot hatch rear static per wheel", rear_static, "total transfer", total, "rear share needed", rear_static/total)
# --- roll gradient vs RC
ms=1350;hcg=0.55
def rg(rcf,rcr,Kf,Kr,fs=0.6):
    hra=fs*rcf+(1-fs)*rcr; hp=hcg-hra
    return ms*hp/(Kf+Kr-ms*g*hp)
for rcf in [0.0,0.050,0.065,0.116,0.132]:
    print(f"RCf {rcf*1000:.0f} mm: roll grad {math.degrees(rg(rcf,0.13,30000,8000)*g):.2f} deg/g")
# --- E30 inertia
m=1252;h=0.533;Ixx=381;mu4=4*40;hu=0.30;ty=0.70
Iu=mu4*(ty**2+(h-hu)**2); ms_=m-mu4; hs=(m*h-mu4*hu)/ms_
print("E30 unsprung Ixx contribution", Iu, "share", Iu/Ixx, "sprung h", hs)
# Ixx about sprung CG: Ixx_total = Ixx_s + ms*(hs-h)^2 + sum mu*(y^2+(hu-h)^2)
Ixxs=Ixx-ms_*(hs-h)**2-Iu
print("E30 sprung Ixx", Ixxs)
# --- quarter car invariant point with tyre damping
def H(ms,mu,ks,cs,kt,ct,w):
    # body accel / road disp
    s=1j*w
    A=[[ms*s*s+cs*s+ks, -(cs*s+ks)],[-(cs*s+ks), mu*s*s+(cs+ct)*s+ks+kt]]
    b=[0, ct*s+kt]
    det=A[0][0]*A[1][1]-A[0][1]*A[1][0]
    zs=(b[0]*A[1][1]-A[0][1]*b[1])/det
    return abs(zs)
ms,mu,ks,kt=400,40,22000,281000
wt=math.sqrt(kt/mu)
for ct in [0,50,2000]:
    vals=[]
    for z in [0.1,0.3,0.7]:
        cs=2*z*math.sqrt(ks*ms)
        vals.append(H(ms,mu,ks,cs,kt,ct,wt))
    print(f"ct {ct}: |Zs/Y| at wt for zeta .1 .3 .7 :", [f"{v:.4f}" for v in vals], "mu/ms", mu/ms)
fb=math.sqrt(ks*kt/(ks+kt)/ms)/2/math.pi; print("body f",fb,"wheel hop", math.sqrt((ks+kt)/mu)/2/math.pi, "inv f", wt/2/math.pi)
# sweep: linear 0.5-25 Hz in 40 s, time in band around 1.2 Hz at zeta .08: half-power bandwidth 2*zeta*f
rate=(25-0.5)/40; bw=2*0.08*1.2; print("time in band s",bw/rate,"buildup 1/(zeta w)",1/(0.08*2*math.pi*1.2))
# log sweep 0.1 oct/s : time in band = log2((f+bw/2)/(f-bw/2))/0.1
print("log sweep 0.1 oct/s time in band", math.log2((1.2+bw/2)/(1.2-bw/2))/0.1, "total time 0.5-25Hz", math.log2(25/0.5)/0.1)
# road: cost estimate trivial
# anti-dive rear rise: 1500 kg, 1g, h .55 L 2.6, rear wheel rate 25 N/mm per wheel
dF=1500*g*0.55/2.6; rise=dF/2/25000; print("rear unload per wheel",dF/2,"rise mm",rise*1000,"pitch deg",math.degrees(rise/2.6))
print("---- camber effect decomposition (Sedan, Fz0, peak for -alpha => +Fy)")
import copy
def eff(p):
    a=peak(p,4850,math.radians(-2),-1)[0]; b=peak(p,4850,math.radians(2),-1)[0]; c=peak(p,4850,0,-1)[0]
    return (a-c)/c*100,(b-c)/c*100
print("full", eff(S))
for keys in [('PVY3','PVY4'),('PEY3','PEY4'),('PDY3',),('PHY3',),('PKY3',)]:
    q=dict(S)
    for k in keys: q[k]=0
    print("zero",keys, eff(q))
print("---- invariant point vs ct")
for ct in [0,50,100,200,500]:
    vals=[]
    for z in [0.1,0.3,0.7]:
        cs=2*z*math.sqrt(ks*ms); vals.append(H(ms,mu,ks,cs,kt,ct,wt))
    print(ct, [round(v/0.1,3) for v in vals])
# patch length estimate
r=0.33
for Fz in [3000,4000,5000]:
    d=Fz/250000; print("Fz",Fz,"defl mm",d*1000,"patch len mm", 2*math.sqrt(2*r*d)*1000)
print("---- E_y at +-5 deg, FZMIN..FZMAX")
for gd in [-5,-4.5,4.5,5]:
    gam=math.radians(gd); Es=[]
    for Fz in [225,1000,2000,3929,6000,8000,10125]:
        for s in (1,-1): Es.append(fy(S,Fz,s*0.05,gam,Fz0=3929)[1])
    print(gd, round(min(Es),3), round(max(Es),3))
print("---- max E_y vs camber")
for gd in [x*0.5 for x in range(-12,13)]:
    gam=math.radians(gd)
    m1=max(fy(S,Fz,s*0.05,gam,Fz0=3929)[1] for Fz in range(225,10126,100) for s in (1,-1))
    m2=max(fy(S,Fz,s*0.05,gam,Fz0=3929)[1] for Fz in range(1000,8001,100) for s in (1,-1))
    print(gd, round(m1,3), round(m2,3))
