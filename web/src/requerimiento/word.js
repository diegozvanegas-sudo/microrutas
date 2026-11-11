// Word (.docx) del «Requerimiento de interventoría», con el mismo contenido y orden del PDF (pdf.js), para que el equipo lo
// revise y corrija antes de dar el visto bueno. Se arma a mano (WordprocessingML) con JSZip, que ya usa la aplicación.
// Con un formato (.docx de la institución, ⚙️ Configuración) el requerimiento se escribe dentro de ese Word, con su encabezado,
// pie, márgenes y letra. Sin formato, el membrete va de fondo en el encabezado y el pie lleva «Página X de Y».
// Funciona igual en el navegador y en Node (pruebas).
import { enLetras, filasNovedad, gruposPdf } from './pdf.js';

var EMU = 12700;                       // 1 punto en EMU (imágenes)
var ANCHO_BASE = 12240 - 2 * 1240;     // hoja carta menos márgenes izquierdo y derecho, en twips (1/20 de punto), sin formato
var TEAL = '0F7378', GRIS = '8C9499', BORDE = 'C8D1D3', FONDO = 'F4F7F7';
var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

// Texto seguro para XML (sin caracteres de control que Word no abre)
export function xml(s) {
    return Array.from(String(s == null ? '' : s)).filter(function (ch) {
        var c = ch.charCodeAt(0);
        return (c >= 32 || c === 9 || c === 10 || c === 13) && c !== 0xFFFE && c !== 0xFFFF;
    }).join('')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Ancho y alto en píxeles de un PNG o JPG (null si no se reconoce)
export function medidasImagen(b) {
    if (!b || b.length < 24) return null;
    if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    for (var i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xFF) { i++; continue; }
        var m = b[i + 1], largo = b[i + 2] << 8 | b[i + 3];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: b[i + 7] << 8 | b[i + 8], h: b[i + 5] << 8 | b[i + 6] };
        i += 2 + largo;
    }
    return null;
}

