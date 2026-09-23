/* Simulador cardiaco, segunda parte: carga de las OSEM exportadas en SPECT Lab 95, reorientacion
   al eje del ventriculo, pagina de cortes, mapa polar de 17 segmentos, cine gatillado con volumenes
   por umbral, exportacion PNG y cierre contra el informe. Todo local, en el navegador. */
'use strict';
(()=>{
const $=id=>document.getElementById(id),C=CardiacoCore;
const M=56; // lado (en voxeles) de los cortes oblicuos: 56 x 3.3 mm = 185 mm
const S={caso:null,vols:[],ignorados:[],seleccion:null,paleta:'cardiaca',techo:1,infoVista:new Set(),
 ejes:{estres:nuevoEje(),reposo:nuevoEje()},ejeFase:'estres',ejeVolumenHash:null,axialZ:null,
 cortesTipo:'AC',cortesN:12,cortesNL:6,margenMm:6,normalizar:true,
 polarTipo:'AC',polarUmbral:.5,polarNumeros:true,polar:{},
 gatedFase:'estres',gatedT:1,gatedUmbral:.55,gated:{estres:{ED:null,ES:null,vol:[]},reposo:{ED:null,ES:null,vol:[]}},
 exportados:{cortes:false,polar:false,gated:false},paso:0};
function nuevoEje(){return {az:null,el:null,C:null,L:null,axial:[],vla:[]};}
let tutorial=null,cineTimer=null;
const paginas={cortes:null,polar:null,gated:null};
function estado(msg){$('status').textContent=msg;}
/* ---------- volumenes ---------- */
function reconocer(v){
 const n=S.caso;
 for(const caso of (n?[n]:Object.keys(CARDIACO_CASOS).map(Number)))for(const f of CARDIACO_FASES)for(const t of ['gatillado','AC','NoAC'])if(cardiacoReconoceNombre(v.descripcion,caso,f,t))return {caso,fase:f,tipo:t};
 if(/short axis|eje corto/i.test(v.vista+' '+v.descripcion)&&!/caso/i.test(v.descripcion))return {caso:n,fase:/rest|reposo/i.test(v.descripcion)?'reposo':'estres',tipo:'referencia'};
 return null;
}
function vol(fase,tipo){return S.vols.find(v=>v.rec&&v.rec.tipo===tipo&&v.rec.fase===fase&&(S.caso===null||v.rec.caso===S.caso))||null;}
function tieneCT(){return S.caso&&Object.values(CARDIACO_CASOS[S.caso].fases).some(f=>Object.keys(f.ct||{}).length);}
function tipoDisponible(fase,pref){return vol(fase,pref)?pref:(vol(fase,pref==='AC'?'NoAC':'AC')?(pref==='AC'?'NoAC':'AC'):null);}
function volGuia(fase){const t=tipoDisponible(fase,'AC');return t?vol(fase,t):null;}
async function cargar(files){
 let nuevos=0;
 for(const f of files){
  if(/\.(png|pdf|txt|zip|docx?|json)$/i.test(f.name)){S.ignorados.push(f.name+' (no es DICOM)');continue;}
  try{const v=await C.leerVolumen(f);if(S.vols.some(x=>x.hash===v.hash)){S.ignorados.push(f.name+' (copia repetida)');continue;}
   v.rec=reconocer(v);S.vols.push(v);nuevos++;
  }catch(e){S.ignorados.push(f.name+' ('+e.message+')');}
 }
 if(S.caso===null){const r=S.vols.find(v=>v.rec&&v.rec.caso);if(r&&tutorial)tutorial.setCaso(r.rec.caso);}
 for(const v of S.vols)if(!v.rec||(v.rec.tipo==='referencia'&&!v.rec.caso))v.rec=reconocer(v);
 estado(nuevos?nuevos+' volumen(es) cargado(s).':'No se cargó ningún volumen nuevo.');
 refrescar();
}
function requeridos(){const r=[];for(const f of CARDIACO_FASES){r.push([f,'NoAC']);if(S.caso&&Object.keys(CARDIACO_CASOS[S.caso].fases[f].ct||{}).length)r.push([f,'AC']);r.push([f,'gatillado']);}return r;}
function faltantes(){return requeridos().filter(([f,t])=>!vol(f,t));}
function problemasCarga(){
 const p=[];
 for(const v of S.vols){if(!v.rec)p.push('«'+v.nombre+'» no se reconoce: su descripción es «'+v.descripcion+'». Los volúmenes de la primera parte llevan «Caso N fase tipo» en la descripción; si lo exportaste sin nombre, vuelve a exportarlo.');
  else if(S.caso!==null&&v.rec.caso!==S.caso)p.push('«'+v.nombre+'» es del caso '+v.rec.caso+', no del caso '+S.caso+'.');}
 const f=faltantes();if(S.vols.length&&f.length)p.push('Falta: '+f.map(([fase,t])=>CARDIACO_NOMBRE_FASE[fase]+' '+t).join('; ')+'.');
 return p;
}
function listar(){
 const ul=$('listaArchivos');ul.replaceChildren();
 for(const v of S.vols){const li=document.createElement('li');li.className=v.rec&&(S.caso===null||v.rec.caso===S.caso)?'ok':'problema';
  li.append(Object.assign(document.createElement('strong'),{textContent:v.nombre}));li.append(Object.assign(document.createElement('span'),{textContent:v.tipo+' · '+v.n+'×'+v.n+' · '+v.nz+' cortes'+(v.slots>1?' × '+v.slots+' intervalos':'')}));
  const est=document.createElement('span');est.className='estado';est.textContent=v.rec?(v.rec.tipo==='referencia'?'referencia del equipo · '+CARDIACO_NOMBRE_FASE[v.rec.fase]:'Caso '+v.rec.caso+' · '+CARDIACO_NOMBRE_FASE[v.rec.fase]+' · '+v.rec.tipo):'no reconocido';li.append(est);
  li.tabIndex=0;li.onclick=()=>{S.seleccion=v;if(v.rec)S.infoVista.add(v.rec.fase+v.rec.tipo);refrescar();};if(S.seleccion===v)li.style.outline='2px solid #000080';ul.append(li);}
 const info=[];if(S.vols.length)info.push(S.vols.length+' volumen(es).');if(S.ignorados.length)info.push('Omitidos: '+S.ignorados.join('; ')+'.');$('cargaInfo').textContent=info.join(' ')||'Aún no hay archivos.';
 $('infoVolumen').hidden=!S.seleccion;if(S.seleccion)tablaInfo(S.seleccion);
 const t=$('tablaVolumenes');t.replaceChildren();for(const [f,tipo] of requeridos()){const tr=document.createElement('tr'),a=document.createElement('td'),b=document.createElement('td');a.textContent=CARDIACO_NOMBRE_FASE[f]+' · '+tipo;const v=vol(f,tipo);b.textContent=v?'✔ '+v.nz+' cortes':'falta';b.className=v?'ok':'falta';tr.append(a,b);t.append(tr);}
}
function tablaInfo(v){
 const filas=[['Descripción de la serie',v.descripcion],['Tipo',v.tipo],['Matriz',v.n+' × '+v.n+' × '+v.nz+' cortes'+(v.slots>1?' × '+v.slots+' intervalos':'')],['Vóxel',C.fmt(v.spacing,2)+' × '+C.fmt(v.spacing,2)+' × '+C.fmt(v.dz,2)+' mm'],['Fecha del estudio',v.fecha.replace(/(\d{4})(\d{2})(\d{2})/,'$3-$2-$1')],['Paciente',v.paciente.nombre+(v.paciente.edad?' · '+v.paciente.edad:'')+(v.paciente.sexo?' · '+v.paciente.sexo:'')],['Reconocido como',v.rec?(v.rec.tipo==='referencia'?'eje corto del equipo':'Caso '+v.rec.caso+' · '+CARDIACO_NOMBRE_FASE[v.rec.fase]+' · '+v.rec.tipo+' ('+CARDIACO_TIPOS[v.rec.tipo]+')'):'no reconocido']];
 const t=document.createElement('table');t.className='tabla';filas.forEach(([k,x])=>{const tr=document.createElement('tr');const a=document.createElement('td');a.textContent=k;const b=document.createElement('td');b.style.textAlign='left';b.textContent=x;tr.append(a,b);t.append(tr);});$('infoTabla').replaceChildren(t);
}
/* ---------- eje ---------- */
function ejeActual(){return S.ejes[S.ejeFase];}
function volumenEje(){const f=S.ejeFase;const v=S.vols.find(x=>x.hash===S.ejeVolumenHash&&x.rec&&x.rec.fase===f&&x.rec.tipo!=='gatillado'&&x.rec.tipo!=='referencia');return v||volGuia(f);}
function marcoDe(eje){return C.marco(eje.az,eje.el);}
function zInicial(v){let mejor=0,mz=Math.floor(v.nz/2);const n=v.n,c=n>>1,r=24,d=v.data[0];for(let z=0;z<v.nz;z++){let mx=0;for(let y=c-r;y<c+r;y++)for(let x=c-r;x<c+r;x++)mx=Math.max(mx,d[z*n*n+y*n+x]);if(mx>mejor){mejor=mx;mz=z;}}return mz;}
function dibujarAxial(){
 const v=volumenEje(),cv=$('axial');const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);if(!v)return;
 if(S.axialZ===null)S.axialZ=zInicial(v);$('axialZ').max=v.nz-1;$('axialZ').value=S.axialZ;
 const n=v.n,img=v.data[0].subarray(S.axialZ*n*n,(S.axialZ+1)*n*n);C.pintar(cv,img,n,{paleta:S.paleta,techo:S.techo,max:C.percentil(v.data[0],.999)});
 $('axialInfo').textContent='corte '+(S.axialZ+1)+'/'+v.nz+' · '+v.rec.tipo;
 const e=ejeActual(),k=cv.width/n;ctx.save();ctx.strokeStyle='#0f0';ctx.fillStyle='#0f0';ctx.lineWidth=2;
 e.axial.forEach((p,i)=>{ctx.beginPath();ctx.arc((p[0]+.5)*k,(p[1]+.5)*k,5,0,2*Math.PI);ctx.stroke();ctx.font='14px Arial';ctx.fillText(i?'ápex':'base',(p[0]+.5)*k+8,(p[1]+.5)*k-8);});
 if(e.axial.length===2){ctx.beginPath();ctx.moveTo((e.axial[0][0]+.5)*k,(e.axial[0][1]+.5)*k);ctx.lineTo((e.axial[1][0]+.5)*k,(e.axial[1][1]+.5)*k);ctx.stroke();}
 ctx.restore();
}
function vlaPlano(){const e=ejeActual();if(e.az===null||!e.C)return null;const M0=C.marco(e.az,0);return {derecha:M0.a.map(q=>-q),abajo:[0,0,-1],normal:M0.u,C:e.C};}
function dibujarVlaMarca(){
 const v=volumenEje(),cv=$('vlaMarca'),ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);const pl=vlaPlano();if(!v||!pl)return;
 const img=C.corte(v.data[0],v.n,v.nz,pl.C,pl.derecha,pl.abajo,pl.normal,0,M,1);C.pintar(cv,img,M,{paleta:S.paleta,techo:S.techo,max:C.percentil(v.data[0],.999)});
 const e=ejeActual(),k=cv.width/M;ctx.save();ctx.strokeStyle='#0f0';ctx.fillStyle='#0f0';ctx.lineWidth=2;
 e.vla.forEach((p,i)=>{ctx.beginPath();ctx.arc((p[0]+.5)*k,(p[1]+.5)*k,5,0,2*Math.PI);ctx.stroke();ctx.font='14px Arial';ctx.fillText(i?'ápex':'base',(p[0]+.5)*k+8,(p[1]+.5)*k-8);});
 if(e.vla.length===2){ctx.beginPath();ctx.moveTo((e.vla[0][0]+.5)*k,(e.vla[0][1]+.5)*k);ctx.lineTo((e.vla[1][0]+.5)*k,(e.vla[1][1]+.5)*k);ctx.stroke();}
 ctx.restore();
}
function dibujarPrevio(){
 const v=volumenEje(),e=ejeActual();for(const id of ['prevSax','prevVla','prevHla'])$(id).getContext('2d').clearRect(0,0,192,192);
 if(!v||e.az===null||e.el===null||!e.C)return;const Mk=marcoDe(e),max=C.percentil(v.data[0],.999);
 C.pintar($('prevSax'),C.ejeCorto(v.data[0],v.n,v.nz,e.C,Mk,0,M,1),M,{paleta:S.paleta,techo:S.techo,max});
 C.pintar($('prevVla'),C.ejeLargoVertical(v.data[0],v.n,v.nz,e.C,Mk,0,M,1),M,{paleta:S.paleta,techo:S.techo,max});
 C.pintar($('prevHla'),C.ejeLargoHorizontal(v.data[0],v.n,v.nz,e.C,Mk,0,M,1),M,{paleta:S.paleta,techo:S.techo,max});
}
function clicAxial(ev){
 const v=volumenEje();if(!v)return;const cv=$('axial'),r=cv.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width*v.n-.5,y=(ev.clientY-r.top)/r.height*v.n-.5,e=ejeActual();
 if(e.axial.length>=2)e.axial=[];e.axial.push([x,y,S.axialZ]);
 if(e.axial.length===2){const [b,a]=e.axial;const ang=C.angulosDe(a[0]-b[0],a[1]-b[1],0);e.az=+ang.azimut.toFixed(1);if(e.el===null)e.el=10;e.C=[(a[0]+b[0])/2,(a[1]+b[1])/2,S.axialZ];e.L=Math.hypot(a[0]-b[0],a[1]-b[1]);e.vla=[];estado('Azimut '+e.az+'°. Ahora marca base y ápex en el eje largo vertical.');}
 else estado('Base marcada. Ahora haz clic en el ápex.');
 invalidar();refrescar();
}
function clicVla(ev){
 const v=volumenEje(),pl=vlaPlano();if(!v||!pl)return;const cv=$('vlaMarca'),r=cv.getBoundingClientRect(),i=(ev.clientX-r.left)/r.width*M-.5,j=(ev.clientY-r.top)/r.height*M-.5,e=ejeActual();
 if(e.vla.length>=2)e.vla=[];e.vla.push([i,j]);
 if(e.vla.length===2){const h=(M-1)/2,[b,a]=e.vla;const dR=a[0]-b[0],dD=a[1]-b[1];e.el=+(Math.atan2(dD,-dR)*180/Math.PI).toFixed(1);
  const p3=p=>[pl.C[0]+pl.derecha[0]*(p[0]-h)+pl.abajo[0]*(p[1]-h),pl.C[1]+pl.derecha[1]*(p[0]-h)+pl.abajo[1]*(p[1]-h),pl.C[2]+pl.derecha[2]*(p[0]-h)+pl.abajo[2]*(p[1]-h)];const A=p3(a),B=p3(b);
  e.C=[(A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2];e.L=Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2]);
  // Ajusta el azimut con la direccion 3D definitiva (por si el ápex no estaba en el corte).
  const ang=C.angulosDe(A[0]-B[0],A[1]-B[1],A[2]-B[2]);e.az=+ang.azimut.toFixed(1);e.el=+ang.elevacion.toFixed(1);
  estado('Eje definido: azimut '+e.az+'°, elevación '+e.el+'°, largo '+C.fmt(e.L*v.spacing,0)+' mm.');}
 else estado('Base marcada en el eje largo vertical. Ahora el ápex.');
 invalidar();refrescar();
}
function ejeDefinido(f){const e=S.ejes[f];return e.az!==null&&e.el!==null&&!!e.C&&!!e.L;}
function problemasEje(f){
 const p=[],e=S.ejes[f];if(!volGuia(f))return ['Falta el volumen de la fase '+CARDIACO_NOMBRE_FASE[f]+'.'];
 if(!ejeDefinido(f)){p.push(e.axial.length<2?'Falta marcar base y ápex en la transaxial de '+CARDIACO_NOMBRE_FASE[f]+'.':'Falta marcar base y ápex en el eje largo vertical.');return p;}
 const ref=S.caso?CARDIACO_CASOS[S.caso].fases[f].eje:null;
 if(ref){const da=Math.abs(e.az-ref.azimut),de=Math.abs(e.el-ref.elevacion);if(da>CARDIACO_TOLERANCIA.angulo)p.push('El azimut de '+CARDIACO_NOMBRE_FASE[f]+' se aleja '+C.fmt(da,0)+'° del eje que usó el equipo. Revisa la línea base–ápex en la transaxial: debe seguir el eje largo del ventrículo, no el del corazón entero.');if(de>CARDIACO_TOLERANCIA.angulo)p.push('La elevación de '+CARDIACO_NOMBRE_FASE[f]+' se aleja '+C.fmt(de,0)+'° de la del equipo. En el eje largo vertical, la línea va del centro de la base al ápex.');}
 const Lmm=e.L*volGuia(f).spacing;if(Lmm<45||Lmm>160)p.push('El largo marcado ('+C.fmt(Lmm,0)+' mm) no parece un ventrículo: entre 5 y 16 cm.');
 return p;
}
function detalleEje(f){const e=S.ejes[f];if(!ejeDefinido(f))return '';const ref=S.caso?CARDIACO_CASOS[S.caso].fases[f].eje:null;return 'Azimut '+e.az+'°, elevación '+e.el+'°, largo '+C.fmt(e.L*(volGuia(f)?.spacing||3.3),0)+' mm.'+(ref?' El equipo usó '+ref.azimut+'° y '+ref.elevacion+'°.':' Este caso no tiene eje de referencia del equipo.');}
/* ---------- cortes ---------- */
function pila(v,f,tipoCorte,cantidad,margenMm,marco){
 const e=S.ejes[f],Mk=marco||marcoDe(e),sp=v.spacing,mg=margenMm/sp,out=[];
 const tA=e.L/2+mg,tB=-e.L/2;
 for(let k=0;k<cantidad;k++){let img;if(tipoCorte==='sax'){const t=tA-(tA-tB)*k/(cantidad-1);img=C.ejeCorto(v.data[0],v.n,v.nz,v.rec.tipo==='gatillado'?centroGated(v,f):e.C,Mk,t,M,1);}
  else{const ancho=Math.max(4,e.L*.55),t=-ancho/2+ancho*k/(cantidad-1);img=(tipoCorte==='vla'?C.ejeLargoVertical:C.ejeLargoHorizontal)(v.data[0],v.n,v.nz,v.rec.tipo==='gatillado'?centroGated(v,f):e.C,Mk,t,M,1);}
  out.push(img);}
 return out;
}
function paginaCortes(){
 const W=1400,tipoPref=S.cortesTipo,filas=[];
 for(const f of CARDIACO_FASES){const t=tipoDisponible(f,tipoPref);if(!t||!ejeDefinido(f))return null;filas.push({f,t,v:vol(f,t)});}
 const N=S.cortesN,NL=S.cortesNL,etq=90,gap=3,tw=Math.floor((W-etq-gap*(N+1))/N),twL=Math.floor((W-etq-gap*(NL+1))/NL),alto=64,filaAlto=tw+18,filaAltoL=twL+18,H=alto+2*filaAlto+4*filaAltoL+40;
 const cv=C.lienzo(W,H),ctx=cv.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.font='bold 18px Arial';ctx.fillText('SPECT DE PERFUSIÓN MIOCÁRDICA · cortes reorientados',16,28);ctx.font='13px Arial';
 const n=S.caso;ctx.fillText((n?'Caso '+n:'Caso sin identificar')+' · '+(filas[0].t==='AC'?'con corrección de atenuación':'sin corrección de atenuación')+' · estrés: azimut '+S.ejes.estres.az+'°, elevación '+S.ejes.estres.el+'° · reposo: azimut '+S.ejes.reposo.az+'°, elevación '+S.ejes.reposo.el+'°',16,50);
 // La escala de cada fase sale de sus propios cortes de eje corto, no del volumen entero: el
 // higado o el intestino, fuera de los cortes, no deben apagar el corazon.
 const maxes=filas.map(r=>{const imgs=pila(r.v,r.f,'sax',N,S.margenMm);const todo=new Float32Array(imgs.length*M*M);imgs.forEach((im,i)=>todo.set(im,i*M*M));return C.percentil(todo,.995);}),comun=Math.max(...maxes);
 let y=alto;const pal=S.paleta;
 for(const [tipoCorte,cant,tam,ancho,nombre] of [['sax',N,tw,filaAlto,'Eje corto'],['vla',NL,twL,filaAltoL,'Eje largo vertical'],['hla',NL,twL,filaAltoL,'Eje largo horizontal']]){
  filas.forEach((r,fi)=>{const imgs=pila(r.v,r.f,tipoCorte,cant,S.margenMm),max=S.normalizar?maxes[fi]:comun;
   ctx.fillStyle='#ffd27f';ctx.font='bold 12px Arial';ctx.fillText(nombre,8,y+14);ctx.fillStyle='#fff';ctx.font='12px Arial';ctx.fillText(CARDIACO_NOMBRE_FASE[r.f],8,y+30);
   imgs.forEach((img,k)=>{const x=etq+gap+k*(tam+gap);const c=C.lienzo(tam,tam);C.pintar(c,img,M,{paleta:pal,techo:S.techo,max,suave:true});ctx.drawImage(c,x,y);if(tipoCorte==='sax'&&fi===0){ctx.fillStyle='#9f9';ctx.font='11px Arial';ctx.fillText(k===0?'ápex':k===cant-1?'base':'',x+3,y+12);}});
   y+=ancho;});
 }
 ctx.fillStyle='#aaa';ctx.font='11px Arial';ctx.fillText('Eje corto: anterior arriba, septo a la izquierda, lateral a la derecha, inferior abajo. Largo vertical: ápex a la izquierda, anterior arriba. Largo horizontal: ápex arriba, septo a la izquierda. '+(S.normalizar?'Cada fase normalizada a su máximo.':'Ambas fases con la misma escala.'),16,H-14);
 return cv;
}
function mostrarCortes(){const host=$('cortesHost');host.replaceChildren();const cv=paginaCortes();paginas.cortes=cv;$('pngCortes').disabled=!cv;if(!cv){host.append(Object.assign(document.createElement('p'),{className:'notice',textContent:'Faltan volúmenes o el eje de alguna fase.',style:'color:#fff'}));return;}host.append(cv);}
/* ---------- mapa polar ---------- */
function mapasPolares(){
 const out={};for(const f of CARDIACO_FASES){const t=tipoDisponible(f,S.polarTipo),v=t?vol(f,t):null;if(!v||!ejeDefinido(f))return null;const e=S.ejes[f];// La base se muestrea hasta un 12 % del largo antes del plano valvular que marco el alumno, como
 // hace el corte de "base" de los programas clinicos; mas alla solo hay valvula y auricula.
 out[f]={mapa:C.mapaPolar(v.data[0],v.n,v.nz,e.C,marcoDe(e),e.L/2-1,-e.L/2+.12*e.L,v.spacing,{anillos:24,angulos:72,radioMm:Math.max(35,e.L*v.spacing*.6)}),tipo:t};}
 return out;
}
function paginaPolar(){
 const maps=mapasPolares();if(!maps)return null;const W=1132,H=560,cv=C.lienzo(W,H),ctx=cv.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#fff';ctx.font='bold 18px Arial';ctx.fillText('MAPA POLAR · 17 segmentos',16,28);ctx.font='13px Arial';ctx.fillText((S.caso?'Caso '+S.caso:'')+' · '+(maps.estres.tipo==='AC'?'con AC':'sin AC')+' · umbral de defecto '+Math.round(S.polarUmbral*100)+' % del máximo',16,50);
 const size=300,res={};[['estres','Estrés',30],['reposo','Reposo',400]].forEach(([f,titulo,x])=>{const c=C.lienzo(size,size);res[f]=C.dibujarPolar(c,maps[f].mapa,{umbral:S.polarUmbral,marcarDefecto:true,numeros:S.polarNumeros,paleta:C.PALETAS[S.paleta]});ctx.drawImage(c,x,90);ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.fillText(titulo+' · extensión bajo el umbral '+C.fmt(res[f].extension,0)+' %',x,80);
  ctx.font='11px Arial';ctx.fillStyle='#ccc';ctx.fillText('anterior',x+size/2-20,88+10);ctx.fillText('inferior',x+size/2-20,90+size+12);ctx.fillText('septal',x-40,90+size/2);ctx.fillText('lateral',x+size+4,90+size/2);});
 // Reversibilidad: reposo menos estres, en puntos porcentuales del maximo de cada mapa.
 const rev={valores:new Float32Array(maps.estres.mapa.valores.length),anillos:24,angulos:72,max:1};for(let i=0;i<rev.valores.length;i++)rev.valores[i]=1+(maps.reposo.mapa.valores[i]/maps.reposo.mapa.max-maps.estres.mapa.valores[i]/maps.estres.mapa.max);
 const c=C.lienzo(size,size);C.dibujarPolar(c,rev,{diferencia:true,numeros:S.polarNumeros,rejilla:'#444'});ctx.drawImage(c,770,90);ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.fillText('Reversibilidad (reposo − estrés)',770,80);
 ctx.fillStyle='#aaa';ctx.font='11px Arial';ctx.fillText('Anillos: ápex al centro, base afuera. Segmentos 1–6 basales, 7–12 medios, 13–16 apicales, 17 ápex. Rojo en la reversibilidad: mejor en reposo (isquemia); azul: peor en reposo. Aproximación sin base de datos normal.',16,H-40);
 ctx.fillText('Territorios habituales: DA anterior, anteroseptal y ápex; CD inferior e inferoseptal; CX lateral.',16,H-22);
 S.polar={estres:res.estres,reposo:res.reposo,tipo:maps.estres.tipo};return cv;
}
function mostrarPolar(){const host=$('polarHost');host.replaceChildren();const cv=paginaPolar();paginas.polar=cv;$('pngPolar').disabled=!cv;if(!cv){host.append(Object.assign(document.createElement('p'),{className:'notice',textContent:'Faltan volúmenes o el eje de alguna fase.',style:'color:#fff'}));$('polarTabla').replaceChildren();return;}host.append(cv);
 const t=document.createElement('table');t.className='tabla';const fila=(c,th)=>{const tr=document.createElement('tr');c.forEach((x,i)=>{const td=document.createElement(th?'th':'td');td.textContent=x;if(!th&&i===0)td.style.textAlign='left';tr.append(td);});t.append(tr);};
 fila(['Segmento','Territorio','Estrés %','Reposo %','Diferencia'],true);for(let s=1;s<=17;s++){const a=S.polar.estres.porSegmento[s],b=S.polar.reposo.porSegmento[s];fila([s+' · '+C.NOMBRE_SEGMENTO[s],C.TERRITORIO[s],a??'—',b??'—',(a!=null&&b!=null)?(b-a>0?'+':'')+(b-a):'—']);}
 fila(['Extensión bajo '+Math.round(S.polarUmbral*100)+' %','',C.fmt(S.polar.estres.extension,0)+' %',C.fmt(S.polar.reposo.extension,0)+' %','']);$('polarTabla').replaceChildren(t);}
