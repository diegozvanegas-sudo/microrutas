// Búsqueda en todos los documentos del contrato a la vez (resumen del contrato, guía de campo, citas y ANS, convenios…),
// sin inteligencia artificial: se buscan las palabras escritas (sin tildes ni mayúsculas, todas deben estar, en cualquier
// orden) y se devuelven los puntos que las tienen, agrupados por documento y sección, con su página.
// Documento armado aquí: CITAS (ANS literales y citas del contrato que usan las plantillas de requerimiento).

export function plano(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
// Palabras de la búsqueda (sin las muy cortas que no dicen nada: de, la, el…)
var VACIAS = ['de', 'la', 'el', 'los', 'las', 'del', 'en', 'y', 'o', 'a', 'un', 'una', 'que', 'se', 'por', 'con', 'para', 'al', 'lo', 'es', 'debe', 'deben'];
export function palabras(q) {
    return plano(q).split(/[^a-z0-9ñ]+/).filter(function (p) { return p && (p.length > 2 || /\d/.test(p)) && VACIAS.indexOf(p) === -1; })
        .filter(function (p, i, a) { return a.indexOf(p) === i; });
}
// Raíz sencilla para que «supervisores» encuentre «supervisor» y «mallas» encuentre «malla»
function raiz(p) { return p.length > 4 ? p.replace(/(es|s)$/, '') : p; }

// Documento CITAS a partir de las filas de REQ-PLANTILLAS: ANS (tabla) y obligaciones agrupadas por numeral
export function documentoCitas(filas) {
    var ans = (filas || []).filter(function (s) { return s.id === 'ans'; })[0], porRef = {}, orden = [];
    (filas || []).filter(function (s) { return s.tipo === 'plantilla'; }).forEach(function (s) {
        s.items.filter(function (it) { return it.clave === 'obligacion'; }).forEach(function (it) {
            var ref = it.ref || 'Sin numeral';
            if (!porRef[ref]) { porRef[ref] = []; orden.push(ref); }
            if (porRef[ref].indexOf(it.t) === -1) porRef[ref].push(it.t);
        });
    });
    // Numerales en orden (7.3 antes que 7.10; las condiciones particulares al final)
    var clave = function (r) { var m = r.match(/^(\d+)\.(\d+)?/); return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 9999; };
    orden.sort(function (a, b) { return clave(a) - clave(b) || a.localeCompare(b); });
    var secciones = [{ id: '_documento', orden: 0, icono: '📨', titulo: 'Citas del contrato y ANS', tipo: 'meta', items: [{ t: 'Textos literales que usan los requerimientos de interventoría' }] }];
    if (ans) secciones.push({ id: 'ans', orden: 1, icono: '💸', titulo: 'ANS de la renovación 3 (comunicado de aceptación, numeral 6.8.1)', tipo: 'lista', items: ans.items.map(function (it) { return { clave: it.clave, t: it.t, ref: 'Comunicado págs. 2-4' }; }) });
    orden.forEach(function (ref, i) {
        var cp = /condiciones particulares/i.test(ref);
        secciones.push({ id: 'cita-' + i, orden: i + 2, icono: '📖', titulo: 'Numeral ' + ref, tipo: 'lista',
            items: porRef[ref].map(function (t) { return { t: '“' + t + '”', ref: cp ? 'Condiciones particulares' : 'Especificaciones técnicas' }; }) });
    });
    return secciones;
}

// docs: { codigo: secciones } · nombres: { codigo: 'nombre corto' } · orden: [códigos primero]
// → { total, grupos: [{ codigo, nombre, total, secciones: [{ id, icono, titulo, items: [{ clave, t, ref, ej, puntos }] }] }] }
export function buscarEnDocumentos(docs, q, nombres, orden) {
    var ps = palabras(q).map(raiz);
    if (!ps.length) return { total: 0, grupos: [], palabras: [] };
    var codigos = Object.keys(docs).sort(function (a, b) {
        var ia = (orden || []).indexOf(a), ib = (orden || []).indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    });
    var total = 0, grupos = [];
    codigos.forEach(function (c) {
        var secciones = [];
        (docs[c] || []).forEach(function (s) {
            if (s.tipo === 'meta' || s.tipo === 'config' || s.tipo === 'plantilla') return;
            var tit = plano(s.titulo), items = [];
            s.items.forEach(function (it, i) {
                var texto = plano([it.clave, it.t, it.ej, it.ref].join(' ')), todo = tit + ' ' + texto;
                if (!ps.every(function (p) { return todo.indexOf(p) !== -1; })) return;
                // Más puntos si la palabra está en la clave o el título (es el tema del punto) que si solo se nombra
                var puntos = ps.reduce(function (n, p) { return n + (plano(it.clave).indexOf(p) !== -1 ? 3 : 0) + (tit.indexOf(p) !== -1 ? 2 : 0) + (texto.indexOf(p) !== -1 ? 1 : 0); }, 0);
                items.push({ clave: it.clave, t: it.t, ref: it.ref, ej: it.ej, i: i, puntos: puntos });
            });
            if (items.length) {
                items.sort(function (a, b) { return b.puntos - a.puntos || a.i - b.i; });
                secciones.push({ id: s.id, icono: s.icono, titulo: s.titulo, items: items, puntos: Math.max.apply(null, items.map(function (x) { return x.puntos; })) });
            }
        });
        if (!secciones.length) return;
        secciones.sort(function (a, b) { return b.puntos - a.puntos; });
        var n = secciones.reduce(function (s, x) { return s + x.items.length; }, 0);
        total += n;
        grupos.push({ codigo: c, nombre: (nombres || {})[c] || c, total: n, secciones: secciones });
    });
    return { total: total, grupos: grupos, palabras: ps };
}
// Resalta en el texto (ya escapado por quien llama con esc) las palabras buscadas, sin tildes
export function resaltarPalabras(texto, ps, esc) {
    var t = String(texto == null ? '' : texto), p = plano(t), marcas = [];
    (ps || []).forEach(function (w) { var i = 0, k; while ((k = p.indexOf(w, i)) !== -1) { marcas.push([k, k + w.length]); i = k + w.length; } });
    marcas.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', pos = 0;
    marcas.forEach(function (m) { if (m[0] < pos) return; out += esc(t.slice(pos, m[0])) + '<mark>' + esc(t.slice(m[0], m[1])) + '</mark>'; pos = m[1]; });
    return out + esc(t.slice(pos));
}
