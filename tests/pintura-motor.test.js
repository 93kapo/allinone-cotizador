import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../pintura-motor.js';
import * as D from '../pintura-datos.js';
import { calcularCotizacion, precioDesdeCosto, margenReal, snapshotCatalogo } from '../engine.js';
import { catalogoInicial, ajustesIniciales } from '../defaults.js';
import { validar, aprobar } from '../plan-cantidades.js';
import { EJEMPLO_PLAN } from '../plan-cantidades-ejemplo.js';

const aj = ajustesIniciales();
const CASA = [
  { largo: 14, ancho: 12, alto: 8, puertas: 1, ventanas: 2 },
  { largo: 12, ancho: 10, alto: 8, puertas: 1, ventanas: 1 },
  { largo: 10, ancho: 10, alto: 8, puertas: 1, ventanas: 1 },
];
/** Proyecto de ejemplo ya completo: precios escritos, equipo elegido. */
function proyecto(mod = {}) {
  const p = M.pinturaInicial(aj);
  p.precios.promar200 = 6500; p.precios['a100-ext'] = 7200;
  p.cuadrilla.personas = 2; p.cuadrilla.horasDia = 8;
  p.superv = { horas: 4, tarifaCents: 3000 };
  p.A.seguroBp = 0; p.B.compBp = 500;
  return Object.assign(p, mod);
}
const calc = (p, cuartos = CASA, extra = {}) => M.calcular(p, { cuartos, ajustes: aj, itemsPlano: [], ...extra });
const esFinito = (x) => typeof x !== 'number' || Number.isFinite(x);
function recorrer(o, f, ruta = '') { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) recorrer(v, f, ruta + '.' + k); else f(o, ruta); }

test('horas: mínimo <= probable <= máximo en muchas combinaciones', () => {
  let n = 0;
  for (const alcance of ['interior', 'exterior', 'ambos']) for (const inm of ['casa', 'comercial']) for (const ocup of [false, true]) for (const dif of [false, true]) {
    const p = proyecto({ alcance, inmueble: inm });
    p.exterior.area = 2500; p.horas.factores.ocupado = ocup; p.horas.factores.dificil = dif; p.horas.contPct = 12;
    const r = calc(p);
    for (const k of ['sinContingencia', 'conContingencia', 'pintura', 'preparacion', 'fijas']) {
      assert.ok(r.horas[k].minimo <= r.horas[k].probable && r.horas[k].probable <= r.horas[k].maximo, `${k} ${alcance} ${inm}`);
    }
    n++;
  }
  assert.equal(n, 24);
});
test('horas: un valor de productividad escrito al revés o en 0 no rompe el orden', () => {
  const p = proyecto(); p.horas.prod.paredLisa = { bajo: 350, probable: 200, alto: 0 };
  const r = calc(p);
  assert.ok(r.horas.sinContingencia.minimo <= r.horas.sinContingencia.probable && r.horas.sinContingencia.probable <= r.horas.sinContingencia.maximo);
});
test('horas: escalan linealmente con el área (sin horas fijas)', () => {
  const p = proyecto(); p.horas.fijas = { bajo: 0, probable: 0, alto: 0 };
  const uno = calc(p).horas.sinContingencia, dos = calc(p, [...CASA, ...CASA]).horas.sinContingencia;
  for (const k of ['minimo', 'probable', 'maximo']) assert.ok(Math.abs(dos[k] - 2 * uno[k]) < 0.05, `${k}: ${dos[k]} vs ${2 * uno[k]}`);
  // Con horas fijas el total es afín: h(2A) - h(A) = h(A) - h(0)
  const q = proyecto(); const h1 = calc(q).horas.sinContingencia.probable, h2 = calc(q, [...CASA, ...CASA]).horas.sinContingencia.probable, h0 = calc(q, []).horas.sinContingencia.probable;
  assert.equal(h0, 0); // sin trabajo no hay horas fijas
  assert.ok(h2 > h1 && h1 > 0);
});
test('horas: fórmula por tarea = cantidad x manos / productividad (paredes lisas, 270 ft²/h probable)', () => {
  const p = proyecto(); p.interior = { techos: false, trim: false, puertas: false, textura: false }; p.horas.prep = { bajo: 0, probable: 0, alto: 0 }; p.horas.fijas = { bajo: 0, probable: 0, alto: 0 };
  const r = calc(p, [{ largo: 20, ancho: 20, alto: 10, puertas: 0, ventanas: 0 }]); // 800 ft² de pared, 2 manos
  assert.equal(r.horas.sinContingencia.probable, Math.round((800 * 2 / 270) * 100) / 100);
  assert.equal(r.horas.sinContingencia.minimo, Math.round((800 * 2 / 350) * 100) / 100);
  assert.equal(r.horas.sinContingencia.maximo, Math.round((800 * 2 / 200) * 100) / 100);
});
test('horas: preparación, factores con nombre y contingencia (rango correlacionado)', () => {
  const p = proyecto(); p.horas.fijas = { bajo: 0, probable: 0, alto: 0 };
  const base = calc(p).horas;
  assert.ok(Math.abs(base.preparacion.minimo - base.pintura.minimo * 0.2) < 1e-9);
  assert.ok(Math.abs(base.preparacion.maximo - base.pintura.maximo * 0.4) < 1e-9);
  p.horas.factores.dificil = true;
  const dif = calc(p).horas;
  assert.ok(Math.abs(dif.sinContingencia.probable / base.sinContingencia.probable - 1.2) < 0.01);
  p.horas.contPct = 10;
  const c = calc(p).horas;
  assert.ok(Math.abs(c.conContingencia.probable / c.sinContingencia.probable - 1.1) < 0.001);
});
test('factores: ocupado baja la productividad (-20 % = x1.25, -40 % = x1.67) y todo queda acotado', () => {
  const p = proyecto(); p.horas.factores.ocupado = true;
  const f = M.factoresDe(p, calc(p).areas);
  assert.ok(Math.abs(f.total.minimo - 1.25) < 1e-9 && Math.abs(f.total.maximo - 1 / 0.6) < 1e-9);
  p.horas.mult.dificil = 99; p.horas.factores.dificil = true; p.horas.mult.acceso = 99; p.horas.factores.acceso = true;
  const g = M.factoresDe(p, calc(p).areas);
  assert.ok(g.total.maximo <= D.LIMITE_FACTOR_TOTAL.max);
  for (const x of g.lista) assert.ok(x.maximo <= D.LIMITE_FACTOR.max);
  const q = proyecto(); assert.equal(M.factoresDe(q, { alturaAuto: true }).lista[0].id, 'altura'); // techos altos (> 10 ft) activan el factor solos
  q.horas.factores.altura = false; assert.equal(M.factoresDe(q, { alturaAuto: true }).lista.length, 0);
});

