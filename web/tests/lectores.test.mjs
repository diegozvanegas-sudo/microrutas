// Pruebas de lo que se lee a mano o de WhatsApp: coordenadas, mensajes de las cuadrillas, recorrido y textos.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parsearMensaje } from '../src/subsanaciones/mensaje.js';
import { recorridoCorto } from '../src/subsanaciones/recorrido.js';
import { textoDia, textoResumen } from '../src/subsanaciones/whatsapp.js';
import { fijarItems, calcularEstado, limpiarObs } from '../src/subsanaciones/estado.js';
import { claveFecha, aInput, aTexto, metros } from '../src/subsanaciones/util.js';

// coordenadas.js es un script de la página: deja leerCoordenadas en window
globalThis.window = globalThis;
createRequire(import.meta.url)('../public/js/coordenadas.js');
const leer = (t) => window.leerCoordenadas(t);
const cerca = (c, lat, lng) => { assert.ok(c, 'no leyó coordenadas'); assert.ok(Math.abs(c.lat - lat) < 1e-4 && Math.abs(c.lng - lng) < 1e-4, JSON.stringify(c)); };

test('coordenadas: formatos que se escriben o copian', () => {
    cerca(leer('6.2751N 75.5737W'), 6.2751, -75.5737);
    cerca(leer('6.2751, -75.5737'), 6.2751, -75.5737);
    cerca(leer('6,2751 -75,5737'), 6.2751, -75.5737);
    cerca(leer('6°16\'30.4"N 75°34\'25.3"W'), 6.27511, -75.57369);
    cerca(leer('https://maps.google.com/?q=6.2751,-75.5737'), 6.2751, -75.5737);
    // Sin signo, una longitud de 60 a 85 es oeste (Colombia)
    cerca(leer('6.2751 75.5737'), 6.2751, -75.5737);
});

test('coordenadas: corrige un dígito de más y lat/lng invertidas', () => {
    const c = leer('76.19650, -75.58450');
    cerca(c, 6.1965, -75.5845);
    assert.match(c.corregida, /dígito/);
    const inv = leer('-75.5845, 6.1965');
    cerca(inv, 6.1965, -75.5845);
    assert.match(inv.corregida, /invertidas/);
    assert.equal(leer('6.2751, -75.5737').corregida, undefined);
});

test('coordenadas: no confunde lotes, horas ni texto suelto', () => {
    assert.equal(leer('532'), null);
    assert.equal(leer('532, 371'), null);
    assert.equal(leer('Lote 400 a las 10:30'), null);
    assert.equal(leer(''), null);
});

