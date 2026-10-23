// ui.js - componentes de formulario y avisos reutilizables.
import { h, usd, pct1 } from './util.js';
import { t } from './i18n.js';
import { aCentavos, pctABp } from './engine.js';
import { crearCola } from './cola.js';

let _id = 0;
const uid = () => 'f' + ++_id;

export function field({ label, value = '', type = 'text', onInput, placeholder = '', inputmode, step, min, max, area = false, hint, readonly, list, id }) {
  const fid = id || uid();
  const attrs = { id: fid, type: area ? undefined : type, value, placeholder, inputmode, step, min, max, readonly, list,
    onchange: (e) => onInput && onInput(e.target.value, e) };
  const el = area ? h('textarea', { id: fid, placeholder, onchange: attrs.onchange }, value) : h('input', attrs);
  return h('div', {}, h('label', { for: fid }, label), el, hint ? h('div', { class: 'muted' }, hint) : null);
}
/** Campo de porcentaje en bp (muestra %, guarda entero bp). */
export const pctField = (label, bp, onBp, hint) =>
  field({ label: label + ' (%)', type: 'number', inputmode: 'decimal', step: '0.1', min: '0', max: '99', value: bp / 100, hint, onInput: (v) => onBp(pctABp(v || 0)) });
/** Campo de dinero en centavos (muestra $, guarda centavos). */
export const moneyField = (label, cents, onCents, hint) =>
  field({ label: label + ' ($)', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: (cents / 100).toFixed(2), hint, onInput: (v) => onCents(aCentavos(v || 0)) });
export const numField = (label, v, onNum, { step = 'any', min = '0', hint } = {}) =>
  field({ label, type: 'number', inputmode: 'decimal', step, min, value: v, hint, onInput: (x) => onNum(parseFloat(x) || 0) });
export function selectField(label, opts, value, onChange) {
  const id = uid();
  return h('div', {}, h('label', { for: id }, label),
    h('select', { id, onchange: (e) => onChange(e.target.value) }, opts.map(([v, txt]) => h('option', { value: v, selected: String(v) === String(value) }, txt))));
}
export const checkField = (label, checked, onChange) => {
  const id = uid();
  return h('label', { class: 'chk', for: id }, h('input', { id, type: 'checkbox', checked: checked || null, onchange: (e) => onChange(e.target.checked) }), label);
};

/** Contenedor de botones de acción con 8px de separación (reemplaza los espacios y <br>). */
export const acciones = (...btns) => h('div', { class: 'actions' }, ...btns);

/** Indicador fijo "Guardado ✓" en el encabezado (no usa toast, para no tapar el aviso de Deshacer). */
let _guardTimer;
export function guardadoOk() {
  const el = document.getElementById('guardado');
  if (!el) return;
  el.textContent = t('ui.saved');
  el.classList.add('on');
  clearTimeout(_guardTimer);
  _guardTimer = setTimeout(() => el.classList.remove('on'), 2500);
}

/** Contenedor fijo (encima de la barra inferior) que apila las barras Deshacer y publica su alto en --undo-h
 *  para que el botón "+ Nueva cotización" suba y nunca quede encima de ellas. */
export function contenedorUndo() {
  let w = document.getElementById('undo-wrap');
  if (!w) { w = h('div', { id: 'undo-wrap', class: 'undo-wrap' }); document.body.append(w); }
  return w;
}
export function medirUndo() {
  const w = document.getElementById('undo-wrap');
  const px = w && w.childElementCount ? Math.ceil(w.getBoundingClientRect().height) + 8 : 0;
  document.documentElement.style.setProperty('--undo-h', px + 'px');
}

/** Barra "Deshacer" visible 10 segundos tras borrar algo dentro de una pantalla (sin diálogos confirm).
 *  Se cierra al cambiar de pantalla: el objeto en memoria ya no es el vigente (a propósito; ver cerrarDeshacer). */
