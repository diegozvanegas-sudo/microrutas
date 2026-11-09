// Marca de agua de las cámaras con GPS (p. ej. «4 nov 2026 15:50:22 / 6.27938N 75.56534W / Aranjuez Medellín»).
// Las fotos que pasan por WhatsApp pierden el GPS y la fecha del archivo (EXIF), pero el sello sigue escrito en la imagen:
// se recorta la franja de abajo, se deja solo la letra blanca (negra sobre blanco, más grande) y se lee con el lector de texto.
// El lector confunde caracteres: «6 28044N», «~6,.27899N», «/5.56504W» (por 75): se toleran y se valida que el punto caiga
// en la zona del contrato (Medellín, corregimientos y Área Metropolitana).

var ZONA = { latMin: 5.9, latMax: 6.6, lonMin: -75.9, lonMax: -75.2 };
function enZona(lat, lon) { return lat >= ZONA.latMin && lat <= ZONA.latMax && lon >= ZONA.lonMin && lon <= ZONA.lonMax; }

// Texto leído del sello → { lat, lon } o null
export function coordenadasMarca(texto) {
    var t = String(texto || '').toUpperCase().replace(/[|]/g, '1').replace(/[°º]/g, ' ');
    // Latitud: un dígito (6, a veces 5), separador cualquiera (punto, coma, espacio) y 4 a 6 decimales, luego N
    // Longitud: 75 (o /5, 15, 7S… leídos mal), separador y 4 a 6 decimales, luego W u O
    var re = /([56])\s*[.,:;'`~\-\s]{0,3}\s*(\d{4,6})\s*N\W{0,6}?\s*([/71]?[5S])\s*[.,:;'`~\-\s]{0,3}\s*(\d{4,6})\s*[WO]/g, m;
    while ((m = re.exec(t))) {
        var lat = Number(m[1] + '.' + m[2]), lon = -Number('75.' + m[4]);
        if (enZona(lat, lon)) return { lat: lat, lon: lon };
    }
    // Sello con signo en vez de letras: «6.27938, -75.56534»
    var d = t.match(/\b([56][.,]\d{4,7})\s*[,;\s]\s*-\s*(7[45][.,]\d{4,7})\b/);
    if (d) {
        var la = Number(d[1].replace(',', '.')), lo = -Number(d[2].replace(',', '.'));
        if (enZona(la, lo)) return { lat: la, lon: lo };
    }
    return null;
}

var MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
// «4 nov 2026 15:50:22» → '2026-11-04 15:50:22' (mismo formato que la fecha del EXIF) o null
export function fechaMarca(texto) {
    var t = String(texto || '').toUpperCase().replace(/[|]/g, '1');
    var m = t.match(/\b(\d{1,2})\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z.]*\s*(20\d\d)\s+(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?/);
    if (!m) return null;
    var d = +m[1], h = +m[4], mi = +m[5], s = m[6] ? +m[6] : 0, z = function (n) { return ('0' + n).slice(-2); };
    // El lector a veces cambia el año (2026 → 2020): solo se acepta del año pasado al actual
    var hoy = new Date().getFullYear();
    if (d < 1 || d > 31 || h > 23 || mi > 59 || s > 59 || +m[3] < hoy - 1 || +m[3] > hoy) return null;
    return m[3] + '-' + z(MESES[m[2]]) + '-' + z(d) + ' ' + z(h) + ':' + z(mi) + ':' + z(s);
}

// Franja de abajo de la foto, lista para el lector: solo lo casi blanco queda en negro, el resto blanco, al doble de tamaño.
// umbral: qué tan blanco debe ser el píxel (0-255). Devuelve un File PNG (para leerImagenes)
export async function recorteMarca(archivo, umbral) {
    var bmp = await createImageBitmap(archivo);
    var x0 = Math.round(bmp.width * 0.25), y0 = Math.round(bmp.height * 0.70), w = bmp.width - x0, h = bmp.height - y0;
    var escala = Math.min(2, 2400 / w), c = document.createElement('canvas');
    c.width = Math.round(w * escala); c.height = Math.round(h * escala);
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, x0, y0, w, h, 0, 0, c.width, c.height);
    bmp.close();
    var img = g.getImageData(0, 0, c.width, c.height), p = img.data, u = umbral || 205;
    for (var i = 0; i < p.length; i += 4) {
        var v = Math.min(p[i], p[i + 1], p[i + 2]) > u ? 0 : 255;
        p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/png'); });
    return new File([blob], 'sello ' + archivo.name + '.png', { type: 'image/png' });
}