test('coordenadas de foto: texto de la marca de agua leído con OCR', () => {
    const foto = window.coordenadasDeFoto;
    // Marca de agua del lote 287 (Timestamp Camera): fecha arriba, coordenadas abajo
    let c = foto('24 oct 2026 9:58:51 a.m.\n6°17\'38.65722"N 75°34\'37.8"W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.texto, '6°17\'38.65722"N 75°34\'37.8"W');
    // El lector confunde ° con o, las comillas dobles con dos sencillas y el punto con coma
    c = foto('6o17\'38,65722\'\'N 75°34\'37.8\'\'W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.texto, '6°17\'38.65722"N 75°34\'37.8"W');
    // El punto de los segundos se pierde (37.8 -> "37 8"): no se pueden perder los segundos (serían ~1 km)
    c = foto('6°17\'38.65722"N 75°34\'37 8"W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.texto, '6°17\'38.65722"N 75°34\'37.8"W');
    // Latitud y longitud en líneas distintas
    cerca(foto('Medellín\n6°17\'38.6"N\n75°34\'37.8"W'), 6.294056, -75.577167);
    // Decimales (GPS Map Camera)
    c = foto('Lat 6.275100° Long -75.573700°\n24/10/2026 10:15 AM');
    cerca(c, 6.2751, -75.5737);
    assert.equal(c.texto, 'Lat 6.275100° Long -75.573700°');
    assert.equal(c.completa, true);
    assert.equal(foto('24 oct 2026 9:58:51 a.m.'), null);
    // Segundos con comilla sencilla: se arreglan
    c = foto('6°17\'38.65722\'N 75°34\'37.8"W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.completa, true);
    // Se perdieron los segundos de la longitud: se lee, pero no está completa (no se debe usar sin revisar)
    c = foto('6°17\'38.65722"N 75°34\'37 81.');
    assert.equal(c.completa, false);
});

const LOTES = { Z2CC0339: { lote: '339', cuad: '4' }, Z2CC0500: { lote: 'NA', cuad: '4' } };

test('mensaje: lotes ejecutados con fecha y cuadrilla', () => {
    const p = parsearMensaje('Lotes ejecutados el 14-10-2026 por la cuadrilla #2\n532\n371', LOTES);
    assert.equal(p.fecha, '2026-10-14');
    assert.equal(p.cuad, '2');
    assert.deepEqual(p.lotes, ['532', '371']);
    assert.equal(p.tipo, 'hecho');
});

test('mensaje: inicio de labores y código de microrruta', () => {
    const p = parsearMensaje('Buenos días Cuadrilla #4 inicia labores Lote de inicio Z2cc0339', LOTES);
    assert.deepEqual(p.lotes, ['339']);
    assert.equal(p.tipo, 'curso');
    // Microrruta sin número de lote: queda el código
    assert.deepEqual(parsearMensaje('Z2CC0500', LOTES).lotes, ['Z2CC0500']);
});

test('mensaje: terminó uno y pasó al otro', () => {
    const p = parsearMensaje('Terminó el lote 532, pasamos al 371', LOTES);
    assert.deepEqual(p.lotes, ['532', '371']);
    assert.deepEqual(p.enCurso, ['371']);
    assert.equal(p.tipo, 'mixto');
});

test('mensaje: la lista que arma el mapa (lotes separados por coma o renglón)', () => {
    assert.deepEqual(parsearMensaje('400,532,Z2CC0339', LOTES).lotes, ['400', '532', '339']);
    assert.deepEqual(parsearMensaje('400\n0532', LOTES).lotes, ['400', '532']);
});

test('recorrido: visita los lotes en línea sin devolverse', () => {
    const P = { a: [6.20, -75.60], b: [6.21, -75.60], c: [6.22, -75.60], d: [6.23, -75.60] };
    const dist = (x, y) => metros(typeof x === 'string' ? P[x] : x, typeof y === 'string' ? P[y] : y);
    const orden = recorridoCorto([{ id: 'c' }, { id: 'a' }, { id: 'd' }, { id: 'b' }], [6.195, -75.60], dist).map((p) => p.id);
    assert.deepEqual(orden, ['a', 'b', 'c', 'd']);
});

test('fechas: formatos del Excel y del formulario', () => {
    assert.equal(claveFecha('18/10/2026'), '20261018');
    assert.equal(claveFecha('18-10-26'), '20261018');
    assert.equal(claveFecha('2026-10-18 08:00'), '20261018');
    assert.equal(aInput('8/3/2026'), '2026-03-08');
    assert.equal(aTexto('2026-03-08'), '08/03/2026');
});

test('estado de la visita', () => {
    fijarItems(['CORTE', 'LIMPIEZA'], ['PMT']);
    assert.equal(calcularEstado({ CORTE: 'NO', LIMPIEZA: 'SI' }, ''), 'PENDIENTE');
    assert.equal(calcularEstado({ CORTE: 'SI', LIMPIEZA: 'SI' }, 'PENDIENTE'), 'SUBSANADO');
    assert.equal(calcularEstado({ CORTE: 'SI', LIMPIEZA: 'SI' }, ''), 'SIN NOVEDAD');
    assert.equal(calcularEstado({ CORTE: 'N/A', LIMPIEZA: 'N/A', 'OBSERVACIONES NOVEDADES': 'LOTE CERRADO' }, ''), 'CERRADO');
    assert.equal(limpiarObs('PENDIENTE POR SUBSANAR - falta recoger'), 'falta recoger');
});

test('WhatsApp: resumen del día por cuadrilla', () => {
    fijarItems(['CORTE', 'LIMPIEZA'], ['PMT']);
    const t = textoDia([
        { ID: 'SUB-1', CUADRILLA: '2', MICRORRUTA: 'Z2CC0202', LOTE: '400', ESTADO: 'SIN NOVEDAD', CORTE: 'SI', LIMPIEZA: 'SI' },
        { ID: 'SUB-2', CUADRILLA: '2', MICRORRUTA: 'Z2CC0100', LOTE: '532', ESTADO: 'PENDIENTE', CORTE: 'NO', LIMPIEZA: 'NO' },
        { ID: 'OPE-1', CUADRILLA: '4', MICRORRUTA: 'Z2CC0339', LOTE: '339', ESTADO: 'PENDIENTE', PMT: 'NO' },
        { ID: 'SUB-3', CUADRILLA: '10', MICRORRUTA: 'Z3CC0001', LOTE: '7', ESTADO: 'CERRADO' }
    ], '22/10/2026');
    assert.match(t, /^Resumen de visitas 22\/10\/2026\n3 lotes revisados · 1 con novedad/);
    assert.match(t, /Cuadrilla 2: 2 lotes revisados · 1 con novedad\n✓ Z2CC0202 lote 400\n⚠ Z2CC0100 lote 532: 2 ítems en NO/);
    assert.match(t, /Cuadrilla 4: 0 lotes revisados · 1 visita en operación\n🦺 Z2CC0339 lote 339: 1 novedad en operación/);
    // Cuadrillas en orden numérico: la 10 va después de la 4
    assert.ok(t.indexOf('Cuadrilla 4') < t.indexOf('Cuadrilla 10'));
    assert.match(t, /🔒 Z3CC0001 lote 7: cerrado/);
});

test('WhatsApp: resumen de pendientes agrupa por tipo y cuadrilla', () => {
    fijarItems(['CORTE'], ['PMT']);
    const t = textoResumen([{ ID: 'SUB-1', CUADRILLA: '4', MICRORRUTA: 'Z1CC0096', LOTE: '106', CORTE: 'NO', 'OBSERVACIONES NOVEDADES': 'LOTE NO REALIZADO' }]);
    assert.equal(t, 'Novedades posoperación cuadrilla 4\n\nZ1CC0096 lote 106\n\n* No realizado');
});

test('ZIP a PDF: qué archivos son fotos y en qué orden van', async () => {
    const { esImagen, ordenNatural } = await import('../src/subsanaciones/zippdf.js');
    assert.ok(esImagen('fotos/foto1.JPG'));
    assert.ok(esImagen('a.webp'));
    assert.ok(!esImagen('__MACOSX/fotos/._foto1.jpg'));
    assert.ok(!esImagen('fotos/.oculta.png'));
    assert.ok(!esImagen('notas.txt'));
    assert.deepEqual(['foto10.jpg', 'foto2.jpg', 'Foto1.jpg'].sort(ordenNatural), ['Foto1.jpg', 'foto2.jpg', 'foto10.jpg']);
});
