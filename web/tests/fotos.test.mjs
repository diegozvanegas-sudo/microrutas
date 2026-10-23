// Fotos a PDF: lectura de EXIF (fecha, GPS, orientación), orden y pie de foto. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerExif } from '../src/subsanaciones/exif.js';
import { ordenar, pieDeFoto, fechaCorta } from '../src/subsanaciones/fotospdf.js';

// JPG mínimo con un bloque EXIF (TIFF little endian): orientación, fecha de captura y GPS
function jpgConExif({ fecha = '2026:10:22 08:15:03', lat = [6, 15, 6.6], lon = [75, 33, 48.9], ns = 'N', ew = 'W', orientacion = 6 } = {}) {
  const t = [], u16 = (n) => [n & 255, n >> 8], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const entrada = (tag, tipo, cuenta, valor) => [...u16(tag), ...u16(tipo), ...u32(cuenta), ...valor];
  const racionales = (v) => v.flatMap((x) => [...u32(Math.round(x * 100)), ...u32(100)]);
  // Diseño: cabecera 8 · IFD0 (3 entradas) · IFD Exif (1) · IFD GPS (4) · datos
  const ifd0 = 8, ifdExif = ifd0 + 2 + 3 * 12 + 4, ifdGps = ifdExif + 2 + 12 + 4, datos = ifdGps + 2 + 4 * 12 + 4;
  const fechaOff = datos, latOff = fechaOff + 20, lonOff = latOff + 24;
  t.push(0x49, 0x49, ...u16(42), ...u32(ifd0));
  t.push(...u16(3), ...entrada(0x0112, 3, 1, [...u16(orientacion), 0, 0]), ...entrada(0x8769, 4, 1, u32(ifdExif)), ...entrada(0x8825, 4, 1, u32(ifdGps)), ...u32(0));
  t.push(...u16(1), ...entrada(0x9003, 2, 20, u32(fechaOff)), ...u32(0));
  t.push(...u16(4), ...entrada(1, 2, 2, [ns.charCodeAt(0), 0, 0, 0]), ...entrada(2, 5, 3, u32(latOff)),
    ...entrada(3, 2, 2, [ew.charCodeAt(0), 0, 0, 0]), ...entrada(4, 5, 3, u32(lonOff)), ...u32(0));
  t.push(...[...fecha].map((c) => c.charCodeAt(0)), 0, ...racionales(lat), ...racionales(lon));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, ...[(app1.length + 2) >> 8, (app1.length + 2) & 255], ...app1, 0xFF, 0xDA, 0, 2, 0xFF, 0xD9]);
}

test('EXIF: fecha de captura, GPS (con signo por N/S y E/W) y orientación', () => {
  const ex = leerExif(jpgConExif());
  assert.equal(ex.fecha, '2026-10-22 08:15:03');
  assert.equal(ex.orientacion, 6);
  assert.deepEqual(ex.gps, { lat: 6.251833, lon: -75.563583 });
  assert.equal(leerExif(jpgConExif({ ns: 'S', ew: 'E' })).gps.lat, -6.251833);
});

test('EXIF: foto sin datos o archivo que no es JPG', () => {
  assert.deepEqual(leerExif(new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA, 0, 2])), { fecha: null, gps: null, orientacion: 1 });
  assert.deepEqual(leerExif(new Uint8Array([0x89, 0x50, 0x4E, 0x47])), { fecha: null, gps: null, orientacion: 1 });
  assert.equal(leerExif(jpgConExif({ fecha: '0000:00:00 00:00:00' })).fecha, null);
});

test('orden por fecha de la foto (sin fecha: la del archivo) o por nombre', () => {
  const f = (nombre, fecha, mod) => ({ nombre, fecha, archivo: { lastModified: mod } });
  const lista = [f('foto10.jpg', '2026-10-22 09:00:00'), f('foto2.jpg', '2026-10-22 08:00:00'), f('foto3.jpg', null, Date.UTC(2026, 9, 22, 8, 30))];
  assert.deepEqual(ordenar(lista, 'fecha').map((x) => x.nombre), ['foto2.jpg', 'foto3.jpg', 'foto10.jpg']);
  assert.deepEqual(ordenar(lista, 'nombre').map((x) => x.nombre), ['foto2.jpg', 'foto3.jpg', 'foto10.jpg']);
});

test('pie de foto con fecha, hora y GPS, o el aviso de lo que falta', () => {
  assert.equal(fechaCorta('2026-10-22 08:15:03'), '22/10/2026 08:15');
  assert.equal(pieDeFoto(3, { nombre: 'a.jpg', fecha: '2026-10-22 08:15:03', gps: { lat: 6.251833, lon: -75.563583 } }), '3. a.jpg  ·  22/10/2026 08:15  ·  6.251833, -75.563583');
  assert.equal(pieDeFoto(1, { nombre: 'b.jpg', fecha: null, gps: null }), '1. b.jpg  ·  sin fecha de captura  ·  sin GPS');
});
