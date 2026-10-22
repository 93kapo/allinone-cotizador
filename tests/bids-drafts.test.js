import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogoInicial, ajustesIniciales } from '../defaults.js';
import { bidEjemplo } from '../bids-ejemplo.js';
import { calcularBid, vencimiento, formatoFechaLimite, fechaLimiteADate, semaforo, lineaAMotor } from '../bids-calc.js';
import { oficiosCotizados, construirBorrador, bloqueos, armarMailto, datosFirma, contarMarcadores, hayFuga, MARCADOR, TIPOS } from '../bids-drafts.js';
import { calcularCotizacion, TEXTO_CONFIRMACION } from '../engine.js';
import { dict } from '../i18n.js';

const AHORA = new Date(2026, 9, 22, 12, 0); // 22-oct-2026, hora local (hoy)
const mk = () => { let n = 0; return bidEjemplo({ id: 'b1', ids: () => 'i' + n++, ajustes: ajustesIniciales(), catalogo: catalogoInicial(), ahora: AHORA }); };
const ajConFirma = () => { const a = ajustesIniciales(); Object.assign(a.empresa, { firmante: 'Alex Pineda', email: 'ventas@allinone.test', licencia: 'CGC-TEST-000' }); return a; };
const PROHIBIDAS = /margen|markup|costo interno|margin|internal cost|profit|ganancia|overhead|contingenc/i;

