import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const lum = (hex) => {
  const c = hex.replace('#', ''); const v = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const V = {}; for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) V[m[1]] = m[2];

test('contraste: la función da 21:1 negro/blanco y 1:1 igual/igual', () => {
  assert.ok(Math.abs(contraste('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(contraste('#12333A', '#12333A') - 1) < 1e-9);
});
// [texto, fondo, mínimo, descripción]. Principal >= 7, secundario >= 4.5.
const PARES = [
  [V.ink, V.bg, 7, 'texto principal sobre fondo'], [V.ink, V.card, 7, 'texto principal sobre tarjeta'],
  ['#ffffff', V.ink, 7, 'encabezado: blanco sobre tinta'],
  [V['ink-t'], V.teal, 7, 'botón principal: tinta oscura sobre teal (nunca blanco)'], [V.ink, '#E3F5F9', 7, 'tinta sobre kpi/aviso info'],
  [V.muted, V.bg, 4.5, 'secundario sobre fondo'], [V.muted, V.card, 4.5, 'secundario sobre tarjeta'], [V.muted, '#E3F5F9', 4.5, 'secundario sobre kpi'],
  [V.muted, '#eceff0', 4.5, 'secundario sobre badge gris'], ['#33474c', '#eceff0', 4.5, 'chip sin clasificar'],
  [V.err, V.card, 4.5, 'botón peligro sobre blanco'], ['#7a1209', V['err-bg'], 7, 'aviso de error'],
  ['#5c2d00', V['warn-bg'], 7, 'aviso/advertencia'], ['#05422e', V['ok-bg'], 7, 'aviso ok / chips ok'],
  ['#7a3a05', V['warn-bg'], 4.5, 'etiqueta ESTIMADO'], [V.ink, V['ok-bg'], 7, 'kpi bueno'], [V.ink, V['warn-bg'], 7, 'kpi ámbar'], [V.ink, V['err-bg'], 7, 'kpi rojo'],
  ['#ffffff', V.ink, 7, 'barra Deshacer: texto'], [V['ink-t'], V.teal, 7, 'barra Deshacer / pasos / etiqueta Guardado: tinta sobre teal'],[V['ink-t'], '#7fdcef', 7, 'botón principal al pulsar'],
];
test('contraste: pares de colores de la interfaz cumplen 7:1 (principal) y 4.5:1 (secundario)', () => {
  const mal = [];
  for (const [fg, bg, min, d] of PARES) { const r = contraste(fg, bg); if (r < min) mal.push(`${d}: ${fg} sobre ${bg} = ${r.toFixed(2)} (< ${min})`); }
  assert.deepEqual(mal, []);
});
test('contraste: el texto blanco nunca va sobre teal', () => {
  assert.ok(contraste('#ffffff', V.teal) < 4.5); // por eso se usa tinta oscura
  assert.ok(!/\.primary[^}]*color:\s*#fff/i.test(css));
});

test('contraste 1A: botón Borrar (blanco sobre rojo), Archivar (blanco sobre tinta) y aviso de atención', () => {
  assert.ok(contraste('#ffffff', V.err) >= 4.5, 'Borrar');
  assert.ok(contraste('#ffffff', V.ink) >= 7, 'Archivar');
  assert.ok(contraste(V.ink, V['warn-bg']) >= 7, 'aviso de atención');
  assert.ok(contraste(V.muted, V.bg) >= 4.5, 'texto de ayuda de las tarjetas');
});
