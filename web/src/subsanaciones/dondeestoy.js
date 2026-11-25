// «📍 Dónde estoy» de Posibles hallazgos y Buena operación: con el GPS se arman las direcciones que se pueden poner
// en el mensaje (la de OpenStreetMap, la del lote donde está o los lotes cercanos, y las coordenadas exactas).
// Aquí solo la lógica; la ventana está en app.js.

// Respuesta de Nominatim (reverse, jsonv2, addressdetails) → { via, barrio, dir } o null. Igual que lugarDe() del mapa rápido
export function direccionOSM(j) {
    var a = j && j.address;
    if (!a) return null;
    var via = a.road || a.pedestrian || a.footway || a.path || '', num = a.house_number ? ' #' + a.house_number : '';
    var barrio = a.neighbourhood || a.quarter || a.suburb || a.city_district || '';
    var dir = [via + num, barrio].filter(Boolean).join(', ');
    return dir ? { via: via + num, numero: !!a.house_number, barrio: barrio, dir: dir } : null;
}

export function textoCoord(lat, lon) { return (+lat).toFixed(6) + ', ' + (+lon).toFixed(6); }

function nombreLote(x) { return x.lote ? 'Lote ' + x.lote : x.mr || ''; }

// Opciones en orden (la primera es la que se pone sola). d = {
//   lat, lon,                       ubicación del GPS
//   osm: direccionOSM(...) | null,  dirección aproximada del punto
//   lote: { lote, mr, d, dist } | null,   el lote donde está (dist = metros al borde; 0 = adentro)
//   cercanos: [{ lote, mr, d, dist }]     otros lotes cerca, ya ordenados por distancia
// }
// Cada opción: { texto (lo que va al campo), etiqueta (lo que se ve en el botón) }
export function opcionesDonde(d) {
    var ops = [], coord = textoCoord(d.lat, d.lon), osm = d.osm;
    var add = function (texto, etiqueta) {
        texto = String(texto || '').replace(/\s+/g, ' ').trim();
        if (texto && !ops.some(function (o) { return o.texto === texto; })) ops.push({ texto: texto, etiqueta: etiqueta });
    };
    var conLote = function (x) { return (x.d ? x.d + ' (' + nombreLote(x) + ')' : nombreLote(x)); };
    var enLote = d.lote && (d.lote.lote || d.lote.mr) ? d.lote : null;
    // Con número de casa, la de OpenStreetMap es la más exacta; sin número, primero la del lote donde está
    if (osm && osm.numero) add(osm.dir, '📍 ' + osm.dir);
    if (enLote) add(conLote(enLote), '🌿 ' + nombreLote(enLote) + (enLote.dist ? ' (a ' + enLote.dist + ' m)' : '') + (enLote.d ? ' · ' + enLote.d : ''));
    if (osm) add(osm.dir, '📍 ' + osm.dir + (osm.numero ? '' : ' (sin número)'));
    if (osm) add(osm.dir + ' (' + coord + ')', '📍 ' + osm.via + ' + coordenadas');
    add(coord, '🎯 Coordenadas ' + coord);
    (d.cercanos || []).forEach(function (x) {
        if (enLote && (x.mr ? x.mr === enLote.mr : x.lote === enLote.lote)) return;
        add(conLote(x), '🌿 ' + nombreLote(x) + ' a ' + Math.round(x.dist) + ' m' + (x.d ? ' · ' + x.d : ''));
    });
    return ops;
}

// Los lotes más cercanos a [lat, lon]: ids con su distancia (dist(id) en metros), hasta max y dentro de radio metros
export function lotesCercanos(ids, dist, max, radio) {
    return ids.map(function (id) { return { id: id, dist: dist(id) }; })
        .filter(function (x) { return isFinite(x.dist) && x.dist <= radio; })
        .sort(function (a, b) { return a.dist - b.dist; })
        .slice(0, max);
}

// Ubicación que mandó el mapa rápido en la dirección (…&lat=6.2&lng=-75.5&prec=12), o null
export function posDeUrl(q) {
    var lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lng'));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    var prec = parseFloat(q.get('prec'));
    return { lat: lat, lon: lon, prec: isFinite(prec) ? prec : null };
}