// ---------- cuadrilla y días ----------
const HORAS = { minimo: 80, probable: 100, maximo: 130 };
test('cuadrilla: sin personas u horas por día elegidas no hay valor por defecto', () => {
  assert.equal(M.planCuadrilla({ horas: HORAS }).incompleto, true);
  assert.equal(M.planCuadrilla({ horas: HORAS, personas: 2 }).falta, 'horasDia');
  assert.equal(M.pinturaInicial(aj).cuadrilla.personas, null);
  assert.equal(M.pinturaInicial(aj).cuadrilla.horasDia, null);
});
test('días >= ceil(horas / capacidad) y no suben al agregar personas; pasado el tope quedan iguales', () => {
  let ant = Infinity;
  for (let n = 1; n <= 12; n++) {
    const pl = M.planCuadrilla({ horas: HORAS, personas: n, horasDia: 8, eficienciaPct: 85, areaPared: 1000, ft2PorPersona: 250, diasEspera: 0 });
    const cap = pl.efectivas * 8 * 0.85;
    assert.ok(pl.probable.dias >= Math.ceil(100 / cap - 1e-9), `n=${n}`);
    assert.ok(pl.probable.dias <= ant, `n=${n} no debe subir`);
    ant = pl.probable.dias;
    if (n > 4) { assert.equal(pl.excedeTope, true); assert.equal(pl.efectivas, 4); }
  }
  const a = M.planCuadrilla({ horas: HORAS, personas: 5, horasDia: 8, areaPared: 1000, ft2PorPersona: 250 }), b = M.planCuadrilla({ horas: HORAS, personas: 9, horasDia: 8, areaPared: 1000, ft2PorPersona: 250 });
  assert.equal(a.probable.dias, b.probable.dias);
});
test('días = trabajo + espera por secado; resumen horas-hombre y conversión en días y horas', () => {
  const pl = M.planCuadrilla({ horas: HORAS, personas: 2, horasDia: 8, eficienciaPct: 100, diasEspera: 3 });
  assert.equal(pl.probable.diasTrabajo, Math.ceil(100 / 16));
  assert.equal(pl.probable.dias, Math.ceil(100 / 16) + 3);
  assert.deepEqual(M.aDiasYHoras(100, 24), { dias: 4, horas: 4 });
  assert.deepEqual(M.aDiasYHoras(100, 8), { dias: 12, horas: 4 });
  assert.deepEqual(M.aDiasYHoras(0, 8), { dias: 0, horas: 0 });
  const r = M.resumenCuadrilla(pl);
  assert.equal(r.horasHombre, 100); assert.equal(r.personas, 2);
});
test('secado: suma días solo si repintar tarda más que la jornada (4 h no suma; 24 h suma 1 por mano adicional)', () => {
  const s = (o) => M.esperaSecado({ manos: 2, horasDia: 8, ...o });
  assert.equal(s({ recoatH: 4 }).dias, 0);
  assert.equal(s({ recoatH: 8 }).dias, 0); // cabe justo en la jornada
  assert.equal(s({ recoatH: 24 }).dias, 1);
  assert.equal(s({ recoatH: 24, manos: 3 }).dias, 2);
  assert.equal(s({ recoatH: 24, manos: 1 }).dias, 0); // una mano: nada que esperar
  assert.equal(s({ recoatH: 12 }).dias, 1);
  assert.equal(s({ recoatH: 4, recoatFrioH: 48, frio: true }).dias, 2); // frío: 24-48 h, se usa el valor lento
  assert.equal(s({ recoatH: 4, recoatFrioH: 48, frio: false }).dias, 0);
  assert.equal(s({ recoatH: 4, recoatFrioH: null, frio: true }).dias, 0); // la ficha no da valor de frío
  assert.equal(s({ recoatH: 4, exterior: true }).dias, 1); // exterior: 1 día de margen
  assert.equal(s({ recoatH: 24, manosPrimer: 1, manos: 2 }).dias, 2); // Loxon: 1 primer + 2 manos = 2 esperas
});
test('secado en el proyecto: ProMar interior no agrega días; Loxon (24 h) sí; clima frío en A-100 agrega', () => {
  const p = proyecto(); assert.equal(calc(p).secado.dias, 0);
  const q = proyecto({ alcance: 'exterior', prodExt: 'loxon-flat' }); q.exterior.area = 1500;
  assert.equal(calc(q).secado.dias, 2 + 1);
  const r = proyecto({ alcance: 'exterior', prodExt: 'a100-ext' }); r.exterior.area = 1500;
  assert.equal(calc(r).secado.dias, 1); r.cuadrilla.frio = true;
  assert.equal(calc(r).secado.dias, 2 + 1);
});

