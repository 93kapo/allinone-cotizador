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