let _undoEl, _undoTimer;
export function deshacer(msg, onUndo, ms = 10000) {
  _undoEl?.remove(); clearTimeout(_undoTimer);
  const el = h('div', { class: 'undo', role: 'status', id: 'undo-bar' }, h('span', {}, msg),
    h('button', { id: 'undo-btn', onclick: () => { clearTimeout(_undoTimer); el.remove(); _undoEl = null; medirUndo(); onUndo(); } }, t('ui.undo')));
  _undoEl = el; contenedorUndo().append(el); medirUndo();
  _undoTimer = setTimeout(() => { el.remove(); if (_undoEl === el) _undoEl = null; medirUndo(); }, ms);
}
/** Cierra la barra Deshacer de pantalla. NO toca la cola de borrados de listas (esa sobrevive a la navegación). */
export function cerrarDeshacer() { clearTimeout(_undoTimer); _undoEl?.remove(); _undoEl = null; medirUndo(); }
/** Quita el elemento de una lista y ofrece Deshacer (lo vuelve a poner en su posición original). */
export function borrarConDeshacer(lista, item, { msg, despues, guardar }) {
  const i = lista.indexOf(item);
  if (i < 0) return;
  lista.splice(i, 1); guardar?.(); despues?.();
  deshacer(msg || t('ui.deleted'), () => { lista.splice(Math.min(i, lista.length), 0, item); guardar?.(); despues?.(); });
}

/** Control de ganancia: etiqueta, botones - y + (1%), deslizador, aviso fijo del mínimo y explicación en dinero. */
export function controlGanancia({ id, bp, pisoBp, onChange }) {
  const clamp = (v) => Math.max(0, Math.min(7000, Math.round(v)));
  let val = clamp(bp);
  const lab = h('label', { for: id });
  const rng = h('input', { id, type: 'range', min: '0', max: '7000', step: '50', value: val });
  const explica = h('p', { class: 'explica', 'aria-live': 'polite' });
  const txt = () => `${t('rev.margin')}: ${pct1(val)}`;
  const set = (v, notificar = true) => {
    val = clamp(v); rng.value = val; lab.textContent = txt(); rng.setAttribute('aria-valuetext', pct1(val));
    if (notificar) onChange(val);
  };
  rng.addEventListener('input', (e) => set(parseInt(e.target.value)));
  const B = (signo, delta, aria) => h('button', { type: 'button', id: `${id}-${delta < 0 ? 'menos' : 'mas'}`, 'aria-label': aria, onclick: () => set(val + delta) }, signo);
  lab.textContent = txt(); rng.setAttribute('aria-valuetext', pct1(val));
  return {
    el: h('div', {}, lab, h('div', { class: 'stepper' }, B('−', -100, t('rev.less')), rng, B('+', 100, t('rev.more'))),
      h('p', { class: 'minwarn' }, t('rev.dontGoBelow', pct1(pisoBp)), ' ', h('span', { style: 'font-weight:400' }, t('rev.floorMeaning'))), explica),
    /** realBp: ganancia real calculada (puede diferir del deseado por redondeo). */
    setReal(realBp) { explica.textContent = t('rev.perHundred', usd(realBp)); },
    get valor() { return val; },
  };
}
let toastEl;
export function toast(msg, tipo = 'ok') {
  toastEl?.remove();
  toastEl = h('div', { class: 'banner toast ' + tipo, role: 'status', style: 'position:fixed;left:12px;right:12px;top:70px;z-index:80;max-width:736px;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,.25)' }, msg);
  document.body.append(toastEl);
  const me = toastEl;
  setTimeout(() => me.remove(), tipo === 'ok' ? 2800 : 6000);
}
const FOCUSABLES = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const visibles = (raiz) => [...raiz.querySelectorAll(FOCUSABLES)].filter((e) => !e.hidden && e.getClientRects().length);
const _hojas = new Set();
const actualizarInert = () => { const app = document.getElementById('app'); if (app) app.inert = _hojas.size > 0; };
/** Cierra todas las hojas abiertas (al cambiar de pantalla); no devuelve el foco porque la pantalla nueva lo toma. */
export function cerrarHojas() { for (const c of [..._hojas]) c(false); }
/** Hoja inferior accesible: Esc cierra, el foco queda atrapado dentro, el resto de la app se desactiva (inert)
 *  y al cerrar el foco vuelve a quien la abrió. */
