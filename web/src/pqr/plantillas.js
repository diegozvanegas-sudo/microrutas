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

// Temas de la queja que el contrato responde. queja: palabras del ciudadano; clausula: cómo reconocer las cláusulas del
// resumen del contrato (public.contrato_secciones) que hablan de eso. El texto del contrato no está aquí (el repositorio es público).
export var TEMAS = [
    { id: 'frente', titulo: 'Frente de la casa o antejardín', queja: /frente|antejard[ií]n|mi casa|vivienda|fachada|anden|andén/i,
      clausula: /antejard|espacio p[uú]blico urbano/i, sugerencia: 'privado' },
    { id: 'altura', titulo: 'Pasto o maleza alta, no cortaron', queja: /maleza|hierba|pasto|rastrojo|monte|enmonta|no (lo |la |los |las )?(cortar|cortaron|podaron)|sin cortar|alto/i,
      clausula: /10 cm|entre 2 y 9|grama de menos/i },
    { id: 'residuos', titulo: 'Residuos del corte', queja: /residuo|basura|dejaron|recog|ramas|pasto cortado|material|escombro|bolsa/i,
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
      clausula: /peinilla|herbicida|azad[oó]n/i },
];
// Temas que aparecen en la queja (en el orden de TEMAS)
export function temasDeQueja(queja) {
    return TEMAS.filter(function (t) { return t.queja.test(String(queja || '')); });
}

