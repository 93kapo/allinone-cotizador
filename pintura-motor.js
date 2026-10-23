// pintura-motor.js - Horas, días, materiales y costos del flujo de pintura. Funciones PURAS (sin DOM, sin red).
//
// CONVENCIONES
//  - Dinero: SIEMPRE centavos enteros. Porcentajes de dinero en bp (3500 = 35 %). Porcentajes de horas en % normal (30 = 30 %).
//  - Cualquier entrada vacía, null, NaN, Infinity o negativa cuenta como 0 (num0/cents0): nunca sale NaN ni Infinity.
//  - El PRECIO lo calcula engine.js (precio = costo / (1 - ganancia)). Este módulo prepara las líneas (aLineasCotizacion) y
//    replica los totales del motor (totalesDesdeDirectos) para poder comprobar que coinciden al centavo (ver tests).
//
// HORAS: por tarea (cantidad x manos / productividad), tres valores (mínimo/probable/máximo); + preparación (% de las horas de
// pintura); x factores con nombre (acotados); + montaje/cubrir/limpieza (horas fijas); y SOLO en el escenario B una contingencia de horas.
// Los rangos se suman como CORRELACIONADOS (todo lo bajo con todo lo bajo): es un "rango de planeación", no un intervalo estadístico.
import { BP, mulBp, precioDesdeCosto, margenReal, medirCuarto, galones, DEFAULTS_MEDIDA } from './engine.js';
import { estaAprobado } from './plan-cantidades.js';
import * as D from './pintura-datos.js';

// ---------- Números seguros ----------
export const num0 = (x) => {
  if (typeof x === 'string') x = x.trim() === '' ? NaN : Number(x);
  else if (typeof x !== 'number') return 0;
  return Number.isFinite(x) && x > 0 ? x : 0;
};
export const cents0 = (x) => Math.round(num0(x));
export const r2 = (x) => Math.round(num0(x) * 100) / 100;
const vacio = (x) => x === null || x === undefined || x === '' || (typeof x === 'number' && !Number.isFinite(x));
/** Tres valores ordenados de menor a mayor (así bajo <= probable <= alto aunque la persona los escriba al revés). */
export function ordenar3(a, b, c) { const s = [num0(a), num0(b), num0(c)].sort((x, y) => x - y); return { bajo: s[0], probable: s[1], alto: s[2] }; }
const tri = (bajo, probable, alto) => ({ minimo: bajo, probable, maximo: alto });
const sumTri = (...xs) => tri(xs.reduce((s, x) => s + x.minimo, 0), xs.reduce((s, x) => s + x.probable, 0), xs.reduce((s, x) => s + x.maximo, 0));
const mapTri = (x, f) => tri(f(x.minimo, 'minimo'), f(x.probable, 'probable'), f(x.maximo, 'maximo'));

// ---------- Estado inicial de un proyecto de pintura ----------
/** Valores iniciales. Lo marcado null está VACÍO a propósito (no se inventó): lo escribe el dueño. */
export function pinturaInicial(aj = {}) {
  const m0 = Number.isInteger(aj.margenObjetivoBp) ? aj.margenObjetivoBp : 4000;
  return {
    v: 1, alcance: 'interior', inmueble: 'casa', antes1978: '',
    prodInt: 'promar200', prodExt: 'a100-ext',
    otro: { int: { nombre: '', precioCents: null, cobertura: null, manos: 2, recoatH: null }, ext: { nombre: '', precioCents: null, cobertura: null, manos: 2, recoatH: null } },
    precios: {}, primer: { precioCents: null, cobertura: null },
    fuenteMedidas: 'cuartos',
    interior: { techos: true, trim: true, puertas: true, textura: false },
    exterior: { area: 0, textura: false, nueva: false, rugoso: false, metodo: 'rodillo' },
    horas: { prod: {}, prep: { bajo: D.PREPARACION_PCT.bajo, probable: D.PREPARACION_PCT.probable, alto: D.PREPARACION_PCT.alto },
      fijas: { bajo: D.HORAS_FIJAS.bajo, probable: D.HORAS_FIJAS.probable, alto: D.HORAS_FIJAS.alto },
      factores: { altura: null, ocupado: false, dificil: false, acceso: false }, ocupadoPct: { bajo: D.OCUPADO_PCT.bajo, probable: D.OCUPADO_PCT.probable, alto: D.OCUPADO_PCT.alto },
      mult: { altura: D.FACTORES.altura.mult, dificil: D.FACTORES.dificil.mult, acceso: D.FACTORES.acceso.mult },
      contPct: 10, eleg: 'probable', horasOtro: null },
    cuadrilla: { personas: null, horasDia: null, eficienciaPct: D.CUADRILLA.eficienciaPct.valor, ft2PorPersona: D.CUADRILLA.ft2PorPersona.valor, frio: false },
    materiales: { desperdicioPct: D.MATERIALES_DEF.desperdicioPct.valor, reservaPct: D.MATERIALES_DEF.reservaPct.valor, control: {} },
    superv: { horas: null, tarifaCents: null },
    A: { tarifaCents: D.TARIFAS_SUB[0], seguroBp: null },
    B: { salarioCents: D.SALARIO_REF.cents, ficaBp: D.CARGAS_DEF.ficaBp.valor, futaBp: D.CARGAS_DEF.futaBp.valor, sutaBp: D.CARGAS_DEF.sutaBp.valor, compBp: null,
      equipos: D.EQUIPOS_DEF.map((e) => ({ ...e })), liftDias: 0, liftPorDiaCents: Math.round((D.ALQUILER_LIFT.porDiaMin + D.ALQUILER_LIFT.porDiaMax) / 2),
      consumiblesPct: null, vehiculoDiaCents: null },
    escenario: 'A', margenBp: { A: m0, B: m0 },
    retencionBp: D.RETENCION_BP,
  };
}

