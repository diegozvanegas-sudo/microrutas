// ZIP a PDF: cada .zip de fotos queda en un PDF con una imagen por página (como zips_a_pdf.py), todo en el celular.
// Las fotos JPG van tal cual (sin perder calidad); las demás se pasan a JPG sobre fondo blanco (el PDF no tiene transparencia).
// JSZip y pdf-lib se cargan solo al usarlo.

var EXTENSIONES = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff'];

// 'pag2' antes que 'pag10'
export function ordenNatural(a, b) { return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }); }

export function esImagen(nombre) {
    var partes = nombre.split('/'), archivo = partes[partes.length - 1];
    if (partes.indexOf('__MACOSX') !== -1 || !archivo || archivo.charAt(0) === '.') return false;
    return EXTENSIONES.indexOf(archivo.split('.').pop().toLowerCase()) !== -1;
}

function esJpg(bytes) { return bytes[0] === 0xFF && bytes[1] === 0xD8; }

// Orientación EXIF de un JPG (1 = derecha). Las fotos del celular la traen y el PDF no la respeta: esas se enderezan.
export function orientacion(b) {
    var i = 2;
    while (i + 4 < b.length && b[i] === 0xFF) {
        var marca = b[i + 1], largo = (b[i + 2] << 8) | b[i + 3];
        if (marca === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
            var t = i + 10, le = b[t] === 0x49;
            var u16 = function (o) { return le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1]; };
            var ifd = le ? (b[t + 4] | (b[t + 5] << 8) | (b[t + 6] << 16)) : ((b[t + 5] << 16) | (b[t + 6] << 8) | b[t + 7]);
            for (var n = u16(ifd), k = 0; k < n; k++) if (u16(ifd + 2 + k * 12) === 0x0112) return u16(ifd + 2 + k * 12 + 8);
            return 1;
        }
        if (marca === 0xDA) break; // empiezan los datos de la imagen
        i += 2 + largo;
    }
    return 1;
}

// Imagen que no es JPG (o JPG girado) -> JPG derecho con fondo blanco, por el navegador (TIFF solo lo abre Safari)
async function aJpg(bytes) {
    var bmp = await createImageBitmap(new Blob([bytes]));
    var c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    var g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0);
    bmp.close();
    var blob = await new Promise(function (listo) { c.toBlob(listo, 'image/jpeg', 0.92); });
    return new Uint8Array(await blob.arrayBuffer());
}

// archivo: File .zip. alAvanzar(hecho, total). Devuelve { pdf: Uint8Array | null, paginas, omitidas: [nombres] }
async function unZip(JSZip, PDFDocument, archivo, alAvanzar) {
    var zip = await JSZip.loadAsync(archivo);
    var nombres = Object.keys(zip.files).filter(function (n) { return !zip.files[n].dir && esImagen(n); }).sort(ordenNatural);
    var pdf = await PDFDocument.create(), omitidas = [];
    for (var i = 0; i < nombres.length; i++) {
        try {
            var bytes = await zip.files[nombres[i]].async('uint8array');
            var img = await pdf.embedJpg(esJpg(bytes) && orientacion(bytes) === 1 ? bytes : await aJpg(bytes));
            // Página del tamaño de la foto (1 px = 1 punto), igual que Pillow
            pdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        } catch (e) {
            omitidas.push(nombres[i].split('/').pop());
        }
        alAvanzar(i + 1, nombres.length);
    }
    var paginas = pdf.getPageCount();
    return { pdf: paginas ? await pdf.save() : null, paginas: paginas, omitidas: omitidas };
}

export function descargar(bytes, nombre, tipo) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: tipo }));
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// archivos: los .zip elegidos. informe(linea) va contando lo que pasa con cada uno.
// Un solo PDF se descarga directo; varios van juntos en PDFs.zip (el celular no deja bajar muchos a la vez).
export async function zipsAPdf(archivos, informe) {
    var [{ default: JSZip }, { PDFDocument }] = await Promise.all([import('jszip'), import('pdf-lib')]);
    var lista = Array.prototype.slice.call(archivos).sort(function (a, b) { return ordenNatural(a.name, b.name); }), hechos = [];
    for (var k = 0; k < lista.length; k++) {
        var f = lista[k], base = f.name.replace(/\.zip$/i, ''), pre = '[' + (k + 1) + '/' + lista.length + '] ' + f.name;
        informe(k, pre + ' · abriendo…');
        try {
            var r = await unZip(JSZip, PDFDocument, f, function (h, t) { informe(k, pre + ' · foto ' + h + ' de ' + t); });
            if (!r.pdf) { informe(k, pre + ' · sin imágenes, se omite', 'aviso'); continue; }
            hechos.push({ nombre: base + '.pdf', bytes: r.pdf });
            informe(k, pre + ' → ' + base + '.pdf (' + r.paginas + ' página' + (r.paginas === 1 ? '' : 's') + ')' +
                (r.omitidas.length ? ' · omitidas: ' + r.omitidas.join(', ') : ''), r.omitidas.length ? 'aviso' : 'ok');
        } catch (e) {
            informe(k, pre + ' · ERROR: ' + (/zip|central directory|signature/i.test(e.message) ? 'zip dañado, se omite' : e.message), 'error');
        }
    }
    if (hechos.length === 1) descargar(hechos[0].bytes, hechos[0].nombre, 'application/pdf');
    else if (hechos.length > 1) {
        var salida = new JSZip();
        hechos.forEach(function (h) { salida.file(h.nombre, h.bytes); });
        descargar(await salida.generateAsync({ type: 'uint8array' }), 'PDFs.zip', 'application/zip');
    }
    return { convertidos: hechos.length, total: lista.length };
}
