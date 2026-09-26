# Bitácora de decisiones

Registro de lo que se pidió, lo que se decidió y por qué, para el APG de SPECT/CT de perfusión miocárdica: primera parte en SPECT Lab 95 (`lucianotejadac/spect-lab-95`, tutorial cardíaco) y segunda parte en este repositorio. Esquema de un registro de decisiones (ADR): contexto, decisión, alternativas descartadas, consecuencias. Los detalles de implementación están en los mensajes de commit.

Sin datos de pacientes: los casos están desidentificados y esta bitácora tampoco los nombra.

---

## 2026-09-23 · De la exportación del equipo a las dos partes del tutorial

Participantes: Luciano Tejada (docente) y Claude (Claude Code).

### 1. Revisar antes de proponer, y reutilizar antes de escribir

**Contexto.** Seis estudios reales de perfusión miocárdica exportados en un CD de PACS con su visor: proyecciones crudas, gatilladas, copias «QC Corrected», reconstrucciones del equipo, CT de atenuación en 512 y remuestreado a 128, pantallas de QGS/QPS con el nombre del paciente quemado, objetos RESULTS privados e informes en PDF. Nada anonimizado.

**Decisión.** Analizar todo primero (inventario por archivo, informes, pantallas) y proponer un plan con preguntas numeradas. La primera propuesta dejaba la corrección de atenuación fuera «por costo»; el docente preguntó por qué no se usaba lo ya construido para paratiroides. Revisado `spect-lab-95`, la cadena completa (lector NM multidetector y multiventana, mapa μ desde el CT, registro manual, OSEM con pesos de atenuación, exportación NM) ya existía y estaba probada con datos Siemens. La AC pasó de opcional a obligatoria y el plan cambió a dos partes, como paratiroides.

**Lección.** Revisar los repositorios propios antes de proponer escribir algo de nuevo. Quedó anotado en la memoria de trabajo.

### 2. Qué se entrega y qué no

**Hallazgos que decidieron la selección.**
- Tres pacientes tenían adquisiciones repetidas. El marco de referencia (`FrameOfReferenceUID`) une cada adquisición con su CT y con las reconstrucciones que el equipo hizo de ella: eso decide cuál es la definitiva, no el nombre de la serie.
- En un caso de dos días, el estrés se adquirió una semana después del reposo, con 17 s por vista, y su CT quedó rotulado «AC REST». Por marco de referencia y por el informe («fase de estrés el 6/8»), esa es la definitiva; el «Stress» del primer día, con 40 s por vista y sus reconstrucciones, fue el descartado. Se entrega la definitiva con su CT mal rotulado, y el tutorial lo explica como error de rotulación real.
- Otro caso repitió el estrés el mismo día y el equipo procesó el segundo («AC STRESS 2»); otro repitió el reposo y procesó el primero.
- El primer estudio del CD no trae CT ni reconstrucción transversal: queda como caso 6 de reserva; su primera parte termina en la OSEM sin AC.
- `RetrieveAETitle` llevaba el nombre de la institución en todos los archivos; la institución y la estación están en otros tags; un médico derivador aparece como nombre de persona. Todo fuera.

