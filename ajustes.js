// ajustes.js - pantalla Ajustes.
import { h, descargar, clear } from './util.js';
import { t, setLang } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { field, pctField, selectField, toast, aviso } from './ui.js';

export async function pantallaAjustes({ shell }) {
  const a = S.ajustes;
  const guardar = async () => { try { await store.saveAjustes(a); toast(t('ui.saved')); } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); } };
  const P = (label, key, hint) => pctField(label, a[key], (v) => { a[key] = v; guardar(); }, hint);
  const E = (label, key, type = 'text') => field({ label, type, value: a.empresa[key] || '', onInput: (v) => { a.empresa[key] = v.trim(); guardar(); } });
  const T = (label, obj, lang) => field({ label, area: true, value: obj[lang], onInput: (v) => { obj[lang] = v; guardar(); } });

  const respaldo = h('div', { class: 'card stack' },
    h('h2', {}, t('set.backup')), h('p', { class: 'muted' }, S.modo === 'local' ? t('set.backupHint') : t('set.backupCloud')),
    h('button', { class: 'block', onclick: async () => descargar(`respaldo-cotizador-${new Date().toISOString().slice(0, 10)}.json`, await store.exportarRespaldo()) }, t('set.export')),
    h('label', { class: 'btn block', style: 'cursor:pointer' }, t('set.import'),
      h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const n = await store.importarRespaldo(await f.text()); S.ajustes = await store.getAjustes(); S.catalogo = await store.getCatalogo(); toast(t('set.imported', n)); }
        catch (err) { toast(t('ui.error') + ': ' + err.message, 'err'); }
      } })),
    h('p', { class: 'muted' }, t('set.backupNoPlans')));

  const emails = h('div', { class: 'card stack' }, h('h2', {}, t('set.allowed')), aviso('warn', t('set.allowedWarn')),
    ...[0, 1, 2].map((i) => field({ label: t('set.email') + ' ' + (i + 1), type: 'email', value: a.emailsPermitidos[i] || '', onInput: (v) => { a.emailsPermitidos[i] = v.trim().toLowerCase(); guardar(); } })));

  shell(t('nav.settings'), h('div', {},
    h('h1', {}, t('nav.settings')),
    aviso('warn', t('legal.disclaimer')),
    h('div', { class: 'card stack' }, h('h2', {}, t('set.company')), E(t('set.coName'), 'nombre'), E(t('set.phone'), 'telefono', 'tel'), E(t('set.email'), 'email', 'email'), E(t('set.license'), 'licencia'), E(t('set.address'), 'direccion'), E(t('set.signer'), 'firmante'), E(t('set.insurance'), 'seguro'), h('p', { class: 'muted' }, t('set.signerHint'))),
    h('div', { class: 'card stack' }, h('h2', {}, t('set.costs')),
      P(t('set.salesTax'), 'impuestoVentasBp', t('set.salesTaxHint')),
      P(t('set.burden'), 'burdenBp', t('set.burdenHint')),
      P(t('set.overhead'), 'overheadBp'), P(t('set.warrantyRes'), 'garantiaBp'),
      P(t('set.contingency'), 'contingenciaBp'), P(t('set.contingencyHigh'), 'contingenciaAltaBp', t('set.contingencyHighHint'))),
    h('div', { class: 'card stack' }, h('h2', {}, t('set.margins')),
      P(t('set.floor'), 'margenPisoBp', t('set.floorHint')), P(t('set.target'), 'margenObjetivoBp'),
      P(t('set.netTax'), 'impuestoNetoBp', t('set.netTaxHint'))),
    h('div', { class: 'card stack' }, h('h2', {}, t('set.pdfDefaults')),
      selectField(t('set.pdfLang'), [['en', 'English'], ['es', 'Español']], a.idiomaPdfDefault, (v) => { a.idiomaPdfDefault = v; guardar(); }),
      field({ label: t('set.validity'), type: 'number', value: a.validezDias, onInput: (v) => { a.validezDias = parseInt(v) || 30; guardar(); } }),
      ...['es', 'en'].flatMap((l) => [T(`${t('pdf.warranty')} (${l.toUpperCase()})`, a.garantia, l), T(`${t('pdf.changeOrders')} (${l.toUpperCase()})`, a.changeOrders, l), T(`${t('pdf.exclusions')} (${l.toUpperCase()})`, a.exclusiones, l)])),
    h('div', { class: 'card stack' }, h('h2', {}, t('set.legalTpl')), aviso('warn', t('legal.disclaimer')), h('p', { class: 'muted' }, t('set.legalTplHint')),
      ...['es', 'en'].flatMap((l) => [T(`713.015 (${l.toUpperCase()})`, a.avisoGravamen, l), T(`489.1425 (${l.toUpperCase()})`, a.avisoRecovery, l), T(`EPA RRP (${l.toUpperCase()})`, a.avisoEpa, l)])),
    emails, respaldo,
    h('div', { class: 'card stack' }, selectField(t('set.uiLang'), [['es', 'Español'], ['en', 'English']], a.idiomaUi || 'es', (v) => { a.idiomaUi = v; setLang(v); document.documentElement.lang = v; guardar(); location.reload(); }))), '#/ajustes');
}
