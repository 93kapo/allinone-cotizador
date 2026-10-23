# Cotizador - All In One Painting & Remodeling Group LLC

PWA privada para cotizar (celular primero). HTML/CSS/JS plano con módulos ES, **sin paso de build**.

> **AVISO LEGAL:** los textos legales de Florida (gravámenes FS 713.015, Fondo de Recuperación FS 489.1425, EPA RRP) son **plantillas editables** (Ajustes). **Revisar con abogado/contador; no es asesoría legal.** Los valores de costos son **estimados**: reemplazar con facturas reales.

## Probar en su computadora (modo local)
```
cd cotizador
python3 -m http.server 8765
```
Abra http://localhost:8765. Con `firebase-config.js` vacío la app corre en **MODO LOCAL** (IndexedDB, banner "Modo local: sin sincronizar"). Use Ajustes > Exportar/Importar respaldo JSON. Pruebas del motor: `npm test` (o `node --test tests/`).

## Poner Firebase (sincronizar entre los 3 usuarios)
1. https://console.firebase.google.com > **Agregar proyecto**.
2. **Build > Authentication > Comenzar > Método de acceso > Correo electrónico/contraseña** y active **"Vínculo del correo electrónico (acceso sin contraseña)"**.
3. Authentication > **Configuración > Dominios autorizados**: agregue el dominio donde publicará (`TU-PROYECTO.web.app` ya viene) y `localhost` para pruebas.
4. **Build > Firestore Database > Crear base de datos** (modo producción).
5. **Configuración del proyecto > Tus apps > Web (</>)**: copie el objeto `firebaseConfig` y péguelo en `firebase-config.js` (apiKey, authDomain, projectId, appId). No es un secreto; la seguridad la dan Auth + reglas. No guarde contraseñas ni claves privadas.
6. Edite `firestore.rules`: cambie los 3 correos de ejemplo por los reales (dueño, esposa, hijo).
7. Instale la CLI: `npm i -g firebase-tools`, `firebase login`, `firebase use --add` (elija su proyecto), y despliegue:
   `firebase deploy --only firestore:rules,hosting`
8. Abra `https://TU-PROYECTO.web.app`, escriba su correo y abra el enlace que llega.

**iPhone:** el enlace del correo se abre en Safari, no en la app instalada (almacenamiento separado). Solución: en la pantalla de acceso use **"Pegar enlace del correo"** (copie el enlace del correo y péguelo dentro de la app instalada).

El campo "Correos permitidos" de Ajustes es solo informativo: **lo que protege los datos es `firestore.rules`**; al cambiarlo hay que volver a desplegar las reglas.

## Instalar en el teléfono
- **iPhone (Safari):** abrir la URL > Compartir > **Agregar a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ > **Instalar app** / Agregar a pantalla principal.
Funciona sin conexión (shell y librerías cacheadas tras la primera visita con internet; Firestore guarda en caché local).

## Notas de diseño y supuestos
- Dinero en centavos enteros; porcentajes en puntos base. Precio = costo / (1 - margen) (margen sobre PRECIO; se muestra el markup equivalente).
- Contingencia sobre directos; overhead sobre (directos+contingencia); garantía 1% sobre el subtotal; markup propio del subcontrato entra al costo.
- Margen bajo el piso (35%): el PDF al cliente se bloquea salvo escribir `CONFIRMO MARGEN BAJO`.
- Anticipo > 10% muestra advertencia (FS 489.126). Aviso de gravámenes solo si el total > $2,500.
- Planos: solo PDF (los DWG no se abren; exporte a PDF desde CAD). El PDF del plano queda solo en el dispositivo (IndexedDB) y no entra en el respaldo; las medidas sí van en la cotización.
- Cada cotización guarda una copia de precios/ajustes; "Actualizar precios desde el catálogo" la renueva a propósito.
- Librerías por CDN con versión fija: Firebase 10.12.2 (gstatic), jsPDF 2.5.1 y PDF.js 3.11.174 (cdnjs). Para publicar una nueva versión de la app, suba `VERSION` en `sw.js`.