// ---------- Áreas ----------
/** Cantidades APROBADAS del plano (plan-cantidades.js). Lo pendiente NO entra. Devuelve paredes/techo y cuántos valores quedaron sin aprobar. */
export function areasDesdePlano(items = [], d = DEFAULTS_MEDIDA) {
  const aprob = (it) => estaAprobado(it) && Number.isFinite(it.valor) && it.valor >= 0;
  const porCuarto = new Map();
  let pendientes = 0, puertas = 0, ventanas = 0, paredes = 0, techo = 0;
  const usados = [];
  for (const it of items) {
    if (it.grupo === 'cuartos') {
      if (!aprob(it)) { pendientes++; continue; }
      const c = porCuarto.get(it.entidad) || {}; c[it.campo] = it.valor; porCuarto.set(it.entidad, c);
    } else if (it.grupo === 'conteos' && it.campo === 'cantidad_conteo') {
      if (!aprob(it)) { pendientes++; continue; }
      if (/puert|door/i.test(it.entidad)) puertas += it.valor; else if (/ventan|window/i.test(it.entidad)) ventanas += it.valor;
    }
  }
  for (const [nombre, c] of porCuarto) {
    if (c.area_sf > 0) { techo += c.area_sf; usados.push({ nombre, campo: 'area_sf' }); }
    if (c.perimetro_lf > 0 && c.alto_techo_ft > 0) { paredes += c.perimetro_lf * c.alto_techo_ft; usados.push({ nombre, campo: 'paredes' }); }
  }
  if (paredes > 0) paredes = Math.max(0, paredes - puertas * (d.areaPuerta ?? 21) - ventanas * (d.areaVentana ?? 15));
  return { paredes, techo, trim: 0, puertas, ventanas, pendientes, usados };
}

/** Áreas del proyecto. fuente 'cuartos' (medidas rápidas) o 'plano' (solo aprobadas). */
export function areasDe(pint, cuartos = [], aj = {}, items = []) {
  const d = { areaPuerta: aj.areaPuerta ?? 21, areaVentana: aj.areaVentana ?? 15, anchoPuerta: 3 };
  const usaInt = pint.alcance !== 'exterior', usaExt = pint.alcance !== 'interior';
  let a = { paredes: 0, techo: 0, trim: 0, puertas: 0, ventanas: 0, pendientes: 0, usados: [] };
  let altoMax = 0;
  if (usaInt) {
    if (pint.fuenteMedidas === 'plano') {
      a = areasDesdePlano(items, d);
      for (const it of items) if (it.campo === 'alto_techo_ft' && estaAprobado(it)) altoMax = Math.max(altoMax, num0(it.valor));
    } else {
      for (const c of cuartos) {
        const m = medirCuarto({ largo: num0(c.largo), ancho: num0(c.ancho), alto: num0(c.alto), puertas: num0(c.puertas), ventanas: num0(c.ventanas) }, d);
        a.paredes += m.paredes; a.techo += m.techo; a.trim += m.trim; a.puertas += m.puertas; a.ventanas += m.ventanas;
        altoMax = Math.max(altoMax, num0(c.alto));
      }
    }
  }
  const extArea = usaExt ? num0(pint.exterior?.area) : 0;
  return { ...a, paredesInt: a.paredes, extArea, altoMax, alturaAuto: altoMax > D.ALTURA_FT, total: a.paredes + a.techo + extArea };
}

// ---------- Productos ----------
/** Producto resuelto: ficha oficial o "Otro producto" que escribe la persona. lado: 'int' | 'ext'. */
export function resolverProducto(pint, lado) {
  const id = lado === 'int' ? pint.prodInt : pint.prodExt;
  const base = D.productoPorId(id);
  if (base) {
    const nueva = lado === 'ext' && !!pint.exterior?.nueva;
    const manos = nueva && base.manosNueva ? base.manosNueva : base.manos;
    const cob = lado === 'ext' && pint.exterior?.rugoso && base.cobRugosa ? base.cobRugosa : base.cobMin;
    return { clave: id, otro: false, nombre: base.nombre, cobertura: cob, manos, manosPrimer: base.manosPrimer || 0, primerNombre: base.primerNombre || '',
      recoatH: base.recoatH, recoatFrioH: base.recoatFrioH, precioCents: vacio(pint.precios?.[id]) ? null : cents0(pint.precios[id]), ficha: base };
  }
  const o = pint.otro?.[lado] || {};
  return { clave: 'otro-' + lado, otro: true, nombre: String(o.nombre || '').trim(), cobertura: num0(o.cobertura), manos: Math.max(1, Math.round(num0(o.manos) || 2)), manosPrimer: 0, primerNombre: '',
    recoatH: vacio(o.recoatH) ? null : num0(o.recoatH), recoatFrioH: null, precioCents: vacio(o.precioCents) ? null : cents0(o.precioCents), ficha: null };
}

// ---------- Tareas y horas ----------
const trioProd = (pint, id, def) => { const o = pint.horas?.prod?.[id]; return o ? ordenar3(o.bajo, o.probable, o.alto) : ordenar3(def.bajo, def.probable, def.alto); };

