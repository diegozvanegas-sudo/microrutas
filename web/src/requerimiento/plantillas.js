// Plantillas de requerimiento (documento REQ-PLANTILLAS de public.convenio_secciones, cargado con npm run guia desde
// datos/contrato/requerimientos.json, fuera del repositorio): datos fijos, ANS literales y un tipo de falencia por plantilla.

// filas de la tabla → { config: { clave: [valores] }, ans: { '2': texto }, plantillas: [...], catalogo: [{ ref, t }] }
export function leerPlantillas(filas) {
    var config = {}, ans = {}, plantillas = [], catalogo = [];
    (filas || []).slice().sort(function (a, b) { return a.orden - b.orden; }).forEach(function (s) {
        if (s.tipo === 'config') s.items.forEach(function (it) { (config[it.clave] = config[it.clave] || []).push(it.t); });
        else if (s.id === 'ans') s.items.forEach(function (it) { var n = String(it.clave).replace(/\D/g, ''); if (n) ans[n] = it.t; });
        else if (s.tipo === 'plantilla') {
            var p = { id: s.id, nombre: s.titulo, icono: s.icono || '', tipo: 'Hallazgo', asunto: '', descripcion: '', obligaciones: [], ans: [], solicitudes: [], plazo: null };
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
// Fechas aaaa-mm-dd → «12/08/2026» o «01/09/2026 - 02/09/2026»
export function fechaEvento(desde, hasta) {
    var t = function (s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
    var a = t(desde), b = t(hasta);
    return a && b && b !== a ? a + ' - ' + b : a || b;
}
