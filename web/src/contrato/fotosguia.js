// 📷 Fotos de campo de la Guía de campo (contrato.html?doc=GUIA-CAMPO): fotos reales que sube el equipo en cada punto de
// «Lote ejecutado» y «Durante la operación», marcadas como ✅ bien o ❌ mal. Van al almacenamiento PRIVADO «fotos-guia» de
// Supabase (migración 0026_fotos_guia.sql): solo con sesión y permiso de contrato; no se borran solas (no son los anexos
// de 30 días de Requerimientos). Cada foto se sube dos veces: grande (1.600 px) y miniatura (360 px, carpeta min/).
//   <sección>/<punto>/<marca>-<bien|mal>_<qué se ve>.jpg      y      <sección>/<punto>/min/<mismo nombre>
import { slug } from './dibujos.js';

export var BUCKET = 'fotos-guia';
export var SECCIONES_FOTOS = ['items-ejecutado', 'items-operacion'];
export var SIN_ACTIVAR = 'El almacenamiento de fotos todavía no está activado (falta la migración 0026_fotos_guia.sql en Supabase).';

export function carpetaPunto(seccion, clave) { return slug(seccion) + '/' + slug(clave); }
// El texto de la foto va en el nombre del archivo en base64url (UTF-8), para que conserve tildes y eñes:
// los nombres del almacenamiento solo aceptan letras sin tilde. 'n' + base64url; los nombres viejos con guiones se leen igual.
function aB64(t) { var b = ''; new TextEncoder().encode(t).forEach(function (x) { b += String.fromCharCode(x); }); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function deB64(t) {
    try { var b = atob(t.replace(/-/g, '+').replace(/_/g, '/')), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder().decode(u); } catch (e) { return ''; }
}
// nota: lo que se ve en la foto (opcional, hasta 70 letras); tipo: 'bien' | 'mal'
export function nombreFoto(nota, tipo, ahora) {
    var t = tipo === 'bien' ? 'bien' : 'mal', n = String(nota || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    return (ahora || Date.now()).toString(36) + '-' + t + '_' + (n ? 'n' + aB64(n) : 'foto') + '.jpg';
}
// 'mk2x9-mal_nUGxhdGVv….jpg' → { tipo: 'mal', nota: 'Plateo …', fecha: Date }
export function leerNombre(nombre) {
    var m = /^([a-z0-9]+)-(bien|mal)_(.*)\.jpg$/i.exec(String(nombre || ''));
    if (!m) return null;
    var ms = parseInt(m[1], 36), r = m[3];
    var nota = r === 'foto' ? '' : /^n[A-Za-z0-9_-]+$/.test(r) && deB64(r.slice(1)) ? deB64(r.slice(1)) : r.replace(/-/g, ' ');
    return { tipo: m[2].toLowerCase(), nota: nota, fecha: isFinite(ms) ? new Date(ms) : null };
}
// Cuántas bien y cuántas mal
export function contar(fotos) {
    return (fotos || []).reduce(function (c, f) { c[f.tipo === 'bien' ? 'bien' : 'mal']++; c.total++; return c; }, { total: 0, bien: 0, mal: 0 });
}

function fallo(error) {
    var m = String((error && (error.message || error.error)) || '');
    if (/bucket not found|not found/i.test(m)) return new Error(SIN_ACTIVAR);
    if (/row-level security|unauthorized|not authorized|permission/i.test(m)) return new Error('Su usuario no tiene permiso para esto (solo quien subió la foto o un administrador la puede borrar).');
    if (/exceeded|too large|maximum allowed size/i.test(m)) return new Error('La foto pesa demasiado (máximo 5 MB).');
    if (/failed to fetch|network/i.test(m)) return new Error('Sin conexión: revise la señal y vuelva a intentar.');
    return new Error('No se pudo: ' + (m || 'revise la conexión') + '.');
}

export function crearFotosGuia(supabase) {
    function caja() { if (!supabase) throw new Error('Las fotos necesitan la base de datos.'); return supabase.storage.from(BUCKET); }
    var api = {
        // carpetas: ['items-ejecutado/plateo', …] → { carpeta: [{ ruta, min, nombre, tipo, nota, fecha }] } (las más nuevas primero)
        listar: async function (carpetas) {
            var out = {}, cola = (carpetas || []).filter(Boolean);
            for (var i = 0; i < cola.length; i += 8) {
                var res = await Promise.all(cola.slice(i, i + 8).map(function (c) { return caja().list(c, { limit: 200, sortBy: { column: 'name', order: 'desc' } }); }));
                res.forEach(function (r, k) {
                    if (r.error) throw fallo(r.error);
                    var c = cola[i + k];
                    out[c] = (r.data || []).filter(function (f) { return f.id !== null && leerNombre(f.name); }).map(function (f) {
                        var x = leerNombre(f.name);
                        return { ruta: c + '/' + f.name, min: c + '/min/' + f.name, nombre: f.name, tipo: x.tipo, nota: x.nota, fecha: x.fecha };
                    });
                });
            }
            return out;
        },
        // Direcciones firmadas (1 hora) para ver las fotos: rutas → { ruta: url }
        urls: async function (rutas) {
            var out = {}, lista = (rutas || []).filter(Boolean);
            if (!lista.length) return out;
            var r = await caja().createSignedUrls(lista, 3600);
            if (r.error) throw fallo(r.error);
            (r.data || []).forEach(function (x) { if (x.signedUrl) out[x.path] = x.signedUrl; });
            return out;
        },
        subir: async function (carpeta, grande, mini, nota, tipo) {
            var nombre = nombreFoto(nota, tipo), ruta = carpeta + '/' + nombre;
            var r = await caja().upload(ruta, grande, { contentType: 'image/jpeg', upsert: false });
            if (r.error) throw fallo(r.error);
            // Sin miniatura la foto igual sirve (se muestra la grande)
            await caja().upload(carpeta + '/min/' + nombre, mini, { contentType: 'image/jpeg', upsert: false }).catch(function () {});
            var x = leerNombre(nombre);
            return { ruta: ruta, min: carpeta + '/min/' + nombre, nombre: nombre, tipo: x.tipo, nota: x.nota, fecha: x.fecha };
        },
        borrar: async function (foto) {
            var r = await caja().remove([foto.ruta, foto.min]);
            if (r.error) throw fallo(r.error);
            if (r.data && !r.data.length) throw new Error('Solo quien subió la foto o un administrador la puede borrar.');
        },
    };
    return api;
}

// Achica la foto (lado mayor «lado» px, JPEG) antes de subirla. Solo en el navegador.
export async function reducir(file, lado, calidad) {
    var bmp = await createImageBitmap(file), e = Math.min(1, lado / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * e); c.height = Math.round(bmp.height * e);
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    return new Promise(function (ok, mal) { c.toBlob(function (b) { if (b) ok(b); else mal(new Error('no se pudo leer la imagen')); }, 'image/jpeg', calidad || 0.85); });
}
