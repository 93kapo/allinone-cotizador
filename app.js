// app.js - arranque, router, shell, login (modo nube) e Inicio.
import { h, clear, usd, fechaCorta, descargar } from './util.js';
import { t, setLang } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { calcularCotizacion, contingenciaPorDefecto } from './engine.js';
import { snapshotCatalogo } from './engine.js';
import { toast, selectField, field, cerrarDeshacer } from './ui.js';
import { pantallaCotizacion } from './cotizacion.js';
import { pantallaPlanos } from './planos.js';
import { pantallaPrecios } from './precios.js';
import { pantallaAjustes } from './ajustes.js';
import { pantallaLicitaciones } from './licitaciones.js';

const root = document.getElementById('app');
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  plan: '<path d="M4 4h16v16H4zM4 10h16M10 4v16" fill="none" stroke="currentColor" stroke-width="2"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/>',
  bid: '<path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 3v5h5M9 13h6M9 17h6" fill="none" stroke="currentColor" stroke-width="2"/>',
  gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="2"/>',
};
const icon = (k) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICONS[k]; return s; };

export function navegar(hash) { if (location.hash === hash) ruta(); else location.hash = hash; }

function shell(titulo, contenido, seccion) {
  cerrarDeshacer();
  clear(root);
  root.append(
    h('header', { class: 'top' }, h('img', { src: 'icons/isotipo-teal.png', alt: '' }), h('div', { class: 'ttl' }, titulo), h('span', { id: 'guardado', class: 'savedtag', role: 'status' }),
      S.modo === 'nube' ? h('button', { onclick: async () => { await store.authApi.salir(); location.reload(); } }, t('ui.logout')) : null),
    h('main', { id: 'main' },
      S.modo === 'local' ? h('div', { class: 'banner local', role: 'status' }, h('b', {}, t('ui.localBanner')), h('span', {}, t('ui.localBannerHint'))) : null,
      contenido),
    h('nav', { class: 'bar', 'aria-label': t('ui.nav') },
      ...[['#/', 'home', t('nav.home')], ['#/licitaciones', 'bid', t('nav.bidsShort')], ['#/planos', 'plan', t('nav.plans')], ['#/precios', 'tag', t('nav.prices')], ['#/ajustes', 'gear', t('nav.settings')]]
        .map(([href, ic, txt]) => h('a', { href, 'aria-current': seccion === href ? 'page' : null }, icon(ic), txt))));
  window.scrollTo(0, 0);
}

export async function crearCotizacion() {
  const lista = await store.listarCotizaciones();
  const y = new Date().getFullYear();
  const n = lista.filter((q) => (q.numero || '').includes('-' + y + '-')).length + 1;
  const q = {
    id: store.nuevoId(), numero: `AIO-${y}-${String(n).padStart(3, '0')}`, estado: 'borrador', creado: new Date().toISOString(),
    cliente: { nombre: '', telefono: '', email: '', direccion: '', notas: '', anio: '' }, esRemodelacion: false,
    idiomaPdf: S.ajustes.idiomaPdfDefault || 'en', cuartos: [], lineas: [], planos: [], medidas: [],
    margenBp: S.ajustes.margenObjetivoBp, contingenciaBp: S.ajustes.contingenciaBp, contManual: false,
    hitosBp: [...S.ajustes.hitosBp], validezDias: S.ajustes.validezDias,
    snapshot: snapshotCatalogo(S.catalogo, S.ajustes),
  };
  await store.saveCotizacion(q);
  return q;
}

async function inicio() {
  const lista = await store.listarCotizaciones();
  let filtro = 'todas';
  const cont = h('div');
  const pintar = () => {
    clear(cont);
    const v = lista.filter((q) => filtro === 'todas' || q.estado === filtro);
    if (!v.length) { cont.append(h('div', { class: 'empty card' }, h('p', {}, lista.length ? t('home.noMatch') : t('home.empty')), h('p', { class: 'muted' }, t('home.emptyHint')))); return; }
    for (const q of v) {
      let tot = 0; try { tot = calcularCotizacion(q).totales.precio; } catch { /* datos incompletos */ }
      cont.append(h('a', { href: `#/cot/${q.id}`, class: 'card item', style: 'text-decoration:none;color:inherit' },
        h('div', { class: 'main' }, h('b', {}, q.cliente?.nombre || t('home.noName')), h('span', { class: 'sub' }, `${q.numero} · ${fechaCorta(q.actualizado || q.creado)}`)),
        h('div', { class: 'right' }, h('b', {}, usd(tot)), h('span', { class: 'badge ' + q.estado }, t('estado.' + q.estado)))));
    }
  };
  pintar();
  const nueva = async () => { const q = await crearCotizacion(); navegar(`#/cot/${q.id}`); };
  shell(t('nav.home'), h('div', {},
    h('h1', {}, t('home.title')),
    selectField(t('home.filter'), [['todas', t('home.all')], ...['borrador', 'enviada', 'aceptada', 'rechazada'].map((e) => [e, t('estado.' + e)])], filtro, (v) => { filtro = v; pintar(); }),
    h('div', { class: 'mt' }, cont),
    h('button', { class: 'primary fab', onclick: nueva }, '+ ' + t('home.new'))), '#/');
}

