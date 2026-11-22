// 🤖 Pregúntale a Claude: lo que no toca la página (para probarlo con npm test).

export var ESTADOS = { pendiente: '⏳ En cola', respondiendo: '✍️ Respondiendo…', lista: '✓ Lista', error: '⚠ No se pudo' };
export var MODELOS = [['rapido', '⚡ Rápida'], ['fondo', '🧠 A fondo']];
export var EJEMPLOS = [
    'Ármame un recorrido por las calles principales de las zonas 1, 3 y 5 para verificar que la ciudad esté limpia',
    '¿Qué dice el convenio de LV sobre las herramientas que debe llevar el operario?',
    'Arma el reporte final de hoy con mis revisiones, listo para WhatsApp',
    '¿Qué lotes de la cuadrilla 4 tienen visitas sin subsanar?'
];

// El trabajador del PC marca cada 30 s: si lo vio hace menos de 90 s, está prendido
export function motorPrendido(latido, ahora) {
    if (!latido || !latido.visto) return false;
    return (ahora || Date.now()) - new Date(latido.visto).getTime() < 90000;
}

// Conversaciones: preguntas del mismo hilo juntas, la más reciente arriba; dentro, en el orden en que se hicieron
export function agruparHilos(preguntas) {
    var por = {};
    (preguntas || []).forEach(function (p) { (por[p.hilo] = por[p.hilo] || []).push(p); });
    return Object.keys(por).map(function (h) {
        var lista = por[h].slice().sort(function (a, b) { return String(a.creado).localeCompare(String(b.creado)); });
        return { hilo: h, preguntas: lista, ultima: lista[lista.length - 1].creado };
    }).sort(function (a, b) { return String(b.ultima).localeCompare(String(a.ultima)); });
}
export function hayEnCurso(preguntas) { return (preguntas || []).some(function (p) { return p.estado === 'pendiente' || p.estado === 'respondiendo'; }); }

export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
// Respuesta a HTML seguro: se escapa todo y solo se reconocen **negrita**, *negrita* (WhatsApp), títulos «# …» y enlaces web
export function respuestaHtml(t) {
    return esc(t).split('\n').map(function (l) {
        var m = /^#{1,4}\s+(.*)$/.exec(l);
        if (m) return '<b class="preg-tit">' + m[1] + '</b>';
        return l;
    }).join('\n')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)]|$)/gm, '$1<b>$2</b>')
        .replace(/https?:\/\/[^\s<>"')]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>'; });
}
// Para copiar o mandar por WhatsApp: **x** → *x*, títulos «# x» → *x*
export function textoWhatsapp(t) {
    return String(t || '').replace(/^#{1,4}\s+(.*)$/gm, '*$1*').replace(/\*\*([^*\n]+)\*\*/g, '*$1*').trim();
}
export function textoMotor(on) {
    return on ? '🟢 El PC está prendido: responde en 1 a 3 minutos.'
        : '⚪ El PC está apagado o sin el motor: su pregunta queda en cola y se responde cuando se abra «Abrir_aplicaciones» en el PC.';
}
export function textoCuenta(preguntas) {
    var n = agruparHilos(preguntas).length, cola = (preguntas || []).filter(function (p) { return p.estado === 'pendiente' || p.estado === 'respondiendo'; }).length;
    return n ? n + (n === 1 ? ' conversación' : ' conversaciones') + (cola ? ' · ' + cola + ' en curso' : '') : '';
}
// La lista de conversaciones. abiertas[id] === false: respuesta plegada
export function htmlLista(preguntas, abiertas) {
    var hilos = agruparHilos(preguntas);
    abiertas = abiertas || {};
    if (!hilos.length) return '<li class="sub preg-vacio">Todavía no ha preguntado nada. Escriba arriba o toque un ejemplo.</li>';
    return hilos.map(function (h) {
        return '<li class="preg-hilo"><div class="preg-hilo-cab"><span class="sub">' + esc(new Date(h.ultima).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })) + '</span>' +
            '<span class="preg-acc"><button type="button" class="secundario pequeno" data-seguir="' + esc(h.hilo) + '">↪ Seguir preguntando</button>' +
            '<button type="button" class="secundario pequeno preg-borrar" data-borrar="' + esc(h.hilo) + '">🗑 Borrar</button></span></div>' +
            h.preguntas.map(function (p) {
                var abierta = abiertas[p.id] !== false;
                return '<div class="preg-q"><div class="preg-yo">' + esc(p.texto) + '</div>' +
                    '<div class="preg-est ' + esc(p.estado) + '">' + (ESTADOS[p.estado] || esc(p.estado)) + (p.modelo === 'fondo' ? ' · 🧠 a fondo' : '') +
                        (p.respondido ? ' · ' + cuanto(p.tomado || p.creado, p.respondido) : '') + '</div>' +
                    (p.estado === 'lista' ? '<div class="preg-resp' + (abierta ? '' : ' plegada') + '">' + respuestaHtml(p.respuesta) + '</div>' +
                        '<div class="preg-acc"><button type="button" class="secundario pequeno" data-plegar="' + esc(p.id) + '">' + (abierta ? '▴ Ocultar' : '▾ Ver respuesta') + '</button>' +
                        '<button type="button" class="secundario pequeno" data-copiar="' + esc(p.id) + '">📋 Copiar</button>' +
                        '<a class="boton wa pequeno preg-wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(textoWhatsapp(p.respuesta)) + '">WhatsApp</a></div>' : '') +
                    (p.estado === 'error' ? '<div class="preg-error">' + esc(p.error) + '</div><div class="preg-acc"><button type="button" class="secundario pequeno" data-repetir="' + esc(p.id) + '">↻ Volver a preguntar</button></div>' : '') +
                '</div>';
            }).join('') + '</li>';
    }).join('');
}
export function cuanto(desde, hasta) {
    var s = Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 1000));
    return s < 60 ? s + ' s' : Math.round(s / 60) + ' min';
}
