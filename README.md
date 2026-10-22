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

## Licitaciones (bids)
Nueva pestaña **Licitaciones** para preparar propuestas a contratistas generales (GC). **La app NUNCA envía nada**: solo arma borradores que usted revisa y envía desde su propio correo (copiar, `mailto:` o PDF descargado).

> **ADVERTENCIA LEGAL / TÉRMINOS DE USO:** la v1 **no** hace scraping ni llamadas a ConstructConnect, SmartBid ni a ningún portal (sus términos de uso no se han revisado). Los proyectos se agregan **a mano** o **pegando el texto** de la invitación. No automatice el envío ni la lectura de esos portales sin revisar sus términos. Los borradores no son asesoría legal.

- **Pegar invitación:** el analizador (`bids-parse.js`, heurístico) extrae proyecto (línea tras `BID PROJECT |`), GC, contacto, teléfono, correo, `Due Date:` (M-D-YYYY h:mm AM/PM), dirección/ciudad/estado/ZIP, alcance, fechas estimadas y el bloque *Cost Breakout*. Todo se revisa y edita antes de guardar; lo que no se halla queda vacío (nunca se inventa). Fixture de prueba: `tests/fixtures/invitacion-publix.txt` (reconstruido con los datos conocidos; el formato real de la página puede variar).
- **Fecha límite:** cuenta regresiva y etiqueta VENCIDA/vigente según la fecha del dispositivo; filtros y orden por fecha límite. Una licitación vencida muestra banner rojo y exige confirmación explícita antes de abrir el correo o generar el PDF.
- **Ajuste de alcance** (`bids-fit.js`): palabras clave EN/ES contra los oficios de la empresa (pintura, drywall, pisos, tile, carpintería de acabado/millwork, decks, baños/cocinas; electricidad solo por subcontrato) y contra lo que NO hace (movimiento de tierra, acero, techos, plomería, HVAC, protección contra incendios, pavimentación...). Muestra chips y la nota «Participaría como SUBCONTRATISTA de estas partidas» o «Proyecto no encaja». Lo no reconocido va a «Sin clasificar».
- **Costeo:** líneas por oficio (libres: cantidad, unidad, material, productividad o horas, tarifa, monto fijo, subcontrato; o del catálogo) con el motor existente (7.5% en materiales, burden, contingencia, overhead, margen sobre PRECIO, piso 35% y `CONFIRMO MARGEN BAJO`). Los breakouts se calculan en una sola pasada del motor: su suma cuadra con el total al centavo. Las medidas de planos se escriben a mano (el visor de planos está ligado a las cotizaciones). Calificaciones: inclusiones, exclusiones, supuestos, validez y addenda.
- **Borradores** (`bids-drafts.js`, EN/ES): intención de cotizar, envío de propuesta (breakouts y total, **sin costos ni margen**) y RFI. Asunto y cuerpo editables; *Copiar*, *Abrir en mi correo* (`mailto:`; algunos clientes de correo truncan cuerpos largos y no adjuntan archivos) y *Generar PDF* (propuesta sin costos; el PDF INTERNO con costos y margen es aparte). Firmante, correo y licencia salen de **Ajustes**; si faltan aparece `[COMPLETAR]` y el correo queda bloqueado hasta completarlos o confirmar. Nunca se menciona licencia ni seguro que no estén escritos en Ajustes.
- **Cargar ejemplo:** crea un proyecto marcado EJEMPLO (Publix - Tower Square, Gainesville) con cifras de prueba; el correo y el teléfono directo del contacto se dejan vacíos.
- **Datos:** colección `licitaciones` (IndexedDB v2 en modo local; Firestore con las mismas reglas de los 3 correos, ver `firestore.rules`). Entra en el respaldo JSON (los respaldos viejos sin ella se siguen importando).
- **Pruebas:** `npm test` (parser, ajuste de alcance, costeo/breakouts y borradores/bloqueos además de las del motor). Service worker `cotizador-v1.1.0`.
