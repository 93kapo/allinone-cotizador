// engine.js - Motor de cálculo del cotizador. Funciones PURAS (sin DOM, sin red).
//
// CONVENCIONES
//  - Dinero: SIEMPRE centavos enteros (Number entero).
//  - Porcentajes: puntos base enteros ("bp"): 3500 = 35.00 %. Evita errores de coma flotante.
//  - Cantidades físicas (ft, ft², horas, galones) son números normales.
//
// SUPUESTOS DE BASE (documentados, editables en código si el contador pide otra cosa):
//  - Impuesto de ventas: sobre materiales (incluye desperdicio). El contratista lo paga al comprar -> es costo.
//  - Mano de obra: horas x tarifa salarial x (1 + burden). Burden = FICA + seguros + workers comp.
//  - Subcontrato: costo del sub x (1 + markup propio). El markup propio se trata como costo de coordinación
//    y entra al costo (queda sujeto a contingencia/overhead como cualquier directo).
//  - Contingencia: sobre costos directos.
//  - Overhead: sobre (directos + contingencia).
//  - Reserva de garantía: sobre (directos + contingencia + overhead).
//  - Precio = costoTotal / (1 - margen)  (margen sobre PRECIO, no markup).

export const BP = 10000;
export const TEXTO_CONFIRMACION = 'CONFIRMO MARGEN BAJO';

// ---------- Dinero y porcentajes ----------
export const mulBp = (cents, bp) => Math.round((cents * bp) / BP);
export const aCentavos = (dolares) => Math.round(Number(dolares) * 100 + (Number(dolares) < 0 ? -1e-9 : 1e-9));
export const aDolares = (cents) => cents / 100;
export const pctABp = (pct) => Math.round(Number(pct) * 100 + 1e-9);
export const bpAPct = (bp) => bp / 100;

/** Precio de venta para un margen (bp) SOBRE PRECIO. Redondea al centavo. */
export function precioDesdeCosto(costoCents, margenBp) {
  if (!Number.isInteger(margenBp) || margenBp < 0 || margenBp >= BP) throw new RangeError('margen fuera de rango [0, 100)');
  return Math.round((costoCents * BP) / (BP - margenBp));
}
/** Margen real (bp) dado precio y costo. */
export function margenReal(precioCents, costoCents) {
  if (precioCents <= 0) return 0;
  return Math.round(((precioCents - costoCents) * BP) / precioCents);
}
/** Markup equivalente (porcentaje, p.ej. 53.846...) a partir de margen en bp. 35% margen -> 53.8% markup. */
export function markupPctDesdeMargenBp(margenBp) {
  if (margenBp >= BP) return Infinity;
  return (margenBp / (BP - margenBp)) * 100;
}
export function markupPctReal(precioCents, costoCents) {
  if (costoCents <= 0) return 0;
  return ((precioCents - costoCents) / costoCents) * 100;
}
/** Ganancia neta estimada tras impuestos (tasa en bp). Si no hay ganancia, no hay impuesto. */
export function gananciaNeta(gananciaCents, impuestoBp) {
  if (gananciaCents <= 0) return gananciaCents;
  return gananciaCents - mulBp(gananciaCents, impuestoBp);
}
/**
 * Decide si se puede generar el PDF al cliente.
 * Por debajo del piso hay que escribir el texto exacto de confirmación.
 */
export function puedeGenerarPdf(margenBp, pisoBp, textoConfirmacion = '') {
  if (margenBp >= pisoBp) return { ok: true, requiereConfirmacion: false };
  const ok = String(textoConfirmacion).trim().toUpperCase() === TEXTO_CONFIRMACION;
  return { ok, requiereConfirmacion: true };
}

// ---------- Mediciones ----------
export const DEFAULTS_MEDIDA = { areaPuerta: 21, areaVentana: 15, anchoPuerta: 3 };

/** Medidas de un cuarto (ft). Aberturas se restan de paredes (nunca resulta negativo). */
export function medirCuarto(c, d = DEFAULTS_MEDIDA) {
  const largo = +c.largo || 0, ancho = +c.ancho || 0, alto = +c.alto || 0;
  const puertas = +c.puertas || 0, ventanas = +c.ventanas || 0;
  const areaPuerta = c.areaPuerta ?? d.areaPuerta;
  const areaVentana = c.areaVentana ?? d.areaVentana;
  const anchoPuerta = d.anchoPuerta ?? 3;
  const perimetro = 2 * (largo + ancho);
  const aberturas = puertas * areaPuerta + ventanas * areaVentana;
  const paredes = Math.max(0, perimetro * alto - aberturas);
  return {
    perimetro, paredes, techo: largo * ancho, piso: largo * ancho,
    trim: Math.max(0, perimetro - puertas * anchoPuerta), puertas, ventanas,
  };
}

