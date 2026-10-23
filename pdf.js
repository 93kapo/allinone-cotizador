// pdf.js - Generación de PDF con jsPDF (fuentes estándar: cubren Latin-1 -> á é í ó ú ñ ¿ ¡).
// OJO: evitar caracteres fuera de WinAnsi (p.ej. flechas, ≥, comillas tipográficas).
import { tr } from './i18n.js';
import { usd, cargarScript, JSPDF_URL, urlADataUrl, num, pct1 } from './util.js';
import { montosHitos, anticipoExcede10, esPre1978, markupPctReal } from './engine.js';
import { formatoFechaLimite, lineaAMotor } from './bids-calc.js';
import { oficiosCotizados } from './bids-drafts.js';
import * as PM from './pintura-motor.js';

const TEAL = [56, 192, 217], SLATE = [78, 124, 133], INK = [18, 51, 58], GRAY = [90, 100, 105];

export async function nuevoDoc() {
  await cargarScript(JSPDF_URL);
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: 'mm', format: 'letter', compress: true });
}

export class Cursor {
  constructor(doc, onPage) { this.doc = doc; this.y = 18; this.m = 16; this.W = doc.internal.pageSize.getWidth(); this.H = doc.internal.pageSize.getHeight(); this.onPage = onPage; }
  get w() { return this.W - 2 * this.m; }
  need(h) { if (this.y + h > this.H - 18) { this.doc.addPage(); this.y = 18; this.onPage?.(); } }
  text(str, { size = 10, bold = false, color = INK, indent = 0, gap = 1.6, align = 'left', width } = {}) {
    const d = this.doc; d.setFont('helvetica', bold ? 'bold' : 'normal'); d.setFontSize(size); d.setTextColor(...color);
    const lines = d.splitTextToSize(String(str), (width || this.w) - indent);
    const lh = size * 0.40;
    for (const l of lines) {
      this.need(lh + 1);
      const x = align === 'right' ? this.m + (width || this.w) : this.m + indent;
      d.text(l, x, this.y, { align });
      this.y += lh;
    }
    this.y += gap;
  }
  h2(str) { this.need(14); this.y += 2; this.text(str, { size: 12, bold: true, color: SLATE, gap: 1 }); this.rule(); }
  rule(color = TEAL) { this.doc.setDrawColor(...color); this.doc.setLineWidth(0.4); this.doc.line(this.m, this.y - 2.5, this.W - this.m, this.y - 2.5); this.y += 3.5; }
  row(cols, { bold = false, size = 10, color = INK } = {}) {
    // cols: [{t, w, align}]
    const d = this.doc; d.setFont('helvetica', bold ? 'bold' : 'normal'); d.setFontSize(size); d.setTextColor(...color);
    const split = cols.map((c) => d.splitTextToSize(String(c.t), c.w - 2));
    const n = Math.max(...split.map((s) => s.length)), lh = size * 0.40;
    this.need(n * lh + 2);
    let x = this.m;
    cols.forEach((c, i) => {
      split[i].forEach((l, k) => d.text(l, c.align === 'right' ? x + c.w - 1 : x, this.y + k * lh, { align: c.align === 'right' ? 'right' : 'left' }));
      x += c.w;
    });
    this.y += n * lh + 1.8;
  }
}

function nombreLinea(l, cat, lang) {
  if (l.personalizada) return l.personalizada.nombre || tr(lang, 'pdf.custom');
  const p = cat.partidas.find((x) => x.id === l.partidaId);
  if (!p) return l.partidaId;
  return lang === 'en' ? (p.nameEn || p.nombre) : p.nombre;
}
const etiquetaCuarto = (q, id) => (q.cuartos || []).find((c) => c.id === id)?.nombre || '';