/** Tareas con su cantidad, manos y productividad. Cada una devuelve horas {minimo, probable, maximo}. */
export function tareasDe(pint, areas) {
  const out = [];
  const int = resolverProducto(pint, 'int'), ext = resolverProducto(pint, 'ext');
  const comercial = pint.inmueble === 'comercial';
  const add = (id, cantidad, manos, prod, porCara = false) => {
    cantidad = num0(cantidad);
    if (!(cantidad > 0)) return;
    let p = ordenar3(prod.bajo, prod.probable, prod.alto);
    const positivos = [p.bajo, p.probable, p.alto].filter((x) => x > 0);
    if (!positivos.length) return; // sin productividad no se inventan horas
    p = ordenar3(p.bajo || positivos[0], p.probable || positivos[0], p.alto || positivos[0]); // un 0 escrito por error no rompe mínimo <= probable <= máximo
    let h;
    if (porCara) h = tri(cantidad * p.bajo, cantidad * p.probable, cantidad * p.alto);
    else {
      const trabajo = cantidad * Math.max(1, manos);
      h = tri(p.alto > 0 ? trabajo / p.alto : 0, p.probable > 0 ? trabajo / p.probable : 0, p.bajo > 0 ? trabajo / p.bajo : 0);
    }
    out.push({ id, cantidad, manos: porCara ? 1 : manos, prod: p, horas: h });
  };
  if (pint.alcance !== 'exterior') {
    const manos = int.manos + int.manosPrimer;
    const pared = comercial ? D.PRODUCTIVIDAD.comercial : pint.interior?.textura ? D.PRODUCTIVIDAD.paredTextura : D.PRODUCTIVIDAD.paredLisa;
    const idPared = comercial ? 'comercial' : pint.interior?.textura ? 'paredTextura' : 'paredLisa';
    add('paredInt', areas.paredesInt, manos, trioProd(pint, idPared, pared));
    if (pint.interior?.techos) add('techo', areas.techo, manos, trioProd(pint, 'techo', D.PRODUCTIVIDAD.techo));
    if (pint.interior?.trim) add('trim', areas.trim, manos, trioProd(pint, 'trim', D.PRODUCTIVIDAD.trim));
    if (pint.interior?.puertas) add('puerta', areas.puertas * D.CARAS_PUERTA, 1, trioProd(pint, 'puerta', D.PRODUCTIVIDAD.puerta), true);
  }
  if (pint.alcance !== 'interior' && areas.extArea > 0) {
    const manos = ext.manos + ext.manosPrimer;
    let id, def;
    if (pint.exterior?.metodo === 'pulverizador') { id = 'pulverizador'; def = D.PRODUCTIVIDAD.pulverizador; }
    else if (pint.exterior?.textura) { id = 'paredTextura'; def = D.PRODUCTIVIDAD.paredTextura; }
    else if (comercial) { id = 'comercial'; def = D.PRODUCTIVIDAD.comercial; }
    else { id = 'paredLisa'; def = D.PRODUCTIVIDAD.paredLisa; }
    add('paredExt', areas.extArea, manos, trioProd(pint, id, def));
  }
  return out;
}

/** Factores con nombre, ya acotados. Cada uno es {minimo, probable, maximo} (multiplicador de horas). */
export function factoresDe(pint, areas) {
  const f = pint.horas?.factores || {};
  const lim = (x) => Math.min(D.LIMITE_FACTOR.max, Math.max(D.LIMITE_FACTOR.min, num0(x) || 1));
  const un = (x) => tri(lim(x), lim(x), lim(x));
  const out = [];
  const altura = f.altura === null || f.altura === undefined ? areas.alturaAuto : !!f.altura;
  if (altura) out.push({ id: 'altura', ...un(pint.horas?.mult?.altura ?? D.FACTORES.altura.mult) });
  if (f.dificil) out.push({ id: 'dificil', ...un(pint.horas?.mult?.dificil ?? D.FACTORES.dificil.mult) });
  if (f.acceso) out.push({ id: 'acceso', ...un(pint.horas?.mult?.acceso ?? D.FACTORES.acceso.mult) });
  if (f.ocupado) {
    const o = ordenar3(pint.horas?.ocupadoPct?.bajo, pint.horas?.ocupadoPct?.probable, pint.horas?.ocupadoPct?.alto);
    const m = (p) => lim(1 / (1 - Math.min(0.9, p / 100))); // -20 % de productividad = x1.25 (no x1.2); -40 % = x1.67
    out.push({ id: 'ocupado', ...tri(m(o.bajo), m(o.probable), m(o.alto)) });
  }
  const total = mapTri(out.reduce((s, x) => tri(s.minimo * x.minimo, s.probable * x.probable, s.maximo * x.maximo), tri(1, 1, 1)),
    (v) => Math.min(D.LIMITE_FACTOR_TOTAL.max, Math.max(D.LIMITE_FACTOR_TOTAL.min, v)));
  return { lista: out, total };
}

/**
 * Horas-hombre. Resultado: { tareas, pintura, preparacion, factor, fijas, sinContingencia, contingencia, conContingencia } (cada total {minimo, probable, maximo}).
 * Sin contingencia = lo que se le pide al subcontratista (escenario A); con contingencia = escenario B.
 */
