// Formato del documento de descuento: el Word (.docx) de la institución que sube cada usuario en su equipo (no está en el
// repositorio). Se guarda sin contenido ni letras incrustadas (prepararFormato de Requerimientos + quitarLetras) y de él salen:
//  - el Word del descuento, escrito dentro de ese formato (word.js);
//  - el membrete del PDF: la imagen de página completa del encabezado y los cuadros de texto del pie (p. ej. «Código:
//    GD-FR-016 · Versión: 14 · Fecha: …»), en la misma posición; y la letra, el tamaño y los márgenes (pdf.js).
// Funciona igual en el navegador y en Node (pruebas).
import { prepararFormato } from '../requerimiento/word.js';

var EMU_PT = 12700, TW_PT = 20;

// Quita las letras incrustadas (pesan megas y Arial/Verdana ya están en Windows) y lo que las nombra
export async function quitarLetras(JSZip, bytes) {
    var zip = await JSZip.loadAsync(bytes);
    Object.keys(zip.files).forEach(function (n) { if (/^word\/fonts\//.test(n)) zip.remove(n); });
    zip.remove('word/_rels/fontTable.xml.rels');
    var ft = zip.file('word/fontTable.xml');
    if (ft) zip.file('word/fontTable.xml', (await ft.async('string')).replace(/<w:embed(Regular|Bold|Italic|BoldItalic)\b[^>]*\/>/g, ''));
    var st = zip.file('word/settings.xml');
    if (st) zip.file('word/settings.xml', (await st.async('string')).replace(/<w:embedTrueTypeFonts\/>|<w:saveSubsetFonts\/>/g, ''));
    var ct = zip.file('[Content_Types].xml');
    if (ct) zip.file('[Content_Types].xml', (await ct.async('string')).replace(/<Default Extension="odttf"[^>]*\/>/g, ''));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// .docx cualquiera → { bytes (formato limpio y liviano), datos: { fuente, tam, ancho, margenes } }
export async function prepararFormatoDescuento(bytes) {
    var JSZip = (await import('jszip')).default;
    var f = await prepararFormato(bytes);
    return { bytes: await quitarLetras(JSZip, f.bytes), datos: f.datos };
}

function num(xml, re, d) { var m = xml.match(re); return m ? +m[1] : d; }
// Encabezado y pie que se usan en las páginas normales (el «default» de la sección)
function referencia(seccion, tipo, rels) {
    var m = seccion.match(new RegExp('<w:' + tipo + 'Reference [^>]*w:type="default"[^>]*r:id="([^"]+)"')) ||
        seccion.match(new RegExp('<w:' + tipo + 'Reference [^>]*r:id="([^"]+)"[^>]*w:type="default"'));
    if (!m) return null;
    var r = rels.match(new RegExp('<Relationship [^>]*Id="' + m[1] + '"[^>]*/>'));
    var t = r && r[0].match(/Target="([^"]+)"/);
    return t ? 'word/' + t[1].replace(/^\.?\//, '') : null;
}

// Del formato (bytes) → membrete para el PDF: { pagina: [ancho, alto] pt, margenes (pt), fuente, tam,
//   fondo: { bytes, tipo, x, y, w, h } (pt, desde arriba a la izquierda) | null, textos: [{ lineas, x, y, w, h, tam, color }] }
export async function membreteDeFormato(bytes) {
    var JSZip = (await import('jszip')).default, zip = await JSZip.loadAsync(bytes);
    var doc = await zip.file('word/document.xml').async('string'), rels = await zip.file('word/_rels/document.xml.rels').async('string');
    var seccion = doc.slice(doc.lastIndexOf('<w:sectPr'));
    var pag = [num(seccion, /<w:pgSz [^>]*w:w="(\d+)"/, 12240) / TW_PT, num(seccion, /<w:pgSz [^>]*w:h="(\d+)"/, 15840) / TW_PT];
    var mar = { arriba: num(seccion, /<w:pgMar [^>]*w:top="(-?\d+)"/, 1440) / TW_PT, abajo: num(seccion, /<w:pgMar [^>]*w:bottom="(-?\d+)"/, 1440) / TW_PT,
        izq: num(seccion, /<w:pgMar [^>]*w:left="(\d+)"/, 1440) / TW_PT, der: num(seccion, /<w:pgMar [^>]*w:right="(\d+)"/, 1440) / TW_PT,
        enc: num(seccion, /<w:pgMar [^>]*w:header="(\d+)"/, 708) / TW_PT, pie: num(seccion, /<w:pgMar [^>]*w:footer="(\d+)"/, 708) / TW_PT };
    var cuerpo = doc.slice(doc.indexOf('<w:body>'));
    var fuente = (cuerpo.match(/w:ascii="([^"]+)"/) || [])[1] || 'Arial', tam = (num(cuerpo, /<w:sz w:val="(\d+)"/, 24)) / 2;
    var out = { pagina: pag, margenes: mar, fuente: fuente, tam: tam, fondo: null, textos: [] };
    // Posición de un dibujo anclado: x desde la columna (margen izquierdo) o la página; y desde el párrafo (arriba del
    // encabezado, o arriba del pie, que va pegado abajo) o la página
    function posicion(a, enPie) {
        var ph = a.match(/<wp:positionH relativeFrom="(\w+)">\s*<wp:posOffset>(-?\d+)<\/wp:posOffset>/), pv = a.match(/<wp:positionV relativeFrom="(\w+)">\s*<wp:posOffset>(-?\d+)<\/wp:posOffset>/);
        var ext = a.match(/<wp:extent cx="(\d+)" cy="(\d+)"/), w = ext ? +ext[1] / EMU_PT : 0, h = ext ? +ext[2] / EMU_PT : 0;
        var x = ph ? +ph[2] / EMU_PT + (ph[1] === 'page' ? 0 : mar.izq) : mar.izq;
        var base = enPie ? pag[1] - mar.pie - 14 : mar.enc;
        var y = pv ? +pv[2] / EMU_PT + (pv[1] === 'page' ? 0 : base) : base;
        return { x: x, y: y, w: w, h: h };
    }
    for (var tipo of ['header', 'footer']) {
        var parte = referencia(seccion, tipo, rels), arch = parte && zip.file(parte);
        if (!arch) continue;
        var xml = await arch.async('string'), relf = zip.file(parte.replace(/^word\//, 'word/_rels/') + '.rels'), relsParte = relf ? await relf.async('string') : '';
        var anclas = xml.match(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g) || [];
        for (var a of anclas) {
            var pos = posicion(a, tipo === 'footer');
            var blip = a.match(/<a:blip [^>]*r:embed="([^"]+)"/);
            if (blip) {
                var r = relsParte.match(new RegExp('<Relationship [^>]*Id="' + blip[1] + '"[^>]*/>')), t = r && r[0].match(/Target="([^"]+)"/);
                var img = t && zip.file('word/' + t[1].replace(/^\.\.\//, '').replace(/^\.?\//, ''));
                // Solo la imagen que cubre casi toda la hoja es el membrete de fondo
                if (img && pos.w >= pag[0] * 0.8 && pos.h >= pag[1] * 0.8 && !out.fondo) {
                    out.fondo = Object.assign({ bytes: await img.async('uint8array'), tipo: /\.png$/i.test(t[1]) ? 'png' : 'jpg' }, pos);
                }
                continue;
            }
            var caja = a.match(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/);
            if (!caja) continue;
            var lineas = (caja[1].match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(function (p) {
                return (p.match(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); }).join('');
            }).filter(function (l) { return l.trim(); });
            if (!lineas.length) continue;
            var color = (caja[1].match(/<w:color w:val="([0-9A-Fa-f]{6})"/) || [])[1] || '000000';
            out.textos.push(Object.assign({ lineas: lineas.map(desXml), tam: num(caja[1], /<w:sz w:val="(\d+)"/, 16) / 2, color: color }, pos));
        }
    }
    return out;
}
function desXml(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }

// ---------- Guardado en el equipo (IndexedDB: el formato puede pesar más de lo que cabe en localStorage) ----------
var BASE = 'descuentos_equipo', ALMACEN = 'archivos';
function abrir() {
    return new Promise(function (ok, mal) {
        if (typeof indexedDB === 'undefined') return mal(new Error('este navegador no guarda archivos'));
        var r = indexedDB.open(BASE, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(ALMACEN); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { mal(r.error || new Error('no se pudo abrir el almacén del equipo')); };
    });
}
export async function guardarArchivo(clave, valor) {
    var db = await abrir();
    return new Promise(function (ok, mal) {
        var tx = db.transaction(ALMACEN, 'readwrite');
        if (valor == null) tx.objectStore(ALMACEN).delete(clave); else tx.objectStore(ALMACEN).put(valor, clave);
        tx.oncomplete = function () { db.close(); ok(); };
        tx.onerror = function () { db.close(); mal(tx.error); };
    });
}
export async function leerArchivo(clave) {
    try {
        var db = await abrir();
        return await new Promise(function (ok) {
            var r = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(clave);
            r.onsuccess = function () { db.close(); ok(r.result || null); };
            r.onerror = function () { db.close(); ok(null); };
        });
    } catch (e) { return null; }
}
