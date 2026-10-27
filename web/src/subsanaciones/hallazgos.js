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
        m: 'Favor registrar y reportar oportunamente a la interventoría las quejas, daños o situaciones presentadas con la comunidad durante la intervención, con la información y el registro fotográfico correspondiente.' },

    // ---------- Barrido y recolección ----------
    { t: 'Blower soplando residuos a la zona verde', c: 'blower sopladora soplador soplando soplan residuos zona verde zv recogidos recogen',
        m: 'Continúa la novedad de blower soplando los residuos hacia la zona verde sin que sean recogidos. Favor dar instrucción al personal para que los residuos se acopien y recojan, y no se dispersen sobre las zonas verdes.' },
    { t: 'Barrido de zonas duras deficiente', c: 'barrido barrer zonas duras anden andenes sardinel cordon calzada adoquin',
        m: 'Se evidencia barrido deficiente en las zonas duras (andenes, sardineles y calzada) del área intervenida. Favor realizar el barrido completo después del corte y del bordeo, dejando las superficies libres de material vegetal.' },
    { t: 'Barrido de zonas verdes deficiente', c: 'barrido barrer zona verde zv pasto cortado material tendido',
        m: 'Se evidencia material vegetal cortado sin recoger sobre la zona verde intervenida. Favor realizar el barrido y la recolección del material en toda el área, no solo en los puntos visibles.' },
    { t: 'Residuos sin recoger en el plazo (8 horas hábiles)', c: 'residuos recoleccion recoger sin recoger plazo 8 horas habiles acopio pendiente',
        m: 'Se evidencian residuos vegetales sin recoger después del plazo establecido (máximo 8 horas hábiles después de terminada la labor). Favor programar la recolección de manera oportuna y reportar la hora en que se realizó.' },
    { t: 'Residuos sin marcar con cinta reflectiva', c: 'residuos marcar marcados marcado cinta reflectiva visible senalizar acopio paso peatonal',
        m: 'Los residuos acopiados no se dejan marcados con cinta reflectiva, incluso en pasos peatonales. Favor señalizarlos de forma visible mientras se realiza la recolección, para prevenir incidentes con peatones y vehículos.' },
    { t: 'Residuos cerca de sumideros o cunetas', c: 'sumidero sumideros alcantarilla alcantarillas cuneta cunetas rejilla canal drenaje',
        m: 'Se evidencian residuos acopiados cerca de sumideros, alcantarillas o cunetas. Favor ubicarlos lejos de los sistemas de drenaje para evitar obstrucciones, en especial en temporada de lluvias.' },
    { t: 'Residuos en calzada, senderos o canchas', c: 'calzada sendero senderos cancha canchas via residuos cayeron barrido inmediato',
        m: 'Se evidencian residuos de corte sobre la calzada, senderos o canchas. Favor realizar el barrido inmediato de estas superficies, de acuerdo con lo establecido para la presentación de residuos.' },
    { t: 'Acopio que obstaculiza el paso', c: 'acopio acopios obstaculiza obstruye paso peatonal anden rampa bolsas lonas',
        m: 'Los residuos acopiados obstaculizan el paso peatonal. Favor ubicarlos en un sitio que no interfiera con la circulación de peatones ni vehículos, asegurados para que no rueden.' },
    { t: 'Bolsas o lonas rotas, residuos dispersos', c: 'bolsa bolsas lona lonas rota rotas rotos dispersos regados viento rodando',
        m: 'Se evidencian bolsas o lonas rotas y residuos dispersos en el área. Favor utilizar recipientes en buen estado y asegurar el acopio para evitar que el material se riegue.' },
    { t: 'Novedades de recolección en varias microrrutas', c: 'recoleccion novedades varias microrrutas ayer reiterada reiterativa recurrente',
        m: 'Se vienen presentando novedades de recolección en varias microrrutas ejecutadas recientemente. Se solicita atención y corrección oportuna, garantizando la recolección total de los residuos en cada lote.' },
    { t: 'Residuos de limpieza previa (RCD, voluminosos)', c: 'rcd escombro escombros voluminoso voluminosos colchon muebles basura ordinarios limpieza previa',
        m: 'Favor presentar los residuos de construcción, voluminosos u ordinarios encontrados en la limpieza previa en un punto accesible para su recolección, y reportarlos a la interventoría con el registro fotográfico.' },
    { t: 'Recolección del transporte (carga mal asegurada)', c: 'volqueta camion vehiculo carga cayendo asegurada carpa carpada transporte',
        m: 'Favor verificar que los residuos transportados vayan cubiertos y asegurados, evitando que el material caiga a la vía durante el recorrido.' },

    // ---------- Ejecución del lote ----------
    { t: 'Sectores sin intervenir', c: 'sin intervenir sectores incompleto incompleta faltante faltan parte ejecucion lote ejecutado',
        m: 'En la verificación de la microrruta reportada como ejecutada se evidencian sectores sin intervenir. Favor completar el 100 % del lote, incluidas las actividades complementarias; el área no intervenida se descuenta.' },
    { t: 'Lote reportado como ejecutado con deficiencias', c: 'reportada ejecutada deficiencias prestacion servicio verificacion barrido recoleccion',
        m: 'En la verificación de la microrruta reportada como ejecutada se evidencian deficiencias en la prestación del servicio: sectores sin intervenir, falencias en el barrido de zonas verdes y zonas duras, y deficiencias en la recolección. Se solicita a la supervisión verificar y retroalimentar al personal.' },
    { t: 'Bordes, esquinas y alrededor del mobiliario sin cortar', c: 'bordes esquinas rincones alrededor poste bancas mobiliario mallas cerramiento sin cortar',
        m: 'Se evidencian áreas sin cortar en bordes, esquinas y alrededor de postes, bancas y cerramientos. Favor completar el corte en estos puntos.' },
    { t: 'Corte disparejo o pasto alto', c: 'disparejo desigual alto quedo alto parches mechones altura',
        m: 'Se evidencia corte disparejo, con sectores donde el pasto quedó alto. Favor repasar el área para dejar una altura uniforme entre 2 y 9 cm.' },
    { t: 'Corte muy bajo (raspado)', c: 'raspado bajo muy bajo pelado suelo tierra descubierto altura 2 cm',
        m: 'Se evidencia corte por debajo de la altura permitida, dejando el suelo descubierto. Favor ajustar la altura de corte para que el césped quede entre 2 y 9 cm.' },
    { t: 'Lote intervenido con pasto menor a 10 cm', c: 'menor 10 cm bajo no requeria pasto corto clus no intervenir',
        m: 'El lote se intervino con el pasto por debajo de 10 cm. Recordar que solo se corta cuando supera esa altura; en ese caso se debe reportar a la interventoría sin intervenir.' },
    { t: 'Corte con machete, peinilla o rula', c: 'machete peinilla rula herramienta manual cortar corte',
        m: 'Se evidencia corte con machete, peinilla o rula. Estas herramientas solo se permiten para actividades complementarias (desmonte, bordeo, delimitación frente a jardinería); el corte se debe hacer con guadañadora.' },
    { t: 'Limpieza previa no realizada', c: 'limpieza previa antes ramas rocas objetos despejar basura',
        m: 'No se evidencia limpieza previa del área antes del corte. Favor retirar ramas, rocas y residuos que la guadañadora pueda proyectar antes de iniciar la intervención.' },
    { t: 'Material cortado sobre jardines', c: 'jardin jardines antejardin plantas ornamentales material encima tapado',
        m: 'Se evidencia material cortado sobre jardines o plantas ornamentales. Favor retirarlo y proteger estas áreas durante el corte.' },
    { t: 'Intervención en área no contemplada', c: 'antejardin privado quebrada retiro ornato obra fuera catastro no contemplada',
        m: 'Se evidencia intervención en un área no contemplada (antejardín, zona de retiro de quebrada, obra o jardinería). Favor limitar la intervención a las áreas programadas del catastro.' },
    { t: 'Caña brava intervenida sin permiso', c: 'cana brava arundo permiso autoridad ambiental resolucion',
        m: 'Recordar que la caña brava solo se interviene cuando Planeación de EMVARIAS reporta el permiso de la autoridad ambiental. Favor abstenerse de intervenirla sin ese soporte.' },
    { t: 'Espartillo retirado con cuchilla', c: 'espartillo cuchilla nylon hilo zonas duras adoquin alcorque',
        m: 'El retiro de espartillo en zonas duras se debe hacer con guadañadora de hilo nylon, nunca con cuchilla. Favor ajustar el equipo.' },
    { t: 'Zonas duras: sustrato o arenilla sin retirar', c: 'zonas duras sustrato arenilla sedimento tierra anden separador manual',
        m: 'En la recuperación de zonas duras se evidencia sustrato, arenilla o sedimento sin retirar. Favor retirar la vegetación junto con el material acumulado y recoger los residuos.' },
    { t: 'Articulación con otros servicios (OPB)', c: 'opb barrido otros servicios articulacion operarios funciones respeto comentarios',
        m: 'Se han recibido reportes de afectaciones a otros servicios, ya que algunos operarios presuntamente manifiestan a los OPB que les corresponde barrer. Se solicita retroalimentar al personal sobre el cumplimiento de sus actividades y el respeto por las funciones de los demás equipos operativos.' },

    // ---------- Complementarias: plateo, bordeo, árboles ----------
    { t: 'Plateo no realizado', c: 'plateo platear plato arboles arbustos no realizado',
        m: 'No se evidencia plateo en los árboles y arbustos del lote. Favor realizarlo con un diámetro mínimo de 60 cm, preferiblemente a mano y sin dañar raíces.' },
    { t: 'Plateo con azadón', c: 'plateo azadon raices dano herramienta',
        m: 'Se evidencia plateo con azadón. No está permitido; favor realizarlo a mano para no afectar las raíces.' },
    { t: 'Plateo y bordeo en los mismos puntos', c: 'plateo bordeo paulatino repetido mismos arboles tramos fotos diferentes',
        m: 'El plateo y el bordeo son paulatinos: en cada frecuencia las fotos deben mostrar árboles y tramos distintos. Favor avanzar sobre puntos nuevos y evidenciarlo en el registro fotográfico.' },
    { t: 'Bordeo no realizado', c: 'bordeo bordear borde orilla anden sardinel no realizado',
        m: 'No se evidencia bordeo en el lote intervenido. Favor realizarlo con un ancho máximo de 5 cm y barrer el material después.' },
    { t: 'Bordeo mayor a 5 cm', c: 'bordeo ancho ancha profundo mayor 5 cm',
        m: 'Se evidencia bordeo con un ancho superior a 5 cm. Favor ajustarlo al ancho máximo establecido.' },
    { t: 'Uso de herbicida en el bordeo', c: 'herbicida quimico fumigar fumigacion bordeo glifosato',
        m: 'No está permitido usar herbicidas en el bordeo. Favor realizarlo de forma mecánica o manual.' },
    { t: 'Base de árboles sin limpieza manual', c: 'base arbol arboles limpieza manual alrededor tronco guadana',
        m: 'Favor retirar a mano el césped de la base de los árboles antes de pasar la guadañadora, para evitar heridas en el tronco.' },
    { t: 'Heridas en árboles por guadañadora', c: 'herida heridas arbol arboles corteza anillado tronco guadana dano',
        m: 'Se evidencian heridas en la base de los árboles causadas por la guadañadora. Esta afectación no es subsanable; favor reforzar con el personal la limpieza manual alrededor de los troncos.' },
    { t: 'Daño a raíces', c: 'raiz raices dano expuestas cortadas plateo',
        m: 'Se evidencia daño en raíces durante la intervención. Favor tener precaución en el plateo y en el corte alrededor de los árboles.' },

    // ---------- PMT, mallas y señalización ----------
    { t: 'No se evidencia implementación de PMT', c: 'pmt plan manejo transito implementacion senalizacion via sin pmt',
        m: 'No se evidencia implementación de PMT en el frente de trabajo. Favor implementarlo antes de iniciar las labores en vía, de acuerdo con el plan aprobado.' },
    { t: 'Sin auxiliar de PMT', c: 'auxiliar pmt paletero banderero transito control via',
        m: 'No se evidencia auxiliar de PMT en el frente de trabajo sobre vía. Favor garantizar su presencia para el control del tránsito durante la operación.' },
    { t: 'Guadañador sin malla de protección', c: 'malla mallas sin malla guadanador guadanadora proteccion',
        m: 'Se evidencia guadañador operando sin malla de protección. Ningún guadañador puede trabajar sin malla; se requiere mínimo una malla por cada dos guadañadores.' },
    { t: 'Separador vial con una sola malla', c: 'separador separadores vial malla mallas dos lados ambos',
        m: 'En separadores viales se requieren dos mallas, una a cada lado. Favor completar la protección antes de continuar.' },
    { t: 'Mallas en mal estado o sin especificación', c: 'malla mallas rota estado reflectiva ruedas estructura 4 2',
        m: 'Favor verificar que las mallas cumplan la especificación (4 m × 2 m, reflectivas, con estructura y ruedas) y estén en buen estado.' },
    { t: 'Sin auxiliar de malla', c: 'auxiliar malla mover desplazar acompanar',
        m: 'Favor garantizar el auxiliar de malla que acompañe al guadañador y desplace la protección durante el corte.' },
    { t: 'Delimitación incompleta', c: 'delimitacion cinta conos paletas incompleta parcial abierta',
        m: 'La delimitación del área de trabajo está incompleta. Favor cerrar el perímetro con cinta, conos o paletas según el PMT.' },
    { t: 'Valla de divulgación ausente o desactualizada', c: 'valla vallas divulgacion contrato viejo informacion tela frente',
        m: 'No se evidencia valla de divulgación en el frente de trabajo, o corresponde a un contrato anterior. Favor instalar al menos una valla vigente por frente.' },

    // ---------- Registro fotográfico ----------
    { t: 'Faltan fases del registro fotográfico', c: 'fotos fases antes durante despues complementarias faltan falta registro',
        m: 'Favor garantizar las cuatro fases del registro fotográfico (antes, durante, complementarias y después). Si falta alguna, el lote no se recibe.' },
    { t: 'Fotos sin GPS, fecha u hora', c: 'fotos gps coordenadas fecha hora georreferenciadas marca agua',
        m: 'Las fotos deben incluir coordenadas GPS, fecha y hora. Favor verificar la configuración de la aplicación de cámara del personal.' },
    { t: 'Foto sin regla o flexómetro', c: 'regla flexometro metro altura medir foto',
        m: 'Favor incluir la regla o el flexómetro en las fotos de antes y después para evidenciar la altura del césped.' },
    { t: 'Fotos que no cubren toda la microrruta', c: 'fotos cubren toda microrruta panoramica punto referencia cantidad',
        m: 'El registro fotográfico no cubre toda la microrruta. Favor tomar fotos panorámicas con punto de referencia en cantidad acorde con el área del lote.' },
    { t: 'Correcciones sin soporte fotográfico', c: 'correccion correcciones subsanacion soporte fotos carpeta novedades quincenal',
        m: 'Favor soportar con fotos las correcciones de las novedades en la entrega quincenal; se sugiere una carpeta de novedades dentro de la microrruta.' },

    // ---------- Reporte y comunicación ----------
    { t: 'No se reportan novedades por lote', c: 'reportar novedades situaciones puntuales lote parametros reunion precoodes indicar',
        m: 'No se están siguiendo los parámetros establecidos en la reunión (indicar las novedades o situaciones puntuales en la ejecución de cada lote). Favor reportarlas para cada microrruta.' },
    { t: 'Externalidad no reportada de inmediato', c: 'externalidad restriccion acceso cerrado orden publico obra caracol reporte inmediato',
        m: 'Favor reportar de inmediato las externalidades (restricción de acceso, orden público, obras, caracol africano, entre otras). Si no se reportan a tiempo, el lote puede quedar como no satisfactorio.' },
    { t: 'Novedad sin poder tomar foto', c: 'sin foto no se pudo tomar fase reportar validar',
        m: 'Si en alguna fase no se puede tomar la foto, favor reportarlo de inmediato a la interventoría para su validación posterior.' },
    { t: 'Programación no enviada a tiempo', c: 'programacion sig enviar anticipacion dia habil cambios',
        m: 'Favor enviar la programación del SIG a la interventoría con al menos un día hábil de anticipación e informar cualquier cambio.' },
    { t: 'GPS de la cuadrilla sin señal', c: 'gps rastreo ubicacion tiempo real cuadrilla senal apagado',
        m: 'No se visualiza la ubicación en tiempo real de la cuadrilla. Favor verificar el funcionamiento del dispositivo GPS.' },
    { t: 'Supervisor no disponible', c: 'supervisor responde respuesta celular disponible contacto comunicacion',
        m: 'Favor garantizar la disponibilidad del supervisor (celular con voz y datos) para atender las novedades durante la operación.' },
    { t: 'Respuesta a requerimientos', c: 'respuesta requerimiento requerimientos oportuna silencio microrruta asociada',
        m: 'Favor dar respuesta oportuna a lo solicitado, citando el número de la microrruta asociada al hallazgo. El silencio se tomará como incumplimiento de las obligaciones.' },
    { t: 'Novedad reiterada', c: 'reiterada reiterativa continua persiste nuevamente otra vez recurrente',
        m: 'La novedad persiste a pesar de haber sido reportada anteriormente. Se solicita a la supervisión tomar las medidas correctivas y retroalimentar al personal.' },

    // ---------- Personal y seguridad ----------
    { t: 'Personal sin uniforme distintivo', c: 'uniforme distintivo dotacion ropa identificacion carne',
        m: 'Se evidencia personal sin el uniforme distintivo del contrato. Favor garantizar la dotación completa e identificable.' },
    { t: 'EPP incompleto del guadañador', c: 'careta canilleras peto carnaza botas dielectricas guantes gafas tapabocas guadanador',
        m: 'Se evidencia guadañador sin el EPP completo (careta, gafas, protección auditiva, canilleras, peto de carnaza, guantes y botas dieléctricas). Favor corregir antes de continuar.' },
    { t: 'Alcohol o sustancias', c: 'alcohol borracho tragos sustancias psicoactivas drogas',
        m: 'Se recuerda que no se permite trabajar bajo efectos del alcohol o de sustancias psicoactivas. La interventoría puede detener a la persona de la actividad.' },
    { t: 'Comportamiento del personal', c: 'comportamiento actitud trato grosero groseria comunidad celular distraido',
        m: 'Se solicita retroalimentar al personal sobre el trato respetuoso con la comunidad y los demás equipos operativos, y la atención a sus labores durante la jornada.' },
    { t: 'Sin botiquín en la cuadrilla', c: 'botiquin primeros auxilios aph emergencia',
        m: 'Favor verificar que la cuadrilla cuente con botiquín tipo APH completo durante la operación.' },
    { t: 'Conformación de cuadrilla incompleta', c: 'conformacion cuadrilla roles incompleta faltan auxiliar guadanadores',
        m: 'La cuadrilla no cuenta con la conformación reportada. Favor informar los cambios de personal y roles a la interventoría.' },
    { t: 'Trabajo en alturas', c: 'alturas arnes linea vida coordinador certificado talud',
        m: 'Para trabajo en alturas, favor verificar el certificado del guadañador, la presencia del coordinador de alturas, el arnés de cuerpo completo, la línea de vida y el kit de rescate.' },
    { t: 'Talud inestable', c: 'talud inestable movimiento masa derrumbe deslizamiento',
        m: 'Se evidencia talud con movimiento en masa o terreno inestable. Favor documentarlo, reportarlo y no intervenirlo hasta que se estabilice.' },

    // ---------- Combustibles y vehículos ----------
    { t: 'Recipientes de combustible sin rotular', c: 'recipiente caneca galon rotulo rotulado hoja seguridad combustible',
        m: 'Favor verificar que los recipientes de combustible estén rotulados y cuenten con su hoja de seguridad.' },
    { t: 'Sin kit de derrames', c: 'kit derrames absorbente tanquear combustible',
        m: 'No se evidencia kit de derrames durante el tanqueo de las guadañadoras. Favor tenerlo disponible siempre que se manipule combustible.' },
    { t: 'Combustible transportado con el personal', c: 'combustible transporte cabina personal pasajeros gasolina',
        m: 'El combustible no se debe transportar junto con el personal. Favor llevarlo en un compartimento separado.' },
    { t: 'Vehículo sin valla o en mal estado', c: 'vehiculo valla estado modelo tecnicomecanica rastreo',
        m: 'Favor verificar que el vehículo de la operación cuente con la valla del contrato, rastreo satelital y documentación al día.' },

    // ---------- Fauna y desmonte ----------
    { t: 'Abejas o avispas en el lote', c: 'abejas avispas panal enjambre picadura',
        m: 'Ante presencia de abejas, avispas o similares, favor suspender la intervención en ese punto, enviar informe técnico a la interventoría y reprogramar.' },
    { t: 'Desmonte sin verificación de fauna', c: 'desmonte fauna informe biologo ahuyentar',
        m: 'En los desmontes se requiere verificación de fauna previa y el informe correspondiente con fotos de antes, durante y después.' },
    { t: 'Altura del desmonte sin evidenciar', c: 'desmonte altura segmento factor regla',
        m: 'Favor evidenciar con regla la altura de cada segmento del desmonte, para que la interventoría pueda corroborar el factor.' }
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
