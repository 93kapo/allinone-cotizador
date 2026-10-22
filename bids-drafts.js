// bids-drafts.js - Borradores de correo para licitaciones (PURO, ES/EN). La app NUNCA envía nada:
// solo arma texto que la persona revisa, copia o abre en su propio cliente de correo.
// Los borradores jamás incluyen costos internos, margen ni markup.
import { tr } from './i18n.js';
import { analizarAlcance, nombreOficio } from './bids-fit.js';
import { formatoFechaLimite } from './bids-calc.js';
import { puedeGenerarPdf } from './engine.js';

export const MARCADOR = '[COMPLETAR]';
export const MAILTO_AVISO_LARGO = 1800; // muchos clientes de correo truncan URLs/cuerpos largos
export const TIPOS = ['intent', 'proposal', 'rfi'];

const vacio = (s) => !String(s ?? '').trim();
const o = (s) => (vacio(s) ? MARCADOR : String(s).trim());
export const usdTxt = (cents) => '$' + ((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Datos del firmante desde Ajustes. Vacío/undefined => [COMPLETAR]. El seguro solo aparece si está configurado. */
export function datosFirma(ajustes) {
  const e = (ajustes && ajustes.empresa) || {};
  return { firmante: o(e.firmante), empresa: o(e.nombre), telefono: String(e.telefono ?? '').trim(), email: o(e.email), licencia: o(e.licencia), seguro: String(e.seguro ?? '').trim() };
}
function firma(lang, f) {
  return [tr(lang, 'bid.d.thanks'), f.firmante, f.empresa, f.telefono, f.email, tr(lang, 'bid.d.sign.license', f.licencia),
    f.seguro ? tr(lang, 'bid.d.sign.insurance', f.seguro) : ''].filter(Boolean);
}
const saludo = (lang, contacto) => {
  const n = String(contacto || '').trim().split(/\s+/)[0];
  return n ? tr(lang, 'bid.d.hello', n) : tr(lang, 'bid.d.helloGen');
};
const lugar = (bid) => [bid.direccion, bid.ciudad, [bid.estadoUS, bid.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
export const nombresOficios = (bid, lang) => analizarAlcance(bid.alcance).relevantes
  .filter((r) => (bid.oficiosExcluidos || []).indexOf(r.key) < 0).map((r) => nombreOficio(r, lang));

/**
 * construirBorrador({tipo, lang, bid, ajustes, resumen, rfi}) -> { asunto, cuerpo, para }
 * `resumen` = resultado de calcularBid (solo se usan grupos y total de VENTA).
 */
export function construirBorrador({ tipo, lang = 'en', bid, ajustes, resumen, rfi = '' }) {
  const f = datosFirma(ajustes);
  const proyecto = o(bid.proyecto);
  const L = [saludo(lang, bid.contacto), ''];
  let asunto;
  if (tipo === 'intent') {
    asunto = tr(lang, 'bid.d.intent.subject', proyecto);
    L.push(tr(lang, 'bid.d.intent.p1', f.empresa, proyecto + (lugar(bid) ? ' (' + lugar(bid) + ')' : '')));
    const of = nombresOficios(bid, lang);
    if (of.length) L.push('', tr(lang, 'bid.d.intent.scope', of.join('; ')));
    const due = formatoFechaLimite(bid.fechaLimite);
    L.push('', due ? tr(lang, 'bid.d.intent.due', due) : tr(lang, 'bid.d.intent.noDue'), tr(lang, 'bid.d.intent.docs'));
  } else if (tipo === 'proposal') {
    asunto = tr(lang, 'bid.d.proposal.subject', proyecto);
    L.push(tr(lang, 'bid.d.proposal.p1', f.empresa, proyecto), '');
    L.push(tr(lang, 'bid.d.proposal.breakdown'));
    const total = resumen && resumen.total > 0 ? usdTxt(resumen.total) : MARCADOR;
    if (resumen && resumen.hayDesglose) {
      for (const g of resumen.grupos) L.push('- ' + (g.id === null ? tr(lang, 'bid.d.proposal.general') : g.nombre) + ': ' + usdTxt(g.precio));
    }
    L.push(tr(lang, 'bid.d.proposal.total') + ': ' + total);
    const of = nombresOficios(bid, lang);
    if (of.length) L.push('', tr(lang, 'bid.d.proposal.scope', of.join('; ')));
    const c = bid.calif || {};
    for (const [k, txt] of [['bid.d.proposal.incl', c.inclusiones], ['bid.d.proposal.excl', c.exclusiones], ['bid.d.proposal.assum', c.supuestos], ['bid.d.proposal.addenda', c.addenda]]) {
      if (!vacio(txt)) L.push('', tr(lang, k), String(txt).trim());
    }
    const dias = parseInt(c.validezDias) || (ajustes && ajustes.validezDias) || 30;
    L.push('', tr(lang, 'bid.d.proposal.valid', dias), tr(lang, 'bid.d.proposal.attach'));
  } else if (tipo === 'rfi') {
    asunto = tr(lang, 'bid.d.rfi.subject', proyecto);
    L.push(tr(lang, 'bid.d.rfi.p1', proyecto), '', o(rfi));
  } else throw new Error('tipo de borrador desconocido: ' + tipo);
  L.push('', ...firma(lang, f));
  return { asunto, cuerpo: L.join('\n'), para: String(bid.email || '').trim() };
}

// ---------- Marcadores y fugas ----------
export const contarMarcadores = (...textos) => textos.reduce((n, t) => n + (String(t ?? '').split(MARCADOR).length - 1), 0);
/** Palabras que NUNCA deben salir al cliente. */
export const RE_FUGA = /margen|margin|markup|costo interno|internal cost|ganancia|profit|overhead|contingenc/i;
export const hayFuga = (...textos) => RE_FUGA.test(textos.join('\n'));

/**
 * Razones por las que NO se puede abrir el correo / generar el PDF final. Vacío = permitido.
 * destino 'correo' | 'pdf'. Códigos: vencida, marcadores, fuga, margen, sinPrecio, sinAsignar, noCuadra.
 */
export function bloqueos({ destino = 'correo', tipo, asunto = '', cuerpo = '', textosCliente = [], vencida = false, confirmaVencida = false,
  confirmaMarcadores = false, resumen, confirmaMargenTxt = '' }) {
  const r = [];
  if (vencida && !confirmaVencida) r.push('vencida');
  if (destino === 'correo' && contarMarcadores(asunto, cuerpo) > 0 && !confirmaMarcadores) r.push('marcadores');
  if (hayFuga(asunto, cuerpo, ...textosCliente)) r.push('fuga');
  if (tipo === 'proposal') {
    if (!resumen || !(resumen.total > 0)) r.push('sinPrecio');
    else {
      if (resumen.sinAsignar > 0) r.push('sinAsignar');
      if (!resumen.cuadra) r.push('noCuadra');
      if (!puedeGenerarPdf(resumen.margenBp, resumen.pisoBp, confirmaMargenTxt).ok) r.push('margen');
    }
  }
  return r;
}

// ---------- mailto ----------
/** mailto con asunto y cuerpo precargados (saltos de línea CRLF, encodeURIComponent). */
export function armarMailto({ para = '', asunto = '', cuerpo = '' }) {
  const enc = (s) => encodeURIComponent(String(s).replace(/\r?\n/g, '\r\n'));
  return 'mailto:' + encodeURIComponent(String(para).trim()).replace(/%40/g, '@') + '?subject=' + enc(asunto) + '&body=' + enc(cuerpo);
}
export const mailtoLargo = (href) => href.length > MAILTO_AVISO_LARGO;
