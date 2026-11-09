// Captura de pantalla de una página en Chrome sin ventana, en ancho de computador y de celular (de verdad: 390 px con
// emulación de celular; el modo --screenshot de Chrome no baja de 500 px). Para revisar cada cambio visible antes de subirlo.
// Uso: node tools/captura.mjs <url o archivo .html> <salida sin extensión> [--espera "#selector"] [--clic "#selector"] [--alto 1800]
//   → <salida>-pc.png (1280 px) y <salida>-cel.png (390 px), y en consola los elementos que se salen del ancho
// Necesita Chrome instalado (CHROME=ruta para cambiarla).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

var args = process.argv.slice(2), opcion = function (n, d) { var i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
var destino = args[0], salida = args[1];
if (!destino || !salida) { console.log('Uso: node tools/captura.mjs <url o .html> <salida> [--espera "#selector"] [--clic "#selector"] [--alto 1800]'); process.exit(1); }
var url = /^https?:|^file:/.test(destino) ? destino : pathToFileURL(resolve(destino)).href;
var chrome = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(existsSync);
var perfil = mkdtempSync(join(tmpdir(), 'captura-')), puerto = 9400 + Math.floor(Math.random() * 400);
var p = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=' + puerto, '--user-data-dir=' + perfil, 'about:blank'], { stdio: 'ignore' });
var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
try {
    var lista = null;
    for (var i = 0; i < 40 && !lista; i++) { await espera(400); try { lista = await (await fetch('http://127.0.0.1:' + puerto + '/json')).json(); } catch { lista = null; } }
    var ws = new WebSocket(lista.find(function (t) { return t.type === 'page'; }).webSocketDebuggerUrl);
    await new Promise(function (r) { ws.onopen = r; });
    var id = 0, pend = {};
    ws.onmessage = function (e) { var m = JSON.parse(e.data); if (pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
    var cmd = function (method, params) { return new Promise(function (r) { var n = ++id; pend[n] = r; ws.send(JSON.stringify({ id: n, method: method, params: params || {} })); }); };
    var evaluar = async function (js) { var r = await cmd('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
    for (var v of [{ nombre: 'pc', ancho: 1280, alto: 900, movil: false, escala: 1 }, { nombre: 'cel', ancho: 390, alto: 844, movil: true, escala: 2 }]) {
        await cmd('Emulation.setDeviceMetricsOverride', { width: v.ancho, height: v.alto, deviceScaleFactor: v.escala, mobile: v.movil });
        await cmd('Page.navigate', { url: url });
        var sel = opcion('--espera', 'body');
        for (var t = 0; t < 40; t++) { await espera(300); if (await evaluar('!!document.querySelector(' + JSON.stringify(sel) + ')')) break; }
        if (opcion('--clic')) { await evaluar('(document.querySelector(' + JSON.stringify(opcion('--clic')) + ')||{click(){}}).click()'); await espera(600); }
        await espera(500);
        // Elementos que se salen del ancho de la pantalla (desplazamiento horizontal)
        var salen = await evaluar('(function(){var vw=document.documentElement.clientWidth,o=[];document.querySelectorAll("body *").forEach(function(e){var r=e.getBoundingClientRect();if(r.width>0&&r.right>vw+1&&getComputedStyle(e).position!=="fixed")o.push(Math.round(r.right)+" "+e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+(typeof e.className=="string"&&e.className?"."+e.className.trim().split(/\\s+/).join("."):""));});return {vw:vw,pagina:document.documentElement.scrollWidth,salen:o.slice(0,10)};})()');
        var alto = Number(opcion('--alto', 0)) || Math.min(6000, await evaluar('document.documentElement.scrollHeight'));
        await cmd('Emulation.setDeviceMetricsOverride', { width: v.ancho, height: alto, deviceScaleFactor: v.escala, mobile: v.movil });
        await espera(300);
        var foto = await cmd('Page.captureScreenshot', { format: 'png' });
        writeFileSync(salida + '-' + v.nombre + '.png', Buffer.from(foto.result.data, 'base64'));
        console.log(v.nombre + ': ' + salida + '-' + v.nombre + '.png · ancho ' + salen.vw + ' px, página ' + salen.pagina + ' px' +
            (salen.pagina > salen.vw ? ' ⚠ SE SALE DEL ANCHO: ' + salen.salen.join(' | ') : ' · nada se sale del ancho'));
    }
    ws.close();
} finally { p.kill(); }
