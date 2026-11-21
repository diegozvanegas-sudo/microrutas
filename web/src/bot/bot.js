// 🤖 Bot de WhatsApp: la lógica (sin red ni base) de lo que entiende y lo que responde. La usa la función de Supabase
// «whatsapp-bot» (supabase/functions/whatsapp-bot/index.ts), que recibe los mensajes de Evolution API.
//   - Por chat directo, solo de los números autorizados: «ayuda», «pendientes [cuadrilla]», «lote 491» / «Z2CC0271»,
//     «listos». Y si pegan un «REPORTE MICRORRUTAS EJECUTADAS», se guarda en los reportes del 📊 Cruce.
//   - En los grupos autorizados (el de las cuadrillas) solo se guardan los reportes, sin responder nada en el grupo.
// A números o grupos que no están autorizados no se les responde.
//
//   mensajeDe(evento)                -> { de, chat, grupo, texto, id } o null (lo que no es un mensaje de texto recibido)
//   autorizado(numero, lista)        -> si el número está en la lista (se comparan los últimos 10 dígitos)
//   comando(texto)                   -> { tipo: 'ayuda' | 'pendientes' | 'lote' | 'listos' | 'reporte' | '', arg }
//   aRegistro(fila)                  -> la visita de la base con las columnas que usa la app (para candidatas)
//   textoPendientes / textoListos / textoLote / textoGuardado -> la respuesta
import { candidatas, aTexto, PLAZO_REQ, AVISO } from '../requerimiento/listos.js';
import { leerReportes, normMr } from '../cruce/cruce.js';

var MAX_LINEAS = 25;   // WhatsApp corta los mensajes muy largos; lo demás se resume con «y N más»

