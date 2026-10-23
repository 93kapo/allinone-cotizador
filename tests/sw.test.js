import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const SHELL = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

test('sw: cada archivo del SHELL existe en disco', () => {
  const faltan = SHELL.filter((f) => f !== './' && !existsSync(new URL(f, root)));
  assert.deepEqual(faltan, []);
});
test('sw: todo import relativo de los módulos de la app está en el SHELL (si no, falla sin conexión)', () => {
  const faltan = [];
  for (const f of SHELL.filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(new URL(f, root), 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)'\.\/([^']+\.js)'/g)) if (!SHELL.includes(m[1])) faltan.push(`${f} importa ${m[1]}`);
  }
  assert.deepEqual(faltan, []);
});
test('sw: versión 1.6.1, navegación offline usa "./" y se re-empaquetan respuestas redirigidas', () => {
  assert.match(sw, /const VERSION = 'cotizador-v1\.6\.1'/);
  assert.match(sw, /c\.match\('\.\/'\)/);
  assert.match(sw, /r\.redirected \? new Response\(r\.body, \{ status: r\.status, statusText: r\.statusText, headers: r\.headers \}\)/);
  assert.ok(!sw.includes("c.addAll"), 'addAll no puede re-empaquetar respuestas');
});
test('manifest: start_url y scope son "./"', () => {
  const m = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './');
});

test('sw 1.5.0: los módulos nuevos (gesto, lista, papelera, cola, borrado) están en el SHELL', () => {
  for (const f of ['gesto.js', 'lista.js', 'papelera.js', 'cola.js', 'borrado.js']) assert.ok(SHELL.includes(f), f);
});

test('sw 1.6.0: los módulos de pintura (flujo, motor puro y datos) están en el SHELL', () => {
  for (const f of ['pintura.js', 'pintura-motor.js', 'pintura-datos.js']) assert.ok(SHELL.includes(f), f);
});
test('aviso de versión nueva: app.js lo registra y hay textos ES/EN y estilo', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /controllerchange/);
  assert.match(app, /ui\.updateAvail/);
  assert.match(app, /ui\.updateNow/);
  const i18n = fs.readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');
  assert.equal((i18n.match(/'ui\.updateAvail'/g) || []).length, 2);
  assert.equal((i18n.match(/'ui\.updateNow'/g) || []).length, 2);
  assert.match(fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8'), /\.upd-wrap/);
});