// ---------- Login (solo modo nube) ----------
function login(msg) {
  clear(root);
  let email = localStorage.getItem('emailParaEnlace') || '';
  const out = h('div');
  const estado = (txt, cls = 'info') => { clear(out); out.append(h('div', { class: 'banner ' + cls, role: 'status' }, txt)); };
  root.append(h('div', { class: 'login' },
    h('img', { src: 'icons/logo-color.png', alt: 'All In One', style: 'width:180px;display:block;margin:0 auto' }),
    h('h1', { style: 'text-align:center' }, t('login.title')), h('p', { class: 'muted', style: 'text-align:center' }, t('login.hint')),
    msg ? h('div', { class: 'banner err' }, msg) : null,
    h('div', { class: 'card stack' },
      field({ label: t('login.email'), type: 'email', value: email, inputmode: 'email', onInput: (v) => { email = v.trim(); } }),
      h('button', { class: 'primary block', onclick: async () => {
        if (!email) return estado(t('login.needEmail'), 'err');
        try { estado(t('ui.loading')); await store.authApi.enviarEnlace(email); estado(t('login.sent'), 'ok'); } catch (e) { estado(t('ui.error') + ': ' + e.message, 'err'); }
      } }, t('login.send')),
      out),
    h('div', { class: 'card stack' },
      h('p', { class: 'muted' }, t('login.iosHint')),
      field({ label: t('login.pasteLink'), onInput: async (v) => {
        try { const em = email || prompt(t('login.email')); await store.authApi.completar(em, v.trim()); location.hash = '#/'; location.reload(); }
        catch (e) { estado(t('ui.error') + ': ' + e.message, 'err'); }
      } }))));
}

async function ruta() {
  const hash = location.hash || '#/';
  const [, a, b, c] = hash.split('/');
  try {
    if (a === 'cot' && b) return await pantallaCotizacion({ shell, id: b, paso: c });
    if (a === 'licitaciones') return await pantallaLicitaciones({ shell, id: b, paso: c });
    if (a === 'planos') return await pantallaPlanos({ shell, id: b });
    if (a === 'precios') return await pantallaPrecios({ shell });
    if (a === 'ajustes') return await pantallaAjustes({ shell });
    return await inicio();
  } catch (e) {
    console.error(e);
    shell(t('ui.error'), h('div', { class: 'banner err' }, t('ui.error') + ': ' + e.message), '#/');
  }
}

async function arrancar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* sin SW: la app sigue funcionando */ });
  let info;
  try { info = await store.iniciar(); } catch (e) { console.error(e); root.replaceChildren(h('div', { class: 'banner err' }, t('ui.error') + ': ' + e.message)); return; }
  S.modo = info.modo;
  if (S.modo === 'nube') {
    if (store.authApi.esEnlace()) {
      const em = localStorage.getItem('emailParaEnlace');
      if (em) { try { await store.authApi.completar(em); history.replaceState({}, '', location.pathname + '#/'); } catch (e) { return login(e.message); } }
      else return login(t('login.pasteNeeded'));
    }
    S.usuario = store.authApi.usuario();
    if (!S.usuario) return login();
  }
  try {
    S.ajustes = await store.getAjustes();
    S.catalogo = await store.getCatalogo();
  } catch (e) { console.error(e); root.replaceChildren(h('div', { class: 'banner err' }, t('ui.error') + ': ' + e.message)); return; }
  setLang(S.ajustes.idiomaUi || 'es'); document.documentElement.lang = S.ajustes.idiomaUi || 'es';
  window.addEventListener('hashchange', ruta);
  ruta();
}
window.__app = { S, store, crearCotizacion, ruta };
arrancar();
