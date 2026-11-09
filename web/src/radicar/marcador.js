// Marcador «🪄 Llenar PQR EMVARIAS»: se instala una vez en la barra de favoritos y, estando en el formulario de EMVARIAS,
// pone en cada campo los datos que la app dejó copiados (texto que empieza por PQR-EMVARIAS:). No acepta el tratamiento
// de datos, no marca el captcha ni envía: eso lo hace la persona.
// Los campos del formulario son listas y casillas normales (ocultas detrás de su diseño) con identificadores fijos (emv…).

export var PREFIJO = 'PQR-EMVARIAS:';

// Lo que se copia para el marcador: solo los campos que lleva el formulario
export function datosMarcador(f) {
    return PREFIJO + JSON.stringify({
        tipoSolicitud: f.tipoSolicitud, tipoSolicitante: f.tipoSolicitante, multiusuario: f.multiusuario, tipoIdentificacion: f.tipoIdentificacion,
        numeroIdentificacion: f.numeroIdentificacion, primerNombre: f.primerNombre, segundoNombre: f.segundoNombre, primerApellido: f.primerApellido,
        segundoApellido: f.segundoApellido, pais: f.pais, departamento: f.departamento, municipio: f.municipio, barrio: f.barrio,
        numeroContrato: f.numeroContrato, prestacion: f.prestacion, complementoPrestacion: f.complementoPrestacion,
        mismaNotificacion: !!f.mismaNotificacion, notificacion: f.notificacion, complementoNotificacion: f.complementoNotificacion,
        telefonoMovil: f.telefonoMovil, telefonoFijo: f.telefonoFijo, correo: f.correo, medioRespuesta: f.medioRespuesta,
        nombreContacto: f.nombreContacto, contenido: f.contenido
    });
}

