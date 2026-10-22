// bids-parse.js - Parser heurístico PURO de invitaciones a licitar (texto pegado de página/correo).
// Regla: lo que no se pueda extraer queda '' (nunca se inventa). Sin DOM, sin red.

const NBSP = /[   ]/g;
export const limpiar = (s) => String(s ?? '').replace(NBSP, ' ').replace(/\r\n?/g, '\n');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const soloEspacios = (s) => s.replace(/[ \t]+/g, ' ').trim();

/** Línea que parece "Etiqueta: valor" (fin de un bloque multilínea). */
const ES_ETIQUETA = /^\s*[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9 /&.()'#-]{1,40}:\s*(\S.*)?$/;

/** Ruido de interfaz de la página (botones, enlaces) que se ignora por completo. */
const RUIDO = /^\s*(?:OPEN PLAN ROOM|VIEW MAP|View More|Plan Room|Try Takeoff for Free|NO INFORMATION PROVIDED)\s*$/i;
/** Etiquetas conocidas que pueden venir SOLAS en su línea (formato "etiqueta / valor en la línea siguiente"). */
const ETQ_SUELTAS = ['Project', 'Pre-Bid Meeting', 'Project Status', 'Architect', 'Owner', 'Fax', 'City & State', 'City and State', 'Ciudad y estado', 'City', 'State', 'Zip', 'Zip Code', 'Postal Code', 'Código postal', 'Project Additional Information', 'Email', 'E-mail'];

function lineasDe(texto) { return limpiar(texto).split('\n').filter((l) => !RUIDO.test(l)); }

/** "Etiqueta: valor" o "Etiqueta" sola en la línea (el valor irá en la siguiente). */
const reEtq = (etiquetas) => new RegExp('^\\s*(?:' + etiquetas.map(esc).join('|') + ')\\s*(?::\\s*(.*))?$', 'i');
let RE_SUELTA = null;
/** ¿La línea es una etiqueta (con ":" o una etiqueta conocida sola)? Nunca se toma como valor. */
function esEtiqueta(l) {
  if (ES_ETIQUETA.test(l)) return true;
  RE_SUELTA ||= reEtq([...ETQ_SUELTAS, ...ETQ.gc, ...ETQ.contacto, ...ETQ.tel, ...ETQ.dir, ...ETQ.limite, ...ETQ.inicio, ...ETQ.fin]);
  return RE_SUELTA.test(l);
}

/** Valor de la primera línea "etiqueta: valor". Si el valor está vacío, usa la siguiente línea no vacía. */
function valor(lineas, etiquetas) {
  const re = reEtq(etiquetas);
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(re);
    if (!m) continue;
    let v = soloEspacios(m[1] || '');
    if (!v) {
      for (let j = i + 1; j < lineas.length; j++) {
        if (!lineas[j].trim()) continue;
        if (!esEtiqueta(lineas[j])) v = soloEspacios(lineas[j]);
        break;
      }
    }
    if (v) return v;
  }
  return '';
}

/** Bloque multilínea tras una etiqueta; termina en línea vacía o en otra etiqueta. */
function bloque(lineas, etiquetas) {
  const re = new RegExp('^\\s*(?:' + etiquetas.map(esc).join('|') + ')\\s*:?\\s*(.*)$', 'i');
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(re);
    if (!m) continue;
    // Etiqueta sola SIN ":" (formato de la página): el bloque abarca párrafos separados por líneas vacías
    // y termina en otra etiqueta o en la introducción del desglose de costos.
    const larga = !/:/.test(lineas[i]) && !soloEspacios(m[1] || '');
    const out = [];
    if (soloEspacios(m[1] || '')) out.push(soloEspacios(m[1]));
    for (let j = i + 1; j < lineas.length; j++) {
      const l = lineas[j];
      if (!l.trim()) { if (!out.length) continue; if (larga) { if (out[out.length - 1] !== '') out.push(''); continue; } break; }
      if (ES_ETIQUETA.test(l) || (larga && (RE_INTRO_BREAKOUT.test(l) || esEtiqueta(l)))) break;
      out.push(soloEspacios(l));
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    if (out.length) return out;
  }
  return [];
}

const RE_INTRO_BREAKOUT = /^\s*please\s+provide\s+the\s+following\s+cost\s+break-?outs?\b/i;
const pad = (n) => String(n).padStart(2, '0');
/** M-D-YYYY o M/D/YYYY -> 'YYYY-MM-DD' si es una fecha de calendario real; si no, ''. */
export function fechaUSaISO(m, d, y) {
  m = +m; d = +d; y = +y;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!(m >= 1 && m <= 12) || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2200) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}
