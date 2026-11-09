// Llenar la PQR en el formulario de EMVARIAS (Lappiz) con los datos de la app. Dos formas, con el mismo código de llenado:
// 1. Marcador «🪄 Llenar PQR EMVARIAS» (barra de favoritos): estando en EMVARIAS, toma los datos copiados (PQR-EMVARIAS:…).
// 2. Llenado automático con la extensión Tampermonkey (public/llenar-pqr-emvarias.user.js, lo genera
//    tools/generar_userscript.mjs desde este archivo): en la app guarda la PQR al tocar «Abrir formulario» y en EMVARIAS,
//    apenas la persona acepta el tratamiento de datos, llena todo solo.
// Ninguna acepta términos, marca el captcha ni envía: eso lo hace la persona.
// Los campos del formulario son listas y casillas normales (ocultas detrás de su diseño) con identificadores fijos (emv…).
// Probado en la página real de EMVARIAS el 10/11/2026 (22 campos, se ven en pantalla).

export var PREFIJO = 'PQR-EMVARIAS:';
export var URL_APP = 'https://diegozvanegas-sudo.github.io/microrutas/radicar.html';

// Lo que se pasa al formulario: solo los campos que lleva
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

// Núcleo: corre dentro de la página de EMVARIAS (por eso no usa nada de la app; se copia como texto en el marcador y en el
// script de Tampermonkey). d: los datos (sin el prefijo). Devuelve { puestos, faltan } y deja un aviso en la página
export async function llenarCon(d) {
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
}

// Marcador: comprueba que esté en el formulario y con el tratamiento de datos aceptado, toma los datos del portapapeles
// (o los pide pegar) y llena
function marcador(llenar, PREFIJO_) {
    var aviso = function (t) { var a = document.createElement('div'); a.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:14px 16px;border-radius:12px;font:14px/1.45 Segoe UI,Arial,sans-serif;color:#fff;background:#b45309'); a.innerHTML = t; document.body.appendChild(a); setTimeout(function () { a.remove(); }, 9000); };
    (async function () {
        if (!document.getElementById('emvTipoSolicitud')) return aviso('Abra primero el formulario de radicación de PQRS de EMVARIAS y vuelva a tocar el marcador.');
        var ok = document.getElementById('emvPrivacyAccepted');
        if (ok && !ok.checked) return aviso('Primero lea y acepte el <b>tratamiento de datos personales</b> («Aceptar y continuar»). Después vuelva a tocar el marcador.');
        var crudo = '';
        try { crudo = await navigator.clipboard.readText(); } catch (e) { crudo = ''; }
        if (String(crudo).indexOf(PREFIJO_) !== 0) crudo = window.prompt('Pegue aquí los datos de la PQR (en la app: «🪄 Copiar para el marcador»):') || '';
        if (String(crudo).indexOf(PREFIJO_) !== 0) return aviso('No encontré los datos de la PQR. En la app toque «🏛️ Abrir formulario de EMVARIAS» (copia los datos) y vuelva a tocar el marcador.');
        await llenar(JSON.parse(crudo.slice(PREFIJO_.length)));
    })().catch(function (e) { aviso('No se pudo llenar: ' + (e && e.message)); });
}
// Enlace del marcador (javascript:…), para arrastrarlo a la barra de favoritos
export function enlaceMarcador() {
    return 'javascript:' + encodeURIComponent('(' + marcador.toString() + ')(' + llenarCon.toString() + ',' + JSON.stringify(PREFIJO) + ');void 0');
}

// Script de Tampermonkey. En la app (radicar.html) guarda la PQR cuando la página la anuncia (postMessage al tocar «Abrir
// formulario»); en EMVARIAS espera a que la persona acepte el tratamiento de datos y llena. La PQR guardada vale 30 minutos
// y se borra al usarla (son datos personales)
function automatico(llenar, PREFIJO_) {
    /* global GM_setValue, GM_getValue, GM_deleteValue */
    var CLAVE = 'pqr-emvarias', VIGENCIA = 30 * 60 * 1000;
    if (/runtime\.lappiz\.io$/.test(location.hostname)) {
        var intentos = 0, corriendo = false;
        var revisar = async function () {
            if (corriendo || ++intentos > 1200) return;
            var g = GM_getValue(CLAVE, null), ok = document.getElementById('emvPrivacyAccepted');
            if (!g || Date.now() - g.hora > VIGENCIA) { if (g) GM_deleteValue(CLAVE); return; }
            if (!document.getElementById('emvTipoSolicitud') || !document.getElementById('emvDepartamento') || document.getElementById('emvDepartamento').options.length < 5) return;
            if (ok && !ok.checked) return; // falta que la persona acepte el tratamiento de datos
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
}
export function scriptTampermonkey() {
    return '// ==UserScript==\n' +
        '// @name         Llenar PQR EMVARIAS (Microrrutas)\n' +
        '// @namespace    https://diegozvanegas-sudo.github.io/microrutas/\n' +
        '// @version      1.0\n' +
        '// @description  Llena el formulario de PQRS de EMVARIAS con la PQR preparada en Microrrutas (Radicar PQR). No acepta términos, no marca el captcha ni envía.\n' +
        '// @match        ' + URL_APP + '*\n' +
        '// @match        http://localhost:*/*\n' +
        '// @match        http://127.0.0.1:*/*\n' +
        '// @match        https://runtime.lappiz.io/*\n' +
        '// @grant        GM_setValue\n' +
        '// @grant        GM_getValue\n' +
        '// @grant        GM_deleteValue\n' +
        '// @run-at       document-idle\n' +
        '// ==/UserScript==\n' +
        '// Generado por tools/generar_userscript.mjs desde src/radicar/marcador.js: no editar a mano.\n' +
        '(' + automatico.toString().replace(/[ ]*\/\* global [^*]*\*\/\r?\n/, '') + ')(' + llenarCon.toString() + ', ' + JSON.stringify(PREFIJO) + ');\n';
}
