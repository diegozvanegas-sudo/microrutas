// Pruebas de 🤖 Pregúntale a Claude: la página (src/preguntar/comun.js) y el trabajador del PC (scripts/asistente/datos.mjs).
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motorPrendido, agruparHilos, hayEnCurso, respuestaHtml, textoWhatsapp, cuanto, htmlLista, textoCuenta } from '../src/preguntar/comun.js';
import { decodificar, prepararPoligonos, enCual, resumirCapa, aCsv, aJsonl, instrucciones, armarPrompt, leerSalida, MODELOS } from '../../scripts/asistente/datos.mjs';
import { SECCIONES } from '../src/secciones.js';

test('motor: prendido si marcó hace menos de 90 s', () => {
    const ahora = Date.parse('2026-11-22T12:00:00Z');
    assert.equal(motorPrendido({ visto: '2026-11-22T11:59:00Z' }, ahora), true);
    assert.equal(motorPrendido({ visto: '2026-11-22T11:58:00Z' }, ahora), false);
    assert.equal(motorPrendido(null, ahora), false);
});
test('conversaciones: por hilo, la más reciente arriba y en orden dentro', () => {
    const ps = [
        { id: 'a', hilo: 'h1', creado: '2026-11-22T10:00:00Z', estado: 'lista' },
        { id: 'b', hilo: 'h2', creado: '2026-11-22T11:00:00Z', estado: 'lista' },
        { id: 'c', hilo: 'h1', creado: '2026-11-22T12:00:00Z', estado: 'pendiente' }
    ];
    const h = agruparHilos(ps);
    assert.deepEqual(h.map((x) => x.hilo), ['h1', 'h2']);
    assert.deepEqual(h[0].preguntas.map((x) => x.id), ['a', 'c']);
    assert.equal(hayEnCurso(ps), true);
    assert.equal(hayEnCurso(ps.slice(0, 2)), false);
});
test('respuesta: se escapa todo y solo quedan negrita, títulos y enlaces', () => {
    const h = respuestaHtml('# Zona 1\n**Ojo** <script>x</script> *ya* https://www.google.com/maps/dir/6.2,-75.5/6.3,-75.6');
    assert.ok(h.includes('<b class="preg-tit">Zona 1</b>'));
    assert.ok(h.includes('<b>Ojo</b>') && h.includes('<b>ya</b>'));
    assert.ok(h.includes('&lt;script&gt;') && !h.includes('<script>'));
    assert.ok(h.includes('<a href="https://www.google.com/maps/dir/6.2,-75.5/6.3,-75.6" target="_blank" rel="noopener">'));
    assert.ok(!respuestaHtml('<a href="javascript:x">').includes('<a href'), 'un enlace escrito en la respuesta no se vuelve enlace');
});
test('WhatsApp: negritas y títulos con un asterisco', () => {
    assert.equal(textoWhatsapp('## Zona 5\n**Calle 10** y *Provenza*'), '*Zona 5*\n*Calle 10* y *Provenza*');
    assert.equal(cuanto('2026-11-22T12:00:00Z', '2026-11-22T12:00:45Z'), '45 s');
    assert.equal(cuanto('2026-11-22T12:00:00Z', '2026-11-22T12:03:10Z'), '3 min');
});
test('sección: está en el menú General', () => {
    const s = SECCIONES.find((x) => x.clave === 'preguntar');
    assert.equal(s.grupo, 'General');
    assert.equal(s.pagina, 'preguntar.html');
});

