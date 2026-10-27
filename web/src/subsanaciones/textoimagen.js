// Texto a imagen (menú Más): lo que se escribe queda en una imagen PNG para guardarla en el celular o compartirla.
// Se dibuja en un canvas de 1080 px de ancho (el de WhatsApp e Instagram); el alto crece con el texto.

export var ESTILOS = {
    blanco: { nombre: 'Blanco', fondo: '#ffffff', tinta: '#1f2937', acento: '#167a55', suave: '#64748b' },
    verde: { nombre: 'Verde', fondo: '#167a55', tinta: '#ffffff', acento: '#d7f0e4', suave: '#c9eadb' },
    nota: { nombre: 'Nota', fondo: '#fff7c2', tinta: '#3f3a1d', acento: '#b45309', suave: '#857a45' },
    oscuro: { nombre: 'Oscuro', fondo: '#1f2937', tinta: '#f8fafc', acento: '#6ee7b7', suave: '#94a3b8' },
};
var ANCHO = 1080, MARGEN = 80, LETRA = '"Segoe UI", Roboto, Arial, sans-serif';

// Renglones que caben en el ancho, respetando los saltos de línea; una palabra muy larga se parte
function renglones(ctx, texto, ancho) {
    var out = [];
    String(texto || '').split('\n').forEach(function (parrafo) {
        var linea = '';
        parrafo.split(/(\s+)/).forEach(function (pal) {
            if (!pal || (!linea && !pal.trim())) return;
            if (ctx.measureText(linea + pal).width <= ancho) { linea += pal; return; }
            if (linea.trim()) out.push(linea.replace(/\s+$/, ''));
            linea = '';
            if (!pal.trim()) return;
            // Una sola palabra más ancha que el renglón: se parte letra por letra
            while (ctx.measureText(pal).width > ancho && pal.length > 1) {
                var k = pal.length - 1;
                while (k > 1 && ctx.measureText(pal.slice(0, k)).width > ancho) k--;
                out.push(pal.slice(0, k));
                pal = pal.slice(k);
            }
            linea = pal;
        });
        out.push(linea.replace(/\s+$/, ''));
    });
    return out;
}

// Letra más grande (de 240 a 48 px) con la que el texto cabe sin partir palabras y sin pasar del alto máximo:
// "120" sale enorme y un párrafo largo baja hasta que quepa
var MAYOR = 240, MENOR = 48, ALTO_MAX = 1200, INTERLINEA = 1.2;
function medidaLetra(ctx, texto, util) {
    var palabras = String(texto).split(/\s+/).filter(Boolean);
    for (var t = MAYOR; t > MENOR; t -= 4) {
        ctx.font = '700 ' + t + 'px ' + LETRA;
        if (palabras.some(function (p) { return ctx.measureText(p).width > util; })) continue;
        if (renglones(ctx, texto, util).length * t * INTERLINEA <= ALTO_MAX) return t;
    }
    return MENOR;
}

// Dibuja en el canvas un solo texto, centrado y grande: { texto, estilo, pie } (pie: texto pequeño abajo, como la fecha)
export function dibujar(cv, o) {
    var e = ESTILOS[o.estilo] || ESTILOS.blanco, ctx = cv.getContext('2d');
    var util = ANCHO - 2 * MARGEN, tP = 30, hP = o.pie ? tP * 2 : 0;
    var t = medidaLetra(ctx, o.texto || '', util);
    ctx.font = '700 ' + t + 'px ' + LETRA;
    var lineas = renglones(ctx, o.texto || '', util), hX = lineas.length * t * INTERLINEA;
    var alto = Math.max(Math.round(ANCHO * 0.56), Math.ceil(16 + MARGEN + hX + MARGEN + hP));
    cv.width = ANCHO; cv.height = alto;

    ctx.fillStyle = e.fondo; ctx.fillRect(0, 0, ANCHO, alto);
    ctx.fillStyle = e.acento; ctx.fillRect(0, 0, ANCHO, 16);
    // El bloque de texto en el centro del espacio que queda entre la franja de arriba y la fecha
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.estilo === 'blanco' || o.estilo === 'nota' ? e.acento : e.tinta;
    ctx.font = '700 ' + t + 'px ' + LETRA;
    var y = 16 + (alto - 16 - hP - hX) / 2 + t * INTERLINEA / 2;
    lineas.forEach(function (l) { ctx.fillText(l, ANCHO / 2, y); y += t * INTERLINEA; });
    if (o.pie) {
        ctx.fillStyle = e.suave;
        ctx.font = '400 ' + tP + 'px ' + LETRA;
        ctx.fillText(o.pie, ANCHO / 2, alto - MARGEN * 0.6 - tP / 2);
    }
    return cv;
}

function dos(n) { return ('0' + n).slice(-2); }
export function pieFecha(d) {
    var h = d.getHours();
    return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + '/' + d.getFullYear() + ' · ' + (h % 12 || 12) + ':' + dos(d.getMinutes()) + (h < 12 ? ' a. m.' : ' p. m.');
}

// Archivo PNG listo para guardar o compartir: nota_aaaa-mm-dd_hh-mm.png
export function aArchivo(cv) {
    var d = new Date();
    return new Promise(function (ok, mal) {
        cv.toBlob(function (b) {
            if (!b) return mal(new Error('el celular no pudo armar la imagen'));
            ok(new File([b], 'nota_' + d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + '_' + dos(d.getHours()) + '-' + dos(d.getMinutes()) + '.png', { type: 'image/png' }));
        }, 'image/png');
    });
}
