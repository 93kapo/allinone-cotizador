// store.js - Capa de datos con DOS backends intercambiables:
//   - Local: IndexedDB (modo sin Firebase).
//   - Nube: Firestore con persistencia offline (se carga con import() dinámico SOLO si hay config).
// Los PDF de planos se guardan SIEMPRE solo en IndexedDB local (v1).
import { firebaseConfig, firebaseConfigurado, FIREBASE_VERSION } from './firebase-config.js';
import { catalogoInicial, ajustesIniciales } from './defaults.js';

const DB_NAME = 'cotizador-allinone', DB_VER = 1;
let _db;
function abrirIDB() {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of ['kv', 'cotizaciones', 'planos']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return _db;
}
async function tx(store, mode, fn) {
  const d = await abrirIDB();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    let out;
    const rq = fn(s);
    rq.onsuccess = () => { out = rq.result; };
    rq.onerror = () => rej(rq.error);
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const idbGet = (s, k) => tx(s, 'readonly', (o) => o.get(k));
const idbPut = (s, k, v) => tx(s, 'readwrite', (o) => o.put(v, k));
const idbDel = (s, k) => tx(s, 'readwrite', (o) => o.delete(k));
const idbAll = (s) => tx(s, 'readonly', (o) => o.getAll());

export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14));

// ---------------- Backend local ----------------
const local = {
  nombre: 'local',
  async getKV(k, def) { return (await idbGet('kv', k)) ?? def(); },
  async setKV(k, v) { await idbPut('kv', k, v); },
  async listar() { return (await idbAll('cotizaciones')).sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')); },
  async obtener(id) { return idbGet('cotizaciones', id); },
  async guardar(q) { await idbPut('cotizaciones', q.id, q); },
  async borrar(id) { await idbDel('cotizaciones', id); },
};

// ---------------- Backend Firestore ----------------
let fb = null; // { auth, db, m }
const nube = {
  nombre: 'nube',
  async getKV(k, def) {
    const s = await fb.m.getDoc(fb.m.doc(fb.db, 'config', k));
    return s.exists() ? s.data().v : def();
  },
  async setKV(k, v) { await fb.m.setDoc(fb.m.doc(fb.db, 'config', k), { v: JSON.parse(JSON.stringify(v)) }); },
  async listar() {
    const s = await fb.m.getDocs(fb.m.collection(fb.db, 'cotizaciones'));
    return s.docs.map((d) => d.data()).sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
  },
  async obtener(id) { const s = await fb.m.getDoc(fb.m.doc(fb.db, 'cotizaciones', id)); return s.exists() ? s.data() : undefined; },
  async guardar(q) { await fb.m.setDoc(fb.m.doc(fb.db, 'cotizaciones', q.id), JSON.parse(JSON.stringify(q))); },
  async borrar(id) { await fb.m.deleteDoc(fb.m.doc(fb.db, 'cotizaciones', id)); },
};

let backend = local;
export const modo = () => backend.nombre; // 'local' | 'nube'

/** Inicializa. Devuelve { modo, usuario? }. En modo nube hay que autenticarse (ver authApi). */
export async function iniciar() {
  if (!firebaseConfigurado()) { backend = local; return { modo: 'local' }; }
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [app, auth, fs] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
  ]);
  const a = app.initializeApp(firebaseConfig);
  const db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  fb = { app: a, auth: auth.getAuth(a), db, m: { ...fs, ...auth } };
  backend = nube;
  await new Promise((r) => { const un = fb.m.onAuthStateChanged(fb.auth, () => { un(); r(); }); });
  return { modo: 'nube', usuario: fb.auth.currentUser };
}
export const authApi = {
  usuario: () => fb?.auth.currentUser || null,
  async enviarEnlace(email) {
    const url = location.origin + location.pathname;
    await fb.m.sendSignInLinkToEmail(fb.auth, email, { url, handleCodeInApp: true });
    localStorage.setItem('emailParaEnlace', email);
  },
  esEnlace: (href = location.href) => !!fb && fb.m.isSignInWithEmailLink(fb.auth, href),
  async completar(email, href = location.href) {
    const r = await fb.m.signInWithEmailLink(fb.auth, email, href);
    localStorage.removeItem('emailParaEnlace');
    return r.user;
  },
  salir: () => fb.m.signOut(fb.auth),
};

// ---------------- API pública ----------------
export const getAjustes = async () => ({ ...ajustesIniciales(), ...(await backend.getKV('ajustes', ajustesIniciales)) });
export const saveAjustes = (a) => backend.setKV('ajustes', a);
export const getCatalogo = () => backend.getKV('catalogo', catalogoInicial);
export const saveCatalogo = (c) => backend.setKV('catalogo', c);
export const listarCotizaciones = () => backend.listar();
export const getCotizacion = (id) => backend.obtener(id);
export const saveCotizacion = (q) => { q.actualizado = new Date().toISOString(); return backend.guardar(q); };
export const borrarCotizacion = (id) => backend.borrar(id);

// PDFs de planos: solo IndexedDB local
export const guardarPlanoPdf = (id, buf) => idbPut('planos', id, buf);
export const obtenerPlanoPdf = (id) => idbGet('planos', id);
export const borrarPlanoPdf = (id) => idbDel('planos', id);

// Respaldo JSON (planos NO incluidos)
export async function exportarRespaldo() {
  return JSON.stringify({
    app: 'cotizador-allinone', version: 1, fecha: new Date().toISOString(),
    ajustes: await getAjustes(), catalogo: await getCatalogo(), cotizaciones: await listarCotizaciones(),
  }, null, 1);
}
export async function importarRespaldo(texto) {
  const d = JSON.parse(texto);
  if (d.app !== 'cotizador-allinone' || !Array.isArray(d.cotizaciones)) throw new Error('Archivo de respaldo no válido');
  await saveAjustes(d.ajustes); await saveCatalogo(d.catalogo);
  for (const q of d.cotizaciones) await backend.guardar(q);
  return d.cotizaciones.length;
}
