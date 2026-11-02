// Guía dominical y festivos 2026 (v2) y su imagen de actividades por turno: lo que le toca a cada inspector y cuánto lleva.
// Sin nada de la página, para probarlo. Lo que se puede contar sale de las revisiones del día; lo demás se marca a mano.
// item.siLunes: solo cuando el lunes siguiente es festivo.
function lv(zona, meta, extra) { return { id: 'lv' + zona, texto: 'Rutas LV Zona ' + zona + (extra || ''), tipo: 'lv', zona: String(zona), meta: meta }; }
function ryt(zona, meta, extra) { return { id: 'ryt' + zona, texto: 'Rutas R&T Zona ' + zona + (extra || ''), tipo: 'ryt', zona: String(zona), meta: meta }; }
function mano(id, texto, ayuda, siLunes) { return { id: id, texto: texto, ayuda: ayuda || '', siLunes: !!siLunes }; }
var GPS = ' (con GPS)';
var VIAS = mano('vias', 'Vías principales durante la inspección de rutas LV');
var INSTRUMENTOS = mano('instrumentos', 'Instrumentos diligenciados al finalizar cada actividad');
var RECUERDA = mano('recuerda', 'Evidencias registradas y novedades notificadas en los grupos');

export var GUIA = {
    am1: { nombre: 'AM-1 · Occidente', horario: '5:00 – 13:00', turno: 'Mañana', items: [
        mano('despacho', '3 rutas R&T en despacho y despacho total del turno 1 validado'),
        lv(2, 5), lv(4, 5), lv(6, 5),
        mano('pn_tn', 'Punto Naranja Terminal del Norte (6:00 a 14:00): 2 operarios', 'Se entra por la paralela al parqueadero de la Terminal; la auto compactadora está junto al punto naranja.'),
        mano('p2p', 'Reporte en el grupo puerta a puerta'),
        ryt(2, 1, GPS), ryt(4, 1, GPS), ryt(6, 1, GPS),
        mano('notificar', 'R&T en vías principales notificadas al grupo'),
        VIAS, mano('eventos', 'Eventos especiales del día'), INSTRUMENTOS, RECUERDA
    ] },
    am2: { nombre: 'AM-2 · Oriente', horario: '5:00 – 13:00', turno: 'Mañana', items: [
        lv(1, 5), lv(3, 5), lv(5, 5), ryt(1, 1, GPS), ryt(3, 1, GPS), ryt(5, 1, GPS),
        mano('notificar', 'R&T en vías principales notificadas al grupo'),
        mano('pn_flores', 'Punto Naranja Placita de Flórez (6:00 a 14:00)'),
        VIAS, mano('eventos', 'Eventos especiales del día'), INSTRUMENTOS, RECUERDA
    ] },
    intermedio: { nombre: 'Intermedio', horario: '8:00 – 16:00', turno: 'Intermedio', items: [
        lv(7, 10, ' AM'), ryt(7, 2), lv(4, 3, ' PM'), ryt(9, 1),
        mano('pn_tn', 'Punto Naranja Terminal del Norte (13:00 a 21:00): 1 operario'),
        VIAS, mano('eventos', 'Eventos especiales del día, occidente PM'), INSTRUMENTOS, RECUERDA
    ] },
    pm: { nombre: 'PM-1 · Centro tarde y Poblado', horario: '13:00 – 21:00', turno: 'Tarde', items: [
        lv(7, 10), lv(5, 3, ' PM (Provenza, Lleras y Ciudad del Río)'), ryt(7, 2),
        mano('ciclovia', 'Ciclovía Avenida El Poblado, desde las 14:00'),
        mano('pn_provenza', 'Punto Naranja Provenza (14:00 a 22:00)'),
        VIAS, mano('eventos', 'Eventos especiales del día, oriente PM'), INSTRUMENTOS, RECUERDA
    ] },
    noche: { nombre: 'Noche · Despacho, Zonas 4, 5 y 7', horario: '20:00 – 4:00', turno: 'Noche', items: [
        mano('alcoholemia', 'Pruebas de alcoholemia en despacho: FUNTRAEV y FUDEA', 'Si hay un positivo: hacer el informe, y deben reemplazar a la persona para cumplir la ruta.'),
        mano('alco_neg', 'Resultado de alcoholemia: todas negativas', 'Márquelo solo si no hubo ningún positivo.'),
        { id: 'despachados', texto: 'Carros en despacho, base de Bello (3 o 4)', tipo: 'despacho', zona: '', meta: 3 },
        mano('despacho', 'Despacho total del turno 3 validado'),
        lv(5, 3, ' (Parque El Poblado, Calle 10 y Parque Lleras)'),
        mano('vias5', 'Prestación del servicio y vías principales de la Zona 5'),
        lv(4, 2, ' (en la 70, si están)'), ryt(4, 1, ' (el recolector que vea)'),
        mano('vias4', 'Recorrido por las vías principales de la Zona 4'),
        lv(7, 10, ' (10 a 12)'), ryt(7, 2, ' (vehículos recolectores en el centro)'),
        mano('pp_provenza', '5 operarios de aprovechamiento en Provenza (el lunes siguiente es festivo)', '', true),
        mano('eventos', 'Eventos especiales de la noche'), INSTRUMENTOS, RECUERDA
    ], pendiente: [
        'Siniestro fatal: confirmar si hay un vehículo de Emvarias relacionado.',
        'Cualquier incidente con un operario.',
        'Aguacero muy fuerte: solo si se presenta, atender la contingencia.'
    ] }
};

