// Sanity check only: invented, illustrative double-wishbone hardpoints (metres). Not a real car.
// Axes ISO: X forward, Y left, Z up. Left corner.
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.sqrt(dot(a,a)),unit=a=>a.map(v=>v/norm(a)),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s);
const H={lf:[0.20,0.30,0.18],lr:[-0.20,0.30,0.18],uf:[0.15,0.40,0.45],ur:[-0.15,0.40,0.45],rack:[0.12,0.32,0.22],
 lbj:[0,0.70,0.14],ubj:[-0.01,0.65,0.50],tro:[0.12,0.68,0.20],wc:[0,0.78,0.30],spin:[0,1,0]};
const Rw=0.30;
const D=(a,b)=>norm(sub(a,b));
const L={lf:D(H.lbj,H.lf),lr:D(H.lbj,H.lr),uf:D(H.ubj,H.uf),ur:D(H.ubj,H.ur),tr:D(H.tro,H.rack),lu:D(H.lbj,H.ubj),lt:D(H.lbj,H.tro),ut:D(H.ubj,H.tro)};
function resid(q,zt,rackY=0){const l=q.slice(0,3),u=q.slice(3,6),t=q.slice(6,9);const rack=add(H.rack,[0,rackY,0]);
 const c=(a,b,L)=>{const d=sub(a,b);return dot(d,d)-L*L};
 return [c(l,H.lf,L.lf),c(l,H.lr,L.lr),c(u,H.uf,L.uf),c(u,H.ur,L.ur),c(t,rack,L.tr),c(l,u,L.lu),c(l,t,L.lt),c(u,t,L.ut),l[2]-zt];}
function jac(q,rackY=0){const l=q.slice(0,3),u=q.slice(3,6),t=q.slice(6,9);const J=Array.from({length:9},()=>Array(9).fill(0));const rack=add(H.rack,[0,rackY,0]);
 const p=(r,i,a,b)=>{const d=sub(a,b);for(let k=0;k<3;k++)J[r][i+k]+=2*d[k]};
 p(0,0,l,H.lf);p(1,0,l,H.lr);p(2,3,u,H.uf);p(3,3,u,H.ur);p(4,6,t,rack);
 p(5,0,l,u);p(5,3,u,l);p(6,0,l,t);p(6,6,t,l);p(7,3,u,t);p(7,6,t,u);J[8][2]=1;return J;}
function solve(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);for(let i=0;i<n;i++){let m=i;for(let r=i+1;r<n;r++)if(Math.abs(M[r][i])>Math.abs(M[m][i]))m=r;[M[i],M[m]]=[M[m],M[i]];for(let r=i+1;r<n;r++){const f=M[r][i]/M[i][i];for(let c=i;c<=n;c++)M[r][c]-=f*M[i][c];}}const x=Array(n);for(let i=n-1;i>=0;i--){x[i]=M[i][n];for(let c=i+1;c<n;c++)x[i]-=M[i][c]*x[c];x[i]/=M[i][i];}return x;}
function newton(q0,zt,rackY=0){let q=[...q0],it=0,hist=[];for(;it<30;it++){const r=resid(q,zt,rackY);const e=Math.max(...r.map(Math.abs));hist.push(e);if(e<1e-12)break;const dq=solve(jac(q,rackY),r.map(v=>-v));q=q.map((v,i)=>v+dq[i]);}return{q,it,hist};}
// rigid transform of upright from three points; returns R(v)
function frame(a,b,c){const e1=unit(sub(b,a));const e3=unit(cross(e1,sub(c,a)));const e2=cross(e3,e1);return[e1,e2,e3];}
const F0=frame(H.lbj,H.ubj,H.tro);
const toLocal=p=>{const d=sub(p,H.lbj);return F0.map(e=>dot(e,d))};
const wcL=toLocal(H.wc),spL=F0.map(e=>dot(e,H.spin));
function metrics(q){const l=q.slice(0,3),u=q.slice(3,6),t=q.slice(6,9);const F=frame(l,u,t);
 const wc=add(l,add(add(mul(F[0],wcL[0]),mul(F[1],wcL[1])),mul(F[2],wcL[2])));
 const s=unit(add(add(mul(F[0],spL[0]),mul(F[1],spL[1])),mul(F[2],spL[2])));
 const camber=Math.atan2(s[2],Math.hypot(s[0],s[1]))*-1*180/Math.PI; // left wheel: spin axis pointing outboard +Y; top out => s_z<0 ... sign below
 const toe=Math.atan2(s[0],s[1])*180/Math.PI; // +toe-in for left wheel: front points inboard (-Y)
 // contact point: from wheel centre straight down the wheel plane
 const zhat=[0,0,1];const rad=unit(sub(zhat,mul(s,dot(zhat,s))));const cp=sub(wc,mul(rad,wc[2]/rad[2]));
 // kingpin
 const k=unit(sub(u,l));const kpi=Math.atan2(-k[1],k[2])*180/Math.PI;const cas=Math.atan2(-k[0],k[2])*180/Math.PI;
 const tg=-l[2]/k[2];const kg=add(l,mul(k,tg));
 const scrub=cp[1]-kg[1],trail=kg[0]-cp[0];
 const spindle=(()=>{const d=sub(wc,l);const c=cross(k,d);return norm(c)})();
 return{wc,camber,toe,cp,kpi,cas,scrub,trail,spindle,F,l,u,t};}