## Proyectos potenciales (antes Licitaciones/Ofertas; rutas y datos internos siguen `licitaciones`)
Pestaña **Proyectos potenciales** (en inglés *Potential projects*; son invitaciones a cotizar, NO descuentos) para preparar propuestas a contratistas generales (GC). **La app NUNCA envía nada**: solo arma borradores que usted revisa y envía desde su propio correo (copiar, `mailto:` o PDF descargado).

> **ADVERTENCIA LEGAL / TÉRMINOS DE USO:** la v1 **no** hace scraping ni llamadas a ConstructConnect, SmartBid ni a ningún portal (sus términos de uso no se han revisado). Los proyectos se agregan **a mano** o **pegando el texto** de la invitación. No automatice el envío ni la lectura de esos portales sin revisar sus términos. Los borradores no son asesoría legal.

- **Pegar invitación:** el analizador (`bids-parse.js`, heurístico) extrae proyecto (línea tras `BID PROJECT |`), GC, contacto, teléfono, correo, `Due Date:` (M-D-YYYY h:mm AM/PM), dirección/ciudad/estado/ZIP, alcance, fechas estimadas y el bloque *Cost Breakout*. Todo se revisa y edita antes de guardar; lo que no se halla queda vacío (nunca se inventa). Fixture de prueba: `tests/fixtures/invitacion-publix.txt` (reconstruido con los datos conocidos; el formato real de la página puede variar).
- **Fecha límite:** cuenta regresiva y etiqueta VENCIDA/vigente según la fecha del dispositivo; filtros y orden por fecha límite. Un proyecto con fecha límite vencida muestra banner rojo y exige confirmación explícita antes de abrir el correo o generar el PDF.
- **Ajuste de alcance** (`bids-fit.js`): palabras clave EN/ES contra los oficios de la empresa (pintura, drywall, pisos, tile, carpintería de acabado/millwork, decks, baños/cocinas; electricidad solo por subcontrato) y contra lo que NO hace (movimiento de tierra, acero, techos, plomería, HVAC, protección contra incendios, pavimentación...). Muestra chips y la nota «Participaría como SUBCONTRATISTA de estas partidas» o «Proyecto no encaja». Lo no reconocido va a «Sin clasificar».
- **Costeo:** líneas por oficio (libres: cantidad, unidad, material, productividad o horas, tarifa, monto fijo, subcontrato; o del catálogo) con el motor existente (7.5% en materiales, burden, contingencia, overhead, margen sobre PRECIO, piso 35% y `CONFIRMO MARGEN BAJO`). Los breakouts se calculan en una sola pasada del motor: su suma cuadra con el total al centavo. Las medidas de planos se escriben a mano (el visor de planos está ligado a las cotizaciones). Calificaciones: inclusiones, exclusiones, supuestos, validez y addenda.
- **Borradores** (`bids-drafts.js`, EN/ES): intención de cotizar, envío de propuesta (breakouts y total, **sin costos ni margen**) y RFI. Asunto y cuerpo editables; *Copiar*, *Abrir en mi correo* (`mailto:`; algunos clientes de correo truncan cuerpos largos y no adjuntan archivos) y *Generar PDF* (propuesta sin costos; el PDF INTERNO con costos y margen es aparte). Firmante, correo y licencia salen de **Ajustes**; si faltan aparece `[COMPLETAR]` y el correo queda bloqueado hasta completarlos o confirmar. Nunca se menciona licencia ni seguro que no estén escritos en Ajustes.
- **Cargar ejemplo:** crea un proyecto marcado EJEMPLO (Publix - Tower Square, Gainesville) con cifras de prueba; el correo y el teléfono directo del contacto se dejan vacíos.
- **Datos:** colección `licitaciones` (IndexedDB v2 en modo local; Firestore con las mismas reglas de los 3 correos, ver `firestore.rules`). Entra en el respaldo JSON (los respaldos viejos sin ella se siguen importando).
- **Pruebas:** `npm test` (parser, ajuste de alcance, costeo/breakouts y borradores/bloqueos además de las del motor). Service worker `cotizador-v1.5.0`.


