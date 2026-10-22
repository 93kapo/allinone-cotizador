// util.js - helpers de interfaz y formato (puede tocar DOM; el motor NO).
export const usd = (cents, lang = 'en-US') =>
  new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
export const pct1 = (bp) => (bp / 100).toFixed(bp % 100 === 0 ? 0 : 1) + '%';
export const num = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: d });
export const fechaCorta = (iso, lang = 'es') => iso ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

const cargados = new Map();
export function cargarScript(url) {
  if (!cargados.has(url)) {
    cargados.set(url, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.crossOrigin = 'anonymous'; s.onload = res;
      s.onerror = () => { cargados.delete(url); rej(new Error('No se pudo cargar ' + url)); };
      document.head.append(s);
    }));
  }
  return cargados.get(url);
}
export const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
export const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
export const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export async function urlADataUrl(url) {
  const b = await (await fetch(url)).blob();
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
}
export function descargar(nombre, blobOTexto, tipo = 'application/json') {
  const blob = blobOTexto instanceof Blob ? blobOTexto : new Blob([blobOTexto], { type: tipo });
  const a = h('a', { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/** append que ignora null/false y aplana arreglos (a diferencia de Node.append nativo). */
export function add(el, ...kids) {
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
