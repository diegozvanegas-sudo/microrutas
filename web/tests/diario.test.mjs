// Pruebas del Informe diario y de Pendientes: lectura de lo escrito a la carrera y el texto para WhatsApp.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPendientes, textoInforme, frasesVisitas, cuentasVisitas, fraseSubsanadas, frasePqrRespondidas, diaPorDefecto, nombreDia } from '../src/diario/comun.js';

// Lunes 26 de octubre de 2026, 7:43 p. m.
const AHORA = new Date(2026, 9, 26, 19, 43);

test('pendientes: el mensaje del grupo, renglón por renglón con su momento', () => {
    const r = leerPendientes('revisar pqr doce de octubre - robledo en la mañana\nen la tarde pqr manrique', '2026-10-27', AHORA);
    assert.deepEqual(r, [
        { texto: 'Revisar pqr doce de octubre - robledo', momento: 'manana', fecha: '2026-10-27' },
        { texto: 'Pqr manrique', momento: 'tarde', fecha: '2026-10-27' },
    ]);
});

test('pendientes: hoy, mañana, pasado mañana y días de la semana cambian el día', () => {
    const dia = (t) => leerPendientes(t, '2026-10-26', AHORA)[0];
    assert.deepEqual(dia('llamar a la cuadrilla 4 mañana'), { texto: 'Llamar a la cuadrilla 4', momento: '', fecha: '2026-10-27' });
    assert.deepEqual(dia('mañana en la tarde enviar excel'), { texto: 'Enviar excel', momento: 'tarde', fecha: '2026-10-27' });
    assert.equal(dia('visita Belén pasado mañana').fecha, '2026-10-28');
    assert.equal(dia('reunión el viernes').fecha, '2026-10-30');
    assert.equal(dia('informe el lunes').fecha, '2026-11-02');
    assert.equal(dia('hoy: revisar fotos').texto, 'Revisar fotos');
    assert.equal(dia('tarde: revisar fotos').momento, 'tarde');
    assert.equal(leerPendientes('\n  \n', '2026-10-26', AHORA).length, 0);
});

test('pendientes: después de las 5 p. m. se anotan para mañana', () => {
    assert.equal(diaPorDefecto(AHORA), '2026-10-27');
    assert.equal(diaPorDefecto(new Date(2026, 9, 26, 9, 0)), '2026-10-26');
    assert.equal(nombreDia('2026-10-27', AHORA), 'Mañana');
    assert.equal(nombreDia('2026-10-30', AHORA), 'viernes 30 de octubre');
});

test('informe: formato del grupo de WhatsApp', () => {
    assert.equal(textoInforme(['Uno.', ' ', 'Dos.']), '*Reporte diario de actividades*\n\n✅ Uno.\n\n✅ Dos.');
    assert.match(textoInforme(['Uno.'], { fecha: '2026-10-26' }), /^\*Reporte diario de actividades\*\n_lunes 26 de octubre de 2026_/);
});

test('informe: frase de las visitas del día por cuadrilla', () => {
    const f = frasesVisitas([
        { tipo: 'EJECUCION', cuadrilla: '4', estado: 'PENDIENTE' },
        { tipo: 'EJECUCION', cuadrilla: 'C2', estado: 'SIN NOVEDAD' },
        { tipo: 'EJECUCION', cuadrilla: '4', estado: 'SUBSANADO' },
        { tipo: 'OPERACION', cuadrilla: '7', estado: 'SIN NOVEDAD' },
    ]);
    assert.equal(f[0], 'Se realizaron 3 visitas de posoperación a los lotes correspondientes a las cuadrillas 2 y 4, verificando en campo las condiciones de las zonas verdes intervenidas; se reportaron las respectivas novedades encontradas al grupo correspondiente.');
    assert.equal(f[1], 'Se realizó una visita durante la operación de la cuadrilla 7, verificando en campo la ejecución del corte de césped, el uso de mallas de protección, EPP y señalización, y la limpieza previa de las áreas.');
});

test('informe: cuántas visitas de cada tipo, subsanaciones verificadas y PQR respondidos', () => {
    assert.deepEqual(cuentasVisitas([{ tipo: 'OPERACION' }, { tipo: 'EJECUCION' }, { tipo: 'OPERACION' }]), [1, 2]);
    assert.deepEqual(cuentasVisitas([{ tipo: 'OPERACION' }]), [1]);
    assert.equal(fraseSubsanadas([{ cuadrilla: '4' }, { cuadrilla: 'C2' }, { cuadrilla: '4' }]), 'Se verificó en campo la subsanación de 3 novedades reportadas a las cuadrillas 2 y 4.');
    assert.equal(fraseSubsanadas([{ cuadrilla: '' }]), 'Se verificó en campo la subsanación de una novedad reportada.');
    assert.equal(fraseSubsanadas([]), '');
    assert.equal(frasePqrRespondidas(['440515', '440600', '440637']), 'Se dio respuesta y cierre a las PQRS con ID 440515, 440600 y 440637.');
    assert.equal(frasePqrRespondidas(['']), 'Se dio respuesta y cierre a una PQRS.');
});
