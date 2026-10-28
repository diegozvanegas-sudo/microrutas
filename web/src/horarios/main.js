// horarios.html: muestra los horarios de rutas de recolección (tabla horarios_rutas) con buscador. El administrador (o quien
// tenga el permiso) carga el Excel, revisa lo que cambia antes de guardarlo y corrige, agrega o quita rutas una a una.
// El Excel se lee en el navegador y solo se envían las filas. Horas extras (horas.html) revisa con ellos la H.I y la H.F.
import '../diario/estilos.css';
import '../horas/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { confirmar } from '../subsanaciones/ui.js';
import { hhmm, plano } from '../horas/cruce.js';
import { textoDias, NOMBRES_DIAS, filaHorario, problemasHorario, compararHorarios } from './horarios.js';
import { leerArchivoHorarios, horariosGuardados, guardarHorarios, guardarHorario, borrarHorario, textoGuardados } from './guardado.js';

var $ = function (id) { return document.getElementById(id); };
var datos = null, zona = '', estado = '', puede = false, pagina = 0;
// Revisión del cargue: { leidos, nombre, cambios, filtro, pagina }
var revision = null;
// Ruta abierta en la ventana (null: nueva)
var editando = null;

function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lista() { return datos ? Object.keys(datos.rutas).map(function (k) { return datos.rutas[k]; }) : []; }

// Horario de una ruta para la tabla: "06:00 o 08:00" y debajo las excepciones de la observación
function celdaHorario(h) {
    var otros = Object.keys(h.porDia).map(function (d) { return NOMBRES_DIAS[d] + ' ' + hhmm(h.porDia[d]); });
    return esc(h.horas.map(hhmm).join(' o ')) + (otros.length ? '<span class="sub">' + esc(otros.join(' · ')) + '</span>' : '');
}
// Paginación de las tablas: POR_PAGINA filas por página -> { filas de la página, pagina (corregida), paginas }
var POR_PAGINA = 100;
function paginar(filas, pagina) {
    var paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA)), p = Math.min(Math.max(0, pagina), paginas - 1);
    return { filas: filas.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA), pagina: p, paginas: paginas, total: filas.length };
}
// "‹ Anterior · 101–200 de 599 · página 2 de 6 · Siguiente ›"; los botones llevan data-pagina
function controlesPagina(pg) {
    if (pg.paginas < 2) return pg.total ? '<span class="sub">' + pg.total + (pg.total === 1 ? ' ruta' : ' rutas') + '</span>' : '';
    var desde = pg.pagina * POR_PAGINA + 1, hasta = Math.min(pg.total, desde + POR_PAGINA - 1), nums = [];
    for (var i = 0; i < pg.paginas; i++) nums.push('<button type="button" class="chip" data-pagina="' + i + '" aria-pressed="' + (i === pg.pagina) + '">' + (i + 1) + '</button>');
    return '<button type="button" class="secundario pequeno" data-pagina="' + (pg.pagina - 1) + '"' + (pg.pagina ? '' : ' disabled') + '>‹ Anterior</button>' +
        '<span class="numeros">' + nums.join('') + '</span>' +
        '<button type="button" class="secundario pequeno" data-pagina="' + (pg.pagina + 1) + '"' + (pg.pagina < pg.paginas - 1 ? '' : ' disabled') + '>Siguiente ›</button>' +
        '<span class="sub">' + desde + '–' + hasta + ' de ' + pg.total + '</span>';
}

function notaProblemas(h) {
    var p = problemasHorario(h);
    return p.length ? '<span class="nota">⚠ ' + esc(p.join(' · ')) + '</span>' : '';
}

// ---------- Cargar el Excel y revisarlo antes de guardar ----------

async function elegir(archivo) {
    if (!archivo) return;
    if (!/\.xlsx$/i.test(archivo.name)) return toast('Use el archivo en formato .xlsx (en Excel: Guardar como → Libro de Excel).');
    $('estado').hidden = false; $('estado').textContent = 'Leyendo…';
    try {
        var leidos = await leerArchivoHorarios(await archivo.arrayBuffer());
        if (!leidos) throw new Error('No encontré las columnas "Nombre de la Microrruta" y "HORARIO" en ninguna hoja.');
        $('estado').hidden = true;
        revision = { leidos: leidos, nombre: archivo.name, cambios: compararHorarios(datos, leidos), filtro: '', pagina: 0 };
        var c = revision.cambios;
        // Sin nada cargado o con cambios: lo primero que se ve es lo que cambia
        revision.filtro = !datos ? 'todas' : c.cambian.length ? 'cambian' : c.nuevas.length ? 'nuevas' : c.quitadas.length ? 'quitadas' : 'todas';
        pintarRevision();
        $('revision').hidden = false;
        $('revision').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
        $('estado').textContent = '⚠ ' + e.message;
    }
    $('archivo-horarios').value = '';
}

