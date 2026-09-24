/* Casos del tutorial cardiaco (SPECT/CT de perfusion miocardica). Este archivo es identico en
   spect-lab-95 (primera parte: reconstruir) y en simulador-cardiaco (segunda parte: reorientar,
   mapa polar, gatillado, cierre). Los dos leen de aqui que archivos esperan y que cuenta cada caso.

   Los datos tecnicos salieron de los DICOM entregados. El marco de referencia de cada fase se
   guarda como hash FNV-1a de 32 bits del FrameOfReferenceUID regenerado en la entrega: sirve para
   reconocer que el alumno cargo el archivo de la fase y el caso correctos, y no publica
   identificadores. Los angulos de referencia del eje del ventriculo salen de la orientacion del eje
   corto que dejo el equipo. La clinica esta desidentificada: sin nombres, RUT, fechas ni firmas.
   Los valores del informe se muestran solo al terminar, para comparar con lo que obtuvo el alumno. */
'use strict';
function cardiacoHash(texto){
 let h=0x811c9dc5;
 for(const byte of new TextEncoder().encode(String(texto||''))){h^=byte;h=Math.imul(h,0x01000193)>>>0;}
 return h.toString(16).padStart(8,'0');
}
const CARDIACO_RECETA={iteraciones:2,subconjuntos:8,filtroMm:8.4};
const CARDIACO_GATILLADO={iteraciones:2,subconjuntos:8,filtroMm:8.4,intervalos:8};
const CARDIACO_TOLERANCIA={extension:10,fevi:10,vfdMl:30,angulo:12};
const CARDIACO_SIMULADOR='https://lucianotejadac.github.io/simulador-cardiaco/';
const CARDIACO_LAB95='https://lucianotejadac.github.io/spect-lab-95/';
const CARDIACO_FASES=['estres','reposo'];
const CARDIACO_NOMBRE_FASE={estres:'estrés',reposo:'reposo'};
const CARDIACO_CARPETA_FASE={estres:'Estres',reposo:'Reposo'};
// Tipos de volumen que salen de la primera parte y entran a la segunda.
const CARDIACO_TIPOS={NoAC:'sin corrección de atenuación',AC:'con corrección de atenuación',gatillado:'gatillado, 8 intervalos, sin AC'};
// Nombre que encabeza el archivo exportado y la descripcion de la serie: es lo que permite al
// simulador de la segunda parte reconocer, leyendo el propio DICOM, que fase y que volumen es.
function cardiacoNombre(caso,fase,tipo){return `Caso ${caso} ${fase} ${tipo}`;}
function cardiacoReconoceNombre(descripcion,caso,fase,tipo){
 const texto=String(descripcion||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_-]+/g,' ').toLowerCase();
 if(!new RegExp(`caso\\s*${caso}(?!\\d)`).test(texto)||!texto.includes(fase))return false;
 if(tipo==='gatillado')return /gatillad/.test(texto);
 if(tipo==='AC')return /(^|[^a-z])ac($|[^a-z])/.test(texto)&&!/noac|no ac|nac\b/.test(texto)&&!/gatillad/.test(texto);
 if(tipo==='NoAC')return /noac|no ac/.test(texto)&&!/gatillad/.test(texto);
 return false;
}
// Preguntas sobre el procesamiento, comunes a los casos: se discuten con la primera parte hecha.
const CARDIACO_PREGUNTAS_PROCESO=[
 'Las dos OSEM de una fase, sin AC y con AC, salen de las mismas proyecciones. ¿En qué pared cambió más la intensidad relativa y por qué justamente ahí? Relaciónalo con lo que atraviesan los fotones desde la pared inferior.',
 'El registro SPECT/CT lo hiciste a mano. Si hubieras dejado 10 mm de error hacia la izquierda del paciente, ¿qué pared se habría corregido de más y cuál de menos? ¿Cómo se ve eso en el mapa polar? Puedes comprobarlo: vuelve al paso 2, deja el CT corrido 10 mm a propósito, confirma el registro y reconstruye con AC otra vez; el historial conserva las dos.',
 'El CT de atenuación cubre unos 15 a 24 cm en el eje del paciente y el SPECT 42 cm. ¿Por qué el equipo no adquiere más CT, y qué pasa con los cortes del SPECT que quedan fuera?',
 'La FBP con filtro rampa muestra la pared inferior más apagada que la OSEM con AC, y también más ruido. Separa las dos causas: qué se debe al algoritmo y qué a la atenuación.',
 'El gatillado reparte las mismas cuentas en 8 intervalos. ¿Cuántas cuentas por vista te quedaron en cada intervalo respecto a la adquisición no gatillada, y qué consecuencia tiene eso para la reconstrucción y para el filtro que aplicaste?'
];
// Preguntas orales comunes: cinco por estudiante, 10 minutos, con sus imagenes proyectadas.
const CARDIACO_PREGUNTAS_ORALES=[
 {titulo:'Indicación y protocolo',segundos:90,
  pregunta:'¿Qué pregunta clínica trae tu caso y qué protocolo se usó: estrés físico o farmacológico, un día o dos días, qué dosis en cada fase y por qué esa proporción? ¿Qué cambia en la imagen cuando la fase de baja dosis es el estrés?',
  preparar:'Usa el antecedente y el procedimiento del caso, y los segundos por vista y las cuentas que leíste en el control de calidad de cada fase.'},
 {titulo:'Adquisición y control de calidad',segundos:120,
  pregunta:'Describe la órbita (dos cabezales a 90°, 32 pasos de 2,8°, 180°), las dos ventanas de energía y lo que viste en el cine y el sinograma: ¿hubo movimiento, actividad extracardíaca, cuentas suficientes? ¿Qué hizo la copia «QC Corrected» del equipo?',
  preparar:'Anota lo que midió el simulador en la cruda y, con la copia corregida cargada, usa la casilla «ver la copia corregida» para comparar su cine y su sinograma con los de la cruda.'},
 {titulo:'Reconstrucción y corrección de atenuación',segundos:120,
  pregunta:'Explica por qué reconstruiste con OSEM y no con FBP, qué hace el mapa μ y cómo registraste el CT. Muestra en tus cortes la diferencia entre la reconstrucción sin AC y con AC, y di cuál elegiste para leer la perfusión y por qué.',
  preparar:'Ten a mano las dos páginas de cortes (sin AC y con AC) y el residuo del registro que informó el simulador.'},
 {titulo:'Reorientación, cortes y mapa polar',segundos:180,
  pregunta:'Muestra tus ejes corto, largo vertical y largo horizontal de estrés y reposo, y el mapa polar. Nombra los 17 segmentos con su territorio coronario, describe los defectos y di si son reversibles, fijos o parcialmente reversibles.',
  preparar:'Usa el PNG de cortes y el del mapa polar. Ubica anterior, septal, inferior y lateral antes de hablar de arterias.'},
 {titulo:'Función ventricular y decisión',segundos:90,
  pregunta:'Con el gatillado: ¿qué intervalos elegiste como fin de diástole y fin de sístole, qué FEVI aproximada obtuviste y qué motilidad describes por pared? Justifica una decisión propia del procesamiento y cuánto te alejas del informe.',
  preparar:'Al cerrar el caso el simulador muestra los valores del informe: explica la diferencia, no la escondas.'}
];
const CARDIACO_CASOS={
 1:{
  titulo:'Dipiridamol de un día; estrés de 9 mCi',
  resumen:'Un día, estrés de baja dosis primero. Sin reconstrucciones del equipo: aquí todo lo haces tú.',
  clinica:{
   antecedentes:'59 años. Cardiopatía coronaria en estudio. Infarto al miocardio en 2009. Hipertensión, diabetes tipo 2, dislipidemia, EPOC, enfermedad renal crónica, tromboembolismo pulmonar recurrente, obesidad severa, apnea del sueño severa, amputación transmetatarsiana izquierda.',
   procedimiento:'Tc-99m sestamibi: 9,16 mCi en estrés farmacológico con dipiridamol y 36,5 mCi en reposo, protocolo de un día. Gatillado con ECG en ambas fases. CT de baja dosis para corrección de atenuación. Comparación con base de datos normales (Cedars). Informe de la fase de estrés: sin evidencias de isquemia.'
  },
  particularidades:[
   'La fase de estrés se adquirió dos veces ese día; se entrega la segunda, que fue la que el equipo procesó, y su CT se llama «AC STRESS 2».',
   'No hay reconstrucciones del equipo en la exportación de este caso: las tuyas son las únicas. En la segunda parte no tendrás eje corto de referencia.',
   'Solo hay CT de 512×512; no viene la versión remuestreada a 128.',
   'Con 9 mCi en estrés, las proyecciones de esa fase tienen pocas cuentas: fíjate en el ruido del sinograma y de la FBP.'
  ],
  preguntas:[
   'El informe describe un defecto lateral fijo con un pequeño componente reversible apical, y otro defecto septal que revierte por completo. ¿Con qué criterio separaste lo fijo de lo reversible en tu mapa polar?',
   'La FEVI de estrés (80 %) es mayor que la de reposo (68 %). ¿Es esperable? ¿Qué papel juegan las cuentas de la fase de baja dosis en la estimación de volúmenes?',
   'Este paciente tiene obesidad severa. ¿Dónde esperas que la corrección de atenuación cambie más la imagen, y coincidió con lo que viste?',
   'Un infarto lateral con isquemia septal sugiere más de un territorio. Nombra las arterias comprometidas y explica cómo lo dedujiste de los segmentos.',
   'El estrés se repitió el mismo día. ¿Qué motivos justifican repetir una adquisición y qué costo tiene para el paciente?'
  ],
  fases:{
   estres:{marco:'47035bf4',segundosPorVista:25.6,qc:true,ct:{'CT 512':41},eje:null,
    guia:'Estrés de baja dosis: pocas cuentas. En el cine busca el corazón a la izquierda de la imagen anterior, y fíjate si el hígado o el intestino brillan cerca de la pared inferior.'},
   reposo:{marco:'f70648af',segundosPorVista:20.6,qc:false,ct:{'CT 512':35},eje:null,
    guia:'Reposo de alta dosis: el hígado suele estar caliente. No hay copia «QC Corrected» de esta fase: juzga el movimiento tú.'}
  },
  referencia:{extension:{estres:25,reposo:15},qps:{estres:30,reposo:15},fevi:{estres:80,reposo:68},vfd:{estres:69,reposo:49},tid:0.77,sds:3,
   hallazgos:'Cavidad ventricular izquierda de tamaño conservado en ambas fases, sin dilatación post estrés. LHR 0,37. Menor perfusión lateral basal, media y apical, similar en estrés y reposo, de aproximadamente 15 % del ventrículo, con reversibilidad apical lateral (5 %). Pequeño defecto septal apical y medio que revierte en reposo, de aproximadamente 10 %. SSS 11, SRS 10, SDS 3. Motilidad conservada en ambas fases, sin disminución del engrosamiento.',
   impresion:'Defecto de perfusión lateral de 15 % de extensión con 5 % de isquemia apical, compatible con infarto y leve isquemia periinfarto. Defecto septal apical y medio de 10 % que revierte completamente en reposo, compatible con isquemia. Función ventricular izquierda global y segmentaria dentro de límites normales.'}
 },
 2:{
  titulo:'Esfuerzo físico con bypass; todas las referencias del equipo',
  resumen:'Esfuerzo físico submáximo en un paciente de 81 años con bypass. Trae CT en las dos matrices y todas las reconstrucciones del equipo.',
  clinica:{
   antecedentes:'81 años. Hipertensión. Doble bypass coronario en 2022. Dislipidemia. Tabaquismo suspendido hace 40 años.',
   procedimiento:'Tc-99m sestamibi: 16,4 mCi en estrés con esfuerzo físico (protocolo de Bruce, 3 min 39 s, 2,5 METs, 91 % de la frecuencia cardíaca máxima teórica) y 30,8 mCi en reposo. Gatillado con ECG en ambas fases. CT de baja dosis para corrección de atenuación. Comparación con base de datos normales (Cedars). Prueba de esfuerzo submáxima negativa para isquemia, capacidad funcional disminuida.'
  },
  particularidades:[
   'Estrés físico submáximo: menos flujo diferencial que con un vasodilatador.',
   'Este caso trae todas las referencias del equipo: transversal, eje corto sin y con AC, y gatillado reconstruido.',
   'Vas a tener que decidir con cuál reconstrucción informas, sin AC o con AC. Mira con atención qué hay debajo de la pared inferior antes de decidir.'
  ],
  reveladas:[
   'El informe usó las imágenes sin corrección de atenuación: en reposo había actividad intestinal pegada a la pared inferior y la AC la exageraba.',
   'Es un corazón pequeño (VFD 69 y 49 mL en QGS). Con vóxeles de 3,3 mm la cavidad casi se cierra en sístole por volumen parcial y la FEVI se sobreestima; QGS también lo hace en corazones pequeños. Si tu FEVI salió más alta que la del informe, ese es el motivo antes que un error de eje.'
  ],
  preguntas:[
   '¿Por qué la actividad intestinal altera más la imagen con corrección de atenuación que la imagen sin corregir? Piensa en qué hace la AC con las cuentas cercanas a la pared inferior.',
   'El informe dice «sin defectos fijos sugerentes de infarto» en un paciente con bypass. ¿Qué significa un estudio de perfusión normal después de una revascularización?',
   'La prueba de esfuerzo fue submáxima. ¿Qué limita eso en la sensibilidad del estudio y por qué a veces se prefiere estrés farmacológico en estos pacientes?',
   'Compara tu mapa polar sin AC con el de AC: ¿cuál se parece más al informe y cuál habrías elegido tú, con qué argumento?',
   'Describe la hipoquinesia septal que menciona el informe y qué otras causas, además de la isquemia, puede tener.'
  ],
  fases:{
   estres:{marco:'663395c5',segundosPorVista:25.8,qc:true,ct:{'CT 512':49,'CT 128':74},eje:{azimut:40.4,elevacion:10.6},
    guia:'Mira el cine con calma: la actividad subdiafragmática (hígado e intestino) está justo debajo del corazón. Compara con la copia «QC Corrected».'},
   reposo:{marco:'8da18c01',segundosPorVista:20.6,qc:true,ct:{'CT 512':44,'CT 128':66},eje:{azimut:48.4,elevacion:13.6},
    guia:'Reposo de alta dosis. Recorre el cine mirando qué hay debajo del corazón y después compara la pared inferior entre la OSEM sin AC y con AC, corte a corte.'}
  },
  referencia:{extension:{estres:10,reposo:0},qps:null,fevi:{estres:67,reposo:68},vfd:{estres:55,reposo:68},tid:0.8,sds:5,
   hallazgos:'Cavidad ventricular izquierda de tamaño conservado en ambas fases, sin dilatación post estrés. LHR 0,36. En las imágenes sin corrección de atenuación, defecto de perfusión de leve a moderada intensidad inferolateral apical, medio y basal, de aproximadamente 10 % del ventrículo, con reversibilidad completa en reposo (SSS 6, SRS 1, SDS 5). Las imágenes con corrección de atenuación presentan actividad extracardíaca intestinal en reposo que altera la cuantificación, por lo que no se consideraron. Leve a moderada hipoquinesia septal en ambas fases, con leve disminución del engrosamiento inferoseptal medio basal.',
   impresion:'Defecto de perfusión reversible inferolateral de 10 % de extensión, con reversibilidad completa, compatible con isquemia. Sin defectos fijos sugerentes de infarto. Función ventricular izquierda y volumen dentro de límites normales, sin cambios post estrés, con leve a moderada hipoquinesia septal e inferoseptal en ambas fases.'}
 },
 3:{
  titulo:'Bloqueo de rama izquierda; estrés una semana después',
  resumen:'Protocolo de dos días con el estrés repetido una semana más tarde. El CT del estrés viene mal rotulado.',
  clinica:{
   antecedentes:'80 años. Enfermedad cardíaca hipertensiva sin insuficiencia cardíaca. Accidente cerebrovascular en 2018. Bloqueo completo de rama izquierda.',
   procedimiento:'Tc-99m sestamibi, protocolo de dos días: fase de reposo inicial con 31 mCi; fase de estrés farmacológico con dipiridamol (0,57 mg/kg) una semana después. Gatillado con ECG en ambas fases. CT de baja dosis para corrección de atenuación. Comparación con base de datos Cedars; reprocesamiento de la función en Cedars.'
  },
  particularidades:[
   'El estrés se adquirió una semana después del reposo, con 17 s por vista en vez de 25: menos tiempo, menos cuentas.',
   'La fase de estrés solo trae CT de 512 y no tiene copia «QC Corrected» ni reconstrucciones del equipo; el reposo sí.',
   'Fíjate en cómo vienen rotulados los archivos de cada fase y en qué acepta y qué rechaza el simulador al cargarlos.'
  ],
  reveladas:[
   'El CT de la fase de estrés está rotulado «AC REST» por el equipo. Es un error de rotulación real: su marco de referencia demuestra que pertenece al estrés, y por eso el simulador lo aceptó.',
   'Con bloqueo de rama izquierda, el septo puede verse hipoperfundido sin enfermedad coronaria, sobre todo con estrés físico. Por eso el estrés fue farmacológico.'
  ],
  preguntas:[
   '¿Por qué el bloqueo completo de rama izquierda produce un defecto septal reversible sin estenosis coronaria, y por qué eso obliga a preferir el estrés con vasodilatador?',
   'El estrés se hizo una semana después del reposo, con menos tiempo por vista. ¿Qué precauciones toma un protocolo de dos días para que las dos fases sean comparables?',
   'El CT del estrés dice «AC REST». ¿Cómo te diste cuenta de que igual era el correcto, y qué habría pasado si hubieras usado el CT del reposo?',
   'El informe separa una isquemia apical pequeña de una alteración anteroseptal atribuida al bloqueo. ¿Qué argumento usa para separar lo isquémico de lo eléctrico?',
   'Tu tutorial midió movimiento en el cine. ¿Cómo se ve el movimiento del paciente en el sinograma y por qué la fase sin copia corregida te obliga a juzgarlo tú?'
  ],
  fases:{
   estres:{marco:'94c6c6d3',segundosPorVista:18.5,qc:false,ct:{'CT 512':37},eje:null,
    guia:'17 s por vista: proyecciones más ruidosas. No hay copia corregida del equipo: el movimiento lo juzgas tú. El CT de esta fase es el de su propia carpeta, con el nombre que traiga.'},
   reposo:{marco:'5237cb67',segundosPorVista:15.6,qc:true,ct:{'CT 512':31,'CT 128':46},eje:{azimut:19.5,elevacion:6.4},
    guia:'Reposo con 31 mCi y 15 s por vista. Compara tu eje corto con el del equipo, que en este caso viene en la carpeta de referencia.'}
  },
  referencia:{extension:{estres:15,reposo:10},qps:{estres:18,reposo:6},fevi:{estres:61,reposo:65},vfd:null,tid:null,sds:7,
   hallazgos:'Cavidad ventricular izquierda de volúmenes conservados en ambas fases, sin dilatación transitoria post estrés. Sin captación pulmonar. Heterogeneidad de captación en las paredes, en contexto de hipertrofia ventricular izquierda. En estrés, defecto de perfusión anteroseptoapical de aproximadamente 15 % del ventrículo, con reversibilidad parcial en el ápex; persiste un defecto anteroseptal de 10 %, probablemente por alteración de conducción tipo bloqueo de rama izquierda. SDS 7. Gatillado con leve hipoquinesia anteroseptal concordante con el bloqueo.',
   impresion:'Leve isquemia apical de 5 % del ventrículo izquierdo. Alteración de perfusión anteroseptal determinada por alteración de conducción tipo bloqueo completo de rama izquierda. Función global conservada, con hipoquinesia anteroseptal.'}
 },
 4:{
  titulo:'Esfuerzo físico de un día con bloqueo de rama',
  resumen:'Esfuerzo físico, protocolo de un día, prueba indeterminada por el bloqueo. Se procesa completo, sea lo que sea que muestre.',
  clinica:{
   antecedentes:'62 años. Sospecha de cardiopatía coronaria. Hipertensión arterial, tabaquismo suspendido. Prueba de esfuerzo: frecuencia máxima 85 % del teórico, sin angina, indeterminada por bloqueo completo de rama izquierda con el alza de frecuencia; capacidad funcional I.',
   procedimiento:'Tc-99m sestamibi: 9,97 mCi en esfuerzo (protocolo de Bruce) y 29,71 mCi en reposo, protocolo de un día. Gatillado con ECG en ambas fases. Corrección de atenuación con CT de baja dosis. Procesado con Cedars QGS-QPS.'
  },
  particularidades:[
   'El reposo se adquirió dos veces; se entrega el que el equipo procesó.',
   'Bloqueo de rama izquierda con estrés físico: revisa el septo con especial cuidado y decide si lo que ves es perfusión o conducción.'
  ],
  reveladas:[
   'El estudio es normal: el objetivo era demostrar que no hay defecto, con la misma rigurosidad que si lo hubiera.',
   'Con bloqueo de rama izquierda y esfuerzo físico puede aparecer un defecto septal falso. Aquí no apareció.'
  ],
  preguntas:[
   '¿Cómo se demuestra que una perfusión es normal? Enumera qué miraste en los tres ejes y en el mapa polar antes de afirmarlo.',
   'La FEVI de reposo (59 %) es menor que la de estrés (68 %). ¿Qué variabilidad tiene la FEVI por SPECT gatillado y con qué cuentas por intervalo trabajaste?',
   'Con bloqueo de rama izquierda y esfuerzo físico se esperaría un posible defecto septal falso. ¿Por qué no lo hubo, y qué habrías hecho si hubiera aparecido?',
   'Compara tu mapa polar sin AC con el de AC en la pared inferior: ¿cuánto sube la pared inferior con la AC en un corazón normal?',
   'El reposo se repitió. ¿Qué mirarías en las proyecciones para decidir repetir una fase?'
  ],
  fases:{
   estres:{marco:'c875c4e8',segundosPorVista:25.8,qc:true,ct:{'CT 512':33,'CT 128':50},eje:{azimut:25.4,elevacion:13.4},
    guia:'Estrés de baja dosis con esfuerzo físico. Fíjate en la relación corazón/hígado: con esfuerzo el hígado capta menos que con vasodilatador.'},
   reposo:{marco:'82f8b8a8',segundosPorVista:20.8,qc:true,ct:{'CT 512':31,'CT 128':46},eje:{azimut:24.4,elevacion:15.4},
    guia:'Reposo de alta dosis. Compara la pared inferior antes y después de la AC y anota cuánto cambia.'}
  },
  referencia:{extension:{estres:0,reposo:0},qps:{estres:0,reposo:0},fevi:{estres:68,reposo:59},vfd:{estres:93,reposo:95},tid:0.87,sds:1,
   hallazgos:'Cavidad ventricular izquierda de volumen normal. Perfusión miocárdica conservada en estrés y reposo. Contractilidad global y segmentaria normal en ambas fases.',
   impresion:'SPECT de perfusión miocárdica sin evidencias de insuficiencia del riego coronario. Función sistólica ventricular izquierda conservada.'}
 },
 5:{
  titulo:'Dipiridamol de dos días; el equipo pidió contornos manuales',
  resumen:'Dos días, reposo tres días antes del estrés. QPS y QGS marcaron falla de máscara y el equipo corrigió los contornos a mano.',
  clinica:{
   antecedentes:'68 años. Hipertensión esencial. Refiere cardiomegalia y bloqueo completo de rama izquierda. Dislipidemia. Nicturia.',
   procedimiento:'Tc-99m sestamibi, protocolo de dos días: reposo con 25 mCi; estrés farmacológico con dipiridamol (0,57 mg/kg) con 25 mCi tres días después. Gatillado con ECG en ambas fases. CT de baja dosis para corrección de atenuación. Comparación con base de datos Cedars.'
  },
  particularidades:[
   'Los contornos automáticos de QPS y QGS fallaron («Mask Failure») y el equipo los corrigió a mano. Piensa por qué mientras marcas tu eje y tu cavidad.',
   'El buscador de anillo normal puede no bastar aquí: si el eje corto no parece un anillo, ajusta el techo de la escala y el largo del eje.',
   'Este caso trae dos series remuestreadas de CT por fase en el equipo; se entrega la última.'
  ],
  reveladas:[
   'El ventrículo izquierdo está severamente dilatado, con VFD de 708 mL, y la captación es marcadamente heterogénea en todas las paredes.',
   'FEVI de 7 % en estrés y 10 % en reposo: por eso en el cine gatillado casi no se ve engrosamiento.'
  ],
  preguntas:[
   '¿Por qué fallan los algoritmos de contorno automático en un ventrículo muy dilatado y de paredes delgadas? ¿Qué supuestos geométricos usan?',
   'El informe llama «probable miocardiopatía dilatada» a la heterogeneidad de captación. ¿Qué la distingue de un infarto extenso en la imagen de perfusión?',
   'Con FEVI de 7 %, ¿qué sentido tiene comparar estrés y reposo? ¿Qué aporta aquí la disquinesia septal que describe el informe?',
   'Tu estimación de volumen por umbral, ¿se acercó a 700 mL? Explica por qué un método por umbral subestima o sobreestima en cavidades grandes.',
   'El informe encuentra una pequeña isquemia apical y lateroapical de 8 %. ¿Con qué confianza se puede afirmar una isquemia pequeña sobre una captación tan heterogénea?'
  ],
  fases:{
   estres:{marco:'98f47a47',segundosPorVista:25.9,qc:true,ct:{'CT 512':38,'CT 128':57},eje:{azimut:46.4,elevacion:3.6},
    guia:'Mide el corazón a ojo en el cine antes de reconstruir y compáralo con los otros órganos. Baja el techo de la escala si las paredes se ven tenues.'},
   reposo:{marco:'b56599b0',segundosPorVista:20.7,qc:true,ct:{'CT 512':40,'CT 128':60},eje:{azimut:49.4,elevacion:3.6},
    guia:'Reposo adquirido tres días antes del estrés. El eje largo está casi horizontal (elevación de unos 4°): marca con cuidado el eje en el largo vertical.'}
  },
  referencia:{extension:{estres:25,reposo:17},qps:{estres:36,reposo:16},fevi:{estres:7,reposo:10},vfd:{estres:708,reposo:655},tid:1.05,sds:6,
   hallazgos:'Cavidad ventricular izquierda severamente dilatada, VFD 708 mL post estrés y 655 mL en reposo, TID 1,05. Sin captación pulmonar. En estrés, captación marcadamente heterogénea con hipocaptación inferior y lateral, segmentos medios y basal, y ápex, de aproximadamente 25 % del ventrículo. En reposo, discreta mayor captación apical y lateroapical, persistiendo un defecto de aproximadamente 17 %. SDS 6. Gatillado con hipoquinesia difusa severa y disquinesia septal concordante con bloqueo de rama izquierda, en ambas fases.',
   impresion:'Marcada heterogeneidad de captación en el ventrículo izquierdo, probablemente por miocardiopatía dilatada. En ese contexto, defecto reversible apical y lateroapical de aproximadamente 8 % que podría corresponder a una pequeña isquemia. Defecto lateral e inferior sin variaciones. Severa hipoquinesia difusa con disquinesia septal y severa disfunción ventricular en ambas fases.'}
 },
 6:{
  titulo:'Dipiridamol de un día, sin CT en la exportación',
  resumen:'Caso de reserva. La exportación no trae CT: la primera parte termina en la OSEM sin corrección de atenuación.',
  clinica:{
   antecedentes:'74 años. Dolor torácico en estudio. Hipertensión arterial, diabetes mellitus, dislipidemia.',
   procedimiento:'Tc-99m sestamibi: 10,48 mCi en estrés farmacológico con 39 mg de dipiridamol y 34,4 mCi en reposo, protocolo de un día. Gatillado con ECG en ambas fases. El informe menciona corrección de atenuación con CT de baja dosis, pero el CT no está en la exportación. Procesado con Cedars QGS-QPS. Sin angina ni cambios electrocardiográficos durante el estrés.'
  },
  particularidades:[
   'No hay CT en la exportación: no puedes registrar ni corregir atenuación. La primera parte termina con la OSEM sin AC y el gatillado; en la segunda parte trabajas solo con esos volúmenes.',
   'Tampoco hay copias «QC Corrected» ni reconstrucción transversal del equipo, pero sí varios intentos de eje corto: se entrega el último.',
   'Sin AC, la pared inferior siempre se ve más apagada. Tendrás que argumentar cuánto de lo que ves es atenuación y cuánto no, sin poder corregirla.'
  ],
  reveladas:[
   'El informe advierte que en reposo la perfusión inferior anteroapical está sobreestimada por actividad extracardíaca.'
  ],
  preguntas:[
   'Sin CT, ¿qué parte del defecto inferior podría ser atenuación y no infarto? ¿Qué te permitiría separarlos sin corrección de atenuación?',
   'El informe describe un defecto inferior e inferoseptal de 23 % en estrés que mejora a 18 % en reposo. ¿Cómo se llama ese patrón y qué implica para el tratamiento?',
   'El informe dice que en reposo la actividad extracardíaca sobreestima la perfusión inferior. ¿Por qué la vecindad del hígado o el intestino sube la pared inferior en la reconstrucción?',
   'Hipoquinesia inferior leve con FEVI conservada: ¿qué esperarías del engrosamiento en ese segmento y por qué el gatillado ayuda a confirmar un infarto?',
   'Con 10 mCi en estrés, ¿cuántas cuentas por vista tuviste en cada intervalo gatillado? ¿Alcanza para una FEVI confiable?'
  ],
  fases:{
   estres:{marco:'7fb58483',segundosPorVista:25.9,qc:false,ct:{},eje:{azimut:28.4,elevacion:13.5},
    guia:'Sin CT ni copia corregida. Juzga el movimiento en el cine y el sinograma, y fíjate en la actividad subdiafragmática de las dos fases.'},
   reposo:{marco:'b2b87b49',segundosPorVista:20.9,qc:false,ct:{},eje:{azimut:37.4,elevacion:15.5},
    guia:'Reposo de alta dosis. Mira la actividad subdiafragmática: el informe dice que sobreestima la perfusión inferior.'}
  },
  referencia:{extension:{estres:23,reposo:18},qps:null,fevi:{estres:61,reposo:57},vfd:{estres:59,reposo:66},tid:null,sds:null,
   hallazgos:'Cavidad ventricular izquierda de volumen normal, VFD aproximado 59 mL post estrés y 66 mL en reposo. En estrés, defecto de perfusión inferior e inferoseptal de aproximadamente 23 % de la pared ventricular; en reposo, mejoría parcial, con 18 %. Resto del ventrículo con perfusión conservada. En reposo, la perfusión inferior anteroapical está sobreestimada por actividad extracardíaca. Leve hipoquinesia inferior en ambas fases.',
   impresion:'Hallazgos compatibles con infarto inferior e inferoseptal, con leve a moderada isquemia residual. Función sistólica ventricular izquierda conservada.'}
 }
};
