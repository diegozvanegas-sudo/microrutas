// Word (.docx) del documento de descuento, con el mismo contenido y orden del PDF (pdf.js), para corregirlo antes de enviarlo.
// Con el formato de la institución (formato.js: el .docx que sube el usuario, sin contenido) el descuento se escribe dentro de
// ese Word, con su encabezado, pie, márgenes y letra: queda igual al documento hecho a mano. Sin formato sale un Word carta
// con Arial 12 y, si hay, la imagen de membrete de fondo. Funciona igual en el navegador y en Node (pruebas).
import { xml, medidasImagen } from '../requerimiento/word.js';
import { areaFila, areaActualizada, m2, totales, pieFotos } from './descuentos.js';

var EMU = 12700;
var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

// d: el descuento; opciones: { formato: bytes del .docx limpio, membrete: { bytes, tipo }, imagenes, fotos } (como en pdf.js)
export async function armarDocxDescuento(d, opciones) {
    opciones = opciones || {};
    var JSZip = (await import('jszip')).default;
    var zip = null, raiz = '', seccion = '', ANCHO = 12240 - 1134 - 1325, FUENTE = 'Arial', TAM = 12;
    if (opciones.formato) {
        zip = await JSZip.loadAsync(opciones.formato);
        var doc = await zip.file('word/document.xml').async('string'), ib = doc.indexOf('<w:body>'), fin = doc.lastIndexOf('</w:body>');
        raiz = doc.slice(0, ib);
        seccion = doc.slice(doc.lastIndexOf('<w:sectPr', fin), fin);
        var n = function (re, def) { var m = seccion.match(re); return m ? +m[1] : def; };
        ANCHO = n(/<w:pgSz [^>]*w:w="(\d+)"/, 12240) - n(/<w:pgMar [^>]*w:left="(\d+)"/, 1440) - n(/<w:pgMar [^>]*w:right="(\d+)"/, 1440);
        var cuerpo = doc.slice(ib);
        FUENTE = (cuerpo.match(/w:ascii="([^"]+)"/) || [])[1] || 'Arial';
        TAM = ((cuerpo.match(/<w:sz w:val="(\d+)"/) || [])[1] || 24) / 2;
    }
    var medios = [], idDibujo = 2000;
    function run(t, o) {
        o = o || {};
        var sz = o.sz || TAM;
        var pr = '<w:rPr><w:rFonts w:ascii="' + xml(FUENTE) + '" w:hAnsi="' + xml(FUENTE) + '" w:cs="' + xml(FUENTE) + '"/>' + (o.b ? '<w:b/><w:bCs/>' : '') +
            (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + '<w:sz w:val="' + Math.round(sz * 2) + '"/><w:szCs w:val="' + Math.round(sz * 2) + '"/>' +
            (o.sup ? '<w:vertAlign w:val="superscript"/>' : '') + '</w:rPr>';
        return String(t == null ? '' : t).split('\n').map(function (l, i) { return (i ? '<w:r>' + pr + '<w:br/></w:r>' : '') + '<w:r>' + pr + '<w:t xml:space="preserve">' + xml(l) + '</w:t></w:r>'; }).join('');
    }
    // «m²» con el 2 como superíndice, como en el documento
    function runM2(t, o) {
        var partes = String(t).split('m²');
        return partes.map(function (p, i) { return run(p, o) + (i < partes.length - 1 ? run('m', o) + run('2', Object.assign({}, o, { sup: true })) : ''); }).join('');
    }
    function p(runs, o) {
        o = o || {};
        var pr = (o.juntoSig ? '<w:keepNext/>' : '') + '<w:spacing w:before="' + (o.antes || 0) + '" w:after="' + (o.despues != null ? o.despues : 0) + '" w:line="240" w:lineRule="auto"/>' +
            (o.izq || o.colgar ? '<w:ind w:left="' + (o.izq || 0) + '"' + (o.colgar ? ' w:hanging="' + o.colgar + '"' : '') + '/>' : '') + (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '');
        return '<w:p><w:pPr>' + pr + '</w:pPr>' + (runs || '') + '</w:p>';
    }
    function parrafos(t, o) { return String(t || '').split('\n').map(function (l) { return p(run(l, o), { jc: 'both', despues: 0 }); }).join(''); }
    function vineta(t) { return p(run('●', { b: true, sz: 9 }) + run('   ' + t, { b: true }), { izq: 720, colgar: 360, antes: 60, despues: 120, juntoSig: true }); }
    function imagen(bytes, tipo, wPt, hPt) {
        var k = medios.length + 1, nombre = 'desc-img' + k + (tipo === 'png' ? '.png' : '.jpg'), rid = 'rIdDescImg' + k, id = ++idDibujo;
        medios.push({ nombre: nombre, bytes: bytes, rid: rid });
        return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + Math.round(wPt * EMU) + '" cy="' + Math.round(hPt * EMU) + '"/><wp:docPr id="' + id + '" name="Imagen ' + id + '"/>' +
            '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
            '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + nombre + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
            '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + Math.round(wPt * EMU) + '" cy="' + Math.round(hPt * EMU) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    // Imagen ajustada a un recuadro (puntos), sin deformarla
    function imagenEn(im, wMax, hMax) {
        var md = medidasImagen(im.bytes) || { w: 4, h: 3 }, e = Math.min(wMax / md.w, hMax / md.h);
        return imagen(im.bytes, im.tipo, md.w * e, md.h * e);
    }
    function celda(contenido, ancho, o) {
        o = o || {};
        return '<w:tc><w:tcPr><w:tcW w:w="' + ancho + '" w:type="dxa"/>' + (o.fondo ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fondo + '"/>' : '') +
            '<w:vAlign w:val="' + (o.vertical || 'center') + '"/></w:tcPr>' + (contenido || p('')) + '</w:tc>';
    }
    function tabla(anchos, filas, o) {
        o = o || {};
        var borde = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) { return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>'; }).join('') + '</w:tblBorders>';
        return '<w:tbl><w:tblPr><w:tblW w:w="' + anchos.reduce(function (a, b) { return a + b; }, 0) + '" w:type="dxa"/>' + (o.centrar ? '<w:jc w:val="center"/>' : '') + borde + '<w:tblLayout w:type="fixed"/>' +
            '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
            '<w:tblGrid>' + anchos.map(function (a) { return '<w:gridCol w:w="' + a + '"/>'; }).join('') + '</w:tblGrid>' + filas.join('') + '</w:tbl>';
    }
    // o.partir: la fila se puede partir entre dos páginas (el cuadro de localización, como en el documento hecho a mano)
    function fila(celdas, o) { return '<w:tr><w:trPr>' + (o && o.partir ? '' : '<w:cantSplit/>') + (o && o.cabecera ? '<w:tblHeader/>' : '') + (o && o.alto ? '<w:trHeight w:val="' + o.alto + '"/>' : '') + '</w:trPr>' + celdas.join('') + '</w:tr>'; }

    var b = [];
    b.push(p(run(d.textos.titulo, { b: true }), { jc: 'center', despues: 240 }));
    b.push(parrafos(d.textos.intro));
    b.push(parrafos(d.textos.conclusion));
    b.push(vineta('Información de base de datos del servicio'));
    var proporciones = [0.19, 0.13, 0.2, 0.23, 0.25], anchos = proporciones.map(function (x) { return Math.round(x * ANCHO); });
    anchos[anchos.length - 1] = ANCHO - anchos.slice(0, -1).reduce(function (s, x) { return s + x; }, 0);
    var cab = ['MICRORRUTA', 'LOTE', 'ÁREA BASE DATOS\nm²', 'ÁREA A DESCONTAR\nm²', 'ÁREA ACTUALIZADA\nm²'];
    var celdaTxt = function (t, w, o) {
        o = o || {};
        return celda(String(t).split('\n').map(function (l) { return p(runM2(l, { b: o.b }), { jc: 'center' }); }).join(''), w, { fondo: o.fondo });
    };
    var filas = [fila(cab.map(function (t, i) { return celdaTxt(t, anchos[i], { b: true, fondo: 'CCCCCC' }); }), { cabecera: true })];
    d.filas.forEach(function (f) { filas.push(fila([f.mr, f.lote || '—', m2(f.areaBase), m2(areaFila(f)), m2(areaActualizada(f))].map(function (t, i) { return celdaTxt(t, anchos[i]); }), { alto: 620 })); });
    if (d.filas.length > 1) { var t = totales(d.filas); filas.push(fila(['TOTAL', '', m2(t.base), m2(t.descontar), m2(t.actualizada)].map(function (x, i) { return celdaTxt(x, anchos[i], { b: true }); }))); }
    b.push(tabla(anchos, filas));
    b.push(p('', { despues: 120 }));

    b.push(vineta(d.textos.localizacion));
    var izq = Math.round(ANCHO * 0.42), der = ANCHO - izq, wImg = (der - 200) / 20;
    d.filas.forEach(function (f, i) {
        var ims = (opciones.imagenes || {})[i] || {};
        var sitio = (d.filas.length > 1 ? p(run(f.mr + (f.lote ? ' - ' + f.lote : ''), { b: true }), { despues: 120 }) : '') +
            String(d.textos.sitio || '').split('\n').map(function (l) { return p(run(l), { jc: 'both', despues: 200 }); }).join('');
        var derecha = [['Área actual:', ims.actual], ['Área para descontar:', ims.descontar]].map(function (par) {
            return p(run(par[0], { b: true, sz: TAM - 1 }), { jc: 'center', antes: 60, despues: 60 }) +
                (par[1] && par[1].bytes ? p(imagenEn(par[1], wImg, 165), { jc: 'center', despues: 60 }) : p(run('(sin imagen)', { sz: 9 }), { jc: 'center', despues: 60 }));
        }).join('');
        b.push(tabla([izq, der], [fila([celda(sitio, izq), celda(derecha, der)], { partir: true })]));
        b.push(p('', { despues: 200 }));
    });

    d.filas.forEach(function (f, i) {
        var fotos = ((opciones.fotos || {})[i] || []).filter(function (x) { return x && x.bytes; });
        if (!fotos.length) return;
        b.push(p(run(pieFotos(f), { b: true }), { jc: 'center', antes: 120, despues: 160, juntoSig: true }));
        var wc = Math.round(ANCHO * 0.72);
        b.push(tabla([wc], fotos.map(function (x) {
            return fila([celda(p(imagenEn(x, (wc - 240) / 20, 250), { jc: 'center', antes: 60, despues: 60 }) + (x.pie ? p(run(x.pie, { sz: 9.5 }), { jc: 'center', despues: 60 }) : ''), wc)]);
        }), { centrar: true }));
        b.push(p('', { despues: 120 }));
    });

    var relImg = function (m) { return '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.nombre + '"/>'; };
    if (zip) {
        var rr = await zip.file('word/_rels/document.xml.rels').async('string');
        zip.file('word/_rels/document.xml.rels', rr.replace('</Relationships>', medios.map(relImg).join('') + '</Relationships>'));
        medios.forEach(function (m) { zip.file('word/media/' + m.nombre, m.bytes); });
        var ct = await zip.file('[Content_Types].xml').async('string');
        if (ct.indexOf('Extension="jpg"') === -1) ct = ct.replace(/(<Types [^>]*>)/, '$1<Default Extension="jpg" ContentType="image/jpeg"/>');
        if (ct.indexOf('Extension="png"') === -1) ct = ct.replace(/(<Types [^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>');
        zip.file('[Content_Types].xml', ct);
        zip.file('word/document.xml', raiz + '<w:body>' + b.join('') + seccion + '</w:body></w:document>');
        var core = zip.file('docProps/core.xml');
        if (core) {
            var tc = await core.async('string'), tit = '<dc:title>' + xml(d.textos.titulo || 'Descuento') + '</dc:title>';
            zip.file('docProps/core.xml', /<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/.test(tc) ? tc.replace(/<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/, tit) : tc.replace('</cp:coreProperties>', tit + '</cp:coreProperties>'));
        }
        return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    }

    // ---------- sin formato: Word carta propio, con la imagen de membrete de fondo si la hay ----------
    zip = new JSZip();
    var h = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', enc = '<w:p/>', relsEnc = [];
    var mb = opciones.membrete && opciones.membrete.bytes ? opciones.membrete : null;
    if (mb) {
        var nm = 'membrete' + (mb.tipo === 'png' ? '.png' : '.jpg');
        zip.file('word/media/' + nm, mb.bytes);
        relsEnc.push('<Relationship Id="rIdMemb" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + nm + '"/>');
        enc = '<w:p><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
            '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
            '<wp:extent cx="' + 612 * EMU + '" cy="' + 792 * EMU + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1" name="Membrete"/><wp:cNvGraphicFramePr/>' +
            '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="' + nm + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
            '<pic:blipFill><a:blip r:embed="rIdMemb"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + 612 * EMU + '" cy="' + 792 * EMU + '"/></a:xfrm>' +
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>';
    }
    var rel = function (lista) { return h + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + lista.join('') + '</Relationships>'; };
    zip.file('[Content_Types].xml', h + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
    zip.file('_rels/.rels', rel(['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>']));
    zip.file('word/header1.xml', h + '<w:hdr ' + NS + '>' + enc + '</w:hdr>');
    zip.file('word/_rels/header1.xml.rels', rel(relsEnc));
    zip.file('word/_rels/document.xml.rels', rel(['<Relationship Id="rIdEnc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'].concat(medios.map(relImg))));
    medios.forEach(function (m) { zip.file('word/media/' + m.nombre, m.bytes); });
    var sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdEnc"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="' + (mb ? 1963 : 1134) + '" w:right="1325" w:bottom="' + (mb ? 2473 : 1134) + '" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    zip.file('word/document.xml', h + '<w:document ' + NS + '><w:body>' + b.join('') + sect + '</w:body></w:document>');
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