export function encabezado(doc, c, logo, aj, titulo, subt) {
  const e = aj.empresa;
  if (logo) doc.addImage(logo, 'PNG', c.m - 4, 8, 34, 34);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK);
  doc.text(e.nombre, c.W - c.m, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
  let y = 21;
  for (const l of [e.direccion, e.telefono, e.email, e.licencia ? 'Lic. ' + e.licencia : '']) if (l) { doc.text(l, c.W - c.m, y, { align: 'right' }); y += 4.2; }
  c.y = 47;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...SLATE);
  doc.text(titulo, c.m, c.y); c.y += 6;
  if (subt) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY); doc.text(subt, c.m, c.y); c.y += 5; }
  c.rule();
}
export function pie(doc, texto) {
  const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(texto, 16, H - 9); doc.text(`${i} / ${n}`, W - 16, H - 9, { align: 'right' });
  }
}
const fmtFecha = (d, lang) => d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** PDF AL CLIENTE. No contiene costos, margen ni markup. */
export async function generarPdfCliente(q, calc, aj, cat, lang = 'en') {
  const doc = await nuevoDoc();
  const logo = await urlADataUrl('icons/logo-pdf.png').catch(() => null);
  const c = new Cursor(doc);
  const fecha = new Date(q.creado || Date.now());
  const vence = new Date(fecha.getTime() + (q.validezDias ?? aj.validezDias) * 86400000);
  encabezado(doc, c, logo, aj, tr(lang, 'pdf.proposal'), `${tr(lang, 'pdf.number')} ${q.numero || ''}   |   ${tr(lang, 'pdf.date')}: ${fmtFecha(fecha, lang)}`);
  const cl = q.cliente || {};
  c.text(tr(lang, 'pdf.preparedFor'), { size: 9, color: GRAY, gap: 0.5 });
  c.text(cl.nombre || '-', { size: 12, bold: true, gap: 0.5 });
  for (const l of [cl.direccion, cl.telefono, cl.email]) if (l) c.text(l, { gap: 0.3 });
  c.y += 3;

  c.h2(tr(lang, 'pdf.scope'));
  const wP = 34, wD = c.w - wP;
  const esPintura = q.tipo === 'pintura' && !!q.pintura;
  if (esPintura) {
    // Pintura: el cliente ve el trabajo incluido (sin horas, tarifas ni costos) y un solo total.
    for (const x of alcancePintura(q, lang)) c.text('- ' + pdfTxt(x), { gap: 0.8 });
  } else c.row([{ t: tr(lang, 'pdf.item'), w: wD }, { t: tr(lang, 'pdf.price'), w: wP, align: 'right' }], { bold: true, size: 9, color: GRAY });
  (esPintura ? [] : (q.lineas || [])).forEach((l, i) => {
    const r = calc.lineas[i];
    const room = l.cuartoId ? etiquetaCuarto(q, l.cuartoId) : '';
    const cant = l.personalizada ? '' : ` (${num(l.cantidad, 1)} ${l.unidad || ''})`;
    let desc = nombreLinea(l, cat, lang) + cant + (room ? ' - ' + room : '');
    if (l.nota) desc += '\n' + l.nota;
    c.row([{ t: desc, w: wD }, { t: usd(r.precio), w: wP, align: 'right' }]);
  });
  c.rule(SLATE);
  c.row([{ t: tr(lang, 'pdf.total'), w: wD }, { t: usd(calc.totales.precio), w: wP, align: 'right' }], { bold: true, size: 13 });
  c.y += 2;

  c.h2(tr(lang, 'pdf.payment'));
  const hitos = q.hitosBp || aj.hitosBp;
  const nombres = (q.hitosNombres || aj.hitosNombres)[lang] || aj.hitosNombres[lang];
  const montos = montosHitos(calc.totales.precio, hitos);
  hitos.forEach((bp, i) => c.row([{ t: `${nombres[i] || ''} (${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%)`, w: wD }, { t: usd(montos[i]), w: wP, align: 'right' }]));
  c.y += 1;
  c.text(tr(lang, 'pdf.validity', fmtFecha(vence, lang), q.validezDias ?? aj.validezDias), { size: 9, color: GRAY });

  c.h2(tr(lang, 'pdf.warranty'));
  c.text((q.garantia && q.garantia[lang]) || aj.garantia[lang]);
  c.h2(tr(lang, 'pdf.changeOrders'));
  c.text((q.changeOrders && q.changeOrders[lang]) || aj.changeOrders[lang]);
  c.h2(tr(lang, 'pdf.exclusions'));
  c.text((q.exclusiones && q.exclusiones[lang]) || aj.exclusiones[lang]);
  if (esPre1978(q.cliente?.anio) || ['si', 'nose'].includes(q.pintura?.antes1978)) { c.h2(tr(lang, 'pdf.epa')); c.text(aj.avisoEpa[lang]); }

  c.h2(tr(lang, 'pdf.legal'));
  if (calc.totales.precio > 250000) {
    // Aviso de gravamen FL 713.015: MAYÚSCULAS, negrita, 12 pt (verificar formato vigente con abogado).
    c.text(aj.avisoGravamen[lang].toUpperCase(), { size: 12, bold: true, gap: 3 });
  }
  c.text(aj.avisoRecovery[lang], { size: 9 });

  c.need(40); c.y += 8;
  const half = c.w / 2 - 6;
  doc.setDrawColor(...INK); doc.setLineWidth(0.3);
  doc.line(c.m, c.y, c.m + half, c.y); doc.line(c.m + half + 12, c.y, c.m + 2 * half + 12, c.y);
  c.y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(tr(lang, 'pdf.signClient'), c.m, c.y); doc.text(tr(lang, 'pdf.signCompany'), c.m + half + 12, c.y);
  pie(doc, `${aj.empresa.nombre}  |  ${q.numero || ''}`);
  return doc;
}

