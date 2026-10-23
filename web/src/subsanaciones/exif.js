// Datos EXIF de una foto JPG: fecha y hora de captura, coordenadas GPS y orientación.
// El contrato exige que todas las fotos tengan GPS, fecha y hora (especificaciones técnicas, pág. 8 y 29).

// bytes: Uint8Array del archivo. Devuelve { fecha: 'AAAA-MM-DD HH:MM:SS' | null, gps: { lat, lon } | null, orientacion }
export function leerExif(b) {
    var res = { fecha: null, gps: null, orientacion: 1 };
    if (!(b[0] === 0xFF && b[1] === 0xD8)) return res;
    var i = 2;
    while (i + 4 < b.length && b[i] === 0xFF) {
        var marca = b[i + 1], largo = (b[i + 2] << 8) | b[i + 3];
        if (marca === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) return leerTiff(b, i + 10, res);
        if (marca === 0xDA) break; // empiezan los datos de la imagen
        i += 2 + largo;
    }
    return res;
}

function leerTiff(b, t, res) {
    var le = b[t] === 0x49; // "II" = little endian
    var u16 = function (o) { return le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1]; };
    var u32 = function (o) { return le ? (b[t + o] | (b[t + o + 1] << 8) | (b[t + o + 2] << 16)) + b[t + o + 3] * 16777216 : b[t + o] * 16777216 + ((b[t + o + 1] << 16) | (b[t + o + 2] << 8) | b[t + o + 3]); };
    var texto = function (o, n) { var s = ''; for (var k = 0; k < n && b[t + o + k]; k++) s += String.fromCharCode(b[t + o + k]); return s; };
    var racional = function (o) { var d = u32(o + 4); return d ? u32(o) / d : 0; };
    // Entradas de un IFD: { etiqueta: desplazamiento del valor }
    var entradas = function (ifd) {
        var mapa = {};
        if (!ifd || t + ifd + 2 > b.length) return mapa;
        for (var n = u16(ifd), k = 0; k < n; k++) {
            var e = ifd + 2 + k * 12, tipo = u16(e + 2), cuenta = u32(e + 4);
            var tam = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[tipo] || 1) * cuenta;
            mapa[u16(e)] = { valor: tam > 4 ? u32(e + 8) : e + 8, cuenta: cuenta, tipo: tipo };
        }
        return mapa;
    };
    var ifd0 = entradas(u32(4));
    if (ifd0[0x0112]) res.orientacion = u16(ifd0[0x0112].valor);
    // Fecha: DateTimeOriginal (sub-IFD Exif) o, si no está, DateTime del IFD0
    var exif = ifd0[0x8769] ? entradas(u32(ifd0[0x8769].valor)) : {};
    var f = exif[0x9003] || ifd0[0x0132];
    if (f) {
        var m = texto(f.valor, 19).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (m && m[1] !== '0000') res.fecha = m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6];
    }
    // GPS: grados, minutos y segundos en racionales + referencia N/S y E/W
    if (ifd0[0x8825]) {
        var g = entradas(u32(ifd0[0x8825].valor));
        var grados = function (e) { return e ? racional(e.valor) + racional(e.valor + 8) / 60 + racional(e.valor + 16) / 3600 : null; };
        var lat = grados(g[2]), lon = grados(g[4]);
        if (lat != null && lon != null && (lat || lon)) {
            if (g[1] && texto(g[1].valor, 1) === 'S') lat = -lat;
            if (g[3] && texto(g[3].valor, 1) === 'W') lon = -lon;
            res.gps = { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
        }
    }
    return res;
}
