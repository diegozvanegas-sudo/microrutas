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
        [null, '26/10/2026 11:00', hora(11, 31), '0415508', '635 - ABC123', '11111111 PEREZ, ANA - 55555555 OTRO, PEPE'],
        [null, '27/10/2026 11:00', hora(13, 15), '0415507', '635 - ABC123', '11111111 PEREZ, ANA'],
        [null, '26/10/2026 11:00', hora(23, 39), '0418419', '562 - DEF456', '99999999 LOPEZ, ANDRES - SIN CEDULA, PEDRO'],
        [null, '26/10/2026 11:00', null, '0710407', '640 - GHI789', '33333333 RUIZ, EVA'],
        [null, '26/10/2026 11:00', '18:47', '0710207', '0565 - JKL012', '444444440 NO ES, ESTA - 44444444 DIAZ, JUAN']];
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
    // Ruta y control frente al cumplimiento: Ana en otra ruta, Juan en otro control ("0565" es el 565, no el 561)
    assert.deepEqual([ana.difRuta, ana.difControl, ana.rutaReal], [true, false, '0415508']);
    assert.deepEqual([juan.difRuta, juan.difControl, juan.controlReal], [false, true, '0565 - JKL012']);
    assert.deepEqual([luis.difRuta, luis.difControl, eva.difRuta, eva.difControl], [false, false, false, false]);
    const r = resumen([ana, luis, eva, juan]);
    assert.deepEqual([r.ok, r.mas, r.menos, r.sinhora, r.porRuta], [1, 1, 1, 1, 1]);
    // Extra reportada de Ana 2:37; según la real, 0
    assert.equal(ana.extraReportada, 157);
    assert.equal(ana.extraReal, 0);
    assert.equal(leerCumplimiento(hojaExtras), null);
});

import { completarTripulantes, esConductor } from '../src/horas/cruce.js';
test('tripulante sin hora propia toma la del conductor de su ruta y control', () => {
    const base = { fecha: '2026-10-26', hi: 480, hf: 960, extra: 1005 };
    const filas = [
        { ...base, cargo: 'CONDUCTOR', nombre: 'Conductor A', ruta: '710407', control: '635', real: 1010, como: 'cedula', estado: 'ok' },
        { ...base, cargo: 'TRIPULANTE', nombre: 'Tripulante B', ruta: '710407', control: '635', real: null, como: 'cedula', estado: 'sinhora' },
        { ...base, cargo: 'TRIPULANTE', nombre: 'Tripulante C', ruta: '710407', control: '999', real: null, como: '', estado: 'nada' },
        { ...base, cargo: 'TRIPULANTE', nombre: 'Tripulante D', ruta: '710407', control: '635', real: 1000, como: 'cedula', estado: 'ok' },
    ];
    const r = completarTripulantes(filas, 5);
    assert.equal(r[1].real, 1010);
    assert.equal(r[1].como, 'conductor');
    assert.equal(r[1].conductor, 'Conductor A');
    assert.equal(r[1].estado, 'ok');
    assert.equal(r[2].real, null);          // otro control: no se toma
    assert.equal(r[3].real, 1000);          // ya tenía la suya
    assert.equal(r[0], filas[0]);
    assert.ok(esConductor({ cargo: 'Conductor' }) && !esConductor({ cargo: 'TRIPULANTE' }));
});

import { fechasSinCumplimiento, estaPorNombre } from '../src/horas/cruce.js';
test('horas: fechas en otros formatos', () => {
    for (const t of ['26-10-2026', '26.10.26', '2026/10/26', '26 de octubre de 2026', '26-oct-2026', 'lunes, 26 de octubre del 2026'])
        assert.equal(fechaIso(t), '2026-10-26', t);
    assert.equal(fechaIso('nada'), '');
});

test('horas: se compara con todo (cédula, nombre, ruta, control) y se avisa si es otro día', () => {
    const base = { hi: 480, hf: 960, extra: 1005 };
    const extras = [
        { ...base, fila: 2, fecha: '2026-10-26', cargo: 'CONDUCTOR', cedula: '12121299', nombre: 'ROJAS PRUEBA JUAN CARLOS', ruta: '912704', control: '677' },
        { ...base, fila: 3, fecha: '2026-10-26', cargo: 'TRIPULANTE', cedula: '34343434', nombre: 'OTRO SIN NADA', ruta: '999999', control: '558' },
        { ...base, fila: 4, fecha: '2026-10-26', cargo: 'CONDUCTOR', cedula: '56565656', nombre: 'LOPEZ ANIBAL', ruta: '418219', control: '556' },
        { ...base, fila: 5, fecha: '2026-10-28', cargo: 'CONDUCTOR', cedula: '56565656', nombre: 'LOPEZ ANIBAL', ruta: '418219', control: '556' },
    ];
    const cumplimiento = [
        // Cédula mal escrita en el reporte: se encuentra por el nombre
        { fecha: '2026-10-26', real: 1000, codigo: '912704', control: '677', camion: '677 - X', dotacion: '12121212 ROJAS PRUEBA, JUAN CARLOS - 1 OTRO, PEPE' },
        // Mismo camión, dos turnos: el que llegó cerca de la H.F (16:00), no el de las 10:00
        { fecha: '2026-10-26', real: 600, codigo: '111201', control: '558', camion: '558 - Y', dotacion: '55555555 NADIE, UNO' },
        { fecha: '2026-10-26', real: 1010, codigo: '408219', control: '558', camion: '558 - Y', dotacion: '66666666 NADIE, DOS' },
        { fecha: '2026-10-27', real: 900, codigo: '418219', control: '556', camion: '556 - Z', dotacion: '56565656 LOPEZ, ANIBAL' },
    ];
    const [rojas, otro, lopez] = cruzar(extras, cumplimiento);
    assert.deepEqual([rojas.como, rojas.real], ['nombre', 1000]);
    assert.deepEqual([otro.como, otro.real, otro.rutaReal], ['control', 1010, '408219']);
    // No está el 26, pero sí el 27: se avisa, sin usar esa hora
    assert.deepEqual([lopez.estado, lopez.otrosDias], ['nada', ['2026-10-27']]);
    assert.ok(estaPorNombre('LOPEZ ANIBAL', '56565656 LOPEZ GOMEZ, ANIBAL') && !estaPorNombre('GOMEZ LUIS', '9 LOPEZ, ANDRES - SIN CEDULA, PEDRO'));
    assert.deepEqual(fechasSinCumplimiento(extras, cumplimiento), { faltan: ['2026-10-28'], trae: ['2026-10-26', '2026-10-27'] });
    assert.equal(resumen([rojas, otro, lopez]).porRuta, 2);
});

test('conductor sin hora toma la del tripulante de su ruta si no hay conductor con hora', () => {
    const base = { fecha: '2026-10-26', hi: 480, hf: 960, extra: 1005, ruta: '710407', control: '640' };
    const r = completarTripulantes([
        { ...base, cargo: 'CONDUCTOR', nombre: 'Conductor A', real: null, como: 'cedula', estado: 'sinhora' },
        { ...base, cargo: 'TRIPULANTE', nombre: 'Tripulante B', real: 1004, como: 'nombre', estado: 'ok' },
    ], 5);
    assert.deepEqual([r[0].real, r[0].como, r[0].conductor], [1004, 'companero', 'Tripulante B']);
});