export function calcularHoras(pint, areas) {
  const tareas = tareasDe(pint, areas);
  const pintura = sumTri(...tareas.map((t) => t.horas), tri(0, 0, 0));
  const prep = ordenar3(pint.horas?.prep?.bajo, pint.horas?.prep?.probable, pint.horas?.prep?.alto);
  const preparacion = tri(pintura.minimo * prep.bajo / 100, pintura.probable * prep.probable / 100, pintura.maximo * prep.alto / 100);
  const factor = factoresDe(pint, areas);
  const fj = ordenar3(pint.horas?.fijas?.bajo, pint.horas?.fijas?.probable, pint.horas?.fijas?.alto);
  const hayTrabajo = pintura.maximo > 0;
  const fijas = hayTrabajo ? tri(fj.bajo, fj.probable, fj.alto) : tri(0, 0, 0);
  const variable = tri((pintura.minimo + preparacion.minimo) * factor.total.minimo, (pintura.probable + preparacion.probable) * factor.total.probable, (pintura.maximo + preparacion.maximo) * factor.total.maximo);
  const sinContingencia = mapTri(sumTri(variable, fijas), r2);
  const cp = num0(pint.horas?.contPct);
  const contingencia = mapTri(sinContingencia, (v) => r2(v * cp / 100));
  const conContingencia = mapTri(sinContingencia, (v, k) => r2(v + contingencia[k]));
  return { tareas, pintura, preparacion, factor, fijas, sinContingencia, contingencia, conContingencia, contPct: cp };
}

/** Horas elegidas para calcular (mínimo/probable/máximo/otro), sobre las horas SIN contingencia. */
export function horasElegidas(h, pint) {
  const e = pint.horas?.eleg || 'probable';
  if (e === 'otro') return r2(pint.horas?.horasOtro);
  return h.sinContingencia[e === 'minimo' || e === 'maximo' ? e : 'probable'];
}

// ---------- Secado ----------
/** Espera por secado entre manos. Regla práctica DERIVADA (no del fabricante): ver pintura-datos.NOTA_REGLA_SECADO. */
export function esperaSecado({ recoatH, recoatFrioH = null, manos = 1, manosPrimer = 0, horasDia, frio = false, exterior = false }) {
  const coats = Math.max(1, Math.round(num0(manos))) + Math.max(0, Math.round(num0(manosPrimer)));
  const intervalos = coats - 1;
  const espera = frio && recoatFrioH != null ? num0(recoatFrioH) : num0(recoatH);
  const jornada = num0(horasDia);
  const mismoDia = espera <= jornada; // cabe en la jornada: se repinta el mismo día
  const diasPorMano = intervalos > 0 && !mismoDia ? Math.ceil(espera / 24 - 1e-9) : 0;
  const margenExterior = exterior ? 1 : 0;
  return { intervalos, esperaH: espera, mismoDia, diasPorMano, margenExterior, dias: intervalos * diasPorMano + margenExterior };
}
function secadoProyecto(pint, productos, horasDia) {
  const lados = [];
  if (pint.alcance !== 'exterior') lados.push(['int', false]);
  if (pint.alcance !== 'interior') lados.push(['ext', true]);
  const l = lados.map(([lado, exterior]) => { const p = productos[lado]; return esperaSecado({ recoatH: p.recoatH, recoatFrioH: p.recoatFrioH, manos: p.manos, manosPrimer: p.manosPrimer, horasDia, frio: pint.cuadrilla?.frio, exterior }); });
  return { lados: l, dias: l.reduce((m, x) => Math.max(m, x.dias), 0) };
}

// ---------- Cuadrilla y días ----------
/** Tope de personas por área de pared (1 persona por cada ft2PorPersona ft²). Infinity si no hay dato. */
export function topePersonas(areaPared, ft2PorPersona) {
  const a = num0(areaPared), f = num0(ft2PorPersona);
  if (!(a > 0) || !(f > 0)) return Infinity;
  return Math.max(1, Math.floor(a / f));
}
/** Horas de reloj -> días completos + horas restantes (con jornada de `horasDia`). 100 h con jornada de 24 h = 4 días y 4 h. */
export function aDiasYHoras(horas, horasDia) {
  const h = num0(horas), j = num0(horasDia);
  if (!(j > 0)) return { dias: 0, horas: r2(h) };
  const dias = Math.floor(h / j + 1e-9);
  return { dias, horas: r2(Math.max(0, h - dias * j)) };
}
/**
 * Plan de cuadrilla. personas y horasDia los elige la persona: sin ellos devuelve { incompleto: true }.
 * Personas efectivas = min(personas, tope): más gente que el tope no acorta el trabajo ("se estorban").
 * DÍAS = ceil(horas / (efectivas x horasDia x eficiencia)) + días de espera por secado.
 */
export function planCuadrilla({ horas, personas, horasDia, eficienciaPct = 85, areaPared = 0, ft2PorPersona = 0, diasEspera = 0 }) {
  const p = Math.round(num0(personas)), j = num0(horasDia);
  if (!(p >= 1) || !(j > 0)) return { incompleto: true, falta: !(p >= 1) ? 'personas' : 'horasDia' };
  const efic = Math.min(1, Math.max(0.05, num0(eficienciaPct) / 100 || 0.85));
  const tope = topePersonas(areaPared, ft2PorPersona);
  const efectivas = Math.min(p, tope);
  const capacidad = efectivas * j * efic; // horas-hombre por día
  const espera = Math.max(0, Math.round(num0(diasEspera)));
  const una = (hh) => {
    hh = num0(hh);
    const trabajo = hh > 0 ? Math.max(1, Math.ceil(hh / capacidad - 1e-9)) : 0;
    const reloj = efectivas * efic > 0 ? hh / (efectivas * efic) : 0;
    return { horasHombre: hh, diasTrabajo: trabajo, diasEspera: hh > 0 ? espera : 0, dias: trabajo + (hh > 0 ? espera : 0), horasReloj: r2(reloj), reloj: aDiasYHoras(reloj, j) };
  };
  return { incompleto: false, personas: p, efectivas, tope: tope === Infinity ? null : tope, excedeTope: p > tope, horasDia: j, eficienciaPct: r2(efic * 100), capacidad: r2(capacidad),
    minimo: una(horas.minimo), probable: una(horas.probable), maximo: una(horas.maximo) };
}