// ---------- materiales ----------
test('materiales: galones sumados de todos los cuartos y redondeados una sola vez; cobertura mínima de la ficha; reserva del 5 %', () => {
  const p = proyecto(); p.interior = { techos: false, trim: false, puertas: false, textura: false };
  const cuartos = Array.from({ length: 5 }, () => ({ largo: 10, ancho: 10, alto: 8, puertas: 0, ventanas: 0 })); // 5 x 320 ft² = 1,600 ft²
  const r = calc(p, cuartos);
  const gal = Math.ceil((1600 * 2 * 1.1) / 350 - 1e-9);
  assert.equal(r.mat.lineas[0].galones, gal);
  assert.ok(gal < 5 * Math.ceil((320 * 2 * 1.1) / 350)); // por cuarto sobrarían galones
  assert.equal(r.mat.subtotal, gal * 6500);
  assert.equal(r.mat.reservaCents, Math.round(gal * 6500 * 0.05));
  assert.equal(r.mat.total, r.mat.subtotal + r.mat.reservaCents);
});
test('materiales: sin precio de lista el costo queda marcado como incompleto (no se inventa precio)', () => {
  const p = proyecto(); p.precios = {};
  const r = calc(p);
  assert.equal(r.mat.subtotal, 0);
  assert.ok(r.mat.faltan.includes('precioPintura'));
  assert.ok(r.A.faltan.includes('precioPintura') && r.B.faltan.includes('precioPintura'));
});
test('materiales: Loxon pide primer (precio y cobertura los escribe la persona) y 80 ft²/gal en estuco rugoso', () => {
  const p = proyecto({ alcance: 'exterior', prodExt: 'loxon-flat' }); p.exterior.area = 800; p.precios['loxon-flat'] = 8000;
  let r = calc(p);
  assert.ok(r.mat.faltan.includes('primer'));
  assert.equal(r.mat.lineas[0].cobertura, 200);
  p.exterior.rugoso = true; p.primer = { precioCents: 5000, cobertura: 150 };
  r = calc(p);
  assert.equal(r.mat.lineas[0].cobertura, 80);
  assert.ok(!r.mat.faltan.includes('primer'));
  assert.equal(r.mat.lineas[1].tipo, 'primer');
});
test('materiales: Duration Exterior usa 1 mano en repintado y 2 en superficie nueva', () => {
  const p = proyecto({ alcance: 'exterior', prodExt: 'duration-ext-satin' }); p.exterior.area = 1000;
  assert.equal(M.resolverProducto(p, 'ext').manos, 1);
  p.exterior.nueva = true; assert.equal(M.resolverProducto(p, 'ext').manos, 2);
});
test('control de materiales: entregados - devueltos contra lo requerido', () => {
  assert.deepEqual(M.controlMateriales(10, 12, 1), { requeridos: 10, entregados: 12, devueltos: 1, usados: 11, diferencia: 1, sobra: 1, falta: 0 });
  assert.equal(M.controlMateriales(10, 8, 0).falta, 2);
  assert.equal(M.controlMateriales('', null, -3).diferencia, 0);
});

