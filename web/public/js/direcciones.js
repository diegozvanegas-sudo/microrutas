// Direcciones de Medellín escritas a mano o copiadas de un PQR:
//   CR 38 # 91 83 MANRIQUE · Carrera 38 #91-83 · cl 97 73 20 · Calle 10 sur 43A-20 · Calle 59A con carrera 64D
// leerDireccion devuelve { tipo, via, cruce, placa, texto } (placa puede faltar), { incompleta: true } si solo trae la vía
// o null si no parece una dirección. Lo que sigue a la placa (barrio, "No.2") se ignora.
(function () {
    var TIPOS = {
        CALLE: 'calle', CL: 'calle', CLL: 'calle', CALL: 'calle', CLLE: 'calle',
        CARRERA: 'carrera', CRA: 'carrera', CR: 'carrera', KR: 'carrera', KRA: 'carrera', CARR: 'carrera', CRR: 'carrera', K: 'carrera',
        DIAGONAL: 'diagonal', DG: 'diagonal', DIAG: 'diagonal',
        TRANSVERSAL: 'transversal', TV: 'transversal', TR: 'transversal', TRANSV: 'transversal', TRV: 'transversal',
        CIRCULAR: 'circular', CQ: 'circular', CIR: 'circular', CIRC: 'circular'
    };
    // Nombre en OpenStreetMap de cada tipo y de las vías que lo cruzan
    var NOMBRES = { calle: 'Calle|Diagonal', diagonal: 'Calle|Diagonal', carrera: 'Carrera|Transversal', transversal: 'Carrera|Transversal', circular: 'Circular' };
    var CRUZAN = { calle: 'Carrera|Transversal|Circular', diagonal: 'Carrera|Transversal|Circular', carrera: 'Calle|Diagonal|Circular',
        transversal: 'Calle|Diagonal|Circular', circular: 'Calle|Carrera|Diagonal|Transversal' };
    var SOBRA = { NO: 1, N: 1, NRO: 1, NUM: 1, CON: 1, X: 1, Y: 1, ENTRE: 1, BIS: 1 };

    // "43A" o "43 A", con "sur" o "este" opcional: { n: 43, l: 'A', sur: '' }
    function pieza(t, i) {
        var m = /^(\d{1,3})([A-H]{0,2})$/.exec(t[i] || '');
        if (!m) return null;
        var p = { n: +m[1], l: m[2], sur: '', usa: 1 };
        if (!p.l && /^[A-H]{1,2}$/.test(t[i + 1] || '')) { p.l = t[i + 1]; p.usa++; }
        while (t[i + p.usa] === 'BIS') p.usa++;
        if (t[i + p.usa] === 'SUR' || t[i + p.usa] === 'ESTE') { p.sur = t[i + p.usa]; p.usa++; }
        return p;
    }
    function txt(p) { return p.n + p.l + (p.sur ? ' ' + p.sur.charAt(0) + p.sur.slice(1).toLowerCase() : ''); }

    window.leerDireccion = function (texto) {
        var t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
            .replace(/(\d)([A-Z]{3,})/g, '$1 $2')          // 38SUR -> 38 SUR
            .replace(/[#№°º.,\-]/g, ' ').trim().split(/\s+/);
        var tipo = TIPOS[t[0]];
        if (!tipo) return null;
        var i = 1, partes = [];
        while (i < t.length && partes.length < 3) {
            if (SOBRA[t[i]] || (TIPOS[t[i]] && partes.length === 1)) { i++; continue; }
            var p = pieza(t, i);
            if (!p) break;
            partes.push(p); i += p.usa;
        }
        if (!partes.length) return null;
        if (partes.length === 1) return { incompleta: true };
        var d = { tipo: tipo, via: partes[0], cruce: partes[1], placa: partes[2] ? partes[2].n : null };
        d.texto = tipo.charAt(0).toUpperCase() + tipo.slice(1) + ' ' + txt(d.via) + ' # ' + txt(d.cruce) + (d.placa != null ? '-' + d.placa : '');
        return d;
    };

    // Nombres exactos de la vía en OSM ("Calle 91A", "Calle 91 A", "Calle 10 Sur"…): con nombre exacto Overpass usa su índice
    // y responde en segundos; con expresión regular recorre todas las vías y tarda o se cae. Sin "sur" escrito, valen las dos.
    function nombres(tipos, p) {
        var out = [];
        tipos.split('|').forEach(function (t) {
            var base = t + ' ' + p.n, bases = p.l ? [base + p.l, base + ' ' + p.l] : [base];
            bases.forEach(function (b) {
                if (p.sur) out.push(b + ' ' + p.sur.charAt(0) + p.sur.slice(1).toLowerCase());
                else out.push(b, b + ' Sur');
            });
        });
        return out;
    }
    function conjunto(lista, bb, nombre) {
        return '(' + lista.map(function (n) { return 'way["highway"]["name"="' + n + '"]' + bb + ';'; }).join('') + ')->.' + nombre + ';';
    }
    // Overpass se satura a ratos (502/504 o minutos en cola): se prueba un espejo y se espera máximo 25 s por servidor
    var SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    function consultar(q, i) {
        i = i || 0;
        var ctl = window.AbortController ? new AbortController() : null, reloj = ctl && setTimeout(function () { ctl.abort(); }, 25000);
        return fetch(SERVIDORES[i], { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctl && ctl.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
            .then(function (r) { if (!r.ok) throw new Error('overpass ' + r.status); return r.json(); })
            .catch(function (e) { if (i + 1 < SERVIDORES.length) return consultar(q, i + 1); throw e; })
            .finally(function () { clearTimeout(reloj); });
    }
    // Direcciones ya encontradas en este equipo: la segunda vez sale de una vez y sin señal
    var CACHE = 'direcciones_cache';
    function deCache(k) { try { return (JSON.parse(localStorage.getItem(CACHE)) || {})[k] || null; } catch (e) { return null; } }
    function aCache(k, v) {
        try { var c = JSON.parse(localStorage.getItem(CACHE)) || {}; c[k] = v; localStorage.setItem(CACHE, JSON.stringify(c)); } catch (e) {}
    }
    function metros(a, b) {
        var x = (b.lng - a.lng) * 111320 * Math.cos(a.lat * Math.PI / 180), y = (b.lat - a.lat) * 110540;
        return Math.hypot(x, y);
    }
    // Ubica la dirección en el cruce de la vía con la calle/carrera de la placa (OpenStreetMap, Overpass) y se corre
    // "placa" metros hacia la siguiente, como se numeran en Medellín. caja: [sur, oeste, norte, este] donde buscar;
    // preferir(ll): true si el punto cae en la zona de los lotes (cuando el mismo cruce existe en dos municipios).
    // Devuelve { lat, lng, aprox } o null.
    window.ubicarDireccion = function (d, caja, preferir) {
        var guardada = deCache(d.texto);
        if (guardada) return Promise.resolve(guardada);
        var sig = { n: d.cruce.n + 1, l: '', sur: d.cruce.sur };
        var bb = '(' + caja.join(',') + ')';
        var q = '[out:json][timeout:25];' + conjunto(nombres(NOMBRES[d.tipo], d.via), bb, 'a') + conjunto(nombres(CRUZAN[d.tipo], d.cruce), bb, 'b') +
            conjunto(nombres(CRUZAN[d.tipo], sig), bb, 'c') + 'node(w.a)(w.b);out;out count;node(w.a)(w.c);out;';
        return consultar(q)
            .then(function (j) {
                var cruces = [], siguientes = [], lista = cruces;
                (j.elements || []).forEach(function (e) {
                    if (e.type === 'count') lista = siguientes;
                    else if (e.type === 'node') lista.push({ lat: e.lat, lng: e.lon });
                });
                if (!cruces.length) return null;
                var a = cruces.filter(preferir || function () { return true; })[0] || cruces[0];
                if (!d.placa) return { lat: a.lat, lng: a.lng, aprox: 'en el cruce' };
                // La siguiente calle/carrera más cercana al cruce (a menos de 400 m): la placa son metros hacia ella
                var b = siguientes.filter(function (s) { return metros(a, s) < 400; })
                    .sort(function (x, y) { return metros(a, x) - metros(a, y); })[0];
                if (!b) return { lat: a.lat, lng: a.lng, aprox: 'en el cruce' };
                var f = Math.min(1, d.placa / Math.max(metros(a, b), 1));
                return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, aprox: 'aproximada' };
            })
            .then(function (r) { if (r) aCache(d.texto, r); return r; });
    };
})();
