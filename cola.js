// cola.js - Cola PURA de "Deshacer" para borrados/archivados de listas (varios seguidos, no solo el último).
// Cada entrada vive `ms` milisegundos; al vencer se llama expirar() (p. ej. borrar el PDF del plano).
// Se puede pausar (foco o puntero sobre la barra) para quien necesita más tiempo (WCAG 2.2.1).
export function crearCola({ ms = 8000, minReanudar = 3000, setT = setTimeout, clearT = clearTimeout, ahora = () => Date.now(), alCambiar = () => {} } = {}) {
  let lista = []; let n = 0; let pausada = false;
  const arrancar = (e, dur) => { e.inicio = ahora(); e.restante = dur; e.timer = setT(() => vencer(e.id), dur); };
  function vencer(id) {
    const i = lista.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [e] = lista.splice(i, 1);
    clearT(e.timer);
    if (!lista.length) pausada = false;
    try { e.expirar?.(); } catch (err) { console.error(err); }
    alCambiar();
  }
  return {
    ms,
    get items() { return lista.map(({ id, msg, etiqueta }) => ({ id, msg, etiqueta })); },
    get cantidad() { return lista.length; },
    get pausada() { return pausada; },
    agregar({ msg, etiqueta = '', deshacer, expirar }) {
      const e = { id: ++n, msg, etiqueta, deshacer, expirar };
      lista.push(e);
      if (!pausada) arrancar(e, ms); else { e.restante = ms; e.timer = null; }
      alCambiar();
      return e.id;
    },
    /** Deshace la entrada indicada (por defecto la más reciente). Devuelve su mensaje o null. */
    async deshacer(id) {
      const i = id == null ? lista.length - 1 : lista.findIndex((e) => e.id === id);
      if (i < 0) return null;
      const [e] = lista.splice(i, 1);
      clearT(e.timer);
      if (!lista.length) pausada = false;
      alCambiar();
      await e.deshacer?.();
      return e.msg;
    },
    pausar() {
      if (pausada) return; pausada = true;
      for (const e of lista) { clearT(e.timer); e.timer = null; e.restante = Math.max(0, e.restante - (ahora() - e.inicio)); }
    },
    reanudar() {
      if (!pausada) return; pausada = false;
      for (const e of lista) arrancar(e, Math.max(minReanudar, e.restante));
    },
    /** Vence todo de inmediato (solo para pruebas / cierre ordenado). */
    vencerTodo() { for (const e of [...lista]) vencer(e.id); },
  };
}