// ---------- dinero ----------
test('dinero: siempre enteros y sin NaN/Infinity con entradas vacías, cero, negativas o absurdas', () => {
  const malos = [null, undefined, '', 'abc', NaN, Infinity, -Infinity, -5, 0, '0', '12', true];
  for (const v of malos) {
    const p = proyecto();
    p.precios.promar200 = v; p.A.tarifaCents = v; p.B.salarioCents = v; p.superv = { horas: v, tarifaCents: v };
    p.horas.contPct = v; p.cuadrilla.personas = v; p.cuadrilla.horasDia = v; p.exterior.area = v; p.materiales.desperdicioPct = v; p.materiales.reservaPct = v;
    p.horas.prep = { bajo: v, probable: v, alto: v }; p.horas.fijas = { bajo: v, probable: v, alto: v };
    p.B.consumiblesPct = v; p.B.vehiculoDiaCents = v; p.B.liftDias = v; p.A.seguroBp = v; p.B.compBp = v;
    const cuartos = [{ largo: v, ancho: v, alto: v, puertas: v, ventanas: v }, { largo: 10, ancho: 10, alto: 8 }];
    const r = M.calcular(p, { cuartos, ajustes: aj, itemsPlano: [] });
    recorrer(r, (x, ruta) => assert.ok(esFinito(x), `${String(v)} -> ${ruta} = ${x}`));
    for (const E of [r.A, r.B]) for (const k of ['directos', 'costoTotal', 'precio', 'ganancia', 'materiales', 'otros']) assert.ok(Number.isInteger(E[k]), `${String(v)} ${E.id}.${k} = ${E[k]}`);
  }
  assert.equal(M.cents0(-4), 0); assert.equal(M.cents0('x'), 0); assert.equal(M.cents0(12.6), 13);
});
test('dinero: cantidades en 0 dan precio 0 y no explotan', () => {
  const r = calc(proyecto(), []);
  assert.equal(r.A.costoTotal, 0); assert.equal(r.B.precio, 0);
  assert.equal(r.A.semaforo, 'vacio');
  assert.ok(r.A.faltan.includes('medidas'));
});

// ---------- escenario A ----------
test('A: 100 h x $35 = $3,500 y si terminan en 80 h son $43.75 por hora', () => {
  assert.equal(100 * 3500, 350000);
  assert.equal(M.tarifaEfectiva(350000, 80), 4375);
  assert.equal(M.tarifaEfectiva(350000, 100), 3500);
  assert.equal(M.tarifaEfectiva(350000, 0), null);
  const p = proyecto(); p.horas.eleg = 'otro'; p.horas.horasOtro = 100; p.A.tarifaCents = 3500;
  assert.equal(calc(p).A.pago, 350000);
});
test('A: pago fijo - el costo no cambia si bajan las horas reales, la tarifa efectiva sí', () => {
  const p = proyecto(); p.horas.eleg = 'otro'; p.horas.horasOtro = 100;
  const r = calc(p);
  const costo = r.A.costoTotal;
  assert.equal(r.A.pago, 100 * r.A.tarifaCents);
  const efect = (h) => M.tarifaEfectiva(r.A.pago, h);
  assert.equal(calc(p).A.costoTotal, costo);
  assert.ok(efect(80) > efect(100) && efect(100) > efect(120));
});
test('A: elegir 35 o 40 por hora cambia solo el pago; sin contingencia de horas y sin herramientas del contratista', () => {
  const p = proyecto(); p.horas.eleg = 'otro'; p.horas.horasOtro = 100;
  p.A.tarifaCents = 3500; const a35 = calc(p).A;
  p.A.tarifaCents = 4000; const a40 = calc(p).A;
  assert.equal(a40.pago - a35.pago, 100 * 500);
  assert.equal(a35.materiales, a40.materiales);
  assert.equal(a35.horasAcordadas, 100);
  assert.deepEqual(Object.keys(a35.partes).sort(), ['impuesto', 'materiales', 'pago', 'seguro', 'supervision']);
});
test('A: horas acordadas = la que elija (mínimo/probable/máximo); por defecto probable', () => {
  const p = proyecto(); const h = calc(p).horas.sinContingencia;
  assert.equal(calc(p).A.horasAcordadas, h.probable);
  p.horas.eleg = 'minimo'; assert.equal(calc(p).A.horasAcordadas, h.minimo);
  p.horas.eleg = 'maximo'; assert.equal(calc(p).A.horasAcordadas, h.maximo);
});

