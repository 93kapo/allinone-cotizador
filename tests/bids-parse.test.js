import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearInvitacion, parseFechaLimite, parseDireccion, fechaUSaISO } from '../bids-parse.js';
import { ALCANCE_EJEMPLO, BREAKOUTS_EJEMPLO } from '../bids-ejemplo.js';

const FIX = readFileSync(new URL('./fixtures/invitacion-publix.txt', import.meta.url), 'utf8');

test('parser: invitación Publix (fixture) extrae los campos', () => {
  const r = parsearInvitacion(FIX);
  assert.equal(r.proyecto, 'Publix - Tower Square - Gainesville, FL (Scrape and Rebuild)');
  assert.equal(r.gc, 'T.D. Farrell Construction, Inc.');
  assert.equal(r.contacto, 'Todd Larkin');
  assert.equal(r.telefono, '(770) 751-5463 x1163');
  assert.equal(r.direccion, '5801 SW 75th Street');
  assert.equal(r.ciudad, 'Gainesville'); assert.equal(r.estadoUS, 'FL'); assert.equal(r.zip, '32608');
  assert.equal(r.fechaLimite, '2026-10-19T14:00');
  assert.equal(r.inicioEst, '2027-02-05'); assert.equal(r.finEst, '2028-02-29');
  assert.equal(r.alcance, ALCANCE_EJEMPLO);
  assert.deepEqual(r.breakouts, BREAKOUTS_EJEMPLO); // "Total" no es un breakout
});
test('parser: lo que no está en el texto queda vacío (no se inventa)', () => {
  const r = parsearInvitacion(FIX);
  assert.equal(r.email, '');
  const v = parsearInvitacion('hola mundo, sin datos');
  for (const k of ['proyecto', 'gc', 'contacto', 'telefono', 'email', 'direccion', 'ciudad', 'estadoUS', 'zip', 'fechaLimite', 'inicioEst', 'finEst', 'alcance']) assert.equal(v[k], '', k);
  assert.deepEqual(v.breakouts, []); assert.deepEqual(v.encontrados, []);
  assert.equal(parsearInvitacion('').proyecto, '');
});
test('parser: correo por regex y proyecto en la línea siguiente', () => {
  const r = parsearInvitacion('BID PROJECT |\nEscuela Norte - Pintura\nContact: Ana Ruiz\nEmail: ana.ruiz@example.com\nPhone: 904.555.0100');
  assert.equal(r.proyecto, 'Escuela Norte - Pintura');
  assert.equal(r.email, 'ana.ruiz@example.com');
  assert.equal(r.contacto, 'Ana Ruiz');
  assert.equal(r.telefono, '904.555.0100');
});
test('parser: el fixture no trae correo ni un segundo teléfono (solo el de la invitación)', () => {
  assert.equal((FIX.match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || []).length, 1);
  assert.ok(!/@/.test(FIX));
});
test('fechas: formatos M-D-YYYY h:mm AM/PM, 12 AM/PM, sin hora, inválidas', () => {
  assert.equal(parseFechaLimite('10-19-2026 2:00 PM'), '2026-10-19T14:00');
  assert.equal(parseFechaLimite('1/5/2027 12:00 AM'), '2027-01-05T00:00');
  assert.equal(parseFechaLimite('1/5/2027 12:30 PM'), '2027-01-05T12:30');
  assert.equal(parseFechaLimite('11-02-2026 9 am'), '2026-11-02T09:00');
  assert.equal(parseFechaLimite('10-19-2026'), '2026-10-19');
  assert.equal(parseFechaLimite('13-40-2026 2:00 PM'), '');
  assert.equal(fechaUSaISO(2, 29, 2028), '2028-02-29'); // 2028 es bisiesto
  assert.equal(fechaUSaISO(2, 29, 2027), '');
});
test('dirección: con y sin coma', () => {
  assert.deepEqual(parseDireccion('5801 SW 75th Street, Gainesville FL 32608'), { direccion: '5801 SW 75th Street', ciudad: 'Gainesville', estadoUS: 'FL', zip: '32608' });
  assert.deepEqual(parseDireccion('100 Main St, Jacksonville, FL 32202-1234'), { direccion: '100 Main St', ciudad: 'Jacksonville', estadoUS: 'FL', zip: '32202' });
  assert.deepEqual(parseDireccion('Calle sin formato'), { direccion: 'Calle sin formato', ciudad: '', estadoUS: '', zip: '' });
});
