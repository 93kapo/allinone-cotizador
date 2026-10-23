// gesto.js - Máquina de estados PURA del deslizamiento horizontal de una fila (sin DOM, sin tiempo propio:
// todo llega por parámetro, así se prueba con node --test).
//
// Fases: reposo -> pendiente (dedo abajo) -> arrastrando (horizontal claro) | vertical (es un scroll: se suelta)
//        | ignorado (empezó a menos de 24px del borde de la pantalla: es el gesto "atrás" del sistema).
// Regla de captura: solo se pasa a "arrastrando" (y entonces la interfaz captura el puntero) cuando el dedo
// recorrió >= 10px en horizontal Y |dx| > 1.5 * |dy|. Antes de eso el scroll vertical del navegador sigue libre.
export const CFG = Object.freeze({ umbral: 10, ratio: 1.5, borde: 24, abrir: 96, velocidad: 0.4 });

const signo = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** base: desplazamiento con el que empieza la fila (0 cerrada, -abrir abierta a la izquierda, +abrir a la derecha). */
export function crearGesto(opciones = {}) {
  const o = { ...CFG, ...opciones };
  let s = { fase: 'reposo', x0: 0, y0: 0, t0: 0, dx: 0, base: 0, tUlt: 0, xUlt: 0 };
  const clamp = (v) => Math.max(-o.abrir, Math.min(o.abrir, v));
  const vista = (extra = {}) => ({ fase: s.fase, offset: clamp(s.base + s.dx), captura: false, ...extra });

  return {
    get fase() { return s.fase; },
    get config() { return o; },
    /** ancho: ancho de la pantalla (para el borde derecho). */
    down({ x, y, t = 0, ancho = Infinity, base = 0 }) {
      const enBorde = x < o.borde || x > ancho - o.borde;
      s = { fase: enBorde ? 'ignorado' : 'pendiente', x0: x, y0: y, t0: t, dx: 0, base, tUlt: t, xUlt: x };
      return vista({ offset: base });
    },
    move({ x, y, t = 0 }) {
      if (s.fase === 'pendiente') {
        const dx = x - s.x0, dy = y - s.y0, ax = Math.abs(dx), ay = Math.abs(dy);
        if (ax >= o.umbral && ax > o.ratio * ay) { s.fase = 'arrastrando'; s.dx = dx; s.tUlt = t; s.xUlt = x; return vista({ captura: true }); }
        if (ay >= o.umbral) { s.fase = 'vertical'; return vista({ offset: s.base }); } // scroll: no tocar nada
        return vista({ offset: s.base });
      }
      if (s.fase === 'arrastrando') { s.dx = x - s.x0; s.tUlt = t; s.xUlt = x; return vista(); }
      return vista({ offset: s.base });
    },
    /** Dedo arriba. Devuelve { accion: 'toque' | 'abrir' | 'cerrar' | 'nada', lado, offset, suprimirClic }. */
    up({ x, t = 0 }) {
      const f = s.fase;
      let r;
      if (f === 'arrastrando') {
        const dx = (x ?? s.xUlt) - s.x0;
        const v = dx / Math.max(1, t - s.t0); // px/ms
        const fin = clamp(s.base + dx);
        let meta;
        if (Math.abs(v) >= o.velocidad && Math.abs(dx) >= o.umbral) meta = clamp(s.base + signo(v) * o.abrir); // gesto rápido: un paso en esa dirección
        else meta = Math.abs(fin) >= o.abrir / 2 ? signo(fin) * o.abrir : 0;
        r = { accion: meta === 0 ? 'cerrar' : 'abrir', lado: signo(meta), offset: meta, suprimirClic: true };
      } else if (f === 'pendiente') {
        r = s.base !== 0 ? { accion: 'cerrar', lado: 0, offset: 0, suprimirClic: true } : { accion: 'toque', lado: 0, offset: 0, suprimirClic: false };
      } else r = { accion: 'nada', lado: signo(s.base), offset: s.base, suprimirClic: false };
      s = { ...s, fase: 'reposo', dx: 0 };
      return r;
    },
    /** pointercancel (el navegador tomó el scroll): la fila vuelve a donde estaba. */
    cancel() {
      const base = s.base;
      s = { ...s, fase: 'reposo', dx: 0 };
      return { accion: 'nada', lado: signo(base), offset: base, suprimirClic: false };
    },
  };
}
