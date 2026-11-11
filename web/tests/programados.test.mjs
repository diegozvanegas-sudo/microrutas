// Envíos de WhatsApp programados: hora por defecto, validaciones, destinos y textos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaPorDefecto, aInputLocal, deInputLocal, destinoValido, validar, cuandoTexto, recordarDestino, nombreSeguro, MAX_ARCHIVO } from '../src/whatsapp/programados.js';

test('horaPorDefecto: las 5:00 a. m. siguientes', () => {
    assert.equal(aInputLocal(horaPorDefecto(new Date(2026, 10, 11, 22, 30))), '2026-11-12T05:00');   // de noche → mañana
    assert.equal(aInputLocal(horaPorDefecto(new Date(2026, 10, 12, 3, 10))), '2026-11-12T05:00');    // de madrugada → hoy
    assert.equal(aInputLocal(horaPorDefecto(new Date(2026, 10, 12, 5, 0))), '2026-11-13T05:00');     // justo a las 5 → mañana
    assert.equal(aInputLocal(horaPorDefecto(new Date(2026, 10, 30, 20, 0), 6, 30)), '2026-12-01T06:30');   // cambio de mes
});
test('fechas del campo datetime-local', () => {
    const d = deInputLocal('2026-11-12T05:00');
    assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 10); assert.equal(d.getDate(), 12); assert.equal(d.getHours(), 5);
    assert.equal(deInputLocal(''), null);
    assert.equal(aInputLocal(d), '2026-11-12T05:00');
});
test('destinos: grupo, celular de Colombia o con indicativo', () => {
    assert.equal(destinoValido('120363025246125486@g.us'), '120363025246125486@g.us');
    assert.equal(destinoValido(' 300 123 4567 '), '3001234567');
    assert.equal(destinoValido('+57 300-123-4567'), '573001234567');
    assert.equal(destinoValido('12345'), '');
    assert.equal(destinoValido('hola@g.us'), '');
});
test('validar: lo que falta, explicado', () => {
    const ahora = new Date(2026, 10, 11, 22, 0), bien = { para: '3001234567', texto: 'Informe', enviarEn: new Date(2026, 10, 12, 5, 0) };
    assert.deepEqual(validar(bien, ahora), []);
    assert.deepEqual(validar({ ...bien, texto: '', archivo: { size: 10 } }, ahora), []);    // solo archivo también sirve
    assert.match(validar({ ...bien, para: '' }, ahora)[0], /Elija a quién/);
    assert.match(validar({ ...bien, para: '123' }, ahora)[0], /no es un celular/);
    assert.match(validar({ ...bien, texto: ' ' }, ahora)[0], /mensaje o adjunte/);
    assert.match(validar({ ...bien, enviarEn: new Date(2026, 10, 11, 21, 0) }, ahora)[0], /ya pasó/);
    assert.match(validar({ ...bien, enviarEn: null }, ahora)[0], /día y la hora/);
    assert.match(validar({ ...bien, archivo: { size: MAX_ARCHIVO + 1 } }, ahora)[0], /máximo es 20 MB/);
});
test('cuandoTexto: hoy, mañana o la fecha', () => {
    const ahora = new Date(2026, 10, 11, 22, 0);
    assert.equal(cuandoTexto(new Date(2026, 10, 12, 5, 0), ahora), 'mañana 5:00 a. m.');
    assert.equal(cuandoTexto(new Date(2026, 10, 11, 23, 5), ahora), 'hoy 11:05 p. m.');
    assert.equal(cuandoTexto(new Date(2026, 10, 11, 12, 0), ahora), 'hoy 12:00 p. m.');
    assert.equal(cuandoTexto(new Date(2026, 10, 14, 0, 30), ahora), 'sáb 14 nov · 12:30 a. m.');
});
test('recordarDestino y nombreSeguro', () => {
    let l = recordarDestino([], { id: '3001234567', nombre: 'Ana' });
    l = recordarDestino(l, { id: '1203@g.us', nombre: 'Grupo' });
    l = recordarDestino(l, { id: '300 123 4567', nombre: 'Ana' });
    assert.deepEqual(l.map(d => d.id), ['3001234567', '1203@g.us']);
    assert.equal(recordarDestino(l, { id: 'malo' }).length, 2);
    for (let i = 0; i < 12; i++) l = recordarDestino(l, { id: '30000000' + String(i).padStart(2, '0') });
    assert.equal(l.length, 8);
    assert.equal(nombreSeguro('Informe del día (1).pdf'), 'Informe_del_dia_1_.pdf');
    assert.equal(nombreSeguro(''), 'archivo');
});