/** RESUMEN INTERNO (solo para ellos): costos, margen, markup. Siempre en español. */
export async function generarPdfInterno(q, calc, aj, cat) {
  const lang = 'es';
  const doc = await nuevoDoc();
  const c = new Cursor(doc);
  const t = calc.totales;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(180, 30, 30);
  doc.text(tr(lang, 'pdf.internalTitle'), c.m, c.y); c.y += 6;
  c.text(`${aj.empresa.nombre} - ${q.numero || ''} - ${q.cliente?.nombre || ''}`, { size: 9, color: GRAY });
  c.rule();
  const wV = 34, wD = c.w - wV;
  const fila = (k, v, o) => c.row([{ t: k, w: wD }, { t: v, w: wV, align: 'right' }], o);
  c.h2(tr(lang, 'pdf.byLine'));
  (q.lineas || []).forEach((l, i) => {
    const r = calc.lineas[i], x = r.totales;
    fila(`${nombreLinea(l, cat, lang)} (${l.personalizada ? '' : num(l.cantidad, 1) + ' ' + (l.unidad || '')})`, usd(r.precio), { bold: true });
    c.text(`${tr(lang, 'pdf.materials')} ${usd(x.materiales)} + ${tr(lang, 'pdf.salesTax')} ${usd(x.impuestoMat)} | ${tr(lang, 'pdf.labor')} ${usd(x.manoObra)} (${num(x.horas, 1)} h) | ${tr(lang, 'pdf.subs')} ${usd(x.subs)} | ${tr(lang, 'pdf.other')} ${usd(x.otros)}`, { size: 8, color: GRAY, indent: 4 });
  });
  c.h2(tr(lang, 'pdf.costStructure'));
  fila(tr(lang, 'pdf.materials'), usd(t.materiales));
  fila(`${tr(lang, 'pdf.salesTax')} (${(aj.impuestoVentasBp / 100).toFixed(2)}%)`, usd(t.impuestoMat));
  fila(`${tr(lang, 'pdf.labor')} (${num(t.horas, 1)} h, ${lang === 'es' ? 'cargas' : 'burden'} ${(aj.burdenBp / 100).toFixed(0)}%)`, usd(t.manoObra));
  fila(tr(lang, 'pdf.subs'), usd(t.subs));
  fila(tr(lang, 'pdf.other'), usd(t.otros));
  fila(tr(lang, 'pdf.directs'), usd(t.directos), { bold: true });
  fila(`${tr(lang, 'pdf.contingency')} (${(calc.contingenciaBp / 100).toFixed(1)}%)`, usd(t.contingencia));
  fila(`${tr(lang, 'pdf.overhead')} (${(aj.overheadBp / 100).toFixed(1)}%)`, usd(t.overhead));
  fila(`${tr(lang, 'pdf.warrantyRes')} (${(aj.garantiaBp / 100).toFixed(1)}%)`, usd(t.garantia));
  fila(tr(lang, 'pdf.totalCost'), usd(t.costoTotal), { bold: true });
  c.rule(SLATE);
  fila(tr(lang, 'pdf.price'), usd(t.precio), { bold: true, size: 12 });
  fila(tr(lang, 'pdf.margin'), `${(t.margenBp / 100).toFixed(1)}%`, { bold: true });
  fila(tr(lang, 'pdf.markup'), `${t.markupPct.toFixed(1)}%`);
  fila(tr(lang, 'pdf.profit'), usd(t.ganancia), { bold: true });
  fila(`${tr(lang, 'pdf.net')} (${(aj.impuestoNetoBp / 100).toFixed(0)}%) *`, usd(t.gananciaNeta));
  c.text(tr(lang, 'pdf.netNote'), { size: 8, color: GRAY });
  if (t.margenBp < aj.margenPisoBp) c.text(tr(lang, 'pdf.belowFloor', (aj.margenPisoBp / 100).toFixed(0)), { size: 10, bold: true, color: [180, 30, 30] });
  c.text(tr(lang, 'pdf.snapshot', q.snapshot?.fecha?.slice(0, 10) || ''), { size: 8, color: GRAY });
  if (q.tipo === 'pintura' && q.pintura) seccionPinturaInterna(c, q, calc);
  pie(doc, tr(lang, 'pdf.internalFooter'));
  return doc;
}