function pintarRevision() {
    var r = revision, c = r.cambios, todas = Object.keys(r.leidos.rutas).map(function (k) { return r.leidos.rutas[k]; });
    var conProblemas = todas.filter(function (h) { return problemasHorario(h).length; });
    $('rev-archivo').textContent = r.nombre + ' · ' + r.leidos.n + ' rutas';
    var filtros = [['todas', 'Todas', todas.length, ''], ['nuevas', 'Nuevas', c.nuevas.length, 'ok'], ['cambian', 'Cambian', c.cambian.length, 'horario'],
        ['quitadas', 'Se quitan', c.quitadas.length, 'mas'], ['problemas', 'Con problemas', conProblemas.length, 'menos'], ['iguales', 'Iguales', c.iguales, '']];
    $('rev-filtros').innerHTML = filtros.filter(function (f) { return f[0] === 'todas' || f[2] || (datos && f[0] !== 'problemas'); }).map(function (f) {
        return '<button type="button" class="chip ' + f[3] + '" data-filtro="' + f[0] + '" aria-pressed="' + (r.filtro === f[0]) + '">' + f[1] + ' <b>' + f[2] + '</b></button>';
    }).join('');

    var avisos = [];
    if (c.quitadas.length) avisos.push(c.quitadas.length + (c.quitadas.length === 1 ? ' ruta cargada no viene' : ' rutas cargadas no vienen') + ' en este archivo y se quitan.');
    if (datos && datos.editadas) avisos.push(datos.editadas + (datos.editadas === 1 ? ' ruta fue editada' : ' rutas fueron editadas') + ' a mano: quedan como vienen en el Excel.');
    if (conProblemas.length) avisos.push(conProblemas.length + (conProblemas.length === 1 ? ' ruta tiene' : ' rutas tienen') + ' algo que revisar (sin hora o sin días); después de guardar se pueden corregir una a una.');
    $('rev-aviso').hidden = !avisos.length;
    $('rev-aviso').innerHTML = avisos.map(function (a) { return '<div>⚠ ' + esc(a) + '</div>'; }).join('');
    $('rev-guardar').textContent = '✓ Guardar ' + r.leidos.n + ' rutas' + (datos ? ' (reemplaza las ' + datos.n + ')' : '');

    var cab = '<thead><tr><th>Ruta</th><th>Zona</th><th>Macrorruta</th><th>Días</th><th>Horario</th><th>Turno</th><th>Observación</th><th>Cambio</th></tr></thead>';
    var fila = function (h, cambio, clase) {
        return '<tr class="' + (clase || '') + '"><td class="num"><b>' + esc(h.ruta) + '</b></td><td>' + esc(h.zona) + '</td><td>' + esc(h.macro) + '</td>' +
            '<td>' + esc(textoDias(h.dias)) + '</td><td class="num">' + celdaHorario(h) + '</td><td class="centro">' + esc(h.turno) + '</td>' +
            '<td class="obs">' + esc(h.obs) + notaProblemas(h) + '</td><td class="cambio">' + cambio + '</td></tr>';
    };
    var filas;
    if (r.filtro === 'cambian') {
        filas = c.cambian.map(function (x) {
            var antes = x.campos.map(function (campo) { return campo + ': ' + valorCampo(x.antes, campo); }).join(' · ');
            return fila(x.despues, '<b>' + esc(x.campos.join(', ')) + '</b><span class="sub">Antes: ' + esc(antes) + '</span>', 'rev-cambia');
        });
    } else if (r.filtro === 'quitadas') {
        filas = c.quitadas.map(function (h) { return fila(h, '<b>Se quita</b>', 'rev-quita'); });
    } else {
        var nuevas = {}, cambian = {};
        c.nuevas.forEach(function (h) { nuevas[h.ruta] = true; });
        c.cambian.forEach(function (x) { cambian[x.despues.ruta] = x.campos; });
        filas = todas.filter(function (h) {
            return r.filtro === 'nuevas' ? nuevas[h.ruta] : r.filtro === 'problemas' ? problemasHorario(h).length
                : r.filtro === 'iguales' ? !nuevas[h.ruta] && !cambian[h.ruta] : true;
        }).sort(function (a, b) { return a.zona.localeCompare(b.zona) || a.ruta.localeCompare(b.ruta); }).map(function (h) {
            return fila(h, nuevas[h.ruta] && datos ? '<b>Nueva</b>' : cambian[h.ruta] ? esc(cambian[h.ruta].join(', ')) : '', nuevas[h.ruta] && datos ? 'rev-nueva' : '');
        });
    }
    var pg = paginar(filas, r.pagina);
    r.pagina = pg.pagina;
    $('rev-tabla').innerHTML = cab + '<tbody>' + (filas.length ? pg.filas.join('') : '<tr><td colspan="8" class="vacio">Nada en este grupo.</td></tr>') + '</tbody>';
    $('rev-paginas').innerHTML = controlesPagina(pg);
}