const RE_FECHA = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;
const RE_HORA = /(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\b/;
function soloFecha(v) { const m = v && v.match(RE_FECHA); return m ? fechaUSaISO(m[1], m[2], m[3]) : ''; }
/** Fecha límite -> 'YYYY-MM-DDTHH:mm' (hora local del sitio), o 'YYYY-MM-DD' si no trae hora. */
export function parseFechaLimite(v) {
  const m = v && v.match(RE_FECHA);
  if (!m) return '';
  const f = fechaUSaISO(m[1], m[2], m[3]);
  if (!f) return '';
  const resto = v.slice(m.index + m[0].length);
  const h = resto.match(RE_HORA);
  if (!h) return f;
  let hh = +h[1]; const mm = h[2] ? +h[2] : 0;
  if (hh < 1 || hh > 12 || mm > 59) return f;
  const pm = /p/i.test(h[3]);
  if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12;
  return `${f}T${pad(hh)}:${pad(mm)}`;
}

export const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
export const RE_TEL = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?:\s*(?:x|ext\.?|#)\s*\d{1,6})?/i;

/** "5801 SW 75th Street, Gainesville FL 32608" -> { direccion, ciudad, estadoUS, zip } (lo no claro queda ''). */
export function parseDireccion(v) {
  const out = { direccion: '', ciudad: '', estadoUS: '', zip: '' };
  v = soloEspacios(String(v || ''));
  if (!v) return out;
  const m = v.match(/^(.*?)[,\s]+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/);
  if (!m) { out.direccion = v; return out; }
  out.estadoUS = m[2]; out.zip = m[3];
  const resto = m[1].replace(/[,\s]+$/, '');
  const k = resto.lastIndexOf(',');
  if (k >= 0) { out.direccion = resto.slice(0, k).trim(); out.ciudad = resto.slice(k + 1).trim(); }
  else out.direccion = resto; // sin coma no se adivina la ciudad
  return out;
}

const ETQ = {
  gc: ['General Contractor', 'GC', 'Contractor', 'Company', 'Contratista general', 'Contratista', 'Empresa'],
  contacto: ['Bid Manager', 'Preconstruction Manager', 'Project Manager', 'Manager', 'Bid Contact', 'Contact Name', 'Contact', 'Estimator', 'Contacto', 'Gerente'],
  tel: ['Phone', 'Telephone', 'Tel', 'Office', 'Contact Phone', 'Cell', 'Mobile', 'Teléfono', 'Telefono'],
  dir: ['Project Address', 'Site Address', 'Job Site', 'Jobsite', 'Address', 'Location', 'Dirección', 'Direccion'],
  limite: ['Due Date', 'Bid Date', 'Bids Due', 'Bid Due Date', 'Submission Deadline', 'Fecha límite', 'Fecha limite', 'Fecha de entrega'],
  inicio: ['Estimated Start Date', 'Est. Start Date', 'Estimated Start', 'Project Start Date', 'Start Date', 'Inicio estimado'],
  fin: ['Estimated End Date', 'Est. End Date', 'Estimated Finish Date', 'Estimated Finish', 'Estimated Completion Date', 'Completion Date', 'End Date', 'Fin estimado'],
  alcance: ['Scope of Work', 'Project Description', 'Description', 'Scope', 'Trades', 'Bid Packages', 'Work Included', 'Descripción', 'Descripcion', 'Alcance'],
  breakout: ['Cost Breakout', 'Cost Breakouts', 'Breakouts', 'Breakout'],
};

/** Quita viñetas/numeración y montos al final de una línea de breakout. */
function limpiarBreakout(l) {
  return soloEspacios(l.replace(/^\s*(?:[-*•·▪‣]|\d{1,2}[.)])\s+/, '').replace(/\s[-–]\s+(?:This is to|This includes|To include|Includes?)\b.*$/i, '').replace(/\s*[:\-–]?\s*\$\s?[\d,]+(?:\.\d{2})?\s*$/, ''));
}

/** Analiza el texto pegado. Devuelve todos los campos ('' si no se halló) + lista `encontrados`. */
export function parsearInvitacion(texto) {
  const lineas = lineasDe(texto);
  const r = { proyecto: '', gc: '', contacto: '', telefono: '', email: '', direccion: '', ciudad: '', estadoUS: '', zip: '',
    fechaLimite: '', inicioEst: '', finEst: '', alcance: '', breakoutsTexto: '', breakoutsNota: '', breakouts: [], telefonoContacto: '', encontrados: [] };

  // Proyecto: texto tras "BID PROJECT |" (misma línea) o la línea siguiente.
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/BID\s+PROJECT\s*[|:]?\s*(.*)$/i);
    if (!m) continue;
    let v = soloEspacios(m[1]);
    if (!v) { const sig = lineas.slice(i + 1).find((x) => x.trim()); v = sig ? soloEspacios(sig) : ''; }
    r.proyecto = v; break;
  }
  r.gc = valor(lineas, ETQ.gc);
  r.contacto = valor(lineas, ETQ.contacto);

  // Teléfono: primero el que está bajo una etiqueta; si no, el primero del texto.
  const vt = valor(lineas, ETQ.tel);
  const mt = (vt && vt.match(RE_TEL)) || null;
  r.telefono = mt ? soloEspacios(mt[0]) : '';
  // Teléfono del contacto en texto libre: "...contact Alex Contact at 555-010-0200 or at ...".
  const mc = limpiar(texto).match(new RegExp('contact\\b[^.\\n]{0,60}?\\bat\\s+(' + RE_TEL.source + ')', 'i'));
  r.telefonoContacto = mc ? soloEspacios(mc[1]) : '';
  if (!r.telefono && r.telefonoContacto) r.telefono = r.telefonoContacto;
  const me = limpiar(texto).match(RE_EMAIL);
  r.email = me ? me[0] : '';

  // Dirección: etiqueta; si la línea no trae ZIP, se une con la siguiente.
  const idxDir = lineas.findIndex((l) => reEtq(ETQ.dir).test(l));
  let vd = valor(lineas, ETQ.dir);
  if (vd && !/\d{5}/.test(vd) && idxDir >= 0) {
    const sig = lineas[idxDir + 1];
    if (sig && sig.trim() && !ES_ETIQUETA.test(sig) && /\d{5}/.test(sig) && soloEspacios(lineas[idxDir]).replace(/^[^:]*:?/, '').trim()) vd += ', ' + soloEspacios(sig);
  }
  Object.assign(r, parseDireccion(vd));
  // Formato de la página: "City & State : Gainesville,FL" y "Zip: 32608" como campos aparte.
  if (!r.ciudad || !r.estadoUS) {
    const cs = soloEspacios(valor(lineas, ['City & State', 'City and State', 'Ciudad y estado'])).match(/^(.*?)[,\s]+([A-Za-z]{2})$/);
    if (cs) { if (!r.ciudad) r.ciudad = cs[1].trim(); if (!r.estadoUS) r.estadoUS = cs[2].toUpperCase(); }
  }
  if (!r.zip) { const mz = valor(lineas, ['Zip', 'Zip Code', 'Postal Code', 'Código postal']).match(/^\d{5}(?:-\d{4})?$/); if (mz) r.zip = mz[0].slice(0, 5); }

  r.fechaLimite = parseFechaLimite(valor(lineas, ETQ.limite));
  r.inicioEst = soloFecha(valor(lineas, ETQ.inicio));
  r.finEst = soloFecha(valor(lineas, ETQ.fin));
  // Texto libre: "Estimated start date of 2/5/2027 with a completion date of 2/29/2028."
  const plano = limpiar(texto);
  if (!r.inicioEst) { const m = plano.match(/start\s+date\s+(?:of|is|:)?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/i); if (m) r.inicioEst = soloFecha(m[1]); }
  if (!r.finEst) { const m = plano.match(/(?:completion|end|finish)\s+date\s+(?:of|is|:)?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/i); if (m) r.finEst = soloFecha(m[1]); }
  r.alcance = bloque(lineas, ETQ.alcance).join('\n');

  let bo = bloque(lineas, ETQ.breakout);
  if (!bo.length) {
    // Sin etiqueta: "Please provide the following cost breakout ..." + lista + "Please also provide a total ...".
    const k = lineas.findIndex((l) => RE_INTRO_BREAKOUT.test(l));
    if (k >= 0) {
      const nota = [soloEspacios(lineas[k])];
      let j = k + 1;
      while (j < lineas.length && !lineas[j].trim()) j++;
      while (j < lineas.length && lineas[j].trim()) { bo.push(soloEspacios(lineas[j])); j++; }
      while (j < lineas.length && !lineas[j].trim()) j++;
      if (/^please\s+also\s+provide\s+a\s+total/i.test(lineas[j] || '')) nota.push(soloEspacios(lineas[j]));
      r.breakoutsNota = nota.join('\n');
    }
  }
  r.breakoutsTexto = bo.join('\n');
  r.breakouts = bo.map(limpiarBreakout).filter((x) => x && !/^(grand |gran )?total( general| bid)?\s*:?\s*(\$.*)?$/i.test(x));

  r.encontrados = ['proyecto', 'gc', 'contacto', 'telefono', 'email', 'direccion', 'ciudad', 'estadoUS', 'zip', 'fechaLimite', 'inicioEst', 'finEst', 'alcance']
    .filter((k) => r[k]);
  if (r.breakouts.length) r.encontrados.push('breakouts');
  return r;
}
