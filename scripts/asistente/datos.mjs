// 🤖 Pregúntale a Claude: lo que no toca la base ni el PC (para probarlo con npm test en web/).
// - Resumen de las capas del mapa rápido (web/public/data/rapido/capa_*.js) en filas legibles: nombre, zona EMV y comuna
//   (por punto en polígono), coordenadas y extensión. Así Claude las lee con Read/Grep sin descifrar la geometría.
// - El texto que se le pasa a Claude (instrucciones, pregunta e historial) y el error en palabras.

export var MODELOS = { rapido: 'claude-sonnet-5-5', fondo: 'claude-opus-5-5' };

// Geometría compacta (tools/generar_mapa_rapido): enteros ×1e6, el primer punto absoluto y luego diferencias → [[lon, lat]]
export function decodificar(plano) {
    var x = 0, y = 0, out = [];
    for (var i = 0; i + 1 < plano.length; i += 2) { x += plano[i]; y += plano[i + 1]; out.push([x / 1e6, y / 1e6]); }
    return out;
}
function dentroAnillo(p, anillo) {
    var c = false;
    for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
        var a = anillo[i], b = anillo[j];
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
}
// poligonos: [{ n, anillos: [[[lon, lat]…] (exterior), …huecos], … }] (de prepararPoligonos)
export function prepararPoligonos(capa) {
    return ((capa && capa.items) || []).map(function (it) {
        return { n: it.n, partes: (it.g || []).map(function (pol) { return pol.map(decodificar); }) };
    });
}
export function enCual(p, poligonos) {
    for (var k = 0; k < poligonos.length; k++) {
        if (poligonos[k].partes.some(function (pol) { return pol.length && dentroAnillo(p, pol[0]) && !pol.slice(1).some(function (h) { return dentroAnillo(p, h); }); })) return poligonos[k].n;
    }
    return '';
}
function puntosDe(it, tipo) {
    if (tipo === 'punto') return [[it.g[0] / 1e6, it.g[1] / 1e6]];
    if (tipo === 'linea') return (it.g || []).flatMap(decodificar);
    return (it.g || []).flatMap(function (pol) { return pol.length ? decodificar(pol[0]) : []; });
}
var r5 = function (v) { return Math.round(v * 1e5) / 1e5; };
// Una fila por elemento de la capa. Para líneas y polígonos: el punto medio de sus vértices y la caja que los contiene
export function resumirCapa(capa, zonas, comunas) {
    return ((capa && capa.items) || []).map(function (it) {
        var ps = puntosDe(it, capa.tipo);
        if (!ps.length) return null;
        var lon = ps.reduce(function (s, p) { return s + p[0]; }, 0) / ps.length, lat = ps.reduce(function (s, p) { return s + p[1]; }, 0) / ps.length;
        var fila = { nombre: it.n };
        if (it.z) fila.dato = it.z;
        if (it.d) fila.direccion = it.d;
        if (it.j) fila.jornada = it.j;
        fila.zona_emv = enCual([lon, lat], zonas || []);
        fila.comuna = enCual([lon, lat], comunas || []);
        fila.lat = r5(lat); fila.lon = r5(lon);
        if (capa.tipo !== 'punto') {
            var xs = ps.map(function (p) { return p[0]; }), ys = ps.map(function (p) { return p[1]; });
            fila.caja = [r5(Math.min.apply(null, ys)), r5(Math.min.apply(null, xs)), r5(Math.max.apply(null, ys)), r5(Math.max.apply(null, xs))];
        }
        return fila;
    }).filter(Boolean);
}

