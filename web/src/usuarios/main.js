// usuarios.html: crear, editar, desactivar y eliminar usuarios. Solo para administradores:
// la página llama las funciones admin_* de Supabase (0004_usuarios.sql), que revisan el rol antes de hacer nada.
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast, aviso, confirmar } from '../subsanaciones/ui.js';
import { SECCIONES, GRUPOS, seccion, puede } from '../secciones.js';

var usuarios = [], yo = null, editando = null;
var form = $('form'), dlg = $('dlg');

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function plano(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
var fechaHora = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function cuando(v) { return v ? fechaHora.format(new Date(v)) : 'Nunca'; }

// Mensajes de la base en palabras de la página
function mensaje(e) {
    var m = e && e.message || String(e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión con la base de datos.';
    if (/JWT|not authenticated/i.test(m)) return 'Su sesión venció; recargue la página e inicie sesión de nuevo.';
    return m;
}
async function llamar(funcion, args) {
    var res = await supabase.rpc(funcion, args);
    if (res.error) throw new Error(mensaje(res.error));
    return res.data;
}

async function cargar() {
    try {
        usuarios = await llamar('admin_usuarios');
        aviso('');
        pintar();
    } catch (e) {
        $('lista').innerHTML = '';
        aviso('No se pudo cargar la lista: ' + esc(e.message), true);
    }
}

function pintar() {
    var q = plano($('f-texto').value.trim()), rol = $('f-rol').value;
    var filas = usuarios.filter(function (u) {
        return (!rol || u.rol === rol) && (!q || plano(u.nombre + ' ' + u.correo).indexOf(q) !== -1);
    });
    if (!filas.length) { $('lista').innerHTML = '<div class="vacio">' + (usuarios.length ? 'Nadie coincide con la búsqueda.' : 'No hay usuarios.') + '</div>'; return; }
    $('lista').innerHTML = '<table class="tabla-usuarios"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th>Visitas</th><th>Contrato</th><th>Secciones</th><th></th></tr></thead><tbody>' +
        filas.map(function (u) {
            var propio = u.id === yo;
            return '<tr' + (u.activo ? '' : ' class="inactivo"') + '>' +
                '<td data-label="Usuario"><b>' + esc(u.nombre || '—') + '</b>' + (propio ? ' <span class="tu">usted</span>' : '') + '<div class="sub">' + esc(u.correo) + '</div></td>' +
                '<td data-label="Rol"><span class="rol rol-' + esc(u.rol) + '">' + (u.rol === 'admin' ? 'Administrador' : 'Interventor') + '</span></td>' +
                '<td data-label="Estado"><span class="estado ' + (u.activo ? 'e-SUBSANADO">Activo' : 'e-CERRADO">Desactivado') + '</span></td>' +
                '<td data-label="Último ingreso">' + esc(cuando(u.ultimo_ingreso)) + '</td>' +
                '<td data-label="Visitas">' + u.visitas + ' registradas<div class="sub">' + u.subsanadas + ' subsanadas</div></td>' +
                '<td data-label="Contrato">' + (u.ver_contrato ? '📜 Puede verlo' : '<span class="sub">No</span>') + '</td>' +
                '<td data-label="Secciones">' + resumenSecciones(u) + '</td>' +
                '<td class="acciones">' +
                    '<button type="button" class="secundario pequeno" data-editar="' + esc(u.id) + '">Editar</button> ' +
                    (propio ? '' : '<button type="button" class="secundario pequeno" data-activar="' + esc(u.id) + '">' + (u.activo ? 'Desactivar' : 'Activar') + '</button> ' +
                        '<button type="button" class="peligro pequeno" data-eliminar="' + esc(u.id) + '">Eliminar</button>') +
                '</td></tr>';
        }).join('') + '</tbody></table>';
}

function abrir(u) {
    editando = u || null;
    form.reset();
    $('form-error').hidden = true;
    $('dlg-titulo').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
    form.nombre.value = u ? u.nombre || '' : '';
    form.correo.value = u ? u.correo : '';
    form.rol.value = u ? u.rol : 'interventor';
    form.clave.required = !u;
    form.clave.placeholder = u ? 'Dejar vacía para no cambiarla' : '';
    $('clave-ayuda').textContent = u ? 'Solo si la quiere cambiar. Mínimo 8 caracteres.' : 'Mínimo 8 caracteres. Cópiela antes de guardar para pasársela al usuario.';
    $('campo-activo').hidden = !u;
    form.activo.checked = !u || u.activo;
    // Su propio usuario: no puede quitarse el rol de administrador ni desactivarse
    var propio = u && u.id === yo;
    form.rol.disabled = form.activo.disabled = !!propio;
    ajustarContrato();
    pintarSecciones(u ? u.ocultas || [] : []);
    dlg.showModal();
    form.nombre.focus();
}
// Los administradores siempre ven el contrato: la casilla solo aplica a interventores
function ajustarContrato() {
    var admin = form.rol.value === 'admin';
    form.contrato.disabled = admin;
    form.contrato.checked = admin || !!(editando && editando.rol !== 'admin' && editando.ver_contrato);
    $('contrato-ayuda').textContent = admin ? '(los administradores siempre lo ven)' : '';
    ajustarSecciones();
}

// ---------- Secciones que ve cada usuario (0024_secciones_por_usuario.sql; la lista está en secciones.js) ----------
// En la base va lo APAGADO (ocultas); en la ventana, la casilla marcada es lo que sí ve
function resumenSecciones(u) {
    if (u.rol === 'admin') return '<span class="sub">Todas (administrador)</span>';
    var apagadas = (u.ocultas || []).filter(seccion);
    var ve = SECCIONES.filter(function (s) { return puede({ admin: false, contrato: u.ver_contrato, ocultas: apagadas }, s.clave); }).length;
    if (ve === SECCIONES.length) return 'Todas';
    var nombres = apagadas.map(function (k) { return seccion(k).nombre; }).join(', ');
    return '<span' + (nombres ? ' title="Apagadas: ' + esc(nombres) + '"' : '') + '>' + ve + ' de ' + SECCIONES.length + '</span>' +
        '<div class="sub">' + (apagadas.length ? apagadas.length + (apagadas.length === 1 ? ' apagada' : ' apagadas') : 'sin el contrato') + '</div>';
}
function pintarSecciones(ocultas) {
    $('sec-lista').innerHTML = GRUPOS.map(function (g) {
        return '<div class="us-sec-grupo"><b>' + esc(g) + '</b>' + SECCIONES.filter(function (s) { return s.grupo === g; }).map(function (s) {
            return '<label class="us-sec"><input type="checkbox" data-sec="' + s.clave + '"' + (ocultas.indexOf(s.clave) === -1 ? ' checked' : '') + '> ' +
                '<span>' + esc(s.nombre) + '<small data-nota="' + s.clave + '"></small></span></label>';
        }).join('') + '</div>';
    }).join('');
    ajustarSecciones();
}
function casilla(k) { return $('sec-lista').querySelector('[data-sec="' + k + '"]'); }
// Administrador: ve todo. Lo del contrato pide «Puede ver el contrato»; las herramientas de Subsanaciones, Subsanaciones
function ajustarSecciones() {
    if (!$('sec-lista').firstChild) return;
    var admin = form.rol.value === 'admin', contrato = admin || form.contrato.checked;
    var subs = casilla('subsanaciones').checked;
    $('sec-todas').disabled = $('sec-ninguna').disabled = admin;
    $('secciones-ayuda').textContent = admin ? 'Los administradores ven todas las secciones.'
        : 'Lo que apague desaparece de sus menús y, si abre el enlace, le sale «No tiene acceso».';
    SECCIONES.forEach(function (s) {
        var c = casilla(s.clave), nota = '';
        if (admin) nota = '';
        else if (s.contrato && !contrato) nota = 'necesita «Puede ver el contrato»';
        else if (s.dentro && s.dentro === 'subsanaciones' && !subs) nota = 'se abre dentro de Subsanaciones';
        // Bloqueada por el contrato o por Subsanaciones: se ve sin marcar (no la ve) y al desbloquearla vuelve como estaba
        if (nota && !c.dataset.bloq) { c.dataset.bloq = c.checked ? 'si' : 'no'; c.checked = false; }
        else if (!nota && c.dataset.bloq) { c.checked = c.dataset.bloq === 'si'; delete c.dataset.bloq; }
        c.disabled = admin || !!nota;
        c.closest('label').classList.toggle('us-sec-off', !admin && !!nota);
        $('sec-lista').querySelector('[data-nota="' + s.clave + '"]').textContent = nota;
        if (admin) c.checked = true;
    });
}
function todasSecciones(si) {
    // Primero Subsanaciones: de ella dependen sus herramientas
    casilla('subsanaciones').checked = si;
    ajustarSecciones();
    // Las bloqueadas quedan así para cuando se desbloqueen
    SECCIONES.forEach(function (s) { var c = casilla(s.clave); if (c.dataset.bloq) c.dataset.bloq = si ? 'si' : 'no'; else if (!c.disabled) c.checked = si; });
    ajustarSecciones();
}
// Lo apagado. Las bloqueadas (por el contrato o por Subsanaciones) guardan lo que tenían (o lo que les puso Todas / Ninguna)
function ocultasDelFormulario(antes) {
    return SECCIONES.filter(function (s) {
        var c = casilla(s.clave);
        if (c.dataset.bloq) return c.dataset.bloq === 'no';
        return c.disabled ? (antes || []).indexOf(s.clave) !== -1 : !c.checked;
    }).map(function (s) { return s.clave; });
}
function mismas(a, b) { return (a || []).slice().sort().join() === (b || []).slice().sort().join(); }

// Contraseña de 12 caracteres sin letras que se confunden (l, 1, O, 0)
function generarClave() {
    var letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', n = new Uint32Array(12);
    crypto.getRandomValues(n);
    return Array.from(n, function (x) { return letras[x % letras.length]; }).join('');
}

async function guardar(ev) {
    ev.preventDefault();
    var boton = $('btn-guardar'), clave = form.clave.value;
    var datos = { nombre: form.nombre.value.trim() || null, correo: form.correo.value.trim(), rol: form.rol.value };
    boton.disabled = true;
    $('form-error').hidden = true;
    try {
        if (editando) {
            var cambio = {
                usuario: editando.id,
                nombre: datos.nombre,
                correo: datos.correo.toLowerCase() === editando.correo ? null : datos.correo,
                rol: form.rol.disabled ? null : datos.rol,
                clave: clave || null,
                activo: form.activo.disabled ? null : form.activo.checked,
                ver_contrato: form.contrato.disabled ? null : form.contrato.checked,
            };
            await llamar('admin_editar_usuario', cambio);
            if (datos.rol !== 'admin' || form.rol.disabled) {
                var ocultas = ocultasDelFormulario(editando.ocultas);
                if (!mismas(ocultas, editando.ocultas)) await guardarSecciones(editando.id, ocultas);
            }
            toast('Usuario actualizado' + (clave ? ' con la contraseña nueva' : ''));
        } else {
            var nuevo = await llamar('admin_crear_usuario', { correo: datos.correo, clave: clave, nombre: datos.nombre, rol: datos.rol });
            if (!form.contrato.disabled && form.contrato.checked) await llamar('admin_editar_usuario', { usuario: nuevo, ver_contrato: true });
            var apagadas = datos.rol === 'admin' ? [] : ocultasDelFormulario([]);
            if (apagadas.length) await guardarSecciones(nuevo, apagadas);
            toast('Usuario creado: ' + datos.correo);
        }
        dlg.close();
        cargar();
    } catch (e) {
        $('form-error').textContent = e.message;
        $('form-error').hidden = false;
    } finally {
        boton.disabled = false;
    }
}

async function guardarSecciones(id, ocultas) {
    try { await llamar('admin_secciones', { usuario: id, ocultas: ocultas }); }
    catch (e) {
        throw new Error(/admin_secciones|function|schema cache/i.test(e.message)
            ? 'Lo demás quedó guardado, pero las secciones no: falta aplicar la migración 0024_secciones_por_usuario.sql en Supabase.'
            : 'Lo demás quedó guardado, pero las secciones no: ' + e.message);
    }
}

async function activar(u) {
    var si = await confirmar(u.activo ? '¿Desactivar a ' + (u.nombre || u.correo) + '?' : '¿Activar a ' + (u.nombre || u.correo) + '?',
        u.activo ? 'No podrá ingresar y se cierran sus sesiones abiertas. Sus visitas se conservan.' : 'Podrá ingresar de nuevo con su contraseña.',
        u.activo ? 'Desactivar' : 'Activar');
    if (!si) return;
    try {
        await llamar('admin_editar_usuario', { usuario: u.id, activo: !u.activo });
        toast(u.activo ? 'Usuario desactivado' : 'Usuario activado');
        cargar();
    } catch (e) { toast(e.message); }
}

async function eliminar(u) {
    var si = await confirmar('¿Eliminar a ' + (u.nombre || u.correo) + '?',
        'Se borra el usuario y no se puede deshacer. Sus ' + u.visitas + ' visitas se conservan con el nombre que tenían.\n' +
        'Si solo quiere que no entre, mejor desactívelo.', 'Eliminar');
    if (!si) return;
    try {
        await llamar('admin_eliminar_usuario', { usuario: u.id });
        toast('Usuario eliminado');
        cargar();
    } catch (e) { toast(e.message); }
}

async function arrancar() {
    iniciarEncabezado();
    if (!configurado) { $('lista').innerHTML = ''; aviso('Falta la conexión con Supabase (.env).', true); return; }
    var usuario = await asegurarSesion(supabase);
    yo = usuario.id;
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { cerrarSesion(supabase); };
    if (!(await aplicarPermisos(supabase, usuario)).admin) {
        $('lista').innerHTML = '';
        aviso('🔒 Esta página es solo para administradores. Pídale al administrador que le cambie el rol si necesita manejar usuarios.', true);
        return;
    }
    $('btn-nuevo').hidden = false;
    $('filtros').hidden = false;
    $('btn-nuevo').onclick = function () { abrir(null); };
    $('btn-recargar').onclick = cargar;
    $('btn-cerrar').onclick = $('btn-cancelar').onclick = function () { dlg.close(); };
    $('btn-generar').onclick = function () { form.clave.value = generarClave(); form.clave.select(); };
    $('f-texto').addEventListener('input', pintar);
    $('f-rol').addEventListener('change', pintar);
    form.addEventListener('submit', guardar);
    form.rol.addEventListener('change', ajustarContrato);
    form.contrato.addEventListener('change', ajustarSecciones);
    $('sec-lista').addEventListener('change', function (ev) { if (ev.target.dataset.sec === 'subsanaciones') ajustarSecciones(); });
    $('sec-todas').onclick = function () { todasSecciones(true); };
    $('sec-ninguna').onclick = function () { todasSecciones(false); };
    // Al cerrar (Cancelar, × o Esc) no queda nada a medias para el próximo usuario
    dlg.addEventListener('close', function () { editando = null; $('sec-lista').innerHTML = ''; $('form-error').hidden = true; });
    $('lista').addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        var u = usuarios.find(function (x) { return x.id === (b.dataset.editar || b.dataset.activar || b.dataset.eliminar); });
        if (!u) return;
        if (b.dataset.editar) abrir(u);
        else if (b.dataset.activar) activar(u);
        else eliminar(u);
    });
    cargar();
}

arrancar();
