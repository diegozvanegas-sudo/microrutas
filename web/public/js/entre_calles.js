// Dirección como la dice la gente en campo: «Calle 85 entre Carrera 42 y Carrera 42A» o «Calle 85 con Carrera 42» (esquina).
// Sale de los cruces guardados (data/rapido/cruces.js, tools/generar_cruces.mjs), así que funciona sin señal.
//   window.entreCalles(ix, { lat, lng }, 'Calle 85') -> { via, texto, a, b, esquina } o null
// La vía es la que dio OpenStreetMap; si no hay (sin señal) o no está en los cruces, se toma la vía de los dos cruces
// más cercanos. Los cruces de la vía se ponen sobre su eje y se escoge el más cercano a cada lado del punto.
(function () {
    var RE = /^(calle|carrera|diagonal|transversal|circular)\s+(\d{1,3})\s*([a-h]{0,2})\b(?:\s+bis\b)?(?:\s+(sur|este)\b)?/i;
    // La misma clave de tools/generar_cruces.mjs: "Calle 91 A Bis" -> "calle 91A"; "Carrera 10 Sur" -> "carrera 10 SUR"
    function clave(nombre) {
        var m = RE.exec(String(nombre || '').trim());
        return m ? m[1].toLowerCase() + ' ' + +m[2] + m[3].toUpperCase() + (m[4] ? ' ' + m[4].toUpperCase() : '') : null;
    }
    // "carrera 42A" -> "Carrera 42A"; "calle 10 SUR" -> "Calle 10 Sur"
    function bonito(k) {
        return k.replace(/^./, function (c) { return c.toUpperCase(); }).replace(/ (SUR|ESTE)$/, function (s) { return s.charAt(0) + s.charAt(1) + s.slice(2).toLowerCase(); });
    }
    var CERCA = 300;      // m: cruces que se miran alrededor del punto
    var ESQUINA = 12;     // m: a menos de esto del cruce, se dice «con»
    var EJE = 4;          // cruces con que se saca el eje de la vía
    var LEJOS_EJE = 60;   // m: si el punto queda más lejos de la vía, la vía no es esa
    function xy(o, p) {   // metros al este y al norte de o
        var k = 111320;
        return { x: (p.lng - o.lng) * k * Math.cos(o.lat * Math.PI / 180), y: (p.lat - o.lat) * k };
    }

    window.entreCalles = function (ix, ll, viaOsm) {
        if (!ix || !ix.v || !ix.c || !ll) return null;
        // Todos los cruces cerca del punto: { i, j, p (m), d }
        var cerca = [];
        Object.keys(ix.c).forEach(function (par) {
            var ij = par.split(',');
            ix.c[par].forEach(function (q) {
                var p = xy(ll, { lat: q[0], lng: q[1] }), d = Math.hypot(p.x, p.y);
                if (d <= CERCA) cerca.push({ i: +ij[0], j: +ij[1], p: p, d: d });
            });
        });
        if (!cerca.length) return null;
        cerca.sort(function (a, b) { return a.d - b.d; });

        var k = clave(viaOsm), via = k ? ix.v.indexOf(k) : -1;
        if (via >= 0 && !cerca.some(function (c) { return c.i === via || c.j === via; })) via = -1;
        if (via < 0) {
            // Sin vía de OpenStreetMap: la que comparten los dos cruces más cercanos
            var c0 = cerca[0], c1 = cerca[1];
            if (!c1) return null;
            via = c0.i === c1.i || c0.i === c1.j ? c0.i : c0.j === c1.i || c0.j === c1.j ? c0.j : -1;
            if (via < 0) return null;
        }
        // Los cruces de la vía (uno por calle que la cruza: el más cercano)
        var mios = [], vistos = {};
        cerca.forEach(function (c) {
            if (c.i !== via && c.j !== via) return;
            var otra = c.i === via ? c.j : c.i;
            if (vistos[otra]) return;
            vistos[otra] = 1;
            mios.push({ otra: ix.v[otra], p: c.p, d: c.d });
        });
        if (!mios.length) return null;
        var nombre = bonito(ix.v[via]);
        var r = function (a, b, esquina, texto) { return { via: nombre, a: a ? bonito(a.otra) : '', b: b ? bonito(b.otra) : '', esquina: esquina, texto: texto }; };
        if (mios[0].d <= ESQUINA) return r(mios[0], null, true, nombre + ' con ' + bonito(mios[0].otra));
        if (mios.length < 2) return null;

        // Eje de la vía ahí: la dirección principal de sus cruces más cercanos (en las vías curvas los lejanos lo tuercen)
        var eje = mios.slice(0, EJE), mx = 0, my = 0;
        eje.forEach(function (c) { mx += c.p.x; my += c.p.y; });
        mx /= eje.length; my /= eje.length;
        var sxx = 0, syy = 0, sxy = 0;
        eje.forEach(function (c) { var dx = c.p.x - mx, dy = c.p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
        var ang = Math.atan2(2 * sxy, sxx - syy) / 2, ux = Math.cos(ang), uy = Math.sin(ang);
        // El punto (0, 0) tiene que quedar sobre la vía
        if (Math.abs(-mx * uy + my * ux) > LEJOS_EJE) return null;

        var antes = null, despues = null;
        mios.forEach(function (c) {
            var t = c.p.x * ux + c.p.y * uy;
            if (t < 0 && (!antes || -t < antes.t)) antes = { c: c, t: -t };
            if (t >= 0 && (!despues || t < despues.t)) despues = { c: c, t: t };
        });
        if (!antes || !despues) return null;   // punta de la vía: no se sabe entre cuáles
        var a = antes.t <= despues.t ? antes.c : despues.c, b = a === antes.c ? despues.c : antes.c;
        if (a.otra === b.otra) return null;
        return r(a, b, false, nombre + ' entre ' + bonito(a.otra) + ' y ' + bonito(b.otra));
    };

    // Los cruces guardados (los mismos que carga js/direcciones.js); sin señal y sin copia: null
    var carga = null;
    window.cargarCruces = function () {
        if (window.crucesCalles) return Promise.resolve(window.crucesCalles);
        if (carga) return carga;
        carga = new Promise(function (listo) {
            var s = document.createElement('script');
            s.src = 'data/rapido/cruces.js';
            s.onload = function () { listo(window.crucesCalles || null); };
            s.onerror = function () { carga = null; listo(null); };
            document.head.appendChild(s);
        });
        return carga;
    };
})();
