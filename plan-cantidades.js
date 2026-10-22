// plan-cantidades.js - Esquema v1 para IMPORTAR cantidades de planos (módulo PURO: sin DOM ni red).
// Un análisis hecho FUERA de la app (p. ej. por Claude) produce un JSON; la app solo lo REVISA:
//  - cada valor numérico medible viaja como {valor, fuente:{pagina,bbox,texto_literal,metodo}, confianza};
//  - el validador devuelve errores legibles en español (mensaje_es), nunca inventa valores;
//  - SOLO las cantidades APROBADAS por una persona entran al precio (ver lineasDesdeItems).
// Este módulo no lee PDF. Los PDF y los JSON importados NO se guardan en el repo.
import { tr } from './i18n.js';
import { lineaLibre } from './bids-calc.js';
import { analizarAlcance } from './bids-fit.js';

export const VERSION = 1;
export const METODOS = ['texto_pdf', 'tabla_pdf', 'vision', 'medido_humano', 'supuesto'];
export const CONFIANZAS = ['alta', 'media', 'baja'];
/** Unidades aceptadas (alias -> unidad del catálogo de defaults.js). */
export const UNIDADES = { 'ft²': 'ft²', sf: 'ft²', lf: 'lf', ft: 'ft', ea: 'ea', gal: 'gal', hoja: 'hoja', 'asig.': 'asig.', asig: 'asig.', h: 'h', ud: 'ud' };
/** Códigos de error: cada uno tiene clave i18n 'cant.err.<codigo>' en es y en (hay un test que lo comprueba). */
export const CODIGOS = ['no_objeto', 'version', 'falta_campo', 'tipo_invalido', 'no_numero', 'negativo', 'sin_fuente', 'fuente_incompleta',
  'bbox_invalido', 'metodo_desconocido', 'confianza_invalida', 'unidad_desconocida', 'sha256_invalido'];
export const ADVERTENCIAS = ['pagina_sin_hoja', 'escala_no_verificada'];
// Unidad natural de cada campo medible.
const UNIDAD_CAMPO = { area_sf: 'ft²', perimetro_lf: 'lf', alto_techo_ft: 'ft', cantidad_conteo: 'ea', lf: 'lf', alto_ft: 'ft' };

const esObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const esTxt = (x) => typeof x === 'string' && x.trim() !== '';

/**
 * validar(json) -> { ok, errores:[{ruta,codigo,args,mensaje_es}], advertencias:[...], items:[...], datos }
 * `items` = valores a revisar (uno por número medible), con requiere_aprobacion y estado 'pendiente'.
 * Decisión: NO llevan fuente los metadatos del documento (version, hojas[].pagina, fuente.pagina, bbox): solo las cantidades.
 */
