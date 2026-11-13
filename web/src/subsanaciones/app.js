// Página de subsanaciones: listado de visitas, formulario, buscador, pre-rutas, WhatsApp y Excel.
// Viene del <script> de la página original; lo que no depende del estado de la página ya está en módulos aparte.
import { esc, norm, valorItem, hoy, aInput, aTexto, dias, claveFecha, claveRegistro, textoDias, marca, textoCarga, cargaDeTexto, horaCarga, metros, textoDist } from './util.js';
import { $, toast, aviso, confirmar } from './ui.js';
import { abrirProgramar } from '../whatsapp/programar.js';
import { EJ, OP, NO_REALIZADO, CERRADO, fijarItems, esOp, itemsDe, limpiarObs, itemsEnNo, deLote, esCerrado, calcularEstado, badge, plazoVisita, paraDescuento } from './estado.js';
import { textoVisita, FORMATOS_VISITA, FORMATOS_DIA, textoResumen, textoDescuento, textoDia, textoNovedadesDia, leerMenciones } from './whatsapp.js';
import { parsearMensaje as leerMensaje } from './mensaje.js';
import { recorridoCorto as recorrer } from './recorrido.js';
import { textoSupervisores } from './supervisores.js';
import { exportarExcel, hojasExcel, htmlHoja, filasParaCopiar } from './excel.js';
import { HALLAZGOS, buscarHallazgos } from './hallazgos.js';
import { BUENAS, buscarBuenas, mensaje as mensajeBuena, mensajeVarios } from './buenaoperacion.js';
import { ESTILOS as ESTILOS_NOTA, dibujar as dibujarNota, pieFecha, aArchivo } from './textoimagen.js';
import { cumplimiento, porcentaje } from './cumplimiento.js';
import { REGLAS as REGLAS_VENC, TRAMOS as TRAMOS_VENC, vencimientos, textoVencimientos, textoPlazo as textoVence } from './vencimientos.js';
import { zipsAPdf, imagenesDeZips, descargar } from './zippdf.js';
import { crearUbicador, rotuloLote, loteDeNombre, CERCA as CERCA_LOTE } from './lotegps.js';
import { leerTabla, diasDe } from './tabla.js';
import { filasHoja, leerProgramacion, estadoDelDia, especialesDeSemana, enlacesEspecial, textoDelDia, semanaDia as semanaProg, quincenaDe as quincenaProg, nombreDia, fechaPlan as fechaPlanProg, estadoLote, lotesDeQuincena, zonaDe, ESTADOS_LOTE, consultarLotes, quincenaVigente, avanceCuadrilla, desdeLote, rangoQuincena } from './programacion.js';
import { MODOS as MODOS_FECHA, esModoFecha, fechaISO, criterioFecha, cumpleFecha, describirFecha, ATAJOS as ATAJOS_FECHA, atajoFecha } from './fechas.js';
import { examinar, ordenar as ordenarFotos, fotosAPdf, fechaCorta, fotoRotulada } from './fotospdf.js';
import { revisarFotos, MAX_FOTOS } from './fotos.js';
import { leerImagenes, ordenarPorNombre } from './ocr.js';
import { mezclarRutas, tocaReleer } from './prerutas.js';

