// lista.js - Lista de tarjetas reutilizable con gesto de deslizar (izquierda o derecha) para revelar la acción.
// El gesto NUNCA es la única vía: cada fila tiene un botón "⋯" (hoja con las acciones) y la tecla Supr.
// La lógica del gesto vive en gesto.js (pura y con pruebas); aquí solo se conectan los eventos del puntero.
import { h } from './util.js';
import { t } from './i18n.js';
import { crearGesto, CFG } from './gesto.js';
import { sheet, toast } from './ui.js';

let abierta = null; // { fila, cerrar } la única fila abierta a la vez
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { if (abierta && !abierta.fila.contains(e.target)) abierta.cerrar(); }, true);
}

/**
 * opciones:
 *  items, href(it), contenido(it) -> nodos dentro del enlace, etiqueta(it) -> nombre para lectores de pantalla,
 *  acciones(it) -> [{ clave, texto, peligro?, deslizar?, ejecutar() }]  (la que lleva deslizar:true es la del gesto y la de Supr si es 'borrar'),
 *  nota(it) -> texto opcional (por qué no se puede borrar), vacio -> nodo cuando no hay items.
 * Devuelve el elemento; el elemento tiene .enfocar(i) para devolver el foco tras repintar.
 */
export function lista({ items, href, contenido, etiqueta, acciones, nota, vacio }) {
  const cont = h('div', { class: 'lista', tabindex: '-1' });
  if (!items.length) { if (vacio) cont.append(vacio); }
  items.forEach((it) => cont.append(fila(it)));
  cont.enfocar = (i) => {
    const filas = cont.querySelectorAll('.fila .tarjeta-link');
    const f = filas[Math.min(Math.max(i, 0), filas.length - 1)];
    (f || cont).focus({ preventScroll: false });
  };
  return cont;

  function fila(it) {
    const nombre = etiqueta(it);
    const accs = () => acciones(it);
    const principal = () => accs().find((a) => a.deslizar);
    const ejecutar = async (a) => { try { await a.ejecutar(); } catch (e) { console.error(e); toast(t('ui.error') + ': ' + e.message, 'err'); } };
    let off = 0, suprimir = false, pid = null, tReset;
    const g = crearGesto();

    const boton = (cls) => { const a = principal(); return a ? h('button', { type: 'button', class: 'accion-fila ' + (a.peligro ? 'peligro' : 'neutro'), 'aria-label': `${a.texto}: ${nombre}`, onclick: () => ejecutar(a) }, a.texto) : null; };
    const accI = h('div', { class: 'fila-acc i' }, boton()), accD = h('div', { class: 'fila-acc d' }, boton());
    const link = h('a', { href: href(it), class: 'tarjeta-link', draggable: 'false' }, contenido(it));
    const mas = h('button', { type: 'button', class: 'mas', 'aria-haspopup': 'dialog', 'aria-label': t('lista.mas', nombre), onclick: () => abrirHoja() }, '⋯');
    const cuerpo = h('div', { class: 'fila-cuerpo' }, link, mas);
    const f = h('div', { class: 'fila', role: 'group', 'aria-label': nombre, onkeydown: teclado }, accI, accD, cuerpo);

    const aplicar = (v) => { off = v; cuerpo.style.transform = v ? `translateX(${v}px)` : ''; };
    const lado = (v) => { if (v) f.dataset.lado = String(Math.sign(v)); else delete f.dataset.lado; };
    const cerrar = () => {
      aplicar(0); f.classList.remove('ab', 'arr');
      clearTimeout(tReset); tReset = setTimeout(() => { if (!off) lado(0); }, 260);
      if (abierta?.fila === f) abierta = null;
    };
    const abrir = (v) => {
      if (abierta && abierta.fila !== f) abierta.cerrar();
      lado(v); f.classList.add('ab'); f.classList.remove('arr'); aplicar(v); abierta = { fila: f, cerrar };
    };
    const asentar = (r) => { // aplica el resultado final del gesto
      if (r.accion === 'abrir') abrir(r.offset); else { cerrar(); }
    };

    cuerpo.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.mas')) return;
      if (!principal()) return; // sin acción de deslizar no hay gesto
      pid = e.pointerId;
      if (abierta && abierta.fila !== f) abierta.cerrar();
      g.down({ x: e.clientX, y: e.clientY, t: e.timeStamp, ancho: window.innerWidth, base: off });
    });
    cuerpo.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const r = g.move({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (r.captura) { try { cuerpo.setPointerCapture(e.pointerId); } catch { /* sin captura el gesto igual funciona */ } f.classList.add('arr'); }
      if (g.fase === 'arrastrando') { if (r.offset) lado(r.offset); aplicar(r.offset); }
    });
    const fin = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      const r = e.type === 'pointercancel' ? g.cancel() : g.up({ x: e.clientX, t: e.timeStamp });
      try { cuerpo.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
      if (r.suprimirClic) { suprimir = true; setTimeout(() => { suprimir = false; }, 400); }
      if (r.accion === 'nada' && off === 0) { f.classList.remove('arr'); lado(0); return; }
      if (r.accion === 'nada') { r.offset ? abrir(r.offset) : cerrar(); return; }
      if (r.accion === 'toque') return;
      asentar(r);
    };
    cuerpo.addEventListener('pointerup', fin);
    cuerpo.addEventListener('pointercancel', fin);
    cuerpo.addEventListener('click', (e) => { if (suprimir) { e.preventDefault(); e.stopPropagation(); suprimir = false; } }, true);
    cuerpo.addEventListener('dragstart', (e) => e.preventDefault());

    function teclado(e) {
      if (e.key === 'Escape' && f.classList.contains('ab')) { e.stopPropagation(); cerrar(); return; }
      if (e.key !== 'Delete' || !e.target.matches('a.tarjeta-link, button.mas')) return;
      e.preventDefault();
      const a = accs().find((x) => x.clave === 'borrar');
      if (a) ejecutar(a); else toast(nota?.(it) || t('lista.soloArchivar'), 'warn');
    }
    function abrirHoja() {
      const lista = accs();
      const n = nota?.(it);
      const sh = sheet(nombre, h('div', { class: 'stack' },
        n ? h('p', { class: 'muted' }, n) : null,
        lista.map((a) => h('button', { type: 'button', class: 'block' + (a.peligro ? ' danger' : ''), 'data-accion': a.clave, onclick: () => { sh.close(); ejecutar(a); } }, a.texto))));
    }
    return f;
  }
}
export { CFG };
