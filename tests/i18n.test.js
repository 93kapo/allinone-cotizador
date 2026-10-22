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
