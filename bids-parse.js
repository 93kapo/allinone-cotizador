// bids-parse.js - Parser heurístico PURO de invitaciones a licitar (texto pegado de página/correo).
// Regla: lo que no se pueda extraer queda '' (nunca se inventa). Sin DOM, sin red.

const NBSP = /[   ]/g;
export const limpiar = (s) => String(s ?? '').replace(NBSP, ' ').replace(/\r\n?/g, '\n');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const soloEspacios = (s) => s.replace(/[ \t]+/g, ' ').trim();

/** Línea que parece "Etiqueta: valor" (fin de un bloque multilínea). */
const ES_ETIQUETA = /^\s*[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9 /&.()'#-]{1,40}:\s*(\S.*)?$/;

function lineasDe(texto) { return limpiar(texto).split('\n'); }

/** Valor de la primera línea "etiqueta: valor". Si el valor está vacío, usa la siguiente línea no vacía. */
function valor(lineas, etiquetas) {
  const re = new RegExp('^\\s*(?:' + etiquetas.map(esc).join('|') + ')\\s*:\\s*(.*)$', 'i');
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(re);
    if (!m) continue;
    let v = soloEspacios(m[1]);
    if (!v) {
      for (let j = i + 1; j < lineas.length; j++) {
        if (!lineas[j].trim()) continue;
        if (!ES_ETIQUETA.test(lineas[j])) v = soloEspacios(lineas[j]);
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
    const out = [];
    if (soloEspacios(m[1] || '')) out.push(soloEspacios(m[1]));
    for (let j = i + 1; j < lineas.length; j++) {
      const l = lineas[j];
      if (!l.trim()) { if (out.length) break; else continue; }
      if (ES_ETIQUETA.test(l)) break;
      out.push(soloEspacios(l));
    }
    if (out.length) return out;
  }
  return [];
}

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
  return soloEspacios(l.replace(/^\s*(?:[-*•·▪‣]|\d{1,2}[.)])\s+/, '').replace(/\s*[:\-–]?\s*\$\s?[\d,]+(?:\.\d{2})?\s*$/, ''));
}

/** Analiza el texto pegado. Devuelve todos los campos ('' si no se halló) + lista `encontrados`. */
export function parsearInvitacion(texto) {
  const lineas = lineasDe(texto);
  const r = { proyecto: '', gc: '', contacto: '', telefono: '', email: '', direccion: '', ciudad: '', estadoUS: '', zip: '',
    fechaLimite: '', inicioEst: '', finEst: '', alcance: '', breakoutsTexto: '', breakouts: [], encontrados: [] };

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
  const me = limpiar(texto).match(RE_EMAIL);
  r.email = me ? me[0] : '';

  // Dirección: etiqueta; si la línea no trae ZIP, se une con la siguiente.
  const idxDir = lineas.findIndex((l) => new RegExp('^\\s*(?:' + ETQ.dir.map(esc).join('|') + ')\\s*:', 'i').test(l));
  let vd = valor(lineas, ETQ.dir);
  if (vd && !/\d{5}/.test(vd) && idxDir >= 0) {
    const sig = lineas[idxDir + 1];
    if (sig && sig.trim() && !ES_ETIQUETA.test(sig) && /\d{5}/.test(sig) && soloEspacios(lineas[idxDir]).replace(/^[^:]*:/, '').trim()) vd += ', ' + soloEspacios(sig);
  }
  Object.assign(r, parseDireccion(vd));

  r.fechaLimite = parseFechaLimite(valor(lineas, ETQ.limite));
  r.inicioEst = soloFecha(valor(lineas, ETQ.inicio));
  r.finEst = soloFecha(valor(lineas, ETQ.fin));
  r.alcance = bloque(lineas, ETQ.alcance).join('\n');

  const bo = bloque(lineas, ETQ.breakout);
  r.breakoutsTexto = bo.join('\n');
  r.breakouts = bo.map(limpiarBreakout).filter((x) => x && !/^(grand |gran )?total( general| bid)?\s*:?\s*(\$.*)?$/i.test(x));

  r.encontrados = ['proyecto', 'gc', 'contacto', 'telefono', 'email', 'direccion', 'ciudad', 'estadoUS', 'zip', 'fechaLimite', 'inicioEst', 'finEst', 'alcance']
    .filter((k) => r[k]);
  if (r.breakouts.length) r.encontrados.push('breakouts');
  return r;
}
