// Illustrative, single-thread timing of a double-wishbone corner solve and a Pacejka-style tyre step.
// Unknowns: upper ball joint U, lower ball joint L, tie-rod outer T (9 scalars).
// Constraints: |L-LF|,|L-LR|,|U-UF|,|U-UR|,|T-TI| fixed; |U-L|,|T-L|,|T-U| fixed (upright rigid); L.z = target.
const LF=[.25,.20,.18],LR=[-.25,.20,.20],UF=[.15,.35,.45],UR=[-.15,.35,.46],TI=[.12,.22,.22];
const L0=[.0,.70,.15],U0=[-.01,.62,.50],T0=[.13,.68,.20];
const d=(a,i,b,j)=>{const x=a[i]-b[j],y=a[i+1]-b[j+1],z=a[i+2]-b[j+2];return x*x+y*y+z*z};
const pts=new Float64Array([...L0,...U0,...T0]);
const fix=[...LF,...LR,...UF,...UR,...TI].length&&new Float64Array([...LF,...LR,...UF,...UR,...TI]);
const r0=new Float64Array([d(pts,0,fix,0),d(pts,0,fix,3),d(pts,3,fix,6),d(pts,3,fix,9),d(pts,6,fix,12),d(pts,3,pts,0),d(pts,6,pts,0),d(pts,6,pts,3)]);
const J=new Float64Array(81),R=new Float64Array(9);
function solve(x,zT){
 let its=0;
 for(;its<20;its++){
  J.fill(0);
  const pairsF=[[0,0,0],[1,0,3],[2,3,6],[3,3,9],[4,6,12]];
  for(const [k,i,f] of pairsF){R[k]=d(x,i,fix,f)-r0[k];for(let c=0;c<3;c++)J[k*9+i+c]=2*(x[i+c]-fix[f+c]);}
  const pairsP=[[5,3,0],[6,6,0],[7,6,3]];
  for(const [k,i,j] of pairsP){R[k]=d(x,i,x,j)-r0[k];for(let c=0;c<3;c++){const v=2*(x[i+c]-x[j+c]);J[k*9+i+c]=v;J[k*9+j+c]=-v;}}
  R[8]=x[2]-zT;J[8*9+2]=1;
  let n=0;for(let k=0;k<9;k++)n+=R[k]*R[k];
  if(n<1e-20)break;
  // dense Gaussian elimination with partial pivoting
  for(let c=0;c<9;c++){let p=c,m=Math.abs(J[c*9+c]);for(let r=c+1;r<9;r++){const a=Math.abs(J[r*9+c]);if(a>m){m=a;p=r}}
   if(p!==c){for(let k=0;k<9;k++){const t=J[c*9+k];J[c*9+k]=J[p*9+k];J[p*9+k]=t}const t=R[c];R[c]=R[p];R[p]=t}
   for(let r=c+1;r<9;r++){const f=J[r*9+c]/J[c*9+c];if(f!==0){for(let k=c;k<9;k++)J[r*9+k]-=f*J[c*9+k];R[r]-=f*R[c]}}}
  for(let r=8;r>=0;r--){let s=R[r];for(let k=r+1;k<9;k++)s-=J[r*9+k]*R[k];R[r]=s/J[r*9+r]}
  for(let k=0;k<9;k++)x[k]-=R[k];
 }
 return its;
}
function mf(a,Fz,cam){const B=10,C=1.5,D=1.0*Fz*(1-.03*cam*cam),E=.3,Sv=.05*cam*Fz;const v=B*a;return D*Math.sin(C*Math.atan(v-E*(v-Math.atan(v))))+Sv}
const N=+process.argv[2]||200000;
function t(name,f,n,unit){const s=process.hrtime.bigint();const out=f(n);const e=Number(process.hrtime.bigint()-s);console.log(name.padEnd(46),(e/n/1000).toFixed(3).padStart(10),'us/op',' checksum',out.toFixed(3));return e/n}
let warm=new Float64Array(pts);
for(let round=0;round<3;round++){
 console.log('--- round',round);
 // warm-started: small step from previous solution, as in a 0.5 mm per-call motion
 t('NR 9x9 corner, warm start, 1 mm step',n=>{let s=0;for(let i=0;i<n;i++){const z=.15+.05*Math.sin(i*.02);s+=solve(warm,z)}return s/n},N);
 t('NR 9x9 corner, cold start, +50 mm target',n=>{let s=0;for(let i=0;i<n;i++){const x=new Float64Array(pts);s+=solve(x,.20)}return s/n},N/4);
 t('Magic-Formula-style lateral force eval',n=>{let s=0;for(let i=0;i<n;i++)s+=mf(.001*(i%200)-.1,4000,.01*(i%300)-1.5);return s/n},N*10);
 t('sweep 41 travel points on 1 corner',n=>{let s=0;for(let i=0;i<n;i++){const x=new Float64Array(pts);for(let k=0;k<41;k++)s+=solve(x,.15-.08+.004*k)}return s/n},N/100);
}
console.log('node',process.version,'platform',process.platform,process.arch);