## PWA / Cloudflare (v1.4.0)
`manifest.webmanifest` usa `start_url` y `scope` `./`. El service worker devuelve el shell cacheado de `./` para navegaciones sin conexión, y al precachear **re-empaqueta** cualquier respuesta con `redirected` (Cloudflare redirige `/index.html` a `/`; una respuesta redirigida no puede servir una navegación). El precache es atómico (si un archivo falla, el SW nuevo no se instala). Al añadir un `.js` nuevo hay que añadirlo a `SHELL` en `sw.js`: `tests/sw.test.js` falla si falta.

## Accesibilidad y lenguaje (Fase 1)
- Base `html{font-size:18px}`; texto nunca menor a 14px; etiquetas >= 16px; botones >= 48px (principales 56px) con 8px de separación; foco visible; `prefers-reduced-motion` respetado; movimiento solo `opacity`/`transform` de 250-300 ms. Contraste: principal >= 7:1 y secundario >= 4.5:1 (comprobado en `tests/contraste.test.js`; texto sobre teal `#38C0D9` es tinta oscura `#0B2329`, nunca blanco).
- Textos en español sin jerga (breakout->desglose, burden->cargas del empleado, overhead->gastos fijos del negocio, markup/margen->ganancia, precio piso->precio mínimo, takeoff->cantidades, scope->trabajo incluido, GC->contratista general, bid->invitación a cotizar, Costeo->Costos). `tests/lenguaje.test.js` lo vigila; el glosario de excepciones (con motivo) está en ese archivo. La fórmula de margen no cambió: en pantalla se explica "De cada $100 que cobra, le quedan $X". El inglés técnico del PDF en inglés se conserva.
- Pestaña inferior: la sección se llama **Proyectos potenciales** (antes Ofertas); su pantalla se titula igual y explica que son invitaciones a cotizar, no descuentos.
- "Guardado ✓" en el encabezado tras guardar; al borrar una línea/partida/cuarto/medida/desglose aparece **Deshacer** 10 s (sin diálogos; se cierra al cambiar de pantalla).

## Cantidades del plano (esquema JSON v1)
Preparación para que el análisis de planos se haga **fuera** de la app (p. ej. con Claude): la app solo **revisa**. No hay todavía script de extracción de PDF. Módulo puro: `plan-cantidades.js` (tests en `tests/plan-cantidades.test.js`). Pantalla: paso **Cantidades** de un proyecto potencial, y "Cantidades del plano" dentro de una cotización.

