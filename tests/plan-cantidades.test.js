import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validar, aprobar, corregir, aprobarAltas, contarAprobadas, estaAprobado, calcularPartida, lineasDesdeItems, aLineaCotizacion, textoFuente, CODIGOS, ADVERTENCIAS } from '../plan-cantidades.js';
import { EJEMPLO_PLAN } from '../plan-cantidades-ejemplo.js';
import { catalogoInicial, ajustesIniciales } from '../defaults.js';
import { bidNuevo, calcularBid } from '../bids-calc.js';
import { calcularCotizacion, snapshotCatalogo } from '../engine.js';
import { dict } from '../i18n.js';

const clon = (x) => JSON.parse(JSON.stringify(x));
const AHORA = new Date('2026-10-22T12:00:00Z');
const cat = catalogoInicial();

test('ejemplo: es válido, está marcado EJEMPLO y el fixture JSON es idéntico al módulo', () => {
  const v = validar(EJEMPLO_PLAN);
  assert.deepEqual(v.errores, []); assert.equal(v.ok, true); assert.equal(v.items.length, 14);
  const fx = JSON.parse(readFileSync(new URL('./fixtures/plan-cantidades-EJEMPLO.json', import.meta.url), 'utf8'));
  assert.deepEqual(fx, EJEMPLO_PLAN);
  assert.match(EJEMPLO_PLAN.plano.archivo, /EJEMPLO/); assert.match(EJEMPLO_PLAN.plano.revision, /EJEMPLO/);
  assert.ok(JSON.stringify(EJEMPLO_PLAN).match(/EJEMPLO/g).length > 10);
});
test('requiere_aprobacion: media/baja y supuestos sí; alta de tabla/texto no; todo empieza pendiente', () => {
  const v = validar(EJEMPLO_PLAN);
  for (const it of v.items) {
    assert.equal(it.estado, 'pendiente');
    assert.equal(it.requiere_aprobacion, it.confianza !== 'alta' || it.fuente.metodo === 'supuesto', it.id);
  }
  assert.equal(v.items.find((i) => i.id === 'cuartos[0].area_sf').requiere_aprobacion, false);
  assert.equal(v.items.find((i) => i.id === 'cuartos[1].area_sf').requiere_aprobacion, true);
});
test('rechaza negativos, NaN/Infinity, números como texto, unidad desconocida y valores sin fuente (mensajes en español)', () => {
  const casos = [
    ['negativo', (j) => { j.cuartos[0].area_sf.valor = -5; }, 'negativo'],
    ['NaN', (j) => { j.cuartos[0].area_sf.valor = NaN; }, 'no_numero'],
    ['Infinity', (j) => { j.cuartos[0].area_sf.valor = Infinity; }, 'no_numero'],
    ['texto', (j) => { j.cuartos[0].area_sf.valor = '168'; }, 'no_numero'],
    ['número suelto sin fuente', (j) => { j.cuartos[0].area_sf = 168; }, 'sin_fuente'],
    ['sin fuente', (j) => { delete j.cuartos[0].area_sf.fuente; }, 'sin_fuente'],
    ['sin texto literal', (j) => { j.cuartos[0].area_sf.fuente.texto_literal = ''; }, 'fuente_incompleta'],
    ['sin página', (j) => { delete j.cuartos[0].area_sf.fuente.pagina; }, 'fuente_incompleta'],
    ['bbox corto', (j) => { j.cuartos[0].area_sf.fuente.bbox = [1, 2, 3]; }, 'bbox_invalido'],
    ['bbox invertido', (j) => { j.cuartos[0].area_sf.fuente.bbox = [10, 10, 5, 5]; }, 'bbox_invalido'],
    ['bbox negativo', (j) => { j.cuartos[0].area_sf.fuente.bbox = [-1, 0, 5, 5]; }, 'bbox_invalido'],
    ['método', (j) => { j.cuartos[0].area_sf.fuente.metodo = 'adivinado'; }, 'metodo_desconocido'],
    ['confianza', (j) => { j.cuartos[0].area_sf.confianza = 'altisima'; }, 'confianza_invalida'],
    ['unidad', (j) => { j.partidas_sugeridas[0].unidad = 'metros'; }, 'unidad_desconocida'],
    ['unidad de insumo', (j) => { j.partidas_sugeridas[0].insumos[0].unidad = 'cubetas'; }, 'unidad_desconocida'],
    ['cantidad de conteo negativa', (j) => { j.conteos[0].cantidad.valor = -1; }, 'negativo'],
    ['versión', (j) => { j.version = 2; }, 'version'],
    ['falta hojas', (j) => { delete j.hojas; }, 'falta_campo'],
    ['sha256', (j) => { j.plano.sha256 = 'abc'; }, 'sha256_invalido'],
  ];
  for (const [nombre, mut, codigo] of casos) {
    const j = clon(EJEMPLO_PLAN); mut(j);
    const v = validar(j);
    assert.equal(v.ok, false, nombre);
    const e = v.errores.find((x) => x.codigo === codigo);
    assert.ok(e, `${nombre}: se esperaba ${codigo}, hubo ${v.errores.map((x) => x.codigo)}`);
    assert.ok(e.ruta && e.mensaje_es && /[a-záéíóú]/i.test(e.mensaje_es), nombre);
    assert.ok(!/undefined|\{\d\}/.test(e.mensaje_es), `${nombre}: ${e.mensaje_es}`);
  }
  assert.equal(validar(null).ok, false); assert.equal(validar([]).ok, false); assert.equal(validar('x').ok, false);
});
test('alias de unidad sf -> ft² y advertencias (escala no verificada, página sin hoja)', () => {
  const v = validar(EJEMPLO_PLAN);
  assert.equal(v.datos.partidas_sugeridas[0].unidad, 'ft²');
  const j = clon(EJEMPLO_PLAN); j.hojas[0].escala_verificada = false; j.cuartos[0].area_sf.fuente.pagina = 9;
  const w = validar(j);
  assert.deepEqual(w.errores, []);
  assert.ok(w.advertencias.some((a) => a.codigo === 'escala_no_verificada'));
  assert.ok(w.advertencias.some((a) => a.codigo === 'pagina_sin_hoja'));
  // visión sobre hoja sin escala verificada obliga aprobación aunque la confianza sea alta
  const k = clon(EJEMPLO_PLAN); k.hojas[0].escala_verificada = false; k.cuartos[0].perimetro_lf.confianza = 'alta';
  assert.equal(validar(k).items.find((i) => i.id === 'cuartos[0].perimetro_lf').requiere_aprobacion, true);
});
test('cada código de error/advertencia tiene texto en español e inglés, con los mismos marcadores', () => {
  for (const c of CODIGOS) for (const L of ['es', 'en']) assert.ok(dict[L]['cant.err.' + c], `${L} cant.err.${c}`);
  for (const c of ADVERTENCIAS) for (const L of ['es', 'en']) assert.ok(dict[L]['cant.warn.' + c], `${L} cant.warn.${c}`);
});
test('aprobar y corregir: no mutan, exigen quién, y corregir anula la aprobación previa', () => {
  const it = validar(EJEMPLO_PLAN).items.find((i) => i.id === 'cuartos[1].area_sf');
  const a = aprobar(it, ' Alex ', AHORA);
  assert.equal(it.estado, 'pendiente'); assert.equal(a.estado, 'aprobado'); assert.equal(a.aprobado_por, 'Alex'); assert.equal(a.aprobado_en, AHORA.toISOString());
  assert.equal(estaAprobado(a), true);
  assert.throws(() => aprobar(it, '', AHORA), /quién/); assert.throws(() => aprobar(it, 'A', 'no-fecha'), /fecha/);
  const c = corregir(a, 131.5, 'Alex', AHORA);
  assert.equal(c.valor, 131.5); assert.equal(c.valor_original, 120); assert.equal(c.estado, 'pendiente'); assert.equal(estaAprobado(c), false);
  assert.equal(c.fuente.metodo, 'medido_humano'); assert.equal(a.valor, 120);
  assert.equal(corregir(c, 140, 'Alex', AHORA).valor_original, 120, 'conserva el original de verdad');
  for (const mal of [-1, NaN, '', null, 'abc', true]) assert.throws(() => corregir(a, mal, 'Alex', AHORA), /cantidad/i, String(mal));
});
test('aprobarAltas: solo las de confianza alta sin condiciones; nunca media/baja; contador X de Y', () => {
  const items = validar(EJEMPLO_PLAN).items;
  const r = aprobarAltas(items, 'Alex', AHORA);
  for (const it of r) { if (it.requiere_aprobacion) assert.equal(it.estado, 'pendiente', it.id); else assert.equal(it.estado, 'aprobado'); }
  const n = items.filter((i) => !i.requiere_aprobacion).length;
  assert.deepEqual(contarAprobadas(r), { aprobadas: n, total: 14 });
  assert.deepEqual(contarAprobadas(items), { aprobadas: 0, total: 14 });
});
test('calcularPartida: pendiente -> null; aprobada -> línea; catálogo usa el motor; sin catálogo queda en $0', () => {
  const items = validar(EJEMPLO_PLAN).items;
  const dw = items.find((i) => i.id === 'partidas_sugeridas[1].cantidad');
  assert.equal(calcularPartida(dw, { id: 'x', catalogo: cat }), null);
  assert.equal(calcularPartida(aprobar(items[0], 'A', AHORA), { id: 'x', catalogo: cat }), null, 'un cuarto no es una partida');
  const l = calcularPartida(aprobar(dw, 'A', AHORA), { id: 'L1', catalogo: cat, hojas: EJEMPLO_PLAN.hojas });
  assert.equal(l.modo, 'catalogo'); assert.equal(l.partidaId, 'dw-colgar'); assert.equal(l.cantidad, 1620); assert.equal(l.oficio, 'drywall');
  assert.match(l.nota, /Plano p\.A2\.2/); assert.equal(l.origenItemId, dw.id);
  const b = bidNuevo({ id: 'b', ajustes: ajustesIniciales(), catalogo: cat }); b.lineas = [l];
  const r = calcularBid(b); assert.ok(r.total > 0 && r.errores.length === 0, 'el motor costea la línea del catálogo');
  const libre = calcularPartida(aprobar({ ...dw, partida_id: undefined }, 'A', AHORA), { id: 'L2', catalogo: cat });
  assert.equal(libre.modo, 'libre'); b.lineas = [libre]; assert.equal(calcularBid(b).total, 0, 'no se inventan precios');
});
test('lineasDesdeItems: confianza media/baja SIN aprobar NO entra al precio; al aprobar sí; no duplica', () => {
  const ids = (() => { let n = 0; return () => 'id' + n++; })();
  const items = validar(EJEMPLO_PLAN).items;
  const b = bidNuevo({ id: 'b', ajustes: ajustesIniciales(), catalogo: cat });
  let r = lineasDesdeItems(items, { ids, catalogo: cat, hojas: EJEMPLO_PLAN.hojas });
  assert.equal(r.lineas.length, 0); assert.equal(r.omitidas.length, 3);
  // aprueba solo la de confianza alta (drywall)
  const conAlta = aprobarAltas(items, 'Alex', AHORA);
  r = lineasDesdeItems(conAlta, { ids, catalogo: cat, hojas: EJEMPLO_PLAN.hojas });
  assert.deepEqual(r.lineas.map((x) => x.linea.partidaId), ['dw-colgar']);
  assert.deepEqual(r.omitidas.map((o) => o.id).sort(), ['partidas_sugeridas[0].cantidad', 'partidas_sugeridas[2].cantidad']);
  b.lineas = r.lineas.map((x) => x.linea); const soloAlta = calcularBid(b).total; assert.ok(soloAlta > 0);
  // aprobar la de confianza baja (piso) la hace entrar y sube el precio
  const todas = conAlta.map((i) => (i.id === 'partidas_sugeridas[2].cantidad' ? aprobar(i, 'Alex', AHORA) : i));
  r = lineasDesdeItems(todas, { ids, catalogo: cat, hojas: EJEMPLO_PLAN.hojas, existentes: b.lineas });
  assert.equal(r.lineas.length, 2); assert.equal(r.lineas.find((x) => x.linea.partidaId === 'dw-colgar').existente.id, b.lineas[0].id, 'actualiza, no duplica');
  b.lineas = r.lineas.map((x) => x.linea); assert.ok(calcularBid(b).total > soloAlta);
  // corregir anula la aprobación: la línea ya no entra
  const corr = todas.map((i) => (i.id === 'partidas_sugeridas[2].cantidad' ? corregir(i, 300, 'Alex', AHORA) : i));
  assert.equal(lineasDesdeItems(corr, { ids, catalogo: cat }).lineas.length, 1);
});
test('aLineaCotizacion: catálogo y personalizada compatibles con calcularCotizacion', () => {
  const items = validar(EJEMPLO_PLAN).items;
  const a = aprobarAltas(items, 'Alex', AHORA).concat([]);
  const lib = aprobar({ ...items.find((i) => i.id === 'partidas_sugeridas[1].cantidad'), partida_id: undefined }, 'A', AHORA);
  const l1 = calcularPartida(a.find((i) => i.id === 'partidas_sugeridas[1].cantidad'), { id: 'a', catalogo: cat });
  const l2 = calcularPartida(lib, { id: 'b', catalogo: cat });
  const ajs = ajustesIniciales();
  const q = { lineas: [aLineaCotizacion(l1, 'q1'), aLineaCotizacion(l2, 'q2')], margenBp: 4000, contingenciaBp: 500, snapshot: snapshotCatalogo(cat, ajs) };
  const c = calcularCotizacion(q);
  assert.ok(c.lineas[0].precio > 0); assert.equal(c.lineas[1].precio, 0);
});
test('textoFuente: "Hoja A2.2, tabla: “…”"', () => {
  const it = validar(EJEMPLO_PLAN).items.find((i) => i.id === 'cuartos[0].area_sf');
  assert.equal(textoFuente(it, EJEMPLO_PLAN.hojas), 'Hoja A2.2, tabla: “SALA 101 - 168 SF”');
  assert.match(textoFuente(it, EJEMPLO_PLAN.hojas, 'en'), /^Sheet A2\.2, table:/);
});
