// Mensaje de plazos para los supervisores del contratista (para copiar y pegar en WhatsApp): por cuadrilla, lo que
// está pendiente de subsanar, agrupado por urgencia, con la fecha límite y cuántos días le quedan (o hace cuánto se
// venció). Mismas reglas de plazo que el resto de la página (diasPlazo en estado.js).
import { norm, frase, aInput, aTexto } from './util.js';
import { esOp, itemsEnNo, diasPlazo, NO_REALIZADO } from './estado.js';

function cuadrillaDe(r) { return String(r.CUADRILLA || '').trim().replace(/^C\s*/i, ''); }
function sumarDias(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function entre(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }

// Novedades con plazo de una visita pendiente: los ítems en NO y la observación (en un lote no realizado, solo la
// observación), igual que plazoVisita. Lo que no tiene plazo (lote cerrado o no realizado) no entra
function novedades(r) {
    var obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim(), op = esOp(r);
    var textos = norm(obs).indexOf(NO_REALIZADO) !== -1 ? [] : itemsEnNo(r).slice();
    if (obs && norm(obs) !== 'SIN NOVEDAD') textos.push(obs);
    return textos.map(function (t) { return { texto: frase(t).replace(/\.$/, ''), dias: diasPlazo(t, op) }; })
        .filter(function (n) { return n.dias != null; });
}

// Tramos del mensaje, de lo más grave a lo más tranquilo
export var TRAMOS_SUP = [
    { id: 'descuento', titulo: '🔴 Vencidas o no subsanables (van a descuento si no se responde)' },
    { id: 'hoy', titulo: '🟠 Vencen hoy' },
    { id: 'manana', titulo: '🟡 Vencen mañana' },
    { id: 'tiempo', titulo: '🟢 A tiempo' },
];
function tramoDe(f) { return f.noSub || f.resta < 0 ? 'descuento' : f.resta === 0 ? 'hoy' : f.resta === 1 ? 'manana' : 'tiempo'; }

// Una fila por novedad: { r, cuad, novedad, limite (aaaa-mm-dd, '' si no es subsanable), resta (días; negativo = vencida), noSub, tramo }
export function plazosSupervisores(lista, hoyISO) {
    var filas = [];
    lista.forEach(function (r) {
        if (r.ESTADO !== 'PENDIENTE') return;
        var visita = aInput(r['FECHA DE LA VISITA']);
        if (!visita) return;
        novedades(r).forEach(function (n) {
            var noSub = n.dias < 0, limite = noSub ? '' : sumarDias(visita, n.dias), f = { r: r, cuad: cuadrillaDe(r), novedad: n.texto, noSub: noSub, limite: limite, resta: noSub ? null : entre(hoyISO, limite) };
            f.tramo = tramoDe(f);
            filas.push(f);
        });
    });
    return filas;
}

// Cómo va el plazo: «vencida hace 2 días (límite 09/11/2026)», «quedan 5 días (límite 16/11/2026)»
function estadoPlazo(f) {
    if (f.noSub) return 'no subsanable';
    var l = ' (límite ' + aTexto(f.limite) + ')';
    if (f.resta < 0) return 'vencida hace ' + (-f.resta === 1 ? '1 día' : -f.resta + ' días') + l;
    if (f.resta === 0) return 'vence hoy';
    if (f.resta === 1) return 'vence mañana' + l;
    return 'quedan ' + f.resta + ' días' + l;
}

// Texto para WhatsApp. menciones: { '4': '@~Encargado' } (las aprendidas en los otros resúmenes); o.hora para probar el saludo.
// Por cuadrilla; en cada tramo, un renglón por lote y plazo: «* Z1CC0083 (92): Corte, Sectores sin intervenir · quedan 5 días (límite 16/11/2026)»
export function textoSupervisores(lista, hoyISO, menciones, o) {
    o = o || {};
    var filas = plazosSupervisores(lista, hoyISO);
    if (!filas.length) return '';
    var h = o.hora != null ? o.hora : new Date().getHours();
    var saludo = h < 12 ? '¡Buenos días!' : h < 19 ? '¡Buenas tardes!' : '¡Buenas noches!';
    var porCuad = {}, orden = [];
    filas.forEach(function (f) { if (!porCuad[f.cuad]) { porCuad[f.cuad] = []; orden.push(f.cuad); } porCuad[f.cuad].push(f); });
    orden.sort(function (a, b) { return (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'es', { numeric: true }); });
    var urg = function (f) { return f.noSub ? -100000 : f.resta; };
    var bloques = orden.map(function (cuad) {
        var fs = porCuad[cuad], m = (menciones || {})[cuad];
        var desc = fs.filter(function (f) { return f.tramo === 'descuento'; }).length;
        var cab = [cuad ? 'Cuadrilla: ' + cuad : 'Sin cuadrilla'].concat(m ? [m] : []).join('\n') + '\n' +
            fs.length + (fs.length === 1 ? ' novedad pendiente' : ' novedades pendientes') + (desc ? ' · ' + desc + ' para descuento' : '');
        var tramos = TRAMOS_SUP.map(function (t) {
            var del = fs.filter(function (f) { return f.tramo === t.id; }).sort(function (a, b) {
                return urg(a) - urg(b) || String(a.r.MICRORRUTA || '').localeCompare(String(b.r.MICRORRUTA || ''), 'es', { numeric: true });
            });
            if (!del.length) return '';
            // Las novedades del mismo lote con la misma fecha límite van en un solo renglón
            var renglones = [], vistos = {};
            del.forEach(function (f) {
                var r = f.r, k = (r.ID || r.MICRORRUTA) + '|' + f.limite + '|' + f.noSub;
                if (vistos[k]) { vistos[k].novedades.push(f.novedad); return; }
                vistos[k] = { f: f, novedades: [f.novedad] };
                renglones.push(vistos[k]);
            });
            return t.titulo + ':\n' + renglones.map(function (x) {
                var r = x.f.r, lote = r.LOTE && r.LOTE !== 'NA' ? ' (' + r.LOTE + ')' : '';
                return '* ' + (r.MICRORRUTA || '') + lote + (esOp(r) ? ' [operación]' : '') + ': ' + x.novedades.join(', ') + ' · ' + estadoPlazo(x.f);
            }).join('\n');
        }).filter(Boolean);
        return cab + '\n\n' + tramos.join('\n\n');
    });
    return saludo + '\n\n' + 'PLAZOS DE SUBSANACIÓN\nCorte: ' + aTexto(hoyISO) + '\n\n' + bloques.join('\n\n\n') + '\n\n\n' +
        'Favor subsanar dentro de la fecha límite y enviar el registro fotográfico, citando el número de la microrruta. ' +
        'Lo vencido sin subsanar ni respuesta del supervisor pasa a descuento en la factura.';
}
