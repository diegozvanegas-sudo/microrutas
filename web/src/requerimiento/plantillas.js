// Plantillas de requerimiento (documento REQ-PLANTILLAS de public.convenio_secciones, cargado con npm run guia desde
// datos/contrato/requerimientos.json, fuera del repositorio): datos fijos, ANS literales y un tipo de falencia por plantilla.

// filas de la tabla → { config: { clave: [valores] }, ans: { '2': texto }, plantillas: [...], catalogo: [{ ref, t }] }
export function leerPlantillas(filas) {
    var config = {}, ans = {}, plantillas = [], catalogo = [];
    (filas || []).slice().sort(function (a, b) { return a.orden - b.orden; }).forEach(function (s) {
        if (s.tipo === 'config') s.items.forEach(function (it) { (config[it.clave] = config[it.clave] || []).push(it.t); });
        else if (s.id === 'ans') s.items.forEach(function (it) { var n = String(it.clave).replace(/\D/g, ''); if (n) ans[n] = it.t; });
        else if (s.tipo === 'plantilla') {
            // constancia: párrafo después de la tabla de microrrutas · evidencias: títulos de los grupos, uno por renglón
            var p = { id: s.id, nombre: s.titulo, icono: s.icono || '', tipo: 'Hallazgo', asunto: '', descripcion: '', constancia: '', evidencias: '',
                obligaciones: [], ans: [], solicitudes: [], plazo: null };
            s.items.forEach(function (it) {
                if (it.clave === 'obligacion') p.obligaciones.push({ ref: it.ref || '', t: it.t });
                else if (it.clave === 'solicitud') p.solicitudes.push({ t: it.t, ej: it.ej || '' });
                else if (it.clave === 'ans') p.ans = numerosAns(it.t);
                else if (it.clave === 'plazo') p.plazo = Number(it.t) || null;
                else if (it.clave in p) p[it.clave] = it.t;
            });
            p.obligaciones.forEach(function (o) {
                if (!catalogo.some(function (c) { return c.ref === o.ref && c.t === o.t; })) catalogo.push({ ref: o.ref, t: o.t });
            });
            plantillas.push(p);
        }
    });
    return { config: config, ans: ans, plantillas: plantillas, catalogo: catalogo };
}
// "2, 3, 12 y 29" → ['2', '3', '12', '29'] (sin repetir)
export function numerosAns(t) {
    return String(t || '').split(/[^\d]+/).filter(Boolean).filter(function (n, i, a) { return a.indexOf(n) === i; });
}
// "NOMBRE|Cargo" → { nombre, cargo }
export function firma(t) { var p = String(t || '').split('|'); return { nombre: (p[0] || '').trim(), cargo: (p[1] || '').trim() }; }
// Texto con {clave} reemplazadas
export function rellenar(t, datos) { return String(t || '').replace(/\{(\w+)\}/g, function (m, k) { return datos[k] != null ? datos[k] : m; }); }
// Lo que quedó por llenar: [texto entre corchetes]
export function pendientes(textos) {
    var out = [];
    textos.forEach(function (t) { (String(t || '').match(/\[[^\]\n]{3,}\]/g) || []).forEach(function (m) { if (out.indexOf(m) === -1) out.push(m); }); });
    return out;
}
// Tipos de novedad de la tabla de microrrutas (botones rápidos); se puede escribir cualquier otro
export var TIPOS_NOVEDAD = ['Limpieza previa', 'Limpieza manual de árboles', 'Corte de césped: disparejo/altura', 'Bordeo',
    'Recolección y disposición de residuos', 'Barrido', 'Sectores sin intervenir'];

// «16/10/2026», «16-10-26», «2026-10-16» → «2026-10-16» ('' si no es fecha)
export function fechaIso(t) {
    var s = String(t || '').trim(), m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = s.match(/^(\d{1,2})[/_.-](\d{1,2})[/_.-](\d{2}|\d{4})$/);
    if (!m || +m[2] > 12 || +m[1] > 31) return '';
    return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}
// «barrido de zona verde.» → «Barrido de zona verde»
function tipoLimpio(t) {
    t = String(t || '').replace(/^[\s•·▪●◦\-–*>➢]+/, '').replace(/[\s.;,]+$/, '').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
// Texto pegado (de Excel o del mensaje de WhatsApp) → filas { micro, fecha: 'aaaa-mm-dd', tipos: [] }.
// Cada renglón con un código de microrruta (Z4CC0159) abre una fila; la fecha y las novedades pueden venir en el mismo
// renglón (separadas por tabulador, «;», «|» o «•») o en los renglones siguientes (viñetas del mensaje de WhatsApp).
export function leerFilasNovedades(texto) {
    var filas = [], ultima = null;
    String(texto || '').split(/\r?\n/).forEach(function (renglon) {
        var r = renglon.trim();
        if (!r) return;
        var mm = r.match(/\bZ\s*(\d{1,2})\s*CC\s*(\d{3,5})\b/i);
        if (mm) {
            ultima = { micro: 'Z' + mm[1] + 'CC' + mm[2], fecha: '', tipos: [] };
            filas.push(ultima);
            r = r.replace(mm[0], ' ').replace(/^\s*\(\s*\d+\s*\)/, ' ');   // el número de lote entre paréntesis no es novedad
        }
        if (!ultima) return;
        r.split(/\t|;|\||•|·|▪|\s-\s/).forEach(function (parte) {
            var t = parte.trim();
            if (!t) return;
            var f = t.match(/\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/_.-]\d{1,2}[/_.-](?:\d{4}|\d{2}))\b/);
            if (f && fechaIso(f[1])) {
                if (!ultima.fecha) ultima.fecha = fechaIso(f[1]);
                t = t.replace(f[0], '').trim();
            }
            t = tipoLimpio(t);
            if (t && !/^(hoy|novedad(es)?( c\d+)?|buen(os|as) (d[ií]as|tardes|noches))$/i.test(t) && ultima.tipos.indexOf(t) === -1) ultima.tipos.push(t);
        });
    });
    return filas;
}
// Evidencias guardadas antes como «una por renglón» → grupos { titulo, texto }
export function gruposEvidencia(d) {
    if (d && Array.isArray(d.evidencias)) return d.evidencias.map(function (g) { return { titulo: g.titulo || '', texto: g.texto || '' }; });
    return String((d && d.evidenciasTexto) || '').split('\n').map(function (t) { return t.trim(); }).filter(Boolean)
        .map(function (t) { return { titulo: t, texto: '' }; });
}

// Fechas aaaa-mm-dd → «12/08/2026» o «01/09/2026 - 02/09/2026»
export function fechaEvento(desde, hasta) {
    var t = function (s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
    var a = t(desde), b = t(hasta);
    return a && b && b !== a ? a + ' - ' + b : a || b;
}