test('breakouts: la suma cuadra con el total al centavo (una sola pasada del motor)', () => {
  const b = mk(); const r = calcularBid(b);
  assert.ok(r.total > 0);
  assert.equal(r.sumaGrupos, r.total); assert.equal(r.cuadra, true);
  assert.equal(r.grupos.length, b.breakouts.length);
  assert.equal(r.grupos.reduce((s, g) => s + g.precio, 0), r.total);
  // lineas sin breakout -> grupo General, y sigue cuadrando
  b.lineas[0].breakoutId = null;
  const r2 = calcularBid(b);
  assert.equal(r2.cuadra, true); assert.equal(r2.sumaGrupos, r2.total); assert.equal(r2.sinAsignar, 1);
  assert.equal(r2.grupos.at(-1).id, null);
});
test('costeo reutiliza el motor: igual que calcularCotizacion directo y respeta margen sobre precio', () => {
  const b = mk(); const r = calcularBid(b);
  const direct = calcularCotizacion({ lineas: b.lineas.map(lineaAMotor), margenBp: b.margenBp, contingenciaBp: b.contingenciaBp, snapshot: b.snapshot });
  assert.equal(r.total, direct.totales.precio);
  assert.equal(r.costoTotal, direct.totales.costoTotal);
  assert.equal(r.margenBp, 4000);
  assert.ok(Math.abs(r.markupPct - 66.7) < 0.1); // 40% margen = 66.7% markup
  assert.equal(semaforo(3400, 3500), 'rojo'); assert.equal(semaforo(3700, 3500), 'ambar'); assert.equal(semaforo(4000, 3500), 'verde');
});
test('línea libre: impuesto 7.5% sobre materiales y horas = cantidad / productividad', () => {
  const b = mk(); b.lineas = [{ id: 'x', oficio: 'paint', breakoutId: null, modo: 'libre', nombre: 't', cantidad: 100, unidad: 'ft²', matCents: 100, productividad: 50, horas: 0, tarifaCents: 2000, otrosCents: 0, subCents: 0, subMarkupBp: 0 }];
  b.contingenciaBp = 0; b.snapshot.ajustes.overheadBp = 0; b.snapshot.ajustes.garantiaBp = 0;
  const r = calcularBid(b), t = r.calc.totales;
  assert.equal(t.materiales, 10000); assert.equal(t.impuestoMat, 750);
  assert.equal(t.horas, 2); assert.equal(t.manoObra, 2 * 2000 + Math.round(4000 * 0.30));
});
test('vencida: fecha límite pasada frente a "ahora" inyectado', () => {
  const b = mk();
  const v = vencimiento(b.fechaLimite, AHORA);
  assert.equal(v.vencida, true); assert.equal(v.dias, 2);
  assert.equal(vencimiento('2026-10-23T09:00', AHORA).vencida, false);
  assert.equal(vencimiento('2026-10-22', AHORA).vencida, false); // solo fecha: vale hasta el fin del día
  assert.equal(vencimiento('', AHORA).tiene, false);
  assert.equal(formatoFechaLimite('2026-10-19T14:00'), '10/19/2026 2:00 PM');
  assert.equal(fechaLimiteADate('2026-10-19T14:00').getHours(), 14); // hora local, no UTC
});
test('borradores EN/ES: no contienen margen/markup/costo interno ni cifras internas', () => {
  const b = mk(); const r = calcularBid(b); const aj = ajConFirma();
  for (const lang of ['en', 'es']) for (const tipo of TIPOS) {
    const d = construirBorrador({ tipo, lang, bid: b, ajustes: aj, resumen: r, rfi: 'Is the paint spec Sherwin-Williams?' });
    assert.ok(!PROHIBIDAS.test(d.asunto + '\n' + d.cuerpo), `${tipo}/${lang}`);
    assert.ok(!/insur|asegur|seguro/i.test(d.cuerpo), 'no promete seguro no configurado');
    assert.ok(!d.cuerpo.includes(String(r.costoTotal)), 'no filtra el costo');
  }
  const p = construirBorrador({ tipo: 'proposal', lang: 'es', bid: b, ajustes: aj, resumen: r });
  assert.ok(p.cuerpo.includes('Publix Building:')); assert.ok(p.cuerpo.includes('Total: $'));
  assert.ok(p.asunto.startsWith('Propuesta')); 
  assert.ok(construirBorrador({ tipo: 'intent', lang: 'en', bid: b, ajustes: aj, resumen: r }).asunto.startsWith('Intent to bid'));
  assert.match(construirBorrador({ tipo: 'intent', lang: 'en', bid: b, ajustes: aj, resumen: r }).cuerpo, /Paints and coatings/);
});
test('borrador de propuesta: los renglones suman el total mostrado', () => {
  const b = mk(); const r = calcularBid(b); const aj = ajConFirma();
  const cuerpo = construirBorrador({ tipo: 'proposal', lang: 'en', bid: b, ajustes: aj, resumen: r }).cuerpo;
  const montos = [...cuerpo.matchAll(/^- .*: \$([\d,]+\.\d{2})$/gm)].map((m) => Math.round(parseFloat(m[1].replace(/,/g, '')) * 100));
  const total = cuerpo.match(/^Total: \$([\d,]+\.\d{2})$/m)[1];
  assert.equal(montos.reduce((s, x) => s + x, 0), Math.round(parseFloat(total.replace(/,/g, '')) * 100));
  assert.equal(Math.round(parseFloat(total.replace(/,/g, '')) * 100), r.total);
});
test('marcadores [COMPLETAR] cuando faltan firmante, correo o licencia; bloquean el correo', () => {
  const b = mk(); const r = calcularBid(b);
  const aj = ajustesIniciales(); // firmante/correo/licencia vacíos
  const d = construirBorrador({ tipo: 'intent', lang: 'es', bid: b, ajustes: aj, resumen: r });
  assert.ok(contarMarcadores(d.cuerpo) >= 3);
  const base = { destino: 'correo', tipo: 'intent', asunto: d.asunto, cuerpo: d.cuerpo, vencida: false, resumen: r };
  assert.deepEqual(bloqueos(base), ['marcadores']);
  assert.deepEqual(bloqueos({ ...base, confirmaMarcadores: true }), []);
  // completos en Ajustes => sin marcadores
  const ok = construirBorrador({ tipo: 'intent', lang: 'es', bid: b, ajustes: ajConFirma(), resumen: r });
  assert.equal(contarMarcadores(ok.asunto, ok.cuerpo), 0);
  assert.deepEqual(bloqueos({ ...base, asunto: ok.asunto, cuerpo: ok.cuerpo }), []);
  // empresa sin 'firmante' definido (ajustes viejos guardados) también da marcador
  const viejo = ajustesIniciales(); delete viejo.empresa.firmante; delete viejo.empresa.seguro;
  assert.equal(datosFirma(viejo).firmante, MARCADOR);
  assert.equal(datosFirma({}).licencia, MARCADOR);
});
test('vencida bloquea correo y PDF hasta confirmar', () => {
  const b = mk(); const r = calcularBid(b);
  const ok = construirBorrador({ tipo: 'intent', lang: 'en', bid: b, ajustes: ajConFirma(), resumen: r });
  const venc = vencimiento(b.fechaLimite, AHORA).vencida;
  assert.equal(venc, true);
  assert.deepEqual(bloqueos({ destino: 'correo', tipo: 'intent', asunto: ok.asunto, cuerpo: ok.cuerpo, vencida: venc }), ['vencida']);
  assert.deepEqual(bloqueos({ destino: 'correo', tipo: 'intent', asunto: ok.asunto, cuerpo: ok.cuerpo, vencida: venc, confirmaVencida: true }), []);
  const rp = { destino: 'pdf', tipo: 'proposal', vencida: venc, resumen: r };
  assert.ok(bloqueos(rp).includes('vencida'));
  assert.ok(!bloqueos({ ...rp, confirmaVencida: true }).includes('vencida'));
});
test('propuesta: bloqueos por margen bajo, sin precio, sin asignar y fuga de palabras', () => {
  const b = mk(); b.margenBp = 3000; const r = calcularBid(b);
  assert.equal(r.semaforo, 'rojo');
  const base = { destino: 'pdf', tipo: 'proposal', vencida: false, resumen: r };
  assert.deepEqual(bloqueos(base), ['margen']);
  assert.deepEqual(bloqueos({ ...base, confirmaMargenTxt: 'confirmo margen bajo' }), []);
  assert.equal(TEXTO_CONFIRMACION, 'CONFIRMO MARGEN BAJO');
  assert.deepEqual(bloqueos({ ...base, resumen: { ...r, total: 0 } }), ['sinPrecio']);
  assert.ok(bloqueos({ ...base, confirmaMargenTxt: TEXTO_CONFIRMACION, resumen: { ...r, sinAsignar: 2 } }).includes('sinAsignar'));
  assert.ok(bloqueos({ ...base, confirmaMargenTxt: TEXTO_CONFIRMACION, textosCliente: ['Nuestro margen es 30%'] }).includes('fuga'));
  assert.equal(hayFuga('Includes labor and materials'), false);
});
test('mailto: encodeURIComponent, CRLF y destinatario', () => {
  const h = armarMailto({ para: 'a.b@example.com', asunto: 'Propuesta - Año & Co', cuerpo: 'Línea 1\nLínea 2' });
  assert.ok(h.startsWith('mailto:a.b@example.com?subject='));
  assert.ok(h.includes('subject=' + encodeURIComponent('Propuesta - Año & Co')));
  assert.ok(h.includes('&body=' + encodeURIComponent('Línea 1\r\nLínea 2')));
  assert.equal(armarMailto({ asunto: 'x', cuerpo: 'y' }), 'mailto:?subject=x&body=y');
});
test('i18n: claves dinámicas de licitaciones existen en es y en', () => {
  const ks = [...['verde', 'ambar', 'rojo'].map((x) => 'bidsem.' + x), ...['vencida', 'marcadores', 'fuga', 'margen', 'sinPrecio', 'sinAsignar', 'noCuadra', 'generic'].map((x) => 'bidblock.' + x),
    ...TIPOS.map((x) => 'bidtype.' + x), ...['nuevo', 'interesado', 'cotizando', 'borrador', 'enviada', 'ganada', 'perdida', 'descartada'].map((x) => 'bidstate.' + x),
    ...['datos', 'costos', 'borradores'].map((x) => 'bidstep.' + x), ...['incl', 'excl', 'assum', 'addenda'].map((x) => 'bid.d.proposal.' + x), 'bid.pdf.price', 'bid.pdf.breakdown'];
  for (const k of ks) { assert.ok(k in dict.es, k); assert.ok(k in dict.en, k); }
});

