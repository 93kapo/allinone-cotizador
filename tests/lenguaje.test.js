import test from 'node:test';
import assert from 'node:assert/strict';
import { dict } from '../i18n.js';

// Jerga que NO debe aparecer en las cadenas en español de la interfaz (el inglés técnico del PDF en inglés se conserva).
const JERGA = [
  /\bbreakouts?\b/i, /\bburden\b/i, /\boverhead\b/i, /\bmark-?ups?\b/i, /\bmargen(?:es)?\b/i, /\btakeoffs?\b/i, /\bscope\b/i,
  /\bGC\b/, /\bretainage\b/i, /\bbids?\b/i, /\bcosteo\b/i, /\bassemblies\b/i, /\bprecio piso\b/i,
  /\b(?:el|del|bajo el|sobre el|margen de) piso\b/i, // "piso" como precio mínimo (no el piso de una casa)
];

// GLOSARIO / ALLOWLIST: excepciones explícitas por clave. Cada una lleva su motivo; todo lo demás debe pasar limpio.
const PERMITIDO = {
  'rooms.floor': 'Piso = suelo de un cuarto (medida), no el "precio piso".',
};

test('lenguaje: ninguna cadena en español usa la jerga de la lista (salvo el glosario documentado)', () => {
  const malas = [];
  for (const [k, v] of Object.entries(dict.es)) {
    if (k in PERMITIDO) continue;
    for (const re of JERGA) if (re.test(v)) malas.push(`${k}: "${v}" (${re})`);
  }
  assert.deepEqual(malas, []);
});
test('lenguaje: la allowlist solo contiene claves que existen y que de verdad lo necesitan', () => {
  for (const k of Object.keys(PERMITIDO)) {
    assert.ok(k in dict.es, k);
    assert.ok(JERGA.some((re) => re.test(dict.es[k])) || /piso/i.test(dict.es[k]), `${k} ya no necesita excepción`);
  }
});
test('lenguaje: explicación de la ganancia en pantalla y aviso del mínimo (ES y EN)', () => {
  assert.match(dict.es['rev.perHundred'], /De cada \$100 que cobra, le quedan \{0\}/);
  assert.match(dict.es['rev.dontGoBelow'], /No baje de \{0\}/);
  assert.match(dict.es['set.floor'], /precio mínimo, no bajar de aquí/);
  assert.equal(dict.es['bidstep.costos'], 'Costos');
  assert.equal(dict.es['ui.saved'], 'Guardado ✓');
});
