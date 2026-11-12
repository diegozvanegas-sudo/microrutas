// Textos para WhatsApp: novedad de una visita y resumen de las pendientes.
import { norm, frase, claveRegistro, aTexto, hoy } from './util.js';
import { esOp, itemsEnNo, plazoNovedad, plazoVisita, NO_REALIZADO } from './estado.js';

// "Barrido del lote (Plazo: el mismo día)": el plazo de corrección queda visible en cada novedad
function conPlazo(texto, r) { var p = plazoNovedad(texto, esOp(r)); return p ? texto + ' (' + p + ')' : texto; }

export function textoWhatsapp(r) { return textoVisita(r, { formato: 'corto', plazo: true }); }

// Mensaje de UNA visita en el formato que se elija (ventana «Resumen para WhatsApp»). o: { formato, plazo (incluir el
// plazo de cada novedad), mencion ('@~Encargado', la recordada de la cuadrilla), hora (para probar el saludo) }
export var FORMATOS_VISITA = {
    corto: 'Corto (novedad y plazo)',
    formal: 'Formal: novedades y requerimientos',
    requerimiento: 'Solicitud formal de subsanación',
    reiteracion: 'Reiteración: sigue sin subsanar',
};
// "- Plateo (Plazo: 5 días)." por cada ítem en NO y la observación; en un lote no realizado basta con decirlo
function lineasVisita(r, plazo) {
    var obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim();
    var poner = function (t) { t = frase(t).replace(/\.$/, ''); return '- ' + (plazo ? conPlazo(t, r) : t) + '.'; };
    var lineas = norm(obs).indexOf(NO_REALIZADO) !== -1 ? [] : itemsEnNo(r).map(poner);
    if (obs && norm(obs) !== 'SIN NOVEDAD') lineas.push(poner(obs));
    return lineas;
}
export function textoVisita(r, o) {
    o = o || {};
    var h = o.hora != null ? o.hora : new Date().getHours(), formato = FORMATOS_VISITA[o.formato] ? o.formato : 'corto';
    var cuad = String(r.CUADRILLA || '').trim().replace(/^C\s*/i, ''), op = esOp(r), lineas = lineasVisita(r, o.plazo !== false);
    var lote = r.LOTE && r.LOTE !== 'NA' ? r.LOTE : '', fecha = r['FECHA DE LA VISITA'] || aTexto(hoy());
    var micro = (r.MICRORRUTA || '') + (lote ? ' (' + lote + ')' : '');
    if (formato === 'corto') {
        var saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
        var cc = String(r.CUADRILLA || '').trim();
        if (/^\d+$/.test(cc)) cc = 'C' + cc;
        return saludo + '\n\n' + 'Novedad' + (op ? ' en operación' : '') + (cc ? ' ' + cc : '') + '\n\n' +
            (r.MICRORRUTA || '') + (r.LOTE ? ' (' + r.LOTE + ')' : '') + '\n' + lineas.join('\n');
    }
    var saludoF = h < 12 ? '¡Buenos días!' : h < 19 ? '¡Buenas tardes!' : '¡Buenas noches!';
    var cab = ['Cuadrilla: ' + (cuad || '…')].concat(o.mencion ? [o.mencion] : []);
    var momento = op ? 'durante la operación' : 'posoperación';
    var sitio = 'la microrruta ' + (r.MICRORRUTA || '…') + (lote ? ' (lote ' + lote + ')' : '');
    if (formato === 'formal') {
        // Como el resumen del día: «NOVEDADES POSOPERACION», fecha, cuadrilla, @mención, el lote y los requerimientos
        return saludoF + '\n\n' + ['NOVEDADES ' + (op ? 'EN OPERACION' : 'POSOPERACION'), 'Fecha: ' + fecha].concat(cab).join('\n') +
            '\n\n' + micro + '\n' + lineas.join('\n') + '\n\n\n' + REQUERIMIENTOS;
    }
    if (formato === 'requerimiento') {
        return saludoF + '\n\n' + 'SOLICITUD DE SUBSANACIÓN\n' + cab.join('\n') + '\n\n' +
            'En la visita de verificación ' + momento + ' realizada el ' + fecha + ' a ' + sitio + ', se evidenciaron las siguientes novedades:\n\n' +
            lineas.join('\n') + '\n\n' +
            'Se solicita realizar la subsanación correspondiente ' + (o.plazo !== false ? 'dentro del plazo indicado para cada novedad' : 'a la mayor brevedad') +
            ' y remitir el registro fotográfico que la soporte, citando el número de la microrruta.\n\n' +
            'Quedamos atentos.\nInterventoría del Área de Servicios de Aseo';
    }
    // Reiteración: la novedad sigue sin subsanar; se recuerda que pasa a descuento (primero se habla con el supervisor)
    return saludoF + '\n\n' + 'REITERACIÓN DE NOVEDAD\n' + cab.join('\n') + '\n\n' +
        'Se reitera la novedad reportada el ' + fecha + ' en ' + sitio + ', la cual a la fecha continúa sin subsanar:\n\n' +
        lineas.join('\n') + '\n\n' +
        'Se solicita atenderla de manera prioritaria y enviar el registro fotográfico de la corrección. De no subsanarse' +
        (o.plazo !== false ? ' dentro del plazo establecido' : '') + ', se procederá con el descuento correspondiente en la factura, conforme a lo establecido en el contrato.\n\n' +
        'Quedamos atentos.\nInterventoría del Área de Servicios de Aseo';
}

