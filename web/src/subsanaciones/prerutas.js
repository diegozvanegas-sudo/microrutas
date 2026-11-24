import { esOp } from './estado.js';

// Pre-rutas guardadas en la base (tabla rutas, una por usuario): la base manda en todos los equipos del mismo usuario.
// Solo se conserva lo de este equipo para las cuadrillas que se cambiaron aquí y que la lectura aún no puede traer.

// filasBase: filas leídas de la base. cambios: { cuadrilla: { t, filas, pendiente } } hechos en este equipo.
// desde: hora (ms) en que salió la lectura. Una cuadrilla cambiada aquí después de esa hora, o que todavía no se
// pudo subir (pendiente), queda como está en este equipo; el resto sale tal cual de la base.
export function mezclarRutas(filasBase, cambios, desde) {
    cambios = cambios || {};
    var propias = Object.keys(cambios).filter(function (c) { return cambios[c].pendiente || cambios[c].t >= desde; });
    var base = (filasBase || []).filter(function (f) { return propias.indexOf(String(f.cuadrilla || '')) === -1; });
    return base.concat.apply(base, propias.map(function (c) { return cambios[c].filas || []; }));
}

// ¿Hace falta volver a leer la base al volver a la página? Solo si pasó un rato desde la última lectura,
// no se está leyendo y no hay una ventana abierta (no se le cambia la lista a alguien que está llenando un formulario).
export function tocaReleer(ahora, ultimaLectura, leyendo, hayVentana, espera) {
    return !leyendo && !hayVentana && ahora - (ultimaLectura || 0) >= (espera || 30000);
}

// Lotes ya revisados de una pre-ruta (para pintarlos en verde en "Ver todos en el mapa"). Al revisarse, el lote sale de
// la pre-ruta, así que se buscan en las visitas: de lote ejecutado (no de operación), de la misma cuadrilla y con la
// misma fecha de ejecución que algún lote de la pre-ruta o hechas desde que se cargó (el criterio de visitaDe).
// paradas: [{ id, fecha, creada }] con fechas AAAA-MM-DD. registros: visitas, la más reciente primero.
// fecha(r, campo) → AAAA-MM-DD. quitar: ids que ya van en la lista del mapa (los pendientes).
// Devuelve [{ lote, mr, visita }], uno por lote (su visita más reciente).
export function revisadosDeRuta(cuad, paradas, registros, fecha, quitar) {
    var c = String(cuad || '').trim().replace(/^C\s*/i, '');
    if (!c || !paradas || !paradas.length) return [];
    var fechas = {}, desde = '';
    paradas.forEach(function (p) {
        if (p.fecha) fechas[p.fecha] = 1;
        if (p.creada && (!desde || p.creada < desde)) desde = p.creada;
    });
    var fuera = {}, vistos = {}, out = [];
    (quitar || []).forEach(function (id) { fuera[String(id).toUpperCase()] = 1; });
    (registros || []).forEach(function (r) {
        if (esOp(r)) return;
        if (String(r.CUADRILLA || '').trim().replace(/^C\s*/i, '') !== c) return;
        var ej = fecha(r, 'FECHA DE EJECUCIÓN'), vis = fecha(r, 'FECHA DE LA VISITA');
        if (!((ej && fechas[ej]) || (desde && vis && vis >= desde))) return;
        var lote = String(r.LOTE || '').trim(), mr = String(r.MICRORRUTA || '').trim().toUpperCase();
        if (lote.toUpperCase() === 'NA') lote = '';
        if (/^\d+$/.test(lote)) lote = String(+lote);
        var id = lote || mr;
        if (!id || vistos[id.toUpperCase()] || fuera[id.toUpperCase()] || (lote && mr && fuera[mr])) return;
        vistos[id.toUpperCase()] = 1;
        out.push({ lote: lote, mr: mr, visita: r });
    });
    return out;
}