// Corre dentro de la página de EMVARIAS (por eso no usa nada de la app). Se convierte en el enlace javascript: del marcador
export function llenarFormulario() {
    var PREFIJO_ = 'PQR-EMVARIAS:', faltan = [], puestos = 0;
    var $ = function (id) { return document.getElementById(id); };
    var plano = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); };
    var esperar = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    var avisar = function (html, color) {
        var d = $('pqr-marcador-aviso');
        if (!d) { d = document.createElement('div'); d.id = 'pqr-marcador-aviso'; document.body.appendChild(d); }
        d.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:14px 16px;border-radius:12px;font:14px/1.45 Segoe UI,Arial,sans-serif;' +
            'box-shadow:0 10px 30px rgba(0,0,0,.25);color:#fff;background:' + (color || '#167a55'));
        d.innerHTML = html + '<div style="margin-top:8px;text-align:right"><button type="button" style="border:0;border-radius:8px;padding:5px 12px;cursor:pointer" onclick="this.closest(\'#pqr-marcador-aviso\').remove()">Cerrar</button></div>';
    };
    var disparar = function (e) { ['input', 'change', 'blur'].forEach(function (t) { e.dispatchEvent(new Event(t, { bubbles: true })); }); };
    var texto = function (id, v) {
        var e = $(id);
        if (!e || v == null || v === '') return;
        var proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, String(v));
        disparar(e); puestos++;
    };
    // Lista: se elige la opción por su texto; si la lista se llena después (municipio, barrio), se espera hasta 10 s
    var lista = async function (id, v, nombre) {
        if (!v) return;
        for (var t = 0; t < 40; t++) {
            var e = $(id);
            if (e && e.options.length > 1) {
                var ops = Array.prototype.slice.call(e.options), q = plano(v);
                var o = ops.find(function (x) { return plano(x.textContent) === q; }) || ops.find(function (x) { return x.value && plano(x.textContent).indexOf(q) === 0; });
                if (o) { e.value = o.value; disparar(e); puestos++; await esperar(350); return; }
            }
            await esperar(250);
        }
        faltan.push(nombre + ': «' + v + '»');
    };
    var casilla = function (id, si) { var e = $(id); if (e && e.checked !== !!si) { e.click(); puestos++; } };
    var direccion = async function (pre, d) {
        d = d || {};
        await lista('emv' + pre + 'TipoVia', d.via, 'Tipo de vía');
        texto('emv' + pre + 'Num1', d.num1);
        await lista('emv' + pre + 'Letra1', d.letra1, 'Letra');
        await lista('emv' + pre + 'Orient1', d.orient1, 'Orientación');
        texto('emv' + pre + 'Num2', d.num2);
        await lista('emv' + pre + 'Letra2', d.letra2, 'Letra generador');
        await lista('emv' + pre + 'Orient2', d.orient2, 'Orientación generador');
        texto('emv' + pre + 'Placa', d.placa);
    };
    (async function () {
        if (!$('emvTipoSolicitud')) { avisar('Abra primero el formulario de radicación de PQRS de EMVARIAS y vuelva a tocar el marcador.', '#b45309'); return; }
        if ($('emvPrivacyAccepted') && !$('emvPrivacyAccepted').checked) { avisar('Primero lea y acepte el <b>tratamiento de datos personales</b> («Aceptar y continuar»). Después vuelva a tocar el marcador.', '#b45309'); return; }
        var crudo = '';
        try { crudo = await navigator.clipboard.readText(); } catch (e) { crudo = ''; }
        if (String(crudo).indexOf(PREFIJO_) !== 0) crudo = window.prompt('Pegue aquí los datos de la PQR (en la app: «📋 Copiar para el marcador»):') || '';
        if (String(crudo).indexOf(PREFIJO_) !== 0) { avisar('No encontré los datos de la PQR. En la app toque «🏛️ Abrir formulario de EMVARIAS» (copia los datos) y vuelva a tocar el marcador.', '#b45309'); return; }
        var d = JSON.parse(crudo.slice(PREFIJO_.length));
        avisar('Llenando el formulario…');
        await lista('emvTipoSolicitud', d.tipoSolicitud, 'Tipo de solicitud');
        await lista('emvTipoSolicitante', d.tipoSolicitante, 'Tipo de solicitante');
        await lista('emvMultiusuario', d.multiusuario, 'Multiusuario');
        await lista('emvTipoIdentificacion', d.tipoIdentificacion, 'Tipo de identificación');
        texto('emvNumeroIdentificacion', d.numeroIdentificacion);
        texto('emvPrimerNombre', d.primerNombre); texto('emvSegundoNombre', d.segundoNombre);
        texto('emvPrimerApellido', d.primerApellido); texto('emvSegundoApellido', d.segundoApellido);
        await lista('emvPais', d.pais, 'País');
        await lista('emvDepartamento', d.departamento, 'Departamento');
        await lista('emvMunicipio', d.municipio, 'Municipio');
        await lista('emvBarrio', d.barrio, 'Barrio');
        texto('emvNumeroContrato', d.numeroContrato);
        await direccion('Pre', d.prestacion);
        texto('emvComplementoPrestacion', d.complementoPrestacion);
        casilla('emvImputarDireccion', d.mismaNotificacion);
        await esperar(300);
        if (!d.mismaNotificacion) { await direccion('Not', d.notificacion); texto('emvComplementoNotificacion', d.complementoNotificacion); }
        texto('emvTelefonoMovil', d.telefonoMovil); texto('emvTelefonoFijo', d.telefonoFijo); texto('emvCorreoElectronico', d.correo);
        await lista('emvMedioRespuesta', d.medioRespuesta, 'Medio de respuesta');
        texto('emvNombreContacto', d.nombreContacto);
        texto('emvContenido', d.contenido);
        avisar('✓ Se llenaron <b>' + puestos + '</b> campos.' + (faltan.length ? '<br>No se pudo elegir: ' + faltan.join(', ') + '. Elíjalo a mano.' : '') +
            '<br><br>Revise los datos, adjunte las fotos, marque <b>«No soy un robot»</b> y radique.', faltan.length ? '#b45309' : '#167a55');
    })().catch(function (e) { avisar('No se pudo llenar: ' + (e && e.message), '#b91c1c'); });
}

// Enlace del marcador (javascript:…), para arrastrarlo a la barra de favoritos
export function enlaceMarcador() { return 'javascript:' + encodeURIComponent('(' + llenarFormulario.toString() + ')();void 0'); }
