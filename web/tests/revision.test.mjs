// Pruebas de Revisión y Despacho: novedades en palabras y textos para WhatsApp.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonaDeCodigo, enlaceSeguro, turnoPorHora, novedadesDe, sinMarcar, textoReporte, textoRevision, textoDespacho } from '../src/revision/comun.js';

const lv = { tipo: 'lv', ruta: 'Z2R208LAS', zona: '2', items: { r_papeleo: 'no' }, novedad: '', enlace: '',
    operarios: [{ nombre: 'Juan', items: { h_rastrillo: 'no', epp_botas: 'si' }, novedad: '', enlace: 'https://x.co/1' }, { nombre: '', items: { epp_guantes: 'no' }, novedad: 'Llegó tarde', enlace: 'javascript:alert(1)' }] };
const ryt = { tipo: 'ryt', ruta: '0718620', zona: '7', control: '434', items: {}, operarios: [], novedad: '', enlace: '' };

test('zona: sale del código de la ruta', () => {
    assert.equal(zonaDeCodigo('z7R203DOM'), '7');
    assert.equal(zonaDeCodigo('0718620'), '');
});
test('enlace: solo web', () => {
    assert.equal(enlaceSeguro(' https://a.co/x '), 'https://a.co/x');
    assert.equal(enlaceSeguro('javascript:alert(1)'), '');
    assert.equal(enlaceSeguro('https://a.co/x y'), '');
});
test('turno según la hora', () => {
    assert.deepEqual([3, 8, 13, 17, 21].map(turnoPorHora), ['Noche', 'Mañana', 'Intermedio', 'Tarde', 'Noche']);
});
test('novedades: por ruta y por operario, y el rastrillo con bolsa', () => {
    assert.deepEqual(novedadesDe(lv), ['Con papeleo', 'Juan: Rastrillo con bolsa', 'Juan, evidencia: https://x.co/1', 'Operario 2: Sin guantes, Llegó tarde']);
});
test('sin marcar: cuenta ruta y cada operario', () => {
    assert.equal(sinMarcar(ryt), 4);
    assert.equal(sinMarcar({ tipo: 'lv', items: {}, operarios: [] }), 5);
    assert.equal(sinMarcar({ tipo: 'ryt', items: {}, operarios: [{ items: {} }] }), 9);
});
test('reporte: por zona y servicio, con novedades al final', () => {
    const t = textoReporte([ryt, lv, lv], { turno: 'Noche' });
    assert.equal(t.split('\n')[0], '*REPORTE PARCIAL DE ACTIVIDADES - TURNO NOCHE*');
    assert.ok(t.indexOf('*ZONA 2*') < t.indexOf('*ZONA 7*'));
    assert.ok(t.includes('limpieza vial en operación:\n• Z2R208LAS\n\n*ZONA 7*'), 'la ruta repetida sale una vez');
    assert.ok(t.includes('• 0718620 (Control 434)'));
    assert.ok(t.includes('*NOVEDADES* 🚨\n• Z2R208LAS - Con papeleo'));
});
test('reporte: sin novedades y final', () => {
    const t = textoReporte([ryt], { final: true });
    assert.ok(t.startsWith('*REPORTE FINAL DE ACTIVIDADES*'));
    assert.ok(t.endsWith('Sin novedades al momento del recorrido.'));
    assert.equal(textoReporte([]), '');
});
test('mensaje de una revisión: como se manda al grupo', () => {
    const r = { tipo: 'lv', ruta: 'Anillo y coliseos', zona: '4', items: { r_mapa: 'si' }, novedad: 'El operario se encontraba en un restaurante', enlace: '',
        operarios: [{ nombre: '', items: { epp_botas: 'si', h_escoba: 'si' }, novedad: '', enlace: '' }] };
    assert.equal(textoRevision(r, 14), 'Buena tarde\n\nSe realiza verificación de ruta de Limpieza Vial Zona 4\n\nRuta: Anillo y coliseos\n\nEPP: ok\nHerramientas: ok\nMapa: ok\n\nEl operario se encontraba en un restaurante');
    assert.ok(textoRevision({ ...r, novedad: '' }, 20).endsWith('Se observa buena prestación del servicio, sector controlado'));
    assert.ok(textoRevision({ ...r, operarios: [{ items: { h_rastrillo: 'no' } }] }, 9).includes('Herramientas: no'));
});
test('despacho: numera solo lo escrito', () => {
    const t = textoDespacho({ asignacion: { t1: ' ', t2: '' }, volquetas: { t2: 'Retraso de 1 hora.' } }, '15 de octubre de 2026');
    assert.ok(t.includes('Fecha: 15 de octubre de 2026'));
    assert.ok(t.includes('1. Despacho de volquetas\n\nTurno 2:\n\nRetraso de 1 hora.'));
    assert.ok(!t.includes('asignación vehicular'));
    assert.equal(textoDespacho({}), '');
});
