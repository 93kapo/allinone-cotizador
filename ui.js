// ui.js - componentes de formulario y avisos reutilizables.
import { h } from './util.js';
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

let toastEl;
export function toast(msg, tipo = 'ok') {
  toastEl?.remove();
  toastEl = h('div', { class: 'banner ' + tipo, role: 'status', style: 'position:fixed;left:12px;right:12px;top:70px;z-index:80;max-width:736px;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,.25)' }, msg);
  document.body.append(toastEl);
  const me = toastEl;
  setTimeout(() => me.remove(), tipo === 'ok' ? 2800 : 6000);
}
export function sheet(titulo, contenido, onClose) {
  const t0 = Date.now(); // ignora el "click fantasma" que sigue al toque que abrió la hoja
  const close = () => { if (s.isConnected) { s.remove(); onClose?.(); } };
  const s = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo, onclick: (e) => { if (e.target === s && Date.now() - t0 > 600) close(); } },
    h('div', { class: 'in' }, h('div', { class: 'item' }, h('h2', {}, titulo), h('button', { class: 'small ghost', 'aria-label': t('ui.close'), onclick: close }, '✕')), contenido));
  document.body.append(s);
  return { close, el: s };
}
export const aviso = (cls, ...kids) => h('div', { class: 'banner ' + cls }, ...kids);
