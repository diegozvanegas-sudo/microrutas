import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normMr, leerReportes, unirReportes, cruzar, habilesEntre, diaCorto, textoDif, textoSituacion, textoCruce, esHecho } from '../src/cruce/cruce.js';

// El reporte real que llega por WhatsApp (28/10/2026, cuadrilla 4)
const REPORTE = `Buenas tardes

REPORTE MICRORRUTAS EJECUTADAS CW394406
Fecha: 28-10-2026

Cuadrilla: 4

Microrrutas ejecutadas:

Z1cc0125 (98)
Z3cc0006 (57)
Z1cc0120 (140)
Z1cc0051 (53)
Z1cc0048 (48)
Z1cc0049 (49)
Z1cc0050 (50)
Z1cc0136 (181)
Z1cc0124 (187)
Z1cc0123 (185)

@Interventor`;
const LOTES = { Z1CC0125: { lote: '98', cuad: '4' }, Z1CC0051: { lote: '53', cuad: '4' }, Z2CC0188: { lote: '386', cuad: '2' } };

test('normMr', () => {
    assert.equal(normMr('z1cc125'), 'Z1CC0125');
    assert.equal(normMr(' Z3CC0006 '), 'Z3CC0006');
    assert.equal(normMr('386'), '');
});

test('leerReportes: el reporte real (fecha, cuadrilla y 10 microrrutas; el contrato CW394406 no es un lote)', () => {
    const r = leerReportes(REPORTE, LOTES);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.reportes.length, 1);
    assert.equal(r.reportes[0].fecha, '2026-10-28');
    assert.equal(r.reportes[0].cuad, '4');
    assert.equal(r.reportes[0].items.length, 10);
    assert.deepEqual(r.reportes[0].items[0], { mr: 'Z1CC0125', lote: '98' });
    assert.deepEqual(r.reportes[0].items[1], { mr: 'Z3CC0006', lote: '57' });   // no está en la base: vale el número entre paréntesis
});

test('leerReportes: varios mensajes pegados seguidos, uno por fecha y cuadrilla', () => {
    const dos = REPORTE + '\n[18:02, 29/10/2026] Otro Supervisor: REPORTE MICRORRUTAS EJECUTADAS CW394406\nFecha: 29-10-2026\nCuadrilla: 2\nZ2cc0188 (386)\n' +
        'Lotes ejecutados el 30/10/26 por la cuadrilla #2\n386\n';
    const r = leerReportes(dos, LOTES);
    assert.deepEqual(r.reportes.map((x) => x.fecha + ' C' + x.cuad + ' ' + x.items.length), ['2026-10-28 C4 10', '2026-10-29 C2 1', '2026-10-30 C2 1']);
    assert.equal(r.reportes[2].items[0].mr, 'Z2CC0188');   // «386» solo en el renglón = lote 386
});

test('leerReportes: sin cuadrilla se toma la de sus microrrutas; sin fecha escrita, la del mensaje; sin ninguna, no se carga', () => {
    const sinCuad = leerReportes('Fecha: 03-11-2026\nZ1cc0125\nZ1cc0051', LOTES);
    assert.equal(sinCuad.reportes[0].cuad, '4');
    assert.match(sinCuad.avisos[0], /cuadrilla/);
    const deWa = leerReportes('[17:18, 4/11/2026] Supervisor: Microrrutas ejecutadas cuadrilla 4\nZ1cc0125', LOTES);
    assert.equal(deWa.reportes[0].fecha, '2026-11-04');
    assert.match(deWa.avisos[0], /mensaje de WhatsApp/);
    const sinFecha = leerReportes('Cuadrilla 4\nZ1cc0125', LOTES);
    assert.equal(sinFecha.reportes.length, 0);
    assert.match(sinFecha.avisos[0], /no trae la fecha/);
    assert.match(leerReportes('hola', LOTES).avisos[0], /No se encontró/);
});

test('unirReportes: el del mismo día y cuadrilla reemplaza al anterior', () => {
    const a = [{ fecha: '2026-11-03', cuad: '4', items: [{ mr: 'Z1CC0001' }] }], b = [{ fecha: '2026-11-03', cuad: '4', items: [{ mr: 'Z1CC0002' }] }, { fecha: '2026-11-02', cuad: '4', items: [] }];
    const u = unirReportes(a, b);
    assert.deepEqual(u.map((r) => r.fecha), ['2026-11-02', '2026-11-03']);
    assert.equal(u[1].items[0].mr, 'Z1CC0002');
});

