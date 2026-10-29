// Piezas de interfaz compartidas: avisos, toast y la ventana de confirmación.

export var $ = function (id) { return document.getElementById(id); };

export function toast(msg) { var t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, 3500); }
export function aviso(html, error) { $('aviso').innerHTML = html ? '<div class="aviso' + (error ? ' error' : '') + '">' + html + '</div>' : ''; }

// Ventana de confirmación de la página (el confirm() del navegador no aparece en algunos celulares).
// Devuelve una promesa con true (aceptó) o false. Con botonNo (dos opciones): false = ese botón, null = cerró sin elegir.
export function confirmar(titulo, texto, boton, botonNo) {
    var d = $('dlg-confirmar');
    $('conf-titulo').textContent = titulo;
    $('conf-texto').textContent = texto || '';
    $('conf-si').textContent = boton || 'Aceptar';
    $('conf-no').textContent = botonNo || 'Cancelar';
    return new Promise(function (listo) {
        var fin = function (si) { $('conf-si').onclick = $('conf-no').onclick = d.onclose = null; if (d.open) d.close(); listo(si); };
        $('conf-si').onclick = function () { fin(true); };
        $('conf-no').onclick = function () { fin(false); };
        d.onclose = function () { fin(botonNo ? null : false); }; // Esc o "atrás" del celular
        d.showModal();
        $('conf-no').focus();
    });
}
