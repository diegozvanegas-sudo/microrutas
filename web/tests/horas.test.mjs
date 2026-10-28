// Pruebas de Horas extras: lectura de las dos hojas y cruce por cédula y fecha (datos inventados, no los reportes reales).
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutos, hhmm, duracion, fechaIso, leerExtras, leerCumplimiento, cruzar, resumen, extra, diferencia } from '../src/horas/cruce.js';

const hora = (h, m) => new Date(Date.UTC(1899, 11, 30, h, m));

test('horas: celdas de hora y fecha como llegan de ExcelJS o como texto', () => {
    assert.equal(minutos(hora(15, 37)), 937);
    assert.equal(minutos('22:57'), 1377);
    assert.equal(minutos('6:55 p. m.'), 1135);
    assert.equal(minutos(0.5), 720);
    assert.equal(minutos(null), null);
    assert.equal(hhmm(1015), '16:55');
    assert.equal(duracion(-246, true), '−4:06');
    assert.equal(fechaIso('26/10/2026 11:00'), '2026-10-26');
    assert.equal(fechaIso(new Date(Date.UTC(2026, 9, 26))), '2026-10-26');
});

test('horas: turnos de noche y diferencia real − reportada', () => {
    // 21:00 a 5:00, llegó 6:55: 1:55 de extra
    assert.equal(extra(1260, 300, 415), 115);
    // 16:00 a 0:00, llegó 23:45: sin extra
    assert.equal(extra(960, 0, 1425), 0);
    assert.equal(diferencia(300, 937, 691), -246);
    assert.equal(diferencia(900, 0, 1), 1);
});

test('horas: cruce por cédula en la dotación, por ruta si no está, y sin hora real', () => {
    const hojaExtras = [[], [null, 'FECHA', 'ZONA', 'RUTA', 'CONTROL', 'CARGO', 'CEDULA', 'NOMBRE', 'H.I', 'H.F', 'H. EXTRA', 'H. REAL', 'TOTAL'],
        [null, new Date(Date.UTC(2026, 9, 26)), '4AM', '0415507', '635', 'CONDUCTOR', 11111111, 'PEREZ ANA', hora(5, 0), hora(13, 0), hora(15, 37)],
        [null, new Date(Date.UTC(2026, 9, 26)), '4PM', ' 0418419', '562', 'TRIPULANTE', 22222222, 'GOMEZ LUIS', hora(13, 0), hora(21, 0), hora(20, 43)],
        [null, new Date(Date.UTC(2026, 9, 26)), '7AM', '0710407', '640', 'CONDUCTOR', 33333333, 'RUIZ EVA', hora(8, 0), hora(16, 0), hora(16, 45)],
        [null, new Date(Date.UTC(2026, 9, 26)), '7AM', '0710207', '561', 'CONDUCTOR', 44444444, 'DIAZ JUAN', hora(8, 0), hora(16, 0), hora(18, 47)]];
    const hojaCumplimiento = [[], [null, 'Fecha', 'HORA REAL', 'Código', 'Camión', 'Dotación'],
        [null, '26/10/2026 11:00', hora(11, 31), '0415507', '635 - ABC123', '11111111 PEREZ, ANA - 55555555 OTRO, PEPE'],
        [null, '27/10/2026 11:00', hora(13, 15), '0415507', '635 - ABC123', '11111111 PEREZ, ANA'],
        [null, '26/10/2026 11:00', hora(23, 39), '0418419', '562 - DEF456', '99999999 SALDARRIAGA, W - PEREZ PEREZ, JUAN'],
        [null, '26/10/2026 11:00', null, '0710407', '640 - GHI789', '33333333 RUIZ, EVA'],
        [null, '26/10/2026 11:00', '18:47', '0710207', '561 - JKL012', '444444440 NO ES, ESTA - 44444444 DIAZ, JUAN']];
    const ex = leerExtras(hojaExtras), cu = leerCumplimiento(hojaCumplimiento);
    assert.equal(ex.encabezado, 1);
    assert.equal(ex.cols.real, 11);
    const [ana, luis, eva, juan] = cruzar(ex.filas, cu);
    // Misma fecha (no la del 27); reportó 4:06 más tarde de lo real
    assert.deepEqual([ana.fila, ana.como, ana.estado, hhmm(ana.real), ana.diferencia], [2, 'cedula', 'mas', '11:31', -246]);
    // Sin cédula en la dotación: por ruta, para revisar
    assert.deepEqual([luis.como, luis.estado, hhmm(luis.real)], ['ruta', 'menos', '23:39']);
    assert.deepEqual([eva.como, eva.estado, eva.real], ['cedula', 'sinhora', null]);
    // La cédula completa, no dentro de otra más larga
    assert.deepEqual([juan.estado, hhmm(juan.real)], ['ok', '18:47']);
    const r = resumen([ana, luis, eva, juan]);
    assert.deepEqual([r.ok, r.mas, r.menos, r.sinhora, r.porRuta], [1, 1, 1, 1, 1]);
    // Extra reportada de Ana 2:37; según la real, 0
    assert.equal(ana.extraReportada, 157);
    assert.equal(ana.extraReal, 0);
    assert.equal(leerCumplimiento(hojaExtras), null);
});
