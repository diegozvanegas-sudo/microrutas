// Unir, ordenar y comprimir PDF, todo en el equipo: los archivos no salen a ningún servidor. pdf-lib se carga solo al usarlo.
// Comprimir reduce las fotos JPG que trae el PDF: un PDF de solo texto casi no baja.

export var NIVELES = { no: null, media: { lado: 1600, calidad: 0.7 }, alta: { lado: 1100, calidad: 0.5 } };

export function textoTamano(bytes) {
    return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

// "1-3, 5, 2" -> índices [0, 1, 2, 4, 1]: en ese orden, y una página puede repetirse. Vacío: todas. Con error: null
export function leerPaginas(texto, total) {
    texto = String(texto || '').trim();
    if (!texto) return Array.from({ length: total }, function (_, i) { return i; });
    var out = [];
    var bien = texto.split(/[,;\s]+/).filter(Boolean).every(function (p) {
        var m = /^(\d+)(?:-(\d+))?$/.exec(p);
        if (!m) return false;
        var a = +m[1], b = m[2] ? +m[2] : a;
        if (a < 1 || b < 1 || a > total || b > total) return false;
        for (var i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) out.push(i - 1);
        return true;
    });
    return bien && out.length ? out : null;
}

export function medidaNueva(ancho, alto, lado) {
    var f = Math.min(1, lado / Math.max(ancho, alto));
    return [Math.max(1, Math.round(ancho * f)), Math.max(1, Math.round(alto * f))];
}

// Vuelve a guardar las fotos JPG del PDF, más pequeñas. Las que no bajan de peso, o no se pueden leer, quedan como estaban
async function comprimirFotos(doc, nivel, lib, avance) {
    var { PDFName, PDFRawStream, PDFNumber } = lib, n = function (s) { return PDFName.of(s); };
    var fotos = doc.context.enumerateIndirectObjects().filter(function (par) {
        var o = par[1];
        if (!(o instanceof PDFRawStream) || o.dict.get(n('Subtype')) !== n('Image')) return false;
        var filtro = o.dict.lookup(n('Filter')), solo = filtro && filtro.size && filtro.size() === 1 ? filtro.lookup(0) : filtro;
        return solo === n('DCTDecode') && o.dict.get(n('ColorSpace')) !== n('DeviceCMYK');
    });
    for (var i = 0; i < fotos.length; i++) {
        if (avance) avance('Comprimiendo foto ' + (i + 1) + ' de ' + fotos.length + '…');
        var ref = fotos[i][0], foto = fotos[i][1];
        try {
            var bmp = await createImageBitmap(new Blob([foto.contents], { type: 'image/jpeg' }));
            var [w, h] = medidaNueva(bmp.width, bmp.height, nivel.lado);
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
            bmp.close();
            var blob = await new Promise(function (r) { canvas.toBlob(r, 'image/jpeg', nivel.calidad); });
            var nuevos = new Uint8Array(await blob.arrayBuffer());
            if (nuevos.length >= foto.contents.length) continue;
            var dict = foto.dict.clone(doc.context);
            dict.set(n('Width'), PDFNumber.of(w));
            dict.set(n('Height'), PDFNumber.of(h));
            dict.set(n('BitsPerComponent'), PDFNumber.of(8));
            dict.set(n('ColorSpace'), n('DeviceRGB'));
            dict.set(n('Filter'), n('DCTDecode'));
            dict.delete(n('Decode'));
            dict.delete(n('DecodeParms'));
            dict.set(n('Length'), PDFNumber.of(nuevos.length));
            doc.context.assign(ref, PDFRawStream.of(dict, nuevos));
        } catch (e) { console.warn('Foto sin comprimir', e); }
    }
    return fotos.length;
}

export async function contarPaginas(archivo) {
    var { PDFDocument } = await import('pdf-lib');
    var doc = await PDFDocument.load(await archivo.arrayBuffer(), { ignoreEncryption: false, updateMetadata: false });
    return doc.getPageCount();
}

// archivos: [{ archivo, paginas: [índices] }] en el orden final. -> { bytes, fotos }
export async function armarPdf(archivos, nivelClave, avance) {
    var lib = await import('pdf-lib'), { PDFDocument } = lib, salida = await PDFDocument.create(), nivel = NIVELES[nivelClave];
    for (var i = 0; i < archivos.length; i++) {
        if (avance) avance('Uniendo ' + (i + 1) + ' de ' + archivos.length + '…');
        var doc = await PDFDocument.load(await archivos[i].archivo.arrayBuffer(), { updateMetadata: false });
        (await salida.copyPages(doc, archivos[i].paginas)).forEach(function (p) { salida.addPage(p); });
    }
    var fotos = nivel ? await comprimirFotos(salida, nivel, lib, avance) : 0;
    if (avance) avance('Guardando…');
    return { bytes: await salida.save({ useObjectStreams: true }), fotos: fotos };
}
