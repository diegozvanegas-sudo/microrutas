// PQR de corte de césped: lee la queja (texto pegado o leído de la foto) y arma las respuestas de cierre.
// La queja llega como en el sistema de PQR, un dato por renglón:
//   441181 · 2026-10-21 · MARIA CANO · 3009970182 · CR 38 # 91 83 MANRIQUE CENTRAL No.2 · SOLICITO LA LIMPIEZA DEL FRENTE…
// La dirección se reconoce con window.leerDireccion (public/js/direcciones.js), el mismo lector del mapa rápido.

var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// aaaa-mm-dd -> "20 de octubre de 2026" ('' si no hay fecha)
export function fechaLarga(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? +m[3] + ' de ' + MESES[+m[2] - 1] + ' de ' + m[1] : '';
}

// "CR 38 # 91 83 MANRIQUE CENTRAL No.2" -> { via: 'CR 38 # 91 83', barrio: 'MANRIQUE CENTRAL No.2' }:
// la dirección son las piezas con números (y letras sueltas, #, sur) del principio; el barrio, lo que sigue
function partirDireccion(linea) {
    var t = linea.trim().split(/\s+/), i = 1;
    while (i < t.length && /^(#|-|N[°ºO]?\.?|#?\d{1,3}[A-H]{0,2}(-\d{1,3}[A-H]{0,2})?|[A-H]{1,2}|SUR|ESTE|BIS|CON|X)$/i.test(t[i])) i++;
    return { via: t.slice(0, i).join(' '), barrio: t.slice(i).join(' ') };
}
function esDireccion(linea) {
    var leer = globalThis.leerDireccion;
    var d = leer && leer(linea);
    return !!(d && !d.incompleta);
}

// Texto de la queja -> { id, fecha (aaaa-mm-dd), nombre, telefono, direccion, barrio, queja }; lo que no se encuentre queda ''
export function leerPqr(texto) {
    var lineas = String(texto || '').split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var r = { id: '', fecha: '', nombre: '', telefono: '', direccion: '', barrio: '', queja: '' }, usadas = {}, m;
    lineas.forEach(function (l, i) {
        if (!r.direccion && esDireccion(l)) { var p = partirDireccion(l); r.direccion = p.via; r.barrio = p.barrio; usadas[i] = 1; return; }
        if (!r.fecha && (m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(l) || /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(l))) {
            r.fecha = m[1].length === 4 ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
            usadas[i] = 1; return;
        }
        // Celular (3xx…) o fijo de Medellín (604…, 7 cifras): antes que el ID, que también es un número solo
        if (!r.telefono && /^(3\d{9}|60\d{8}|\d{7})$/.test(l.replace(/[\s-]/g, '')) && (r.id || /^(3|60)/.test(l))) { r.telefono = l.replace(/[\s-]/g, ''); usadas[i] = 1; return; }
        if (!r.id && (m = /^(?:ID|RADICADO|PQR)?\s*[:#N°º.]*\s*(\d{5,9})$/i.exec(l))) { r.id = m[1]; usadas[i] = 1; return; }
        // Nombre: un renglón corto solo con letras, antes de la queja
        if (!r.nombre && l.length <= 50 && /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ .']+$/i.test(l) && l.split(' ').length >= 2 && l.split(' ').length <= 6) { r.nombre = l; usadas[i] = 1; }
    });
    r.queja = lineas.filter(function (l, i) { return !usadas[i]; }).join(' ');
    // Todo en un solo renglón (copiado de una tabla): se buscan los datos dentro del texto
    if (!r.id && (m = /\b(?:ID|radicado)\s*[:#N°º.]*\s*(\d{5,9})\b/i.exec(r.queja))) r.id = m[1];
    if (!r.telefono && (m = /\b(3\d{9})\b/.exec(r.queja))) r.telefono = m[1];
    return r;
}

// Lo que dice la queja y conviene responder aparte: el cobro en la factura
export function hablaDeCobro(queja) {
    return /cobr|factura|tarifa|servicios\s+p[uú]blicos|pago|pagamos|pagar/i.test(String(queja || ''));
}

export var RESULTADOS = {
    ejecutado: 'Ya estaba ejecutado',
    subsanado: 'Se ejecutó después de la queja',
    pendiente: 'Programado (aún no toca)',
    privado: 'No corresponde (área privada)',
};

export function saludo(hora) {
    return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

// Respuestas de cierre. d: { id, direccion, barrio, resultado, fechaCorte, fechaVisita, fechaProxima, contacto ('si'|'tel'|'no'),
// cobro, area (texto del área privada), observacion, hora }. Devuelve [{ titulo, texto }]: la completa y una breve.
export function armarRespuestas(d) {
    var dir = [d.direccion, d.barrio].filter(Boolean).join(', ');
    var enDir = dir ? 'en la dirección de su solicitud (' + dir + ')' : 'en la dirección de su solicitud';
    var corte = fechaLarga(d.fechaCorte) || '[fecha del corte]';
    var visita = fechaLarga(d.fechaVisita);
    var proxima = fechaLarga(d.fechaProxima);
    var inicio = saludo(d.hora == null ? new Date().getHours() : d.hora) + ', favor dar cierre al ID ' + (d.id || '[ID]') + '.';
    var marco = 'Considerando los alcances de la prestación del servicio público de aseo';
    var norma = 'de acuerdo con la programación y las frecuencias aprobadas en el Decreto 1077 de 2015 y en el Plan de Gestión Integral de Residuos Sólidos (PGIRS) vigente, según el catastro de áreas verdes aprobado por la Alcaldía de Medellín';
    var elDia = visita ? 'el ' + visita + ' ' : '';
    var seguimiento = 'Se realizará monitoreo permanente en el sector durante las siguientes rondas programadas, con el fin de garantizar el cumplimiento, la seguridad y la calidad en la prestación del servicio.';
    var cobro = d.cobro ? 'Respecto al cobro en la factura de servicios públicos, le informamos que la actividad de corte de césped incluida en la tarifa del servicio de aseo corresponde a las áreas verdes públicas que hacen parte del catastro aprobado, y se ejecuta con la frecuencia establecida para cada una.' : '';
    var area = d.area || 'un antejardín o zona de propiedad privada';
    var contacto = {
        si: 'se estableció contacto con el usuario, a quien se le informó',
        tel: 'se estableció contacto telefónico con el usuario para informarle',
        no: '',
    }[d.contacto || 'no'];
    var p = [], b = [];

    if (d.resultado === 'subsanado') {
        p.push(marco + ', se informa que, atendiendo su solicitud, ' + elDia + 'se realizó visita de verificación ' + enDir + ' y se programó la intervención del área, la cual fue ejecutada el ' + corte + ', ' + norma + '.');
        p.push(contacto ? 'Adicionalmente, ' + contacto + ' que las labores fueron ejecutadas.' : 'No fue posible establecer contacto con el usuario en el momento de la visita.');
        b.push('Atendiendo la solicitud, se verificó ' + (dir ? 'la dirección ' + dir : 'la dirección') + ' y se ejecutó el corte de césped el ' + corte + ', según la programación del PGIRS vigente (Decreto 1077 de 2015).' + (contacto ? ' Se informó al usuario.' : ''));
    } else if (d.resultado === 'pendiente') {
        p.push(marco + ', se informa que el área verde ubicada ' + enDir + ' hace parte del catastro aprobado por la Alcaldía de Medellín y es intervenida ' + norma + '. ' +
            (proxima ? 'La próxima intervención de corte de césped está programada para el ' + proxima + '.' : 'La próxima intervención de corte de césped se realizará en la siguiente ronda programada.'));
        if (visita) p.push('El ' + visita + ' se realizó visita de verificación en la dirección' + (contacto ? ' y ' + contacto + ' la fecha de la próxima intervención.' : '.'));
        else if (contacto) p.push('Adicionalmente, ' + contacto + ' la fecha de la próxima intervención.');
        b.push('El área ' + (dir ? 'de ' + dir + ' ' : '') + 'hace parte del catastro aprobado y se interviene según las frecuencias del PGIRS vigente (Decreto 1077 de 2015). ' +
            (proxima ? 'La próxima intervención está programada para el ' + proxima + '.' : 'Se intervendrá en la siguiente ronda programada.'));
    } else if (d.resultado === 'privado') {
        p.push(marco + ', se informa que ' + elDia + 'se realizó visita de verificación ' + enDir + ' y se constató que el área señalada corresponde a ' + area +
            ', la cual no hace parte del catastro de áreas verdes públicas aprobado por la Alcaldía de Medellín ni de las frecuencias establecidas en el Decreto 1077 de 2015 y el PGIRS vigente. Por lo tanto, su mantenimiento corresponde al propietario o a la copropiedad.');
        if (contacto) p.push('Durante la visita ' + contacto + ' lo anterior.');
        b.push('En visita ' + (visita ? 'del ' + visita + ' ' : '') + 'se verificó que el área señalada' + (dir ? ' en ' + dir : '') + ' corresponde a ' + area + ', que no hace parte del catastro de áreas verdes públicas; su mantenimiento corresponde al propietario.');
    } else {
        p.push(marco + ', se informa que ' + enDir + ' se realizó intervención asociada a corte de césped el ' + corte + ', ' + norma + '.');
        p.push('Adicionalmente, ' + elDia + 'se realizó visita de verificación en la dirección' +
            (contacto ? ' y ' + contacto + ' que las labores sí fueron ejecutadas; se evidencian cambios positivos en la ejecución de las labores.'
                      : ', en la que se evidenció la ejecución de las labores; no fue posible establecer contacto con el usuario.'));
        b.push('En ' + (dir || 'la dirección de la solicitud') + ' se realizó corte de césped el ' + corte + ', según la programación y frecuencias del PGIRS vigente (Decreto 1077 de 2015). ' +
            'En visita ' + (visita ? 'del ' + visita + ' ' : '') + 'se verificó la ejecución de las labores' + (contacto ? ' y se informó al usuario.' : '.'));
    }
    if (cobro) p.push(cobro);
    if (d.observacion) { p.push(d.observacion.trim()); b.push(d.observacion.trim()); }
    if (d.resultado !== 'privado') { p.push(seguimiento); b.push('Se mantiene seguimiento en el sector.'); }
    return [
        { titulo: 'Completa', texto: inicio + '\n\n' + p.join('\n\n') },
        { titulo: 'Breve', texto: inicio + '\n\n' + b.join(' ') },
    ];
}
