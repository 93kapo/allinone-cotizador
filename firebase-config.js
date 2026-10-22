// firebase-config.js
// ============================================================================
//  CONFIGURACIÓN DE FIREBASE  -  RELLENAR DESPUÉS DE CREAR EL PROYECTO
// ============================================================================
//  Mientras estos valores estén VACÍOS, la app funciona en MODO LOCAL
//  (datos solo en este teléfono, con banner "Modo local: sin sincronizar").
//
//  Pega aquí el objeto "firebaseConfig" de: Firebase Console > Configuración del
//  proyecto > Tus apps > App web. (Estos valores NO son secretos; la seguridad
//  la dan Auth + firestore.rules.)  NO guardes aquí contraseñas ni claves privadas.
// ============================================================================
export const firebaseConfig = {
  apiKey: '',            // <-- PEGAR
  authDomain: '',        // <-- PEGAR (ej. tu-proyecto.firebaseapp.com)
  projectId: '',         // <-- PEGAR
  storageBucket: '',     // (no se usa en v1)
  messagingSenderId: '', // (opcional)
  appId: '',             // <-- PEGAR
};

// Versión fija del SDK (CDN gstatic).
export const FIREBASE_VERSION = '10.12.2';

export const firebaseConfigurado = () =>
  !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.authDomain);
