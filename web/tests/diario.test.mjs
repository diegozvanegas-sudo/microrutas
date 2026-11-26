// Pruebas del Informe diario y de Pendientes: lectura de lo escrito a la carrera y el texto para WhatsApp.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPendientes, textoInforme, frasesVisitas, cuentasVisitas, fraseSubsanadas, frasePqrRespondidas, diaPorDefecto, nombreDia, FRASES_DOMINGO, FRASES_INFORMATIVOS } from '../src/diario/comun.js';

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

test('domingos y festivos: las frases arman el reporte parcial por zona, con sus listas renglón por renglón', () => {
    const f = Object.fromEntries(FRASES_DOMINGO.map((x) => [x.t, x.texto]));
    const llenar = (t, ...cosas) => t.replace('…', cosas.join('\n* '));
    const txt = textoInforme([
        llenar(f['Zona'], '5'),
        llenar(f['Rutas limpieza vial'], 'Z5R01DOM', 'Z5R02DOM'),
        llenar(f['Recorrido vías y parques'], 'Parque Poblado', 'CL 10'),
        llenar(f['Zona'], '7'),
        llenar(f['Rutas recolección y transporte'], '703519'),
        f['Jornada sin novedad'],
    ]);
    assert.match(txt, /✅ ZONA 5\n\n✅ Se realiza verificación de las siguientes rutas de limpieza vial en operación:\n\n\* Z5R01DOM\n\* Z5R02DOM\n\n/);
    assert.match(txt, /vías secundarias y parques:\n\n\* Parque Poblado\n\* CL 10\n\n✅ ZONA 7/);
    assert.match(txt, /recolección y transporte en operación:\n\n\* 703519\n\n✅ Hasta el momento transcurre la jornada sin novedad\.$/);
    // Cada frase trae su «…» para escribir encima (menos el cierre)
    FRASES_DOMINGO.filter((x) => x.t !== 'Jornada sin novedad').forEach((x) => assert.ok(x.texto.includes('…'), x.t));
});

test('mensajes informativos: van sueltos, en tono de aviso del momento y sin repetir botón', () => {
    const f = Object.fromEntries(FRASES_INFORMATIVOS.map((x) => [x.t, x.texto]));
    assert.equal(Object.keys(f).length, FRASES_INFORMATIVOS.length);
    assert.equal(f['Sistema vial del río'], 'Al momento se realiza intervención del sistema vial del río con medidas de seguridad tanto para el personal como para terceros, por el aliado Precoodes.');
    assert.equal(f['Intervención en curso'].replace('…', 'la quebrada La Iguaná').replace('…', 'Precoodes'),
        'Al momento se realiza intervención de la quebrada La Iguaná con medidas de seguridad tanto para el personal como para terceros, por el aliado Precoodes .');
    FRASES_INFORMATIVOS.forEach((x) => assert.match(x.texto, /^[A-ZÁÉÍÓÚ].*[.]$/, x.t));
});

// Revisión de factura (grupo nuevo de «Agregar actividad»): títulos únicos y cada texto con su «…» por completar
import { FRASES_FACTURA } from '../src/diario/comun.js';
test('informe: frases de revisión de factura', () => {
    const titulos = FRASES_FACTURA.map((f) => f.t);
    assert.equal(new Set(titulos).size, titulos.length);
    assert.ok(titulos.includes('Recepción de la factura') && titulos.includes('Revisión de la factura'));
    FRASES_FACTURA.forEach((f) => { assert.match(f.texto, /\.$/, f.t); assert.ok(f.texto.length > 30, f.t); });
    assert.match(FRASES_FACTURA[0].texto, /facturación de la … quincena del mes de … y se adelanta la revisión\./);
});

test('informe: «lo de siempre», sin ✅ doble y lo que quedó sin completar', async () => {
    const { BASE_INFORME, leerBase, faltanDeBase, limpiarActividad, porCompletar, FECHA_BASE } = await import('../src/diario/comun.js');
    // Las 3 de siempre, como salen en el grupo
    assert.equal(BASE_INFORME.length, 3);
    assert.match(BASE_INFORME[0], /^Se realizaron visitas posoperación a los lotes correspondientes a la cuadrilla 2/);
    assert.equal(BASE_INFORME[1], 'Se realizó seguimiento a la programación del servicio correspondiente a las cuadrillas 2 y 4.');
    assert.match(BASE_INFORME[2], /^En los recorridos realizados se reportaron material vegetal, RCD, voluminosos y llantas/);
    assert.equal(FECHA_BASE, '2000-01-01');
    // Pegada con su ✅: el informe no queda «✅ ✅»
    assert.equal(limpiarActividad('✅  En los recorridos  realizados.'), 'En los recorridos realizados.');
    assert.equal(limpiarActividad('✅️ ✔ Hola'), 'Hola');
    assert.equal(textoInforme(['✅ En los recorridos.']), '*Reporte diario de actividades*\n\n✅ En los recorridos.');
    // Ventana: una por renglón, los vacíos no cuentan
    assert.deepEqual(leerBase('Uno.\n\n  ✅ Dos.  \n\n'), ['Uno.', 'Dos.']);
    // Las que faltan en el día (se comparan sin ✅)
    assert.deepEqual(faltanDeBase(['✅ ' + BASE_INFORME[1], 'Otra.'], BASE_INFORME), [BASE_INFORME[0], BASE_INFORME[2]]);
    assert.deepEqual(faltanDeBase(BASE_INFORME, BASE_INFORME), []);
    // «a las cuadrillas  .» o con «…»: se avisa
    assert.equal(porCompletar(['Se realizó seguimiento a la programación del servicio correspondiente a las cuadrillas  .']).length, 1);
    assert.equal(porCompletar(['Se realizaron visitas a las cuadrillas … .']).length, 1);
    assert.equal(porCompletar(BASE_INFORME).length, 0);
});

import { FRASES_RECORRIDO } from '../src/diario/comun.js';
test('recorridos: frases del recorrido en conjunto (sin nombres de personas)', () => {
    const f = Object.fromEntries(FRASES_RECORRIDO.map((x) => [x.t, x.texto]));
    assert.equal(Object.keys(f).length, FRASES_RECORRIDO.length);
    assert.match(f['Recorrido en conjunto'], /en conjunto con … por … , desde … hasta … \.$/);
    assert.match(f['Novedades evidenciadas'], /residuos ordinarios acumulados, llantas, residuos esparcidos, RCD y voluminosos\.$/);
    assert.ok(f['Volqueta del aliado'].includes('del aliado …'));
    assert.ok(f['Visita del alcalde'].includes('…'));
    FRASES_RECORRIDO.forEach((x) => { assert.match(x.texto, /\.$/, x.t); assert.ok(!x.texto.includes('@'), x.t); });
});