test('propuesta: breakouts sin líneas dicen "Not bid"/"Sin cotizar" (nunca $0.00) y el alcance lista solo lo cotizado', () => {
  const b = mk(); const r = calcularBid(b); const aj = ajConFirma();
  const en = construirBorrador({ tipo: 'proposal', lang: 'en', bid: b, ajustes: aj, resumen: r }).cuerpo;
  const es = construirBorrador({ tipo: 'proposal', lang: 'es', bid: b, ajustes: aj, resumen: r }).cuerpo;
  assert.ok(en.includes('- Site work: Not bid')); assert.ok(es.includes('- Site work: Sin cotizar'));
  assert.ok(!/\$0\.00/.test(en));
  assert.deepEqual(oficiosCotizados(b, 'en'), ['Paints and coatings', 'Gypsum drywall', 'Hard tile']);
  assert.ok(!en.includes('Electrical'));
});
test('ejemplo: marcado EJEMPLO, sin correo ni teléfono directo, nota de cifras de prueba', () => {
  const b = mk();
  assert.equal(b.ejemplo, true); assert.equal(b.email, '');
  assert.ok(b.notas.includes('cifras de prueba'));
  assert.equal((JSON.stringify({ ...b, snapshot: null }).match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || []).length, 1); // solo el teléfono de la invitación; ningún otro número directo
  assert.ok(!/@/.test(JSON.stringify(b.contacto + b.email)));
  assert.equal(b.telefono, '(770) 751-5463 x1163');
  assert.equal(b.breakouts.length, 6);
});
