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
    // Overpass se satura a ratos (502/504 o minutos en cola): se pregunta a los dos servidores a la vez, gana el primero
    // que responda bien y se espera máximo 15 s
    var SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    function consultar(q) {
        var ctls = [];
        return new Promise(function (listo, mal) {
            var fallas = 0;
            SERVIDORES.forEach(function (url) {
                var ctl = window.AbortController ? new AbortController() : null;
                if (ctl) ctls.push(ctl);
                fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctl && ctl.signal,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
                    .then(function (r) { if (!r.ok) throw new Error('overpass ' + r.status); return r.json(); })
                    .then(listo, function (e) { if (++fallas === SERVIDORES.length) mal(e); });
            });
            setTimeout(function () { mal(new Error('overpass: sin respuesta')); }, 15000);
        }).finally(function () { ctls.forEach(function (c) { c.abort(); }); });
    }

    // Cruces guardados en la app (data/rapido/cruces.js, tools/generar_cruces.mjs): la búsqueda sale de una vez y sin señal.
    // { v: ['calle 91A', 'carrera 38', 'calle 10 SUR'…], c: { 'i,j': [[lat, lng], …] } } con i < j
    var indice = null;
    function cargarIndice() {
        if (window.crucesCalles) return Promise.resolve(window.crucesCalles);
        if (indice) return indice;
        indice = new Promise(function (listo) {
            var s = document.createElement('script');
            s.src = 'data/rapido/cruces.js';
            s.onload = function () { listo(window.crucesCalles || null); };
            s.onerror = function () { indice = null; listo(null); };   // sin señal y sin copia: se intenta Overpass
            document.head.appendChild(s);
        });
        return indice;
    }
    // Claves del índice para una pieza ("calle 91A", y "calle 91A SUR" si no se escribió sur)
    function claves(tipos, p) {
        var out = [];
        tipos.split('|').forEach(function (t) {
            var b = t.toLowerCase() + ' ' + p.n + p.l;
            if (p.sur) out.push(b + ' ' + p.sur); else out.push(b, b + ' SUR');
        });
        return out;
    }
    function puntosEntre(ix, vias, otras) {
        var pos = {}, out = [];
        ix.v.forEach(function (k, i) { pos[k] = i; });
        vias.forEach(function (a) {
            otras.forEach(function (b) {
                var i = pos[a], j = pos[b];
                if (i === undefined || j === undefined) return;
                (ix.c[Math.min(i, j) + ',' + Math.max(i, j)] || []).forEach(function (p) { out.push({ lat: p[0], lng: p[1] }); });
            });
        });
        return out;
    }
    // La "siguiente" para correr la placa: la que viene después en la numeración (91A, 91B, 92… hasta dos números más),
    // porque no siempre existe la n + 1 en el mapa
    function siguientesLocal(ix, d) {
        var vias = claves(NOMBRES[d.tipo], d.via), re = /^(\w+) (\d+)([A-H]{0,2})( SUR| ESTE)?$/, c = d.cruce;
        var tipos = CRUZAN[d.tipo].toLowerCase().split('|'), sur = c.sur ? ' ' + c.sur : '';
        var despues = ix.v.filter(function (k) {
            var m = re.exec(k);
            if (!m || tipos.indexOf(m[1]) === -1 || (c.sur && (m[4] || '') !== sur)) return false;
            var n = +m[2];
            return (n === c.n && m[3] > c.l) || (n > c.n && n <= c.n + 2);
        });
        return puntosEntre(ix, vias, despues);
    }
    // Cruce + metros de la placa hacia la siguiente más cercana (a menos de 400 m)
    function resolver(d, cruces, siguientes, preferir) {
        if (!cruces.length) return null;
        var a = cruces.filter(preferir || function () { return true; })[0] || cruces[0];
        if (!d.placa) return { lat: a.lat, lng: a.lng, aprox: 'en el cruce' };
        var b = siguientes.filter(function (s) { return metros(a, s) < 400 && metros(a, s) > 5; })
            .sort(function (x, y) { return metros(a, x) - metros(a, y); })[0];
        if (!b) return { lat: a.lat, lng: a.lng, aprox: 'en el cruce' };
        var f = Math.min(1, d.placa / Math.max(metros(a, b), 1));
        return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, aprox: 'aproximada' };
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
    // Ubica la dirección en el cruce de la vía con la calle/carrera de la placa y se corre "placa" metros hacia la
    // siguiente, como se numeran en Medellín. Primero con los cruces guardados en la app; si ahí no está el cruce
    // (o no cargaron), con OpenStreetMap en línea (Overpass). caja: [sur, oeste, norte, este] donde buscar;
    // preferir(ll): true si el punto cae en la zona de los lotes (cuando el mismo cruce existe en dos municipios).
    // aviso(texto): opcional, para decir que se pasó a buscar en línea. Devuelve { lat, lng, aprox } o null.
    window.ubicarDireccion = function (d, caja, preferir, aviso) {
        var guardada = deCache(d.texto);
        if (guardada) return Promise.resolve(guardada);
        var enCaja = function (p) { return p.lat >= caja[0] && p.lat <= caja[2] && p.lng >= caja[1] && p.lng <= caja[3]; };
        return cargarIndice().then(function (ix) {
            if (ix) {
                var cruces = puntosEntre(ix, claves(NOMBRES[d.tipo], d.via), claves(CRUZAN[d.tipo], d.cruce)).filter(enCaja);
                if (cruces.length) return resolver(d, cruces, siguientesLocal(ix, d), preferir);
            }
            if (aviso) aviso('No está en los cruces guardados: buscando ' + d.texto + ' en OpenStreetMap en línea…');
            var sig = { n: d.cruce.n + 1, l: '', sur: d.cruce.sur };
            var bb = '(' + caja.join(',') + ')';
            var q = '[out:json][timeout:15];' + conjunto(nombres(NOMBRES[d.tipo], d.via), bb, 'a') + conjunto(nombres(CRUZAN[d.tipo], d.cruce), bb, 'b') +
                conjunto(nombres(CRUZAN[d.tipo], sig), bb, 'c') + 'node(w.a)(w.b);out;out count;node(w.a)(w.c);out;';
            return consultar(q).then(function (j) {
                var cruces = [], siguientes = [], lista = cruces;
                (j.elements || []).forEach(function (e) {
                    if (e.type === 'count') lista = siguientes;
                    else if (e.type === 'node') lista.push({ lat: e.lat, lng: e.lon });
                });
                return resolver(d, cruces, siguientes, preferir);
            });
        }).then(function (r) { if (r) aCache(d.texto, r); return r; });
    };
})();
