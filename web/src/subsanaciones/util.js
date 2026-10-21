// Funciones puras de texto, fechas y distancias (sin estado ni DOM).

export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
export function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
export function valorItem(v) { v = norm(v).replace(/[.\s]/g, ''); return v === 'SI' ? 'SI' : v === 'NO' ? 'NO' : (v === 'NA' || v === 'N/A') ? 'N/A' : ''; }
export function hoy() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

// La base entrega dd/mm/aaaa como el Excel; el selector de fecha usa aaaa-mm-dd
export function aInput(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = String(s || '').match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : '';
}
export function aTexto(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : s; }
export function dias(desde) { var a = aInput(desde); return a ? Math.floor((new Date(hoy()) - new Date(a)) / 864e5) : null; }

// Acepta 18/10/2026, 18-10-26, 2026-10-18 o con hora, como venga del Excel. Devuelve aaaammdd para ordenar.
export function claveFecha(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return m[1] + ('0' + m[2]).slice(-2) + ('0' + m[3]).slice(-2);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})\b/);
    return m ? (m[3].length === 2 ? '20' + m[3] : m[3]) + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2) : '';
}
export function textoDias(d) { return d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días'; }
export function frase(s) { s = String(s || '').trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

// Marca de hora local aaaa-mm-ddTHH:MM:SS (carga y "en curso" de las paradas)
export function marca(d) {
    d = d || new Date();
    var z = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
}
// aaaa-mm-ddTHH:MM:SS <-> dd/mm/aaaa HH:MM:SS (así llega CARGADA / EN CURSO de la base)
export function textoCarga(c) {
    var m = String(c || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] : '') : '';
}
export function cargaDeTexto(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) { var a = aInput(s); return a ? a + 'T00:00:00' : ''; }
    var z = function (n) { return ('0' + (n || 0)).slice(-2); };
    return m[3] + '-' + z(m[2]) + '-' + z(m[1]) + 'T' + z(m[4]) + ':' + z(m[5]) + ':' + z(m[6]);
}
// "07:48" si fue hoy, "18/10 07:48" si fue otro día; nada si no se sabe la hora
export function horaCarga(c) {
    c = String(c || '');
    if (c.length < 16 || c.slice(11, 16) === '00:00') return '';
    return (c.slice(0, 10) === hoy() ? '' : c.slice(8, 10) + '/' + c.slice(5, 7) + ' ') + c.slice(11, 16);
}

// Distancia en metros entre dos puntos [lat, lon]
export function metros(a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * 6371e3 * Math.asin(Math.sqrt(h));
}
export function textoDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; }