test('habilesEntre: el domingo no cuenta', () => {
    assert.equal(habilesEntre('2026-11-06', '2026-11-09'), 2);   // viernes → lunes: sábado y lunes
    assert.equal(habilesEntre('2026-11-09', '2026-11-09'), 0);
    assert.equal(diaCorto('2026-11-09'), 'lun 09/11');
});

// Noviembre 2026: la semana 1 empieza el lunes 2. Cuadrilla 4 con dos lotes por día de lunes a jueves; cuadrilla 2 con uno el lunes
const lote = (fila, cuad, n, semana, dia, extra) => Object.assign({ fila, cuad, mr: 'Z1CC' + ('000' + n).slice(-4), lote: String(n), dir: '', area: 0, frec: 1, semana, dia, hecho: false, fecha: '', obs: '' }, extra);
const PROG = {
    mes: '2026-11',
    q1: [lote(2, '4', 1, 1, 1), lote(3, '4', 2, 1, 1), lote(4, '4', 3, 1, 2), lote(5, '4', 4, 1, 2), lote(6, '4', 5, 1, 3), lote(7, '4', 6, 1, 3), lote(8, '4', 7, 1, 4), lote(9, '4', 8, null, null),
        lote(10, '2', 20, 1, 1, { hecho: true, fecha: '2026-11-02' }), lote(11, '2', 21, 1, 2, { hecho: true })],
    q2: [lote(2, '4', 1, 3, 1)]
};
const rep = (fecha, cuad, ns) => ({ fecha, cuad, items: ns.map((n) => ({ mr: typeof n === 'string' ? n : 'Z1CC' + ('000' + n).slice(-4), lote: String(n) })) });
const REPS = [rep('2026-11-02', '4', [1]), rep('2026-11-03', '4', [2, 3]), rep('2026-11-04', '4', [5, 7, 'Z9CC0999'])];

test('cruzar: a tiempo, tarde, adelantado, atrasado y fuera de programación', () => {
    const r = cruzar(PROG, REPS, '2026-11-04');   // miércoles de la semana 1
    assert.equal(r.q, 1);
    const est = Object.fromEntries(r.filas.map((f) => [f.lote, f.estado]));
    assert.deepEqual(est, { 1: 'atiempo', 2: 'tarde', 3: 'atiempo', 4: 'atrasado', 5: 'atiempo', 6: 'hoy', 7: 'antes', 8: 'sin', 20: 'atiempo', 21: 'hechosf' });
    assert.equal(r.filas.find((f) => f.lote === '2').dif, 1);
    assert.equal(textoDif(r.filas.find((f) => f.lote === '2')), '1 día tarde (tocaba lun 02/11)');
    assert.equal(textoDif(r.filas.find((f) => f.lote === '7')), '1 día antes (tocaba jue 05/11)');
    assert.deepEqual(r.fuera, [{ mr: 'Z9CC0999', lote: 'Z9CC0999', fecha: '2026-11-04', cuad: '4' }]);
    assert.equal(r.cuenta.atrasado, 1);
    assert.equal(r.cuenta.debian, 8);          // 6 de la cuadrilla 4 hasta el miércoles + 2 de la cuadrilla 2
    assert.equal(r.cuenta.hechosDeDebian, 6);
    assert.equal(r.cuenta.cumplimiento, 75);
});

test('cruzar: dónde va cada cuadrilla en la fecha', () => {
    const r = cruzar(PROG, REPS, '2026-11-04'), c4 = r.cuadrillas.find((c) => c.cuad === '4'), c2 = r.cuadrillas.find((c) => c.cuad === '2');
    // Va trabajando lo del jueves (adelantó el lote 7) pero dejó atrás el lote 4, del martes: no es «atrasada», tiene un hueco
    assert.equal(c4.situacion, 'huecos');
    assert.equal(c4.vaEn, '2026-11-03');
    assert.equal(c4.frente, '2026-11-05');
    assert.equal(c4.atraso, 0);
    assert.deepEqual(c4.atrasados.map((f) => f.lote), ['4']);
    assert.deepEqual(c4.tocaban.map((f) => f.lote), ['5', '6']);
    assert.deepEqual(c4.hizo.map((f) => f.lote), ['5', '7']);
    assert.equal(c4.cumplimiento, 67);         // 4 de 6
    assert.deepEqual(c4.ultimo.filas.map((f) => f.lote), ['5', '7']);
    assert.match(textoSituacion(c4, r.fecha), /Va en lo del día, pero dejó 1 lote atrás \(del mar 03\/11\)/);
    assert.equal(c2.situacion, 'terminada');
    assert.equal(c2.cumplimiento, 100);
});

