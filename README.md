# Simulador cardíaco

Segunda parte del procesamiento de un SPECT/CT de perfusión miocárdica, con una interfaz inspirada en Windows 95. La primera parte (control de calidad de las proyecciones, FBP, registro con el CT, OSEM sin y con corrección de atenuación, reconstrucción gatillada) se hace en [SPECT Lab 95](https://lucianotejadac.github.io/spect-lab-95/) con su **Tutorial cardíaco**; los volúmenes exportados allí se cargan aquí.

## Qué hace

1. **Cargar** las OSEM exportadas por fase (sin AC, con AC y gatillado). El simulador las reconoce por la descripción de serie que quedó dentro del DICOM («Caso N estres AC», etc.).
2. **Reorientar**: marcar el eje largo del ventrículo izquierdo en la transaxial y en el eje largo vertical. Los ángulos se comparan con los que usó el equipo, guardados en el manifiesto del caso.
3. **Cortes**: página con eje corto del ápex a la base, eje largo vertical y eje largo horizontal, estrés arriba y reposo abajo, con o sin corrección de atenuación.
4. **Mapa polar** de 17 segmentos: estrés, reposo y reversibilidad, con umbral de defecto ajustable y extensión bajo el umbral. Sin base de datos normal: es una aproximación declarada.
5. **Gatillado**: cine de los 8 intervalos en los tres ejes, cavidad por umbral, fin de diástole y fin de sístole, volúmenes y FEVI aproximados.
6. **Cierre**: al completar el caso, el tutorial revela los valores del informe y la impresión diagnóstica para comparar, con tolerancias.

Los productos son tres PNG: cortes, mapa polar y gatillado.

## Tutorial

`?caso=N` abre el tutorial en ese caso. Enlaces por caso: [1](https://lucianotejadac.github.io/simulador-cardiaco/?caso=1) · [2](https://lucianotejadac.github.io/simulador-cardiaco/?caso=2) · [3](https://lucianotejadac.github.io/simulador-cardiaco/?caso=3) · [4](https://lucianotejadac.github.io/simulador-cardiaco/?caso=4) · [5](https://lucianotejadac.github.io/simulador-cardiaco/?caso=5) · [6](https://lucianotejadac.github.io/simulador-cardiaco/?caso=6). La primera parte de cada caso está en `https://lucianotejadac.github.io/spect-lab-95/?cardiaco=N`.

`cardiaco-casos.js` es idéntico en los dos repositorios: clínica desidentificada, marcos de referencia como hash, ángulos del eje del equipo, valores del informe y preguntas. Los DICOM no forman parte del repositorio.

## Privacidad y alcance

Todo ocurre en el navegador; ningún archivo se envía a un servidor. Los casos están desidentificados. Es un simulador docente: no está validado para diagnóstico ni decisiones clínicas. Incluye dicom-parser (MIT). Las decisiones de diseño están en `BITACORA.md`.