// Valor de un campo comparado, para "Antes: …"
function valorCampo(h, campo) {
    var v = campo === 'zona' ? h.zona : campo === 'macrorruta' ? h.macro : campo === 'días' ? textoDias(h.dias) : campo === 'horario' ? h.horas.map(hhmm).join(' o ')
        : campo === 'excepciones' ? Object.keys(h.porDia).map(function (d) { return NOMBRES_DIAS[d] + ' ' + hhmm(h.porDia[d]); }).join(', ')
        : campo === 'turno' ? h.turno : h.obs;
    return v || '(vacío)';
}

async function guardarRevision() {
    var boton = $('rev-guardar'), r = revision;
    boton.disabled = true; boton.textContent = 'Guardando ' + r.leidos.n + ' rutas…';
    try {
        datos = await guardarHorarios(supabase, r.leidos, r.nombre);
        revision = null;
        $('revision').hidden = true;
        toast('Listo: ' + datos.n + ' rutas guardadas. Horas extras ya las usa.');
        mostrar();
    } catch (e) {
        toast('⚠ No se guardaron: ' + e.message);
        pintarRevision();
    }
    boton.disabled = false;
}

// ---------- Rutas guardadas: consultar, crear, corregir y quitar ----------

function mostrar() {
    $('nombre-horarios').textContent = textoGuardados(datos) + ' · toque para cargar otro';
    $('caja-horarios').classList.add('listo');
    $('cargados').textContent = textoGuardados(datos);
    $('resultado').hidden = false;
    var todas = lista();
    var zonas = todas.map(function (h) { return h.zona; }).filter(function (z, i, a) { return a.indexOf(z) === i; }).sort();
    $('zonas').innerHTML = [''].concat(zonas).map(function (z) {
        var n = z ? todas.filter(function (h) { return h.zona === z; }).length : todas.length;
        return '<button type="button" class="chip" data-zona="' + esc(z) + '" aria-pressed="' + (zona === z) + '">' + esc(z || 'Todas') + ' <b>' + n + '</b></button>';
    }).join('');
    $('lista-zonas').innerHTML = zonas.map(function (z) { return '<option value="' + esc(z) + '">'; }).join('');
    var nProb = todas.filter(function (h) { return problemasHorario(h).length; }).length, nEdit = todas.filter(function (h) { return h.editado; }).length;
    $('estados').innerHTML = (nProb ? '<button type="button" class="chip menos" data-estado="problemas" aria-pressed="' + (estado === 'problemas') + '">⚠ Con problemas <b>' + nProb + '</b></button>' : '') +
        (nEdit ? '<button type="button" class="chip horario" data-estado="editadas" aria-pressed="' + (estado === 'editadas') + '">✏️ Editadas a mano <b>' + nEdit + '</b></button>' : '');
    if ((estado === 'problemas' && !nProb) || (estado === 'editadas' && !nEdit)) estado = '';
    pintar();
}

