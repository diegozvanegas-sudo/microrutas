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
