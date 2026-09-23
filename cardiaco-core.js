/* Nucleo del simulador cardiaco (segunda parte): lee volumenes NM reconstruidos (multiframe,
   con o sin intervalos cardiacos), los remuestrea en eje corto y ejes largos a partir del eje del
   ventriculo que marca el alumno, arma el mapa polar de 17 segmentos y mide la cavidad por umbral.
   Todo ocurre en el navegador; ningun dato sale de el. */
'use strict';
const CardiacoCore=(()=>{
 const text=(d,t)=>(d.string(t)||'').trim();
 const nums=(d,t)=>text(d,t).split('\\').map(Number);
 const seq=(d,t)=>(d.elements[t]?.items||[]).map(i=>i.dataSet);
 function fnv(bytes){let h=0x811c9dc5;for(let i=0;i<bytes.length;i++){h^=bytes[i];h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');}
 function vector(d,tag,n){if(!d.elements[tag])return null;const out=new Uint16Array(n);for(let i=0;i<n;i++)out[i]=d.uint16(tag,i)||0;return out;}
 /* Lee un volumen NM reconstruido. Devuelve {n, nz, slots, spacing, dz, data[slot] (Float32Array
    nz*n*n con z ascendente segun SliceVector), descripcion, frame, tipo, hash}. */
 async function leerVolumen(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let d;try{d=dicomParser.parseDicom(bytes);}catch(e){throw Error('No es un archivo DICOM legible.');}
  if(text(d,'x00080060')!=='NM')throw Error('No es una imagen de medicina nuclear.');
  const imageType=text(d,'x00080008').split('\\'),tipo=imageType[2]||'';
  if(!/RECON/.test(tipo))throw Error('No es un volumen reconstruido: es «'+tipo+'». Aquí van las OSEM exportadas de la primera parte.');
  const syntax=text(d,'x00020010'),p=d.elements.x7fe00010;
  if(!['1.2.840.10008.1.2','1.2.840.10008.1.2.1','1.2.840.10008.1.2.2'].includes(syntax)||!p||p.encapsulatedPixelData)throw Error('Se requieren píxeles sin compresión.');
  const rows=d.uint16('x00280010'),cols=d.uint16('x00280011'),frames=Number(text(d,'x00280008')||1),bits=d.uint16('x00280100'),signed=d.uint16('x00280103');
  if(rows!==cols||![8,16].includes(bits))throw Error('Se admite matriz cuadrada de 8 o 16 bits.');
  const n=cols,pp=n*n,count=pp*frames;if(p.length<count*bits/8)throw Error('Datos de píxeles incompletos.');
  const raw=new Uint8Array(d.byteArray.buffer,d.byteArray.byteOffset+p.dataOffset,p.length),v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),little=syntax!=='1.2.840.10008.1.2.2';
  const slots=d.uint16('x00540071')||1,sliceVec=vector(d,'x00540080',frames),slotVec=vector(d,'x00540070',frames);
  const nz=sliceVec?Math.max(...sliceVec):frames/slots;
  if(!Number.isInteger(nz)||nz*slots!==frames)throw Error(`El número de imágenes (${frames}) no cuadra con ${nz} cortes × ${slots} intervalos.`);
  const data=Array.from({length:slots},()=>new Float32Array(nz*pp));
  for(let f=0;f<frames;f++){const k=(sliceVec?sliceVec[f]:f%nz+1)-1,t=(slotVec?slotVec[f]:Math.floor(f/nz)+1)-1;const out=data[t],base=k*pp;for(let i=0;i<pp;i++){let q=bits===8?v.getUint8(f*pp+i):v.getUint16((f*pp+i)*2,little);if(signed&&q>=2**(bits-1))q-=2**bits;out[base+i]=q;}}
  const sp=nums(d,'x00280030'),dz=Number(text(d,'x00180088'))||Number(text(d,'x00180050'))||sp[0];
  const det=seq(d,'x00540022')[0],vista=det?text((seq(det,'x00540220')[0]||det),'x00080104'):'';
  // Posicion del primer corte (la raiz o el detector): permite alinear en Z el volumen gatillado,
  // que solo trae los cortes del corazon, con el volumen completo de la misma fase.
  const posicion=(text(d,'x00200032')?nums(d,'x00200032'):(det&&text(det,'x00200032')?nums(det,'x00200032'):null));
  // La derivacion (0008,2111) escrita por SPECT Lab 95 dice con que receta se reconstruyo.
  const derivacion=text(d,'x00082111'),rec=/iterations=(\d+);\s*subsets=(\d+)/.exec(derivacion),receta=rec?{iteraciones:Number(rec[1]),subconjuntos:Number(rec[2])}:null;
  return {nombre:file.name,bytes,hash:fnv(raw),n,nz,slots,spacing:sp[0],dz,data,posicion,derivacion,receta,descripcion:text(d,'x0008103e'),frame:text(d,'x00200052'),tipo,vista,fecha:text(d,'x00080020'),paciente:{nombre:text(d,'x00100010'),id:text(d,'x00100020'),edad:text(d,'x00101010'),sexo:text(d,'x00100040')}};
 }
 /* Muestreo trilineal en coordenadas de voxel (x,y,z), 0 fuera del volumen. */
 function muestra(vol,n,nz,x,y,z){
  if(x<0||y<0||z<0||x>n-1||y>n-1||z>nz-1)return 0;
  const x0=Math.min(n-2,Math.floor(x)),y0=Math.min(n-2,Math.floor(y)),z0=Math.min(nz-2,Math.floor(z)),fx=x-x0,fy=y-y0,fz=z-z0,pp=n*n;
  if(nz===1)return bilineal(vol,n,x,y);
  const at=(i,j,k)=>vol[k*pp+j*n+i];
  const c00=at(x0,y0,z0)*(1-fx)+at(x0+1,y0,z0)*fx,c10=at(x0,y0+1,z0)*(1-fx)+at(x0+1,y0+1,z0)*fx,c01=at(x0,y0,z0+1)*(1-fx)+at(x0+1,y0,z0+1)*fx,c11=at(x0,y0+1,z0+1)*(1-fx)+at(x0+1,y0+1,z0+1)*fx;
  return (c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz;
 }
 function bilineal(img,n,x,y){const x0=Math.min(n-2,Math.floor(x)),y0=Math.min(n-2,Math.floor(y)),fx=x-x0,fy=y-y0;return (img[y0*n+x0]*(1-fx)+img[y0*n+x0+1]*fx)*(1-fy)+(img[(y0+1)*n+x0]*(1-fx)+img[(y0+1)*n+x0+1]*fx)*fy;}
 /* Marco del ventriculo a partir de los angulos (grados). azimut: en el plano transaxial, desde
    anterior hacia la izquierda del paciente. elevacion: cuanto baja el apex respecto al plano
    transaxial. Devuelve vectores unitarios en coordenadas del volumen (x izquierda, y posterior,
    z superior): a hacia el apex, u hacia la pared lateral (derecha de la imagen de eje corto),
    v hacia la pared inferior (abajo de la imagen). */
 function marco(azimut,elevacion){
  const az=azimut*Math.PI/180,el=elevacion*Math.PI/180;
  const a=[Math.sin(az)*Math.cos(el),-Math.cos(az)*Math.cos(el),-Math.sin(el)];
  const inf=[0,0,-1],dot=inf[0]*a[0]+inf[1]*a[1]+inf[2]*a[2];let v=[inf[0]-dot*a[0],inf[1]-dot*a[1],inf[2]-dot*a[2]];const lv=Math.hypot(...v)||1;v=v.map(q=>q/lv);
  const u=[a[1]*v[2]-a[2]*v[1],a[2]*v[0]-a[0]*v[2],a[0]*v[1]-a[1]*v[0]];
  return {a,u,v};
 }
 /* Angulos a partir de una direccion (base -> apex) en coordenadas de voxel. */
 function angulosDe(dx,dy,dz){const az=Math.atan2(dx,-dy)*180/Math.PI,h=Math.hypot(dx,dy);const el=Math.atan2(-dz,h)*180/Math.PI;return {azimut:az,elevacion:el};}
 /* Corte oblicuo de m x m pixeles con paso `paso` (en voxeles) sobre un plano centrado en C
    (voxel) y desplazado t voxeles a lo largo de `normal`; `derecha` y `abajo` son los ejes de la
    imagen. Devuelve Float32Array m*m. */
 function corte(vol,n,nz,C,derecha,abajo,normal,t,m,paso){
  const out=new Float32Array(m*m),h=(m-1)/2;
  for(let j=0;j<m;j++)for(let i=0;i<m;i++){const di=(i-h)*paso,dj=(j-h)*paso;
   out[j*m+i]=muestra(vol,n,nz,C[0]+derecha[0]*di+abajo[0]*dj+normal[0]*t,C[1]+derecha[1]*di+abajo[1]*dj+normal[1]*t,C[2]+derecha[2]*di+abajo[2]*dj+normal[2]*t);}
  return out;
 }
 /* Los tres tipos de corte, con las convenciones de despliegue habituales. */
 function ejeCorto(vol,n,nz,C,M,t,m,paso){return corte(vol,n,nz,C,M.u,M.v,M.a,t,m,paso);}
 function ejeLargoVertical(vol,n,nz,C,M,t,m,paso){return corte(vol,n,nz,C,M.a.map(q=>-q),M.v,M.u,t,m,paso);}
 function ejeLargoHorizontal(vol,n,nz,C,M,t,m,paso){return corte(vol,n,nz,C,M.u,M.a.map(q=>-q),M.v,t,m,paso);}
 /* Mapa polar: muestreo del maximo radial por corte de eje corto entre apex (tApex) y base
    (tBase), en `anillos` anillos y `angulos` sectores. Devuelve {valores (anillos*angulos), max}.
    El radio de busqueda va de 0 a radioMm. */
 function mapaPolar(vol,n,nz,C,M,tApex,tBase,spacing,op={}){
  const anillos=op.anillos||24,angulos=op.angulos||72,radioVox=(op.radioMm||45)/spacing,pasoR=.5;
  const val=new Float32Array(anillos*angulos);let max=0;
  for(let k=0;k<anillos;k++){const t=tApex+(tBase-tApex)*(k+.5)/anillos;
   for(let q=0;q<angulos;q++){const fi=(q/angulos)*2*Math.PI,dx=M.u[0]*Math.cos(fi)+M.v[0]*Math.sin(fi),dy=M.u[1]*Math.cos(fi)+M.v[1]*Math.sin(fi),dz=M.u[2]*Math.cos(fi)+M.v[2]*Math.sin(fi);
    let mx=0;const rMin=k===0?0:2/spacing;for(let r=rMin;r<=radioVox;r+=pasoR){const x=C[0]+M.a[0]*t+dx*r,y=C[1]+M.a[1]*t+dy*r,z=C[2]+M.a[2]*t+dz*r;const s=muestra(vol,n,nz,x,y,z);if(s>mx)mx=s;}
    val[k*angulos+q]=mx;if(mx>max)max=mx;}}
  return {valores:val,anillos,angulos,max};
 }
 /* Busca el ventriculo izquierdo: el punto donde el eje corto (con el marco dado) muestra un
    anillo cerrado con centro oscuro. Puntua cada candidato por el sector mas debil del anillo
    (radio 11 a 21 mm) menos el centro, en una rejilla de 2 voxeles sobre la mitad anterior
    izquierda del campo. Luego recorre el eje para medir el largo. Devuelve {C, L, puntaje}. */
 function buscarVentriculo(vol,n,nz,M,spacing){
  const c=n>>1;
  // Dos tamanos de anillo: corazon normal (radio 11 a 21 mm) y dilatado (24 a 44 mm). El
  // puntaje (sector mas debil del anillo menos el centro) es comparable entre ambos.
  const anillos=[[11,21,7,1.5],[24,44,14,4]].map(([a,b,R,rIn])=>{const r0=a/spacing,r1=b/spacing,pts=[];for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){const r=Math.hypot(i,j);if(r<=rIn)pts.push([i,j,-1]);else if(r>=r0&&r<=r1)pts.push([i,j,Math.floor(((Math.atan2(j,i)+Math.PI)/(2*Math.PI))*8)%8]);}return pts;});
  const puntajeCon=(pts,x,y,z)=>{const sec=new Float64Array(8),cnt=new Float64Array(8);let cen=0,ncen=0;
   for(const [i,j,s] of pts){const v=muestra(vol,n,nz,x+M.u[0]*i+M.v[0]*j,y+M.u[1]*i+M.v[1]*j,z+M.u[2]*i+M.v[2]*j);if(s<0){cen+=v;ncen++;}else{sec[s]+=v;cnt[s]++;}}
   // Sector mas debil menos el centro, castigando anillos desparejos (el borde del higado forma
   // "anillos" con un lado muy brillante y otro vacio; el ventriculo es parejo).
   let min=Infinity,max=0;for(let s=0;s<8;s++){const q=cnt[s]?sec[s]/cnt[s]:0;min=Math.min(min,q);max=Math.max(max,q);}return min-(ncen?cen/ncen:0)-.5*(max-min);};
  let mejor={p:-Infinity},pts=anillos[0];
  for(const cand of anillos)for(let z=2;z<nz-2;z+=2)for(let y=c-26;y<=c+14;y+=2)for(let x=c-10;x<=c+30;x+=2){const p=puntajeCon(cand,x,y,z);if(p>mejor.p){mejor={p,x,y,z};pts=cand;}}
  if(!(mejor.p>0))return null;
  const puntaje=(x,y,z)=>puntajeCon(pts,x,y,z);
  // Refina a 1 voxel y recorre el eje para encontrar apex y base.
  for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const p=puntaje(mejor.x+dx,mejor.y+dy,mejor.z+dz);if(p>mejor.p)mejor={p,x:mejor.x+dx,y:mejor.y+dy,z:mejor.z+dz};}
  const perfil=t=>puntaje(mejor.x+M.a[0]*t,mejor.y+M.a[1]*t,mejor.z+M.a[2]*t);
  let tA=0,tB=0;while(tA<25&&perfil(tA+1)>.25*mejor.p)tA++;while(tB>-25&&perfil(tB-1)>.25*mejor.p)tB--;
  // El apex cierra el anillo unos voxeles mas alla del ultimo anillo y el plano valvular queda
  // un poco mas alla de donde el anillo se abre.
  tA+=3;tB-=2;const mid=(tA+tB)/2;
  return {C:[mejor.x+M.a[0]*mid,mejor.y+M.a[1]*mid,mejor.z+M.a[2]*mid],L:tA-tB,puntaje:mejor.p};
 }
 /* Segmento (1..17) de un punto del mapa polar: rho en [0,1] desde el apex, fi en radianes con
    0 a la derecha (lateral) y -pi/2 arriba (anterior), como en la imagen de eje corto. */
 function segmento17(rho,fi){
  const g=((fi*180/Math.PI)%360+360)%360; // 0 lateral, 90 inferior, 180 septal, 270 anterior
  if(rho<.25)return 17;
  if(rho<.5){if(g>=225&&g<315)return 13;if(g>=135&&g<225)return 14;if(g>=45&&g<135)return 15;return 16;}
  const base=rho<.75?7:1;
  // 6 sectores de 60 grados: anterior centrado en 270.
  const s=Math.floor(((g-240+360)%360)/60); // 0: anterior(240..300) 1: anterolateral(300..360) 2: inferolateral(0..60) 3: inferior(60..120) 4: inferoseptal(120..180) 5: anteroseptal(180..240)
  return base+[0,5,4,3,2,1][s];
 }
 const NOMBRE_SEGMENTO={1:'basal anterior',2:'basal anteroseptal',3:'basal inferoseptal',4:'basal inferior',5:'basal inferolateral',6:'basal anterolateral',7:'medio anterior',8:'medio anteroseptal',9:'medio inferoseptal',10:'medio inferior',11:'medio inferolateral',12:'medio anterolateral',13:'apical anterior',14:'apical septal',15:'apical inferior',16:'apical lateral',17:'ápex'};
 const TERRITORIO={1:'DA',2:'DA',3:'CD',4:'CD',5:'CX',6:'CX',7:'DA',8:'DA',9:'CD',10:'CD',11:'CX',12:'CX',13:'DA',14:'DA',15:'CD',16:'CX',17:'DA'};
 /* Dibuja el mapa polar en un canvas cuadrado y devuelve estadisticas por segmento y extension
    bajo el umbral (fraccion del maximo). */
 function dibujarPolar(canvas,mapa,op={}){
  const S=canvas.width,c=S/2,R=S/2-2,ctx=canvas.getContext('2d'),id=ctx.createImageData(S,S),px=id.data;
  const max=op.max||mapa.max||1,umbral=op.umbral??0,pal=op.paleta||hot,seg=Array.from({length:18},()=>({suma:0,n:0}));let bajo=0,total=0;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const dx=x-c,dy=y-c,rho=Math.hypot(dx,dy)/R,i=(y*S+x)*4;
   if(rho>1){px[i+3]=0;continue;}
   const fi=Math.atan2(dy,dx),k=Math.min(mapa.anillos-1,Math.floor(rho*mapa.anillos)),q=((Math.round(fi/(2*Math.PI)*mapa.angulos)%mapa.angulos)+mapa.angulos)%mapa.angulos;
   const v=mapa.valores[k*mapa.angulos+q]/max,s=segmento17(rho,fi);seg[s].suma+=v;seg[s].n++;total++;if(v<umbral)bajo++;
   const col=op.diferencia?diverge(v):pal(Math.max(0,Math.min(1,v)));px[i]=col[0];px[i+1]=col[1];px[i+2]=col[2];px[i+3]=255;
   if(umbral&&v<umbral&&op.marcarDefecto){px[i]=Math.round(px[i]*.35+120);px[i+1]=Math.round(px[i+1]*.35);px[i+2]=Math.round(px[i+2]*.35+120);}
  }
  ctx.putImageData(id,0,0);
  // Rejilla de 17 segmentos.
  ctx.save();ctx.strokeStyle=op.rejilla||'#fff';ctx.lineWidth=1;for(const r of [.25,.5,.75,1]){ctx.beginPath();ctx.arc(c,c,R*r,0,2*Math.PI);ctx.stroke();}
  for(let k=0;k<6;k++){const g=(240+60*k)*Math.PI/180;ctx.beginPath();ctx.moveTo(c+Math.cos(g)*R*.5,c+Math.sin(g)*R*.5);ctx.lineTo(c+Math.cos(g)*R,c+Math.sin(g)*R);ctx.stroke();}
  for(let k=0;k<4;k++){const g=(45+90*k)*Math.PI/180;ctx.beginPath();ctx.moveTo(c+Math.cos(g)*R*.25,c+Math.sin(g)*R*.25);ctx.lineTo(c+Math.cos(g)*R*.5,c+Math.sin(g)*R*.5);ctx.stroke();}
  ctx.restore();
  const porSegmento={};for(let s=1;s<=17;s++)porSegmento[s]=seg[s].n?Math.round(100*seg[s].suma/seg[s].n):null;
  if(op.numeros){ctx.save();ctx.font='bold '+Math.round(S/22)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=3;
   const pos=s=>{if(s===17)return [c,c];const ring=s>=13?.375:s>=7?.625:.875;const ang=s>=13?[270,180,90,0][s-13]:[270,210,150,90,30,330][(s-1)%6];const g=ang*Math.PI/180;return [c+Math.cos(g)*R*ring,c+Math.sin(g)*R*ring];};
   for(let s=1;s<=17;s++){if(porSegmento[s]===null)continue;const [x,y]=pos(s),tx=op.diferencia?String(porSegmento[s]-100):String(porSegmento[s]);ctx.strokeText(tx,x,y);ctx.fillText(tx,x,y);}ctx.restore();}
  return {porSegmento,extension:total?100*bajo/total:0};
 }
 /* Cavidad por umbral en una pila de eje corto: pixeles con valor < umbral*maximo del corte,
    conectados al centro, dentro de radioMax. Devuelve volumen en mL y mascaras. */
 function cavidad(pila,m,spacing,umbral,radioMaxMm){
  const rmax=radioMaxMm/spacing,c=(m-1)/2;let vox=0;const mascaras=[];
  for(const img of pila){let max=0;for(let i=0;i<img.length;i++)if(img[i]>max)max=img[i];const th=umbral*max,mk=new Uint8Array(m*m);
   const ci=Math.round(c),start=ci*m+ci;if(img[start]>=th){mascaras.push(mk);continue;}
   const cola=[start];mk[start]=1;while(cola.length){const i=cola.pop(),x=i%m,y=(i-x)/m;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=m||ny>=m)continue;if(Math.hypot(nx-c,ny-c)>rmax)continue;const j=ny*m+nx;if(!mk[j]&&img[j]<th){mk[j]=1;cola.push(j);}}}
   let s=0;for(let i=0;i<mk.length;i++)s+=mk[i];vox+=s;mascaras.push(mk);}
  return {mL:vox*Math.pow(spacing,3)/1000,voxeles:vox,mascaras};
 }
 /* Paletas. */
 const hot=v=>[Math.min(255,v*3*255),Math.max(0,Math.min(255,(v*3-1)*255)),Math.max(0,Math.min(255,(v*3-2)*255))];
 const gris=v=>[v*255,v*255,v*255];
 const grisInv=v=>[(1-v)*255,(1-v)*255,(1-v)*255];
 // Paleta "cardiaca" tipo Cedars: negro-azul-morado-rojo-naranja-blanco.
 const cardiaca=v=>{const stops=[[0,0,0],[30,0,120],[120,0,200],[230,60,60],[255,150,30],[255,240,180],[255,255,255]];const p=Math.max(0,Math.min(1,v))*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p)),f=p-i;return [0,1,2].map(k=>stops[i][k]*(1-f)+stops[i+1][k]*f);};
 const diverge=v=>{const d=Math.max(-1,Math.min(1,v-1));return d<0?[255*(1+d),255*(1+d),255]:[255,255*(1-d),255*(1-d)];};
 const PALETAS={hot,gris,grisInv,cardiaca};
 /* Pinta una imagen m x m en un canvas escalado (ancho w) con techo relativo. */
 function pintar(canvas,img,m,op={}){
  const max=op.max||maximo(img)||1,pal=PALETAS[op.paleta]||cardiaca,techo=(op.techo??1)*max,piso=(op.piso??0)*max;
  const base=document.createElement('canvas');base.width=m;base.height=m;const ctx=base.getContext('2d'),id=ctx.createImageData(m,m);
  for(let i=0;i<m*m;i++){const v=Math.max(0,Math.min(1,(img[i]-piso)/(techo-piso||1)));const c=pal(v);id.data[i*4]=c[0];id.data[i*4+1]=c[1];id.data[i*4+2]=c[2];id.data[i*4+3]=255;}
  ctx.putImageData(id,0,0);const out=canvas.getContext('2d');out.imageSmoothingEnabled=!!op.suave;out.drawImage(base,0,0,canvas.width,canvas.height);return canvas;
 }
 function maximo(img){let mx=0;for(let i=0;i<img.length;i++)if(img[i]>mx)mx=img[i];return mx;}
 function percentil(img,pct){const a=[];for(let i=0;i<img.length;i+=3)if(img[i]>0)a.push(img[i]);a.sort((x,y)=>x-y);return a[Math.floor(a.length*pct)]||maximo(img);}
 function lienzo(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function descargar(blob,nombre){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);}
 function canvasABlob(c){return new Promise(r=>c.toBlob(r,'image/png'));}
 function fmt(n,dec=1){return Number.isFinite(n)?n.toLocaleString('es-CL',{minimumFractionDigits:dec,maximumFractionDigits:dec}):'—';}
 return {leerVolumen,muestra,marco,angulosDe,corte,ejeCorto,ejeLargoVertical,ejeLargoHorizontal,mapaPolar,buscarVentriculo,segmento17,dibujarPolar,cavidad,NOMBRE_SEGMENTO,TERRITORIO,PALETAS,pintar,maximo,percentil,lienzo,descargar,canvasABlob,fmt,fnv};
})();
