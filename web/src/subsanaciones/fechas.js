// Filtro por fecha de la visita: un día, entre dos fechas, antes de o después de un día.
// Todo se maneja como texto aaaa-mm-dd (se compara como texto) y las cuentas de días en UTC, para que el
// cambio de hora del equipo no corra un día.
import { claveFecha } from './util.js';

export var MODOS = { RANGO: 'rango', ANTES: 'antes', DESPUES: 'despues' };
export function esModoFecha(v) { return v === MODOS.RANGO || v === MODOS.ANTES || v === MODOS.DESPUES; }

// Fecha de la visita como aaaa-mm-dd, venga como venga (18/10/2026, 18-10-26, 2026-10-18 con hora…); '' si no se entiende
// o no es un día real (31/02/2026)
export function fechaISO(s) {
    var k = claveFecha(s);
    if (!k) return '';
    var iso = k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8), d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) || d.toISOString().slice(0, 10) !== iso ? '' : iso;
}
export function sumarDias(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function texto(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }

// Qué días cubre el filtro, con los dos extremos incluidos: { desde, hasta, invertido, incompleto }.
// desde/hasta vacíos = sin límite por ese lado. "Antes de" y "después de" no cuentan el día elegido.
// modo = valor del selector de día: '' (todos), un día aaaa-mm-dd, o uno de MODOS
export function criterioFecha(modo, desde, hasta) {
    desde = fechaISO(desde); hasta = fechaISO(hasta);
    if (!modo) return { desde: '', hasta: '' };
    if (modo === MODOS.ANTES) return hasta ? { desde: '', hasta: sumarDias(hasta, -1) } : { desde: '', hasta: '', incompleto: true };
    if (modo === MODOS.DESPUES) return desde ? { desde: sumarDias(desde, 1), hasta: '' } : { desde: '', hasta: '', incompleto: true };
    if (modo === MODOS.RANGO) {
        if (desde && hasta && desde > hasta) return { desde: hasta, hasta: desde, invertido: true };
        return { desde: desde, hasta: hasta, incompleto: !desde && !hasta };
    }
    var dia = fechaISO(modo);
    return { desde: dia, hasta: dia };
}
export function hayFiltroFecha(c) { return !!(c.desde || c.hasta); }
// La visita entra en el filtro: sin fecha (o con una que no se entiende) queda fuera mientras haya filtro de fecha
export function cumpleFecha(r, c) {
    if (!hayFiltroFecha(c)) return true;
    var f = fechaISO(r['FECHA DE LA VISITA']);
    if (!f) return false;
    return (!c.desde || f >= c.desde) && (!c.hasta || f <= c.hasta);
}

// Frase para mostrar debajo de las fechas: qué se está viendo, sin dudas sobre si el día cuenta o no
export function describirFecha(modo, desde, hasta) {
    var c = criterioFecha(modo, desde, hasta), d = fechaISO(desde), h = fechaISO(hasta);
    if (modo === MODOS.ANTES) return h ? 'Visitas antes del ' + texto(h) + ' (sin contar ese día): hasta el ' + texto(c.hasta) + '.' : 'Elija el día: se muestran las visitas anteriores a él.';
    if (modo === MODOS.DESPUES) return d ? 'Visitas después del ' + texto(d) + ' (sin contar ese día): desde el ' + texto(c.desde) + '.' : 'Elija el día: se muestran las visitas posteriores a él.';
    if (modo !== MODOS.RANGO) return '';
    if (c.incompleto) return 'Elija una o las dos fechas. Solo «Desde»: de ese día en adelante; solo «Hasta»: de ese día hacia atrás.';
    var inv = c.invertido ? ' (las fechas estaban al revés y se invirtieron)' : '';
    if (c.desde && c.hasta) return (c.desde === c.hasta ? 'Visitas del ' + texto(c.desde) : 'Visitas del ' + texto(c.desde) + ' al ' + texto(c.hasta) + ', los dos días incluidos') + inv + '.';
    return c.desde ? 'Visitas desde el ' + texto(c.desde) + ' (incluido) en adelante.' : 'Visitas hasta el ' + texto(c.hasta) + ' (incluido).';
}

// Atajos del rango: { desde, hasta } en aaaa-mm-dd a partir de hoy (aaaa-mm-dd)
export var ATAJOS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['mes', 'Este mes'], ['mes-1', 'Mes pasado']];
export function atajoFecha(nombre, hoy) {
    if (nombre === 'hoy') return { desde: hoy, hasta: hoy };
    if (nombre === 'ayer') { var a = sumarDias(hoy, -1); return { desde: a, hasta: a }; }
    if (nombre === '7') return { desde: sumarDias(hoy, -6), hasta: hoy };
    if (nombre === '30') return { desde: sumarDias(hoy, -29), hasta: hoy };
    var primero = hoy.slice(0, 8) + '01';
    if (nombre === 'mes') return { desde: primero, hasta: hoy };
    if (nombre === 'mes-1') { var fin = sumarDias(primero, -1); return { desde: fin.slice(0, 8) + '01', hasta: fin }; }
    return null;
}