// Instant screw at a position: 3-pt velocities from nullspace, with wheel-centre heave rate 1 (dz_lbj=1)
function velField(q){const J=jac(q);const b=Array(9).fill(0);b[8]=1;const v=solve(J,b);return{vl:v.slice(0,3),vu:v.slice(3,6),vt:v.slice(6,9)};}
function screw(q){const{vl,vu,vt}=velField(q);const l=q.slice(0,3),u=q.slice(3,6),t=q.slice(6,9);
 // omega from v_i - v_j = omega x (r_i-r_j)
 const a=sub(u,l),b=sub(t,l),va=sub(vu,vl),vb=sub(vt,vl);
 const w=mul(cross(va,vb),1/dot(cross(a,b),va)*0+1); // placeholder overwritten
 // solve linear 3x3 from 3 eqs: va = w x a ; vb = w x b; use least squares through normal form
 const row=(r)=>[[0,r[2],-r[1]],[-r[2],0,r[0]],[r[1],-r[0],0]];
 const A=[...row(a),...row(b)],y=[...va,...vb];
 const N=[0,1,2].map(i=>[0,1,2].map(j=>A.reduce((s,r)=>s+r[i]*r[j],0))),g=[0,1,2].map(i=>A.reduce((s,r,k)=>s+r[i]*y[k],0));
 const om=solve(N,g);return{om,vl,l};}
function pointVel(s,p){return add(s.vl,cross(s.om,sub(p,s.l)));}
const q0=[...H.lbj,...H.ubj,...H.tro];
const m0=metrics(q0);
console.log('static',{camber:m0.camber,toe:m0.toe,kpi:m0.kpi,caster:m0.cas,scrub_mm:m0.scrub*1e3,trail_mm:m0.trail*1e3,spindle_mm:m0.spindle*1e3,cp:m0.cp});
let prev=[...q0];console.log('dz_mm camber toe track_half_mm wc_x_mm iters residualHistoryFirst');
for(let dz=-100;dz<=100;dz+=25){const zt=H.lbj[2]+dz/1000;const r=newton(q0,zt);const m=metrics(r.q);console.log(dz,m.camber.toFixed(3),m.toe.toFixed(3),(m.cp[1]*1e3).toFixed(1),(m.wc[0]*1e3).toFixed(1),r.it,r.hist.slice(0,5).map(x=>x.toExponential(1)).join(','));}
// Instant-axis based RC vs arm-intersection 2D construction at static
const s=screw(q0);
const vCP=pointVel(s,m0.cp);
const dCambPerM=(()=>{const h=1e-4;const a=metrics(newton(q0,H.lbj[2]+h).q),b=metrics(newton(q0,H.lbj[2]-h).q);const dz=a.cp[2]-b.cp[2];const dzwc=a.wc[2]-b.wc[2];return{cam:(a.camber-b.camber)/dzwc,toe:(a.toe-b.toe)/dzwc,yCp:(a.cp[1]-b.cp[1])/dzwc,xWc:(a.wc[0]-b.wc[0])/dzwc};})();
console.log('finite-diff d/dz_wc: camber deg/m',dCambPerM.cam,'toe deg/m',dCambPerM.toe,'dY_cp/dz',dCambPerM.yCp,'dX_wc/dz',dCambPerM.xWc);
console.log('screw omega(rad per m of LBJ z)',s.om,'cp vel',vCP);
// 2D front-view IC by arm plane intersection at wheel-centre plane x=0
const axisL=unit(sub(H.lf,H.lr)),axisU=unit(sub(H.uf,H.ur));
const nL=cross(axisL,sub(H.lbj,H.lr)),nU=cross(axisU,sub(H.ubj,H.ur));
// planes: nL.(p-lbj)=0, nU.(p-ubj)=0, x=x0 -> solve
const x0=m0.wc[0];const ic=solve([nL,nU,[1,0,0]],[dot(nL,H.lbj),dot(nU,H.ubj),x0]);
console.log('IC from arm-planes',ic);
// RC: line from contact patch through IC to y=0 (symmetric)
const t=(0-m0.cp[1])/(ic[1]-m0.cp[1]);const zRC=m0.cp[2]+t*(ic[2]-m0.cp[2]);console.log('RC height mm (arm-plane construction)',zRC*1e3);
// Kinematic RC from velocity direction of contact point: line perpendicular to cp's YZ-velocity; intersect y=0
const vy=dCambPerM.yCp;const zRC2=m0.cp[1]*vy; // slope: at cp, a body rotating about RC on centreline: v_y/v_z = (z_RC-z_cp)/(y_cp-y_RC)
console.log('RC height mm (from dY_cp/dz: z_RC = y_cp*dY/dZ)',zRC2*1e3);
console.log('fvsa (m) from IC:',m0.cp[1]-ic[1],'; expected |camber gain|~ 1/fvsa rad/m =',(180/Math.PI)/Math.hypot(m0.wc[1]-ic[1],m0.wc[2]-ic[2]),'deg/m');
// IC by finite-screw projection instead: intersection of instant axis with plane x=x0
const om=s.om;const v0=s.vl;const pAx=add(s.l,mul(cross(om,v0),1/dot(om,om)));const tAx=(x0-pAx[0])/om[0];const icS=add(pAx,mul(om,tAx));console.log('IC via screw axis at x=x0',icS,'pitch',dot(om,v0)/dot(om,om));
// Jacobian conditioning at extremes: min pivot via ratio