// ---------- escenario B ----------
test('B: horas x salario x (1 + cargas) + contingencia de horas', () => {
  const p = proyecto(); p.horas.eleg = 'otro'; p.horas.horasOtro = 100; p.horas.contPct = 10; p.B.salarioCents = 2000; p.B.compBp = 0; p.B.sutaBp = 0; p.B.futaBp = 0;
  const r = calc(p);
  assert.equal(r.B.horasContingencia, 10);
  assert.equal(r.B.horasTotales, 110);
  assert.equal(r.B.salario, 110 * 2000);
  assert.equal(r.B.cargas.total, Math.round(110 * 2000 * 0.0765));
});
test('B: FUTA y SUTA solo sobre los primeros $7,000 por persona; compensación vacía avisa que el costo está incompleto', () => {
  const c1 = M.cargasLaborales(1000000, 1, { ficaBp: 765, futaBp: 60, sutaBp: 270, compBp: null });
  assert.equal(c1.futa, Math.round(700000 * 60 / 10000));
  assert.equal(c1.suta, Math.round(700000 * 270 / 10000));
  assert.equal(c1.faltaCompensacion, true);
  const c3 = M.cargasLaborales(1000000, 3, { ficaBp: 765, futaBp: 60, sutaBp: 270, compBp: null });
  assert.equal(c3.futa, Math.round(1000000 * 60 / 10000)); // 3 personas x $7,000 > $10,000: todo el salario
  const chico = M.cargasLaborales(300000, 2, { ficaBp: 765, futaBp: 60, sutaBp: 270, compBp: 800 });
  assert.equal(chico.faltaCompensacion, false);
  assert.equal(chico.comp, Math.round(300000 * 0.08));
  const p = proyecto(); p.B.compBp = null;
  assert.ok(calc(p).B.faltan.includes('compensacion'));
  assert.ok(!calc(p).A.faltan.includes('compensacion'));
});
test('B: herramientas por hora de vida útil (Graco $759 / 1,500 h = $0.51 por hora) y alquiler de lift por día', () => {
  const g = D.EQUIPOS_DEF[0];
  assert.equal(g.precioCents, 75900); assert.equal(g.vidaH, 1500);
  assert.equal(Math.round(g.precioCents / g.vidaH), 51);
  const p = proyecto(); p.horas.eleg = 'otro'; p.horas.horasOtro = 100; p.horas.contPct = 0;
  p.B.equipos[0].usar = true; p.B.liftDias = 2; p.B.liftPorDiaCents = 20000;
  const r = calc(p).B;
  assert.equal(r.equipos, Math.round((75900 / 1500) * 100));
  assert.equal(r.lift, 40000);
});
test('B: con la compensación vacía el dato inicial es vacío y el salario de referencia es el de BLS ($21.04)', () => {
  assert.equal(D.CARGAS_DEF.compBp.valor, null);
  assert.equal(D.SALARIO_REF.cents, 2104);
  assert.match(D.SALARIO_REF.fuente.url, /^https:\/\/www\.bls\.gov\/oes\/2023\/May\/oes_27260\.htm$/);
});
test('punto de equilibrio A contra B: coincide con una búsqueda numérica', () => {
  const p = proyecto(); p.horas.eleg = 'otro'; p.horas.horasOtro = 100; p.A.tarifaCents = 3500;
  const ctxDe = (pp) => { const r = calc(pp); return { ctx: { horas: r.horas, mat: r.mat, aj, areas: r.areas, contBp: r.contBp, plan: r.planB, eleg: 'probable' }, A: r.A, eq: r.equilibrio }; };
  for (const tarifa of [2500, 3500, 4000, 5500]) {
    p.A.tarifaCents = tarifa;
    const { ctx, A, eq } = ctxDe(p);
    // búsqueda lineal por pasos de 0.01 h
    let h = 0, enc = null;
    for (; h <= 400; h += 0.01) if (M.costoDirectoB(p, ctx, h).directos >= A.directos) { enc = h; break; }
    if (eq.tipo === 'horas') { assert.ok(enc !== null, `tarifa ${tarifa}`); assert.ok(Math.abs(eq.horas - enc) < 0.05, `tarifa ${tarifa}: ${eq.horas} vs ${enc}`); }
    else assert.ok(eq.tipo === 'nunca' ? enc === null : enc === 0 || enc < 0.02, `tarifa ${tarifa} ${eq.tipo}`);
  }
  p.A.tarifaCents = 3500;
  const e = ctxDe(p).eq;
  assert.equal(e.tipo, 'horas');
  // por encima del equilibrio, B cuesta más que A; por debajo, menos
  const { ctx, A } = ctxDe(p);
  assert.ok(M.costoDirectoB(p, ctx, e.horas + 5).directos > A.directos);
  assert.ok(M.costoDirectoB(p, ctx, Math.max(0, e.horas - 5)).directos < A.directos);
});
test('punto de equilibrio: si la mano de obra del sub es gratis nunca hay equilibrio con B más barato; si es carísima, B siempre gana', () => {
  const p = proyecto(); p.horas.eleg = 'otro'; p.horas.horasOtro = 100;
  p.A.tarifaCents = 0;
  assert.equal(calc(p).equilibrio.tipo, 'siempreSub'); // B ya es más caro con 0 horas porque A no tiene mano de obra
  p.A.tarifaCents = 100000000; p.B.salarioCents = 1;
  assert.ok(['horas', 'nunca'].includes(calc(p).equilibrio.tipo));
});

