// Sanity check only: invented hardpoints (metres), ISO axes (X fwd, Y left, Z up), left corner. Not real cars.
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.sqrt(dot(a,a)),unit=a=>mul(a,1/norm(a));
// pose: q=[tx,ty,tz, rx,ry,rz] rotation vector applied about reference point r0
function rot(rv,p){const th=norm(rv);if(th<1e-14)return add(p,cross(rv,p));const k=mul(rv,1/th);return add(add(mul(p,Math.cos(th)),mul(cross(k,p),Math.sin(th))),mul(k,dot(k,p)*(1-Math.cos(th))));}
const xf=(q,r0,p)=>add(add(r0,q.slice(0,3)),rot(q.slice(3),sub(p,r0)));
const rotv=(q,v)=>rot(q.slice(3),v);
function rankAndSolve(F,n){return{F,n};}
function numJ(F,q){const r0=F(q),h=1e-7;const J=r0.map(()=>Array(q.length).fill(0));for(let j=0;j<q.length;j++){const qq=[...q];qq[j]+=h;const r=F(qq);for(let i=0;i<r.length;i++)J[i][j]=(r[i]-r0[i])/h;}return J;}
function solveLS(A,b){const m=A.length,n=A[0].length;const N=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>A.reduce((s,r)=>s+r[i]*r[j],0)));const g=Array.from({length:n},(_,i)=>A.reduce((s,r,k)=>s+r[i]*b[k],0));const M=N.map((r,i)=>[...r,g[i]]);for(let i=0;i<n;i++){let p=i;for(let r=i+1;r<n;r++)if(Math.abs(M[r][i])>Math.abs(M[p][i]))p=r;[M[i],M[p]]=[M[p],M[i]];for(let r=i+1;r<n;r++){const f=M[r][i]/M[i][i];for(let c=i;c<=n;c++)M[r][c]-=f*M[i][c];}}const x=Array(n);for(let i=n-1;i>=0;i--){x[i]=M[i][n];for(let c=i+1;c<n;c++)x[i]-=M[i][c]*x[c];x[i]/=M[i][i];}return x;}
function newton(F,q0){let q=[...q0],it=0;for(;it<40;it++){const r=F(q);const e=Math.max(...r.map(Math.abs));if(e<1e-11)break;const dq=solveLS(numJ(F,q),r.map(v=>-v));q=q.map((v,i)=>v+dq[i]);}return{q,it};}
function rank(A,tol=1e-6){const M=A.map(r=>[...r]);let rk=0;const n=M[0].length;for(let c=0;c<n&&rk<M.length;c++){let p=rk;for(let r=rk;r<M.length;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<tol)continue;[M[rk],M[p]]=[M[p],M[rk]];for(let r=rk+1;r<M.length;r++){const f=M[r][c]/M[rk][c];for(let k=c;k<n;k++)M[r][k]-=f*M[rk][k];}rk++;}return rk;}
const wheelMetrics=(q,r0,wc,side=1)=>{const s=rotv(q,[0,side,0]);const W=xf(q,r0,wc);const z=[0,0,1];const rad=unit(sub(z,mul(s,dot(z,s))));const cp=sub(W,mul(rad,W[2]/rad[2]));
  const camber=-Math.atan2(s[2],Math.hypot(s[0],s[1]))*180/Math.PI;const toeIn=Math.atan2(s[0],side*s[1])*180/Math.PI;return{camber,toeIn,W,cp};};