export function validar(json) {
  const errores = [], advertencias = [], items = [];
  const E = (ruta, codigo, ...args) => errores.push({ ruta, codigo, args, mensaje_es: tr('es', 'cant.err.' + codigo, ruta, ...args) });
  const W = (ruta, codigo, ...args) => advertencias.push({ ruta, codigo, args, mensaje_es: tr('es', 'cant.warn.' + codigo, ruta, ...args) });
  if (!esObj(json)) { E('(raíz)', 'no_objeto'); return { ok: false, errores, advertencias, items, datos: null }; }
  const d = {};
  if (json.version !== VERSION) E('version', 'version', String(json.version));
  d.version = json.version;

  const txt = (o, k, ruta, req = true) => { if (o[k] == null || o[k] === '') { if (req) E(`${ruta}.${k}`, 'falta_campo'); return ''; } if (typeof o[k] !== 'string') { E(`${ruta}.${k}`, 'tipo_invalido', 'texto'); return ''; } return o[k]; };
  const arr = (o, k, ruta) => { if (!Array.isArray(o[k])) { E(`${ruta}`, o[k] == null ? 'falta_campo' : 'tipo_invalido', 'lista'); return []; } return o[k]; };

  // ---- plano ----
  const p = esObj(json.plano) ? json.plano : (E('plano', 'falta_campo'), {});
  d.plano = { archivo: txt(p, 'archivo', 'plano'), sha256: txt(p, 'sha256', 'plano'), revision: txt(p, 'revision', 'plano'), fecha: txt(p, 'fecha', 'plano'), addenda: p.addenda ?? '' };
  if (d.plano.sha256 && !/^[0-9a-f]{64}$/i.test(d.plano.sha256)) E('plano.sha256', 'sha256_invalido');
  if (p.addenda != null && typeof p.addenda !== 'string' && !(Array.isArray(p.addenda) && p.addenda.every((x) => typeof x === 'string'))) E('plano.addenda', 'tipo_invalido', 'texto o lista de textos');

  // ---- hojas ----
  d.hojas = arr(json, 'hojas', 'hojas').map((h, i) => {
    const r = `hojas[${i}]`;
    if (!esObj(h)) { E(r, 'tipo_invalido', 'objeto'); return null; }
    if (!Number.isInteger(h.pagina) || h.pagina < 1) E(`${r}.pagina`, 'tipo_invalido', 'número entero desde 1');
    if (typeof h.escala_verificada !== 'boolean') E(`${r}.escala_verificada`, 'tipo_invalido', 'verdadero o falso');
    return { pagina: h.pagina, numero: txt(h, 'numero', r), titulo: txt(h, 'titulo', r), escala_texto: txt(h, 'escala_texto', r, false), escala_verificada: h.escala_verificada === true };
  }).filter(Boolean);
  const hoja = (pag) => d.hojas.find((x) => x.pagina === pag);

  // ---- valor con fuente y confianza ----
  const valor = (o, k, ruta, { grupo, entidad, campo, unidad }) => {
    const r = `${ruta}.${k}`, v = o[k];
    if (v == null) { E(r, 'falta_campo'); return null; }
    if (typeof v === 'number' || typeof v === 'string') { E(r, 'sin_fuente'); return null; } // número suelto = valor sin fuente
    if (!esObj(v)) { E(r, 'tipo_invalido', 'objeto con valor, fuente y confianza'); return null; }
    let ok = true;
    if (typeof v.valor !== 'number' || !Number.isFinite(v.valor)) { E(`${r}.valor`, 'no_numero'); ok = false; }
    else if (v.valor < 0) { E(`${r}.valor`, 'negativo', String(v.valor)); ok = false; }
    const f = v.fuente;
    if (!esObj(f)) { E(`${r}.fuente`, 'sin_fuente'); return null; }
    if (!Number.isInteger(f.pagina) || f.pagina < 1) { E(`${r}.fuente.pagina`, 'fuente_incompleta', 'pagina'); ok = false; }
    if (!esTxt(f.texto_literal)) { E(`${r}.fuente.texto_literal`, 'fuente_incompleta', 'texto_literal'); ok = false; }
    const bb = f.bbox;
    if (!Array.isArray(bb) || bb.length !== 4 || !bb.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) || bb[2] < bb[0] || bb[3] < bb[1]) { E(`${r}.fuente.bbox`, 'bbox_invalido'); ok = false; }
    if (!METODOS.includes(f.metodo)) { E(`${r}.fuente.metodo`, 'metodo_desconocido', String(f.metodo)); ok = false; }
    if (!CONFIANZAS.includes(v.confianza)) { E(`${r}.confianza`, 'confianza_invalida', String(v.confianza)); ok = false; }
    if (!ok) return null;
    const h = hoja(f.pagina);
    if (!h) W(`${r}.fuente.pagina`, 'pagina_sin_hoja', String(f.pagina));
    const escalaDudosa = ['vision', 'medido_humano'].includes(f.metodo) && h && !h.escala_verificada;
    if (escalaDudosa) W(r, 'escala_no_verificada', h.numero);
    const norm = { valor: v.valor, fuente: { pagina: f.pagina, bbox: [...bb], texto_literal: f.texto_literal, metodo: f.metodo }, confianza: v.confianza };
    items.push({
      id: r, grupo, entidad, campo, unidad, valor: v.valor, fuente: norm.fuente, confianza: v.confianza,
      // media/baja, supuestos y lecturas por imagen en hojas sin escala verificada exigen aprobación explícita y atenta.
      requiere_aprobacion: v.confianza !== 'alta' || f.metodo === 'supuesto' || !!escalaDudosa,
      estado: 'pendiente', aprobado_por: null, aprobado_en: null,
    });
    return norm;
  };

  // ---- cuartos ----
  d.cuartos = arr(json, 'cuartos', 'cuartos').map((c, i) => {
    const r = `cuartos[${i}]`;
    if (!esObj(c)) { E(r, 'tipo_invalido', 'objeto'); return null; }
    const nombre = txt(c, 'nombre', r), ent = nombre || r;
    const o = { nombre, numero: txt(c, 'numero', r, false) };
    for (const k of ['area_sf', 'perimetro_lf', 'alto_techo_ft']) o[k] = valor(c, k, r, { grupo: 'cuartos', entidad: ent, campo: k, unidad: UNIDAD_CAMPO[k] });
    o.acabados = {}; if (esObj(c.acabados)) for (const k of ['piso', 'zocalo', 'muros', 'techo']) o.acabados[k] = typeof c.acabados[k] === 'string' ? c.acabados[k] : ''; else E(`${r}.acabados`, 'falta_campo');
    return o;
  }).filter(Boolean);
  // ---- conteos ----
  d.conteos = arr(json, 'conteos', 'conteos').map((c, i) => {
    const r = `conteos[${i}]`;
    if (!esObj(c)) { E(r, 'tipo_invalido', 'objeto'); return null; }
    const tipo = txt(c, 'tipo', r);
    return { tipo, marca: txt(c, 'marca', r, false), cantidad: valor(c, 'cantidad', r, { grupo: 'conteos', entidad: [tipo, c.marca].filter(Boolean).join(' '), campo: 'cantidad_conteo', unidad: 'ea' }), detalle: txt(c, 'detalle', r, false) };
  }).filter(Boolean);
  // ---- muros ----
  d.muros = arr(json, 'muros', 'muros').map((m, i) => {
    const r = `muros[${i}]`;
    if (!esObj(m)) { E(r, 'tipo_invalido', 'objeto'); return null; }
    const tipo = txt(m, 'tipo', r);
    return { tipo, lf: valor(m, 'lf', r, { grupo: 'muros', entidad: tipo, campo: 'lf', unidad: 'lf' }), alto_ft: valor(m, 'alto_ft', r, { grupo: 'muros', entidad: tipo, campo: 'alto_ft', unidad: 'ft' }), capas: m.capas ?? '' };
  }).filter(Boolean);
  // ---- partidas sugeridas ----
  d.partidas_sugeridas = arr(json, 'partidas_sugeridas', 'partidas_sugeridas').map((pt, i) => {
    const r = `partidas_sugeridas[${i}]`;
    if (!esObj(pt)) { E(r, 'tipo_invalido', 'objeto'); return null; }
    const oficio = txt(pt, 'oficio', r);
    let unidad = UNIDADES[pt.unidad];
    if (!unidad) { E(`${r}.unidad`, 'unidad_desconocida', String(pt.unidad)); unidad = ''; }
    const o = { oficio, unidad, formula: txt(pt, 'formula', r, false), partida_id: typeof pt.partida_id === 'string' ? pt.partida_id : undefined, insumos: [] };
    o.cantidad = valor(pt, 'cantidad', r, { grupo: 'partidas', entidad: oficio, campo: 'cantidad_partida', unidad });
    const itP = items.find((x) => x.id === `${r}.cantidad`);
    if (itP) { itP.formula = o.formula; if (o.partida_id) itP.partida_id = o.partida_id; }
    if (pt.insumos != null) {
      if (!Array.isArray(pt.insumos)) E(`${r}.insumos`, 'tipo_invalido', 'lista');
      else pt.insumos.forEach((ins, j) => {
        const ri = `${r}.insumos[${j}]`;
        if (!esObj(ins)) { E(ri, 'tipo_invalido', 'objeto'); return; }
        let u = UNIDADES[ins.unidad]; if (!u) { E(`${ri}.unidad`, 'unidad_desconocida', String(ins.unidad)); u = ''; }
        o.insumos.push({ nombre: txt(ins, 'nombre', ri), unidad: u, cantidad: valor(ins, 'cantidad', ri, { grupo: 'insumos', entidad: `${oficio}: ${ins.nombre || ''}`, campo: 'cantidad_insumo', unidad: u }) });
      });
    }
    return o;
  }).filter(Boolean);
  for (const k of ['supuestos', 'dudas']) {
    d[k] = arr(json, k, k);
    d[k].forEach((s, i) => { if (typeof s !== 'string') E(`${k}[${i}]`, 'tipo_invalido', 'texto'); });
    d[k] = d[k].filter((s) => typeof s === 'string');
  }
  return { ok: errores.length === 0, errores, advertencias, items, datos: d };
}

