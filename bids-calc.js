// bids-calc.js - Datos y costeo de licitaciones (PURO). Reutiliza engine.js: no duplica la lógica de costos.
//  - Todas las líneas se calculan con UNA sola llamada a calcularCotizacion; el precio por breakout es la suma de
//    los precios de sus líneas (repartidos por mayor residuo), así la suma de breakouts == total al centavo.
import { calcularCotizacion, snapshotCatalogo, aCentavos, BP } from './engine.js';

export const ESTADOS = ['nuevo', 'interesado', 'cotizando', 'borrador', 'enviada', 'ganada', 'perdida', 'descartada'];

// ---------- Fechas (locales; nunca new Date('YYYY-MM-DD'), que se interpreta como UTC) ----------
/** 'YYYY-MM-DDTHH:mm' -> Date local; 'YYYY-MM-DD' -> fin de ese día (23:59:59); otro -> null. */
export function fechaLimiteADate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = m[4] != null ? new Date(y, mo - 1, d, +m[4], +m[5], 0) : new Date(y, mo - 1, d, 23, 59, 59);
  return isNaN(dt) ? null : dt;
}
/** Estado de vencimiento frente a `ahora` (inyectable para pruebas). */
export function vencimiento(iso, ahora = new Date()) {
  const lim = fechaLimiteADate(iso);
  if (!lim) return { tiene: false, vencida: false, ms: 0, dias: 0, horas: 0, minutos: 0 };
  const ms = lim.getTime() - ahora.getTime();
  const a = Math.abs(ms);
  return { tiene: true, vencida: ms < 0, ms, dias: Math.floor(a / 864e5), horas: Math.floor((a % 864e5) / 36e5), minutos: Math.floor((a % 36e5) / 6e4) };
}
const p2 = (n) => String(n).padStart(2, '0');
/** '2026-10-19T14:00' -> '10/19/2026 2:00 PM' ; solo fecha -> '10/19/2026' ; '' -> ''. */
export function formatoFechaLimite(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return '';
  const f = `${+m[2]}/${+m[3]}/${m[1]}`;
  if (m[4] == null) return f;
  const hh = +m[4];
  return `${f} ${hh % 12 === 0 ? 12 : hh % 12}:${m[5]} ${hh < 12 ? 'AM' : 'PM'}`;
}
/** 'YYYY-MM-DD' -> 'M/D/YYYY' (sin pasar por Date: no hay corrimiento de zona horaria). */
export function formatoFecha(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[2]}/${+m[3]}/${m[1]}` : '';
}
/** Valor para <input type="datetime-local">. */
export const aInputLocal = (iso) => (String(iso || '').length === 10 ? iso + 'T00:00' : String(iso || '').slice(0, 16));

// ---------- Semáforo ----------
/** rojo: bajo el piso; ambar: hasta 5 puntos sobre el piso; verde: más. */
export function semaforo(margenBp, pisoBp) {
  if (margenBp < pisoBp) return 'rojo';
  return margenBp < pisoBp + 500 ? 'ambar' : 'verde';
}

// ---------- Creación ----------
export function bidNuevo({ id, ajustes, catalogo, ahora = new Date() }) {
  return {
    id, tipo: 'licitacion', ejemplo: false, estado: 'nuevo', creado: ahora.toISOString(),
    proyecto: '', gc: '', contacto: '', telefono: '', email: '', direccion: '', ciudad: '', estadoUS: '', zip: '',
    fechaLimite: '', inicioEst: '', finEst: '', alcance: '', textoOriginal: '', notas: '',
    breakouts: [], lineas: [],
    margenBp: ajustes.margenObjetivoBp, contingenciaBp: ajustes.contingenciaBp,
    calif: { inclusiones: '', exclusiones: '', supuestos: '', validezDias: ajustes.validezDias || 30, addenda: '' },
    idiomaBorrador: ajustes.idiomaPdfDefault || 'en', borradores: {},
    snapshot: snapshotCatalogo(catalogo, ajustes),
  };
}
export const lineaLibre = (id, oficio, tarifaCents) => ({ id, oficio, breakoutId: null, modo: 'libre', nombre: '', nota: '', cantidad: 0, unidad: 'ft²',
  matCents: 0, productividad: 0, horas: 0, tarifaCents: tarifaCents || 2400, otrosCents: 0, subCents: 0, subMarkupBp: 0 });

// ---------- Costeo ----------
/** Convierte una línea de licitación en la línea que entiende engine.calcularCotizacion. */
export function lineaAMotor(l) {
  if (l.modo === 'catalogo') return { id: l.id, partidaId: l.partidaId, cantidad: +l.cantidad || 0, unidad: l.unidad, opciones: { dificultadId: l.dificultadId || 'normal' } };
  const cant = +l.cantidad || 0;
  const prod = +l.productividad || 0;
  const horas = prod > 0 ? cant / prod : (+l.horas || 0);
  return { id: l.id, cantidad: 1, personalizada: {
    nombre: l.nombre || '', materialesCents: Math.round(cant * (+l.matCents || 0)), horas, tarifaCents: +l.tarifaCents || 0,
    subCents: Math.round(+l.subCents || 0), subMarkupBp: +l.subMarkupBp || 0, otrosCents: Math.round(+l.otrosCents || 0) } };
}

/**
 * calcularBid(bid) -> {
 *   calc (resultado del motor), lineas[{linea, directo, precio}], grupos[{id,nombre,precio,directo,lineas}],
 *   total, sumaGrupos, cuadra, costoTotal, ganancia, margenBp, markupPct, semaforo, pisoBp, hayDesglose, sinAsignar, errores[] }
 * `grupos` incluye cada breakout (aun con $0) y, si hay líneas sin breakout, un grupo id:null "General".
 */
export function calcularBid(bid) {
  const errores = [];
  const cat = bid.snapshot.catalogo;
  const validas = (bid.lineas || []).filter((l) => {
    if (l.modo === 'catalogo' && !cat.partidas.some((p) => p.id === l.partidaId)) { errores.push('partida:' + l.partidaId); return false; }
    return true;
  });
  const margenBp = Number.isInteger(bid.margenBp) && bid.margenBp >= 0 && bid.margenBp < BP ? bid.margenBp : bid.snapshot.ajustes.margenObjetivoBp;
  const calc = calcularCotizacion({ lineas: validas.map(lineaAMotor), margenBp, contingenciaBp: bid.contingenciaBp, snapshot: bid.snapshot });
  const lineas = validas.map((linea, i) => ({ linea, directo: calc.lineas[i].totales.directo, precio: calc.lineas[i].precio }));
  const ids = new Set((bid.breakouts || []).map((b) => b.id));
  const grupos = (bid.breakouts || []).map((b) => ({ id: b.id, nombre: b.nombre, precio: 0, directo: 0, lineas: 0 }));
  const general = { id: null, nombre: '', precio: 0, directo: 0, lineas: 0 };
  for (const x of lineas) {
    const g = x.linea.breakoutId && ids.has(x.linea.breakoutId) ? grupos.find((y) => y.id === x.linea.breakoutId) : general;
    g.precio += x.precio; g.directo += x.directo; g.lineas++;
  }
  if (general.lineas) grupos.push(general);
  const T = calc.totales;
  const sumaGrupos = grupos.reduce((s, g) => s + g.precio, 0);
  const piso = bid.snapshot.ajustes.margenPisoBp;
  return {
    calc, lineas, grupos, total: T.precio, sumaGrupos, cuadra: sumaGrupos === T.precio, costoTotal: T.costoTotal, ganancia: T.ganancia,
    margenBp: T.margenBp, markupPct: T.markupPct, semaforo: semaforo(T.margenBp, piso), pisoBp: piso,
    hayDesglose: (bid.breakouts || []).length > 0, sinAsignar: (bid.breakouts || []).length > 0 ? general.lineas : 0, errores,
  };
}

/** Precio por oficio (suma de líneas). */
export function totalesPorOficio(res) {
  const m = new Map();
  for (const x of res.lineas) m.set(x.linea.oficio || '', (m.get(x.linea.oficio || '') || 0) + x.precio);
  return m;
}
export { aCentavos };