// ---------- Formato (.docx de la institución) ----------
// Del .docx se conserva todo menos el contenido: encabezado y pie (con el membrete), estilos, numeración, tema, márgenes y
// tamaño de hoja. Se quitan el texto, las imágenes y vínculos que solo usaba el contenido (fotos, firmas) y los comentarios.
// En el cuerpo queda un párrafo vacío con la letra y el tamaño que más se usaban, para escribir el requerimiento con ellos.
var RELS_DEL_CUERPO = /\/(image|hyperlink|comments|commentsExtended|commentsIds|commentsExtensible|oleObject|package|chart|diagramData|diagramLayout|diagramQuickStyle|diagramColors|diagramDrawing|people)$/;
function masUsado(lista) {
    var c = {}, mejor = null;
    lista.forEach(function (x) { c[x] = (c[x] || 0) + 1; if (mejor == null || c[x] > c[mejor]) mejor = x; });
    return mejor;
}
// Letra, tamaño, ancho útil y márgenes del cuerpo de un document.xml
export function datosFormato(doc) {
    var ini = doc.indexOf('<w:body>'), cuerpo = ini === -1 ? doc : doc.slice(ini);
    var fuente = masUsado((cuerpo.match(/<w:rFonts [^>]*w:ascii="([^"]+)"/g) || []).map(function (m) { return m.match(/w:ascii="([^"]+)"/)[1]; }));
    var tam = masUsado((cuerpo.match(/<w:sz w:val="(\d+)"/g) || []).map(function (m) { return +m.match(/\d+/)[0]; }));
    var s = cuerpo.slice(cuerpo.lastIndexOf('<w:sectPr')), num = function (re, d) { var m = s.match(re); return m ? +m[1] : d; };
    var hoja = num(/<w:pgSz [^>]*w:w="(\d+)"/, 12240), izq = num(/<w:pgMar [^>]*w:left="(\d+)"/, 1440), der = num(/<w:pgMar [^>]*w:right="(\d+)"/, 1440);
    return { fuente: fuente || '', tam: tam ? tam / 2 : 0, ancho: hoja - izq - der, margenes: { arriba: num(/<w:pgMar [^>]*w:top="(-?\d+)"/, 0), abajo: num(/<w:pgMar [^>]*w:bottom="(-?\d+)"/, 0), izq: izq, der: der } };
}
// Abre el .docx y lo deja como formato (sin contenido). Devuelve { zip, raiz, seccion, datos }
async function limpiarFormato(JSZip, bytes) {
    var zip;
    try { zip = await JSZip.loadAsync(bytes); } catch (e) { throw new Error('el archivo no es un Word (.docx) válido'); }
    var f = zip.file('word/document.xml');
    if (!f) throw new Error('el archivo no es un Word (.docx): no tiene word/document.xml');
    var doc = await f.async('string'), ib = doc.indexOf('<w:body>'), fin = doc.lastIndexOf('</w:body>');
    if (ib === -1 || fin === -1) throw new Error('el Word no tiene cuerpo');
    var datos = datosFormato(doc), is = doc.lastIndexOf('<w:sectPr', fin);
    var seccion = is > ib ? doc.slice(is, fin) : '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    var raiz = doc.slice(0, ib);
    // Prefijos que usan las imágenes del requerimiento
    [['wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'], ['a', 'http://schemas.openxmlformats.org/drawingml/2006/main'],
        ['pic', 'http://schemas.openxmlformats.org/drawingml/2006/picture'], ['r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships']].forEach(function (n) {
        if (raiz.indexOf('xmlns:' + n[0] + '=') === -1) raiz = raiz.replace(/<w:document\b/, '<w:document xmlns:' + n[0] + '="' + n[1] + '"');
    });
    // Relaciones del cuerpo que ya no se usan
    var rf = zip.file('word/_rels/document.xml.rels'), rels = rf ? await rf.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    var quitadas = [];
    rels = rels.replace(/<Relationship\b[^>]*\/>/g, function (r) {
        var tipo = (r.match(/Type="([^"]+)"/) || [])[1] || '', destino = (r.match(/Target="([^"]+)"/) || [])[1] || '';
        if (RELS_DEL_CUERPO.test(tipo)) { if (!/TargetMode="External"/.test(r)) quitadas.push(destino); return ''; }
        return r;
    });
    zip.file('word/_rels/document.xml.rels', rels);
    // Partes del cuerpo que quedaron sin uso (fotos, comentarios…): se borran si ninguna otra relación las nombra
    var todasRels = '';
    for (var nombre of Object.keys(zip.files)) if (/\.rels$/.test(nombre) && !zip.files[nombre].dir) todasRels += await zip.file(nombre).async('string');
    var ct = zip.file('[Content_Types].xml') ? await zip.file('[Content_Types].xml').async('string') : '';
    quitadas.forEach(function (d) {
        var parte = 'word/' + d.replace(/^\.\//, '');
        if (todasRels.indexOf('"' + d + '"') !== -1) return;
        zip.remove(parte);
        ct = ct.replace(new RegExp('<Override PartName="/' + parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*/>'), '');
    });
    if (ct.indexOf('Extension="png"') === -1) ct = ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', '$&<Default Extension="png" ContentType="image/png"/>');
    if (ct.indexOf('Extension="jpg"') === -1) ct = ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', '$&<Default Extension="jpg" ContentType="image/jpeg"/>');
    zip.file('[Content_Types].xml', ct);
    return { zip: zip, raiz: raiz, seccion: seccion, datos: datos };
}
function marcaFormato(datos) {
    var pr = (datos.fuente ? '<w:rFonts w:ascii="' + xml(datos.fuente) + '" w:hAnsi="' + xml(datos.fuente) + '" w:cs="' + xml(datos.fuente) + '"/>' : '') +
        (datos.tam ? '<w:sz w:val="' + Math.round(datos.tam * 2) + '"/>' : '');
    return '<w:p><w:pPr><w:rPr>' + pr + '</w:rPr></w:pPr><w:r><w:rPr>' + pr + '</w:rPr></w:r></w:p>';
}
// .docx cualquiera → formato listo para guardar (sin contenido). ajustes: { abajo: twips } cambia el margen inferior.
// Devuelve { bytes, datos: { fuente, tam, ancho, margenes } }
export async function prepararFormato(bytes, ajustes) {
    var JSZip = (await import('jszip')).default, f = await limpiarFormato(JSZip, bytes), seccion = f.seccion;
    if (ajustes && ajustes.abajo) seccion = seccion.replace(/(<w:pgMar [^>]*w:bottom=")\d+"/, '$1' + Math.round(ajustes.abajo) + '"');
    f.zip.file('word/document.xml', f.raiz + '<w:body>' + marcaFormato(f.datos) + seccion + '</w:body></w:document>');
    var datos = datosFormato(f.raiz + '<w:body>' + marcaFormato(f.datos) + seccion + '</w:body>');
    return { bytes: await f.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), datos: datos };
}

// req: el mismo objeto de armarPdf. opciones: { membrete: { bytes, tipo }, formato: bytes de un .docx }. Devuelve Uint8Array.
// Con formato, el requerimiento se escribe dentro de ese Word (su encabezado, pie, márgenes y letra) y el membrete no se usa.
export async function armarDocx(req, opciones) {
    opciones = opciones || {};
    var JSZip = (await import('jszip')).default;
    var medios = [], idDibujo = 0;   // imágenes del documento: { nombre, bytes, rid, parte }
    var formato = opciones.formato ? await limpiarFormato(JSZip, opciones.formato) : null;
    var ANCHO = formato && formato.datos.ancho > 3000 ? formato.datos.ancho : ANCHO_BASE;
    var FUENTE = formato ? formato.datos.fuente : '', TAM = formato ? formato.datos.tam : 0;
    if (formato) idDibujo = 1000;   // no chocar con los dibujos del encabezado y el pie del formato

    // ---------- piezas ----------
    function run(t, o) {
        o = o || {};
        var sz = o.sz || TAM;
        var pr = '<w:rPr>' + (FUENTE ? '<w:rFonts w:ascii="' + xml(FUENTE) + '" w:hAnsi="' + xml(FUENTE) + '" w:cs="' + xml(FUENTE) + '"/>' : '') +
            (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
            (sz ? '<w:sz w:val="' + Math.round(sz * 2) + '"/><w:szCs w:val="' + Math.round(sz * 2) + '"/>' : '') + (o.resaltar ? '<w:highlight w:val="yellow"/>' : '') + '</w:rPr>';
        return String(t == null ? '' : t).split('\n').map(function (l, i) {
            return (i ? '<w:r>' + pr + '<w:br/></w:r>' : '') + '<w:r>' + pr + l.split('\t').map(function (s) { return '<w:t xml:space="preserve">' + xml(s) + '</w:t>'; }).join('<w:tab/>') + '</w:r>';
        }).join('');
    }
    // Párrafo: contenido ya en XML de runs. o: { jc, antes, despues, izq, colgar, juntoSig, borde }
    function p(runs, o) {
        o = o || {};
        var pr = (o.estilo ? '<w:pStyle w:val="' + o.estilo + '"/>' : '') + (o.juntoSig ? '<w:keepNext/>' : '') + (o.juntas ? '<w:keepLines/>' : '') +
            (o.borde ? '<w:pBdr><w:top w:val="single" w:sz="4" w:space="2" w:color="' + GRIS + '"/></w:pBdr>' : '') +
            '<w:spacing w:before="' + (o.antes || 0) + '" w:after="' + (o.despues != null ? o.despues : 120) + '"/>' +
            (o.izq || o.der || o.colgar ? '<w:ind w:left="' + (o.izq || 0) + '" w:right="' + (o.der || 0) + '"' + (o.colgar ? ' w:hanging="' + o.colgar + '"' : '') + '/>' : '') +
            (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '');
        return '<w:p><w:pPr>' + pr + '</w:pPr>' + (runs || '') + '</w:p>';
    }
    // Texto de varios renglones: cada renglón un párrafo justificado; los que empiezan con viñeta van con sangría francesa
    function parrafos(t, o) {
        o = o || {};
        return String(t || '').split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); }).map(function (l) {
            var vineta = /^\s*[•\-–*➢▪●]\s+/.test(l);
            return p(run(vineta ? '•\t' + l.replace(/^\s*[•\-–*➢▪●]\s+/, '') : l, o), { jc: 'both', izq: (o.izq || 0) + (vineta ? 360 : 0), colgar: vineta ? 240 : 0, despues: o.despues != null ? o.despues : 120 });
        }).join('');
    }
    function titulo(t) { return p(run(t, { b: true, sz: 11 }), { antes: 200, despues: 140, juntoSig: true }); }
    function subtitulo(t) { return p(run(t, { b: true }), { antes: 80, despues: 100, juntoSig: true }); }
    function imagen(bytes, tipo, wPt, hPt, parte) {
        // Con formato, nombres propios para no pisar las imágenes del encabezado (que pueden venir de un Word hecho con la app)
        var n = medios.length + 1, nombre = (formato ? 'req-foto' : 'imagen') + n + (tipo === 'png' ? '.png' : '.jpg'), rid = (formato ? 'rIdReqImg' : 'rIdImg') + n, id = ++idDibujo;
        medios.push({ nombre: nombre, bytes: bytes, rid: rid, parte: parte || 'document' });
        return { rid: rid, id: id, cx: Math.round(wPt * EMU), cy: Math.round(hPt * EMU), nombre: nombre };
    }
    function grafico(im) {
        return '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + im.id + '" name="' + im.nombre + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
            '<pic:blipFill><a:blip r:embed="' + im.rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
            '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + im.cx + '" cy="' + im.cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    }
    function enLinea(im) {
        return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + im.cx + '" cy="' + im.cy + '"/><wp:docPr id="' + im.id + '" name="Imagen ' + im.id + '"/>' +
            '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' + grafico(im) + '</wp:inline></w:drawing></w:r>';
    }
    // Celda: ancho en twips; o: { fondo, centrar, vertical, sinBorde }
    function celda(contenido, ancho, o) {
        o = o || {};
        return '<w:tc><w:tcPr><w:tcW w:w="' + ancho + '" w:type="dxa"/>' + (o.fondo ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fondo + '"/>' : '') +
            '<w:vAlign w:val="' + (o.vertical || 'center') + '"/></w:tcPr>' + (contenido || p('', { despues: 0 })) + '</w:tc>';
    }
    function tabla(anchos, filas, o) {
        o = o || {};
        var borde = o.sinBorde ? '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'
            : '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) { return '<w:' + b + ' w:val="single" w:sz="' + (o.grueso || 4) + '" w:space="0" w:color="' + (o.color || BORDE) + '"/>'; }).join('') + '</w:tblBorders>';
        return '<w:tbl><w:tblPr><w:tblW w:w="' + anchos.reduce(function (a, b) { return a + b; }, 0) + '" w:type="dxa"/>' + borde + '<w:tblLayout w:type="fixed"/>' +
            '<w:tblCellMar><w:top w:w="' + (o.margen != null ? o.margen : 80) + '" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="' + (o.margen != null ? o.margen : 80) + '" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
            '<w:tblGrid>' + anchos.map(function (a) { return '<w:gridCol w:w="' + a + '"/>'; }).join('') + '</w:tblGrid>' + filas.join('') + '</w:tbl>' + p('', { despues: 120 });
    }
    function fila(celdas, o) { return '<w:tr><w:trPr><w:cantSplit/>' + (o && o.cabecera ? '<w:tblHeader/>' : '') + '</w:trPr>' + celdas.join('') + '</w:tr>'; }
    // Tabla con encabezado de color: columnas [{ titulo, ancho, centrar }], filas de textos (con \n para renglones)
    function tablaColor(columnas, filas) {
        var cab = fila(columnas.map(function (c) { return celda(p(run(c.titulo, { b: true, color: 'FFFFFF', sz: 9.5 }), { jc: 'center', despues: 0 }), c.ancho, { fondo: TEAL }); }), { cabecera: true });
        return tabla(columnas.map(function (c) { return c.ancho; }), [cab].concat(filas.map(function (f) {
            return fila(columnas.map(function (c, i) {
                var renglones = String(f[i] || '').split('\n');
                return celda(renglones.map(function (l) { return p(run(l, { sz: 9.5 }), { jc: c.centrar ? 'center' : 'left', despues: 0 }); }).join(''), c.ancho, { vertical: c.centrar ? 'center' : 'top' });
            }));
        })));
    }

    // ---------- cuerpo ----------
    var b = [];
    b.push(p(run('REQUERIMIENTO DE INTERVENTORÍA', { b: true, sz: 15 }), { jc: 'center', despues: 60 }));
    b.push(p(run(req.radicado || 'EVM-____', { b: true, sz: 11, color: req.radicado ? TEAL : undefined, resaltar: !req.radicado }), { jc: 'center', despues: 240 }));
    var c1 = 3000, c2 = ANCHO - c1;
    b.push(tabla([c1, c2], [
        ['Contratista', req.contratista], ['Contrato', req.contrato], ['Servicio', req.servicio],
        ['Zona', (req.zonas && req.zonas.length ? req.zonas : ['NA']).join('\n')], ['Asunto', req.asunto], ['Ruta', req.ruta || 'NA'],
        ['Fecha del evento', req.fechaEvento || ''], ['Fecha del requerimiento', req.fechaRequerimiento || '']
    ].map(function (f) {
        return fila([celda(p(run(f[0]), { despues: 0 }), c1), celda(String(f[1] || '').split('\n').map(function (l) { return p(run(l), { despues: 0 }); }).join(''), c2)]);
    })));

    b.push(titulo('1.   DESCRIPCIÓN:'));
    b.push(parrafos(req.descripcion));
    var novedades = filasNovedad(req.novedades);
    if (novedades.length) {
        b.push(tablaColor([{ titulo: 'MICRORRUTA', ancho: 2000, centrar: true }, { titulo: 'FECHA DE VERIFICACIÓN', ancho: 2000, centrar: true }, { titulo: 'TIPOS DE NOVEDADES', ancho: ANCHO - 4000 }],
            novedades.map(function (n) { return [n.micro, n.fecha, n.tipos.join('\n')]; })));
    }
    if (req.constancia) b.push(parrafos(req.constancia));

    b.push(titulo('2.   EVIDENCIAS DEL SEGUIMIENTO'));
    var grupos = gruposPdf(req), nFoto = 0, wCol = Math.floor(ANCHO / 2), wfPt = (wCol - 220) / 20, HMAX = 250;
    grupos.forEach(function (g, ig) {
        if (g.titulo) b.push(p(run('Evidencia ' + (ig + 1) + '. ' + g.titulo, { b: true }), { despues: 80, juntoSig: !!(g.texto || (g.fotos || []).length) }));
        if (g.texto) b.push(parrafos(g.texto));
        var fotos = g.fotos || [];
        if (!fotos.length) return;
        // Dos fotos por fila en una tabla sin bordes, cada una a su proporción y con su pie
        var filas = [];
        for (var i = 0; i < fotos.length; i += 2) {
            filas.push(fila(fotos.slice(i, i + 2).concat(i + 1 < fotos.length ? [] : [null]).map(function (f, k) {
                if (!f) return celda('', wCol);
                var md = medidasImagen(f.bytes) || { w: 4, h: 3 }, e = Math.min(wfPt / md.w, HMAX / md.h);
                var im = imagen(f.bytes, f.tipo, md.w * e, md.h * e);
                return celda(p(enLinea(im), { jc: 'center', despues: 40 }) +
                    p(run('Foto ' + (nFoto + i + k + 1) + (f.pie ? '. ' + f.pie : ''), { i: true, sz: 8.5, color: '4D545C' }), { jc: 'center', despues: 120 }), wCol, { vertical: 'bottom' });
            })));
        }
        nFoto += fotos.length;
        b.push(tabla([wCol, ANCHO - wCol], filas, { sinBorde: true, margen: 40 }));
    });
    if (!grupos.length) b.push(p(run('Sin evidencias adjuntas.', { i: true, color: GRIS })));

    b.push(titulo('3.   CONSIDERACIONES'));
    if (req.consideraciones) b.push(parrafos(req.consideraciones));
    if ((req.obligaciones || []).length) {
        b.push(subtitulo('1. Obligaciones establecidas en el contrato.'));
        var numerales = req.obligaciones.map(function (o) { return (o.ref || '').split(/\s+/)[0].replace(/\.$/, ''); }).filter(Boolean)
            .filter(function (n, i, a) { return a.indexOf(n) === i; });
        b.push(parrafos((req.obligacionesIntro || 'Se le recuerda al contratista el cumplimiento de lo estipulado en los numerales {numerales} del contrato:')
            .replace('{numerales}', numerales.length > 1 ? numerales.slice(0, -1).join(', ') + ' y ' + numerales[numerales.length - 1] : numerales[0] || '')));
        req.obligaciones.forEach(function (o) {
            b.push(p(run('Lo dispuesto en el numeral ' + (o.ref || '') + '.', { b: true }), { antes: 80, despues: 80, juntoSig: true }));
            b.push(parrafos('“' + o.t + '”', { i: true, izq: 280, sz: 9.5 }));
        });
    }
    if ((req.ans || []).length) {
        b.push(subtitulo('2. Acuerdos de Nivel de Servicio - ANS.'));
        b.push(parrafos(req.ansIntro || 'Las Especificaciones Técnicas establecen, entre otros, los siguientes ANS:'));
        req.ans.forEach(function (a) {
            b.push(p(run(a.clave + '.', { b: true }), { antes: 80, despues: 60, juntoSig: true }));
            b.push(parrafos('“' + a.t + '”', { i: true, izq: 280, sz: 9.5 }));
        });
    }

    b.push(titulo('4.   INFORMACIÓN SOLICITADA'));
    b.push(parrafos('Para el esclarecimiento de la novedad, se solicita remitir la siguiente información y/o soportes:'));
    var sol = (req.solicitudes || []).filter(function (s) { return s.t; });
    b.push(tablaColor([{ titulo: 'N°', ancho: 720, centrar: true }, { titulo: 'Información solicitada', ancho: ANCHO - 720 - 3200 }, { titulo: 'Soporte sugerido', ancho: 3200 }],
        sol.length ? sol.map(function (s, i) { return [String(i + 1), s.t, s.ej || '']; }) : [['1', 'Dar respuesta a lo descrito en el presente requerimiento.', '']]));

    b.push(titulo('5.   SOPORTES OPERATIVOS'));
    if (req.soportes) b.push(parrafos(req.soportes));
    b.push(tabla([3600, ANCHO - 3600], [fila([
        celda(p(run('PLAZO PARA RESPONDER', { b: true, sz: 10.5 }), { despues: 0 }), 3600, { fondo: FONDO }),
        celda(p(run(enLetras(req.plazo || 5) + ' días hábiles contados a partir de la recepción del presente requerimiento.'), { despues: 0 }), ANCHO - 3600, { fondo: FONDO })
    ])], { color: TEAL, grueso: 8, margen: 140 }));

    b.push(titulo('6.   CONSIDERACIONES SOBRE LA RESPUESTA'));
    if (req.consideracionesRespuesta) b.push(parrafos(req.consideracionesRespuesta));
    if (req.preventivo) b.push(parrafos(req.preventivo));

    // Firmas en dos columnas: imagen de la firma si la hay, la línea, el nombre y el cargo
    b.push(p(run('Cordialmente,'), { antes: 200, despues: 200, juntoSig: true }));
    var firmas = (req.firmas || []).filter(function (f) { return f.nombre; }), wF = Math.floor(ANCHO / 2), filasF = [];
    for (var j = 0; j < firmas.length; j += 2) {
        filasF.push(fila(firmas.slice(j, j + 2).concat(j + 1 < firmas.length ? [] : [null]).map(function (f) {
            if (!f) return celda('', wF);
            var arriba = p('', { despues: 0 }) + p('', { despues: 0 });
            var md = f.imagen && f.imagen.bytes ? medidasImagen(f.imagen.bytes) : null;
            if (md) { var e = Math.min(150 / md.w, 36 / md.h); arriba = p(enLinea(imagen(f.imagen.bytes, f.imagen.tipo, md.w * e, md.h * e)), { jc: 'center', despues: 0 }); }
            return celda(arriba + p(run(f.nombre, { b: true }), { jc: 'center', despues: 0, borde: true, izq: 500, der: 500 }) +
                p(run(f.cargo || '', { sz: 9.5 }), { jc: 'center', despues: 240 }), wF, { vertical: 'bottom' });
        })));
    }
    if (filasF.length) b.push(tabla([wF, ANCHO - wF], filasF, { sinBorde: true, margen: 60 }));
    var copias = (req.copias || []).filter(Boolean);
    if (copias.length) {
        b.push(p(run('Con copia a:', { b: true, sz: 8 }), { jc: 'right', antes: 120, despues: 40, juntoSig: true }));
        copias.forEach(function (c) { b.push(p(run(c, { sz: 7.5 }), { jc: 'right', despues: 20 })); });
    }

    // ---------- con formato: el cuerpo va dentro del Word de la institución ----------
    if (formato) {
        var zf = formato.zip, rr = await zf.file('word/_rels/document.xml.rels').async('string');
        var nuevas = medios.map(function (m) { return '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.nombre + '"/>'; }).join('');
        zf.file('word/_rels/document.xml.rels', rr.replace('</Relationships>', nuevas + '</Relationships>'));
        medios.forEach(function (m) { zf.file('word/media/' + m.nombre, m.bytes); });
        zf.file('word/document.xml', formato.raiz + '<w:body>' + b.join('') + formato.seccion + '</w:body></w:document>');
        var core = zf.file('docProps/core.xml');
        if (core) {
            var tc = await core.async('string'), titulo1 = '<dc:title>' + xml('Requerimiento de interventoría ' + (req.radicado || '')) + '</dc:title>';
            zf.file('docProps/core.xml', /<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/.test(tc) ? tc.replace(/<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/, titulo1) : tc.replace('</cp:coreProperties>', titulo1 + '</cp:coreProperties>'));
        }
        return zf.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    }

    // ---------- encabezado (membrete de fondo) y pie ----------
    var membrete = opciones.membrete && opciones.membrete.bytes ? opciones.membrete : null, encabezado = p('', { despues: 0 });
    if (membrete) {
        var im = imagen(membrete.bytes, membrete.tipo, 612, 792, 'header1');
        encabezado = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">' +
            '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
            '<wp:extent cx="' + im.cx + '" cy="' + im.cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + im.id + '" name="Membrete"/><wp:cNvGraphicFramePr/>' +
            grafico(im) + '</wp:anchor></w:drawing></w:r></w:p>';
    }
    // Campo PAGE / NUMPAGES con la misma letra del pie (con fldSimple Word le pone la letra normal al recalcularlo)
    var campo = function (c) {
        var pr = '<w:rPr><w:color w:val="' + GRIS + '"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>';
        return '<w:r>' + pr + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + pr + '<w:instrText xml:space="preserve"> ' + c + ' </w:instrText></w:r>' +
            '<w:r>' + pr + '<w:fldChar w:fldCharType="separate"/></w:r><w:r>' + pr + '<w:t>1</w:t></w:r><w:r>' + pr + '<w:fldChar w:fldCharType="end"/></w:r>';
    };
    var gris = { sz: 8, color: GRIS };
    var pie = '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="' + BORDE + '"/></w:pBdr><w:tabs><w:tab w:val="center" w:pos="' + ANCHO / 2 + '"/><w:tab w:val="right" w:pos="' + ANCHO + '"/></w:tabs><w:spacing w:after="0"/></w:pPr>' +
        run(req.pie || 'Interventoría del Servicio de Aseo', gris) + run('\t' + (req.codigo || '') + '\tPágina ', gris) + campo('PAGE') + run(' de ', gris) + campo('NUMPAGES') + '</w:p>';
    // Con membrete se deja libre la franja de los logos (arriba) y la del pie del membrete (abajo), como en el PDF
    var mar = membrete ? { arriba: 2240, abajo: 2960, pie: 2300 } : { arriba: 1160, abajo: 1300, pie: 600 };
    var seccion = '<w:sectPr><w:headerReference w:type="default" r:id="rIdEnc"/><w:footerReference w:type="default" r:id="rIdPie"/>' +
        '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="' + mar.arriba + '" w:right="1240" w:bottom="' + mar.abajo + '" w:left="1240" w:header="400" w:footer="' + mar.pie + '" w:gutter="0"/></w:sectPr>';

    // ---------- paquete ----------
    var zip = new JSZip(), rels = function (lista) {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            lista.map(function (r) { return '<Relationship Id="' + r[0] + '" Type="http://schemas.openxmlformats.org/' + r[1] + '" Target="' + r[2] + '"/>'; }).join('') + '</Relationships>';
    };
    var cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    zip.file('[Content_Types].xml', cab + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
        '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    zip.file('_rels/.rels', rels([['rId1', 'officeDocument/2006/relationships/officeDocument', 'word/document.xml'], ['rId2', 'package/2006/relationships/metadata/core-properties', 'docProps/core.xml']]));
    zip.file('docProps/core.xml', cab + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:title>' + xml('Requerimiento de interventoría ' + (req.radicado || '')) + '</dc:title><dc:creator>' + xml(req.pie || 'Interventoría') + '</dc:creator></cp:coreProperties>');
    zip.file('word/styles.xml', cab + '<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>' +
        '<w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="14191F"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
        '<w:style w:type="table" w:default="1" w:styleId="TablaNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>');
    zip.file('word/settings.xml', cab + '<w:settings ' + NS + '><w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>');
    zip.file('word/document.xml', cab + '<w:document ' + NS + '><w:body>' + b.join('') + seccion + '</w:body></w:document>');
    zip.file('word/header1.xml', cab + '<w:hdr ' + NS + '>' + encabezado + '</w:hdr>');
    zip.file('word/footer1.xml', cab + '<w:ftr ' + NS + '>' + pie + '</w:ftr>');
    var IMG = 'officeDocument/2006/relationships/image';
    zip.file('word/_rels/document.xml.rels', rels([['rIdEstilos', 'officeDocument/2006/relationships/styles', 'styles.xml'], ['rIdAjustes', 'officeDocument/2006/relationships/settings', 'settings.xml'],
        ['rIdEnc', 'officeDocument/2006/relationships/header', 'header1.xml'], ['rIdPie', 'officeDocument/2006/relationships/footer', 'footer1.xml']]
        .concat(medios.filter(function (m) { return m.parte === 'document'; }).map(function (m) { return [m.rid, IMG, 'media/' + m.nombre]; }))));
    zip.file('word/_rels/header1.xml.rels', rels(medios.filter(function (m) { return m.parte === 'header1'; }).map(function (m) { return [m.rid, IMG, 'media/' + m.nombre]; })));
    medios.forEach(function (m) { zip.file('word/media/' + m.nombre, m.bytes); });
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
