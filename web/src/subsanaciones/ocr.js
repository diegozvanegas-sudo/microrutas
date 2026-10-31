// Imágenes a texto: lee el texto de una o muchas imágenes (fotos, pantallazos) en este equipo con Tesseract (español).
// El lector se descarga la primera vez (~5 MB) y lee las imágenes una tras otra con el mismo trabajador.

var TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

function cargarScript(src) {
    return new Promise(function (ok, mal) {
        var s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = function () { mal(new Error('No se pudo descargar el lector (revise la conexión).')); };
        document.head.appendChild(s);
    });
}

// Las imágenes pequeñas (pantallazos recortados) se leen mejor al doble de tamaño
function agrandar(file) {
    return new Promise(function (ok) {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
            URL.revokeObjectURL(url);
            if (img.naturalWidth >= 1400) return ok(file);
            var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
            cv.width = img.naturalWidth * 2; cv.height = img.naturalHeight * 2;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            ok(cv);
        };
        img.onerror = function () { URL.revokeObjectURL(url); ok(file); };
        img.src = url;
    });
}

// Orden por nombre como lo ve una persona: foto2 antes que foto10
export function ordenarPorNombre(files) {
    return files.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }); });
}

// files -> [{ nombre, texto, error }]; alAvanzar(hecho, total, nombre) mientras lee
export async function leerImagenes(files, alAvanzar) {
    if (!window.Tesseract) await cargarScript(TESSERACT);
    var worker = await window.Tesseract.createWorker('spa'), out = [];
    try {
        for (var i = 0; i < files.length; i++) {
            if (alAvanzar) alAvanzar(i, files.length, files[i].name);
            try {
                var r = await worker.recognize(await agrandar(files[i]));
                var texto = r.data.text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
                out.push({ nombre: files[i].name, texto: texto, error: texto ? '' : 'Sin texto' });
            } catch (e) {
                out.push({ nombre: files[i].name, texto: '', error: (e && e.message) || 'No se pudo leer' });
            }
        }
    } finally {
        worker.terminate();
    }
    return out;
}
