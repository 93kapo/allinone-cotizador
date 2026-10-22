// licitaciones.js - módulo "Licitaciones": lista, alta (pegar invitación / a mano) y editor.
// REGLA: la app NUNCA envía nada; solo prepara borradores que la persona revisa y envía ella misma.
import { h, clear, add } from './util.js';
import { t, getLang } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { field, selectField, toast, aviso, guardadoOk } from './ui.js';
import { parsearInvitacion } from './bids-parse.js';
import { analizarAlcance, notaAjuste, nombreOficio } from './bids-fit.js';
import { bidNuevo, ESTADOS, vencimiento, formatoFechaLimite, aInputLocal } from './bids-calc.js';
import { bidEjemplo } from './bids-ejemplo.js';
import { pasoCostos } from './licitaciones-costeo.js';
import { pasoBorradores } from './licitaciones-borradores.js';

const PASOS = ['datos', 'costos', 'borradores'];

/** "2 d 3 h" / "3 h 20 min" / "12 min". */
const duracion = (v) => (v.dias > 0 ? `${v.dias} d ${v.horas} h` : v.horas > 0 ? `${v.horas} h ${v.minutos} min` : `${v.minutos} min`);

/** Etiqueta VENCIDA / vigente + cuenta regresiva (compara con la fecha actual del dispositivo). */
export function etiquetaVencimiento(fechaLimite, ahora = new Date()) {
  const v = vencimiento(fechaLimite, ahora);
  if (!v.tiene) return { v, badge: h('span', { class: 'badge' }, t('bid.noDate')), texto: t('bid.noDate') };
  const texto = v.vencida ? t('bid.expiredAgo', duracion(v)) : t('bid.leftIn', duracion(v));
  return { v, texto, badge: h('span', { class: 'badge ' + (v.vencida ? 'venc' : 'vig') }, v.vencida ? t('bid.expired') : t('bid.active')) };
}

export async function pantallaLicitaciones({ shell, id, paso }) {
  if (id === 'nueva') return pantallaNueva({ shell });
  if (id) return pantallaEditor({ shell, id, paso });
  return pantallaLista({ shell });
}

// ---------------- Lista ----------------
async function pantallaLista({ shell }) {
  const lista = await store.listarLicitaciones();
  let fEstado = 'todos', fVig = 'todas', orden = 'asc';
  const cont = h('div');
  const pintar = () => {
    clear(cont);
    const ahora = new Date();
    let v = lista.filter((b) => (fEstado === 'todos' || b.estado === fEstado));
    v = v.filter((b) => { const x = vencimiento(b.fechaLimite, ahora); return fVig === 'todas' || (fVig === 'vencidas' ? x.vencida : fVig === 'vigentes' ? x.tiene && !x.vencida : !x.tiene); });
    const ms = (b) => { const x = vencimiento(b.fechaLimite, ahora); return x.tiene ? x.ms : null; };
    v.sort((a, b) => { const A = ms(a), B = ms(b); if (A == null && B == null) return 0; if (A == null) return 1; if (B == null) return -1; return orden === 'asc' ? A - B : B - A; });
    if (!v.length) {
      cont.append(h('div', { class: 'empty card' }, h('p', {}, lista.length ? t('bid.noMatch') : t('bid.empty')), h('p', { class: 'muted' }, lista.length ? '' : t('bid.emptyHint'))));
      return;
    }
    for (const b of v) {
      const e = etiquetaVencimiento(b.fechaLimite, ahora);
      cont.append(h('a', { href: `#/licitaciones/${b.id}`, class: 'card item', style: 'text-decoration:none;color:inherit' },
        h('div', { class: 'main' }, h('b', {}, b.proyecto || t('bid.noName')),
          h('span', { class: 'sub' }, [b.gc, b.fechaLimite ? `${t('bid.due')}: ${formatoFechaLimite(b.fechaLimite)}` : ''].filter(Boolean).join(' · ')),
          h('span', { class: 'sub' }, e.v.tiene ? e.texto : '')),
        h('div', { class: 'right' }, e.badge, h('span', { class: 'badge est-' + b.estado }, t('bidstate.' + b.estado)),
          b.ejemplo ? h('span', { class: 'badge ejemplo' }, t('bid.example')) : null)));
    }
  };
  pintar();
  const cargarEjemplo = async () => {
    const b = bidEjemplo({ id: store.nuevoId(), ids: store.nuevoId, ajustes: S.ajustes, catalogo: S.catalogo });
    await store.saveLicitacion(b);
    location.hash = `#/licitaciones/${b.id}`;
  };
  shell(t('nav.bids'), h('div', {},
    h('h1', {}, t('bid.title')),
    aviso('info', h('b', {}, t('bid.neverSends')), ' ', t('bid.neverSendsHint')),
    h('div', { class: 'row' },
      h('a', { href: '#/licitaciones/nueva', class: 'btn primary' }, '+ ' + t('bid.paste')),
      h('button', { onclick: () => cargarEjemplo().catch((e) => toast(t('ui.error') + ': ' + e.message, 'err')) }, t('bid.loadExample'))),
    h('div', { class: 'row mt' },
      selectField(t('bid.filterState'), [['todos', t('home.all')], ...ESTADOS.map((e) => [e, t('bidstate.' + e)])], fEstado, (x) => { fEstado = x; pintar(); }),
      selectField(t('bid.filterVig'), [['todas', t('home.all')], ['vigentes', t('bid.active')], ['vencidas', t('bid.expired')], ['sin', t('bid.noDate')]], fVig, (x) => { fVig = x; pintar(); }),
      selectField(t('bid.sort'), [['asc', t('bid.sortAsc')], ['desc', t('bid.sortDesc')]], orden, (x) => { orden = x; pintar(); })),
    h('div', { class: 'mt' }, cont),
    h('p', { class: 'muted' }, t('bid.tos'))), '#/licitaciones');
}