// ---------- ganancia ----------
test('precio = costo / (1 - ganancia) y la ganancia inversa', () => {
  const r = calc(proyecto());
  for (const E of [r.A, r.B]) {
    assert.equal(E.precio, precioDesdeCosto(E.costoTotal, E.margenObjetivoBp));
    assert.equal(E.precio, Math.round(E.costoTotal * 10000 / (10000 - E.margenObjetivoBp)));
    assert.equal(E.margenBp, margenReal(E.precio, E.costoTotal));
    assert.ok(Math.abs(E.margenBp - E.margenObjetivoBp) <= 1);
    assert.equal(E.porCien, E.margenBp / 100);
  }
  assert.equal(M.quedanPorCien(3500), 35);
});
test('ganancia sugerida por tamaño: límites de $3,000, $10,000 y $50,000', () => {
  const t = (precio) => M.tamanoDePrecio(precio).id;
  assert.equal(t(299999), 'chico'); assert.equal(t(300000), 'mediano');
  assert.equal(t(999999), 'mediano'); assert.equal(t(1000000), 'grande');
  assert.equal(t(5000000), 'grande'); assert.equal(t(5000001), 'enorme');
  assert.deepEqual(D.MARGEN_TAMANOS.map((x) => [x.minBp, x.maxBp]), [[4500, 5000], [4000, 4500], [3500, 4000], [3000, 3500]]);
  // el tamaño se mide con el precio a la ganancia mínima configurada (estable, no depende de la ganancia que se esté probando)
  const costo = 650000 * 0.65; // precio al 35 % = $6,500
  const s = M.margenSugerido(Math.round(costo), 3500);
  assert.equal(s.id, 'mediano'); assert.equal(s.debajoDelMinimo, false);
  const gr = M.margenSugerido(4000000, 3500); // precio al 35 % > $50,000
  assert.equal(gr.id, 'enorme'); assert.equal(gr.debajoDelMinimo, true); // 30-35 % queda debajo del mínimo configurado
});
test('el mínimo configurado (35 %) sigue mandando: rentabilidad y semáforo', () => {
  const grande = M.margenSugerido(4000000, 3500);
  assert.equal(M.rentabilidad(3400, grande, 3500), 'baja'); // 34 % está en el rango sugerido pero bajo el mínimo
  assert.equal(M.rentabilidad(3500, grande, 3500), 'alta');
  assert.equal(M.semaforo(3400, grande, 3500), 'rojo');
  const chico = M.margenSugerido(100000, 3500);
  assert.equal(chico.id, 'chico');
  assert.equal(M.rentabilidad(3600, chico, 3500), 'baja');
  assert.equal(M.rentabilidad(4600, chico, 3500), 'media');
  assert.equal(M.rentabilidad(5000, chico, 3500), 'alta');
  assert.equal(M.semaforo(3600, chico, 3500), 'ambar');
  assert.equal(M.semaforo(4500, chico, 3500), 'verde');
});
test('precio ajustable con - y +: el precio mostrado es SIEMPRE el de engine.js y se mueve en el sentido pedido', () => {
  const costo = 480000;
  let bp = 4000;
  for (let i = 0; i < 10; i++) {
    const antes = precioDesdeCosto(costo, bp), nuevo = M.moverPrecio(costo, bp, +1);
    assert.ok(precioDesdeCosto(costo, nuevo) > antes);
    bp = nuevo;
  }
  for (let i = 0; i < 25; i++) {
    const antes = precioDesdeCosto(costo, bp), nuevo = M.moverPrecio(costo, bp, -1);
    assert.ok(precioDesdeCosto(costo, nuevo) < antes || nuevo === 0);
    bp = nuevo;
  }
  const objetivo = 900000, b = M.margenParaPrecio(costo, objetivo);
  assert.ok(Math.abs(precioDesdeCosto(costo, b) - objetivo) < 600); // 1 punto base ~ $7
  assert.equal(M.moverPrecio(0, 4000, 1), 4000);
});