function sweep(name,build,wc,r0){const zs=[-80,-40,0,40,80];let q=[0,0,0,0,0,0];console.log('--',name);const out=[];for(const dz of zs){const F=build(wc[2]+dz/1000);const res=newton(F,[0,0,dz/1000,0,0,0]);const m=wheelMetrics(res.q,r0,wc);out.push({dz,cam:m.camber,toe:m.toeIn,y:m.cp[1]*1e3,x:m.W[0]*1e3,it:res.it});}
  out.forEach(o=>console.log(o.dz,'camber',o.cam.toFixed(3),'toeIn',o.toe.toFixed(3),'y_cp',o.y.toFixed(1),'x_wc',o.x.toFixed(1),'iters',o.it));
  const a=newton(build(wc[2]+1e-3),[0,0,1e-3,0,0,0]).q,b=newton(build(wc[2]-1e-3),[0,0,-1e-3,0,0,0]).q,ma=wheelMetrics(a,r0,wc),mb=wheelMetrics(b,r0,wc);
  const dy=(ma.cp[1]-mb.cp[1])/2e-3;console.log('camberGain deg/m',((ma.camber-mb.camber)/2e-3).toFixed(2),'toe deg/m',((ma.toeIn-mb.toeIn)/2e-3).toFixed(2),'dYcp/dz',dy.toFixed(4),'RC z_RC=y_cp*dY/dZ mm',(wc[1]*dy*1e3).toFixed(1));
}
const wc=[0,0.78,0.30],r0=wc;
const dist=(q,fix,mov,L)=>{const d=sub(xf(q,r0,mov),fix);return dot(d,d)-L*L;};
const D=(a,b)=>norm(sub(a,b));
// (1) 5-link with invented hardpoints on the upright
const fl=[{c:[0.25,0.30,0.20],u:[0.12,0.68,0.18]},{c:[-0.20,0.28,0.15],u:[-0.10,0.70,0.13]},{c:[0.10,0.40,0.48],u:[0.08,0.65,0.46]},{c:[-0.15,0.38,0.47],u:[-0.08,0.66,0.47]},{c:[-0.30,0.32,0.26],u:[-0.14,0.72,0.26]}].map(l=>({...l,L:D(l.c,l.u)}));
const fiveLink=zt=>q=>[...fl.map(l=>dist(q,l.c,l.u,l.L)),xf(q,r0,wc)[2]-zt];
sweep('five-link (6 pose, 5 distance, 1 driver)',fiveLink,wc,r0);
console.log('Jacobian rank at design',rank(numJ(fiveLink(0.30),[0,0,0,0,0,0])));
// (2) MacPherson: 2 LCA, 1 tie rod, 2 sliding-line, 1 driver
const lf=[0.20,0.30,0.16],lr=[-0.25,0.32,0.16],lbj=[0,0.72,0.14],top=[-0.03,0.58,0.80],clamp=[-0.012,0.655,0.45],tro=[0.13,0.70,0.22],rack=[0.13,0.32,0.20];
const axis=unit(sub(top,clamp));const e1=unit(cross(axis,[1,0,0])),e2=cross(axis,e1);
const mp=zt=>q=>{const C=xf(q,r0,clamp),a=rotv(q,axis),b1=rotv(q,e1),b2=rotv(q,e2),d=sub(top,C);return[dist(q,lf,lbj,D(lf,lbj)),dist(q,lr,lbj,D(lr,lbj)),dist(q,rack,tro,D(rack,tro)),dot(d,b1),dot(d,b2),xf(q,r0,wc)[2]-zt];};
sweep('MacPherson (6 pose: 2 LCA, 1 tie rod, 2 line-through-top-mount, 1 driver)',mp,wc,r0);
console.log('Jacobian rank at design',rank(numJ(mp(0.30),[0,0,0,0,0,0])));
// (3) Semi-trailing arm: axis revolute. closed form: rotation about fixed axis A->B
const A=[0.42,0.20,0.26],B=[0.30,0.60,0.26];const ax=unit(sub(B,A));
const stMetrics=(th)=>{const rp=(p)=>add(A,rot(mul(ax,th),sub(p,A)));const W=rp(wc),s=rot(mul(ax,th),[0,1,0]);const z=[0,0,1],rad=unit(sub(z,mul(s,dot(z,s))));const cp=sub(W,mul(rad,W[2]/rad[2]));return{W,cp,cam:-Math.atan2(s[2],Math.hypot(s[0],s[1]))*180/Math.PI,toe:Math.atan2(s[0],s[1])*180/Math.PI};};
{console.log('-- semi-trailing, plan angle',(Math.atan2(ax[0],ax[1])*180/Math.PI).toFixed(1),'deg between axis and Y');const h=1e-3,a=stMetrics(h),b=stMetrics(-h),dz=a.W[2]-b.W[2];const dc=(a.cam-b.cam)/dz,dt=(a.toe-b.toe)/dz,dy=(a.cp[1]-b.cp[1])/dz;console.log('camber deg/m',dc.toFixed(2),'toe deg/m',dt.toFixed(2),'dY/dz',dy.toFixed(4),'RC from dY',(wc[1]*dy*1e3).toFixed(1),'mm');
 // axis-plane IC
 const t=(wc[0]-A[0])/ax[0];const P=add(A,mul(ax,t));const tt=(0-wc[1])/(P[1]-wc[1]);console.log('axis meets x=x_wc at',P.map(v=>v.toFixed(3)).join(','),' RC via IC-CP line',((0+tt*(P[2]-0))*1e3).toFixed(1),'mm');}