function pintar() {
    if (!datos) return;
    var q = plano($('buscar').value);
    var filas = lista().filter(function (h) {
        return (!zona || h.zona === zona) && (!q || plano(h.ruta + ' ' + h.macro + ' ' + h.obs + ' ' + h.zona).indexOf(q) >= 0) &&
            (estado !== 'problemas' || problemasHorario(h).length) && (estado !== 'editadas' || h.editado);
    }).sort(function (a, b) { return a.zona.localeCompare(b.zona) || a.ruta.localeCompare(b.ruta); });
    var cols = puede ? 8 : 7, pg = paginar(filas, pagina);
    pagina = pg.pagina;
    $('tabla').innerHTML = '<thead><tr><th>Ruta</th><th>Zona</th><th>Macrorruta</th><th>Días</th><th>Horario</th><th>Turno</th><th>Observación</th>' + (puede ? '<th></th>' : '') + '</tr></thead><tbody>' +
        (filas.length ? pg.filas.map(function (h) {
            return '<tr><td class="num"><b>' + esc(h.ruta) + '</b>' + (h.editado ? '<span class="sub" title="Editada a mano">✏️ editada</span>' : '') + '</td>' +
                '<td>' + esc(h.zona) + '</td><td>' + esc(h.macro) + '</td><td>' + esc(textoDias(h.dias)) + '</td>' +
                '<td class="num">' + celdaHorario(h) + '</td><td class="centro">' + esc(h.turno) + '</td><td class="obs">' + esc(h.obs) + notaProblemas(h) + '</td>' +
                (puede ? '<td class="acciones-fila"><button type="button" class="icono" data-editar="' + esc(h.ruta) + '" title="Corregir la ruta ' + esc(h.ruta) + '">✏️</button>' +
                    '<button type="button" class="icono quitar" data-borrar="' + esc(h.ruta) + '" title="Quitar la ruta ' + esc(h.ruta) + '">🗑</button></td>' : '') + '</tr>';
        }).join('') : '<tr><td colspan="' + cols + '" class="vacio">Ninguna ruta coincide con la búsqueda.</td></tr>') + '</tbody>';
    $('paginas').innerHTML = controlesPagina(pg);
}

// Ventana de la ruta: nueva (h = null) o para corregir una guardada
function abrirRuta(h) {
    editando = h;
    var f = $('form-ruta');
    $('ruta-titulo').textContent = h ? 'Ruta ' + h.ruta : 'Nueva ruta';
    f.ruta.value = h ? h.ruta : '';
    f.zona.value = h ? h.zona : zona;
    f.macro.value = h ? h.macro : '';
    // El HORARIO como estaba en el Excel; si no hay, las horas leídas
    f.horario.value = h ? h.horarioVer || h.horas.map(hhmm).join(' y ') : '';
    f.turno.value = h ? h.turno : '';
    f.obs.value = h ? h.obs : '';
    $('ruta-dias').innerHTML = NOMBRES_DIAS.slice(1).map(function (n, i) {
        return '<label><input type="checkbox" value="' + (i + 1) + '"' + (h && h.dias.indexOf(i + 1) >= 0 ? ' checked' : '') + '> ' + n + '</label>';
    }).join('');
    leerFormulario();
    $('dlg-ruta').showModal();
    (h ? f.horario : f.ruta).focus();
}

// Lo que se guardaría, leído igual que una fila del Excel, y cómo se entiende
function leerFormulario() {
    var f = $('form-ruta');
    var h = filaHorario({ ruta: f.ruta.value, zona: f.zona.value, macro: f.macro.value, horario: f.horario.value, turno: f.turno.value, obs: f.obs.value,
        dias: Array.prototype.map.call($('ruta-dias').querySelectorAll('input:checked'), function (c) { return +c.value; }) });
    var lect = $('ruta-lectura');
    if (!h) { lect.textContent = 'Escriba el código de la ruta.'; lect.className = 'vista-ruta'; return null; }
    var otros = Object.keys(h.porDia).map(function (d) { return 'el ' + NOMBRES_DIAS[d] + ' a las ' + hhmm(h.porDia[d]); });
    var p = problemasHorario(h);
    lect.textContent = 'Se revisará: ' + (h.dias.length ? textoDias(h.dias) : 'cualquier día') + ', sale ' + (h.horas.length ? 'a las ' + h.horas.map(hhmm).join(' o ') : 'sin hora') +
        (otros.length ? '; ' + otros.join(', ') : '') + '.' + (p.length ? ' ⚠ ' + p.join(' · ') + '.' : '');
    lect.className = 'vista-ruta' + (p.length ? ' con-problema' : '');
    return h;
}

async function guardarRuta(ev) {
    ev.preventDefault();
    var h = leerFormulario();
    if (!h) return;
    if ((!editando || editando.ruta !== h.ruta) && datos && datos.rutas[h.ruta]) return toast('La ruta ' + h.ruta + ' ya está en los horarios: búsquela y corríjala.');
    var boton = $('ruta-guardar');
    boton.disabled = true; boton.textContent = 'Guardando…';
    try {
        datos = await guardarHorario(supabase, h, editando ? editando.ruta : null);
        $('dlg-ruta').close();
        toast((editando ? 'Ruta ' + h.ruta + ' corregida.' : 'Ruta ' + h.ruta + ' agregada.') + ' Horas extras ya la usa.');
        mostrar();
    } catch (e) {
        toast('⚠ No se guardó: ' + e.message);
    }
    boton.disabled = false; boton.textContent = 'Guardar';
}

