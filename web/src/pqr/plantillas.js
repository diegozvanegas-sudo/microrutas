// PQR de corte de césped: lee la queja (texto pegado o leído de la foto) y arma las respuestas de cierre.
// La queja llega como en el sistema de PQR, un dato por renglón:
//   441181 · 2026-10-21 · MARIA CANO · 3009970182 · CR 38 # 91 83 MANRIQUE CENTRAL No.2 · SOLICITO LA LIMPIEZA DEL FRENTE…
// La dirección se reconoce con window.leerDireccion (public/js/direcciones.js), el mismo lector del mapa rápido.

// Quién ejecuta el corte de césped (lo citan las respuestas de daños)
var CONTRATISTA = 'la Cooperativa de Desarrollo y Empleo Social PRECOODES, en el marco del contrato CW 394406';

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
    // "Casa", "Apto 201", "Interior 3"… van con la dirección, no con el barrio
    var fin = i;
    while (i < t.length && /^(casa|apto?|apartamento|int(erior)?|local|piso|bloque|torre|lote)$/i.test(t[i])) i += /^\d/.test(t[i + 1] || '') ? 2 : 1;
    return { via: t.slice(0, fin).join(' '), barrio: t.slice(i).join(' ') };
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
    return /cobr|factura|tarifa|servicios\s+p[uú]blicos|pago|pagamos|pagar|\bpaga\b/i.test(String(queja || ''));
}
// El barrido de calles es otro componente del aseo: se responde aparte
export function hablaDeBarrido(queja) {
    return /barr(er|en|iendo|ido|ida)\b|barrendero|limpieza de (la )?calle/i.test(String(queja || ''));
}

// Temas de la queja que el contrato responde. queja: palabras del ciudadano; clausula: cómo reconocer las cláusulas del
// resumen del contrato (public.contrato_secciones) que hablan de eso. El texto del contrato no está aquí (el repositorio es público).
export var TEMAS = [
    { id: 'frente', titulo: 'Frente de la casa o antejardín', queja: /frente|antejard[ií]n|mi casa|vivienda|fachada|anden|andén/i,
      clausula: /antejard|espacio p[uú]blico urbano/i, sugerencia: 'privado' },
    { id: 'altura', titulo: 'Pasto o maleza alta, no cortaron', queja: /maleza|hierba|pasto|rastrojo|monte|enmonta|no (lo |la |los |las )?(cortar|cortaron|podaron)|sin cortar|alto/i,
      clausula: /10 cm|entre 2 y 9|grama de menos/i },
    { id: 'residuos', titulo: 'Residuos del corte', queja: /residuo|basura|dejaron|recog|ramas|pasto cortado|material|bolsa|tira(r|n|ron)|desag[uü]e|sumidero|alcantarill|cuneta|se tap/i,
      clausula: /residuos vegetales|presentaci[oó]n de residuos|recolecci[oó]n de todos/i, sugerencia: 'residuos' },
    { id: 'frecuencia', titulo: 'Frecuencia o abandono', queja: /frecuen|cada cu[aá]nto|hace (mucho|meses|rato)|no (han )?vuelto|no vienen|olvid|nunca|siempre/i,
      clausula: /quincenal|programaci[oó]n es/i },
    { id: 'arboles', titulo: 'Árboles, jardines o plantas', queja: /[aá]rbol|planta|jard[ií]n|matas|flores|ornato|sembr/i,
      clausula: /[aá]rboles|plateo|ornato|jardiner/i, sugerencia: 'jardin' },
    { id: 'poda', titulo: 'Poda o tala de árboles', queja: /\bpod(a|ar|en)\b|\btala(r|n)?\b|cortar (el|los|un) [aá]rbol/i,
      clausula: /[aá]rboles/i, sugerencia: 'arbol' },
    { id: 'agua', titulo: 'Quebrada, río o canal', queja: /quebrada|\br[ií]o\b|caño|canal|retiro/i, clausula: /quebradas/i, sugerencia: 'ambiental' },
    { id: 'talud', titulo: 'Talud o ladera', queja: /talud|ladera|deslizamiento|derrumbe|pendiente/i, clausula: /taludes/i, sugerencia: 'talud' },
    { id: 'obra', titulo: 'Obra o sin acceso', queja: /\bobras?\b|construcci[oó]n|cerrad[oa]|encerrad|reja|candado|no (se )?puede (entrar|pasar)/i,
      clausula: /restricci[oó]n de acceso|obras/i, sugerencia: 'restriccion' },
    { id: 'cana', titulo: 'Caña brava', queja: /ca[ñn]a ?brava|ca[ñn]izal/i, clausula: /ca[ñn]a brava/i, sugerencia: 'canabrava' },
    { id: 'danos', titulo: 'Daños o seguridad al cortar', queja: /piedra|vidrio|golpe|da[ñn]o|carro|ventana|herid|peligro/i,
      clausula: /malla|limpieza previa|reclamaci[oó]n/i, sugerencia: 'danos' },
    { id: 'herramientas', titulo: 'Machete, herbicida o forma de cortar', queja: /machete|peinilla|herbicida|veneno|fumig|quem|azad[oó]n/i,
      clausula: /peinilla|herbicida|azad[oó]n/i, sugerencia: 'metodo' },
    { id: 'calidad', titulo: 'Corte mal hecho o a medias', queja: /mal (cortado|hecho)|a medias|incomplet|dejaron (un|una|la mitad|parte)|solo cortaron|plateo|bordeo|muy (bajo|al ras)|pelad/i,
      clausula: /entre 2 y 9|plateo|bordeo|100 %/i, sugerencia: 'calidad' },
    { id: 'fauna', titulo: 'Abejas, avispas u otra fauna', queja: /abeja|avispa|panal|enjambre|culebra|serpiente|zarig[uü]eya|\bnidos?\b/i, clausula: /fauna|abejas/i, sugerencia: 'fauna' },
    { id: 'caracol', titulo: 'Caracol africano', queja: /caracol/i, clausula: /caracol/i, sugerencia: 'caracol' },
    { id: 'zonadura', titulo: 'Maleza en andén o zona dura', queja: /espartillo|adoqu[ií]n|alcorque|grieta|cascajo|zona dura|entre (las )?(baldosas|piedras)/i,
      clausula: /espartillo|zonas duras/i, sugerencia: 'zonadura' },
    { id: 'escombros', titulo: 'Escombros o basura', queja: /escombro|basura|colch[oó]n|mueble|voluminos|desecho|reciclaje/i, clausula: /RCD|voluminosos/i, sugerencia: 'escombros' },
    { id: 'lluvia', titulo: 'Lluvias o retraso', queja: /lluvi|llov|invierno|retras|demor/i, clausula: /precipitaciones|contingencia/i, sugerencia: 'lluvia' },
];
// Temas que aparecen en la queja (en el orden de TEMAS)
export function temasDeQueja(queja) {
    return TEMAS.filter(function (t) { return t.queja.test(String(queja || '')); });
}

