// 🤖 Bot de WhatsApp (web/src/bot/bot.js, lo usa supabase/functions/whatsapp-bot): qué mensajes toma, a quién le
// responde, qué entiende y qué contesta. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeDe, autorizado, grupoAutorizado, comando, aRegistro, itemsNo, textoPendientes, textoListos, textoLote, reportesDe, textoGuardado, hoyColombia, AYUDA } from '../src/bot/bot.js';

// Así llega de Evolution API v2 (webhook MESSAGES_UPSERT)
const evento = (key, message) => ({ event: 'messages.upsert', instance: 'microrutas', data: { key, pushName: 'Ana', message, messageType: 'conversation' } });

test('mensajeDe: chat directo, grupo, @lid con número alterno, lo propio y lo que no es texto', () => {
    assert.deepEqual(mensajeDe(evento({ remoteJid: '573001112233@s.whatsapp.net', fromMe: false, id: 'A1' }, { conversation: 'pendientes 2' })),
        { de: '573001112233', chat: '573001112233@s.whatsapp.net', grupo: false, texto: 'pendientes 2', id: 'A1' });
    const g = mensajeDe(evento({ remoteJid: '120363000000@g.us', participant: '573009998877@s.whatsapp.net', fromMe: false }, { extendedTextMessage: { text: 'REPORTE MICRORRUTAS EJECUTADAS' } }));
    assert.equal(g.grupo, true); assert.equal(g.de, '573009998877'); assert.equal(g.chat, '120363000000@g.us');
    // Cuentas nuevas: llegan como …@lid; se usa senderPn si viene, si no queda sin número (no se le responde)
    assert.equal(mensajeDe(evento({ remoteJid: '1234567@lid', senderPn: '573001112233@s.whatsapp.net' }, { conversation: 'hola' })).de, '573001112233');
    assert.equal(mensajeDe(evento({ remoteJid: '1234567@lid' }, { conversation: 'hola' })).de, '');
    assert.equal(mensajeDe(evento({ remoteJid: '573001112233@s.whatsapp.net', fromMe: true }, { conversation: 'ayuda' })), null);
    assert.equal(mensajeDe(evento({ remoteJid: '573001112233@s.whatsapp.net' }, { stickerMessage: {} })), null);
    assert.equal(mensajeDe({ event: 'connection.update', data: {} }), null);
    assert.equal(mensajeDe(null), null);
    // Foto con texto: el pie cuenta como mensaje
    assert.equal(mensajeDe(evento({ remoteJid: '573001112233@s.whatsapp.net' }, { imageMessage: { caption: 'lote 491' } })).texto, 'lote 491');
});

test('autorizado: últimos 10 dígitos, con o sin 57; grupos por su ID exacto', () => {
    assert.equal(autorizado('573001112233', '3001112233, 573009998877'), true);
    assert.equal(autorizado('573009998877', '3001112233,573009998877'), true);
    assert.equal(autorizado('573001112234', '3001112233'), false);
    assert.equal(autorizado('', '3001112233'), false);
    assert.equal(autorizado('573001112233', ''), false);
    assert.equal(grupoAutorizado('120363000000@g.us', '120363000000@g.us, 999@g.us'), true);
    assert.equal(grupoAutorizado('120363000001@g.us', '120363000000@g.us'), false);
    assert.equal(grupoAutorizado('', ''), false);
});

test('comando: lo que entiende', () => {
    assert.deepEqual(comando('Ayuda'), { tipo: 'ayuda', arg: '' });
    assert.deepEqual(comando('Menú'), { tipo: 'ayuda', arg: '' });
    assert.deepEqual(comando('pendientes'), { tipo: 'pendientes', arg: '' });
    assert.deepEqual(comando('Pendientes cuadrilla 02'), { tipo: 'pendientes', arg: '2' });
    assert.deepEqual(comando('pendientes c4'), { tipo: 'pendientes', arg: '4' });
    assert.deepEqual(comando('*listos*'), { tipo: 'listos', arg: '' });
    assert.deepEqual(comando('requerimientos'), { tipo: 'listos', arg: '' });
    assert.deepEqual(comando('Lote 0491'), { tipo: 'lote', arg: '491' });
    assert.deepEqual(comando('z2cc271'), { tipo: 'lote', arg: 'Z2CC0271' });
    assert.equal(comando('REPORTE MICRORRUTAS EJECUTADAS\nFecha: 03-11-2026\nCuadrilla: 2\nZ2CC0271').tipo, 'reporte');
    assert.equal(comando('Reporte de micro rutas ejecutadas').tipo, 'reporte');
    assert.equal(comando('qué más pues').tipo, '');
    assert.equal(comando('491').tipo, '');   // un número suelto no: puede ser cualquier cosa
    assert.match(AYUDA, /pendientes/);
});

// Visitas como vienen de la tabla «visitas»
const fila = (id, mr, lote, fv, estado, extra) => Object.assign({ id, tipo: 'EJECUCION', microrruta: mr, lote, zona: 2, cuadrilla: '2', fecha_ejecucion: null,
    fecha_visita: fv, observaciones: '', estado, respuestas: {} }, extra);
