import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarMotor, traer } from './ayuda_direcciones.mjs';
import { partirMensaje, leerVia, textoVia, lotesCerca, unirLotes, tramosDeVia, buscarLugares, claveLugar, nombreSugerido, ubicarItems,
    crearCargadorLotes, zonaDeIndice, urlMapa, textoResumen, titulo, RADIO } from '../src/subsanaciones/ubicardir.js';

const motor = await cargarMotor();
const lotesEn = crearCargadorLotes('rapido/', traer);
const zona = zonaDeIndice(await lotesEn.indice());
const deps = (libreta) => ({ ubicarDireccion: motor.ubicarDireccion, cruces: motor.cruces, lotesEn, zona, libreta: libreta || [] });
const partir = (t) => partirMensaje(t, motor.leerDireccion);

// El mensaje real que llegó por WhatsApp (14/11/2026), con sus saludos y sus «Reenviado»
const MENSAJE = `Hola parce!
Buenas tardes ¿Cómo estás?
Porfa para realizar la verificación de estás direcciones porfa
Y tomar registro, en caso de que sea novedad mandar a corregir
Reenviado
CRA 85 76-c18 segundo parqueadero de villa flora
Reenviado
CL 76 AD 85 C 11
Toda la calle del sector de la cañada calle 76cc
Poda sector segundo parqueadero.
Parte baja escalas calle 76c
Parte alta de la quebrada el chumbimbo sector convento.`;

test('partirMensaje: una dirección por renglón, sin los «Reenviado» ni las horas', () => {
    const it = partir(MENSAJE);
    assert.equal(it.length, 10);
    assert.deepEqual(it.map((x) => x.tipo), ['texto', 'texto', 'texto', 'texto', 'direccion', 'direccion', 'via', 'texto', 'via', 'texto']);
    assert.equal(it[4].dir.texto, 'Carrera 85 # 76C-18');
    assert.equal(it[5].dir.texto, 'Calle 76AD # 85C-11');
    assert.deepEqual(it[6].via, { tipo: 'calle', n: 76, l: 'CC', sur: '' });
    assert.equal(titulo(it[6]), 'Calle 76CC (toda la vía)');
});

test('partirMensaje: quita lo que WhatsApp pone al copiar varios mensajes', () => {
    const it = partir('[13:57, 14/11/2026] Jefe: CR 38 # 91 83 MANRIQUE\n14/11/26, 1:57 p. m. - Jefe: Calle 10 sur 43A-20\n13:57\n↪ Reenviado\nCl 97 73 20 13:58');
    assert.deepEqual(it.map((x) => x.dir && x.dir.texto), ['Carrera 38 # 91-83', 'Calle 10 Sur # 43A-20', 'Calle 97 # 73-20']);
    assert.equal(it[0].texto, 'CR 38 # 91 83 MANRIQUE');
});

test('partirMensaje: con dos vías en el renglón gana la dirección completa', () => {
    const it = partir('Escalas de la calle 76C frente a la cra 85 # 76C-18');
    assert.equal(it[0].tipo, 'direccion');
    assert.equal(it[0].dir.texto, 'Carrera 85 # 76C-18');
    assert.equal(partir('Hola, buenas tardes')[0].tipo, 'texto');
    assert.equal(partir('Lote 386 clausurado')[0].tipo, 'texto');
});

test('leerVia: la vía sola', () => {
    assert.deepEqual(leerVia('Cra. 85'), { tipo: 'carrera', n: 85, l: '', sur: '' });
    assert.deepEqual(leerVia('calle 10 sur'), { tipo: 'calle', n: 10, l: '', sur: 'SUR' });
    assert.equal(textoVia(leerVia('dg 79a')), 'Diagonal 79A');
    assert.equal(leerVia('casa 12'), null);
});

test('lotesCerca: adentro es 0 m, los demás por distancia y sin repetir', () => {
    const cuad = (lat, lon) => [[lat, lon], [lat, lon + 0.0005], [lat + 0.0005, lon + 0.0005], [lat + 0.0005, lon]];
    const lote = (n, lat, lon) => ({ lote: n, mr: 'Z1CC000' + n, cuad: '1', anillos: [cuad(lat, lon)], caja: [lat, lon, lat + 0.0005, lon + 0.0005] });
    const lotes = [lote('1', 6.2, -75.6), lote('2', 6.2, -75.5993), lote('3', 6.21, -75.6)];
    const r = lotesCerca(6.2002, -75.5998, lotes);
    assert.deepEqual(r.map((x) => x.lote), ['1', '2']);
    assert.equal(r[0].dist, 0);
    assert.ok(r[1].dist > 40 && r[1].dist <= RADIO);
    assert.deepEqual(unirLotes([{ mr: 'A', lote: '1', dist: 30 }, { mr: 'A', lote: '1', dist: 5 }]).map((x) => x.dist), [5]);
});

test('tramosDeVia: el mismo nombre de calle en barrios distintos queda en tramos aparte', () => {
    const ix = { v: ['calle 5', 'carrera 1', 'carrera 2', 'carrera 90'], c: { '0,1': [[6.2, -75.6]], '0,2': [[6.2, -75.599]], '0,3': [[6.25, -75.55]] } };
    const t = tramosDeVia(ix, { tipo: 'calle', n: 5, l: '', sur: '' });
    assert.equal(t.length, 2);
    assert.deepEqual(t.map((x) => x.puntos.length).sort(), [1, 2]);
    assert.deepEqual(tramosDeVia(ix, { tipo: 'calle', n: 6, l: '', sur: '' }), []);
});