/* ---------- gatillado ---------- */
function centroGated(g,f){const e=S.ejes[f],v=volGuia(f);if(!e.C||!v)return e.C;const dz=(g.posicion&&v.posicion)?(g.posicion[2]-v.posicion[2])/g.dz:0;return [e.C[0],e.C[1],e.C[2]-dz];}
function pilasGated(f){
 const g=vol(f,'gatillado');if(!g||!ejeDefinido(f))return null;const e=S.ejes[f],Mk=marcoDe(e),Cg=centroGated(g,f),sp=g.spacing,K=Math.max(6,Math.round(e.L+4)),tA=e.L/2+2/sp,tB=-e.L/2;
 return g.data.map(d=>{const sax=[];for(let k=0;k<K;k++){const t=tA-(tA-tB)*k/(K-1);sax.push(C.ejeCorto(d,g.n,g.nz,Cg,Mk,t,M,1));}return {sax,vla:C.ejeLargoVertical(d,g.n,g.nz,Cg,Mk,0,M,1),hla:C.ejeLargoHorizontal(d,g.n,g.nz,Cg,Mk,0,M,1),mid:C.ejeCorto(d,g.n,g.nz,Cg,Mk,0,M,1)};});
}
const cacheGated={};
function datosGated(f){const g=vol(f,'gatillado');if(!g||!ejeDefinido(f))return null;const clave=[f,g.hash,S.ejes[f].az,S.ejes[f].el,S.ejes[f].C?.join(','),S.ejes[f].L,S.gatedUmbral].join('|');if(cacheGated[f]&&cacheGated[f].clave===clave)return cacheGated[f];
 const pilas=pilasGated(f),radio=Math.max(25,S.ejes[f].L*g.spacing*.45),vols=pilas.map(p=>C.cavidad(p.sax,M,g.spacing,S.gatedUmbral,radio));cacheGated[f]={clave,pilas,vols,g};return cacheGated[f];}
