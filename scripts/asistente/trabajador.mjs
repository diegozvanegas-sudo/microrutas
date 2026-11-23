// 🤖 Pregúntale a Claude: el trabajador del PC. Lo arranca el motor de Aplicaciones (servidor/iniciar.py); a mano:
//   npm run asistente
// Cada 5 s toma la pregunta pendiente más vieja de public.preguntas (0028), arma una carpeta con los datos que ESA persona
// puede ver (consulta con su sesión: la base aplica sus reglas; el contrato solo con permiso), corre Claude Code del PC
// (plan, sin API) en esa carpeta con permiso SOLO de leer, y guarda la respuesta. Cada 30 s marca asistente_latido.
// Trabaja SIEMPRE en la misma carpeta fija (%LOCALAPPDATA%Microrrutasasistentepregunta), que se vacía antes y después de
// cada pregunta: no se mezcla con Temp ni con otros programas, y en Claude Code del PC queda un solo proyecto, no uno por pregunta.
// Necesita DATABASE_URL en .env y `claude` con sesión iniciada.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { tmpdir, homedir, hostname } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { conectar } from '../db.mjs';
import { MODELOS, prepararPoligonos, resumirCapa, aCsv, aJsonl, instrucciones, armarPrompt, leerSalida } from './datos.mjs';

var RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
var CAPAS = join(RAIZ, 'web', 'public', 'data', 'rapido');
var BASE_TMP = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microrrutas', 'asistente') : join(homedir(), '.cache', 'microrutas-asistente');
var CARPETA = join(BASE_TMP, 'pregunta'), VIEJA = join(tmpdir(), 'microrutas-asistente');
var ESPERA = 5000, LATIDO = 30000, TIEMPO_MAX = 10 * 60 * 1000;
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var log = function () { console.log.apply(console, ['[asistente ' + new Date().toLocaleTimeString('es-CO') + ']'].concat([].slice.call(arguments))); };

