// Pruebas de las secciones que el administrador enciende o apaga por usuario (src/secciones.js).
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SECCIONES, GRUPOS, puede, entra, claveDeEnlace, clavePagina, primeraPermitida, seccion } from '../src/secciones.js';

const raiz = new URL('../', import.meta.url);
const interventor = { admin: false, contrato: false, ocultas: [] };

test('secciones: claves únicas, con grupo conocido y con el formato que acepta la base', () => {
    const claves = SECCIONES.map((s) => s.clave);
    assert.equal(new Set(claves).size, claves.length);
    SECCIONES.forEach((s) => {
        assert.match(s.clave, /^[a-z][a-z0-9_]{1,29}$/, s.clave);
        assert.ok(GRUPOS.includes(s.grupo), s.clave);
        if (s.dentro) assert.ok(seccion(s.dentro), s.clave);
        if (s.pagina) assert.ok(fs.existsSync(new URL(s.pagina, raiz)), s.pagina);
    });
});

test('secciones: cada enlace de los menús de todas las páginas tiene su sección', () => {
    const paginas = fs.readdirSync(raiz).filter((f) => f.endsWith('.html'));
    let enlaces = 0;
    paginas.forEach((f) => {
        const html = fs.readFileSync(new URL(f, raiz), 'utf8');
        const nav = (html.match(/<nav class="nav-app"[\s\S]*?<\/nav>/) || [''])[0];
        for (const m of nav.matchAll(/href="([^"]+)"/g)) {
            enlaces++;
            assert.ok(claveDeEnlace(m[1]), f + ': ' + m[1]);
        }
        // Las herramientas del menú Más de Subsanaciones (btn-<clave>)
        if (f === 'subsanaciones.html') {
            for (const k of ['hallazgos', 'buenas', 'prog', 'ubicar', 'tabla', 'fotos', 'zip', 'fotolote', 'nota', 'ocr']) {
                assert.ok(html.includes('id="btn-' + k + '"'), 'btn-' + k);
                assert.ok(seccion(k) && seccion(k).herramienta, k);
            }
        }
    });
    assert.ok(enlaces > 100, 'se revisaron ' + enlaces + ' enlaces');
});

test('secciones: cada enlace se reconoce con su sección', () => {
    assert.equal(claveDeEnlace('pqr.html'), 'pqr');
    assert.equal(claveDeEnlace('subsanaciones.html'), 'subsanaciones');
    assert.equal(claveDeEnlace('subsanaciones.html#auditar'), 'auditar');
    assert.equal(claveDeEnlace('subsanaciones.html?herramienta=fotos'), 'fotos');
    assert.equal(claveDeEnlace('contrato.html?doc=GUIA-CAMPO'), 'guia');
    assert.equal(claveDeEnlace('contrato.html'), 'contrato');
    assert.equal(claveDeEnlace('contrato.html?doc=CONVENIO-1'), 'contrato');
    assert.equal(claveDeEnlace('index.html'), 'mapa');
    assert.equal(claveDeEnlace('usuarios.html'), '');      // Usuarios y WhatsApp van por el rol de administrador
    assert.equal(claveDeEnlace('subsanaciones.html?herramienta=inventada'), 'subsanaciones');
});

test('secciones: la página abierta se reconoce desde la dirección completa (GitHub Pages)', () => {
    const base = 'https://diegozvanegas-sudo.github.io/microrutas/';
    assert.equal(clavePagina(base + 'horas.html'), 'horas');
    assert.equal(clavePagina(base + 'subsanaciones.html#auditar'), 'subsanaciones');
    assert.equal(clavePagina(base + 'subsanaciones.html?herramienta=ocr'), 'subsanaciones');
    assert.equal(clavePagina(base + 'contrato.html?doc=GUIA-CAMPO'), 'guia');
    assert.equal(clavePagina(base + 'usuarios.html'), '');
    assert.equal(clavePagina(base + 'diagnostico.html'), '');
});

test('secciones: sin nada apagado ve lo de siempre (lo del contrato, solo con el permiso)', () => {
    assert.equal(puede(interventor, 'pqr'), true);
    assert.equal(puede(interventor, 'fotos'), true);
    assert.equal(puede(interventor, 'contrato'), false);
    assert.equal(puede(interventor, 'guia'), false);
    assert.equal(puede(interventor, 'requerimientos'), false);
    assert.equal(puede({ ...interventor, contrato: true }, 'requerimientos'), true);
    // Permisos viejos (sin ocultas, de antes de 0024) se leen igual
    assert.equal(puede({ admin: false, contrato: true }, 'horas'), true);
    assert.equal(puede(null, 'horas'), true);
});

test('secciones: lo apagado no se ve; el administrador ve todo', () => {
    const p = { ...interventor, contrato: true, ocultas: ['horas', 'requerimientos', 'ocr'] };
    assert.equal(puede(p, 'horas'), false);
    assert.equal(puede(p, 'requerimientos'), false);
    assert.equal(puede(p, 'ocr'), false);
    assert.equal(puede(p, 'fotos'), true);
    assert.equal(puede({ admin: true, contrato: true, ocultas: ['horas'] }, 'horas'), true);
    assert.equal(puede(p, 'desconocida'), true);
});

test('secciones: sin Subsanaciones no hay sus herramientas ni Auditar ZIP, pero sí Crear archivos', () => {
    const p = { ...interventor, ocultas: ['subsanaciones'] };
    assert.equal(puede(p, 'hallazgos'), false);
    assert.equal(puede(p, 'fotolote'), false);
    assert.equal(puede(p, 'auditar'), false);
    // 🧰 Crear archivos es de todos: vive en Subsanaciones pero no depende de ella
    ['fotos', 'zip', 'nota', 'ocr', 'pdf'].forEach((k) => {
        assert.equal(puede(p, k), true, k);
        assert.equal(seccion(k).grupo, 'Crear archivos', k);
        assert.equal(seccion(k).dentro, undefined, k);
    });
    assert.equal(puede({ ...p, ocultas: ['subsanaciones', 'zip'] }, 'zip'), false);
    assert.equal(puede(p, 'buscar'), true);
    assert.equal(puede(p, 'pqr'), true);
});

test('secciones: una cuenta sin acceso a Microrrutas (solo Rutina) no ve nada', () => {
    const fuera = { admin: false, contrato: true, ocultas: [], microrutas: false };
    assert.equal(entra(fuera), false);
    SECCIONES.forEach((s) => assert.equal(puede(fuera, s.clave), false, s.clave));
    assert.equal(puede(fuera, 'desconocida'), false);
    assert.equal(primeraPermitida(fuera), null);
    // Con acceso, o con permisos de antes de 0025 (sin el dato), sigue como siempre
    assert.equal(entra({ ...fuera, microrutas: true }), true);
    assert.equal(entra({ admin: false, contrato: false }), true);
    assert.equal(entra(null), true);
    assert.equal(puede({ ...fuera, microrutas: true }, 'pqr'), true);
});

test('secciones: a dónde mandarlo cuando abre una apagada', () => {
    assert.equal(primeraPermitida(interventor).clave, 'subsanaciones');
    assert.equal(primeraPermitida({ ...interventor, ocultas: ['subsanaciones', 'pqr'] }).clave, 'radicar');
    const todo = SECCIONES.map((s) => s.clave);
    assert.equal(primeraPermitida({ ...interventor, ocultas: todo }), null);
});
