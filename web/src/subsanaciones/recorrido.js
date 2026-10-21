// Recorrido corto de la pre-ruta: vecino más cercano (probando cada lote como inicio si no hay ubicación)
// y luego 2-opt, que deshace los cruces del recorrido.
// ps: paradas { id }; desde: [lat, lon] o id de lote, o null; distLotes(a, b): metros entre lotes o puntos.
export function recorridoCorto(ps, desde, distLotes) {
    if (ps.length < 2) return ps;
    // Distancias calculadas una sola vez: entre lotes (D) y desde su ubicación (U)
    var D = {}, U = {};
    ps.forEach(function (a) {
        D[a.id] = {};
        ps.forEach(function (b) { D[a.id][b.id] = a === b ? 0 : (D[b.id] && D[b.id][a.id] != null ? D[b.id][a.id] : distLotes(a.id, b.id)); });
        if (desde) U[a.id] = distLotes(desde, a.id);
    });
    var d = function (a, b) { return a ? D[a.id][b.id] : desde ? U[b.id] : 0; };
    var largo = function (o) { var t = 0, a = null; o.forEach(function (p) { t += d(a, p); a = p; }); return t; };
    var mejor = null;
    (desde ? [null] : ps).forEach(function (ini) {
        var resto = ps.slice(), orden = [], actual = null;
        if (ini) { orden.push(resto.splice(resto.indexOf(ini), 1)[0]); actual = ini; }
        while (resto.length) {
            var k = 0;
            resto.forEach(function (p, i) { if (d(actual, p) < d(actual, resto[k])) k = i; });
            actual = resto[k];
            orden.push(resto.splice(k, 1)[0]);
        }
        if (!mejor || largo(orden) < largo(mejor)) mejor = orden;
    });
    for (var mejoro = true; mejoro;) {
        mejoro = false;
        for (var i = 0; i < mejor.length - 1; i++) for (var k = i + 1; k < mejor.length; k++) {
            var prueba = mejor.slice(0, i).concat(mejor.slice(i, k + 1).reverse(), mejor.slice(k + 1));
            if (largo(prueba) < largo(mejor) - 1) { mejor = prueba; mejoro = true; }
        }
    }
    return mejor;
}
