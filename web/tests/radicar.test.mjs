import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarDireccion, leerDireccion, faltantes, LETRAS, OPCIONES } from '../src/radicar/datos.js';

test('armar la dirección como la muestra EMVARIAS', () => {
    assert.equal(armarDireccion({ via: 'Calle', num1: '90', num2: '48', placa: '02' }), 'Calle 90 # 48 - 02');
    assert.equal(armarDireccion({ via: 'Carrera', num1: '65', letra1: 'A', num2: '88', letra2: 'D', placa: '15' }), 'Carrera 65 A # 88 D - 15');
    assert.equal(armarDireccion({ via: 'Calle', num1: '10', orient1: 'Sur', num2: '43', placa: '20' }), 'Calle 10 Sur # 43 - 20');
    assert.equal(armarDireccion({ via: 'Calle', num1: '90' }), 'Calle 90');
    assert.equal(armarDireccion({ via: 'Calle' }), '');
    assert.equal(armarDireccion(null), '');
});
test('leer una dirección escrita de corrido', () => {
    assert.deepEqual(leerDireccion('Calle 90 # 48 - 02'), { via: 'Calle', num1: '90', letra1: '', orient1: '', num2: '48', letra2: '', orient2: '', placa: '02' });
    assert.deepEqual(leerDireccion('Cr 65A No 88D-15'), { via: 'Carrera', num1: '65', letra1: 'A', orient1: '', num2: '88', letra2: 'D', orient2: '', placa: '15' });
    assert.equal(leerDireccion('cl 10 sur # 43 20').orient1, 'Sur');
    assert.equal(leerDireccion('Cl. 62 # 85-327').via, 'Calle');
    assert.equal(leerDireccion('Parque de Robledo'), null);
    const d = leerDireccion('Calle 90 # 48 - 02');
    assert.equal(armarDireccion(d), 'Calle 90 # 48 - 02');
});
test('faltantes del formulario', () => {
    const base = { tipoSolicitud: 'Queja', tipoSolicitante: 'Natural', tipoIdentificacion: 'Cédula de ciudadanía', numeroIdentificacion: '1', primerNombre: 'Ana', primerApellido: 'Pérez',
        municipio: 'MEDELLÍN', mismaNotificacion: true, prestacion: { via: 'Calle', num1: '90', num2: '48', placa: '02' }, telefonoMovil: '3', telefonoFijo: '4', correo: 'a@b.co', medioRespuesta: 'Correo electrónico', contenido: 'x' };
    assert.deepEqual(faltantes(base), []);
    assert.deepEqual(faltantes({ ...base, tipoSolicitante: 'Anónimo', numeroIdentificacion: '', primerNombre: '' }), []);
    assert.deepEqual(faltantes({ ...base, mismaNotificacion: false, notificacion: {} }), ['dirección de notificación']);
    assert.ok(faltantes({}).length >= 8);
});
test('opciones como las del formulario', () => {
    assert.equal(OPCIONES.tipoSolicitud.length, 11);
    assert.ok(LETRAS.indexOf('A') === 0 && LETRAS.indexOf('CE') !== -1 && LETRAS.indexOf('CF') === -1);
});
