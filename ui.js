// ui.js - componentes de formulario y avisos reutilizables.
import { h, usd, pct1 } from './util.js';
import { t } from './i18n.js';
import { aCentavos, pctABp } from './engine.js';

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

/** Barra "Deshacer" visible 10 segundos tras borrar algo (sin diálogos confirm). onUndo restaura y guarda. */
let _undoEl, _undoTimer;
export function deshacer(msg, onUndo, ms = 10000) {
  _undoEl?.remove(); clearTimeout(_undoTimer);
  const el = h('div', { class: 'undo', role: 'status', id: 'undo-bar' }, h('span', {}, msg),
    h('button', { id: 'undo-btn', onclick: () => { clearTimeout(_undoTimer); el.remove(); _undoEl = null; onUndo(); } }, t('ui.undo')));
  _undoEl = el; document.body.append(el);
  _undoTimer = setTimeout(() => { el.remove(); if (_undoEl === el) _undoEl = null; }, ms);
}
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
export function sheet(titulo, contenido, onClose) {
  const t0 = Date.now(); // ignora el "click fantasma" que sigue al toque que abrió la hoja
  const close = () => { if (s.isConnected) { s.remove(); onClose?.(); } };
  const s = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo, onclick: (e) => { if (e.target === s && Date.now() - t0 > 600) close(); } },
    h('div', { class: 'in' }, h('div', { class: 'item' }, h('h2', {}, titulo), h('button', { class: 'ghost', 'aria-label': t('ui.close'), onclick: close }, '✕')), contenido));
  document.body.append(s);
  return { close, el: s };
}
export const aviso = (cls, ...kids) => h('div', { class: 'banner ' + cls }, ...kids);
