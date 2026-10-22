// planos.js - visor de planos (PDF.js): calibrar escala, medir líneas/áreas, asignar a cuarto/partida.
// Los puntos se guardan en coordenadas de PÁGINA PDF (unidades del viewport a escala 1): sobreviven al zoom.
// El PDF se guarda SOLO localmente (IndexedDB). No hay lectura automática por IA.
import { h, clear, add, num, cargarScript, PDFJS_URL, PDFJS_WORKER, usd } from './util.js';
import { t } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { field, selectField, toast, sheet, aviso } from './ui.js';
import { parseLongitud, calibrarEscala, longitudPolilinea, areaPoligono, dist, formatoPiesPulgadas } from './engine.js';

let pdfjs;
async function cargarPdfJs() {
  if (pdfjs) return pdfjs;
  await cargarScript(PDFJS_URL);
  pdfjs = window.pdfjsLib;
  const txt = await (await fetch(PDFJS_WORKER)).text();
  pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
  return pdfjs;
}

export async function pantallaPlanos({ shell, id }) {
  if (!id) {
    const lista = await store.listarCotizaciones();
    return shell(t('nav.plans'), h('div', {}, h('h1', {}, t('nav.plans')), aviso('info', t('plans.dwgNote')), h('p', {}, t('plans.pickQuote')),
      lista.length ? lista.map((q) => h('a', { class: 'card item', href: `#/planos/${q.id}`, style: 'text-decoration:none;color:inherit' }, h('div', { class: 'main' }, h('b', {}, q.cliente?.nombre || q.numero), h('span', { class: 'sub' }, q.numero)), '›'))
        : h('div', { class: 'empty card' }, t('home.empty'))), '#/planos');
  }
  const q = await store.getCotizacion(id);
  if (!q) return shell(t('ui.error'), aviso('err', t('quote.notFound')), '#/planos');
  q.planos = q.planos || []; q.medidas = q.medidas || [];
  const guardar = () => store.saveCotizacion(q).catch((e) => toast(t('ui.error') + ': ' + e.message, 'err'));

  let plano = q.planos[0] || null, pdfDoc = null, pagina = 1, zoom = 1, modo = null, pts = [], viewport1 = null, realce = null, renderTask = null;
  const cv = h('canvas'), ov = h('canvas', { class: 'draw', 'aria-label': t('plans.canvasLabel') });
  const wrap = h('div', { class: 'planwrap' }, cv, ov);
  const info = h('div', { class: 'muted', role: 'status' });
  const lista = h('div');
  const tools = h('div', { class: 'tools' });

  const escalaActual = () => plano?.escalas?.[pagina] || null; // pies por unidad de página

  async function abrir() {
    if (!plano) return;
    try {
      info.textContent = t('ui.loading');
      const lib = await cargarPdfJs();
      const buf = await store.obtenerPlanoPdf(plano.id);
      if (!buf) { info.textContent = ''; wrap.replaceChildren(h('div', { class: 'empty' }, t('plans.missing'))); return; }
      pdfDoc = await lib.getDocument({ data: buf.slice(0) }).promise;
      wrap.replaceChildren(cv, ov); pagina = 1; await pintarPagina();
    } catch (e) { console.error(e); info.replaceChildren(aviso('err', t('plans.loadFail') + ' ' + e.message)); }
  }
  async function pintarPagina() {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pagina);
    viewport1 = page.getViewport({ scale: 1 });
    const disp = Math.max(280, (wrap.clientWidth || 320) - 2) * zoom;
    const esc = disp / viewport1.width, dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: esc * dpr });
    cv.width = vp.width; cv.height = vp.height; cv.style.width = disp + 'px'; cv.style.height = (viewport1.height * esc) + 'px';
    ov.width = Math.round(disp); ov.height = Math.round(viewport1.height * esc); ov.style.width = ov.width + 'px'; ov.style.height = ov.height + 'px';
    ov._esc = esc;
    renderTask?.cancel?.();
    renderTask = page.render({ canvasContext: cv.getContext('2d'), viewport: vp });
    try { await renderTask.promise; } catch (e) { if (e?.name !== 'RenderingCancelledException') throw e; }
    dibujar(); actualizarInfo();
  }
  function actualizarInfo() {
    const e = escalaActual();
    info.textContent = pdfDoc ? `${plano.nombre} · ${t('plans.page')} ${pagina}/${pdfDoc.numPages} · ${e ? t('plans.scaleSet') : t('plans.scaleMissing')}` : '';
  }
  const aPantalla = (p) => ({ x: p.x * ov._esc, y: p.y * ov._esc });
  function dibujar() {
    const g = ov.getContext('2d'); g.clearRect(0, 0, ov.width, ov.height);
    const trazo = (puntos, cerrar, color, ancho, relleno) => {
      if (!puntos.length) return;
      g.beginPath(); puntos.forEach((p, i) => { const s = aPantalla(p); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); });
      if (cerrar && puntos.length > 2) g.closePath();
      if (relleno && puntos.length > 2) { g.fillStyle = relleno; g.fill(); }
      g.strokeStyle = color; g.lineWidth = ancho; g.stroke();
      puntos.forEach((p) => { const s = aPantalla(p); g.beginPath(); g.arc(s.x, s.y, 5, 0, 7); g.fillStyle = color; g.fill(); });
    };
    for (const m of q.medidas.filter((x) => x.planoId === plano?.id && x.pagina === pagina)) {
      const sel = realce === m.id;
      trazo(m.pts, m.tipo === 'area', sel ? '#E11D48' : '#2aa5bc', sel ? 5 : 3, sel ? 'rgba(225,29,72,.25)' : m.tipo === 'area' ? 'rgba(56,192,217,.25)' : null);
      const c = aPantalla(m.pts[0]); g.font = '600 13px Poppins, sans-serif'; g.fillStyle = '#12333A';
      g.fillText(`${m.etiqueta || ''} ${num(m.valor, 1)}`, c.x + 8, c.y - 8);
    }
    if (pts.length) trazo(pts, modo === 'poligono', '#4E7C85', 3, modo === 'poligono' ? 'rgba(78,124,133,.2)' : null);
  }

  // Toques: se registra un punto si el gesto fue un TOQUE (sin arrastre) -> deja hacer scroll/pellizco libremente.
  let down = null;
  ov.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  ov.addEventListener('pointerup', (e) => {
    if (!down || !modo) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 10) return;
    const r = ov.getBoundingClientRect();
    pts.push({ x: (e.clientX - r.left) / ov._esc, y: (e.clientY - r.top) / ov._esc });
    if (modo === 'calibrar' && pts.length === 2) return pedirDistancia();
    dibujar(); herramientas();
  });
  ov.addEventListener('pointercancel', () => { down = null; });

  function pedirDistancia() {
    let txt = '';
    const sh = sheet(t('plans.calibrate'), h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('plans.calibrateHint')),
      field({ label: t('plans.realDistance'), placeholder: `12' 6"`, onInput: (v) => { txt = v; } }),
      h('button', { class: 'primary block', onclick: () => {
        const ft = parseLongitud(txt), esc = calibrarEscala(pts[0], pts[1], ft);
        if (!isFinite(esc)) return toast(t('plans.badDistance'), 'err');
        plano.escalas = plano.escalas || {}; plano.escalas[pagina] = esc; guardar();
        pts = []; modo = null; sh.close(); dibujar(); herramientas(); actualizarInfo(); toast(t('ui.saved'));
      } }, t('ui.save'))), () => { pts = []; modo = null; dibujar(); herramientas(); });
  }
  function terminar() {
    const esc = escalaActual();
    if (!esc) return toast(t('plans.needScale'), 'err');
    const area = modo === 'poligono';
    if (pts.length < (area ? 3 : 2)) return toast(t('plans.needPoints'), 'err');
    const valor = area ? areaPoligono(pts, esc) : longitudPolilinea(pts, esc);
    const m = { id: store.nuevoId(), planoId: plano.id, pagina, tipo: area ? 'area' : 'linea', pts: pts.map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) })), valor, etiqueta: '', asignado: null };
    pts = []; modo = null; q.medidas.push(m); guardar(); dibujar(); herramientas(); pintarLista(); editarMedida(m);
  }
  function editarMedida(m) {
    const cat = q.snapshot.catalogo;
    const opts = [['', t('plans.unassigned')], ...q.cuartos.map((c) => ['c:' + c.id, `${t('rooms.room')}: ${c.nombre}`]), ...cat.partidas.map((p) => ['p:' + p.id, p.nombre])];
    const sh = sheet(t('plans.measure'), h('div', { class: 'stack' },
      h('p', {}, h('b', {}, m.tipo === 'area' ? `${num(m.valor, 1)} ft²` : `${num(m.valor, 1)} lf (${formatoPiesPulgadas(m.valor)})`)),
      field({ label: t('plans.label'), value: m.etiqueta, onInput: (v) => { m.etiqueta = v; } }),
      selectField(t('plans.assignTo'), opts, m.asignado ? m.asignado.tipo + ':' + m.asignado.id : '', (v) => { m.asignado = v ? { tipo: v[0], id: v.slice(2) } : null; }),
      h('button', { class: 'primary block', onclick: () => { guardar(); sh.close(); dibujar(); pintarLista(); } }, t('ui.save'))));
  }
  function pintarLista() {
    clear(lista);
    const ms = q.medidas;
    if (!ms.length) { lista.append(h('div', { class: 'empty' }, t('plans.noMeasures'))); return; }
    const cat = q.snapshot.catalogo;
    ms.forEach((m) => {
      const asig = m.asignado ? (m.asignado.tipo === 'c' ? q.cuartos.find((c) => c.id === m.asignado.id)?.nombre : cat.partidas.find((p) => p.id === m.asignado.id)?.nombre) : t('plans.unassigned');
      lista.append(h('div', { class: 'item' },
        h('div', { class: 'main' }, h('b', {}, `${m.etiqueta || t('plans.measure')} - ${num(m.valor, 1)} ${m.tipo === 'area' ? 'ft²' : 'lf'}`), h('span', { class: 'sub' }, `${t('plans.page')} ${m.pagina} · ${asig}`)),
        h('div', { class: 'right' },
          h('button', { class: 'small', onclick: async () => { plano = q.planos.find((p) => p.id === m.planoId) || plano; if (pagina !== m.pagina) { pagina = m.pagina; await pintarPagina(); } realce = m.id; dibujar(); wrap.scrollIntoView({ block: 'nearest' }); setTimeout(() => { realce = null; dibujar(); }, 2500); } }, t('plans.view')), ' ',
          m.asignado?.tipo === 'p' ? h('button', { class: 'small primary', onclick: () => { const p = cat.partidas.find((x) => x.id === m.asignado.id); q.lineas.push({ id: store.nuevoId(), partidaId: p.id, cantidad: Math.round(m.valor * 10) / 10, unidad: p.unidad, cuartoId: null, opciones: { manos: 2, dificultadId: 'normal' }, nota: m.etiqueta || '' }); guardar(); toast(t('plans.lineAdded')); } }, t('plans.addToQuote')) : null, ' ',
          h('button', { class: 'small ghost', onclick: () => editarMedida(m) }, t('ui.edit')), ' ',
          h('button', { class: 'small danger', 'aria-label': t('ui.delete'), onclick: () => { q.medidas = q.medidas.filter((x) => x !== m); guardar(); dibujar(); pintarLista(); } }, '✕'))));
    });
  }
  function herramientas() {
    clear(tools);
    const B = (txt, m, extra = {}) => h('button', { class: 'small', 'aria-pressed': modo === m ? 'true' : 'false', disabled: !pdfDoc || null, onclick: () => { modo = modo === m ? null : m; pts = []; dibujar(); herramientas(); }, ...extra }, txt);
    add(tools, ...[B(t('plans.calibrate'), 'calibrar'), B(t('plans.line'), 'linea'), B(t('plans.polygon'), 'poligono'),
      (modo === 'linea' || modo === 'poligono') ? h('button', { class: 'small primary', onclick: terminar }, `${t('plans.finish')} (${pts.length})`) : null,
      pts.length ? h('button', { class: 'small', onclick: () => { pts.pop(); dibujar(); herramientas(); } }, t('plans.undo')) : null,
      h('button', { class: 'small', disabled: !pdfDoc || null, onclick: async () => { zoom = Math.max(0.5, zoom - 0.25); await pintarPagina(); } }, '−'),
      h('button', { class: 'small', disabled: !pdfDoc || null, onclick: async () => { zoom = Math.min(4, zoom + 0.25); await pintarPagina(); } }, '+'),
      pdfDoc && pdfDoc.numPages > 1 ? [h('button', { class: 'small', disabled: pagina <= 1 || null, onclick: async () => { pagina--; pts = []; await pintarPagina(); } }, '‹'), h('button', { class: 'small', disabled: pagina >= pdfDoc.numPages || null, onclick: async () => { pagina++; pts = []; await pintarPagina(); } }, '›')] : null]);
    if (modo === 'calibrar') info.textContent = t('plans.tapTwo');
    else if (modo) info.textContent = t('plans.tapPoints');
  }

  const subir = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'sr', id: 'plano-file', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (/\.dwg$/i.test(f.name)) return toast(t('plans.dwgNote'), 'err');
    try {
      const buf = await f.arrayBuffer(); const pid = store.nuevoId();
      await store.guardarPlanoPdf(pid, buf);
      plano = { id: pid, nombre: f.name, escalas: {} }; q.planos.push(plano); await guardar();
      await abrir(); herramientas(); pintarSelector();
    } catch (err) { toast(t('ui.error') + ': ' + err.message, 'err'); }
  } });
  const selector = h('div');
  function pintarSelector() {
    clear(selector);
    if (q.planos.length > 1) selector.append(selectField(t('plans.pick'), q.planos.map((p) => [p.id, p.nombre]), plano?.id, async (v) => { plano = q.planos.find((p) => p.id === v); pts = []; await abrir(); herramientas(); }));
  }

  shell(t('nav.plans'), h('div', {},
    h('a', { href: `#/cot/${id}/rooms`, class: 'btn small ghost' }, '← ' + (q.cliente.nombre || q.numero)),
    h('h1', {}, t('nav.plans')),
    aviso('info', t('plans.dwgNote')), aviso('info', t('plans.localOnly')),
    h('label', { class: 'btn primary block', for: 'plano-file' }, t('plans.upload')), subir, selector, tools, info, wrap,
    h('div', { class: 'card mt' }, h('h2', {}, t('plans.measures')), lista)), '#/planos');
  pintarSelector(); herramientas(); pintarLista();
  if (!plano) wrap.replaceChildren(h('div', { class: 'empty' }, t('plans.empty')));
  else { wrap.replaceChildren(cv, ov); await abrir(); herramientas(); }
  window.__planos = { q, get pts() { return pts; } };
}
