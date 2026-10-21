// Revisión de fotos con IA: reduce las fotos en el celular y las manda a la función de Netlify analizar-fotos.
import { supabase } from '../supabase.js';

export var MAX_FOTOS = 8;
// Lado mayor de 1568 px: lo que la IA aprovecha; más grande solo hace más lenta la subida
var LADO = 1568;

function cargarImagen(archivo) {
    return new Promise(function (listo, falla) {
        var url = URL.createObjectURL(archivo), img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); listo(img); };
        img.onerror = function () { URL.revokeObjectURL(url); falla(new Error('No se pudo abrir la foto ' + archivo.name + '.')); };
        img.src = url;
    });
}

// Devuelve el JPEG en base64 (sin el prefijo data:)
async function reducir(archivo) {
    var img = await cargarImagen(archivo);
    var escala = Math.min(1, LADO / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}

// archivos: FileList o arreglo de File. Devuelve { items: [{ item, valor, detalle }], observaciones, calidad_fotos }
export async function revisarFotos(archivos, items, tipo, lote) {
    var lista = Array.prototype.slice.call(archivos);
    if (!lista.length) throw new Error('Adjunte al menos una foto.');
    if (lista.length > MAX_FOTOS) throw new Error('Máximo ' + MAX_FOTOS + ' fotos por revisión.');
    if (!navigator.onLine) throw new Error('La revisión con fotos necesita internet.');
    var fotos = await Promise.all(lista.map(reducir));
    var sesion = supabase ? (await supabase.auth.getSession()).data.session : null;
    var res = await fetch('/.netlify/functions/analizar-fotos', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (sesion ? sesion.access_token : '') },
        body: JSON.stringify({ fotos: fotos, items: items, tipo: tipo, lote: lote })
    });
    var datos = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(datos.error || (res.status === 404 ? 'La revisión con fotos solo funciona en la página publicada en Netlify.' : 'No se pudo revisar las fotos (' + res.status + ').'));
    return datos;
}
