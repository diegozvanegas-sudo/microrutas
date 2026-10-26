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

    // Expresión del nombre de la vía en OSM: "^(Calle|Diagonal) 91 ?A( Sur)?$" (sin "sur" escrito vale con o sin)
    function patron(tipos, p) {
        return '^(' + tipos + ') 0*' + p.n + (p.l ? ' ?' + p.l : '') + (p.sur ? ' ' + p.sur : '( Sur| Este)?') + '$';
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
        var sig = { n: d.cruce.n + 1, l: '', sur: d.cruce.sur };
        var bb = '(' + caja.join(',') + ')';
        var q = '[out:json][timeout:25];' +
            'way["highway"]["name"~"' + patron(NOMBRES[d.tipo], d.via) + '",i]' + bb + '->.a;' +
            'way["highway"]["name"~"' + patron(CRUZAN[d.tipo], d.cruce) + '",i]' + bb + '->.b;' +
            'way["highway"]["name"~"' + patron(CRUZAN[d.tipo], sig) + '",i]' + bb + '->.c;' +
            'node(w.a)(w.b);out;out count;node(w.a)(w.c);out;';
        return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
            .then(function (r) { if (!r.ok) throw new Error('overpass ' + r.status); return r.json(); })
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
            });
    };
})();
