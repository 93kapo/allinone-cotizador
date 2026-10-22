// cotizacion.js - editor de cotización: cliente -> cuartos/partidas -> revisión -> PDF.
import { h, clear, usd, num, pct1, descargar, add } from './util.js';
import { t } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { field, numField, selectField, checkField, toast, sheet, aviso, pctField } from './ui.js';
import {
  medirCuarto, calcularCotizacion, contingenciaPorDefecto, esPre1978, puedeGenerarPdf, TEXTO_CONFIRMACION,
  markupPctDesdeMargenBp, montosHitos, anticipoExcede10, snapshotCatalogo, aCentavos, BP,
} from './engine.js';
import { generarPdfCliente, generarPdfInterno } from './pdf.js';

const PASOS = ['client', 'rooms', 'review', 'pdf'];

export async function pantallaCotizacion({ shell, id, paso }) {
  const q = await store.getCotizacion(id);
  if (!q) return shell(t('ui.error'), aviso('err', t('quote.notFound')), '#/');
  const paso0 = PASOS.includes(paso) ? paso : 'client';
  let timer;
  const guardarYa = async () => { clearTimeout(timer); try { await store.saveCotizacion(q); } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); } };
  const guardar = () => { clearTimeout(timer); timer = setTimeout(guardarYa, 350); };
  const body = h('div');
  const cal = () => { try { return calcularCotizacion(q); } catch (e) { console.error(e); return null; } };

  const render = () => {
    clear(body);
    add(body, h('div', { class: 'steps', role: 'tablist' }, PASOS.map((p, i) =>
      h('button', { role: 'tab', 'aria-current': p === paso0 ? 'step' : null, onclick: () => { guardarYa().then(() => { location.hash = `#/cot/${id}/${p}`; }); } }, `${i + 1}. ${t('step.' + p)}`))));
    ({ client: pasoCliente, rooms: pasoCuartos, review: pasoRevision, pdf: pasoPdf })[paso0]();
  };

  // ---------- Paso 1: cliente ----------
  function pasoCliente() {
    const c = q.cliente;
    const F = (label, k, o = {}) => field({ label, value: c[k] || '', onInput: (v) => { c[k] = v.trim(); guardar(); }, ...o });
    const warn = h('div');
    const pintarAviso = () => {
      clear(warn);
      if (esPre1978(c.anio)) warn.append(aviso('warn', h('b', {}, t('quote.pre1978')), ' ', t('quote.pre1978Hint')));
    };
    pintarAviso();
    const recalcCont = () => {
      if (!q.contManual) q.contingenciaBp = contingenciaPorDefecto({ anioConstruccion: c.anio, esRemodelacion: q.esRemodelacion }, q.snapshot.ajustes);
    };
    add(body, h('div', { class: 'card stack' },
      h('h2', {}, `${q.numero}`),
      F(t('client.name'), 'nombre', { placeholder: 'Nombre y apellido' }),
      h('div', { class: 'row' }, F(t('client.phone'), 'telefono', { type: 'tel', inputmode: 'tel' }), F(t('client.email'), 'email', { type: 'email', inputmode: 'email' })),
      F(t('client.address'), 'direccion'),
      field({ label: t('client.year'), type: 'number', inputmode: 'numeric', value: c.anio || '', placeholder: '1985', onInput: (v) => { c.anio = v ? parseInt(v) : ''; recalcCont(); pintarAviso(); guardar(); } }),
      warn,
      checkField(t('client.remodel'), q.esRemodelacion, (v) => { q.esRemodelacion = v; recalcCont(); guardar(); }),
      field({ label: t('client.notes'), area: true, value: c.notas || '', onInput: (v) => { c.notas = v; guardar(); } }),
      selectField(t('quote.status'), ['borrador', 'enviada', 'aceptada', 'rechazada'].map((e) => [e, t('estado.' + e)]), q.estado, (v) => { q.estado = v; guardar(); })),
      h('button', { class: 'primary block', onclick: () => guardarYa().then(() => { location.hash = `#/cot/${id}/rooms`; }) }, t('ui.next')),
      h('button', { class: 'danger block mt', onclick: async () => { if (confirm(t('quote.deleteConfirm'))) { await store.borrarCotizacion(id); location.hash = '#/'; } } }, t('quote.delete')));
  }

  // ---------- Paso 2: cuartos y partidas ----------
  function pasoCuartos() {
    const aj = q.snapshot.ajustes;
    const D = { areaPuerta: aj.areaPuerta ?? 21, areaVentana: aj.areaVentana ?? 15, anchoPuerta: 3 };
    const lc = h('div'), ll = h('div');
    const nombreCuarto = (cid) => q.cuartos.find((x) => x.id === cid)?.nombre;
    const pintarCuartos = () => {
      clear(lc);
      if (!q.cuartos.length) lc.append(h('div', { class: 'empty' }, t('rooms.empty')));
      q.cuartos.forEach((r) => {
        const m = medirCuarto(r, D);
        const out = h('div', { class: 'muted' });
        const act = () => { const m2 = medirCuarto(r, D); out.textContent = t('rooms.measures', num(m2.paredes, 0), num(m2.techo, 0), num(m2.trim, 0)); };
        act();
        const N = (label, k, step = 'any') => numField(label, r[k] ?? '', (v) => { r[k] = v; act(); guardar(); }, { step });
        lc.append(h('div', { class: 'card stack', style: 'background:#F3F8F9' },
          field({ label: t('rooms.name'), value: r.nombre, onInput: (v) => { r.nombre = v; guardar(); pintarLineas(); } }),
          h('div', { class: 'row' }, N(t('rooms.length'), 'largo'), N(t('rooms.width'), 'ancho'), N(t('rooms.height'), 'alto')),
          h('div', { class: 'row' }, N(t('rooms.doors'), 'puertas', '1'), N(t('rooms.windows'), 'ventanas', '1')),
          out,
          h('div', { class: 'row' },
            h('button', { class: 'small', onclick: () => agregarPinturaCuarto(r) }, t('rooms.paintThis')),
            h('button', { class: 'small danger', onclick: () => { if (confirm(t('rooms.deleteConfirm'))) { q.cuartos = q.cuartos.filter((x) => x !== r); guardar(); pintarCuartos(); } } }, t('ui.delete')))));
      });
    };
    function agregarPinturaCuarto(r) {
      const m = medirCuarto(r, D);
      const add = (partidaId, cant) => { if (cant > 0) { const p = S.catalogo ? q.snapshot.catalogo.partidas.find((x) => x.id === partidaId) : null; q.lineas.push({ id: store.nuevoId(), partidaId, cantidad: Math.round(cant * 10) / 10, unidad: p.unidad, cuartoId: r.id, opciones: { manos: 2, primer: false, dificultadId: 'normal' } }); } };
      add('pint-int-paredes', m.paredes); add('pint-int-techo', m.techo);
      guardar(); pintarLineas(); toast(t('rooms.paintAdded'));
    }
    const pintarLineas = () => {
      clear(ll);
      const c = cal();
      if (!q.lineas.length) { ll.append(h('div', { class: 'empty' }, t('lines.empty'))); return; }
      q.lineas.forEach((l, i) => {
        const cat = q.snapshot.catalogo, p = cat.partidas.find((x) => x.id === l.partidaId);
        const room = l.cuartoId ? nombreCuarto(l.cuartoId) : '';
        ll.append(h('div', { class: 'item' },
          h('div', { class: 'main' }, h('b', {}, l.personalizada ? l.personalizada.nombre : (p?.nombre || l.partidaId)),
            h('span', { class: 'sub' }, [l.personalizada ? '' : `${num(l.cantidad, 1)} ${l.unidad || ''}`, room, l.opciones?.oscuro ? t('lines.dark') : '', l.nota || ''].filter(Boolean).join(' · '))),
          h('div', { class: 'right' }, h('b', {}, c ? usd(c.lineas[i]?.totales.directo) : ''), h('br'),
            h('button', { class: 'small ghost', onclick: () => formLinea(l) }, t('ui.edit')), ' ',
            h('button', { class: 'small danger', 'aria-label': t('ui.delete'), onclick: () => { q.lineas.splice(i, 1); guardar(); pintarLineas(); } }, '✕'))));
      });
    };
    pintarCuartos(); pintarLineas();
    add(body, h('div', { class: 'card' }, h('h2', {}, t('rooms.title')), lc,
      h('button', { class: 'block', onclick: () => { q.cuartos.push({ id: store.nuevoId(), nombre: `${t('rooms.room')} ${q.cuartos.length + 1}`, largo: 12, ancho: 10, alto: 8, puertas: 1, ventanas: 1 }); guardar(); pintarCuartos(); } }, '+ ' + t('rooms.add'))),
      h('div', { class: 'card' }, h('h2', {}, t('lines.title')), h('p', { class: 'muted' }, t('lines.costNote')), ll,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => formLinea() }, '+ ' + t('lines.add')), h('button', { onclick: () => formLibre() }, '+ ' + t('lines.custom')))),
      h('button', { class: 'primary block', onclick: () => guardarYa().then(() => { location.hash = `#/cot/${id}/review`; }) }, t('ui.next')));

    // Opciones de origen de la cantidad
    function fuentes() {
      const o = [['manual', t('lines.manual'), null]];
      for (const r of q.cuartos) {
        const m = medirCuarto(r, D);
        o.push([`c:${r.id}:paredes`, `${r.nombre} - ${t('rooms.walls')} (${num(m.paredes, 0)} ft²)`, m.paredes], [`c:${r.id}:techo`, `${r.nombre} - ${t('rooms.ceiling')} (${num(m.techo, 0)} ft²)`, m.techo],
          [`c:${r.id}:trim`, `${r.nombre} - Trim (${num(m.trim, 0)} lf)`, m.trim], [`c:${r.id}:piso`, `${r.nombre} - ${t('rooms.floor')} (${num(m.piso, 0)} ft²)`, m.piso],
          [`c:${r.id}:puertas`, `${r.nombre} - ${t('rooms.doors')} (${m.puertas})`, m.puertas], [`c:${r.id}:ventanas`, `${r.nombre} - ${t('rooms.windows')} (${m.ventanas})`, m.ventanas]);
      }
      for (const m of q.medidas || []) o.push([`m:${m.id}`, `${t('plans.title')}: ${m.etiqueta || ''} (${num(m.valor, 1)} ${m.tipo === 'area' ? 'ft²' : 'lf'})`, m.valor]);
      return o;
    }
    function formLinea(existente) {
      const cat = q.snapshot.catalogo;
      if (existente?.personalizada) return formLibre(existente);
      const l = existente || { id: store.nuevoId(), partidaId: cat.partidas[0].id, cantidad: 0, unidad: '', cuartoId: null, opciones: { manos: 2, primer: false, oscuro: false, dificultadId: 'normal', prepPct: 0, prepHoras: 0 }, nota: '' };
      l.opciones = l.opciones || {};
      const cuerpo = h('div', { class: 'stack' });
      const cats = [...new Set(cat.partidas.map((p) => p.cat))];
      const pintar = () => {
        clear(cuerpo);
        const p = cat.partidas.find((x) => x.id === l.partidaId);
        l.unidad = p.unidad;
        const qty = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: l.cantidad, id: 'qty', onchange: (e) => { l.cantidad = parseFloat(e.target.value) || 0; } });
        add(cuerpo, 
          h('div', {}, h('label', { for: 'sel-part' }, t('lines.item')),
            h('select', { id: 'sel-part', onchange: (e) => { l.partidaId = e.target.value; pintar(); } }, cats.map((ct) => h('optgroup', { label: t('cat.' + ct) }, cat.partidas.filter((x) => x.cat === ct).map((x) => h('option', { value: x.id, selected: x.id === l.partidaId }, x.nombre)))))),
          h('div', {}, h('label', { for: 'sel-src' }, t('lines.source')),
            h('select', { id: 'sel-src', onchange: (e) => { const f = fuentes().find((x) => x[0] === e.target.value); if (f && f[2] != null) { l.cantidad = Math.round(f[2] * 10) / 10; qty.value = l.cantidad; if (f[0].startsWith('c:')) l.cuartoId = f[0].split(':')[1]; } } },
              fuentes().map(([v, txt]) => h('option', { value: v }, txt)))),
          h('div', {}, h('label', { for: 'qty' }, `${t('lines.qty')} (${p.unidad})`), qty),
          p.pintura ? h('div', { class: 'stack' },
            numField(t('lines.coats'), l.opciones.manos ?? p.pintura.manos, (v) => { l.opciones.manos = Math.max(1, Math.round(v)); }, { step: '1', min: '1' }),
            checkField(t('lines.dark'), l.opciones.oscuro, (v) => { l.opciones.oscuro = v; }),
            checkField(t('lines.primer'), l.opciones.primer, (v) => { l.opciones.primer = v; }),
            numField(t('lines.prepPct'), l.opciones.prepPct || 0, (v) => { l.opciones.prepPct = v; })) : null,
          p.mano ? selectField(t('lines.difficulty'), cat.dificultades.map((d) => [d.id, `${d.nombre} (x${(d.multBp / BP).toFixed(2)})`]), l.opciones.dificultadId || 'normal', (v) => { l.opciones.dificultadId = v; }) : null,
          p.mano ? numField(t('lines.prepHours'), l.opciones.prepHoras || 0, (v) => { l.opciones.prepHoras = v; }) : null,
          field({ label: t('lines.note'), value: l.nota || '', onInput: (v) => { l.nota = v; } }),
          h('button', { class: 'primary block', onclick: () => { if (!existente) q.lineas.push(l); guardar(); sh.close(); pintarLineas(); } }, t('ui.save')));
      };
      const sh = sheet(existente ? t('ui.edit') : t('lines.add'), cuerpo);
      pintar();
    }
    function formLibre(existente) {
      const l = existente || { id: store.nuevoId(), cantidad: 1, unidad: '', personalizada: { nombre: '', materialesCents: 0, horas: 0, tarifaCents: q.snapshot.catalogo.tarifas[0]?.cents || 2400, subCents: 0, subMarkupBp: 0, otrosCents: 0 } };
      const p = l.personalizada;
      const sh = sheet(t('lines.custom'), h('div', { class: 'stack' },
        field({ label: t('price.name'), value: p.nombre, onInput: (v) => { p.nombre = v; } }),
        h('div', { class: 'row' }, field({ label: t('lines.cMat') + ' ($)', type: 'number', inputmode: 'decimal', value: p.materialesCents / 100, onInput: (v) => { p.materialesCents = aCentavos(v || 0); } }),
          field({ label: t('lines.cOther') + ' ($)', type: 'number', inputmode: 'decimal', value: p.otrosCents / 100, onInput: (v) => { p.otrosCents = aCentavos(v || 0); } })),
        h('div', { class: 'row' }, numField(t('lines.cHours'), p.horas, (v) => { p.horas = v; }), field({ label: t('lines.cRate') + ' ($/h)', type: 'number', inputmode: 'decimal', value: p.tarifaCents / 100, onInput: (v) => { p.tarifaCents = aCentavos(v || 0); } })),
        h('div', { class: 'row' }, field({ label: t('lines.cSub') + ' ($)', type: 'number', inputmode: 'decimal', value: p.subCents / 100, onInput: (v) => { p.subCents = aCentavos(v || 0); } }),
          pctField(t('price.subMarkup'), p.subMarkupBp, (v) => { p.subMarkupBp = v; })),
        h('button', { class: 'primary block', onclick: () => { if (!p.nombre) p.nombre = t('pdf.custom'); if (!existente) q.lineas.push(l); guardar(); sh.close(); pintarLineas(); } }, t('ui.save'))));
    }
  }

  // ---------- Paso 3: revisión de costos ----------
  function pasoRevision() {
    const out = h('div');
    const lab = h('label', { for: 'mg' }, `${t('rev.margin')}: ${pct1(q.margenBp)}`);
    const rng = h('input', { id: 'mg', type: 'range', min: '0', max: '7000', step: '50', value: q.margenBp,
      oninput: (e) => { q.margenBp = parseInt(e.target.value); lab.textContent = `${t('rev.margin')}: ${pct1(q.margenBp)}`; rng.setAttribute('aria-valuetext', pct1(q.margenBp)); guardar(); pintar(); } });
    const pintar = () => {
      clear(out);
      const c = cal(); if (!c) { add(out, aviso('err', t('ui.error'))); return; }
      const T = c.totales, aj = q.snapshot.ajustes;
      const bajo = T.margenBp < aj.margenPisoBp;
      const fila = (k, v, cls) => h('tr', { class: cls }, h('td', {}, k), h('td', { class: 'r' }, v));
      add(out, 
        h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, h('small', {}, t('rev.price')), h('b', {}, usd(T.precio))),
          h('div', { class: 'kpi ' + (bajo ? 'bad' : 'good') }, h('small', {}, t('rev.marginReal')), h('b', {}, pct1(T.margenBp))),
          h('div', { class: 'kpi' }, h('small', {}, t('rev.markup')), h('b', {}, T.markupPct.toFixed(1) + '%')),
          h('div', { class: 'kpi' }, h('small', {}, t('rev.profit')), h('b', {}, usd(T.ganancia))),
          h('div', { class: 'kpi', style: 'grid-column:1/-1' }, h('small', {}, `${t('rev.net')} (${pct1(aj.impuestoNetoBp)}) - ${t('rev.netNote')}`), h('b', {}, usd(T.gananciaNeta)))),
        bajo ? aviso('err', h('b', {}, t('rev.belowFloor', pct1(aj.margenPisoBp))), ' ', t('rev.belowFloorHint')) : null,
        h('div', { class: 'card mt' }, h('h2', {}, t('rev.costs')),
          h('table', {}, h('tbody', {},
            fila(t('pdf.materials'), usd(T.materiales)),
            fila(`${t('pdf.salesTax')} (${(aj.impuestoVentasBp / 100).toFixed(1)}%)`, usd(T.impuestoMat)),
            fila(`${t('pdf.labor')} (${num(T.horas, 1)} h)`, usd(T.manoObra)),
            fila(t('pdf.subs'), usd(T.subs)), fila(t('pdf.other'), usd(T.otros)),
            fila(t('pdf.directs'), usd(T.directos), 'tot'),
            fila(`${t('pdf.contingency')} (${pct1(c.contingenciaBp)})`, usd(T.contingencia)),
            fila(`${t('pdf.overhead')} (${pct1(aj.overheadBp)})`, usd(T.overhead)),
            fila(`${t('pdf.warrantyRes')} (${pct1(aj.garantiaBp)})`, usd(T.garantia)),
            fila(t('pdf.totalCost'), usd(T.costoTotal), 'tot'))),
          h('p', { class: 'muted' }, t('rev.salesTaxNote')),
          pctField(t('rev.contingency'), c.contingenciaBp, (v) => { q.contingenciaBp = v; q.contManual = true; guardar(); pintar(); }, t('rev.contingencyHint'))),
        h('div', { class: 'card' }, h('h2', {}, t('rev.byLine')),
          q.lineas.length ? h('table', {}, h('tbody', {}, q.lineas.map((l, i) => h('tr', {}, h('td', {}, l.personalizada ? l.personalizada.nombre : (q.snapshot.catalogo.partidas.find((p) => p.id === l.partidaId)?.nombre || '')), h('td', { class: 'r' }, usd(c.lineas[i].precio)))))) : h('div', { class: 'empty' }, t('lines.empty'))),
        hitos(c));
    };
    const hitos = (c) => {
      const aj = q.snapshot.ajustes;
      q.hitosBp = q.hitosBp || [...aj.hitosBp];
      const suma = q.hitosBp.reduce((a, b) => a + b, 0);
      const montos = montosHitos(c.totales.precio, q.hitosBp);
      return h('div', { class: 'card' }, h('h2', {}, t('rev.payments')),
        ...q.hitosBp.map((bp, i) => h('div', { class: 'row' }, pctField((aj.hitosNombres.es[i] || `Hito ${i + 1}`), bp, (v) => { q.hitosBp[i] = v; guardar(); pintar(); }), h('div', { class: 'right', style: 'align-self:end;padding-bottom:12px' }, usd(montos[i])))),
        suma !== BP ? aviso('err', t('rev.sumNot100', (suma / 100).toFixed(1))) : null,
        anticipoExcede10(q.hitosBp[0]) ? aviso('warn', t('rev.deposit10')) : null);
    };
    pintar();
    add(body, h('div', { class: 'card' }, lab, rng, h('p', { class: 'muted' }, t('rev.marginNote'))), out, h('button', { class: 'primary block', onclick: () => guardarYa().then(() => { location.hash = `#/cot/${id}/pdf`; }) }, t('ui.next')));
  }

  // ---------- Paso 4: PDF ----------
  function pasoPdf() {
    const ajSnap = q.snapshot.ajustes;
    // Costos/impuestos/piso salen del snapshot; empresa, textos y avisos legales son VIVOS (no son precios).
    const aj = { ...ajSnap };
    for (const k of ['empresa', 'garantia', 'changeOrders', 'exclusiones', 'avisoGravamen', 'avisoRecovery', 'avisoEpa', 'hitosNombres']) aj[k] = S.ajustes[k];
    const c = cal();
    const estado = h('div');
    const zona = h('div');
    let confirmTxt = '';
    const lang = () => q.idiomaPdf || 'en';
    const pintarZona = () => {
      clear(zona);
      const T = c.totales, chk = puedeGenerarPdf(T.margenBp, aj.margenPisoBp, confirmTxt);
      const sumaOk = (q.hitosBp || aj.hitosBp).reduce((a, b) => a + b, 0) === BP;
      add(zona, 
        chk.requiereConfirmacion ? h('div', {}, aviso('err', h('b', {}, t('pdf.blocked', pct1(T.margenBp), pct1(aj.margenPisoBp))), ' ', t('pdf.blockedHint', TEXTO_CONFIRMACION)),
          h('div', {}, h('label', { for: 'confirm-txt' }, t('pdf.confirmLabel')), h('input', { id: 'confirm-txt', value: confirmTxt, placeholder: TEXTO_CONFIRMACION, oninput: (e) => { confirmTxt = e.target.value; const b = document.getElementById('btn-pdf-cliente'); if (b) b.disabled = !puedeGenerarPdf(T.margenBp, aj.margenPisoBp, confirmTxt).ok || !sumaOk || !q.lineas.length; } }))) : null,
        !sumaOk ? aviso('err', t('rev.sumNot100', '')) : null,
        h('button', { id: 'btn-pdf-cliente', class: 'primary block', disabled: !chk.ok || !sumaOk || !q.lineas.length || null, onclick: () => emitir('cliente') }, t('pdf.generateClient')),
        !q.lineas.length ? h('p', { class: 'muted' }, t('lines.empty')) : null);
    };
    async function emitir(tipo) {
      clear(estado); add(estado, h('p', {}, h('span', { class: 'spin' }), ' ', t('ui.loading')));
      try {
        await guardarYa();
        const doc = tipo === 'cliente' ? await generarPdfCliente(q, cal(), aj, q.snapshot.catalogo, lang()) : await generarPdfInterno(q, cal(), aj, q.snapshot.catalogo);
        const buf = doc.output('arraybuffer');
        window.__ultimoPdf = { tipo, buf };
        const nombre = `${tipo === 'cliente' ? 'Propuesta' : 'INTERNO'}-${q.numero}-${(q.cliente.nombre || 'cliente').replace(/[^\w]+/g, '_')}.pdf`;
        descargar(nombre, new Blob([buf], { type: 'application/pdf' }));
        clear(estado); add(estado, aviso('ok', t('pdf.done', nombre)));
      } catch (e) { console.error(e); clear(estado); add(estado, aviso('err', t('pdf.fail') + ' ' + e.message)); }
    }
    const L = lang();
    const ov = (k) => (q[k] && q[k][L]) || aj[k][L];
    const setOv = (k, v) => { q[k] = { ...aj[k], ...(q[k] || {}), [L]: v }; guardar(); };
    add(body, 
      aviso('warn', t('legal.disclaimer')),
      h('div', { class: 'card stack' }, h('h2', {}, t('pdf.options')),
        selectField(t('pdf.language'), [['en', 'English'], ['es', 'Español']], L, (v) => { q.idiomaPdf = v; guardar(); render(); }),
        field({ label: t('set.validity'), type: 'number', value: q.validezDias ?? aj.validezDias, onInput: (v) => { q.validezDias = parseInt(v) || 30; guardar(); } }),
        field({ label: t('pdf.warranty'), area: true, value: ov('garantia'), onInput: (v) => setOv('garantia', v) }),
        field({ label: t('pdf.changeOrders'), area: true, value: ov('changeOrders'), onInput: (v) => setOv('changeOrders', v) }),
        field({ label: t('pdf.exclusions'), area: true, value: ov('exclusiones'), onInput: (v) => setOv('exclusiones', v) }),
        h('p', { class: 'muted' }, t('pdf.legalInSettings'), calc3(c) > 250000 ? ' ' + t('pdf.lienIncluded') : ' ' + t('pdf.lienNot'))),
      h('div', { class: 'card stack' }, zona, estado,
        h('button', { id: 'btn-pdf-interno', class: 'block', onclick: () => emitir('interno') }, t('pdf.generateInternal')), h('p', { class: 'muted' }, t('pdf.internalNote'))),
      h('div', { class: 'card stack' }, h('p', { class: 'muted' }, t('quote.snapshotInfo', (q.snapshot.fecha || '').slice(0, 10))),
        h('button', { class: 'block', onclick: async () => { if (!confirm(t('quote.refreshConfirm'))) return; q.snapshot = snapshotCatalogo(S.catalogo, S.ajustes); await guardarYa(); toast(t('quote.refreshed')); render(); } }, t('quote.refresh'))));
    pintarZona();
  }
  const calc3 = (c) => c.totales.precio;

  shell(q.cliente.nombre || q.numero, h('div', {},
    h('div', { class: 'row', style: 'margin-bottom:8px' }, h('a', { href: '#/', class: 'btn small ghost' }, '← ' + t('nav.home')),
      h('a', { href: `#/planos/${id}`, class: 'btn small' }, t('quote.openPlans'))), body), '#/');
  render();
}
