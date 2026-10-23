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

// --- Fase 1A: tarjetas de Inicio (letra >= 18px), controles táctiles >= 48px, gesto sin animación con movimiento reducido ---
const regla = (sel) => reglas.find((r) => r.sel === sel);
test('css 1A: texto de las tarjetas, avisos y chips grandes de Inicio >= 18px', () => {
  for (const sel of ['.t-cli', '.t-tot', '.t-res', '.t-est .badge', '.chips.grandes .chip', '.aviso-card b', '.aviso-card span']) {
    const r = regla(sel) || reglas.find((x) => x.sel.split(',').map((s) => s.trim()).includes(sel));
    assert.ok(r, 'falta la regla ' + sel);
    assert.ok(aPx(r.decl['font-size']) >= 18, `${sel}: ${r.decl['font-size']}`);
  }
});
test('css 1A: controles de la lista y de la navegación >= 48px (⋯, Borrar, FAB, Más, enlaces de la barra)', () => {
  for (const sel of ['button.mas', '.fila-acc button', '.fab', '.masitem', '.aviso-card']) {
    const r = regla(sel);
    assert.ok(r, 'falta ' + sel);
    assert.ok(aPx(r.decl['min-height']) >= 48, `${sel}: ${r.decl['min-height']}`);
  }
  assert.ok(aPx(regla('button.mas').decl['min-width']) >= 48);
  assert.ok(aPx(regla('nav.bar a,nav.bar button.navbtn').decl['min-height']) >= 64);
  assert.ok(aPx(regla('.fila-acc').decl.width) >= 48);
});
test('css 1A: la fila deslizable solo se desplaza en horizontal (touch-action: pan-y) y no anima con movimiento reducido', () => {
  assert.equal(regla('.fila-cuerpo').decl['touch-action'], 'pan-y');
  assert.match(css, /prefers-reduced-motion:\s*reduce\)\{\*\{animation:none!important;transition:none!important/);
  assert.equal(regla('.fila.arr .fila-cuerpo').decl.transition, 'none'); // sin retardo mientras el dedo arrastra
});
test('css 1A: el FAB sube con la barra Deshacer (--undo-h) y respeta el área segura; el Deshacer también', () => {
  assert.match(regla('.fab').decl.bottom, /var\(--undo-h\)/);
  assert.match(regla('.fab').decl.bottom, /env\(safe-area-inset-bottom\)/);
  assert.match(regla('.undo-wrap').decl.bottom, /env\(safe-area-inset-bottom\)/);
  assert.match(regla('body').decl['padding-bottom'], /var\(--undo-h\)/);
});