// En los resúmenes del día, en el orden en que se revisó: primero lo registrado más temprano
function porHora(a, b) { return claveRegistro(a).localeCompare(claveRegistro(b)); }

// Resumen final del día con el formato de interventoría: por cuadrilla, los lotes con novedad y sus ítems,
// y al final los requerimientos al contratista. Cuadrillas y lotes por hora de registro: primero lo más temprano. menciones: { '1': '@~Nombre del encargado' } (se aprenden del texto copiado)
// "¡Buenas tardes! \n\n NOVEDADES POSOPERACION \n Fecha: 23/10/2026 \n Cuadrilla: 1 \n @~Nombre \n\n Z2CC0235 (453): \n\n * Barrido de zonas duras"
export var REQUERIMIENTOS = 'REQUERIMIENTOS:\n\n' +
    '1. Dar respuesta a lo solicitado de manera oportuna, citando el número de la microruta asociada al hallazgo.\n\n' +
    '2. En el evento de que EL CONTRATISTA no presente ningún argumento dentro del término previsto, la entidad contratante tomará ese silencio ' +
    'como incumplimiento de las obligaciones establecidas en el contrato y habilitará a la gestoría del contrato para hacer efectivos los descuentos ' +
    'o imposición de medidas coercitivas que el contrato establece, garantizando en todo caso el debido proceso y derecho a la contradicción; ' +
    'de acuerdo con lo establecido en las Condiciones Particulares del proceso contractual.';
