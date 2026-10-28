// horarios.html: muestra los horarios de rutas de recolección (tabla horarios_rutas) con buscador. El administrador los
// carga desde el Excel: se lee en el navegador y solo se envían las filas. Horas extras (horas.html) revisa con ellos la H.I y la H.F.
import '../diario/estilos.css';
import '../horas/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos, esAdmin } from '../sesion.js';
import { hhmm, plano } from '../horas/cruce.js';
import { textoDias, NOMBRES_DIAS } from './horarios.js';
import { leerArchivoHorarios, horariosGuardados, guardarHorarios, textoGuardados } from './guardado.js';

var $ = function (id) { return document.getElementById(id); };
var datos = null, zona = '';

function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

async function elegir(archivo) {
    if (!archivo) return;
    if (!/\.xlsx$/i.test(archivo.name)) return toast('Use el archivo en formato .xlsx (en Excel: Guardar como → Libro de Excel).');
    $('estado').hidden = false; $('estado').textContent = 'Leyendo…';
    try {
        var leidos = await leerArchivoHorarios(await archivo.arrayBuffer());
        if (!leidos) throw new Error('No encontré las columnas "Nombre de la Microrruta" y "HORARIO" en ninguna hoja.');
        $('estado').textContent = 'Guardando ' + leidos.n + ' rutas…';
        datos = await guardarHorarios(supabase, leidos, archivo.name);
        $('estado').hidden = true;
        toast('Listo: ' + datos.n + ' rutas guardadas. Horas extras ya las usa.');
        mostrar();
    } catch (e) {
        $('estado').textContent = '⚠ ' + e.message;
    }
}

function mostrar() {
    $('nombre-horarios').textContent = textoGuardados(datos) + ' · toque para cargar otro';
    $('caja-horarios').classList.add('listo');
    $('cargados').textContent = textoGuardados(datos);
    $('resultado').hidden = false;
    var lista = Object.keys(datos.rutas).map(function (k) { return datos.rutas[k]; });
    var zonas = lista.map(function (h) { return h.zona; }).filter(function (z, i, a) { return a.indexOf(z) === i; }).sort();
    $('zonas').innerHTML = [''].concat(zonas).map(function (z) {
        var n = z ? lista.filter(function (h) { return h.zona === z; }).length : lista.length;
        return '<button type="button" class="chip" data-zona="' + esc(z) + '" aria-pressed="' + (zona === z) + '">' + esc(z || 'Todas') + ' <b>' + n + '</b></button>';
    }).join('');
    pintar();
}

function pintar() {
    var q = plano($('buscar').value);
    var lista = Object.keys(datos.rutas).map(function (k) { return datos.rutas[k]; }).filter(function (h) {
        return (!zona || h.zona === zona) && (!q || plano(h.ruta + ' ' + h.macro + ' ' + h.obs + ' ' + h.zona).indexOf(q) >= 0);
    }).sort(function (a, b) { return a.zona.localeCompare(b.zona) || a.ruta.localeCompare(b.ruta); });
    $('tabla').innerHTML = '<thead><tr><th>Ruta</th><th>Zona</th><th>Macrorruta</th><th>Días</th><th>Horario</th><th>Turno</th><th>Observación</th></tr></thead><tbody>' +
        (lista.length ? lista.slice(0, 300).map(function (h) {
            var otros = Object.keys(h.porDia).map(function (d) { return NOMBRES_DIAS[d] + ' ' + hhmm(h.porDia[d]); });
            return '<tr><td class="num"><b>' + esc(h.ruta) + '</b></td><td>' + esc(h.zona) + '</td><td>' + esc(h.macro) + '</td>' +
                '<td>' + esc(textoDias(h.dias)) + '</td>' +
                '<td class="num">' + esc(h.horas.map(hhmm).join(' o ')) + (otros.length ? '<span class="sub">' + esc(otros.join(' · ')) + '</span>' : '') + '</td>' +
                '<td class="centro">' + esc(h.turno) + '</td><td class="obs">' + esc(h.obs) + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="vacio">Ninguna ruta coincide con la búsqueda.</td></tr>') + '</tbody>';
    if (lista.length > 300) $('tabla').insertAdjacentHTML('beforeend', '<tfoot><tr><td colspan="7" class="sub">Se muestran 300 de ' + lista.length + ': busque la ruta o elija una zona.</td></tr></tfoot>');
}

function arrancar() {
    iniciarEncabezado();
    var caja = $('caja-horarios'), input = $('archivo-horarios');
    input.onchange = function () { elegir(input.files[0]); };
    caja.addEventListener('dragover', function (ev) { ev.preventDefault(); caja.classList.add('encima'); });
    caja.addEventListener('dragleave', function () { caja.classList.remove('encima'); });
    caja.addEventListener('drop', function (ev) { ev.preventDefault(); caja.classList.remove('encima'); elegir(ev.dataTransfer.files[0]); });
    $('buscar').oninput = pintar;
    $('zonas').onclick = function (ev) { var b = ev.target.closest('[data-zona]'); if (b) { zona = b.dataset.zona; mostrar(); } };
    if (!configurado) { $('cargados').textContent = 'Sin conexión con la base de datos.'; return; }
    asegurarSesion(supabase).then(async function (usuario) {
        // Solo el administrador carga el Excel; los demás consultan
        esAdmin(supabase).then(function (si) { $('caja-horarios').hidden = !si; });
        try {
            datos = await horariosGuardados(supabase);
            if (datos) mostrar();
            else $('cargados').textContent = 'Todavía no hay horarios cargados. Un administrador los carga desde el Excel.';
        } catch (e) { $('cargados').textContent = '⚠ No se pudieron leer los horarios: ' + e.message; }
        var salir = $('btn-salir');
        salir.hidden = false;
        salir.title = 'Cerrar sesión de ' + usuario.email;
        salir.onclick = function () { cerrarSesion(supabase); };
        aplicarPermisos(supabase, usuario);
    });
}

arrancar();
