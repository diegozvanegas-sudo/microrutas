import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaISO, sumarDias, criterioFecha, cumpleFecha, describirFecha, atajoFecha, esModoFecha, hayFiltroFecha } from '../src/subsanaciones/fechas.js';

// Visitas del 28/10 al 05/11/2026 (cruzan fin de mes), en los formatos en que llegan de la base y del Excel
const V = [
    { ID: 'a', 'FECHA DE LA VISITA': '28/10/2026' },
    { ID: 'b', 'FECHA DE LA VISITA': '29/10/2026' },
    { ID: 'c', 'FECHA DE LA VISITA': '31/10/2026' },
    { ID: 'd', 'FECHA DE LA VISITA': '2026-11-01' },
    { ID: 'e', 'FECHA DE LA VISITA': '1/11/2026' },       // sin cero
    { ID: 'f', 'FECHA DE LA VISITA': '02-11-26' },        // año de dos cifras
    { ID: 'g', 'FECHA DE LA VISITA': '04/11/2026 07:48' }, // con hora
    { ID: 'h', 'FECHA DE LA VISITA': '2026-11-05T18:30:00' },
    { ID: 'x', 'FECHA DE LA VISITA': '' },                // sin fecha
    { ID: 'y', 'FECHA DE LA VISITA': 'pendiente' },       // texto que no es fecha
    { ID: 'z', 'FECHA DE LA VISITA': '31/02/2026' }       // día que no existe
];
const ids = (modo, desde, hasta) => { const c = criterioFecha(modo, desde, hasta); return V.filter(r => cumpleFecha(r, c)).map(r => r.ID).join(''); };

test('fechaISO entiende los formatos de la base y del Excel', () => {
    assert.equal(fechaISO('28/10/2026'), '2026-10-28');
    assert.equal(fechaISO('1/11/2026'), '2026-11-01');
    assert.equal(fechaISO('02-11-26'), '2026-11-02');
    assert.equal(fechaISO('02.11.2026'), '2026-11-02');
    assert.equal(fechaISO('2026-11-05T18:30:00'), '2026-11-05');
    assert.equal(fechaISO('04/11/2026 07:48'), '2026-11-04');
    assert.equal(fechaISO('  2026-11-05  '), '2026-11-05');
});
test('fechaISO descarta lo que no es un día real', () => {
    for (const s of ['', null, undefined, 'pendiente', '31/02/2026', '29/02/2026', '2026-13-01', '00/10/2026', '32/10/2026', '20266-11-01'])
        assert.equal(fechaISO(s), '', String(s));
    assert.equal(fechaISO('29/02/2028'), '2028-02-29'); // bisiesto
});
test('sumarDias cruza meses, años y bisiestos', () => {
    assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
    assert.equal(sumarDias('2026-11-01', -1), '2026-10-31');
    assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
    assert.equal(sumarDias('2027-01-01', -1), '2026-12-31');
    assert.equal(sumarDias('2028-03-01', -1), '2028-02-29');
    assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
});

test('sin filtro de fecha entran todas, también las que no tienen fecha', () => {
    assert.equal(ids('', '2026-10-01', '2026-10-02'), 'abcdefghxyz');
    assert.equal(hayFiltroFecha(criterioFecha('', '2026-10-01', '')), false);
});
test('un día del selector', () => {
    assert.equal(ids('2026-11-01'), 'de');
    assert.equal(ids('2026-11-04'), 'g');
    assert.equal(ids('2026-11-03'), '');
});

test('entre fechas: los dos días cuentan', () => {
    assert.equal(ids('rango', '2026-10-29', '2026-11-02'), 'bcdef');
    assert.equal(ids('rango', '2026-11-01', '2026-11-01'), 'de');
});
test('entre fechas al revés se invierten', () => {
    assert.equal(ids('rango', '2026-11-02', '2026-10-29'), 'bcdef');
    assert.equal(criterioFecha('rango', '2026-11-02', '2026-10-29').invertido, true);
});
test('entre fechas con un solo extremo', () => {
    assert.equal(ids('rango', '2026-11-02', ''), 'fgh');     // de ese día en adelante
    assert.equal(ids('rango', '', '2026-10-31'), 'abc');     // de ese día hacia atrás
});
test('entre fechas vacío no filtra y lo avisa', () => {
    assert.equal(ids('rango', '', ''), 'abcdefghxyz');
    assert.equal(criterioFecha('rango', '', '').incompleto, true);
});
test('con filtro de fecha quedan fuera las visitas sin fecha o con fecha mala', () => {
    assert.equal(ids('rango', '2000-01-01', '2100-01-01'), 'abcdefgh');
});