// Formatos del resumen del día (misma ventana, mismo selector que el de una visita). «conteo» lo arma textoDia
export var FORMATOS_DIA = {
    formal: 'Formal: novedades y requerimientos',
    corto: 'Corto: solo las novedades',
    requerimiento: 'Solicitud formal de subsanación',
    reiteracion: 'Reiteración: siguen sin subsanar',
    conteo: 'Conteo de lotes revisados',
};
// o: { formato (FORMATOS_DIA, menos conteo), plazo (false = sin el plazo de cada novedad), hora (para probar el saludo) }
export function textoNovedadesDia(lista, dia, menciones, o) {
    o = o || {};
    var h = o.hora != null ? o.hora : new Date().getHours(), conP = o.plazo !== false;
    var formato = FORMATOS_DIA[o.formato] && o.formato !== 'conteo' ? o.formato : 'formal';
    var saludo = h < 12 ? '¡Buenos días!' : h < 19 ? '¡Buenas tardes!' : '¡Buenas noches!';
    var grupos = {}, orden = [];
    lista.filter(function (r) { return r.ESTADO === 'PENDIENTE' || (esOp(r) && itemsEnNo(r).length); }).sort(porHora).forEach(function (r) {
        var cuad = String(r.CUADRILLA || '').trim().replace(/^C\s*/i, '');
        var k = (esOp(r) ? '1' : '0') + '|' + cuad;
        if (!grupos[k]) { grupos[k] = { op: esOp(r), cuad: cuad, rs: [] }; orden.push(k); }
        grupos[k].rs.push(r);
    });
    if (!orden.length) return '';
    // orden ya va por la primera visita de cada grupo: la lista se recorrió por hora
    var bloques = orden.map(function (k) {
        var g = grupos[k], m = (menciones || {})[g.cuad];
        var cab = ['NOVEDADES ' + (g.op ? 'EN OPERACION' : 'POSOPERACION'), 'Fecha: ' + dia]
            .concat(g.cuad ? ['Cuadrilla: ' + g.cuad] : []).concat(m ? [m] : []).join('\n');
        var lotes = g.rs.map(function (r) {
            return (r.MICRORRUTA || '') + (r.LOTE && r.LOTE !== 'NA' ? ' (' + r.LOTE + ')' : '') + ':\n\n' + lineasNovedad(r, conP).join('\n');
        });
        return cab + '\n\n' + lotes.join('\n\n');
    });
    var cuerpo = bloques.join('\n\n\n');
    if (formato === 'corto') return saludo + '\n\n' + cuerpo;
    if (formato === 'requerimiento') {
        return saludo + '\n\nSOLICITUD DE SUBSANACIÓN\n\n' +
            'En las visitas de verificación realizadas el ' + dia + ' se evidenciaron las siguientes novedades:\n\n' + cuerpo + '\n\n' +
            'Se solicita realizar la subsanación correspondiente ' + (conP ? 'dentro del plazo indicado para cada novedad' : 'a la mayor brevedad') +
            ' y remitir el registro fotográfico que la soporte, citando el número de la microrruta.\n\n' +
            'Quedamos atentos.\nInterventoría del Área de Servicios de Aseo';
    }
    if (formato === 'reiteracion') {
        return saludo + '\n\nREITERACIÓN DE NOVEDADES\n\n' +
            'Se reiteran las novedades reportadas el ' + dia + ', las cuales a la fecha continúan sin subsanar:\n\n' + cuerpo + '\n\n' +
            'Se solicita atenderlas de manera prioritaria y enviar el registro fotográfico de la corrección. De no subsanarse' +
            (conP ? ' dentro del plazo establecido' : '') + ', se procederá con el descuento correspondiente en la factura, conforme a lo establecido en el contrato.\n\n' +
            'Quedamos atentos.\nInterventoría del Área de Servicios de Aseo';
    }
    return saludo + '\n\n' + cuerpo + '\n\n\n' + REQUERIMIENTOS;
}
// Lee las menciones escritas a mano debajo de "Cuadrilla: N" para recordarlas la próxima vez
export function leerMenciones(texto) {
    var res = {}, re = /^Cuadrilla:\s*(\S+)\s*\n\s*(@.+?)\s*$/gm, m;
    while ((m = re.exec(String(texto || '')))) res[m[1]] = m[2];
    return res;
}

// Resumen del día por cuadrilla: cuántos lotes se revisaron, cuáles quedaron con novedad y las visitas de operación.
// Por hora de registro: primero la cuadrilla y el lote que se revisaron más temprano
// "Resumen de visitas 22/10/2026 \n\n Cuadrilla 2: 3 lotes revisados · 1 con novedad \n ✓ Z2CC0202 lote 400 \n ⚠ Z2CC0100 lote 532: 2 ítems en NO"
export function textoDia(lista, dia) {
    var grupos = {}, orden = [];
    lista.slice().sort(porHora).forEach(function (r) {
        var cuad = String(r.CUADRILLA || '').trim().replace(/^C\s*/i, '');
        if (!grupos[cuad]) { grupos[cuad] = []; orden.push(cuad); }
        grupos[cuad].push(r);
    });
    var lote = function (r) { return [r.MICRORRUTA, r.LOTE ? 'lote ' + r.LOTE : ''].filter(Boolean).join(' '); };
    var total = { lotes: 0, novedad: 0 };
    var bloques = orden.map(function (cuad) {
        var rs = grupos[cuad], ej = rs.filter(function (r) { return !esOp(r); }), op = rs.filter(esOp);
        var conNov = ej.filter(function (r) { return r.ESTADO === 'PENDIENTE'; });
        total.lotes += ej.length; total.novedad += conNov.length;
        var cab = (cuad ? 'Cuadrilla ' + cuad : 'Sin cuadrilla') + ': ' + ej.length + (ej.length === 1 ? ' lote revisado' : ' lotes revisados') +
            (conNov.length ? ' · ' + conNov.length + ' con novedad' : '') + (op.length ? ' · ' + op.length + (op.length === 1 ? ' visita' : ' visitas') + ' en operación' : '');
        var lineas = ej.map(function (r) {
            var n = itemsEnNo(r).length;
            return r.ESTADO === 'PENDIENTE' ? '⚠ ' + lote(r) + (n ? ': ' + n + (n === 1 ? ' ítem' : ' ítems') + ' en NO' : ': con novedad')
                : r.ESTADO === 'CERRADO' ? '🔒 ' + lote(r) + ': cerrado' : '✓ ' + lote(r);
        }).concat(op.map(function (r) {
            var n = itemsEnNo(r).length;
            return '🦺 ' + lote(r) + (n ? ': ' + n + (n === 1 ? ' novedad' : ' novedades') + ' en operación' : ': operación sin novedad');
        }));
        return cab + '\n' + lineas.join('\n');
    });
    return 'Resumen de visitas ' + dia + '\n' + total.lotes + (total.lotes === 1 ? ' lote revisado' : ' lotes revisados') +
        (total.novedad ? ' · ' + total.novedad + ' con novedad' : '') + '\n\n' + bloques.join('\n\n');
}