// ---------------- Formulario de datos (compartido) ----------------
const CAMPOS_TEXTO = ['proyecto', 'gc', 'contacto', 'telefono', 'email', 'direccion', 'ciudad', 'estadoUS', 'zip', 'fechaLimite', 'inicioEst', 'finEst', 'alcance'];

function formDatos(bid, { onChange, faltan = new Set() }) {
  const F = (label, k, o = {}) => field({ label, value: bid[k] || '', onInput: (v) => { bid[k] = v.trim(); onChange(k); }, hint: faltan.has(k) ? t('bid.notFound') : undefined, ...o });
  const D = (label, k, type) => field({ label, type, value: type === 'datetime-local' ? aInputLocal(bid[k]) : (bid[k] || ''), onInput: (v) => { bid[k] = v; onChange(k); }, hint: faltan.has(k) ? t('bid.notFound') : undefined });
  return h('div', { class: 'stack' },
    F(t('bid.f.project'), 'proyecto'),
    F(t('bid.f.gc'), 'gc'),
    h('div', { class: 'row' }, F(t('bid.f.contact'), 'contacto'), F(t('bid.f.phone'), 'telefono', { type: 'tel', inputmode: 'tel' })),
    F(t('bid.f.email'), 'email', { type: 'email', inputmode: 'email' }),
    F(t('bid.f.address'), 'direccion'),
    h('div', { class: 'row' }, F(t('bid.f.city'), 'ciudad'), F(t('bid.f.state'), 'estadoUS'), F(t('bid.f.zip'), 'zip', { inputmode: 'numeric' })),
    D(t('bid.f.due'), 'fechaLimite', 'datetime-local'),
    h('div', { class: 'row' }, D(t('bid.f.start'), 'inicioEst', 'date'), D(t('bid.f.end'), 'finEst', 'date')),
    F(t('bid.f.scope'), 'alcance', { area: true, hint: faltan.has('alcance') ? t('bid.notFound') : t('bid.f.scopeHint') }));
}

