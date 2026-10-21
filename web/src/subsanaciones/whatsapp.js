// Textos para WhatsApp: novedad de una visita y resumen de las pendientes.
import { norm, frase } from './util.js';
import { esOp, itemsEnNo, NO_REALIZADO } from './estado.js';

export function textoWhatsapp(r) {
    var h = new Date().getHours();
    var saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    var cuad = String(r.CUADRILLA || '').trim();
    if (/^\d+$/.test(cuad)) cuad = 'C' + cuad;
    var obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim();
    // Lote no realizado: no se listan todos los ítems, basta con decirlo
    var lineas = norm(obs).indexOf(NO_REALIZADO) !== -1 ? [] : itemsEnNo(r).map(function (i) { return '- ' + frase(i).replace(/\.?$/, '.'); });
    if (obs && norm(obs) !== 'SIN NOVEDAD') lineas.push('- ' + frase(obs).replace(/\.?$/, '.'));
    return saludo + '\n\n' +
        'Novedad' + (esOp(r) ? ' en operación' : '') + (cuad ? ' ' + cuad : '') + '\n\n' +
        (r.MICRORRUTA || '') + (r.LOTE ? ' (' + r.LOTE + ')' : '') + '\n' +
        lineas.join('\n');
}

// Resumen de todas las novedades pendientes de lo filtrado, por tipo y cuadrilla:
// "Novedades posoperación cuadrilla 4 \n\n Z1CC0096 lote 106 \n * No realizado"
function lineasNovedad(r) {
    var obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim();
    var lineas = norm(obs).indexOf(NO_REALIZADO) !== -1 ? [] : itemsEnNo(r).map(function (i) { return '* ' + frase(i); });
    // "LOTE NO REALIZADO" queda "* No realizado" (el lote ya va en el renglón de arriba)
    if (obs && norm(obs) !== 'SIN NOVEDAD') lineas.push('* ' + frase(obs.replace(/^lote\s+(?=no realizado)/i, '')));
    return lineas;
}
export function textoResumen(lista) {
    var grupos = {}, orden = [];
    lista.forEach(function (r) {
        var cuad = String(r.CUADRILLA || '').trim().replace(/^C\s*/i, '');
        var k = (esOp(r) ? '1' : '0') + '|' + cuad;
        if (!grupos[k]) { grupos[k] = { op: esOp(r), cuad: cuad, rs: [] }; orden.push(k); }
        grupos[k].rs.push(r);
    });
    orden.sort(function (a, b) {
        var x = grupos[a], y = grupos[b];
        return (x.op - y.op) || (x.cuad ? 0 : 1) - (y.cuad ? 0 : 1) || x.cuad.localeCompare(y.cuad, 'es', { numeric: true });
    });
    return orden.map(function (k) {
        var g = grupos[k];
        var titulo = 'Novedades ' + (g.op ? 'en operación' : 'posoperación') + (g.cuad ? ' cuadrilla ' + g.cuad : '');
        var lotes = g.rs.slice().sort(function (a, b) {
            return String(a.MICRORRUTA || '').localeCompare(String(b.MICRORRUTA || ''), 'es', { numeric: true });
        }).map(function (r) {
            return [r.MICRORRUTA, r.LOTE ? 'lote ' + r.LOTE : ''].filter(Boolean).join(' ') + '\n\n' + lineasNovedad(r).join('\n');
        });
        return titulo + '\n\n' + lotes.join('\n\n');
    }).join('\n\n\n');
}
