// ==UserScript==
// @name         Llenar PQR EMVARIAS (Microrrutas)
// @namespace    https://diegozvanegas-sudo.github.io/microrutas/
// @version      1.0
// @description  Llena el formulario de PQRS de EMVARIAS con la PQR preparada en Microrrutas (Radicar PQR). No acepta términos, no marca el captcha ni envía.
// @match        https://diegozvanegas-sudo.github.io/microrutas/radicar.html*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @match        https://runtime.lappiz.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==
// Generado por tools/generar_userscript.mjs desde src/radicar/marcador.js: no editar a mano.
(function automatico(llenar, PREFIJO_) {
    /* global GM_setValue, GM_getValue, GM_deleteValue */
    var CLAVE = 'pqr-emvarias', VIGENCIA = 30 * 60 * 1000;
    if (/runtime\.lappiz\.io$/.test(location.hostname)) {
        var intentos = 0, corriendo = false;
        var revisar = async function () {
            if (corriendo || ++intentos > 1200) return;
            var g = GM_getValue(CLAVE, null), ok = document.getElementById('emvPrivacyAccepted');
            if (!g || Date.now() - g.hora > VIGENCIA) { if (g) GM_deleteValue(CLAVE); return; }
            if (!document.getElementById('emvTipoSolicitud') || !document.getElementById('emvDepartamento') || document.getElementById('emvDepartamento').options.length < 5) return;
            if (ok && !ok.checked) return;   // falta que la persona acepte el tratamiento de datos
            corriendo = true;
            GM_deleteValue(CLAVE);
            try { await llenar(JSON.parse(g.datos.slice(PREFIJO_.length))); } finally { corriendo = false; }
        };
        setInterval(revisar, 1000);
    } else {
        // Página de la app: avisa que el llenado automático está instalado y guarda la PQR que anuncia
        document.documentElement.setAttribute('data-llenado-emvarias', '1');
        window.addEventListener('message', function (e) {
            if (e.source !== window || !e.data || e.data.tipo !== 'PQR-EMVARIAS' || String(e.data.datos).indexOf(PREFIJO_) !== 0) return;
            GM_setValue(CLAVE, { datos: e.data.datos, hora: Date.now() });
        });
    }
})(async function llenarCon(d) {
    var faltan = [], puestos = 0;
    var $ = function (id) { return document.getElementById(id); };
    var plano = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); };
    var esperar = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    var avisar = function (html, color) {
        var a = $('pqr-marcador-aviso');
        if (!a) { a = document.createElement('div'); a.id = 'pqr-marcador-aviso'; document.body.appendChild(a); }
        a.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:14px 16px;border-radius:12px;font:14px/1.45 Segoe UI,Arial,sans-serif;' +
            'box-shadow:0 10px 30px rgba(0,0,0,.25);color:#fff;background:' + (color || '#167a55'));
        a.innerHTML = html + '<div style="margin-top:8px;text-align:right"><button type="button" style="border:0;border-radius:8px;padding:5px 12px;cursor:pointer" onclick="this.closest(\'#pqr-marcador-aviso\').remove()">Cerrar</button></div>';
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
    var direccion = async function (pre, x) {
        x = x || {};
        await lista('emv' + pre + 'TipoVia', x.via, 'Tipo de vía');
        texto('emv' + pre + 'Num1', x.num1);
        await lista('emv' + pre + 'Letra1', x.letra1, 'Letra');
        await lista('emv' + pre + 'Orient1', x.orient1, 'Orientación');
        texto('emv' + pre + 'Num2', x.num2);
        await lista('emv' + pre + 'Letra2', x.letra2, 'Letra generador');
        await lista('emv' + pre + 'Orient2', x.orient2, 'Orientación generador');
        texto('emv' + pre + 'Placa', x.placa);
    };
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
    avisar('✓ Se llenaron <b>' + puestos + '</b> campos con la PQR de la app.' + (faltan.length ? '<br>No se pudo elegir: ' + faltan.join(', ') + '. Elíjalo a mano.' : '') +
        '<br><br>Revise los datos, adjunte las fotos, marque <b>«No soy un robot»</b> y radique.', faltan.length ? '#b45309' : '#167a55');
    return { puestos: puestos, faltan: faltan };
}, "PQR-EMVARIAS:");
