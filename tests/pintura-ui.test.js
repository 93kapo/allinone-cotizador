import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dict, tr } from '../i18n.js';
const root = new URL('../', import.meta.url);
const leer = (f) => readFileSync(new URL(f, root), 'utf8');
const css = leer('css/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
const reglas = [];
for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) { const decl = {}; for (const d of m[2].split(';')) { const i = d.indexOf(':'); if (i > 0) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim(); } reglas.push({ sel: m[1].trim(), decl }); }
const px = (v) => (v.endsWith('rem') ? parseFloat(v) * 18 : parseFloat(v));

test('1B: claves dinámicas (el escáner solo ve t(\'literal\')) existen en ES y EN, distintas entre sí', () => {
  const claves = [];
  for (const k of ['paredInt', 'techo', 'trim', 'puerta', 'paredExt']) claves.push('pint.task.' + k);
  for (const k of ['altura', 'dificil', 'acceso', 'ocupado']) claves.push('pint.f.' + k);
  for (const k of ['chico', 'mediano', 'grande']) claves.push('pint.m.tpl.' + k);
  for (const k of ['verde', 'ambar', 'rojo']) claves.push('pint.bar.' + k);
  for (const k of ['baja', 'media', 'alta']) claves.push('pint.g.' + k);
  for (const k of ['chico', 'mediano', 'grande', 'enorme']) claves.push('pint.g.size.' + k);
  for (const k of ['precioPintura', 'cobertura', 'primer', 'supervision', 'seguro', 'compensacion', 'medidas', 'crew']) claves.push('pint.missing.' + k);
  for (const k of ['changeOrders', 'punch', 'w9', 'insurance', 'tools', 'epa', 'cleanup']) claves.push('pint.ord.t.' + k);
  claves.push('pint.step1', 'pint.step2', 'pint.step3', 'pint.step4', 'pint.step5', 'pint.epaYes', 'pint.epaUnknown', 'pint.a.short', 'pint.b.short', 'pint.c.chooseHours', 'nav.advanced', 'home.newPaint', 'home.newPaintShort');
  for (const k of claves) { assert.ok(dict.es[k] && dict.en[k], k); }
  for (const k of claves.filter((x) => !/\.short$|task\.|trim|primer|pint\.f\.altura/.test(x))) assert.notEqual(dict.es[k], dict.en[k], k);
});
test('1B: textos clave del flujo (ES) y avisos obligatorios', () => {
  assert.equal(dict.es['pint.step1'], '¿Qué trabajo?');
  assert.equal(tr('es', 'pint.range', 52.5, 106.3, 74.5), 'Entre 52.5 y 106.3 horas (probable 74.5)');
  assert.equal(tr('es', 'pint.bar.keep', '$40.00'), 'Le quedan $40.00 de cada $100');
  assert.equal(dict.es['pint.c.choosePeople'], 'Elija cuántas personas');
  assert.match(dict.es['pint.c.crowded'], /Más personas aquí se estorban/);
  assert.match(dict.es['pint.h.planning'], /estimados; con 3 a 5 trabajos terminados se ajustan/);
  assert.match(dict.es['pint.a.legal'], /1099\/W-2/); assert.match(dict.es['pint.a.legal'], /W-9/); assert.match(dict.es['pint.a.legal'], /contador o abogado/);
  assert.match(dict.es['pint.ord.lawyer'], /abogado/); assert.match(dict.en['pint.ord.lawyer'], /attorney/);
  assert.match(dict.es['pint.s.neverSends'], /nunca envía nada/);
  assert.match(dict.es['pint.m.tabletNote'], /tablet o en una computadora/);
  assert.match(dict.es['pint.b.compMissing'], /agente de seguros/);
  assert.ok(!dict.es['pint.bar.rojo'].includes('CONFIRMO'), 'la frase de confirmación se pasa como argumento, no vive en el diccionario');
});
test('1B css: todo el texto del flujo de pintura >= 18px y controles >= 48px', () => {
  const r = reglas.find((x) => x.sel.startsWith('.pint p,'));
  assert.ok(r && px(r.decl['font-size']) >= 18);
  for (const sel of ['button.origen', '.pint .steps button', '.pint .etq', '.stepper-txt', '.resultado-ctl', '.precio-barra', '.pint .grande,button.grande']) {
    const x = reglas.find((y) => y.sel === sel); assert.ok(x, sel); assert.ok(px(x.decl['font-size']) >= 18, sel);
  }
  assert.ok(px(reglas.find((y) => y.sel === 'button.origen').decl['min-height']) >= 48);
  assert.ok(px(reglas.find((y) => y.sel === '.det summary').decl['min-height']) >= 48);
  assert.ok(px(reglas.find((y) => y.sel === 'button.primary.block.grande').decl['min-height']) >= 56);
});
test('1B css: la barra de precio queda encima de las pestañas y el Deshacer y el contenido suben con --precio-h', () => {
  const b = reglas.find((y) => y.sel === '.precio-barra');
  assert.equal(b.decl.position, 'fixed');
  assert.match(b.decl.bottom, /var\(--nav-h\)/); assert.match(b.decl.bottom, /env\(safe-area-inset-bottom\)/);
  assert.match(reglas.find((y) => y.sel === '.undo-wrap').decl.bottom, /var\(--precio-h\)/);
  assert.match(reglas.find((y) => y.sel === 'body').decl['padding-bottom'], /var\(--precio-h\)/);
  assert.match(css, /--precio-h:0px/);
  for (const sem of ['verde', 'ambar', 'rojo']) assert.ok(css.includes(`.precio-barra[data-sem="${sem}"]`));
});
test('1B: pintura.js no importa de app.js (evita el ciclo) y la barra siempre lleva texto además de color', () => {
  const src = leer('pintura.js');
  assert.ok(!/from '\.\/app\.js'/.test(src));
  assert.match(src, /estado-sem/);
});
test('1B: el PDF al cliente de pintura no imprime líneas de costo y la orden de trabajo existe', () => {
  const src = leer('pdf.js');
  assert.match(src, /esPintura\) \{[\s\S]{0,200}alcancePintura/);
  assert.match(src, /export async function generarPdfOrdenTrabajo/);
  assert.match(src, /\['si', 'nose'\]\.includes\(q\.pintura\?\.antes1978\)/);
});
