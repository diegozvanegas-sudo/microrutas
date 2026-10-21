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
    if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
    return { lat: la, lng: lo };
};
