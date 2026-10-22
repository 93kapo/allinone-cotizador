import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { catalogoInicial, ajustesIniciales } from '../defaults.js';

test('35% margen sobre costo 650 -> precio 1000', () => {
  assert.equal(E.precioDesdeCosto(65000, 3500), 100000);
  assert.equal(E.margenReal(100000, 65000), 3500);
});
test('markup equivalente: 35% margen = 53.8% markup', () => {
  assert.equal(E.markupPctDesdeMargenBp(3500).toFixed(1), '53.8');
  assert.equal(E.markupPctReal(100000, 65000).toFixed(1), '53.8');
});
test('redondeo a centavos enteros', () => {
  const p = E.precioDesdeCosto(12345, 3333);
  assert.ok(Number.isInteger(p));
  assert.equal(p, Math.round(12345 * 10000 / 6667));
  assert.equal(E.mulBp(333, 750), 25); // 24.975 -> 25
  assert.equal(E.aCentavos(19.99), 1999);
  assert.equal(E.aCentavos(1.005), 101);
});
test('margen < piso bloquea; con texto exacto permite', () => {
  assert.equal(E.puedeGenerarPdf(3000, 3500).ok, false);
  assert.equal(E.puedeGenerarPdf(3000, 3500).requiereConfirmacion, true);
  assert.equal(E.puedeGenerarPdf(3000, 3500, 'ok').ok, false);
  assert.equal(E.puedeGenerarPdf(3000, 3500, E.TEXTO_CONFIRMACION).ok, true);
  assert.equal(E.puedeGenerarPdf(3500, 3500).ok, true);
  assert.equal(E.puedeGenerarPdf(3499, 3500).ok, false);
});
test('ganancia neta tras impuestos (25%)', () => {
  assert.equal(E.gananciaNeta(35000, 2500), 26250);
  assert.equal(E.gananciaNeta(-100, 2500), -100);
});
test('medirCuarto: paredes, techo, trim', () => {
  const m = E.medirCuarto({ largo: 12, ancho: 10, alto: 8, puertas: 1, ventanas: 2 });
  assert.equal(m.perimetro, 44);
  assert.equal(m.paredes, 44 * 8 - 21 - 30);
  assert.equal(m.techo, 120);
  assert.equal(m.trim, 41);
  assert.equal(E.medirCuarto({ largo: 1, ancho: 1, alto: 1, puertas: 5 }).paredes, 0);
});
test('galones enteros con manos, oscuro y desperdicio', () => {
  assert.equal(E.galones({ area: 750, manos: 2, cobertura: 375 }), 4);
  assert.equal(E.galones({ area: 751, manos: 2, cobertura: 375 }), 5);
  assert.equal(E.galones({ area: 750, manos: 2, cobertura: 375, desperdicioBp: 1000 }), 5);
  assert.equal(E.manosEfectivas(2, true), 3);
});
test('mano de obra: horas, burden 30%', () => {
  const m = E.costoManoObra({ cantidad: 400, productividad: 200, tarifaCents: 2400, burdenBp: 3000 });
  assert.equal(m.horas, 2);
  assert.equal(m.salario, 4800);
  assert.equal(m.burden, 1440);
  assert.equal(m.total, 6240);
  const d = E.costoManoObra({ cantidad: 400, productividad: 200, multBp: 13000, tarifaCents: 2400, burdenBp: 3000 });
  assert.equal(d.horas, 2.6);
});
test('subcontrato con markup', () => {
  assert.equal(E.costoSub({ costoCents: 10000, markupBp: 1000 }), 11000);
});
test('repartir suma exacta', () => {
  const r = E.repartir(10001, [1, 1, 1]);
  assert.equal(r.reduce((a, b) => a + b, 0), 10001);
  assert.equal(E.repartir(100, [0, 0]).reduce((a, b) => a + b, 0), 100);
});
test('cadena de costos completa (cotización de ejemplo)', () => {
  const aj = ajustesIniciales(), cat = catalogoInicial();
  const q = {
    margenBp: 4000, snapshot: E.snapshotCatalogo(cat, aj),
    lineas: [{ id: 'a', partidaId: 'pint-int-paredes', cantidad: 750, opciones: { manos: 2 } }],
  };
  const r = E.calcularCotizacion(q);
  const t = r.totales;
  assert.equal(r.lineas[0].materiales[0].cantidad, 4); // 750*2/375 = 4 gal
  assert.equal(t.materiales, 4 * 7000 + Math.round(750 * 3)); // pintura + masilla
  assert.equal(t.impuestoMat, E.mulBp(t.materiales, 750));
  assert.equal(t.manoObra, 6240 - 6240 + Math.round(3.75 * 2400) + E.mulBp(Math.round(3.75 * 2400), 3000));
  assert.equal(t.costoTotal, t.directos + t.contingencia + t.overhead + t.garantia);
  assert.equal(t.contingencia, E.mulBp(t.directos, 500));
  assert.equal(t.precio, E.precioDesdeCosto(t.costoTotal, 4000));
  assert.equal(r.lineas[0].precio, t.precio);
  assert.ok(Math.abs(t.margenBp - 4000) <= 1);
  assert.equal(t.ganancia, t.precio - t.costoTotal);
});
test('snapshot NO cambia al editar el catálogo', () => {
  const aj = ajustesIniciales(), cat = catalogoInicial();
  const q = { margenBp: 4000, snapshot: E.snapshotCatalogo(cat, aj),
    lineas: [{ id: 'a', partidaId: 'piso-lvp', cantidad: 500 }] };
  const antes = E.calcularCotizacion(q).totales.precio;
  cat.materiales.find((m) => m.id === 'lvp').cents = 99999;
  cat.tarifas.find((t) => t.id === 'instalador').cents = 99999;
  aj.burdenBp = 9000; aj.impuestoVentasBp = 0;
  assert.equal(E.calcularCotizacion(q).totales.precio, antes);
  const q2 = { ...q, snapshot: E.snapshotCatalogo(cat, aj) };
  assert.notEqual(E.calcularCotizacion(q2).totales.precio, antes);
});
test('contingencia por defecto: 10% pre-1978 o remodelación', () => {
  const aj = ajustesIniciales();
  assert.equal(E.contingenciaPorDefecto({ anioConstruccion: 1990 }, aj), 500);
  assert.equal(E.contingenciaPorDefecto({ anioConstruccion: 1970 }, aj), 1000);
  assert.equal(E.contingenciaPorDefecto({ anioConstruccion: 2000, esRemodelacion: true }, aj), 1000);
  assert.equal(E.esPre1978(1977), true);
  assert.equal(E.esPre1978(1978), false);
});
test('hitos suman exactamente el total', () => {
  const m = E.montosHitos(123457, [1000, 5000, 4000]);
  assert.equal(m.reduce((a, b) => a + b, 0), 123457);
  assert.equal(E.anticipoExcede10(1000), false);
  assert.equal(E.anticipoExcede10(1001), true);
});
test('parseLongitud ft/in', () => {
  assert.equal(E.parseLongitud("12' 6\""), 12.5);
  assert.equal(E.parseLongitud('12ft 6in'), 12.5);
  assert.equal(E.parseLongitud('12.5'), 12.5);
  assert.equal(E.parseLongitud('150 in'), 12.5);
  assert.equal(E.parseLongitud("10'"), 10);
  assert.ok(Number.isNaN(E.parseLongitud('abc')));
});
test('escala, polilínea y área (shoelace)', () => {
  const esc = E.calibrarEscala({ x: 0, y: 0 }, { x: 100, y: 0 }, 20); // 0.2 ft/pt
  assert.equal(esc, 0.2);
  const cuadro = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  assert.equal(E.areaPoligono(cuadro, esc), 5000 * 0.04);
  assert.equal(E.longitudPolilinea(cuadro, esc, true), 300 * 0.2);
  assert.equal(E.formatoPiesPulgadas(12.5), `12' 6"`);
});
test('partidas del catálogo inicial calculan sin error y están marcadas estimado', () => {
  const aj = ajustesIniciales(), cat = catalogoInicial();
  for (const p of cat.partidas) {
    assert.equal(p.estimado, true);
    const r = E.costearLinea({ partidaId: p.id, cantidad: 10, opciones: { primer: true, oscuro: true } }, cat, aj);
    assert.ok(r.totales.directo > 0, p.id);
  }
  for (const x of [...cat.tarifas, ...cat.materiales]) assert.equal(x.estimado, true);
});