```
{ "version": 1,
  "plano":   { "archivo", "sha256" (64 hex), "revision", "fecha", "addenda" },
  "hojas":   [ { "pagina", "numero", "titulo", "escala_texto", "escala_verificada": bool } ],
  "cuartos": [ { "nombre", "numero", "area_sf": V, "perimetro_lf": V, "alto_techo_ft": V,
                 "acabados": { "piso", "zocalo", "muros", "techo" } } ],
  "conteos": [ { "tipo", "marca", "cantidad": V, "detalle" } ],
  "muros":   [ { "tipo", "lf": V, "alto_ft": V, "capas" } ],
  "partidas_sugeridas": [ { "oficio", "cantidad": V, "unidad", "formula", "partida_id"?, "insumos": [ { "nombre", "unidad", "cantidad": V } ] } ],
  "supuestos": [ "texto" ], "dudas": [ "texto" ] }

V = { "valor": numero >= 0,
      "fuente": { "pagina": entero, "bbox": [x0,y0,x1,y1] (puntos PDF, >= 0), "texto_literal": "...",
                  "metodo": "texto_pdf" | "tabla_pdf" | "vision" | "medido_humano" | "supuesto" },
      "confianza": "alta" | "media" | "baja" }
```
- **Qué lleva V:** cada cantidad medible (areas, perimetros, alturas, conteos, largos, cantidades de partidas e insumos). No llevan fuente los metadatos del documento (`version`, `hojas[].pagina`, `fuente.pagina`, `bbox`).
- **Unidades:** `ft²`, `sf` (alias de ft²), `lf`, `ft`, `ea`, `gal`, `hoja`, `asig.`, `h`, `ud` (las del catálogo de `defaults.js`). `partida_id` (opcional) enlaza con una partida del catálogo; si existe y la unidad coincide, el motor (`engine.js`) calcula el costo; si no, la línea es libre con costos en $0 (no se inventan precios).
- **Validador** (`validar`): errores `{ruta, codigo, args, mensaje_es}` en español (cada código tiene texto ES/EN en `i18n.js`); rechaza negativos, NaN/Infinity, números como texto, números sueltos sin fuente, `bbox`/método/confianza/unidad inválidos y versión distinta de 1. Advertencias: página sin hoja y lectura de imagen/medida a mano sobre una hoja con escala no verificada.
- **Aprobación:** todo empieza *pendiente*. `requiere_aprobacion` = confianza media/baja, método `supuesto`, o lectura por imagen en hoja sin escala verificada. "Aprobar todas las de confianza alta" **nunca** toca las que requieren aprobación. `aprobar(item, quien, cuando)`; `corregir(...)` guarda `valor_original`, marca `medido_humano` y **anula la aprobación previa** (la pantalla la vuelve a aprobar con el nuevo valor). **Solo las partidas aprobadas entran al precio** (`lineasDesdeItems`/`calcularPartida`): lo pendiente, aunque sea de confianza alta, no entra; volver a pulsar "Usar cantidades aprobadas" actualiza (no duplica) por `origenItemId`.
- **Ejemplo:** `plan-cantidades-ejemplo.js` (botón "Cargar ejemplo", funciona sin conexión) y `tests/fixtures/plan-cantidades-EJEMPLO.json` (idéntico; un test lo comprueba). Todo ficticio y marcado EJEMPLO.
- **Dónde se guarda:** el JSON revisado queda dentro del proyecto potencial o la cotización (`cantidades`; IndexedDB en modo local o Firestore), **sin el PDF**. Los PDF y JSON de planos reales nunca van al repositorio (`.gitignore`).

## Fase 1A: uso en el teléfono (v1.5.0)
- **Barra inferior de 3 pestañas:** Inicio · Proyectos potenciales · Más (hoja con Planos, Precios, Archivadas y Ajustes). Botón fijo **+ Nueva cotización** que sube solo cuando aparece la barra Deshacer (variable CSS `--undo-h`) y respeta el área segura del iPhone. Al navegar: foco al `h1` (o `main`), `document.title` por pantalla y el scroll se restaura al volver atrás.
- **Inicio:** "Necesita su atención" (proyectos potenciales que vencen en 7 días o menos y borradores sin nombre de cliente o sin cuartos/partidas/medidas), "Mis cotizaciones" con chips Todas/Borrador/Enviada/Ganada/Archivadas y búsqueda por cliente. "Ganada" es el estado interno `aceptada` (el dato no se renombró); "Rechazada" solo aparece en Todas.
- **Borrar y archivar:** deslizar una tarjeta a izquierda o derecha, botón **⋯** (hoja con Archivar y Borrar) o tecla **Supr**. Solo los **borradores** de cotización se borran; lo enviado o cerrado solo se archiva (en proyectos potenciales: no se borran enviado/ganado/perdido; el ejemplo siempre se puede borrar). Borrar = estado `papelera` + `estadoAntes` + `borradoEn`; se purga a los 30 días al abrir la app (con el PDF del plano). Archivar = `archivada` + `archivadaEn` (conserva el estado). Campos nuevos, solo añadidos; entran en el respaldo.
- **Deshacer:** cola de 8 s por borrado (varios seguidos), sobrevive a la navegación, se pausa mientras el botón tiene el foco o el puntero encima. El PDF del plano solo se borra cuando vence el Deshacer.
- **Guardado:** lo que espera el retraso de 350 ms se guarda al ocultar o cerrar la página (`pagehide`/`visibilitychange`).
- Módulos puros con pruebas: `gesto.js` (máquina del deslizamiento: umbral 10 px, |dx| > 1.5·|dy|, ignora 24 px de borde), `papelera.js`, `cola.js`; DOM: `lista.js`, `borrado.js`. `firestore.rules` no cambia (los campos nuevos viven en los mismos documentos).
