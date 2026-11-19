// PDF del documento de descuento (formato GD-FR-016, como «DESCUENTO POR CERRAMIENTO MICRORRUTA Z6CC0153 - 1027»):
// título, texto, «Información de base de datos del servicio» (tabla de áreas), localización de cada lote con la imagen del
// área actual y la del área para descontar, y el registro fotográfico de cada lote. Hoja carta.
// El membrete (logos) lo pone cada usuario en su equipo, como en Requerimientos: no está en el repositorio.
// pdf-lib se carga solo al generar. Funciona igual en el navegador y en Node (pruebas).
import { limpiar, partir } from '../requerimiento/pdf.js';
import { areaFila, areaActualizada, m2, totales, pieFotos } from './descuentos.js';

var CARTA = [612, 792];
var TINTA = [0.08, 0.1, 0.12], GRIS_CAB = [0.78, 0.79, 0.8], BORDE = [0.2, 0.2, 0.2];

// d: el descuento (con sus textos ya escritos); opciones: { membrete: { bytes, tipo },
//   imagenes: { [i]: { actual: { bytes, tipo }, descontar: { bytes, tipo } } }, fotos: { [i]: [{ bytes, tipo, pie }] } }
export async function armarPdfDescuento(d, opciones) {
    opciones = opciones || {};
    var { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    var pdf = await PDFDocument.create();
    pdf.setTitle(limpiar(d.textos.titulo || 'Descuento'));
    pdf.setAuthor('Interventoría');
    var normal = await pdf.embedFont(StandardFonts.Helvetica), negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    var col = function (c) { return rgb(c[0], c[1], c[2]); };
    var incrustar = async function (im) {
        if (!im || !im.bytes) return null;
        try { return im.tipo === 'png' ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes); } catch (e) { return null; }
    };
    var membrete = await incrustar(opciones.membrete);
    var M = { izq: 62, der: 62, arriba: membrete ? 120 : 58, abajo: membrete ? 120 : 56 };
    var ANCHO = CARTA[0] - M.izq - M.der, pag = null, y = 0;

    function nueva() {
        pag = pdf.addPage(CARTA);
        if (membrete) pag.drawImage(membrete, { x: 0, y: 0, width: CARTA[0], height: CARTA[1] });
        y = CARTA[1] - M.arriba;
    }
    function espacio(h) { if (y - h < M.abajo) nueva(); }
    function texto(t, x, yy, o) { o = o || {}; pag.drawText(limpiar(t), { x: x, y: yy, size: o.tam || 11, font: o.letra || normal, color: col(TINTA) }); }
    function centrado(t, x, ancho, yy, o) { o = o || {}; var w = (o.letra || normal).widthOfTextAtSize(limpiar(t), o.tam || 11); texto(t, x + (ancho - w) / 2, yy, o); }
    function parrafo(t, o) {
        o = o || {};
        var tam = o.tam || 11, letra = o.letra || normal, x0 = M.izq + (o.sangria || 0), ancho = ANCHO - (o.sangria || 0), alto = tam * 1.3;
        limpiar(t).split('\n').forEach(function (p) {
            var lin = partir(p, letra, tam, ancho);
            lin.forEach(function (l, i) {
                espacio(alto);
                var palabras = l.split(' ');
                if (i < lin.length - 1 && palabras.length > 1) {
                    var libre = ancho - palabras.reduce(function (s, w) { return s + letra.widthOfTextAtSize(w, tam); }, 0), hueco = libre / (palabras.length - 1), x = x0;
                    palabras.forEach(function (w) { texto(w, x, y - tam, { tam: tam, letra: letra }); x += letra.widthOfTextAtSize(w, tam) + hueco; });
                } else texto(l, x0, y - tam, { tam: tam, letra: letra });
                y -= alto;
            });
        });
        y -= o.despues != null ? o.despues : 4;
    }
    function vineta(t) {
        var lin = partir(t, negrita, 11, ANCHO - 30);
        espacio(lin.length * 14 + 8);
        pag.drawCircle({ x: M.izq + 14, y: y - 7, size: 2.4, color: col(TINTA) });
        lin.forEach(function (l, i) { texto(l, M.izq + 26, y - 11 - i * 14, { letra: negrita }); });
        y -= lin.length * 14 + 8;
    }
    function caja(x, yy, w, h, relleno) {
        pag.drawRectangle({ x: x, y: yy - h, width: w, height: h, color: relleno ? col(relleno) : undefined, borderColor: col(BORDE), borderWidth: 0.8 });
    }
    // Imagen dentro de un recuadro, sin deformarla y centrada
    function imagen(im, x, yy, w, h) {
        var e = Math.min(w / im.width, h / im.height), iw = im.width * e, ih = im.height * e;
        pag.drawImage(im, { x: x + (w - iw) / 2, y: yy - h + (h - ih) / 2, width: iw, height: ih });
    }

    nueva();
    // Título
    partir(d.textos.titulo, negrita, 12, ANCHO).forEach(function (l) { espacio(16); centrado(l, M.izq, ANCHO, y - 12, { tam: 12, letra: negrita }); y -= 16; });
    y -= 10;
    parrafo(d.textos.intro, { despues: 0 });
    parrafo(d.textos.conclusion, { despues: 8 });

    // Tabla de áreas
    vineta('Información de base de datos del servicio');
    var cols = [{ t: 'MICRORRUTA', w: 0.2 }, { t: 'LOTE', w: 0.15 }, { t: 'ÁREA BASE DATOS m²', w: 0.21 }, { t: 'ÁREA A DESCONTAR m²', w: 0.22 }, { t: 'ÁREA ACTUALIZADA m²', w: 0.22 }]
        .map(function (c) { return { t: c.t, w: c.w * ANCHO }; });
    function filaTabla(valores, cab, extra) {
        var tam = cab ? 10.5 : 11, letra = cab || extra ? negrita : normal;
        var lineas = cols.map(function (c, i) { return partir(valores[i], letra, tam, c.w - 10); });
        var h = Math.max.apply(null, lineas.map(function (l) { return l.length; })) * tam * 1.2 + (cab ? 12 : 22);
        if (!cab && y - h < M.abajo) { nueva(); filaTabla(cols.map(function (c) { return c.t; }), true); }
        espacio(cab ? h * 2.2 : h);
        var x = M.izq;
        cols.forEach(function (c, i) {
            caja(x, y, c.w, h, cab ? GRIS_CAB : null);
            var lin = lineas[i], alto = lin.length * tam * 1.2, y0 = y - (h - alto) / 2 - tam;
            lin.forEach(function (l, k) { centrado(l, x, c.w, y0 - k * tam * 1.2, { tam: tam, letra: letra }); });
            x += c.w;
        });
        y -= h;
    }
    filaTabla(cols.map(function (c) { return c.t; }), true);
    d.filas.forEach(function (f) { filaTabla([f.mr, f.lote || '—', m2(f.areaBase), m2(areaFila(f)), m2(areaActualizada(f))]); });
    if (d.filas.length > 1) { var t = totales(d.filas); filaTabla(['TOTAL', '', m2(t.base), m2(t.descontar), m2(t.actualizada)], false, true); }
    y -= 18;

    // Localización de cada lote: texto a la izquierda; a la derecha, área actual y área para descontar
    espacio(30 + 8 + 2 * (18 + 165 + 8));   // el título no queda solo al final de una página
    vineta(d.textos.localizacion);
    for (var i = 0; i < d.filas.length; i++) {
        var f = d.filas[i], ims = (opciones.imagenes || {})[i] || {};
        var actual = await incrustar(ims.actual), descontar = await incrustar(ims.descontar);
        var izq = ANCHO * 0.42, der = ANCHO - izq, alto = 8 + 2 * (18 + 165 + 8);
        espacio(alto + 4);
        caja(M.izq, y, izq, alto); caja(M.izq + izq, y, der, alto);
        var sitio = (d.filas.length > 1 ? f.mr + (f.lote ? ' - ' + f.lote : '') + '\n' : '') + d.textos.sitio;
        var lin = [];
        limpiar(sitio).split('\n').forEach(function (p, k) { if (k) lin.push(''); lin = lin.concat(partir(p, normal, 11, izq - 16)); });
        var yt = y - (alto - lin.length * 14.5) / 2 - 11;
        lin.forEach(function (l, k) { texto(l, M.izq + 8, yt - k * 14.5, { letra: d.filas.length > 1 && k === 0 ? negrita : normal }); });
        var xi = M.izq + izq, yy = y - 8;
        [['Área actual:', actual], ['Área para descontar:', descontar]].forEach(function (par) {
            centrado(par[0], xi, der, yy - 10, { tam: 10, letra: negrita });
            yy -= 18;
            if (par[1]) imagen(par[1], xi + 8, yy, der - 16, 165);
            else centrado('(sin imagen)', xi, der, yy - 85, { tam: 9 });
            yy -= 165 + 8;
        });
        y -= alto + 14;
    }

    // Registro fotográfico de cada lote (dos fotos por página, como el documento)
    for (i = 0; i < d.filas.length; i++) {
        var fotos = ((opciones.fotos || {})[i] || []).filter(function (x) { return x && x.bytes; });
        if (!fotos.length) continue;
        espacio(40 + 250);
        y -= 10;
        centrado(pieFotos(d.filas[i]), M.izq, ANCHO, y - 12, { tam: 12, letra: negrita });
        y -= 26;
        for (var k = 0; k < fotos.length; k++) {
            var im = await incrustar(fotos[k]);
            if (!im) continue;
            var pie = fotos[k].pie ? partir(fotos[k].pie, normal, 9.5, ANCHO * 0.72 - 16) : [];
            var hf = 240, hc = hf + 16 + (pie.length ? pie.length * 12 + 6 : 0), wc = ANCHO * 0.72, xc = M.izq + (ANCHO - wc) / 2;
            espacio(hc + 10);
            caja(xc, y, wc, hc);
            imagen(im, xc + 8, y - 8, wc - 16, hf);
            pie.forEach(function (l, n) { centrado(l, xc, wc, y - 8 - hf - 14 - n * 12, { tam: 9.5 }); });
            y -= hc + 12;
        }
    }
    return await pdf.save();
}