// ---------------- Pintura ----------------
const ctxPintura = (q) => ({ cuartos: q.cuartos || [], ajustes: q.snapshot?.ajustes || {}, itemsPlano: q.cantidades?.items || [] });
const n1 = (x) => num(x, 1);
/** Trabajo incluido para el CLIENTE (y el subcontratista): superficies, producto y manos. Nada de costos, horas ni tarifas. */
export function alcancePintura(q, lang) {
  const P = q.pintura, R = PM.calcular(P, ctxPintura(q)), out = [];
  if (P.alcance !== 'exterior') {
    const sup = [tr(lang, 'pint.pdf.sWalls'), P.interior?.techos ? tr(lang, 'pint.pdf.sCeilings') : '', P.interior?.trim ? tr(lang, 'pint.pdf.sTrim') : '', P.interior?.puertas ? tr(lang, 'pint.pdf.sDoors') : ''].filter(Boolean);
    out.push(tr(lang, 'pint.pdf.int', sup.join(', '), num(R.areas.paredesInt + (P.interior?.techos ? R.areas.techo : 0), 0)));
    if (R.productos.int.nombre) out.push(tr(lang, 'pint.pdf.product', R.productos.int.nombre, R.productos.int.manos));
  }
  if (P.alcance !== 'interior' && R.areas.extArea > 0) {
    out.push(tr(lang, 'pint.pdf.ext', num(R.areas.extArea, 0)));
    if (R.productos.ext.nombre) out.push(tr(lang, 'pint.pdf.product', R.productos.ext.nombre, R.productos.ext.manos + (R.productos.ext.manosPrimer ? ' + primer' : '')));
  }
  out.push(tr(lang, 'pint.pdf.prep'), tr(lang, 'pint.pdf.materialsIncluded'));
  return out;
}
/** Sección del resumen INTERNO para pintura (siempre en español). Todo lo estimado va marcado. */
function seccionPinturaInterna(c, q, calc) {
  const lang = 'es', P = q.pintura, R = PM.calcular(P, ctxPintura(q));
  const E = P.escenario === 'B' ? R.B : R.A, H = R.horas;
  const T = (x, o) => c.text(pdfTxt(x), { gap: 0.8, ...o });
  c.h2(tr(lang, 'pint.pdf.internalTitle'));
  T(tr(lang, 'pint.pdf.scenario', tr(lang, P.escenario === 'B' ? 'pint.b.short' : 'pint.a.short')), { bold: true });
  T(tr(lang, 'pint.range', n1(H.sinContingencia.minimo), n1(H.sinContingencia.maximo), n1(H.sinContingencia.probable)) + ' (' + tr(lang, 'pint.pdf.noCont') + ')');
  T(tr(lang, 'pint.range', n1(H.conContingencia.minimo), n1(H.conContingencia.maximo), n1(H.conContingencia.probable)) + ' (' + tr(lang, 'pint.pdf.withCont', H.contPct) + ')');
  const pl = P.escenario === 'B' ? R.planB : R.planA;
  if (!pl.incompleto) T(tr(lang, 'pint.c.equation', n1(pl.probable.horasHombre), pl.efectivas, pl.probable.diasTrabajo, pl.horasDia) + ' + ' + tr(lang, 'pint.pdf.waitDays', pl.probable.diasEspera));
  else T(tr(lang, 'pint.c.choosePeople'));
  if (P.escenario === 'A') {
    T(tr(lang, 'pint.a.pay', n1(R.A.horasAcordadas), usd(R.A.tarifaCents), usd(R.A.pago)));
    if (R.A.tarifaEfectivaCents != null) T(tr(lang, 'pint.a.effective', n1(H.sinContingencia.probable), usd(R.A.tarifaEfectivaCents)));
  } else {
    T(tr(lang, 'pint.b.cost', n1(R.B.horasTotales), usd(R.B.salarioH), pct1(R.B.cargas.bpEfectivo), usd(R.B.manoObra)));
  }
  if (R.equilibrio.tipo === 'horas') T(tr(lang, 'pint.a.breakeven', n1(R.equilibrio.horas)));
  for (const l of R.mat.lineas) T(`${l.nombre || '-'}: ${l.galones} gal x ${usd(l.precioCents)} = ${usd(l.costo)}`, { size: 9, color: GRAY });
  T(tr(lang, 'pint.pdf.reserve', usd(R.mat.reservaCents)), { size: 9, color: GRAY });
  T(tr(lang, 'pint.pdf.suggested', pct1(E.sug.minBp), pct1(E.sug.maxBp), tr(lang, `pint.g.${E.rentabilidad}`)));
  if (E.faltan.length) T(tr(lang, 'pint.pdf.missing', E.faltan.map((k) => tr(lang, `pint.missing.${k}`)).join(', ')), { bold: true, color: [180, 30, 30] });
  T(tr(lang, 'pint.pdf.estimatedLegend'), { size: 8, color: GRAY });
}