// ---------- Materiales (SIEMPRE los compra All In One) ----------
/** Galones: se suma área x manos de TODOS los cuartos por producto y se redondea hacia arriba UNA vez (engine.galones). Cobertura: el MÍNIMO de la ficha. */
export function calcularMateriales(pint, areas, productos, aj = {}) {
  const desp = Math.round(num0(pint.materiales?.desperdicioPct) * 100);
  const reserva = Math.round(num0(pint.materiales?.reservaPct) * 100);
  const lineas = [];
  const faltan = [];
  const una = (lado, area) => {
    const p = productos[lado];
    if (!(area > 0)) return;
    const gal = galones({ area, manos: p.manos, cobertura: p.cobertura, desperdicioBp: desp });
    const precio = p.precioCents;
    if (!(precio > 0)) faltan.push('precioPintura');
    if (!(p.cobertura > 0)) faltan.push('cobertura');
    lineas.push({ clave: p.clave, lado, nombre: p.nombre, area: r2(area), manos: p.manos, cobertura: p.cobertura, galones: gal, precioCents: precio || 0, costo: gal * (precio || 0), tipo: 'acabado' });
    if (p.manosPrimer > 0) {
      const pr = pint.primer || {};
      const cob = num0(pr.cobertura), pp = cents0(pr.precioCents);
      const galP = galones({ area, manos: p.manosPrimer, cobertura: cob, desperdicioBp: desp });
      if (!(pp > 0) || !(cob > 0)) faltan.push('primer');
      lineas.push({ clave: p.clave + '-primer', lado, nombre: (p.primerNombre ? p.primerNombre + ' ' : '') + 'primer', area: r2(area), manos: p.manosPrimer, cobertura: cob, galones: galP, precioCents: pp, costo: galP * pp, tipo: 'primer' });
    }
  };
  if (pint.alcance !== 'exterior') {
    const ft2 = areas.paredesInt + (pint.interior?.techos ? areas.techo : 0) + (pint.interior?.trim ? areas.trim * D.FT2_POR_LF_TRIM : 0) + (pint.interior?.puertas ? areas.puertas * D.FT2_PUERTA_PINTAR : 0);
    una('int', ft2);
  }
  if (pint.alcance !== 'interior') una('ext', areas.extArea);
  const subtotal = lineas.reduce((s, l) => s + l.costo, 0);
  const reservaCents = mulBp(subtotal, reserva);
  return { lineas, subtotal, reservaBp: reserva, reservaCents, total: subtotal + reservaCents, faltan: [...new Set(faltan)], galonesTotal: lineas.reduce((s, l) => s + l.galones, 0) };
}
/** Control de materiales por trabajo (registro manual). diferencia > 0 = sobró (se compró de más); < 0 = faltó. */
export function controlMateriales(requeridos, entregados, devueltos) {
  const r = Math.round(num0(requeridos)), e = Math.round(num0(entregados)), d = Math.round(num0(devueltos));
  const usados = Math.max(0, e - d);
  return { requeridos: r, entregados: e, devueltos: d, usados, diferencia: usados - r, sobra: Math.max(0, usados - r), falta: Math.max(0, r - usados) };
}

// ---------- Cargas laborales (escenario B) ----------
/**
 * Cargas sobre el salario de un trabajo. FICA y compensación sobre todo el salario; FUTA y SUTA solo sobre los primeros $7,000 de CADA persona
 * (por trabajo: no ve lo que ya ganó en el año, así que puede sobrar). Sin personas elegidas, se aplican sobre todo (más prudente).
 * El motor de precios recibe una tasa en bp (bpEfectivo): `aplicado` es lo que engine.js cobrará (mulBp(salario, bpEfectivo)).
 */
export function cargasLaborales(salarioCents, personas, c = {}) {
  const S = cents0(salarioCents), n = Math.round(num0(personas));
  const baseF = c.baseFutaCents ?? D.CARGAS_DEF.futaBp.baseCents, baseS = c.baseSutaCents ?? D.CARGAS_DEF.sutaBp.baseCents;
  const sobre = (base) => (n >= 1 ? Math.min(S, n * base) : S);
  const fica = mulBp(S, cents0(c.ficaBp)), comp = mulBp(S, cents0(c.compBp)), futa = mulBp(sobre(baseF), cents0(c.futaBp)), suta = mulBp(sobre(baseS), cents0(c.sutaBp));
  const total = fica + comp + futa + suta;
  const bpEfectivo = S > 0 ? Math.round((total * BP) / S) : 0;
  return { fica, futa, suta, comp, total, bpEfectivo, aplicado: mulBp(S, bpEfectivo), faltaCompensacion: vacio(c.compBp) };
}

