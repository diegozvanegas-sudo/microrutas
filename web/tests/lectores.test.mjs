// Pruebas de lo que se lee a mano o de WhatsApp: coordenadas, mensajes de las cuadrillas, recorrido y textos.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parsearMensaje } from '../src/subsanaciones/mensaje.js';
import { recorridoCorto } from '../src/subsanaciones/recorrido.js';
import { textoDia, textoResumen } from '../src/subsanaciones/whatsapp.js';
import { fijarItems, calcularEstado, limpiarObs } from '../src/subsanaciones/estado.js';
import { claveFecha, aInput, aTexto, metros } from '../src/subsanaciones/util.js';
import { leerPqr, armarRespuestas, hablaDeCobro, fechaLarga, temasDeQueja } from '../src/pqr/plantillas.js';

// coordenadas.js es un script de la página: deja leerCoordenadas en window
globalThis.window = globalThis;
createRequire(import.meta.url)('../public/js/coordenadas.js');
createRequire(import.meta.url)('../public/js/camara_marca.js');
createRequire(import.meta.url)('../public/js/direcciones.js');
const leer = (t) => window.leerCoordenadas(t);
const cerca = (c, lat, lng) => { assert.ok(c, 'no leyó coordenadas'); assert.ok(Math.abs(c.lat - lat) < 1e-4 && Math.abs(c.lng - lng) < 1e-4, JSON.stringify(c)); };

test('coordenadas: formatos que se escriben o copian', () => {
    cerca(leer('6.2751N 75.5737W'), 6.2751, -75.5737);
    cerca(leer('6.2751, -75.5737'), 6.2751, -75.5737);
    cerca(leer('6,2751 -75,5737'), 6.2751, -75.5737);
    cerca(leer('6°16\'30.4"N 75°34\'25.3"W'), 6.27511, -75.57369);
    cerca(leer('https://maps.google.com/?q=6.2751,-75.5737'), 6.2751, -75.5737);
    // Sin signo, una longitud de 60 a 85 es oeste (Colombia)
    cerca(leer('6.2751 75.5737'), 6.2751, -75.5737);
});

test('coordenadas: corrige un dígito de más y lat/lng invertidas', () => {
    const c = leer('76.19650, -75.58450');
    cerca(c, 6.1965, -75.5845);
    assert.match(c.corregida, /dígito/);
    const inv = leer('-75.5845, 6.1965');
    cerca(inv, 6.1965, -75.5845);
    assert.match(inv.corregida, /invertidas/);
    assert.equal(leer('6.2751, -75.5737').corregida, undefined);
});

test('coordenadas: no confunde lotes, horas ni texto suelto', () => {
    assert.equal(leer('532'), null);
    assert.equal(leer('532, 371'), null);
    assert.equal(leer('Lote 400 a las 10:30'), null);
    assert.equal(leer(''), null);
});

test('coordenadas de foto: texto de la marca de agua leído con OCR', () => {
    const foto = window.coordenadasDeFoto;
    // Marca de agua del lote 287 (Timestamp Camera): fecha arriba, coordenadas abajo
    let c = foto('24 oct 2026 9:58:51 a.m.\n6°17\'38.65722"N 75°34\'37.8"W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.texto, '6°17\'38.65722"N 75°34\'37.8"W');
    // El lector confunde ° con o, las comillas dobles con dos sencillas y el punto con coma
    c = foto('6o17\'38,65722\'\'N 75°34\'37.8\'\'W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.texto, '6°17\'38.65722"N 75°34\'37.8"W');
    // El punto de los segundos se pierde (37.8 -> "37 8"): no se pueden perder los segundos (serían ~1 km)
    c = foto('6°17\'38.65722"N 75°34\'37 8"W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.texto, '6°17\'38.65722"N 75°34\'37.8"W');
    // Latitud y longitud en líneas distintas
    cerca(foto('Medellín\n6°17\'38.6"N\n75°34\'37.8"W'), 6.294056, -75.577167);
    // Decimales (GPS Map Camera)
    c = foto('Lat 6.275100° Long -75.573700°\n24/10/2026 10:15 AM');
    cerca(c, 6.2751, -75.5737);
    assert.equal(c.texto, 'Lat 6.275100° Long -75.573700°');
    assert.equal(c.completa, true);
    assert.equal(foto('24 oct 2026 9:58:51 a.m.'), null);
    // Segundos con comilla sencilla: se arreglan
    c = foto('6°17\'38.65722\'N 75°34\'37.8"W');
    cerca(c, 6.294071, -75.577167);
    assert.equal(c.completa, true);
    // Se perdieron los segundos de la longitud: se lee, pero no está completa (no se debe usar sin revisar)
    c = foto('6°17\'38.65722"N 75°34\'37 81.');
    assert.equal(c.completa, false);
});