// Filas a CSV (para Grep: una fila por línea)
export function aCsv(filas) {
    if (!filas.length) return '';
    var cols = Object.keys(filas.reduce(function (t, f) { return Object.assign(t, f); }, {}));
    var celda = function (v) { v = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return cols.join(',') + '\n' + filas.map(function (f) { return cols.map(function (c) { return celda(f[c]); }).join(','); }).join('\n') + '\n';
}
export function aJsonl(filas) { return filas.map(function (f) { return JSON.stringify(f); }).join('\n') + (filas.length ? '\n' : ''); }

// Instrucciones fijas (van como --append-system-prompt-file)
export function instrucciones(op) {
    return [
        'Eres el asistente de la interventoría de EMVARIAS (aseo: limpieza vial LV, recolección y transporte RyT, y corte de césped de zonas verdes) en Medellín.',
        'Te escribe ' + (op.nombre || 'un interventor') + ' desde la app de microrrutas. Hoy es ' + op.hoy + ' (' + op.diaSemana + ').',
        'Responde SIEMPRE en español sencillo, directo y sin complacencia: si algo no se puede afirmar con los datos, dilo.',
        'Trabaja SOLO con los archivos de la carpeta actual (lee primero LEEME.md con Read; usa Grep y Glob para buscar). No inventes rutas, puntos, cláusulas ni cifras.',
        'Cuando cites el contrato o un convenio, di el documento y la página (campo ref). Cuando des un sitio, da la dirección y, si sirve, un enlace https://www.google.com/maps/dir/lat,lon/lat,lon con las coordenadas de los archivos.',
        'Para ubicar cosas por zona usa la columna zona_emv de los archivos de mapa/ (se calculó con el polígono de cada zona): p. ej. un recorrido de verificación por zona se arma con sus puntos críticos (mapa/puntos_criticos.csv), sus rutas y sus lotes, ordenados para no devolverse.',
        'Si la pregunta pide un texto para enviar (reporte, mensaje, requerimiento), entrégalo listo para pegar en WhatsApp, sin tablas de Markdown.',
        'Al final, en una línea, di de qué archivos salió la respuesta y qué faltó en los datos (si faltó algo).',
        op.contrato ? '' : 'Esta persona NO tiene permiso para ver el contrato ni los convenios: si pregunta por ellos, dile que pida el permiso al administrador.'
    ].filter(Boolean).join('\n');
}
// Pregunta con el historial de la conversación (lo anterior del mismo hilo, ya respondido)
export function armarPrompt(texto, historial) {
    var previo = (historial || []).filter(function (h) { return h.estado === 'lista'; }).slice(-6);
    return (previo.length ? 'Conversación hasta ahora:\n\n' + previo.map(function (h) {
        return 'PREGUNTA: ' + h.texto + '\nRESPUESTA: ' + String(h.respuesta || '').slice(0, 6000);
    }).join('\n\n') + '\n\nNueva pregunta:\n' : '') + String(texto || '').trim();
}

// Salida de `claude -p --output-format json` → { ok, texto } (texto = respuesta o error en palabras)
export function leerSalida(stdout, stderr, codigo) {
    var s = String(stdout || '').trim(), datos = {};
    try { datos = s ? JSON.parse(s.slice(s.indexOf('{'))) : {}; } catch (e) { datos = { result: s, is_error: true }; }
    var texto = String(datos.result || stderr || '').trim();
    if (!datos.is_error && codigo === 0 && texto) return { ok: true, texto: texto };
    var bajo = texto.toLowerCase();
    if (/usage limit|limit reached|rate limit|limite de uso|hit your limit/.test(bajo)) return { ok: false, texto: 'Se acabó el uso del plan de Claude por ahora. Vuelva a preguntar cuando se renueve (Claude lo dice en el PC).' };
    if (/credit balance/.test(bajo)) return { ok: false, texto: 'Claude Code del PC está con una cuenta de API sin saldo, no con el plan. En el PC: claude → /logout → /login con la cuenta del plan.' };
    if (/not logged in|login|authenticat|oauth|sesión/.test(bajo)) return { ok: false, texto: 'Claude Code del PC no tiene sesión iniciada. En el PC escriba  claude  en una consola e inicie sesión; luego vuelva a preguntar.' };
    return { ok: false, texto: 'Claude no pudo responder' + (texto ? ': ' + texto.slice(0, 400) : ' (sin detalle).') + ' Intente de nuevo.' };
}