function rutaClaude() {
    var cand = [join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')];
    return cand.find(existsSync) || 'claude';
}

// ---------- Mapa: capas públicas resumidas, una sola vez al arrancar ----------
function leerCapas() {
    var capas = {}, ctx = { cargarCapa: function (k, d) { capas[k] = d; } };
    vm.createContext(ctx);
    readdirSync(CAPAS).filter(function (f) { return /^capa_.+\.js$/.test(f); }).forEach(function (f) {
        try { vm.runInContext(readFileSync(join(CAPAS, f), 'utf8'), ctx); } catch (e) { log('No se pudo leer', f, e.message); }
    });
    return capas;
}
function prepararMapa() {
    var dir = join(BASE_TMP, 'mapa');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    var capas = leerCapas(), zonas = prepararPoligonos(capas.zonas), comunas = prepararPoligonos(capas.comunas), lista = [];
    Object.keys(capas).sort().forEach(function (k) {
        var filas = resumirCapa(capas[k], zonas, comunas);
        writeFileSync(join(dir, k + '.csv'), aCsv(filas));
        lista.push('- mapa/' + k + '.csv (' + filas.length + ' filas, ' + capas[k].tipo + ')');
    });
    log('Mapa listo:', lista.length, 'capas');
    return lista;
}

// ---------- Base: lo que esa persona puede ver (con su sesión) ----------
var CONSULTAS = [
    ['base/lotes.csv', 'Lotes de zonas verdes con coordenadas', "select no_lote, microrruta, zona, cuadrilla, area_m2, frecuencia, comuna, direccion, descripcion, round(lat::numeric, 6) lat, round(lon::numeric, 6) lon from public.lotes_info order by microrruta, no_lote"],
    ['base/microrrutas.csv', 'Microrrutas', 'select codigo, zona, lote, cuadrilla, area_m2, frecuencia, direccion, descripcion from public.microrrutas order by codigo'],
    ['base/horarios_rutas.csv', 'Horario de salida de cada ruta de recolección', 'select ruta, zona, macro, dias, horas, turno, obs, horario_ver from public.horarios_rutas order by ruta'],
    ['base/revisiones.jsonl', 'Revisiones de LV, RyT y plan de choque (✅ Revisión), últimos 120 días. items: si/no/na por punto del checklist', "select fecha, turno, tipo, ruta, zona, control, items, operarios, novedad, enlace, public.nombre_usuario(usuario) interventor, creado from public.revisiones where fecha >= current_date - 120 order by fecha, creado"],
    ['base/reportes_despacho.jsonl', 'Reportes de 🚦 Despacho, últimos 120 días', "select fecha, datos, public.nombre_usuario(usuario) interventor from public.reportes_despacho where fecha >= current_date - 120 order by fecha"],
    ['base/informes.jsonl', 'Informes diarios de actividades, últimos 120 días', "select fecha, actividades, public.nombre_usuario(usuario) interventor from public.informes where fecha >= current_date - 120 order by fecha"],
    ['base/visitas.jsonl', 'Visitas a lotes de zonas verdes (📋 Subsanaciones), últimos 180 días o sin cerrar', "select id, tipo, microrruta, lote, area_m2, zona, cuadrilla, fecha_ejecucion, fecha_visita, interventor, respuestas, observaciones, items_subsanados, cantidad_novedades, estado, fecha_subsanacion, observacion_subsanacion from public.visitas where fecha_visita >= current_date - 180 or estado is distinct from 'subsanada' order by fecha_visita"],
    ['base/reportes_ejecucion.jsonl', 'Lo que las cuadrillas reportaron ejecutado (📊 Cruce), últimos 60 días', "select fecha, cuadrilla, items, texto from public.reportes_ejecucion where fecha >= current_date - 60 order by fecha, cuadrilla"],
    ['base/rutas.csv', 'Pre-rutas de las cuadrillas, últimos 60 días', "select cuadrilla, lote, fecha_ejecucion, orden from public.rutas where fecha_ejecucion >= current_date - 60 order by fecha_ejecucion, cuadrilla, orden"],
    ['base/auditorias_zv.jsonl', 'Auditorías del ZIP de fotos por microrruta', 'select quincena, microrruta, lote, cuadrilla, novedad, observacion, con_novedad, decision, novedad_final, comentario from public.auditorias_zv order by quincena, microrruta'],
    ['base/descuentos.jsonl', 'Documentos de descuento de área', "select tipo, fecha, sector, campos, filas, area_descontar, estado from public.descuentos order by fecha"],
    ['base/pqrs.jsonl', 'PQR de corte de césped, últimos 180 días', "select radicado, fecha_pqr, barrio, direccion, queja, visita, respuesta, estado from public.pqrs where fecha_pqr >= current_date - 180 order by fecha_pqr"],
    ['base/pendientes.jsonl', 'Pendientes de la persona (sin hacer o de los últimos 30 días)', "select texto, fecha, momento, hecho, hecho_en from public.pendientes where not hecho or fecha >= current_date - 30 order by fecha"],
    ['base/lugares.csv', 'Libreta de lugares con nombre (📍 Ubicar direcciones)', 'select nombre, lote, microrruta, lat, lon, nota from public.lugares order by nombre'],
    ['contrato/contrato.jsonl', 'Contrato, guía de campo, cronogramas y plantillas (cada sección con sus ítems; ref = documento y página)', 'select id, orden, titulo, tipo, items from public.contrato_secciones order by id, orden'],
    ['contrato/convenios.jsonl', 'Convenios de LV y RyT con las fundaciones y PPSA (documento = convenio)', 'select documento, id, orden, titulo, tipo, items from public.convenio_secciones order by documento, orden']
];
async function exportarBase(db, usuario, carpeta) {
    var hechos = [], permisos = {}, nombre = '';
    await db.query('begin read only');
    try {
        await db.query('set local role authenticated');
        await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
            [JSON.stringify({ sub: usuario, role: 'authenticated' }), usuario]);
        permisos = (await db.query('select public.mis_permisos() p, public.nombre_usuario() n')).rows[0];
        nombre = permisos.n || ''; permisos = permisos.p || {};
        for (var c of CONSULTAS) {
            await db.query('savepoint s');
            try {
                var filas = (await db.query(c[2])).rows;
                mkdirSync(join(carpeta, dirname(c[0])), { recursive: true });
                writeFileSync(join(carpeta, c[0]), /\.csv$/.test(c[0]) ? aCsv(filas) : aJsonl(filas));
                hechos.push('- ' + c[0] + ': ' + c[1] + ' (' + filas.length + ' filas)');
                await db.query('release savepoint s');
            } catch (e) {
                await db.query('rollback to savepoint s');
                hechos.push('- ' + c[0] + ': no se pudo leer (' + e.message + ')');
            }
        }
    } finally { await db.query('rollback'); }
    return { hechos: hechos, permisos: permisos, nombre: nombre };
}