const FILAS = [
    fila('SUB-1', 'Z2CC0104', '301', '2026-11-12', 'PENDIENTE', { respuestas: { BORDEO: 'NO', 'CORTE DE CESPED': 'SI' } }),
    fila('SUB-2', 'Z2CC0271', '491', '2026-11-03', 'PENDIENTE', { respuestas: { BORDEO: 'NO' }, observaciones: 'Falta bordeo en el andén' }),
    fila('SUB-3', 'Z4CC0010', '10', '2026-11-17', 'PENDIENTE', { cuadrilla: '4', respuestas: { 'RECOLECCIÓN': 'NO' } }),
    fila('SUB-4', 'Z2CC0271', '491', '2026-10-20', 'SUBSANADO'),
    fila('OPE-1', 'Z2CC0271', '491', '2026-11-02', 'PENDIENTE', { tipo: 'OPERACION' })
];
const REG = FILAS.map(aRegistro);
const HOY = '2026-11-21';

test('aRegistro e itemsNo: la visita de la base con las columnas de la app', () => {
    assert.equal(REG[0]['FECHA DE LA VISITA'], '12/11/2026');
    assert.equal(REG[4].TIPO, 'OPERACIÓN');
    assert.deepEqual(itemsNo(REG[0]), ['BORDEO']);
    assert.equal(Object.keys(REG[0]).includes('_respuestas'), false);
});

test('textoPendientes y textoListos: por cuadrilla, con días hábiles y marca de plazo', () => {
    const t = textoPendientes(REG, HOY, '');
    assert.match(t, /\*Pendientes\* \(3\) al 21\/11\/2026/);
    assert.match(t, /🔴 Lote 491 \(Z2CC0271\) · visita 03\/11 · 15 días hábiles · BORDEO, Falta bordeo en el andén/);
    assert.match(t, /🟠 Lote 301 \(Z2CC0104\) · visita 12\/11 · 7 días hábiles · BORDEO/);
    assert.match(t, /\*Cuadrilla 4\*/);
    assert.doesNotMatch(t, /OPE-1/);
    const t2 = textoPendientes(REG, HOY, '4');
    assert.match(t2, /cuadrilla 4\* \(1\)/);
    assert.doesNotMatch(t2, /Lote 491/);
    assert.match(textoPendientes(REG, HOY, '9'), /No hay visitas pendientes de la cuadrilla 9/);
    const l = textoListos(REG, HOY);
    assert.match(l, /🔴 \*Requerimiento\* \(1\)\n• C2 · Lote 491 \(Z2CC0271\) · 15 días hábiles/);
    assert.match(l, /🟠 \*Pre aviso\* \(1\)\n• C2 · Lote 301 \(Z2CC0104\) · pasa el 23\/11/);
});

test('textoListos: la afectación a árboles va de una, sin días', () => {
    const conArbol = REG.concat([aRegistro(fila('SUB-9', 'Z2CC0300', '521', '2026-11-19', 'PENDIENTE', { respuestas: { 'AFECTACIÓN A ÁRBOLES': 'NO' } }))]);
    assert.match(textoListos(conArbol, HOY), /• C2 · Lote 521 \(Z2CC0300\) · 🌳 afectación a árboles \(va de una\)/);
});

test('textoLote: por número o microrruta, las últimas visitas primero', () => {
    const t = textoLote('491', REG, [{ microrruta: 'Z2CC0271', no_lote: '491', cuadrilla: '2', direccion: 'Cl 76 x cr 91' }]);
    assert.match(t, /^📍 \*Lote 491\* · Z2CC0271 · cuadrilla 2 · Cl 76 x cr 91/);
    const orden = t.split('\n').filter((x) => /^\S+ \d\d\/\d\d\/\d{4}/.test(x)).map((x) => x.split(' ')[1]);
    assert.deepEqual(orden, ['03/11/2026', '02/11/2026', '20/10/2026']);
    assert.match(t, /NO: BORDEO/);
    assert.match(textoLote('Z2CC0271', REG, []), /^📍 \*Z2CC0271\*/);
    assert.match(textoLote('9999', REG, []), /No encontré ese lote/);
});

test('reportes pegados: se leen con el lector del Cruce y se confirma lo guardado', () => {
    const texto = 'REPORTE MICRORRUTAS EJECUTADAS\nFecha: 03-11-2026\nCuadrilla: 2\nZ2CC0271\nZ2CC0300 (521)';
    const res = reportesDe(texto, { Z2CC0271: { lote: '491', cuad: '2' } });
    assert.equal(res.reportes.length, 1);
    assert.equal(res.reportes[0].fecha, '2026-11-03');
    assert.deepEqual(res.reportes[0].items, [{ mr: 'Z2CC0271', lote: '491' }, { mr: 'Z2CC0300', lote: '521' }]);
    assert.equal(textoGuardado(res), '✅ Guardado en el 📊 Cruce: 03/11 · cuadrilla 2 · 2 microrrutas.');
    assert.match(textoGuardado(reportesDe('REPORTE MICRORRUTAS EJECUTADAS\nZ2CC0271', {})), /^⚠️ No pude leer el reporte\./);
});

test('hoyColombia: UTC−5', () => {
    assert.equal(hoyColombia(Date.parse('2026-11-22T03:00:00Z')), '2026-11-21');
    assert.equal(hoyColombia(Date.parse('2026-11-22T06:00:00Z')), '2026-11-22');
});
