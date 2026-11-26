// 🗑 Puntos críticos de basura del mapa rápido: los 117 del archivo (data/rapido/capa_puntos_criticos.js, «fijos») más los
// que se agregan en los recorridos, y la descripción y la dirección que se le ponen a cualquiera. Lo agregado y corregido
// va a la tabla puntos_criticos (0033) y lo ven todos los equipos; sin sesión o sin señal queda en este equipo como
// pendiente (criticos_locales) y se sube después.
//   fila: { id, nombre, direccion, zona, descripcion, lat, lon, origen: 'fijo' | 'campo', quitado, hora (ms) }
//   id de un fijo: 'f:' + sus coordenadas del archivo; de uno nuevo: 'c:' + marca

var CAMPOS = ['nombre', 'direccion', 'zona', 'descripcion', 'lat', 'lon', 'origen', 'quitado', 'hora'];
export var MAX_DESCRIPCION = 1000;

// g del archivo ([lon×1e6, lat×1e6], sin decodificar) → id estable del punto fijo
export function claveFija(g) { return 'f:' + (g || []).slice(0, 2).join(','); }
export function nuevoIdCritico(ahora) { return 'c:' + (ahora || Date.now()).toString(36) + Math.random().toString(36).slice(2, 6); }

function limpio(x) {
    var o = {};
    CAMPOS.forEach(function (c) { if (x[c] !== undefined && x[c] !== null) o[c] = x[c]; });
    ['nombre', 'direccion', 'zona', 'descripcion'].forEach(function (c) { if (o[c] != null) o[c] = String(o[c]).trim(); });
    if (o.descripcion) o.descripcion = o.descripcion.slice(0, MAX_DESCRIPCION);
    return o;
}

// fijos: [{ id, n, z, d, lat, lon }] · base: { id: fila } · locales: { id: fila con pendiente } → puntos para pintar.
// Lo del equipo manda si es más nuevo que lo de la base. A un fijo solo se le cambia el texto (no se mueve). Los quitados
// («ya no es punto crítico») no salen.
export function mezclarCriticos(fijos, base, locales) {
    var por = {};
    (fijos || []).forEach(function (f) {
        por[f.id] = { id: f.id, nombre: f.n || '', direccion: f.d || '', zona: f.z || '', descripcion: '', lat: f.lat, lon: f.lon, origen: 'fijo', hora: 0 };
    });
    function aplicar(x, pendiente) {
        if (!x || !x.id) return;
        var b = por[x.id];
        if (!b && String(x.id).indexOf('c:') !== 0) return;   // corrección de un fijo que ya no está en el archivo
        var n = Object.assign({ id: x.id, origen: 'campo', nombre: '', direccion: '', zona: '', descripcion: '' }, b || {}, limpio(x), { pendiente: !!pendiente });
        if (b && b.origen === 'fijo') { n.origen = 'fijo'; n.lat = b.lat; n.lon = b.lon; }
        por[x.id] = n;
    }
    base = base || {}; locales = locales || {};
    Object.keys(base).forEach(function (k) { aplicar(base[k], false); });
    Object.keys(locales).forEach(function (k) { var l = locales[k], b = base[k]; if (!b || (l.hora || 0) > (b.hora || 0)) aplicar(l, true); });
    return Object.keys(por).map(function (k) { return por[k]; }).filter(function (p) { return !p.quitado && isFinite(p.lat) && isFinite(p.lon); });
}

// Fila de la base (tabla puntos_criticos) → fila del mapa
export function deFilaCritico(r) {
    return limpio({ id: r.id, nombre: r.nombre, direccion: r.direccion, zona: r.zona, descripcion: r.descripcion, lat: r.lat, lon: r.lon,
        origen: r.origen, quitado: !!r.quitado, hora: Date.parse(r.actualizado) || 0 });
}
export function aFilaCritico(p) {
    return { id: p.id, nombre: String(p.nombre || '').trim().slice(0, 200), direccion: String(p.direccion || '').trim().slice(0, 300), zona: String(p.zona || '').trim().slice(0, 40),
        descripcion: String(p.descripcion || '').trim().slice(0, MAX_DESCRIPCION), lat: +p.lat, lon: +p.lon, origen: p.origen === 'fijo' ? 'fijo' : 'campo',
        quitado: !!p.quitado, actualizado: new Date(p.hora || Date.now()).toISOString() };
}

// Texto para copiar o mandar por WhatsApp
export function textoCritico(p, enlace) {
    return ['🗑 Punto crítico: ' + (p.nombre || 'sin nombre'), p.direccion && p.direccion !== p.nombre ? '📍 ' + p.direccion : '', p.zona ? p.zona : '',
        p.descripcion ? '📝 ' + p.descripcion : '', (+p.lat).toFixed(6) + ', ' + (+p.lon).toFixed(6), enlace || ''].filter(Boolean).join('\n');
}