// Una ruta de RyT revisada en despacho: va aparte y no cuenta como recolector en la vía
export function enDespacho(r) { return r.tipo === 'ryt' && (r.items || {}).en_despacho === 'si'; }
// Cómo sale en el reporte lo que se marca a mano: [sección, texto]. Sección: 'despacho', el número de una zona o '' (adicional).
// Instrumentos, evidencias y el resultado de alcoholemia no llevan renglón propio.
var INFORME = {
    despacho: ['despacho', 'Se valida el despacho total del turno'],
    pn_tn: ['', 'Se verifica el Punto Naranja Terminal del Norte'],
    pn_flores: ['', 'Se verifica el Punto Naranja Placita de Flórez'],
    pn_provenza: ['', 'Se verifica el Punto Naranja Provenza'],
    p2p: ['', 'Se realiza el reporte en el grupo puerta a puerta'],
    notificar: ['', 'Se notifican al grupo las rutas R&T en vías principales'],
    ciclovia: ['', 'Se verifica la ciclovía de la Avenida El Poblado'],
    pp_provenza: ['', 'Se verifican los 5 operarios de aprovechamiento en Provenza'],
    vias: ['', 'Se verifican las vías principales durante las rutas de limpieza vial'],
    vias5: ['5', 'Se verifica la prestación del servicio y las vías principales de la zona'],
    vias4: ['4', 'Se realiza recorrido por las vías principales de la zona'],
    eventos: ['', 'Se atienden los eventos especiales']
};
// Lo marcado, listo para el reporte: { despacho: [...], otras: [...] }. En otras, lo de una zona va como "Zona 5: ..."
export function lineasGuia(clave, marcas, lunesFestivo) {
    var out = { despacho: [], otras: [] };
    marcas = marcas || {};
    if (!GUIA[clave]) return out;
    GUIA[clave].items.forEach(function (i) {
        if (i.tipo || !marcas[i.id] || (i.siLunes && !lunesFestivo)) return;
        if (i.id === 'alcoholemia') return out.despacho.push('Se realiza acompañamiento en pruebas de alcoholemia en FUNTRAEV y FUDEA' + (marcas.alco_neg ? ' - negativas' : ''));
        var inf = INFORME[i.id];
        if (!inf) return;
        if (inf[0] === 'despacho') out.despacho.push(inf[1]);
        else out.otras.push((inf[0] ? 'Zona ' + inf[0] + ': ' : '') + inf[1]);
    });
    return out;
}

// Rutas distintas revisadas de ese servicio y zona (o en despacho): la misma ruta dos veces cuenta una
export function contar(revisiones, tipo, zona) {
    var vistas = {};
    revisiones.forEach(function (r) {
        if (tipo === 'despacho' ? enDespacho(r) : r.tipo === tipo && !enDespacho(r) && String(r.zona || '').trim() === zona) vistas[String(r.ruta || '').trim().toUpperCase() + '|' + String(r.control || '').trim()] = 1;
    });
    return Object.keys(vistas).length;
}
export function avanceGuia(clave, revisiones, marcas, lunesFestivo) {
    var items = GUIA[clave].items.filter(function (i) { return !i.siLunes || lunesFestivo; }).map(function (i) {
        if (!i.tipo) return Object.assign({}, i, { hecho: !!(marcas || {})[i.id] });
        var lleva = contar(revisiones, i.tipo, i.zona);
        return Object.assign({}, i, { lleva: lleva, hecho: lleva >= i.meta });
    });
    return { items: items, hechos: items.filter(function (i) { return i.hecho; }).length, total: items.length };
}