/** Manos efectivas: color oscuro suma 1. */
export const manosEfectivas = (manos, oscuro) => Math.max(1, Math.round(manos)) + (oscuro ? 1 : 0);

/** Galones ENTEROS: área x manos x (1+desperdicio) / cobertura, redondeo hacia arriba. */
export function galones({ area, manos, cobertura, desperdicioBp = 0 }) {
  if (!(cobertura > 0) || !(area > 0)) return 0;
  const g = (area * manos * (BP + desperdicioBp)) / BP / cobertura;
  return Math.ceil(g - 1e-9);
}

// ---------- Costeo de componentes ----------
/** Línea de material: cantidad x precio x (1+desperdicio). */
export const costoMaterial = (m) => Math.round((m.cantidad * m.precioCents * (BP + (m.desperdicioBp || 0))) / BP);

/** Mano de obra. horas = cantidad / productividad (x multiplicador de dificultad); + horas extra (prep). */
export function costoManoObra({ cantidad = 0, productividad = 0, horasExtra = 0, multBp = BP, tarifaCents, burdenBp }) {
  const horasBase = productividad > 0 ? cantidad / productividad : 0;
  const horas = horasBase * (multBp / BP) + horasExtra;
  const salario = Math.round(horas * tarifaCents);
  const burden = mulBp(salario, burdenBp);
  return { horas, salario, burden, total: salario + burden };
}
/** Subcontrato: costo x (1 + markup propio). */
export const costoSub = ({ costoCents, markupBp = 0 }) => costoCents + mulBp(costoCents, markupBp);

/** Contingencia por defecto: alta si casa pre-1978 o remodelación. */
export function contingenciaPorDefecto({ anioConstruccion, esRemodelacion }, ajustes) {
  const alta = (anioConstruccion && Number(anioConstruccion) < 1978) || esRemodelacion;
  return alta ? ajustes.contingenciaAltaBp : ajustes.contingenciaBp;
}
export const esPre1978 = (anio) => !!anio && Number(anio) > 0 && Number(anio) < 1978;

// ---------- Línea de cotización a partir de una partida del catálogo ----------
/**
 * linea: { partidaId, cantidad, opciones:{manos, oscuro, primer, dificultadId, prepPct, prepHoras},
 *          personalizada?: {nombre, componentes} }
 * catalogo: { tarifas[], materiales[], partidas[], dificultades[], otros[] }
 * Devuelve componentes con centavos: { materiales[], mano[], subs[], otros[], totales{...} }
 */