// ---------- Aprobación ----------
const aISO = (cuando) => { const f = cuando instanceof Date ? cuando : new Date(cuando); if (isNaN(f)) throw new Error(tr('es', 'cant.err.fecha')); return f.toISOString(); };
/** Marca el valor como aprobado por una persona. No muta el original. */
export function aprobar(item, quien, cuando) {
  if (!esTxt(quien)) throw new Error(tr('es', 'cant.err.quien'));
  return { ...item, estado: 'aprobado', aprobado_por: quien.trim(), aprobado_en: aISO(cuando) };
}
/**
 * Corrige el valor a mano. ANULA cualquier aprobación previa (queda 'pendiente' hasta que se apruebe el nuevo valor).
 * Conserva valor_original y marca la fuente como 'medido_humano'.
 */
export function corregir(item, nuevoValor, quien, cuando) {
  if (!esTxt(quien)) throw new Error(tr('es', 'cant.err.quien'));
  const v = Number(nuevoValor);
  if (typeof nuevoValor === 'boolean' || nuevoValor === '' || nuevoValor == null || !Number.isFinite(v) || v < 0) throw new Error(tr('es', 'cant.err.valorCorregido'));
  return { ...item, valor: v, valor_original: item.valor_original ?? item.valor, corregido: true, corregido_por: quien.trim(), corregido_en: aISO(cuando),
    fuente: { ...item.fuente, metodo: 'medido_humano' }, confianza: 'alta', requiere_aprobacion: false, estado: 'pendiente', aprobado_por: null, aprobado_en: null };
}
export const estaAprobado = (item) => item.estado === 'aprobado' && !!item.aprobado_por;
export const contarAprobadas = (items) => ({ aprobadas: items.filter(estaAprobado).length, total: items.length });
/** Aprueba de una vez las de confianza ALTA que no exigen revisión especial (nunca media/baja). */
export const aprobarAltas = (items, quien, cuando) => items.map((it) => (it.estado === 'pendiente' && !it.requiere_aprobacion ? aprobar(it, quien, cuando) : it));

