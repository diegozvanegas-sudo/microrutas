// Imágenes del documento de descuento, armadas con la foto satelital de Google (sus cuadros traen
// Access-Control-Allow-Origin: *, así que se pueden pintar en un canvas y guardar): «Área actual» (el lote resaltado) y
// «Área para descontar» (lo dibujado, con sus m²). La parte de cálculo (cuadros y encuadre) no usa el navegador y se prueba.

var CUADRO = 256;
export var SATELITE = 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';

// Coordenadas en píxeles del mundo (Web Mercator) a un zoom
export function aPixel(lat, lon, z) {
    var n = CUADRO * Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
    return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}
// Recuadro de unos anillos [[lat, lon], …] → { lat0, lat1, lon0, lon1 }
export function recuadro(anillos) {
    var b = { lat0: Infinity, lat1: -Infinity, lon0: Infinity, lon1: -Infinity };
    (anillos || []).forEach(function (r) { r.forEach(function (p) { b.lat0 = Math.min(b.lat0, p[0]); b.lat1 = Math.max(b.lat1, p[0]); b.lon0 = Math.min(b.lon0, p[1]); b.lon1 = Math.max(b.lon1, p[1]); }); });
    return isFinite(b.lat0) ? b : null;
}
// Encuadre: el zoom más cercano en que el recuadro (con margen) cabe en la imagen, y el centro en píxeles
export function encuadre(b, ancho, alto, zMax) {
    zMax = zMax || 20;
    var margen = 0.72;   // lo dibujado ocupa como mucho el 72 % de la imagen
    for (var z = zMax; z >= 3; z--) {
        var a = aPixel(b.lat1, b.lon0, z), c = aPixel(b.lat0, b.lon1, z);
        if (c[0] - a[0] <= ancho * margen && c[1] - a[1] <= alto * margen) return { z: z, cx: (a[0] + c[0]) / 2, cy: (a[1] + c[1]) / 2 };
    }
    var p = aPixel((b.lat0 + b.lat1) / 2, (b.lon0 + b.lon1) / 2, 3);
    return { z: 3, cx: p[0], cy: p[1] };
}
// Cuadros que cubren la imagen → [{ x, y, z, dx, dy }] (dx, dy: dónde va cada cuadro dentro de la imagen)
export function cuadros(e, ancho, alto) {
    var x0 = e.cx - ancho / 2, y0 = e.cy - alto / 2, out = [];
    for (var tx = Math.floor(x0 / CUADRO); tx <= Math.floor((x0 + ancho) / CUADRO); tx++) {
        for (var ty = Math.floor(y0 / CUADRO); ty <= Math.floor((y0 + alto) / CUADRO); ty++) {
            out.push({ x: tx, y: ty, z: e.z, dx: Math.round(tx * CUADRO - x0), dy: Math.round(ty * CUADRO - y0) });
        }
    }
    return out;
}
export function urlCuadro(c) { return SATELITE.replace('{s}', String((c.x + c.y) % 4)).replace('{x}', c.x).replace('{y}', c.y).replace('{z}', c.z); }

function cargar(url) {
    return new Promise(function (ok, mal) {
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function () { ok(im); };
        im.onerror = function () { mal(new Error('no se pudo descargar la foto satelital (¿sin señal?)')); };
        im.src = url;
    });
}

// opciones: { ancho, alto, encuadrar: [anillos], capas: [{ anillos, relleno, borde, grosor }], etiqueta: { texto, en: [lat, lon] } }
// → Promise<{ bytes (JPEG), url (para verla en la página), tipo: 'jpg' }>
export async function armarImagen(o) {
    var ancho = o.ancho || 900, alto = o.alto || 560, b = recuadro(o.encuadrar);
    if (!b) throw new Error('no hay nada dibujado para encuadrar');
    var e = encuadre(b, ancho, alto, o.zMax || 20);
    var lienzo = document.createElement('canvas');
    lienzo.width = ancho; lienzo.height = alto;
    var g = lienzo.getContext('2d');
    g.fillStyle = '#d1d5db'; g.fillRect(0, 0, ancho, alto);
    var lista = cuadros(e, ancho, alto), imgs = await Promise.all(lista.map(function (c) { return cargar(urlCuadro(c)); }));
    imgs.forEach(function (im, i) { g.drawImage(im, lista[i].dx, lista[i].dy, CUADRO, CUADRO); });
    var x0 = e.cx - ancho / 2, y0 = e.cy - alto / 2;
    var punto = function (p) { var q = aPixel(p[0], p[1], e.z); return [q[0] - x0, q[1] - y0]; };
    (o.capas || []).forEach(function (c) {
        (c.anillos || []).forEach(function (r) {
            if (r.length < 2) return;
            g.beginPath();
            r.forEach(function (p, i) { var q = punto(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
            g.closePath();
            if (c.relleno) { g.fillStyle = c.relleno; g.fill(); }
            if (c.borde) { g.strokeStyle = c.borde; g.lineWidth = c.grosor || 2; g.setLineDash(c.punteado ? [8, 6] : []); g.stroke(); }
        });
    });
    g.setLineDash([]);
    if (o.etiqueta && o.etiqueta.texto && o.etiqueta.en) {
        var t = o.etiqueta.texto;
        g.font = 'bold 22px "Segoe UI", Arial, sans-serif';
        var w = g.measureText(t).width + 22, h = 34;
        // Encima del área (para no taparla); si no cabe arriba, debajo
        var q = posEtiqueta((o.etiqueta.sobre || []).map(punto), punto(o.etiqueta.en), h, alto);
        g.fillStyle = 'rgba(37, 99, 235, .95)';
        redondeado(g, q[0] - w / 2, q[1] - h / 2, w, h, 8); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t, q[0], q[1] + 1);
    }
    // Crédito de la foto (como en el mapa)
    g.font = '13px Arial, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(ancho - 120, alto - 20, 120, 20);
    g.fillStyle = '#334155'; g.fillText('Imágenes © Google', ancho - 6, alto - 4);
    var blob = await new Promise(function (ok) { lienzo.toBlob(ok, 'image/jpeg', 0.9); });
    if (!blob) throw new Error('el navegador no dejó guardar la imagen');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), tipo: 'jpg' };
}
// Centro de la etiqueta en píxeles: sobre el área (puntos ya en píxeles de la imagen), 10 px por encima; si se saldría por
// arriba, 10 px por debajo; sin puntos, en el punto dado
export function posEtiqueta(puntos, centro, h, alto) {
    if (!puntos || !puntos.length) return centro;
    var arriba = Math.min.apply(null, puntos.map(function (p) { return p[1]; })), abajo = Math.max.apply(null, puntos.map(function (p) { return p[1]; }));
    var x = puntos.reduce(function (s, p) { return s + p[0]; }, 0) / puntos.length;
    var y = arriba - 10 - h / 2;
    if (y - h / 2 < 4) y = Math.min(alto - h / 2 - 4, abajo + 10 + h / 2);
    return [x, y];
}
function redondeado(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
