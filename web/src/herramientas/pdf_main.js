// pdf.html: elegir los PDF, ordenarlos, escoger páginas y comprimir. No necesita sesión: nada sale del equipo.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { aplicarPermisos, asegurarSesion, cerrarSesion } from '../sesion.js';
import { supabase, configurado } from '../supabase.js';
import { esc } from '../diario/comun.js';
import { textoTamano, leerPaginas, contarPaginas, armarPdf } from './pdf.js';

var $ = function (id) { return document.getElementById(id); };
var lista = [], ocupado = false;

function pintar() {
    $('lista').innerHTML = lista.length ? lista.map(function (x, i) {
        return '<div class="pdf-fila" data-i="' + i + '">' +
            '<div class="pdf-orden"><button type="button" class="secundario pequeno" data-mover="-1" aria-label="Subir"' + (i ? '' : ' disabled') + '>↑</button>' +
                '<button type="button" class="secundario pequeno" data-mover="1" aria-label="Bajar"' + (i < lista.length - 1 ? '' : ' disabled') + '>↓</button></div>' +
            '<div class="pdf-info"><b>' + esc(x.archivo.name) + '</b><div class="sub">' + x.total + (x.total === 1 ? ' página' : ' páginas') + ' · ' + textoTamano(x.archivo.size) + '</div></div>' +
            '<label class="pdf-pag">Páginas<input data-paginas value="' + esc(x.texto) + '" placeholder="Todas (ej.: 1-3, 5)"></label>' +
            '<button type="button" class="quitar" data-quitar aria-label="Quitar">×</button></div>';
    }).join('') : '<div class="sub">Aún no hay archivos.</div>';
    var total = lista.reduce(function (s, x) { return s + x.archivo.size; }, 0);
    $('resumen').textContent = lista.length ? lista.length + (lista.length === 1 ? ' archivo' : ' archivos') + ' · ' + textoTamano(total) : '';
    $('btn-armar').disabled = ocupado || !lista.length;
}
async function agregar(archivos) {
    for (var i = 0; i < archivos.length; i++) {
        var f = archivos[i];
        try { lista.push({ archivo: f, total: await contarPaginas(f), texto: '' }); }
        catch (e) { aviso('⚠ No se pudo abrir ' + f.name + (/encrypt/i.test(e.message) ? ': tiene contraseña.' : ': no parece un PDF válido.'), true); }
    }
    pintar();
}
function aviso(t, error) {
    $('aviso').textContent = t;
    $('aviso').className = error ? 'aviso-error' : 'sub';
}
function nombreSalida() {
    var n = $('nombre').value.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
    return (n || 'soportes') + '.pdf';
}
async function armar() {
    var partes = [];
    for (var i = 0; i < lista.length; i++) {
        var p = leerPaginas(lista[i].texto, lista[i].total);
        if (!p) return aviso('⚠ Revise las páginas de ' + lista[i].archivo.name + ': tiene ' + lista[i].total + '. Ej.: 1-3, 5', true);
        partes.push({ archivo: lista[i].archivo, paginas: p });
    }
    ocupado = true; pintar();
    $('resultado').hidden = true;
    try {
        var nivel = $('nivel').value, r = await armarPdf(partes, nivel, aviso);
        var antes = lista.reduce(function (s, x) { return s + x.archivo.size; }, 0), despues = r.bytes.length;
        var a = $('btn-bajar');
        if (a.href) URL.revokeObjectURL(a.href);
        a.href = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
        a.download = nombreSalida();
        $('res-texto').textContent = textoTamano(antes) + ' → ' + textoTamano(despues) + (Math.round(100 - 100 * despues / antes) >= 1 ? ' (' + Math.round(100 - 100 * despues / antes) + ' % menos)' : '');
        $('res-nota').textContent = nivel !== 'no' && !r.fotos ? 'Este PDF no trae fotos JPG que se puedan reducir: casi todo es texto o imágenes en otro formato.' :
            nivel !== 'no' ? 'Revise que se lea bien antes de enviarlo. La compresión alta baja más la calidad de las fotos.' : '';
        $('resultado').hidden = false;
        aviso('');
    } catch (e) {
        console.error(e);
        aviso('⚠ No se pudo armar el PDF: ' + e.message, true);
    }
    ocupado = false; pintar();
}

async function arrancar() {
    iniciarEncabezado();
    $('archivos').onchange = function () { agregar(Array.from(this.files)); this.value = ''; };
    $('lista').addEventListener('click', function (ev) {
        var fila = ev.target.closest('[data-i]');
        if (!fila) return;
        var i = +fila.dataset.i, m = ev.target.closest('[data-mover]');
        if (m) { var x = lista.splice(i, 1)[0]; lista.splice(i + +m.dataset.mover, 0, x); pintar(); }
        else if (ev.target.closest('[data-quitar]')) { lista.splice(i, 1); pintar(); }
    });
    $('lista').addEventListener('input', function (ev) {
        if (ev.target.matches('[data-paginas]')) lista[+ev.target.closest('[data-i]').dataset.i].texto = ev.target.value;
    });
    $('btn-armar').onclick = armar;
    $('btn-recargar').onclick = function () { location.reload(); };
    pintar();
    if (!configurado) return;
    var usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { cerrarSesion(supabase); };
    aplicarPermisos(supabase, usuario);
}

arrancar();
