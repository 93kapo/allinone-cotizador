// precios.js - pantalla "Precios y tarifas" (catálogo editable).
import { h } from './util.js';
import { t } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { field, moneyField, numField, pctField, toast, aviso } from './ui.js';
import { catalogoInicial } from './defaults.js';
import { nuevoId } from './store.js';

export async function pantallaPrecios({ shell }) {
  const c = S.catalogo;
  const guardar = async () => { try { await store.saveCatalogo(c); toast(t('ui.saved')); } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); } };
  const est = (o) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: o.estimado || null, onchange: (e) => { o.estimado = e.target.checked; guardar(); } }), t('price.estimated'));
  const fuente = (o) => field({ label: t('price.source'), value: o.fuente || '', onInput: (v) => { o.fuente = v; guardar(); } });
  const sec = (titulo, lista, render, nuevo) => h('details', { class: 'card', open: true }, h('summary', { style: 'font-weight:600;min-height:44px;display:flex;align-items:center' }, titulo),
    ...lista.map((o) => h('div', { class: 'card stack', style: 'background:#F3F8F9' }, render(o))),
    nuevo ? h('button', { class: 'block', onclick: () => { nuevo(); guardar().then(() => location.reload()); } }, '+ ' + t('price.add')) : null);

  const tarifas = sec(t('price.rates'), c.tarifas, (o) => [
    h('b', {}, o.nombre, o.estimado ? h('span', { class: 'est' }, t('price.estBadge')) : null),
    field({ label: t('price.name'), value: o.nombre, onInput: (v) => { o.nombre = v; guardar(); } }),
    h('div', { class: 'row' }, moneyField(t('price.perHour'), o.cents, (v) => { o.cents = v; o.estimado = false; guardar(); }),
      moneyField('p10', o.p10 || 0, (v) => { o.p10 = v; guardar(); }), moneyField('p90', o.p90 || 0, (v) => { o.p90 = v; guardar(); })), est(o), fuente(o)],
    () => c.tarifas.push({ id: 'tar-' + nuevoId(), nombre: 'Nueva tarifa', cents: 2000, estimado: true, fuente: '' }));

  const materiales = sec(t('price.materials'), c.materiales, (o) => [
    h('b', {}, o.nombre, ' ', h('span', { class: 'muted' }, '/ ' + o.unidad), o.estimado ? h('span', { class: 'est' }, t('price.estBadge')) : null),
    field({ label: t('price.name'), value: o.nombre, onInput: (v) => { o.nombre = v; guardar(); } }),
    h('div', { class: 'row' }, moneyField(t('price.unitPrice'), o.cents, (v) => { o.cents = v; o.estimado = false; guardar(); }),
      numField(t('price.coverage'), o.cobertura || 0, (v) => { o.cobertura = v || undefined; guardar(); }),
      pctField(t('price.waste'), o.desperdicioBp || 0, (v) => { o.desperdicioBp = v; guardar(); })), est(o), fuente(o)],
    () => c.materiales.push({ id: 'mat-' + nuevoId(), nombre: 'Nuevo material', unidad: 'ud', cents: 1000, estimado: true, fuente: '' }));

  const partidas = sec(t('price.assemblies'), c.partidas, (o) => [
    h('b', {}, o.nombre, ' ', h('span', { class: 'muted' }, '/ ' + o.unidad), o.estimado ? h('span', { class: 'est' }, t('price.estBadge')) : null),
    field({ label: t('price.name') + ' (ES)', value: o.nombre, onInput: (v) => { o.nombre = v; guardar(); } }),
    field({ label: t('price.name') + ' (EN)', value: o.nameEn || '', onInput: (v) => { o.nameEn = v; guardar(); } }),
    o.mano ? numField(t('price.productivity', o.unidad), o.mano.productividad, (v) => { o.mano.productividad = v; o.estimado = false; guardar(); }) : null,
    o.mano ? h('div', {}, h('label', {}, t('price.rate')), h('select', { onchange: (e) => { o.mano.tarifaId = e.target.value; guardar(); } }, c.tarifas.map((x) => h('option', { value: x.id, selected: x.id === o.mano.tarifaId }, x.nombre)))) : null,
    o.sub ? h('div', { class: 'row' }, moneyField(t('price.subCost', o.unidad), o.sub.costoUnidadCents, (v) => { o.sub.costoUnidadCents = v; o.estimado = false; guardar(); }),
      pctField(t('price.subMarkup'), o.sub.markupBp || 0, (v) => { o.sub.markupBp = v; guardar(); })) : null,
    o.otrosUnidadCents != null ? moneyField(t('price.otherCost', o.unidad), o.otrosUnidadCents, (v) => { o.otrosUnidadCents = v; o.estimado = false; guardar(); }) : null,
    o.pintura ? numField(t('price.paintCoats'), o.pintura.manos, (v) => { o.pintura.manos = Math.max(1, Math.round(v)); guardar(); }) : null,
    est(o), fuente(o)], null);

  const dificultades = sec(t('price.difficulty'), c.dificultades, (o) => [
    h('b', {}, o.nombre), pctField(t('price.multiplier'), o.multBp, (v) => { o.multBp = Math.max(10000, v); guardar(); }, t('price.multHint'))], null);

  shell(t('nav.prices'), h('div', {},
    h('h1', {}, t('nav.prices')),
    aviso('warn', h('b', {}, t('price.notice'))), h('p', { class: 'muted' }, t('price.snapshotNote')),
    tarifas, materiales, partidas, dificultades,
    h('button', { class: 'danger block', onclick: async () => { if (!confirm(t('price.resetConfirm'))) return; Object.assign(c, catalogoInicial()); await guardar(); location.reload(); } }, t('price.reset'))), '#/precios');
}