// ---------- Trabajador del PC ----------
const cuadrado = (lon, lat, d) => [Math.round(lon * 1e6), Math.round(lat * 1e6), d, 0, 0, d, -d, 0, 0, -d];
const zonas = { tipo: 'poligono', items: [{ n: 'Zona 1', g: [[cuadrado(-75.6, 6.2, 100000)]] }, { n: 'Zona 3', g: [[cuadrado(-75.4, 6.2, 100000)]] }] };
test('geometría: diferencias ×1e6 a [lon, lat]', () => {
    assert.deepEqual(decodificar([-75000000, 6000000, 1000000, 500000]), [[-75, 6], [-74, 6.5]]);
});
test('capas: cada elemento con su zona EMV por ubicación, coordenadas y caja', () => {
    const pol = prepararPoligonos(zonas);
    assert.equal(enCual([-75.55, 6.25], pol), 'Zona 1');
    assert.equal(enCual([-75.35, 6.25], pol), 'Zona 3');
    assert.equal(enCual([-75.0, 6.25], pol), '');
    const puntos = resumirCapa({ tipo: 'punto', items: [{ n: 'Parque', z: 'Zona 1', d: 'Calle 77 con carrera 49', g: [-75550000, 6250000] }] }, pol, []);
    assert.deepEqual(puntos, [{ nombre: 'Parque', dato: 'Zona 1', direccion: 'Calle 77 con carrera 49', zona_emv: 'Zona 1', comuna: '', lat: 6.25, lon: -75.55 }]);
    const linea = resumirCapa({ tipo: 'linea', items: [{ n: 'Z3R01DOM', j: 'Mañana', g: [[-75380000, 6230000, 20000, 20000]] }] }, pol, []);
    assert.equal(linea[0].zona_emv, 'Zona 3');
    assert.deepEqual(linea[0].caja, [6.23, -75.38, 6.25, -75.36]);
});
test('CSV y JSONL: comillas, comas y objetos', () => {
    assert.equal(aCsv([{ a: 'x, y', b: 'dijo "hola"' }, { a: 1, c: { k: 2 } }]), 'a,b,c\n"x, y","dijo ""hola""",\n1,,"{""k"":2}"\n');
    assert.equal(aCsv([]), '');
    assert.equal(aJsonl([{ a: 1 }, { b: 'ñ' }]), '{"a":1}\n{"b":"ñ"}\n');
});
test('instrucciones: fecha, persona y aviso sin permiso de contrato', () => {
    const con = instrucciones({ nombre: 'Ana', hoy: '2026-11-22', diaSemana: 'domingo', contrato: true });
    assert.ok(con.includes('Ana') && con.includes('2026-11-22 (domingo)') && con.includes('LEEME.md'));
    assert.ok(!con.includes('NO tiene permiso'));
    assert.ok(instrucciones({ hoy: '2026-11-22', diaSemana: 'domingo', contrato: false }).includes('NO tiene permiso'));
    assert.deepEqual(Object.keys(MODELOS), ['rapido', 'fondo']);
});
test('conversación: solo lo ya respondido, y la nueva pregunta al final', () => {
    assert.equal(armarPrompt(' ¿Y la zona 7? ', []), '¿Y la zona 7?');
    const p = armarPrompt('¿Y la zona 7?', [{ texto: 'Recorrido zona 1', respuesta: 'Ruta A', estado: 'lista' }, { texto: 'Otra', respuesta: '', estado: 'error' }]);
    assert.ok(p.startsWith('Conversación hasta ahora:'));
    assert.ok(p.includes('PREGUNTA: Recorrido zona 1\nRESPUESTA: Ruta A'));
    assert.ok(!p.includes('Otra'));
    assert.ok(p.endsWith('Nueva pregunta:\n¿Y la zona 7?'));
});
test('salida de Claude: respuesta, límite del plan, sesión y otros errores en palabras', () => {
    assert.deepEqual(leerSalida('{"type":"result","is_error":false,"result":"Hola"}', '', 0), { ok: true, texto: 'Hola' });
    assert.match(leerSalida('{"is_error":true,"result":"Claude AI usage limit reached|1763830000"}', '', 1).texto, /uso del plan/);
    assert.match(leerSalida('', 'Invalid API key · Please run /login', 1).texto, /sesión iniciada/);
    assert.match(leerSalida('{"is_error":true,"result":"Credit balance is too low"}', '', 1).texto, /sin saldo/);
    assert.match(leerSalida('basura', '', 2).texto, /^Claude no pudo responder: basura/);
});
test('lista: escapa la pregunta, ofrece volver a preguntar si falló y pliega la respuesta', () => {
    const ps = [
        { id: 'a', hilo: 'h1', texto: '<b>¿ruta?</b>', creado: '2026-11-22T10:00:00Z', tomado: '2026-11-22T10:00:05Z', respondido: '2026-11-22T10:01:10Z', estado: 'lista', respuesta: '**Listo**', modelo: 'fondo' },
        { id: 'b', hilo: 'h2', texto: 'Otra', creado: '2026-11-22T11:00:00Z', estado: 'error', error: 'Sin sesión', modelo: 'rapido' }
    ];
    const h = htmlLista(ps, { a: false });
    assert.ok(h.includes('&lt;b&gt;¿ruta?&lt;/b&gt;'));
    assert.ok(h.includes('preg-resp plegada') && h.includes('▾ Ver respuesta'));
    assert.ok(h.includes('🧠 a fondo · 1 min'));
    assert.ok(h.includes('data-repetir="b"') && h.includes('Sin sesión'));
    assert.ok(h.indexOf('data-seguir="h2"') < h.indexOf('data-seguir="h1"'), 'la conversación más reciente arriba');
    assert.equal(textoCuenta(ps), '2 conversaciones');
    assert.ok(htmlLista([]).includes('Todavía no ha preguntado'));
});
