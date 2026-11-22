// Pruebas de los formatos del «📲 Mensaje de la revisión». Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensaje, FORMATOS, sugerido, pide, herramientas, epp } from '../src/revision/mensajes.js';

const SI = { p_lugar: 'si', p_uniforme: 'si', p_herramientas: 'si', p_epp_estado: 'si', p_epp_uso: 'si', s_frecuencia: 'si', s_recorrido: 'si', s_calidad: 'si' };
const lv = { tipo: 'lv', ruta: 'Z6R13DOM', zona: '6', fecha: '2026-11-23', turno: 'Mañana', control: '', novedad: '', enlace: '', operarios: [], items: Object.assign({ formato: 'instrumento', verificacion: 'Operacion', contratista: 'FUDEA' }, SI) };
const ryt = { tipo: 'ryt', ruta: '0719620', zona: '7', fecha: '2026-11-23', control: '684', novedad: '', enlace: '', operarios: [], items: Object.assign({ formato: 'instrumento', verificacion: 'Operacion' }, SI) };

test('formatos: los seis, y el sugerido por servicio', () => {
    assert.deepEqual(FORMATOS.map((f) => f[0]), ['corto', 'chulos', 'inspeccion', 'ryt', 'novedad', 'linea']);
    assert.equal(sugerido(lv), 'inspeccion'); assert.equal(sugerido(ryt), 'ryt'); assert.equal(sugerido({ tipo: 'plan' }), 'corto');
    assert.deepEqual(pide('ryt', ryt), { documentos: true, extintor: true, placa: true, observacion: true, instrumento: true });
});
test('reporte de inspección LV: como el del grupo', () => {
    assert.equal(mensaje(lv, 'inspeccion', {}), 'REPORTE DE INSPECCIÓN\n\nLa interventoría del área de servicio de aseo hace verificación en operación a la ruta Z6R13DOM.\n\nHerramientas: OK ✅\nDocumentos: OK ✅\nEPP: OK ✅\n\nNovedades de barrido: NO ✅\n\nSe observa buena prestación del servicio por parte del aliado');
    const mal = Object.assign({}, lv, { items: Object.assign({}, lv.items, { p_epp_uso: 'no' }) });
    const t = mensaje(mal, 'inspeccion', { documentos: 'no', observacion: 'Operario sin mapa dominical' });
    assert.ok(t.includes('Documentos: NO ❌\nEPP: NO ❌'));
    assert.ok(t.includes('Novedades de barrido: SÍ ❌\n- No hace uso de los EPP'));
    assert.ok(t.endsWith('Operario sin mapa dominical'));
});
test('con chulos, RyT con control, placa y extintor', () => {
    assert.equal(mensaje(ryt, 'chulos', {}), 'La Interventoría del Área de Servicios de Aseo hace verificación en operación a la ruta 0719620 (Control 684).\n\nHerramientas: ✅\nDocumentos: ✅\nEPP: ✅\n\nSe observa buena prestación del servicio por parte del aliado');
    assert.equal(mensaje(ryt, 'ryt', { placa: 'ktn357' }), 'REPORTE DE INSPECCIÓN RyT\n\nLa interventoría del área de servicio de aseo hace verificación de RyT.\n\nControl: 684\nPlaca: KTN357\nRuta: 0719620\n\nHerramientas: OK\nDocumentos: OK\nEPP: OK\nExtintor: OK\n\nNovedades: N/A');
    assert.ok(mensaje(ryt, 'ryt', { extintor: 'no' }).includes('Extintor: NO'));
});
test('novedad para el aliado y una línea', () => {
    const mal = Object.assign({}, lv, { novedad: 'Operario sin carnet', enlace: 'https://drive.google.com/x', items: Object.assign({}, lv.items, { s_calidad: 'no' }) });
    const n = mensaje(mal, 'novedad', {});
    assert.ok(n.startsWith('⚠️ NOVEDAD · Limpieza Vial · Z6R13DOM · Zona 6\n23/11/2026 · Mañana · Aliado: FUDEA'));
    assert.ok(n.includes('Se evidencia:\n- Prestación del servicio sin calidad\n- Operario sin carnet'));
    assert.ok(n.endsWith('Registro fotográfico: https://drive.google.com/x'));
    assert.equal(mensaje(lv, 'linea', {}), '✅ Z6R13DOM · Z6 · LV · sin novedad');
    assert.equal(mensaje(mal, 'linea', {}), '⚠️ Z6R13DOM · Z6 · LV · Prestación del servicio sin calidad; Operario sin carnet');
});
test('revisiones de antes: herramientas y EPP desde los operarios', () => {
    const vieja = { tipo: 'lv', items: { r_ruta: 'si' }, operarios: [{ items: { h_escoba: 'si', epp_botas: 'no' } }] };
    assert.equal(herramientas(vieja), 'si'); assert.equal(epp(vieja), 'no');
});
