const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.sqrt(dot(a,a)),unit=a=>mul(a,1/norm(a));
function rot(rv,p){const th=norm(rv);if(th<1e-14)return add(p,cross(rv,p));const k=mul(rv,1/th);return add(add(mul(p,Math.cos(th)),mul(cross(k,p),Math.sin(th))),mul(k,dot(k,p)*(1-Math.cos(th))));}
function numJ(F,q){const r0=F(q),h=1e-7;const J=r0.map(()=>Array(q.length).fill(0));for(let j=0;j<q.length;j++){const qq=[...q];qq[j]+=h;const r=F(qq);for(let i=0;i<r.length;i++)J[i][j]=(r[i]-r0[i])/h;}return J;}
function solve(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);for(let i=0;i<n;i++){let m=i;for(let r=i+1;r<n;r++)if(Math.abs(M[r][i])>Math.abs(M[m][i]))m=r;[M[i],M[m]]=[M[m],M[i]];for(let r=i+1;r<n;r++){const f=M[r][i]/M[i][i];for(let c=i;c<=n;c++)M[r][c]-=f*M[i][c];}}const x=Array(n);for(let i=n-1;i>=0;i--){x[i]=M[i][n];for(let c=i+1;c<n;c++)x[i]-=M[i][c]*x[c];x[i]/=M[i][i];}return x;}
function newton(F,q0){let q=[...q0],it=0;for(;it<40;it++){const r=F(q);if(Math.max(...r.map(Math.abs))<1e-9)break;const dq=solve(numJ(F,q),r.map(v=>-v));q=q.map((v,i)=>v+dq[i]);}return{q,it};}
// Published table 1 (Iwatsuki, JTEKT 2023): O-xyz, +x right, +y forward, z up; right front wheel, mm.
const J={WC:[730,0,0],SA:[350,220,-68],KSA:[0.0324,0.9947,-0.0972],SU:[560,-57,470],SB:[590,-5,54],KP:[680,17,-86],RP:[0,77,48],IB:[280,77,48],OB:[690,120,6]};
console.log('check LT',norm(sub(J.OB,J.IB)),'(published 414.38)');
const foot=add(J.SA,mul(J.KSA,dot(sub(J.KP,J.SA),J.KSA)));console.log('KP radius about arm axis',norm(sub(J.KP,foot)),'(published LS 387.86?)','|SU-SB|',norm(sub(J.SU,J.SB)));
const Rw=+process.argv[2]||300; // ASSUMED rolling radius, not in the paper
const toP=p=>[p[1],p[0],p[2]+Rw]; // mirror to left-corner ISO: X fwd, Y out, Z up from ground
const P=Object.fromEntries(Object.entries(J).filter(([k])=>k!=='KSA').map(([k,v])=>[k,toP(v)]));const KS=[J.KSA[1],J.KSA[0],J.KSA[2]];
const A1=P.SA,A2=add(P.SA,mul(KS,300));const D=(a,b)=>norm(sub(a,b));const L1=D(P.KP,A1),L2=D(P.KP,A2),LT=D(P.OB,P.IB);const r0=P.WC;
const xf=(q,p)=>add(add(r0,q.slice(0,3)),rot(q.slice(3),sub(p,r0)));const rv=(q,v)=>rot(q.slice(3),v);
const ax=unit(sub(P.SU,P.SB));const e1=unit(cross(ax,[1,0,0])),e2=cross(ax,e1);
const dist=(q,fix,mov,L)=>norm(sub(xf(q,mov),fix))-L;
const F=zt=>q=>{const d=sub(P.SU,xf(q,P.SB));return[dist(q,A1,P.KP,L1),dist(q,A2,P.KP,L2),dist(q,P.IB,P.OB,LT),dot(d,rv(q,e1)),dot(d,rv(q,e2)),xf(q,P.WC)[2]-zt];};
const met=q=>{const s=rv(q,[0,1,0]);const W=xf(q,P.WC);const z=[0,0,1],rad=unit(sub(z,mul(s,dot(z,s))));const cp=sub(W,mul(rad,W[2]/rad[2]));const kp=xf(q,P.KP);const k=unit(sub(P.SU,kp));const kg=add(kp,mul(k,-kp[2]/k[2]));
 return{cam:-Math.atan2(s[2],Math.hypot(s[0],s[1]))*180/Math.PI,toe:Math.atan2(s[0],s[1])*180/Math.PI,W,cp,kpi:Math.atan2(-k[1],k[2])*180/Math.PI,cas:Math.atan2(-k[0],k[2])*180/Math.PI,scrub:cp[1]-kg[1],trail:kg[0]-cp[0],strut:D(P.SU,xf(q,P.SB))};};
const m0=met([0,0,0,0,0,0]);console.log('static assumed R=',Rw,{kpi:m0.kpi,caster:m0.cas,scrub_mm:m0.scrub,trail_mm:m0.trail});
let q=[0,0,0,0,0,0];console.log('dz camber toeIn halfTrack x_wc strutLen kpi caster scrub trail iters');
for(const dz of [-80,-60,-40,-20,0,20,40,60,80]){const r=newton(F(P.WC[2]+dz),[0,0,dz,0,0,0]);const m=met(r.q);console.log(dz,m.cam.toFixed(3),m.toe.toFixed(3),m.cp[1].toFixed(1),m.W[0].toFixed(1),m.strut.toFixed(1),m.kpi.toFixed(2),m.cas.toFixed(2),m.scrub.toFixed(1),m.trail.toFixed(1),r.it);}
const a=met(newton(F(P.WC[2]+1),[0,0,1,0,0,0]).q),b=met(newton(F(P.WC[2]-1),[0,0,-1,0,0,0]).q);
const dy=(a.cp[1]-b.cp[1])/2;console.log('at design: camber deg/m',(a.cam-b.cam)/2*1000,'toeIn deg/m',(a.toe-b.toe)/2*1000,'dY/dz',dy,'RC mm',P.WC[1]*dy,'RCF rel. ground: 1 - (t/2)*gain =',1-P.WC[1]/1000*Math.abs((a.cam-b.cam)/2*1000)*Math.PI/180,' dX/dz',(a.W[0]-b.W[0])/2);