// ---------- Totales (replica a engine.calcularCotizacion) ----------
/** directos -> contingencia (bp, normalmente 0 o la de casa antigua) -> gastos fijos -> reserva de garantía -> costo total. Igual que engine.js. */
export function totalesDesdeDirectos(directos, aj, contingenciaBp = 0) {
  const contingencia = mulBp(directos, contingenciaBp);
  const overhead = mulBp(directos + contingencia, cents0(aj.overheadBp));
  const garantia = mulBp(directos + contingencia + overhead, cents0(aj.garantiaBp));
  return { directos, contingencia, overhead, garantia, costoTotal: directos + contingencia + overhead + garantia };
}
export const contingenciaCasaAntiguaBp = (pint, aj) => (pint.antes1978 === 'si' || pint.antes1978 === 'nose' ? Math.max(0, cents0(aj.contingenciaAltaBp) - cents0(aj.contingenciaBp)) : 0);

// ---------- Escenarios ----------
const supervision = (pint, hay = true) => {
  const sv = pint.superv || {};
  const horas = vacio(sv.horas) ? 0 : r2(sv.horas);
  const tarifa = vacio(sv.tarifaCents) ? 0 : cents0(sv.tarifaCents);
  return { horas, tarifaCents: tarifa, costo: hay ? Math.round(horas * tarifa) : 0, falta: vacio(sv.horas) || vacio(sv.tarifaCents) };
};

/** Escenario A: subcontratar solo la mano de obra. El pago por las horas acordadas es un COSTO FIJO. */
export function escenarioA(pint, ctx) {
  const { horas, mat, aj } = ctx;
  const acordadas = horasElegidas(horas, pint);
  const tarifa = cents0(pint.A?.tarifaCents);
  const pago = Math.round(acordadas * tarifa);
  const sv = supervision(pint, ctx.areas.total > 0);
  const seguro = mulBp(pago, cents0(pint.A?.seguroBp));
  const materiales = mat.total;
  const impuesto = mulBp(materiales, cents0(aj.impuestoVentasBp));
  const otros = sv.costo + seguro;
  const directos = materiales + impuesto + pago + otros;
  const faltan = [...mat.faltan];
  if (sv.falta) faltan.push('supervision');
  if (vacio(pint.A?.seguroBp)) faltan.push('seguro');
  if (!(ctx.areas.total > 0)) faltan.push('medidas');
  return { id: 'A', horasAcordadas: acordadas, tarifaCents: tarifa, pago, supervision: sv, seguro, materiales, impuesto, subs: pago, manoObra: 0, otros, directos, faltan: [...new Set(faltan)],
    partes: { materiales, impuesto, pago, supervision: sv.costo, seguro },
    ...totalesDesdeDirectos(directos, aj, ctx.contBp) };
}

/** Costo directo del escenario B para `horasTrab` horas-hombre (ya con contingencia si la hay). Lineal por tramos (FUTA/SUTA tienen tope). */
export function costoDirectoB(pint, ctx, horasTrab) {
  const { mat, aj, plan } = ctx;
  const B = pint.B || {};
  const h = r2(horasTrab);
  const salarioH = cents0(B.salarioCents);
  const salario = Math.round(h * salarioH);
  const personas = plan && !plan.incompleto ? plan.efectivas : 0;
  const cargas = cargasLaborales(salario, personas, { ficaBp: B.ficaBp, futaBp: B.futaBp, sutaBp: B.sutaBp, compBp: B.compBp });
  const consumibles = mulBp(mat.subtotal, Math.round(num0(B.consumiblesPct) * 100));
  const materiales = mat.total + consumibles;
  const impuesto = mulBp(materiales, cents0(aj.impuestoVentasBp));
  const equipos = (B.equipos || []).filter((e) => e.usar).reduce((s, e) => s + (num0(e.vidaH) > 0 ? Math.round((cents0(e.precioCents) / num0(e.vidaH)) * h) : 0), 0);
  const lift = ctx.areas.total > 0 ? Math.round(num0(B.liftDias)) * cents0(B.liftPorDiaCents) : 0;
  const dias = plan && !plan.incompleto ? plan[ctx.eleg === 'minimo' ? 'minimo' : ctx.eleg === 'maximo' ? 'maximo' : 'probable'].diasTrabajo : 0;
  const vehiculo = dias * cents0(B.vehiculoDiaCents);
  const sv = supervision(pint, ctx.areas.total > 0);
  const otros = equipos + lift + vehiculo + sv.costo;
  const manoObra = salario + cargas.aplicado;
  const directos = materiales + impuesto + manoObra + otros;
  return { horas: h, salarioH, salario, cargas, consumibles, materiales, impuesto, equipos, lift, vehiculo, supervision: sv, otros, manoObra, directos };
}
export function escenarioB(pint, ctx) {
  const { horas, areas, aj } = ctx;
  const base = horasElegidas(horas, pint);
  const cont = r2(base * horas.contPct / 100);
  const hTot = r2(base + cont);
  const c = costoDirectoB(pint, ctx, hTot);
  const faltan = [...ctx.mat.faltan];
  if (c.cargas.faltaCompensacion) faltan.push('compensacion');
  if (c.supervision.falta) faltan.push('supervision');
  if (!(areas.total > 0)) faltan.push('medidas');
  return { id: 'B', horasBase: base, horasContingencia: cont, horasTotales: hTot, ...c, subs: 0, faltan: [...new Set(faltan)],
    partes: { materiales: c.materiales - c.consumibles, consumibles: c.consumibles, impuesto: c.impuesto, salario: c.salario, cargas: c.cargas.aplicado, equipos: c.equipos, lift: c.lift, vehiculo: c.vehiculo, supervision: c.supervision.costo },
    ...totalesDesdeDirectos(c.directos, aj, ctx.contBp) };
}

