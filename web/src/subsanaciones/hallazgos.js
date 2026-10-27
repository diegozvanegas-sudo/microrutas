// Posibles hallazgos (menú Más y debajo de las observaciones): mensajes de interventoría listos para el grupo de WhatsApp.
// Se buscan por lo que se escribe: "sopladora", "piedras", "carro parqueado"… encuentran el mensaje que corresponde.
// Para agregar uno: { t: título, c: palabras con que se busca (sin tildes da igual), m: mensaje }.
import { norm } from './util.js';

export var HALLAZGOS = [
    { t: 'Uso de mamparas de protección', c: 'mampara mamparas pantalla lona polisombra proteccion guadana guadanadora',
        m: 'Favor verificar el uso de mamparas de protección durante las actividades de corte de césped, especialmente cuando operen varios guadañadores simultáneamente, con el fin de prevenir accidentes y posibles afectaciones a peatones, vehículos y terceros.' },
    { t: 'Uso de sopladoras', c: 'sopladora sopladoras soplador soplar polvo',
        m: 'Favor verificar el uso adecuado de las sopladoras durante la limpieza del área intervenida, evitando proyectar polvo, piedras y residuos hacia peatones, vehículos, viviendas o establecimientos cercanos.' },
    { t: 'Elementos de protección personal (EPP)', c: 'epp casco gafas careta visor guantes botas chaleco protector auditivo tapaoidos dotacion overol uniforme',
        m: 'Se recomienda verificar que todo el personal operativo cuente con los elementos de protección personal requeridos y los utilice correctamente durante la ejecución de las actividades.' },
    { t: 'Señalización y delimitación del área', c: 'senalizacion senal delimitacion demarcacion demarcar cinta conos maletines pmt valla aislamiento',
        m: 'Favor verificar la señalización y delimitación del área de trabajo antes de iniciar las actividades, especialmente en zonas de circulación peatonal y vehicular, para prevenir incidentes durante la operación.' },
    { t: 'Operación simultánea de guadañadoras', c: 'guadana guadanadora guadanadoras guadanador simultanea simultaneo varios juntos cerca distancia',
        m: 'Favor verificar que durante la operación simultánea de varias guadañadoras se mantengan distancias de seguridad entre los operarios y se implementen las medidas de protección necesarias para evitar la proyección de objetos y accidentes.' },
    { t: 'Presencia de peatones y terceros', c: 'peaton peatones transeunte personas gente residentes vecinos ninos estudiantes terceros comunidad',
        m: 'Favor prestar especial atención a la presencia de peatones, residentes y demás personas cercanas al área de intervención, tomando las medidas preventivas necesarias antes y durante la ejecución de las labores.' },
    { t: 'Vehículos estacionados', c: 'vehiculo vehiculos carro carros moto motos bus estacionado estacionados parqueado parqueados',
        m: 'Favor tener precaución durante las labores de corte de césped en zonas con vehículos estacionados, verificando las medidas de protección para evitar daños por la proyección de piedras u otros objetos.' },
    { t: 'Protección de ventanas, fachadas y establecimientos', c: 'ventana ventanas vidrio vidrios fachada fachadas vivienda casa casas local negocio establecimiento edificio porteria',
        m: 'Favor prestar atención a las viviendas, ventanas, fachadas y establecimientos ubicados cerca del área de trabajo, implementando las medidas preventivas necesarias para evitar daños durante el corte y la limpieza.' },
    { t: 'Recolección de residuos vegetales', c: 'recoleccion recoger residuos residuo pasto cesped cortado material vegetal bolsas lonas basura acopio',
        m: 'Favor verificar que los residuos vegetales generados durante la actividad sean recogidos oportunamente y que el área intervenida quede limpia y libre de material que pueda obstaculizar el paso peatonal o vehicular.' },
    { t: 'Uso de herramientas y equipos', c: 'herramienta herramientas equipo equipos estado dano danada guadana sopladora maquina cuchilla nylon',
        m: 'Favor verificar el estado de las guadañadoras, sopladoras y demás herramientas antes de iniciar la operación, reportando cualquier condición que pueda representar un riesgo para el personal o la comunidad.' },
    { t: 'Proyección de piedras y objetos', c: 'piedra piedras botella botellas alambre vidrio objetos proyeccion proyectar escombro escombros',
        m: 'Durante el corte de césped, favor verificar que se revise previamente el terreno para identificar piedras, botellas, alambres u otros objetos que puedan ser proyectados por la guadañadora y ocasionar lesiones o daños materiales.' },
    { t: 'Presencia de auxiliares de apoyo', c: 'auxiliar auxiliares apoyo paletero banderero ayudante personal',
        m: 'Favor verificar que se disponga del personal auxiliar de apoyo requerido según las condiciones de la operación, especialmente en áreas con circulación de personas o vehículos, para facilitar el control del entorno y prevenir incidentes.' },
    { t: 'Condiciones climáticas', c: 'lluvia llover lloviendo clima tormenta rayos electrica mojado barro resbaloso',
        m: 'Favor estar atentos a las condiciones climáticas durante la ejecución de las actividades y evaluar la continuidad de los trabajos cuando la lluvia, las tormentas eléctricas o las condiciones del terreno puedan comprometer la seguridad del personal.' },
    { t: 'Trabajo cerca de vías públicas', c: 'via vias calle carretera avenida trafico transito separador vehicular calzada',
        m: 'Favor reforzar las medidas preventivas durante las labores realizadas cerca de vías vehiculares, garantizando la señalización correspondiente y evitando que los residuos o las herramientas interfieran con la circulación segura.' },
    { t: 'Árboles, jardines y mobiliario urbano', c: 'arbol arboles herida heridas corteza jardin jardines plantas senales luminaria luminarias poste banca bancas mobiliario',
        m: 'Favor tener precaución durante el corte de césped alrededor de árboles, jardines, señales, luminarias, bancas y demás elementos del espacio público, evitando afectaciones a la vegetación y daños a la infraestructura existente.' },
    { t: 'Reporte de incidentes y novedades', c: 'incidente accidente lesion herido dano danos afectacion reporte reportar',
        m: 'En caso de presentarse algún incidente, daño material, afectación a terceros o condición insegura durante la operación, favor reportarlo oportunamente a la interventoría, acompañado de los registros fotográficos y la información correspondiente.' },
    { t: 'Orden y limpieza al finalizar', c: 'orden limpieza limpio sucio final finalizar terminar abandonada abandonadas barrido',
        m: 'Favor verificar al finalizar las actividades que el área intervenida quede en condiciones adecuadas de orden y limpieza, sin residuos vegetales, herramientas abandonadas ni elementos que puedan generar riesgos para la comunidad.' },
    { t: 'Registro fotográfico de la actividad', c: 'foto fotos fotografia fotografico registro evidencia evidencias antes despues',
        m: 'Favor garantizar el registro fotográfico de las actividades ejecutadas, incluyendo las condiciones iniciales, el desarrollo de los trabajos y el estado final del área intervenida, de acuerdo con los requerimientos establecidos.' },
    { t: 'Uso de sopletes o equipos de calor', c: 'soplete sopletes llama fuego calor quema quemar incendio',
        m: 'Favor verificar las condiciones de seguridad para el uso de sopletes o equipos que generen llama o calor, cuando su utilización esté autorizada y sea necesaria para la actividad, evitando su uso cerca de vegetación seca, materiales combustibles, peatones o vehículos, y garantizando las medidas de prevención de incendios.' },
    { t: 'Incumplimiento de medidas de seguridad', c: 'seguridad inseguro insegura riesgo peligro incumplimiento',
        m: 'Se solicita verificar permanentemente el cumplimiento de las medidas de seguridad durante la operación. En caso de identificar condiciones que representen un riesgo, favor informar oportunamente y gestionar las acciones correctivas correspondientes antes de continuar con la actividad.' },
    { t: 'Derrame de combustible o aceite', c: 'derrame derramado combustible gasolina aceite mezcla mancha suelo',
        m: 'Favor verificar el manejo adecuado de combustibles y aceites durante la operación. En caso de derrame, contener y limpiar el área afectada con el material absorbente disponible y reportar la novedad a la interventoría con el registro fotográfico correspondiente.' },
    { t: 'Abastecimiento de combustible', c: 'abastecimiento tanquear tanqueo recargar combustible gasolina galon caneca recipiente',
        m: 'Favor verificar que el abastecimiento de combustible de los equipos se realice con el motor apagado y frío, en un lugar ventilado, lejos de fuentes de ignición y de las personas, usando recipientes rotulados y en buen estado.' },
    { t: 'Ruido excesivo', c: 'ruido ruidoso auditivo oidos tapaoidos horario',
        m: 'Favor verificar el uso de protección auditiva por parte del personal que opera guadañadoras y sopladoras, y el cumplimiento de los horarios y condiciones aplicables para evitar molestias a la comunidad.' },
    { t: 'Mantenimiento de equipos', c: 'mantenimiento reparacion reparar ajuste ajustar cambiar nylon cuchilla encendido funcionamiento',
        m: 'Favor verificar que los ajustes, cambios de nylon o cuchilla y demás reparaciones de los equipos se realicen con el motor apagado, evitando manipularlos mientras están en funcionamiento.' },
    { t: 'Zonas con desniveles o pendientes', c: 'talud taludes desnivel desniveles loma ladera inclinado resbaloso caida',
        m: 'Favor verificar la estabilidad del terreno y las condiciones de acceso en zonas con desniveles o pendientes antes de iniciar las labores, utilizando las medidas necesarias para prevenir caídas del personal.' },
    { t: 'Fauna presente en el lote', c: 'fauna animal animales perro perros gato nido nidos aves abejas avispas panal serpiente',
        m: 'Favor verificar la presencia de fauna en el área de intervención (animales, nidos, panales) antes y durante las labores, tomando las medidas necesarias para prevenir afectaciones a los animales y al personal.' },
    { t: 'Residuos especiales o peligrosos', c: 'peligroso peligrosos jeringa jeringas agujas escombros quimicos especial especiales animal muerto',
        m: 'En caso de encontrar residuos especiales o elementos peligrosos (jeringas, químicos, escombros u otros), favor detener la intervención en ese punto y reportarlo a la interventoría para su manejo adecuado.' },
    { t: 'Falta de personal o equipos', c: 'falta faltan personal operarios incompleta cuadrilla equipos herramientas',
        m: 'Favor informar oportunamente a la interventoría las novedades de personal o equipos que puedan afectar la seguridad, la calidad o el cumplimiento de la actividad programada.' },
    { t: 'Afectación a la comunidad', c: 'queja quejas reclamo reclamos comunidad vecino vecinos molestia afectacion pqr',
        m: 'Favor registrar y reportar oportunamente a la interventoría las quejas, daños o situaciones presentadas con la comunidad durante la intervención, con la información y el registro fotográfico correspondiente.' }
];