// ---------- De cantidades aprobadas a líneas del costeo (reutiliza el motor vía bids-calc / engine) ----------
export function oficioClave(texto) {
  const r = analizarAlcance(texto);
  return (r.relevantes[0] || r.fuera[0])?.key || 'otro';
}
const refFuente = (it, hojas) => { const h = (hojas || []).find((x) => x.pagina === it.fuente.pagina); return `Plano p.${h?.numero || it.fuente.pagina}: "${it.fuente.texto_literal}"`; };
/**
 * calcularPartida(item, {id, catalogo, hojas}) -> línea de costeo de licitación (forma de bids-calc.lineaLibre) o null.
 * Solo devuelve línea si el item es una partida APROBADA. Si trae partida_id que existe en el catálogo (y la unidad coincide),
 * la línea es 'catalogo' y el motor calcula el costo; si no, es 'libre' con costos en $0 (NO se inventan precios).
 */
export function calcularPartida(item, { id, catalogo, hojas } = {}) {
  if (!item || item.grupo !== 'partidas' || !estaAprobado(item)) return null;
  if (!Number.isFinite(item.valor) || item.valor < 0) return null;
  const partidaId = item.partida_id;
  const cat = catalogo?.partidas?.find((x) => x.id === partidaId);
  const oficio = oficioClave(item.entidad);
  const base = { ...lineaLibre(id, oficio, catalogo?.tarifas?.find((x) => x.id === 'pintor')?.cents), nombre: item.entidad, cantidad: item.valor, unidad: item.unidad, nota: refFuente(item, hojas), origenItemId: item.id };
  if (cat && cat.unidad === item.unidad) return { ...base, modo: 'catalogo', partidaId: cat.id, dificultadId: 'normal', nombre: '' };
  return base;
}
/**
 * lineasDesdeItems(items, {ids, catalogo, hojas, existentes}) -> { lineas, omitidas:[{id,motivo}] }
 * Solo entran partidas APROBADAS. Las pendientes (incluidas media/baja sin aprobar) quedan fuera y se reportan.
 * Si ya existe una línea con el mismo origenItemId en `existentes`, se actualiza en vez de duplicarse.
 */
export function lineasDesdeItems(items, { ids, catalogo, hojas, existentes = [] } = {}) {
  const lineas = [], omitidas = [];
  for (const it of items.filter((x) => x.grupo === 'partidas')) {
    if (!estaAprobado(it)) { omitidas.push({ id: it.id, motivo: 'sin_aprobar' }); continue; }
    const prev = existentes.find((l) => l.origenItemId === it.id);
    const l = calcularPartida(it, { id: prev?.id || ids(), catalogo, hojas });
    if (l) lineas.push({ linea: l, existente: prev || null });
  }
  return { lineas, omitidas };
}
/** Línea de COTIZACIÓN (forma de cotizacion.js) a partir de una línea de licitación creada arriba. */
export function aLineaCotizacion(l, id) {
  if (l.modo === 'catalogo') return { id, partidaId: l.partidaId, cantidad: l.cantidad, unidad: l.unidad, cuartoId: null, opciones: { manos: 2, dificultadId: l.dificultadId || 'normal' }, nota: l.nota, origenItemId: l.origenItemId };
  return { id, cantidad: 1, unidad: '', nota: l.nota, origenItemId: l.origenItemId,
    personalizada: { nombre: `${l.nombre} (${l.cantidad} ${l.unidad})`, materialesCents: 0, horas: 0, tarifaCents: l.tarifaCents || 2400, subCents: 0, subMarkupBp: 0, otrosCents: 0 } };
}

/** Texto de la fuente para mostrar: 'Hoja A2.2, texto: "…"'. `etiquetaMetodo` viene de i18n (cant.metodo.<m>). */
export function textoFuente(item, hojas, lang = 'es') {
  const h = (hojas || []).find((x) => x.pagina === item.fuente.pagina);
  const claveMetodo = 'cant.metodo.' + item.fuente.metodo;
  return tr(lang, 'cant.src', h?.numero || String(item.fuente.pagina), tr(lang, claveMetodo), item.fuente.texto_literal);
}