/** Tarifa efectiva en centavos por hora = pago / horas reales. 100 h x $35 = $3,500; si terminan en 80 h son $43.75/h. */
export function tarifaEfectiva(pagoCents, horasReales) {
  const h = num0(horasReales);
  return h > 0 ? Math.round(cents0(pagoCents) / h) : null;
}
/**
 * Punto de equilibrio: horas-hombre reales a partir de las cuales subcontratar (A, costo fijo) sale más barato que hacerlo con su gente (B).
 * Busca por bisección en costoDirectoB. Devuelve { tipo: 'horas', horas } | { tipo: 'siempreSub' } (B ya es más caro con 0 h) | { tipo: 'nunca' }.
 */
export function puntoEquilibrio(pint, ctx, A) {
  const f = (h) => costoDirectoB(pint, ctx, h).directos - A.directos;
  if (f(0) >= 0) return { tipo: 'siempreSub', horas: 0 };
  let lo = 0, hi = Math.max(10, A.horasAcordadas * 2, 100);
  while (f(hi) < 0 && hi < 1e7) hi *= 2;
  if (f(hi) < 0) return { tipo: 'nunca', horas: null };
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
  return { tipo: 'horas', horas: r2((lo + hi) / 2) };
}

// ---------- Precio y ganancia ----------
export { precioDesdeCosto, margenReal };
export const tamanoDePrecio = (precioCents) => {
  const p = cents0(precioCents);
  return D.MARGEN_TAMANOS.find((t) => (t.incluyeHasta ? p <= t.hastaCents : p < t.hastaCents)) || D.MARGEN_TAMANOS[D.MARGEN_TAMANOS.length - 1];
};
/**
 * Ganancia sugerida por TAMAÑO (propuesta sin fuente). El tamaño se mide con el precio que resulta con la ganancia mínima configurada (pisoBp):
 * así no cambia mientras se mueve la ganancia. El mínimo configurado SIGUE mandando (debajoDelMinimo avisa).
 */
export function margenSugerido(costoTotalCents, pisoBp) {
  const piso = Number.isInteger(pisoBp) && pisoBp >= 0 && pisoBp < BP ? pisoBp : 3500;
  const precioRef = precioDesdeCosto(cents0(costoTotalCents), piso);
  const t = tamanoDePrecio(precioRef);
  return { id: t.id, minBp: t.minBp, maxBp: t.maxBp, precioRef, debajoDelMinimo: t.minBp < piso };
}
/** Rentabilidad contra la ganancia sugerida (el mínimo configurado cuenta como suelo): baja / media / alta. */
export function rentabilidad(margenBp, sug, pisoBp) {
  const suelo = Math.max(sug.minBp, Number.isInteger(pisoBp) ? pisoBp : 0);
  if (margenBp < suelo) return 'baja';
  if (margenBp < Math.max(sug.maxBp, suelo)) return 'media';
  return 'alta';
}
/** Semáforo de la barra: rojo si está bajo el mínimo configurado; ámbar si cumple el mínimo pero está bajo lo sugerido; verde si no. */
export function semaforo(margenBp, sug, pisoBp) {
  if (margenBp < pisoBp) return 'rojo';
  return margenBp < sug.minBp ? 'ambar' : 'verde';
}
/** Ganancia (bp, margen sobre PRECIO) cuyo precio de engine.js queda más cerca de `precioObjetivo`. Máximo 70 % (igual que el control de la app). */
export function margenParaPrecio(costoCents, precioObjetivo, maxBp = 7000) {
  const c = cents0(costoCents);
  if (!(c > 0)) return 0;
  const P = (bp) => precioDesdeCosto(c, bp);
  const obj = cents0(precioObjetivo);
  let lo = 0, hi = maxBp;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (P(mid) < obj) lo = mid + 1; else hi = mid; }
  const cand = [lo - 1, lo].filter((b) => b >= 0 && b <= maxBp);
  return cand.reduce((best, b) => (Math.abs(P(b) - obj) < Math.abs(P(best) - obj) ? b : best), cand[0]);
}
export const pasoPrecio = (precioCents) => { const p = cents0(precioCents); return p < 500000 ? 5000 : p < 2000000 ? 10000 : p < 10000000 ? 25000 : 50000; };
/** Sube o baja el precio un paso. El margen resultante es entero en bp: el precio que se muestra SIEMPRE es el de engine.js. */
export function moverPrecio(costoCents, margenBp, dir) {
  const c = cents0(costoCents);
  if (!(c > 0)) return margenBp;
  const actual = precioDesdeCosto(c, margenBp);
  const objetivo = Math.max(c, actual + (dir >= 0 ? 1 : -1) * pasoPrecio(actual));
  let bp = margenParaPrecio(c, objetivo);
  if (dir > 0 && bp <= margenBp) bp = Math.min(7000, margenBp + 1);
  if (dir < 0 && bp >= margenBp) bp = Math.max(0, margenBp - 1);
  return bp;
}
/** "Le quedan $X de cada $100": ganancia (bp) en dólares por cada $100. */
export const quedanPorCien = (margenBp) => margenBp / 100;