export function costearLinea(linea, catalogo, ajustes) {
  const comp = { materiales: [], mano: [], subs: [], otros: [] };
  if (linea.personalizada) {
    // Línea libre: el usuario da costos directos ya en centavos.
    const p = linea.personalizada;
    if (p.materialesCents) comp.materiales.push({ nombre: 'Materiales', cantidad: 1, precioCents: p.materialesCents, desperdicioBp: 0, costo: p.materialesCents });
    if (p.horas && p.tarifaCents) {
      const m = costoManoObra({ cantidad: 0, horasExtra: p.horas, tarifaCents: p.tarifaCents, burdenBp: ajustes.burdenBp });
      comp.mano.push({ nombre: 'Mano de obra', ...m });
    }
    if (p.subCents) comp.subs.push({ nombre: 'Subcontrato', costoCents: p.subCents, markupBp: p.subMarkupBp || 0, costo: costoSub({ costoCents: p.subCents, markupBp: p.subMarkupBp || 0 }) });
    if (p.otrosCents) comp.otros.push({ nombre: 'Otros', costo: p.otrosCents });
    return cerrarLinea(comp, ajustes);
  }
  const part = catalogo.partidas.find((x) => x.id === linea.partidaId);
  if (!part) throw new Error('Partida no encontrada: ' + linea.partidaId);
  const cant = +linea.cantidad || 0;
  const op = linea.opciones || {};
  const dif = (catalogo.dificultades || []).find((d) => d.id === op.dificultadId);
  const multBp = dif ? dif.multBp : BP;
  const matDe = (id) => {
    const m = catalogo.materiales.find((x) => x.id === id);
    if (!m) throw new Error('Material no encontrado: ' + id);
    return m;
  };
  let areaPintura = 0, manos = 0;

  if (part.pintura) {
    const pi = part.pintura;
    manos = manosEfectivas(op.manos ?? pi.manos ?? 2, op.oscuro);
    const pm = matDe(pi.materialId);
    const cobertura = pi.cobertura || pm.cobertura || 375;
    areaPintura = cant * (part.conversionArea || 1);
    const gal = galones({ area: areaPintura, manos, cobertura, desperdicioBp: pi.desperdicioBp ?? pm.desperdicioBp ?? 0 });
    if (gal > 0) comp.materiales.push({ nombre: pm.nombre, unidad: 'gal', cantidad: gal, precioCents: pm.cents, desperdicioBp: 0, costo: gal * pm.cents });
    if (op.primer && pi.primerId) {
      const pr = matDe(pi.primerId);
      const gp = galones({ area: areaPintura, manos: 1, cobertura: pr.cobertura || 300, desperdicioBp: pr.desperdicioBp || 0 });
      if (gp > 0) comp.materiales.push({ nombre: pr.nombre, unidad: 'gal', cantidad: gp, precioCents: pr.cents, desperdicioBp: 0, costo: gp * pr.cents });
    }
  }
  for (const mp of part.materiales || []) {
    const m = matDe(mp.id);
    let q = cant * mp.porUnidad;
    const des = m.desperdicioBp || 0;
    // Con "entero": el desperdicio se aplica antes de redondear hacia arriba.
    if (mp.entero) q = Math.ceil((cant * mp.porUnidad * (BP + des)) / BP - 1e-9);
    const item = { nombre: m.nombre, unidad: m.unidad, cantidad: q, precioCents: m.cents, desperdicioBp: mp.entero ? 0 : des };
    item.costo = costoMaterial(item);
    if (item.costo) comp.materiales.push(item);
  }
  if (part.mano) {
    const t = catalogo.tarifas.find((x) => x.id === part.mano.tarifaId);
    if (!t) throw new Error('Tarifa no encontrada: ' + part.mano.tarifaId);
    let horasExtra = +op.prepHoras || 0;
    const base = part.mano.productividad > 0 ? cant / part.mano.productividad : 0;
    if (op.prepPct) horasExtra += (base * (multBp / BP) * op.prepPct) / 100;
    const m = costoManoObra({ cantidad: cant, productividad: part.mano.productividad, horasExtra, multBp, tarifaCents: t.cents, burdenBp: ajustes.burdenBp });
    comp.mano.push({ nombre: t.nombre, tarifaCents: t.cents, ...m });
  }
  if (part.sub) {
    const costoCents = Math.round(cant * part.sub.costoUnidadCents);
    const markupBp = op.subMarkupBp ?? part.sub.markupBp ?? 0;
    comp.subs.push({ nombre: part.sub.nombre || 'Subcontrato', costoCents, markupBp, costo: costoSub({ costoCents, markupBp }) });
  }
  if (part.otrosUnidadCents) {
    comp.otros.push({ nombre: 'Otros directos', costo: Math.round(cant * part.otrosUnidadCents) });
  }
  const r = cerrarLinea(comp, ajustes);
  r.areaPintura = areaPintura; r.manos = manos;
  return r;
}

function cerrarLinea(comp, ajustes) {
  const materiales = comp.materiales.reduce((s, x) => s + x.costo, 0);
  const impuestoMat = mulBp(materiales, ajustes.impuestoVentasBp);
  const manoObra = comp.mano.reduce((s, x) => s + x.total, 0);
  const horas = comp.mano.reduce((s, x) => s + x.horas, 0);
  const subs = comp.subs.reduce((s, x) => s + x.costo, 0);
  const otros = comp.otros.reduce((s, x) => s + x.costo, 0);
  const directo = materiales + impuestoMat + manoObra + subs + otros;
  return { ...comp, totales: { materiales, impuestoMat, manoObra, horas, subs, otros, directo } };
}

/** Reparte `total` en proporción a `pesos` con el método del mayor residuo (suma exacta). */
export function repartir(total, pesos) {
  const suma = pesos.reduce((s, x) => s + x, 0);
  if (suma <= 0) {
    const out = pesos.map(() => 0);
    if (out.length) out[0] = total;
    return out;
  }
  const base = pesos.map((p) => Math.floor((total * p) / suma));
  let resto = total - base.reduce((s, x) => s + x, 0);
  const orden = pesos.map((p, i) => ({ i, f: (total * p) / suma - base[i] })).sort((a, b) => b.f - a.f);
  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) base[orden[k].i]++;
  return base;
}

/**
 * Cotización completa. q = { lineas[], margenBp, contingenciaBp?, snapshot:{catalogo, ajustes}, ajustesCot? }
 * Los ajustes se leen del SNAPSHOT (no del catálogo vivo).
 */