const LOTES = { Z2CC0339: { lote: '339', cuad: '4' }, Z2CC0500: { lote: 'NA', cuad: '4' } };

test('mensaje: lotes ejecutados con fecha y cuadrilla', () => {
    const p = parsearMensaje('Lotes ejecutados el 14-10-2026 por la cuadrilla #2\n532\n371', LOTES);
    assert.equal(p.fecha, '2026-10-14');
    assert.equal(p.cuad, '2');
    assert.deepEqual(p.lotes, ['532', '371']);
    assert.equal(p.tipo, 'hecho');
});

test('mensaje: inicio de labores y código de microrruta', () => {
    const p = parsearMensaje('Buenos días Cuadrilla #4 inicia labores Lote de inicio Z2cc0339', LOTES);
    assert.deepEqual(p.lotes, ['339']);
    assert.equal(p.tipo, 'curso');
    // Microrruta sin número de lote: queda el código
    assert.deepEqual(parsearMensaje('Z2CC0500', LOTES).lotes, ['Z2CC0500']);
});

test('mensaje: terminó uno y pasó al otro', () => {
    const p = parsearMensaje('Terminó el lote 532, pasamos al 371', LOTES);
    assert.deepEqual(p.lotes, ['532', '371']);
    assert.deepEqual(p.enCurso, ['371']);
    assert.equal(p.tipo, 'mixto');
});

test('mensaje: la lista que arma el mapa (lotes separados por coma o renglón)', () => {
    assert.deepEqual(parsearMensaje('400,532,Z2CC0339', LOTES).lotes, ['400', '532', '339']);
    assert.deepEqual(parsearMensaje('400\n0532', LOTES).lotes, ['400', '532']);
});

test('recorrido: visita los lotes en línea sin devolverse', () => {
    const P = { a: [6.20, -75.60], b: [6.21, -75.60], c: [6.22, -75.60], d: [6.23, -75.60] };
    const dist = (x, y) => metros(typeof x === 'string' ? P[x] : x, typeof y === 'string' ? P[y] : y);
    const orden = recorridoCorto([{ id: 'c' }, { id: 'a' }, { id: 'd' }, { id: 'b' }], [6.195, -75.60], dist).map((p) => p.id);
    assert.deepEqual(orden, ['a', 'b', 'c', 'd']);
});

test('fechas: formatos del Excel y del formulario', () => {
    assert.equal(claveFecha('18/10/2026'), '20261018');
    assert.equal(claveFecha('18-10-26'), '20261018');
    assert.equal(claveFecha('2026-10-18 08:00'), '20261018');
    assert.equal(aInput('8/3/2026'), '2026-03-08');
    assert.equal(aTexto('2026-03-08'), '08/03/2026');
});

