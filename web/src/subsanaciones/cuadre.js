// ✓ Cuadrar pendientes: las filas que la interventoría pega del Excel (o lee de un pantallazo) son las ÚNICAS pendientes
// que deben quedar en la base; las demás pendientes se pasan a subsanadas. Aquí solo se calcula qué pasa con cada visita
// (sin DOM ni base): la página lo muestra, pide confirmar y subsana una por una.
import { norm, claveFecha } from './util.js';
import { esOp, itemsDe, soloNoSubsanable, itemsNoSubsanables } from './estado.js';

function mr(r) { return norm(r.MICRORRUTA).replace(/\s+/g, ''); }
function lote(r) { return String(r.LOTE == null ? '' : r.LOTE).replace(/\D/g, '').replace(/^0+/, ''); }
// La fila de la tabla y la visita de la base son la misma: misma microrruta (o mismo lote si la microrruta no se leyó),
// mismo tipo y, si la fila trae fecha de visita, ese mismo día
// (leído de una imagen o de una lista escrita: solo la microrruta; el lector confunde fechas y el tipo, y equivocarse
// ahí subsanaría una que sigue pendiente)
function mismaVisita(fila, r, suelto) {
    var a = mr(fila), b = mr(r);
    if (a ? a !== b : !lote(fila) || lote(fila) !== lote(r)) return false;
    if (suelto) return true;
    if (esOp(fila) !== esOp(r)) return false;
    var f = claveFecha(fila['FECHA DE LA VISITA']);
    return !f || f === claveFecha(r['FECHA DE LA VISITA']);
}
// Pendiente en la tabla. De una imagen o lista escrita, la fila sin ningún SI / NO leído también cuenta como pendiente:
// ante la duda queda pendiente, nunca se subsana
function pendienteTabla(f, suelto) { return f.ESTADO === 'PENDIENTE' || (suelto && !itemsDe(f).some(function (i) { return f[i]; })); }
// aaaammdd → número de días (para comparar con hoy)
function diaNum(k) { return Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5; }

// registros: visitas de la base (las que ve el usuario). leidas: visitas de la tabla (tabla.js).
// opciones.hastaTabla: no tocar las pendientes con visita después del último día de la tabla (aún no están en el Excel).
// opciones.suelto: el texto vino de una imagen o es una lista escrita (tabla.js → imagen); opciones.hoy: aaaa-mm-dd, para
// no creerle al lector fechas imposibles (más de un año atrás o en el futuro)
// → { pendTabla, quedan, aSubsanar, conArboles, arboles, nuevas, noEstan, ultimoDia }
//   quedan: pendientes de la base que están en la tabla (siguen pendientes)
//   aSubsanar: pendientes de la base que no están en la tabla (se subsanan); conArboles: de esas, las que dejan la
//     afectación a árboles en NO (siguen pendientes por eso)
//   arboles: no están en la tabla pero su única novedad es afectación a árboles: no se pueden subsanar
//   nuevas: pendientes con visita posterior al último día de la tabla (no se tocan)
//   noEstan: filas pendientes de la tabla sin una pendiente en la base ({ fila, base: la visita encontrada o null })
export function cuadrar(registros, leidas, opciones) {
    var o = opciones || {};
    var suelto = !!o.suelto, kHoy = claveFecha(o.hoy || '');
    var pendTabla = leidas.filter(function (f) { return pendienteTabla(f, suelto); });
    var ultimo = leidas.map(function (f) { return claveFecha(f['FECHA DE LA VISITA']); }).filter(function (k) {
        return k && (!kHoy || (k <= kHoy && diaNum(kHoy) - diaNum(k) <= 400));
    }).sort().pop() || '';
    // De una imagen sin ninguna fecha creíble: hasta hoy
    if (!ultimo && suelto && kHoy) ultimo = kHoy;
    var pendBase = registros.filter(function (r) { return r.ESTADO === 'PENDIENTE'; });
    var res = { suelto: suelto, pendTabla: pendTabla, quedan: [], aSubsanar: [], conArboles: [], arboles: [], nuevas: [], noEstan: [], ultimoDia: ultimo };
    pendBase.forEach(function (r) {
        if (pendTabla.some(function (f) { return mismaVisita(f, r, suelto); })) return res.quedan.push(r);
        if (o.hastaTabla && ultimo && claveFecha(r['FECHA DE LA VISITA']) > ultimo) return res.nuevas.push(r);
        if (soloNoSubsanable(r)) return res.arboles.push(r);
        res.aSubsanar.push(r);
        if (itemsNoSubsanables(r).length) res.conArboles.push(r);
    });
    pendTabla.forEach(function (f) {
        if (pendBase.some(function (r) { return mismaVisita(f, r, suelto); })) return;
        res.noEstan.push({ fila: f, base: registros.filter(function (r) { return mismaVisita(f, r, suelto); })[0] || null });
    });
    return res;
}

// Fecha de subsanación de cada visita: la elegida (aaaammdd → dd/mm/aaaa), pero nunca antes del día de la visita
export function fechaSubsanacion(r, elegida) {
    var v = String(r['FECHA DE LA VISITA'] || '').trim(), kv = claveFecha(v), ke = claveFecha(elegida);
    var k = kv && ke && kv > ke ? kv : ke || kv;
    return k ? k.slice(6, 8) + '/' + k.slice(4, 6) + '/' + k.slice(0, 4) : '';
}
