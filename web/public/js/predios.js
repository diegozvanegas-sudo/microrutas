/* global window, fetch */
// Predios del catastro de Medellín para el mapa rápido: ¿la zona verde está sobre bienes del municipio o sobre predios que
// no figuran como del municipio? Consulta en vivo los servicios públicos de la Alcaldía (solo se envía el CBML o el recuadro
// del mapa, nada del contrato). Script clásico: deja window.predios. Lo prueba tests/predios.test.mjs.
//
// Ojo con lo que se puede decir: el catastro público no dice quién es el dueño. Que un predio no esté en «Bienes Inmuebles»
// es un indicio (puede ser privado, de otra entidad o no estar cedido), no una prueba. Lo que queda fuera de todo predio
// es vía o espacio público sin predio.
(function () {
    var BASE = 'https://www.medellin.gov.co/servidormapas/rest/services/';
    var CAPAS = {
        lotes: BASE + 'ServiciosCatastro/Base_Catastral/MapServer/3/query',
        bienes: BASE + 'vivienda_ciudad_terri/VA_ConsultaOperadorCatastral/MapServer/20/query',
        direcciones: BASE + 'ServiciosCatastro/Base_Catastral/MapServer/8/query'
    };
    var POR_PAGINA = 1000, MAX_PAGINAS = 6;

    // «07240010011», «0724-001-0011», «CBML 07240010011» -> '07240010011' (o null)
    function normalizarCbml(t) {
        var s = String(t || '').toUpperCase().replace(/^\s*CBML\s*:?\s*/, '').replace(/[\s.-]/g, '');
        return /^\d{11}$/.test(s) ? s : null;
    }

    function url(capa, p) {
        var q = Object.keys(p).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]); }).join('&');
        return CAPAS[capa] + '?' + q;
    }
    // Trae todas las páginas (el servicio entrega 1.000 por vez). fetchFn para las pruebas
    function consultar(capa, p, fetchFn) {
        var f = fetchFn || fetch, todos = [];
        function pagina(i) {
            var pp = Object.assign({ outFields: '*', outSR: 4326, f: 'geojson', resultOffset: i * POR_PAGINA, resultRecordCount: POR_PAGINA }, p);
            // e.red: falla de la conexión o del servicio de la Alcaldía (no de la app): la página lo dice distinto
            var deRed = function (e) { e.red = true; return e; };
            return f(url(capa, pp)).catch(function (e) { throw deRed(e); }).then(function (r) {
                if (!r.ok) throw deRed(new Error('El catastro respondió ' + r.status));
                return r.json().catch(function (e) { throw deRed(e); });
            }).then(function (j) {
                if (j.error) throw deRed(new Error('El catastro respondió: ' + (j.error.message || 'error')));
                todos = todos.concat(j.features || []);
                var mas = (j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit)) && (j.features || []).length;
                if (mas && i + 1 < MAX_PAGINAS) return pagina(i + 1);
                if (mas) todos.incompleto = true;
                return todos;
            });
        }
        return pagina(0);
    }
    // caja: [oeste, sur, este, norte] en grados
    function porCaja(caja, fetchFn) {
        var p = { geometry: caja.join(','), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', where: '1=1' };
        return Promise.all([consultar('lotes', p, fetchFn), consultar('bienes', p, fetchFn)]).then(function (r) {
            return { lotes: r[0], bienes: r[1], incompleto: !!(r[0].incompleto || r[1].incompleto) };
        });
    }
    function porCbml(cbml, fetchFn) {
        var w = { where: "cbml='" + cbml + "'" };
        return Promise.all([
            consultar('lotes', w, fetchFn),
            consultar('direcciones', Object.assign({ returnGeometry: false, outFields: 'direccionencasillada,via,placa' }, w), fetchFn).catch(function () { return []; })
        ]).then(function (r) {
            var lote = r[0][0];
            if (!lote) return null;
            var c = cajaDe(poligonos(lote.geometry));
            // Bienes del municipio que tocan el predio (los que tienen ese mismo CBML o están encima)
            return consultar('bienes', { geometry: [c[0], c[1], c[2], c[3]].join(','), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', where: '1=1' }, fetchFn)
                .then(function (bienes) {
                    return { lote: lote, direcciones: r[1].map(function (d) { return [d.properties.via, d.properties.placa].filter(Boolean).join(' '); }).filter(Boolean), bienes: bienes };
                });
        });
    }

    // ---------- Geometría (grados [lng, lat] -> metros en un plano local) ----------
    var KY = 110574;
    function kx(lat) { return 111320 * Math.cos(lat * Math.PI / 180); }
    // GeoJSON Polygon / MultiPolygon -> [[anillo, hueco...], ...] con puntos [lng, lat]
    function poligonos(g) {
        if (!g) return [];
        return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    }
    function cajaDe(polys) {
        var b = [Infinity, Infinity, -Infinity, -Infinity];
        polys.forEach(function (p) { p[0].forEach(function (q) { b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])]; }); });
        return b;
    }
    function enAnillo(x, y, r) {
        var dentro = false;
        for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
            var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
        }
        return dentro;
    }
    function enPolys(x, y, polys) {
        return polys.some(function (p) { return enAnillo(x, y, p[0]) && !p.slice(1).some(function (h) { return enAnillo(x, y, h); }); });
    }
    function preparar(features) {
        return (features || []).map(function (f) { var ps = poligonos(f.geometry); return { p: f.properties || {}, ps: ps, b: cajaDe(ps) }; })
            .filter(function (o) { return o.ps.length; });
    }
    function dentroDe(x, y, o) { return x >= o.b[0] && x <= o.b[2] && y >= o.b[1] && y <= o.b[3] && enPolys(x, y, o.ps); }

    // Cuánto de la zona verde (polys en [lng, lat]) cae sobre bienes del municipio, sobre predios que no figuran como del
    // municipio y fuera de todo predio (vía). Se mide con una malla de puntos (~1.500 por polígono, mínimo 1 m de lado):
    // sobra para decir «unos 3.200 m²», no para linderos exactos.
    // -> { total, municipal, noMunicipal, via, predios: [{ cbml, m2, area }] (los no municipales, de mayor a menor) }
    function analizar(polys, lotes, bienes, opciones) {
        // Se aceptan los features del catastro o ya preparados (para no repetirlo en cada polígono de una revisión grande)
        var listo = function (a) { return a && a.length && a[0].ps ? a : preparar(a); };
        var L_ = listo(lotes), B_ = listo(bienes);
        var b = cajaDe(polys), lat0 = (b[1] + b[3]) / 2, fx = kx(lat0);
        var anchoM = (b[2] - b[0]) * fx, altoM = (b[3] - b[1]) * KY;
        // Primero el área real del polígono para escoger el paso de la malla
        var areaAprox = Math.max(1, areaM2(polys));
        var paso = Math.max((opciones && opciones.pasoMin) || 1, Math.sqrt(areaAprox / 1500));
        var dx = paso / fx, dy = paso / KY, celda = paso * paso;
        // Solo los predios y bienes que tocan el recuadro
        var cerca = function (o) { return !(o.b[0] > b[2] || o.b[2] < b[0] || o.b[1] > b[3] || o.b[3] < b[1]); };
        var lo = L_.filter(cerca), bi = B_.filter(cerca);
        var r = { total: 0, municipal: 0, noMunicipal: 0, via: 0, predios: [] }, por = {};
        for (var x = b[0] + dx / 2; x < b[2]; x += dx) {
            for (var y = b[1] + dy / 2; y < b[3]; y += dy) {
                if (!enPolys(x, y, polys)) continue;
                r.total += celda;
                if (bi.some(function (o) { return dentroDe(x, y, o); })) { r.municipal += celda; continue; }
                var predio = null;
                for (var k = 0; k < lo.length; k++) if (dentroDe(x, y, lo[k])) { predio = lo[k]; break; }
                if (!predio) { r.via += celda; continue; }
                r.noMunicipal += celda;
                var c = predio.p.cbml || '?';
                if (!por[c]) por[c] = { cbml: c, m2: 0, area: predio.p.area_lote || null };
                por[c].m2 += celda;
            }
        }
        r.predios = Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b2) { return b2.m2 - a.m2; });
        ['total', 'municipal', 'noMunicipal', 'via'].forEach(function (k) { r[k] = Math.round(r[k]); });
        r.predios.forEach(function (p) { p.m2 = Math.round(p.m2); });
        r.anchoM = Math.round(anchoM); r.altoM = Math.round(altoM);
        // Los pedacitos (menos de 50 m² o del 2 % de la zona) son casi siempre bordes donde los linderos no cuadran exacto:
        // se cuentan aparte para que el reporte hable solo de lo que pesa
        var minimo = Math.max(50, r.total * 0.02);
        r.dudosos = r.predios.filter(function (p) { return p.m2 >= minimo; });
        r.bordes = r.predios.filter(function (p) { return p.m2 < minimo; }).reduce(function (s, p) { return s + p.m2; }, 0);
        r.m2Dudoso = r.dudosos.reduce(function (s, p) { return s + p.m2; }, 0);
        return r;
    }
    // Área en m² (fórmula del zapato en el plano local), con huecos
    function areaM2(polys) {
        var b = cajaDe(polys), fx = kx((b[1] + b[3]) / 2), total = 0;
        polys.forEach(function (p) {
            p.forEach(function (anillo, i) {
                var s = 0;
                for (var a = 0, z = anillo.length - 1; a < anillo.length; z = a++) s += (anillo[z][0] * fx) * (anillo[a][1] * KY) - (anillo[a][0] * fx) * (anillo[z][1] * KY);
                total += (i ? -1 : 1) * Math.abs(s) / 2;
            });
        });
        return total;
    }
    function pct(n, de) { return de ? Math.round(100 * n / de) : 0; }
    function m2(n) { return Math.round(n).toLocaleString('es-CO') + ' m²'; }
    // Texto para el reporte (se copia tal cual); nombre: «Z2CC0271 (lote 491)»
    function textoReporte(nombre, r) {
        var d = r.dudosos || r.predios, n = r.m2Dudoso != null ? r.m2Dudoso : r.noMunicipal;
        if (!d.length) return nombre + ': según el catastro de Medellín, la zona verde está sobre bienes del municipio o vía pública (' + m2(r.total) + ' revisados).';
        return nombre + ': aproximadamente ' + m2(n) + ' (' + pct(n, r.total) + ' %) del polígono quedan dentro de ' +
            (d.length === 1 ? 'el predio CBML ' + d[0].cbml + ', que no figura' : 'los predios CBML ' + d.map(function (p) { return p.cbml + ' (' + m2(p.m2) + ')'; }).join(', ') + ', que no figuran') +
            ' como bien inmueble del municipio en el catastro. Se solicita evaluar si esa franja es privada y, si aplica, ajustar el polígono y el área de la ficha.';
    }

    window.predios = { normalizarCbml: normalizarCbml, consultar: consultar, porCaja: porCaja, porCbml: porCbml, analizar: analizar, preparar: preparar,
        poligonos: poligonos, cajaDe: cajaDe, areaM2: areaM2, textoReporte: textoReporte, pct: pct, url: url };
})();