test('estado de la visita', () => {
    fijarItems(['CORTE', 'LIMPIEZA'], ['PMT']);
    assert.equal(calcularEstado({ CORTE: 'NO', LIMPIEZA: 'SI' }, ''), 'PENDIENTE');
    assert.equal(calcularEstado({ CORTE: 'SI', LIMPIEZA: 'SI' }, 'PENDIENTE'), 'SUBSANADO');
    assert.equal(calcularEstado({ CORTE: 'SI', LIMPIEZA: 'SI' }, ''), 'SIN NOVEDAD');
    assert.equal(calcularEstado({ CORTE: 'N/A', LIMPIEZA: 'N/A', 'OBSERVACIONES NOVEDADES': 'LOTE CERRADO' }, ''), 'CERRADO');
    assert.equal(limpiarObs('PENDIENTE POR SUBSANAR - falta recoger'), 'falta recoger');
});

test('WhatsApp: resumen del día por cuadrilla', () => {
    fijarItems(['CORTE', 'LIMPIEZA'], ['PMT']);
    const t = textoDia([
        { ID: 'SUB-1', CUADRILLA: '2', MICRORRUTA: 'Z2CC0202', LOTE: '400', ESTADO: 'SIN NOVEDAD', CORTE: 'SI', LIMPIEZA: 'SI' },
        { ID: 'SUB-2', CUADRILLA: '2', MICRORRUTA: 'Z2CC0100', LOTE: '532', ESTADO: 'PENDIENTE', CORTE: 'NO', LIMPIEZA: 'NO' },
        { ID: 'OPE-1', CUADRILLA: '4', MICRORRUTA: 'Z2CC0339', LOTE: '339', ESTADO: 'PENDIENTE', PMT: 'NO' },
        { ID: 'SUB-3', CUADRILLA: '10', MICRORRUTA: 'Z3CC0001', LOTE: '7', ESTADO: 'CERRADO' }
    ], '22/10/2026');
    assert.match(t, /^Resumen de visitas 22\/10\/2026\n3 lotes revisados · 1 con novedad/);
    assert.match(t, /Cuadrilla 2: 2 lotes revisados · 1 con novedad\n✓ Z2CC0202 lote 400\n⚠ Z2CC0100 lote 532: 2 ítems en NO/);
    assert.match(t, /Cuadrilla 4: 0 lotes revisados · 1 visita en operación\n🦺 Z2CC0339 lote 339: 1 novedad en operación/);
    // Cuadrillas en orden numérico: la 10 va después de la 4
    assert.ok(t.indexOf('Cuadrilla 4') < t.indexOf('Cuadrilla 10'));
    assert.match(t, /🔒 Z3CC0001 lote 7: cerrado/);
});

test('WhatsApp: resumen de pendientes agrupa por tipo y cuadrilla', () => {
    fijarItems(['CORTE'], ['PMT']);
    const t = textoResumen([{ ID: 'SUB-1', CUADRILLA: '4', MICRORRUTA: 'Z1CC0096', LOTE: '106', CORTE: 'NO', 'OBSERVACIONES NOVEDADES': 'LOTE NO REALIZADO' }]);
    assert.equal(t, 'Novedades posoperación cuadrilla 4\n\nZ1CC0096 lote 106\n\n* No realizado');
});

test('ZIP a PDF: qué archivos son fotos y en qué orden van', async () => {
    const { esImagen, ordenNatural } = await import('../src/subsanaciones/zippdf.js');
    assert.ok(esImagen('fotos/foto1.JPG'));
    assert.ok(esImagen('a.webp'));
    assert.ok(!esImagen('__MACOSX/fotos/._foto1.jpg'));
    assert.ok(!esImagen('fotos/.oculta.png'));
    assert.ok(!esImagen('notas.txt'));
    assert.deepEqual(['foto10.jpg', 'foto2.jpg', 'Foto1.jpg'].sort(ordenNatural), ['Foto1.jpg', 'foto2.jpg', 'foto10.jpg']);
});

