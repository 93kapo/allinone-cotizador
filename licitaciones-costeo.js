// licitaciones-costeo.js - Paso "Costeo" de una licitación: líneas por oficio, breakouts, resumen y calificaciones.
// Reutiliza el motor (engine.js vía bids-calc.js): impuesto 7.5% en materiales, burden, contingencia, overhead, margen sobre PRECIO.
import { h, clear, usd, num, pct1, add } from './util.js';
import { t, getLang } from './i18n.js';
import * as store from './store.js';
import { field, numField, selectField, sheet, aviso, pctField, acciones, borrarConDeshacer, controlGanancia } from './ui.js';
import { aCentavos, costearLinea } from './engine.js';
import { calcularBid, lineaLibre, lineaAMotor } from './bids-calc.js';
import { analizarAlcance, OFICIOS, nombreOficio } from './bids-fit.js';

const OTRO = 'otro';
const moneyInput = (label, cents, onC, hint) => field({ label: label + ' ($)', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: cents ? (cents / 100).toFixed(2) : '', onInput: (v) => onC(aCentavos(v || 0)), hint });

export function pasoCostos({ body, bid, guardar, guardarYa }) {
  const lang = getLang();
  const nombreOf = (key) => { const o = OFICIOS.find((x) => x.key === key); return o ? nombreOficio(o, lang) : t('bid.trade.other'); };
  const resumenBox = h('div'), lineasBox = h('div'), breakBox = h('div');
  const cal = () => { try { return calcularBid(bid); } catch (e) { console.error(e); return null; } };

  const pintarTodo = () => { pintarLineas(); pintarBreakouts(); pintarResumen(); };

  // ----- Líneas por oficio -----
  function oficiosVisibles() {
    const r = analizarAlcance(bid.alcance);
    const ex = bid.oficiosExcluidos || [];
    const keys = r.relevantes.filter((o) => !ex.includes(o.key)).map((o) => o.key);
    for (const l of bid.lineas) if (!keys.includes(l.oficio || OTRO)) keys.push(l.oficio || OTRO);
    if (!keys.length) keys.push(OTRO);
    return keys;
  }
  function pintarLineas() {
    clear(lineasBox);
    const res = cal();
    const precioDe = (l) => res?.lineas.find((x) => x.linea === l)?.precio ?? 0;
    for (const key of oficiosVisibles()) {
      const ls = bid.lineas.filter((l) => (l.oficio || OTRO) === key);
      add(lineasBox, h('div', { class: 'card' }, h('h2', {}, nombreOf(key)),
        ls.length ? ls.map((l) => h('div', { class: 'item' },
          h('div', { class: 'main' }, h('b', {}, nombreLinea(l)),
            h('span', { class: 'sub' }, [`${num(l.cantidad, 1)} ${l.unidad || ''}`, bid.breakouts.find((b) => b.id === l.breakoutId)?.nombre || (bid.breakouts.length ? t('bid.unassigned') : ''), l.nota].filter(Boolean).join(' · '))),
          h('div', { class: 'right' }, h('b', {}, usd(precioDe(l))),
            acciones(h('button', { class: 'ghost', onclick: () => formLinea(l, key) }, t('ui.edit')),
              h('button', { class: 'danger', 'aria-label': t('ui.delete'), onclick: () => borrarConDeshacer(bid.lineas, l, { msg: t('ui.deletedLine'), guardar, despues: pintarTodo }) }, '✕')))))
          : h('p', { class: 'muted' }, t('bid.noLines')),
        h('button', { class: 'block', onclick: () => formLinea(null, key) }, '+ ' + t('lines.add'))));
    }
  }
  const nombreLinea = (l) => l.nombre || (l.modo === 'catalogo' ? (bid.snapshot.catalogo.partidas.find((p) => p.id === l.partidaId)?.nombre || l.partidaId) : t('pdf.custom'));

  function formLinea(existente, key) {
    const cat = bid.snapshot.catalogo;
    const l = existente ? { ...existente } : { ...lineaLibre(store.nuevoId(), key, cat.tarifas.find((x) => x.id === 'pintor')?.cents), modo: 'libre', dificultadId: 'normal' };
    if (!existente && bid.breakouts.length === 1) l.breakoutId = bid.breakouts[0].id;
    const cuerpo = h('div', { class: 'stack' });
    const prev = h('p', { class: 'muted', 'aria-live': 'polite' });
    const actualizar = () => {
      try { prev.textContent = t('bid.lineDirect', usd(costearLinea(lineaAMotor(l), cat, bid.snapshot.ajustes).totales.directo)); } catch { prev.textContent = ''; }
    };
    const sh = sheet(existente ? t('ui.edit') : t('lines.add'), cuerpo);
    const pintar = () => {
      clear(cuerpo);
      const o = OFICIOS.find((x) => x.key === key);
      const partidas = cat.partidas.filter((p) => !o?.cat || p.cat === o.cat || o.cat === 'otros');
      const lista = partidas.length ? partidas : cat.partidas;
      add(cuerpo,
        selectField(t('bid.lineMode'), [['libre', t('bid.modeFree')], ['catalogo', t('bid.modeCatalog')]], l.modo, (v) => { l.modo = v; if (v === 'catalogo' && !l.partidaId) { l.partidaId = lista[0].id; l.unidad = lista[0].unidad; } pintar(); }),
        l.modo === 'catalogo'
          ? selectField(t('lines.item'), lista.map((p) => [p.id, p.nombre]), l.partidaId || lista[0].id, (v) => { l.partidaId = v; l.unidad = cat.partidas.find((p) => p.id === v).unidad; actualizar(); pintar(); })
          : field({ label: t('price.name'), value: l.nombre || '', onInput: (v) => { l.nombre = v.trim(); } }),
        h('div', { class: 'row' },
          numField(`${t('lines.qty')}`, l.cantidad || '', (v) => { l.cantidad = v; actualizar(); }),
          l.modo === 'catalogo' ? h('div', {}, h('label', {}, t('bid.unit')), h('input', { value: l.unidad || '', readonly: true })) : field({ label: t('bid.unit'), value: l.unidad || '', onInput: (v) => { l.unidad = v.trim(); } })),
        h('p', { class: 'muted' }, t('bid.takeoffHint')),
        l.modo === 'catalogo'
          ? selectField(t('lines.difficulty'), cat.dificultades.map((d) => [d.id, d.nombre]), l.dificultadId || 'normal', (v) => { l.dificultadId = v; actualizar(); })
          : h('div', { class: 'stack' },
            moneyInput(t('bid.matUnit'), l.matCents, (c) => { l.matCents = c; actualizar(); }, t('bid.matUnitHint')),
            h('div', { class: 'row' },
              numField(t('bid.productivity'), l.productividad || '', (v) => { l.productividad = v; actualizar(); }, { hint: t('bid.productivityHint') }),
              numField(t('bid.fixedHours'), l.horas || '', (v) => { l.horas = v; actualizar(); }, { hint: t('bid.fixedHoursHint') })),
            moneyInput(t('lines.cRate') + ' /h', l.tarifaCents, (c) => { l.tarifaCents = c; actualizar(); }),
            moneyInput(t('bid.fixedAmount'), l.otrosCents, (c) => { l.otrosCents = c; actualizar(); }, t('bid.fixedAmountHint')),
            h('div', { class: 'row' }, moneyInput(t('lines.cSub'), l.subCents, (c) => { l.subCents = c; actualizar(); }, t('bid.subHint')),
              pctField(t('price.subMarkup'), l.subMarkupBp || 0, (bp) => { l.subMarkupBp = bp; actualizar(); }))),
        bid.breakouts.length ? selectField(t('bid.breakout'), [['', t('bid.unassigned')], ...bid.breakouts.map((b) => [b.id, b.nombre])], l.breakoutId || '', (v) => { l.breakoutId = v || null; }) : null,
        field({ label: t('lines.note'), value: l.nota || '', onInput: (v) => { l.nota = v; } }),
        prev,
        h('button', { class: 'primary block', onclick: () => {
          if (existente) Object.assign(existente, l); else bid.lineas.push(l);
          guardar(); sh.close(); pintarTodo();
        } }, t('ui.save')));
      actualizar();
    };
    pintar();
  }

  // ----- Breakouts -----
  function pintarBreakouts() {
    clear(breakBox);
    const res = cal();
    add(breakBox, h('div', { class: 'card stack' }, h('h2', {}, t('bid.breakouts')), h('p', { class: 'muted' }, t('bid.breakoutsHint')),
      bid.breakouts.map((b) => h('div', { class: 'row', style: 'align-items:end' },
        field({ label: t('bid.breakout'), value: b.nombre, onInput: (v) => { b.nombre = v.trim(); guardar(); pintarResumen(); pintarLineas(); } }),
        h('button', { class: 'danger', 'aria-label': t('ui.delete'), style: 'flex:0 0 auto', onclick: () => {
          const afectadas = bid.lineas.filter((l) => l.breakoutId === b.id);
          afectadas.forEach((l) => { l.breakoutId = null; });
          borrarConDeshacer(bid.breakouts, b, { msg: t('ui.deletedBreakout'), guardar: () => { afectadas.forEach((l) => { l.breakoutId = bid.breakouts.includes(b) ? b.id : null; }); guardar(); }, despues: pintarTodo });
        } }, '✕'))),
      h('button', { class: 'block', onclick: () => { bid.breakouts.push({ id: store.nuevoId(), nombre: `${t('bid.breakout')} ${bid.breakouts.length + 1}` }); guardar(); pintarTodo(); } }, '+ ' + t('bid.addBreakout')),
      res && res.sinAsignar ? aviso('warn', t('bid.unassignedWarn', res.sinAsignar)) : null));
  }

  // ----- Resumen -----
  const ctl = controlGanancia({ id: 'bmg', bp: bid.margenBp, pisoBp: bid.snapshot.ajustes.margenPisoBp, onChange: (bp) => { bid.margenBp = bp; guardar(); pintarResumen(); } });
  // La parte fija (deslizador e imprevistos) NO se repinta: sacar un <input type=range> del DOM a mitad de un arrastre lo corta.
  const kpiBox = h('div'), precioBox = h('div');
  add(resumenBox,
    h('div', { class: 'card' }, h('h2', {}, t('bid.summary')), kpiBox, ctl.el,
      pctField(t('rev.contingency'), bid.contingenciaBp, (v) => { bid.contingenciaBp = v; guardar(); pintarResumen(); pintarLineas(); }, t('rev.contingencyHint')),
      h('p', { class: 'muted' }, t('rev.marginNote'))),
    precioBox);
  function pintarResumen() {
    clear(kpiBox); clear(precioBox);
    const res = cal();
    if (!res) { add(kpiBox, aviso('err', t('ui.error'))); return; }
    const sem = res.semaforo;
    ctl.setReal(res.margenBp);
    const semTxt = t('bidsem.' + sem, pct1(res.pisoBp));
    const fila = (k, v, cls) => h('tr', { class: cls }, h('td', {}, k), h('td', { class: 'r' }, v));
    add(kpiBox,
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('small', {}, t('bid.totalCost')), h('b', {}, usd(res.costoTotal))),
        h('div', { class: 'kpi' }, h('small', {}, t('bid.totalPrice')), h('b', {}, usd(res.total))),
        h('div', { class: 'kpi' }, h('small', {}, t('rev.profit')), h('b', {}, usd(res.ganancia))),
        h('div', { class: 'kpi sem-' + sem }, h('small', {}, t('rev.marginReal')), h('b', {}, `${pct1(res.margenBp)} (${t('rev.markup')} ${res.markupPct.toFixed(1)}%)`))),
      h('div', { class: 'banner mt ' + (sem === 'verde' ? 'ok' : sem === 'ambar' ? 'warn' : 'err'), role: 'status' }, h('b', {}, (sem === 'verde' ? '● ' : sem === 'ambar' ? '▲ ' : '■ ')), semTxt),
      res.errores.length ? aviso('err', t('bid.lineErrors', res.errores.length)) : null);
    add(precioBox,
      h('div', { class: 'card' }, h('h2', {}, t(res.hayDesglose ? 'bid.priceBreakdown' : 'bid.totalPrice')),
        res.hayDesglose ? h('table', {}, h('tbody', {},
          res.grupos.map((g) => fila(g.id === null ? t('bid.unassigned') : g.nombre, usd(g.precio))),
          fila(t('pdf.total'), usd(res.total), 'tot'))) : h('p', {}, h('b', {}, usd(res.total))),
        res.hayDesglose ? h('p', { class: 'muted' }, res.cuadra ? t('bid.sumOk', usd(res.sumaGrupos)) : t('bid.sumBad')) : null));
  }

  // ----- Calificaciones -----
  const q = bid.calif = bid.calif || { inclusiones: '', exclusiones: '', supuestos: '', validezDias: 30, addenda: '' };
  const calif = h('div', { class: 'card stack' }, h('h2', {}, t('bid.qualifications')), h('p', { class: 'muted' }, t('bid.qualHint')),
    ...[['inclusiones', 'bid.q.incl'], ['exclusiones', 'bid.q.excl'], ['supuestos', 'bid.q.assum'], ['addenda', 'bid.q.addenda']]
      .map(([k, lab]) => field({ label: t(lab), area: true, value: q[k] || '', onInput: (v) => { q[k] = v; guardar(); } })),
    field({ label: t('bid.q.validity'), type: 'number', inputmode: 'numeric', value: q.validezDias, onInput: (v) => { q.validezDias = parseInt(v) || 30; guardar(); } }));

  pintarTodo();
  add(body, aviso('info', t('bid.costNote')), lineasBox, breakBox, resumenBox, calif,
    h('button', { class: 'primary block', onclick: () => guardarYa().then(() => { location.hash = `#/licitaciones/${bid.id}/borradores`; }) }, t('ui.next')));
}
