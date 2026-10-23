import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../papelera.js';

const cot = (o = {}) => ({ id: 'c1', numero: 'AIO-2026-001', estado: 'borrador', cliente: { nombre: 'Ana Pérez' }, cuartos: [{}], lineas: [], medidas: [], planos: [], ...o });
const bid = (o = {}) => ({ id: 'b1', estado: 'nuevo', proyecto: 'Publix', fechaLimite: '', ...o });
const AHORA = new Date(2026, 9, 22, 12, 0, 0);

test('borrar: SOLO los borradores de cotización se pueden borrar; enviada/aceptada/rechazada solo se archivan', () => {
  assert.equal(P.puedeBorrar('cot', cot()), true);
  for (const e of ['enviada', 'aceptada', 'rechazada']) { assert.equal(P.puedeBorrar('cot', cot({ estado: e })), false, e); assert.equal(P.puedeArchivar(cot({ estado: e })), true); }
});
test('borrar: proyectos potenciales enviados/ganados/perdidos solo se archivan; los abiertos y el ejemplo se pueden borrar', () => {
  for (const e of ['nuevo', 'interesado', 'cotizando', 'borrador', 'descartada']) assert.equal(P.puedeBorrar('bid', bid({ estado: e })), true, e);
  for (const e of ['enviada', 'ganada', 'perdida']) assert.equal(P.puedeBorrar('bid', bid({ estado: e })), false, e);
  assert.equal(P.puedeBorrar('bid', bid({ estado: 'enviada', ejemplo: true })), true);
});
test('papelera: aPapelera guarda estadoAntes y borradoEn; sacarDePapelera restaura el estado exacto', () => {
  const q = cot({ estado: 'borrador', margenBp: 3500 });
  P.aPapelera(q, AHORA);
  assert.equal(q.estado, 'papelera'); assert.equal(q.estadoAntes, 'borrador'); assert.equal(q.borradoEn, AHORA.toISOString());
  assert.equal(q.margenBp, 3500); assert.equal(q.cliente.nombre, 'Ana Pérez'); // nada más cambia
  P.sacarDePapelera(q);
  assert.equal(q.estado, 'borrador'); assert.ok(!('borradoEn' in q)); assert.ok(!('estadoAntes' in q));
});
test('papelera: un elemento en papelera no se vuelve a borrar ni archivar', () => {
  const q = P.aPapelera(cot(), AHORA);
  assert.equal(P.puedeBorrar('cot', q), false); assert.equal(P.puedeArchivar(q), false);
});
test('archivar: conserva el estado (Enviada) y se puede quitar del archivo', () => {
  const q = cot({ estado: 'enviada' });
  P.archivar(q, AHORA);
  assert.equal(q.estado, 'enviada'); assert.equal(q.archivada, true); assert.ok(q.archivadaEn);
  assert.equal(P.esVisible(q), false); assert.equal(P.estaArchivada(q), true);
  P.desarchivar(q);
  assert.equal(q.archivada, false); assert.equal(P.esVisible(q), true); assert.ok(!('archivadaEn' in q));
});
test('purga: a los 30 días exactos se purga; a 29 días 23 h no; sin fecha nunca; lo que no está en papelera nunca', () => {
  const dia = 864e5;
  const q = (ms) => ({ ...cot(), estado: 'papelera', borradoEn: new Date(AHORA.getTime() - ms).toISOString() });
  assert.equal(P.purgable(q(30 * dia), AHORA), true);
  assert.equal(P.purgable(q(30 * dia + 1), AHORA), true);
  assert.equal(P.purgable(q(30 * dia - 1), AHORA), false);
  assert.equal(P.purgable({ ...cot(), estado: 'papelera' }, AHORA), false);
  assert.equal(P.purgable({ ...cot(), borradoEn: '2020-01-01T00:00:00Z' }, AHORA), false);
  assert.equal(P.purgable({ ...cot(), estado: 'papelera', borradoEn: 'basura' }, AHORA), false);
  assert.deepEqual(P.purgables([q(31 * dia), q(1 * dia), cot()], AHORA).length, 1);
});
test('planos: idsPlanosPdf lista los PDF de una cotización (y tolera datos incompletos)', () => {
  assert.deepEqual(P.idsPlanosPdf(cot({ planos: [{ id: 'p1' }, { id: 'p2' }, null, {}] })), ['p1', 'p2']);
  assert.deepEqual(P.idsPlanosPdf(bid()), []);
});
test('filtro de Inicio: chips por estado, búsqueda sin acentos ni mayúsculas, y papelera/archivadas fuera', () => {
  const l = [cot({ id: 1, cliente: { nombre: 'José Núñez' } }), cot({ id: 2, estado: 'enviada', cliente: { nombre: 'Ana' } }), cot({ id: 3, estado: 'aceptada', cliente: { nombre: 'Luis' } }),
    P.aPapelera(cot({ id: 4 }), AHORA), P.archivar(cot({ id: 5, estado: 'enviada' }), AHORA)];
  const ids = (f) => P.filtrarCotizaciones(l, f).map((x) => x.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ estado: 'enviada' }), [2]);
  assert.deepEqual(ids({ estado: 'aceptada' }), [3]);
  assert.deepEqual(ids({ texto: 'jose nunez' }), [1]);
  assert.deepEqual(ids({ texto: 'ANA' }), [2]);
  assert.deepEqual(ids({ archivadas: true }), [5]);
  assert.deepEqual(ids({ texto: 'zzz' }), []);
});
test('atención: borrador sin cliente y/o sin medidas; las enviadas, archivadas y la papelera no cuentan', () => {
  assert.deepEqual(P.razonesCotizacion(cot()), []);
  assert.deepEqual(P.razonesCotizacion(cot({ cliente: { nombre: '  ' } })), ['sinCliente']);
  assert.deepEqual(P.razonesCotizacion(cot({ cuartos: [] })), ['sinMedidas']);
  assert.deepEqual(P.razonesCotizacion(cot({ cuartos: [], cliente: {} })), ['sinCliente', 'sinMedidas']);
  assert.deepEqual(P.razonesCotizacion(cot({ cuartos: [], lineas: [{}] })), []);
  assert.deepEqual(P.razonesCotizacion(cot({ cuartos: [], medidas: [{}] })), []);
  assert.deepEqual(P.razonesCotizacion(cot({ estado: 'enviada', cuartos: [] })), []);
  assert.deepEqual(P.razonesCotizacion(P.archivar(cot({ cuartos: [] }))), []);
  assert.deepEqual(P.razonesCotizacion(P.aPapelera(cot({ cuartos: [] }))), []);
});
test('atención: proyectos que vencen en <= 7 días (0 < resto), abiertos, ordenados; vencidos y lejanos no', () => {
  const f = (dias) => { const d = new Date(AHORA.getTime() + dias * 864e5); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const l = [bid({ id: 'a', fechaLimite: f(6.9) }), bid({ id: 'b', fechaLimite: f(0.5) }), bid({ id: 'c', fechaLimite: f(7.5) }), bid({ id: 'd', fechaLimite: f(-0.1) }),
    bid({ id: 'e', fechaLimite: f(2), estado: 'enviada' }), bid({ id: 'f', fechaLimite: '' }), P.archivar(bid({ id: 'g', fechaLimite: f(1) })), P.aPapelera(bid({ id: 'h', fechaLimite: f(1) }))];
  assert.deepEqual(P.proyectosPorVencer(l, AHORA).map((x) => x.b.id), ['b', 'a']);
  const r = P.necesitaAtencion({ cots: [cot({ cliente: {} })], bids: l, ahora: AHORA });
  assert.equal(r.cots.length, 1); assert.equal(r.bids.length, 2);
});