export function calcularCotizacion(q) {
  const { catalogo, ajustes: aj0 } = q.snapshot;
  const ajustes = { ...aj0, ...(q.ajustesCot || {}) };
  const contBp = q.contingenciaBp ?? ajustes.contingenciaBp;
  const lineasCalc = (q.lineas || []).map((l) => ({ id: l.id, ...costearLinea(l, catalogo, ajustes) }));
  const sum = (k) => lineasCalc.reduce((s, l) => s + l.totales[k], 0);
  const t = {
    materiales: sum('materiales'), impuestoMat: sum('impuestoMat'), manoObra: sum('manoObra'),
    horas: sum('horas'), subs: sum('subs'), otros: sum('otros'),
  };
  t.directos = t.materiales + t.impuestoMat + t.manoObra + t.subs + t.otros;
  t.contingencia = mulBp(t.directos, contBp);
  t.overhead = mulBp(t.directos + t.contingencia, ajustes.overheadBp);
  t.garantia = mulBp(t.directos + t.contingencia + t.overhead, ajustes.garantiaBp);
  t.costoTotal = t.directos + t.contingencia + t.overhead + t.garantia;
  const margenBp = q.margenBp ?? ajustes.margenObjetivoBp;
  t.precio = precioDesdeCosto(t.costoTotal, margenBp);
  t.ganancia = t.precio - t.costoTotal;
  t.margenBp = margenReal(t.precio, t.costoTotal);
  t.markupPct = markupPctReal(t.precio, t.costoTotal);
  t.gananciaNeta = gananciaNeta(t.ganancia, ajustes.impuestoNetoBp);
  const precios = repartir(t.precio, lineasCalc.map((l) => l.totales.directo));
  lineasCalc.forEach((l, i) => { l.precio = precios[i]; });
  return { lineas: lineasCalc, totales: t, contingenciaBp: contBp, margenObjetivoBp: margenBp };
}

/** Hitos de pago: porcentajes en bp -> montos en centavos que suman exactamente el total. */
export function montosHitos(totalCents, hitosBp) {
  return repartir(totalCents, hitosBp);
}
/** Anticipo > 10 % (o $1,000 el menor? FL 489.126 aplica al exceso de 10 %): devuelve true si excede. */
export const anticipoExcede10 = (primerHitoBp) => primerHitoBp > 1000;

// ---------- Snapshot ----------
/** Copia profunda inmutable-por-copia: editar el catálogo después NO altera la cotización. */
export function snapshotCatalogo(catalogo, ajustes) {
  return structuredClone({ catalogo, ajustes, fecha: new Date().toISOString() });
}

// ---------- Planos: geometría y escala ----------
/** Interpreta "12' 6\"", "12ft 6in", "12.5", "150 in", "3.5 m"? (m no: solo ft/in). Devuelve ft o NaN. */
export function parseLongitud(txt) {
  if (typeof txt === 'number') return txt;
  const s = String(txt).trim().toLowerCase().replace(/,/g, '.').replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  if (!s) return NaN;
  const re = /^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot|pies|pie)\s*)?(?:(\d+(?:\.\d+)?)(?:\s*(?:\/\s*(\d+)))?\s*(?:"|in|inch|inches|pulg|pulgadas)\s*)?$/;
  let m = s.match(re);
  if (m && (m[1] || m[2])) {
    const ft = m[1] ? parseFloat(m[1]) : 0;
    let inch = m[2] ? parseFloat(m[2]) : 0;
    if (m[3]) inch = parseFloat(m[2]) / parseFloat(m[3]);
    return ft + inch / 12;
  }
  m = s.match(/^(\d+(?:\.\d+)?)$/);
  return m ? parseFloat(m[1]) : NaN;
}
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
/** Escala = pies por unidad de página (PDF points). */
export function calibrarEscala(p1, p2, pies) {
  const d = dist(p1, p2);
  if (!(d > 0) || !(pies > 0)) return NaN;
  return pies / d;
}
export function longitudPolilinea(pts, piesPorUnidad, cerrada = false) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  if (cerrada && pts.length > 2) d += dist(pts[pts.length - 1], pts[0]);
  return d * piesPorUnidad;
}
/** Área por fórmula del cordón (shoelace) x escala². Resultado en ft². */
export function areaPoligono(pts, piesPorUnidad) {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return (Math.abs(s) / 2) * piesPorUnidad * piesPorUnidad;
}
export function formatoPiesPulgadas(ft) {
  if (!isFinite(ft)) return '';
  let total = Math.round(ft * 12);
  const f = Math.floor(total / 12), i = total - f * 12;
  return `${f}' ${i}"`;
}
