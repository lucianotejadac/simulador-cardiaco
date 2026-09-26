/* Panel de tutorial compartido por los simuladores renales. La aplicacion entrega los casos,
   la lista de pasos con sus comprobaciones y el bloque de cierre; este archivo solo dibuja el
   panel, guarda el caso elegido, resalta el control que toca usar y le tira la linea de puntos
   (TutorialLinea, si esta cargada). Identico en todos los simuladores que lo usan. */
'use strict';
const RenalTutorial=(()=>{
 function nodo(tag,texto,clase){const n=document.createElement(tag);if(texto!==undefined&&texto!==null)n.textContent=texto;if(clase)n.className=clase;return n;}
 function valor(v,...args){return typeof v==='function'?v(...args):v;}
 function crear(cfg){
  const cont=cfg.contenedor,ws=cfg.workspace,boton=cfg.boton;
  const estado=Object.assign({caso:null,abierto:true},leer());
  const url=new URL(location.href),casoUrl=Number(url.searchParams.get('caso'));
  if(cfg.casos[casoUrl]){estado.caso=casoUrl;estado.abierto=true;}
  function leer(){try{return JSON.parse(sessionStorage.getItem(cfg.clave)||'{}');}catch(e){return {};}}
  function guardar(){try{sessionStorage.setItem(cfg.clave,JSON.stringify({caso:estado.caso,abierto:estado.abierto}));}catch(e){}}
  let resaltado=null;
  function resaltar(id){
   if(resaltado){resaltado.classList.remove('tutorialResaltado');resaltado=null;}if(window.TutorialLinea)TutorialLinea.limpiar();
   if(!id)return;const el=document.getElementById(id);if(!el||el.hidden||el.closest('[hidden]'))return;el.classList.add('tutorialResaltado');resaltado=el;if(window.TutorialLinea)TutorialLinea.apuntar(cont,[el]);
  }
  function setCaso(n){estado.caso=cfg.casos[n]?Number(n):null;guardar();if(cfg.onCaso)cfg.onCaso(estado.caso);render();}
  function abrir(v=true){estado.abierto=v;guardar();render();}
  function render(){
   cont.hidden=!estado.abierto;if(ws)ws.classList.toggle('conTutorial',estado.abierto);if(boton)boton.setAttribute('aria-pressed',String(estado.abierto));
   if(!estado.abierto){resaltar(null);return;}
   cont.replaceChildren();
   const cab=nodo('div',null,'tutorialCabecera');cab.append(nodo('span',estado.caso?cfg.titulo+' · Caso '+estado.caso:cfg.titulo));
   const cerrar=nodo('button','✕','tutorialMini');cerrar.type='button';cerrar.title='Cerrar el tutorial';cerrar.onclick=()=>abrir(false);cab.append(cerrar);cont.append(cab);
   if(!estado.caso){renderSelector();return;}
   const caso=cfg.casos[estado.caso];
   cont.append(nodo('div',caso.titulo,'tutorialTitulo'));cont.append(nodo('p',caso.resumen,'tutorialResumen'));
   const clin=nodo('details');clin.open=true;clin.append(nodo('summary','Antecedente clínico'));clin.append(nodo('p',caso.clinica.antecedentes));
   if(caso.clinica.procedimiento){clin.append(nodo('h4','Procedimiento'));clin.append(nodo('p',caso.clinica.procedimiento));}
   clin.append(nodo('p','No tendrás el informe. Al terminar el caso, el simulador mostrará el resultado del informe para que lo compares con el tuyo.','notice'));cont.append(clin);
   if(caso.particularidades?.length){const part=nodo('details');part.append(nodo('summary','Particularidades de este caso'));const ul=nodo('ul');caso.particularidades.forEach(t=>ul.append(nodo('li',t)));part.append(ul);cont.append(part);}
   // Pasos
   const pasos=cfg.pasos(estado.caso,caso);let actual=-1;const estados=pasos.map(p=>{let ok=false;try{ok=!!valor(p.completo);}catch(e){ok=false;}return ok;});
   actual=estados.findIndex(x=>!x);
   const ol=nodo('ol',null,'tutorialPasos');
   pasos.forEach((p,i)=>{
    const li=nodo('li');li.className=estados[i]?'hecho':(i===actual?'actual':'');
    li.append(nodo('span',(i+1)+'. '+p.titulo));
    let problemas=[];if(!estados[i]){try{problemas=valor(p.problemas)||[];}catch(e){problemas=[];}}
    if(i===actual){
     const texto=valor(p.texto);if(texto)li.append(nodo('p',texto));
     const haz=valor(p.haz);if(haz?.length){const box=nodo('div',null,'tutorialHaz');box.append(nodo('strong','Haz esto, en este orden'));const o=nodo('ol');haz.forEach(t=>o.append(nodo('li',t)));box.append(o);li.append(box);}
     const deberia=valor(p.deberia);if(deberia){const box=nodo('div',null,'tutorialDeberia');box.append(nodo('strong','Qué debería aparecer'));box.append(nodo('p',deberia));li.append(box);}
     const ayuda=valor(p.ayuda);if(ayuda){const d=nodo('details');d.append(nodo('summary','Si no ocurre · ayuda para este paso'));d.append(nodo('p',ayuda));li.append(d);}
     const acciones=valor(p.acciones)||[];if(acciones.length){const b=nodo('div',null,'tutorialBotones');acciones.forEach(a=>{const bt=nodo('button',a.etiqueta);bt.type='button';bt.onclick=()=>{a.accion();render();};b.append(bt);});li.append(b);}
    }
    problemas.forEach(t=>li.append(nodo('p',t,'tutorialProblema')));
    const detalle=estados[i]?valor(p.detalle):null;if(detalle)li.append(nodo('p',detalle,'tutorialDetalle'));
    ol.append(li);
   });
   cont.append(ol);
   const pasoActual=pasos[actual];resaltar(pasoActual?valor(pasoActual.resaltar):null);
   if(pasoActual&&cfg.navegar&&pasoActual.pantalla!==undefined)cfg.navegar(pasoActual.pantalla);
   if(actual<0){const cierre=nodo('section',null,'tutorialCierre');cierre.append(nodo('strong','Caso completo'));const extra=cfg.cierre?cfg.cierre(estado.caso,caso):null;if(extra)cierre.append(extra);
    if(caso.preguntas?.length){const d=nodo('details',null,'tutorialPreguntas');d.open=true;d.append(nodo('summary','Preguntas para la discusión de este caso'));const o=nodo('ol');caso.preguntas.forEach(t=>o.append(nodo('li',t)));d.append(o);cierre.append(d);}
    cont.append(cierre);}
   if(cfg.preguntasOrales?.length){const d=nodo('details',null,'tutorialPreguntas');d.append(nodo('summary','Presentación oral · 5 preguntas · 10 minutos'));d.append(nodo('p','Las cinco preguntas se responden una sola vez para tus dos casos, con las imágenes proyectadas y sin material escrito. Esta pauta es para preparar y ensayar.','notice'));
    const o=nodo('ol');cfg.preguntasOrales.forEach(q=>{const li=nodo('li');li.append(nodo('strong',q.titulo+' '));li.append(nodo('span','('+Math.floor(q.segundos/60)+':'+String(q.segundos%60).padStart(2,'0')+')','oralTiempo'));li.append(nodo('p',q.pregunta));const dd=nodo('details');dd.append(nodo('summary','Cómo preparar esta respuesta'));dd.append(nodo('p',q.preparar));li.append(dd);o.append(li);});d.append(o);cont.append(d);}
   const pie=nodo('div',null,'tutorialBotones');const cambiar=nodo('button','Cambiar de caso');cambiar.type='button';cambiar.onclick=()=>setCaso(null);pie.append(cambiar);cont.append(pie);
  }
  function renderSelector(){
   cont.append(nodo('p','¿Qué caso te asignaron? Elige el número que aparece en el nombre de tu carpeta.'));
   const box=nodo('div',null,'tutorialCasos');
   Object.entries(cfg.casos).forEach(([n,c])=>{const b=nodo('button');b.type='button';b.append(nodo('strong','Caso '+n));b.append(nodo('span',c.titulo));b.onclick=()=>setCaso(n);box.append(b);});
   cont.append(box);
   cont.append(nodo('p','El número de caso solo cambia la guía. Los archivos los cargas tú desde tu carpeta; nada se envía a ningún servidor.','notice'));
  }
  if(boton)boton.onclick=()=>abrir(!estado.abierto);
  return {render,abrir,setCaso,resaltar,get caso(){return estado.caso;},get abierto(){return estado.abierto;}};
 }
 return {crear,nodo};
})();