export function sheet(titulo, contenido, onClose) {
  const t0 = Date.now(); // ignora el "click fantasma" que sigue al toque que abrió la hoja
  const opener = document.activeElement;
  const tid = uid();
  const close = (devolverFoco = true) => {
    if (!s.isConnected) return;
    s.remove(); _hojas.delete(close); actualizarInert();
    onClose?.();
    if (devolverFoco && opener && opener.isConnected && opener !== document.body) opener.focus?.();
  };
  const cerrarBtn = h('button', { class: 'ghost', 'aria-label': t('ui.close'), onclick: () => close() }, '✕');
  const s = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid,
    onclick: (e) => { if (e.target === s && Date.now() - t0 > 600) close(); },
    onkeydown: (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = visibles(s);
      if (!f.length) { e.preventDefault(); return; }
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || !s.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && (document.activeElement === z || !s.contains(document.activeElement))) { e.preventDefault(); a.focus(); }
    } },
    h('div', { class: 'in' }, h('div', { class: 'item' }, h('h2', { id: tid }, titulo), cerrarBtn), contenido));
  document.body.append(s);
  _hojas.add(close); actualizarInert();
  const ini = visibles(s).find((e) => e !== cerrarBtn) || cerrarBtn;
  ini.focus({ preventScroll: true });
  return { close, el: s };
}
export const aviso = (cls, ...kids) => h('div', { class: 'banner ' + cls }, ...kids);

/** Registro de "guardados pendientes": cada editor registra una función que guarda SOLO si hay cambios sin guardar.
 *  Se ejecutan al cambiar de pantalla y cuando la página se oculta o se cierra (pagehide / visibilitychange). */
const _flush = new Set();
export const registrarGuardado = (fn) => { _flush.add(fn); };
export function flushGuardados() { for (const f of [..._flush]) { try { f(); } catch (e) { console.error(e); } } }
export function resetGuardados() { flushGuardados(); _flush.clear(); }

/** Cola de "Deshacer" de borrados/archivados de listas: SOBREVIVE a la navegación (trabaja sobre el almacén por id).
 *  8 segundos por entrada; se pausa mientras la barra tiene el foco o el puntero encima. */
let _alDatos = null;
/** La pantalla de lista registra cómo repintarse cuando un Deshacer cambia los datos (se limpia en cada navegación). */
export const alCambiarDatos = (fn) => { _alDatos = fn; };
export const colaDeshacer = crearCola({ ms: 8000, alCambiar: () => pintarCola() });
function pintarCola() {
  const items = colaDeshacer.items;
  let el = document.getElementById('undo-cola');
  if (!items.length) {
    if (el) { const tenia = el.contains(document.activeElement); el.remove(); medirUndo(); if (tenia) document.getElementById('main')?.focus({ preventScroll: true }); }
    return;
  }
  const u = items[items.length - 1];
  const txt = items.length > 1 ? t('ui.undoMore', u.msg, items.length - 1) : u.msg;
  const lab = t('ui.undoLabel', u.etiqueta || u.msg);
  if (!el) {
    el = h('div', { class: 'undo', id: 'undo-cola', role: 'status',
      onfocusin: () => colaDeshacer.pausar(), onfocusout: () => colaDeshacer.reanudar(),
      onmouseenter: () => colaDeshacer.pausar(), onmouseleave: () => colaDeshacer.reanudar() },
      h('span', { id: 'undo-cola-txt' }),
      h('button', { id: 'undo-cola-btn', onclick: async () => { try { await colaDeshacer.deshacer(); _alDatos?.(); } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); } } }, t('ui.undo')));
    contenedorUndo().prepend(el);
  }
  el.querySelector('#undo-cola-txt').textContent = txt;
  el.querySelector('#undo-cola-btn').setAttribute('aria-label', lab);
  medirUndo();
}
/** Agrega un borrado/archivado a la cola. deshacer(): restaura en el almacén. expirar(): limpieza definitiva (PDF del plano). */
export function ofrecerDeshacer(o) { return colaDeshacer.agregar(o); }
