import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palabras, buscarEnDocumentos, documentoCitas, resaltarPalabras, plano } from '../src/contrato/busqueda.js';

const DOCS = {
    'GUIA-CAMPO': [
        { id: '_documento', tipo: 'meta', titulo: 'Guía', items: [{ t: 'x' }] },
        { id: 'llegada', icono: '🚧', titulo: 'Al llegar al frente de trabajo', tipo: 'chequeo', items: [
            { t: 'El supervisor del contratista está con la cuadrilla (coordina máximo 1 cuadrilla).', ref: 'ET pág. 12 · ANS 22' },
            { t: 'Mallas: ningún guadañador sin malla.', ref: 'ET pág. 16' }] },
        { id: 'ans', icono: '💸', titulo: 'Tabla de ANS', tipo: 'tabla', items: [{ clave: 'ANS 22', t: 'Supervisor ausente de la cuadrilla durante la operación → 1 SMMLV.' }] },
    ],
    CESPED: [{ id: 'personal', icono: '👷', titulo: 'Personal, vehículos y seguridad', tipo: 'lista', items: [{ t: 'Supervisores con transporte propio.', ref: 'pág. 12' }, { t: 'Vehículos modelo 2015.' }] }],
    'REQ-PLANTILLAS': [{ id: '_config', tipo: 'config', titulo: 'Config', items: [{ clave: 'firma', t: 'SUPERVISOR X|cargo' }] }],
};

test('palabras: sin tildes, sin palabras vacías, sin repetir', () => {
    assert.deepEqual(palabras('¿El supervisor debe estar en la operación siempre?'), ['supervisor', 'estar', 'operacion', 'siempre']);
    assert.deepEqual(palabras('ANS 22'), ['ans', '22']);
    assert.deepEqual(palabras('de la el'), []);
});
test('busca en todos los documentos, en orden, y no en la configuración', () => {
    const r = buscarEnDocumentos(DOCS, 'supervisor', { 'GUIA-CAMPO': 'Guía', CESPED: 'Contrato' }, ['GUIA-CAMPO', 'CESPED']);
    assert.deepEqual(r.grupos.map(g => g.codigo), ['GUIA-CAMPO', 'CESPED']);
    assert.equal(r.total, 3);
    assert.equal(r.grupos[0].nombre, 'Guía');
    // «supervisores» también aparece (raíz)
    assert.equal(r.grupos[1].secciones[0].items[0].t, 'Supervisores con transporte propio.');
});
test('todas las palabras deben estar, en cualquier orden', () => {
    assert.equal(buscarEnDocumentos(DOCS, 'cuadrilla supervisor').total, 2);
    assert.equal(buscarEnDocumentos(DOCS, 'supervisor mallas').total, 0);
    assert.equal(buscarEnDocumentos(DOCS, 'ANS 22').total, 2);     // la referencia «ANS 22» también cuenta
    assert.equal(buscarEnDocumentos(DOCS, '').total, 0);
});
test('primero lo que trata del tema (clave o título)', () => {
    const r = buscarEnDocumentos(DOCS, 'ans 22');
    assert.equal(r.grupos[0].secciones[0].id, 'ans');
});
test('documento de citas desde las plantillas', () => {
    const filas = [
        { id: 'ans', tipo: 'tabla', items: [{ clave: 'ANS 2', t: 'Texto 2' }] },
        { id: 'p1', tipo: 'plantilla', items: [{ clave: 'obligacion', ref: '7.10. Seguridad', t: 'Cita C' }, { clave: 'obligacion', ref: '7.3. Personal', t: 'Cita A' }] },
        { id: 'p2', tipo: 'plantilla', items: [{ clave: 'obligacion', ref: '7.3. Personal', t: 'Cita A' }, { clave: 'obligacion', ref: '6.2.1. Atribuciones (Condiciones particulares)', t: 'Cita CP' }] },
    ];
    const d = documentoCitas(filas);
    assert.deepEqual(d.map(s => s.titulo), ['Citas del contrato y ANS', 'ANS de la renovación 3 (comunicado de aceptación, numeral 6.8.1)', 'Numeral 6.2.1. Atribuciones (Condiciones particulares)', 'Numeral 7.3. Personal', 'Numeral 7.10. Seguridad']);
    assert.equal(d[3].items.length, 1);                              // la cita repetida va una vez
    assert.equal(d[2].items[0].ref, 'Condiciones particulares');
});
test('resaltar sin tildes y escapando', () => {
    const esc = s => s.replace(/</g, '&lt;');
    assert.equal(resaltarPalabras('La operación <x>', ['operacion'], esc), 'La <mark>operación</mark> &lt;x>');
    assert.equal(plano('ÁRBOL'), 'arbol');
});
