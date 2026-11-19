// PDF del documento de descuento (formato GD-FR-016, como «DESCUENTO POR CERRAMIENTO MICRORRUTA Z6CC0153 - 1027»):
// título, texto, «Información de base de datos del servicio» (tabla de áreas), localización de cada lote con la imagen del
// área actual y la del área para descontar, y el registro fotográfico de cada lote. Hoja carta.
// El membrete sale del Word de la institución que el usuario sube en su equipo (formato.js: imagen de fondo y cuadros de
// texto del pie, con sus márgenes y su letra) o, si no hay, de la imagen de membrete de Requerimientos. No está en el repositorio.
// pdf-lib se carga solo al generar. Funciona igual en el navegador y en Node (pruebas).
import { limpiar, partir } from '../requerimiento/pdf.js';
import { areaFila, areaActualizada, m2, totales, pieFotos } from './descuentos.js';

var TINTA = [0.08, 0.1, 0.12], GRIS_CAB = [0.8, 0.8, 0.8], BORDE = [0.15, 0.15, 0.15];

// d: el descuento (con sus textos ya escritos); opciones:
//   formato: el resultado de membreteDeFormato() (lo mejor: igual al Word) · membrete: { bytes, tipo } (imagen de hoja carta)
//   imagenes: { [i]: { actual: { bytes, tipo }, descontar: { bytes, tipo } } } · fotos: { [i]: [{ bytes, tipo, pie }] }
export async function armarPdfDescuento(d, opciones) {
    opciones = opciones || {};
    var { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    var pdf = await PDFDocument.create();
    pdf.setTitle(limpiar(d.textos.titulo || 'Descuento'));
    pdf.setAuthor('Interventoría');
    var normal = await pdf.embedFont(StandardFonts.Helvetica), negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    var col = function (c) { return rgb(c[0], c[1], c[2]); };
    var hex = function (h) { h = String(h || '000000'); return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255); };
    var incrustar = async function (im) {
        if (!im || !im.bytes) return null;
        try { return im.tipo === 'png' ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes); } catch (e) {
            try { return im.tipo === 'png' ? await pdf.embedJpg(im.bytes) : await pdf.embedPng(im.bytes); } catch (e2) { return null; }
        }
    };
    var F = opciones.formato || null, fondo = F && F.fondo ? await incrustar(F.fondo) : null;
    var membrete = !fondo ? await incrustar(opciones.membrete) : null;
    var PAG = F ? F.pagina : [612, 792];
    // Márgenes: los del Word; con la imagen de membrete, la franja de los logos arriba y abajo
    var M = F ? { izq: F.margenes.izq, der: F.margenes.der, arriba: F.margenes.arriba, abajo: F.margenes.abajo }
        : { izq: 62, der: 62, arriba: membrete ? 120 : 58, abajo: membrete ? 120 : 56 };
    var TAM = F && F.tam ? Math.min(14, Math.max(9, F.tam)) : 12, ALTO = TAM * 1.22;
    var ANCHO = PAG[0] - M.izq - M.der, pag = null, y = 0;

    function nueva() {
        pag = pdf.addPage(PAG);
        if (fondo) pag.drawImage(fondo, { x: F.fondo.x, y: PAG[1] - F.fondo.y - F.fondo.h, width: F.fondo.w, height: F.fondo.h });
        else if (membrete) pag.drawImage(membrete, { x: 0, y: 0, width: PAG[0], height: PAG[1] });
        // Cuadros de texto del encabezado y el pie del Word (p. ej. «Código: GD-FR-016 · Versión: 14 · Fecha: …»)
        if (F) F.textos.forEach(function (t) {
            t.lineas.forEach(function (l, k) {
                pag.drawText(limpiar(l), { x: t.x + 7.2, y: PAG[1] - t.y - 3.6 - t.tam * 1.05 - k * t.tam * 1.2, size: t.tam, font: normal, color: hex(t.color) });
            });
        });
        y = PAG[1] - M.arriba;
    }
    function espacio(h) { if (y - h < M.abajo) nueva(); }
    function texto(t, x, yy, o) { o = o || {}; pag.drawText(limpiar(t), { x: x, y: yy, size: o.tam || TAM, font: o.letra || normal, color: col(TINTA) }); }
    function centrado(t, x, ancho, yy, o) { o = o || {}; var w = (o.letra || normal).widthOfTextAtSize(limpiar(t), o.tam || TAM); texto(t, x + (ancho - w) / 2, yy, o); }
    // Un renglón: justificado (repartiendo el espacio entre palabras) o a la izquierda
    function renglon(l, x0, ancho, yy, tam, letra, justificar) {
        var palabras = l.split(' ');
        if (justificar && palabras.length > 1 && l) {
            var libre = ancho - palabras.reduce(function (s, w) { return s + letra.widthOfTextAtSize(w, tam); }, 0), hueco = libre / (palabras.length - 1), x = x0;
            palabras.forEach(function (w) { texto(w, x, yy, { tam: tam, letra: letra }); x += letra.widthOfTextAtSize(w, tam) + hueco; });
        } else texto(l, x0, yy, { tam: tam, letra: letra });
    }
    // Renglones justificados (el último de cada párrafo a la izquierda) dentro de un ancho
    function justificado(lin, x0, ancho, yInicio, tam, letra, alto) {
        lin.forEach(function (l, i) { renglon(l, x0, ancho, yInicio - i * alto, tam, letra, i < lin.length - 1); });
    }
    function parrafo(t, o) {
        o = o || {};
        var letra = o.letra || normal;
        limpiar(t).split('\n').forEach(function (p) {
            var lin = partir(p, letra, TAM, ANCHO);
            lin.forEach(function (l, i) { espacio(ALTO); renglon(l, M.izq, ANCHO, y - TAM, TAM, letra, i < lin.length - 1); y -= ALTO; });
        });
        y -= o.despues != null ? o.despues : 0;
    }
    function vineta(t) {
        var lin = partir(t, negrita, TAM, ANCHO - 40);
        espacio(lin.length * ALTO + 10);
        pag.drawCircle({ x: M.izq + 22, y: y - TAM * 0.62, size: 2.6, color: col(TINTA) });
        lin.forEach(function (l, i) { texto(l, M.izq + 40, y - TAM - i * ALTO, { letra: negrita }); });
        y -= lin.length * ALTO + 10;
    }
    function caja(x, yy, w, h, relleno) {
        pag.drawRectangle({ x: x, y: yy - h, width: w, height: h, color: relleno ? col(relleno) : undefined, borderColor: col(BORDE), borderWidth: 0.75 });
    }
    // Imagen dentro de un recuadro, sin deformarla y centrada
    function imagen(im, x, yy, w, h) {
        var e = Math.min(w / im.width, h / im.height), iw = im.width * e, ih = im.height * e;
        pag.drawImage(im, { x: x + (w - iw) / 2, y: yy - h + (h - ih) / 2, width: iw, height: ih });
    }

    nueva();
    // Título
    partir(d.textos.titulo, negrita, TAM, ANCHO).forEach(function (l) { espacio(ALTO + 4); centrado(l, M.izq, ANCHO, y - TAM, { letra: negrita }); y -= ALTO + 2; });
    y -= 12;
    parrafo(d.textos.intro);
    parrafo(d.textos.conclusion, { despues: 4 });

    // Tabla de áreas
    vineta('Información de base de datos del servicio');
    var cols = [{ t: 'MICRORRUTA', w: 0.19 }, { t: 'LOTE', w: 0.13 }, { t: 'ÁREA BASE DATOS m²', w: 0.2 }, { t: 'ÁREA A DESCONTAR m²', w: 0.23 }, { t: 'ÁREA ACTUALIZADA m²', w: 0.25 }]
        .map(function (c) { return { t: c.t, w: c.w * ANCHO }; });
    function filaTabla(valores, cab, extra) {
        var tam = cab ? TAM - 0.5 : TAM, letra = cab || extra ? negrita : normal;
        var lineas = cols.map(function (c, i) { return partir(valores[i], letra, tam, c.w - 8); });
        var h = Math.max.apply(null, lineas.map(function (l) { return l.length; })) * tam * 1.15 + (cab ? 8 : 26);
        if (!cab && y - h < M.abajo) { nueva(); filaTabla(cols.map(function (c) { return c.t; }), true); }
        espacio(cab ? h * 2.4 : h);
        var x = M.izq;
        cols.forEach(function (c, i) {
            caja(x, y, c.w, h, cab ? GRIS_CAB : null);
            var lin = lineas[i], alto = lin.length * tam * 1.15, y0 = y - (h - alto) / 2 - tam * 0.95;
            lin.forEach(function (l, k) { centrado(l, x, c.w, y0 - k * tam * 1.15, { tam: tam, letra: letra }); });
            x += c.w;
        });
        y -= h;
    }
    filaTabla(cols.map(function (c) { return c.t; }), true);
    d.filas.forEach(function (f) { filaTabla([f.mr, f.lote || '—', m2(f.areaBase), m2(areaFila(f)), m2(areaActualizada(f))]); });
    if (d.filas.length > 1) { var t = totales(d.filas); filaTabla(['TOTAL', '', m2(t.base), m2(t.descontar), m2(t.actualizada)], false, true); }
    y -= 20;

    // Localización de cada lote: texto a la izquierda; a la derecha, área actual y área para descontar
    // Cuadro de cada lote: a la izquierda el texto del sitio, a la derecha «Área actual» y «Área para descontar» (165 pt
    // cada imagen). Si no cabe completo en lo que queda de la hoja, se parte como en el documento hecho a mano: aquí el texto
    // con el área actual y en la hoja siguiente, en el mismo cuadro, el área para descontar
    var HIMG = 165, BLOQUE = TAM + 8 + HIMG + 10;
    var tituloLoc = partir(d.textos.localizacion, negrita, TAM, ANCHO - 40).length * ALTO + 10;
    espacio(tituloLoc + 10 + BLOQUE);   // el título no queda solo al final de una página
    vineta(d.textos.localizacion);
    var izq = ANCHO * 0.42, der = ANCHO - izq, xi = M.izq + izq;
    function bloqueImagen(rotulo, im, yy) {
        centrado(rotulo, xi, der, yy - TAM * 0.85, { tam: TAM - 1, letra: negrita });
        yy -= TAM + 8;
        if (im) imagen(im, xi + 8, yy, der - 16, HIMG); else centrado('(sin imagen)', xi, der, yy - HIMG / 2, { tam: 9 });
    }
    for (var i = 0; i < d.filas.length; i++) {
        var f = d.filas[i], ims = (opciones.imagenes || {})[i] || {};
        var actual = await incrustar(ims.actual), descontar = await incrustar(ims.descontar);
        var completo = 10 + 2 * BLOQUE, partido = y - M.abajo < completo;
        if (partido) espacio(10 + BLOQUE + 4);
        var alto1 = partido ? 10 + BLOQUE : completo;
        caja(M.izq, y, izq, alto1); caja(xi, y, der, alto1);
        var sitio = (d.filas.length > 1 ? f.mr + (f.lote ? ' - ' + f.lote : '') + '\n' : '') + d.textos.sitio;
        var bloques = limpiar(sitio).split('\n').map(function (p) { return partir(p, normal, TAM, izq - 16); });
        var nLin = bloques.reduce(function (s, b) { return s + b.length; }, 0) + bloques.length - 1;
        var yt = y - (alto1 - nLin * ALTO) / 2 - TAM * 0.9;
        bloques.forEach(function (b, k) {
            if (d.filas.length > 1 && k === 0) b.forEach(function (l, n) { texto(l, M.izq + 8, yt - n * ALTO, { letra: negrita }); });
            else justificado(b, M.izq + 8, izq - 16, yt, TAM, normal, ALTO);
            yt -= (b.length + 1) * ALTO;
        });
        bloqueImagen('Área actual:', actual, y - 10);
        if (partido) {
            nueva();
            caja(M.izq, y, izq, BLOQUE + 10); caja(xi, y, der, BLOQUE + 10);
            bloqueImagen('Área para descontar:', descontar, y - 10);
            y -= BLOQUE + 10 + 16;
        } else {
            bloqueImagen('Área para descontar:', descontar, y - 10 - BLOQUE);
            y -= completo + 16;
        }
    }

    // Registro fotográfico de cada lote: el título y debajo un recuadro por foto (caben dos por hoja), con su pie
    for (i = 0; i < d.filas.length; i++) {
        var fotos = ((opciones.fotos || {})[i] || []).filter(function (x) { return x && x.bytes; });
        if (!fotos.length) continue;
        var wc = ANCHO * 0.72, xc = M.izq + (ANCHO - wc) / 2, HF = Math.min(255, (PAG[1] - M.arriba - M.abajo - 60) / 2 - 24);
        espacio(ALTO + 20 + HF + 20);
        y -= 8;
        centrado(pieFotos(d.filas[i]), M.izq, ANCHO, y - TAM, { letra: negrita });
        y -= ALTO + 12;
        for (var k = 0; k < fotos.length; k++) {
            var im = await incrustar(fotos[k]);
            if (!im) continue;
            var pie = fotos[k].pie ? partir(fotos[k].pie, normal, 9.5, wc - 16) : [];
            // El recuadro se ajusta a la foto (una foto ancha no deja franjas en blanco)
            var hi = Math.min(HF, im.height * (wc - 16) / im.width);
            var hc = hi + 16 + (pie.length ? pie.length * 12 + 6 : 0);
            espacio(hc + 10);
            caja(xc, y, wc, hc);
            imagen(im, xc + 8, y - 8, wc - 16, hi);
            pie.forEach(function (l, n) { centrado(l, xc, wc, y - 8 - hi - 14 - n * 12, { tam: 9.5 }); });
            y -= hc + 12;
        }
    }
    return await pdf.save();
}