test('antes de: no cuenta el día elegido', () => {
    assert.equal(ids('antes', '', '2026-11-01'), 'abc');
    assert.equal(ids('antes', '', '2026-11-02'), 'abcde');
    assert.equal(ids('antes', '', '2026-10-28'), '');
    assert.equal(criterioFecha('antes', '', '2026-11-01').hasta, '2026-10-31');
});
test('antes de ignora el Desde que quede escrito', () => {
    assert.equal(ids('antes', '2026-10-31', '2026-11-01'), 'abc');
});
test('después de: no cuenta el día elegido', () => {
    assert.equal(ids('despues', '2026-10-31', ''), 'defgh');
    assert.equal(ids('despues', '2026-11-04', ''), 'h');
    assert.equal(ids('despues', '2026-11-05', ''), '');
    assert.equal(criterioFecha('despues', '2026-10-31', '').desde, '2026-11-01');
});
test('después de ignora el Hasta que quede escrito', () => {
    assert.equal(ids('despues', '2026-10-31', '2026-11-01'), 'defgh');
});
test('antes de / después de sin día no filtran', () => {
    assert.equal(ids('antes', '', ''), 'abcdefghxyz');
    assert.equal(ids('despues', '', ''), 'abcdefghxyz');
    assert.equal(criterioFecha('antes', '2026-11-01', '').incompleto, true);
});
test('antes y después del mismo día se reparten todo menos ese día', () => {
    const antes = ids('antes', '', '2026-11-02'), despues = ids('despues', '2026-11-02', ''), dia = ids('2026-11-02');
    assert.equal(antes + dia + despues, 'abcdefgh');
});
test('fechas mal escritas en los campos se ignoran', () => {
    assert.equal(ids('rango', 'basura', '2026-10-29'), 'ab');
    assert.equal(ids('antes', '', '2026-02-31'), 'abcdefghxyz');
});
test('fin de año: antes del 1 de enero llega al 31 de diciembre', () => {
    const r = [{ 'FECHA DE LA VISITA': '31/12/2026' }, { 'FECHA DE LA VISITA': '01/01/2027' }];
    const c = criterioFecha('antes', '', '2027-01-01');
    assert.deepEqual(r.map(x => cumpleFecha(x, c)), [true, false]);
    const d = criterioFecha('despues', '2026-12-31', '');
    assert.deepEqual(r.map(x => cumpleFecha(x, d)), [false, true]);
});

test('describirFecha dice qué días se ven', () => {
    assert.equal(describirFecha('antes', '', '2026-11-01'), 'Visitas antes del 01/11/2026 (sin contar ese día): hasta el 31/10/2026.');
    assert.equal(describirFecha('despues', '2026-10-31', ''), 'Visitas después del 31/10/2026 (sin contar ese día): desde el 01/11/2026.');
    assert.equal(describirFecha('rango', '2026-10-29', '2026-11-02'), 'Visitas del 29/10/2026 al 02/11/2026, los dos días incluidos.');
    assert.equal(describirFecha('rango', '2026-11-02', '2026-10-29'), 'Visitas del 29/10/2026 al 02/11/2026, los dos días incluidos (las fechas estaban al revés y se invirtieron).');
    assert.equal(describirFecha('rango', '2026-11-01', '2026-11-01'), 'Visitas del 01/11/2026.');
    assert.equal(describirFecha('rango', '2026-11-01', ''), 'Visitas desde el 01/11/2026 (incluido) en adelante.');
    assert.equal(describirFecha('rango', '', '2026-11-01'), 'Visitas hasta el 01/11/2026 (incluido).');
    assert.match(describirFecha('rango', '', ''), /Elija una o las dos fechas/);
    assert.match(describirFecha('antes', '', ''), /Elija el día/);
    assert.match(describirFecha('despues', '', ''), /Elija el día/);
    assert.equal(describirFecha('', '', ''), '');
    assert.equal(describirFecha('2026-11-01', '', ''), '');
});

test('atajos de fecha', () => {
    assert.deepEqual(atajoFecha('hoy', '2026-11-09'), { desde: '2026-11-09', hasta: '2026-11-09' });
    assert.deepEqual(atajoFecha('ayer', '2026-11-01'), { desde: '2026-10-31', hasta: '2026-10-31' });
    assert.deepEqual(atajoFecha('7', '2026-11-03'), { desde: '2026-10-28', hasta: '2026-11-03' });
    assert.deepEqual(atajoFecha('30', '2026-11-09'), { desde: '2026-10-11', hasta: '2026-11-09' });
    assert.deepEqual(atajoFecha('mes', '2026-11-09'), { desde: '2026-11-01', hasta: '2026-11-09' });
    assert.deepEqual(atajoFecha('mes-1', '2026-11-09'), { desde: '2026-10-01', hasta: '2026-10-31' });
    assert.deepEqual(atajoFecha('mes-1', '2027-01-15'), { desde: '2026-12-01', hasta: '2026-12-31' });
    assert.deepEqual(atajoFecha('mes-1', '2028-03-31'), { desde: '2028-02-01', hasta: '2028-02-29' });
    assert.equal(atajoFecha('otro', '2026-11-09'), null);
});
test('últimos 7 días son 7 días contando hoy', () => {
    const r = atajoFecha('7', '2026-11-05'), c = criterioFecha('rango', r.desde, r.hasta);
    // 30/10 a 05/11: entran c(31/10) d e f g h, no a(28) ni b(29)
    assert.equal(V.filter(x => cumpleFecha(x, c)).map(x => x.ID).join(''), 'cdefgh');
});
test('modos del selector', () => {
    assert.ok(esModoFecha('rango') && esModoFecha('antes') && esModoFecha('despues'));
    assert.ok(!esModoFecha('') && !esModoFecha('2026-11-01'));
});
