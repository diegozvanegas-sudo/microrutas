// API de subsanaciones sobre Supabase.
// Responde con la misma forma que el Apps Script anterior (columnas en español, fechas dd/mm/aaaa),
// así la página y el mapa rápido (que lee la copia guardada en el celular) funcionan sin cambios.
//
//   var api = crearApi(supabase);
//   api.leer()                       -> { items, itemsOperacion, recordatorios, registros, rutas }
//   api.enviar('crear', { registro, tipo })      -> { registro }
//   api.enviar('actualizar', { id, registro })   -> { registro }
//   api.enviar('eliminar', { id })               -> { eliminado }
//   api.enviar('guardar_ruta', { cuadrilla, paradas }) -> {}

var TZ = 'America/Bogota';
var PAGINA = { EJECUCION: 'EJECUCIÓN', OPERACION: 'OPERACIÓN' };
var POR_PAGINA = 1000; // Supabase entrega como máximo 1.000 filas por consulta

// Columna de la página -> columna de la tabla visitas, con su conversión al guardar
var CAMPOS = {
    'MICRORRUTA': ['microrruta', function (v) { return texto(v) && texto(v).toUpperCase(); }],
    'LOTE': ['lote', texto],
    'ÁREA M2': ['area_m2', numero],
    'ZONA': ['zona', function (v) { var m = String(v || '').match(/\d+/); return m ? Number(m[0]) : null; }],
    'CUADRILLA': ['cuadrilla', function (v) { return texto(String(v || '').replace(/^C\s*/i, '')); }],
    'FECHA DE EJECUCIÓN': ['fecha_ejecucion', fechaIso],
    'FECHA DE LA VISITA': ['fecha_visita', fechaIso],
    'INTERVENTOR': ['interventor', texto],
    'OBSERVACIONES NOVEDADES': ['observaciones', texto],
    'FECHA SUBSANACIÓN': ['fecha_subsanacion', fechaIso],
    'OBSERVACIÓN SUBSANACIÓN': ['observacion_subsanacion', texto],
    'EVIDENCIA': ['evidencia', function (v) { return String(v || '').split(/[\s,]+/).filter(Boolean); }],
    'REGISTRADO POR': ['registrado_por', texto],
};

// ---------- Conversiones ----------
function texto(v) { var s = String(v == null ? '' : v).trim(); return s === '' ? null : s; }

// "1.234,5" (como lo escribe el formulario), "1234.5" o "1.234" -> 1234.5 / 1234.5 / 1234
function numero(v) {
    var s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (!s) return null;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = Number(s);
    return isNaN(n) ? null : n;
}

// dd/mm/aaaa o aaaa-mm-dd -> aaaa-mm-dd
function fechaIso(v) {
    var s = String(v || '').trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = s.match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : null;
}
// aaaa-mm-dd -> dd/mm/aaaa
function fechaTexto(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }

// "dd/mm/aaaa HH:mm[:ss]" o "dd/mm/aaaa" (hora de Colombia) -> marca de tiempo con zona
function momentoIso(v) {
    var m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    var z = function (n) { return ('0' + (n || 0)).slice(-2); };
    return m[3] + '-' + z(m[2]) + '-' + z(m[1]) + 'T' + z(m[4]) + ':' + z(m[5]) + ':' + z(m[6]) + '-05:00';
}
// marca de tiempo -> "dd/mm/aaaa HH:mm[:ss]" en hora de Colombia
var formato = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function momentoTexto(v, conSegundos) {
    if (!v) return '';
    var p = {};
    formato.formatToParts(new Date(v)).forEach(function (x) { p[x.type] = x.value; });
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute + (conSegundos ? ':' + p.second : '');
}

function tipoBase(tipo) { return /OPERACI/i.test(String(tipo || '')) ? 'OPERACION' : 'EJECUCION'; }

// Fila de la tabla visitas -> registro como lo entregaba la hoja
function aRegistro(v) {
    var r = {
        'ID': v.id,
        'TIPO': PAGINA[v.tipo],
        'MICRORRUTA': v.microrruta || '',
        'LOTE': v.lote || '',
        'ÁREA M2': v.area_m2 == null ? '' : Number(v.area_m2).toLocaleString('es-CO'),
        'ZONA': v.zona == null ? '' : String(v.zona),
        'CUADRILLA': v.cuadrilla || '',
        'FECHA DE EJECUCIÓN': fechaTexto(v.fecha_ejecucion),
        'FECHA DE LA VISITA': fechaTexto(v.fecha_visita),
        'INTERVENTOR': v.interventor || '',
        'OBSERVACIONES NOVEDADES': v.observaciones || '',
        'CANTIDAD DE NOVEDADES': String(v.cantidad_novedades || 0),
        'ESTADO': v.estado,
        'FECHA SUBSANACIÓN': fechaTexto(v.fecha_subsanacion),
        'OBSERVACIÓN SUBSANACIÓN': v.observacion_subsanacion || '',
        'EVIDENCIA': (v.evidencia || []).join(' '),
        'REGISTRADO POR': v.registrado_por || '',
        // Los pone la base de datos con el usuario de la sesión (0004_usuarios.sql); no se envían al guardar
        'SUBSANADO POR': v.subsanado_por || '',
        'MODIFICADO POR': v.modificado_por || '',
        'ÚLTIMA MODIFICACIÓN': momentoTexto(v.actualizado, false),
        'ÍTEMS SUBSANADOS': (v.items_subsanados || []).join(' | '),
        'FECHA DE REGISTRO': momentoTexto(v.creado, true),
    };
    Object.keys(v.respuestas || {}).forEach(function (k) { r[k] = v.respuestas[k]; });
    return r;
}