export function saludo(hora) {
    return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

// Respuestas de cierre. d: { id, direccion, barrio, resultado, fechaCorte, fechaVisita, fechaProxima, contacto ('si'|'tel'|'no'),
// cobro, barrido, area (texto del área privada), cuadrilla, fechaCorregido (cuando la cuadrilla atendió la novedad), observacion,
// clausulas ([{ t, ref }] del contrato), hora }. Devuelve [{ titulo, texto }]: la completa y una breve.
export function armarRespuestas(d) {
    var dir = [d.direccion, d.barrio].filter(Boolean).join(', ');
    var visita = fechaLarga(d.fechaVisita), proxima = fechaLarga(d.fechaProxima), corregido = fechaLarga(d.fechaCorregido);
    // Piezas que comparten los casos (CASOS más abajo)
    var c = {
        dir: dir,
        enDir: dir ? 'en la dirección de su solicitud (' + dir + ')' : 'en la dirección de su solicitud',
        laDir: dir ? 'la dirección ' + dir : 'la dirección',
        corte: fechaLarga(d.fechaCorte) || '[fecha del corte]', hayCorte: !!d.fechaCorte,
        // Para "No se ubicó el sitio": la dirección no la reconoce el lector de direcciones, o la queja no trae teléfono
        dirErrada: !!globalThis.leerDireccion && !esDireccion(d.direccion || ''), sinTelefono: !String(d.telefono || '').replace(/\D/g, ''),
        visita: visita, proxima: proxima,
        // "al supervisor de la cuadrilla 11" y "el mismo día 19 de octubre de 2026" (como en las respuestas que ya se han enviado)
        supervisor: d.cuadrilla ? 'al supervisor de la cuadrilla ' + String(d.cuadrilla).replace(/^cuadrilla\s*/i, '') : 'al contratista',
        obs: (d.observacion || '').trim(),
        corregido: corregido && (d.fechaCorregido === d.fechaVisita ? 'el mismo día ' : 'el ') + corregido,
        elDia: visita ? 'el ' + visita + ' ' : '',
        enVisita: 'En visita ' + (visita ? 'del ' + visita + ' ' : ''),
        siguiente: proxima ? 'el ' + proxima : 'en la siguiente ronda programada',
        marco: 'Considerando los alcances de la prestación del servicio público de aseo',
        norma: 'de acuerdo con la programación y las frecuencias aprobadas en el Decreto 1077 de 2015 y en el Plan de Gestión Integral de Residuos Sólidos (PGIRS) vigente, según el catastro de áreas verdes aprobado por la Alcaldía de Medellín',
        area: d.area || 'un antejardín o zona de propiedad privada',
        sinVisita: d.contacto === 'sinvisita',
        contacto: {
            si: 'se estableció contacto con el usuario, a quien se le informó',
            tel: 'se estableció contacto telefónico con el usuario para informarle',
            no: '',
        }[d.contacto || 'no'],
    };
    var caso = CASOS[d.resultado] || CASOS.ejecutado, p = [], b = [];
    // Varios radicados ("436569 y 436025"): "a los ID"
    var ids = d.id || '[ID]', variosId = /\d\D+\d/.test(ids);
    c.ids = (variosId ? 'las PQRS con ID ' : 'la PQRS con ID ') + ids;
    var inicio = saludo(d.hora == null ? new Date().getHours() : d.hora) +
        (caso.soloSeguimiento ? '.' : ', favor dar cierre ' + (caso.parcial ? 'parcial ' : '') + (variosId ? 'a los ID ' : 'al ID ') + ids + '.');
    var seguimiento = 'Se realizará monitoreo permanente en el sector durante las siguientes rondas programadas, con el fin de garantizar el cumplimiento, la seguridad y la calidad en la prestación del servicio.';
    var cobro = d.cobro ? 'Respecto al cobro en la factura de servicios públicos, le informamos que la actividad de corte de césped incluida en la tarifa del servicio de aseo corresponde a las áreas verdes públicas que hacen parte del catastro aprobado, y se ejecuta con la frecuencia establecida para cada una.' : '';

    caso.armar(c, p, b);
    if (cobro) p.push(cobro);
    if (d.mallas) {
        p.push('También se estableció comunicación ' + c.supervisor.replace(/^al /, 'con el ') + ' para que realice la respectiva retroalimentación al personal sobre el correcto uso de las mallas de protección y/o mallas auxiliares durante el corte.');
        b.push('Se pidió al supervisor retroalimentar al personal sobre el uso de las mallas de protección.');
    }
    if (d.barrido) {
        p.push('Respecto al barrido de calles, le informamos que esta actividad corresponde a otro componente del servicio público de aseo, distinto al corte de césped; su solicitud se traslada al área encargada para su verificación y programación.');
        b.push('Lo del barrido de calles se traslada al área encargada.');
    }
    var clausulas = (d.clausulas || []).filter(function (x) { return x && x.t; });
    if (clausulas.length) {
        p.push('De acuerdo con las especificaciones técnicas del contrato de corte de césped:\n' + clausulas.map(function (x) {
            return '• ' + x.t.trim() + (x.ref ? ' (' + x.ref + ')' : '');
        }).join('\n'));
        b.push('Lo anterior, conforme a las especificaciones técnicas del contrato de corte de césped.');
    }
    if (d.observacion && !caso.usaObservacion) { p.push(d.observacion.trim()); b.push(d.observacion.trim()); }
    if (caso.seguimiento === 'siCorte' ? c.hayCorte : caso.seguimiento !== false) { p.push(seguimiento); b.push('Se mantiene seguimiento en el sector.'); }
    return [
        { titulo: 'Completa', texto: inicio + '\n\n' + p.join('\n\n') },
        { titulo: 'Breve', texto: inicio + '\n\n' + b.join(' ') },
    ];
}

// "Durante la visita se estableció contacto con el usuario, a quien se le informó lo anterior." (nada si no hubo contacto)
function informar(c, p) { if (c.contacto) p.push('Durante la visita ' + c.contacto + ' lo anterior.'); }

// Lo que se encontró en la visita y cómo se responde. armar(c, p, b) agrega los párrafos de la completa (p) y las frases de
// la breve (b). seguimiento: false cuando el área no es del servicio y no hay "siguientes rondas" que prometer.
var CASOS = {
    ejecutado: { titulo: 'Ya estaba ejecutado', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.enDir + ' se realizó intervención asociada a corte de césped el ' + c.corte + ', ' + c.norma + '.');
        if (c.sinVisita) { b.push('En ' + (c.dir || 'la dirección de la solicitud') + ' se realizó corte de césped el ' + c.corte + ', según la programación y frecuencias del PGIRS vigente (Decreto 1077 de 2015).'); return; }
        p.push('Adicionalmente, ' + c.elDia + 'se realizó visita de verificación en la dirección' +
            (c.contacto ? ' y ' + c.contacto + ' que las labores sí fueron ejecutadas; se evidencian cambios positivos en la ejecución de las labores.'
                        : ', en la que no se evidenció zona sin intervenir. Se intentó establecer comunicación con el usuario a través de los medios proporcionados en la solicitud, sin que fuera posible el contacto.'));
        b.push('En ' + (c.dir || 'la dirección de la solicitud') + ' se realizó corte de césped el ' + c.corte + ', según la programación y frecuencias del PGIRS vigente (Decreto 1077 de 2015). ' +
            c.enVisita + 'se verificó la ejecución de las labores' + (c.contacto ? ' y se informó al usuario.' : '.'));
    } },
    subsanado: { titulo: 'Se ejecutó después de la queja', armar: function (c, p, b) {
        p.push('Atendiendo su solicitud, ' + c.elDia + 'se realizó visita técnica ' + c.enDir + ', evidenciando que la novedad reportada sí correspondía al servicio de corte de césped y que el área hace parte de la base de datos vigente de corte de césped, aprobada por el Distrito de Medellín. ' +
            'Durante la inspección se verificó que el área no había sido intervenida, presentando crecimiento significativo de la cobertura vegetal.');
        p.push('Por lo anterior, se gestionó la corrección correspondiente ' + c.supervisor + ', ejecutándose la intervención el ' + c.corte + ' mediante el corte de césped en el sector reportado, ' + c.norma + ', con lo cual se subsanó la novedad manifestada.');
        p.push(c.contacto ? 'Adicionalmente, ' + c.contacto + ' que las labores fueron ejecutadas.' : 'No fue posible establecer contacto con el usuario en el momento de la visita.');
        b.push(c.enVisita + 'se verificó que el área en ' + c.laDir + ' no había sido intervenida; se gestionó la corrección y el corte de césped se ejecutó el ' + c.corte + ', subsanando la novedad.' + (c.contacto ? ' Se informó al usuario.' : ''));
    } },
    parcial: { titulo: 'Cierre parcial (falta subsanar)', parcial: true, seguimiento: false, armar: function (c, p, b) {
        p.push((c.visita ? 'El ' + c.visita + ', el p' : 'El p') + 'rofesional del servicio realizó visita al sector referente a la presente solicitud' + (c.dir ? ' (' + c.dir + ')' : '') +
            ', evidenciando que este sí hace parte de la base de datos vigente de corte de césped, aprobada por el Distrito de Medellín. Por lo anterior, se remitió la novedad ' + c.supervisor + ' para realizar la respectiva subsanación.');
        p.push('Queda pendiente la subsanación por parte del contratista, la cual será notificada apenas se tenga evidencia del desarrollo de la actividad' + (c.proxima ? ' (prevista para el ' + c.proxima + ')' : '') + '.');
        b.push(c.enVisita + 'se verificó que ' + c.laDir + ' sí hace parte de la base de datos de corte de césped; se remitió la novedad al contratista y queda pendiente la subsanación, que se notificará con su evidencia.');
    } },
    // Aviso sin cierre: lo que falta va en la observación ("el usuario no ha enviado la documentación para el reembolso…")
    seguimientopqr: { titulo: 'Solo seguimiento (sin cierre)', soloSeguimiento: true, usaObservacion: true, seguimiento: false, armar: function (c, p, b) {
        var texto = 'Con el fin de dar seguimiento y mantener una correcta comunicación respecto a ' + c.ids + ', se informa que, a la fecha, ' +
            (c.obs ? c.obs.replace(/^./, function (l) { return l.toLowerCase(); }) : 'nos encontramos a la espera de la atención de la novedad por parte del contratista; una vez se tenga evidencia de su ejecución, se informará el cierre.');
        p.push(texto); b.push(texto);
    } },
    sinresiduos: { titulo: 'No había residuos', armar: function (c, p, b) {
        p.push('Considerando los alcances de la prestación del servicio público de aseo, ' + c.elDia + 'se realizó visita técnica ' + c.enDir + ', durante la cual no se evidenció la presencia de residuos vegetales asociados al servicio de corte de césped.');
        informar(c, p);
        b.push(c.enVisita + 'no se evidenciaron residuos vegetales del corte de césped en ' + c.laDir + '.');
    } },
    pendiente: { titulo: 'Programado (aún no toca)', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que el área verde ubicada ' + c.enDir + ' hace parte del catastro aprobado por la Alcaldía de Medellín y es intervenida ' + c.norma + '. ' +
            (c.proxima ? 'La próxima intervención de corte de césped está programada para el ' + c.proxima + '.' : 'La próxima intervención de corte de césped se realizará en la siguiente ronda programada.'));
        if (c.visita) p.push('El ' + c.visita + ' se realizó visita de verificación en la dirección' + (c.contacto ? ' y ' + c.contacto + ' la fecha de la próxima intervención.' : '.'));
        else if (c.contacto) p.push('Adicionalmente, ' + c.contacto + ' la fecha de la próxima intervención.');
        b.push('El área ' + (c.dir ? 'de ' + c.dir + ' ' : '') + 'hace parte del catastro aprobado y se interviene según las frecuencias del PGIRS vigente (Decreto 1077 de 2015). ' +
            (c.proxima ? 'La próxima intervención está programada para el ' + c.proxima + '.' : 'Se intervendrá en la siguiente ronda programada.'));
    } },
    privado: { titulo: 'No corresponde (área privada)', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que el área señalada corresponde a ' + c.area +
            ', la cual no hace parte del catastro de áreas verdes públicas aprobado por la Alcaldía de Medellín ni de las frecuencias establecidas en el Decreto 1077 de 2015 y el PGIRS vigente. Por lo tanto, su mantenimiento corresponde al propietario o a la copropiedad.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que el área señalada' + (c.dir ? ' en ' + c.dir : '') + ' corresponde a ' + c.area + ', que no hace parte del catastro de áreas verdes públicas; su mantenimiento corresponde al propietario.');
    } },
    bajo: { titulo: 'Pasto bajo (menos de 10 cm)', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció que el césped presenta una altura inferior a 10 cm. ' +
            'De acuerdo con las especificaciones técnicas del servicio, el corte se realiza cuando el césped supera dicha altura, ' + c.norma + '.');
        p.push('El área hace parte del catastro y será intervenida ' + c.siguiente + ', una vez cumpla la condición de altura.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que el césped en ' + c.laDir + ' tiene menos de 10 cm de altura, por lo que aún no requiere corte; se intervendrá ' + c.siguiente + ' (PGIRS vigente, Decreto 1077 de 2015).');
    } },
    // Con "Se corrigió el": la novedad se envió al supervisor de la cuadrilla y ya se atendió (así se responde cuando se resuelve en la visita)
    residuos: { titulo: 'Quedaron residuos del corte', armar: function (c, p, b) {
        if (c.hayCorte) p.push(c.marco + ', se informa que ' + c.enDir + ' se realizó corte de césped el ' + c.corte + ', ' + c.norma + '.');
        var pendiente = 'una recolección pendiente de residuos vegetales, informada en la solicitud';
        p.push((c.hayCorte ? 'En la visita de inspección' + (c.visita ? ' del ' + c.visita : '') : c.marco + ', se informa que ' + c.elDia + 'se realizó visita de inspección ' + c.enDir + '. Una vez realizada la visita,') +
            ' se pudo evidenciar ' + pendiente + ', por lo que ' +
            (c.corregido ? 'se envió la novedad ' + c.supervisor + ' para su recolección, la cual se realizó ' + c.corregido + '.'
                         : 'se envió la novedad ' + c.supervisor + ' para su recolección inmediata, teniendo en cuenta que los residuos deben recogerse en un plazo máximo de 8 horas hábiles después de terminada la labor. La novedad queda registrada para el seguimiento de la interventoría.'));
        informar(c, p);
        b.push(c.enVisita + 'se evidenció ' + pendiente + (c.dir ? ' en ' + c.dir : '') + '; se envió la novedad ' + c.supervisor +
            (c.corregido ? ' y la recolección se realizó ' + c.corregido + '.' : ' para su recolección inmediata.'));
    } },
    incompleto: { titulo: 'Corte incompleto', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.enDir + ' se realizó corte de césped el ' + c.corte + ', ' + c.norma + '.');
        p.push('En la visita de verificación' + (c.visita ? ' del ' + c.visita : '') + ' se evidenció que el área no fue intervenida en su totalidad, por lo que se envió la novedad ' + c.supervisor +
            (c.corregido ? ' para completar la labor, la cual se realizó ' + c.corregido + '.'
                         : ' para completar la labor' + (c.proxima ? ' a más tardar el ' + c.proxima : '') + '. De acuerdo con las condiciones del contrato, el área que no se intervenga no se reconoce en el pago; la novedad queda registrada para el seguimiento de la interventoría.'));
        informar(c, p);
        b.push(c.enVisita + 'se verificó que el corte en ' + c.laDir + ' quedó incompleto; se envió la novedad ' + c.supervisor +
            (c.corregido ? ' y la labor se completó ' + c.corregido + '.' : ' para completarla' + (c.proxima ? ' a más tardar el ' + c.proxima : '') + '.'));
    } },
    calidad: { titulo: 'Corte mal hecho (altura, plateo, bordeo)', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.enDir + ' se realizó corte de césped el ' + c.corte + ', ' + c.norma + '.');
        p.push('En la visita de verificación' + (c.visita ? ' del ' + c.visita : '') + ' se evidenciaron deficiencias en la calidad de la labor (altura final del césped por fuera del rango de 2 a 9 cm, o plateo y bordeo pendientes), ' +
            'por lo que se envió la novedad ' + c.supervisor +
            (c.corregido ? ' para su corrección, la cual se realizó ' + c.corregido + '.' : ' para corregirlas y soportar la corrección con registro fotográfico. La novedad queda registrada para el seguimiento de la interventoría.'));
        informar(c, p);
        b.push(c.enVisita + 'se evidenciaron deficiencias en la calidad del corte en ' + c.laDir + ' (altura, plateo o bordeo); se envió la novedad ' + c.supervisor +
            (c.corregido ? ' y se corrigió ' + c.corregido + '.' : ' para corregirlas.'));
    } },
    metodo: { titulo: 'Machete o herbicida', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' con ocasión de lo reportado sobre la forma de ejecución de las labores de corte de césped.');
        p.push('Las especificaciones técnicas del servicio no permiten el corte con peinilla, rula o machete, ni el uso de herbicidas en el bordeo. La situación fue trasladada al contratista, a quien se le requirió ajustar la forma de ejecución; ' +
            'la novedad queda registrada para el seguimiento de la interventoría.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó lo reportado en ' + c.laDir + ' sobre la forma de corte. El contrato no permite cortar con machete ni usar herbicida en el bordeo; se requirió al contratista ajustar la ejecución.');
    } },
    danos: { titulo: 'Daño durante el corte', armar: function (c, p, b) {
        p.push('EMVARIAS S.A. E.S.P. tiene a su cargo la supervisión del servicio de corte de césped, cuya ejecución es realizada por ' + CONTRATISTA + '. ' +
            'En atención a la situación reportada' + (c.visita ? ', el ' + c.visita + ' se realizó visita de verificación ' + c.enDir + ' y' : ',') +
            ' se adelantaron las investigaciones pertinentes con base en las evidencias aportadas por las partes, dando lugar a las gestiones y al requerimiento correspondiente.');
        p.push(c.corregido ? 'Como resultado, el contratista realizó las verificaciones respectivas y ' + c.corregido.replace(/^el mismo día /, 'el ') + ' efectuó el desembolso del dinero correspondiente a los daños ocasionados, aportando el comprobante de pago como soporte.'
            : 'La novedad fue trasladada al contratista, quien de acuerdo con las condiciones del contrato debe atender las reclamaciones de la comunidad y responder por los daños ocasionados durante la prestación del servicio. ' +
              'Asimismo, se le solicitó reforzar las medidas de protección (mallas, limpieza previa del área y señalización) para evitar que la situación se repita.');
        informar(c, p);
        b.push('Se verificó la afectación reportada en ' + c.laDir + (c.corregido ? '; el contratista pagó los daños ' + c.corregido.replace(/^el mismo día /, 'el ') + ' y aportó el comprobante.' : '. Se trasladó al contratista para su atención y se solicitó reforzar las medidas de protección durante el corte.'));
    } },
    restriccion: { titulo: 'Obra o sin acceso', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció que el área presenta restricción de acceso u obras en el espacio público, condición que impide su intervención en este momento.');
        p.push('El área hace parte del catastro y será intervenida ' + c.norma + ', una vez se levante la restricción' + (c.proxima ? '; se tiene prevista para el ' + c.proxima : '') + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que ' + c.laDir + ' tiene restricción de acceso u obras en el espacio público; se intervendrá cuando se levante la restricción.');
    } },
    obraprivada: { titulo: 'Obra privada o predio cerrado', seguimiento: false, armar: function (c, p, b) {
        p.push((c.visita ? 'El ' + c.visita + ' p' : 'P') + 'rofesional del servicio visitó el sector referente a esta solicitud' + (c.dir ? ' (' + c.dir + ')' : '') +
            ' y evidenció que la solicitud hace referencia a un espacio con restricción de acceso por obras de construcción o cerramiento, por lo que no es posible gestionarla por EMVARIAS S.A. E.S.P. de acuerdo con los alcances de la prestación del servicio público de aseo.');
        p.push('Por lo anterior, es responsabilidad del administrador y/o propietario del espacio realizar el mantenimiento pertinente.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que ' + c.laDir + ' corresponde a un espacio con restricción de acceso por obras o cerramiento; su mantenimiento corresponde al administrador o propietario.');
    } },
    terceros: { titulo: 'Cerramiento o intervención de terceros', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.enDir + ' se realizó intervención asociada a corte de césped el ' + c.corte + ', ' + c.norma + '.');
        p.push('Adicionalmente, se han realizado visitas constantes al lugar referenciado, donde en ocasiones anteriores se informó a usuarios del sector sobre cerramientos y apropiación de áreas públicas' +
            (c.visita ? ', y el ' + c.visita + ' se evidenció intervención de terceros en la zona.' : ', y se ha evidenciado intervención de terceros en la zona.'));
        informar(c, p);
        b.push('Se realizó corte de césped en ' + (c.dir || 'la dirección de la solicitud') + ' el ' + c.corte + '. En visitas al sector se ha evidenciado cerramiento o intervención de terceros en el área pública.');
    } },
    ordenpublico: { titulo: 'Orden público', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenciaron condiciones de orden público que impiden, por el momento, la intervención segura del área.');
        p.push('El área hace parte del catastro y será intervenida ' + c.norma + ', una vez las condiciones lo permitan' + (c.proxima ? '; se tiene prevista para el ' + c.proxima : '') + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que en ' + c.laDir + ' hay condiciones de orden público que impiden por ahora la intervención; se realizará cuando las condiciones lo permitan.');
    } },
    lluvia: { titulo: 'Retraso por lluvias', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que el área verde ubicada ' + c.enDir + ' hace parte del catastro aprobado y es intervenida ' + c.norma + '. ' +
            'Debido a la temporada de lluvias, la ejecución de la programación se ha visto afectada, por lo que el contratista aplica su plan de contingencia para ponerse al día.');
        p.push('El área será intervenida ' + c.siguiente + '.');
        informar(c, p);
        b.push('Por la temporada de lluvias se presentó retraso en la programación; el área ' + (c.dir ? 'de ' + c.dir + ' ' : '') + 'será intervenida ' + c.siguiente + '.');
    } },
    fauna: { titulo: 'Abejas, avispas u otra fauna', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció la presencia de abejas, avispas u otra fauna silvestre en el área, ' +
            'por lo que, por seguridad del personal y de la comunidad, la intervención se suspendió para realizar el manejo correspondiente con el profesional biólogo del contratista.');
        p.push('El área será intervenida ' + c.siguiente + ', una vez se realice dicho manejo. Si el enjambre representa un riesgo inmediato para la comunidad, puede reportarlo a la línea de emergencias 123.');
        informar(c, p);
        b.push(c.enVisita + 'se evidenció fauna (abejas, avispas u otra) en ' + c.laDir + '; por seguridad se suspendió el corte y se intervendrá ' + c.siguiente + ' tras su manejo.');
    } },
    caracol: { titulo: 'Caracol africano', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció la presencia de caracol africano (Achatina fulica), especie invasora que representa un riesgo sanitario.');
        p.push('Por esta razón la intervención del área se suspendió y la novedad se reporta a la autoridad ambiental competente para su manejo. El área será intervenida una vez se atienda esta condición.');
        informar(c, p);
        b.push(c.enVisita + 'se evidenció caracol africano en ' + c.laDir + '; la intervención se suspendió y se reporta a la autoridad ambiental para su manejo.');
    } },
    desmonte: { titulo: 'Pasto muy alto (desmonte)', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció vegetación de altura considerable, correspondiente a un área que ingresa al catastro o que estuvo suspendida por causas externas.');
        p.push('El área se programó para su intervención mediante desmonte, que incluye la verificación previa de fauna, y se realizará ' + c.siguiente + '. Posteriormente quedará incluida en las frecuencias de corte ' + c.norma + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó vegetación alta en ' + c.laDir + '; se programó el desmonte del área para ' + (c.proxima ? 'el ' + c.proxima : 'la siguiente ronda') + ' y luego seguirá con las frecuencias de corte.');
    } },
    talud: { titulo: 'Talud inestable', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció que el área corresponde a un talud con signos de inestabilidad del terreno.');
        p.push('Por seguridad del personal y de la comunidad, la situación fue documentada y el área se programará para corte de césped una vez el terreno se encuentre estable. ' +
            'Si la condición del talud representa peligro para viviendas o vías, se recomienda reportarla al Departamento Administrativo de Gestión del Riesgo de Desastres (DAGRD).');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que ' + c.laDir + ' corresponde a un talud inestable; se intervendrá cuando el terreno se estabilice.');
    } },
    ambiental: { titulo: 'Quebrada o retiro ambiental', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que el área señalada corresponde a una zona de manejo y preservación ambiental (retiro de quebrada, río o canal), ' +
            'la cual no hace parte del alcance del corte de césped del servicio público de aseo.');
        p.push('Su intervención corresponde a la autoridad ambiental competente, a quien puede dirigir su solicitud.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que el área en ' + c.laDir + ' es un retiro de quebrada o zona de preservación ambiental, que no hace parte del alcance del corte de césped; corresponde a la autoridad ambiental.');
    } },
    // Con fecha del corte: el corte sí se hizo y en la visita se le explicó al usuario que no se hace ornato ni jardinería
    jardin: { titulo: 'Jardín u ornato', seguimiento: 'siCorte', armar: function (c, p, b) {
        if (c.hayCorte) {
            p.push(c.marco + ', se informa que ' + c.enDir + ' se realizó intervención asociada a corte de césped el ' + c.corte + ', ' + c.norma + '.');
            p.push('Adicionalmente, ' + c.elDia + 'se realizó visita al lugar y se le explicaron al usuario los alcances del servicio (no se realizan labores de ornato ni jardinería).');
            b.push('Se realizó corte de césped en ' + (c.dir || 'la dirección de la solicitud') + ' el ' + c.corte + '. ' + c.enVisita + 'se explicaron al usuario los alcances del servicio (no incluye ornato ni jardinería).');
            return;
        }
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que lo solicitado corresponde a labores de jardinería, ornato o embellecimiento, ' +
            'las cuales no hacen parte del alcance del corte de césped del servicio público de aseo.');
        p.push('El corte de césped de las áreas verdes públicas del sector continúa ' + c.norma + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que lo solicitado en ' + c.laDir + ' corresponde a jardinería u ornato, que no hace parte del alcance del corte de césped.');
    } },
    arbol: { titulo: 'Poda o tala de árboles', seguimiento: false, armar: function (c, p, b) {
        p.push('EMVARIAS S.A. E.S.P. informa que las actividades de poda de árboles se realizan a través del contratista DVB Ingeniería S.A.S. ' +
            'En atención a su solicitud, ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que lo solicitado corresponde a la poda o tala de árboles, actividad que no hace parte del componente de corte de césped.');
        p.push('Por lo anterior, la solicitud se traslada al contratista de poda de árboles para su evaluación y programación. El corte de césped de las áreas verdes públicas del sector continúa ' + c.norma + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que lo solicitado en ' + c.laDir + ' es poda o tala de árboles, que EMVARIAS realiza a través del contratista DVB Ingeniería S.A.S.; se traslada para su evaluación.');
    } },
    catastro: { titulo: 'Área pública fuera del catastro', seguimiento: false, armar: function (c, p, b) {
        p.push((c.visita ? 'El ' + c.visita + ' p' : 'P') + 'rofesional del servicio visitó el sector referente a esta solicitud' + (c.dir ? ' (' + c.dir + ')' : '') +
            ' y evidenció que no hace parte de la base de datos actual de corte de césped aprobada por el Distrito de Medellín.');
        p.push('Conforme con los lineamientos de la normatividad vigente, el solicitante debe establecer comunicación con la Secretaría de Infraestructura Física de la Alcaldía de Medellín para solicitar la verificación del área ' +
            'y su eventual entrega de forma oficial a EMVARIAS S.A. E.S.P. en el marco tarifario de la prestación del servicio público de aseo. Se recomienda evaluar el ingreso del área al servicio.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que el área en ' + c.laDir + ' no hace parte de la base de datos de corte de césped del Distrito; el solicitante debe pedir su verificación y entrega oficial a la Secretaría de Infraestructura Física.');
    } },
    canabrava: { titulo: 'Caña brava', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció que la vegetación corresponde a caña brava (Arundo donax), especie cuya intervención requiere permiso de la autoridad ambiental competente.');
        p.push('El área será intervenida una vez se cuente con dicho permiso, de acuerdo con la normatividad ambiental vigente.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que en ' + c.laDir + ' hay caña brava, cuya intervención requiere permiso de la autoridad ambiental; se intervendrá cuando se cuente con él.');
    } },
    zonadura: { titulo: 'Maleza en andén o zona dura', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que la vegetación señalada crece sobre zonas duras (andenes, adoquines, alcorques o cascajo) y no corresponde a césped en área verde.');
        p.push('Su retiro hace parte de las actividades de retiro de espartillo y limpieza de zonas duras, que se programan por separado del corte de césped; la solicitud se traslada para su evaluación y programación.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que la vegetación en ' + c.laDir + ' está sobre zona dura (andén, adoquín o alcorque), que no hace parte del corte de césped; se traslada para evaluar su programación.');
    } },
    escombros: { titulo: 'Escombros o basura (no vegetal)', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció la acumulación de residuos no vegetales (escombros, voluminosos o residuos ordinarios), los cuales no hacen parte de la actividad de corte de césped.');
        p.push('La novedad se traslada al componente de recolección del servicio de aseo para su atención. Para la recolección de escombros o voluminosos puede solicitar el servicio a través de los canales de atención de EMVARIAS.');
        informar(c, p);
        b.push(c.enVisita + 'se evidenciaron escombros o residuos no vegetales en ' + c.laDir + ', que no hacen parte del corte de césped; se traslada al componente de recolección.');
    } },
    sincesped: { titulo: 'Sin césped (tierra o zona dura)', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que el área señalada no presenta cobertura vegetal (césped), por lo que no requiere intervención de corte.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que el área en ' + c.laDir + ' no tiene cobertura vegetal, por lo que no requiere corte de césped.');
    } },
    noubicada: { titulo: 'No se ubicó el sitio', seguimiento: false, armar: function (c, p, b) {
        p.push('En atención a su solicitud, se procedió a verificar la dirección reportada' + (c.dir ? ' (' + c.dir + ')' : '') + ' en el control de ejecución y mediante visita de campo' + (c.visita ? ' el ' + c.visita : '') +
            ', con el fin de identificar el lugar y validar la novedad manifestada.');
        p.push('Sin embargo, no fue posible ubicar el sitio indicado, debido a que ' +
            (c.dirErrada ? 'la dirección suministrada no pudo ser identificada (no coincide con la nomenclatura de las vías del Distrito)' : 'no fue posible identificar con precisión el área verde objeto de la solicitud en la dirección suministrada') +
            (c.contacto ? '. Durante la visita ' + c.contacto + ' que se requiere una referencia más precisa del sitio.'
                : (c.sinTelefono ? ' y la solicitud no cuenta con datos de contacto que permitan comunicarse con el usuario' : ' y no fue posible establecer contacto con el usuario') + ' para precisar la ubicación. ' +
                  'Por esta razón, no fue posible verificar las condiciones del lugar. Se solicita indicar una referencia más precisa del sitio (punto de referencia, costado o tramo) para su verificación.'));
        b.push('Se verificó la dirección en el control de ejecución y en campo' + (c.visita ? ' el ' + c.visita : '') + ', sin que fuera posible ubicar el sitio' +
            (c.dirErrada ? ' (la dirección no coincide con la nomenclatura vial)' : '') + (c.sinTelefono && !c.contacto ? ' y la solicitud no tiene datos de contacto' : '') + '. Se requiere una referencia más precisa del sitio.');
    } },
};
// Botones de "Lo que encontró en la visita" (main.js), en este orden
export var RESULTADOS = {};
Object.keys(CASOS).forEach(function (k) { RESULTADOS[k] = CASOS[k].titulo; });