// (4) Solid axle DOF count: pose 6; test 4 link+Panhard (5 links) vs 3 link + Panhard (4 links)
{const r=[0,0,0.30];const ax=q=>p=>xf(q,r,p);const parallel=[{c:[0.5,0.45,0.18],u:[0,0.45,0.18]},{c:[0.5,-0.45,0.18],u:[0,-0.45,0.18]},{c:[0.4,0.40,0.45],u:[0,0.40,0.45]},{c:[0.4,-0.40,0.45],u:[0,-0.40,0.45]},{c:[0,-0.55,0.40],u:[0,0.45,0.32]}];
 const threeLink=[parallel[0],parallel[1],{c:[0.4,0.0,0.48],u:[0,0.0,0.45]},parallel[4]];
 const tri=[{c:[0.5,0.45,0.18],u:[0,0.55,0.18]},{c:[0.5,-0.45,0.18],u:[0,-0.55,0.18]},{c:[0.4,0.15,0.48],u:[0,0.35,0.45]},{c:[0.4,-0.15,0.48],u:[0,-0.35,0.45]}];
 const mk=ls=>q=>ls.map(l=>{const d=sub(xf(q,r,l.u),l.c);return dot(d,d)-dot(sub(l.u,l.c),sub(l.u,l.c));});
 const q0=[0,0,0,0,0,0];for(const[n,ls]of [['parallel 4-link + Panhard',parallel],['3-link + Panhard',threeLink],['triangulated 4-link',tri]]){const J=numJ(mk(ls),q0);const rk=rank(J);console.log(n,'links',ls.length,'rank',rk,'DOF',6-rk);
  // try roll + heave motion: does it stay on constraints?
  const dq=[0,0,0.0,0.02,0,0];const before=mk(ls)(q0);const after=mk(ls)(dq);const J2=J.map(r=>dot(r,[0,0,0,1,0,0]));console.log('  J*roll',J2.map(v=>v.toFixed(4)).join(','));}
}
// (5) Twist beam analogy: RC as beam moves from pivot plane to axle plane
{const W=[0,0.75,0.30],B=[0.50,0.65,0.30];console.log('-- twist beam: roll axis bush->shear centre (x_s,0,z_s), z_s=0.30; pivot at x=0.5, wheel at x=0');for(const xs of [0.45,0.3,0.15,0.05,0.0]){const S=[xs,0,0.30];const ax=unit(sub(S,B));const t=(W[0]-B[0])/ax[0];const P=add(B,mul(ax,t));const tt=(0-W[1])/(P[1]-W[1]);const rc=tt*P[2];
  // roll camber relative to ground in pure roll: y-rotation component of the axis gives camber rate wrt arm roll
  console.log('x_s',xs,'axis hits wheel plane at y',P[1].toFixed(3),'z',P[2].toFixed(3),'RC mm',(rc*1e3).toFixed(0));}}