function elegirPorVolumen(f){const d=datosGated(f);if(!d)return;let ed=0,es=0;d.vols.forEach((v,i)=>{if(v.mL>d.vols[ed].mL)ed=i;if(v.mL<d.vols[es].mL)es=i;});S.gated[f].ED=ed+1;S.gated[f].ES=es+1;}
function fevi(f){const d=datosGated(f),G=S.gated[f];if(!d||!G.ED||!G.ES)return null;const edv=d.vols[G.ED-1].mL,esv=d.vols[G.ES-1].mL;return {edv,esv,fevi:edv?100*(edv-esv)/edv:NaN};}
function dibujarGated(){
 const host=$('gatedHost');const f=S.gatedFase,d=datosGated(f);
 if(!d){host.replaceChildren(Object.assign(document.createElement('p'),{className:'notice',textContent:'Falta el gatillado o el eje de la fase '+CARDIACO_NOMBRE_FASE[f]+'.',style:'color:#fff'}));$('gatedTabla').replaceChildren();$('pngGated').disabled=true;return;}
 const t=Math.max(1,Math.min(d.g.slots,S.gatedT)),p=d.pilas[t-1],max=Math.max(...d.pilas.map(q=>C.maximo(q.mid)))*1.05;
 let cv=host.querySelector('canvas');if(!cv){cv=C.lienzo(900,330);host.replaceChildren(cv);}const ctx=cv.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,cv.width,cv.height);
 [['Eje corto medio',p.mid],['Eje largo vertical',p.vla],['Eje largo horizontal',p.hla]].forEach(([titulo,img],i)=>{const c=C.lienzo(280,280);C.pintar(c,img,M,{paleta:S.paleta,techo:S.techo,max,suave:true});ctx.drawImage(c,10+i*300,30);ctx.fillStyle='#fff';ctx.font='13px Arial';ctx.fillText(titulo,10+i*300,20);
  if(i===0){const mk=d.vols[t-1].mascaras[Math.floor(p.sax.length/2)];if(mk){ctx.save();ctx.strokeStyle='#0f0';ctx.lineWidth=1;const k=280/M;for(let y=0;y<M;y++)for(let x=0;x<M;x++){const j=y*M+x;if(!mk[j])continue;if(x===0||!mk[j-1]){ctx.beginPath();ctx.moveTo(10+x*k,30+y*k);ctx.lineTo(10+x*k,30+(y+1)*k);ctx.stroke();}if(x===M-1||!mk[j+1]){ctx.beginPath();ctx.moveTo(10+(x+1)*k,30+y*k);ctx.lineTo(10+(x+1)*k,30+(y+1)*k);ctx.stroke();}if(y===0||!mk[j-M]){ctx.beginPath();ctx.moveTo(10+x*k,30+y*k);ctx.lineTo(10+(x+1)*k,30+y*k);ctx.stroke();}if(y===M-1||!mk[j+M]){ctx.beginPath();ctx.moveTo(10+x*k,30+(y+1)*k);ctx.lineTo(10+(x+1)*k,30+(y+1)*k);ctx.stroke();}}ctx.restore();}}});
 ctx.fillStyle='#ffd27f';ctx.font='bold 14px Arial';ctx.fillText(CARDIACO_NOMBRE_FASE[f]+' · intervalo '+t+'/'+d.g.slots+' · cavidad '+C.fmt(d.vols[t-1].mL,0)+' mL (umbral '+Math.round(S.gatedUmbral*100)+' %)',10,325);
 $('gatedTValor').textContent=t;$('gatedT').max=d.g.slots;
 for(const id of ['gatedED','gatedES']){const sel=$(id),val=S.gated[f][id==='gatedED'?'ED':'ES'];sel.replaceChildren(new Option('—',''));for(let i=1;i<=d.g.slots;i++)sel.add(new Option('intervalo '+i+' · '+C.fmt(d.vols[i-1].mL,0)+' mL',i));sel.value=val?String(val):'';}
 const tb=document.createElement('table');tb.className='tabla';const fila=(c,th)=>{const tr=document.createElement('tr');c.forEach((x,i)=>{const td=document.createElement(th?'th':'td');td.textContent=x;if(!th&&i===0)td.style.textAlign='left';tr.append(td);});tb.append(tr);};
 fila(['Intervalo','Cavidad (mL)'],true);d.vols.forEach((v,i)=>fila([(i+1)+(S.gated[f].ED===i+1?' · FD':'')+(S.gated[f].ES===i+1?' · FS':''),C.fmt(v.mL,0)]));const r=fevi(f);if(r)fila(['FEVI aproximada',C.fmt(r.fevi,0)+' % (VFD '+C.fmt(r.edv,0)+', VFS '+C.fmt(r.esv,0)+' mL)']);$('gatedTabla').replaceChildren(tb);
 $('pngGated').disabled=!(fevi('estres')&&fevi('reposo'));
}
function paginaGated(){
 const W=1132,H=760,cv=C.lienzo(W,H),ctx=cv.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.font='bold 18px Arial';ctx.fillText('SPECT GATILLADO · función ventricular aproximada',16,28);ctx.font='13px Arial';ctx.fillText((S.caso?'Caso '+S.caso:'')+' · umbral de cavidad '+Math.round(S.gatedUmbral*100)+' % · 8 intervalos · OSEM sin AC',16,50);
 CARDIACO_FASES.forEach((f,fi)=>{const d=datosGated(f),r=fevi(f);if(!d||!r)return;const y0=70+fi*330,max=Math.max(...d.pilas.map(q=>C.maximo(q.mid)))*1.05;ctx.fillStyle='#ffd27f';ctx.font='bold 14px Arial';ctx.fillText(CARDIACO_NOMBRE_FASE[f].toUpperCase()+' · FEVI '+C.fmt(r.fevi,0)+' % · VFD '+C.fmt(r.edv,0)+' mL · VFS '+C.fmt(r.esv,0)+' mL',16,y0+14);
  [['FD · eje corto',d.pilas[S.gated[f].ED-1].mid],['FS · eje corto',d.pilas[S.gated[f].ES-1].mid],['FD · largo vertical',d.pilas[S.gated[f].ED-1].vla],['FS · largo vertical',d.pilas[S.gated[f].ES-1].vla],['FD · largo horizontal',d.pilas[S.gated[f].ED-1].hla],['FS · largo horizontal',d.pilas[S.gated[f].ES-1].hla]].forEach(([tit,img],i)=>{const c=C.lienzo(130,130);C.pintar(c,img,M,{paleta:S.paleta,techo:S.techo,max,suave:true});ctx.drawImage(c,16+i*140,y0+24);ctx.fillStyle='#ccc';ctx.font='11px Arial';ctx.fillText(tit,16+i*140,y0+168);});
  // Curva de volumen.
  const gx=880,gw=230,gy=y0+30,gh=130,vmax=Math.max(...d.vols.map(v=>v.mL))*1.15||1;ctx.strokeStyle='#666';ctx.strokeRect(gx,gy,gw,gh);ctx.strokeStyle='#0f0';ctx.beginPath();d.vols.forEach((v,i)=>{const x=gx+gw*i/(d.vols.length-1),y=gy+gh-gh*v.mL/vmax;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.fillStyle='#ccc';ctx.font='11px Arial';ctx.fillText('volumen de cavidad por intervalo (mL)',gx,gy-6);ctx.fillText('0',gx-10,gy+gh);ctx.fillText(C.fmt(vmax,0),gx-30,gy+8);});
 ctx.fillStyle='#aaa';ctx.font='11px Arial';ctx.fillText('Cavidad segmentada por umbral en la pila de eje corto y sumada corte a corte; sin ajuste de superficies. Los volúmenes absolutos dependen del umbral y del efecto de volumen parcial: úsalos para la FEVI y la motilidad, no como medida absoluta.',16,H-16);
 return cv;
}
/* ---------- exportacion ---------- */
async function exportarPng(tipo){
 const cv=tipo==='cortes'?paginaCortes():tipo==='polar'?paginaPolar():paginaGated();if(!cv){estado('No hay nada que exportar aún.');return;}
 const n=S.caso;const nombre='Cardiaco-Caso-'+(n??'X')+'-'+(tipo==='cortes'?'cortes-'+(S.cortesTipo):tipo==='polar'?'mapa-polar-'+S.polarTipo:'gatillado')+'.png';
 const blob=await C.canvasABlob(cv);C.descargar(blob,nombre);S.exportados[tipo]=true;estado('Descargado '+nombre+'.');
 window.dispatchEvent(new CustomEvent('cardiaco',{detail:{kind:'png',tipo,nombre,blob}}));refrescar();
}
/* ---------- navegacion y refresco ---------- */
function invalidar(){for(const k of Object.keys(cacheGated))delete cacheGated[k];S.exportados={cortes:false,polar:false,gated:false};}
function navegar(i){S.paso=Math.max(0,Math.min(4,i));document.querySelectorAll('.step').forEach((s,k)=>s.hidden=k!==S.paso);document.querySelectorAll('.steps button').forEach((b,k)=>b.classList.toggle('active',k===S.paso));$('prev').disabled=S.paso===0;$('next').disabled=S.paso===4;$('posicion').textContent='Paso '+(S.paso+1)+' de 5';
 $('panelEje').hidden=S.paso!==1;$('panelCortes').hidden=S.paso!==2;$('panelPolar').hidden=S.paso!==3;$('panelGated').hidden=S.paso!==4;$('vacio').hidden=S.vols.length>0||S.paso!==0;
 if(S.paso!==4&&cineTimer){clearInterval(cineTimer);cineTimer=null;$('gatedPlay').textContent='▶ Latir';}
 refrescar();}
function refrescar(){
 listar();
 const n=S.caso;$('casoNombre').textContent=n?'Cardíaco · Caso '+n:'Sin caso';$('casoInfo').textContent=n&&CARDIACO_CASOS[n]?CARDIACO_CASOS[n].titulo:'Elige el caso en el tutorial y carga los volúmenes exportados de la primera parte.';
 // Selector de volumen guia para el eje.
 const sel=$('ejeVolumen'),actual=sel.value;sel.replaceChildren();for(const v of S.vols.filter(v=>v.rec&&v.rec.fase===S.ejeFase&&['AC','NoAC'].includes(v.rec.tipo)&&(S.caso===null||v.rec.caso===S.caso)))sel.add(new Option(v.rec.tipo+' · '+v.nombre,v.hash));if([...sel.options].some(o=>o.value===actual))sel.value=actual;S.ejeVolumenHash=sel.value||null;
 $('ejeFase').value=S.ejeFase;const e=ejeActual();$('ejeAz').value=e.az??'';$('ejeEl').value=e.el??'';$('ejeInfo').textContent=ejeDefinido(S.ejeFase)?detalleEje(S.ejeFase):(e.axial.length<2?'Marca base y ápex en la transaxial.':'Marca base y ápex en el eje largo vertical.');
 if(S.paso===1){dibujarAxial();dibujarVlaMarca();dibujarPrevio();}
 if(S.paso===2)mostrarCortes();if(S.paso===3)mostrarPolar();if(S.paso===4)dibujarGated();
 $('vacio').hidden=S.vols.length>0||S.paso!==0;
 document.querySelectorAll('.steps button').forEach((b,k)=>b.classList.toggle('hecho',[S.vols.length>0&&!faltantes().length&&!problemasCarga().length,CARDIACO_FASES.every(f=>ejeDefinido(f)&&!problemasEje(f).length),S.exportados.cortes,S.exportados.polar,S.exportados.gated][k]));
 if(tutorial)tutorial.render();
 window.dispatchEvent(new CustomEvent('cardiaco',{detail:{kind:'estado'}}));
}
function reiniciar(){Object.assign(S,{vols:[],ignorados:[],seleccion:null,infoVista:new Set(),ejes:{estres:nuevoEje(),reposo:nuevoEje()},axialZ:null,polar:{},gated:{estres:{ED:null,ES:null,vol:[]},reposo:{ED:null,ES:null,vol:[]}},exportados:{cortes:false,polar:false,gated:false}});invalidar();$('archivos').value='';$('carpeta').value='';navegar(0);}
/* ---------- tutorial ---------- */
function pasosTutorial(n,caso){
 const conCT=Object.values(caso.fases).some(f=>Object.keys(f.ct||{}).length);
 const pasoEje=f=>({titulo:'Reorientar la fase de '+CARDIACO_NOMBRE_FASE[f],pantalla:1,resaltar:'panelEje',
  texto:'Elige la fase '+CARDIACO_NOMBRE_FASE[f]+' en el panel. El volumen guía es la OSEM '+(conCT?'con AC':'sin AC')+'. '+(caso.fases[f].guia||''),
  haz:['Con el deslizador, busca la transaxial donde el ventrículo izquierdo se vea como una herradura o un anillo.','Haz clic en el centro de la base (el lado abierto, hacia la válvula mitral) y después en el ápex.','En el eje largo vertical que aparece al medio, haz clic de nuevo en la base y en el ápex.','Revisa los tres cortes de la derecha: el eje corto debe ser un anillo, no un óvalo.'],
  deberia:'Un anillo en el eje corto, una «C» abierta hacia la derecha en el largo vertical y una «U» invertida en el largo horizontal. El panel muestra azimut, elevación y largo del ventrículo.',
  ayuda:'Si el eje corto sale ovalado, el azimut o la elevación están mal: repite los clics. Si el tutorial dice que te alejas del equipo, compara con su eje corto de la carpeta «Referencia equipo» cargándolo aquí. Puedes afinar los ángulos a mano en el panel.',
  completo:()=>ejeDefinido(f)&&!problemasEje(f).length,problemas:()=>problemasEje(f),detalle:()=>detalleEje(f),
  acciones:()=>S.ejeFase!==f?[{etiqueta:'Ir a la fase '+CARDIACO_NOMBRE_FASE[f],accion:()=>{S.ejeFase=f;S.axialZ=null;}}]:(ejeDefinido(f==='estres'?'reposo':'estres')&&!ejeDefinido(f)?[{etiqueta:'Copiar los ángulos de la otra fase',accion:copiarEje}]:[])});
 return [
  {titulo:'Cargar los volúmenes de la primera parte',pantalla:0,resaltar:'archivos',
   texto:'De la primera parte traes, por fase, la OSEM sin AC'+(conCT?', la OSEM con AC':'')+' y el gatillado: '+(conCT?'seis':'cuatro')+' archivos. El simulador los reconoce por la descripción que quedó dentro del DICOM («Caso '+n+' estres AC», etc.).',
   haz:['Pulsa «Archivos» y selecciona todos los DICOM que exportaste, o la carpeta donde los guardaste.','Revisa la tabla «Volúmenes del caso» del panel: cada fila debe quedar en verde.'],
   deberia:(conCT?'Seis':'Cuatro')+' filas en verde. Si agregas el eje corto del equipo de la carpeta «Referencia equipo», aparece como referencia.',
   ayuda:'Un archivo «no reconocido» es una exportación sin nombre o con otro nombre: vuelve a SPECT Lab 95 y exporta con el nombre exacto. Las proyecciones crudas no van aquí.',
   completo:()=>S.vols.length>0&&!faltantes().length&&!problemasCarga().length,problemas:()=>problemasCarga(),
   detalle:()=>S.vols.filter(v=>v.rec&&v.rec.tipo!=='referencia').map(v=>CARDIACO_NOMBRE_FASE[v.rec.fase]+' '+v.rec.tipo).join(' · ')},
  pasoEje('estres'),pasoEje('reposo'),
  {titulo:'Página de cortes'+(conCT?' sin AC y con AC':''),pantalla:2,resaltar:'panelCortes',
   texto:'La página muestra estrés arriba y reposo abajo en cada tipo de corte, con los ángulos que definiste por fase. '+(conCT?'Alterna «Con AC» y «Sin AC» en el panel y mira la pared inferior.':'Este caso solo tiene la reconstrucción sin AC.'),
   haz:['Ajusta el número de ejes cortos y el margen del ápex para que el primer corte muestre el ápex y el último la base.','Compara la misma pared entre estrés y reposo, corte a corte.',conCT?'Cambia a «Sin AC» y vuelve a «Con AC»: la pared inferior es la que más cambia.':'Fíjate en la pared inferior sabiendo que parte de su hipocaptación es atenuación.','Descarga el PNG'+(conCT?' con la corrección que vas a informar':'')+'.'],
   deberia:'Una página negra con seis filas de imágenes, el ápex a la izquierda de la fila de eje corto y la base a la derecha, y los ángulos anotados en la cabecera.',
   ayuda:'Si los cortes salen oblicuos u ovalados, vuelve al paso 2 y corrige el eje. Si el ápex no aparece, sube el margen.',
   completo:()=>S.exportados.cortes,problemas:()=>paginaCortes()?[]:['Faltan volúmenes o el eje de alguna fase.']},
  {titulo:'Mapa polar y extensión del defecto',pantalla:3,resaltar:'panelPolar',
   texto:'El mapa polar resume el ventrículo en un disco: ápex al centro, base afuera. Cada sector muestra el máximo radial de ese corte y ángulo, en porcentaje del máximo del mapa. La reversibilidad es reposo menos estrés.',
   haz:['Elige la corrección con la que vas a informar.','Mueve el umbral de defecto hasta que el área marcada coincida con lo que ves hipocaptante en los cortes, sin marcar el ruido de la base.','Lee la extensión en estrés y en reposo, y los segmentos comprometidos con su territorio.','Descarga el PNG.'],
   deberia:'Tres discos: estrés, reposo y reversibilidad. En un estudio normal casi nada queda marcado; en una isquemia, el defecto de estrés se achica en reposo y aparece rojo en la reversibilidad.',
   ayuda:'Un umbral muy alto marca hasta las paredes normales (la base siempre capta menos que el resto). Uno muy bajo no marca nada. Anota el umbral que usaste: es una decisión tuya y se discute.',
   completo:()=>S.exportados.polar,problemas:()=>paginaPolar()?[]:['Faltan volúmenes o el eje de alguna fase.'],
   detalle:()=>S.polar.estres?'Extensión estrés '+C.fmt(S.polar.estres.extension,0)+' %, reposo '+C.fmt(S.polar.reposo.extension,0)+' % (umbral '+Math.round(S.polarUmbral*100)+' %, '+S.polar.tipo+').':''},
  {titulo:'Gatillado: fin de diástole, fin de sístole y FEVI',pantalla:4,resaltar:'panelGated',
   texto:'El cine recorre los 8 intervalos del ciclo con tus ángulos. La cavidad se segmenta por umbral en cada corte de eje corto y se suma: es un volumen aproximado.',
   haz:['Pulsa «Latir» y mira el engrosamiento y la motilidad de cada pared en los tres cortes.','Elige fin de diástole (cavidad mayor) y fin de sístole (cavidad menor), a ojo o con «Elegir por volumen».','Ajusta el umbral de cavidad si el contorno verde se sale del miocardio o no llena la cavidad.','Repite con la otra fase y descarga el PNG.'],
   deberia:'Un contorno verde dentro de la cavidad en el eje corto medio, una curva de volumen con un mínimo y un máximo, y una FEVI por fase.',
   ayuda:'Si la FEVI sale absurda (negativa o mayor de 90 %), el contorno se escapó: sube el umbral. En cavidades muy dilatadas el umbral por defecto puede no bastar.',
   completo:()=>S.exportados.gated&&!!fevi('estres')&&!!fevi('reposo'),problemas:()=>{const p=[];for(const f of CARDIACO_FASES){if(!datosGated(f))p.push('Falta el gatillado o el eje de '+CARDIACO_NOMBRE_FASE[f]+'.');else if(!fevi(f))p.push('Falta elegir fin de diástole y fin de sístole en '+CARDIACO_NOMBRE_FASE[f]+'.');}return p;},
   detalle:()=>CARDIACO_FASES.map(f=>{const r=fevi(f);return r?CARDIACO_NOMBRE_FASE[f]+': FEVI '+C.fmt(r.fevi,0)+' %, VFD '+C.fmt(r.edv,0)+' mL':'';}).filter(Boolean).join(' · ')}
 ];
}
function cierreTutorial(n,caso){
 const box=document.createElement('div'),ref=caso.referencia,T=CARDIACO_TOLERANCIA;
 const t=document.createElement('table');t.className='tabla';const fila=(c,th,mal)=>{const tr=document.createElement('tr');c.forEach((x,i)=>{const td=document.createElement(th?'th':'td');td.textContent=x;if(mal&&i===c.length-1)td.className='mal';tr.append(td);});t.append(tr);};
 fila(['','Tu resultado','Informe','Diferencia'],true);
 const comparar=(nombre,mio,suyo,tol,unidad)=>{if(suyo==null){fila([nombre,Number.isFinite(mio)?C.fmt(mio,0)+unidad:'—','no consta','']);return;}const d=Number.isFinite(mio)?Math.abs(mio-suyo):NaN;fila([nombre,Number.isFinite(mio)?C.fmt(mio,0)+unidad:'—',C.fmt(suyo,0)+unidad,Number.isFinite(d)?C.fmt(d,0)+(d<=tol?' ✔':' (> '+tol+')'):'—'],false,Number.isFinite(d)&&d>tol);};
 for(const f of CARDIACO_FASES){const r=fevi(f);comparar('Extensión '+CARDIACO_NOMBRE_FASE[f],S.polar[f]?.extension,ref.extension?.[f],T.extension,' %');comparar('FEVI '+CARDIACO_NOMBRE_FASE[f],r?.fevi,ref.fevi?.[f],T.fevi,' %');comparar('VFD '+CARDIACO_NOMBRE_FASE[f],r?.edv,ref.vfd?.[f],T.vfdMl,' mL');}
 box.append(t);
 if(ref.qps)box.append(Object.assign(document.createElement('p'),{className:'notice',textContent:'La extensión del informe es la del texto; la pantalla QPS del equipo decía '+ref.qps.estres+' % en estrés y '+ref.qps.reposo+' % en reposo con su base de datos normal. Tu extensión depende del umbral que elegiste.'}));
 if(ref.tid!=null||ref.sds!=null)box.append(Object.assign(document.createElement('p'),{className:'notice',textContent:[ref.tid!=null?'TID del equipo: '+ref.tid:'',ref.sds!=null?'SDS: '+ref.sds:''].filter(Boolean).join(' · ')}));
 box.append(Object.assign(document.createElement('p'),{textContent:'Tolerancias: '+T.extension+' puntos en extensión, '+T.fevi+' en FEVI, '+T.vfdMl+' mL en volumen. No corrijas tus valores para que calcen: explica de qué dependieron (eje, umbral, corrección de atenuación) y llévalo a la discusión.'}));
 if(caso.reveladas?.length){const rev=document.createElement('details');rev.open=true;rev.append(Object.assign(document.createElement('summary'),{textContent:'Lo que el tutorial no te dijo antes'}));const ul=document.createElement('ul');caso.reveladas.forEach(t=>ul.append(Object.assign(document.createElement('li'),{textContent:t})));rev.append(ul);box.append(rev);}
 const hal=document.createElement('details');hal.open=true;hal.append(Object.assign(document.createElement('summary'),{textContent:'Hallazgos del informe'}));hal.append(Object.assign(document.createElement('p'),{textContent:ref.hallazgos}));box.append(hal);
 const imp=document.createElement('details');imp.open=true;imp.append(Object.assign(document.createElement('summary'),{textContent:'Impresión del informe'}));imp.append(Object.assign(document.createElement('p'),{textContent:ref.impresion}));box.append(imp);
 return box;
}
function copiarEje(){const f=S.ejeFase,o=f==='estres'?'reposo':'estres',src=S.ejes[o];if(!ejeDefinido(o)){estado('La otra fase no tiene eje definido.');return;}const dst=S.ejes[f];dst.az=src.az;dst.el=src.el;dst.L=src.L;const v=volGuia(f),vo=volGuia(o);dst.C=src.C.slice();if(v&&vo&&v.posicion&&vo.posicion)dst.C[2]-=(v.posicion[2]-vo.posicion[2])/v.dz;dst.axial=[];dst.vla=[];invalidar();estado('Ángulos copiados de la fase '+CARDIACO_NOMBRE_FASE[o]+'. Revisa el resultado: cada fase se adquirió por separado.');refrescar();}
/* ---------- arranque ---------- */
function iniciar(){
 tutorial=RenalTutorial.crear({contenedor:$('tutorial'),workspace:$('workspace'),boton:$('tutorialBoton'),titulo:'Tutorial cardíaco',clave:'cardiacoTutorial',casos:CARDIACO_CASOS,pasos:pasosTutorial,cierre:cierreTutorial,preguntasOrales:CARDIACO_PREGUNTAS_ORALES,
  onCaso:n=>{S.caso=n;for(const v of S.vols)v.rec=reconocer(v);refrescar();},navegar:i=>{if(i!==S.paso&&S.vols.length)navegar(i);}});
 S.caso=tutorial.caso;
 $('archivos').onchange=e=>cargar([...e.target.files]);$('carpeta').onchange=e=>cargar([...e.target.files].filter(f=>!/\.(png|pdf|txt)$/i.test(f.name)));
 $('paleta').onchange=e=>{S.paleta=e.target.value;refrescar();};$('techo').oninput=e=>{S.techo=Number(e.target.value)/100;$('techoValor').textContent=e.target.value+' %';refrescar();};
 $('ejeFase').onchange=e=>{S.ejeFase=e.target.value;S.axialZ=null;refrescar();};$('ejeVolumen').onchange=e=>{S.ejeVolumenHash=e.target.value;S.axialZ=null;refrescar();};
 $('axialZ').oninput=e=>{S.axialZ=Number(e.target.value);dibujarAxial();};
 $('axial').onclick=clicAxial;$('vlaMarca').onclick=clicVla;
 $('ejeAz').onchange=e=>{const x=ejeActual();if(e.target.value!==''&&x.C){x.az=Number(e.target.value);invalidar();refrescar();}};$('ejeEl').onchange=e=>{const x=ejeActual();if(e.target.value!==''&&x.C){x.el=Number(e.target.value);invalidar();refrescar();}};
 $('ejeCopiar').onclick=copiarEje;$('ejeBorrar').onclick=()=>{S.ejes[S.ejeFase]=nuevoEje();invalidar();refrescar();};
 $('cortesTipo').onchange=e=>{S.cortesTipo=e.target.value;S.exportados.cortes=false;refrescar();};$('cortesN').onchange=e=>{S.cortesN=Math.max(6,Math.min(16,Number(e.target.value)||12));refrescar();};$('cortesNL').onchange=e=>{S.cortesNL=Math.max(3,Math.min(8,Number(e.target.value)||6));refrescar();};
 $('cortesMargen').oninput=e=>{S.margenMm=Number(e.target.value);$('cortesMargenValor').textContent=e.target.value+' mm';refrescar();};$('cortesNormalizar').onchange=e=>{S.normalizar=e.target.checked;refrescar();};
 $('polarTipo').onchange=e=>{S.polarTipo=e.target.value;S.exportados.polar=false;refrescar();};$('polarUmbral').oninput=e=>{S.polarUmbral=Number(e.target.value)/100;$('polarUmbralValor').textContent=e.target.value+' %';S.exportados.polar=false;refrescar();};$('polarNumeros').onchange=e=>{S.polarNumeros=e.target.checked;refrescar();};
 $('gatedFase').onchange=e=>{S.gatedFase=e.target.value;refrescar();};$('gatedT').oninput=e=>{S.gatedT=Number(e.target.value);dibujarGated();};
 $('gatedUmbral').oninput=e=>{S.gatedUmbral=Number(e.target.value)/100;$('gatedUmbralValor').textContent=e.target.value+' %';invalidarGated();refrescar();};
 $('gatedED').onchange=e=>{S.gated[S.gatedFase].ED=Number(e.target.value)||null;S.exportados.gated=false;refrescar();};$('gatedES').onchange=e=>{S.gated[S.gatedFase].ES=Number(e.target.value)||null;S.exportados.gated=false;refrescar();};
 $('gatedAuto').onclick=()=>{elegirPorVolumen(S.gatedFase);S.exportados.gated=false;refrescar();};
 $('gatedPlay').onclick=()=>{if(cineTimer){clearInterval(cineTimer);cineTimer=null;$('gatedPlay').textContent='▶ Latir';return;}$('gatedPlay').textContent='■ Parar';cineTimer=setInterval(()=>{const d=datosGated(S.gatedFase);if(!d)return;S.gatedT=S.gatedT%d.g.slots+1;$('gatedT').value=S.gatedT;dibujarGated();},130);};
 $('pngCortes').onclick=()=>exportarPng('cortes');$('pngPolar').onclick=()=>exportarPng('polar');$('pngGated').onclick=()=>exportarPng('gated');
 $('nuevo').onclick=()=>{if(!S.vols.length||confirm('¿Descartar los volúmenes cargados y los ejes?'))reiniciar();};
 $('prev').onclick=()=>navegar(S.paso-1);$('next').onclick=()=>navegar(S.paso+1);document.querySelectorAll('.steps button').forEach(b=>b.onclick=()=>navegar(Number(b.dataset.step)));
 $('ayuda').onclick=()=>$('acerca').showModal();$('cerrarAcerca').onclick=()=>$('acerca').close();$('inicio').onclick=()=>navegar(0);
 window.addEventListener('error',e=>{(window.__errores=window.__errores||[]).push(String(e.message));});
 navegar(0);
}
function invalidarGated(){for(const k of Object.keys(cacheGated))delete cacheGated[k];S.exportados.gated=false;}
window.CardiacoApp={estado:S,cargar,vol,ejeDefinido,problemasEje,problemasCarga,paginaCortes,paginaPolar,paginaGated,datosGated,fevi,elegirPorVolumen,navegar,exportarPng,refrescar,get tutorial(){return tutorial;},
 buscarVentriculo:(f,az,el,tipo)=>{const v=tipo?vol(f,tipo):volGuia(f);if(!v)return null;const b=C.buscarVentriculo(v.data[0],v.n,v.nz,C.marco(az,el),v.spacing);if(b&&tipo&&v!==volGuia(f)){const g=volGuia(f);if(g&&g.posicion&&v.posicion)b.C[2]-=(g.posicion[2]-v.posicion[2])/g.dz;}return b;},definirEje:(f,az,el,Cv,L)=>{const e=S.ejes[f];e.az=az;e.el=el;e.C=Cv;e.L=L;e.axial=[[0,0,0],[1,1,0]];e.vla=[[0,0],[1,1]];invalidar();refrescar();}};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',iniciar):iniciar();
})();
