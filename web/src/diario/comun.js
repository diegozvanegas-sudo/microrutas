// Informe diario y Pendientes: fechas, lectura de pendientes escritos a la carrera y el texto para WhatsApp.
// Sin nada de la página, para probarlo con npm test.

var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export var MOMENTOS = { manana: '☀️ Mañana', tarde: '🌇 Tarde' };

export function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
export function plano(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// 'aaaa-mm-dd' en la hora del equipo (no UTC: a las 8 p. m. en Colombia ya sería mañana)
export function aIso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
export function deIso(s) { var p = String(s).split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
export function hoy(ahora) { return aIso(ahora || new Date()); }
export function sumarDias(iso, n) { var d = deIso(iso); d.setDate(d.getDate() + n); return aIso(d); }

// "Hoy", "Mañana", "Ayer" o "lunes 26 de octubre"
export function nombreDia(iso, ahora) {
    var h = hoy(ahora);
    if (iso === h) return 'Hoy';
    if (iso === sumarDias(h, 1)) return 'Mañana';
    if (iso === sumarDias(h, -1)) return 'Ayer';
    var d = deIso(iso);
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + (d.getFullYear() !== deIso(h).getFullYear() ? ' de ' + d.getFullYear() : '');
}
export function fechaLarga(iso) {
    var d = deIso(iso);
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
}

// Después de las 5 p. m. lo que se anota suele ser para el día siguiente
export function diaPorDefecto(ahora) {
    ahora = ahora || new Date();
    return ahora.getHours() >= 17 ? sumarDias(hoy(ahora), 1) : hoy(ahora);
}

// "revisar pqr doce de octubre - robledo en la mañana\nen la tarde pqr manrique"
//   -> [{ texto: 'Revisar pqr doce de octubre - robledo', momento: 'manana', fecha }, { texto: 'Pqr manrique', momento: 'tarde', fecha }]
// Cada renglón es un pendiente. "en la mañana / en la tarde" da el momento; "hoy", "mañana", "pasado mañana" y
// "el lunes" cambian el día (si no, queda el del selector). Se quitan del texto porque se ven como etiqueta.
export function leerPendientes(texto, diaBase, ahora) {
    var h = hoy(ahora);
    return String(texto || '').split(/\r?\n|;/).map(function (linea) {
        var t = ' ' + linea.trim() + ' ', p = plano(t), momento = '', fecha = diaBase || h, m;
        var quitar = function (re) { var k = p.search(re); if (k >= 0) { var largo = p.match(re)[0].length; t = t.slice(0, k) + ' ' + t.slice(k + largo); p = p.slice(0, k) + ' ' + p.slice(k + largo); } };

        var reM = /[\s,]+(?:en|por|de|para) la (manana|tarde)\b/;
        if ((m = p.match(reM))) { momento = m[1]; quitar(reM); }
        else if ((m = p.match(/^\s+(manana|tarde)\s*[:,-]\s+/))) { momento = m[1]; quitar(/^\s+(manana|tarde)\s*[:,-]/); }

        var reD = /[\s,]+(?:para |el |este )?(pasado manana|manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?=[\s,.:-])/;
        if ((m = p.match(reD))) {
            var w = m[1];
            if (w === 'hoy') fecha = h;
            else if (w === 'manana') fecha = sumarDias(h, 1);
            else if (w === 'pasado manana') fecha = sumarDias(h, 2);
            else {
                var objetivo = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(w);
                var dif = (objetivo - deIso(h).getDay() + 7) % 7;
                fecha = sumarDias(h, dif || 7);
            }
            quitar(reD);
        }
        t = t.replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '');
        return { texto: t.charAt(0).toUpperCase() + t.slice(1), momento: momento, fecha: fecha };
    }).filter(function (x) { return x.texto; });
}

// Mismo formato del grupo: título en negrita y un ✅ por actividad, separadas por un renglón
export function textoInforme(actividades, opciones) {
    opciones = opciones || {};
    var titulo = '*Reporte diario de actividades*' + (opciones.fecha ? '\n_' + fechaLarga(opciones.fecha) + '_' : '');
    var cuerpo = actividades.map(function (a) { return String(a).trim(); }).filter(Boolean).map(function (a) { return '✅ ' + a; });
    return [titulo].concat(cuerpo).join('\n\n');
}

function unir(lista) { return lista.length < 2 ? lista.join('') : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1]; }

// Visitas del día (tabla visitas) -> una frase por tipo, como la que se escribe a mano en el informe
export function frasesVisitas(visitas) {
    var grupos = {};
    visitas.forEach(function (v) {
        var g = grupos[v.tipo] || (grupos[v.tipo] = { n: 0, cuadrillas: [], novedades: 0 });
        g.n++;
        var c = String(v.cuadrilla || '').replace(/^\D+/, '').trim();
        if (c && g.cuadrillas.indexOf(c) < 0) g.cuadrillas.push(c);
        if (v.estado === 'PENDIENTE') g.novedades++;
    });
    return ['EJECUCION', 'OPERACION'].filter(function (k) { return grupos[k]; }).map(function (k) {
        var g = grupos[k], cs = g.cuadrillas.sort(function (a, b) { return a - b; });
        return (g.n === 1 ? 'Se realizó una visita' : 'Se realizaron ' + g.n + ' visitas') + (k === 'OPERACION' ? ' en operación' : ' de posoperación') +
            ' a los lotes correspondientes a ' + (cs.length === 1 ? 'la cuadrilla ' : cs.length ? 'las cuadrillas ' : 'las cuadrillas') + unir(cs) +
            ', verificando en campo las condiciones de las zonas verdes intervenidas' +
            (g.novedades ? '; se reportaron las respectivas novedades encontradas al grupo correspondiente.' : '.');
    });
}

// Frases que se repiten casi todos los días: se tocan y quedan en el cuadro para completarlas
export var FRASES = [
    { t: 'Posoperación', texto: 'Se realizaron visitas de posoperación a los lotes correspondientes a las cuadrillas … , verificando en campo las condiciones de las zonas verdes intervenidas; se reportaron las respectivas novedades encontradas al grupo correspondiente.' },
    { t: 'Visita PQRS', texto: 'Durante la jornada se realizó visita de inspección para verificar una PQRS en Zona … ' },
    { t: 'Residuos', texto: 'Se reportó la información correspondiente a residuos vegetales, RCD y residuos voluminosos en sus respectivos grupos.' },
    { t: 'En operación', texto: 'Se realizó acompañamiento a la cuadrilla … en operación, verificando la ejecución de las actividades en los lotes programados.' },
];