/** ORDEN DE TRABAJO para el subcontratista (BORRADOR que la persona revisa; la app no la envía). Solo escenario A. Sin precio al cliente ni ganancia. */
export async function generarPdfOrdenTrabajo(q, R, aj, lang = 'en') {
  const doc = await nuevoDoc();
  const logo = await urlADataUrl('icons/logo-pdf.png').catch(() => null);
  const c = new Cursor(doc);
  const P = q.pintura, A = R.A, T = (x, o) => c.text(pdfTxt(x), o);
  const fecha = new Date();
  encabezado(doc, c, logo, aj, pdfTxt(tr(lang, 'pint.ord.title')), `${tr(lang, 'pdf.number')} ${q.numero || ''}   |   ${tr(lang, 'pdf.date')}: ${fmtFecha(fecha, lang)}`);
  T(tr(lang, 'pint.ord.draft'), { bold: true, color: [180, 30, 30] });
  const sub = q.ordenTrabajo?.sub || tr(lang, 'pint.ord.fill');
  T(tr(lang, 'pint.ord.parties', aj.empresa?.nombre || '', sub), { gap: 2 });
  T(tr(lang, 'pint.ord.site', [q.cliente?.nombre, q.cliente?.direccion].filter(Boolean).join(' - ') || tr(lang, 'pint.ord.fill')), { gap: 2 });
  c.h2(tr(lang, 'pint.ord.scope'));
  for (const x of alcancePintura(q, lang)) T('- ' + x, { gap: 0.8 });
  T(tr(lang, 'pint.ord.materials'), { gap: 1 });
  const pl = R.planA;
  T(pl.incompleto ? tr(lang, 'pint.ord.timeTbd') : tr(lang, 'pint.ord.time', pl.probable.dias, pl.efectivas));
  c.h2(tr(lang, 'pint.ord.payment'));
  const wV = 40, wD = c.w - wV, fila = (k, v, o) => c.row([{ t: pdfTxt(k), w: wD }, { t: pdfTxt(v), w: wV, align: 'right' }], o);
  fila(tr(lang, 'pint.ord.hours'), `${n1(A.horasAcordadas)} h`);
  fila(tr(lang, 'pint.ord.rate'), `${usd(A.tarifaCents)} / h`);
  fila(tr(lang, 'pint.ord.fixed'), usd(A.pago), { bold: true, size: 12 });
  const ret = Math.round(A.pago * (P.retencionBp || 0) / 10000);
  fila(tr(lang, 'pint.ord.retention', (P.retencionBp || 0) / 100), usd(ret));
  fila(tr(lang, 'pint.ord.afterPunch'), usd(A.pago - ret));
  c.y += 1;
  T(tr(lang, 'pint.ord.fixedNote'), { size: 9, color: GRAY });
  c.h2(tr(lang, 'pint.ord.terms'));
  for (const k of ['changeOrders', 'punch', 'w9', 'insurance', 'tools', 'epa', 'cleanup']) {
    if (k === 'epa' && !(['si', 'nose'].includes(P.antes1978) || esPre1978(q.cliente?.anio))) continue;
    T('- ' + tr(lang, `pint.ord.t.${k}`), { gap: 0.8 });
  }
  if (q.ordenTrabajo?.notas) { c.h2(tr(lang, 'pint.ord.notes')); T(q.ordenTrabajo.notas); }
  T(tr(lang, 'pint.ord.lawyer'), { size: 9, bold: true, color: GRAY, gap: 2 });
  c.need(40); c.y += 8;
  const half = c.w / 2 - 6;
  doc.setDrawColor(...INK); doc.setLineWidth(0.3);
  doc.line(c.m, c.y, c.m + half, c.y); doc.line(c.m + half + 12, c.y, c.m + 2 * half + 12, c.y);
  c.y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(pdfTxt(tr(lang, 'pint.ord.signSub')), c.m, c.y); doc.text(pdfTxt(tr(lang, 'pint.ord.signCompany')), c.m + half + 12, c.y);
  pie(doc, pdfTxt(`${aj.empresa?.nombre || ''}  |  ${q.numero || ''}  |  ${tr(lang, 'pint.ord.draftShort')}`));
  return doc;
}