export function saludo(hora) {
    return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

// Respuestas de cierre. d: { id, direccion, barrio, resultado, fechaCorte, fechaVisita, fechaProxima, contacto ('si'|'tel'|'no'),
// cobro, area (texto del área privada), observacion, clausulas ([{ t, ref }] del contrato), hora }. Devuelve [{ titulo, texto }]: la completa y una breve.
export function armarRespuestas(d) {
    var dir = [d.direccion, d.barrio].filter(Boolean).join(', ');
    var visita = fechaLarga(d.fechaVisita), proxima = fechaLarga(d.fechaProxima);
    // Piezas que comparten los casos (CASOS más abajo)
    var c = {
        dir: dir,
        enDir: dir ? 'en la dirección de su solicitud (' + dir + ')' : 'en la dirección de su solicitud',
        laDir: dir ? 'la dirección ' + dir : 'la dirección',
        corte: fechaLarga(d.fechaCorte) || '[fecha del corte]',
        visita: visita, proxima: proxima,
        elDia: visita ? 'el ' + visita + ' ' : '',
        enVisita: 'En visita ' + (visita ? 'del ' + visita + ' ' : ''),
        siguiente: proxima ? 'el ' + proxima : 'en la siguiente ronda programada',
        marco: 'Considerando los alcances de la prestación del servicio público de aseo',
        norma: 'de acuerdo con la programación y las frecuencias aprobadas en el Decreto 1077 de 2015 y en el Plan de Gestión Integral de Residuos Sólidos (PGIRS) vigente, según el catastro de áreas verdes aprobado por la Alcaldía de Medellín',
        area: d.area || 'un antejardín o zona de propiedad privada',
        contacto: {
            si: 'se estableció contacto con el usuario, a quien se le informó',
            tel: 'se estableció contacto telefónico con el usuario para informarle',
            no: '',
        }[d.contacto || 'no'],
    };
    var inicio = saludo(d.hora == null ? new Date().getHours() : d.hora) + ', favor dar cierre al ID ' + (d.id || '[ID]') + '.';
    var seguimiento = 'Se realizará monitoreo permanente en el sector durante las siguientes rondas programadas, con el fin de garantizar el cumplimiento, la seguridad y la calidad en la prestación del servicio.';
    var cobro = d.cobro ? 'Respecto al cobro en la factura de servicios públicos, le informamos que la actividad de corte de césped incluida en la tarifa del servicio de aseo corresponde a las áreas verdes públicas que hacen parte del catastro aprobado, y se ejecuta con la frecuencia establecida para cada una.' : '';
    var caso = CASOS[d.resultado] || CASOS.ejecutado, p = [], b = [];

    caso.armar(c, p, b);
    if (cobro) p.push(cobro);
    var clausulas = (d.clausulas || []).filter(function (x) { return x && x.t; });
    if (clausulas.length) {
        p.push('De acuerdo con las especificaciones técnicas del contrato de corte de césped:\n' + clausulas.map(function (x) {
            return '• ' + x.t.trim() + (x.ref ? ' (' + x.ref + ')' : '');
        }).join('\n'));
        b.push('Lo anterior, conforme a las especificaciones técnicas del contrato de corte de césped.');
    }
    if (d.observacion) { p.push(d.observacion.trim()); b.push(d.observacion.trim()); }
    if (caso.seguimiento !== false) { p.push(seguimiento); b.push('Se mantiene seguimiento en el sector.'); }
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
        p.push('Adicionalmente, ' + c.elDia + 'se realizó visita de verificación en la dirección' +
            (c.contacto ? ' y ' + c.contacto + ' que las labores sí fueron ejecutadas; se evidencian cambios positivos en la ejecución de las labores.'
                        : ', en la que se evidenció la ejecución de las labores; no fue posible establecer contacto con el usuario.'));
        b.push('En ' + (c.dir || 'la dirección de la solicitud') + ' se realizó corte de césped el ' + c.corte + ', según la programación y frecuencias del PGIRS vigente (Decreto 1077 de 2015). ' +
            c.enVisita + 'se verificó la ejecución de las labores' + (c.contacto ? ' y se informó al usuario.' : '.'));
    } },
    subsanado: { titulo: 'Se ejecutó después de la queja', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que, atendiendo su solicitud, ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se programó la intervención del área, la cual fue ejecutada el ' + c.corte + ', ' + c.norma + '.');
        p.push(c.contacto ? 'Adicionalmente, ' + c.contacto + ' que las labores fueron ejecutadas.' : 'No fue posible establecer contacto con el usuario en el momento de la visita.');
        b.push('Atendiendo la solicitud, se verificó ' + c.laDir + ' y se ejecutó el corte de césped el ' + c.corte + ', según la programación del PGIRS vigente (Decreto 1077 de 2015).' + (c.contacto ? ' Se informó al usuario.' : ''));
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
    residuos: { titulo: 'Quedaron residuos del corte', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.enDir + ' se realizó corte de césped el ' + c.corte + ', ' + c.norma + '.');
        p.push('En la visita de verificación' + (c.visita ? ' del ' + c.visita : '') + ' se evidenciaron residuos vegetales pendientes de recolección, por lo que se requirió al contratista su recolección inmediata, ' +
            'teniendo en cuenta que deben recogerse en un plazo máximo de 8 horas hábiles después de terminada la labor. La novedad queda registrada para el seguimiento de la interventoría.');
        informar(c, p);
        b.push('Se realizó corte de césped en ' + (c.dir || 'la dirección de la solicitud') + ' el ' + c.corte + '. ' + c.enVisita + 'se evidenciaron residuos pendientes y se requirió al contratista su recolección inmediata.');
    } },
    danos: { titulo: 'Daño durante el corte', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' con ocasión de la afectación reportada durante las labores de corte de césped del ' + c.corte + '.');
        p.push('La novedad fue trasladada al contratista, quien de acuerdo con las condiciones del contrato debe atender las reclamaciones de la comunidad y responder por los daños ocasionados durante la prestación del servicio. ' +
            'Asimismo, se le solicitó reforzar las medidas de protección (mallas, limpieza previa del área y señalización) para evitar que la situación se repita.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó la afectación reportada en ' + c.laDir + '. Se trasladó al contratista para su atención y se solicitó reforzar las medidas de protección durante el corte.');
    } },
    restriccion: { titulo: 'Obra o sin acceso', armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció que el área presenta restricción de acceso u obras en el espacio público, condición que impide su intervención en este momento.');
        p.push('El área hace parte del catastro y será intervenida ' + c.norma + ', una vez se levante la restricción' + (c.proxima ? '; se tiene prevista para el ' + c.proxima : '') + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que ' + c.laDir + ' tiene restricción de acceso u obras en el espacio público; se intervendrá cuando se levante la restricción.');
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
    jardin: { titulo: 'Jardín u ornato', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que lo solicitado corresponde a labores de jardinería, ornato o embellecimiento, ' +
            'las cuales no hacen parte del alcance del corte de césped del servicio público de aseo.');
        p.push('El corte de césped de las áreas verdes públicas del sector continúa ' + c.norma + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que lo solicitado en ' + c.laDir + ' corresponde a jardinería u ornato, que no hace parte del alcance del corte de césped.');
    } },
    arbol: { titulo: 'Poda o tala de árboles', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se constató que lo solicitado corresponde a la poda o tala de árboles, actividad que no hace parte del componente de corte de césped.');
        p.push('La solicitud se traslada al área competente para su evaluación y atención. El corte de césped de las áreas verdes públicas del sector continúa ' + c.norma + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que lo solicitado en ' + c.laDir + ' es poda o tala de árboles, que no hace parte del corte de césped; se traslada al área competente.');
    } },
    catastro: { titulo: 'Área pública fuera del catastro', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció que el área señalada no se encuentra incluida en el catastro de áreas verdes públicas aprobado por la Alcaldía de Medellín, ' +
            'por lo que actualmente no hace parte de la programación de corte de césped.');
        p.push('La solicitud se traslada al profesional de zonas verdes para que evalúe la posible inclusión del área en el catastro. De ser incluida, se intervendrá ' + c.norma + '.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que el área en ' + c.laDir + ' no está en el catastro de áreas verdes públicas; se traslada para evaluar su inclusión.');
    } },
    canabrava: { titulo: 'Caña brava', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ' y se evidenció que la vegetación corresponde a caña brava (Arundo donax), especie cuya intervención requiere permiso de la autoridad ambiental competente.');
        p.push('El área será intervenida una vez se cuente con dicho permiso, de acuerdo con la normatividad ambiental vigente.');
        informar(c, p);
        b.push(c.enVisita + 'se verificó que en ' + c.laDir + ' hay caña brava, cuya intervención requiere permiso de la autoridad ambiental; se intervendrá cuando se cuente con él.');
    } },
    noubicada: { titulo: 'No se ubicó el sitio', seguimiento: false, armar: function (c, p, b) {
        p.push(c.marco + ', se informa que ' + c.elDia + 'se realizó visita de verificación ' + c.enDir + ', sin que fuera posible identificar con precisión el área verde objeto de la solicitud.');
        p.push(c.contacto ? 'Adicionalmente, ' + c.contacto + ' que se requiere una referencia más precisa del sitio.'
            : 'No fue posible establecer contacto con el usuario. Se solicita indicar una referencia más precisa del sitio (punto de referencia, costado o tramo) para su verificación.');
        b.push(c.enVisita + 'no fue posible ubicar con precisión el área de la solicitud en ' + c.laDir + '. Se requiere una referencia más precisa del sitio.');
    } },
};
// Botones de "Lo que encontró en la visita" (main.js), en este orden
export var RESULTADOS = {};
Object.keys(CASOS).forEach(function (k) { RESULTADOS[k] = CASOS[k].titulo; });
