import test from 'node:test';
import assert from 'node:assert/strict';
import { crearGesto, CFG } from '../gesto.js';

const W = 390;
const empezar = (x = 200, y = 300, base = 0) => { const g = crearGesto(); g.down({ x, y, t: 0, ancho: W, base }); return g; };

test('gesto: umbral >= 10px, ratio 1.5, borde 24px (valores del plan)', () => {
  assert.equal(CFG.umbral, 10); assert.equal(CFG.ratio, 1.5); assert.equal(CFG.borde, 24);
});
test('gesto: por debajo de 10px no captura el puntero (sigue pendiente)', () => {
  const g = empezar();
  const r = g.move({ x: 192, y: 300, t: 10 });
  assert.equal(r.fase, 'pendiente'); assert.equal(r.captura, false);
});
test('gesto: horizontal claro (dx>=10 y |dx|>1.5|dy|) captura UNA sola vez', () => {
  const g = empezar();
  const r1 = g.move({ x: 186, y: 304, t: 20 });
  assert.equal(r1.fase, 'arrastrando'); assert.equal(r1.captura, true);
  const r2 = g.move({ x: 150, y: 306, t: 40 });
  assert.equal(r2.fase, 'arrastrando'); assert.equal(r2.captura, false);
});
test('gesto: diagonal (|dx| <= 1.5|dy|) NO captura: es scroll vertical y se suelta', () => {
  const g = empezar();
  const r = g.move({ x: 188, y: 318, t: 20 }); // dx=12 dy=18 -> 12 < 27
  assert.equal(r.fase, 'vertical'); assert.equal(r.captura, false);
  const r2 = g.move({ x: 100, y: 320, t: 40 }); // ya no vuelve a capturar
  assert.equal(r2.fase, 'vertical'); assert.equal(r2.captura, false);
  assert.equal(g.up({ x: 100, t: 60 }).accion, 'nada');
});
test('gesto: vertical puro nunca mueve la fila', () => {
  const g = empezar();
  const r = g.move({ x: 200, y: 340, t: 30 });
  assert.equal(r.fase, 'vertical'); assert.equal(r.offset, 0);
});
test('gesto: toques a < 24px del borde izquierdo o derecho se ignoran (gesto "atrás" del sistema)', () => {
  for (const x of [0, 10, 23, W - 23, W - 1]) {
    const g = empezar(x);
    assert.equal(g.fase, 'ignorado', 'x=' + x);
    const r = g.move({ x: x + (x < 100 ? 80 : -80), y: 300, t: 20 });
    assert.equal(r.captura, false); assert.equal(r.offset, 0);
    assert.equal(g.up({ x: 0, t: 30 }).accion, 'nada');
  }
  assert.equal(empezar(24).fase, 'pendiente');
  assert.equal(empezar(W - 24).fase, 'pendiente');
});
test('gesto: deslizar a la IZQUIERDA lo bastante abre con lado -1', () => {
  const g = empezar();
  g.move({ x: 180, y: 300, t: 50 }); g.move({ x: 120, y: 301, t: 300 });
  const r = g.up({ x: 120, t: 400 }); // dx=-80, lento
  assert.deepEqual([r.accion, r.lado, r.offset, r.suprimirClic], ['abrir', -1, -CFG.abrir, true]);
});
test('gesto: deslizar a la DERECHA lo bastante abre con lado +1', () => {
  const g = empezar();
  g.move({ x: 220, y: 300, t: 50 }); g.move({ x: 290, y: 299, t: 300 });
  const r = g.up({ x: 290, t: 400 }); // dx=+90
  assert.deepEqual([r.accion, r.lado, r.offset], ['abrir', 1, CFG.abrir]);
});
test('gesto: arrastre corto y lento (< mitad) vuelve a cerrar', () => {
  const g = empezar();
  g.move({ x: 185, y: 300, t: 100 }); g.move({ x: 170, y: 300, t: 400 });
  const r = g.up({ x: 170, t: 600 }); // dx=-30
  assert.deepEqual([r.accion, r.offset], ['cerrar', 0]);
});
test('gesto: un empujón rápido corto (>= 0.4 px/ms) también abre', () => {
  const g = empezar();
  g.move({ x: 188, y: 300, t: 10 });
  const r = g.up({ x: 160, t: 80 }); // dx=-40 en 80ms = 0.5 px/ms
  assert.equal(r.accion, 'abrir'); assert.equal(r.lado, -1);
});
test('gesto: el desplazamiento nunca pasa del ancho del botón (offset acotado)', () => {
  const g = empezar();
  g.move({ x: 190, y: 300, t: 10 });
  const r = g.move({ x: 0 + 30, y: 300, t: 100 });
  assert.equal(r.offset, -CFG.abrir);
});
test('gesto: con la fila abierta, deslizar hacia el otro lado la cierra', () => {
  const g = empezar(200, 300, -CFG.abrir);
  g.move({ x: 215, y: 300, t: 40 }); g.move({ x: 280, y: 300, t: 300 });
  const r = g.up({ x: 280, t: 500 }); // base -96 + 80 = -16 -> cierra
  assert.deepEqual([r.accion, r.offset], ['cerrar', 0]);
});
test('gesto: tocar una fila abierta la cierra y no navega; tocar una cerrada es "toque"', () => {
  const a = empezar(200, 300, CFG.abrir);
  assert.deepEqual([a.up({ x: 200, t: 90 }).accion], ['cerrar']);
  const b = empezar();
  const r = b.up({ x: 201, t: 80 });
  assert.deepEqual([r.accion, r.suprimirClic], ['toque', false]);
});
test('gesto: pointercancel devuelve la fila a donde estaba y no deja estado colgado', () => {
  const g = empezar();
  g.move({ x: 180, y: 300, t: 30 });
  const r = g.cancel();
  assert.equal(r.offset, 0); assert.equal(g.fase, 'reposo');
});
test('gesto: sin umbral cruzado el clic NO se suprime; tras arrastrar SÍ', () => {
  const g = empezar();
  g.move({ x: 150, y: 300, t: 30 });
  assert.equal(g.up({ x: 150, t: 400 }).suprimirClic, true);
});
