// Tipos de descuento de 💸 Descuentos (descuentos.html). Cada tipo trae el título del documento y sus textos con huecos
// {así}, que se llenan con los datos del descuento; en la página todo queda editable antes de generar el PDF.
// Para agregar un tipo nuevo basta con sumarlo aquí (clave en minúsculas, sin cambiarla después: queda guardada en la base).
//
// Huecos que entienden todos los textos:
//   {lotes}   «Z6CC0153 - 1027» o «Z6CC0153 - 1027 y Z6CC0154 - 1030»
//   {sector}  «el corregimiento San Antonio de Prado» o «la comuna Robledo» (sale solo del mapa; se puede cambiar)
//   {fecha}   fecha de la verificación (dd/mm/aaaa)
// y los de cada tipo (campos), p. ej. {causa} o {lugar}.

export var TIPOS = [
    {
        clave: 'cerramiento', nombre: 'Cerramiento', icono: '🚧',
        titulo: 'DESCUENTO POR CERRAMIENTO MICRORRUTA {lotes}',
        campos: [
            { clave: 'causa', etiqueta: 'Quién hace el cerramiento', ejemplo: 'un conjunto residencial privado' },
            { clave: 'lugar', etiqueta: 'Dónde queda el lote', ejemplo: 'la Urbanización Plaza del Sol' }
        ],
        intro: 'La interventoría del servicio de corte de césped realizó la verificación de la micro ruta {lotes}, ubicada en {sector}, y se evidenció un cerramiento por {causa}, que impide el libre acceso a una parte del área de intervención.',
        conclusion: 'Por estas razones, se concluye que no es posible intervenir el tramo indicado.',
        localizacion: 'Localización de la microrruta y señalización del sector que presenta cerramiento',
        sitio: 'Lote ubicado en el interior de {lugar}.\nEn esta ubicación existe una restricción de acceso por cerramiento, lo que impide la entrada al lote para su intervención y verificación.'
    },
    {
        clave: 'predio_privado', nombre: 'Predio privado', icono: '🏠',
        titulo: 'DESCUENTO POR PREDIO PRIVADO MICRORRUTA {lotes}',
        campos: [
            { clave: 'propietario', etiqueta: 'De quién es el predio', ejemplo: 'una unidad residencial' },
            { clave: 'lugar', etiqueta: 'Dónde queda el lote', ejemplo: 'la Carrera 67A con Carrera 1 Este' }
        ],
        intro: 'La interventoría del servicio de corte de césped realizó la verificación de la micro ruta {lotes}, ubicada en {sector}, y se evidenció que una parte del área de intervención corresponde a un predio privado de {propietario}, y no a zona verde pública.',
        conclusion: 'Por estas razones, se concluye que el tramo indicado no hace parte del área a intervenir por el servicio.',
        localizacion: 'Localización de la microrruta y señalización del sector que corresponde a predio privado',
        sitio: 'Lote ubicado en {lugar}.\nEl sector señalado pertenece a un predio privado, por lo que no corresponde al servicio de corte de césped en zonas verdes públicas.'
    },
    {
        clave: 'obra', nombre: 'Construcción u obra', icono: '🏗️',
        titulo: 'DESCUENTO POR CONSTRUCCIÓN U OBRA MICRORRUTA {lotes}',
        campos: [
            { clave: 'obra', etiqueta: 'Qué ocupa el área', ejemplo: 'una edificación nueva' },
            { clave: 'lugar', etiqueta: 'Dónde queda el lote', ejemplo: 'la Calle 10 con Carrera 67' }
        ],
        intro: 'La interventoría del servicio de corte de césped realizó la verificación de la micro ruta {lotes}, ubicada en {sector}, y se evidenció que una parte del área de intervención se encuentra ocupada por {obra}, por lo que ya no existe zona verde en ese sector.',
        conclusion: 'Por estas razones, se concluye que no es posible intervenir el tramo indicado.',
        localizacion: 'Localización de la microrruta y señalización del sector ocupado por la obra',
        sitio: 'Lote ubicado en {lugar}.\nEl sector señalado se encuentra ocupado por {obra}, sin zona verde para intervenir.'
    },
    {
        clave: 'zona_dura', nombre: 'Zona dura', icono: '🧱',
        titulo: 'DESCUENTO POR ZONA DURA MICRORRUTA {lotes}',
        campos: [
            { clave: 'superficie', etiqueta: 'Qué hay en vez de césped', ejemplo: 'concreto y adoquín' },
            { clave: 'lugar', etiqueta: 'Dónde queda el lote', ejemplo: 'el parque de la Calle 10' }
        ],
        intro: 'La interventoría del servicio de corte de césped realizó la verificación de la micro ruta {lotes}, ubicada en {sector}, y se evidenció que una parte del área de intervención corresponde a zona dura ({superficie}), sin césped para intervenir.',
        conclusion: 'Por estas razones, se concluye que el tramo indicado no requiere la actividad de corte de césped.',
        localizacion: 'Localización de la microrruta y señalización del sector que presenta zona dura',
        sitio: 'Lote ubicado en {lugar}.\nEl sector señalado está cubierto por {superficie}: no hay zona verde para el corte de césped.'
    },
    {
        clave: 'inaccesible', nombre: 'Inaccesible o riesgo', icono: '⚠️',
        titulo: 'DESCUENTO POR ÁREA INACCESIBLE MICRORRUTA {lotes}',
        campos: [
            { clave: 'riesgo', etiqueta: 'Qué lo hace inaccesible', ejemplo: 'una pendiente pronunciada hacia la quebrada' },
            { clave: 'lugar', etiqueta: 'Dónde queda el lote', ejemplo: 'el borde de la quebrada Doña María' }
        ],
        intro: 'La interventoría del servicio de corte de césped realizó la verificación de la micro ruta {lotes}, ubicada en {sector}, y se evidenció que una parte del área de intervención presenta {riesgo}, lo que impide el acceso seguro del personal.',
        conclusion: 'Por estas razones, se concluye que no es posible intervenir el tramo indicado sin poner en riesgo al personal.',
        localizacion: 'Localización de la microrruta y señalización del sector inaccesible',
        sitio: 'Lote ubicado en {lugar}.\nEn el sector señalado existe {riesgo}, lo que impide el acceso seguro para su intervención y verificación.'
    }
];

var porClave = {};
TIPOS.forEach(function (t) { porClave[t.clave] = t; });
export function tipo(clave) { return porClave[clave] || TIPOS[0]; }

// Llena los huecos {así}; los que no tienen dato quedan como [falta: así] para que se note en el PDF
export function rellenar(texto, datos) {
    return String(texto || '').replace(/\{(\w+)\}/g, function (m, k) {
        var v = datos && datos[k] != null ? String(datos[k]).trim() : '';
        return v || '[falta: ' + k + ']';
    });
}
// Huecos sin llenar que quedaron en un texto ya relleno
export function faltantes(texto) {
    var out = [];
    String(texto || '').replace(/\[falta: (\w+)\]/g, function (m, k) { if (out.indexOf(k) === -1) out.push(k); return m; });
    return out;
}
