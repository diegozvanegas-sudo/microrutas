// Fotos a PDF: una o muchas fotos en un solo PDF, todo en el celular.
// Diseños: "completa" (página del tamaño de la foto, como ZIP a PDF), "carta1" y "carta4" (hoja carta con 1 o 4 fotos
// y un pie con nombre, fecha y hora de captura y coordenadas GPS sacadas de la foto). pdf-lib se carga solo al usarlo.
import { leerExif } from './exif.js';
import { ordenNatural, descargar } from './zippdf.js';

var CARTA = [612, 792], MARGEN = 36, PIE = 30;

// Datos de cada foto para listarlas antes de convertir (y avisar las que no tienen GPS o fecha)
export async function examinar(archivos) {
    var lista = [];
    for (var i = 0; i < archivos.length; i++) {
        var f = archivos[i], ex = { fecha: null, gps: null, orientacion: 1 };
        // Solo hace falta el comienzo del archivo para el EXIF
        try { ex = leerExif(new Uint8Array(await f.slice(0, 256 * 1024).arrayBuffer())); } catch (e) {}
        lista.push({ archivo: f, nombre: f.name, fecha: ex.fecha, gps: ex.gps });
    }
    return lista;
}

export function ordenar(lista, por) {
    return lista.slice().sort(function (a, b) {
        if (por === 'fecha') {
            // Sin fecha EXIF se usa la fecha del archivo; empates por nombre
            var fa = a.fecha || new Date(a.archivo.lastModified).toISOString().replace('T', ' ').slice(0, 19);
            var fb = b.fecha || new Date(b.archivo.lastModified).toISOString().replace('T', ' ').slice(0, 19);
            if (fa !== fb) return fa < fb ? -1 : 1;
        }
        return ordenNatural(a.nombre, b.nombre);
    });
}

// "2026-10-22 08:15:03" -> "22/10/2026 08:15"
export function fechaCorta(f) {
    var m = f && f.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : '';
}
export function pieDeFoto(n, foto) {
    return [n + '. ' + foto.nombre, foto.fecha ? fechaCorta(foto.fecha) : 'sin fecha de captura',
        foto.gps ? foto.gps.lat.toFixed(6) + ', ' + foto.gps.lon.toFixed(6) : 'sin GPS'].join('  ·  ');
}

// Rótulo grande sobre la foto (p. ej. "Lote 477 · Z2CC0257"): franja oscura abajo a la izquierda con letra blanca,
// alta como el 7 % del lado menor; si no cabe a lo ancho se achica
function rotular(g, w, h, texto) {
    var tam = Math.max(22, Math.round(Math.min(w, h) * 0.07)), pad = Math.round(tam * 0.4);
    g.font = 'bold ' + tam + 'px Arial, sans-serif';
    var ancho = g.measureText(texto).width;
    if (ancho > w - pad * 4) { tam = Math.max(12, Math.floor(tam * (w - pad * 4) / ancho)); g.font = 'bold ' + tam + 'px Arial, sans-serif'; ancho = g.measureText(texto).width; }
    var x = pad, y = h - pad - tam - pad * 2;
    g.fillStyle = 'rgba(0,0,0,0.62)';
    g.fillRect(x, y, ancho + pad * 2, tam + pad * 2);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.fillText(texto, x + pad, y + pad + tam / 2 + tam * 0.04);
}

// La foto derecha (respeta la orientación) en JPG; si reducir, el lado mayor queda en máximo 1600 px
async function prepararJpg(archivo, reducir, rotulo) {
    var bmp = await createImageBitmap(archivo);
    var escala = reducir ? Math.min(1, 1600 / Math.max(bmp.width, bmp.height)) : 1;
    var c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    var g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    if (rotulo) rotular(g, c.width, c.height, rotulo);
    var blob = await new Promise(function (listo) { c.toBlob(listo, 'image/jpeg', reducir ? 0.82 : 0.92); });
    return new Uint8Array(await blob.arrayBuffer());
}

// Cabe la imagen en una caja sin deformarla, centrada
function encajar(img, x, y, w, h) {
    var e = Math.min(w / img.width, h / img.height), iw = img.width * e, ih = img.height * e;
    return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih };
}

// fotos: lista ya ordenada (de examinar). opciones: { diseno, reducir, nombre, rotulo }. informe(hechas, total)
export async function fotosAPdf(fotos, opciones, informe) {
    var { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    var pdf = await PDFDocument.create(), letra = await pdf.embedFont(StandardFonts.Helvetica);
    var porHoja = opciones.diseno === 'carta4' ? 4 : 1, omitidas = [], pagina = null;
    for (var i = 0; i < fotos.length; i++) {
        try {
            var img = await pdf.embedJpg(await prepararJpg(fotos[i].archivo, opciones.reducir, opciones.rotulo));
            if (opciones.diseno === 'completa') {
                pdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            } else {
                var k = (i - omitidas.length) % porHoja;
                if (k === 0) pagina = pdf.addPage(CARTA);
                var anchoUtil = CARTA[0] - MARGEN * 2, altoUtil = CARTA[1] - MARGEN * 2;
                var col = porHoja === 4 ? k % 2 : 0, fila = porHoja === 4 ? Math.floor(k / 2) : 0, celdas = porHoja === 4 ? 2 : 1;
                var w = (anchoUtil - (celdas - 1) * 12) / celdas, h = (altoUtil - (celdas - 1) * 12) / celdas;
                var x = MARGEN + col * (w + 12), yTop = CARTA[1] - MARGEN - fila * (h + 12);
                // La foto arriba de su celda y el pie justo debajo de la foto (no al fondo de la celda)
                var caja = encajar(img, x, yTop - h + PIE, w, h - PIE);
                caja.y = yTop - caja.height;
                pagina.drawImage(img, caja);
                // Pie: nombre · fecha y hora · GPS (en dos líneas si no cabe)
                var tam = porHoja === 4 ? 7.5 : 9.5, texto = pieDeFoto(i + 1 - omitidas.length, fotos[i]), lineas = [texto];
                if (letra.widthOfTextAtSize(texto, tam) > w) { var p = texto.split('  ·  '); lineas = [p[0], p.slice(1).join('  ·  ')]; }
                lineas.forEach(function (l, n) {
                    while (letra.widthOfTextAtSize(l, tam) > w && l.length > 8) l = l.slice(0, -2);
                    pagina.drawText(l, { x: caja.x, y: caja.y - tam - 4 - n * (tam + 2), size: tam, font: letra, color: rgb(0.2, 0.25, 0.3) });
                });
            }
        } catch (e) {
            omitidas.push(fotos[i].nombre);
        }
        informe(i + 1, fotos.length);
    }
    var paginas = pdf.getPageCount();
    if (!paginas) return { paginas: 0, omitidas: omitidas };
    var nombre = (opciones.nombre || 'Fotos').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '') + '.pdf';
    descargar(await pdf.save(), nombre, 'application/pdf');
    return { paginas: paginas, omitidas: omitidas, nombre: nombre };
}