test('cruzar: es una foto del día (lo reportado después del corte no cuenta)', () => {
    const lunes = cruzar(PROG, REPS, '2026-11-02'), c4 = lunes.cuadrillas.find((c) => c.cuad === '4');
    assert.equal(lunes.filas.find((f) => f.lote === '2').estado, 'hoy');
    assert.equal(c4.situacion, 'aldia');
    assert.equal(c4.vaEn, '2026-11-02');
    assert.equal(lunes.fuera.length, 0);
    const sabado = cruzar(PROG, REPS, '2026-11-07').cuadrillas.find((c) => c.cuad === '4');
    // El sábado sigue con el frente en lo del jueves 5 (último reporte, el miércoles 4). Lo del sábado todavía no vence:
    // debía llevar hasta lo del viernes → 1 día hábil de atraso, y 3 sin reportar
    assert.equal(sabado.situacion, 'atrasada');
    assert.equal(sabado.atraso, 1);
    assert.equal(sabado.sinReportar, 3);
    assert.match(textoSituacion(sabado, '2026-11-07'), /Va en lo del jue 05\/11: 1 día hábil de atraso · 2 lotes sin hacer, el más viejo del mar 03\/11\. No reporta desde el mié 04\/11\./);
    assert.deepEqual(sabado.atrasados.map((f) => f.lote), ['4', '6']);
    // Sin ningún reporte: debía ir en lo del día
    const nada = cruzar(PROG, [], '2026-11-04').cuadrillas.find((c) => c.cuad === '4');
    assert.equal(nada.situacion, 'atrasada');
    assert.equal(nada.atraso, 2);              // lunes y martes sin nada (el miércoles es el día de corte)
    assert.match(textoSituacion(nada, '2026-11-04'), /Sin reportes: debía ir en lo del mié 04\/11: 2 días hábiles de atraso · 4 lotes sin hacer/);
});

test('cruzar: quincena 2, lote mensual de Q1 hecho en fechas de Q2 y repetidos', () => {
    // El lote 4 (solo en Q1) se reporta el 16/11; el lote 1 (quincenal) se reporta en Q2 dos veces
    const reps = REPS.concat([rep('2026-11-16', '4', [1, 4]), rep('2026-11-17', '4', [1])]);
    const r = cruzar(PROG, reps, '2026-11-17');
    assert.equal(r.q, 2);
    assert.deepEqual(r.filas.map((f) => f.lote + ':' + f.estado), ['1:atiempo']);
    assert.deepEqual(r.repetidos, [{ mr: 'Z1CC0001', lote: '1', cuad: '4', fechas: ['2026-11-16', '2026-11-17'] }]);
    const l4 = r.todas.find((f) => f.q === 1 && f.lote === '4');
    assert.equal(l4.estado, 'tarde');
    assert.equal(l4.dif, 13);
});

test('cruzar: el reporte y el Excel con fechas distintas, o el lote reportado por otra cuadrilla, se avisan', () => {
    const r = cruzar(PROG, [rep('2026-11-03', '5', [20])], '2026-11-04'), f = r.filas.find((x) => x.lote === '20');
    assert.equal(f.real, '2026-11-03');
    assert.equal(f.fuente, 'ambos');
    assert.ok(f.choque && f.otraCuad);
    assert.equal(r.choques.length, 1);
    assert.equal(r.otraCuad.length, 1);
});

test('cruzar: calendario de la quincena y resumen de texto', () => {
    const r = cruzar(PROG, REPS, '2026-11-04');
    assert.equal(r.dias.length, 12);           // dos semanas de lunes a sábado
    assert.equal(r.dias[0], '2026-11-02');
    const c4 = r.calendario.find((c) => c.cuad === '4');
    assert.deepEqual(c4.dias.slice(0, 4).map((d) => [d.prog, d.hechos, d.reportados]), [[2, 2, 1], [2, 1, 2], [2, 1, 2], [1, 1, 0]]);
    const t = textoCruce(r);
    assert.match(t, /\*Cuadrilla 4\* · 5 de 8 · cumplimiento 67 %/);
    assert.match(t, /Hoy le tocaban: 5 ✓, 6 ✗/);
    assert.match(t, /Sin hacer: 4 \(mar 03\/11\)/);
    assert.match(t, /no están en la programación: Z9CC0999/);
    assert.ok(esHecho('tarde') && !esHecho('atrasado'));
});