async function quitarRuta(r) {
    var h = datos.rutas[r];
    if (!h || !await confirmar('¿Quitar la ruta ' + r + '?', (h.zona ? h.zona + ' · ' : '') + (h.macro || '') + '\nHoras extras dejará de revisar su horario. Vuelve si se carga otra vez el Excel.', 'Quitar')) return;
    try {
        datos = await borrarHorario(supabase, r);
        toast('Ruta ' + r + ' quitada.');
        if (datos) mostrar();
        else { $('resultado').hidden = true; $('cargados').textContent = 'Todavía no hay horarios cargados: se cargan desde el Excel.'; }
    } catch (e) {
        toast('⚠ No se quitó: ' + e.message);
    }
}

function arrancar() {
    iniciarEncabezado();
    var caja = $('caja-horarios'), input = $('archivo-horarios');
    input.onchange = function () { elegir(input.files[0]); };
    caja.addEventListener('dragover', function (ev) { ev.preventDefault(); caja.classList.add('encima'); });
    caja.addEventListener('dragleave', function () { caja.classList.remove('encima'); });
    caja.addEventListener('drop', function (ev) { ev.preventDefault(); caja.classList.remove('encima'); elegir(ev.dataTransfer.files[0]); });
    $('buscar').oninput = function () { pagina = 0; pintar(); };
    $('zonas').onclick = function (ev) { var b = ev.target.closest('[data-zona]'); if (b) { zona = b.dataset.zona; pagina = 0; mostrar(); } };
    $('estados').onclick = function (ev) { var b = ev.target.closest('[data-estado]'); if (b) { estado = estado === b.dataset.estado ? '' : b.dataset.estado; pagina = 0; mostrar(); } };
    $('tabla').onclick = function (ev) {
        var e = ev.target.closest('[data-editar]'), b = ev.target.closest('[data-borrar]');
        if (e) abrirRuta(datos.rutas[e.dataset.editar]);
        if (b) quitarRuta(b.dataset.borrar);
    };
    $('rev-filtros').onclick = function (ev) { var b = ev.target.closest('[data-filtro]'); if (b) { revision.filtro = b.dataset.filtro; revision.pagina = 0; pintarRevision(); } };
    $('paginas').onclick = function (ev) { var b = ev.target.closest('[data-pagina]'); if (b) { pagina = +b.dataset.pagina; pintar(); $('buscar').scrollIntoView({ block: 'start' }); } };
    $('rev-paginas').onclick = function (ev) { var b = ev.target.closest('[data-pagina]'); if (b) { revision.pagina = +b.dataset.pagina; pintarRevision(); $('rev-filtros').scrollIntoView({ block: 'start' }); } };
    $('rev-cancelar').onclick = function () { revision = null; $('revision').hidden = true; };
    $('rev-guardar').onclick = guardarRevision;
    $('btn-agregar').onclick = function () { abrirRuta(null); };
    $('form-ruta').onsubmit = guardarRuta;
    $('form-ruta').oninput = leerFormulario;
    $('ruta-cancelar').onclick = $('ruta-cerrar').onclick = function () { $('dlg-ruta').close(); };
    if (!configurado) { $('cargados').textContent = 'Sin conexión con la base de datos.'; return; }
    asegurarSesion(supabase).then(async function (usuario) {
        try {
            datos = await horariosGuardados(supabase);
            if (datos) mostrar();
            else $('cargados').textContent = 'Todavía no hay horarios cargados: se cargan desde el Excel.';
        } catch (e) { $('cargados').textContent = '⚠ No se pudieron leer los horarios: ' + e.message; }
        var salir = $('btn-salir');
        salir.hidden = false;
        salir.title = 'Cerrar sesión de ' + usuario.email;
        salir.onclick = function () { cerrarSesion(supabase); };
        // Cargan el Excel y corrigen rutas los administradores y quien tenga el permiso (perfiles.cargar_horarios); los demás consultan
        aplicarPermisos(supabase, usuario).then(function (p) {
            puede = !!(p.admin || p.horarios);
            $('caja-horarios').hidden = !puede;
            $('btn-agregar').hidden = !puede;
            pintar();
        });
    });
}

arrancar();