// ---------- Claude Code del PC, solo lectura, en la carpeta de la pregunta ----------
function correrClaude(carpeta, sistema, prompt, modelo) {
    return new Promise(function (listo) {
        var entorno = Object.assign({}, process.env);
        delete entorno.ANTHROPIC_API_KEY; delete entorno.ANTHROPIC_AUTH_TOKEN; // que use el plan, no una API
        var p = spawn(rutaClaude(), ['-p', '--output-format', 'json', '--append-system-prompt-file', sistema,
            '--allowedTools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk', '--model', modelo], { cwd: carpeta, env: entorno });
        var out = '', err = '', fin = false;
        var t = setTimeout(function () { if (!fin) { p.kill(); listo({ ok: false, texto: 'Claude tardó más de 10 minutos. Pruebe con una pregunta más concreta.' }); fin = true; } }, TIEMPO_MAX);
        p.stdout.on('data', function (d) { out += d; });
        p.stderr.on('data', function (d) { err += d; });
        p.on('error', function (e) { if (!fin) { fin = true; clearTimeout(t); listo({ ok: false, texto: 'No se encontró Claude Code en el PC (' + e.message + ').' }); } });
        p.on('close', function (codigo) { if (!fin) { fin = true; clearTimeout(t); listo(leerSalida(out, err, codigo)); } });
        p.stdin.end(prompt);
    });
}

async function responder(db, mapa, q) {
    var carpeta = CARPETA;
    rmSync(carpeta, { recursive: true, force: true });
    mkdirSync(carpeta, { recursive: true });
    try {
        var base = await exportarBase(db, q.usuario, carpeta);
        if (!base.permisos.microrutas) return { ok: false, texto: 'Esta cuenta no tiene acceso a Microrrutas.' };
        if ((base.permisos.ocultas || []).indexOf('preguntar') !== -1) return { ok: false, texto: 'El administrador tiene apagada esta sección para su cuenta.' };
        cpSync(join(BASE_TMP, 'mapa'), join(carpeta, 'mapa'), { recursive: true });
        var hoy = new Date(), fecha = hoy.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
        writeFileSync(join(carpeta, 'LEEME.md'), '# Datos para responder (solo lectura)\n\nHoy: ' + fecha + '. Persona: ' + (base.nombre || '—') +
            (base.permisos.admin ? ' (administrador: ve lo de todo el equipo)' : ' (ve solo lo suyo)') + '.\n\n' +
            '## Mapa (capas públicas resumidas)\nCada fila: nombre, dato (zona o descripción de la capa), zona_emv y comuna calculadas por ubicación, lat, lon y, en líneas y polígonos, caja [latMin, lonMin, latMax, lonMax].\n' +
            mapa.join('\n') + '\n\n## Base de datos (lo que esta persona puede ver)\n' + base.hechos.join('\n') + '\n\n' +
            'Glosario: LV = limpieza vial (barrido); RyT = recolección y transporte; DOM = ruta de domingo y festivo; zonas EMV 1 a 7 + corregimientos; ' +
            'C1…C11 = cuadrillas de corte de césped; Q1/Q2 = quincenas.\n');
        var sistema = join(BASE_TMP, 'sistema.txt');
        writeFileSync(sistema, instrucciones({ nombre: base.nombre, hoy: fecha, diaSemana: DIAS[new Date(fecha + 'T12:00:00').getDay()], contrato: !!base.permisos.contrato }));
        var historial = (await db.query("select texto, respuesta, estado from public.preguntas where hilo = $1 and id <> $2 and creado < $3 order by creado", [q.hilo, q.id, q.creado])).rows;
        try { return await correrClaude(carpeta, sistema, armarPrompt(q.texto, historial), MODELOS[q.modelo] || MODELOS.rapido); }
        finally { rmSync(sistema, { force: true }); }
    } finally { rmSync(carpeta, { recursive: true, force: true }); }
}

