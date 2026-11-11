// Envíos de WhatsApp programados: lo que no depende de la página (hora por defecto, validaciones, destinos, textos).
// La ventana está en programar.js; el envío lo hace la función «whatsapp» (acción enviarProgramados, migración 0020).

export var MAX_ARCHIVO = 20 * 1024 * 1024;   // el límite del almacenamiento «whatsapp-programados»
// Estado del número de envío en Evolution, en palabras
export var ESTADO_NUMERO = { close: 'desconectado', connecting: 'conectando', sin_instancia: 'sin vincular todavía', desconocido: 'estado desconocido' };
export var ESTADOS = { pendiente: '⏳ Pendiente', enviando: '📤 Enviando', enviado: '✓ Enviado', error: '⚠ Error', cancelado: '✕ Cancelado' };

// La próxima vez que sean las 5:00 a. m. (hoy si todavía no es esa hora, si no mañana)
export function horaPorDefecto(ahora, hora, minuto) {
    var a = ahora ? new Date(ahora) : new Date(), d = new Date(a);
    d.setHours(hora == null ? 5 : hora, minuto || 0, 0, 0);
    if (d <= a) d.setDate(d.getDate() + 1);
    return d;
}
// Date → «2026-11-12T05:00» (hora del equipo, para <input type="datetime-local">)
export function aInputLocal(d) {
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
// «2026-11-12T05:00» → Date en la hora del equipo (null si no es fecha)
export function deInputLocal(t) {
    var m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
// Lo mismo que acepta la función: ID de grupo (…@g.us) o celular (10 dígitos de Colombia o con indicativo)
export function destinoValido(para) {
    var p = String(para || '').trim();
    if (/^[\d-]+@g\.us$/.test(p)) return p;
    var tel = p.replace(/\D/g, '');
    return tel.length >= 10 && tel.length <= 15 ? tel : '';
}
// Qué falta para poder programar → lista de mensajes (vacía si está bien)
export function validar(envio, ahora) {
    var e = [], a = ahora ? new Date(ahora) : new Date();
    if (!destinoValido(envio.para)) e.push(envio.para ? 'El destino no es un celular ni un grupo válido (…@g.us).' : 'Elija a quién se envía.');
    if (!String(envio.texto || '').trim() && !envio.archivo) e.push('Escriba el mensaje o adjunte un archivo.');
    if (!(envio.enviarEn instanceof Date) || isNaN(envio.enviarEn)) e.push('Elija el día y la hora del envío.');
    else if (envio.enviarEn.getTime() < a.getTime() - 60000) e.push('La hora elegida ya pasó.');
    if (envio.archivo && envio.archivo.size > MAX_ARCHIVO) e.push('El archivo pesa ' + (envio.archivo.size / 1048576).toFixed(1).replace('.', ',') + ' MB: el máximo es 20 MB.');
    return e;
}
// «mañana 5:00 a. m.», «hoy 6:30 p. m.», «vie 14 nov · 5:00 a. m.»
export function cuandoTexto(d, ahora) {
    if (!(d instanceof Date)) d = new Date(d);
    var a = ahora ? new Date(ahora) : new Date(), h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    var hora = ((h % 12) || 12) + ':' + m + (h < 12 ? ' a. m.' : ' p. m.');
    var dia = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var dif = Math.round((dia(d) - dia(a)) / 86400000);
    if (dif === 0) return 'hoy ' + hora;
    if (dif === 1) return 'mañana ' + hora;
    if (dif === -1) return 'ayer ' + hora;
    var DS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return DS[d.getDay()] + ' ' + d.getDate() + ' ' + MS[d.getMonth()] + ' · ' + hora;
}
// Destinos usados hace poco (los primeros, los últimos usados), sin repetir y máximo 8
export function recordarDestino(lista, destino) {
    var id = destinoValido(destino.id);
    if (!id) return lista || [];
    return [{ id: id, nombre: String(destino.nombre || '').trim() || id }].concat((lista || []).filter(function (d) { return d.id !== id; })).slice(0, 8);
}
// Nombre del archivo en el almacenamiento: sin tildes ni símbolos raros (el almacenamiento no los acepta)
export function nombreSeguro(nombre) {
    var n = String(nombre || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return (n || 'archivo').slice(-120);
}