/** Chips del ajuste de alcance + nota. `bid.oficiosExcluidos` permite quitar un oficio de lo que se ofrece. */
export function panelAjuste(bid, onChange) {
  const lang = getLang();
  const box = h('div');
  const pintar = () => {
    clear(box);
    const r = analizarAlcance(bid.alcance);
    const ex = bid.oficiosExcluidos || (bid.oficiosExcluidos = []);
    const chip = (cls, txt, extra) => h('span', { class: 'chip ' + cls, title: extra || null }, txt);
    add(box,
      aviso(r.veredicto === 'sub' ? 'ok' : r.veredicto === 'vacio' ? 'info' : 'warn', notaAjuste(r, lang)),
      r.relevantes.length ? h('div', {}, h('h3', {}, t('bid.fit.relevant')), h('div', { class: 'chips' }, r.relevantes.map((o) => {
        const off = ex.includes(o.key);
        return h('button', { class: 'chip ok' + (off ? ' off' : ''), 'aria-pressed': off ? 'false' : 'true', title: o.coincidencias.join(', '),
          onclick: () => { if (off) ex.splice(ex.indexOf(o.key), 1); else ex.push(o.key); onChange(); pintar(); } },
          (off ? '○ ' : '✓ ') + nombreOficio(o, lang) + (o.sub ? ' *' : ''));
      })), h('p', { class: 'muted' }, t('bid.fit.toggleHint'))) : null,
      r.fuera.length ? h('div', {}, h('h3', {}, t('bid.fit.out')), h('div', { class: 'chips' }, r.fuera.map((o) => chip('out', '✕ ' + nombreOficio(o, lang), o.coincidencias.join(', '))))) : null,
      r.sinClasificar.length ? h('div', {}, h('h3', {}, t('bid.fit.unknown')), h('div', { class: 'chips' }, r.sinClasificar.map((x) => chip('unk', x)))) : null);
  };
  pintar();
  return { el: box, pintar };
}

// ---------------- Nueva (pegar invitación / a mano) ----------------
async function pantallaNueva({ shell }) {
  const bid = bidNuevo({ id: store.nuevoId(), ajustes: S.ajustes, catalogo: S.catalogo });
  let texto = '';
  let faltan = new Set();
  const resumen = h('div');
  const formBox = h('div');
  const ajuste = panelAjuste(bid, () => {});
  const pintarForm = () => { clear(formBox); formBox.append(formDatos(bid, { onChange: (k) => { if (k === 'alcance') ajuste.pintar(); }, faltan })); ajuste.pintar(); };
  const analizar = () => {
    clear(resumen);
    if (!texto.trim()) { resumen.append(aviso('warn', t('bid.pasteEmpty'))); return; }
    const p = parsearInvitacion(texto);
    bid.textoOriginal = texto;
    for (const k of CAMPOS_TEXTO) if (p[k]) bid[k] = p[k];
    if (p.breakouts.length) bid.breakouts = p.breakouts.map((nombre) => ({ id: store.nuevoId(), nombre }));
    faltan = new Set(CAMPOS_TEXTO.filter((k) => !bid[k]));
    resumen.append(p.encontrados.length ? aviso('ok', t('bid.parsed', p.encontrados.length)) : aviso('warn', t('bid.parsedNone')));
    pintarForm();
  };
  const guardar = async () => {
    if (!bid.proyecto.trim()) { toast(t('bid.needName'), 'err'); return; }
    try { await store.saveLicitacion(bid); location.hash = `#/licitaciones/${bid.id}`; } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); }
  };
  pintarForm();
  shell(t('bid.newTitle'), h('div', {},
    h('div', { class: 'row', style: 'margin-bottom:8px' }, h('a', { href: '#/licitaciones', class: 'btn ghost' }, '← ' + t('nav.bids'))),
    aviso('info', t('bid.pasteHint')),
    h('div', { class: 'card stack' }, h('h2', {}, t('bid.paste')),
      field({ label: t('bid.pasteLabel'), area: true, value: '', placeholder: 'BID PROJECT | ...', onInput: (v) => { texto = v; } }),
      h('button', { class: 'primary block', onclick: analizar }, t('bid.analyze')), resumen),
    h('div', { class: 'card stack' }, h('h2', {}, t('bid.review')), formBox, ajuste.el),
    h('button', { class: 'primary block', onclick: guardar }, t('ui.save'))), '#/licitaciones');
}

