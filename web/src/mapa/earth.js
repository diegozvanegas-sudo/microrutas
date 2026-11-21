// Vista 3D del lote en Google Earth (ficha del lote de mapa_rapido.html): un enlace que abre Earth inclinado sobre el
// lote y un KML con el contorno y un vuelo alrededor (gx:Tour, se reproduce en Google Earth Pro y en la app).
// Los polígonos llegan como [[anillo exterior, huecos...], ...] y cada anillo como [[lat, lng], ...].

// Metros entre dos puntos (aproximación plana: basta para el tamaño de un lote)
function metros(a, b) {
    var lat = (a[0] + b[0]) / 2 * Math.PI / 180;
    var dy = (a[0] - b[0]) * 111320, dx = (a[1] - b[1]) * 111320 * Math.cos(lat);
    return Math.sqrt(dx * dx + dy * dy);
}

// Caja del lote, su centro y a qué distancia poner la cámara para que se vea completo con algo de alrededor
export function encuadre(poligonos) {
    var s = 90, n = -90, o = 180, e = -180;
    (poligonos || []).forEach(function (pol) { (pol[0] || []).forEach(function (p) {
        if (p[0] < s) s = p[0]; if (p[0] > n) n = p[0]; if (p[1] < o) o = p[1]; if (p[1] > e) e = p[1];
    }); });
    if (s > n) return null;
    var diag = metros([s, o], [n, e]);
    return { centro: [(s + n) / 2, (o + e) / 2], rango: Math.round(Math.min(3000, Math.max(250, diag * 1.8))) };
}

// Google Earth web (en el celular abre la app si está instalada): cámara a 60° de inclinación mirando el centro.
// «a» es la altura sobre el mar del punto mirado: si queda por debajo del terreno, Earth sube el punto y deja la cámara
// casi pegada al suelo (pasó en el lote 491: 1.690 m con 1.500 puestos). Por eso se pide la altura del punto
// (alturaTerreno) y se le suman 30 m de margen; sin ella se usa 1.500 m, el fondo del valle.
export function urlEarth(centro, rango, altura) {
    var a = typeof altura === 'number' && isFinite(altura) ? Math.round(altura + 30) : 1500;
    return 'https://earth.google.com/web/@' + centro[0].toFixed(6) + ',' + centro[1].toFixed(6) + ',' + a + 'a,' +
        Math.round(rango || 600) + 'd,35y,0h,60t,0r';
}

// Altura del terreno (m sobre el mar) en Open-Meteo: gratis, sin clave; solo se envían las coordenadas del lote.
// Devuelve null si no responde a tiempo (sin señal): el enlace sale con la altura del valle.
export async function alturaTerreno(centro, espera) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, espera || 3000) : null;
    try {
        var r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + centro[0].toFixed(5) + '&longitude=' + centro[1].toFixed(5), ctl ? { signal: ctl.signal } : {});
        var j = r.ok ? await r.json() : null, h = j && j.elevation && j.elevation[0];
        return typeof h === 'number' && isFinite(h) ? h : null;
    } catch (e) { return null; } finally { if (t) clearTimeout(t); }
}

function xml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
function anillo(a) {
    var c = a.map(function (p) { return p[1].toFixed(7) + ',' + p[0].toFixed(7) + ',0'; });
    if (c.length && c[0] !== c[c.length - 1]) c.push(c[0]); // KML pide el anillo cerrado
    return '<LinearRing><coordinates>' + c.join(' ') + '</coordinates></LinearRing>';
}
function lookAt(centro, rango, rumbo, inclinacion) {
    return '<LookAt><longitude>' + centro[1].toFixed(7) + '</longitude><latitude>' + centro[0].toFixed(7) + '</latitude>' +
        '<altitude>0</altitude><heading>' + rumbo + '</heading><tilt>' + inclinacion + '</tilt><range>' + rango + '</range>' +
        '<altitudeMode>relativeToGround</altitudeMode></LookAt>';
}

// KML del lote: contorno amarillo pegado al terreno, vista inicial inclinada y un vuelo de una vuelta completa
export function kmlLote(o) {
    var enc = encuadre(o.poligonos);
    if (!enc) return '';
    var rango = enc.rango, c = enc.centro, pasos = 12, vuelo = [];
    // Llega de arriba y baja a 60°; luego da la vuelta en 12 pasos de 30° (unos 30 s)
    vuelo.push('<gx:FlyTo><gx:duration>3</gx:duration><gx:flyToMode>bounce</gx:flyToMode>' + lookAt(c, rango * 1.6, 0, 20) + '</gx:FlyTo>');
    vuelo.push('<gx:FlyTo><gx:duration>3</gx:duration><gx:flyToMode>smooth</gx:flyToMode>' + lookAt(c, rango, 0, 60) + '</gx:FlyTo>');
    for (var i = 1; i <= pasos; i++) vuelo.push('<gx:FlyTo><gx:duration>2.5</gx:duration><gx:flyToMode>smooth</gx:flyToMode>' + lookAt(c, rango, i * 360 / pasos, 60) + '</gx:FlyTo>');
    var poligonos = o.poligonos.filter(function (p) { return p[0] && p[0].length >= 3; }).map(function (p) {
        return '<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs>' + anillo(p[0]) + '</outerBoundaryIs>' +
            p.slice(1).filter(function (h) { return h.length >= 3; }).map(function (h) { return '<innerBoundaryIs>' + anillo(h) + '</innerBoundaryIs>'; }).join('') + '</Polygon>';
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>' +
        '<name>' + xml(o.nombre) + ' · vista 3D</name>' + lookAt(c, rango, 0, 60) +
        // Contorno amarillo (aabbggrr) con relleno amarillo muy suave: se ve el pasto debajo
        '<Style id="lote"><LineStyle><color>ff00d7ff</color><width>3</width></LineStyle><PolyStyle><color>3300d7ff</color></PolyStyle></Style>' +
        '<Placemark><name>' + xml(o.nombre) + '</name>' + (o.descripcion ? '<description>' + xml(o.descripcion) + '</description>' : '') +
        lookAt(c, rango, 0, 60) + '<styleUrl>#lote</styleUrl>' +
        (poligonos.length === 1 ? poligonos[0] : '<MultiGeometry>' + poligonos.join('') + '</MultiGeometry>') + '</Placemark>' +
        '<gx:Tour><name>Vuelo alrededor de ' + xml(o.nombre) + '</name><gx:Playlist>' + vuelo.join('') + '</gx:Playlist></gx:Tour>' +
        '</Document></kml>\n';
}