async function latir(db, info) {
    await db.query("insert into public.asistente_latido (id, visto, info) values ('pc', now(), $1) on conflict (id) do update set visto = now(), info = excluded.info", [JSON.stringify(info)]);
}

async function main() {
    mkdirSync(BASE_TMP, { recursive: true });
    rmSync(VIEJA, { recursive: true, force: true }); // la carpeta de Temp que se usaba antes
    var mapa = prepararMapa(), db = await conectar(), ocupado = null, ultimoLatido = 0;
    // Lo que quedó «respondiendo» de antes (se apagó o reinició el motor a mitad) vuelve a la cola de una vez: el motor arranca
    // un solo trabajador por PC (iniciar.py no se abre dos veces), así que nadie más la está respondiendo.
    var vuelta = await db.query("update public.preguntas set estado = 'pendiente', tomado = null where estado = 'respondiendo'");
    if (vuelta.rowCount) log(vuelta.rowCount, 'pregunta(s) vuelven a la cola');
    log('Prendido. Esperando preguntas (Ctrl+C para apagar).');
    for (;;) {
        try {
            if (Date.now() - ultimoLatido > LATIDO) {
                await latir(db, { equipo: hostname(), ocupado: ocupado }); ultimoLatido = Date.now();
                // Y si alguna se queda trabada más que el tiempo máximo de una respuesta, también vuelve a la cola
                await db.query("update public.preguntas set estado = 'pendiente', tomado = null where estado = 'respondiendo' and tomado < now() - interval '15 minutes'");
            }
            var r = await db.query("update public.preguntas set estado = 'respondiendo', tomado = now() where id = (select id from public.preguntas where estado = 'pendiente' order by creado limit 1 for update skip locked) returning *");
            var q = r.rows[0];
            if (!q) { await new Promise(function (ok) { setTimeout(ok, ESPERA); }); continue; }
            ocupado = q.id; await latir(db, { equipo: hostname(), ocupado: ocupado }); ultimoLatido = Date.now();
            log('Pregunta', q.id.slice(0, 8), '(' + q.modelo + '):', q.texto.slice(0, 80).replace(/\s+/g, ' '));
            var res = await responder(db, mapa, q);
            await db.query(res.ok ? "update public.preguntas set estado = 'lista', respuesta = $2, error = '', respondido = now() where id = $1"
                : "update public.preguntas set estado = 'error', error = $2, respondido = now() where id = $1", [q.id, res.texto]);
            log(res.ok ? 'Respondida' : 'Error: ' + res.texto);
            ocupado = null;
        } catch (e) {
            log('Falla:', e.message);
            if (ocupado) await db.query("update public.preguntas set estado = 'error', error = $2, respondido = now() where id = $1", [ocupado, 'Falló el trabajador del PC: ' + e.message]).catch(function () {});
            ocupado = null;
            if (/terminat|connection|ECONN|closed/i.test(e.message)) { try { await db.end(); } catch (er) { /* ya cerrada */ } db = await conectar(); }
            await new Promise(function (ok) { setTimeout(ok, ESPERA); });
        }
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(function (e) { log('No arrancó:', e.message); process.exit(1); });
export { exportarBase, prepararMapa, responder };