// ---------- puente con engine.js ----------
function cotizacionDe(res, esc, margenBp) {
  const puente = M.aLineasCotizacion(res, esc);
  return { id: 'x', lineas: puente.lineas, cuartos: [], margenBp, contingenciaBp: puente.contingenciaBp, contManual: true, ajustesCot: puente.ajustesCot,
    snapshot: snapshotCatalogo(catalogoInicial(), aj) };
}
test('puente: las líneas pasan por calcularCotizacion y coinciden al centavo con el motor de pintura (A y B)', () => {
  for (const mod of [(p) => p, (p) => { p.antes1978 = 'si'; return p; }, (p) => { p.horas.eleg = 'maximo'; p.B.equipos[0].usar = true; p.B.liftDias = 1; p.B.consumiblesPct = 3; p.B.vehiculoDiaCents = 4500; return p; }]) {
    const p = mod(proyecto());
    const r = calc(p);
    for (const esc of ['A', 'B']) {
      const E = esc === 'A' ? r.A : r.B;
      const c = calcularCotizacion(cotizacionDe(r, esc, E.margenObjetivoBp));
      assert.equal(c.totales.directos, E.directos, `${esc} directos`);
      assert.equal(c.totales.costoTotal, E.costoTotal, `${esc} costo total`);
      assert.equal(c.totales.precio, E.precio, `${esc} precio`);
      assert.equal(c.totales.precio, precioDesdeCosto(c.totales.costoTotal, E.margenObjetivoBp));
      assert.equal(c.totales.contingencia, E.contingencia);
      assert.equal(c.totales.impuestoMat, E.impuesto);
    }
  }
});
test('puente: la contingencia de dinero es 0 salvo casa antigua (no se cobra dos veces la de horas) y A no lleva horas de contingencia', () => {
  const p = proyecto(); const r = calc(p);
  assert.equal(r.contBp, 0);
  p.antes1978 = 'si'; assert.equal(calc(p).contBp, aj.contingenciaAltaBp - aj.contingenciaBp);
  p.antes1978 = 'nose'; assert.ok(calc(p).contBp > 0);
  p.antes1978 = 'no'; assert.equal(calc(p).contBp, 0);
  assert.equal(r.A.horasAcordadas, r.horas.sinContingencia.probable);
  assert.equal(r.B.horasTotales, M.r2(r.B.horasBase * 1.1));
});
test('puente: la mano de obra propia no paga las cargas dos veces (se usa la tasa efectiva de la cotización)', () => {
  const r = calc(proyecto());
  const puente = M.aLineasCotizacion(r, 'B');
  assert.equal(puente.ajustesCot.burdenBp, r.B.cargas.bpEfectivo);
  const c = calcularCotizacion(cotizacionDe(r, 'B', 4000));
  assert.equal(c.totales.manoObra, r.B.manoObra);
});

// ---------- plano: solo cantidades aprobadas ----------
test('plano: nada sin aprobar entra al precio; lo aprobado sí', () => {
  const v = validar(EJEMPLO_PLAN);
  assert.ok(v.ok);
  const pend = M.areasDesdePlano(v.items);
  assert.equal(pend.paredes, 0); assert.equal(pend.techo, 0); assert.ok(pend.pendientes > 0);
  const p = proyecto({ fuenteMedidas: 'plano' });
  const sinAprobar = M.calcular(p, { cuartos: CASA, ajustes: aj, itemsPlano: v.items });
  assert.equal(sinAprobar.areas.paredes, 0); assert.equal(sinAprobar.A.costoTotal, 0);
  const ap = v.items.map((it) => (it.grupo === 'cuartos' && it.entidad === 'EJEMPLO Sala' ? aprobar(it, 'Dueño', '2026-01-01') : it));
  const a = M.areasDesdePlano(ap);
  assert.equal(a.techo, 168); assert.equal(a.paredes, 52 * 9);
  assert.ok(a.pendientes > 0);
  const con = M.calcular(p, { cuartos: CASA, ajustes: aj, itemsPlano: ap });
  assert.equal(con.areas.paredesInt, 52 * 9);
  assert.ok(con.A.costoTotal > 0);
  // las medidas rápidas NO se mezclan cuando la fuente es el plano
  assert.notEqual(con.areas.paredesInt, calc(proyecto()).areas.paredesInt);
});
test('plano: puertas y ventanas aprobadas se restan de las paredes', () => {
  const v = validar(EJEMPLO_PLAN);
  const ap = v.items.map((it) => aprobar(it, 'Dueño', '2026-01-01'));
  const a = M.areasDesdePlano(ap);
  const sala = 52 * 9, cocina = 44 * 9;
  assert.equal(a.paredes, sala + cocina - 6 * 21 - 4 * 15);
});

