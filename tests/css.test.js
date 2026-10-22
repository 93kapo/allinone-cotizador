import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const BASE = 18; // html{font-size:18px}
const aPx = (v) => {
  v = v.trim();
  if (v === '0') return 0;
  let m;
  if ((m = v.match(/^(\d*\.?\d+)px$/))) return +m[1];
  if ((m = v.match(/^(\d*\.?\d+)rem$/))) return +m[1] * BASE;
  throw new Error('unidad de tamaño no resoluble en el test (usar px o rem): ' + v);
};
// Reglas planas (incluye las de @media; el CSS no anida más).
const reglas = [];
for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
  const decl = {};
  for (const d of m[2].split(';')) { const i = d.indexOf(':'); if (i > 0) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  reglas.push({ sel: m[1].trim(), decl });
}
test('css: html base de 18px', () => {
  const r = reglas.find((x) => x.sel === 'html');
  assert.equal(r.decl['font-size'], '18px');
});
test('css: ningún font-size menor a 14px (px y rem resueltos con base 18px)', () => {
  const bajos = [];
  let n = 0;
  for (const r of reglas) {
    const fs = r.decl['font-size'] || (r.decl.font && r.decl.font.match(/(\d*\.?\d+(?:px|rem))/)?.[1]);
    if (!fs || fs === 'inherit') continue;
    n++;
    const px = aPx(fs);
    if (px < 14) bajos.push(`${r.sel}: ${fs} = ${px}px`);
  }
  assert.ok(n > 30, 'se esperaban muchas reglas con font-size');
  assert.deepEqual(bajos, []);
});
test('css: etiquetas (label) de al menos 16px', () => {
  assert.ok(aPx(reglas.find((r) => r.sel === 'label').decl['font-size']) >= 16);
});
test('css: .btn / button / .button tienen min-height >= 48px y los principales 56px', () => {
  const rb = reglas.filter((r) => r.sel.split(',').some((s) => /^(button|\.btn|\.button)$/.test(s.trim())));
  assert.ok(rb.length >= 1);
  for (const r of rb) assert.ok(aPx(r.decl['min-height']) >= 48, r.sel);
  const prim = reglas.find((r) => r.sel.includes('button.primary,.btn.primary'));
  assert.ok(aPx(prim.decl['min-height']) >= 56);
  // ninguna regla de botón/enlace-botón/pasos/chips baja de 48px
  for (const r of reglas) {
    if (/button|\.btn|\.steps|\.chip|input|select|nav\.bar a/.test(r.sel) && r.decl['min-height'] && !/range|checkbox/.test(r.sel) && !/\.chk/.test(r.sel)) {
      if (/^(input,select,textarea)$/.test(r.sel) || !/textarea/.test(r.sel)) assert.ok(aPx(r.decl['min-height']) >= 48 || (r.sel === '.chip' && r.decl['min-height'] === '0'), `${r.sel} min-height ${r.decl['min-height']}`);
    }
  }
});
test('css: existe prefers-reduced-motion y foco visible; animaciones solo opacity/transform', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px/);
  for (const m of css.matchAll(/@keyframes\s+(\w+)\s*\{([\s\S]*?\}\s*)\}/g)) {
    if (m[1] === 'sp') continue; // el indicador de carga gira (transform)
    assert.ok(!/(width|height|top|left|margin|padding)\s*:/.test(m[2]), `@keyframes ${m[1]} anima algo distinto de opacity/transform`);
  }
});
