// Buena operación (menú Más, al lado de Posibles hallazgos): mensajes de WhatsApp de lo que se ve BIEN en campo, para reportar
// la correcta operación del corte de césped. Se buscan por palabras ("mallas", "PMT", "plateo"…), se pone dónde ("Las Palmas (842)")
// y se copian uno por uno o varios juntos en un solo mensaje.
// Para agregar uno: { g: grupo, t: título, c: palabras con que se busca, m: mensaje ({donde} = "en Las Palmas (842)"), p: punto corto para el mensaje con varios }.
import { norm } from './util.js';

export var BUENAS = [
    // ---------- Seguridad y señalización ----------
    { g: 'Seguridad y señalización', t: 'Señales de seguridad vial y telas de protección', c: 'senales senalizacion seguridad vial frentes trabajo telas tela proteccion conos',
        m: 'Al momento se evidencia operación del servicio de corte de césped {donde} implementando señales de seguridad vial en sus frentes de trabajo y telas de protección. ✅',
        p: 'Señales de seguridad vial en los frentes de trabajo y telas de protección' },
    { g: 'Seguridad y señalización', t: 'PMT implementado', c: 'pmt plan manejo transito via conos senales delimitacion aprobado',
        m: 'Se evidencia {donde} la implementación del PMT en el frente de trabajo sobre la vía, con conos, señales y delimitación según lo aprobado. ✅',
        p: 'PMT implementado sobre la vía (conos, señales y delimitación)' },
    { g: 'Seguridad y señalización', t: 'Auxiliar de PMT controlando el paso', c: 'auxiliar pmt paletero banderero transito control paso vehiculos peatones',
        m: 'Se evidencia auxiliar de PMT {donde} controlando el paso de vehículos y peatones mientras se realiza el corte. ✅',
        p: 'Auxiliar de PMT controlando el paso de vehículos y peatones' },
    { g: 'Seguridad y señalización', t: 'Área de trabajo delimitada', c: 'delimitacion delimitada cinta conos paletas perimetro area trabajo',
        m: 'El área de trabajo {donde} se encuentra delimitada con cinta y conos, protegiendo el paso de los peatones durante la operación. ✅',
        p: 'Área de trabajo delimitada con cinta y conos' },
    { g: 'Seguridad y señalización', t: 'Paso seguro de peatones', c: 'peatones peaton paso seguro anden circulacion comunidad',
        m: 'Se garantiza el paso seguro de los peatones {donde} durante la operación, sin obstaculizar andenes ni accesos. ✅',
        p: 'Paso seguro de peatones, sin obstaculizar andenes ni accesos' },
    { g: 'Seguridad y señalización', t: 'Valla de divulgación vigente', c: 'valla vallas divulgacion contrato informacion frente',
        m: 'Se evidencia valla de divulgación vigente instalada en el frente de trabajo {donde}. ✅',
        p: 'Valla de divulgación vigente en el frente de trabajo' },

    // ---------- Mallas de protección ----------
    { g: 'Mallas de protección', t: 'Mallas de protección en uso', c: 'malla mallas proteccion guadanador guadanadora auxiliar malla mampara',
        m: 'Se evidencia {donde} el uso de mallas de protección durante el corte: ningún guadañador trabaja sin malla y el auxiliar la va desplazando. ✅',
        p: 'Mallas de protección en uso, ningún guadañador sin malla' },
    { g: 'Mallas de protección', t: 'Separador vial con dos mallas', c: 'separador separadores vial malla mallas dos lados ambos',
        m: 'En el separador vial {donde} se evidencia el uso de dos mallas por guadañador, una a cada lado, protegiendo a vehículos y peatones. ✅',
        p: 'Dos mallas por guadañador en el separador vial' },
    { g: 'Mallas de protección', t: 'Mallas en buen estado', c: 'malla mallas estado reflectiva ruedas estructura especificacion 4 2',
        m: 'Las mallas de protección {donde} se encuentran en buen estado, reflectivas y con su estructura y ruedas, según lo establecido. ✅',
        p: 'Mallas en buen estado, reflectivas y con ruedas' },
    { g: 'Mallas de protección', t: 'Protección de carros, ventanas y fachadas', c: 'carro carros vehiculos parqueados vidrio ventanas fachada locales proteccion piedras',
        m: 'Se evidencia protección de los vehículos parqueados, ventanas y fachadas {donde} con mallas durante el uso de la guadañadora. ✅',
        p: 'Protección de vehículos parqueados, ventanas y fachadas' },

    // ---------- Personal ----------
    { g: 'Personal', t: 'EPP completo', c: 'epp careta gafas protector auditivo canilleras peto carnaza guantes botas casco dotacion',
        m: 'Se evidencia el personal {donde} con sus EPP completos: careta, gafas, protección auditiva, canilleras, peto, guantes y botas. ✅',
        p: 'Personal con EPP completo' },
    { g: 'Personal', t: 'Uniforme y carné', c: 'uniforme distintivo carne identificacion dotacion ropa',
        m: 'El personal {donde} porta el uniforme distintivo del contrato y su carné de identificación. ✅',
        p: 'Uniforme distintivo y carné' },
    { g: 'Personal', t: 'Supervisor acompañando la cuadrilla', c: 'supervisor supervision acompanamiento coordinando cuadrilla contratista',
        m: 'Se evidencia acompañamiento del supervisor del contratista {donde}, coordinando las labores de la cuadrilla. ✅',
        p: 'Supervisor acompañando y coordinando la cuadrilla' },
    { g: 'Personal', t: 'Cuadrilla completa', c: 'cuadrilla completa personal operarios equipos herramientas',
        m: 'La cuadrilla {donde} se encuentra completa, con el personal y los equipos necesarios para la actividad programada. ✅',
        p: 'Cuadrilla completa, con personal y equipos' },
    { g: 'Personal', t: 'Distancia entre guadañadores', c: 'distancia seguridad guadanadores varios simultanea separacion',
        m: 'Se evidencia distancia de seguridad entre los guadañadores {donde} durante la operación simultánea. ✅',
        p: 'Distancia de seguridad entre guadañadores' },
    { g: 'Personal', t: 'Buen trato con la comunidad', c: 'comunidad vecinos trato respeto inquietudes atencion ciudadano',
        m: 'Se evidencia buen trato del personal con la comunidad {donde}, atendiendo sus inquietudes de forma respetuosa. ✅',
        p: 'Buen trato con la comunidad' },

    // ---------- Ejecución del corte ----------
    { g: 'Ejecución del corte', t: 'Limpieza previa del área', c: 'limpieza previa piedras rocas ramas objetos basura antes despejar',
        m: 'Se evidencia limpieza previa del área {donde}, retirando piedras, ramas y residuos antes de pasar la guadañadora. ✅',
        p: 'Limpieza previa del área antes del corte' },
    { g: 'Ejecución del corte', t: 'Corte parejo (2 a 9 cm)', c: 'corte parejo uniforme altura 2 9 cm buen acabado calidad',
        m: 'Se evidencia corte de césped parejo {donde}, con la altura entre 2 y 9 cm. ✅',
        p: 'Corte parejo, con altura entre 2 y 9 cm' },
    { g: 'Ejecución del corte', t: 'Lote intervenido completo', c: 'completo totalidad 100 lote bordes esquinas postes bancas mobiliario',
        m: 'Se evidencia el lote {donde} intervenido en su totalidad, incluidos bordes, esquinas y alrededor del mobiliario. ✅',
        p: 'Lote completo, incluidos bordes, esquinas y mobiliario' },
    { g: 'Ejecución del corte', t: 'Medición de la altura con regla', c: 'regla flexometro medir medicion altura 10 cm antes despues',
        m: 'Se evidencia la medición de la altura del césped con regla o flexómetro {donde}, antes y después del corte. ✅',
        p: 'Medición de la altura con regla o flexómetro' },
    { g: 'Ejecución del corte', t: 'Jardines protegidos', c: 'jardin jardines plantas ornamentales antejardin proteccion material encima',
        m: 'Se evidencia cuidado de los jardines y plantas ornamentales {donde} durante el corte, sin dejarles material encima. ✅',
        p: 'Jardines y plantas ornamentales protegidos' },
    { g: 'Ejecución del corte', t: 'Verificación de fauna', c: 'fauna nidos panal panales abejas avispas animales verificacion biologo',
        m: 'Se evidencia la verificación de fauna {donde} antes de iniciar el corte (nidos, panales y animales), sin afectaciones. ✅',
        p: 'Verificación de fauna antes del corte' },
    { g: 'Ejecución del corte', t: 'Desmonte con verificación de fauna', c: 'desmonte pasto alto maleza alta fauna verificacion previa',
        m: 'Se evidencia el desmonte {donde} con la verificación previa de fauna por parte del contratista. ✅',
        p: 'Desmonte con verificación previa de fauna' },
    { g: 'Ejecución del corte', t: 'Espartillo en zonas duras', c: 'espartillo zonas duras nylon hilo adoquin anden separador sustrato arenilla',
        m: 'Se evidencia el retiro de espartillo {donde} con guadañadora de hilo nylon, retirando también el sustrato y recogiendo los residuos. ✅',
        p: 'Retiro de espartillo con hilo nylon, recogiendo el sustrato' },
    { g: 'Ejecución del corte', t: 'Cumpliendo la programación', c: 'programacion programado lote dia cumplimiento sig ubicacion',
        m: 'La cuadrilla se encuentra {donde}, en el lote programado para el día. ✅',
        p: 'En el lote programado para el día' },

    // ---------- Plateo, bordeo y árboles ----------
    { g: 'Plateo, bordeo y árboles', t: 'Plateo bien hecho', c: 'plateo platear plato arboles arbustos mano 60 cm raices',
        m: 'Se evidencia el plateo de los árboles {donde}, realizado a mano y sin afectar las raíces. ✅',
        p: 'Plateo de árboles a mano, sin afectar raíces' },
    { g: 'Plateo, bordeo y árboles', t: 'Bordeo bien hecho', c: 'bordeo bordear borde orilla anden sardinel 5 cm acabado perfilado',
        m: 'Se evidencia el bordeo {donde} con buen acabado, sin superar los 5 cm de ancho. ✅',
        p: 'Bordeo con buen acabado, sin pasar de 5 cm' },
    { g: 'Plateo, bordeo y árboles', t: 'Base de los árboles limpiada a mano', c: 'base arbol arboles tronco limpieza manual heridas corteza',
        m: 'Se evidencia la limpieza manual en la base de los árboles {donde} antes del corte, evitando heridas en los troncos. ✅',
        p: 'Base de los árboles limpiada a mano, sin heridas en los troncos' },

    // ---------- Residuos y barrido ----------
    { g: 'Residuos y barrido', t: 'Recolección a medida que avanza', c: 'recoleccion recogen residuos vegetales avanza simultanea material cortado',
        m: 'Se evidencia la recolección de los residuos vegetales {donde} a medida que avanza el corte. ✅',
        p: 'Recolección de residuos a medida que avanza el corte' },
    { g: 'Residuos y barrido', t: 'Acopio ordenado y señalizado', c: 'acopio acopiados ordenado lonas bolsas cinta reflectiva senalizados paso',
        m: 'Los residuos {donde} se encuentran acopiados de forma ordenada, en lonas en buen estado y señalizados, sin obstaculizar el paso. ✅',
        p: 'Residuos acopiados en orden, en lonas y señalizados' },
    { g: 'Residuos y barrido', t: 'Residuos lejos de sumideros', c: 'sumidero sumideros alcantarilla cuneta cunetas drenaje rejilla lluvias',
        m: 'Los residuos acopiados {donde} se ubicaron lejos de sumideros y cunetas, evitando obstrucciones. ✅',
        p: 'Acopio lejos de sumideros y cunetas' },
    { g: 'Residuos y barrido', t: 'Barrido de zonas duras', c: 'barrido barrer anden andenes sardinel calzada zonas duras senderos',
        m: 'Se evidencia el barrido de andenes, sardineles y calzada {donde} después del corte y del bordeo. ✅',
        p: 'Barrido de andenes, sardineles y calzada' },
    { g: 'Residuos y barrido', t: 'Barrido de la zona verde', c: 'barrido barrer zona verde zv material cortado tendido',
        m: 'Se evidencia el barrido y la recolección del material cortado sobre la zona verde {donde}. ✅',
        p: 'Barrido y recolección del material sobre la zona verde' },
    { g: 'Residuos y barrido', t: 'Uso adecuado de sopladoras', c: 'sopladora sopladoras blower soplador polvo direccion',
        m: 'Se evidencia el uso adecuado de las sopladoras {donde}, dirigiendo el material lejos de peatones y vehículos y sin enviarlo a la zona verde. ✅',
        p: 'Sopladoras bien usadas, lejos de peatones y vehículos' },
    { g: 'Residuos y barrido', t: 'Recolección dentro de las 8 horas', c: 'recoleccion plazo 8 horas habiles recogidos residuos vegetales tiempo',
        m: 'Se verificó la recolección de los residuos vegetales {donde} dentro de las 8 horas hábiles siguientes al corte. ✅',
        p: 'Residuos recogidos dentro de las 8 horas hábiles' },
    { g: 'Residuos y barrido', t: 'Carga cubierta y asegurada', c: 'volqueta camion vehiculo carga carpa carpada cubierta asegurada transporte',
        m: 'Se evidencia el vehículo de recolección {donde} con la carga cubierta y asegurada. ✅',
        p: 'Vehículo de recolección con la carga cubierta' },
    { g: 'Residuos y barrido', t: 'RCD y voluminosos presentados y reportados', c: 'rcd escombros voluminosos ordinarios limpieza previa reportados punto accesible',
        m: 'Los RCD y voluminosos encontrados en la limpieza previa {donde} se presentaron en un punto accesible y se reportaron para su recolección. ✅',
        p: 'RCD y voluminosos presentados en punto accesible y reportados' },
    { g: 'Residuos y barrido', t: 'Área limpia al terminar', c: 'limpio limpia orden final finalizar terminar herramientas area entregada',
        m: 'Al finalizar, el área intervenida {donde} queda en orden y limpia, sin residuos ni herramientas. ✅',
        p: 'Área en orden y limpia al terminar' },

    // ---------- Equipos ----------
    { g: 'Equipos', t: 'Equipos en buen estado', c: 'equipos guadanadoras sopladoras estado funcionamiento herramientas',
        m: 'Se evidencian los equipos {donde} (guadañadoras y sopladoras) en buen estado de funcionamiento. ✅',
        p: 'Guadañadoras y sopladoras en buen estado' },
    { g: 'Equipos', t: 'Abastecimiento de combustible seguro', c: 'combustible gasolina tanquear abastecimiento recipiente rotulado derrame motor apagado',
        m: 'Se evidencia el abastecimiento de combustible {donde} con el motor apagado, en recipientes rotulados y sin derrames. ✅',
        p: 'Combustible con motor apagado, en recipientes rotulados y sin derrames' },
    { g: 'Equipos', t: 'Ajustes con el motor apagado', c: 'nylon cuchilla ajuste mantenimiento reparacion motor apagado',
        m: 'Los cambios de nylon y los ajustes de los equipos {donde} se realizan con el motor apagado. ✅',
        p: 'Ajustes y cambio de nylon con el motor apagado' },

    // ---------- Registro y reporte ----------
    { g: 'Registro y reporte', t: 'Registro fotográfico completo', c: 'fotos registro fotografico fases antes durante complementarias despues gps fecha hora',
        m: 'Se evidencia el registro fotográfico {donde} en sus cuatro fases (antes, durante, complementarias y después), con GPS, fecha y hora. ✅',
        p: 'Registro fotográfico en sus cuatro fases, con GPS, fecha y hora' },
    { g: 'Registro y reporte', t: 'GPS de la cuadrilla en línea', c: 'gps rastreo ubicacion tiempo real senal cuadrilla',
        m: 'Se visualiza en tiempo real la ubicación de la cuadrilla {donde} en el GPS. ✅',
        p: 'Ubicación de la cuadrilla en tiempo real en el GPS' },
    { g: 'Registro y reporte', t: 'Externalidad reportada a tiempo', c: 'externalidad reporte reportada tiempo restriccion acceso obra orden publico caracol',
        m: 'El contratista reportó a tiempo la externalidad encontrada {donde}, con su registro fotográfico. ✅',
        p: 'Externalidad reportada a tiempo, con fotos' },

    // ---------- Visita y cierre ----------
    { g: 'Visita y cierre', t: 'Operación sin novedad', c: 'sin novedad normal correcta bien todo ok visita durante operacion',
        m: 'Visita durante la operación {donde}: las actividades de corte de césped se ejecutan correctamente, sin novedad. ✅',
        p: 'Actividades ejecutándose correctamente, sin novedad' },
    { g: 'Visita y cierre', t: 'Novedad subsanada', c: 'subsanada subsanacion corregida novedad atendida correccion',
        m: 'Se verificó {donde} la subsanación de la novedad reportada; el área se encuentra en buenas condiciones. ✅',
        p: 'Novedad reportada ya subsanada' },
    { g: 'Visita y cierre', t: 'Atendieron la retroalimentación', c: 'retroalimentacion atendida corrigieron mejora recomendacion llamado atencion',
        m: 'Se evidencia que la cuadrilla {donde} atendió la retroalimentación dada en la visita anterior; se observan mejoras en la ejecución. ✅',
        p: 'Atendieron la retroalimentación de la visita anterior' },
    { g: 'Visita y cierre', t: 'Suspensión segura por lluvia', c: 'lluvia lluvias llovio aguacero tormenta suspension suspendio clima',
        m: 'Por la lluvia, la cuadrilla {donde} suspendió el corte de forma segura, recogiendo los residuos y protegiendo los equipos. ✅',
        p: 'Suspensión segura por lluvia, con los residuos recogidos' },
];