// ---------- Todo junto ----------
/** ctx: { cuartos, ajustes (los del snapshot de la cotización), itemsPlano } -> resultado completo. */
export function calcular(pint, ctx) {
  const aj = ctx.ajustes || {};
  const items = ctx.itemsPlano || [];
  const areas = areasDe(pint, ctx.cuartos || [], aj, items);
  const productos = { int: resolverProducto(pint, 'int'), ext: resolverProducto(pint, 'ext') };
  const horas = calcularHoras(pint, areas);
  const horasEleg = horasElegidas(horas, pint);
  const secado = secadoProyecto(pint, productos, num0(pint.cuadrilla?.horasDia));
  const basePlan = (hh) => planCuadrilla({ horas: hh, personas: pint.cuadrilla?.personas, horasDia: pint.cuadrilla?.horasDia, eficienciaPct: pint.cuadrilla?.eficienciaPct,
    areaPared: areas.paredesInt + areas.extArea, ft2PorPersona: pint.cuadrilla?.ft2PorPersona, diasEspera: secado.dias });
  const planA = basePlan(horas.sinContingencia);
  const planB = basePlan(horas.conContingencia);
  const mat = calcularMateriales(pint, areas, productos, aj);
  const contBp = contingenciaCasaAntiguaBp(pint, aj);
  const eleg = pint.horas?.eleg === 'minimo' || pint.horas?.eleg === 'maximo' ? pint.horas.eleg : 'probable';
  const A = escenarioA(pint, { horas, mat, aj, areas, contBp });
  const B = escenarioB(pint, { horas, mat, aj, areas, contBp, plan: planB, eleg });
  const eq = puntoEquilibrio(pint, { horas, mat, aj, areas, contBp, plan: planB, eleg }, A);
  const pisoBp = Number.isInteger(aj.margenPisoBp) ? aj.margenPisoBp : 3500;
  const esc = (E) => {
    const m = pint.margenBp?.[E.id] ?? aj.margenObjetivoBp ?? 4000;
    const precio = precioDesdeCosto(E.costoTotal, m);
    const margen = margenReal(precio, E.costoTotal);
    const sug = margenSugerido(E.costoTotal, pisoBp);
    return { ...E, margenObjetivoBp: m, precio, margenBp: margen, ganancia: precio - E.costoTotal, sug, rentabilidad: rentabilidad(margen, sug, pisoBp), semaforo: precio > 0 ? semaforo(margen, sug, pisoBp) : 'vacio',
      porCien: quedanPorCien(margen), tarifaEfectivaCents: E.id === 'A' ? tarifaEfectiva(E.pago, horas.sinContingencia.probable) : null, tarifaEfectivaMinCents: E.id === 'A' ? tarifaEfectiva(E.pago, horas.sinContingencia.minimo) : null };
  };
  return { areas, productos, horas, horasEleg, secado, planA, planB, plan: planA, mat, contBp, A: esc(A), B: esc(B), equilibrio: eq, pisoBp };
}

// ---------- Puente al motor de precios ----------
/**
 * Líneas de cotización (forma de cotizacion.js, "personalizada") del escenario `esc` ('A'|'B') + ajustes de ESTA cotización.
 * El flujo de pintura es dueño de q.lineas: las regenera cada vez que algo cambia. Estos nombres son INTERNOS (el PDF del cliente no imprime líneas de pintura).
 */
export function aLineasCotizacion(res, esc) {
  const E = esc === 'B' ? res.B : res.A;
  const L = (id, nombre, p) => ({ id, cantidad: 1, unidad: '', nota: '', personalizada: { nombre, materialesCents: 0, horas: 0, tarifaCents: 0, subCents: 0, subMarkupBp: 0, otrosCents: 0, ...p } });
  const lineas = [];
  const materiales = E.materiales;
  if (materiales > 0) lineas.push(L('pint-mat', 'Materiales de pintura', { materialesCents: materiales }));
  if (esc === 'B') {
    if (E.horas > 0 && E.salarioH > 0) lineas.push(L('pint-mano', 'Mano de obra propia', { horas: E.horas, tarifaCents: E.salarioH }));
  } else if (E.pago > 0) lineas.push(L('pint-sub', 'Subcontrato (solo mano de obra)', { subCents: E.pago }));
  const otros = esc === 'B'
    ? [['pint-equipo', 'Herramientas y equipo', E.equipos], ['pint-lift', 'Alquiler de lift', E.lift], ['pint-vehiculo', 'Vehículo', E.vehiculo], ['pint-superv', 'Supervisión', E.supervision.costo]]
    : [['pint-superv', 'Supervisión y coordinación', E.supervision.costo], ['pint-seguro', 'Seguro', E.seguro]];
  for (const [id, n, c] of otros) if (c > 0) lineas.push(L(id, n, { otrosCents: c }));
  return { lineas, ajustesCot: esc === 'B' ? { burdenBp: E.cargas.bpEfectivo } : {}, contingenciaBp: res.contBp };
}

/** Texto de "N horas-hombre = P personas x D días de H horas" en datos (la interfaz arma la frase traducida). */
export function resumenCuadrilla(plan, rango = 'probable') {
  if (!plan || plan.incompleto) return null;
  const r = plan[rango];
  return { horasHombre: r.horasHombre, personas: plan.efectivas, dias: r.diasTrabajo, horasDia: plan.horasDia, eficienciaPct: plan.eficienciaPct, horasReloj: r.horasReloj, reloj: r.reloj };
}