test('foto con marca de agua: fecha y coordenadas en cada formato, y el mapa las vuelve a leer', () => {
    const f = window.marcaFormatos, d = new Date(2026, 9, 24, 14, 29, 5);
    assert.equal(f.fecha(d, 'corta'), '24 oct 2026 14:29:05');
    assert.equal(f.fecha(d, 'numeros'), '24/10/2026 14:29:05');
    assert.equal(f.fecha(d, 'ampm'), '24/10/2026 2:29:05 p. m.');
    assert.equal(f.fecha(d, 'iso'), '2026-10-24 14:29:05');
    assert.equal(f.coords(6.280683, -75.546571, 'hemisferio'), '6.28068N 75.54657W');
    assert.equal(f.coords(6.280683, -75.546571, 'decimal'), '6.280683, -75.546571');
    assert.equal(f.coords(6.280683, -75.546571, 'gms'), `6°16'50.5"N 75°32'47.7"W`);
    for (const k of ['hemisferio', 'decimal', 'gms']) cerca(leer(f.coords(6.280683, -75.546571, k)), 6.280683, -75.546571);
    // Los segundos no se redondean a 60: 6°16'59.99" -> 6°17'0.0"
    assert.equal(f.coords(6 + 17 / 60 - 0.00001 / 3600, -75.5, 'gms'), `6°17'0.0"N 75°30'0.0"W`);
});

test('direcciones: formatos de PQR y escritos a mano', () => {
    const d = (t) => { const r = window.leerDireccion(t); return r && (r.texto || r); };
    assert.equal(d('CR 38 # 91 83 MANRIQUE CENTRAL No.2'), 'Carrera 38 # 91-83');
    assert.equal(d('carrera 38  91 83'), 'Carrera 38 # 91-83');
    assert.equal(d('Cra. 38 #91-83'), 'Carrera 38 # 91-83');
    assert.equal(d('cl 97 73 20'), 'Calle 97 # 73-20');
    assert.equal(d('Calle 10 sur 43A-20'), 'Calle 10 Sur # 43A-20');
    assert.equal(d('CALLE 77 CC 65 A 30'), 'Calle 77CC # 65A-30');
    assert.equal(d('Calle 59A con carrera 64D'), 'Calle 59A # 64D');
    assert.equal(d('Cll 44C No. 90A - 12'), 'Calle 44C # 90A-12');
    assert.deepEqual(window.leerDireccion('calle 10'), { incompleta: true });
    // Lotes, microrrutas y coordenadas no son direcciones
    assert.equal(window.leerDireccion('532'), null);
    assert.equal(window.leerDireccion('Z7R191B'), null);
    assert.equal(window.leerDireccion('6.2751N 75.5737W'), null);
});

test('mensaje: lotes sin fotos por orden público', () => {
    const p = parsearMensaje('Cuadrilla: 4\n\nMicrorrutas ejecutadas:\n\nZ1cc0072 (78)\nZ1cc0073 (79)\nZ1cc0074 (80) sin fotos por orden público\nZ1cc0084 (93) sin fotos por orden publico\nZ1cc0133 (1141)', {});
    assert.deepEqual(p.sinFotos, { Z1CC0074: 'Orden público', '80': 'Orden público', Z1CC0084: 'Orden público', '93': 'Orden público' });
    assert.deepEqual(parsearMensaje('532 no se pudo tomar fotos\n371', {}).sinFotos, { '532': 'Sin fotos' });
    assert.deepEqual(parsearMensaje('532\n371', {}).sinFotos, {});
});

test('PQR: datos de la queja como vienen del sistema', () => {
    const p = leerPqr('441181\n2026-10-21\nMARIA CANO\n3009970182\nCR 38 # 91 83 MANRIQUE CENTRAL No.2\nSOLICITO LA LIMPIEZA DEL FRENTE DE MI CASA, A MI ME COBRAN\nPOR LIMPIEZA EN LOS SERVICIOS PÚBLICOS');
    assert.equal(p.id, '441181');
    assert.equal(p.fecha, '2026-10-21');
    assert.equal(p.nombre, 'MARIA CANO');
    assert.equal(p.telefono, '3009970182');
    assert.equal(p.direccion, 'CR 38 # 91 83');
    assert.equal(p.barrio, 'MANRIQUE CENTRAL No.2');
    assert.match(p.queja, /^SOLICITO LA LIMPIEZA/);
    assert.ok(hablaDeCobro(p.queja));
});