// ---------------- Editor ----------------
async function pantallaEditor({ shell, id, paso }) {
  const bid = await store.getLicitacion(id);
  if (!bid) return shell(t('ui.error'), aviso('err', t('bid.notFound404')), '#/licitaciones');
  const p0 = PASOS.includes(paso) ? paso : 'datos';
  let timer;
  const guardarYa = async () => { clearTimeout(timer); try { await store.saveLicitacion(bid); guardadoOk(); } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); } };
  const guardar = () => { clearTimeout(timer); timer = setTimeout(guardarYa, 350); };
  const body = h('div');
  const cab = h('div');
  const pintarCab = () => {
    clear(cab);
    const e = etiquetaVencimiento(bid.fechaLimite);
    add(cab,
      h('div', { class: 'card' },
        h('div', { class: 'item' }, h('div', { class: 'main' }, h('b', {}, bid.proyecto || t('bid.noName')), h('span', { class: 'sub' }, bid.gc || '')),
          h('div', { class: 'right' }, bid.ejemplo ? h('span', { class: 'badge ejemplo' }, t('bid.example')) : null)),
        h('div', { class: 'row', style: 'align-items:center' }, e.badge, h('span', { class: 'muted' }, bid.fechaLimite ? `${formatoFechaLimite(bid.fechaLimite)} · ${e.texto}` : t('bid.noDate'))),
        ),
      e.v.vencida ? h('div', { class: 'banner err', role: 'alert' }, h('b', {}, t('bid.expiredBanner')), ' ', t('bid.expiredBannerHint')) : null);
  };
  const render = () => {
    clear(body);
    pintarCab();
    add(body, cab, h('div', { class: 'steps', role: 'tablist' }, PASOS.map((p, i) =>
      h('button', { role: 'tab', 'aria-current': p === p0 ? 'step' : null, onclick: () => { guardarYa().then(() => { location.hash = `#/licitaciones/${id}/${p}`; }); } }, `${i + 1}. ${t('bidstep.' + p)}`))));
    if (p0 === 'datos') pasoDatos();
    else if (p0 === 'costos') pasoCostos({ body, bid, guardar, guardarYa });
    else pasoBorradores({ body, bid, guardar, guardarYa });
  };
  function pasoDatos() {
    const ajuste = panelAjuste(bid, guardar);
    add(body,
      bid.ejemplo ? aviso('warn', t('bid.exampleNote')) : null,
      h('div', { class: 'card stack' }, h('h2', {}, t('bidstep.datos')),
        selectField(t('bid.state'), ESTADOS.map((s) => [s, t('bidstate.' + s)]), bid.estado, (v) => { bid.estado = v; guardar(); }),
        formDatos(bid, { onChange: (k) => { if (k === 'alcance') ajuste.pintar(); if (k === 'fechaLimite' || k === 'proyecto' || k === 'gc') pintarCab(); guardar(); } }),
        field({ label: t('bid.f.notes'), area: true, value: bid.notas || '', onInput: (v) => { bid.notas = v; guardar(); } })),
      h('div', { class: 'card stack' }, h('h2', {}, t('bid.fit.title')), ajuste.el),
      h('button', { class: 'primary block', onclick: () => guardarYa().then(() => { location.hash = `#/licitaciones/${id}/costos`; }) }, t('ui.next')),
      h('button', { class: 'danger block mt', onclick: async () => { if (confirm(t('bid.deleteConfirm'))) { await store.borrarLicitacion(id); location.hash = '#/licitaciones'; } } }, t('bid.delete')));
  }
  shell(bid.proyecto || t('nav.bids'), h('div', {},
    h('div', { class: 'row', style: 'margin-bottom:8px' }, h('a', { href: '#/licitaciones', class: 'btn ghost' }, '← ' + t('nav.bids'))), body), '#/licitaciones');
  render();
}