// Palabras que no dicen de qué se trata ("pendiente" casi siempre es "pendiente por subsanar", no una ladera)
var VACIAS = ' LOS LAS DEL CON SIN POR PARA QUE UNA UNO UNOS UNAS MUY HAY SUS ESTA ESTE ESTAN SOBRE ENTRE LOTE FAVOR VERIFICAR NOVEDAD NOVEDADES DURANTE CUADRILLA NADA PENDIENTE PENDIENTES OPERARIO OPERARIOS OPERACION ZONA ZONAS AREA AREAS USO ';
function palabras(s) {
    return norm(s).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(function (p) { return p.length >= 3 && VACIAS.indexOf(' ' + p + ' ') === -1; });
}
// Raíz corta: "piedras" encuentra "piedra", "sopladoras" encuentra "soplador"
function raiz(p) { return p.slice(0, Math.min(p.length, 5)); }
function tiene(lista, r) { return lista.some(function (p) { return p.indexOf(r) === 0; }); }

var indice = HALLAZGOS.map(function (h) { return { claves: palabras(h.t + ' ' + h.c), mensaje: palabras(h.m) }; });

// Hallazgos que tienen que ver con el texto, del más al menos parecido. fuerte: solo los que coinciden en título o
// palabras clave (para sugerir mientras se escribe la observación sin llenar de ruido)
export function buscarHallazgos(texto, fuerte) {
    var rs = palabras(texto).map(raiz).filter(function (r, i, a) { return a.indexOf(r) === i; });
    if (!rs.length) return fuerte ? [] : HALLAZGOS.map(function (h, i) { return i; });
    return indice.map(function (x, i) {
        var p = 0;
        rs.forEach(function (r) { p += tiene(x.claves, r) ? 3 : !fuerte && tiene(x.mensaje, r) ? 1 : 0; });
        return { i: i, p: p };
    }).filter(function (x) { return x.p > 0; })
        .sort(function (a, b) { return b.p - a.p || a.i - b.i; })
        .map(function (x) { return x.i; });
}