// api: crearApi(supabase) de src/api.js (null si falta configurar). CFG: { url } = hay base de datos.
export function iniciar(api, CFG) {
    var LOTES = window.direccionesLotes || {};
    var FIJAS = ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'ZONA', 'CUADRILLA', 'FECHA DE EJECUCIÓN', 'FECHA DE LA VISITA', 'INTERVENTOR',
        'OBSERVACIONES NOVEDADES', 'CANTIDAD DE NOVEDADES', 'ESTADO', 'FECHA SUBSANACIÓN', 'OBSERVACIÓN SUBSANACIÓN', 'EVIDENCIA', 'ID', 'REGISTRADO POR',
        'ÚLTIMA MODIFICACIÓN', 'ÍTEMS SUBSANADOS', 'FECHA DE REGISTRO', 'SUBSANADO POR', 'MODIFICADO POR', 'USUARIO'];
    var FECHAS = ['FECHA DE EJECUCIÓN', 'FECHA DE LA VISITA', 'FECHA SUBSANACIÓN'];
    var items = [], columnas = [], registros = [], editando = null, abiertos = {};
    var itemsOp = [], columnasOp = [], hayOperacion = false, tipoForm = EJ;
    // "Tener en cuenta" de la visita durante la operación. La hoja "Recordatorios Operación" los reemplaza al cargar.
    var recordatorios = [
        'Telas auxiliares, vallas y demás elementos de información del contrato: no deben figurar contratos viejos.',
        'Validar el estado de los elementos del equipo operativo (herramientas, dotación, EPP).',
        'Verificar que la cuadrilla delimite el área de trabajo y cuente con los elementos para hacerlo.',
        'Las evidencias de las novedades subsanadas se deben remitir oportunamente, al momento de subsanar (evitar solicitudes reiteradas).'
    ];
    function itemsForm() { return tipoForm === OP ? itemsOp : items; }
    var cargado = false, alCargar = null, desdeRuta = null, rutasAlDia = false;
    var dlg = $('dlg'), form = $('form');


    // ---------- API (Supabase: src/api.js responde igual que el Apps Script) ----------
    function leer() { return api.leer(); }
    function enviar(accion, datos) { return api.enviar(accion, datos); }

    // Deja cada registro con los nombres de columna conocidos aunque en la hoja tengan otra tilde o espacios
    // Visita más reciente primero; el mismo día, la última registrada (ID mayor) arriba.
    // Acepta 18/10/2026, 18-10-26, 2026-10-18 o con hora, como venga del Excel pegado en la hoja.
    function ordenarRegistros() {
        var num = function (r) { return Number(String(r.ID || '').replace(/\D/g, '')) || 0; };
        registros.sort(function (a, b) {
            return claveFecha(b['FECHA DE LA VISITA']).localeCompare(claveFecha(a['FECHA DE LA VISITA'])) || num(b) - num(a);
        });
    }
    // La lista muestra primero lo último registrado (FECHA DE REGISTRO; si la hoja aún no la tiene, la última modificación).
    // registros sigue ordenado por fecha de visita: de eso dependen la frecuencia, la "última visita" y la pre-ruta.
    function porRegistro(a, b) {
        var num = function (r) { return Number(String(r.ID || '').replace(/\D/g, '')) || 0; };
        return claveRegistro(b).localeCompare(claveRegistro(a)) || num(b) - num(a);
    }
    function canonico(r) {
        var porNorm = {};
        Object.keys(r).forEach(function (k) { porNorm[norm(k)] = r[k]; });
        FIJAS.concat(items, itemsOp).forEach(function (c) { if (porNorm[norm(c)] !== undefined) r[c] = porNorm[norm(c)]; });
        r.TIPO = esOp(r) ? OP : EJ;
        // La hoja guarda "PENDIENTE POR SUBSANAR - nota" / "NOVEDAD SUBSANADA EL fecha - nota": aquí solo se muestra la nota
        // (al guardar, el Apps Script vuelve a ponerle el estado)
        if (r['OBSERVACIONES NOVEDADES'] !== undefined) r['OBSERVACIONES NOVEDADES'] = limpiarObs(r['OBSERVACIONES NOVEDADES']);
        // Un Apps Script sin actualizar guarda el lote cerrado como SIN NOVEDAD
        if (r.ESTADO === 'SIN NOVEDAD' && esCerrado(r)) r.ESTADO = 'CERRADO';
        return r;
    }


    // ---------- Listado ----------
    function cargar() {
        if (!CFG.url) {
            aviso('<b>Falta conectar la base de datos.</b> Copie <code>web/.env.example</code> como <code>web/.env</code> y escriba ' +
                'la URL y la llave pública (anon) de su proyecto de Supabase.', true);
            $('tabla').innerHTML = '<div class="vacio">Sin conexión a la base de datos.</div>';
            $('btn-nuevo').disabled = true;
            return;
        }
        // Mientras responde la base (o sin conexión) se muestra lo último guardado en este celular
        var copia = !cargado && leerCache();
        if (copia) aplicarDatos(copia, true);
        else if (!cargado) $('tabla').innerHTML = '<div class="cargando">Cargando…</div>';
        var btn = $('btn-recargar');
        btn.disabled = true;
        btn.textContent = '↻ Actualizando…';
        var inicio = Date.now();
        leyendo = true; ultimaLectura = inicio;
        leer().then(function (d) {
            aviso('');
            // Las pre-rutas salen de la base (las mismas en todos los equipos del usuario). Solo se deja lo de este equipo
            // en la cuadrilla que se cambió aquí mientras se leía o que aún no se pudo subir.
            if (d.rutas) { d.rutas = mezclarRutas(d.rutas, cambiosRuta, inicio); ultimasRutas = d.rutas; }
            aplicarDatos(d, false);
            guardarCache();
            subirPendientes();
        }).catch(function (err) {
            if (cargado) return aviso('Se muestra lo guardado en este celular' + (copia && copia.t ? ' (' + new Date(copia.t).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) + ')' : '') +
                '. No se pudo actualizar: ' + esc(err.message) + '. Pulse "↻ Actualizar" para reintentar.');
            aviso('<b>No se pudo leer la base de datos:</b> ' + esc(err.message), true);
            $('tabla').innerHTML = '<div class="vacio">No hay datos.</div>';
        }).then(function () { leyendo = false; btn.disabled = false; btn.textContent = '↻ Actualizar'; });
    }
    // Al volver a la página (otra pestaña, otra app, el celular bloqueado) se lee otra vez la base: así lo que se
    // cambió desde el PC aparece en el celular y al revés, sin tener que pulsar "↻ Actualizar".
    var leyendo = false, ultimaLectura = 0;
    function releerSiToca() {
        if (document.visibilityState !== 'visible' || !CFG.url || !cargado) return;
        if (tocaReleer(Date.now(), ultimaLectura, leyendo, !!document.querySelector('dialog[open]'))) cargar();
    }
    document.addEventListener('visibilitychange', releerSiToca);
    window.addEventListener('focus', releerSiToca);
    function aplicarDatos(d, desdeCache) {
        items = d.items || [];
        columnas = d.columnas || [];
        // Un Apps Script sin actualizar no trae la hoja "Operación": ese tipo de visita queda deshabilitado
        hayOperacion = !!d.itemsOperacion;
        itemsOp = d.itemsOperacion || [];
        fijarItems(items, itemsOp);
        columnasOp = d.columnasOperacion || [];
        if (d.recordatorios) recordatorios = d.recordatorios;
        registros = (d.registros || []).map(canonico);
        ordenarRegistros();
        llenarSelect('f-zona', 'ZONA', 'Zona: todas');
        llenarSelect('f-cuadrilla', 'CUADRILLA', 'Cuadrilla: todas');
        llenarDias();
        llenarUsuarios();
        if (d.rutas) rutasDeHoja(d.rutas, desdeCache);
        // Con la copia del celular la pre-ruta puede estar vieja: no se toca la hoja hasta que llegue la de verdad
        if (!desdeCache) { rutasAlDia = true; ordenarConGps(); }
        cargado = true;
        pintar();
        abrirDesdeUrl(!desdeCache);
        if (alCargar) { var f = alCargar; alCargar = null; f(); }
    }
    // Copia de la hoja en este celular (también la usa el mapa rápido para "Ver detalles" al instante)
    var CACHE = 'subsanaciones_cache', ultimasRutas = null;
    function leerCache() {
        try { var c = JSON.parse(localStorage.getItem(CACHE)); return c && c.registros ? c : null; } catch (e) { return null; }
    }
    function guardarCache() {
        try {
            localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), items: items, columnas: columnas,
                itemsOperacion: hayOperacion ? itemsOp : undefined, columnasOperacion: columnasOp, recordatorios: recordatorios,
                registros: registros, rutas: ultimasRutas || (leerCache() || {}).rutas || null }));
        } catch (e) {}
    }

    function llenarSelect(id, campo, todos) {
        var sel = $(id), actual = sel.value;
        var valores = registros.map(function (r) { return String(r[campo] || '').trim(); }).filter(Boolean)
            .filter(function (z, i, a) { return a.indexOf(z) === i; }).sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
        // "Zona 2" / "Cuadrilla 4": en el celular el selector solo muestra el texto elegido
        var pre = campo === 'ZONA' ? 'Zona ' : campo === 'CUADRILLA' ? 'Cuadrilla ' : '';
        sel.innerHTML = '<option value="">' + todos + '</option>' + valores.map(function (z) { return '<option value="' + esc(z) + '">' + esc(/^\d+$/.test(z) ? pre + z : z) + '</option>'; }).join('');
        sel.value = actual;
    }

    // Días con visitas, del más reciente al más viejo: "Hoy · 23/10/2026", "Ayer · 22/10/2026", "21/10/2026"
    function llenarDias() {
        var sel = $('f-dia'), actual = sel.value, h = hoy(), ayer = new Date(new Date(h).getTime() - 864e5).toISOString().slice(0, 10);
        var valores = registros.map(function (r) { return fechaISO(r['FECHA DE LA VISITA']); }).filter(Boolean)
            .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort().reverse();
        sel.innerHTML = '<option value="">Día: todos</option><option value="rango">📅 Entre fechas…</option><option value="antes">⏮ Antes de un día…</option>' +
            '<option value="despues">⏭ Después de un día…</option>' + valores.map(function (d) {
            return '<option value="' + d + '">' + (d === h ? 'Hoy · ' : d === ayer ? 'Ayer · ' : '') + aTexto(d) + '</option>';
        }).join('');
        sel.value = actual;
    }

    // Administrador: filtro por usuario dueño de la visita (los demás solo reciben las suyas de la base).
    // usuarios = [{ id, nombre }] de public.perfiles; "-" = visitas viejas sin usuario.
    var usuarios = null;
    function llenarUsuarios() {
        var sel = $('f-usuario');
        if (!usuarios) return;
        var actual = sel.value, cuenta = {};
        registros.forEach(function (r) { var k = r.USUARIO || '-'; cuenta[k] = (cuenta[k] || 0) + 1; });
        var n = function (k) { return ' (' + (cuenta[k] || 0) + ')'; };
        sel.innerHTML = '<option value="">Usuario: todos</option>' + usuarios.map(function (u) {
            return '<option value="' + esc(u.id) + '">' + esc(u.nombre) + n(u.id) + '</option>';
        }).join('') + (cuenta['-'] ? '<option value="-">Sin usuario' + n('-') + '</option>' : '');
        sel.value = actual;
        sel.hidden = false;
    }
    function filtroUsuario(r) {
        var u = $('f-usuario').value;
        return !u || (u === '-' ? !r.USUARIO : r.USUARIO === u);
    }

    // Varios lotes o microrrutas en el buscador ("481, 429 397" o pegados uno por renglón): lista en mayúsculas, o null
    function listaBuscada() {
        var t = $('f-texto').value.split(/[\s,;]+/).filter(Boolean);
        return t.length > 1 && t.every(function (x) { return /^\d+$/.test(x) || /^Z\d+CC\d+$/i.test(x); }) ? t.map(function (x) { return x.toUpperCase(); }) : null;
    }
    function esDeLista(r, lista) { return lista.indexOf(String(r.LOTE || '').trim()) !== -1 || lista.indexOf(String(r.MICRORRUTA || '').trim().toUpperCase()) !== -1; }
    // sinEstado: con todos los filtros menos el de estado (los vencimientos miran solo las pendientes)
    function filtrados(sinEstado) {
        var texto = norm($('f-texto').value), est = sinEstado ? '' : $('f-estado').value, zona = $('f-zona').value, cuad = $('f-cuadrilla').value, tipo = $('f-tipo').value, dia = $('f-dia').value;
        var lista = listaBuscada(), crit = criterioFecha(dia, $('f-desde').value, $('f-hasta').value);
        return registros.filter(function (r) {
            if (!filtroUsuario(r)) return false;
            if (tipo && r.TIPO !== tipo) return false;
            if (zona && String(r.ZONA).trim() !== zona) return false;
            if (cuad && String(r.CUADRILLA).trim() !== cuad) return false;
            if (!cumpleFecha(r, crit)) return false;
            if (est === 'DESCUENTO' ? !paraDescuento(r) : est && r.ESTADO !== est) return false;
            if (!texto) return true;
            if (lista) return esDeLista(r, lista);
            return ['ID', 'MICRORRUTA', 'LOTE', 'INTERVENTOR', 'OBSERVACIONES NOVEDADES', 'OBSERVACIÓN SUBSANACIÓN']
                .some(function (c) { return norm(r[c]).indexOf(texto) !== -1; });
        });
    }

    // Plazo de corrección de la pendiente (estado.js): vencida o no subsanable = para descuento en la factura
    function tagPlazo(r) {
        var p = plazoVisita(r);
        if (!p) return '';
        return p.descuento ? '<span class="tag-descuento" title="Sin subsanar a tiempo: se descuenta en la factura">💸 Para descuento · ' + esc(p.motivo) + '</span>'
            : '<span class="tag-a-tiempo">⏳ ' + (p.resta === 0 ? 'Vence hoy' : 'Vence en ' + p.resta + (p.resta === 1 ? ' día' : ' días')) + '</span>';
    }
    // Mismos colores por cuadrilla que el mapa rápido; pre-ruta sin cuadrilla en gris
    var COLORES_CUAD = ['#16a34a', '#2563eb', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#be123c', '#4d7c0f', '#ca8a04', '#0f766e'];
    function colorCuadrilla(c) { var n = Number(c); return c && Number.isFinite(n) ? COLORES_CUAD[Math.abs(n) % COLORES_CUAD.length] : '#64748b'; }
    // Lista por páginas: con muchas visitas la página no se vuelve pesada. Al cambiar un filtro vuelve a la primera.
    // Cuántas por página lo elige el usuario y queda guardado en este equipo
    var TAMANOS = [5, 10, 15, 20, 25, 30], POR_PAGINA = 10, paginaLista = 1, firmaFiltros = '';
    try { if (TAMANOS.indexOf(+localStorage.getItem('subsanaciones_por_pagina')) !== -1) POR_PAGINA = +localStorage.getItem('subsanaciones_por_pagina'); } catch (e) {}
    function selectorTamano() {
        return '<label class="por-pagina">Mostrar <select data-por-pagina aria-label="Visitas por página">' + TAMANOS.map(function (n) {
            return '<option' + (n === POR_PAGINA ? ' selected' : '') + '>' + n + '</option>';
        }).join('') + '</select></label>';
    }
    function paginador(total) {
        var paginas = Math.ceil(total / POR_PAGINA);
        if (paginas < 2) return '';
        var desde = (paginaLista - 1) * POR_PAGINA + 1, hasta = Math.min(paginaLista * POR_PAGINA, total);
        return '<div class="paginador"><button type="button" class="secundario pequeno" data-pagina="' + (paginaLista - 1) + '"' + (paginaLista === 1 ? ' disabled' : '') + '>‹ Anterior</button>' +
            '<span class="sub">' + desde + '–' + hasta + ' de ' + total + ' · Página ' + paginaLista + ' de ' + paginas + '</span>' +
            '<button type="button" class="secundario pequeno" data-pagina="' + (paginaLista + 1) + '"' + (paginaLista === paginas ? ' disabled' : '') + '>Siguiente ›</button></div>';
    }
    function pintar() {
        pintarRutas();
        pintarLimpiar();
        // Las tarjetas cuentan con los demás filtros puestos (cuadrilla, día, zona…); el de estado no, porque es el que eligen
        var base = filtrados(true);
        var cuenta = { '': base.length, PENDIENTE: 0, SUBSANADO: 0, 'SIN NOVEDAD': 0 }, descuento = base.filter(paraDescuento).length;
        base.forEach(function (r) { if (cuenta[r.ESTADO] != null) cuenta[r.ESTADO]++; });
        var est = $('f-estado').value;
        $('resumen').innerHTML = [['', 'Visitas'], ['PENDIENTE', 'Pendientes de subsanar'], ['SUBSANADO', 'Subsanadas'], ['SIN NOVEDAD', 'Sin novedad']].map(function (t) {
            return '<div class="tarjeta' + (est === t[0] || (est === 'DESCUENTO' && t[0] === 'PENDIENTE') ? ' activa' : '') + '" data-estado="' + t[0] + '"><div class="num">' + cuenta[t[0]] + '</div><div class="tit">' + t[1] + '</div>' +
                (t[0] === 'PENDIENTE' && descuento ? '<div class="viejas' + (est === 'DESCUENTO' ? ' activa' : '') + '" data-estado="DESCUENTO" title="Ver solo las que pasaron el plazo o no son subsanables">💸 ' + descuento + ' para descuento</div>' : '') + '</div>';
        }).join('');

        var lista = filtrados().sort(porRegistro);
        // Las más viejas primero cuando se piden las de descuento
        if (est === 'DESCUENTO') lista.sort(function (a, b) { return dias(b['FECHA DE LA VISITA']) - dias(a['FECHA DE LA VISITA']); });
        // Varios lotes buscados: cuáles no tienen visita (con los demás filtros puestos)
        var buscados = listaBuscada(), faltan = buscados ? buscados.filter(function (x) { return !lista.some(function (r) { return esDeLista(r, [x]); }); }) : [];
        var avisoFaltan = faltan.length ? '<div class="faltan-lista">Sin visitas' + (lista.length ? '' : ' con estos filtros') + ': ' + faltan.map(esc).join(', ') + '</div>' : '';
        if (!lista.length) {
            $('tabla').innerHTML = avisoFaltan + '<div class="vacio">' + (registros.length ? 'Ningún registro coincide con los filtros.' : 'Aún no hay visitas. Use "+ Nueva visita".') + '</div>';
            return;
        }
        // Con algo escrito en el buscador: subsanar de una vez todas las pendientes de la lista
        var pend = $('f-texto').value.trim() ? lista.filter(function (r) { return r.ESTADO === 'PENDIENTE'; }) : [];
        var masivo = pend.length ? '<div class="subsanar-lista"><button type="button" class="subsanar" data-subsanar-todos>✓ Subsanar ' +
            (pend.length === 1 ? 'la pendiente' : 'las ' + pend.length + ' pendientes') + ' de esta lista</button>' +
            '<span class="sub">Pasa a SI los ítems en NO y pone la fecha de hoy</span></div>' : '';
        // Cuántas hay en la lista (con los filtros puestos) y de qué estado
        var porEstado = {};
        lista.forEach(function (r) { porEstado[r.ESTADO] = (porEstado[r.ESTADO] || 0) + 1; });
        var conteo = '<div class="conteo-lista"><span><b>' + lista.length + (lista.length === 1 ? ' visita' : ' visitas') + '</b>' +
            (lista.length !== registros.length ? ' de ' + registros.length : '') +
            [['SIN NOVEDAD', 'sin novedad', 'sin novedad'], ['PENDIENTE', 'pendiente', 'pendientes'], ['SUBSANADO', 'subsanada', 'subsanadas'], ['CERRADO', 'cerrada', 'cerradas']]
                .filter(function (t) { return porEstado[t[0]]; })
                .map(function (t) { return ' · ' + porEstado[t[0]] + ' ' + (porEstado[t[0]] === 1 ? t[1] : t[2]); }).join('') + '</span>' + selectorTamano() + '</div>';
        var firma = FILTROS.map(function (id) { return $(id).value; }).join('|');
        if (firma !== firmaFiltros) { firmaFiltros = firma; paginaLista = 1; }
        // Si se quedó sin filas (se eliminó o subsanó lo último de la página), a la última que haya
        paginaLista = Math.min(paginaLista, Math.ceil(lista.length / POR_PAGINA));
        var total = lista.length, pagina = lista.slice((paginaLista - 1) * POR_PAGINA, paginaLista * POR_PAGINA);
        $('tabla').innerHTML = conteo + avisoFaltan + masivo + paginador(total) + '<div class="movil">' + pagina.map(tarjetaMovil).join('') + '</div>' +
            '<table class="escritorio"><thead><tr><th>Lote / Microrruta</th><th>Fecha de ejecución</th><th>Visita</th><th>Ítems en NO</th><th>Estado</th><th>Observaciones</th><th></th></tr></thead><tbody>' +
            pagina.map(function (r) {
                var enNo = itemsEnNo(r), d = r.ESTADO === 'PENDIENTE' ? dias(r['FECHA DE LA VISITA']) : null;
                return '<tr class="fila-visita' + (paraDescuento(r) ? ' descuento' : '') + '">' +
                    '<td data-label="Lote / Microrruta"><span class="lote-tit">' + (r.LOTE ? 'Lote ' + esc(r.LOTE) : esc(r.MICRORRUTA || '—')) + '</span>' +
                        (esOp(r) ? '<span class="tag-op">🦺 Operación</span>' : '') +
                        '<div class="sub">' + [r.LOTE ? r.MICRORRUTA : '', r.ZONA ? 'Zona ' + r.ZONA : '', r.CUADRILLA ? 'Cuadrilla ' + r.CUADRILLA : ''].filter(Boolean).map(esc).join(' · ') + '</div></td>' +
                    // Las visitas durante la operación no tienen fecha de ejecución
                    '<td data-label="Fecha de ejecución">' + (r['FECHA DE EJECUCIÓN'] ? esc(r['FECHA DE EJECUCIÓN']) : '<span class="sub">—</span>') + '</td>' +
                    '<td data-label="Visita">' + esc(r['FECHA DE LA VISITA'] || '—') + '<div class="sub">' + esc(r.INTERVENTOR || '') +
                        // El administrador ve las de todos: quién la registró
                        (usuarios && r['REGISTRADO POR'] ? '<div>👤 ' + esc(r['REGISTRADO POR']) + '</div>' : '') + '</div></td>' +
                    '<td data-label="Ítems en NO">' + (enNo.length ? enNo.map(function (i) { return '<span class="chip">' + esc(i) + '</span>'; }).join('') : '<span class="sub">Ninguno</span>') + '</td>' +
                    '<td data-label="Estado">' + badge(r.ESTADO) +
                        (d != null ? '<div class="sub">' + d + ' día' + (d === 1 ? '' : 's') + ' desde la visita</div>' : '') + tagPlazo(r) +
                        (r.ESTADO === 'SUBSANADO' && r['FECHA SUBSANACIÓN'] ? '<div class="sub">' + esc(r['FECHA SUBSANACIÓN']) + '</div>' : '') + '</td>' +
                    '<td data-label="Observaciones">' + esc(r['OBSERVACIONES NOVEDADES'] || '') +
                        (r['OBSERVACIÓN SUBSANACIÓN'] ? '<div class="sub">Subsanación: ' + esc(r['OBSERVACIÓN SUBSANACIÓN']) + '</div>' : '') + '</td>' +
                    '<td class="acciones">' + (r.ESTADO === 'PENDIENTE' ? '<button type="button" class="subsanar pequeno" data-subsanar-ya="' + esc(r.ID) + '" title="Pasar a SI los ítems en NO, con la fecha de hoy">✓ Subsanar</button> ' : '') +
                        '<button type="button" class="secundario pequeno" data-ver="' + esc(r.ID) + '" aria-expanded="' + !!abiertos[r.ID] + '">' +
                        (abiertos[r.ID] ? 'Ocultar ▴' : 'Ver detalles ▾') + '</button> ' +
                        '<button type="button" class="secundario pequeno" data-editar="' + esc(r.ID) + '">Editar</button></td>' +
                    '</tr>' +
                    '<tr class="fila-detalle"' + (abiertos[r.ID] ? '' : ' hidden') + '><td colspan="7">' + detalle(r, false) + '</td></tr>';
            }).join('') + '</tbody></table>' + paginador(total);
    }

    function tarjetaMovil(r) {
        var enNo = itemsEnNo(r), d = r.ESTADO === 'PENDIENTE' ? dias(r['FECHA DE LA VISITA']) : null;
        return '<details class="visita' + (paraDescuento(r) ? ' descuento' : '') + '"' + (abiertos[r.ID] ? ' open' : '') + ' data-id="' + esc(r.ID) + '"><summary>' +
            '<span class="mr">' + (r.LOTE ? 'Lote ' + esc(r.LOTE) + '<span class="cod">' + esc(r.MICRORRUTA || '') + '</span>' : esc(r.MICRORRUTA || '—')) + '</span>' + badge(r.ESTADO) +
            '<span class="linea">' + (esOp(r) ? '<span class="tag-op">🦺 Operación</span> ' : '') + esc(r['FECHA DE LA VISITA'] || '—') +
                (enNo.length ? ' · <span class="alerta">' + enNo.length + ' en NO</span>' : '') +
                (d != null ? ' · <span class="alerta">' + d + ' d</span>' : '') + ' ' + tagPlazo(r) + '</span>' +
            '<span class="ver"><span class="mas">Ver detalles</span><span class="menos">Ocultar</span></span>' +
            '</summary>' + detalle(r, true) + '</details>';
    }

    // Ficha completa de la visita (la usan la lista del celular y la fila desplegable de la tabla)
    function detalle(r, conEditar) {
        var enNo = itemsEnNo(r), d = r.ESTADO === 'PENDIENTE' ? dias(r['FECHA DE LA VISITA']) : null;
        var dato = function (tit, html, ancho) { return html ? '<div' + (ancho ? ' class="ancho"' : '') + '><dt>' + tit + '</dt><dd>' + html + '</dd></div>' : ''; };
        return '<div class="detalle"><dl>' +
            dato('Mapa', r.MICRORRUTA || r.LOTE ? '<a class="enlace-mapa" href="' + esc(urlMapa(r.MICRORRUTA, r.LOTE)) + '">Ver en mapa ›</a>' : '') +
            dato('Zona', esc(r.ZONA)) + dato('Cuadrilla', esc(r.CUADRILLA)) +
            dato('Interventor', esc(r.INTERVENTOR)) + dato('Ejecución', esc(r['FECHA DE EJECUCIÓN'])) +
            dato('Área m2', esc(r['ÁREA M2'])) +
            dato('Días desde la visita', d != null ? d + ' día' + (d === 1 ? '' : 's') : '') +
            dato('Ítems en NO', enNo.length ? enNo.map(function (i) { return '<span class="chip">' + esc(i) + '</span>'; }).join('') : 'Ninguno', true) +
            dato('Observaciones', esc(r['OBSERVACIONES NOVEDADES']), true) +
            dato('Fecha subsanación', esc(r['FECHA SUBSANACIÓN'])) + dato('Registrado por', esc(r['REGISTRADO POR'])) +
            dato('Subsanado por', esc(r['SUBSANADO POR'])) +
            dato('Última modificación', r['MODIFICADO POR'] ? esc(r['MODIFICADO POR']) + ' · ' + esc(r['ÚLTIMA MODIFICACIÓN']) : '') +
            dato('Observación subsanación', esc(r['OBSERVACIÓN SUBSANACIÓN']), true) +
            dato('Evidencia', /^https?:\/\//i.test(r.EVIDENCIA || '') ? '<a href="' + esc(r.EVIDENCIA) + '" target="_blank" rel="noopener">Abrir fotos</a>' : esc(r.EVIDENCIA), true) +
            '</dl>' + (r.ESTADO === 'PENDIENTE' ? (conEditar ? '<button type="button" class="subsanar" data-subsanar-ya="' + esc(r.ID) + '">✓ Subsanar ya</button> ' : '') +
                '<button type="button" class="' + (conEditar ? 'secundario' : 'subsanar pequeno') + '" data-subsanar="' + esc(r.ID) + '">' + (conEditar ? '📎 Subsanar con evidencia' : '✓ Marcar subsanado') + '</button>' : '') +
            (conEditar ? '<div class="fila-btn"><button type="button" class="primario editar" data-editar="' + esc(r.ID) + '">Editar</button>' +
                '<button type="button" class="peligro" data-eliminar="' + esc(r.ID) + '">🗑 Eliminar</button></div>' : '') +
            (enNo.length ? '<button type="button" class="wa' + (conEditar ? ' wa-btn' : ' pequeno') + '" data-wa="' + esc(r.ID) + '">Resumen WhatsApp</button>' : '') +
            (conEditar ? '' : ' <button type="button" class="peligro pequeno" data-eliminar="' + esc(r.ID) + '" style="margin-top:8px">🗑 Eliminar</button>') + '</div>';
    }

    // Pide confirmación y borra la fila de la hoja. Devuelve true si se eliminó.
    function eliminar(id) {
        var r = registros.find(function (x) { return x.ID === id; });
        if (!r) return Promise.resolve(false);
        var nombre = r.LOTE ? 'del lote ' + r.LOTE : 'de ' + (r.MICRORRUTA || id);
        return confirmar('¿Eliminar la visita?', 'Visita ' + (esOp(r) ? 'durante la operación ' : '') + nombre + ' del ' + (r['FECHA DE LA VISITA'] || '—') + ' (' + id + ').\nSe borrará de la base de datos.', '🗑 Eliminar')
            .then(function (si) { return si ? borrar(id) : false; });
    }
    function borrar(id) {
        toast('Eliminando ' + id + '…');
        return enviar('eliminar', { id: id }).then(function () {
            registros = registros.filter(function (x) { return x.ID !== id; });
            guardarCache();
            delete abiertos[id];
            pintar();
            toast('Eliminado ' + id);
            return true;
        });
    }

    // ---------- Visita reciente según la frecuencia (Mensual = 30 días, Quincenal = 15) ----------
    var PERIODO = { MENSUAL: 30, QUINCENAL: 15 };
    function deClave(k) { return new Date(k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8)); }
    // Última visita del lote en o antes de la fecha ref (aaaa-mm-dd), sin contar la que se está editando
    function visitaReciente(mr, lote, excluir, ref) {
        lote = lote && lote !== 'NA' ? String(lote).trim() : '';
        mr = String(mr || '').trim().toUpperCase();
        if (!lote && !mr) return null;
        var kRef = String(ref || hoy()).replace(/-/g, '');
        var u = registros.find(function (r) {
            if (r.ID === excluir || !deLote(r)) return false;
            var mismo = lote ? String(r.LOTE || '').trim() === lote : String(r.MICRORRUTA || '').trim().toUpperCase() === mr;
            var k = claveFecha(r['FECHA DE LA VISITA']);
            return mismo && k && k <= kRef;
        });
        if (!u) return null;
        var p = LOTES[mr] || LOTES[mrPorLote[lote]] || {}, periodo = PERIODO[norm(p.frec)] || 0;
        var k = claveFecha(u['FECHA DE LA VISITA']), d = Math.round((deClave(kRef) - deClave(k)) / 864e5);
        var toca = periodo ? new Date(deClave(k).getTime() + periodo * 864e5).toISOString().slice(0, 10) : '';
        return { r: u, d: d, frec: p.frec || '', periodo: periodo, toca: toca, reciente: periodo ? d < periodo : d < 15 };
    }

    $('btn-resumen').onclick = function () {
        var lista = filtrados().filter(function (r) { return r.ESTADO === 'PENDIENTE'; });
        if (!lista.length) return toast('No hay novedades pendientes en lo filtrado.');
        // Con el filtro "Para descuento": el listado de lotes a descontar en la factura, con el motivo
        var desc = $('f-estado').value === 'DESCUENTO';
        $('wa-texto').value = desc ? textoDescuento(lista) : textoResumen(lista);
        actualizarEnlaceWa();
        $('dlg-wa').showModal();
        toast(lista.length + (lista.length === 1 ? ' visita' : ' visitas') + (desc ? ' para descuento' : (lista.length === 1 ? ' pendiente' : ' pendientes')) + ' en el resumen.');
    };
    // Visitas de hoy (o del día de la visita filtrada) por cuadrilla: lo que se revisó y lo que quedó con novedad
    $('btn-dia').onclick = function () {
        // Con rango de fechas el resumen sigue siendo de un solo día: el "Hasta" si lo hay, si no hoy
        var modo = $('f-dia').value, elegido = modo === MODOS_FECHA.DESPUES ? $('f-desde').value : esModoFecha(modo) ? $('f-hasta').value : modo;
        var dia = aTexto(elegido || hoy()), lista = registros.filter(function (r) { return aTexto(fechaISO(r['FECHA DE LA VISITA'])) === dia; });
        // Con una cuadrilla filtrada, el resumen es solo de esa cuadrilla
        var cuadF = $('f-cuadrilla').value;
        if (cuadF) lista = lista.filter(function (r) { return String(r.CUADRILLA).trim() === cuadF; });
        lista = lista.filter(filtroUsuario);
        if (!lista.length) return toast(elegido ? 'El ' + dia + ' no hay visitas registradas.' : 'Hoy (' + dia + ') aún no hay visitas registradas.');
        // Con novedades: el formato de interventoría (NOVEDADES POSOPERACION + requerimientos); sin novedades, el conteo del día
        var novedades = textoNovedadesDia(lista, dia, menciones());
        if (novedades) mostrarWaDia(lista, dia);
        else { $('wa-texto').value = textoDia(lista, dia); actualizarEnlaceWa(); $('dlg-wa').showModal(); }
        toast(novedades ? 'Novedades del ' + dia + '. Escriba la @mención debajo de "Cuadrilla" una vez y queda recordada.' : 'El ' + dia + ' no quedaron novedades: ' + lista.length + (lista.length === 1 ? ' visita' : ' visitas') + ' en el resumen.');
    };
    // Cumplimiento por cuadrilla contra la frecuencia de cada lote: en el mes elegido y al día de hoy
    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    function nombreMes(m) { return MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }
    function pintarCumpl() {
        var mes = $('cumpl-mes').value, h = hoy(), r = cumplimiento(registros.filter(filtroUsuario), LOTES, mes, h);
        var semaforo = function (p) { return p >= 90 ? 'bien' : p >= 70 ? 'medio' : 'mal'; };
        var fila = function (f, total) {
            var p = porcentaje(f.ejecutadas, f.programadas), pd = porcentaje(f.aldia, f.lotes);
            return '<tr' + (total ? ' class="total"' : '') + '><td>' + (total ? 'Total' : f.cuad === 'sin' ? 'Sin cuadrilla' : '<span class="cuad-pill" style="--c:' + colorCuadrilla(f.cuad) + '">C' + esc(f.cuad) + '</span>') + '</td>' +
                '<td>' + f.lotes + '</td><td>' + f.ejecutadas + ' / ' + f.programadas + '</td>' +
                '<td><span class="pct ' + semaforo(p) + '">' + p + '%</span></td>' +
                '<td>' + f.aldia + ' <span class="sub">(' + pd + '%)</span></td><td>' + f.vencidos + '</td><td>' + f.sin + '</td></tr>';
        };
        $('cumpl-tabla').innerHTML = '<div class="cumpl-scroll"><table class="cumpl"><thead><tr><th>Cuadrilla</th><th>Lotes</th><th>Ejecutadas / programadas</th><th>Cumplimiento</th>' +
            '<th>Al día hoy</th><th>Vencidos</th><th>Sin registro</th></tr></thead><tbody>' +
            r.filas.map(function (f) { return fila(f, false); }).join('') + fila(r.total, true) + '</tbody></table></div>';
        $('cumpl-nota').innerHTML = 'Programadas: 1 vez al mes los lotes mensuales y 2 los quincenales. Ejecutada = visita de lote ejecutado con fecha de ejecución en el mes ' +
            '(sin contar lotes cerrados o no realizados). <b>Al día</b>: la última ejecución está dentro de su frecuencia (15 o 30 días).' +
            (mes === h.slice(0, 7) ? ' El mes está en curso: lo programado es el mes completo.' : '') +
            (usuarios ? ($('f-usuario').value ? ' Solo las visitas del usuario filtrado.' : '') : ' Cuenta solo las visitas que usted registró.');
    }
    $('btn-cumpl').onclick = function () {
        if (!Object.keys(LOTES).length) return toast('No se cargó la programación de lotes.');
        var actual = hoy().slice(0, 7), meses = registros.map(function (r) { return (aInput(r['FECHA DE EJECUCIÓN']) || aInput(r['FECHA DE LA VISITA'])).slice(0, 7); })
            .concat(actual).filter(function (m, i, a) { return m && m <= actual && a.indexOf(m) === i; }).sort().reverse();
        var sel = $('cumpl-mes'), antes = sel.value;
        sel.innerHTML = meses.map(function (m) { return '<option value="' + m + '">' + nombreMes(m) + (m === actual ? ' (en curso)' : '') + '</option>'; }).join('');
        sel.value = meses.indexOf(antes) !== -1 ? antes : actual;
        pintarCumpl();
        $('dlg-cumpl').showModal();
    };
    $('cumpl-mes').onchange = pintarCumpl;
    $('cumpl-cerrar').onclick = function () { $('dlg-cumpl').close(); };
    // Vencimientos: pendientes por cuadrilla según el plazo de cada novedad (a tiempo / para descuento)
    var ultimoVenc = null;
    $('btn-venc').onclick = function () {
        var res = vencimientos(filtrados(true));
        if (!res.total.total) return toast('No hay novedades pendientes con plazo en lo filtrado.');
        ultimoVenc = res;
        var celda = function (n, t) { return '<td class="' + (n ? 'g-' + t.grupo : 'cero') + '">' + (n || '·') + '</td>'; };
        var fila = function (f, total) {
            return '<tr' + (total ? ' class="total"' : '') + '><td>' + (total ? 'Total' : f.cuad ? '<span class="cuad-pill" style="--c:' + colorCuadrilla(f.cuad) + '">C' + esc(f.cuad) + '</span>' : 'Sin cuadrilla') + '</td>' +
                TRAMOS_VENC.map(function (t) { return celda(f[t.id], t); }).join('') + '<td><b>' + f.descuento + '</b> / ' + f.total + '</td></tr>';
        };
        $('venc-tabla').innerHTML = '<div class="cumpl-scroll"><table class="cumpl venc"><thead>' +
            '<tr><th rowspan="2">Cuadrilla</th><th colspan="3" class="g-tiempo">⏳ A tiempo</th><th colspan="4" class="g-descuento">💸 Para descuento</th><th rowspan="2">Descuento / pendientes</th></tr><tr>' +
            TRAMOS_VENC.map(function (t) { return '<th>' + esc(t.titulo.replace(/^Vence en |^Vence |^Vencida hace /, '')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            res.filas.map(function (f) { return fila(f, false); }).join('') + fila(res.total, true) + '</tbody></table></div>';
        // Detalle: lo vencido y lo que vence hoy o mañana, lo más atrasado primero
        var urgentes = res.detalle.filter(function (x) { return x.tramo !== 'pronto'; });
        $('venc-lista').innerHTML = urgentes.length ? '<h3>Lo más urgente</h3><ul class="venc-lista">' + urgentes.map(function (x) {
            var r = x.r;
            return '<li class="' + (x.p.descuento ? 'g-descuento' : 'g-tiempo') + '"><b>' + esc(r.LOTE ? 'Lote ' + r.LOTE : r.MICRORRUTA || r.ID) + '</b> ' +
                '<span class="sub">' + esc([r.LOTE ? r.MICRORRUTA : '', x.cuad ? 'C' + x.cuad : '', 'visita ' + (r['FECHA DE LA VISITA'] || '—')].filter(Boolean).join(' · ')) + '</span> · ' + esc(textoVence(x)) + '</li>';
        }).join('') + '</ul>' : '';
        // Reglas de vencimiento: de dónde salen los días de cada columna
        $('venc-nota').innerHTML = '<details class="venc-reglas" open><summary>📏 Reglas de vencimiento</summary>' +
            '<table class="cumpl"><thead><tr><th>Visita</th><th>Novedad</th><th>Plazo para subsanar</th></tr></thead><tbody>' +
            REGLAS_VENC.map(function (g) { return '<tr><td>' + esc(g.tipo) + '</td><td>' + esc(g.novedad) + '</td><td><b>' + esc(g.plazo) + '</b></td></tr>'; }).join('') + '</tbody></table>' +
            '<ul><li>Los días son calendario y se cuentan desde la <b>fecha de la visita</b>.</li>' +
            '<li>Si la visita tiene varias novedades, manda el <b>plazo más corto</b>.</li>' +
            '<li>Pasado el plazo sin subsanar queda <b>para descuento</b>: primero se habla con el supervisor del contratista y, si no hay respuesta, se descuenta en la factura.</li>' +
            '<li>Este resumen usa los filtros de la lista, menos el de estado (solo cuenta pendientes).</li></ul></details>';
        $('dlg-venc').showModal();
    };
    $('venc-cerrar').onclick = function () { $('dlg-venc').close(); };
    // Plazos para los supervisores (supervisores.js): todo lo pendiente con plazo, por cuadrilla y urgencia, listo para
    // copiar en WhatsApp. No usa el filtro de fecha ni el de estado: lo pendiente de días anteriores también cuenta
    $('btn-sup').onclick = function () {
        var zona = $('f-zona').value, cuad = $('f-cuadrilla').value, tipo = $('f-tipo').value;
        var lista = registros.filter(function (r) {
            return filtroUsuario(r) && (!tipo || r.TIPO === tipo) && (!zona || String(r.ZONA).trim() === zona) && (!cuad || String(r.CUADRILLA).trim() === cuad);
        });
        var texto = textoSupervisores(lista, hoy(), menciones());
        if (!texto) return toast('No hay novedades pendientes con plazo' + (zona || cuad || tipo ? ' con la zona, cuadrilla o tipo elegidos.' : '.'));
        $('wa-texto').value = texto;
        actualizarEnlaceWa();
        $('dlg-wa').showModal();
        toast('Plazos al ' + aTexto(hoy()) + (cuad ? ' de la cuadrilla ' + cuad : ' de todas las cuadrillas') + '. Revise y copie para WhatsApp.');
    };
    $('venc-wa').onclick = function () {
        if (!ultimoVenc) return;
        $('dlg-venc').close();
        $('wa-texto').value = textoVencimientos(ultimoVenc, aTexto(hoy()));
        actualizarEnlaceWa();
        $('dlg-wa').showModal();
    };
    // @menciones de los encargados por cuadrilla, aprendidas del texto que se copia o se abre en WhatsApp
    function menciones() { try { return JSON.parse(localStorage.getItem('subsanaciones_menciones')) || {}; } catch (e) { return {}; } }
    function recordarMenciones() {
        var nuevas = leerMenciones($('wa-texto').value);
        if (!Object.keys(nuevas).length) return;
        try { localStorage.setItem('subsanaciones_menciones', JSON.stringify(Object.assign(menciones(), nuevas))); } catch (e) {}
    }
    $('wa-abrir').addEventListener('click', recordarMenciones);
    // Programarlo: lo envía el servidor a la hora elegida (web/src/whatsapp/programar.js)
    $('wa-programar').onclick = function () {
        var texto = $('wa-texto').value.trim();
        if (!texto) return toast('El mensaje está vacío.');
        recordarMenciones();
        abrirProgramar({ texto: texto, origen: 'Subsanaciones', avisar: toast });
    };
    function actualizarEnlaceWa() { $('wa-abrir').href = 'https://wa.me/?text=' + encodeURIComponent($('wa-texto').value); }
    // Mensaje de una visita y resumen del día: se elige el formato y si va el plazo (preferencias del equipo, cada uno
    // con las suyas). Los demás resúmenes que usan esta ventana no muestran estas opciones
    // waModo: { tipo: 'visita', r } o { tipo: 'dia', lista, dia }
    var waModo = null, PREF_WA = { visita: 'subsanaciones_wa_formato', dia: 'subsanaciones_wa_formato_dia' };
    var FORMATOS_WA = { visita: FORMATOS_VISITA, dia: FORMATOS_DIA }, FORMATO_INICIAL = { visita: 'corto', dia: 'formal' };
    function prefWa(tipo) { try { return JSON.parse(localStorage.getItem(PREF_WA[tipo])) || {}; } catch (e) { return {}; } }
    function pintarWa() {
        var o = { formato: $('wa-formato').value, plazo: $('wa-plazo').checked };
        if (waModo.tipo === 'visita') {
            var cuad = String(waModo.r.CUADRILLA || '').trim().replace(/^C\s*/i, '');
            o.mencion = menciones()[cuad] || '';
            $('wa-texto').value = textoVisita(waModo.r, o);
        } else {
            // «Conteo» no lleva plazos: la casilla se apaga mientras esté elegido
            $('wa-plazo').disabled = o.formato === 'conteo';
            $('wa-texto').value = o.formato === 'conteo' ? textoDia(waModo.lista, waModo.dia) : textoNovedadesDia(waModo.lista, waModo.dia, menciones(), o);
        }
        actualizarEnlaceWa();
    }
    function abrirWaConFormatos(modo) {
        var formatos = FORMATOS_WA[modo.tipo], p = prefWa(modo.tipo);
        waModo = modo;
        $('wa-formato').innerHTML = Object.keys(formatos).map(function (k) { return '<option value="' + k + '">' + esc(formatos[k]) + '</option>'; }).join('');
        $('wa-formato').value = formatos[p.formato] ? p.formato : FORMATO_INICIAL[modo.tipo];
        $('wa-plazo').checked = p.plazo !== false;
        $('wa-plazo').disabled = false;
        $('wa-formatos').hidden = false;
        $('wa-ayuda').textContent = 'Puede ajustar el texto antes de copiarlo. Si cambia el formato o el plazo, el texto se vuelve a armar.';
        pintarWa();
        $('dlg-wa').showModal();
    }
    function mostrarWhatsapp(r) { abrirWaConFormatos({ tipo: 'visita', r: r }); }
    function mostrarWaDia(lista, dia) { abrirWaConFormatos({ tipo: 'dia', lista: lista, dia: dia }); }
    function cambioWa() {
        if (!waModo) return;
        try { localStorage.setItem(PREF_WA[waModo.tipo], JSON.stringify({ formato: $('wa-formato').value, plazo: $('wa-plazo').checked })); } catch (e) {}
        // Antes de rearmar, se guardan las @menciones que se hayan escrito a mano
        recordarMenciones();
        pintarWa();
    }
    $('wa-formato').addEventListener('change', cambioWa);
    $('wa-plazo').addEventListener('change', cambioWa);
    // Al cerrar se esconden las opciones: la ventana la usan también los otros resúmenes
    $('dlg-wa').addEventListener('close', function () {
        waModo = null;
        $('wa-plazo').disabled = false;
        $('wa-formatos').hidden = true;
        $('wa-ayuda').textContent = 'Puede ajustar el texto antes de copiarlo.';
    });
    $('wa-texto').addEventListener('input', actualizarEnlaceWa);
    $('wa-cerrar').onclick = function () { $('dlg-wa').close(); };
    $('wa-copiar').onclick = function () {
        recordarMenciones();
        var t = $('wa-texto');
        var copiado = function () { toast('Resumen copiado. Péguelo en WhatsApp.'); };
        var aMano = function () { t.select(); try { document.execCommand('copy'); copiado(); } catch (e) { toast('Seleccione el texto y cópielo manualmente.'); } };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t.value).then(copiado, aMano); else aMano();
    };

    // ---------- Formulario ----------
    function campos() { return form.querySelectorAll('[data-campo]'); }
    function datosFormulario() {
        var r = {};
        campos().forEach(function (el) { r[el.dataset.campo] = FECHAS.indexOf(el.dataset.campo) !== -1 ? aTexto(el.value) : el.value.trim(); });
        itemsForm().forEach(function (it, i) { var m = form.querySelector('input[name="item' + i + '"]:checked'); r[it] = m ? m.value : ''; });
        // La hoja "Operación" no tiene fecha de ejecución
        if (tipoForm === OP) delete r['FECHA DE EJECUCIÓN'];
        r.TIPO = tipoForm;
        return r;
    }
    // Cambia el formulario entre visita al lote ejecutado y durante la operación (ítems y campos distintos)
    function aplicarTipo(tipo, r, nuevo) {
        tipoForm = tipo === OP && hayOperacion ? OP : EJ;
        $('tipo-' + (tipoForm === OP ? 'op' : 'ej')).checked = true;
        $('campo-ejecucion').hidden = tipoForm === OP;
        $('campo-visita').classList.toggle('doble', tipoForm !== OP);
        $('campo-visita').classList.toggle('ancho', tipoForm === OP);
        form.querySelectorAll('.solo-ej').forEach(function (b) { b.hidden = tipoForm === OP; });
        $('dlg-recordatorios').hidden = tipoForm !== OP || !recordatorios.length;
        $('dlg-recordatorios').innerHTML = '<b>📌 Tener en cuenta</b><ul>' + recordatorios.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        $('items-titulo').textContent = tipoForm === OP ? 'Ítems de la operación (SI = cumple · NO = requiere subsanación)' : 'Ítems revisados (SI = cumple · NO = requiere subsanación)';
        pintarItems(r || {}, nuevo);
        actualizarEstadoForm();
    }
    document.querySelectorAll('[name="tipo-visita"]').forEach(function (el) {
        el.addEventListener('change', function () {
            if (el.value === OP && !hayOperacion) {
                toast('Las visitas durante la operación aún no están disponibles.');
                return aplicarTipo(EJ, null, true);
            }
            aplicarTipo(el.value, null, true);
        });
    });
    function actualizarEstadoForm() {
        var estado = calcularEstado(datosFormulario(), editando ? editando.ESTADO : '');
        $('dlg-estado').className = 'estado e-' + estado.replace(/ /g, '-');
        $('dlg-estado').textContent = estado;
        var fecha = form.querySelector('[data-campo="FECHA SUBSANACIÓN"]');
        if (estado === 'SUBSANADO' && !fecha.value) fecha.value = hoy();
        sugerirHallazgos();
    }
    function pintarItems(r, nuevo) {
        var lista = itemsForm();
        $('items').innerHTML = lista.length ? lista.map(function (it, i) {
            var v = nuevo ? 'SI' : valorItem(r[it]);
            return '<div class="item"><span>' + esc(it) + '</span><span class="opciones">' +
                [['SI', 'si'], ['NO', 'no'], ['N/A', 'na']].map(function (o) {
                    var id = 'it' + i + o[1];
                    return '<input type="radio" id="' + id + '" name="item' + i + '" value="' + o[0] + '"' + (v === o[0] ? ' checked' : '') + '><label class="' + o[1] + '" for="' + id + '">' + o[0] + '</label>';
                }).join('') + '</span></div>';
        }).join('') : '<div class="sub">No hay ítems activos de ' + (tipoForm === OP ? 'operación' : 'lote ejecutado') + ' en la tabla items.</div>';
    }
    function mostrarDireccion() {
        var mr = form.querySelector('[data-campo="MICRORRUTA"]').value.trim().toUpperCase(), p = LOTES[mr];
        // target _blank: no perder lo que se lleva escrito en el formulario
        $('dlg-direccion').innerHTML = p ? (p.d ? 'Dirección: ' + esc(p.d) + ' · ' : '') +
            '<a class="enlace-mapa" target="_blank" rel="noopener" href="' + esc(urlMapa(mr, p.lote)) + '">Ver en mapa ›</a>' : '';
        mostrarReciente();
    }
    // "Este lote fue visitado hace 8 días": compara con la frecuencia para saber si ya le toca otra visita
    function mostrarReciente() {
        var el = $('dlg-reciente'), val = function (c) { return form.querySelector('[data-campo="' + c + '"]').value; };
        // El aviso de frecuencia es del lote terminado; durante la operación no aplica
        var v = tipoForm !== OP && visitaReciente(val('MICRORRUTA'), val('LOTE'), editando ? editando.ID : null, val('FECHA DE LA VISITA'));
        el.hidden = !v;
        if (!v) return;
        var u = v.r, frec = v.frec ? 'Frecuencia ' + esc(v.frec.toLowerCase()) : '';
        var datos = esc(u['FECHA DE LA VISITA']) + ' ' + badge(u.ESTADO) + (u.INTERVENTOR ? ' · ' + esc(u.INTERVENTOR) : '');
        el.className = 'reciente' + (v.reciente ? ' alerta' : '');
        el.innerHTML = v.d === 0
            ? '⚠ <b>Este lote ya tiene una visita registrada ' + (editando ? 'ese día' : 'hoy') + '</b> (' + datos + '). Revise que no la esté registrando dos veces.'
            : v.reciente
                ? '⚠ <b>Visitado ' + textoDias(v.d) + '</b> (' + datos + ').' + (frec ? ' ' + frec + ': le vuelve a tocar desde el ' + esc(aTexto(v.toca)) + '.' : '')
                : 'Última visita ' + textoDias(v.d) + ' (' + datos + ').' + (frec ? ' ' + frec + ': ya le toca.' : '');
    }
    form.querySelector('[data-campo="FECHA DE LA VISITA"]').addEventListener('change', mostrarReciente);
    // registros va de la visita más reciente a la más antigua
    function ultimoValor(campo) { var r = registros.find(function (x) { return String(x[campo] || '').trim(); }); return r ? String(r[campo]).trim() : ''; }
    // tipo: EJECUCIÓN (por defecto) u OPERACIÓN para una visita nueva; al editar manda el tipo de la visita
    function abrir(r, contexto, tipo) {
        desdeRuta = contexto || null;
        $('dlg-contexto').innerHTML = contexto ? contexto.html : '';
        $('dlg-contexto').hidden = !contexto;
        editando = r && r.ID ? r : null;
        r = r || {};
        $('dlg-titulo').textContent = editando ? 'Editar ' + editando.ID : 'Nueva visita';
        $('btn-eliminar').hidden = !editando;
        limpiarIa();
        campos().forEach(function (el) {
            var v = r[el.dataset.campo] || '';
            el.value = FECHAS.indexOf(el.dataset.campo) !== -1 ? aInput(v) : v;
        });
        if (!editando) {
            seguirUbicacion();
            if (!r['FECHA DE LA VISITA']) form.querySelector('[data-campo="FECHA DE LA VISITA"]').value = hoy();
            try {
                // Con sesión, la base de datos firma la visita con el usuario (CFG.usuario); aquí solo se muestra
                form.querySelector('[data-campo="REGISTRADO POR"]').value = CFG.usuario || localStorage.getItem('subsanaciones_usuario') || ultimoValor('REGISTRADO POR');
                form.querySelector('[data-campo="INTERVENTOR"]').value = localStorage.getItem('subsanaciones_interventor') || ultimoValor('INTERVENTOR');
            } catch (e) {}
        }
        // El tipo no se cambia al editar: cada tipo vive en su propia hoja
        $('tipo-visita').hidden = !!editando;
        aplicarTipo(editando ? (esOp(editando) ? OP : EJ) : tipo || r.TIPO || EJ, r, !editando);
        if (editando && esOp(editando)) $('dlg-titulo').textContent = 'Editar ' + editando.ID + ' · operación';
        mostrarDireccion();
        actualizarLimpiar();
        if (!dlg.open) dlg.showModal();
        dlg.scrollTop = 0; // el celular recuerda dónde quedó la ventana anterior
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    // Abre la visita con los ítems en NO pasados a SI y la fecha de hoy: al guardar queda SUBSANADO
    function subsanar(r) {
        var enNo = itemsEnNo(r);
        abrir(r, { html: '✓ Subsanando <b>' + esc(r.MICRORRUTA || '') + (r.LOTE ? ' · Lote ' + esc(r.LOTE) : '') + '</b><br>' +
            'Se marcaron en SI: ' + enNo.map(esc).join(', ') + '. Revise, agregue la observación y guarde.<br>' +
            '📌 <b style="font-size:13px">Adjunte la evidencia ahora:</b> la interventoría la pide al momento de subsanar, no después.' });
        enNo.forEach(function (it) { var el = $('it' + itemsDe(r).indexOf(it) + 'si'); if (el) el.checked = true; });
        form.querySelector('[data-campo="FECHA SUBSANACIÓN"]').value = hoy();
        actualizarEstadoForm();
        var obs = form.querySelector('[data-campo="OBSERVACIÓN SUBSANACIÓN"]');
        setTimeout(function () { obs.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
    }
    // Subsanar sin abrir el formulario: los ítems en NO pasan a SI y la fecha de subsanación es hoy (la base pone el
    // estado SUBSANADO y quién lo subsanó). Devuelve el registro guardado.
    function subsanarYa(r) {
        var cambio = { 'FECHA SUBSANACIÓN': aTexto(hoy()) };
        itemsEnNo(r).forEach(function (it) { cambio[it] = 'SI'; });
        return enviar('actualizar', { id: r.ID, registro: cambio }).then(function (d) {
            var nuevo = canonico(d.registro), i = registros.findIndex(function (x) { return x.ID === nuevo.ID; });
            if (i !== -1) registros[i] = nuevo;
            return nuevo;
        });
    }
    function nombreVisita(r) { return r.LOTE ? 'Lote ' + r.LOTE : r.MICRORRUTA || r.ID; }
    function subsanarUna(r, boton) {
        var enNo = itemsEnNo(r);
        confirmar('¿Subsanar ' + nombreVisita(r) + '?', 'Pasan a SI: ' + (enNo.join(', ') || 'ningún ítem') + '.\nFecha de subsanación: hoy, ' + aTexto(hoy()) + '.', '✓ Subsanar', 'Cancelar')
            .then(function (si) {
                if (!si) return;
                if (boton) boton.disabled = true;
                return subsanarYa(r).then(function (nuevo) { guardarCache(); pintar(); toast(nombreVisita(nuevo) + ' · ' + nuevo.ESTADO); })
                    .catch(function (err) { toast('No se subsanó: ' + err.message); if (boton) boton.disabled = false; });
            });
    }
    // Todas las pendientes de la lista filtrada, una tras otra; al final dice cuáles no se pudieron
    function subsanarLista(boton) {
        var pend = filtrados().filter(function (r) { return r.ESTADO === 'PENDIENTE'; });
        if (!pend.length) return;
        confirmar('¿Subsanar ' + pend.length + (pend.length === 1 ? ' visita pendiente?' : ' visitas pendientes?'),
            pend.map(nombreVisita).join(', ') + '\n\nA cada una se le pasan a SI los ítems en NO, con fecha de subsanación de hoy (' + aTexto(hoy()) + ').',
            '✓ Subsanar ' + pend.length, 'Cancelar')
            .then(function (si) {
                if (!si) return;
                boton.disabled = true;
                var bien = 0, mal = [];
                return pend.reduce(function (p, r, i) {
                    return p.then(function () {
                        boton.textContent = 'Subsanando ' + (i + 1) + ' de ' + pend.length + '…';
                        return subsanarYa(r).then(function () { bien++; }, function (err) { mal.push(nombreVisita(r) + ' (' + err.message + ')'); });
                    });
                }, Promise.resolve()).then(function () {
                    guardarCache();
                    pintar();
                    if (mal.length) aviso('<b>' + bien + ' subsanadas.</b> No se pudieron: ' + mal.map(esc).join(', '));
                    else toast(bien + (bien === 1 ? ' visita subsanada' : ' visitas subsanadas'));
                });
            });
    }
    function ocupado(si) { ['btn-guardar', 'btn-eliminar', 'btn-cancelar'].forEach(function (id) { $(id).disabled = si; }); }

    form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var r = datosFormulario();
        if (!r.MICRORRUTA && !r.LOTE) { toast('Indique la microrruta o el lote.'); return; }
        // Obligatorios: interventor siempre y fecha de ejecución en la visita de lote ejecutado (la de operación no la tiene)
        var falta = function (campo, msg) { var el = form.querySelector('[data-campo="' + campo + '"]'); el.focus(); el.scrollIntoView({ block: 'center' }); toast(msg); };
        if (!String(r.INTERVENTOR || '').trim()) return falta('INTERVENTOR', 'Escriba el interventor (iniciales).');
        if (tipoForm !== OP && !r['FECHA DE EJECUCIÓN']) return falta('FECHA DE EJECUCIÓN', 'Indique la fecha de ejecución del lote.');
        var sinMarcar = itemsForm().filter(function (it) { return !r[it]; });
        if (sinMarcar.length) { toast('Falta marcar: ' + sinMarcar.join(', ')); return; }
        try {
            localStorage.setItem('subsanaciones_usuario', r['REGISTRADO POR']);
            localStorage.setItem('subsanaciones_interventor', r.INTERVENTOR);
        } catch (e) {}
        var lejos = !editando && lejosDelLote(r);
        if (!lejos) return guardarVisita(r);
        confirmar('¿Está en el lote?', 'Su GPS lo ubica a ' + textoDist(lejos.d) + ' del ' + lejos.nombre + ' (precisión ±' + Math.round(precision) + ' m).\n' +
            'Si está registrando la visita desde otro sitio, puede guardarla igual.', 'Guardar igual')
            .then(function (si) { if (si) guardarVisita(r); });
    });
    // Visita nueva de hoy con el GPS preciso a más de LEJOS_M del lote: { d, nombre } o null.
    // Sin GPS, sin coordenadas del lote o con fecha de otro día no se avisa nada.
    var LEJOS_M = 300;
    function lejosDelLote(r) {
        if (!gps || precision > 100 || aInput(r['FECHA DE LA VISITA']) !== hoy()) return null;
        var lote = String(r.LOTE || '').trim(), mr = String(r.MICRORRUTA || '').trim().toUpperCase();
        var id = lote && lote !== 'NA' && puntosDe(lote).length ? lote : mr && puntosDe(mr).length ? mr : '';
        if (!id) return null;
        var d = distLotes(gps, id);
        return d > LEJOS_M ? { d: d, nombre: /^\d+$/.test(id) ? 'lote ' + id : id } : null;
    }
    function guardarVisita(r) {
        ocupado(true);
        var era = editando, veniaDeRuta = desdeRuta;
        var peticion = era ? enviar('actualizar', { id: era.ID, registro: r }) : enviar('crear', { registro: r, tipo: tipoForm });
        peticion.then(function (d) {
            var nuevo = canonico(d.registro);
            var i = registros.findIndex(function (x) { return x.ID === nuevo.ID; });
            if (i === -1) registros.unshift(nuevo); else registros[i] = nuevo;
            ordenarRegistros();
            guardarCache();
            dlg.close();
            llenarSelect('f-zona', 'ZONA', 'Zona: todas');
            llenarSelect('f-cuadrilla', 'CUADRILLA', 'Cuadrilla: todas');
            llenarDias();
            llenarUsuarios();
            pintar();
            toast((era ? 'Actualizado ' : 'Guardado ') + nuevo.ID + ' · ' + nuevo.ESTADO);
            if (veniaDeRuta && !era) {
                fijar(veniaDeRuta.id);
                var sig = $('ruta').querySelectorAll('.ruta-card')[veniaDeRuta.ri];
                sig = sig && (sig.querySelector('.parada.siguiente') || sig);
                if (sig) setTimeout(function () { sig.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
            }
            if (!era && itemsEnNo(nuevo).length) mostrarWhatsapp(nuevo);
        }).catch(function (err) { toast('No se guardó: ' + err.message); })
          .then(function () { ocupado(false); });
    }

    $('btn-eliminar').onclick = function () {
        if (!editando) return;
        ocupado(true);
        eliminar(editando.ID).then(function (ok) { if (ok) dlg.close(); })
            .catch(function (err) { toast('No se eliminó: ' + err.message); })
            .then(function () { ocupado(false); });
    };
    $('btn-cancelar').onclick = $('dlg-cerrar').onclick = function () { dlg.close(); };
    $('todo-si').onclick = function () {
        itemsForm().forEach(function (it, i) { var el = $('it' + i + 'si'); if (el) el.checked = true; });
        actualizarEstadoForm();
    };
    // Marca todos los ítems con un valor y pone el motivo al inicio de la observación (cambia uno por el otro si ya estaba)
    function marcarLote(valor, motivo) {
        itemsForm().forEach(function (it, i) { var el = $('it' + i + valor); if (el) el.checked = true; });
        var obs = form.querySelector('[data-campo="OBSERVACIONES NOVEDADES"]');
        var resto = obs.value.trim().replace(/^LOTE (NO REALIZADO|CERRADO)\.?\s*/i, '');
        obs.value = motivo + (resto && norm(resto) !== 'SIN NOVEDAD' ? '. ' + resto : '');
        actualizarEstadoForm();
        obs.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // La cuadrilla no ejecutó el lote: todo en NO y la observación lo dice (queda PENDIENTE)
    $('no-realizado').onclick = function () { marcarLote('no', NO_REALIZADO); };
    // No se pudo entrar al lote: todo en N/A y queda CERRADO (cuenta como revisado en la pre-ruta)
    $('lote-cerrado').onclick = function () { marcarLote('na', CERRADO); };
    // Revisión con fotos (opcional): la IA marca SI/NO solo en los ítems que se ven en las fotos;
    // los que no se ven quedan como estaban y lo demás que encuentre va a las observaciones
    var revisionIa = 0;
    function limpiarIa() {
        revisionIa++;
        $('ia-resultado').hidden = true;
        $('ia-resultado').innerHTML = '';
        $('btn-ia').disabled = false;
        delete form.querySelector('[data-campo="OBSERVACIONES NOVEDADES"]').dataset.ia;
    }
    $('btn-ia').onclick = function () { $('fotos-ia').value = ''; $('fotos-ia').click(); };
    $('fotos-ia').onchange = function () {
        var archivos = $('fotos-ia').files, lista = itemsForm(), mia = ++revisionIa;
        if (!archivos.length) return;
        if (archivos.length > MAX_FOTOS) return toast('Máximo ' + MAX_FOTOS + ' fotos por revisión.');
        var val = function (c) { return form.querySelector('[data-campo="' + c + '"]').value.trim(); };
        var lote = [val('MICRORRUTA'), val('LOTE') && 'Lote ' + val('LOTE')].filter(Boolean).join(' · ');
        $('btn-ia').disabled = true;
        ocupado(true);
        $('ia-resultado').className = 'ia';
        $('ia-resultado').innerHTML = '⏳ Revisando ' + archivos.length + ' foto' + (archivos.length > 1 ? 's' : '') + '… puede tardar unos segundos.';
        $('ia-resultado').hidden = false;
        revisarFotos(archivos, lista, tipoForm, lote).then(function (res) {
            // Se cerró el formulario o cambió el tipo mientras tanto: el resultado ya no aplica
            if (mia !== revisionIa || lista !== itemsForm()) return;
            aplicarIa(res, archivos.length);
        }).catch(function (err) {
            if (mia !== revisionIa) return;
            $('ia-resultado').className = 'ia error';
            $('ia-resultado').textContent = '✗ ' + err.message;
        }).then(function () {
            if (mia === revisionIa) $('btn-ia').disabled = false;
            ocupado(false);
        });
    };
    function aplicarIa(res, nFotos) {
        res.items.forEach(function (r, i) {
            var el = r.valor === 'SI' ? $('it' + i + 'si') : r.valor === 'NO' ? $('it' + i + 'no') : null;
            if (el) el.checked = true;
        });
        // Observación: el detalle de cada ítem en NO + las demás novedades. Reemplaza el texto de una revisión anterior
        var enNo = res.items.filter(function (r) { return r.valor === 'NO'; });
        var otras = res.observaciones && norm(res.observaciones) !== 'SIN NOVEDAD' ? res.observaciones : '';
        var texto = enNo.map(function (r) { return r.item + ': ' + r.detalle.replace(/\.$/, ''); }).concat(otras ? [otras.replace(/\.$/, '')] : []).join('. ');
        texto = texto ? texto + '.' : 'SIN NOVEDAD';
        var obs = form.querySelector('[data-campo="OBSERVACIONES NOVEDADES"]'), actual = obs.value.trim(), previo = obs.dataset.ia;
        if (previo && actual.indexOf(previo) !== -1) actual = actual.replace(previo, '').replace(/^[.\s]+|[.\s]+$/g, '');
        if (!actual || norm(actual) === 'SIN NOVEDAD') obs.value = texto;
        else obs.value = actual + (texto === 'SIN NOVEDAD' ? '' : '. ' + texto);
        obs.dataset.ia = texto === 'SIN NOVEDAD' ? '' : texto;
        actualizarEstadoForm();

        var sinDato = res.items.filter(function (r) { return r.valor === 'SIN_DATO'; });
        $('ia-resultado').className = 'ia';
        $('ia-resultado').innerHTML = '<b>📷 Revisión con ' + nFotos + ' foto' + (nFotos > 1 ? 's' : '') + '</b> — revise y corrija antes de guardar.' +
            (res.calidad_fotos ? '<div class="ia-alerta">⚠ ' + esc(res.calidad_fotos) + '</div>' : '') +
            '<ul>' + res.items.map(function (r) {
                var marca = r.valor === 'SI' ? '<span class="ia-si">SI</span>' : r.valor === 'NO' ? '<span class="ia-no">NO</span>' : '<span class="ia-nd">No se ve</span>';
                return '<li>' + marca + ' ' + esc(r.item) + (r.detalle ? '<br><span class="sub">' + esc(r.detalle) + '</span>' : '') + '</li>';
            }).join('') + '</ul>' +
            (sinDato.length ? '<div class="sub">Los ítems "No se ve" quedaron como estaban: márquelos a mano.</div>' : '') +
            (otras ? '<div><b>Otras novedades:</b> ' + esc(otras) + '</div>' : '');
    }
    $('items').addEventListener('change', actualizarEstadoForm);
    form.querySelector('[data-campo="OBSERVACIONES NOVEDADES"]').addEventListener('input', actualizarEstadoForm);

    // Autocompletar con la programación de microrrutas (data/direcciones_lotes.js)
    var mrPorLote = {};
    Object.keys(LOTES).forEach(function (mr) { if (LOTES[mr].lote && !mrPorLote[LOTES[mr].lote]) mrPorLote[LOTES[mr].lote] = mr; });
    // Índice para el buscador: microrruta, lote, cuadrilla y dirección ya normalizados
    var indice = Object.keys(LOTES).sort().map(function (mr) {
        var p = LOTES[mr], lote = p.lote && p.lote !== 'NA' ? String(p.lote) : '';
        return { mr: mr, lote: lote, cuad: p.cuad || '', d: p.d || '', nmr: norm(mr), nd: norm(p.d) };
    });
    function buscar(q, modo) {
        q = norm(q);
        if (!q) return [];
        var qmr = q.replace(/\s+/g, ''), res = [];
        indice.forEach(function (x) {
            var p = -1;
            if (x.nmr === qmr || x.lote === q) p = 0;
            else if (x.lote && x.lote.indexOf(q) === 0) p = 1;
            else if (modo === 'mr' && x.nmr.indexOf(qmr) === 0) p = 1;
            else if (modo === 'mr' && x.nmr.indexOf(qmr) !== -1) p = 2;
            else if (modo === 'mr' && q.length >= 3 && x.nd.indexOf(q) !== -1) p = 3;
            if (p !== -1) res.push({ x: x, p: p });
        });
        res.sort(function (a, b) { return a.p - b.p || a.x.mr.localeCompare(b.x.mr); });
        return res.slice(0, 40).map(function (r) { return r.x; });
    }
    function resaltar(texto, q) {
        var t = esc(texto), n = norm(q);
        if (!n) return t;
        var i = norm(texto).indexOf(n);
        // norm() conserva la longitud salvo espacios repetidos; si no cuadra, no resalta
        return i === -1 || norm(texto).length !== String(texto).length ? t : esc(texto.slice(0, i)) + '<mark>' + esc(texto.slice(i, i + n.length)) + '</mark>' + esc(texto.slice(i + n.length));
    }
    var caja = document.createElement('div');
    caja.className = 'sugerencias';
    caja.hidden = true;
    var activo = null, marcada = -1;
    function cerrarSugerencias() { caja.hidden = true; marcada = -1; }
    function mostrarSugerencias(input) {
        activo = input;
        var q = input.value.trim(), lista = buscar(q, input.dataset.buscar);
        input.closest('.buscador').appendChild(caja);
        if (!q) return cerrarSugerencias();
        marcada = -1;
        // Coordenadas (6.2751N 75.5737W): el mapa busca el lote que contiene ese punto
        var c = input.id === 'ir-mapa' && window.leerCoordenadas(q);
        if (c) {
            caja.innerHTML = '<button type="button" data-ll="' + c.lat + ',' + c.lng + '"><span class="s-ir">Ver en mapa ›</span><span class="s-mr">📍 Ubicar el lote en ' +
                c.lat.toFixed(5) + ', ' + c.lng.toFixed(5) + '</span></button>';
            caja.hidden = false;
            return;
        }
        caja.innerHTML = lista.length ? lista.map(function (x) {
            return '<button type="button" data-mr="' + esc(x.mr) + '" data-lote="' + esc(x.lote) + '">' +
                (input.id === 'ir-mapa' ? '<span class="s-ir">Ver en mapa ›</span><span class="s-pre" data-pre="' + esc(x.lote || x.mr) + '" data-cuad="' + esc(x.cuad) + '">➕ Pre-ruta</span>' : '') +
                '<span class="s-mr">' + resaltar(x.mr, q) +
                '<small>' + (x.lote ? 'Lote ' + resaltar(x.lote, q) : 'Sin lote') + (x.cuad ? ' · C' + esc(x.cuad) : '') + '</small></span>' +
                (x.d ? '<span class="s-dir">' + resaltar(x.d, q) + '</span>' : '') + '</button>';
        }).join('') : '<div class="s-vacio">' + (input.id === 'ir-mapa' ? 'Sin coincidencias. Pulse Ir/Enter para buscarlo igual en el mapa.' : 'Sin coincidencias. Puede escribirla igual y guardar.') + '</div>';
        caja.hidden = false;
        caja.scrollTop = 0;
    }
    // Un lote que no está dibujado con su número en la capa (p. ej. 287) se busca por su microrruta
    function enMapaPorLote(lote) { return lote && lote !== 'NA' && !!CENTROS[lote]; }
    function urlMapa(mr, lote) { return 'mapa_rapido.html?' + (enMapaPorLote(lote) || !mr ? 'lote=' + encodeURIComponent(lote) : 'mr=' + encodeURIComponent(mr)); }
    function elegir(mr, lote) {
        if (activo && activo.id === 'ir-mapa') { location.href = urlMapa(mr, lote); return; }
        var mrEl = form.querySelector('[data-campo="MICRORRUTA"]');
        mrEl.value = mr;
        completar(mr);
        cerrarSugerencias();
        actualizarLimpiar();
        if (activo) activo.blur(); // cierra el teclado del celular
    }
    function actualizarLimpiar() { form.querySelector('[data-limpiar]').hidden = !form.querySelector('[data-campo="MICRORRUTA"]').value; }
    // pointerdown + preventDefault: el toque no le quita el foco al campo antes de elegir
    caja.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
    caja.addEventListener('click', function (ev) {
        var pre = ev.target.closest('[data-pre]');
        if (pre) { cerrarSugerencias(); if (activo) activo.blur(); return prerutaCon([pre.dataset.pre], pre.dataset.cuad); }
        var ll = ev.target.closest('[data-ll]');
        if (ll) { location.href = 'mapa_rapido.html?ll=' + ll.dataset.ll; return; }
        var b = ev.target.closest('[data-mr]'); if (b) elegir(b.dataset.mr, b.dataset.lote);
    });
    document.querySelectorAll('[data-buscar]').forEach(function (input) {
        input.addEventListener('input', function () { mostrarSugerencias(input); actualizarLimpiar(); });
        input.addEventListener('focus', function () { if (input.value.trim()) mostrarSugerencias(input); });
        input.addEventListener('blur', function () { setTimeout(cerrarSugerencias, 150); });
        input.addEventListener('keydown', function (ev) {
            var bs = caja.hidden ? [] : caja.querySelectorAll('[data-mr]');
            if (ev.key === 'Escape' && !caja.hidden) { ev.preventDefault(); ev.stopPropagation(); return cerrarSugerencias(); }
            var c = ev.key === 'Enter' && input.id === 'ir-mapa' && window.leerCoordenadas(input.value);
            if (c) { ev.preventDefault(); location.href = 'mapa_rapido.html?ll=' + c.lat + ',' + c.lng; return; }
            if (!bs.length) {
                // Sin sugerencias: desde "Ir al mapa" igual se busca lo escrito (número = lote, texto = microrruta)
                var v = input.value.trim();
                if (ev.key === 'Enter' && input.id === 'ir-mapa' && v) location.href = /^\d+$/.test(v) ? urlMapa('', v) : urlMapa(v.toUpperCase().replace(/\s+/g, ''), '');
                return;
            }
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                ev.preventDefault();
                marcada = (marcada + (ev.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length;
                bs.forEach(function (b, i) { b.classList.toggle('activa', i === marcada); });
                bs[marcada].scrollIntoView({ block: 'nearest' });
            } else if (ev.key === 'Enter') {
                ev.preventDefault(); // no enviar el formulario al buscar
                var b = bs[marcada === -1 ? 0 : marcada];
                elegir(b.dataset.mr, b.dataset.lote);
            }
        });
    });
    form.querySelector('[data-limpiar]').onclick = function () {
        ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'ZONA', 'CUADRILLA'].forEach(function (c) { form.querySelector('[data-campo="' + c + '"]').value = ''; });
        mostrarDireccion();
        actualizarLimpiar();
        form.querySelector('[data-campo="MICRORRUTA"]').focus();
    };
    dlg.addEventListener('close', cerrarSugerencias);

    function completar(mr) {
        var p = LOTES[mr];
        if (!p) return;
        var poner = function (c, v) { var el = form.querySelector('[data-campo="' + c + '"]'); if (v != null && v !== '') el.value = v; };
        poner('MICRORRUTA', mr);
        poner('LOTE', p.lote);
        poner('CUADRILLA', p.cuad);
        if (p.area) poner('ÁREA M2', Number(p.area).toLocaleString('es-CO'));
        var z = mr.match(/^Z(\d+)/i);
        if (z) poner('ZONA', z[1]);
        mostrarDireccion();
    }
    form.querySelector('[data-campo="MICRORRUTA"]').addEventListener('change', function () { completar(this.value.trim().toUpperCase()); });
    form.querySelector('[data-campo="LOTE"]').addEventListener('change', function () {
        var mrEl = form.querySelector('[data-campo="MICRORRUTA"]');
        if (!mrEl.value && mrPorLote[this.value.trim()]) completar(mrPorLote[this.value.trim()]);
        else mostrarReciente();
    });

    // Desde el mapa: subsanaciones.html?mr=Z2CC0067&lote=264
    var desdeUrlHecho = false;
    // final = datos ya leídos de la hoja (no solo los guardados en el celular)
    function abrirDesdeUrl(final) {
        if (desdeUrlHecho) return;
        var q = new URLSearchParams(location.search), mr = q.get('mr') || '', lote = q.get('lote') || '', ver = q.get('ver') || '', sub = q.get('subsanar') || '', pre = q.get('preruta') || '';
        var buscada = function (id) { return registros.filter(function (r) { return r.ID === id; })[0]; };
        // Visita que aún no está en lo guardado en el celular: se espera a la hoja
        if ((ver || sub) && !final && !buscada(ver || sub)) return;
        desdeUrlHecho = true;
        if (!mr && !lote && !ver && !sub && !pre) return;
        // Se usa una sola vez: si el celular recarga la pestaña o vuelve a ella, muestra la lista y no el formulario
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
        // Desde el mapa: subsanaciones.html?preruta=400,532&cuad=2 abre "Crear pre-ruta" con esos lotes ya puestos
        if (pre) return prerutaCon(pre.split(','), q.get('cuad'));
        // Desde el mapa: subsanaciones.html?subsanar=SUB-00042 abre esa visita con los ítems en NO pasados a SI
        if (sub) {
            var rs = buscada(sub);
            if (!rs) return toast('No se encontró la visita ' + sub + '. Puede que la hayan eliminado.');
            if (rs.ESTADO === 'PENDIENTE') return subsanar(rs);
            toast('La visita ' + sub + ' ya está ' + rs.ESTADO + '.');
            ver = sub;
        }
        // Desde la ficha del mapa: subsanaciones.html?ver=SUB-00042 muestra esa visita con los detalles abiertos
        if (ver) {
            if (!registros.some(function (r) { return r.ID === ver; })) return toast('No se encontró la visita ' + ver + '. Puede que la hayan eliminado.');
            $('f-texto').value = ver;
            abiertos[ver] = true;
            pintar();
            $('tabla').scrollIntoView({ behavior: 'smooth', block: 'start' });
            return toast('Visita ' + ver + '. Borre la búsqueda para ver todas.');
        }
        $('f-texto').value = mr || lote;
        pintar();
        // Si el lote está en los lotes a revisar, llega con los datos de esa parada (cuadrilla, fecha de ejecución)
        var enRuta = paradaDe(mr, lote);
        if (enRuta) registrarParada(enRuta.ri, enRuta.id);
        else {
            abrir({ MICRORRUTA: mr, LOTE: lote });
            if (mr) completar(mr); else if (mrPorLote[lote]) completar(mrPorLote[lote]);
        }
        // Al cerrar el formulario se quita el filtro de ese lote y queda la lista completa
        dlg.addEventListener('close', function () { if ($('f-texto').value === (mr || lote)) { $('f-texto').value = ''; pintar(); } }, { once: true });
    }

    // ---------- Pre-ruta: lotes que mandan a revisar (se guarda en la base, la misma en todos los equipos del usuario) ----------
    var CENTROS = window.centrosLotes || {};
    // Una ruta por cuadrilla: { cuad, paradas: [{ id, fecha (ejecución), creada (día), carga (aaaa-mm-ddTHH:MM:SS), encurso }] }
    // encurso: desde cuándo la cuadrilla está trabajando en ese lote ("inicia labores en el lote ..."); aún no se revisa
    // sinfotos: motivo por el que no se le pueden tomar fotos ("Orden público"), según el mensaje de la cuadrilla
    var rutas = [], posicion = null;
    // Orden de cada pre-ruta en este celular: 'llegada' (como llegaron los mensajes) o cercanía (por defecto)
    var modos;
    try { modos = JSON.parse(localStorage.getItem('subsanaciones_modos')) || {}; } catch (e) { modos = {}; }
    function porLlegada(ruta) { return modos[ruta.cuad || ''] === 'llegada'; }
    function guardarModos() { try { localStorage.setItem('subsanaciones_modos', JSON.stringify(modos)); } catch (e) {} }
    function claveCarga(p) { return p.carga || (p.creada ? p.creada + 'T00:00:00' : ''); }
    // modoHoja: el Apps Script ya tiene la pestaña "Rutas" y la pre-ruta se comparte entre celulares.
    // Sin eso (script viejo o sin conexión) se trabaja solo con la copia de este celular.
    var modoHoja = false;
    function guardarRutas() { try { localStorage.setItem('subsanaciones_rutas', JSON.stringify(rutas)); } catch (e) {} }
    // Cambios hechos en este equipo a cada cuadrilla: { cuad: { t, filas, paradas, pendiente } }. Una lectura de la base
    // que salió antes del cambio no lo deshace; pendiente = aún no está en la base (se sube al llegar la lectura o al reintentar).
    var cambiosRuta = {};
    function subirRuta(ruta) {
        if (!modoHoja) return;
        var llegada = porLlegada(ruta);
        var paradas = ruta.paradas.map(function (p) {
            return { lote: p.id, fecha: aTexto(p.fecha), cargada: textoCarga(p.carga) || aTexto(p.creada), encurso: textoCarga(p.encurso), sinfotos: p.sinfotos || '',
                despues: !!p.despues, llegada: llegada };
        });
        var filas = paradas.map(function (p, n) {
            return { cuadrilla: ruta.cuad, lote: p.lote, fecha: p.fecha, orden: String(n + 1), cargada: p.cargada, encurso: p.encurso, sinfotos: p.sinfotos,
                despues: p.despues, llegada: llegada };
        });
        // La copia del equipo queda igual de una vez: al recargar no reaparecen los lotes quitados
        ultimasRutas = (ultimasRutas || []).filter(function (r) { return r.cuadrilla !== ruta.cuad; }).concat(filas);
        guardarCache();
        // Antes de que llegue la base, lo de este equipo puede estar viejo: el cambio espera y se sube encima de lo leído
        cambiosRuta[ruta.cuad] = { t: Date.now(), filas: filas, paradas: paradas, pendiente: !rutasAlDia };
        if (rutasAlDia) mandarRuta(ruta.cuad);
    }
    function mandarRuta(cuad) {
        var c = cambiosRuta[cuad];
        c.pendiente = false;
        enviar('guardar_ruta', { cuadrilla: cuad, paradas: c.paradas }).catch(function (err) {
            if (cambiosRuta[cuad] === c) c.pendiente = true;
            toast('La pre-ruta quedó en este equipo pero no en la base de datos: ' + err.message + '. Se vuelve a intentar al actualizar.');
        });
    }
    function subirPendientes() { Object.keys(cambiosRuta).forEach(function (c) { if (cambiosRuta[c].pendiente) mandarRuta(c); }); }
    // desdeCache: copia guardada en el celular mientras llega la hoja; no sube nada a la hoja
    function rutasDeHoja(lista, desdeCache) {
        modoHoja = true;
        var locales = rutas;
        // La primera vez, lo que estaba solo en este celular se sube a la hoja (una sola vez, para no revivir rutas que otro quitó)
        var migrar = false;
        if (!desdeCache) try { migrar = !localStorage.getItem('subsanaciones_rutas_en_hoja'); localStorage.setItem('subsanaciones_rutas_en_hoja', '1'); } catch (e) {}
        rutas = [];
        // Paradas cuya marca «Para después» viene de la base; sin la migración 0019 se conserva la de este equipo
        var conDespues = {};
        lista.slice().sort(function (a, b) {
            return a.cuadrilla.localeCompare(b.cuadrilla, 'es', { numeric: true }) || (Number(a.orden) || 1e9) - (Number(b.orden) || 1e9);
        }).forEach(function (r) {
            var id = /^\d+$/.test(r.lote) ? String(+r.lote) : r.lote;
            var n = { id: id, fecha: aInput(r.fecha), creada: aInput(r.cargada) || hoy(), carga: cargaDeTexto(r.cargada) };
            if (r.encurso !== undefined) n.encurso = cargaDeTexto(r.encurso);
            if (r.sinfotos !== undefined) n.sinfotos = r.sinfotos;
            if (r.despues) n.despues = true;
            if (r.despues !== undefined) conDespues[r.cuadrilla + '|' + id] = true;
            agregarParadas(r.cuadrilla, [n]);
            // Orden «por llegada» guardado en la base (migración 0019): igual en todos los equipos
            if (r.llegada !== undefined) { if (r.llegada) modos[r.cuadrilla] = 'llegada'; else delete modos[r.cuadrilla]; }
        });
        guardarModos();
        // Un Apps Script sin actualizar no trae la columna EN CURSO: se usa la de este celular
        var hojaConCurso = lista.some(function (r) { return r.encurso !== undefined; });
        // Sin la columna SIN FOTOS en la base (migración 0008 sin correr) se conserva la marca de este celular
        var hojaConSinFotos = lista.some(function (r) { return r.sinfotos !== undefined; });
        // Lo que la base todavía no guarda (columnas de migraciones sin correr) se conserva de este equipo
        locales.forEach(function (l) {
            var ruta = rutas.find(function (r) { return r.cuad === l.cuad; });
            if (ruta) l.paradas.forEach(function (p) {
                var q = ruta.paradas.find(function (x) { return x.id === p.id; });
                if (!q) return;
                if (p.despues && !conDespues[l.cuad + '|' + p.id]) q.despues = true;
                if (!hojaConCurso && p.encurso) q.encurso = p.encurso;
                if (!hojaConSinFotos && p.sinfotos) q.sinfotos = p.sinfotos;
                // Filas viejas de la hoja solo tienen el día: se conserva la hora que sabe este celular
                if (p.carga && p.carga.slice(0, 10) === claveCarga(q).slice(0, 10) && /T00:00:00$/.test(claveCarga(q))) q.carga = p.carga;
            });
        });
        if (migrar) locales.forEach(function (l) {
            var ruta = agregarParadas(l.cuad, l.paradas);
            ordenar(ruta, posicion);
            subirRuta(ruta);
        });
        // Lotes escritos a mano en la hoja (sin ORDEN): se ordenan por cercanía y se guarda el orden
        var sinOrden = {};
        lista.forEach(function (r) { if (!r.orden) sinOrden[r.cuadrilla] = true; });
        if (!desdeCache) rutas.forEach(function (ruta) { if (sinOrden[ruta.cuad]) { ordenar(ruta, posicion); subirRuta(ruta); } });
        repartirSinCuadrilla(!desdeCache);
        quitarDuplicados(!desdeCache);
        guardarRutas();
    }
    // Un lote no puede estar en dos tarjetas: queda en la de la ejecución más reciente (si empatan, la última cargada)
    function quitarDuplicados(subir) {
        var mejor = {}, tocadas = [];
        rutas.forEach(function (r) {
            r.paradas.forEach(function (p) {
                var m = mejor[p.id];
                if (!m || (p.fecha || '') > (m.p.fecha || '') || ((p.fecha || '') === (m.p.fecha || '') && claveCarga(p) > claveCarga(m.p))) mejor[p.id] = { r: r, p: p };
            });
        });
        rutas.forEach(function (r) {
            var antes = r.paradas.length;
            r.paradas = r.paradas.filter(function (p) { return mejor[p.id].p === p; });
            if (r.paradas.length !== antes) tocadas.push(r);
        });
        if (!tocadas.length) return;
        rutas = rutas.filter(function (r) { return r.paradas.length; });
        if (subir) tocadas.forEach(subirRuta);
    }
    function agregarParadas(cuad, nuevas) {
        var ruta = rutas.find(function (r) { return r.cuad === cuad; });
        if (!ruta) { ruta = { cuad: cuad, paradas: [] }; rutas.push(ruta); }
        nuevas.forEach(function (n) {
            var ya = ruta.paradas.find(function (p) { return p.id === n.id; });
            if (ya) {
                // El mismo lote ejecutado de nuevo: se revisa la ejecución más reciente (o la que se eligió: fechaElegida)
                if (n.fechaElegida) ya.fecha = n.fecha;
                else if (n.fecha && (!ya.fecha || n.fecha > ya.fecha)) ya.fecha = n.fecha;
                ya.creada = n.creada; ya.carga = n.carga || ya.carga;
                if (n.encurso !== undefined) ya.encurso = n.encurso;
                if (n.sinfotos !== undefined) ya.sinfotos = n.sinfotos;
            } else { delete n.fechaElegida; ruta.paradas.push(n); }
        });
        // Cuadrillas en orden numérico; las sin cuadrilla al final
        rutas.sort(function (a, b) { return (a.cuad ? 0 : 1) - (b.cuad ? 0 : 1) || a.cuad.localeCompare(b.cuad, 'es', { numeric: true }); });
        return ruta;
    }
    // Cuadrilla del lote en la programación ('' si no está)
    function cuadDe(id) { return String(infoLote(String(id)).cuad || '').replace(/^C\s*/i, ''); }
    // Pre-ruta sin cuadrilla: cada lote pasa a la tarjeta de la cuadrilla que lo tiene en la programación, con su fecha
    // de ejecución. Solo se quedan sin cuadrilla los que no están en la programación. subir: guarda el cambio en la base.
    function repartirSinCuadrilla(subir) {
        var sin = rutas.find(function (r) { return !r.cuad; });
        if (!sin) return;
        var tocadas = [];
        sin.paradas = sin.paradas.filter(function (p) {
            var c = cuadDe(p.id);
            if (!c) return true;
            var ruta = agregarParadas(c, [p]);
            if (tocadas.indexOf(ruta) === -1) tocadas.push(ruta);
            return false;
        });
        if (!tocadas.length) return;
        if (!sin.paradas.length) rutas.splice(rutas.indexOf(sin), 1);
        tocadas.forEach(function (r) { ordenar(r, posicion); if (subir) subirRuta(r); });
        if (subir) subirRuta(sin);
        guardarRutas();
    }

    function parsearMensaje(texto) { return leerMensaje(texto, LOTES); }
    // id = número de lote, o la microrruta cuando no tiene lote
    function infoLote(id) {
        var mr = LOTES[id] ? id : mrPorLote[id] || '', p = LOTES[mr] || {};
        return { id: id, mr: mr, lote: LOTES[id] ? '' : id, cuad: p.cuad || '', d: p.d || '', c: CENTROS[id] || null };
    }
    // Descripción y frecuencia de la programación, y la última visita registrada de ese lote
    function fichaLote(x) {
        var p = LOTES[x.mr] || {}, html = '';
        if (p.frec || p.area) html += '<br>' + (p.frec ? 'Frecuencia ' + esc(p.frec) : '') + (p.frec && p.area ? ' · ' : '') + (p.area ? esc(Number(p.area).toLocaleString('es-CO')) + ' m²' : '');
        if (p.desc) html += '<div class="desc" data-desc title="Toque para ver completa">' + esc(p.desc) + '</div>';
        var previas = registros.filter(function (r) {
            if (!deLote(r)) return false;
            return x.lote ? String(r.LOTE || '').trim() === x.lote : String(r.MICRORRUTA || '').trim().toUpperCase() === x.mr;
        });
        if (!previas.length) return html + '<div class="historial">Sin visitas anteriores registradas.</div>';
        var u = previas[0], enNo = itemsEnNo(u);
        html += '<div class="historial">Última visita: <b style="font-size:13px">' + esc(u['FECHA DE LA VISITA'] || '—') + '</b> ' + badge(u.ESTADO) +
            (u.INTERVENTOR ? ' · ' + esc(u.INTERVENTOR) : '') + (previas.length > 1 ? ' · ' + previas.length + ' visitas en total' : '') +
            (enNo.length ? '<br>Ítems en NO: ' + enNo.map(esc).join(', ') : '') +
            (u['OBSERVACIONES NOVEDADES'] && norm(u['OBSERVACIONES NOVEDADES']) !== 'SIN NOVEDAD' ? '<br>Observaciones: ' + esc(u['OBSERVACIONES NOVEDADES']) : '') +
            (u.ESTADO === 'PENDIENTE' ? '<br><button type="button" class="secundario pequeno" data-abrir-visita="' + esc(u.ID) + '">Abrir esa visita para subsanarla</button>' : '') +
            '</div>';
        return html;
    }
    $('dlg-contexto').addEventListener('click', function (ev) {
        var d = ev.target.closest('[data-desc]');
        if (d) return d.classList.toggle('abierta');
        var b = ev.target.closest('[data-abrir-visita]');
        if (b) subsanar(registros.find(function (r) { return r.ID === b.dataset.abrirVisita; }));
    });
    function visitaDe(p, x) {
        // Una visita durante la operación no revisa el lote terminado: la parada sigue pendiente
        return registros.find(function (r) {
            if (!deLote(r)) return false;
            var mismo = x.lote ? String(r.LOTE || '').trim() === x.lote : String(r.MICRORRUTA || '').trim().toUpperCase() === x.mr;
            return mismo && ((p.fecha && aInput(r['FECHA DE EJECUCIÓN']) === p.fecha) || aInput(r['FECHA DE LA VISITA']) >= p.creada);
        });
    }
    // Distancia entre dos lotes = la de sus partes más cercanas (puntos repartidos por los lotes largos;
    // los demás usan su centro). desde puede ser [lat, lon] (su ubicación) o un id de lote.
    var PUNTOS = window.puntosLotes || {};
    function puntosDe(id) { return PUNTOS[id] || (CENTROS[id] ? [CENTROS[id]] : []); }
    function distLotes(a, b) {
        var pa = typeof a === 'string' ? puntosDe(a) : [a], pb = typeof b === 'string' ? puntosDe(b) : [b], min = Infinity;
        pa.forEach(function (x) { pb.forEach(function (y) { var d = metros(x, y); if (d < min) min = d; }); });
        return min;
    }
    // Google Maps desde donde está usted (origin) hasta la parte del lote más cercana a usted.
    // Lote sin coordenadas: se busca por su dirección. Sin ubicación, Maps usa la del celular.
    function destinoLote(id) {
        var ps = puntosDe(String(id));
        if (!ps.length) return null;
        if (!posicion) return CENTROS[id] || ps[0];
        return ps.reduce(function (a, p) { return metros(posicion, p) < metros(posicion, a) ? p : a; });
    }
    function urlIr(id, dir) {
        var c = destinoLote(id), origen = origenMaps() ? '&origin=' + origenMaps() : '';
        var dest = c ? c[0] + ',' + c[1] : dir ? encodeURIComponent(dir + ', Medellín, Antioquia') : '';
        return dest ? 'https://www.google.com/maps/dir/?api=1' + origen + '&destination=' + dest + '&travelmode=driving' : '';
    }
    // Ruta con las próximas paradas, también desde donde está usted
    function urlRuta(proximas) {
        if (!proximas.length) return '';
        var c = function (x) { var d = destinoLote(x.id); return d[0] + ',' + d[1]; };
        return 'https://www.google.com/maps/dir/?api=1' + (origenMaps() ? '&origin=' + origenMaps() : '') +
            '&destination=' + c(proximas[proximas.length - 1]) +
            (proximas.length > 1 ? '&waypoints=' + encodeURIComponent(proximas.slice(0, -1).map(c).join('|')) : '') + '&travelmode=driving';
    }

    // Ruta completa: los lotes listos para revisar de todas las pre-rutas en un solo recorrido corto desde usted.
    // Un lote que está en dos pre-rutas va una sola vez. Google Maps en el celular admite 3 paradas + destino,
    // así que el recorrido se parte en tramos de TRAMO lotes; cada tramo sale del último lote del anterior.
    // El tamaño del tramo se elige en la tarjeta y queda guardado en este dispositivo.
    var TRAMOS = [3, 4, 6, 8, 10], TRAMO = 6;
    try { if (TRAMOS.indexOf(+localStorage.getItem('subsanaciones_tramo')) !== -1) TRAMO = +localStorage.getItem('subsanaciones_tramo'); } catch (e) {}
    // Todas las cuadrillas: entra cada lote pendiente; los que no tienen coordenadas van al final y Maps los busca por
    // su dirección. Solo quedan fuera los que la cuadrilla aún ejecuta (se cuentan aparte).
    function rutaCompleta() {
        var porId = {}, lista = [], curso = [];
        rutas.forEach(function (ruta) {
            ruta.paradas.forEach(function (p) {
                var x = infoLote(p.id), cuad = ruta.cuad || 'pre-ruta';
                if (visitaDe(p, x)) return;
                if (porId[x.id]) { if (porId[x.id].cuads.indexOf(cuad) === -1) porId[x.id].cuads.push(cuad); return; }
                x.cuads = [cuad]; x.despues = p.despues; x.encurso = p.encurso;
                porId[x.id] = x;
                (p.encurso ? curso : lista).push(x);
            });
        });
        var conC = function (x) { return puntosDe(String(x.id)).length; };
        // Los dejados "para después" en su pre-ruta van al final también aquí
        var orden = recorridoCorto(lista.filter(function (x) { return conC(x) && !x.despues; }), posicion)
            .concat(recorridoCorto(lista.filter(function (x) { return conC(x) && x.despues; }), null),
                lista.filter(function (x) { return !conC(x) && x.d; }));
        orden.sinUbic = lista.filter(function (x) { return !conC(x) && !x.d; });
        orden.curso = curso;
        return orden;
    }
    function tramosDe(orden) {
        var t = [];
        for (var i = 0; i < orden.length; i += TRAMO) t.push(orden.slice(i, i + TRAMO));
        return t;
    }
    // Punto del lote para Maps: coordenadas o, si no tiene, su dirección
    function puntoMaps(x) {
        var d = destinoLote(x.id);
        return d ? d[0] + ',' + d[1] : encodeURIComponent(x.d + ', Medellín, Antioquia');
    }
    function urlTramo(tramos, k) {
        var t = tramos[k], antes = k ? tramos[k - 1] : null;
        var origen = antes ? puntoMaps(antes[antes.length - 1]) : origenMaps();
        return 'https://www.google.com/maps/dir/?api=1' + (origen ? '&origin=' + origen : '') + '&destination=' + puntoMaps(t[t.length - 1]) +
            (t.length > 1 ? '&waypoints=' + t.slice(0, -1).map(puntoMaps).join('%7C') : '') + '&travelmode=driving';
    }
    function pintarRutaCompleta() {
        if (rutas.length < 2) return '';
        var orden = rutaCompleta();
        if (orden.length < 2) return '';
        var tramos = tramosDe(orden), total = 0, prev = posicion;
        orden.forEach(function (x) { if (!puntosDe(String(x.id)).length) return; if (prev) total += distLotes(prev, String(x.id)); prev = String(x.id); });

        var nombre = function (x) { return x.lote ? 'Lote ' + x.lote : x.mr || x.id; };
        var idMapa = function (x) { return enMapaPorLote(x.lote) || !x.mr ? x.lote : x.mr; };
        var plegada = !abiertas['*todas'];
        var cuads = function (x) { return x.cuads.map(function (c) { return c === 'pre-ruta' ? 'Sin cuadrilla' : 'C' + c; }).join(', '); };
        var todos = orden.length + orden.sinUbic.length + orden.curso.length;
        return '<div class="ruta-card ruta-completa' + (plegada ? ' plegada' : '') + '">' +
            '<div class="ruta-cab">' +
                '<button type="button" class="ruta-plegar" data-ruta="plegar-todas" aria-expanded="' + !plegada + '" aria-label="Plegar o desplegar">▾</button>' +
                '<div data-ruta="plegar-todas"><b>🗺 Ruta completa</b> <span class="sub">· ' + todos + ' lotes pendientes de ' +
                    rutas.map(function (r) { return r.cuad ? 'C' + r.cuad : 'sin cuadrilla'; }).join(', ') + '</span>' +
                '<div class="sub">' + orden.length + ' en un solo recorrido' + (total ? ' · ~' + textoDist(total) : '') +
                    (tramos.length > 1 ? ' · ' + tramos.length + ' tramos en Google Maps' : '') + '</div>' +
                (orden.curso.length ? '<div class="sub">▶ ' + (orden.curso.length === 1 ? '1 lote sigue' : orden.curso.length + ' lotes siguen') + ' en ejecución (entran cuando la cuadrilla termine)</div>' : '') +
                (orden.sinUbic.length ? '<div class="sub">' + orden.sinUbic.length + ' sin ubicación ni dirección</div>' : '') +
                '</div></div>' +
            '<div class="ruta-acciones">' +
                tramos.map(function (t, k) {
                    var desde = k * TRAMO + 1, hasta = desde + t.length - 1;
                    return '<a class="boton ' + (k ? 'secundario' : 'primario') + ' pequeno" target="_blank" rel="noopener" data-ir-tramo="' + k + '" href="' + esc(urlTramo(tramos, k)) + '">' +
                        (tramos.length > 1 ? 'Tramo ' + (k + 1) + ' · ' + (desde === hasta ? 'lote ' + desde : desde + '–' + hasta) : 'Ruta completa en Google Maps') + '</a>';
                }).join('') +
                '<a class="boton secundario pequeno" href="' + esc('mapa_rapido.html?lote=' + orden.map(idMapa).join(',')) + '">Ver todos en el mapa</a>' +
                '<label class="tramo-sel">Lotes por tramo <select data-tramo>' + TRAMOS.map(function (n) {
                    return '<option value="' + n + '"' + (n === TRAMO ? ' selected' : '') + '>' + n + '</option>';
                }).join('') + '</select></label>' +
            '</div>' +
            '<ol class="paradas">' + orden.map(function (x, i) {
                return '<li class="parada' + (i ? '' : ' siguiente') + (i && i % TRAMO === 0 ? ' corte' : '') + '">' +
                    '<span class="n">' + (i + 1) + '</span>' +
                    '<div class="info"><div class="titulo"><b>' + esc(nombre(x)) + '</b>' + (x.lote && x.mr ? ' <span class="sub">' + esc(x.mr) + '</span>' : '') +
                        ' <span class="sub">· ' + esc(cuads(x)) + '</span>' +
                        (x.despues ? ' <span class="tag-despues">Para después</span>' : '') + '</div>' +
                        (x.d ? '<div class="sub dir">' + esc(x.d) + '</div>' : '') +
                        (puntosDe(String(x.id)).length ? '' : '<div class="sub alerta">Sin coordenadas: Google Maps lo busca por la dirección</div>') + '</div>' +
                    '<div class="btns"><a class="boton secundario pequeno" target="_blank" rel="noopener" data-ir="' + esc(x.id) + '" href="' + esc(urlIr(x.id, x.d)) + '">🧭 Cómo llegar</a></div>' +
                '</li>';
            }).join('') + orden.sinUbic.map(function (x) {
                return '<li class="parada"><span class="n">–</span><div class="info"><div class="titulo"><b>' + esc(nombre(x)) + '</b>' +
                    ' <span class="sub">· ' + esc(cuads(x)) + '</span></div>' +
                    '<div class="sub alerta">Sin ubicación ni dirección: no entra en la ruta de Google Maps</div></div></li>';
            }).join('') + orden.curso.map(function (x) {
                return '<li class="parada encurso"><span class="n">▶</span><div class="info"><div class="titulo"><b>' + esc(nombre(x)) + '</b>' +
                    (x.lote && x.mr ? ' <span class="sub">' + esc(x.mr) + '</span>' : '') + ' <span class="sub">· ' + esc(cuads(x)) + '</span>' +
                    ' <span class="tag-curso">▶ Cuadrilla trabajando aquí</span></div>' +
                    (x.d ? '<div class="sub dir">' + esc(x.d) + '</div>' : '') + '</div></li>';
            }).join('') + '</ol></div>';
    }

    // Ubicación seguida mientras la página está abierta: así la pre-ruta siempre sabe en qué lote (o cerca de cuál) está
    // el interventor y cada parada dice a qué distancia queda de usted. Solo repinta al moverse unos metros.
    var precision = 0, estadoUbic = '', vigia = null, pintadaEn = null, gps = null;
    var AQUI_M = 60; // dentro de esta distancia de alguna parte del lote se considera "en el lote"

    // Ubicación fijada: al registrar la visita de una parada (o con "📍 Estoy aquí") ese lote queda como su ubicación,
    // así "Cómo llegar", las distancias y el orden salen de ahí aunque el GPS del celular esté corrido.
    // Se suelta cuando el GPS, ya preciso, lo ubica lejos de ese lote, o a las 2 horas. El mapa rápido usa la misma.
    var FIJADA = 'ubicacion_fijada', FIJADA_MS = 2 * 3600 * 1000, fijada = null;
    try { fijada = JSON.parse(localStorage.getItem(FIJADA)); } catch (e) {}
    if (!fijada || !(Date.now() - fijada.hora < FIJADA_MS)) fijada = null;
    function fijar(id) {
        if (!id) return;
        var x = infoLote(String(id)), p = CENTROS[x.id] || puntosDe(String(x.id))[0] || null;
        if (!p && !x.d) return;
        fijada = { id: String(x.id), nombre: x.lote ? 'Lote ' + x.lote : x.mr, p: p, d: x.d, hora: Date.now() };
        try { localStorage.setItem(FIJADA, JSON.stringify(fijada)); } catch (e) {}
        usarFijada();
    }
    function soltar() {
        fijada = null;
        try { localStorage.removeItem(FIJADA); } catch (e) {}
        usarFijada();
    }
    function usarFijada() { posicion = fijada && fijada.p ? fijada.p : gps; }
    usarFijada();
    // Origen para Google Maps: el lote fijado (o su dirección si no tiene coordenadas), si no el GPS
    function origenMaps() {
        if (fijada) return fijada.p ? fijada.p[0].toFixed(6) + ',' + fijada.p[1].toFixed(6) : encodeURIComponent(fijada.d + ', Medellín, Antioquia');
        return posicion ? posicion[0].toFixed(6) + ',' + posicion[1].toFixed(6) : '';
    }
    // Por defecto cada pre-ruta se ordena desde su ubicación en cuanto el GPS la encuentra (salvo las que están "por llegada"),
    // una vez por visita a la página. Se espera a tener la pre-ruta de la base: ordenar la copia vieja del equipo y subirla
    // pisaba en la base lo que se había hecho desde el otro equipo.
    var ordenadaConGps = false;
    function ordenarConGps() {
        if (ordenadaConGps || !rutasAlDia || estadoUbic !== 'ok') return;
        ordenadaConGps = true;
        rutas.forEach(function (ruta) { if (!porLlegada(ruta)) { ordenar(ruta, posicion); subirRuta(ruta); } });
        guardarRutas();
    }
    function seguirUbicacion() {
        if (vigia !== null || !navigator.geolocation) { if (!navigator.geolocation) estadoUbic = 'sin'; return; }
        estadoUbic = 'buscando';
        vigia = navigator.geolocation.watchPosition(function (p) {
            gps = [p.coords.latitude, p.coords.longitude];
            precision = p.coords.accuracy || 0;
            // Con el GPS preciso (≤ 30 m) a más de 150 m del lote fijado, usted ya se fue de ahí
            if (fijada && precision <= 30 && (fijada.p ? distLotes(gps, puntosDe(fijada.id).length ? fijada.id : fijada.p) : Infinity) > 150) { soltar(); }
            usarFijada();
            var antes = estadoUbic; estadoUbic = 'ok';
            if (antes !== 'ok') ordenarConGps();
            if (antes !== 'ok' || !pintadaEn || metros(pintadaEn, posicion) > 25) pintarRutas();
        }, function (err) {
            if (err.code === 1) { estadoUbic = 'negada'; navigator.geolocation.clearWatch(vigia); }
            else if (!posicion) estadoUbic = 'sin';
            pintarRutas();
        }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
    }

    // Pendientes primero (en el recorrido más corto, o como fueron llegando si la pre-ruta está "por llegada");
    // luego los dejados para después, los sin ubicación, los que la cuadrilla aún está ejecutando y al final los ya revisados
    function ordenar(ruta, desde) {
        var pend = [], despues = [], hechos = [], sinC = [], curso = [], llegada = porLlegada(ruta);
        ruta.paradas.forEach(function (p) {
            var x = infoLote(p.id);
            (visitaDe(p, x) ? hechos : p.encurso ? curso : p.despues ? despues : x.c || llegada ? pend : sinC).push(p);
        });
        pend = llegada ? pend.slice().sort(function (a, b) { return claveCarga(a).localeCompare(claveCarga(b)); }) : recorridoCorto(pend, desde);
        ruta.paradas = pend.concat(despues, sinC, curso, hechos);
    }
    // "Después": pasa la parada al final de las pendientes; "Hacer ahora": la vuelve la siguiente
    function aplazar(ruta, id, si) {
        var n = ruta.paradas.findIndex(function (p) { return p.id === id; });
        if (n === -1) return;
        var p = ruta.paradas.splice(n, 1)[0];
        if (si) p.despues = true; else delete p.despues;
        var pendiente = function (q) { return !visitaDe(q, infoLote(q.id)); };
        var k = si ? ruta.paradas.reduce(function (u, q, i) { return pendiente(q) ? i + 1 : u; }, 0)
                   : Math.max(0, ruta.paradas.findIndex(pendiente));
        ruta.paradas.splice(k, 0, p);
    }
    function recorridoCorto(ps, desde) { return recorrer(ps, desde, distLotes); }
    // Carga lo guardado; el formato anterior (una ruta por mensaje) se junta por cuadrilla y se reordena
    (function () {
        var guardadas;
        try { guardadas = JSON.parse(localStorage.getItem('subsanaciones_rutas')) || []; } catch (e) { guardadas = []; }
        var antiguas = guardadas.some(function (r) { return r.lotes; });
        guardadas.forEach(function (r) {
            agregarParadas(r.cuad || '', r.paradas || r.lotes.map(function (id) { return { id: id, fecha: r.fecha || '', creada: r.creada }; }));
        });
        if (antiguas) { rutas.forEach(function (r) { ordenar(r, null); }); guardarRutas(); }
        repartirSinCuadrilla(false);
    })();

    // Pre-rutas abiertas, por cuadrilla: cada vez que se entra a la página salen todas cerradas
    var abiertas = {};
    function plegar(cuad, si) {
        if (si) delete abiertas[cuad || '']; else abiertas[cuad || ''] = 1;
    }

    // Lote ya revisado (tiene visita registrada): sale de la pre-ruta; la visita sigue en la tabla de abajo

    function quitarRevisadas() {
        if (!cargado || (modoHoja && !rutasAlDia)) return;
        rutas = rutas.filter(function (ruta) {
            // El último revisado (la visita más reciente) es donde está el interventor: desde ahí se reordena lo que falta
            var ultimo = null, iUltimo = Infinity;
            ruta.paradas = ruta.paradas.filter(function (p) {
                var v = visitaDe(p, infoLote(p.id));
                if (v && registros.indexOf(v) < iUltimo) { iUltimo = registros.indexOf(v); ultimo = p.id; }
                return !v;
            });
            if (ultimo !== null && ruta.paradas.length) {
                ordenar(ruta, posicion || (puntosDe(String(ultimo)).length ? String(ultimo) : null));
                subirRuta(ruta);
            } else if (ultimo !== null) subirRuta(ruta);
            return ruta.paradas.length > 0;
        });
        guardarRutas();
    }

    // Después de la fecha de ejecución hay PLAZO_DIAS para visitar el lote; pasado ese tiempo queda vencido
    var PLAZO_DIAS = 3;
    function plazoDe(x) {
        if (x.visita || x.encurso) return null;
        var d = dias(x.fecha || x.creada);
        return d === null ? null : { d: d, resta: PLAZO_DIAS - d };
    }
    function textoPlazo(pz) {
        return pz.resta < 0 ? '⚠ Plazo vencido hace ' + (-pz.resta === 1 ? '1 día' : -pz.resta + ' días')
            : pz.resta === 0 ? '⏳ Hoy es el último día' : pz.resta === 1 ? '⏳ Vence mañana' : '';
    }
    // Ventana de alerta una vez por día y por grupo de lotes vencidos (no cada vez que se repinta con el GPS)
    function avisarVencidos(vencidos) {
        if (!vencidos.length) return;
        var clave = hoy() + '|' + vencidos.map(function (v) { return v.cuad + ':' + v.nombre; }).sort().join(',');
        try { if (localStorage.getItem('plazo-avisado') === clave) return; } catch (e) {}
        if (document.querySelector('dialog[open]')) return; // se intenta en el próximo repintado
        try { localStorage.setItem('plazo-avisado', clave); } catch (e) {}
        confirmar('⚠ ' + (vencidos.length === 1 ? '1 lote pasó' : vencidos.length + ' lotes pasaron') + ' el plazo de ' + PLAZO_DIAS + ' días',
            'Después de la fecha de ejecución hay ' + PLAZO_DIAS + ' días para visitar. Sin visita:\n\n' +
            vencidos.map(function (v) { return '• ' + v.nombre + (v.cuad ? ' (cuadrilla ' + v.cuad + ')' : '') + ' · ejec. ' + aTexto(v.fecha).slice(0, 5) + ' · vencido hace ' + v.vencido + (v.vencido === 1 ? ' día' : ' días'); }).join('\n'),
            'Entendido');
    }

    function pintarRutas() {
        quitarRevisadas();
        var cont = $('ruta');
        if (!rutas.length) {
            cont.innerHTML = '<button type="button" class="ruta-vacia" data-ruta="nueva">📋 <b>Cargar lotes a revisar</b>' +
                '<span class="sub">Pegue el mensaje de WhatsApp con los lotes y arme su pre-ruta del día.</span></button>';
            return;
        }
        seguirUbicacion();
        pintadaEn = posicion;
        var vencidos = [];
        // "+ Otra pre-ruta" arriba, encima de la ruta completa, para no tener que bajar hasta el final
        cont.innerHTML = '<div class="ruta-arriba"><button type="button" class="primario otra" data-ruta="nueva">+ Otra pre-ruta</button></div>' +
            pintarRutaCompleta() + rutas.map(function (ruta, ri) {
            var paradas = ruta.paradas.map(function (p) {
                var x = infoLote(p.id); x.fecha = p.fecha; x.creada = p.creada; x.despues = p.despues; x.carga = p.carga; x.visita = visitaDe(p, x); x.encurso = !x.visita && p.encurso; x.sinfotos = p.sinfotos;
                x.du = fijada && fijada.id === String(x.id) ? 0 : posicion && puntosDe(String(x.id)).length ? distLotes(posicion, String(x.id)) : null;
                x.plazo = plazoDe(x);
                return x;
            });
            var venc = paradas.filter(function (x) { return x.plazo && x.plazo.resta < 0; });
            venc.forEach(function (x) { vencidos.push({ cuad: ruta.cuad || '', nombre: x.lote ? 'Lote ' + x.lote : x.mr || x.id, fecha: x.fecha || x.creada, vencido: -x.plazo.resta }); });
            var avisoPlazo = venc.length ? '<div class="plazo-vencido">⚠ <b>' + (venc.length === 1 ? '1 lote pasó' : venc.length + ' lotes pasaron') + ' el plazo de ' + PLAZO_DIAS + ' días</b> sin visita: ' +
                esc(venc.map(function (x) { return x.lote ? 'Lote ' + x.lote : x.mr || x.id; }).join(', ')) + '</div>' : '';
            // Parada más cercana a usted; si está a menos de AQUI_M (o dentro del margen del GPS) usted está en ese lote
            var cerca = paradas.reduce(function (a, x) { return x.du !== null && (!a || x.du < a.du) ? x : a; }, null);
            var aqui = cerca && (cerca.du === 0 || cerca.du <= Math.max(AQUI_M, Math.min(precision, 150))) ? cerca : null;
            var nombre = function (x) { return x.lote ? 'Lote ' + x.lote : x.mr; };
            var ubic = fijada ? '<div class="ubic">📍 Su ubicación: <b>' + esc(fijada.nombre) + '</b>' + (aqui && aqui.visita ? ' (ya revisado)' : '') +
                    ' <button type="button" class="enlace" data-ruta="soltar">Usar GPS</button></div>'
                : aqui ? '<div class="ubic">📍 Usted está en el <b>' + esc(nombre(aqui)) + '</b>' + (aqui.visita ? ' (ya revisado)' : '') + '</div>'
                : cerca ? '<div class="ubic lejos">📍 Lo más cercano: <b>' + esc(nombre(cerca)) + '</b> a ' + textoDist(cerca.du) + '</div>'
                : estadoUbic === 'buscando' ? '<div class="ubic lejos">📍 Buscando su ubicación…</div>'
                : estadoUbic === 'negada' ? '<div class="ubic lejos">📍 Active la ubicación del navegador para ver en qué lote está.</div>' : '';
            var fechas = paradas.map(function (x) { return x.fecha; }).filter(function (f, i, a) { return f && a.indexOf(f) === i; }).sort();
            var hechas = paradas.filter(function (x) { return x.visita; }).length;
            // El lote que la cuadrilla está ejecutando no es "siguiente": aún no está listo para revisar
            var pend = paradas.filter(function (x) { return !x.visita; }), listos = pend.filter(function (x) { return !x.encurso; }), sig = listos[0];
            var llegada = porLlegada(ruta);
            var proximas = listos.filter(function (x) { return x.c; }).slice(0, 4); // Google Maps en el celular admite 3 paradas + destino
            var gmaps = urlRuta(proximas);
            // "Ver todos en el mapa": el mapa pinta de otro color los ya revisados y los cerrados
            var enMapa = paradas.filter(function (x) { return x.lote || x.mr; });
            var idMapa = function (x) { return enMapaPorLote(x.lote) || !x.mr ? x.lote : x.mr; };
            var cerrada = function (x) { return x.visita && x.visita.ESTADO === 'CERRADO'; };
            var urlTodos = enMapa.length ? 'mapa_rapido.html?lote=' + enMapa.map(idMapa).join(',') +
                '&hechos=' + enMapa.filter(function (x) { return x.visita && !cerrada(x) && x.visita.ESTADO !== 'PENDIENTE'; }).map(idMapa).join(',') +
                '&subsanar=' + enMapa.filter(function (x) { return x.visita && x.visita.ESTADO === 'PENDIENTE'; }).map(idMapa).join(',') +
                '&cerrados=' + enMapa.filter(cerrada).map(idMapa).join(',') +
                '&curso=' + enMapa.filter(function (x) { return x.encurso; }).map(idMapa).join(',') +
                // lote:ID de la visita, para el botón "Ver detalles de la visita" en la ficha del mapa
                '&visitas=' + enMapa.filter(function (x) { return x.visita; }).map(function (x) { return idMapa(x) + ':' + x.visita.ID; }).join(',') : '';
            var prev = posicion, prevUsted = !!posicion;
            var plegada = !abiertas[ruta.cuad || ''];
            // Cada pre-ruta con el color de su cuadrilla (el mismo del mapa rápido) para distinguirlas de un vistazo
            var col = colorCuadrilla(ruta.cuad);
            return '<div class="ruta-card' + (plegada ? ' plegada' : '') + '" style="--c:' + col + '">' +
                '<div class="ruta-cab">' +
                    '<button type="button" class="ruta-plegar" data-ruta="plegar" data-ri="' + ri + '" aria-expanded="' + !plegada + '" aria-label="Plegar o desplegar">▾</button>' +
                    '<div data-ruta="plegar" data-ri="' + ri + '"><span class="cuad-pill">' + (ruta.cuad ? 'C' + esc(ruta.cuad) : '—') + '</span><b>' + (ruta.cuad ? 'Cuadrilla ' + esc(ruta.cuad) : 'Pre-ruta') + '</b>' +
                    (fechas.length ? ' <span class="sub">· ejec. ' + esc(fechas.map(function (f) { return aTexto(f).slice(0, 5); }).join(', ')) + '</span>' : '') +
                    '<div class="sub">' + (hechas ? (hechas === paradas.length ? '✓ Ruta completa · ' : '') + hechas + ' de ' + paradas.length + ' revisados'
                                                  : paradas.length + ' por revisar') +
                        (llegada ? ' · 🕒 en orden de llegada' : '') + '</div></div>' +
                    '<button type="button" class="ruta-quitar" data-ruta="quitar" data-ri="' + ri + '" aria-label="Quitar pre-ruta">×</button></div>' +
                '<div class="progreso"><span style="width:' + Math.round(100 * hechas / paradas.length) + '%"></span></div>' + avisoPlazo + ubic +
                '<div class="ruta-acciones">' +
                    (pend.length > 1 ? (llegada
                        ? '<button type="button" class="secundario pequeno" data-ruta="ordenar" data-ri="' + ri + '">📍 Ordenar por cercanía</button>'
                        : '<button type="button" class="secundario pequeno" data-ruta="ordenar" data-ri="' + ri + '">📍 Ordenar desde mi ubicación</button>' +
                          '<button type="button" class="secundario pequeno" data-ruta="llegada" data-ri="' + ri + '">🕒 Orden de llegada</button>') : '') +
                    (gmaps ? '<a class="boton primario pequeno" target="_blank" rel="noopener" data-ir-ruta="' + ri + '" href="' + esc(gmaps) + '">Ruta en Google Maps' + (pend.length > proximas.length ? ' (próximos ' + proximas.length + ')' : '') + '</a>' : '') +
                    (urlTodos ? '<a class="boton secundario pequeno" href="' + esc(urlTodos) + '">Ver todos en el mapa</a>' : '') +
                '</div>' +
                '<ol class="paradas">' + paradas.map(function (x, i) {
                    var dist = prev && x.c ? textoDist(distLotes(prev, String(x.id))) + (prevUsted ? ' de usted' : ' de la anterior') : '';
                    // Además de la anterior, siempre la distancia desde donde está usted
                    if (x.du !== null && !prevUsted && x !== aqui) dist = (dist ? dist + ' · ' : '') + textoDist(x.du) + ' de usted';
                    if (x === aqui) dist = '';
                    if (x.c) { prev = String(x.id); prevUsted = false; }
                    var aviso = !x.mr ? 'No está en la programación' : ruta.cuad && x.cuad && x.cuad !== ruta.cuad ? 'Programado para la cuadrilla ' + x.cuad : '';
                    // Pendiente pero visitado hace poco (antes de esta pre-ruta): se avisa según la frecuencia
                    var rec = !x.visita && visitaReciente(x.mr, x.lote, null, hoy());
                    if (rec && rec.reciente) aviso = (aviso ? aviso + ' · ' : '') + 'Visitado ' + textoDias(rec.d) + (rec.frec ? ' (frecuencia ' + rec.frec.toLowerCase() + ')' : '');
                    var llego = !x.visita && horaCarga(x.carga);
                    return '<li class="parada' + (x.visita ? ' hecha' : x.encurso ? ' encurso' : x === sig ? ' siguiente' : '') + (x === aqui ? ' aqui' : '') + (x.sinfotos ? ' sinfotos' : '') + '">' +
                        '<span class="n">' + (x.visita ? (cerrada(x) ? '🔒' : '✓') : x.encurso ? '▶' : i + 1) + '</span>' +
                        '<div class="info"><div class="titulo"><b>' + esc(x.lote ? 'Lote ' + x.lote : x.mr) + '</b>' +
                            (x.lote && x.mr ? ' <span class="sub">' + esc(x.mr) + '</span>' : '') +
                            (fechas.length > 1 && x.fecha ? ' <span class="sub">· ejec. ' + esc(aTexto(x.fecha).slice(0, 5)) + '</span>' : '') +
                            (llego && !x.encurso ? ' <span class="sub">· 🕒 ' + esc(llego) + '</span>' : '') +
                            (x.sinfotos ? ' <span class="tag-sinfotos" title="La cuadrilla reportó que no se pueden tomar fotos">🚫📷 Sin fotos' + (x.sinfotos !== 'Sin fotos' ? ' · ' + esc(x.sinfotos.toLowerCase()) : '') + '</span>' : '') +
                            (x.encurso ? ' <span class="tag-curso">▶ Cuadrilla trabajando aquí' + (horaCarga(x.encurso) ? ' · desde ' + esc(horaCarga(x.encurso)) : '') + '</span>' : '') +
                            (x === aqui ? ' <span class="tag-aqui">📍 Usted está aquí</span>' : '') +
                            (x === sig ? ' <span class="tag-sig">Siguiente</span>' : '') +
                            (x.despues && !x.visita ? ' <span class="tag-despues">Para después</span>' : '') + (x.visita ? ' ' + badge(x.visita.ESTADO) : '') +
                            (x.plazo && textoPlazo(x.plazo) ? ' <span class="tag-plazo' + (x.plazo.resta < 0 ? ' vencido' : '') + '">' + esc(textoPlazo(x.plazo)) + '</span>' : '') + '</div>' +
                            (x.d ? '<div class="sub dir">' + esc(x.d) + '</div>' : '') +
                            (aviso ? '<div class="sub alerta">' + esc(aviso) + '</div>' : '') +
                            (dist && !x.visita ? '<div class="sub">📍 ' + dist + '</div>' : '') + '</div>' +
                        '<div class="btns">' +
                            (x.visita ? '<button type="button" class="secundario pequeno" data-editar="' + esc(x.visita.ID) + '">Ver visita</button>'
                                      : '<button type="button" class="primario pequeno" data-ruta="registrar" data-ri="' + ri + '" data-id="' + esc(x.id) + '">Registrar</button>') +
                            ((x.c || x.d) && !x.visita ? '<a class="boton ' + (x === sig ? 'primario' : 'secundario') + ' pequeno" target="_blank" rel="noopener" data-ir="' + esc(x.id) + '" href="' + esc(urlIr(x.id, x.d)) + '">🧭 Cómo llegar</a>' : '') +
                            (x.mr || x.lote ? '<a class="boton secundario pequeno" href="' + esc(urlMapa(x.mr, x.lote)) + '">Mapa</a>' : '') +
                            (x.encurso && hayOperacion ? '<button type="button" class="secundario pequeno" data-ruta="operacion" data-ri="' + ri + '" data-id="' + esc(x.id) + '">🦺 Visita operación</button>' : '') +
                            (!x.visita && (x !== aqui || !fijada) ? '<button type="button" class="secundario pequeno" data-ruta="aqui" data-ri="' + ri + '" data-id="' + esc(x.id) + '" title="Tomar este lote como su ubicación">📍 Estoy aquí</button>' : '') +
                            (x.encurso ? '<button type="button" class="secundario pequeno" data-ruta="termino" data-ri="' + ri + '" data-id="' + esc(x.id) + '">✓ Ya terminó</button>' : '') +
                            (x.visita || x.encurso || pend.length < 2 ? '' : x.despues
                                ? '<button type="button" class="secundario pequeno" data-ruta="ahora" data-ri="' + ri + '" data-id="' + esc(x.id) + '">Hacer ahora</button>'
                                : '<button type="button" class="secundario pequeno" data-ruta="despues" data-ri="' + ri + '" data-id="' + esc(x.id) + '">⤓ Después</button>') +
                            '<button type="button" class="secundario pequeno" data-ruta="quitar-parada" data-ri="' + ri + '" data-id="' + esc(x.id) + '" title="Quitar de la pre-ruta" aria-label="Quitar de la pre-ruta">✕</button>' +
                        '</div></li>';
                }).join('') + '</ol></div>';
        }).join('');
        avisarVencidos(vencidos);
    }

    // Lotes por tramo de la ruta completa
    $('ruta').onchange = function (ev) {
        if (!ev.target.matches('[data-tramo]')) return;
        TRAMO = +ev.target.value;
        try { localStorage.setItem('subsanaciones_tramo', TRAMO); } catch (e) {}
        pintarRutas();
        toast('Ruta completa en tramos de ' + TRAMO + ' lotes.' + (TRAMO > 4 ? ' En el celular, Google Maps puede admitir solo 4 por tramo.' : ''));
    };
    $('ruta').onclick = function (ev) {
        // "Cómo llegar" / "Ruta en Google Maps": el enlace se arma al tocarlo, con la ubicación de ese momento
        var ir = ev.target.closest('[data-ir]');
        if (ir) { ir.href = urlIr(ir.dataset.ir, infoLote(ir.dataset.ir).d) || ir.href; return; }
        var irR = ev.target.closest('[data-ir-ruta]');
        if (irR) {
            var rr = rutas[+irR.dataset.irRuta];
            var prox = rr ? rr.paradas.map(function (p) { var x = infoLote(p.id); x.visita = visitaDe(p, x); x.encurso = !x.visita && p.encurso; return x; })
                .filter(function (x) { return !x.visita && !x.encurso && x.c; }).slice(0, 4) : [];
            irR.href = urlRuta(prox) || irR.href;
            return;
        }
        var irT = ev.target.closest('[data-ir-tramo]');
        if (irT) {
            var tr = tramosDe(rutaCompleta());
            if (tr[+irT.dataset.irTramo]) irT.href = urlTramo(tr, +irT.dataset.irTramo);
            return;
        }
        var ed = ev.target.closest('[data-editar]');
        if (ed) return abrir(registros.find(function (r) { return r.ID === ed.dataset.editar; }));
        var b = ev.target.closest('[data-ruta]');
        if (!b) return;
        if (b.dataset.ruta === 'plegar-todas') { plegar('*todas', !!abiertas['*todas']); return pintarRutas(); }
        var ruta = rutas[+b.dataset.ri], accion = b.dataset.ruta;
        if (accion === 'nueva') return abrirDlgRuta();
        if (accion === 'aqui') { fijar(b.dataset.id); pintarRutas(); return toast(fijada ? '📍 Su ubicación es ahora ' + fijada.nombre + '. "Cómo llegar" sale desde aquí.' : 'Ese lote no tiene ubicación ni dirección.'); }
        if (accion === 'soltar') { soltar(); pintarRutas(); return toast('Se usa de nuevo el GPS del celular.'); }
        if (accion === 'plegar') { plegar(ruta.cuad, !!abiertas[ruta.cuad || '']); return pintarRutas(); }
        if (accion === 'despues' || accion === 'ahora') {
            aplazar(ruta, b.dataset.id, accion === 'despues');
            guardarRutas(); subirRuta(ruta); pintarRutas();
            return toast(accion === 'despues' ? 'Lote ' + b.dataset.id + ' pasó al final. Cuando quiera hacerlo, toque "Hacer ahora".' : 'Lote ' + b.dataset.id + ' es ahora el siguiente.');
        }
        if (accion === 'quitar') {
            return confirmar('¿Quitar esta pre-ruta?', 'Cuadrilla ' + (ruta.cuad || '—') + '. Las visitas registradas no se borran.', 'Quitar').then(function (si) {
                if (!si || rutas.indexOf(ruta) === -1) return;
                rutas.splice(rutas.indexOf(ruta), 1); guardarRutas(); subirRuta({ cuad: ruta.cuad, paradas: [] }); pintarRutas();
            });
        }
        // Quita un solo lote; si era el último, se va la pre-ruta completa
        if (accion === 'quitar-parada') {
            var idQ = b.dataset.id;
            return confirmar('¿Quitar el lote ' + idQ + '?', 'Sale de la pre-ruta de la cuadrilla ' + (ruta.cuad || '—') + '. Las visitas registradas no se borran.', 'Quitar').then(function (si) {
                if (!si) return;
                ruta.paradas = ruta.paradas.filter(function (p) { return p.id !== idQ; });
                if (!ruta.paradas.length && rutas.indexOf(ruta) !== -1) rutas.splice(rutas.indexOf(ruta), 1);
                guardarRutas(); subirRuta(ruta); pintarRutas();
                toast('Lote ' + idQ + ' quitado de la pre-ruta.');
            });
        }
        if (accion === 'registrar' || accion === 'operacion') {
            var ri = +b.dataset.ri, id = b.dataset.id, tipo = accion === 'operacion' ? OP : EJ;
            if (cargado || !CFG.url) return registrarParada(ri, id, tipo);
            alCargar = function () { registrarParada(ri, id, tipo); };
            toast('Cargando las visitas… el formulario se abre en un momento.');
            return;
        }
        if (accion === 'llegada') {
            modos[ruta.cuad || ''] = 'llegada'; guardarModos();
            ordenar(ruta, posicion); guardarRutas(); subirRuta(ruta); pintarRutas();
            return toast('Ordenada como fueron llegando los lotes. El mapa los numera en el mismo orden.');
        }
        // La cuadrilla terminó el lote que estaba ejecutando: queda listo para revisar
        if (accion === 'termino') {
            var pt = ruta.paradas.find(function (p) { return p.id === b.dataset.id; });
            if (pt) { if (!pt.fecha && pt.encurso) pt.fecha = pt.encurso.slice(0, 10); pt.encurso = ''; }
            ordenar(ruta, posicion); guardarRutas(); subirRuta(ruta); pintarRutas();
            return toast('Lote ' + b.dataset.id + ' listo para revisar.');
        }
        if (accion === 'ordenar') {
            delete modos[ruta.cuad || '']; guardarModos();
            var listo = function (desde) { ordenar(ruta, desde); guardarRutas(); subirRuta(ruta); pintarRutas(); };
            if (fijada && fijada.p) { listo(fijada.p); return toast('Ordenada desde ' + fijada.nombre + '.'); }
            if (!navigator.geolocation) return listo(null);
            b.disabled = true; b.textContent = 'Ubicando…';
            navigator.geolocation.getCurrentPosition(function (p) {
                gps = [p.coords.latitude, p.coords.longitude]; usarFijada();
                listo(posicion);
                toast('Ordenada desde su ubicación actual.');
            }, function () {
                listo(null);
                toast('Sin acceso a la ubicación: se ordenó desde el primer lote.');
            }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
        }
    };

    // Abre el formulario con los datos de la parada: cuadrilla y fecha de ejecución del mensaje, ficha y última visita
    // tipo OPERACIÓN: la cuadrilla está trabajando ahí y se revisa la operación (PMT, EPP...)
    function registrarParada(ri, id, tipo) {
        var ruta = rutas[ri], x = infoLote(id), op = tipo === OP;
        var n = ruta.paradas.findIndex(function (p) { return p.id === id; }), parada = ruta.paradas[n] || {};
        abrir({ MICRORRUTA: x.mr, LOTE: x.lote, CUADRILLA: ruta.cuad, 'FECHA DE EJECUCIÓN': aTexto(parada.fecha || '') }, {
            ri: ri, id: id,
            html: (op ? '🦺 Visita durante la operación' : '📍 Pre-ruta') + (ruta.cuad ? ' · cuadrilla ' + esc(ruta.cuad) : '') +
                (op ? '' : ' · parada ' + (n + 1) + ' de ' + ruta.paradas.length) + '<br>' +
                '<b>' + esc(x.lote ? 'Lote ' + x.lote : x.mr) + '</b>' + (x.lote && x.mr ? ' · ' + esc(x.mr) : '') +
                (op ? (parada.encurso && horaCarga(parada.encurso) ? ' · trabajando desde ' + esc(horaCarga(parada.encurso)) : '')
                    : parada.fecha ? ' · ejecutado ' + esc(aTexto(parada.fecha)) : '') + (x.d ? '<br>' + esc(x.d) : '') +
                fichaLote(x)
        }, tipo);
        if (x.mr) completar(x.mr);
        // completar() pone la cuadrilla de la programación; se respeta la del mensaje si vino
        if (ruta.cuad) form.querySelector('[data-campo="CUADRILLA"]').value = ruta.cuad;
    }
    // Lote que llega desde el mapa: ¿está en alguna pre-ruta? Se prefiere la parada aún sin revisar
    function paradaDe(mr, lote) {
        lote = /^\d+$/.test(lote) ? String(+lote) : String(lote || '').trim().toUpperCase();
        mr = String(mr || '').trim().toUpperCase();
        var halladas = [];
        rutas.forEach(function (ruta, ri) {
            ruta.paradas.forEach(function (p) {
                var x = infoLote(p.id);
                if ((lote && lote !== 'NA' && p.id === lote) || (mr && (p.id === mr || x.mr === mr))) halladas.push({ ri: ri, id: p.id, hecha: !!visitaDe(p, x) });
            });
        });
        return halladas.find(function (h) { return !h.hecha; }) || halladas[0] || null;
    }

    // "Crear pre-ruta" con los lotes ya escritos; la cuadrilla es la dada o la del primer lote en la programación
    function prerutaCon(ids, cuad) {
        abrirDlgRuta();
        $('ruta-texto').value = ids.join('\n');
        $('ruta-texto').dispatchEvent(new Event('input'));
        $('ruta-cuad').value = String(cuad || infoLote(String(ids[0])).cuad || '').replace(/^C/i, '');
        vistaRuta();
    }
    function abrirDlgRuta() {
        ['ruta-texto', 'ruta-cuad', 'ruta-agregar'].forEach(function (id) { $(id).value = ''; });
        // Siempre con fecha de ejecución: la del mensaje si la trae, si no hoy (se puede cambiar)
        $('ruta-fecha').value = hoy();
        rutaQuitados = []; rutaAgregados = [];
        $('ruta-tipo-hecho').checked = true;
        document.querySelector('[for="ruta-tipo-auto"]').hidden = true;
        vistaRuta();
        $('dlg-ruta').showModal();
    }
    // Lista final: la del mensaje, menos los que se quitaron con × y más los agregados a mano (sirve sin mensaje)
    var rutaQuitados = [], rutaAgregados = [];
    function lotesRuta(p) {
        return p.lotes.concat(rutaAgregados).filter(function (v, i, a) { return a.indexOf(v) === i && rutaQuitados.indexOf(v) === -1; });
    }
    // Lotes que quedan "en ejecución ahora" según la opción elegida en el diálogo (los agregados a mano, como ejecutados)
    function lotesEnCurso(p, lista) {
        return $('ruta-tipo-curso').checked ? lista : $('ruta-tipo-auto').checked ? p.enCurso.filter(function (v) { return lista.indexOf(v) !== -1; }) : [];
    }
    function repartoTexto(lista) {
        var n = {};
        lista.forEach(function (id) { var c = cuadDe(id); n[c] = (n[c] || 0) + 1; });
        return Object.keys(n).sort(function (a, b) { return (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'es', { numeric: true }); })
            .map(function (c) { return (c ? 'C' + c : 'sin cuadrilla') + ': ' + n[c]; }).join(' · ');
    }
    function vistaRuta() {
        var p = parsearMensaje($('ruta-texto').value), lista = lotesRuta(p), cuad = $('ruta-cuad').value.trim().replace(/^C/i, ''), curso = lotesEnCurso(p, lista);
        $('ruta-vista').innerHTML = lista.length ? '<div class="sub">' + lista.length + ' lote' + (lista.length === 1 ? '' : 's') + ' en la pre-ruta (toque × para quitar):</div>' +
            lista.map(function (id) {
                var x = infoLote(id), aviso = !x.mr ? 'no está en la programación' : cuad && x.cuad && x.cuad !== cuad ? 'es de la cuadrilla ' + x.cuad : '';
                return '<span class="chip-ruta' + (aviso ? ' aviso' : '') + (p.sinFotos[id] ? ' sinfotos' : '') + '"' + (p.sinFotos[id] ? ' title="' + esc(p.sinFotos[id]) + ': sin fotos"' : '') + '>' +
                    (curso.indexOf(id) !== -1 ? '<span class="curso">▶ </span>' : '') + (p.sinFotos[id] ? '🚫📷 ' : '') +
                    esc(x.lote || x.mr || id) + (x.lote && x.mr ? ' · ' + esc(x.mr) : '') + (aviso ? ' ⚠ ' + esc(aviso) : '') +
                    '<button type="button" class="quitar-lote" data-quitar-lote="' + esc(id) + '" aria-label="Quitar ' + esc(id) + '">×</button></span>';
            }).join('') + (curso.length ? '<div class="sub" style="margin-top:6px"><span class="curso" style="color:#1d4ed8">▶</span> = <b>en ejecución ahora</b>' +
                (cuad ? ' por la cuadrilla ' + esc(cuad) : '') + '. El lote donde estaba antes esa cuadrilla queda listo para revisar.</div>' : '') +
            (lista.some(function (id) { return p.sinFotos[id]; }) ? '<div class="sub" style="margin-top:6px">🚫📷 = <b>sin fotos</b>: la cuadrilla reporta que no se le pueden tomar fotos (orden público).</div>' : '') +
            (cuad ? '' : '<div class="sub" style="margin-top:6px">Sin cuadrilla: cada lote se suma a la de la programación → <b>' + esc(repartoTexto(lista)) + '</b></div>')
            : '<div class="sub">Se toman del mensaje la fecha, la cuadrilla y los números de lote (o códigos de microrruta), o agréguelos a mano.</div>';
        $('ruta-crear').disabled = !lista.length;
        $('ruta-crear').textContent = curso.length && curso.length === lista.length ? 'Marcar en ejecución' : 'Crear pre-ruta';
    }
    // A mano: uno o varios separados por coma o espacio ("532, 371" o "Z1CC0123"); un lote quitado antes vuelve si se agrega
    function agregarLotesRuta() {
        var nuevos = parsearMensaje($('ruta-agregar').value).lotes;
        if (!nuevos.length) { $('ruta-agregar').focus(); return toast('Escriba un número de lote o un código de microrruta.'); }
        nuevos.forEach(function (v) {
            rutaQuitados = rutaQuitados.filter(function (q) { return q !== v; });
            if (rutaAgregados.indexOf(v) === -1) rutaAgregados.push(v);
        });
        $('ruta-agregar').value = '';
        if (!$('ruta-cuad').value) $('ruta-cuad').value = String(infoLote(nuevos[0]).cuad || '').replace(/^C/i, '');
        vistaRuta();
        $('ruta-agregar').focus();
    }
    $('ruta-agregar-btn').onclick = agregarLotesRuta;
    $('ruta-agregar').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); agregarLotesRuta(); } });
    $('ruta-vista').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-quitar-lote]');
        if (!b) return;
        var v = b.dataset.quitarLote;
        rutaAgregados = rutaAgregados.filter(function (a) { return a !== v; });
        if (rutaQuitados.indexOf(v) === -1) rutaQuitados.push(v);
        vistaRuta();
    });
    $('ruta-texto').addEventListener('input', function () {
        var p = parsearMensaje(this.value);
        if (p.fecha) $('ruta-fecha').value = p.fecha;
        if (p.cuad) $('ruta-cuad').value = p.cuad;
        document.querySelector('[for="ruta-tipo-auto"]').hidden = p.tipo !== 'mixto';
        $(p.tipo === 'curso' ? 'ruta-tipo-curso' : p.tipo === 'mixto' ? 'ruta-tipo-auto' : 'ruta-tipo-hecho').checked = true;
        vistaRuta();
    });
    $('ruta-cuad').addEventListener('input', vistaRuta);
    document.querySelectorAll('[name="ruta-tipo"]').forEach(function (r) { r.addEventListener('change', vistaRuta); });
    $('ruta-pegar').onclick = function () {
        if (!navigator.clipboard || !navigator.clipboard.readText) { $('ruta-texto').focus(); return toast('Mantenga presionado el cuadro y elija Pegar.'); }
        navigator.clipboard.readText().then(function (t) {
            $('ruta-texto').value = t;
            $('ruta-texto').dispatchEvent(new Event('input'));
        }, function () { $('ruta-texto').focus(); toast('Mantenga presionado el cuadro y elija Pegar.'); });
    };
    $('ruta-cancelar').onclick = function () { $('dlg-ruta').close(); };
    // Lotes del mensaje que ya están en alguna tarjeta con otra fecha de ejecución: se pregunta con cuál se quedan.
    // usarNueva: true = la del mensaje, false = la que ya tenían; en las dos el lote queda en una sola tarjeta.
    $('ruta-crear').onclick = function () {
        var lista = lotesRuta(parsearMensaje($('ruta-texto').value)), fecha = $('ruta-fecha').value || hoy();
        if (!lista.length) return;
        var dup = [];
        rutas.forEach(function (r) {
            r.paradas.forEach(function (q) { if (lista.indexOf(q.id) !== -1 && q.fecha && q.fecha !== fecha) dup.push({ r: r, q: q }); });
        });
        if (!dup.length) return crearRuta(null);
        confirmar('⚠ ' + (dup.length === 1 ? 'Este lote ya está' : 'Estos lotes ya están') + ' en la pre-ruta',
            dup.map(function (d) { return 'Lote ' + d.q.id + ' · ' + (d.r.cuad ? 'C' + d.r.cuad : 'sin cuadrilla') + ' · ejec. ' + aTexto(d.q.fecha).slice(0, 5); }).join('\n') +
            '\n\n¿Con qué fecha de ejecución se dejan? Quedan una sola vez.', 'Usar la nueva (' + aTexto(fecha).slice(0, 5) + ')', 'Dejar la que tenían')
            .then(function (nueva) {
                if (nueva === null) return;
                var antes = {};
                if (!nueva) dup.forEach(function (d) { antes[d.q.id] = d.q.fecha; });
                crearRuta(antes);
            });
    };
    // fechaDe: { lote: fecha } para dejar la ejecución que ya tenían (null: la del mensaje para todos)
    function crearRuta(fechaDe) {
        var p = parsearMensaje($('ruta-texto').value), lista = lotesRuta(p);
        if (!lista.length) return;
        var cuad = $('ruta-cuad').value.trim().replace(/^C/i, ''), fecha = $('ruta-fecha').value || hoy();
        // Lote que ya tiene la visita de esa ejecución (o una de hoy): la pre-ruta lo quitaría apenas se pinta, sin decir
        // nada. Se avisa cuál visita lo cubre; si son todos, el diálogo sigue abierto para cambiar la fecha o el lote.
        var revisados = lista.map(function (id) {
            return { id: id, v: visitaDe({ id: id, fecha: fechaDe && fechaDe[id] || fecha, creada: hoy() }, infoLote(id)) };
        }).filter(function (x) { return x.v; });
        var textoRevisados = revisados.map(function (x) {
            var n = infoLote(x.id);
            return 'Lote ' + (n.lote || n.mr || x.id) + ': visita del ' + (x.v['FECHA DE LA VISITA'] || '—') + ' (' + (x.v.ESTADO || 'sin estado') + ')' +
                (x.v['FECHA DE EJECUCIÓN'] ? ', ejecución ' + x.v['FECHA DE EJECUCIÓN'] : '');
        }).join('\n');
        if (revisados.length === lista.length) {
            return confirmar(revisados.length === 1 ? 'Ese lote ya está revisado' : 'Esos lotes ya están revisados',
                textoRevisados + '\n\nPor eso no se agrega a la pre-ruta. Si la cuadrilla lo volvió a ejecutar, cambie la fecha de ejecución.', 'Entendido');
        }
        if (revisados.length) lista = lista.filter(function (id) { return !revisados.some(function (x) { return x.id === id; }); });
        // El lote que se vuelve a ingresar sale de cualquier otra tarjeta: queda solo en la nueva
        var destino = function (id) { return cuad || cuadDe(id); }, quitadas = [];
        rutas.forEach(function (r) {
            var antes = r.paradas.length;
            r.paradas = r.paradas.filter(function (q) { return lista.indexOf(q.id) === -1 || r.cuad === destino(q.id); });
            if (r.paradas.length !== antes) quitadas.push(r);
        });
        quitadas.forEach(subirRuta);
        rutas = rutas.filter(function (r) { return r.paradas.length; });
        var cursoIds = lotesEnCurso(p, lista), curso = cursoIds.length > 0, ahora = new Date(), enCurso = marca(ahora);
        // Sin cuadrilla en el mensaje: cada lote va a la tarjeta de su cuadrilla en la programación (no se crea otra tarjeta)
        var grupos = {};
        lista.forEach(function (id) { var c = cuad || cuadDe(id); (grupos[c] = grupos[c] || []).push(id); });
        var nuevas = [], existian = [];
        Object.keys(grupos).forEach(function (c) {
            if (rutas.some(function (r) { return r.cuad === c; })) existian.push(c);
            // La cuadrilla pasó a otro lote: el que estaba ejecutando ya terminó y queda listo para revisar
            if (curso) rutas.forEach(function (r) {
                if (r.cuad === c) r.paradas.forEach(function (q) {
                    if (q.encurso && cursoIds.indexOf(q.id) === -1) { if (!q.fecha) q.fecha = q.encurso.slice(0, 10); q.encurso = ''; }
                });
            });
            // Un segundo de diferencia por lote: así "orden de llegada" respeta el orden en que venían en el mensaje
            var ruta = agregarParadas(c, grupos[c].map(function (id) {
                var i = lista.indexOf(id);
                return { id: id, fecha: fechaDe && fechaDe[id] || fecha, fechaElegida: true, creada: hoy(), carga: marca(new Date(ahora.getTime() + i * 1000)),
                         encurso: cursoIds.indexOf(id) !== -1 ? enCurso : '', sinfotos: p.sinFotos[id] || '' };
            }));
            ordenar(ruta, posicion);
            subirRuta(ruta);
            plegar(ruta.cuad, false);
            nuevas.push(ruta);
        });
        guardarRutas();
        $('dlg-ruta').close();
        pintarRutas();
        var nombres = Object.keys(grupos).map(function (c) { return (c ? 'C' + c : 'sin cuadrilla') + ' (' + grupos[c].length + ')'; }).join(', ');
        toast(curso ? 'Trabajando ahora en ' + cursoIds.join(', ') + ' · ' + nombres + '.'
            : (nuevas.length > 1 ? 'Lotes repartidos por cuadrilla: ' + nombres
                : existian.length ? 'Se sumaron a la cuadrilla ' + nuevas[0].cuad + ' y se reordenó la ruta' : 'Pre-ruta creada y ordenada') +
              ' · ejec. ' + aTexto(fecha).slice(0, 5) + '.');
        if (revisados.length) confirmar('No se agregó ' + (revisados.length === 1 ? 'un lote ya revisado' : revisados.length + ' lotes ya revisados'), textoRevisados, 'Entendido');
        var tarjeta = $('ruta').querySelectorAll('.ruta-card:not(.ruta-completa)')[rutas.indexOf(nuevas[0])];
        if (tarjeta) tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    pintarRutas();

    // ---------- Eventos generales ----------
    // Quitar filtros: todo vuelve a "todos" de un toque (el botón solo se ve si hay alguno puesto)
    var FILTROS = ['f-texto', 'f-estado', 'f-tipo', 'f-zona', 'f-cuadrilla', 'f-dia', 'f-desde', 'f-hasta', 'f-usuario'];
    function pintarLimpiar() {
        pintarRango();
        // El rango cuenta como un solo filtro (el "entre fechas" con sus dos días)
        var n = FILTROS.filter(function (id) { return $(id).value && id !== 'f-desde' && id !== 'f-hasta'; }).length;
        $('btn-limpiar-filtros').hidden = !n;
        $('btn-limpiar-filtros').textContent = '✕ Quitar filtros' + (n > 1 ? ' (' + n + ')' : '');
    }
    $('btn-limpiar-filtros').onclick = function () { FILTROS.forEach(function (id) { $(id).value = ''; }); pintar(); };
    $('btn-nuevo').onclick = function () { abrir(null); };
    $('btn-recargar').onclick = cargar;
    $('f-texto').oninput = pintar;
    // Lista de lotes pegada (uno por renglón, como sale del Excel o de WhatsApp): el campo es de una línea y el navegador
    // pegaría los números juntos; se separan con comas
    $('f-texto').addEventListener('paste', function (ev) {
        var t = (ev.clipboardData || window.clipboardData).getData('text');
        if (!/[\r\n]/.test(t.trim())) return;
        ev.preventDefault();
        this.value = t.trim().split(/\s*[\r\n]+\s*/).filter(Boolean).join(', ');
        pintar();
    });
    $('f-estado').onchange = pintar;
    $('f-zona').onchange = pintar;
    $('f-tipo').onchange = pintar;
    $('f-cuadrilla').onchange = pintar;
    // Entre fechas: Desde y Hasta con atajos; antes de: solo el día (Hasta); después de: solo el día (Desde).
    // Debajo, la frase con los días que se están viendo y cuántas visitas son
    function pintarRango() {
        var modo = $('f-dia').value, rango = modo === MODOS_FECHA.RANGO;
        $('f-rango').hidden = !esModoFecha(modo);
        if (!esModoFecha(modo)) return;
        $('l-desde').hidden = modo === MODOS_FECHA.ANTES;
        $('l-hasta').hidden = modo === MODOS_FECHA.DESPUES;
        $('t-desde').textContent = rango ? 'Desde' : 'Después del';
        $('t-hasta').textContent = rango ? 'Hasta' : 'Antes del';
        var h = hoy(), d = $('f-desde').value, a = $('f-hasta').value;
        $('f-atajos').innerHTML = rango ? ATAJOS_FECHA.map(function (x) {
            var r = atajoFecha(x[0], h);
            return '<button type="button" class="secundario" data-atajo="' + x[0] + '" aria-pressed="' + (r.desde === d && r.hasta === a) + '">' + esc(x[1]) + '</button>';
        }).join('') : '';
        var c = criterioFecha(modo, d, a), frase = describirFecha(modo, d, a);
        if (c.desde || c.hasta) {
            var n = filtrados().length;
            frase += ' <b>' + n + (n === 1 ? ' visita' : ' visitas') + '</b> con los filtros puestos.';
        }
        $('f-rango-ayuda').innerHTML = frase;
    }
    $('f-dia').onchange = function () {
        var modo = this.value;
        // Al pasar a "antes de" o "después de", el día ya escrito en el otro campo se pasa al que queda visible
        if (modo === MODOS_FECHA.ANTES && !$('f-hasta').value && $('f-desde').value) { $('f-hasta').value = $('f-desde').value; $('f-desde').value = ''; }
        if (modo === MODOS_FECHA.DESPUES && !$('f-desde').value && $('f-hasta').value) { $('f-desde').value = $('f-hasta').value; $('f-hasta').value = ''; }
        if (modo === MODOS_FECHA.ANTES) $('f-desde').value = '';
        if (modo === MODOS_FECHA.DESPUES) $('f-hasta').value = '';
        pintar();
        if (esModoFecha(modo)) {
            var campo = modo === MODOS_FECHA.DESPUES ? $('f-desde') : $('f-hasta');
            if (!campo.value) campo.focus();
        }
    };
    $('f-atajos').onclick = function (ev) {
        var b = ev.target.closest('[data-atajo]'), r = b && atajoFecha(b.dataset.atajo, hoy());
        if (!r) return;
        $('f-desde').value = r.desde; $('f-hasta').value = r.hasta;
        pintar();
    };
    $('f-desde').onchange = pintar;
    $('f-hasta').onchange = pintar;
    $('f-usuario').onchange = pintar;
    $('resumen').onclick = function (ev) {
        var t = ev.target.closest('[data-estado]');
        if (t) { $('f-estado').value = t.dataset.estado; pintar(); }
    };
    $('tabla').onclick = function (ev) {
        var pg = ev.target.closest('[data-pagina]');
        if (pg) { paginaLista = +pg.dataset.pagina; pintar(); return $('tabla').scrollIntoView({ block: 'start' }); }
        var b = ev.target.closest('[data-editar]');
        if (b) return abrir(registros.find(function (r) { return r.ID === b.dataset.editar; }));
        var s = ev.target.closest('[data-subsanar]');
        if (s) return subsanar(registros.find(function (r) { return r.ID === s.dataset.subsanar; }));
        var sy = ev.target.closest('[data-subsanar-ya]');
        if (sy) return subsanarUna(registros.find(function (r) { return r.ID === sy.dataset.subsanarYa; }), sy);
        var st = ev.target.closest('[data-subsanar-todos]');
        if (st) return subsanarLista(st);
        var w = ev.target.closest('[data-wa]');
        if (w) return mostrarWhatsapp(registros.find(function (r) { return r.ID === w.dataset.wa; }));
        var el = ev.target.closest('[data-eliminar]');
        if (el) {
            el.disabled = true;
            return eliminar(el.dataset.eliminar).catch(function (err) { toast('No se eliminó: ' + err.message); })
                .then(function () { el.disabled = false; });
        }
        var v = ev.target.closest('[data-ver]');
        // Tocar cualquier parte de la fila abre o cierra el detalle, igual que "Ver detalles" (salvo enlaces y botones,
        // y si se estaba seleccionando texto para copiarlo)
        var fila = !v && ev.target.closest('tr.fila-visita');
        if (fila && !ev.target.closest('a, button, input, select, textarea') && !String(window.getSelection && window.getSelection()).trim()) v = fila.querySelector('[data-ver]');
        if (v) {
            var abierto = abiertos[v.dataset.ver] = !abiertos[v.dataset.ver];
            v.closest('tr').nextElementSibling.hidden = !abierto;
            v.textContent = abierto ? 'Ocultar ▴' : 'Ver detalles ▾';
            v.setAttribute('aria-expanded', abierto);
        }
    };
    $('tabla').addEventListener('change', function (ev) {
        if (!ev.target.matches('[data-por-pagina]')) return;
        // Sigue viendo las mismas visitas: va a la página donde queda la primera que estaba viendo
        var primera = (paginaLista - 1) * POR_PAGINA;
        POR_PAGINA = +ev.target.value;
        paginaLista = Math.floor(primera / POR_PAGINA) + 1;
        try { localStorage.setItem('subsanaciones_por_pagina', POR_PAGINA); } catch (e) {}
        pintar();
    });
    // Recuerda qué fichas del celular quedaron abiertas al filtrar o guardar
    $('tabla').addEventListener('toggle', function (ev) {
        if (ev.target.dataset && ev.target.dataset.id) abiertos[ev.target.dataset.id] = ev.target.open;
    }, true);
    if (CFG.hoja) { $('abrir-hoja').href = CFG.hoja; $('abrir-hoja').hidden = false; }

    // ---------- Excel con el formato de interventoría (src/subsanaciones/excel.js) ----------
    // Primero la vista previa (mismas hojas, colores y anchos que el archivo); desde ahí se descarga
    var hojasVista = [];
    function verHoja(i) {
        $('excel-hojas').querySelectorAll('[data-hoja]').forEach(function (b) { b.setAttribute('aria-selected', +b.dataset.hoja === i); });
        $('excel-vista').innerHTML = htmlHoja(hojasVista[i]);
        $('excel-vista').scrollTo(0, 0);
        aplicarZoom();
    }
    // Zoom de la vista previa (como el de Excel): − / + de 25 % a 200 %, tocar el % vuelve a 100, "Ajustar" muestra todas
    // las columnas a lo ancho; también Ctrl + rueda. Queda guardado en este equipo.
    var zoomXl = 1;
    try { zoomXl = Math.min(2, Math.max(0.25, +localStorage.getItem('excel_zoom') || 1)); } catch (e) {}
    function aplicarZoom(z) {
        if (z) zoomXl = Math.round(Math.min(2, Math.max(0.25, z)) * 100) / 100;
        var t = $('excel-vista').querySelector('.xl');
        if (t) t.style.zoom = zoomXl;
        $('excel-nivel').textContent = Math.round(zoomXl * 100) + ' %';
        try { localStorage.setItem('excel_zoom', zoomXl); } catch (e) {}
    }
    $('excel-menos').onclick = function () { aplicarZoom(zoomXl - (zoomXl > 1 ? 0.25 : 0.1)); };
    $('excel-mas').onclick = function () { aplicarZoom(zoomXl + (zoomXl >= 1 ? 0.25 : 0.1)); };
    $('excel-nivel').onclick = function () { aplicarZoom(1); };
    // Ancho de la hoja al 100 %: columna de números (34 px) + cada columna (ancho × 7 + 5 px, como htmlHoja) + bordes
    $('excel-ajustar').onclick = function () {
        var b = $('excel-hojas').querySelector('[aria-selected="true"]'), h = hojasVista[b ? +b.dataset.hoja : 0];
        if (!h) return;
        var ancho = h.anchos.reduce(function (s, w) { return s + w * 7 + 6; }, 36);
        aplicarZoom(($('excel-vista').clientWidth - 4) / ancho);
    };
    $('excel-vista').addEventListener('wheel', function (ev) {
        if (!ev.ctrlKey) return;
        ev.preventDefault();
        aplicarZoom(zoomXl * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    // listaExcel: lo que muestra y descarga la vista previa (lo filtrado, o lo pegado en «Informes desde una tabla»)
    var listaExcel = [];
    $('btn-excel').onclick = function () { abrirExcel(filtrados()); };
    function abrirExcel(lista) {
        if (!lista.length) { toast('No hay registros para exportar.'); return; }
        listaExcel = lista;
        hojasVista = hojasExcel(lista, items, itemsOp);
        $('excel-info').textContent = '· ' + lista.length + (lista.length === 1 ? ' visita' : ' visitas');
        $('excel-hojas').innerHTML = hojasVista.map(function (h, i) {
            return '<button type="button" role="tab" data-hoja="' + i + '">' + esc(h.nombre) + ' <small>' + h.filas.length + '</small></button>';
        }).join('');
        verHoja(0);
        $('dlg-excel').showModal();
    }
    $('excel-hojas').onclick = function (ev) { var b = ev.target.closest('[data-hoja]'); if (b) verHoja(+b.dataset.hoja); };
    $('excel-cerrar').onclick = function () { $('dlg-excel').close(); };
    // ⤢ / ⤡: ventana a pantalla completa o normal; queda como se dejó
    function ampliarExcel(si) {
        $('dlg-excel').classList.toggle('completo', si);
        $('excel-ampliar').textContent = si ? '⤡' : '⤢';
        $('excel-ampliar').title = $('excel-ampliar').ariaLabel = si ? 'Tamaño normal' : 'Pantalla completa';
        try { localStorage.setItem('excel_completo', si ? '1' : ''); } catch (e) {}
    }
    try { ampliarExcel(localStorage.getItem('excel_completo') === '1'); } catch (e) {}
    $('excel-ampliar').onclick = function () { ampliarExcel(!$('dlg-excel').classList.contains('completo')); };
    // 📋 Copiar filas: las de la hoja que se ve, con colores, para pegarlas tal cual en otro Excel
    $('excel-copiar').onclick = function () {
        var b = $('excel-hojas').querySelector('[aria-selected="true"]'), h = hojasVista[b ? +b.dataset.hoja : 0];
        if (!h || !h.filas.length) return toast('No hay filas para copiar.');
        var c = filasParaCopiar(h), n = h.filas.length + (h.filas.length === 1 ? ' fila copiada' : ' filas copiadas');
        var listo = function () { toast('✓ ' + n + ' con colores: péguelas en Excel con Ctrl+V.'); };
        if (navigator.clipboard && window.ClipboardItem) {
            navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([c.html], { type: 'text/html' }), 'text/plain': new Blob([c.texto], { type: 'text/plain' }),
            })]).then(listo, function () { copiarHtmlViejo(c.html) ? listo() : toast('No se pudo copiar.'); });
        } else if (copiarHtmlViejo(c.html)) listo();
        else toast('No se pudo copiar.');
    };
    // Sin ClipboardItem: se selecciona la tabla en la página y se copia (también lleva los colores)
    function copiarHtmlViejo(html) {
        var d = document.createElement('div');
        d.innerHTML = html; d.style.position = 'fixed'; d.style.left = '-9999px';
        document.body.appendChild(d);
        var r = document.createRange(); r.selectNodeContents(d);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        sel.removeAllRanges(); d.remove();
        return ok;
    }
    $('excel-descargar').onclick = function () {
        var b = this;
        b.disabled = true;
        exportarExcel(listaExcel, items, itemsOp)
            .catch(function (err) { toast('No se pudo generar el Excel: ' + err.message); })
            .then(function () { b.disabled = false; });
    };

    // ---------- Posibles hallazgos (src/subsanaciones/hallazgos.js) ----------
    // Mensajes de interventoría listos para el grupo: se buscan por lo que se escribe. Con el formulario abierto también
    // se pasan a la observación, y mientras se escribe la observación aparecen debajo los que tienen que ver
    function campoObs() { return form.querySelector('[data-campo="OBSERVACIONES NOVEDADES"]'); }
    function copiarTexto(texto, listo) {
        var aMano = function () {
            var t = document.createElement('textarea');
            t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
            // Dentro de la ventana abierta (Posibles hallazgos o Buena operación): con una ventana abierta, lo de afuera no se puede seleccionar
            ($('dlg-buenas').open ? $('dlg-buenas') : $('dlg-hallazgos').open ? $('dlg-hallazgos') : document.body).appendChild(t);
            t.select();
            try { document.execCommand('copy'); toast(listo); } catch (e) { toast('No se pudo copiar: seleccione el texto y cópielo.'); }
            t.remove();
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(function () { toast(listo); }, aMano); else aMano();
    }
    function pintarHallazgos() {
        var q = $('hall-buscar').value.trim(), idx = buscarHallazgos(q), conForm = dlg.open;
        $('hall-cuenta').textContent = !q ? HALLAZGOS.length + ' mensajes. Escriba qué vio para encontrar el que sirve.'
            : idx.length ? idx.length + (idx.length === 1 ? ' mensaje' : ' mensajes') + ' con "' + q + '"'
            : 'Nada con "' + q + '". Pruebe con otra palabra: piedras, peatones, EPP, lluvia, combustible…';
        $('hall-lista').innerHTML = idx.map(function (i) {
            var h = HALLAZGOS[i];
            return '<div class="hallazgo"><b>' + esc(h.t) + '</b><p>' + esc(h.m) + '</p><div class="botones">' +
                '<button type="button" class="wa pequeno" data-copiar="' + i + '">Copiar</button>' +
                '<a class="boton secundario pequeno" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(h.m) + '">Abrir WhatsApp</a>' +
                (conForm ? '<button type="button" class="secundario pequeno" data-agregar="' + i + '">➕ A la observación</button>' : '') +
                '</div></div>';
        }).join('');
        $('hall-lista').scrollTop = 0;
    }
    function abrirHallazgos(q) {
        $('hall-buscar').value = q || '';
        pintarHallazgos();
        $('dlg-hallazgos').showModal();
        if (!q) $('hall-buscar').focus();
    }
    $('btn-hallazgos').onclick = function () { abrirHallazgos(''); };
    $('hall-buscar').addEventListener('input', pintarHallazgos);
    $('hall-cerrar').onclick = function () { $('dlg-hallazgos').close(); };
    $('hall-lista').onclick = function (ev) {
        var c = ev.target.closest('[data-copiar]'), a = ev.target.closest('[data-agregar]');
        if (c) copiarTexto(HALLAZGOS[c.dataset.copiar].m, 'Mensaje copiado. Péguelo en el grupo de WhatsApp.');
        if (!a) return;
        var obs = campoObs(), actual = obs.value.trim(), m = HALLAZGOS[a.dataset.agregar].m;
        obs.value = !actual || norm(actual) === 'SIN NOVEDAD' ? m : actual.replace(/\.?$/, '.') + ' ' + m;
        obs.dispatchEvent(new Event('input', { bubbles: true }));
        $('dlg-hallazgos').close();
        toast('Agregado a la observación. Puede ajustarlo.');
    };
    // Solo lo que escribió el interventor: un mensaje ya agregado no vuelve a sugerir los suyos
    function sugerirHallazgos() {
        var texto = campoObs().value;
        HALLAZGOS.forEach(function (h) { texto = texto.split(h.m).join(' '); });
        var idx = buscarHallazgos(texto, true).slice(0, 3);
        $('obs-sug').hidden = !idx.length;
        $('obs-sug').innerHTML = idx.length ? '💡 Posibles hallazgos: ' + idx.map(function (i) {
            return '<button type="button" data-hall="' + i + '" title="Ver el mensaje">' + esc(HALLAZGOS[i].t) + '</button>';
        }).join('') : '';
    }
    $('obs-sug').onclick = function (ev) { var b = ev.target.closest('[data-hall]'); if (b) abrirHallazgos(HALLAZGOS[b.dataset.hall].t); };

    // ---------- Buena operación (src/subsanaciones/buenaoperacion.js) ----------
    // Mensajes de lo que se ve bien: uno por uno (Copiar) o varios marcados en un solo mensaje (pie). Abre vacía: al cerrar
    // se borran dónde, la búsqueda y lo marcado
    var buenasMarcadas = [];
    function pintarBuenas() {
        var q = $('bo-buscar').value.trim(), lugar = $('bo-donde').value, solo = $('bo-solo').checked, conForm = dlg.open;
        var idx = buscarBuenas(q);
        if (solo) idx = idx.filter(function (i) { return buenasMarcadas.indexOf(i) !== -1; });
        $('bo-cuenta').textContent = (q ? idx.length + (idx.length === 1 ? ' mensaje' : ' mensajes') + ' con "' + q + '"' : BUENAS.length + ' mensajes') +
            (buenasMarcadas.length ? ' · ' + buenasMarcadas.length + (buenasMarcadas.length === 1 ? ' marcado' : ' marcados') : '') +
            (!idx.length ? (solo ? '. No hay marcados aquí.' : '. Pruebe con otra palabra: mallas, señales, EPP, barrido, fotos…') : '');
        var grupo = '';
        $('bo-lista').innerHTML = idx.map(function (i) {
            var b = BUENAS[i], si = buenasMarcadas.indexOf(i) !== -1;
            var cab = !q && !solo && b.g !== grupo ? '<h3 class="bo-grupo">' + esc(grupo = b.g) + '</h3>' : '';
            return cab + '<div class="bo-item' + (si ? ' marcado' : '') + '"><label class="bo-marca"><input type="checkbox" data-marcar="' + i + '"' + (si ? ' checked' : '') + '>' +
                '<span><b>' + esc(b.t) + '</b><span class="bo-texto">' + esc(mensajeBuena(i, lugar)) + '</span></span></label>' +
                '<div class="botones"><button type="button" class="wa pequeno" data-copiar="' + i + '">📋 Copiar</button>' +
                (conForm ? '<button type="button" class="secundario pequeno" data-agregar="' + i + '">➕ A la observación</button>' : '') + '</div></div>';
        }).join('');
        var todo = mensajeVarios(buenasMarcadas, lugar);
        $('bo-vista').hidden = buenasMarcadas.length < 2;
        $('bo-vista').textContent = todo;
        $('bo-copiar').disabled = !buenasMarcadas.length;
        $('bo-copiar').textContent = buenasMarcadas.length ? '📋 Copiar ' + (buenasMarcadas.length === 1 ? 'el marcado' : 'los ' + buenasMarcadas.length + ' marcados') : '📋 Copiar marcados';
        $('bo-wa').hidden = !buenasMarcadas.length;
        $('bo-wa').href = 'https://wa.me/?text=' + encodeURIComponent(todo);
    }
    $('btn-buenas').onclick = function () { pintarBuenas(); $('dlg-buenas').showModal(); $('bo-donde').focus(); };
    $('bo-buscar').addEventListener('input', function () { pintarBuenas(); $('bo-lista').scrollTop = 0; });
    $('bo-donde').addEventListener('input', pintarBuenas);
    $('bo-solo').addEventListener('change', pintarBuenas);
    $('bo-x').onclick = $('bo-cerrar').onclick = function () { $('dlg-buenas').close(); };
    $('dlg-buenas').addEventListener('close', function () {
        buenasMarcadas = [];
        $('bo-donde').value = $('bo-buscar').value = '';
        $('bo-solo').checked = false;
        $('bo-lista').innerHTML = $('bo-vista').textContent = '';
    });
    $('bo-lista').addEventListener('change', function (ev) {
        var c = ev.target.closest('[data-marcar]');
        if (!c) return;
        var i = +c.dataset.marcar, k = buenasMarcadas.indexOf(i), y = $('bo-lista').scrollTop;
        if (c.checked && k === -1) buenasMarcadas.push(i); else if (!c.checked && k !== -1) buenasMarcadas.splice(k, 1);
        pintarBuenas();
        $('bo-lista').scrollTop = y;
    });
    $('bo-lista').addEventListener('click', function (ev) {
        var c = ev.target.closest('[data-copiar]'), a = ev.target.closest('[data-agregar]');
        if (c) copiarTexto(mensajeBuena(+c.dataset.copiar, $('bo-donde').value), 'Mensaje copiado. Péguelo en el grupo de WhatsApp.');
        if (!a) return;
        var obs = campoObs(), actual = obs.value.trim(), m = mensajeBuena(+a.dataset.agregar, $('bo-donde').value);
        obs.value = !actual || norm(actual) === 'SIN NOVEDAD' ? m : actual.replace(/\.?$/, '.') + ' ' + m;
        obs.dispatchEvent(new Event('input', { bubbles: true }));
        $('dlg-buenas').close();
        toast('Agregado a la observación. Puede ajustarlo.');
    });
    $('bo-copiar').onclick = function () {
        if (buenasMarcadas.length) copiarTexto(mensajeVarios(buenasMarcadas, $('bo-donde').value), 'Mensaje copiado. Péguelo en el grupo de WhatsApp.');
    };

    // ---------- Texto a imagen (src/subsanaciones/textoimagen.js) ----------
    // Lo escrito queda en el equipo mientras no se guarde (si se cierra sin querer no se pierde); colores y letra se recuerdan
    var NOTA = 'subsanaciones_nota', nota = { texto: '', estilo: 'blanco', fecha: true, numeros: true };
    try { nota = Object.assign(nota, JSON.parse(localStorage.getItem(NOTA)) || {}); } catch (e) {}
    function guardarNota() { try { localStorage.setItem(NOTA, JSON.stringify(nota)); } catch (e) {} }
    function pintarNota() {
        $('nota-estilos').querySelectorAll('[data-estilo]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.estilo === nota.estilo); });
        dibujarNota($('nota-canvas'), { texto: nota.texto || 'Escriba el texto', estilo: nota.estilo,
            pie: nota.fecha ? pieFecha(new Date()) : '' });
    }
    $('nota-estilos').innerHTML = Object.keys(ESTILOS_NOTA).map(function (k) {
        var e = ESTILOS_NOTA[k];
        return '<button type="button" role="radio" data-estilo="' + k + '" title="' + e.nombre + '" aria-label="' + e.nombre + '" style="background:' + e.fondo + ';outline:3px solid ' + e.acento + ';outline-offset:-6px"></button>';
    }).join('');
    // 🔢 Solo números: el celular muestra el teclado numérico (para el número del lote). Siempre arranca así;
    // quitarlo vale solo hasta cerrar la ventana
    function tecladoNota() {
        $('nota-texto').inputMode = nota.numeros ? 'numeric' : 'text';
        $('nota-numeros').setAttribute('aria-pressed', !!nota.numeros);
    }
    $('nota-numeros').onclick = function () {
        nota.numeros = !nota.numeros; tecladoNota();
        // El teclado cambia solo al volver a enfocar el campo
        $('nota-texto').blur(); $('nota-texto').focus();
    };
    $('nota-borrar').onclick = function () {
        $('nota-texto').value = ''; nota.texto = ''; guardarNota(); pintarNota(); $('nota-texto').focus();
    };
    $('btn-nota').onclick = function () {
        nota.numeros = true;
        $('nota-texto').value = nota.texto; $('nota-fecha').checked = nota.fecha; tecladoNota();
        $('nota-compartir').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
        pintarNota();
        $('dlg-nota').showModal();
        if (!nota.texto) $('nota-texto').focus();
    };
    $('dlg-nota').addEventListener('input', function () {
        nota.texto = $('nota-texto').value; nota.fecha = $('nota-fecha').checked;
        guardarNota(); pintarNota();
    });
    $('nota-estilos').onclick = function (ev) { var b = ev.target.closest('[data-estilo]'); if (b) { nota.estilo = b.dataset.estilo; guardarNota(); pintarNota(); } };
    $('nota-cerrar').onclick = function () { $('dlg-nota').close(); };
    // Desde la ficha del mapa: subsanaciones.html?nota=396&volver=mapa_rapido.html%3Flote%3D... abre la imagen con el
    // número ya puesto y un botón para volver al mapa con los mismos lotes y ese lote abierto
    (function () {
        var q = new URLSearchParams(location.search), texto = q.get('nota'), volver = q.get('volver') || '';
        if (texto == null) return;
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
        nota.texto = texto; guardarNota();
        $('nota-volver').hidden = !/^mapa_rapido\.html(\?|$)/.test(volver);
        if (!$('nota-volver').hidden) $('nota-volver').href = volver;
        $('btn-nota').onclick();
    })();
    function imagenNota() {
        if (!nota.texto.trim()) { $('nota-texto').focus(); toast('Escriba el texto de la imagen.'); return null; }
        pintarNota();
        return aArchivo($('nota-canvas'));
    }
    // Guardar: queda en Descargas (la galería del celular la muestra); el texto se borra para la próxima
    $('nota-guardar').onclick = function () {
        var p = imagenNota();
        if (p) p.then(function (f) {
            var a = document.createElement('a'), url = URL.createObjectURL(f);
            a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
            nota.texto = ''; guardarNota();
            $('dlg-nota').close();
            toast('✓ Imagen guardada en el celular (Descargas): ' + f.name);
        }).catch(function (e) { toast('No se pudo guardar la imagen: ' + e.message); });
    };
    // Compartir: WhatsApp, Drive o "Guardar en Fotos" según lo que ofrezca el celular
    $('nota-compartir').onclick = function () {
        var p = imagenNota();
        if (p) p.then(function (f) { return navigator.share({ files: [f] }); })
            .catch(function (e) { if (e && e.name !== 'AbortError') toast('No se pudo compartir: ' + e.message); });
    };

    // ---------- Fotos a PDF (src/subsanaciones/fotospdf.js) ----------
    var fotosOcupado = false, fotosElegidas = [];
    function listarFotos() {
        var lista = ordenarFotos(fotosElegidas, $('fotos-orden').value);
        var sinDatos = lista.filter(function (f) { return !f.gps || !f.fecha; }).length;
        var peso = lista.reduce(function (s, f) { return s + f.archivo.size; }, 0) / 1048576;
        $('fotos-resumen').innerHTML = lista.length ? lista.length + ' foto' + (lista.length === 1 ? '' : 's') + ' · ' + peso.toFixed(1).replace('.', ',') + ' MB' +
            (sinDatos ? ' · <span class="aviso-fotos">⚠ ' + sinDatos + ' sin GPS o sin fecha (el contrato las exige: un lote sin esos datos puede quedar en 0 m²)</span>' : ' · ✓ todas con GPS y fecha') : '';
        $('fotos-lista').innerHTML = lista.map(function (f) {
            var falta = !f.gps || !f.fecha;
            return '<li class="' + (falta ? 'falta' : '') + '"><span>' + esc(f.nombre) + '</span><span class="datos">' +
                (f.fecha ? esc(fechaCorta(f.fecha)) : '⚠ sin fecha') + ' · ' + (f.gps ? '📍' : '⚠ sin GPS') + '</span></li>';
        }).join('');
        $('fotos-convertir').disabled = !lista.length || fotosOcupado;
    }
    // Lo escrito en "Lote o microrruta" se completa con la programación: 477 -> "Lote 477 · Z2CC0257"
    function rotuloFotos() {
        var v = $('fotos-rotulo').value.trim(), mr = v.toUpperCase().replace(/\s+/g, '');
        if (!v) return '';
        if (/^\d+$/.test(v)) return 'Lote ' + v + (mrPorLote[v] ? ' · ' + mrPorLote[v] : '');
        if (LOTES[mr]) return mr + (LOTES[mr].lote && LOTES[mr].lote !== 'NA' ? ' · Lote ' + LOTES[mr].lote : '');
        return v;
    }
    $('fotos-rotulo').addEventListener('input', function () {
        var r = rotuloFotos();
        $('fotos-rotulo-ver').textContent = r ? 'En cada foto, en grande: ' + r : '';
        if (r) $('fotos-nombre').value = r.replace(/ · /g, ' ') + ' ' + new Date().toISOString().slice(0, 10);
    });
    $('btn-fotos').onclick = function () {
        if (!fotosOcupado) {
            fotosElegidas = []; $('fotos-archivos').value = ''; $('fotos-rotulo').value = ''; $('fotos-rotulo-ver').textContent = '';
            $('fotos-nombre').value = 'Fotos ' + new Date().toISOString().slice(0, 10); listarFotos();
        }
        $('dlg-fotos').showModal();
    };
    $('fotos-elegir').onclick = function () { if (!fotosOcupado) $('fotos-archivos').click(); };
    // 🔤 Imágenes a texto: una o muchas, o pegadas; el texto de todas en un solo cuadro (con el nombre de cada una si se quiere)
    var ocrLeidas = [], ocrOcupado = false;
    function pintarOcr() {
        var titulos = $('ocr-titulos').checked;
        $('ocr-texto').value = ocrLeidas.map(function (r) {
            var t = r.texto || '(' + r.error + ')';
            return titulos && ocrLeidas.length > 1 ? '── ' + r.nombre + ' ──\n' + t : t;
        }).join('\n\n');
        $('ocr-copiar').disabled = $('ocr-descargar').disabled = !ocrLeidas.length;
    }
    async function leerOcr(files) {
        files = ordenarPorNombre(files.filter(function (f) { return /^image\//.test(f.type); }));
        if (!files.length || ocrOcupado) return;
        ocrOcupado = true;
        $('ocr-elegir').disabled = true;
        $('ocr-estado').textContent = 'Preparando el lector… (la primera vez se descarga, puede tardar)';
        try {
            ocrLeidas = await leerImagenes(files, function (i, t, n) { $('ocr-estado').textContent = 'Leyendo ' + (i + 1) + ' de ' + t + ': ' + n + '…'; });
            var malas = ocrLeidas.filter(function (r) { return !r.texto; }).length;
            $('ocr-estado').textContent = '✓ ' + (ocrLeidas.length - malas) + ' de ' + ocrLeidas.length + (ocrLeidas.length === 1 ? ' imagen leída' : ' imágenes leídas') +
                (malas ? ' · ' + malas + ' sin texto' : '') + '.';
            pintarOcr();
        } catch (e) {
            $('ocr-estado').textContent = 'No se pudo leer: ' + ((e && e.message) || e);
        } finally {
            ocrOcupado = false;
            $('ocr-elegir').disabled = false;
            $('ocr-archivos').value = '';
        }
    }
    $('btn-ocr').onclick = function () {
        if (!ocrOcupado) { ocrLeidas = []; $('ocr-estado').textContent = ''; pintarOcr(); }
        $('dlg-ocr').showModal();
    };
    $('ocr-elegir').onclick = function () { if (!ocrOcupado) $('ocr-archivos').click(); };
    $('ocr-archivos').onchange = function () { leerOcr(Array.prototype.slice.call(this.files || [])); };
    $('dlg-ocr').addEventListener('paste', function (ev) {
        var files = Array.prototype.slice.call((ev.clipboardData && ev.clipboardData.files) || []);
        if (files.length) { ev.preventDefault(); leerOcr(files.map(function (f, i) { return f.name && f.name !== 'image.png' ? f : new File([f], 'pegada ' + (i + 1) + '.png', { type: f.type }); })); }
    });
    $('ocr-titulos').onchange = pintarOcr;
    $('ocr-copiar').onclick = function () { copiarTexto($('ocr-texto').value, 'Texto copiado'); };
    $('ocr-descargar').onclick = function () {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([$('ocr-texto').value], { type: 'text/plain;charset=utf-8' }));
        a.download = 'Texto de imágenes ' + new Date().toISOString().slice(0, 10) + '.txt';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    $('ocr-cerrar').onclick = function () { $('dlg-ocr').close(); };
    $('fotos-archivos').onchange = async function () {
        $('fotos-resumen').textContent = 'Leyendo fotos…';
        fotosElegidas = await examinar(Array.prototype.slice.call($('fotos-archivos').files || []));
        listarFotos();
    };
    $('fotos-orden').onchange = listarFotos;
    $('fotos-cerrar').onclick = function () { $('dlg-fotos').close(); };
    $('fotos-convertir').onclick = function () {
        if (!fotosElegidas.length || fotosOcupado) return;
        fotosOcupado = true;
        $('fotos-convertir').disabled = $('fotos-elegir').disabled = true;
        var lista = ordenarFotos(fotosElegidas, $('fotos-orden').value);
        fotosAPdf(lista, { diseno: $('fotos-diseno').value, reducir: $('fotos-reducir').checked, nombre: $('fotos-nombre').value, rotulo: rotuloFotos() }, function (h, t) {
            $('fotos-convertir').textContent = 'Foto ' + h + ' de ' + t + '…';
        }).then(function (r) {
            toast(!r.paginas ? 'No se pudo leer ninguna foto.' : 'Listo: ' + r.nombre + ' (' + r.paginas + ' página' + (r.paginas === 1 ? '' : 's') + ')' +
                (r.omitidas.length ? ' · no se pudieron leer: ' + r.omitidas.join(', ') : ''));
        }).catch(function (e) { toast('No se pudo crear el PDF: ' + e.message); })
          .finally(function () {
              fotosOcupado = false;
              $('fotos-convertir').textContent = 'Crear PDF';
              $('fotos-convertir').disabled = $('fotos-elegir').disabled = !fotosElegidas.length;
              $('fotos-elegir').disabled = false;
          });
    };

    // ---------- Programación del día (src/subsanaciones/programacion.js) ----------
    // El Excel del mes se lee en este equipo (con las filas ocultas por el filtro) y queda guardado aquí hasta subir otro.
    // Las visitas de lote ejecutado registradas en la app cuentan como hechas aunque el Excel no tenga la X
    var PROG_CACHE = 'programacion_cache', progDatos = null;
    try { progDatos = JSON.parse(localStorage.getItem(PROG_CACHE)) || null; } catch (e) { progDatos = null; }
    // Lotes con visita de lote ejecutado en la app, por quincena del mes: { 'aaaa-mm|q': { lote: 1, MR: 1 } }
    function visitasPorQuincena(mes) {
        var out = {};
        registros.forEach(function (r) {
            if (!deLote(r)) return;
            var f = fechaISO(r['FECHA DE EJECUCIÓN']) || fechaISO(r['FECHA DE LA VISITA']);
            if (!f || f.slice(0, 7) !== mes) return;
            var sd = semanaProg(mes, f);
            if (!sd) return;
            var k = mes + '|' + quincenaProg(sd.semana), s = out[k] = out[k] || {};
            // Se guarda la fecha de la última visita (sirve como «sí» y para decir cuándo se hizo)
            var lote = String(r.LOTE || '').trim(), mr = String(r.MICRORRUTA || '').trim().toUpperCase();
            if (lote && !/^N\/?A$/i.test(lote) && !(s['L' + lote] >= f)) s['L' + lote] = f;
            if (mr && !(s['M' + mr] >= f)) s['M' + mr] = f;
        });
        return out;
    }
    function idMapaProg(x) { return x.lote && !/^N\/?A$/i.test(x.lote) && enMapaPorLote(x.lote) ? x.lote : x.mr; }
    function chipLote(x, enApp) {
        var cls = x.hecho ? ' hecho' : enApp(x) ? ' app' : '';
        return '<a class="lote' + cls + '" href="' + esc(urlMapa(x.mr, x.lote)) + '" title="' + esc(x.dir) + (x.hecho ? ' · marcado ' + aTexto(x.fecha) : enApp(x) ? ' · con visita en la app' : '') + '">' +
            esc(x.mr + (x.lote && !/^N\/?A$/i.test(x.lote) ? ' · ' + x.lote : '')) + (x.hecho ? ' ✓' : enApp(x) ? ' ◉' : '') + '</a>';
    }
    function pintarProg() {
        var hay = !!(progDatos && progDatos.prog);
        $('prog-controles').hidden = !hay;
        $('prog-pestanas').hidden = !hay;
        $('prog-consulta').hidden = !hay;
        $('prog-texto').disabled = !hay;
        if (!hay) { $('prog-dia').innerHTML = $('prog-cuadrillas').innerHTML = $('prog-especiales').innerHTML = ''; return; }
        var prog = progDatos.prog, fecha = $('prog-fecha').value || hoy();
        var vis = visitasPorQuincena(prog.mes);
        var est = estadoDelDia(prog, fecha, function (x) {
            var s = vis[prog.mes + '|' + quincenaProg((semanaProg(prog.mes, fecha) || { semana: 1 }).semana)] || {};
            return !!(s['L' + x.lote] || s['M' + x.mr]);
        });
        var enApp = function (x) {
            var s = vis[prog.mes + '|' + est.quincena] || {};
            return !x.hecho && !!(s['L' + x.lote] || s['M' + x.mr]);
        };
        var fueraMes = fecha.slice(0, 7) !== prog.mes;
        $('prog-estado').innerHTML = '📄 ' + esc(progDatos.archivo) + ' · ' + prog.q1.length + ' lotes en Q1, ' + prog.q2.length + ' en Q2 · cargado ' + esc(progDatos.cargado) +
            (fueraMes ? '<br><span class="aviso-fotos">⚠ El día elegido no es del mes de este Excel (' + esc(prog.mes) + '): suba la programación de ese mes.</span>' : '');
        var tot = est.cuadrillas.reduce(function (a, c) { a.l += c.total; a.h += c.hechos; a.at += c.atrasados.length; a.app += c.soloApp; return a; }, { l: 0, h: 0, at: 0, app: 0 });
        $('prog-dia').innerHTML = '<b>' + (est.domingo ? 'Domingo' : nombreDia(est.dia).replace(/^./, function (l) { return l.toUpperCase(); })) + ' ' + aTexto(fecha) +
            '</b> · semana ' + est.semana + (est.dia ? ', día ' + est.dia : '') + ' · quincena ' + est.quincena +
            '<div class="chips">' + chipsQuincenas(prog, fecha, est.quincena, vis) +
            (tot.at ? '<span class="prog-chip atraso">' + tot.at + ' atrasados</span>' : '<span class="prog-chip ok">sin atrasos</span>') +
            (tot.app ? '<span class="prog-chip" title="Sin X en el Excel pero con visita registrada en la app">◉ ' + tot.app + ' solo en la app</span>' : '') + '</div>';
        // Selector de cuadrilla (se conserva la elegida)
        var sel = $('prog-cuad'), actual = sel.value;
        sel.innerHTML = '<option value="">Todas</option>' + est.cuadrillas.map(function (c) { return '<option value="' + esc(c.cuad) + '">Cuadrilla ' + esc(c.cuad) + '</option>'; }).join('');
        sel.value = actual;
        $('prog-cuadrillas').innerHTML = est.cuadrillas.filter(function (c) { return !sel.value || c.cuad === sel.value; }).map(function (c) {
            var pct = c.total ? Math.round(100 * c.hechos / c.total) : 0;
            var estado = c.atrasados.length ? '<span class="prog-chip atraso">' + c.atrasados.length + ' atrasados</span>' : c.adelantados ? '<span class="prog-chip ok">adelantada</span>' : '<span class="prog-chip ok">al día</span>';
            var ids = c.hoy.map(idMapaProg);
            return '<section class="prog-cuad" style="--c:' + colorCuadrilla(c.cuad) + '"><h3>Cuadrilla ' + esc(c.cuad) + ' ' + estado +
                '<span class="barra" title="' + pct + ' %"><i style="width:' + pct + '%"></i></span><small>Q' + est.quincena + ': ' + c.hechos + ' de ' + c.total + '</small></h3>' +
                '<div class="fila"><b>Hoy le toca:</b> ' + (c.hoy.length ? c.hoy.map(function (x) { return chipLote(x, enApp); }).join('') : (est.domingo ? 'domingo, sin programación' : 'nada programado para este día')) + '</div>' +
                (c.ultimo ? '<div class="fila"><b>Va en:</b> ' + (c.siguen.length ? c.siguen.map(function (x) { return chipLote(x, enApp); }).join('') : 'terminó lo programado') +
                    ' <span class="sub">(último marcado ' + aTexto(c.ultimo.fecha) + ': ' + esc(c.ultimo.lotes.slice(-2).map(function (x) { return x.lote || x.mr; }).join(', ')) + ')</span></div>'
                    : '<div class="fila"><b>Va en:</b> <span class="sub">sin nada marcado con X en el Excel' + (c.soloApp ? '; ' + c.soloApp + ' con visita en la app' : '') + '</span></div>') +
                (c.atrasados.length ? '<details><summary>Atrasados (' + c.atrasados.length + ' de ' + c.debian + ' que ya debían estar)</summary>' +
                    c.atrasados.map(function (x) { return chipLote(x, enApp); }).join('') + '</details>' : '') +
                detallesAvance(prog, fecha, c.cuad, vis, est.quincena) +
                (c.obs.length ? c.obs.slice(0, 4).map(function (x) { return '<div class="obs">⚠ ' + esc((x.lote || x.mr) + ': ' + x.obs) + '</div>'; }).join('') : '') +
                '<div class="acciones">' + (ids.length ? '<a class="boton secundario pequeno" href="' + esc('mapa_rapido.html?lote=' + ids.join(',')) + '">🗺️ Lo de hoy en el mapa</a>' : '') +
                    (c.atrasados.length ? '<a class="boton secundario pequeno" href="' + esc('mapa_rapido.html?lote=' + c.atrasados.map(idMapaProg).join(',')) + '">🗺️ Atrasados en el mapa</a>' : '') +
                    '<button type="button" class="secundario pequeno" data-prog-lista="' + esc(c.cuad) + '">📋 Ver sus lotes en el listado</button></div>' +
                '</section>';
        }).join('');
        var esp = especialesDeSemana(prog, fecha);
        $('prog-especiales').innerHTML = esp.length ? '<h3>Operaciones especiales de la semana</h3><ul>' + esp.map(function (e) {
            return '<li><b>' + aTexto(e.proxima) + '</b> · ' + esc(e.ruta) + (e.dir ? ' · ' + esc(e.dir) : '') + (e.area ? ' · ' + Math.round(e.area).toLocaleString('es-CO') + ' m²' : '') +
                (e.ejecutado ? ' · ✓ ejecutado' + (e.ejecutado.length > 3 ? ' ' + aTexto(e.ejecutado) : '') : '') + (e.obs ? '<br><span class="sub">' + esc(e.obs) + '</span>' : '') +
                accionesEspecial(e) + '</li>';
        }).join('') + '</ul>' + (prog.sif && prog.sif.cc ? '<div class="sub">Rutas SIF de corte: ' + prog.sif.cc.q1 + ' de ' + prog.sif.cc.total + ' con ejecución en Q1' +
            (prog.sif.esp ? ' · espartillos: ' + prog.sif.esp.q1 + ' de ' + prog.sif.esp.total : '') + '</div>' : '') : '';
        if (progVista === 'lista') pintarListaProg();
        if ($('prog-buscar-lote').value.trim()) consultarLoteProg();
    }
    // «vie 13/11» de una fecha aaaa-mm-dd
    var DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    function diaCorto(f) { return f ? DIAS_CORTOS[new Date(f + 'T12:00:00Z').getUTCDay()] + ' ' + aTexto(f).slice(0, 5) : ''; }
    function diaLargo(f) { var n = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(f + 'T12:00:00Z').getUTCDay()]; return n + ' ' + aTexto(f); }
    // Visitas de la app de una quincena: fecha ('' si no hay o si el lote ya tiene la X)
    function appDeQuincena(prog, vis, q) {
        var s = vis[prog.mes + '|' + q] || {};
        return function (x) { return x.hecho ? '' : s['L' + x.lote] || s['M' + x.mr] || ''; };
    }
    function quincenasConLotes(prog) { return [1, 2].filter(function (q) { return (q === 1 ? prog.q1 : prog.q2 || []).length; }); }
    function textoRango(prog, q) { var r = rangoQuincena(prog, q); return aTexto(r.desde).slice(0, 5) + ' – ' + aTexto(r.hasta).slice(0, 5); }
    // Arriba: cuántos van hechos en cada quincena (de la otra: lo que quedó sin hacer o cuándo empieza)
    function chipsQuincenas(prog, fecha, qHoy, vis) {
        return quincenasConLotes(prog).map(function (q) {
            var L = q === 1 ? prog.q1 : prog.q2, app = appDeQuincena(prog, vis, q);
            var h = L.filter(function (x) { return x.hecho || app(x); }).length, r = rangoQuincena(prog, q);
            var extra = q === qHoy ? '' : fecha < r.desde ? ' · empieza ' + diaCorto(r.desde) : L.length > h ? ' · ' + (L.length - h) + ' sin hacer' : '';
            return '<span class="prog-chip' + (q === qHoy ? '' : ' prog-chip-otra') + '" title="Q' + q + ': ' + esc(textoRango(prog, q)) + '">Q' + q + ': ' + h + ' de ' + L.length + ' hechos' + esc(extra) + '</span>';
        }).join('');
    }
    // Tarjeta de la cuadrilla: por quincena, cuáles lleva (por fecha en que se hicieron) y cuáles le faltan (por día programado)
    function detallesAvance(prog, fecha, cuad, vis, qHoy) {
        return quincenasConLotes(prog).map(function (q) {
            var lotes = (q === 1 ? prog.q1 : prog.q2).filter(function (x) { return x.cuad === cuad; });
            if (!lotes.length) return '';
            var appF = appDeQuincena(prog, vis, q), enApp = function (x) { return !!appF(x); };
            var av = avanceCuadrilla(lotes, prog, fecha, appF), k = av.cuenta, r = rangoQuincena(prog, q);
            var chips = function (L) { return L.map(function (x) { return chipLote(x, enApp); }).join(''); };
            var partes = [k.atrasado && k.atrasado + (q === qHoy ? ' atrasados' : ' sin hacer'), k.hoy && k.hoy + ' de hoy', k.pendiente && k.pendiente + ' por venir', k.sin && k.sin + ' sin día'].filter(Boolean);
            return '<div class="prog-avq' + (q === qHoy ? ' actual' : '') + '"><div class="prog-avq-tit"><b>Q' + q + '</b> ' + esc(textoRango(prog, q)) +
                    (q === qHoy ? ' <span class="prog-chip">en curso</span>' : fecha < r.desde ? ' <span class="sub">(todavía no empieza)</span>' : ' <span class="sub">(ya pasó)</span>') + '</div>' +
                '<details class="prog-av llevan"><summary>Llevan ' + k.llevan + ' de ' + lotes.length + '</summary>' +
                    (av.llevan.length ? av.llevan.map(function (g) {
                        return '<div class="prog-av-dia"><span class="prog-av-fecha">' + (g.fecha ? esc(diaCorto(g.fecha)) : 'sin fecha') + '</span><span class="prog-av-lotes">' + chips(g.lotes) + '</span></div>';
                    }).join('') : '<div class="sub">Todavía ninguno.</div>') + '</details>' +
                '<details class="prog-av faltan"><summary>Faltan ' + k.faltan + (partes.length ? ' · ' + partes.join(' · ') : '') + '</summary>' +
                    (av.faltan.length ? av.faltan.map(function (g) {
                        return '<div class="prog-av-dia"><span class="prog-av-fecha ' + g.estado + '">' + (g.fecha ? esc(diaCorto(g.fecha)) + (g.estado === 'hoy' ? ' · hoy' : '') : 'sin día') + '</span><span class="prog-av-lotes">' + chips(g.lotes) + '</span></div>';
                    }).join('') : '<div class="sub">No le falta ninguno. 🎉</div>') + '</details></div>';
        }).join('');
    }

    // ---------- Consultar un lote: ¿se hizo?, ¿qué día le toca?, ¿de qué cuadrilla es? ----------
    var pcFichas = [];
    function consultarLoteProg() {
        var caja = $('prog-consulta-res'), texto = $('prog-buscar-lote').value.trim();
        pcFichas = [];
        $('prog-buscar-limpiar').hidden = !texto;
        if (!texto || !progDatos) { caja.innerHTML = ''; return; }
        var prog = progDatos.prog, fecha = $('prog-fecha').value || hoy(), vis = visitasPorQuincena(prog.mes);
        var res = consultarLotes(prog, texto, fecha, function (x, q) {
            var s = vis[prog.mes + '|' + q] || {};
            return x.hecho ? '' : s['L' + x.lote] || s['M' + x.mr] || '';
        });
        if (!res.length) { caja.innerHTML = '<div class="prog-ficha-nada">Escriba el número del lote (p. ej. 524) o la microrruta (Z1CC0127).</div>'; return; }
        caja.innerHTML = res.map(function (r) {
            if (!r.fichas.length) return '<div class="prog-ficha-nada">«' + esc(r.termino.texto) + '» no está en la programación de ' + esc(prog.mes) +
                ' (ni en Q1 ni en Q2). Revise el número; si es nuevo, agréguelo desde la pestaña «Listado».</div>';
            return r.fichas.map(function (f) {
                var v = quincenaVigente(f, prog, fecha), i = pcFichas.push(v.x) - 1;
                return '<article class="prog-ficha" style="--c:' + colorCuadrilla(f.cuad) + '">' +
                    '<div class="prog-ficha-tit"><b>' + esc(f.mr + (f.lote && !/^N\/?A$/i.test(f.lote) ? ' · lote ' + f.lote : '')) + '</b>' +
                        '<span class="prog-est ' + v.estado + '">' + esc(ESTADOS_LOTE[v.estado]) + '</span></div>' +
                    '<div class="prog-ficha-veredicto ' + v.estado + '">' + veredictoLote(v, fecha) + '</div>' +
                    '<div class="sub">Cuadrilla ' + esc(f.cuad) + (f.dir ? ' · ' + esc(f.dir) : '') + (f.area ? ' · ' + Math.round(f.area).toLocaleString('es-CO') + ' m²' : '') +
                        (f.frec === 1 ? ' · mensual' : f.frec === 2 ? ' · quincenal' : '') + '</div>' +
                    '<ul class="prog-ficha-q">' + f.quincenas.map(function (e) {
                        return '<li><b>Q' + e.q + ':</b> ' + (e.plan ? 'programado el ' + esc(diaLargo(e.plan)) + ' (semana ' + e.x.semana + ', día ' + e.x.dia + ')' : 'sin día en el Excel') +
                            ' · <span class="prog-est ' + e.estado + '">' + esc(ESTADOS_LOTE[e.estado]) + '</span>' +
                            (e.x.hecho && e.x.fecha ? ' el ' + esc(aTexto(e.x.fecha)) : '') + (!e.x.hecho && typeof e.app === 'string' && e.app ? ' el ' + esc(aTexto(e.app)) : '') + '</li>';
                    }).join('') + '</ul>' +
                    (f.obs ? '<div class="prog-ficha-obs">⚠ ' + esc(f.obs) + '</div>' : '') +
                    f.quincenas.map(function (e) { return vamosEnLote(prog, e, vis, f.quincenas.length > 1, fecha); }).join('') +
                    '<div class="prog-ficha-acc"><a class="boton secundario pequeno" href="' + esc(urlMapa(f.mr, f.lote)) + '">🗺️ Ver en el mapa</a>' +
                        '<button type="button" class="secundario pequeno" data-pc="visita" data-i="' + i + '">📋 Registrar visita</button>' +
                        '<button type="button" class="secundario pequeno" data-pc="editar" data-i="' + i + '">✎ Editar</button></div>' +
                    '</article>';
            }).join('');
        }).join('');
    }
    // «Si van en este lote»: lo que quedó atrás sin hacer y lo que sigue, por fecha programada de su cuadrilla (misma quincena)
    // Si la quincena del lote todavía no empieza, lo de antes no está atrasado: es lo que hay que hacer antes de llegar a él
    function vamosEnLote(prog, v, vis, variasQ, fecha) {
        var r = rangoQuincena(prog, v.q), futura = fecha < r.desde;
        var s = vis[prog.mes + '|' + v.q] || {}, lotes = v.q === 2 ? prog.q2 : prog.q1;
        var enApp = function (y) { return !y.hecho && !!(s['L' + y.lote] || s['M' + y.mr]); };
        var d = desdeLote(lotes, v.x, function (y) { return y.hecho || enApp(y); });
        if (!d.posicion) return '';
        // Por día programado (los lotes ya vienen en ese orden): «jue 12/11  chip chip»
        var chips = function (L) {
            var grupos = [];
            L.forEach(function (y) {
                var f = y.semana != null && y.dia != null ? fechaPlanProg(prog.mes, y.semana, y.dia) : '', g = grupos[grupos.length - 1];
                if (!g || g.f !== f) grupos.push(g = { f: f, L: [] });
                g.L.push(y);
            });
            return grupos.map(function (g) {
                return '<div class="prog-av-dia"><span class="prog-av-fecha">' + (g.f ? esc(diaCorto(g.f)) : 'sin día') + '</span><span class="prog-av-lotes">' +
                    g.L.map(function (y) { return chipLote(y, enApp); }).join('') + '</span></div>';
            }).join('');
        };
        var mapa = function (L, txt) { return L.length ? '<a class="boton secundario pequeno" href="' + esc('mapa_rapido.html?lote=' + L.map(idMapaProg).join(',')) + '">🗺️ ' + txt + '</a>' : ''; };
        return '<details class="prog-vamos"><summary>📍 ' + (variasQ ? 'Q' + v.q + ' (' + esc(textoRango(prog, v.q)) + ') · ' : '') + 'Si van en este lote: ' + (futura ? d.antes.length + ' antes de este · ' : d.antes.length ? d.antes.length + ' quedaron atrás sin hacer · ' : 'nada atrás sin hacer · ') +
                (d.siguen.length ? d.siguen.length + ' siguen' : 'es el último') + (futura ? ' (empieza ' + esc(diaCorto(r.desde)) + ')' : '') + '</summary>' +
            '<div class="sub">Cuadrilla ' + esc(d.cuad) + ', Q' + v.q + ': es el ' + d.posicion + ' de ' + d.total + ' por fecha programada' +
                (d.hechosDespues ? ' · ' + d.hechosDespues + ' de los siguientes ya están hechos (adelantados)' : '') + '.</div>' +
            '<div class="prog-vamos-grupo">' + (futura ? '<b>Antes de este, por hacer (' + d.antes.length + ')</b> <span class="sub">la Q' + v.q + ' todavía no empieza: no están atrasados</span>'
                : '<b class="atras">Quedaron atrás sin hacer (' + d.antes.length + ')</b>') +
                (d.antes.length ? '<div>' + chips(d.antes) + '</div>' : '<div class="sub">Ninguno: todo lo anterior está hecho' + (d.hechosAntes ? ' (' + d.hechosAntes + ')' : '') + '.</div>') + '</div>' +
            '<div class="prog-vamos-grupo"><b>Siguen (' + d.siguen.length + ')</b>' +
                (d.siguen.length ? '<div>' + chips(d.siguen) + '</div>' : '<div class="sub">No falta nada después de este.</div>') + '</div>' +
            '<div class="prog-ficha-acc">' + mapa(d.antes, futura ? 'Los de antes en el mapa' : 'Los de atrás en el mapa') + mapa(d.siguen.slice(0, 10), 'Los próximos ' + Math.min(10, d.siguen.length) + ' en el mapa') + '</div>' +
            '</details>';
    }
    // La respuesta corta: sí / no / todavía no, con la fecha
    function veredictoLote(v, fecha) {
        var x = v.x;
        if (v.estado === 'hecho') return '✅ Sí se hizo' + (x.fecha ? ' el ' + esc(diaLargo(x.fecha)) : '') + ' (X en el Excel, Q' + v.q + ').';
        if (v.estado === 'app') return '✅ Sí se hizo' + (typeof v.app === 'string' && v.app ? ' el ' + esc(diaLargo(v.app)) : '') + ': hay visita en la app, pero el Excel no tiene la X (Q' + v.q + ').';
        if (v.estado === 'sin') return '❔ No se ha hecho y el Excel no dice qué día le toca (Q' + v.q + ').';
        if (v.estado === 'hoy') return '🕒 Todavía no: le toca hoy, ' + esc(diaLargo(v.plan)) + '.';
        if (v.estado === 'pendiente') return '🕒 Todavía no: le toca el ' + esc(diaLargo(v.plan)) + '.';
        var dias = Math.round((new Date(fecha + 'T00:00:00Z') - new Date(v.plan + 'T00:00:00Z')) / 864e5);
        return '❌ No se ha hecho: le tocaba el ' + esc(diaLargo(v.plan)) + (dias > 0 ? ' (' + dias + (dias === 1 ? ' día' : ' días') + ' de atraso)' : '') + '.';
    }
    $('prog-buscar-btn').onclick = consultarLoteProg;
    $('prog-buscar-limpiar').onclick = function () { $('prog-buscar-lote').value = ''; consultarLoteProg(); $('prog-buscar-lote').focus(); };
    $('prog-buscar-lote').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); consultarLoteProg(); } });
    $('prog-buscar-lote').addEventListener('input', function () { if (!this.value.trim()) consultarLoteProg(); });
    $('prog-consulta-res').onclick = function (ev) {
        var b = ev.target.closest('[data-pc]'), x = b && pcFichas[+b.dataset.i];
        if (!x) return;
        if (b.dataset.pc === 'editar') abrirLoteProg(x);
        else {
            $('dlg-prog').close();
            abrir({ MICRORRUTA: x.mr, LOTE: /^N\/?A$/i.test(x.lote) ? 'NA' : x.lote, CUADRILLA: x.cuad, ZONA: zonaDe(x.mr), 'FECHA DE EJECUCIÓN': x.fecha ? aTexto(x.fecha) : '' });
        }
    };
    // Al cerrar la ventana se borra la consulta (la programación sí queda guardada en el equipo)
    $('dlg-prog').addEventListener('close', function () { $('prog-buscar-lote').value = ''; $('prog-consulta-res').innerHTML = ''; pcFichas = []; });
    // Botones para ubicar la operación especial (las rurales sin nomenclatura solo en Google Maps)
    function accionesEspecial(e) {
        var en = enlacesEspecial(e);
        if (!en.mapa && !en.google) return '';
        return '<div class="prog-esp-acc">' +
            (en.mapa ? '<a class="boton secundario pequeno" href="' + esc(en.mapa) + '">🗺️ Ver en el mapa</a>' : '') +
            (en.google ? '<a class="boton secundario pequeno" href="' + esc(en.google) + '" target="_blank" rel="noopener">📍 Google Maps</a>' : '') +
            (en.mapa ? '' : '<span class="sub">Dirección rural: el mapa de lotes no la ubica.</span>') + '</div>';
    }
    // ---------- Programación: listado de todos los lotes de la quincena (ver, marcar, editar, agregar, quitar) ----------
    var progVista = 'dia', plPagina = 1, PL_POR = 30, plEditando = null;
    function guardarProg() {
        try { localStorage.setItem(PROG_CACHE, JSON.stringify(progDatos)); }
        catch (e) { toast('No se pudo guardar el cambio en este equipo (sin espacio).'); }
    }
    // Lotes visitados en la app en la quincena de la fecha (cuentan como hechos)
    function enAppProg(prog, fecha) {
        var vis = visitasPorQuincena(prog.mes), k = prog.mes + '|' + quincenaProg((semanaProg(prog.mes, fecha) || { semana: 1 }).semana), s = vis[k] || {};
        return function (x) { return !x.hecho && !!(s['L' + x.lote] || s['M' + x.mr]); };
    }
    function verProgVista(v) {
        progVista = v;
        $('prog-pestanas').querySelectorAll('[data-prog-vista]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.progVista === v); });
        $('prog-vista-dia').hidden = v !== 'dia';
        $('prog-vista-lista').hidden = v !== 'lista';
        pintarProg();
    }
    function filtradosProg() {
        var prog = progDatos.prog, fecha = $('prog-fecha').value || hoy(), enApp = enAppProg(prog, fecha);
        var cuad = $('prog-cuad').value, est = $('pl-estado').value, sem = $('pl-semana').value, q = norm($('pl-buscar').value);
        return lotesDeQuincena(prog, fecha).map(function (x) { return { x: x, est: estadoLote(x, prog, fecha, enApp) }; }).filter(function (f) {
            if (cuad && f.x.cuad !== cuad) return false;
            if (sem && String(f.x.semana) !== sem) return false;
            if (est === 'falta' ? ['atrasado', 'hoy', 'pendiente'].indexOf(f.est) === -1 : est === 'editado' ? !f.x.editado : est && f.est !== est) return false;
            return !q || norm([f.x.mr, f.x.lote, f.x.dir, f.x.obs].join(' ')).indexOf(q) !== -1;
        });
    }
    function pintarListaProg() {
        var prog = progDatos.prog, fecha = $('prog-fecha').value || hoy(), lotes = lotesDeQuincena(prog, fecha);
        // Semanas que trae la quincena
        var sel = $('pl-semana'), actual = sel.value, semanas = lotes.map(function (x) { return x.semana; }).filter(function (s, i, a) { return s != null && a.indexOf(s) === i; }).sort();
        sel.innerHTML = '<option value="">Semana: todas</option>' + semanas.map(function (s) { return '<option value="' + s + '">Semana ' + s + '</option>'; }).join('');
        sel.value = actual;
        var lista = filtradosProg(), paginas = Math.max(1, Math.ceil(lista.length / PL_POR));
        if (plPagina > paginas) plPagina = paginas;
        var ids = lista.map(function (f) { return idMapaProg(f.x); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        $('pl-cuenta').textContent = lista.length + (lista.length === 1 ? ' lote' : ' lotes') + (lista.length !== lotes.length ? ' de ' + lotes.length : '');
        $('pl-mapa').href = ids.length ? 'mapa_rapido.html?lote=' + ids.join(',') : '#';
        $('pl-mapa').classList.toggle('deshabilitado', !ids.length);
        $('pl-mapa').textContent = '🗺️ Ver ' + (ids.length === 1 ? 'el lote' : 'los ' + ids.length) + ' en el mapa';
        var desde = (plPagina - 1) * PL_POR, visibles = lista.slice(desde, desde + PL_POR), ultimaCuad = null;
        $('pl-tabla').innerHTML = '<thead><tr><th>Estado</th><th>Cuad.</th><th>Microrruta · lote</th><th>Dirección</th><th>Área m²</th><th>Programado</th><th>Ejecutado</th><th>Observación</th><th>Acciones</th></tr></thead><tbody>' +
            (visibles.length ? visibles.map(function (f) {
                var x = f.x, i = lotes.indexOf(x), sep = '';
                // Separador por cuadrilla cuando no hay una sola elegida
                if (!$('prog-cuad').value && x.cuad !== ultimaCuad) {
                    ultimaCuad = x.cuad;
                    sep = '<tr class="cuad-sep" style="--c:' + colorCuadrilla(x.cuad) + '"><td colspan="9">Cuadrilla ' + esc(x.cuad) + '</td></tr>';
                }
                var plan = x.semana && x.dia ? 'S' + x.semana + ' D' + x.dia + ' · ' + aTexto(fechaPlanProg(prog.mes, x.semana, x.dia)).slice(0, 5) : '—';
                return sep + '<tr><td data-et="Estado"><span class="prog-est ' + f.est + '">' + esc(ESTADOS_LOTE[f.est]) + '</span>' + (x.editado ? '<div class="prog-editado">✎ editado aquí</div>' : '') + '</td>' +
                    '<td data-et="Cuadrilla">' + esc(x.cuad) + '</td>' +
                    '<td data-et="Lote"><a href="' + esc(urlMapa(x.mr, x.lote)) + '" title="Ver en el mapa">' + esc(x.mr + (x.lote && !/^N\/?A$/i.test(x.lote) ? ' · ' + x.lote : '')) + '</a></td>' +
                    '<td class="dir" data-et="Dirección">' + esc(x.dir) + '</td>' +
                    '<td class="num" data-et="Área">' + (x.area ? Math.round(x.area).toLocaleString('es-CO') : '') + '</td>' +
                    '<td data-et="Programado">' + esc(plan) + '</td>' +
                    '<td data-et="Ejecutado">' + (x.fecha ? esc(aTexto(x.fecha)) : '') + '</td>' +
                    '<td data-et="Observación">' + esc(x.obs) + '</td>' +
                    '<td class="acc">' +
                        '<a class="boton secundario pequeno" href="' + esc(urlMapa(x.mr, x.lote)) + '" title="Ver en el mapa">🗺️</a>' +
                        '<button type="button" class="secundario pequeno" data-pl="marcar" data-i="' + i + '" title="' + (x.hecho ? 'Quitar la marca de hecho' : 'Marcar como hecho hoy') + '">' + (x.hecho ? '↺' : '✓') + '</button>' +
                        '<button type="button" class="secundario pequeno" data-pl="editar" data-i="' + i + '" title="Editar el lote">✎</button>' +
                        '<button type="button" class="secundario pequeno" data-pl="visita" data-i="' + i + '" title="Registrar la visita de este lote">📋</button>' +
                    '</td></tr>';
            }).join('') : '<tr><td colspan="9" class="sub">No hay lotes con esos filtros.</td></tr>') + '</tbody>';
        $('pl-paginas').innerHTML = paginas < 2 ? '' : '<button type="button" class="secundario pequeno" data-pl-pag="' + (plPagina - 1) + '"' + (plPagina === 1 ? ' disabled' : '') + '>‹ Anterior</button>' +
            '<span class="sub">Página ' + plPagina + ' de ' + paginas + ' · ' + (desde + 1) + '–' + Math.min(desde + PL_POR, lista.length) + '</span>' +
            '<button type="button" class="secundario pequeno" data-pl-pag="' + (plPagina + 1) + '"' + (plPagina === paginas ? ' disabled' : '') + '>Siguiente ›</button>';
    }
    function abrirLoteProg(x) {
        plEditando = x || null;
        x = x || { cuad: $('prog-cuad').value || '', mr: '', lote: '', area: '', dir: '', semana: '', dia: '', hecho: false, fecha: '', obs: '' };
        $('pll-titulo').textContent = plEditando ? 'Editar ' + x.mr + (x.lote ? ' · ' + x.lote : '') : 'Agregar lote a la programación';
        $('pll-cuad').value = x.cuad; $('pll-mr').value = x.mr; $('pll-lote').value = x.lote; $('pll-area').value = x.area || '';
        $('pll-dir').value = x.dir; $('pll-semana').value = x.semana || ''; $('pll-dia').value = x.dia || '';
        $('pll-hecho').checked = !!x.hecho; $('pll-fecha').value = x.fecha || ''; $('pll-obs').value = x.obs || '';
        $('pll-quitar').hidden = !plEditando;
        $('pll-aviso').textContent = '';
        $('dlg-prog-lote').showModal();
    }
    // Desde la tarjeta de una cuadrilla: el listado con esa cuadrilla elegida
    $('prog-cuadrillas').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-prog-lista]');
        if (!b) return;
        $('prog-cuad').value = b.dataset.progLista; plPagina = 1; verProgVista('lista');
    });
    $('prog-pestanas').onclick = function (ev) { var b = ev.target.closest('[data-prog-vista]'); if (b) verProgVista(b.dataset.progVista); };
    ['pl-estado', 'pl-semana'].forEach(function (id) { $(id).onchange = function () { plPagina = 1; pintarListaProg(); }; });
    $('pl-buscar').oninput = function () { plPagina = 1; pintarListaProg(); };
    $('pl-paginas').onclick = function (ev) { var b = ev.target.closest('[data-pl-pag]'); if (b && !b.disabled) { plPagina = +b.dataset.plPag; pintarListaProg(); $('pl-tabla').scrollIntoView({ block: 'nearest' }); } };
    $('pl-mapa').onclick = function (ev) { if (this.classList.contains('deshabilitado')) { ev.preventDefault(); toast('No hay lotes con esos filtros.'); } };
    $('pl-nuevo').onclick = function () { abrirLoteProg(null); };
    $('pl-tabla').onclick = function (ev) {
        var b = ev.target.closest('[data-pl]');
        if (!b) return;
        var prog = progDatos.prog, x = lotesDeQuincena(prog, $('prog-fecha').value || hoy())[+b.dataset.i];
        if (!x) return;
        if (b.dataset.pl === 'marcar') {
            x.hecho = !x.hecho;
            x.fecha = x.hecho ? (x.fecha || hoy()) : '';
            x.editado = true;
            guardarProg(); pintarProg();
            toast(x.mr + (x.hecho ? ' marcado como hecho.' : ': se quitó la marca.'));
        } else if (b.dataset.pl === 'editar') abrirLoteProg(x);
        else if (b.dataset.pl === 'visita') {
            $('dlg-prog').close();
            abrir({ MICRORRUTA: x.mr, LOTE: /^N\/?A$/i.test(x.lote) ? 'NA' : x.lote, CUADRILLA: x.cuad, ZONA: zonaDe(x.mr), 'FECHA DE EJECUCIÓN': x.fecha ? aTexto(x.fecha) : '' });
        }
    };
    $('pll-cancelar').onclick = function () { $('dlg-prog-lote').close(); };
    $('pll-guardar').onclick = function () {
        var mr = $('pll-mr').value.trim().toUpperCase().replace(/\s+/g, ''), lote = $('pll-lote').value.trim();
        if (!/^Z\d+CC\d+$/.test(mr)) { $('pll-aviso').innerHTML = '<span class="aviso-fotos">Escriba la microrruta como Z1CC0100.</span>'; $('pll-mr').focus(); return; }
        if (!$('pll-cuad').value.trim()) { $('pll-aviso').innerHTML = '<span class="aviso-fotos">Escriba la cuadrilla.</span>'; $('pll-cuad').focus(); return; }
        var sem = parseInt($('pll-semana').value, 10), dia = parseInt($('pll-dia').value, 10);
        var prog = progDatos.prog, lotes = lotesDeQuincena(prog, $('prog-fecha').value || hoy());
        var x = plEditando || { fila: lotes.reduce(function (m, y) { return Math.max(m, y.fila); }, 0) + 1, frec: null };
        x.cuad = $('pll-cuad').value.trim(); x.mr = mr; x.lote = lote || 'NA'; x.area = Number($('pll-area').value) || 0;
        x.dir = $('pll-dir').value.trim(); x.semana = isFinite(sem) ? sem : null; x.dia = isFinite(dia) && dia >= 1 && dia <= 6 ? dia : null;
        x.hecho = $('pll-hecho').checked; x.fecha = $('pll-fecha').value || (x.hecho ? hoy() : ''); x.obs = $('pll-obs').value.trim(); x.editado = true;
        if (!plEditando) lotes.push(x);
        guardarProg();
        $('dlg-prog-lote').close();
        pintarProg();
        toast(plEditando ? 'Cambios guardados.' : mr + ' agregado a la programación.');
    };
    $('pll-quitar').onclick = async function () {
        if (!plEditando) return;
        var x = plEditando;
        if (!(await confirmar('¿Quitar ' + x.mr + (x.lote ? ' · lote ' + x.lote : '') + ' de la programación?', 'Se quita de la programación guardada en este equipo. El Excel no cambia: si lo vuelve a subir, el lote vuelve a aparecer.', '🗑 Quitar'))) return;
        var prog = progDatos.prog;
        [prog.q1, prog.q2].forEach(function (l) { var k = l.indexOf(x); if (k !== -1) l.splice(k, 1); });
        guardarProg();
        $('dlg-prog-lote').close();
        pintarProg();
        toast(x.mr + ' quitado de la programación.');
    };
    // Excel del listado filtrado (con los cambios hechos aquí)
    $('pl-excel').onclick = async function () {
        var lista = filtradosProg();
        if (!lista.length) return toast('No hay lotes con esos filtros.');
        var b = this; b.disabled = true;
        try {
            var { default: ExcelJS } = await import('exceljs'), wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Programación');
            ws.addRow(['CUADRILLA', 'MICRORRUTA', 'LOTE', 'DIRECCIÓN', 'ÁREA m2', 'SEMANA', 'DÍA', 'FECHA PROGRAMADA', 'ESTADO', 'FECHA EJECUCIÓN', 'OBSERVACIÓN']).font = { bold: true };
            var prog = progDatos.prog;
            lista.forEach(function (f) {
                var x = f.x;
                ws.addRow([x.cuad, x.mr, x.lote, x.dir, x.area || '', x.semana || '', x.dia || '', x.semana && x.dia ? aTexto(fechaPlanProg(prog.mes, x.semana, x.dia)) : '',
                    ESTADOS_LOTE[f.est], x.fecha ? aTexto(x.fecha) : '', x.obs]);
            });
            ws.columns.forEach(function (c, i) { c.width = [10, 13, 8, 50, 10, 8, 6, 14, 20, 14, 40][i]; });
            ws.autoFilter = { from: 'A1', to: 'K1' };
            descargar(await wb.xlsx.writeBuffer(), 'Programacion_' + prog.mes + '_' + ($('prog-fecha').value || hoy()) + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } catch (e) { toast('No se pudo crear el Excel: ' + e.message); }
        finally { b.disabled = false; }
    };

    async function cargarProg(file) {
        if (!file) return;
        $('prog-elegir').disabled = true;
        $('prog-estado').textContent = 'Leyendo ' + file.name + '… (un libro grande tarda unos segundos)';
        try {
            var { default: ExcelJS } = await import('exceljs');
            var wb = new ExcelJS.Workbook();
            await wb.xlsx.load(await file.arrayBuffer());
            var hojas = {};
            wb.worksheets.forEach(function (ws) { hojas[ws.name] = filasHoja(ws); });
            var prog = leerProgramacion(hojas, file.name);
            if (!prog.q1.length && !prog.q2.length) throw new Error('no se encontraron lotes (hojas Q1, Q2 o PROGRAMACION con la columna MICRORRUTA)');
            if (!prog.mes) throw new Error('no se pudo saber de qué mes es (ponga el año y el mes en el nombre: 2026_11_…)');
            // Para guardar en el equipo, la dirección corta
            [prog.q1, prog.q2].forEach(function (l) { l.forEach(function (x) { x.dir = x.dir.slice(0, 140); }); });
            progDatos = { archivo: file.name, cargado: aTexto(hoy()), prog: prog };
            try { localStorage.setItem(PROG_CACHE, JSON.stringify(progDatos)); } catch (e) { toast('No se pudo guardar en este equipo: habrá que subirlo otra vez.'); }
            if (!$('prog-fecha').value || $('prog-fecha').value.slice(0, 7) !== prog.mes) $('prog-fecha').value = hoy().slice(0, 7) === prog.mes ? hoy() : prog.mes + '-01';
            pintarProg();
            toast('Programación de ' + prog.mes + ' cargada: ' + (prog.q1.length + prog.q2.length) + ' lotes.');
        } catch (e) {
            $('prog-estado').innerHTML = '<span class="aviso-fotos">No se pudo leer el Excel: ' + esc(e.message) + '</span>';
        } finally {
            $('prog-elegir').disabled = false;
        }
    }
    $('btn-prog').onclick = function () {
        if (!$('prog-fecha').value) $('prog-fecha').value = hoy();
        if (!progDatos) $('prog-estado').textContent = 'Todavía no hay programación cargada en este equipo.';
        pintarProg();
        $('dlg-prog').showModal();
    };
    $('prog-cerrar').onclick = function () { $('dlg-prog').close(); };
    $('prog-x').onclick = function () { $('dlg-prog').close(); };
    // Tocar afuera de la ventana (en el fondo oscuro) también la cierra; arrastrar desde adentro no
    (function () {
        var d = $('dlg-prog'), desdeFondo = false;
        d.addEventListener('pointerdown', function (ev) { desdeFondo = ev.target === d; });
        d.addEventListener('click', function (ev) { if (ev.target === d && desdeFondo) d.close(); desdeFondo = false; });
    })();
    $('prog-elegir').onclick = function () { $('prog-archivo').value = ''; $('prog-archivo').click(); };
    $('prog-archivo').onchange = function () { cargarProg(this.files && this.files[0]); };
    $('prog-fecha').onchange = pintarProg;
    $('prog-cuad').onchange = function () { plPagina = 1; pintarProg(); };
    $('prog-texto').onclick = function () {
        if (!progDatos) return;
        var prog = progDatos.prog, fecha = $('prog-fecha').value || hoy(), vis = visitasPorQuincena(prog.mes);
        var est = estadoDelDia(prog, fecha, function (x) { var s = vis[prog.mes + '|' + quincenaProg((semanaProg(prog.mes, fecha) || { semana: 1 }).semana)] || {}; return !!(s['L' + x.lote] || s['M' + x.mr]); });
        if ($('prog-cuad').value) est.cuadrillas = est.cuadrillas.filter(function (c) { return c.cuad === $('prog-cuad').value; });
        $('wa-texto').value = textoDelDia(est, especialesDeSemana(prog, fecha));
        actualizarEnlaceWa();
        $('dlg-wa').showModal();
    };

    // ---------- Informes desde una tabla (src/subsanaciones/tabla.js) ----------
    // Filas copiadas del Excel (o leídas de un pantallazo) → visitas → los mismos informes del resto de la página.
    // No se guarda nada en la base
    var tablaVisitas = [], tablaOcupado = false;
    function fraseTabla(s) { s = String(s || '').trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
    function leerTablaPegada() {
        var r = leerTabla($('tabla-texto').value, items, itemsOp);
        tablaVisitas = r.visitas;
        var n = r.visitas.length, cuenta = {};
        r.visitas.forEach(function (v) { cuenta[v.ESTADO] = (cuenta[v.ESTADO] || 0) + 1; });
        var ej = r.visitas.filter(deLote).length, op = n - ej;
        $('tabla-estado').innerHTML = !$('tabla-texto').value.trim() ? '' : !n ? '<span class="aviso-fotos">No se encontró ninguna microrruta (Z1CC0051…). Copie las filas desde el Excel.</span>' :
            '<b>' + n + (n === 1 ? ' visita leída' : ' visitas leídas') + '</b>' + (r.imagen ? ' de la imagen' : r.encabezado ? ' con el encabezado' : ' (sin encabezado: con el orden del formato)') + ' · ' +
            [ej ? ej + ' de lote ejecutado' : '', op ? op + ' de operación' : ''].filter(Boolean).join(' · ') + ' · ' +
            Object.keys(cuenta).map(function (k) { return cuenta[k] + ' ' + k.toLowerCase(); }).join(' · ') +
            (r.imagen ? '<br><span class="aviso-fotos">El lector de imágenes a veces cambia letras o números: revise la tabla antes de enviar.</span>' : '');
        $('tabla-avisos').innerHTML = r.avisos.slice(0, 50).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') +
            (r.avisos.length > 50 ? '<li>… y ' + (r.avisos.length - 50) + ' avisos más</li>' : '');
        $('tabla-vista').innerHTML = !n ? '' : '<table><thead><tr><th>Microrruta</th><th>Lote</th><th>Cuad.</th><th>Visita</th><th>Tipo</th><th>Estado</th><th>Novedades</th></tr></thead><tbody>' +
            r.visitas.map(function (v) {
                var nov = itemsEnNo(v).concat(String(v['ÍTEMS SUBSANADOS'] || '').split('|').filter(Boolean).map(function (i) { return i + ' (subsanado)'; }));
                if (v['OBSERVACIONES NOVEDADES']) nov.push(v['OBSERVACIONES NOVEDADES']);
                return '<tr><td>' + esc(v.MICRORRUTA) + '</td><td>' + esc(v.LOTE || '') + '</td><td>' + esc(v.CUADRILLA || '') + '</td><td>' + esc(v['FECHA DE LA VISITA'] || '') +
                    '</td><td>' + (esOp(v) ? 'Operación' : 'Ejecutado') + '</td><td>' + badge(v.ESTADO) + '</td><td class="nov">' + esc(nov.map(fraseTabla).join(' · ')) + '</td></tr>';
            }).join('') + '</tbody></table>';
        var dias = diasDe(r.visitas), actual = $('tabla-dia').value;
        $('tabla-dia').innerHTML = dias.map(function (d) { return '<option value="' + d + '">' + aTexto(d) + '</option>'; }).join('');
        if (dias.indexOf(actual) !== -1) $('tabla-dia').value = actual;
        $('tabla-informes').hidden = !n;
    }
    function mostrarInforme(texto, vacio) {
        if (!texto) return toast(vacio);
        $('wa-texto').value = texto;
        actualizarEnlaceWa();
        $('dlg-wa').showModal();
    }
    $('btn-tabla').onclick = function () { $('dlg-tabla').showModal(); if (!$('tabla-texto').value) $('tabla-texto').focus(); };
    $('tabla-cerrar').onclick = function () { $('dlg-tabla').close(); };
    // Al cerrar queda vacía para la próxima tabla
    $('dlg-tabla').addEventListener('close', function () {
        if (tablaOcupado) return;
        $('tabla-texto').value = ''; $('tabla-imagen').value = '';
        leerTablaPegada();
    });
    $('tabla-texto').oninput = leerTablaPegada;
    $('tabla-limpiar').onclick = function () { $('tabla-texto').value = ''; leerTablaPegada(); $('tabla-texto').focus(); };
    $('tabla-pegar').onclick = function () {
        if (!navigator.clipboard || !navigator.clipboard.readText) { $('tabla-texto').focus(); return toast('Mantenga presionado el cuadro y elija Pegar.'); }
        navigator.clipboard.readText().then(function (t) { $('tabla-texto').value = t; leerTablaPegada(); },
            function () { $('tabla-texto').focus(); toast('Mantenga presionado el cuadro y elija Pegar.'); });
    };
    // Pantallazo de la tabla: se saca el texto con el lector de imágenes (ocr.js) y se lee renglón por renglón
    function leerTablaImagen(file) {
        if (!file || tablaOcupado) return;
        tablaOcupado = true;
        $('tabla-elegir').disabled = true;
        $('tabla-estado').textContent = 'Leyendo la imagen… (la primera vez se descarga el lector)';
        leerImagenes([file]).then(function (res) {
            var t = res[0] && res[0].texto;
            if (!t) { $('tabla-estado').innerHTML = '<span class="aviso-fotos">No se pudo leer texto en la imagen.</span>'; return; }
            $('tabla-texto').value = t;
            leerTablaPegada();
        }).catch(function (e) { $('tabla-estado').innerHTML = '<span class="aviso-fotos">' + esc(e.message || 'No se pudo leer la imagen.') + '</span>'; })
          .then(function () { tablaOcupado = false; $('tabla-elegir').disabled = false; });
    }
    $('tabla-elegir').onclick = function () { $('tabla-imagen').value = ''; $('tabla-imagen').click(); };
    $('tabla-imagen').onchange = function () { leerTablaImagen(this.files && this.files[0]); };
    $('dlg-tabla').addEventListener('paste', function (ev) {
        var f = ev.clipboardData && ev.clipboardData.files && ev.clipboardData.files[0];
        if (f && /^image\//.test(f.type)) { ev.preventDefault(); leerTablaImagen(f); }
    });
    $('tabla-informes').onclick = function (ev) {
        var b = ev.target.closest('[data-informe]');
        if (!b || !tablaVisitas.length) return;
        var dia = aTexto($('tabla-dia').value), delDia = tablaVisitas.filter(function (r) { return r['FECHA DE LA VISITA'] === dia; });
        var pend = tablaVisitas.filter(function (r) { return r.ESTADO === 'PENDIENTE'; });
        switch (b.dataset.informe) {
            case 'resumen': return mostrarInforme(pend.length ? textoResumen(pend) : '', 'No hay pendientes en la tabla.');
            case 'novedades': return mostrarInforme(textoNovedadesDia(delDia, dia, menciones()), 'El ' + dia + ' no tiene novedades en la tabla.');
            case 'dia': return mostrarInforme(delDia.length ? textoDia(delDia, dia) : '', 'El ' + dia + ' no tiene visitas en la tabla.');
            case 'descuento': return mostrarInforme(textoDescuento(tablaVisitas), 'Ninguna visita de la tabla va para descuento.');
            case 'vencimientos': return mostrarInforme(textoVencimientos(vencimientos(tablaVisitas), aTexto(hoy())), 'No hay pendientes con plazo en la tabla.');
            case 'excel': return abrirExcel(tablaVisitas);
        }
    };

    // ---------- Fotos con su lote (src/subsanaciones/lotegps.js) ----------
    // Fotos, carpeta o .zip → el lote de cada foto por su GPS (polígonos del mapa rápido) → rótulo en grande y PDF.
    // Cada rótulo se puede corregir a mano antes de crear el PDF
    var flFotos = [], flOcupado = false, ubicarLote = crearUbicador();
    // Lo escrito a mano: 110 → "Z1CC0100 · Lote 110"; Z1CC0100 → igual; otro texto tal cual
    function rotuloEscrito(v) {
        v = String(v || '').trim();
        var mr = v.toUpperCase().replace(/\s+/g, '');
        if (!v) return '';
        if (/^\d+$/.test(v)) return mrPorLote[v] ? mrPorLote[v] + ' · Lote ' + v : 'Lote ' + v;
        if (LOTES[mr]) return mr + (LOTES[mr].lote && LOTES[mr].lote !== 'NA' ? ' · Lote ' + LOTES[mr].lote : '');
        return v;
    }
    // Estado de cada foto: dentro (verde), en el borde a pocos metros (verde claro: es el error normal del GPS),
    // afuera a más metros (naranja: revisar) o sin lote (rojo: escribirlo). [clase, ícono, texto]
    var BORDE_GPS = 10;
    function estadoFotoLote(f) {
        if (f.manual) return f.rotulo ? ['fl-ok', '✎', f.deArriba ? 'Lote escrito arriba' : f.deZip ? 'Lote del nombre «' + f.origenLote + '»' : 'Escrito a mano'] : ['fl-falta', '✎', 'Sin rótulo (se borró)'];
        if (!f.ubic) return ['fl-falta', '⚠', origenesFoto(f).length ? '«' + origenesFoto(f)[0] + '» no trae un lote de la programación: escríbalo arriba' : 'Sin lote: escríbalo arriba en «Lote de estas fotos»'];
        if (f.ubic && !f.ubic.dist) return ['fl-ok', '✓', 'Dentro del lote' + (f.deMarca ? ' · GPS de la marca de agua' : '')];
        if (f.ubic && f.ubic.dist <= BORDE_GPS) return ['fl-borde', '✓', 'En el borde (a ' + f.ubic.dist + ' m)' + (f.deMarca ? ' · GPS de la marca de agua' : '')];
        if (f.ubic) return ['fl-revisar', '!', 'A ' + f.ubic.dist + ' m del lote: revíselo'];
        if (!f.gps) return ['fl-falta', '⚠', 'Sin GPS: escriba el lote'];
        return ['fl-falta', '⚠', 'Ningún lote a menos de ' + CERCA_LOTE + ' m: escriba el lote'];
    }
    function listarFotoLote() {
        var lista = fotosPorLote(), cuenta = { 'fl-ok': 0, 'fl-borde': 0, 'fl-revisar': 0, 'fl-falta': 0 }, porLote = {}, orden = [];
        var escritos = lista.filter(function (f) { return f.manual && f.rotulo; }).length;
        $('fl-zip-crear').disabled = !lista.length || flOcupado;
        lista.forEach(function (f) {
            f.estado = estadoFotoLote(f);
            cuenta[f.estado[0]]++;
            var k = f.rotulo || '';
            if (!(k in porLote)) { porLote[k] = 0; orden.push(k); }
            porLote[k]++;
        });
        var revisar = cuenta['fl-revisar'] + cuenta['fl-falta'], solo = $('fl-solo').checked && revisar;
        var sinLote = lista.filter(function (f) { return !f.rotulo; }).length;
        $('fl-solo-caja').hidden = !revisar;
        $('fl-ayuda').hidden = !sinLote;
        $('fl-resumen').innerHTML = !lista.length ? '' : '<div class="fl-cuentas">' +
            '<b>' + lista.length + (lista.length === 1 ? ' foto' : ' fotos') + '</b>' +
            (escritos ? '<span class="fl-chip fl-ok">✓ ' + escritos + ' con el lote escrito</span>' : '') +
            (cuenta['fl-ok'] - escritos ? '<span class="fl-chip fl-ok">✓ ' + (cuenta['fl-ok'] - escritos) + ' dentro (GPS)</span>' : '') +
            (cuenta['fl-borde'] ? '<span class="fl-chip fl-borde">✓ ' + cuenta['fl-borde'] + ' en el borde</span>' : '') +
            (cuenta['fl-revisar'] ? '<span class="fl-chip fl-revisar">! ' + cuenta['fl-revisar'] + ' por revisar</span>' : '') +
            (cuenta['fl-falta'] ? '<span class="fl-chip fl-falta">⚠ ' + cuenta['fl-falta'] + ' sin lote</span>' : '') + '</div>' +
            '<div class="fl-lotes">' + orden.map(function (k) {
                return '<span class="fl-lote' + (k ? '' : ' sin') + '">' + esc(k || 'Sin lote') + ' <b>' + porLote[k] + '</b></span>';
            }).join('') + '</div>';
        $('fl-lista').innerHTML = lista.filter(function (f) { return !solo || f.estado[0] === 'fl-revisar' || f.estado[0] === 'fl-falta'; }).map(function (f) {
            var e = f.estado;
            return '<li class="' + e[0] + '"><div class="fl-info"><span class="fl-nombre" title="' + esc(f.nombre) + '">' + esc(f.nombre) + '</span>' +
                '<span class="fl-estado"><span class="fl-icono" aria-hidden="true">' + e[1] + '</span>' + esc(e[2]) + (f.fecha ? ' · ' + esc(fechaCorta(f.fecha)) : '') + '</span></div>' +
                '<input type="text" data-fl="' + flFotos.indexOf(f) + '" value="' + esc(f.rotulo || '') + '" placeholder="Escriba el lote" aria-label="Lote de ' + esc(f.nombre) + '" autocomplete="off"></li>';
        }).join('');
        $('fl-convertir').disabled = !lista.length || flOcupado;
    }
    // Lote de cada foto con GPS (las escritas a mano no se tocan) y nombre del PDF
    async function ubicarFotoLote(lista) {
        for (var i = 0; i < lista.length; i++) {
            var f = lista[i];
            $('fl-resumen').textContent = 'Buscando el lote de cada foto: ' + (i + 1) + ' de ' + lista.length + '…';
            if (f.gps && !f.ubic) f.ubic = await ubicarLote(f.gps.lat, f.gps.lon);
            if (!f.manual) f.rotulo = rotuloLote(f.ubic);
        }
        var r1 = flFotos.map(function (f) { return f.rotulo; }).filter(Boolean);
        $('fl-nombre').value = (r1.length && r1.every(function (r) { return r === r1[0]; }) ? r1[0].replace(/ · /g, ' ') : 'Fotos con lote') + ' ' + new Date().toISOString().slice(0, 10);
    }
    // Volver a empezar: al cerrar la ventana queda vacía para la próxima vez (las opciones elegidas se conservan)
    // Lote en el nombre del .zip o de la carpeta de cada foto (118.zip, carpeta «Lote 118»). Si todas vienen del mismo, va arriba
    function existeLote(v) { return !!(LOTES[v] || mrPorLote[v]); }
    // Fotos en el orden en que salen: todas las de un lote seguidas (lotes de menor a mayor; las sin lote al final) y, dentro de
    // cada lote, por fecha o por nombre según lo elegido. Cada una con los datos de su lote para ponerlos debajo de la foto
    function numeroLote(r) { var m = String(r || '').match(/Lote (\d+)/); return m ? Number(m[1]) : Infinity; }
    function fotosPorLote() {
        var lista = ordenarFotos(flFotos, $('fl-orden').value);
        lista = lista.map(function (f, i) { return { f: f, i: i }; }).sort(function (a, b) {
            var x = a.f.rotulo || '', y = b.f.rotulo || '';
            if (!x !== !y) return x ? -1 : 1;
            return numeroLote(x) - numeroLote(y) || x.localeCompare(y) || a.i - b.i;
        }).map(function (o) { return o.f; });
        lista.forEach(function (f) { f.datosLote = datosDeLote(f.rotulo); });
        return lista;
    }
    // «Z1CC0034 · Lote 34» → ['Z1CC0034 · Lote 34 · Cuadrilla 4 · Mensual · 1.980 m²', 'Dirección: …', 'Descripción: …'] (de la programación)
    function datosDeLote(rotulo) {
        var mr = (String(rotulo || '').match(/Z\d+CC\d+/) || [])[0], p = mr && LOTES[mr];
        if (!p) return rotulo ? [rotulo] : [];
        return [[rotulo, p.cuad ? 'Cuadrilla ' + p.cuad : '', p.frec || '', p.area ? Math.round(p.area).toLocaleString('es-CO') + ' m²' : ''].filter(Boolean).join(' · '),
            p.d ? 'Dirección: ' + p.d : '', p.desc ? 'Descripción: ' + p.desc : ''].filter(Boolean);
    }
    // Nombres donde se busca el lote de una foto: el .zip y luego sus carpetas, de la más cercana a la foto hacia afuera
    function origenesFoto(f) {
        var a = f.archivo || {}, carpetas = String(a.rutaZip || a.webkitRelativePath || '').split('/').slice(0, -1).reverse();
        return (a.zipOrigen ? [a.zipOrigen] : []).concat(carpetas).filter(Boolean);
    }
    function loteDeFoto(f) {
        var os = origenesFoto(f);
        for (var i = 0; i < os.length; i++) { var l = loteDeNombre(os[i], existeLote); if (l) { f.origenLote = os[i]; return l; } }
        return '';
    }
    function loteDeLosNombres() {
        var porFoto = flFotos.map(loteDeFoto);
        var distintos = porFoto.filter(function (l, i, a) { return l && a.indexOf(l) === i; });
        if (distintos.length === 1 && porFoto.every(Boolean)) { $('fl-lote').value = distintos[0]; return; }
        flFotos.forEach(function (f, i) { if (porFoto[i]) { f.rotulo = rotuloEscrito(porFoto[i]); f.manual = true; f.deZip = true; } });
    }
    // El lote escrito arriba («118», «Z1CC0108») va a todas las fotos y al nombre del PDF
    function aplicarLoteTodas() {
        var r = rotuloEscrito($('fl-lote').value);
        $('fl-lote-ver').textContent = r ? 'Todas las fotos van con: ' + r : 'Se pone a todas las fotos (antes o después de elegirlas). Cada una se puede cambiar abajo.';
        if (r) {
            flFotos.forEach(function (f) { f.rotulo = r; f.manual = true; f.deArriba = true; });
            $('fl-nombre').value = r.replace(/ · /g, ' ') + ' ' + new Date().toISOString().slice(0, 10);
        }
    }
    function limpiarFotoLote() {
        if (flOcupado) return;
        $('fl-lote').value = ''; $('fl-lote-ver').textContent = 'Se pone a todas las fotos (antes o después de elegirlas). Cada una se puede cambiar abajo.';
        flFotos = [];
        ['fl-fotos', 'fl-carpeta', 'fl-zip'].forEach(function (id) { $(id).value = ''; });
        $('fl-todas').value = '';
        $('fl-solo').checked = false;
        $('fl-nombre').value = 'Fotos con lote ' + new Date().toISOString().slice(0, 10);
        listarFotoLote();
    }
    async function cargarFotoLote(archivos) {
        if (flOcupado) return;
        flOcupado = true;
        $('fl-convertir').disabled = true;
        try {
            archivos = archivos.filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|bmp|gif|tiff?)$/i.test(f.name); });
            if (!archivos.length) { flFotos = []; listarFotoLote(); $('fl-resumen').innerHTML = '<span class="aviso-fotos">No se encontraron fotos.</span>'; return; }
            $('fl-resumen').textContent = 'Leyendo ' + archivos.length + ' fotos…';
            flFotos = await examinar(archivos);
            // Las fotos no se leen: el lote sale del nombre del .zip o de la carpeta, o del escrito arriba
            if (!$('fl-lote').value.trim()) loteDeLosNombres();
            aplicarLoteTodas();
        } catch (e) {
            $('fl-resumen').innerHTML = '<span class="aviso-fotos">No se pudieron leer las fotos: ' + esc(e.message) + '</span>';
            flFotos = [];
        } finally {
            flOcupado = false;
        }
        listarFotoLote();
    }
    $('btn-fotolote').onclick = function () {
        if (!flOcupado) limpiarFotoLote();
        $('dlg-fotolote').showModal();
    };
    $('fl-cerrar').onclick = function () { $('dlg-fotolote').close(); };
    $('fl-lote').addEventListener('input', function () { aplicarLoteTodas(); listarFotoLote(); });
    // Cerrar con el botón, con Esc o tocando afuera: la próxima vez abre vacía
    $('dlg-fotolote').addEventListener('close', limpiarFotoLote);
    // Un mismo lote para todas las fotos que no tienen (p. ej. un .zip de un solo lote sin GPS)
    $('fl-aplicar').onclick = function () {
        var r = rotuloEscrito($('fl-todas').value);
        if (!r) { $('fl-todas').focus(); return toast('Escriba el lote o la microrruta.'); }
        var n = 0;
        flFotos.forEach(function (f) { if (!f.rotulo) { f.rotulo = r; f.manual = true; n++; } });
        toast(n ? r + ' en ' + n + (n === 1 ? ' foto' : ' fotos') + '.' : 'Todas las fotos ya tienen lote.');
        $('fl-todas').value = '';
        ubicarFotoLote([]);
        listarFotoLote();
    };
    $('fl-todas').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('fl-aplicar').click(); } });
    $('fl-elegir-fotos').onclick = function () { $('fl-fotos').value = ''; $('fl-fotos').click(); };
    $('fl-elegir-carpeta').onclick = function () { $('fl-carpeta').value = ''; $('fl-carpeta').click(); };
    $('fl-elegir-zip').onclick = function () { $('fl-zip').value = ''; $('fl-zip').click(); };
    $('fl-fotos').onchange = $('fl-carpeta').onchange = function () { cargarFotoLote(Array.prototype.slice.call(this.files || [])); };
    $('fl-zip').onchange = function () {
        var zips = Array.prototype.slice.call(this.files || []);
        if (!zips.length || flOcupado) return;
        $('fl-resumen').textContent = 'Abriendo ' + (zips.length === 1 ? zips[0].name : zips.length + ' archivos .zip') + '…';
        imagenesDeZips(zips).then(cargarFotoLote, function (e) {
            $('fl-resumen').innerHTML = '<span class="aviso-fotos">No se pudo abrir el .zip' + (/zip|central directory|signature/i.test(e.message) ? ' (está dañado)' : ': ' + esc(e.message)) + '</span>';
        });
    };
    $('fl-zip-crear').onclick = async function () {
        if (!flFotos.length || flOcupado) return;
        var sinLote = flFotos.filter(function (f) { return !f.rotulo; }).length;
        if (sinLote && !(await confirmar('¿Crear el .zip con fotos sin lote?', sinLote + (sinLote === 1 ? ' foto no tiene' : ' fotos no tienen') + ' lote: van en la carpeta «Sin lote» y sin rótulo.', 'Crear igual', 'Volver'))) return;
        flOcupado = true;
        var b = this, lista = fotosPorLote(), op = { diseno: $('fl-diseno').value, reducir: $('fl-reducir').checked };
        b.disabled = $('fl-convertir').disabled = true;
        try {
            var { default: JSZip } = await import('jszip'), salida = new JSZip(), grupos = {}, orden = [], fecha = new Date().toISOString().slice(0, 10), hechas = 0;
            lista.forEach(function (f) { var k = f.rotulo || 'Sin lote'; if (!grupos[k]) { grupos[k] = []; orden.push(k); } grupos[k].push(f); });
            for (var g = 0; g < orden.length; g++) {
                var k = orden[g], carpeta = k.replace(/ · /g, ' ').replace(/[\\/:*?"<>|]+/g, '-'), base = carpeta.replace(/\s+/g, '_');
                var dir = salida.folder(carpeta), fotos = grupos[k], digitos = String(fotos.length).length < 2 ? 2 : String(fotos.length).length;
                for (var i = 0; i < fotos.length; i++) {
                    b.textContent = 'Foto ' + (++hechas) + ' de ' + lista.length + '…';
                    try { dir.file(base + '_' + String(i + 1).padStart(digitos, '0') + '.jpg', await fotoRotulada(fotos[i].archivo, k === 'Sin lote' ? '' : k, op.reducir)); }
                    catch (e) { /* foto que no se pudo leer: se omite */ }
                }
                b.textContent = 'PDF de ' + carpeta + '…';
                var pdf = await fotosAPdf(fotos.map(function (f) { return Object.assign({}, f, { rotulo: k === 'Sin lote' ? '' : k }); }), Object.assign({}, op, { nombre: carpeta + ' ' + fecha, devolver: true }), function () {});
                if (pdf.paginas) dir.file(pdf.nombre, pdf.bytes);
            }
            var nombreZip = (orden.length === 1 ? orden[0].replace(/ · /g, ' ') : 'Fotos por lote') .replace(/[\\/:*?"<>|]+/g, '-') + ' ' + fecha + '.zip';
            b.textContent = 'Armando el .zip…';
            descargar(await salida.generateAsync({ type: 'uint8array' }), nombreZip, 'application/zip');
            toast('Listo: ' + nombreZip + ' (' + lista.length + (lista.length === 1 ? ' foto' : ' fotos') + ', ' + orden.length + (orden.length === 1 ? ' lote' : ' lotes') + ' con su PDF).');
        } catch (e) {
            toast('No se pudo crear el .zip: ' + e.message);
        } finally {
            flOcupado = false;
            b.textContent = '🗜️ Crear .zip para enviar';
            b.disabled = $('fl-convertir').disabled = !flFotos.length;
        }
    };
    $('fl-orden').onchange = listarFotoLote;
    $('fl-solo').onchange = listarFotoLote;
    // Lote escrito a mano: se completa con la programación al salir del campo
    $('fl-lista').addEventListener('change', function (ev) {
        var inp = ev.target.closest('[data-fl]'), f = inp && flFotos[+inp.dataset.fl];
        if (!f) return;
        f.rotulo = rotuloEscrito(inp.value);
        f.manual = f.rotulo !== rotuloLote(f.ubic);
        f.deArriba = false;
        listarFotoLote();
    });
    $('fl-convertir').onclick = async function () {
        if (!flFotos.length || flOcupado) return;
        flOcupado = true;
        var b = $('fl-convertir'), lista = fotosPorLote().map(function (f) { return Object.assign({}, f, { rotulo: f.rotulo || '' }); });
        var op = { diseno: $('fl-diseno').value, reducir: $('fl-reducir').checked, nombre: $('fl-nombre').value };
        b.disabled = true;
        try {
            if (!$('fl-separar').checked) {
                var r = await fotosAPdf(lista, op, function (h, t) { b.textContent = 'Foto ' + h + ' de ' + t + '…'; });
                toast(!r.paginas ? 'No se pudo leer ninguna foto.' : 'Listo: ' + r.nombre + ' (' + r.paginas + (r.paginas === 1 ? ' página)' : ' páginas)') +
                    (r.omitidas.length ? ' · no se pudieron leer: ' + r.omitidas.join(', ') : ''));
            } else {
                // Un PDF por lote, con el nombre del lote; las fotos sin lote van en "Sin lote"
                var grupos = {}, orden = [];
                lista.forEach(function (f) { var k = f.rotulo || 'Sin lote'; if (!grupos[k]) { grupos[k] = []; orden.push(k); } grupos[k].push(f); });
                var hechos = [], fecha = new Date().toISOString().slice(0, 10);
                for (var i = 0; i < orden.length; i++) {
                    var x = await fotosAPdf(grupos[orden[i]], Object.assign({}, op, { nombre: orden[i].replace(/ · /g, ' ') + ' ' + fecha, devolver: true }), function (h, t) {
                        b.textContent = 'Lote ' + (i + 1) + ' de ' + orden.length + ' · foto ' + h + ' de ' + t + '…';
                    });
                    if (x.paginas) hechos.push(x);
                }
                if (!hechos.length) toast('No se pudo leer ninguna foto.');
                else if (hechos.length === 1) { descargar(hechos[0].bytes, hechos[0].nombre, 'application/pdf'); toast('Listo: ' + hechos[0].nombre); }
                else {
                    var { default: JSZip } = await import('jszip'), salida = new JSZip();
                    hechos.forEach(function (h) { salida.file(h.nombre, h.bytes); });
                    var nombreZip = ($('fl-nombre').value.trim() || 'Fotos por lote').replace(/[\\/:*?"<>|]+/g, '-') + '.zip';
                    descargar(await salida.generateAsync({ type: 'uint8array' }), nombreZip, 'application/zip');
                    toast('Listo: ' + hechos.length + ' PDF (uno por lote) en ' + nombreZip);
                }
            }
        } catch (e) {
            toast('No se pudo crear el PDF: ' + e.message);
        } finally {
            flOcupado = false;
            b.textContent = 'Crear PDF';
            b.disabled = !flFotos.length;
        }
    };

    // ---------- ZIP a PDF (src/subsanaciones/zippdf.js) ----------
    var zipOcupado = false;
    function elegidosZip() { return Array.prototype.slice.call($('zip-archivos').files || []); }
    function listarZips() {
        var fs = elegidosZip();
        $('zip-informe').innerHTML = fs.map(function (f) { return '<li>' + esc(f.name) + ' <span class="sub">· ' + (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB</span></li>'; }).join('');
        $('zip-convertir').disabled = !fs.length;
    }
    $('btn-zip').onclick = function () { if (!zipOcupado) { $('zip-archivos').value = ''; listarZips(); } $('dlg-zip').showModal(); };
    $('zip-elegir').onclick = function () { if (!zipOcupado) $('zip-archivos').click(); };
    $('zip-archivos').onchange = listarZips;
    $('zip-cerrar').onclick = function () { $('dlg-zip').close(); };
    $('zip-convertir').onclick = function () {
        var fs = elegidosZip();
        if (!fs.length || zipOcupado) return;
        zipOcupado = true;
        $('zip-convertir').disabled = $('zip-elegir').disabled = true;
        $('zip-convertir').textContent = 'Convirtiendo…';
        $('zip-informe').innerHTML = '';
        var lineas = [];
        zipsAPdf(fs, function (k, texto, clase) {
            if (!lineas[k]) { lineas[k] = document.createElement('li'); $('zip-informe').appendChild(lineas[k]); }
            lineas[k].textContent = texto;
            lineas[k].className = clase ? 'zip-' + clase : '';
        }).then(function (r) {
            toast(!r.convertidos ? 'Ningún zip tenía fotos para convertir.' : r.convertidos === 1 ? 'Listo: se descargó el PDF.' : 'Listo: ' + r.convertidos + ' de ' + r.total + ' convertidos, en PDFs.zip.');
        }).catch(function (err) { toast('No se pudo convertir: ' + err.message); })
          .then(function () {
              zipOcupado = false;
              $('zip-convertir').textContent = 'Convertir';
              $('zip-convertir').disabled = $('zip-elegir').disabled = false;
          });
    };

    // Desde el menú Más de otra sección: subsanaciones.html?herramienta=fotos abre esa herramienta
    (function () {
        var q = new URLSearchParams(location.search), h = q.get('herramienta');
        var btn = h && /^(hallazgos|buenas|fotos|zip|nota|ocr|tabla|fotolote|prog)$/.test(h) && $('btn-' + h);
        if (!btn) return;
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
        btn.onclick();
    })();
    cargar();
    return {
        // main.js lo llama cuando confirma que la sesión es de un administrador
        mostrarUsuarios: function (lista) { usuarios = lista; llenarUsuarios(); if (cargado) pintar(); },
    };
}
