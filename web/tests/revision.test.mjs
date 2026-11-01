// Pruebas de Revisión y Despacho: novedades en palabras y textos para WhatsApp.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonaDeCodigo, enlaceSeguro, turnoPorHora, novedadesDe, sinMarcar, textoReporte, textoActividades, textoRevision, textoDespacho, tieneNovedad, filtrarRevisiones, ordenarRevisiones, resumenVolquetas, textoVolquetas } from '../src/revision/comun.js';

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
    assert.deepEqual([3, 5, 8, 10, 16, 17, 21].map(turnoPorHora), ['Noche', 'Mañana', 'Diurno', 'Intermedio', 'Intermedio', 'Noche', 'Noche']);
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
test('lista: filtra por servicio, zona, estado y texto sin tildes', () => {
    const conEvidencia = { tipo: 'plan', ruta: 'Carrera 45', zona: '1', fecha: '2026-11-01', turno: 'Noche', items: {}, novedad: '', enlace: 'https://x.co/1', operarios: [{ nombre: 'José', items: {}, novedad: '', enlace: '' }] };
    const todas = [lv, ryt, conEvidencia];
    assert.equal(tieneNovedad(lv), true);
    assert.equal(tieneNovedad(conEvidencia), false, 'la evidencia sola no es novedad');
    assert.deepEqual(filtrarRevisiones(todas, { tipo: 'ryt' }), [ryt]);
    assert.deepEqual(filtrarRevisiones(todas, { zona: '2' }), [lv]);
    assert.deepEqual(filtrarRevisiones(todas, { estado: 'novedad' }), [lv]);
    assert.equal(filtrarRevisiones(todas, { estado: 'novedad' }, true).length, 3);
    assert.deepEqual(filtrarRevisiones(todas, { texto: 'jose' }), [conEvidencia]);
    assert.deepEqual(filtrarRevisiones(todas, { texto: 'control' }), []);
    assert.deepEqual(filtrarRevisiones(todas, { texto: '434' }), [ryt]);
});
test('lista: la más reciente primero', () => {
    const r = ordenarRevisiones([{ id: 1, fecha: '2026-10-30' }, { id: 2, fecha: '2026-11-01', creado: 'a' }, { id: 3, fecha: '2026-11-01', creado: 'b' }]);
    assert.deepEqual(r.map(x => x.id), [3, 2, 1]);
});
test('volquetas: cumplimiento y texto', () => {
    const f = (zona, control, inicio, fin) => ({ zona, servicio: 'Voluminosos clandestinos', control, inicio, fin, conductor: 'Mauricio', supervisor: 'Jorge', aliado: 'FUDEA', novedad: '' });
    const t = { programadas: '', filas: [f('1', '61', '16:38', '19:36'), f('2', '604', '14:09', '19:32')] };
    assert.deepEqual(resumenVolquetas(t), { programadas: 2, despachadas: 2, cumplimiento: 100 });
    assert.deepEqual(resumenVolquetas({ programadas: '3', filas: [t.filas[0], f('3', '605', '', '')] }), { programadas: 3, despachadas: 1, cumplimiento: 33.3 });
    assert.deepEqual(resumenVolquetas({ filas: [{ servicio: 'Voluminosos clandestinos' }] }), { programadas: 0, despachadas: 0, cumplimiento: null }, 'la fila vacía no cuenta');
    assert.ok(textoVolquetas(t).startsWith('Rutas programadas: 2\nRutas despachadas: 2\nCumplimiento: 100 %\n\n- Zona 1 · Voluminosos clandestinos · Control 61 · 16:38 a 19:36 · Mauricio · Supervisor Jorge · FUDEA'));
    const rep = textoDespacho({ volquetas: { t2: 'Sin retrasos.' }, tabla_volquetas: { t2: t } });
    assert.ok(rep.includes('1. Despacho de volquetas\n\nTurno 2:\n\nSin retrasos.\n\nRutas programadas: 2'));
    assert.equal(textoVolquetas({ filas: [] }), '');
});
test('reporte por actividades: numerado, con cantidades en letras y lo escrito a mano', () => {
    const rv = (ruta, zona, tipo = 'lv', control = '') => ({ tipo, ruta, zona, control, items: {}, operarios: [], novedad: '', enlace: '' });
    const t = textoActividades([rv('Z7R1', '7'), rv('Z7R2', '7'), rv('Z7R1', '7'), rv('Z4R1', '4'), rv('0718620', '7', 'ryt', '434')], { turno: 'Intermedio', final: true, vias: 'Recorrido por Avenida 80.', rcd: 'Novedades en la 80.' });
    assert.equal(t, 'REPORTE FINAL DE ACTIVIDADES – TURNO INTERMEDIO\n\nDurante el turno intermedio se desarrollaron las siguientes actividades de inspección y verificación:\n\n' +
        '1. Verificación de rutas de barrido – Zona 4: Se realizó la inspección de una (1) ruta de barrido: Z4R1.\n' +
        '2. Verificación de rutas de barrido – Zona 7: Se realizó la inspección de dos (2) rutas de barrido: Z7R1, Z7R2.\n' +
        '3. Verificación de vías principales: Recorrido por Avenida 80.\n4. Reporte de novedades RCD y voluminosos: Novedades en la 80.\n' +
        '5. Verificación de vehículos y rutas recolectoras: Se verificó una (1) ruta recolectora. Zona 7: 0718620 (Control 434).');
    assert.ok(textoActividades([rv('A', '1')], { turno: 'Noche' }).includes('Durante lo que va del turno noche se desarrollaron'));
    assert.ok(textoActividades([rv('A', '1')], {}).includes('Durante lo que va de la jornada'));
    assert.ok(textoActividades([{ ...rv('A', '1'), items: { r_papeleo: 'no' } }], {}).includes('Novedades encontradas: A - Con papeleo.'));
    assert.equal(textoActividades([], {}), '');
});
test('despacho: numera solo lo escrito', () => {
    const t = textoDespacho({ asignacion: { t1: ' ', t2: '' }, volquetas: { t2: 'Retraso de 1 hora.' } }, '15 de octubre de 2026');
    assert.ok(t.includes('Fecha: 15 de octubre de 2026'));
    assert.ok(t.includes('1. Despacho de volquetas\n\nTurno 2:\n\nRetraso de 1 hora.'));
    assert.ok(!t.includes('asignación vehicular'));
    assert.equal(textoDespacho({}), '');
});