test('libreta: encuentra el nombre aunque cambien tildes, mayúsculas o «de la»', () => {
    const libreta = [{ nombre: 'La Cañada', lote: '391' }, { nombre: 'Segundo parqueadero', lote: '386' }, { nombre: 'Segundo parqueadero de Villa Flora', lote: '386' }];
    assert.equal(claveLugar('Sector de La Cañada'), 'sector canada');
    assert.deepEqual(buscarLugares('Toda la calle del sector de la cañada calle 76cc', libreta).map((l) => l.nombre), ['La Cañada']);
    assert.deepEqual(buscarLugares('CRA 85 76-c18 SEGUNDO PARQUEADERO de villa flora', libreta).map((l) => l.lote), ['386', '386']);
    assert.deepEqual(buscarLugares('la cañadas del sur', libreta), []);
    assert.deepEqual(buscarLugares('cualquier cosa', [{ nombre: 'el', lote: '1' }]), []);
});

test('nombreSugerido: el renglón sin la dirección', () => {
    const it = partir(MENSAJE);
    assert.equal(nombreSugerido(it[4]), 'segundo parqueadero de villa flora');
    assert.equal(nombreSugerido(it[6]), 'Toda la calle del sector de la cañada');
    assert.equal(nombreSugerido(it[9]), 'Parte alta de la quebrada el chumbimbo sector convento');
});

test('ubicarItems con el mensaje real: cada dirección cae en su lote de Villa Flora', async () => {
    const it = await ubicarItems(partir(MENSAJE), deps());
    const con = it.filter((x) => x.n != null);
    assert.deepEqual(con.map((x) => x.n), [1, 2, 3, 4]);
    // Cra 85 # 76C-18: junto al parque de Villa Flora (lote 386) y la quebrada (392)
    assert.ok(con[0].punto && Math.abs(con[0].punto.lat - 6.2803) < 0.0005 && Math.abs(con[0].punto.lng + 75.5917) < 0.0005);
    assert.deepEqual(con[0].lotes.slice(0, 2).map((l) => l.lote).sort(), ['386', '392']);
    // Cl 76AD # 85C-11: cancha y colegio Villa Flora (387), parque (386)
    assert.deepEqual(con[1].lotes.slice(0, 2).map((l) => l.lote).sort(), ['386', '387']);
    // Calle 76CC sola: el tramo de Villa Flora (no el de Curazao), dentro del lote 391
    assert.equal(con[2].lotes[0].lote, '391');
    assert.equal(con[2].lotes[0].dist, 0);
    assert.equal(con[2].otrosTramos, 1);
    // Calle 76C sola: el punto queda en la parte de la calle más cercana a las otras direcciones
    assert.ok(Math.abs(con[3].punto.lat - 6.2803) < 0.001);
    assert.ok(con.every((x) => x.lotes.every((l) => l.cuad === '2')));
    // Los saludos no llevan número ni punto
    assert.ok(it.filter((x) => x.n == null).every((x) => !x.punto && !x.lotes.length));
});

test('ubicarItems con libreta: el renglón sin dirección toma el lote y el punto guardados', async () => {
    const libreta = [{ nombre: 'sector Convento', lote: '429', lat: 6.28592, lon: -75.59467 }, { nombre: 'segundo parqueadero de villa flora', lote: '386' }];
    const it = (await ubicarItems(partir(MENSAJE), deps(libreta))).filter((x) => x.n != null);
    assert.equal(it.length, 5);
    assert.equal(it[4].lotes[0].lote, '429');
    assert.equal(it[4].lotes[0].libreta, 'sector Convento');
    assert.deepEqual(it[4].punto, { lat: 6.28592, lng: -75.59467 });
    // En la dirección que sí se ubicó, el lote de la libreta pasa de primero y no se repite
    assert.equal(it[0].lotes[0].lote, '386');
    assert.equal(it[0].lotes.filter((l) => l.lote === '386').length, 1);
});

test('ubicarItems: una dirección que no existe se dice, no se inventa', async () => {
    const it = await ubicarItems(partir('Calle 999 # 999-10'), deps());
    assert.equal(it[0].punto, null);
    assert.ok(it[0].error);
    assert.deepEqual(it[0].lotes, []);
    const via = await ubicarItems(partir('toda la calle 999'), deps());
    assert.ok(via[0].error);
});

test('urlMapa y textoResumen', async () => {
    const it = await ubicarItems(partir(MENSAJE), deps());
    const url = urlMapa(it);
    assert.match(url, /^mapa_rapido\.html\?lote=[\dA-Z,]+&puntos=6\.\d{5},-75\.\d{5},1\|/);
    assert.equal(url.split('puntos=')[1].split('|').length, 4);
    assert.equal(urlMapa(partir('hola').map((x) => Object.assign(x, { lotes: [], punto: null }))), '');
    const txt = textoResumen(it, (l) => (l.lote === '386' ? '❌ le tocaba el 3/11' : ''));
    assert.match(txt, /\*1\. Carrera 85 # 76C-18\*/);
    assert.match(txt, /Lote 386 \(Z2CC0188\) · C2 · a \d+ m\n {3}❌ le tocaba el 3\/11/);
    assert.ok(!/Hola parce/.test(txt));
});