**Decisión (docente).** Casos 1 a 5 por orden cronológico, uno por estudiante; caso 6 de reserva. Por fase: la cruda definitiva, su copia «QC Corrected» cuando existe, la gatillada cruda, las últimas reconstrucciones del equipo como referencia (transversal, eje corto sin y con AC, gatillado) y los dos CT. Fuera: repeticiones no definitivas, pantallas, RESULTS, KO, SR vacíos, PDF, topogramas y las capturas «Protocolo de paciente». Nombres de archivo descriptivos (`NM_estres.dcm`, `NM_estres_gatillado.dcm`, `CT 512\`, `Referencia equipo\`) porque cada fase trae hasta diez archivos y el estudiante ya no gana nada adivinándolos por número. Limpieza igual que renal y tiroides: sin tags privados, UID regenerados por caso (el marco de referencia se mantiene coherente entre el SPECT y el CT de una misma fase), «CARDIACO CASO n», verificación por bytes. Cero hallazgos en la verificación. Los ZIP quedaron en 27 a 36 MB: las gatilladas crudas comprimen mucho.

### 3. Dos partes, un manifiesto

**Decisión.** Primera parte dentro de SPECT Lab 95 como segundo tutorial, junto al de paratiroides, para mantener un solo motor; segunda parte aquí, con el estilo y el panel de tutorial de los simuladores renales. `cardiaco-casos.js` es idéntico en los dos repositorios: marcos de referencia como hash FNV-1a del UID regenerado, ángulos del eje del ventrículo deducidos de la orientación del eje corto que dejó el equipo, valores del informe para el cierre y preguntas. El nombre exportado («Caso N estres AC», «Caso N estres NoAC», «Caso N estres gatillado») viaja dentro del DICOM y es lo que la segunda parte reconoce.

**Descartado.** Un repositorio aparte copiando el motor de reconstrucción; reconocer archivos por hash de píxeles (aquí bastan el marco de referencia y la descripción de serie).

### 4. Lo que hubo que cambiar en el motor

- **FBP a 180°.** El worker exigía órbita completa y pesaba cada vista por sus huecos vecinos; con dos cabezales a 90° hay un hueco de 180° y las vistas extremas habrían pesado como media órbita. Ahora detecta la órbita parcial y pesa todas las vistas por el paso angular; con haz paralelo, 180° bastan.
- **CT con hasta 1° de inclinación.** Los CT remuestreados a 128 traen medio grado; a 3,3 mm de vóxel el desplazamiento en el borde es menor que un vóxel. Se tratan como axiales.
- **Gatillado.** El lector acepta `TimeSlotVector` (0054,0070; la (0054,0100) es el vector de tiempo de las dinámicas, y confundirlas hizo que el primer intento reconstruyera los ocho intervalos sumados) y un intervalo se convierte en una adquisición propia (`Lab95.gate`). Sin la opción, una gatillada se rechaza con una explicación, porque FBP y OSEM la habrían tratado como vistas duplicadas. Los 8 intervalos se reconstruyen con la misma OSEM, sin AC y solo en los cortes del corazón, y se exportan como un solo NM multiframe con `TimeSlotVector` externo y `SliceVector` interno.
- **Control de calidad de proyecciones.** Cine, sinograma, linograma e imagen suma; medida automática del movimiento axial como corrimiento entero del perfil axial entre vistas vecinas (un centroide global saltaba entre corazón e hígado y daba 5 cm falsos); comparación vista por vista con la copia «QC Corrected» para decir cuántas vistas movió el equipo y cuánto.

### 5. Segunda parte: cómo se calculan las cosas y qué se declara aproximado

- **Reorientación.** Dos clics en la transaxial (base, ápex) dan el azimut y el centro; dos en el eje largo vertical dan la elevación y el largo. Convenciones de despliegue habituales: eje corto con anterior arriba, septo a la izquierda, lateral a la derecha; largo vertical con el ápex a la izquierda; largo horizontal con el ápex arriba. El eje del equipo se lee de `ImageOrientationPatient` de su eje corto y se compara con tolerancia de 12°; el estudiante ve cuánto se aleja, no el eje correcto.
- **Mapa polar.** Máximo radial por corte y sector, del ápex a la base, en porcentaje del máximo del mapa; 17 segmentos con territorios habituales; la extensión es la fracción del mapa bajo un umbral que elige el estudiante. Sin base de datos normal: aproximación declarada, con tolerancia de 10 puntos frente al informe.
- **Gatillado.** Cavidad segmentada por umbral en la pila de eje corto, conectada al centro y limitada en radio; volumen sumado corte a corte; fin de diástole y fin de sístole a mano o por volumen; FEVI con tolerancia de 10 puntos, volúmenes con 30 mL. El informe usa QGS, con superficies ajustadas: la diferencia se discute.
- **Cierre.** Tabla contra el informe y, cuando la pantalla del equipo lo decía, la extensión QPS como segunda referencia. Hallazgos e impresión se revelan solo ahí.

### 6. Validación

Pruebas sin interfaz en Chrome, con los DICOM reales de la entrega, en las dos partes y los seis casos, recorridas como un estudiante que tropieza: gatillada en el bloque de proyecciones, copia corregida como cruda, CT de la otra fase, exportar la OSEM de referencia con el nombre bueno, gatillada de la otra fase, proyección cruda en la segunda parte, eje 25° desviado. Las descargas son reales (Chrome las guarda en una carpeta por caso) y los archivos exportados por la primera parte son los que carga la segunda.

**Primera parte, seis casos, cero fallas.** Tiempo total de cálculo por caso entre 52 s (caso 6, sin CT) y 197 s: la FBP tarda 3 s, la OSEM 2×8 sin AC de 128 cortes 3 s, la OSEM con AC de los 45 a 72 cortes cubiertos por el CT entre 45 y 70 s (los factores de atenuación son lo caro), y los 8 intervalos gatillados de 30 a 55 cortes entre 4 y 7 s. Muy por debajo de los 15 a 25 minutos estimados.

**Segunda parte.** El tutorial completó los seis casos. Para validar los números sin un alumno que haga clic, el harness ubica el ventrículo con un buscador de anillos (eje corto con el eje de referencia; en el caso 1, que no lo tiene, con un eje típico) y fija el largo en 60 mm. Con eso, y los umbrales por omisión (defecto 50 %, cavidad 55 %):

| Caso | Extensión estrés / reposo (informe) | FEVI estrés / reposo (informe) | VFD estrés / reposo (informe) |
|---|---|---|---|
| 2 | 0 / 0 % (10 / 0) | 83 / 74 % (67 / 68) | 51 / 55 mL (55 / 68) |
| 3 | 6 / 4 % (15 / 10) | 49 / 42 % (61 / 65) | 100 / 66 mL (no consta) |
| 4 | 0 / 0 % (0 / 0) | 64 / 73 % (68 / 59) | 114 / 79 mL (93 / 95) |
| 5 | 5 / 8 % (25 / 17) | 11 / 11 % (7 / 10) | 824 / 615 mL (708 / 655) |
| 6 | 0 / 17 % (23 / 18) | 33 / 31 % (61 / 57) | 119 / 88 mL (59 / 66) |

El caso 5 (ventrículo de 700 mL, FEVI de 7 %) queda dentro de tolerancia en FEVI: el método por umbral no depende de la geometría que hace fallar a QGS. En el caso 2 la extensión con AC es cero porque el informe leyó las imágenes sin AC, que es justo lo que el caso enseña. La FEVI por umbral se mueve 10 a 15 puntos con el umbral (caso 2: 83 % al 50 %, 69 % al 65 %): por eso el umbral es del alumno y la tolerancia es de 10 puntos, no menos. En el caso 1 el buscador automático no encuentra el ventrículo del estrés (9 mCi, pocas cuentas, sin eje de referencia) y los números de ese caso no se validaron automáticamente; el tutorial sí completó sus seis pasos con ese eje equivocado, y un alumno marcando a mano no tiene ese problema.

**Lo que enseñaron las pruebas.**
- En la FBP, el hígado y el intestino ganan siempre al corazón: proponer el rango de cortes del gatillado por el máximo de cada corte lo mandaba al abdomen. Ahora se busca el anillo del eje corto sobre la última OSEM, dentro de la cobertura del CT cuando hay mapa μ, con dos tamaños de anillo (normal y dilatado) y castigando anillos desparejos, que es como se ve el borde del hígado.
- El nombre propuesto para exportar el gatillado quedaba con el de la fase anterior; ahora se reemplaza al terminar cada reconstrucción.
- Sin CT, «Siguiente» en el paso 2 pedía un CT y no dejaba avanzar: ahora pasa directo a la OSEM de referencia.
- Un centroide global como medida de movimiento saltaba entre corazón e hígado (5 cm falsos); el corrimiento entre vistas vecinas da 1 vóxel en las adquisiciones quietas.

### 7. Segunda revisión: lo que el simulador contaba antes de tiempo

**Contexto.** El docente preguntó si las cuarenta preguntas se podían responder con lo que el simulador muestra, y pidió analizar de nuevo. La segunda pasada encontró que varias ya estaban respondidas antes de procesar nada, en contra de la decisión de revelar el informe al final.

**Hallazgos.**
- Cinco de los seis títulos decían el diagnóstico. Las particularidades y las guías por fase adelantaban la trampa del caso 2, el rótulo «AC REST» del caso 3, la normalidad del caso 4, el volumen de 708 mL y la FEVI de 7 % del caso 5 y la advertencia del informe del caso 6.
- La copia «QC Corrected» es idéntica a la cruda en tres casos (1 estrés, 2 ambas fases, 3 reposo) y distinta en los casos 4 y 5. Al comparar píxel a píxel parecía un remuestreo fino, pero el comparador vista por vista mostró corrimientos enteros de hasta dos vóxeles en 33 y 44 de las 64 vistas del caso 4: ahí el equipo sí corrigió movimiento. El panel no dejaba ver la copia, así que la pauta oral pedía comparar un sinograma que no existía en pantalla.
- Tres preguntas piden las cuentas por intervalo gatillado y no se mostraban.

**Decisiones.** Títulos técnicos en los seis casos. Las pistas diagnósticas pasan a un campo `reveladas` del manifiesto que la segunda parte muestra en el cierre bajo «Lo que el tutorial no te dijo antes». El comparador de la copia corregida distingue idéntica, remuestreada bajo un vóxel y desplazada, y una casilla permite ver la copia en el cine, el sinograma y la suma. El bloque gatillado informa cuentas por intervalo y por vista y la fracción respecto a la cruda. El paso del CT ya no avisa el rótulo del caso 3: lo explica en su detalle después de aceptarlo, porque lo que decide es el marco de referencia, y la pregunta del error de registro de diez milímetros dice cómo comprobarlo.

### 8. Lo que apareció al usarlo con el mouse: caso 2

**Contexto.** El docente probó el caso 2 y tuvo muchos problemas. Las pruebas anteriores definían el eje por programa y siempre usaban la OSEM con AC; una prueba nueva que hace clic sobre los lienzos, carga la carpeta de referencia del equipo y alterna a la reconstrucción sin AC encontró cinco defectos que un alumno sí sufre.

**Defectos y arreglos.**
- **El tutorial arrastraba de vuelta a la pantalla 1.** El panel pide ir a la pantalla del primer paso pendiente en cada redibujo. Mientras la carga tuviera cualquier reparo, mover un control cualquiera devolvía al alumno al inicio y hacía imposible marcar el eje. Ahora la petición se obedece una sola vez por cambio de paso.
- **La carpeta «Referencia equipo» bloqueaba la carga.** La reconstrucción transversal del equipo no coincidía con ningún papel y quedaba como «no reconocido», un problema que nunca se resolvía. Cualquier reconstrucción sin «Caso N» en la descripción es ahora referencia y no bloquea. La OSEM 1×1 exportada por error se reconoce por su derivación y se ignora si existe la 2×8; solo bloquea si es la única.
- **Sin AC mostraba otra región del cuerpo.** El centro del eje se guardaba como índice de corte del volumen donde se marcó, pero la OSEM con AC trae solo los cortes cubiertos por el CT y la sin AC los 128: el mismo índice cae 49 cortes más abajo. Al alternar «Sin AC» la página de cortes mostraba el abdomen. El centro se traslada ahora entre volúmenes por la posición del primer corte, igual que ya se hacía con el gatillado.
- **El eje largo vertical se movía al marcarlo.** Los dos clics cambiaban el centro y el azimut, el plano se redibujaba y las marcas quedaban fuera del corazón. El plano queda congelado al terminar la transaxial.
- **El paso se daba por hecho con dos clics.** La elevación arrancaba en 10° por omisión y el tutorial aceptaba el eje sin el eje largo. Ahora queda pendiente hasta marcarlo o escribirla a mano.
- **La transaxial inicial caía en el hígado.** El corte inicial era el más brillante del centro del campo; ahora es el que pasa por el ventrículo según el buscador de anillos.

**Validación.** Prueba con clics reales en el caso 2: azimut y elevación quedan a menos de 2° del eje del equipo en las dos fases, el eje corto central es un anillo tanto con AC como sin AC, y la referencia del equipo y la 1×1 cargadas junto a los productos no bloquean nada. Los demás simuladores renales y de tiroides comparten el panel de tutorial y el mismo comportamiento de arrastre: no se tocaron.

### 9. La prueba con el mouse en los seis casos: el volumen dependía del largo del eje

**Contexto.** El docente pidió repetir la prueba de clics del caso 2 en todos los casos. Los casos 2, 3, 4 y 6 pasaron enteros; el 1 y el 5 no, y al investigar por qué aparecieron tres problemas que las pruebas anteriores tapaban porque marcaban un eje de 70 mm fijos.

**Lo que falló y por qué.**
- **Caso 5 (dilatado, VFD 708 mL).** Con un eje de 70 mm la región de búsqueda de la cavidad (radio 0,45 × largo) quedaba dentro de la cavidad y el relleno llenaba el disco entero en todos los intervalos: FEVI 1 %. Cuando la prueba pasó a medir el largo real del ventrículo (110 a 130 mm), los volúmenes de los casos normales se dispararon a 300–1300 mL: el relleno por umbral del corte se escapaba por el plano valvular, donde no hay pared que lo cierre, y sumaba discos enteros en los cortes basales. El volumen medía el largo del eje, no el ventrículo.
- **Caso 1 estrés (9 mCi).** El buscador de anillos puntuaba «sector más débil menos centro»; con pocas cuentas el ruido hunde siempre algún sector y el anillo verdadero daba negativo, así que se quedaba con un falso anillo del abdomen. Eso afectaba a la transaxial inicial de la segunda parte y, peor, al rango que propone la primera parte para el gatillado: la reconstrucción gatillada del estrés quedó fuera del corazón y ningún eje podía dar una FEVI.
- **Caso 1 reposo (corazón pequeño, VFD 49 mL).** Con vóxeles de 3,3 mm la cavidad se cierra en sístole por volumen parcial y la FEVI por umbral sale de 85 a 98 % contra 68 % del informe.

**Decisiones.**
- **Cavidad por rayos en vez de relleno.** En cada corte de eje corto se lanzan 72 rayos desde el centro; la pared es el primer máximo del rayo (se deja de buscar cuando la cuenta cae bajo el 70 % del máximo visto, para que el hígado detrás de la pared inferior no la reemplace) y el borde endocárdico es el primer punto que alcanza umbral × pared. Un rayo sin pared (máximo bajo el 30 % del percentil 99,5 de la pila) toma el radio medio de los demás; un corte con más de la mitad de los rayos sin pared no tiene cavidad y, si está en la mitad basal, cierra la cuenta hacia la base. El volumen ya no puede escaparse ni depende de cuánto más allá de la base quedó el clic. La tabla del gatillado informa los «cortes sin pared» y avisa si son muchos.
- **Umbral por defecto 75 % de la pared del rayo** (antes 55 % del máximo del corte). Con el barrido de 50 a 80 % en los seis casos, 75 % deja la FEVI a menos de 10 puntos del informe en los casos 1, 2, 3 y 6 y los volúmenes a menos de 30 mL, salvo el caso 5, donde subestima (530 contra 708 mL): es justamente lo que su pregunta 3 pide discutir.
- **Buscador de anillos con el promedio de los tres sectores más débiles** en las dos partes (`buscarVentriculo` y `buscarVentriculoFbp`). Encuentra el corazón del caso 1 estrés y no cambia el resultado en los otros casos. Los productos del caso 1 se regeneraron con la primera parte corregida: el rango propuesto para el gatillado del estrés pasó de los cortes 1–33 a los 25–54, y ahí sí hay corazón.
- **Revelada nueva en el caso 1** sobre el corazón pequeño y la sobreestimación de la FEVI, para que el alumno no lo lea como un error de eje.

**Validación.** Prueba de clics en los seis casos con el largo del ventrículo medido en la imagen: azimut y elevación a menos de 1° del eje del equipo en las diez fases con referencia, anillo en el eje corto central con AC y sin AC (8–12 % en el estrés del caso 1, que es ruidoso; 16–40 % en el resto), FEVI estrés/reposo 90/78 (informe 80/68) en el caso 1, 72/69 (67/68) en el 2, 67/66 (61/65) en el 3, 79/72 (68/59) en el 4, 19/14 (7/10) en el 5 y 62/54 (61/57) en el 6; VFD a menos de 30 mL del informe salvo el caso 5 (536/514 contra 708/655) y el estrés del caso 6 (105 contra 59, porque la prueba marcó un eje de 130 mm que se pasa de la base: 9 cortes sin pared, y el aviso nuevo lo señala). Los productos de la primera parte del caso 1 se regeneraron y verificaron; los de los demás casos no cambiaron.

### 10. L�nea del panel al control (26-09-2026)

**Contexto.** Al comparar con la consola TC (`consola-tc`), lo que m�s le faltaba a este tutorial era decir *d�nde* actuar: el contorno magenta sobre un panel entero no basta, y en el caso 2 el problema del docente fue justamente �d�nde hago clic�.

**Decisi�n.** Un m�dulo compartido, `tutorial-linea.js`, dibuja una l�nea de puntos animada desde el borde del panel del tutorial hasta el control resaltado, con punta de flecha y un carril por control cuando hay varios. La capa es fija, no recibe clics, se vuelve a medir sola cada 300 ms mientras haya objetivos (la p�gina se reacomoda al cargar vol�menes) y respeta `prefers-reduced-motion`. El panel solo la llama desde `resaltar`: `TutorialLinea.apuntar(panel, [controles])` y `limpiar()`. El m�dulo se expone en `window` porque los paneles preguntan por `window.TutorialLinea` y un `const` de nivel superior no crea esa propiedad: la primera prueba no dibuj� nada por eso. Es id�ntico en simulador-cardiaco, simulador-dmsa, simulador-renograma, simulador-tiroides y spect-lab-95 (paratiroides y card�aco).

**Validaci�n.** Capturas sin interfaz de los cinco simuladores en el primer paso de un caso: la l�nea sale del panel y llega al selector de archivos en todos.

### Pendientes y advertencias

- Las descripciones de serie del equipo se conservan tal cual, incluido el CT «AC REST» del estrés del caso 3: es material didáctico, no un error de la entrega.
- El caso 1 no tiene reconstrucciones del equipo ni eje de referencia para el estrés: la reorientación de esa fase se compara con el eje de reposo.
- La primera parte solo comprueba que el rango propuesto para el gatillado tenga un ancho razonable, no que contenga el corazón: la coronal que el alumno revisa es la única defensa. Convendría avisar si el anillo queda fuera del rango elegido.
- Nada se ha subido a U-Cursos: el docente pidió esperar.