test('PQR: respuestas de cierre según la visita', () => {
    assert.equal(fechaLarga('2026-10-20'), '20 de octubre de 2026');
    const base = { id: '440774', direccion: 'CR 38 # 91 83', barrio: 'Manrique Central No.2', fechaCorte: '2026-10-20', fechaVisita: '2026-10-26', contacto: 'si', hora: 15 };
    const [completa, breve] = armarRespuestas({ ...base, resultado: 'ejecutado' });
    assert.match(completa.texto, /^Buenas tardes, favor dar cierre al ID 440774\./);
    assert.match(completa.texto, /corte de césped el 20 de octubre de 2026/);
    assert.match(completa.texto, /el 26 de octubre de 2026 se realizó visita de verificación en la dirección y se estableció contacto con el usuario/);
    assert.match(breve.texto, /ID 440774/);
    assert.doesNotMatch(completa.texto, /cobro/);
    assert.match(armarRespuestas({ ...base, resultado: 'ejecutado', cobro: true })[0].texto, /Respecto al cobro en la factura/);
    assert.match(armarRespuestas({ ...base, resultado: 'privado' })[0].texto, /antejardín o zona de propiedad privada/);
    assert.match(armarRespuestas({ ...base, resultado: 'pendiente', fechaProxima: '2026-11-05' })[0].texto, /programada para el 5 de noviembre de 2026/);
    assert.match(armarRespuestas({ ...base, resultado: 'subsanado', contacto: 'no' })[0].texto, /No fue posible establecer contacto/);
    // Sin fecha del corte queda marcado para llenarlo
    assert.match(armarRespuestas({ ...base, fechaCorte: '', resultado: 'ejecutado' })[0].texto, /\[fecha del corte\]/);
});

test('PQR: temas de la queja para buscar en el contrato y cláusulas citadas', () => {
    const temas = temasDeQueja('SOLICITO LA LIMPIEZA DEL FRENTE DE MI CASA, QUITAN LA HIERBA A LOS COSTADOS Y A MI ME DEJAN LA MALEZA').map((t) => t.id);
    assert.ok(temas.includes('frente') && temas.includes('altura'), temas.join());
    assert.deepEqual(temasDeQueja('dejaron las ramas y la basura del corte en el andén').map((t) => t.id).includes('residuos'), true);
    const [completa, breve] = armarRespuestas({ id: '1', resultado: 'privado', fechaVisita: '2026-10-26', contacto: 'si', hora: 9,
        clausulas: [{ k: 'areas:1', t: 'Texto de la cláusula.', ref: 'pág. 7 · §7' }] });
    assert.match(completa.texto, /especificaciones técnicas del contrato de corte de césped:\n• Texto de la cláusula\. \(pág\. 7 · §7\)/);
    assert.match(breve.texto, /conforme a las especificaciones técnicas del contrato/);
});

test('direcciones: se ubican con los cruces guardados en la app, sin Overpass', async () => {
    // data/rapido/cruces.js es un script de la página: deja crucesCalles en window
    const fs = await import('node:fs');
    new Function(fs.readFileSync(new URL('../public/data/rapido/cruces.js', import.meta.url), 'utf8').replace('var crucesCalles', 'window.crucesCalles'))();
    const fetchAntes = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('no debe ir a Overpass'); };
    try {
        const caja = [6.1, -75.8, 6.5, -75.4];
        const r = await window.ubicarDireccion(window.leerDireccion('CR 38 # 91 38 MANRIQUE'), caja);
        assert.equal(r.aprox, 'aproximada');
        assert.ok(Math.abs(r.lat - 6.282) < 0.003 && Math.abs(r.lng + 75.548) < 0.003, JSON.stringify(r));
        const cruce = await window.ubicarDireccion(window.leerDireccion('Calle 91 con carrera 38'), caja);
        assert.equal(cruce && cruce.aprox, 'en el cruce');
    } finally {
        globalThis.fetch = fetchAntes;
    }
});
