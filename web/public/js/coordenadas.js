// Lee coordenadas escritas a mano, copiadas de Google Maps o de la marca de agua de una foto GPS:
//   6.2751N 75.5737W · 6.2751, -75.5737 · 6°16'30.4"N 75°34'25.3"W · https://maps.google.com/?q=6.2751,-75.5737
// Devuelve { lat, lng } o null. Sin signo ni W/O, una longitud de 60 a 85 se toma como oeste (Colombia).
window.leerCoordenadas = function (texto) {
    var t = String(texto || '').toUpperCase().replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/''/g, '"').replace(/º/g, '°');
    // Sin puntos, la coma es decimal: "6,2751 -75,5737"
    // Con puntos en otra parte (fecha 14.10.2026 de la marca de agua), "6,2887" sigue siendo decimal si trae 3 o más cifras
    t = t.indexOf('.') === -1 ? t.replace(/(\d),(\d)/g, '$1.$2') : t.replace(/(\d{1,3}),(\d{3,})/g, '$1.$2');
    var vals = [], m;
    var dms = /([-+]?\d{1,3}(?:\.\d+)?)\s*°\s*(?:(\d{1,2}(?:\.\d+)?)\s*'\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*"\s*)?([NSEWO](?![A-Z]))?/g;
    while ((m = dms.exec(t))) vals.push({ v: Math.abs(+m[1]) + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600, neg: m[1][0] === '-', h: m[4] || '' });
    if (vals.length < 2) {
        vals = [];
        // Al menos 2 decimales: así no se confunde con horas, lotes ni fechas de la marca de agua
        var dec = /([-+]?\d{1,3}\.\d{2,})\s*°?\s*([NSEWO](?![A-Z]))?/g;
        while ((m = dec.exec(t))) vals.push({ v: Math.abs(+m[1]), neg: m[1][0] === '-', h: m[2] || '' });
    }
    if (vals.length < 2) return null;
    var lat = vals.filter(function (x) { return x.h === 'N' || x.h === 'S'; })[0];
    var lng = vals.filter(function (x) { return /[EWO]/.test(x.h); })[0];
    var resto = vals.filter(function (x) { return x !== lat && x !== lng; });
    lat = lat || resto.shift();
    lng = lng || resto.shift();
    if (!lat || !lng) return null;
    var la = (lat.neg || lat.h === 'S' ? -1 : 1) * lat.v;
    var lo = (lng.neg || lng.h === 'W' || lng.h === 'O' ? -1 : 1) * lng.v;
    if (!lng.h && !lng.neg && lo >= 60 && lo <= 85) lo = -lo;
    // Errores comunes al escribir, si la longitud es de Colombia (-66 a -82) o vienen al revés:
    //   "76.19650, -75.58450" (sobra un dígito en la latitud) -> 6.19650 · "-75.5845, 6.1965" (invertidas)
    var escrita = la.toFixed(5) + ', ' + lo.toFixed(5), corregida = '';
    if (Math.abs(la) >= 60 && Math.abs(la) <= 85 && Math.abs(lo) <= 15) {
        var tmp = la; la = lo; lo = -Math.abs(tmp); corregida = 'latitud y longitud invertidas';
    } else if (Math.abs(la) > 15 && lo <= -60 && lo >= -85) {
        var signo = la < 0 ? -1 : 1, s = String(Math.abs(la));
        while (Math.abs(la) > 15 && s.length > 1) { s = s.slice(1); la = signo * parseFloat(s); }
        corregida = 'un dígito de más en la latitud';
    }
    if (!isFinite(la) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
    return corregida ? { lat: la, lng: lo, corregida: corregida, escrita: escrita } : { lat: la, lng: lo };
};

// Texto leído de la marca de agua de una foto (OCR): arregla las confusiones típicas del lector y devuelve
// { lat, lng, texto } con el texto de la coordenada tal como sale en la foto, o null.
//   "6o17'38.65722''N 75°34'37.8\"W" -> texto 6°17'38.65722"N 75°34'37.8"W
window.coordenadasDeFoto = function (ocr) {
    var limpio = String(ocr || '')
        .replace(/[‘’′`´]/g, "'").replace(/[“”″]/g, '"').replace(/''/g, '"').replace(/º/g, '°')
        // El símbolo de grados se lee como o, O o un espacio: 6o17'  6 17'  ->  6°17'
        .replace(/(\b\d{1,2})\s*[oO°]\s*(\d{1,2}\s*')/g, '$1°$2').replace(/(\b\d{1,2})\s+(\d{1,2}')/g, '$1°$2')
        // El punto decimal de los segundos se lee como coma o se pierde: 38,65722"  37 8"  ->  38.65722"  37.8"
        .replace(/(\d{1,2})(?:,|\s+)(\d+\s*")/g, '$1.$2')
        // Las comillas de los segundos se leen como una sola: 6°17'38.65722'N -> 6°17'38.65722"N
        .replace(/(\d°\s*\d{1,2}\s*'\s*\d{1,2}(?:\.\d+)?)\s*'(\s*[NSEWO])/g, '$1"$2');
    var lineas = limpio.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    // Una línea con las dos coordenadas, o dos líneas seguidas (latitud arriba, longitud abajo)
    var candidatas = lineas.concat(lineas.slice(1).map(function (l, i) { return lineas[i] + ' ' + l; }));
    for (var i = 0; i < candidatas.length; i++) {
        var c = window.leerCoordenadas(candidatas[i]);
        if (!c) continue;
        // Solo la parte de la coordenada (la línea puede traer la fecha, la hora o la dirección)
        var m = candidatas[i].match(/-?\d{1,3}\s*°[^NSEWO]*[NS]\s*,?\s*-?\d{1,3}\s*°[^NSEWO]*[EWO]/i) ||
                candidatas[i].match(/-?\d{1,3}[.,]\d{3,}\s*°?\s*[NS]?\s*,?\s*-?\d{1,3}[.,]\d{3,}\s*°?\s*[EWO]?/i);
        c.texto = (m ? m[0] : candidatas[i]).replace(/\s+/g, ' ').trim();
        // Completa = como la imprimen las cámaras: grados, minutos y segundos en las dos, o 4 o más decimales.
        // Si al lector se le perdió un pedazo (los segundos), el punto queda corrido hasta 1 km aunque se lea "bien"
        var t = c.texto.toUpperCase();
        c.completa = /\d°\s*\d{1,2}'\s*\d{1,2}(\.\d+)?"\s*[NS][\s\S]*\d°\s*\d{1,2}'\s*\d{1,2}(\.\d+)?"\s*[EWO]/.test(t) ||
            (t.match(/\d[.,]\d{4,}/g) || []).length >= 2;
        return c;
    }
    return null;
};