// "Las Palmas (842)" -> "en Las Palmas (842)"; vacío -> "en …" para completarlo en el chat. Si ya empieza con "en", "sobre"… se deja
export function donde(lugar) {
    var l = String(lugar || '').trim();
    if (!l) return 'en …';
    return /^(en|sobre|por|del?|junto|frente)\b/i.test(l) ? l : 'en ' + l;
}
export function mensaje(i, lugar) { return BUENAS[i].m.split('{donde}').join(donde(lugar)); }
// Varios elegidos en un solo mensaje: el encabezado con dónde y un ✅ por punto
export function mensajeVarios(idx, lugar) {
    if (!idx.length) return '';
    if (idx.length === 1) return mensaje(idx[0], lugar);
    return 'Al momento se evidencia operación del servicio de corte de césped ' + donde(lugar) + ', con:\n' +
        idx.map(function (i) { return '✅ ' + BUENAS[i].p; }).join('\n');
}

// Búsqueda: sin tildes ni mayúsculas, por raíz ("mallas" encuentra "malla"); primero los que coinciden en título o palabras clave
var VACIAS = ' LOS LAS DEL CON SIN POR PARA QUE UNA UNO HAY SUS ESTA ESTE ESTAN SOBRE ENTRE LOTE CUADRILLA ZONA AREA BIEN BUENA BUENO SE EVIDENCIA ';
function palabras(s) {
    return norm(s).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(function (p) { return (p.length >= 3 || /\d/.test(p)) && VACIAS.indexOf(' ' + p + ' ') === -1; });
}
function raiz(p) { return p.slice(0, Math.min(p.length, 5)); }
function tiene(lista, r) { return lista.some(function (p) { return p.indexOf(r) === 0; }); }
var indice = BUENAS.map(function (b) { return { claves: palabras(b.t + ' ' + b.c + ' ' + b.g), mensaje: palabras(b.m) }; });
export function buscarBuenas(texto) {
    var rs = palabras(texto).map(raiz).filter(function (r, i, a) { return a.indexOf(r) === i; });
    if (!rs.length) return BUENAS.map(function (b, i) { return i; });
    return indice.map(function (x, i) {
        var p = 0;
        rs.forEach(function (r) { p += tiene(x.claves, r) ? 3 : tiene(x.mensaje, r) ? 1 : 0; });
        return { i: i, p: p };
    }).filter(function (x) { return x.p > 0; })
        .sort(function (a, b) { return b.p - a.p || a.i - b.i; })
        .map(function (x) { return x.i; });
}
