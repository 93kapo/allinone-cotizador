import test from 'node:test';
import assert from 'node:assert/strict';
import { crearCola } from '../cola.js';

// Reloj y temporizadores falsos y deterministas.
function reloj() {
  let t = 0, id = 0; const pend = new Map();
  return {
    ahora: () => t,
    setT: (fn, ms) => { const i = ++id; pend.set(i, { fn, en: t + ms }); return i; },
    clearT: (i) => pend.delete(i),
    avanzar(ms) { const fin = t + ms; for (;;) { const s = [...pend.entries()].filter(([, v]) => v.en <= fin).sort((a, b) => a[1].en - b[1].en)[0]; if (!s) break; t = s[1].en; pend.delete(s[0]); s[1].fn(); } t = fin; },
  };
}
const mk = (o = {}) => { const r = reloj(); const eventos = []; const c = crearCola({ ...r, alCambiar: () => eventos.push(c.cantidad), ...o }); return { c, r, eventos }; };

test('cola: 8 segundos por defecto; al vencer se llama expirar() una vez y sale de la cola', () => {
  const { c, r } = mk(); const log = [];
  c.agregar({ msg: 'a', expirar: () => log.push('exp-a') });
  r.avanzar(7999); assert.equal(c.cantidad, 1); assert.deepEqual(log, []);
  r.avanzar(1); assert.equal(c.cantidad, 0); assert.deepEqual(log, ['exp-a']);
  r.avanzar(20000); assert.deepEqual(log, ['exp-a']);
});
test('cola: varios borrados seguidos conviven y se deshacen del más reciente al más antiguo', async () => {
  const { c } = mk(); const log = [];
  for (const k of ['a', 'b', 'c']) c.agregar({ msg: k, deshacer: () => log.push('undo-' + k), expirar: () => log.push('exp-' + k) });
  assert.equal(c.cantidad, 3);
  assert.equal(await c.deshacer(), 'c'); assert.equal(await c.deshacer(), 'b');
  assert.deepEqual(log, ['undo-c', 'undo-b']); assert.equal(c.cantidad, 1);
});
test('cola: una entrada deshecha NUNCA llama expirar() (el PDF del plano se conserva)', async () => {
  const { c, r } = mk(); const log = [];
  c.agregar({ msg: 'a', deshacer: () => log.push('u'), expirar: () => log.push('PDF borrado') });
  await c.deshacer(); r.avanzar(60000);
  assert.deepEqual(log, ['u']);
});
test('cola: cada entrada tiene su propio plazo', () => {
  const { c, r } = mk(); const log = [];
  c.agregar({ msg: 'a', expirar: () => log.push('a') }); r.avanzar(5000);
  c.agregar({ msg: 'b', expirar: () => log.push('b') }); r.avanzar(3000);
  assert.deepEqual(log, ['a']); r.avanzar(5000); assert.deepEqual(log, ['a', 'b']);
});
test('cola: deshacer por id y con cola vacía devuelve null', async () => {
  const { c } = mk();
  assert.equal(await c.deshacer(), null);
  const i1 = c.agregar({ msg: 'a' }); c.agregar({ msg: 'b' });
  assert.equal(await c.deshacer(i1), 'a'); assert.equal(c.items[0].msg, 'b');
});
test('cola: pausar detiene los plazos y reanudar da al menos 3 s más', () => {
  const { c, r } = mk(); const log = [];
  c.agregar({ msg: 'a', expirar: () => log.push('a') });
  r.avanzar(6000); c.pausar(); r.avanzar(60000); assert.deepEqual(log, []);
  c.reanudar(); r.avanzar(2999); assert.deepEqual(log, []); r.avanzar(1); assert.deepEqual(log, ['a']);
});
test('cola: lo agregado en pausa espera a reanudar', () => {
  const { c, r } = mk(); const log = [];
  c.pausar(); c.agregar({ msg: 'a', expirar: () => log.push('a') }); r.avanzar(30000); assert.deepEqual(log, []);
  c.reanudar(); r.avanzar(8000); assert.deepEqual(log, ['a']);
});
test('cola: avisa cada cambio (para repintar la barra) y un error en expirar() no la rompe', () => {
  const { c, r, eventos } = mk();
  c.agregar({ msg: 'a', expirar: () => { throw new Error('x'); } });
  const orig = console.error; console.error = () => {};
  try { r.avanzar(8000); } finally { console.error = orig; }
  assert.deepEqual(eventos, [1, 0]);
});
