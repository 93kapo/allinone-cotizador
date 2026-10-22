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
  apiKey: 'AIzaSyBMt7ccQiEFzn4fOn_WqmZIiHkC1e3_cZI',
  authDomain: 'allin1-d68ac.firebaseapp.com',
  projectId: 'allin1-d68ac',
  storageBucket: 'allin1-d68ac.firebasestorage.app', // (no se usa en v1)
  messagingSenderId: '987312153214',
  appId: '1:987312153214:web:06ede628177644da346e2f',
};

// Versión fija del SDK (CDN gstatic).
export const FIREBASE_VERSION = '10.12.2';

export const firebaseConfigurado = () =>
  !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.authDomain);