// Resumen de todas las novedades pendientes de lo filtrado, por tipo y cuadrilla:
// "Novedades posoperación cuadrilla 4 \n\n Z1CC0096 lote 106 \n * No realizado"
// plazo === false: sin el «(Plazo: …)» de cada novedad (opción del resumen del día)
function lineasNovedad(r, plazo) {
    var obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim();
    var lineas = norm(obs).indexOf(NO_REALIZADO) !== -1 ? [] : itemsEnNo(r).map(function (i) { return '* ' + (plazo === false ? frase(i) : conPlazo(frase(i), r)); });
    // "LOTE NO REALIZADO" queda "* No realizado" (el lote ya va en el renglón de arriba); el plazo se mira con el texto original
    if (obs && norm(obs) !== 'SIN NOVEDAD') {
        var p = plazo === false ? '' : plazoNovedad(obs, esOp(r)), t = frase(obs.replace(/^lote\s+(?=no realizado)/i, '')).replace(/\.$/, '');
        lineas.push('* ' + (p ? t + ' (' + p + ')' : t));
    }
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

// Lotes para descuento en la factura (pendientes con el plazo vencido o no subsanables), por cuadrilla y con el motivo:
// "LOTES PARA DESCUENTO EN FACTURA \n Corte: 27/10/2026 \n\n Cuadrilla 4 \n\n Z1CC0096 lote 106 · visita 20/10/2026 · Plazo vencido hace 2 días \n * Barrido (Plazo: el mismo día)"
export function textoDescuento(lista) {
    var grupos = {}, orden = [], n = 0;
    lista.forEach(function (r) {
        var p = plazoVisita(r);
        if (!p || !p.descuento) return;
        var cuad = String(r.CUADRILLA || '').trim().replace(/^C\s*/i, '');
        if (!grupos[cuad]) { grupos[cuad] = []; orden.push(cuad); }
        grupos[cuad].push({ r: r, motivo: p.motivo });
        n++;
    });
    if (!n) return '';
    orden.sort(function (a, b) { return (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'es', { numeric: true }); });
    var hoyTxt = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return 'LOTES PARA DESCUENTO EN FACTURA\nCorte: ' + hoyTxt + ' · ' + n + (n === 1 ? ' visita' : ' visitas') + '\n\n' + orden.map(function (cuad) {
        return (cuad ? 'Cuadrilla ' + cuad : 'Sin cuadrilla') + '\n\n' + grupos[cuad].map(function (x) {
            var r = x.r;
            return [r.MICRORRUTA, r.LOTE ? 'lote ' + r.LOTE : ''].filter(Boolean).join(' ') + (esOp(r) ? ' (operación)' : '') +
                ' · visita ' + (r['FECHA DE LA VISITA'] || '—') + ' · ' + x.motivo + '\n' + lineasNovedad(r).join('\n');
        }).join('\n\n');
    }).join('\n\n\n');
}