// ---------------- Licitaciones ----------------
/** Deja solo caracteres que jsPDF (fuentes estándar, WinAnsi) dibuja bien: guiones/comillas tipográficas -> ASCII. */
export function pdfTxt(x) {
  return String(x ?? '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2022\u00B7\u25AA\u2023]/g, '-').replace(/\u2026/g, '...').replace(/[^\n\u0020-\u007E\u00A1-\u00FF]/g, '?');
}

/** PDF de la PROPUESTA a la licitación. Sin costos, margen ni markup: solo precios de venta. res = calcularBid(bid). */
export async function generarPdfBid(bid, res, aj, lang = 'en') {
  const doc = await nuevoDoc();
  const logo = await urlADataUrl('icons/logo-pdf.png').catch(() => null);
  const c = new Cursor(doc);
  const T = (x) => pdfTxt(x);
  const hoy = new Date();
  encabezado(doc, c, logo, aj, tr(lang, 'bid.pdf.title'), `${tr(lang, 'pdf.date')}: ${fmtFecha(hoy, lang)}`);
  c.text(tr(lang, 'bid.pdf.submittedTo'), { size: 9, color: GRAY, gap: 0.5 });
  c.text(T(bid.gc || '-'), { size: 12, bold: true, gap: 0.5 });
  for (const l of [bid.contacto && `${tr(lang, 'bid.pdf.attn')} ${bid.contacto}`, bid.telefono, bid.email]) if (l) c.text(T(l), { gap: 0.3 });
  c.y += 3;
  c.text(tr(lang, 'bid.pdf.project'), { size: 9, color: GRAY, gap: 0.5 });
  c.text(T(bid.proyecto || '-'), { size: 12, bold: true, gap: 0.5 });
  const dir = [bid.direccion, bid.ciudad, [bid.estadoUS, bid.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (dir) c.text(T(dir), { gap: 0.3 });
  if (bid.fechaLimite) c.text(`${tr(lang, 'bid.pdf.due')}: ${formatoFechaLimite(bid.fechaLimite)}`, { size: 9, color: GRAY, gap: 0.3 });
  c.y += 3;

  const wP = 34, wD = c.w - wP;
  c.h2(tr(lang, res.hayDesglose ? 'bid.pdf.breakdown' : 'bid.pdf.price'));
  c.row([{ t: tr(lang, 'pdf.item'), w: wD }, { t: tr(lang, 'pdf.price'), w: wP, align: 'right' }], { bold: true, size: 9, color: GRAY });
  if (res.hayDesglose) for (const g of res.grupos) c.row([{ t: T(g.id === null ? tr(lang, 'bid.d.proposal.general') : g.nombre), w: wD }, { t: g.lineas ? usd(g.precio) : tr(lang, 'bid.d.proposal.nobid'), w: wP, align: 'right' }]);
  c.rule(SLATE);
  c.row([{ t: tr(lang, 'pdf.total'), w: wD }, { t: usd(res.total), w: wP, align: 'right' }], { bold: true, size: 13 });
  c.y += 2;

  const of = oficiosCotizados(bid, lang);
  if (of.length) { c.h2(tr(lang, 'bid.pdf.scope')); for (const x of of) c.text('- ' + T(x), { gap: 0.4 }); }
  const q = bid.calif || {};
  const bloques = [['bid.d.proposal.incl', q.inclusiones], ['bid.d.proposal.excl', q.exclusiones], ['bid.d.proposal.assum', q.supuestos], ['bid.d.proposal.addenda', q.addenda]]
    .filter(([, v]) => String(v ?? '').trim());
  if (bloques.length) c.h2(tr(lang, 'bid.pdf.qualifications'));
  for (const [k, v] of bloques) { c.text(tr(lang, k).replace(/:$/, ''), { bold: true, gap: 0.6 }); c.text(T(String(v).trim())); }
  c.y += 1;
  c.text(tr(lang, 'bid.d.proposal.valid', parseInt(q.validezDias) || aj.validezDias || 30), { size: 9, color: GRAY });

  c.need(22); c.y += 8;
  doc.setDrawColor(...INK); doc.setLineWidth(0.3);
  doc.line(c.m, c.y, c.m + 80, c.y);
  c.y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
  const e = aj.empresa || {};
  doc.text(T([e.firmante, e.nombre].filter(Boolean).join(' - ')), c.m, c.y);
  pie(doc, T(`${e.nombre || ''}  |  ${bid.proyecto || ''}`).slice(0, 110));
  return doc;
}

/** Resumen INTERNO de la licitación (costos y margen). Reutiliza generarPdfInterno; siempre en español. */
export async function generarPdfBidInterno(bid, res, aj) {
  const q = { numero: 'LIC', cliente: { nombre: pdfTxt(bid.proyecto) }, snapshot: bid.snapshot,
    lineas: res.lineas.map((x) => { const m = lineaAMotor(x.linea); if (m.personalizada && x.linea.nombre) m.personalizada.nombre = x.linea.nombre; return m; }) };
  return generarPdfInterno(q, res.calc, { ...bid.snapshot.ajustes, empresa: aj.empresa }, bid.snapshot.catalogo);
}
