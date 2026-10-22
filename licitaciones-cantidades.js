// licitaciones-cantidades.js - Pantalla "Cantidades del plano": importa el JSON v1 (plan-cantidades.js), la persona REVISA
// (aprobar / corregir) y solo lo aprobado pasa a las líneas de costos. Sirve para licitaciones (tipo 'bid') y cotizaciones ('cot').
// El texto del JSON se muestra SIEMPRE como texto (nunca como HTML). El PDF del plano no se guarda aquí.
import { h, clear, add, num } from './util.js';
import { t, getLang } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { field, toast, sheet, aviso, acciones, deshacer } from './ui.js';
import { validar, aprobar, corregir, aprobarAltas, contarAprobadas, estaAprobado, lineasDesdeItems, aLineaCotizacion, textoFuente } from './plan-cantidades.js';
import { EJEMPLO_PLAN } from './plan-cantidades-ejemplo.js';
import { tr } from './i18n.js';

const MAX_BYTES = 2 * 1024 * 1024;
const SIMBOLO = { alta: '●', media: '▲', baja: '■' };
const GRUPOS = ['cuartos', 'conteos', 'muros', 'partidas', 'insumos'];

export function pasoCantidades({ body, ent, tipo, guardar, guardarYa }) {
  const quien = () => S.usuario?.email || S.ajustes?.empresa?.firmante || S.ajustes?.empresa?.nombre || 'dispositivo';
  const ahora = () => new Date();
  const cont = h('div'), msgs = h('div');
  const C = () => ent.cantidades || null;

  // ----- importar -----
  function importar(texto) {
    clear(msgs);
    let json;
    try { json = JSON.parse(texto); } catch (e) { add(msgs, aviso('err', t('cant.badJson', e.message))); return false; }
    const v = validar(json);
    if (!v.ok) {
      const lang = getLang();
      const lista = v.errores.slice(0, 8).map((e) => { const clave = 'cant.err.' + e.codigo; return h('li', {}, tr(lang, clave, e.ruta, ...e.args)); });
      add(msgs, aviso('err', h('div', {}, h('b', {}, t('cant.errTitle', v.errores.length)), h('ul', { class: 'razones' }, lista), v.errores.length > 8 ? h('p', {}, t('cant.errMore', v.errores.length - 8)) : null)));
      return false;
    }
    const previa = ent.cantidades;
    ent.cantidades = { importado_en: ahora().toISOString(), ejemplo: /EJEMPLO/.test(v.datos.plano.archivo), plano: v.datos.plano, hojas: v.datos.hojas, supuestos: v.datos.supuestos, dudas: v.datos.dudas, advertencias: v.advertencias.map((w) => ({ ruta: w.ruta, codigo: w.codigo, args: w.args })), items: v.items };
    guardarYa(); pintar();
    if (previa) deshacer(t('cant.replaced'), () => { ent.cantidades = previa; guardarYa(); pintar(); });
    else toast(t('cant.imported', v.items.length), 'ok');
    return true;
  }
  const leerArchivo = async (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) { clear(msgs); add(msgs, aviso('err', t('cant.tooBig'))); return; }
    try { importar(await f.text()); } catch (e) { clear(msgs); add(msgs, aviso('err', t('cant.readFail'))); }
  };
  let pegado = '';
  const fileInput = h('input', { type: 'file', id: 'cant-file', class: 'sr', accept: '.json,application/json', onchange: async (e) => { await leerArchivo(e.target.files[0]); e.target.value = ''; } });

  // ----- acciones sobre items -----
  const reemplazar = (item) => { const c = C(); c.items = c.items.map((x) => (x.id === item.id ? item : x)); guardar(); pintar(); };
  function formCorregir(it) {
    let val = it.valor;
    const claveCampo = 'cant.campo.' + it.campo;
    const sh = sheet(t('cant.fixTitle'), h('div', { class: 'stack' },
      h('p', {}, h('b', {}, `${it.entidad} - ${t(claveCampo)}`)),
      field({ label: `${t('cant.newValue')} (${it.unidad})`, type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: it.valor, id: 'cant-nuevo', onInput: (v) => { val = v; } }),
      h('div', { id: 'cant-fix-err' }),
      h('button', { class: 'primary block', id: 'cant-fix-ok', onclick: () => {
        try { val = document.getElementById('cant-nuevo')?.value ?? val; reemplazar(aprobar(corregir(it, val, quien(), ahora()), quien(), ahora())); sh.close(); }
        catch (e) { const z = document.getElementById('cant-fix-err'); clear(z); z.append(aviso('err', e.message)); }
      } }, t('cant.saveFix'))));
  }

  // ----- tarjeta de un valor -----
  function tarjeta(it) {
    const c = C(), ok = estaAprobado(it);
    const claveCampo = 'cant.campo.' + it.campo, claveConf = 'cant.conf.' + it.confianza;
    return h('div', { class: 'card qcard' + (ok ? ' ok' : ''), 'data-id': it.id },
      h('h3', {}, `${it.entidad} - ${t(claveCampo)}`),
      h('div', { class: 'valor' }, `${num(it.valor, 2)} ${it.unidad}`),
      it.corregido ? h('p', { class: 'muted' }, t('cant.fixed') + '. ' + t('cant.was', num(it.valor_original, 2) + ' ' + it.unidad)) : null,
      h('p', { class: 'fuente' }, textoFuente(it, c.hojas, getLang())),
      it.formula ? h('p', { class: 'fuente' }, t('cant.formula', it.formula)) : null,
      h('div', { class: 'chips' }, h('span', { class: 'conf ' + it.confianza }, `${SIMBOLO[it.confianza]} ${t(claveConf)}`)),
      it.requiere_aprobacion && !ok ? h('p', { class: 'muted' }, h('b', {}, '▲ '), t('cant.needsReview')) : null,
      ok ? h('p', { class: 'muted' }, '✓ ' + t('cant.approved', it.aprobado_por)) : null,
      acciones(
        h('button', { class: ok ? '' : 'primary', disabled: ok || null, onclick: () => reemplazar(aprobar(it, quien(), ahora())) }, ok ? '✓ ' + t('cant.approve') : t('cant.approve')),
        h('button', { onclick: () => formCorregir(it) }, t('cant.fix'))));
  }

  // ----- usar en costos -----
  function usarEnCostos() {
    const c = C();
    const cat = ent.snapshot.catalogo;
    const { lineas, omitidas } = lineasDesdeItems(c.items, { ids: store.nuevoId, catalogo: cat, hojas: c.hojas, existentes: ent.lineas });
    if (!lineas.length) { toast(t('cant.usedNone'), 'err'); return; }
    let nuevas = 0, act = 0, sinPrecio = 0;
    for (const { linea, existente } of lineas) {
      if (linea.modo !== 'catalogo') sinPrecio++;
      if (tipo === 'bid') {
        if (existente) { existente.cantidad = linea.cantidad; existente.nota = linea.nota; act++; } else { ent.lineas.push(linea); nuevas++; }
      } else {
        const ql = aLineaCotizacion(linea, linea.id);
        if (existente) { existente.cantidad = ql.cantidad; existente.nota = ql.nota; if (ql.personalizada && existente.personalizada) existente.personalizada.nombre = ql.personalizada.nombre; act++; } else { ent.lineas.push(ql); nuevas++; }
      }
    }
    guardarYa();
    toast(t('cant.used', nuevas, act, omitidas.length) + (sinPrecio ? ' ' + t('cant.usedNoPrice') : ''), omitidas.length ? 'warn' : 'ok');
  }

  // ----- pantalla -----
  function pintar() {
    clear(cont);
    const c = C();
    if (!c) { add(cont, h('div', { class: 'empty card' }, h('p', {}, t('cant.empty')), h('p', { class: 'muted' }, t('cant.emptyHint')))); return; }
    const { aprobadas, total } = contarAprobadas(c.items);
    const pend = c.items.filter((i) => i.estado === 'pendiente' && !i.requiere_aprobacion).length;
    add(cont,
      c.ejemplo ? aviso('warn', h('b', {}, t('cant.exampleBadge')), ' ', t('cant.exampleNote')) : null,
      h('div', { class: 'card stack' },
        h('p', { class: 'muted' }, t('cant.plan', c.plano.archivo, c.plano.revision, c.plano.fecha)),
        h('div', { class: 'progreso', role: 'status', id: 'cant-progreso' }, t('cant.progress', aprobadas, total)),
        h('div', { class: 'barra', 'aria-hidden': 'true' }, h('i', { style: `transform:scaleX(${total ? aprobadas / total : 0})` })),
        h('button', { id: 'cant-aprobar-altas', onclick: () => { if (!pend) { toast(t('cant.approveHighNone'), 'warn'); return; } c.items = aprobarAltas(c.items, quien(), ahora()); guardar(); pintar(); } }, t('cant.approveHigh')),
        h('button', { id: 'cant-usar', class: 'primary block', onclick: usarEnCostos }, t('cant.use'))),
      c.advertencias.length ? aviso('warn', h('div', {}, h('b', {}, t('cant.warnTitle')), h('ul', { class: 'razones' }, c.advertencias.map((w) => { const clave = 'cant.warn.' + w.codigo; return h('li', {}, tr(getLang(), clave, w.ruta, ...w.args)); })))) : null,
      GRUPOS.flatMap((g) => { const its = c.items.filter((i) => i.grupo === g); const claveG = 'cant.grupo.' + g; return its.length ? [h('h2', {}, t(claveG)), ...its.map(tarjeta)] : []; }),
      c.supuestos.length ? h('div', { class: 'card' }, h('h2', {}, t('cant.assumptions')), h('ul', {}, c.supuestos.map((s) => h('li', {}, s)))) : null,
      c.dudas.length ? h('div', { class: 'card' }, h('h2', {}, t('cant.doubts')), h('ul', {}, c.dudas.map((s) => h('li', {}, s)))) : null,
      h('button', { class: 'danger block', id: 'cant-quitar', onclick: () => { const previa = ent.cantidades; ent.cantidades = null; guardarYa(); pintar(); deshacer(t('cant.cleared'), () => { ent.cantidades = previa; guardarYa(); pintar(); }); } }, t('cant.clear')));
  }

  add(body,
    h('div', { class: 'card stack' }, h('h2', {}, t('cant.title')), h('p', {}, t('cant.intro')), h('p', { class: 'muted' }, t('cant.local')),
      h('label', { class: 'btn primary block', for: 'cant-file', id: 'cant-importar' }, t('cant.import')), fileInput,
      field({ label: t('cant.pasteLabel'), area: true, id: 'cant-pegar', onInput: (v) => { pegado = v; } }),
      h('button', { class: 'block', id: 'cant-pegar-btn', onclick: () => { const ta = document.getElementById('cant-pegar'); pegado = ta ? ta.value : pegado; if (pegado.trim()) importar(pegado); } }, t('cant.pasteBtn')),
      h('button', { class: 'block', id: 'cant-ejemplo', onclick: () => importar(JSON.stringify(EJEMPLO_PLAN)) }, t('cant.loadExample')),
      msgs),
    cont);
  pintar();
}
