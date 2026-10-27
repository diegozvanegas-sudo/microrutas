// Página de subsanaciones: listado de visitas, formulario, buscador, pre-rutas, WhatsApp y Excel.
// Viene del <script> de la página original; lo que no depende del estado de la página ya está en módulos aparte.
import { esc, norm, valorItem, hoy, aInput, aTexto, dias, claveFecha, textoDias, marca, textoCarga, cargaDeTexto, horaCarga, metros, textoDist } from './util.js';
import { $, toast, aviso, confirmar } from './ui.js';
import { EJ, OP, NO_REALIZADO, CERRADO, fijarItems, esOp, itemsDe, limpiarObs, itemsEnNo, deLote, esCerrado, calcularEstado, badge, plazoVisita, paraDescuento } from './estado.js';
import { textoWhatsapp, textoResumen, textoDescuento, textoDia, textoNovedadesDia, leerMenciones } from './whatsapp.js';
import { parsearMensaje as leerMensaje } from './mensaje.js';
import { recorridoCorto as recorrer } from './recorrido.js';
import { exportarExcel, hojasExcel, htmlHoja } from './excel.js';
import { HALLAZGOS, buscarHallazgos } from './hallazgos.js';
import { ESTILOS as ESTILOS_NOTA, dibujar as dibujarNota, pieFecha, aArchivo } from './textoimagen.js';
import { cumplimiento, porcentaje } from './cumplimiento.js';
import { zipsAPdf } from './zippdf.js';
import { examinar, ordenar as ordenarFotos, fotosAPdf, fechaCorta } from './fotospdf.js';
import { revisarFotos, MAX_FOTOS } from './fotos.js';

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
    function claveRegistro(r) {
        var m = String(r['FECHA DE REGISTRO'] || r['ÚLTIMA MODIFICACIÓN'] || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        var z = function (n) { return ('0' + (n || 0)).slice(-2); };
        return m ? m[3] + z(m[2]) + z(m[1]) + z(m[4]) + z(m[5]) + z(m[6]) : claveFecha(r['FECHA DE LA VISITA']) + '000000';
    }
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
        leer().then(function (d) {
            aviso('');
            // Mientras se leía se cambió una pre-ruta aquí (p. ej. se quitó un lote): manda lo de este celular
            if (ultimoCambioRuta >= inicio) delete d.rutas;
            else ultimasRutas = d.rutas || null;
            aplicarDatos(d, false);
            guardarCache();
        }).catch(function (err) {
            if (cargado) return aviso('Se muestra lo guardado en este celular' + (copia && copia.t ? ' (' + new Date(copia.t).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) + ')' : '') +
                '. No se pudo actualizar: ' + esc(err.message) + '. Pulse "↻ Actualizar" para reintentar.');
            aviso('<b>No se pudo leer la base de datos:</b> ' + esc(err.message), true);
            $('tabla').innerHTML = '<div class="vacio">No hay datos.</div>';
        }).then(function () { btn.disabled = false; btn.textContent = '↻ Actualizar'; });
    }
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
        if (!desdeCache) rutasAlDia = true;
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
        var valores = registros.map(function (r) { return aInput(r['FECHA DE LA VISITA']); }).filter(Boolean)
            .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort().reverse();
        sel.innerHTML = '<option value="">Día: todos</option>' + valores.map(function (d) {
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

    function filtrados() {
        var texto = norm($('f-texto').value), est = $('f-estado').value, zona = $('f-zona').value, cuad = $('f-cuadrilla').value, tipo = $('f-tipo').value, dia = $('f-dia').value;
        return registros.filter(function (r) {
            if (!filtroUsuario(r)) return false;
            if (tipo && r.TIPO !== tipo) return false;
            if (zona && String(r.ZONA).trim() !== zona) return false;
            if (cuad && String(r.CUADRILLA).trim() !== cuad) return false;
            if (dia && aInput(r['FECHA DE LA VISITA']) !== dia) return false;
            if (est === 'DESCUENTO' ? !paraDescuento(r) : est && r.ESTADO !== est) return false;
            if (!texto) return true;
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
    function pintar() {
        pintarRutas();
        pintarLimpiar();
        var cuenta = { '': registros.length, PENDIENTE: 0, SUBSANADO: 0, 'SIN NOVEDAD': 0 }, descuento = registros.filter(paraDescuento).length;
        registros.forEach(function (r) { if (cuenta[r.ESTADO] != null) cuenta[r.ESTADO]++; });
        var est = $('f-estado').value;
        $('resumen').innerHTML = [['', 'Visitas'], ['PENDIENTE', 'Pendientes de subsanar'], ['SUBSANADO', 'Subsanadas'], ['SIN NOVEDAD', 'Sin novedad']].map(function (t) {
            return '<div class="tarjeta' + (est === t[0] || (est === 'DESCUENTO' && t[0] === 'PENDIENTE') ? ' activa' : '') + '" data-estado="' + t[0] + '"><div class="num">' + cuenta[t[0]] + '</div><div class="tit">' + t[1] + '</div>' +
                (t[0] === 'PENDIENTE' && descuento ? '<div class="viejas' + (est === 'DESCUENTO' ? ' activa' : '') + '" data-estado="DESCUENTO" title="Ver solo las que pasaron el plazo o no son subsanables">💸 ' + descuento + ' para descuento</div>' : '') + '</div>';
        }).join('');

        var lista = filtrados().sort(porRegistro);
        // Las más viejas primero cuando se piden las de descuento
        if (est === 'DESCUENTO') lista.sort(function (a, b) { return dias(b['FECHA DE LA VISITA']) - dias(a['FECHA DE LA VISITA']); });
        if (!lista.length) {
            $('tabla').innerHTML = '<div class="vacio">' + (registros.length ? 'Ningún registro coincide con los filtros.' : 'Aún no hay visitas. Use "+ Nueva visita".') + '</div>';
            return;
        }
        $('tabla').innerHTML = '<div class="movil">' + lista.map(tarjetaMovil).join('') + '</div>' +
            '<table class="escritorio"><thead><tr><th>Lote / Microrruta</th><th>Fecha de ejecución</th><th>Visita</th><th>Ítems en NO</th><th>Estado</th><th>Observaciones</th><th></th></tr></thead><tbody>' +
            lista.map(function (r) {
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
                    '<td class="acciones"><button type="button" class="secundario pequeno" data-ver="' + esc(r.ID) + '" aria-expanded="' + !!abiertos[r.ID] + '">' +
                        (abiertos[r.ID] ? 'Ocultar ▴' : 'Ver detalles ▾') + '</button> ' +
                        '<button type="button" class="secundario pequeno" data-editar="' + esc(r.ID) + '">Editar</button></td>' +
                    '</tr>' +
                    '<tr class="fila-detalle"' + (abiertos[r.ID] ? '' : ' hidden') + '><td colspan="7">' + detalle(r, false) + '</td></tr>';
            }).join('') + '</tbody></table>';
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
            '</dl>' + (r.ESTADO === 'PENDIENTE' ? '<button type="button" class="subsanar' + (conEditar ? '' : ' pequeno') + '" data-subsanar="' + esc(r.ID) + '">✓ Marcar subsanado</button>' : '') +
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
        var elegido = $('f-dia').value, dia = aTexto(elegido || hoy()), lista = registros.filter(function (r) { return aTexto(aInput(r['FECHA DE LA VISITA'])) === dia; });
        // Con una cuadrilla filtrada, el resumen es solo de esa cuadrilla
        var cuadF = $('f-cuadrilla').value;
        if (cuadF) lista = lista.filter(function (r) { return String(r.CUADRILLA).trim() === cuadF; });
        lista = lista.filter(filtroUsuario);
        if (!lista.length) return toast(elegido ? 'El ' + dia + ' no hay visitas registradas.' : 'Hoy (' + dia + ') aún no hay visitas registradas.');
        // Con novedades: el formato de interventoría (NOVEDADES POSOPERACION + requerimientos); sin novedades, el conteo del día
        var novedades = textoNovedadesDia(lista, dia, menciones());
        $('wa-texto').value = novedades || textoDia(lista, dia);
        actualizarEnlaceWa();
        $('dlg-wa').showModal();
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
    // @menciones de los encargados por cuadrilla, aprendidas del texto que se copia o se abre en WhatsApp
    function menciones() { try { return JSON.parse(localStorage.getItem('subsanaciones_menciones')) || {}; } catch (e) { return {}; } }
    function recordarMenciones() {
        var nuevas = leerMenciones($('wa-texto').value);
        if (!Object.keys(nuevas).length) return;
        try { localStorage.setItem('subsanaciones_menciones', JSON.stringify(Object.assign(menciones(), nuevas))); } catch (e) {}
    }
    $('wa-abrir').addEventListener('click', recordarMenciones);
    function actualizarEnlaceWa() { $('wa-abrir').href = 'https://wa.me/?text=' + encodeURIComponent($('wa-texto').value); }
    function mostrarWhatsapp(r) {
        $('wa-texto').value = textoWhatsapp(r);
        actualizarEnlaceWa();
        $('dlg-wa').showModal();
    }
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

    // ---------- Pre-ruta: lotes que mandan a revisar (se guarda en este celular) ----------
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
    // Hora del último cambio hecho aquí a una pre-ruta: una lectura de la hoja que salió antes no lo deshace
    var ultimoCambioRuta = 0;
    function subirRuta(ruta) {
        if (!modoHoja) return;
        ultimoCambioRuta = Date.now();
        var paradas = ruta.paradas.map(function (p) {
            return { lote: p.id, fecha: aTexto(p.fecha), cargada: textoCarga(p.carga) || aTexto(p.creada), encurso: textoCarga(p.encurso), sinfotos: p.sinfotos || '' };
        });
        // La copia del celular queda igual de una vez: al recargar no reaparecen los lotes quitados
        ultimasRutas = (ultimasRutas || []).filter(function (r) { return r.cuadrilla !== ruta.cuad; }).concat(paradas.map(function (p, n) {
            return { cuadrilla: ruta.cuad, lote: p.lote, fecha: p.fecha, orden: String(n + 1), cargada: p.cargada, encurso: p.encurso, sinfotos: p.sinfotos };
        }));
        guardarCache();
        enviar('guardar_ruta', { cuadrilla: ruta.cuad, paradas: paradas })
            .catch(function (err) { toast('La pre-ruta quedó en este celular pero no en la base de datos: ' + err.message); });
    }
    // desdeCache: copia guardada en el celular mientras llega la hoja; no sube nada a la hoja
    function rutasDeHoja(lista, desdeCache) {
        modoHoja = true;
        var locales = rutas;
        // La primera vez, lo que estaba solo en este celular se sube a la hoja (una sola vez, para no revivir rutas que otro quitó)
        var migrar = false;
        if (!desdeCache) try { migrar = !localStorage.getItem('subsanaciones_rutas_en_hoja'); localStorage.setItem('subsanaciones_rutas_en_hoja', '1'); } catch (e) {}
        rutas = [];
        lista.slice().sort(function (a, b) {
            return a.cuadrilla.localeCompare(b.cuadrilla, 'es', { numeric: true }) || (Number(a.orden) || 1e9) - (Number(b.orden) || 1e9);
        }).forEach(function (r) {
            var id = /^\d+$/.test(r.lote) ? String(+r.lote) : r.lote;
            var n = { id: id, fecha: aInput(r.fecha), creada: aInput(r.cargada) || hoy(), carga: cargaDeTexto(r.cargada) };
            if (r.encurso !== undefined) n.encurso = cargaDeTexto(r.encurso);
            if (r.sinfotos !== undefined) n.sinfotos = r.sinfotos;
            agregarParadas(r.cuadrilla, [n]);
        });
        // Un Apps Script sin actualizar no trae la columna EN CURSO: se usa la de este celular
        var hojaConCurso = lista.some(function (r) { return r.encurso !== undefined; });
        // Sin la columna SIN FOTOS en la base (migración 0008 sin correr) se conserva la marca de este celular
        var hojaConSinFotos = lista.some(function (r) { return r.sinfotos !== undefined; });
        // La hoja guarda el orden pero no la marca "para después": se conserva la de este celular
        locales.forEach(function (l) {
            var ruta = rutas.find(function (r) { return r.cuad === l.cuad; });
            if (ruta) l.paradas.forEach(function (p) {
                var q = ruta.paradas.find(function (x) { return x.id === p.id; });
                if (!q) return;
                if (p.despues) q.despues = true;
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
        guardarRutas();
    }
    function agregarParadas(cuad, nuevas) {
        var ruta = rutas.find(function (r) { return r.cuad === cuad; });
        if (!ruta) { ruta = { cuad: cuad, paradas: [] }; rutas.push(ruta); }
        nuevas.forEach(function (n) {
            var ya = ruta.paradas.find(function (p) { return p.id === n.id; });
            if (ya) {
                // El mismo lote ejecutado de nuevo: se revisa la ejecución más reciente
                if (n.fecha && (!ya.fecha || n.fecha > ya.fecha)) ya.fecha = n.fecha;
                ya.creada = n.creada; ya.carga = n.carga || ya.carga;
                if (n.encurso !== undefined) ya.encurso = n.encurso;
                if (n.sinfotos !== undefined) ya.sinfotos = n.sinfotos;
            } else ruta.paradas.push(n);
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
        var plegada = !!plegadas['*todas'];
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

    // Pre-rutas plegadas en este dispositivo, por cuadrilla
    var plegadas;
    try { plegadas = JSON.parse(localStorage.getItem('subsanaciones_plegadas')) || {}; } catch (e) { plegadas = {}; }
    function plegar(cuad, si) {
        if (si) plegadas[cuad || ''] = 1; else delete plegadas[cuad || ''];
        try { localStorage.setItem('subsanaciones_plegadas', JSON.stringify(plegadas)); } catch (e) {}
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
        cont.innerHTML = pintarRutaCompleta() + rutas.map(function (ruta, ri) {
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
            var plegada = !!plegadas[ruta.cuad || ''];
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
        }).join('') + '<button type="button" class="secundario pequeno otra" data-ruta="nueva">+ Otra pre-ruta</button>';
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
        if (b.dataset.ruta === 'plegar-todas') { plegar('*todas', !plegadas['*todas']); return pintarRutas(); }
        var ruta = rutas[+b.dataset.ri], accion = b.dataset.ruta;
        if (accion === 'nueva') return abrirDlgRuta();
        if (accion === 'aqui') { fijar(b.dataset.id); pintarRutas(); return toast(fijada ? '📍 Su ubicación es ahora ' + fijada.nombre + '. "Cómo llegar" sale desde aquí.' : 'Ese lote no tiene ubicación ni dirección.'); }
        if (accion === 'soltar') { soltar(); pintarRutas(); return toast('Se usa de nuevo el GPS del celular.'); }
        if (accion === 'plegar') { plegar(ruta.cuad, !plegadas[ruta.cuad || '']); return pintarRutas(); }
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
    $('ruta-crear').onclick = function () {
        var p = parsearMensaje($('ruta-texto').value), lista = lotesRuta(p);
        if (!lista.length) return;
        var cuad = $('ruta-cuad').value.trim().replace(/^C/i, ''), fecha = $('ruta-fecha').value || hoy();
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
                return { id: id, fecha: fecha, creada: hoy(), carga: marca(new Date(ahora.getTime() + i * 1000)),
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
        var tarjeta = $('ruta').querySelectorAll('.ruta-card:not(.ruta-completa)')[rutas.indexOf(nuevas[0])];
        if (tarjeta) tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    pintarRutas();

    // ---------- Eventos generales ----------
    // Quitar filtros: todo vuelve a "todos" de un toque (el botón solo se ve si hay alguno puesto)
    var FILTROS = ['f-texto', 'f-estado', 'f-tipo', 'f-zona', 'f-cuadrilla', 'f-dia', 'f-usuario'];
    function pintarLimpiar() {
        var n = FILTROS.filter(function (id) { return $(id).value; }).length;
        $('btn-limpiar-filtros').hidden = !n;
        $('btn-limpiar-filtros').textContent = '✕ Quitar filtros' + (n > 1 ? ' (' + n + ')' : '');
    }
    $('btn-limpiar-filtros').onclick = function () { FILTROS.forEach(function (id) { $(id).value = ''; }); pintar(); };
    $('btn-nuevo').onclick = function () { abrir(null); };
    $('btn-recargar').onclick = cargar;
    $('f-texto').oninput = pintar;
    $('f-estado').onchange = pintar;
    $('f-zona').onchange = pintar;
    $('f-tipo').onchange = pintar;
    $('f-cuadrilla').onchange = pintar;
    $('f-dia').onchange = pintar;
    $('f-usuario').onchange = pintar;
    $('resumen').onclick = function (ev) {
        var t = ev.target.closest('[data-estado]');
        if (t) { $('f-estado').value = t.dataset.estado; pintar(); }
    };
    $('tabla').onclick = function (ev) {
        var b = ev.target.closest('[data-editar]');
        if (b) return abrir(registros.find(function (r) { return r.ID === b.dataset.editar; }));
        var s = ev.target.closest('[data-subsanar]');
        if (s) return subsanar(registros.find(function (r) { return r.ID === s.dataset.subsanar; }));
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
    $('btn-excel').onclick = function () {
        var lista = filtrados();
        if (!lista.length) { toast('No hay registros para exportar.'); return; }
        hojasVista = hojasExcel(lista, items, itemsOp);
        $('excel-info').textContent = '· ' + lista.length + (lista.length === 1 ? ' visita' : ' visitas');
        $('excel-hojas').innerHTML = hojasVista.map(function (h, i) {
            return '<button type="button" role="tab" data-hoja="' + i + '">' + esc(h.nombre) + ' <small>' + h.filas.length + '</small></button>';
        }).join('');
        verHoja(0);
        $('dlg-excel').showModal();
    };
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
    $('excel-descargar').onclick = function () {
        var b = this;
        b.disabled = true;
        exportarExcel(filtrados(), items, itemsOp)
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
            ($('dlg-hallazgos').open ? $('dlg-hallazgos') : document.body).appendChild(t);
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

    // ---------- Texto a imagen (src/subsanaciones/textoimagen.js) ----------
    // Lo escrito queda en el equipo mientras no se guarde (si se cierra sin querer no se pierde); colores y letra se recuerdan
    var NOTA = 'subsanaciones_nota', nota = { texto: '', estilo: 'blanco', fecha: true };
    try { nota = Object.assign(nota, JSON.parse(localStorage.getItem(NOTA)) || {}); } catch (e) {}
    function guardarNota() { try { localStorage.setItem(NOTA, JSON.stringify(nota)); } catch (e) {} }
    function pintarNota() {
        $('nota-estilos').querySelectorAll('[data-estilo]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.estilo === nota.estilo); });
        dibujarNota($('nota-canvas'), { texto: nota.texto || 'Escriba el texto', estilo: nota.estilo,
            pie: nota.fecha ? pieFecha(new Date()) : '' });
    }
    $('nota-estilos').innerHTML = Object.keys(ESTILOS_NOTA).map(function (k) {
        var e = ESTILOS_NOTA[k];
        return '<button type="button" role="radio" data-estilo="' + k + '" title="' + e.nombre + '" aria-label="' + e.nombre + '" style="background:' + e.fondo + ';outline:4px solid ' + e.acento + ';outline-offset:-8px"></button>';
    }).join('');
    $('btn-nota').onclick = function () {
        $('nota-texto').value = nota.texto; $('nota-fecha').checked = nota.fecha;
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

    cargar();
    return {
        // main.js lo llama cuando confirma que la sesión es de un administrador
        mostrarUsuarios: function (lista) { usuarios = lista; llenarUsuarios(); if (cargado) pintar(); },
    };
}