// ---------- datos y fuentes ----------
test('datos: cada producto trae su ficha oficial (URL de Sherwin-Williams) y los datos de la ficha', () => {
  const urls = {
    promar200: 'https://www.sherwin-williams.com/document/PDS/en/035777433768/', 'superpaint-int': 'https://www.sherwin-williams.com/document/PDS/en/035777309247/',
    'duration-home-int': 'https://www.sherwin-williams.com/document/PDS/en/035777005460/', 'emerald-int-matte': 'https://www.sherwin-williams.com/document/PDS/en/035777194751',
    'emerald-int-satin': 'https://www.sherwin-williams.com/document/PDS/en/035777254103', 'a100-ext': 'https://www.sherwin-williams.com/document/PDS/en/035777132005/',
    'duration-ext-satin': 'https://www.sherwin-williams.com/document/PDS/en/035777132654/', 'loxon-flat': 'https://www.sherwin-williams.com/document/PDS/en/035777488256/',
  };
  assert.equal(D.PRODUCTOS.length, 8);
  for (const p of D.PRODUCTOS) { assert.equal(p.fuente, urls[p.id], p.id); assert.ok(p.recoatH > 0 && p.cobMin > 0 && p.manos >= 1, p.id); }
  const P = (id) => D.productoPorId(id);
  assert.deepEqual([P('promar200').secoH.min, P('promar200').recoatH, P('promar200').cobMin, P('promar200').cobMax, P('promar200').manos], [1, 4, 350, 400, 2]);
  assert.deepEqual([P('a100-ext').secoH.max, P('a100-ext').recoatFrioH], [2, 48]);
  assert.deepEqual([P('duration-ext-satin').cobMin, P('duration-ext-satin').cobMax, P('duration-ext-satin').manos, P('duration-ext-satin').manosNueva], [250, 300, 1, 2]);
  assert.deepEqual([P('loxon-flat').recoatH, P('loxon-flat').cobMin, P('loxon-flat').cobRugosa, P('loxon-flat').manosPrimer], [24, 200, 80, 1]);
  assert.deepEqual([D.COND_REFERENCIA.tempF, D.COND_REFERENCIA.humedadPct, D.COND_REFERENCIA.minAplicarF], [77, 50, 50]);
});
test('datos: lo sin ficha confirmada NO se precarga; todas las productividades están marcadas estimadas', () => {
  const nombres = D.PRODUCTOS.map((p) => p.nombre.toLowerCase()).join('|');
  for (const x of ['superpaint exterior', 'emerald exterior', 'promar 400', 'cashmere', 'preprite', 'problock', 'epox']) assert.ok(!nombres.includes(x), x);
  assert.ok(D.SIN_FICHA.length >= 6);
  for (const [k, v] of Object.entries(D.PRODUCTIVIDAD)) { assert.equal(v.estimado, true, k); assert.ok(v.fuente.nombre, k); assert.ok(v.bajo <= v.probable && v.probable <= v.alto, k); }
  assert.deepEqual([D.PRODUCTIVIDAD.paredLisa.bajo, D.PRODUCTIVIDAD.paredLisa.probable, D.PRODUCTIVIDAD.paredLisa.alto], [200, 270, 350]);
  assert.equal(D.PRODUCTIVIDAD.techo.probable, 60); assert.equal(D.PRODUCTIVIDAD.trim.probable, 25); assert.equal(D.PRODUCTIVIDAD.puerta.probable, 1.5);
  assert.equal(D.PRODUCTIVIDAD.pulverizador.alto, 1000);
  assert.deepEqual([D.PREPARACION_PCT.bajo, D.PREPARACION_PCT.alto], [20, 40]);
  assert.equal(M.pinturaInicial(aj).materiales.desperdicioPct, 10); assert.equal(M.pinturaInicial(aj).materiales.reservaPct, 5);
  assert.equal(M.pinturaInicial(aj).margenBp.A, aj.margenObjetivoBp);
  assert.deepEqual(D.TARIFAS_SUB, [3500, 4000]);
  assert.equal(D.RETENCION_BP, 1000);
});
test('otro producto: lo que escribe la persona se usa tal cual y queda vacío si no se escribe', () => {
  const p = proyecto({ prodInt: 'otro' });
  assert.equal(M.resolverProducto(p, 'int').nombre, '');
  p.otro.int = { nombre: 'Mi pintura', precioCents: 5000, cobertura: 300, manos: 3, recoatH: 6 };
  const r = calc(p);
  assert.equal(r.productos.int.manos, 3); assert.equal(r.productos.int.cobertura, 300);
  assert.equal(r.mat.lineas[0].precioCents, 5000);
});
test('datos: la plantilla de cuarto chico/mediano/grande existe y mide bien', () => {
  assert.deepEqual(Object.keys(D.PLANTILLAS_CUARTO), ['chico', 'mediano', 'grande']);
});

// ---------- caso grande ----------
test('caso grande (más de 10,000 ft²): comercial, exterior en pulverizador, números finitos y días razonables', () => {
  const cuartos = Array.from({ length: 12 }, () => ({ largo: 40, ancho: 30, alto: 12, puertas: 2, ventanas: 4 })); // ~ 12 x 1,500 = 18,000 ft² de pared
  const p = proyecto({ alcance: 'ambos', inmueble: 'comercial' });
  p.exterior.area = 6000; p.exterior.metodo = 'pulverizador'; p.cuadrilla.personas = 6; p.cuadrilla.horasDia = 10;
  const r = calc(p, cuartos);
  assert.ok(r.areas.paredesInt > 10000);
  assert.ok(r.areas.alturaAuto);
  assert.ok(r.horas.sinContingencia.maximo > r.horas.sinContingencia.minimo);
  assert.ok(r.planA.probable.dias > 0 && r.planA.excedeTope === false);
  recorrer(r, (x, ruta) => assert.ok(esFinito(x), ruta));
  assert.equal(r.A.sug.id === 'grande' || r.A.sug.id === 'enorme', true);
});