function plano(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function digitos(s) { return String(s == null ? '' : s).replace(/@.*$/, '').replace(/\D/g, ''); }
function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

// ---------- El mensaje que llega de Evolution (evento «messages.upsert») ----------
// El número de quien escribe: en chat directo es el chat; en un grupo, el participante. Las cuentas nuevas de WhatsApp
// pueden llegar como «…@lid» (sin número): entonces se usa el número alterno si Evolution lo manda; si no, queda vacío
// y no se le responde (no se puede saber si está autorizado).
function numeroDe(jid, alternos) {
    var j = String(jid || '');
    if (/@s\.whatsapp\.net$|@c\.us$/.test(j)) return digitos(j);
    for (var i = 0; i < alternos.length; i++) if (/@s\.whatsapp\.net$|@c\.us$/.test(String(alternos[i] || ''))) return digitos(alternos[i]);
    return '';
}
export function mensajeDe(ev) {
    if (!ev || !/^messages[._]upsert$/i.test(String(ev.event || ''))) return null;
    var d = Array.isArray(ev.data) ? ev.data[0] : ev.data;
    if (d && Array.isArray(d.messages)) d = d.messages[0];
    if (!d || !d.key || d.key.fromMe) return null;   // lo que manda el propio número no se contesta (evita que se hable solo)
    var m = d.message || {}, k = d.key;
    var texto = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || (m.imageMessage && m.imageMessage.caption) || '';
    if (!String(texto).trim()) return null;
    var chat = String(k.remoteJid || ''), grupo = /@g\.us$/.test(chat);
    var de = grupo ? numeroDe(k.participant, [k.participantPn, k.participantAlt]) : numeroDe(chat, [k.senderPn, k.remoteJidAlt]);
    return { de: de, chat: chat, grupo: grupo, texto: String(texto), id: String(k.id || '') };
}
// lista: «573001112233, 3009998877» (los secretos de Supabase). Celular de Colombia: 10 dígitos, con o sin el 57
export function autorizado(numero, lista) {
    var n = digitos(numero).slice(-10);
    if (n.length < 10) return false;
    return String(lista || '').split(/[\s,;]+/).some(function (x) { var d = digitos(x); return d.length >= 10 && d.slice(-10) === n; });
}
export function grupoAutorizado(chat, lista) {
    return !!chat && String(lista || '').split(/[\s,;]+/).some(function (x) { return x.trim() === chat; });
}

// ---------- Qué pide ----------
var RE_REPORTE = /reporte\s+(de\s+)?micro\s*rr?utas?\s+ejecutadas|microrr?utas?\s+ejecutadas|lotes?\s+ejecutados/;
export function comando(texto) {
    var t = plano(texto);
    if (RE_REPORTE.test(t)) return { tipo: 'reporte', arg: '' };
    var p = t.replace(/[.!?¡¿*]+$/g, '').replace(/^[*_]+|[*_]+$/g, '').trim();
    if (/^(ayuda|menu|hola|buenas|buenos dias|buenas tardes|\?|info)$/.test(p)) return { tipo: 'ayuda', arg: '' };
    var m = p.match(/^pendientes?(?:\s+(?:de\s+)?(?:la\s+)?(?:cuadrilla|cuad|c)?\s*(\d{1,2}))?$/);
    if (m) return { tipo: 'pendientes', arg: m[1] ? String(+m[1]) : '' };
    if (/^(listos|listas|requerimientos?|req)$/.test(p)) return { tipo: 'listos', arg: '' };
    m = p.match(/^(?:lote|l)\s*(\d{1,5})$/);
    if (m) return { tipo: 'lote', arg: String(+m[1]) };
    m = p.match(/^(?:microrr?uta\s+)?(z\d+\s*cc\s*\d{1,5})$/);
    if (m && normMr(m[1].replace(/\s+/g, ''))) return { tipo: 'lote', arg: normMr(m[1].replace(/\s+/g, '')) };
    return { tipo: '', arg: '' };
}

export var AYUDA = '🤖 *Bot de microrrutas* · escriba:\n' +
    '• *pendientes* (o *pendientes 2* para una cuadrilla): visitas sin subsanar y sus días hábiles\n' +
    '• *listos*: lo que ya pasó a requerimiento (' + PLAZO_REQ + ' días hábiles) y lo que está en pre aviso (' + AVISO + ')\n' +
    '• *lote 491* o *Z2CC0271*: las últimas visitas de ese lote\n' +
    '• Pegue un *REPORTE MICRORRUTAS EJECUTADAS* y queda guardado en el 📊 Cruce.';
export var NO_ENTENDI = 'No entendí 🤔. Escriba *ayuda* para ver lo que puedo responder.';

// ---------- Datos ----------
// Fila de la tabla «visitas» → la visita con las columnas que usa la app (las mismas de web/src/api.js)
function fechaTexto(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
export function aRegistro(v) {
    var r = {
        ID: v.id, TIPO: v.tipo === 'OPERACION' ? 'OPERACIÓN' : 'EJECUCIÓN', MICRORRUTA: v.microrruta || '', LOTE: v.lote || '',
        ZONA: v.zona == null ? '' : String(v.zona), CUADRILLA: v.cuadrilla || '',
        'FECHA DE EJECUCIÓN': fechaTexto(v.fecha_ejecucion), 'FECHA DE LA VISITA': fechaTexto(v.fecha_visita),
        'OBSERVACIONES NOVEDADES': v.observaciones || '', ESTADO: v.estado || ''
    };
    Object.defineProperty(r, '_respuestas', { value: v.respuestas || {}, enumerable: false });
    return r;
}
// Los ítems que quedaron en NO (respuestas: { 'BORDEO': 'NO', … })
export function itemsNo(r) {
    var res = r._respuestas || {};
    return Object.keys(res).filter(function (i) { return String(res[i]).trim().toUpperCase() === 'NO'; });
}
function rot(v) { return v.lote ? 'Lote ' + v.lote + ' (' + v.mr + ')' : v.mr; }
function cortar(lineas) { return lineas.length > MAX_LINEAS ? lineas.slice(0, MAX_LINEAS).concat(['… y ' + (lineas.length - MAX_LINEAS) + ' más (véalos en la app)']) : lineas; }

export function textoPendientes(registros, hoy, cuad) {
    var lista = candidatas(registros, hoy, itemsNo).filter(function (v) { return !cuad || v.cuad === cuad; });
    if (!lista.length) return '✅ No hay visitas pendientes' + (cuad ? ' de la cuadrilla ' + cuad : '') + '.';
    var por = {};
    lista.forEach(function (v) { (por[v.cuad || '?'] = por[v.cuad || '?'] || []).push(v); });
    var lineas = ['📋 *Pendientes' + (cuad ? ' · cuadrilla ' + cuad : '') + '* (' + lista.length + ') al ' + aTexto(hoy)];
    Object.keys(por).sort(function (a, b) { return (+a || 999) - (+b || 999); }).forEach(function (c) {
        lineas.push('', '*Cuadrilla ' + c + '*');
        por[c].forEach(function (v) {
            var marca = v.noSubsanable ? '🌳' : v.listo ? '🔴' : v.preaviso ? '🟠' : '🟢';
            lineas.push(marca + ' ' + rot(v) + ' · visita ' + aTexto(v.fecha).slice(0, 5) + ' · ' + plural(v.dias, 'día hábil', 'días hábiles') +
                (v.tipo === 'norealizado' ? ' · no realizado' : v.novedades.length ? ' · ' + v.novedades.slice(0, 3).join(', ') : ''));
        });
    });
    lineas.push('', '🔴 ' + PLAZO_REQ + '+ días: requerimiento · 🟠 ' + AVISO + '+: pre aviso · 🟢 en plazo · 🌳 árboles (no subsanable)');
    return cortar(lineas).join('\n');
}
export function textoListos(registros, hoy) {
    var lista = candidatas(registros, hoy, itemsNo), listas = lista.filter(function (v) { return v.listo; }), pre = lista.filter(function (v) { return v.preaviso; });
    if (!listas.length && !pre.length) return '✅ Nada listo para requerimiento ni para pre aviso al ' + aTexto(hoy) + '.';
    var lineas = ['⏰ *Listos para requerimiento* al ' + aTexto(hoy)];
    if (listas.length) { lineas.push('', '🔴 *Requerimiento* (' + listas.length + ')'); listas.forEach(function (v) {
        // Afectación a árboles: no se espera el plazo (no es subsanable), así que no se ponen los días
        lineas.push('• C' + (v.cuad || '?') + ' · ' + rot(v) + ' · ' + (v.noSubsanable ? '🌳 afectación a árboles (va de una)' : plural(v.dias, 'día hábil', 'días hábiles')));
    }); }
    if (pre.length) { lineas.push('', '🟠 *Pre aviso* (' + pre.length + ')'); pre.forEach(function (v) { lineas.push('• C' + (v.cuad || '?') + ' · ' + rot(v) + ' · pasa el ' + aTexto(v.cumple).slice(0, 5)); }); }
    lineas.push('', 'El requerimiento se arma en la app: Requerimientos → ⏰ Listos.');
    return cortar(lineas).join('\n');
}
// arg: número de lote («491») o microrruta («Z2CC0271»). lotes: filas de la tabla «lotes» de ese lote (para el nombre)
export function textoLote(arg, registros, lotes) {
    var esMr = /^Z\d+CC\d{4}$/.test(arg);
    var vis = (registros || []).filter(function (r) {
        return esMr ? normMr(r.MICRORRUTA) === arg : String(r.LOTE || '').replace(/^0+/, '') === arg;
    }).sort(function (a, b) { return String(b['FECHA DE LA VISITA']).split('/').reverse().join('').localeCompare(String(a['FECHA DE LA VISITA']).split('/').reverse().join('')); });
    var l = (lotes || [])[0];
    var cab = '📍 *' + (esMr ? arg : 'Lote ' + arg) + '*' + (l ? ' · ' + [esMr ? (l.no_lote ? 'lote ' + l.no_lote : '') : l.microrruta, l.cuadrilla ? 'cuadrilla ' + l.cuadrilla : '', l.direccion].filter(Boolean).join(' · ') : '');
    if (!vis.length) return cab + '\n' + (l ? 'Sin visitas registradas.' : 'No encontré ese lote ni visitas suyas. Revise el número.');
    var lineas = [cab, ''];
    vis.slice(0, 5).forEach(function (r) {
        var no = itemsNo(r), obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim();
        lineas.push((r.ESTADO === 'PENDIENTE' ? '🟠' : r.ESTADO === 'SUBSANADO' ? '✅' : '⚪') + ' ' + r['FECHA DE LA VISITA'] + ' · ' + (r.TIPO === 'OPERACIÓN' ? 'operación' : 'posoperación') + ' · ' + (r.ESTADO || '—') +
            (no.length ? '\n   NO: ' + no.join(', ') : '') + (obs ? '\n   ' + obs.slice(0, 160) : ''));
    });
    if (vis.length > 5) lineas.push('… y ' + (vis.length - 5) + ' visitas más en la app.');
    return lineas.join('\n');
}

// ---------- Reportes de ejecución pegados en el chat ----------
// LOTES: { Z2CC0271: { lote: '491', cuad: '2' } } (de la tabla «lotes»), para entender los reportes que solo traen números
export function reportesDe(texto, LOTES) { return leerReportes(texto, LOTES || {}); }
export function textoGuardado(res) {
    if (!res.reportes.length) return '⚠️ No pude leer el reporte. ' + (res.avisos.join(' ') || 'Debe traer la fecha y las microrrutas (Z1CC0125).');
    return '✅ Guardado en el 📊 Cruce: ' + res.reportes.map(function (r) {
        return aTexto(r.fecha).slice(0, 5) + ' · cuadrilla ' + (r.cuad || '?') + ' · ' + plural(r.items.length, 'microrruta', 'microrrutas');
    }).join('; ') + '.' + (res.avisos.length ? '\n⚠️ ' + res.avisos.join('\n⚠️ ') : '');
}
// Fecha de hoy en Colombia (UTC−5, sin horario de verano)
export function hoyColombia(ahora) { return new Date((ahora == null ? Date.now() : ahora) - 5 * 3600e3).toISOString().slice(0, 10); }
