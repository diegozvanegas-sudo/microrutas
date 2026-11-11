// Cronogramas de recorrido (documento CRONOGRAMAS de public.convenio_secciones, privado: lo carga npm run guia desde
// datos/contrato/cronogramas.json). Cada cronograma es una sección «tabla» con un punto por sector (zona, frecuencia, texto y
// su trazo sobre las calles); sus directrices van en la sección «<id>-directrices».
// La guía del mapa (mapa_rapido.html) se arma con guiaParaMapa y queda guardada en el equipo.

export var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export var COLORES_ZONA = { 1: '#ea580c', 2: '#2563eb', 3: '#9333ea', 4: '#ca8a04', 5: '#0891b2', 6: '#16a34a', 7: '#be123c' };

function sinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
// «Lunes y Sábado» → [1, 6] · «Todos los días» → [0…6] · «Lunes a viernes» → [1…5] (0 = domingo)
export function diasDe(frecuencia) {
    var t = sinTildes(frecuencia);
    if (!t.trim()) return [];
    if (/todos los dias|diari/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
    var nombres = DIAS.map(sinTildes), out = [];
    var rango = t.match(new RegExp('(' + nombres.join('|') + ')\\s+a\\s+(' + nombres.join('|') + ')'));
    if (rango) {
        for (var d = nombres.indexOf(rango[1]); ; d = (d + 1) % 7) { out.push(d); if (d === nombres.indexOf(rango[2])) break; }
        t = t.replace(rango[0], '');
    }
    nombres.forEach(function (n, i) { if (new RegExp('\\b' + n + '\\b').test(t) && out.indexOf(i) === -1) out.push(i); });
    return out.sort(function (a, b) { return a - b; });
}

// Filas de la tabla → [{ id, titulo, icono, zonas: [{ zona, frecuencia, dias, sectores: [{ t, trazo, pendiente }] }], directrices: [{ clave, t }] }]
export function leerCronogramas(filas) {
    var lista = (filas || []).slice().sort(function (a, b) { return a.orden - b.orden; });
    return lista.filter(function (s) { return s.tipo === 'tabla'; }).map(function (s) {
        var zonas = [];
        (s.items || []).forEach(function (it) {
            var z = String(it.zona || String(it.clave || '').replace(/\D/g, '') || '?');
            var g = zonas.find(function (x) { return x.zona === z && x.frecuencia === (it.frecuencia || ''); });
            if (!g) { g = { zona: z, frecuencia: it.frecuencia || '', dias: diasDe(it.frecuencia), sectores: [] }; zonas.push(g); }
            g.sectores.push({ t: it.t || '', trazo: it.trazo || null, pendiente: it.pendiente || '' });
        });
        var dir = lista.find(function (x) { return x.id === s.id + '-directrices'; });
        return { id: s.id, titulo: s.titulo || '', icono: s.icono || '', zonas: zonas, directrices: dir ? (dir.items || []).map(function (i) { return { clave: i.clave || '', t: i.t || '' }; }) : [] };
    });
}
// Lo que toca un día (0-6) o todo (null)
export function delDia(cron, dia) {
    return cron.zonas.filter(function (z) { return dia == null || z.dias.indexOf(dia) !== -1; });
}
// Cuántos sectores hay en el mapa, aproximados y sin trazo
export function cuentas(cron) {
    var c = { total: 0, calles: 0, aprox: 0, sin: 0 };
    cron.zonas.forEach(function (z) {
        z.sectores.forEach(function (s) {
            c.total++;
            var g = s.trazo && s.trazo.g && s.trazo.g.length;
            if (!g) c.sin++; else if (s.trazo.estado === 'calles') c.calles++; else c.aprox++;
        });
    });
    return c;
}
// Lo que se guarda en el equipo para el mapa: solo los sectores con trazo
export function guiaParaMapa(crons, ahora) {
    return {
        actualizado: ahora || new Date().toISOString(),
        cronogramas: crons.map(function (c) {
            var lineas = [];
            c.zonas.forEach(function (z) {
                z.sectores.forEach(function (s) {
                    if (s.trazo && s.trazo.g && s.trazo.g.length) lineas.push({ z: z.zona, f: z.frecuencia, d: z.dias, t: s.t, e: s.trazo.estado || 'aprox', n: s.trazo.nota || '', g: s.trazo.g });
                });
            });
            return { id: c.id, titulo: c.titulo, icono: c.icono, lineas: lineas };
        }).filter(function (c) { return c.lineas.length; })
    };
}
// Texto para WhatsApp de lo que toca un día
export function textoDia(cron, dia) {
    var zonas = delDia(cron, dia);
    var cab = '*' + (cron.titulo || 'Cronograma') + '*\n' + (dia == null ? 'Todas las zonas' : DIAS[dia]) + '\n';
    if (!zonas.length) return cab + '\nNo hay recorridos programados.';
    return cab + zonas.map(function (z) {
        return '\n*Zona ' + z.zona + '* (' + z.frecuencia + ')\n' + z.sectores.map(function (s) { return '• ' + s.t; }).join('\n');
    }).join('\n');
}
