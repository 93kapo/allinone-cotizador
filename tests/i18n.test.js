import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dict, tr } from '../i18n.js';
const root = new URL('../', import.meta.url);
test('todas las claves usadas existen en es y en', () => {
  const usadas = new Set();
  for (const f of readdirSync(root).filter((x) => x.endsWith('.js') && x !== 'i18n.js')) {
    const src = readFileSync(new URL(f, root), 'utf8');
    for (const m of src.matchAll(/\b(?:t\(|tr\(lang, |tr\(L, )'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g)) usadas.add(m[1]);
  }
  const faltan = [...usadas].filter((k) => !(k in dict.es) || !(k in dict.en));
  assert.deepEqual(faltan, []);
  assert.ok(usadas.size > 100);
});
test('es y en tienen las mismas claves y los mismos marcadores {n}', () => {
  assert.deepEqual(Object.keys(dict.es).sort(), Object.keys(dict.en).sort());
  for (const k of Object.keys(dict.es)) {
    const a = (dict.es[k].match(/\{\d+\}/g) || []).sort().join(), b = (dict.en[k].match(/\{\d+\}/g) || []).sort().join();
    assert.equal(a, b, k);
  }
});
test('tr con argumentos', () => { assert.equal(tr('en', 'pdf.validity', 'X', 30), 'This proposal is valid until X (30 days).'); });

// Claves dinámicas / nuevas de la Fase 1A (el escáner de arriba solo ve t('literal')).
test('1A: claves nuevas existen en es y en, con texto distinto y sin vacíos', () => {
  const claves = ['nav.more', 'nav.archived', 'lista.mas', 'lista.archivar', 'lista.desarchivar', 'lista.soloArchivar', 'lista.noBorrarCot', 'lista.noBorrarBid',
    'ui.quoteDeleted', 'ui.quoteArchived', 'ui.bidDeleted', 'ui.bidArchived', 'ui.undoMore', 'ui.undoLabel', 'ui.unarchived',
    'home.attention', 'home.attentionNone', 'home.mine', 'home.search', 'home.fBorrador', 'home.fEnviada', 'home.fGanada', 'home.fArchivadas', 'home.firstQuote',
    'home.swipeHint', 'home.summary', 'home.summaryEmpty', 'home.needName', 'home.needMeasures', 'home.needBoth', 'home.archivedTitle', 'home.archivedEmpty',
    'bid.help', 'bid.archivedState', 'bid.archive', 'quote.archive', 'estado.papelera', 'estado.archivada', 'bidstate.papelera', 'bidstate.archivada'];
  for (const k of claves) {
    assert.ok(dict.es[k] && dict.en[k], k);
    assert.notEqual(dict.es[k], dict.en[k], k);
  }
  for (const e of ['borrador', 'enviada', 'aceptada', 'rechazada']) assert.ok(dict.es['estado.' + e] && dict.en['estado.' + e]);
});
test('1A: la barra de Deshacer lleva nombre accesible con el cliente y el mensaje de varios borrados', () => {
  assert.equal(tr('es', 'ui.undoLabel', 'Ana'), 'Deshacer: Ana');
  assert.equal(tr('es', 'ui.undoMore', 'Cotización borrada.', 2), 'Cotización borrada. (y 2 más)');
  assert.equal(tr('es', 'lista.mas', 'Ana'), 'Más acciones de Ana');
});