// Fila de la tabla rutas -> como la entregaba la hoja "Rutas"
function aRuta(f) {
    return {
        cuadrilla: f.cuadrilla, lote: f.lote, fecha: fechaTexto(f.fecha_ejecucion), orden: f.orden == null ? '' : String(f.orden),
        cargada: momentoTexto(f.cargada, true), encurso: momentoTexto(f.en_curso, true),
    };
}

function error(e) {
    if (!e) return null;
    var msg = e.message || String(e);
    if (e.code === 'PGRST301' || /JWT|not authenticated/i.test(msg)) msg = 'Su sesión venció; recargue la página e inicie sesión de nuevo';
    else if (e.code === '42501') msg = 'Su usuario no tiene permiso para esta acción';
    else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'Sin conexión con la base de datos';
    return new Error(msg);
}
function revisar(res) { if (res.error) throw error(res.error); return res.data; }
// Sin red no se intenta: la librería reintenta varias veces y la página tardaría en mostrar lo guardado
function conRed() { if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sin conexión con la base de datos'); }

export function crearApi(supabase) {
    // Nombres de todos los ítems (activos o no) por tipo: sirven para separar las respuestas del resto del registro
    var nombres = null;

    async function cargarItems() {
        var filas = revisar(await supabase.from('items').select('tipo, nombre, activo, orden').order('orden'));
        nombres = { EJECUCION: [], OPERACION: [] };
        filas.forEach(function (i) { nombres[i.tipo].push(i.nombre); });
        return filas;
    }

    async function todasLasVisitas() {
        var filas = [];
        for (var desde = 0; ; desde += POR_PAGINA) {
            var pagina = revisar(await supabase.from('visitas').select('*').order('creado').range(desde, desde + POR_PAGINA - 1));
            filas = filas.concat(pagina);
            if (pagina.length < POR_PAGINA) return filas;
        }
    }

    async function leer() {
        var r = await Promise.all([
            cargarItems(),
            supabase.from('recordatorios').select('texto').eq('activo', true).order('orden').then(revisar),
            todasLasVisitas(),
            supabase.from('rutas').select('*').order('cuadrilla').order('orden').then(revisar),
        ]);
        var activos = function (tipo) { return r[0].filter(function (i) { return i.tipo === tipo && i.activo; }).map(function (i) { return i.nombre; }); };
        return {
            items: activos('EJECUCION'), columnas: [],
            itemsOperacion: activos('OPERACION'), columnasOperacion: [],
            recordatorios: r[1].map(function (x) { return x.texto; }),
            registros: r[2].map(aRegistro),
            rutas: r[3].map(aRuta),
        };
    }

    // Registro de la página -> columnas de la tabla. Solo lo que viene en el registro (al editar no borra lo demás).
    function aFila(registro, tipo) {
        var f = {}, respuestas = {};
        Object.keys(registro).forEach(function (k) {
            if (CAMPOS[k]) f[CAMPOS[k][0]] = CAMPOS[k][1](registro[k]);
            else if (nombres[tipo].indexOf(k) !== -1 && texto(registro[k])) respuestas[k] = texto(registro[k]);
        });
        f.respuestas = respuestas;
        return f;
    }

    async function crear(registro, tipoPagina) {
        if (!nombres) await cargarItems();
        var tipo = tipoBase(tipoPagina || registro.TIPO), f = aFila(registro, tipo);
        f.tipo = tipo;
        if (!f.registrado_por) {
            var u = (await supabase.auth.getUser()).data.user;
            if (u) f.registrado_por = u.email;
        }
        return { registro: aRegistro(revisar(await supabase.from('visitas').insert(f).select().single())) };
    }

    async function actualizar(id, registro) {
        if (!nombres) await cargarItems();
        var actual = revisar(await supabase.from('visitas').select('tipo, respuestas').eq('id', id).maybeSingle());
        if (!actual) throw new Error('No existe el registro ' + id);
        var f = aFila(registro, actual.tipo);
        // Respuestas de ítems que ya no están en el formulario (desactivados) se conservan
        f.respuestas = Object.assign({}, actual.respuestas, f.respuestas);
        return { registro: aRegistro(revisar(await supabase.from('visitas').update(f).eq('id', id).select().single())) };
    }

    async function eliminar(id) {
        var filas = revisar(await supabase.from('visitas').delete().eq('id', id).select('id'));
        if (!filas.length) throw new Error('No existe el registro ' + id);
        return { eliminado: id };
    }

    async function guardarRuta(cuadrilla, paradas) {
        revisar(await supabase.rpc('guardar_ruta', {
            cuadrilla: String(cuadrilla || ''),
            paradas: (paradas || []).map(function (p) {
                return { lote: String(p.lote || ''), fecha: fechaIso(p.fecha) || '', cargada: momentoIso(p.cargada) || '', encurso: momentoIso(p.encurso) || '' };
            }),
        }));
        return {};
    }

    async function enviar(accion, datos) {
        try {
            if (accion === 'crear') return await crear(datos.registro || {}, datos.tipo);
            if (accion === 'actualizar') return await actualizar(datos.id, datos.registro || {});
            if (accion === 'eliminar') return await eliminar(datos.id);
            if (accion === 'guardar_ruta') return await guardarRuta(datos.cuadrilla, datos.paradas);
        } catch (e) { throw error(e); }
        throw new Error('Acción no válida: ' + accion);
    }

    return {
        leer: function () { return Promise.resolve().then(conRed).then(leer).catch(function (e) { throw error(e); }); },
        enviar: function (accion, datos) { return Promise.resolve().then(conRed).then(function () { return enviar(accion, datos); }); },
    };
}
