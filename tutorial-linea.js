/* Linea de puntos desde el panel del tutorial hasta el control que toca usar, como en la
   consola TC. El panel llama a TutorialLinea.apuntar(panel, [controles]) cada vez que resalta
   algo y a TutorialLinea.limpiar() cuando deja de resaltar. La capa es fija, no recibe clics y
   se vuelve a medir sola mientras haya objetivos (la pagina se reacomoda al cargar volumenes).
   Identico en todos los simuladores. */
'use strict';
const TutorialLinea=(()=>{
 const NS='http://www.w3.org/2000/svg',G=10;
 let capa=null,panel=null,objetivos=[],timer=null,firma='';
 const estilo='#tutorialLineaCapa{position:fixed;inset:0;z-index:60;pointer-events:none}'+
  '#tutorialLineaCapa svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}'+
  '.tutorialLineaHalo{fill:none;stroke:#fff;stroke-width:8;stroke-linecap:round;stroke-dasharray:0 11;opacity:.85}'+
  '.tutorialLineaTrazo{fill:none;stroke:#ff00ff;stroke-width:4;stroke-linecap:round;stroke-dasharray:0 11}'+
  '.tutorialLineaPunta{fill:#ff00ff;stroke:#fff;stroke-width:1.5;stroke-linejoin:round}'+
  '.tutorialLineaOrigen{fill:#ff00ff;stroke:#fff;stroke-width:2}'+
  '@media (prefers-reduced-motion:no-preference){.tutorialLineaHalo,.tutorialLineaTrazo{animation:tutorialLineaFlujo .5s linear infinite}'+
  '@keyframes tutorialLineaFlujo{to{stroke-dashoffset:-11px}}}';
 function asegurar(){
  if(capa)return;
  const st=document.createElement('style');st.textContent=estilo;document.head.append(st);
  capa=document.createElement('div');capa.id='tutorialLineaCapa';capa.setAttribute('aria-hidden','true');document.body.append(capa);
 }
 function visible(el){if(!el||!el.isConnected||el.hidden||el.closest('[hidden]'))return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;}
 const solapa=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
 function elemento(tag,clase){const n=document.createElementNS(NS,tag);if(clase)n.setAttribute('class',clase);return n;}
 /* Cada linea sale del panel por el lado que mira al control y llega al borde del control, con
    un carril propio cuando hay varios controles apilados. */
 function trazo(p,t,i,n){
  const off=(i-(n-1)/2)*18,pcx=(p.left+p.right)/2,pcy=(p.top+p.bottom)/2;
  const tcx=(t.left+t.right)/2+off,tcy=(t.top+t.bottom)/2;
  let x0,y0,x1,y1,d;
  if(t.right<p.left||t.left>p.right){
   const izq=tcx<pcx;
   x0=izq?p.left:p.right;y0=Math.max(p.top+24,Math.min(p.bottom-24,tcy+off));
   x1=izq?t.right+G:t.left-G;y1=tcy;
   const k=Math.max(30,Math.abs(x1-x0)*.45);
   d=`M${x0},${y0} C${izq?x0-k:x0+k},${y0} ${izq?x1+k:x1-k},${y1} ${x1},${y1}`;
  }else{
   const arriba=tcy<pcy;
   y0=arriba?p.top:p.bottom;x0=Math.max(p.left+24,Math.min(p.right-24,tcx));
   y1=arriba?t.bottom+G:t.top-G;x1=tcx;
   const k=Math.max(30,Math.abs(y1-y0)*.45);
   d=`M${x0},${y0} C${x0},${arriba?y0-k:y0+k} ${x1},${arriba?y1+k:y1-k} ${x1},${y1}`;
  }
  return {d,x0,y0};
 }
 function dibujar(){
  if(!capa)return;
  capa.replaceChildren();
  if(!panel||!visible(panel))return;
  const p=panel.getBoundingClientRect();
  const metas=objetivos.filter(el=>visible(el)).map(el=>el.getBoundingClientRect()).filter(t=>solapa(p,t)<.5*t.width*t.height);
  if(!metas.length)return;
  const svg=elemento('svg');
  const defs=elemento('defs'),marca=elemento('marker');
  marca.setAttribute('id','tutorialLineaCabeza');marca.setAttribute('markerWidth','12');marca.setAttribute('markerHeight','12');marca.setAttribute('refX','9');marca.setAttribute('refY','6');marca.setAttribute('orient','auto');marca.setAttribute('markerUnits','userSpaceOnUse');
  const punta=elemento('path','tutorialLineaPunta');punta.setAttribute('d','M1,1 L11,6 L1,11 z');marca.append(punta);defs.append(marca);svg.append(defs);
  metas.forEach((t,i)=>{
   const {d,x0,y0}=trazo(p,t,i,metas.length);
   const halo=elemento('path','tutorialLineaHalo'),linea=elemento('path','tutorialLineaTrazo'),origen=elemento('circle','tutorialLineaOrigen');
   halo.setAttribute('d',d);linea.setAttribute('d',d);linea.setAttribute('marker-end','url(#tutorialLineaCabeza)');
   origen.setAttribute('cx',x0);origen.setAttribute('cy',y0);origen.setAttribute('r','5');
   svg.append(halo,linea,origen);
  });
  capa.append(svg);
 }
 function seguir(){
  if(!panel||!objetivos.length)return;
  const f=[panel,...objetivos].map(el=>{const r=el.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height),visible(el)?1:0].join(',');}).join('|');
  if(f!==firma){firma=f;dibujar();}
 }
 function apuntar(p,els){
  panel=p||null;objetivos=(els||[]).filter(Boolean);
  if(!panel||!objetivos.length){limpiar();return;}
  asegurar();firma='';seguir();
  if(!timer)timer=setInterval(seguir,300);
 }
 function limpiar(){
  panel=null;objetivos=[];firma='';
  if(capa)capa.replaceChildren();
  if(timer){clearInterval(timer);timer=null;}
 }
 addEventListener('resize',()=>{if(panel)dibujar();});
 addEventListener('scroll',()=>{if(panel)dibujar();},true);
 return {apuntar,limpiar};
})();
// Los paneles preguntan por window.TutorialLinea: un const de nivel superior no crea esa propiedad.
window.TutorialLinea=TutorialLinea;
