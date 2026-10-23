// papelera.js - Reglas PURAS de borrado suave, archivado, búsqueda y "necesita su atención".
// Campos NUEVOS (solo se añaden; los existentes no se tocan):
//   estado === 'papelera' + estadoAntes + borradoEn (ISO)   -> borrado suave (se purga a los 30 días)
//   archivada (bool) + archivadaEn (ISO)                     -> archivado (conserva el estado original: Enviada, Aceptada...)
import { vencimiento } from './bids-calc.js';

export const DIAS_PAPELERA = 30;
export const DIAS_ATENCION = 7;
/** Proyectos potenciales que ya se enviaron o cerraron: solo se archivan (son un registro). */
const BID_SOLO_ARCHIVAR = ['enviada', 'ganada', 'perdida'];
const BID_ABIERTOS = ['nuevo', 'interesado', 'cotizando', 'borrador'];

export const enPapelera = (it) => it?.estado === 'papelera';
export const estaArchivada = (it) => !!it?.archivada && !enPapelera(it);
export const esVisible = (it) => !!it && !enPapelera(it) && !it.archivada;

/** tipo: 'cot' (cotización) | 'bid' (proyecto potencial). Cotización: SOLO borradores. Proyecto: todo salvo enviado/ganado/perdido (o ejemplo). */
export function puedeBorrar(tipo, it) {
  if (!it || enPapelera(it) || it.archivada) return false;
  if (tipo === 'cot') return it.estado === 'borrador';
  return !!it.ejemplo || !BID_SOLO_ARCHIVAR.includes(it.estado);
}
export const puedeArchivar = (it) => !!it && !enPapelera(it) && !it.archivada;

export function aPapelera(it, ahora = new Date()) { it.estadoAntes = it.estado; it.estado = 'papelera'; it.borradoEn = ahora.toISOString(); return it; }
export function sacarDePapelera(it) { if (enPapelera(it)) it.estado = it.estadoAntes || 'borrador'; delete it.borradoEn; delete it.estadoAntes; return it; }
export function archivar(it, ahora = new Date()) { it.archivada = true; it.archivadaEn = ahora.toISOString(); return it; }
export function desarchivar(it) { it.archivada = false; delete it.archivadaEn; return it; }

/** ¿Lleva 30 días o más en la papelera? (sin fecha de borrado nunca se purga: es lo seguro) */
export function purgable(it, ahora = new Date(), dias = DIAS_PAPELERA) {
  if (!enPapelera(it) || !it.borradoEn) return false;
  const t = Date.parse(it.borradoEn);
  return Number.isFinite(t) && ahora.getTime() - t >= dias * 864e5;
}
export const purgables = (lista, ahora, dias) => lista.filter((it) => purgable(it, ahora, dias));
/** ids de los PDF de plano que hay que borrar de IndexedDB cuando el borrado ya no se puede deshacer. */
export const idsPlanosPdf = (it) => (Array.isArray(it?.planos) ? it.planos.map((p) => p?.id).filter(Boolean) : []);

export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Filtro de la pantalla Inicio. estado: 'todas' | 'borrador' | 'enviada' | 'aceptada'. archivadas: muestra solo las archivadas. */
export function filtrarCotizaciones(lista, { estado = 'todas', texto = '', archivadas = false } = {}) {
  const q = normalizar(texto);
  return lista.filter((c) => {
    if (enPapelera(c)) return false;
    if (archivadas ? !c.archivada : c.archivada) return false;
    if (!archivadas && estado !== 'todas' && c.estado !== estado) return false;
    if (q && !normalizar(c.cliente?.nombre).includes(q) && !normalizar(c.numero).includes(q)) return false;
    return true;
  });
}

/** Razones por las que un BORRADOR necesita atención: sin nombre de cliente / sin medidas (ni cuartos, ni partidas, ni medidas de plano). */
export function razonesCotizacion(q) {
  if (!esVisible(q) || q.estado !== 'borrador') return [];
  const r = [];
  if (!String(q.cliente?.nombre || '').trim()) r.push('sinCliente');
  if (!(q.cuartos?.length) && !(q.lineas?.length) && !(q.medidas?.length)) r.push('sinMedidas');
  return r;
}
/** Proyectos potenciales abiertos que vencen en <= 7 días (0 < tiempo restante). Más cercanos primero. */
export function proyectosPorVencer(bids, ahora = new Date(), dias = DIAS_ATENCION) {
  return bids
    .filter((b) => esVisible(b) && BID_ABIERTOS.includes(b.estado))
    .map((b) => ({ b, v: vencimiento(b.fechaLimite, ahora) }))
    .filter(({ v }) => v.tiene && !v.vencida && v.ms <= dias * 864e5)
    .sort((a, b) => a.v.ms - b.v.ms);
}
export function necesitaAtencion({ cots = [], bids = [], ahora = new Date() }) {
  return {
    bids: proyectosPorVencer(bids, ahora),
    cots: cots.map((q) => ({ q, razones: razonesCotizacion(q) })).filter((x) => x.razones.length),
  };
}
