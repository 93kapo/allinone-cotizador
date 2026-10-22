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
test('sw: versión 1.4.0, navegación offline usa "./" y se re-empaquetan respuestas redirigidas', () => {
  assert.match(sw, /const VERSION = 'cotizador-v1\.4\.0'/);
  assert.match(sw, /c\.match\('\.\/'\)/);
  assert.match(sw, /r\.redirected \? new Response\(r\.body, \{ status: r\.status, statusText: r\.statusText, headers: r\.headers \}\)/);
  assert.ok(!sw.includes("c.addAll"), 'addAll no puede re-empaquetar respuestas');
});
test('manifest: start_url y scope son "./"', () => {
  const m = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './');
});
