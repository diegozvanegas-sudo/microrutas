// Llamado de atención a una cuadrilla por las quejas de la comunidad, para enviarlo por WhatsApp.
// general: antes de la visita (solo los puntos a cumplir); visita: con lo que se encontró en cada PQR.
// Sin nada de la página, para probarlo con npm test.

// Puntos de obligatorio cumplimiento que se recuerdan (se eligen en la ventana)
export var PUNTOS = {
    residuos: { titulo: 'Residuos', texto: '🌿 *Residuos:* el pasto cortado y las ramas de poda se recogen *el mismo día*. No pueden quedar en parqueaderos, andenes, zonas verdes ni sumideros.' },
    frecuencia: { titulo: 'Frecuencias', texto: '📅 *Frecuencias:* cada lote se interviene según su programación. Si un lote no se pudo hacer, avisen ese mismo día con el motivo.' },
    vehiculos: { titulo: 'Vehículos y personas', texto: '🚗 *Vehículos y personas:* antes de usar la guadaña, revisen si hay carros, motos o personas cerca. Pidan amablemente que los muevan o protejan con la malla. Si alguien les pide algo, respondan con respeto y avisen al líder.' },
    calidad: { titulo: 'Calidad del corte', texto: '✂️ *Calidad del corte:* césped parejo, a la altura correcta, con bordeo y plateo completos y sin sectores sin intervenir.' },
    evidencias: { titulo: 'Evidencias', texto: '📸 *Evidencias:* fotos del antes y después de cada lote, enviadas a diario.' },
};

// "VILLA FLORA" -> "Villa Flora"
function titulo(s) { return String(s || '').toLowerCase().replace(/(^|\s)\S/g, function (l) { return l.toUpperCase(); }).trim(); }
// ['Robledo', 'Villa Flora', 'Aures'] -> "Robledo, Villa Flora y Aures"
function enLista(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1]; }

// o: { cuadrilla, tipo: 'general' | 'visita', puntos: ['residuos', …], casos: [{ radicado, direccion, barrio, hallazgo }] }
export function textoLlamado(o) {
    var casos = o.casos || [], barrios = [];
    casos.forEach(function (c) { var b = titulo(c.barrio); if (b && barrios.indexOf(b) === -1) barrios.push(b); });
    var donde = barrios.length ? ' en ' + enLista(barrios) : '';
    var l = ['*Cuadrilla ' + (o.cuadrilla || '__') + ' – Llamado de atención*', '', 'Buenos días, equipo.', ''];
    if (o.tipo === 'visita') {
        l.push('Hice la visita de verificación a las quejas de la comunidad' + donde + ' y esto fue lo que encontré:', '');
        casos.forEach(function (c) {
            l.push('• *PQR ' + (c.radicado || 's/n') + '* – ' + [c.direccion, titulo(c.barrio)].filter(Boolean).join(', ') + (c.hallazgo ? ': ' + c.hallazgo : ''));
        });
        l.push('', 'Les recuerdo los puntos de obligatorio cumplimiento:', '');
    } else {
        l.push('En los últimos días ' + (casos.length === 1 ? 'llegó una queja' : 'han llegado ' + (casos.length ? casos.length + ' quejas' : 'varias quejas')) +
            ' de la comunidad' + donde + ' sobre el trabajo de corte de césped. Voy a ir a verificar cada caso en campo. Mientras tanto, les recuerdo puntos que son de obligatorio cumplimiento:', '');
    }
    (o.puntos || Object.keys(PUNTOS)).forEach(function (k) { if (PUNTOS[k]) l.push(PUNTOS[k].texto, ''); });
    l.push('Cada queja de la comunidad nos afecta a todos y puede terminar en descuentos en la factura. Cuento con su compromiso para que no se repitan.', '', 'Gracias.');
    return l.join('\n');
}
