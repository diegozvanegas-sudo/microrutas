// Dibujos «✅ bien / ❌ mal» de la Guía de campo (contrato.html?doc=GUIA-CAMPO), secciones «Lote ejecutado» y «Durante la
// operación». Son esquemas genéricos hechos a mano en SVG (no salen del contrato ni son fotos reales): las fotos de campo
// las sube cada usuario en 📷 Fotos (fotosguia.js). Se buscan por la clave del punto: dibujoDe('Plateo') → { bien, mal }.
// Cada lado: { txt, svg } con txt corto para el pie del dibujo y el texto alterno.

// Sin tildes, minúsculas y con guiones: 'Malla(s) de protección' → 'malla-s-de-proteccion'
export function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

var SUELO = 92;   // línea del suelo en el lienzo de 200 × 120
var C = { pasto: '#6dbb5a', hoja: '#3f8f3a', tierra: '#8a6a45', anden: '#c9ced3', junta: '#aab2b9', via: '#5b636b', tronco: '#8b5a2b',
    copa: '#2f8f46', piel: '#e0b088', naranja: '#f97316', amarillo: '#facc15', rojo: '#dc2626', tinta: '#1f2937', blanco: '#fff' };

// ---------- Piezas ----------
function suelo(x, w, color) { return '<rect x="' + (x || 0) + '" y="' + SUELO + '" width="' + (w == null ? 200 : w) + '" height="28" fill="' + (color || C.pasto) + '"/>'; }
// Hojas de pasto entre x1 y x2; alto(x) da la altura de cada hoja
function pasto(x1, x2, alto, paso) {
    var d = '';
    for (var x = x1; x <= x2; x += (paso || 4)) { var h = alto(x); if (h > 0) d += 'M' + x + ' ' + SUELO + 'l' + (x % 8 ? 1.5 : -1.5) + ' ' + (-h); }
    return '<path d="' + d + '" stroke="' + C.hoja + '" stroke-width="1.6" stroke-linecap="round" fill="none"/>';
}
function corto(x1, x2) { return pasto(x1, x2, function () { return 4; }); }
function anden(x, w, y) {
    y = y == null ? SUELO - 6 : y;
    var j = '';
    for (var k = x + 22; k < x + w; k += 22) j += '<line x1="' + k + '" y1="' + y + '" x2="' + k + '" y2="' + (y + 34) + '" stroke="' + C.junta + '"/>';
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="34" fill="' + C.anden + '"/>' + j;
}
function via(x, w) { return '<rect x="' + x + '" y="' + (SUELO - 4) + '" width="' + w + '" height="32" fill="' + C.via + '"/><line x1="' + x + '" y1="' + (SUELO + 12) + '" x2="' + (x + w) + '" y2="' + (SUELO + 12) + '" stroke="#fff" stroke-width="2" stroke-dasharray="10 8"/>'; }
function arbol(x, o) {
    o = o || {};
    var b = SUELO, s = '';
    if (o.plateo) s += '<ellipse cx="' + x + '" cy="' + (b + 2) + '" rx="' + o.plateo + '" ry="5" fill="' + C.tierra + '"/>';
    s += '<rect x="' + (x - 4) + '" y="' + (b - 40) + '" width="8" height="42" fill="' + C.tronco + '"/>';
    s += '<circle cx="' + x + '" cy="' + (b - 52) + '" r="' + (o.r || 20) + '" fill="' + C.copa + '"/><circle cx="' + (x - 12) + '" cy="' + (b - 44) + '" r="12" fill="' + C.copa + '"/><circle cx="' + (x + 12) + '" cy="' + (b - 44) + '" r="12" fill="' + C.copa + '"/>';
    if (o.herida) s += '<rect x="' + (x - 5) + '" y="' + (b - 12) + '" width="10" height="6" fill="#f3d9b1" stroke="' + C.rojo + '" stroke-width="1.2"/>';
    if (o.tutor) s += '<line x1="' + (x + 9) + '" y1="' + (b + 2) + '" x2="' + (x + 9) + '" y2="' + (b - 34) + '" stroke="#b08850" stroke-width="2"/>';
    if (o.pastoAlto) s += pasto(x - 14, x + 14, function (k) { return 10 + (k % 3) * 3; }, 3);
    return s;
}
// Persona de frente en x; o: casco, careta, gafas, carnet, canilleras, botas ('botas' | 'tenis'), camisa, rayas (uniforme), roto
function persona(x, o) {
    o = o || {};
    var b = SUELO, s = '', cam = o.camisa || C.naranja;
    s += '<rect x="' + (x - 6) + '" y="' + (b - 22) + '" width="5" height="22" fill="#334155"/><rect x="' + (x + 1) + '" y="' + (b - 22) + '" width="5" height="22" fill="#334155"/>';
    if (o.canilleras) s += '<rect x="' + (x - 7) + '" y="' + (b - 14) + '" width="7" height="9" rx="1.5" fill="#94a3b8"/><rect x="' + x + '" y="' + (b - 14) + '" width="7" height="9" rx="1.5" fill="#94a3b8"/>';
    var pie = o.botas === 'tenis' ? '#f8fafc' : C.tinta;
    s += '<rect x="' + (x - 8) + '" y="' + (b - 4) + '" width="7" height="4" fill="' + pie + '" stroke="' + C.tinta + '" stroke-width=".6"/><rect x="' + (x + 1) + '" y="' + (b - 4) + '" width="7" height="4" fill="' + pie + '" stroke="' + C.tinta + '" stroke-width=".6"/>';
    s += '<rect x="' + (x - 9) + '" y="' + (b - 46) + '" width="18" height="25" rx="3" fill="' + cam + '"/>';
    if (o.rayas) s += '<rect x="' + (x - 9) + '" y="' + (b - 36) + '" width="18" height="2.5" fill="#e5e7eb"/><rect x="' + (x - 9) + '" y="' + (b - 30) + '" width="18" height="2.5" fill="#e5e7eb"/>';
    if (o.roto) s += '<path d="M' + (x - 4) + ' ' + (b - 40) + 'l3 4l-2 3l4 4" stroke="' + C.tinta + '" stroke-width="1" fill="none"/>';
    if (o.carnet) s += '<line x1="' + (x - 3) + '" y1="' + (b - 46) + '" x2="' + x + '" y2="' + (b - 40) + '" stroke="#1d4ed8"/><line x1="' + (x + 3) + '" y1="' + (b - 46) + '" x2="' + x + '" y2="' + (b - 40) + '" stroke="#1d4ed8"/><rect x="' + (x - 4) + '" y="' + (b - 40) + '" width="8" height="10" fill="#fff" stroke="#1d4ed8"/><rect x="' + (x - 2.5) + '" y="' + (b - 38.5) + '" width="5" height="3.5" fill="#93c5fd"/>';
    s += '<rect x="' + (x - 13) + '" y="' + (b - 44) + '" width="4" height="17" rx="2" fill="' + cam + '"/><rect x="' + (x + 9) + '" y="' + (b - 44) + '" width="4" height="17" rx="2" fill="' + cam + '"/>';
    s += '<circle cx="' + x + '" cy="' + (b - 53) + '" r="7" fill="' + C.piel + '"/>';
    if (o.casco) s += '<path d="M' + (x - 8) + ' ' + (b - 54) + 'a8 8 0 0 1 16 0z" fill="' + C.amarillo + '"/><rect x="' + (x - 9.5) + '" y="' + (b - 55) + '" width="19" height="2" fill="#eab308"/>';
    if (o.careta) s += '<rect x="' + (x - 7) + '" y="' + (b - 54) + '" width="14" height="9" fill="none" stroke="#475569" stroke-width="1"/><path d="M' + (x - 7) + ' ' + (b - 51) + 'h14M' + (x - 7) + ' ' + (b - 48) + 'h14M' + (x - 3) + ' ' + (b - 54) + 'v9M' + (x + 1) + ' ' + (b - 54) + 'v9M' + (x + 5) + ' ' + (b - 54) + 'v9" stroke="#475569" stroke-width=".6"/>';
    if (o.gafas) s += '<rect x="' + (x - 6) + '" y="' + (b - 55) + '" width="12" height="3" rx="1.5" fill="#0ea5e9" opacity=".8"/>';
    if (o.auditivos) s += '<circle cx="' + (x - 7.5) + '" cy="' + (b - 53) + '" r="2.4" fill="#ef4444"/><circle cx="' + (x + 7.5) + '" cy="' + (b - 53) + '" r="2.4" fill="#ef4444"/>';
    return s;
}
// Guadaña en la mano derecha de la persona en x (hacia la derecha); guarda: protección del cabezal
function guadana(x, o) {
    o = o || {};
    var b = SUELO, s = '<line x1="' + (x + 11) + '" y1="' + (b - 30) + '" x2="' + (x + 34) + '" y2="' + (b - 4) + '" stroke="#475569" stroke-width="2.4"/>';
    s += '<rect x="' + (x + 6) + '" y="' + (b - 36) + '" width="10" height="7" rx="2" fill="' + C.naranja + '" stroke="' + C.tinta + '" stroke-width=".5"/>';
    if (o.guarda !== false) s += '<path d="M' + (x + 28) + ' ' + (b - 9) + 'q8 -4 12 3" stroke="' + C.tinta + '" stroke-width="2.5" fill="none"/>';
    else s += '<path d="M' + (x + 29) + ' ' + (b - 9) + 'l3 2l-2 2l4 1" stroke="#a16207" stroke-width="1.4" fill="none"/>';
    s += '<circle cx="' + (x + 35) + '" cy="' + (b - 3) + '" r="3" fill="' + C.tinta + '"/>';
    return s;
}
function cono(x, y) { y = y == null ? SUELO : y; return '<path d="M' + (x - 6) + ' ' + y + 'L' + x + ' ' + (y - 18) + 'L' + (x + 6) + ' ' + y + 'z" fill="' + C.naranja + '"/><path d="M' + (x - 3.5) + ' ' + (y - 7) + 'h7l-1 -4h-5z" fill="#fff"/><rect x="' + (x - 8) + '" y="' + (y - 2) + '" width="16" height="3" fill="' + C.naranja + '"/>'; }
function cinta(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + C.amarillo + '" stroke-width="3"/><line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + C.tinta + '" stroke-width="3" stroke-dasharray="4 5"/>'; }
function malla(x, w) {
    var y = SUELO - 40, s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="36" fill="' + C.naranja + '" fill-opacity=".22" stroke="' + C.naranja + '" stroke-width="2"/>', l = '';
    for (var k = x + 6; k < x + w; k += 6) l += 'M' + k + ' ' + y + 'v36';
    for (var j = y + 6; j < y + 36; j += 6) l += 'M' + x + ' ' + j + 'h' + w;
    s += '<path d="' + l + '" stroke="' + C.naranja + '" stroke-width=".6"/><rect x="' + x + '" y="' + (y + 14) + '" width="' + w + '" height="3" fill="#e5e7eb"/>';
    return s + '<circle cx="' + (x + 3) + '" cy="' + (SUELO - 2) + '" r="3" fill="' + C.tinta + '"/><circle cx="' + (x + w - 3) + '" cy="' + (SUELO - 2) + '" r="3" fill="' + C.tinta + '"/>';
}
function carro(x, color) {
    var b = SUELO + 4;
    return '<path d="M' + x + ' ' + (b - 8) + 'v-10l8 -2l8 -10h22l10 10l10 2v10z" fill="' + (color || '#2563eb') + '"/><path d="M' + (x + 18) + ' ' + (b - 20) + 'l6 -7h7v7zM' + (x + 34) + ' ' + (b - 20) + 'v-7h4l6 7z" fill="#bfdbfe"/>' +
        '<circle cx="' + (x + 13) + '" cy="' + (b - 7) + '" r="5" fill="' + C.tinta + '"/><circle cx="' + (x + 46) + '" cy="' + (b - 7) + '" r="5" fill="' + C.tinta + '"/>';
}
function sumidero(x) { var y = SUELO + 6; return '<rect x="' + x + '" y="' + y + '" width="26" height="10" fill="#374151"/><path d="M' + (x + 4) + ' ' + y + 'v10M' + (x + 9) + ' ' + y + 'v10M' + (x + 14) + ' ' + y + 'v10M' + (x + 19) + ' ' + y + 'v10M' + (x + 24) + ' ' + y + 'v10" stroke="#9ca3af"/>'; }
function lona(x, y) { y = y == null ? SUELO : y; return '<path d="M' + (x - 9) + ' ' + y + 'q-2 -16 9 -18q11 2 9 18z" fill="#e5e7eb" stroke="#6b7280"/><path d="M' + (x - 3) + ' ' + (y - 18) + 'l3 -4l3 4" stroke="#6b7280" fill="none"/><path d="M' + (x - 6) + ' ' + (y - 8) + 'h12" stroke="' + C.hoja + '" stroke-width="2"/>'; }
function botella(x, y, giro) { return '<g transform="rotate(' + (giro || 0) + ' ' + x + ' ' + y + ')"><rect x="' + (x - 6) + '" y="' + (y - 2.5) + '" width="10" height="5" rx="2" fill="#7dd3fc" stroke="#0369a1" stroke-width=".6"/><rect x="' + (x + 4) + '" y="' + (y - 1.2) + '" width="3" height="2.4" fill="#0369a1"/></g>'; }
function piedra(x, y, r) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (r || 4) + '" ry="' + ((r || 4) * 0.7) + '" fill="#9ca3af" stroke="#6b7280" stroke-width=".6"/>'; }
function recortes(x1, x2, y) { var d = ''; for (var x = x1; x < x2; x += 5) d += 'M' + x + ' ' + (y + (x % 3)) + 'l3 ' + (x % 2 ? -1 : 1); return '<path d="' + d + '" stroke="' + C.hoja + '" stroke-width="1.6" stroke-linecap="round"/>'; }
function texto(x, y, t, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" font-size="' + (o.tam || 9) + '" font-weight="' + (o.peso || 700) + '" fill="' + (o.color || C.tinta) + '" text-anchor="' + (o.ancla || 'middle') + '" font-family="Segoe UI, Arial, sans-serif">' + t + '</text>'; }
function cota(x1, x2, y, t, color) { color = color || C.tinta; return '<path d="M' + x1 + ' ' + y + 'H' + x2 + 'M' + x1 + ' ' + (y - 3) + 'v6M' + x2 + ' ' + (y - 3) + 'v6" stroke="' + color + '" stroke-width="1.2"/>' + texto((x1 + x2) / 2, y - 4, t, { color: color, tam: 9 }); }
function regla(x, cm) {
    var alto = 70, s = '<rect x="' + x + '" y="' + (SUELO - alto) + '" width="8" height="' + alto + '" fill="#fde68a" stroke="#a16207" stroke-width=".7"/>', d = '';
    for (var k = 0; k <= 14; k++) d += 'M' + x + ' ' + (SUELO - k * 5) + 'h' + (k % 5 ? 3 : 5);
    s += '<path d="' + d + '" stroke="#a16207" stroke-width=".7"/>';
    return s + '<line x1="' + (x - 3) + '" y1="' + (SUELO - cm * 5) + '" x2="' + (x + 11) + '" y2="' + (SUELO - cm * 5) + '" stroke="' + C.rojo + '" stroke-width="1.5"/>' + texto(x + 13, SUELO - cm * 5 + 3, cm + ' cm', { ancla: 'start', color: C.rojo });
}
function bidon(x, o) {
    o = o || {};
    var b = SUELO, s = '<path d="M' + (x - 12) + ' ' + b + 'v-26l6 -6h14l4 4v28z" fill="' + C.rojo + '"/><rect x="' + (x + 3) + '" y="' + (b - 36) + '" width="6" height="5" fill="' + C.tinta + '"/>';
    if (o.rotulo) s += '<rect x="' + (x - 8) + '" y="' + (b - 22) + '" width="13" height="13" transform="rotate(45 ' + (x - 1.5) + ' ' + (b - 15.5) + ')" fill="#fff"/><path d="M' + (x - 1.5) + ' ' + (b - 21) + 'q-4 5 0 9q4 -4 0 -9" fill="' + C.rojo + '"/>' + texto(x - 1.5, b - 4, '3', { tam: 6 });
    return s;
}
function hoja(x, y) { return '<rect x="' + x + '" y="' + y + '" width="18" height="24" fill="#fff" stroke="#64748b"/><path d="M' + (x + 3) + ' ' + (y + 6) + 'h12M' + (x + 3) + ' ' + (y + 10) + 'h12M' + (x + 3) + ' ' + (y + 14) + 'h9M' + (x + 3) + ' ' + (y + 18) + 'h12" stroke="#94a3b8"/>' + texto(x + 9, y + 4.5, 'HDS', { tam: 4.5 }); }
function abeja(x, y) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="3.5" ry="2.5" fill="' + C.amarillo + '" stroke="' + C.tinta + '" stroke-width=".7"/><path d="M' + (x - 1) + ' ' + (y - 2.5) + 'v5M' + (x + 1) + ' ' + (y - 2.5) + 'v5" stroke="' + C.tinta + '" stroke-width=".8"/><ellipse cx="' + (x - 1) + '" cy="' + (y - 4) + '" rx="2" ry="1.4" fill="#e0f2fe"/>'; }
function banderin(x, t) { return '<line x1="' + x + '" y1="' + SUELO + '" x2="' + x + '" y2="' + (SUELO - 34) + '" stroke="' + C.tinta + '" stroke-width="1.4"/><path d="M' + x + ' ' + (SUELO - 34) + 'h22l-5 6l5 6h-22z" fill="#2563eb"/>' + texto(x + 9, SUELO - 25, t, { color: '#fff', tam: 6.5 }); }
function vuelan(x, y) { return '<path d="M' + x + ' ' + y + 'l14 -8M' + x + ' ' + (y + 4) + 'l18 -2M' + (x - 2) + ' ' + (y - 3) + 'l10 -14" stroke="' + C.rojo + '" stroke-width="1.2" stroke-dasharray="2 2"/>' + piedra(x + 16, y - 9, 2) + piedra(x + 20, y + 1, 1.8); }
function prohibido(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="8" fill="#fff" stroke="' + C.rojo + '" stroke-width="2"/><line x1="' + (x - 5.5) + '" y1="' + (y - 5.5) + '" x2="' + (x + 5.5) + '" y2="' + (y + 5.5) + '" stroke="' + C.rojo + '" stroke-width="2"/>'; }

// Lienzo con el sello ✓ / ✗ en la esquina
function lienzo(contenido, bien, txt) {
    var sello = bien ? '<circle cx="186" cy="14" r="10" fill="#15803d"/><path d="M181 14l3.5 3.5l6.5 -7" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
        : '<circle cx="186" cy="14" r="10" fill="#dc2626"/><path d="M181.5 9.5l9 9M190.5 9.5l-9 9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 200 120" role="img" aria-label="' + (bien ? 'Bien: ' : 'Mal: ') + txt + '" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="120" fill="#eef6fb"/>' + contenido + sello + '</svg>';
}
function par(bienTxt, bienSvg, malTxt, malSvg) { return { bien: { txt: bienTxt, svg: lienzo(bienSvg, true, bienTxt) }, mal: { txt: malTxt, svg: lienzo(malSvg, false, malTxt) } }; }

// ---------- Un par por punto de la guía ----------
var DIBUJOS = {
    'limpieza-previa': par(
        'Lote limpio antes de cortar; lo recogido va a un punto accesible', suelo() + corto(4, 140) + anden(146, 54) + lona(168, SUELO - 6) + piedra(184, SUELO - 7, 4) + texto(172, SUELO + 20, 'acopio', { tam: 8 }),
        'Botellas y piedras trituradas entre el pasto cortado', suelo() + corto(4, 196) + botella(40, SUELO + 8, 20) + botella(120, SUELO + 14, -30) + piedra(80, SUELO + 10) + piedra(150, SUELO + 6, 3) + piedra(60, SUELO + 20, 3) + '<path d="M95 ' + (SUELO + 18) + 'l4 -3l3 4l4 -2" stroke="#0369a1" fill="none"/>' + persona(30) + guadana(30) + vuelan(70, SUELO - 8)),
    'afectacion-a-arboles': par(
        'Corteza sana: la guadaña no toca el tronco', suelo() + corto(4, 196) + arbol(100, { plateo: 26 }) + texto(150, 40, 'base sana', { color: '#15803d' }),
        'Corteza pelada en anillo a la altura de la guadaña', suelo() + corto(4, 196) + arbol(100, { herida: true, tutor: true }) + '<path d="M118 82l-10 4" stroke="' + C.rojo + '" stroke-width="1.4"/>' + texto(150, 80, 'anillado', { color: C.rojo }) + persona(40) + guadana(40)),
    'limpieza-manual-de-arboles': par(
        'Base del árbol limpia a mano antes de guadañar', suelo() + corto(4, 196) + arbol(110, { plateo: 18 }) + persona(60, { casco: true }) + '<path d="M73 66l20 18" stroke="#78350f" stroke-width="2"/><path d="M90 82l6 6l3 -5z" fill="#64748b"/>',
        'Pasto alto pegado al tronco y la guadaña rozando la corteza', suelo() + corto(4, 196) + arbol(110, { pastoAlto: true, herida: true }) + persona(55) + guadana(55)),
    'plateo': par(
        'Plateo de 60 cm o más, a mano y sin dañar raíces', suelo() + corto(4, 196) + arbol(100, { plateo: 40 }) + cota(60, 140, SUELO + 18, '≥ 60 cm', '#15803d'),
        'Plateo pequeño (30 cm), raíces cortadas con azadón', suelo() + corto(4, 196) + arbol(100, { plateo: 18 }) + '<path d="M86 ' + (SUELO + 4) + 'q-6 6 -14 4M114 ' + (SUELO + 4) + 'q8 5 14 2" stroke="#d6b48a" stroke-width="2" fill="none"/>' + cota(82, 118, SUELO + 22, '30 cm', C.rojo) +
            '<path d="M150 50l-14 40" stroke="#78350f" stroke-width="2.5"/><path d="M130 86l10 6l2 -8z" fill="#64748b"/>' + texto(156, 46, 'azadón', { color: C.rojo })),
    'corte-de-cesped-disparejo-altura': par(
        'Parejo entre 2 y 9 cm en todo el lote', suelo() + pasto(4, 196, function () { return 6; }, 3) + regla(100, 5) + texto(60, 30, 'medir en varios puntos', { tam: 8, peso: 600 }),
        'Mechones altos y «calvas» de tierra', suelo() + pasto(4, 196, function (x) { return x < 50 ? 18 : x < 70 ? 0 : x > 140 ? 14 : 5; }, 3) + '<rect x="52" y="' + SUELO + '" width="18" height="6" fill="' + C.tierra + '"/>' + texto(61, SUELO + 16, 'calva', { color: C.rojo, tam: 8 }) + regla(150, 12)),
    'bordeo': par(
        'Borde recto de máximo 5 cm; el andén queda limpio', suelo(0, 120) + corto(4, 112) + '<rect x="120" y="' + SUELO + '" width="6" height="28" fill="' + C.tierra + '"/>' + anden(126, 74) + cota(116, 130, SUELO - 12, '≤ 5 cm', '#15803d'),
        'Bordeo ancho que socava el andén y borde amarillo por herbicida', suelo(0, 100) + corto(4, 92) + '<rect x="94" y="' + SUELO + '" width="8" height="28" fill="' + C.amarillo + '"/><rect x="102" y="' + SUELO + '" width="24" height="28" fill="' + C.tierra + '"/>' + anden(126, 74) + '<path d="M126 ' + (SUELO + 6) + 'l6 4l-6 4z" fill="' + C.tierra + '"/>' + cota(94, 126, SUELO - 12, '15 cm', C.rojo) + texto(60, 40, 'herbicida', { color: '#a16207' })),
    'recoleccion-y-disposicion-de-residuos': par(
        'Lonas amarradas, con cinta reflectiva y lejos del sumidero', suelo(0, 120) + corto(4, 116) + anden(120, 80) + lona(40) + lona(60) + lona(80) + cinta(26, SUELO - 22, 96, SUELO - 22) + cono(24) + cono(98) + sumidero(170),
        'Lonas junto al sumidero y pasto que rueda a la cuneta', suelo(0, 120) + corto(4, 116) + anden(120, 80) + lona(150, SUELO - 6) + lona(170, SUELO - 6) + sumidero(150) + recortes(140, 186, SUELO + 8) + texto(100, 30, 'sin cinta · junto al sumidero', { color: C.rojo, tam: 8 })),
    'barrido-de-lote-y-zonas-duras': par(
        'Andén y calzada barridos al terminar', suelo(0, 80) + corto(4, 76) + anden(80, 50) + via(130, 70) + persona(105, { casco: true }) + '<path d="M115 66l14 26" stroke="#78350f" stroke-width="2"/><path d="M124 90h12l-3 4h-7z" fill="#a16207"/>',
        'Pasto cortado sobre el andén y la calzada', suelo(0, 80) + corto(4, 76) + anden(80, 50) + via(130, 70) + recortes(84, 196, SUELO - 2) + recortes(90, 190, SUELO + 8) + recortes(140, 196, SUELO + 18)),
    'sectores-sin-intervenir': par(
        'Todo cortado; lo que no se pudo (abejas) va como novedad', suelo() + corto(4, 196) + '<rect x="140" y="' + (SUELO - 2) + '" width="50" height="4" fill="none"/>' + pasto(146, 190, function () { return 16; }, 3) + banderin(140, 'NOV.') + abeja(170, 62) + abeja(182, 56),
        'Una esquina sin cortar y sin novedad reportada', suelo() + corto(4, 130) + pasto(134, 196, function (x) { return 18 + (x % 3) * 3; }, 3) + '<rect x="132" y="50" width="66" height="44" fill="none" stroke="' + C.rojo + '" stroke-width="1.5" stroke-dasharray="4 3"/>' + texto(165, 44, 'sin cortar', { color: C.rojo, tam: 8 })),
    'implementacion-y-estado-del-pmt': par(
        'Conos antes del área y paletero con PARE / SIGA', via(0, 120) + suelo(120, 80) + corto(124, 196) + cono(70) + cono(88) + cono(106) + persona(40, { casco: true, rayas: true }) +
            '<line x1="52" y1="70" x2="52" y2="46" stroke="' + C.tinta + '" stroke-width="1.6"/><polygon points="47,36 57,36 60,40 60,46 57,50 47,50 44,46 44,40" fill="' + C.rojo + '"/>' + texto(52, 46, 'PARE', { color: '#fff', tam: 5 }) + persona(160, { casco: true }) + guadana(160),
        'Cuadrilla en el separador sin conos ni paletero', via(0, 70) + suelo(70, 60) + corto(74, 126) + via(130, 70) + carro(4, '#2563eb') + carro(136, '#7c3aed') + persona(96, { casco: true }) + guadana(92)),
    'valla-informativa': par(
        'Valla visible al frente del área de trabajo', suelo() + corto(4, 196) + '<rect x="30" y="30" width="70" height="40" fill="#fff" stroke="#15803d" stroke-width="2"/><rect x="30" y="30" width="70" height="10" fill="#15803d"/>' + texto(65, 38, 'CORTE DE CÉSPED', { color: '#fff', tam: 6 }) + texto(65, 52, 'Trabajos en', { tam: 7, peso: 600 }) + texto(65, 62, 'zona verde', { tam: 7, peso: 600 }) +
            '<path d="M38 70v22M92 70v22" stroke="' + C.tinta + '" stroke-width="2"/>' + persona(150, { casco: true }) + guadana(150),
        'Sin valla, o tirada en el piso', suelo() + corto(4, 196) + '<g transform="rotate(-6 60 90)"><rect x="30" y="86" width="60" height="10" fill="#fff" stroke="#94a3b8"/></g>' + carro(18, '#64748b') + persona(150, { casco: true }) + guadana(150) + texto(60, 40, '¿valla?', { color: C.rojo })),
    'malla-s-de-proteccion': par(
        'Malla entre la guadaña y los carros, rodando con el guadañador', suelo(0, 130) + corto(4, 126) + anden(130, 70) + carro(138, '#2563eb') + persona(50, { casco: true, careta: true }) + guadana(50) + malla(96, 30),
        'Guadañador frente a carros sin malla: piedras al vidrio', suelo(0, 130) + corto(4, 126) + anden(130, 70) + carro(138, '#2563eb') + persona(60, { casco: true, careta: true }) + guadana(60) + vuelan(100, SUELO - 10) +
            '<path d="M160 70l4 3l-3 3l5 2" stroke="' + C.rojo + '" stroke-width="1.2" fill="none"/>'),
    'demarcacion-del-area-de-trabajo': par(
        'Cinta y conos encierran el frente; el peatón pasa por fuera', suelo() + corto(4, 196) + cono(20) + cono(130) + cinta(20, SUELO - 14, 130, SUELO - 14) + persona(70, { casco: true }) + guadana(70) + persona(170, { camisa: '#60a5fa' }),
        'Peatón caminando junto al guadañador, sin cinta ni conos', suelo() + corto(4, 196) + persona(70, { casco: true }) + guadana(70) + persona(130, { camisa: '#60a5fa' }) + vuelan(108, SUELO - 6)),
    'carnet': par(
        'Carnet colgado a la vista, con foto y nombre', suelo() + corto(4, 196) + persona(100, { casco: true, carnet: true, rayas: true }) + '<circle cx="100" cy="47" r="14" fill="none" stroke="#15803d" stroke-width="1.5"/>',
        'Sin carnet visible', suelo() + corto(4, 196) + persona(100, { casco: true, rayas: true }) + '<circle cx="100" cy="57" r="14" fill="none" stroke="' + C.rojo + '" stroke-width="1.5" stroke-dasharray="3 2"/>' + texto(130, 50, '¿carnet?', { color: C.rojo, ancla: 'start' })),
    'estado-de-dotacion': par(
        'Uniforme completo, con el distintivo y en buen estado', suelo() + corto(4, 196) + persona(70, { casco: true, rayas: true }) + persona(130, { casco: true, rayas: true }),
        'Camiseta particular o uniforme roto y desteñido', suelo() + corto(4, 196) + persona(70, { camisa: '#3b82f6' }) + persona(130, { camisa: '#fdba74', roto: true }) + texto(70, 26, 'particular', { color: C.rojo, tam: 8 }) + texto(130, 26, 'roto', { color: C.rojo, tam: 8 })),
    'epp': par(
        'Casco, careta, gafas, auditivos, canilleras y botas', suelo() + corto(4, 196) + persona(80, { casco: true, careta: true, gafas: true, auditivos: true, canilleras: true, rayas: true }) + guadana(80) +
            texto(128, 30, 'careta + gafas', { tam: 7, ancla: 'start', color: '#15803d' }) + texto(128, 76, 'canilleras', { tam: 7, ancla: 'start', color: '#15803d' }),
        'Sin careta ni gafas, sin canilleras y en tenis', suelo() + corto(4, 196) + persona(80, { botas: 'tenis', rayas: true }) + guadana(80) + vuelan(118, SUELO - 4) + texto(150, 30, 'cara expuesta', { tam: 7, color: C.rojo }) + texto(66, 86, 'tenis', { tam: 7, color: C.rojo, ancla: 'end' })),
    'herramientas': par(
        'Guadaña con guarda, rastrillo y escoba en buen estado', suelo() + corto(4, 196) + persona(50, { casco: true, careta: true }) + guadana(50) +
            '<path d="M130 40v52" stroke="#78350f" stroke-width="2.5"/><path d="M120 40h20M122 40v6M126 40v6M130 40v6M134 40v6M138 40v6" stroke="#64748b" stroke-width="1.6"/><path d="M165 36v50" stroke="#78350f" stroke-width="2.5"/><path d="M158 86h14l-2 6h-10z" fill="#a16207"/>',
        'Guadaña sin guarda (amarrada con alambre) y rastrillo roto', suelo() + corto(4, 196) + persona(50, { casco: true, careta: true }) + guadana(50, { guarda: false }) + texto(96, 58, 'sin guarda', { tam: 7, color: C.rojo, ancla: 'start' }) +
            '<path d="M140 44v48" stroke="#78350f" stroke-width="2.5"/><path d="M130 44h10M132 44v6M136 44v6" stroke="#64748b" stroke-width="1.6"/><path d="M142 44l6 4" stroke="#64748b" stroke-width="1.6"/>'),
    'rotulacion-de-recipientes': par(
        'Bidón para combustible, rotulado y con su hoja de seguridad', anden(0, 200) + bidon(80, { rotulo: true }) + hoja(110, SUELO - 30) + texto(80, 40, 'inflamable', { tam: 8, color: '#15803d' }),
        'Gasolina en una botella de gaseosa, sin rótulo', anden(0, 200) + '<path d="M90 ' + SUELO + 'v-28q0 -6 4 -8v-6h8v6q4 2 4 8v28z" fill="#fde047" fill-opacity=".85" stroke="#a16207"/><rect x="90" y="' + (SUELO - 20) + '" width="16" height="7" fill="#ef4444"/>' + texto(98, 30, 'sin rótulo', { color: C.rojo, tam: 8 })),
    'manejo-de-combustible': par(
        'Tanqueo en zona dura, con embudo, kit de derrames y guadaña apagada', anden(0, 200) + bidon(60, { rotulo: true }) + '<rect x="120" y="' + (SUELO - 24) + '" width="34" height="20" rx="2" fill="#facc15" stroke="#a16207"/>' + texto(137, SUELO - 11, 'KIT', { tam: 8 }) + texto(137, 30, 'kit de derrames', { tam: 7, color: '#15803d' }),
        'Galón de gasolina en la cabina junto a los operarios', suelo() + '<path d="M20 ' + (SUELO - 2) + 'v-46h70l20 22v24z" fill="#e2e8f0" stroke="#475569"/><path d="M90 ' + (SUELO - 46) + 'l18 20h-18z" fill="#bfdbfe"/>' +
            '<circle cx="45" cy="56" r="7" fill="' + C.piel + '"/><rect x="37" y="63" width="16" height="20" rx="3" fill="' + C.naranja + '"/><circle cx="74" cy="56" r="7" fill="' + C.piel + '"/><rect x="66" y="63" width="16" height="20" rx="3" fill="' + C.naranja + '"/>' +
            '<path d="M54 84v-12l3 -3h7l2 2v13z" fill="' + C.rojo + '" stroke="#7f1d1d" stroke-width=".6"/>' + '<circle cx="34" cy="96" r="7" fill="' + C.tinta + '"/><circle cx="92" cy="96" r="7" fill="' + C.tinta + '"/>' + prohibido(150, 50) + texto(150, 76, 'combustible', { tam: 7, color: C.rojo }) + texto(150, 85, 'con el personal', { tam: 7, color: C.rojo })),
};

export function dibujoDe(clave) { return DIBUJOS[slug(clave)] || null; }
export function clavesConDibujo() { return Object.keys(DIBUJOS); }
