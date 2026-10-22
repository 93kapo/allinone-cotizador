import test from 'node:test';
import assert from 'node:assert/strict';
import { analizarAlcance, notaAjuste, normalizar } from '../bids-fit.js';
import { ALCANCE_EJEMPLO } from '../bids-ejemplo.js';
import { dict } from '../i18n.js';

const keys = (arr) => arr.map((x) => x.key).sort();

test('fit: ejemplo Publix -> oficios relevantes exactos y subcontratista', () => {
  const r = analizarAlcance(ALCANCE_EJEMPLO);
  assert.deepEqual(keys(r.relevantes), ['carpentry', 'drywall', 'electrical', 'flooring', 'paint', 'tile']);
  const coin = r.relevantes.flatMap((x) => x.coincidencias).sort();
  assert.deepEqual(coin, ['electrical', 'finish carpentry', 'gypsum drywall', 'hard tile', 'millwork', 'paints and coatings', 'resilient flooring']);
  assert.equal(r.relevantes.find((x) => x.key === 'electrical').sub, true);
  assert.equal(r.veredicto, 'sub');
  assert.match(notaAjuste(r, 'es'), /SUBCONTRATISTA/);
  assert.match(notaAjuste(r, 'en'), /SUBCONTRACTOR/);
});
test('fit: oficios que NO hace quedan fuera (y no se mezclan con los propios)', () => {
  const r = analizarAlcance(ALCANCE_EJEMPLO);
  for (const k of ['earthwork', 'steel', 'roofing', 'plumbing', 'hvac', 'fire', 'paving', 'concrete', 'demolition', 'roughcarp']) assert.ok(keys(r.fuera).includes(k), k);
  assert.ok(!keys(r.relevantes).includes('roughcarp'));
  assert.ok(r.sinClasificar.includes('signage') && r.sinClasificar.includes('blinds'));
  assert.ok(!r.sinClasificar.includes('plumbing'));
});
test('fit: rough carpentry no cuenta como finish carpentry; fire alarm no es electrical; roof accessories fuera', () => {
  assert.deepEqual(keys(analizarAlcance('rough carpentry').relevantes), []);
  const f = analizarAlcance('fire alarm');
  assert.deepEqual(keys(f.relevantes), []); assert.deepEqual(keys(f.fuera), ['fire']);
  assert.deepEqual(keys(analizarAlcance('roof accessories').fuera), ['roofing']);
  assert.deepEqual(keys(analizarAlcance('roof deck, metal deck').relevantes), []);
  assert.deepEqual(keys(analizarAlcance('wood deck').relevantes), ['decks']);
  assert.deepEqual(keys(analizarAlcance('acoustical ceiling tile').relevantes), []);
});
test('fit: palabras clave en español y sin acentos', () => {
  const r = analizarAlcance('Pintura interior, tablaroca, pisos de vinil, azulejo en baños, carpintería de acabado, electricidad');
  assert.deepEqual(keys(r.relevantes), ['bathkitchen', 'carpentry', 'drywall', 'electrical', 'flooring', 'paint', 'tile']);
  assert.equal(normalizar('Cocinás'), ' cocinas ');
});
test('fit: sin partidas propias -> proyecto no encaja; solo electricidad tampoco; vacío', () => {
  const a = analizarAlcance('earthwork, plumbing, HVAC');
  assert.equal(a.veredicto, 'no-encaja'); assert.match(notaAjuste(a, 'es'), /no encaja/);
  const b = analizarAlcance('electrical');
  assert.equal(b.veredicto, 'no-encaja'); assert.equal(b.soloSub, true);
  const c = analizarAlcance('   ');
  assert.equal(c.veredicto, 'vacio'); assert.equal(c.vacio, true);
});
test('fit: límites de palabra (paint no dentro de otra palabra)', () => {
  assert.deepEqual(keys(analizarAlcance('repainting paintball').relevantes), []);
  assert.ok(dict.es['bid.fit.sub'] && dict.en['bid.fit.sub']);
});

test('fit: alcance extraído del fixture real -> oficios propios y fuera de alcance', async () => {
  const { readFileSync } = await import('node:fs');
  const { parsearInvitacion } = await import('../bids-parse.js');
  const r = analizarAlcance(parsearInvitacion(readFileSync(new URL('./fixtures/invitacion-publix-real.txt', import.meta.url), 'utf8')).alcance);
  assert.deepEqual(keys(r.relevantes), ['carpentry', 'drywall', 'electrical', 'flooring', 'paint', 'tile']);
  assert.deepEqual(r.relevantes.flatMap((x) => x.coincidencias).sort(), ['electrical', 'finish carpentry', 'gypsum drywall', 'hard tile', 'millwork', 'paints and coatings', 'resilient flooring']);
  for (const k of ['earthwork', 'steel', 'plumbing', 'hvac', 'fire', 'roofing', 'concrete', 'demolition', 'roughcarp']) assert.ok(keys(r.fuera).includes(k), k);
  assert.equal(r.veredicto, 'sub');
});
