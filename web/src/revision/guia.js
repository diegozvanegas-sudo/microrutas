// Guía dominical y festivos 2026 (v2): lo que le toca a cada inspector y cuánto lleva. Sin nada de la página, para probarlo.
// Lo que se puede contar sale de las revisiones del día; lo demás se marca a mano. item.tabla: solo aparece en la tabla de
// turnos de la guía, no en las actividades de ese inspector.
function lv(zona, meta, extra) { return { id: 'lv' + zona, texto: 'Rutas LV Zona ' + zona + (extra || ''), tipo: 'lv', zona: String(zona), meta: meta }; }
function ryt(zona, meta) { return { id: 'ryt' + zona, texto: 'Rutas R&T Zona ' + zona, tipo: 'ryt', zona: String(zona), meta: meta }; }
function mano(id, texto, ayuda, tabla) { return { id: id, texto: texto, ayuda: ayuda || '', tabla: !!tabla }; }
var VIAS = mano('vias', 'Vías principales durante la inspección de rutas LV');
var INSTRUMENTOS = mano('instrumentos', 'Instrumentos diligenciados al finalizar cada actividad');

export var GUIA = {
    am1: { nombre: 'AM-1 · Occidente', horario: '5:00 – 13:00', turno: 'Mañana', items: [
        mano('despacho', '3 rutas R&T en despacho y despacho total del turno 1 validado'),
        lv(2, 5), lv(4, 5), lv(6, 5),
        mano('pn_tn', 'Punto Naranja Terminal del Norte (6:00 a 14:00): 2 operarios', 'Se entra por la paralela al parqueadero de la Terminal; la auto compactadora está junto al punto naranja.'),
        mano('p2p', 'Reporte en el grupo puerta a puerta'),
        ryt(2, 1), ryt(4, 1), ryt(6, 1),
        mano('notificar', 'R&T en vías principales notificadas al grupo'),
        VIAS, mano('eventos', 'Eventos especiales del día'), INSTRUMENTOS
    ] },
    am2: { nombre: 'AM-2 · Oriente', horario: '5:00 – 13:00', turno: 'Mañana', items: [
        lv(1, 5), lv(3, 5), lv(5, 5), ryt(1, 1), ryt(3, 1), ryt(5, 1),
        mano('notificar', 'R&T en vías principales notificadas al grupo'),
        mano('pn_flores', 'Punto Naranja Placita de Flórez', '', true),
        VIAS, mano('eventos', 'Eventos especiales del día'), INSTRUMENTOS
    ] },
    intermedio: { nombre: 'Intermedio', horario: '8:00 – 16:00', turno: 'Intermedio', items: [
        lv(7, 10, ' AM'), ryt(7, 2), lv(4, 3, ' PM'), ryt(9, 1),
        mano('pn_tn', 'Punto Naranja Terminal del Norte (13:00 a 21:00): 1 operario'),
        VIAS, mano('eventos', 'Eventos especiales del día, occidente PM'), INSTRUMENTOS
    ] },
    pm: { nombre: 'PM · Centro y Poblado', horario: '13:00 – 21:00', turno: 'Tarde', items: [
        lv(7, 10), lv(5, 3, ' PM (Provenza, Lleras y Ciudad del Río)'), ryt(7, 2),
        mano('ciclovia', 'Ciclovía Avenida El Poblado, desde las 14:00'),
        mano('pn_provenza', 'Punto Naranja Provenza', '', true),
        VIAS, mano('eventos', 'Eventos especiales del día, oriente PM'), INSTRUMENTOS
    ] },
    noche: { nombre: 'Noche', horario: '20:00 – 4:00', turno: 'Noche', items: [
        mano('despacho', '3 rutas R&T en despacho y despacho total del turno 3 validado'),
        lv(7, 10), lv(5, 3), lv(4, 2), ryt(7, 2), ryt(4, 1),
        mano('pp_provenza', 'Puerta a puerta Provenza, si el lunes es festivo', '', true),
        mano('eventos', 'Eventos especiales de la noche'), INSTRUMENTOS
    ] }
};

// Rutas distintas revisadas de ese servicio y zona: la misma ruta dos veces cuenta una
export function contar(revisiones, tipo, zona) {
    var vistas = {};
    revisiones.forEach(function (r) { if (r.tipo === tipo && String(r.zona || '').trim() === zona) vistas[String(r.ruta || '').trim().toUpperCase()] = 1; });
    return Object.keys(vistas).length;
}
export function avanceGuia(clave, revisiones, marcas) {
    var items = GUIA[clave].items.map(function (i) {
        if (!i.tipo) return Object.assign({}, i, { hecho: !!(marcas || {})[i.id] });
        var lleva = contar(revisiones, i.tipo, i.zona);
        return Object.assign({}, i, { lleva: lleva, hecho: lleva >= i.meta });
    });
    return { items: items, hechos: items.filter(function (i) { return i.hecho; }).length, total: items.length };
}
