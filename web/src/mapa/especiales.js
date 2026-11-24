// ⭐ Puntos de las operaciones especiales: lo guardado en este equipo (especiales_puntos) con lo de la base (puntos_especiales).
// local: { CLAVE: { p: [lat, lon], hora, pendiente?, borrado? } } — pendiente = cambio hecho aquí que aún no está en la base
// (sin sesión o sin señal); borrado = se quitó aquí y falta quitarlo de la base.
// base: { CLAVE: { p, hora } } (hora = cuándo se cambió en la base).
// → { puntos: lo que queda en el equipo, subir: [claves a guardar en la base], borrar: [claves a quitar de la base] }
// Un cambio pendiente gana si es más nuevo que el de la base; lo que no está pendiente y ya no está en la base lo quitó otro.
export function mezclarPuntos(local, base) {
    local = local || {}; base = base || {};
    var puntos = {}, subir = [], borrar = [];
    Object.keys(base).forEach(function (k) { puntos[k] = { p: base[k].p, hora: base[k].hora || 0 }; });
    Object.keys(local).forEach(function (k) {
        var l = local[k], b = base[k];
        if (!l || !l.pendiente) return;
        if (b && (b.hora || 0) > (l.hora || 0)) return;   // en la base hay algo más nuevo
        if (l.borrado) { delete puntos[k]; if (b) borrar.push(k); return; }
        if (!l.p) return;
        puntos[k] = { p: l.p, hora: l.hora || 0, pendiente: true };
        subir.push(k);
    });
    return { puntos: puntos, subir: subir, borrar: borrar };
}
