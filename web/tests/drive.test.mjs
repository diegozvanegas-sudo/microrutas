// Pruebas de drive.js (lo que no habla con Google). Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreCarpeta, nombreDia, carpetaPrincipal, conectado, PRINCIPAL } from '../src/drive.js';
test('carpeta principal y una por día; sin sesión al arrancar', () => {
    assert.equal(carpetaPrincipal(), PRINCIPAL);
    assert.equal(nombreDia('2026-11-23'), '23-11-2026');
    assert.equal(nombreCarpeta('2026-11-23'), 'Instrumentos interventoría › 23-11-2026');
    assert.equal(conectado(), false);
});
test('otra carpeta principal (Subsanaciones)', () => {
    assert.equal(nombreCarpeta('2026-11-23', 'Subsanaciones'), 'Subsanaciones › 23-11-2026');
});
test('emparejar archivos por nombre (reutilizable): claves, requiere, evita y PDF primero', async () => {
    const { palabrasArchivo, emparejarArchivos } = await import('../src/drive.js');
    assert.deepEqual(palabrasArchivo('Z3R17DOM_Parque-Boston_22-11-2026.pdf'), ['Z3R17DOM', 'PARQUE', 'BOSTON', '22', '11', '2026']);
    assert.deepEqual(palabrasArchivo('Parque Boston'), ['PARQUE', 'BOSTON'], 'sin extensión no se corta nada');
    const a = [{ nombre: 'Lote 118 subsanacion.pdf', enlace: 'u1' }, { nombre: 'Lote 118 visita.jpg', enlace: 'u2' }, { nombre: 'Lote 120.pdf', enlace: 'u3' }];
    const r = emparejarArchivos(a, [{ id: 's118', claves: ['118'], requiere: ['SUBSANACION'] }, { id: 'v118', claves: ['118'], evita: [['SUBSANACION']] }, { id: 'x', claves: ['999'] }]);
    assert.deepEqual(r.enlaces, { s118: 'u1', v118: 'u2' });
    assert.deepEqual(r.sinArchivo, ['x']); assert.deepEqual(r.sobran, ['Lote 120.pdf']);
});
test('carpeta elegida en el selector: nombre y número de proyecto', async () => {
    const { numeroProyecto } = await import('../src/drive.js');
    assert.equal(nombreCarpeta('2026-11-23', { id: 'abc', nombre: 'Fotos EMVARIAS' }), 'Fotos EMVARIAS › 23-11-2026');
    assert.equal(numeroProyecto('931360801241-87o75er.apps.googleusercontent.com'), '931360801241');
    assert.equal(numeroProyecto(''), '');
});
test('subirPdf: con carpeta elegida usa su id (sin buscar en Mi unidad) y pide unidades compartidas; sin ella, igual que antes', async () => {
    const mem = { drive_token: JSON.stringify({ t: 'tok', v: Date.now() + 3600e3 }) };
    globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
    const llamadas = [];
    globalThis.fetch = async (url, op) => {
        llamadas.push({ url: decodeURIComponent(url), metodo: (op && op.method) || 'GET', cuerpo: op && typeof op.body === 'string' ? JSON.parse(op.body) : null });
        const r = url.includes('/permissions') ? { id: 'p' } : url.includes('/upload/') ? { id: 'pdf1', webViewLink: 'https://drive/pdf1' }
            : op && op.method === 'POST' ? { id: 'nueva' + llamadas.length } : { files: [] };
        return { ok: true, status: 200, json: async () => r, text: async () => '' };
    };
    try {
        const d = await import('../src/drive.js?subir=' + Date.now());
        assert.equal(d.conectado(), true);
        const s = await d.subirPdf(new Uint8Array([1]), 'X.pdf', '2026-11-23', { id: 'CARP', nombre: 'Equipo' });
        assert.equal(s.enlace, 'https://drive/pdf1');
        assert.ok(!llamadas.some(l => l.url.includes("'root' in parents")), 'no busca en Mi unidad');
        assert.ok(llamadas[0].url.includes("name = '23-11-2026'") && llamadas[0].url.includes("'CARP' in parents"), 'la del día va dentro de la elegida');
        assert.deepEqual(llamadas[1].cuerpo.parents, ['CARP']);
        assert.ok(llamadas.every(l => l.url.includes('supportsAllDrives=true')), 'todas sirven en unidades compartidas');
        llamadas.length = 0;
        await d.subirPdf(new Uint8Array([1]), 'X.pdf', '2026-11-23', 'Subsanaciones');
        assert.ok(llamadas[0].url.includes("name = 'Subsanaciones'") && llamadas[0].url.includes("'root' in parents"));
        assert.ok(llamadas.every(l => !l.url.includes('supportsAllDrives')), 'sin carpeta elegida las llamadas no cambian');
    } finally { delete globalThis.localStorage; delete globalThis.fetch; }
});
test('elegirCarpeta: en el celular no se queda «Abriendo…» (tamaño, aviso si no aparece, cancelar)', async () => {
    const mem = { drive_token: JSON.stringify({ t: 'tok', v: Date.now() + 3600e3 }) };
    const head = [], visibles = [];
    let enPagina = false, callback = null, tamano = null, mostrado = 0;
    class Vista { constructor() {} setIncludeFolders() { return this; } setSelectFolderEnabled() { return this; } setMimeTypes() { return this; } setEnableDrives() { return this; } }
    class Constructor {
        addView() { return this; } enableFeature() { return this; } setOAuthToken() { return this; } setAppId() { return this; } setLocale() { return this; }
        setTitle() { return this; } setDeveloperKey() { return this; } setCallback(f) { callback = f; return this; } setSize(a, b) { tamano = [a, b]; return this; }
        build() { return { setVisible(v) { visibles.push(v); if (v && mostrarDe) enPagina = true; }, dispose() {} }; }
    }
    let mostrarDe = true;
    globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
    globalThis.window = { innerWidth: 390, innerHeight: 844, google: { picker: { DocsView: Vista, PickerBuilder: Constructor, ViewId: {}, Feature: {}, Action: { PICKED: 'picked', CANCEL: 'cancel' } } } };
    globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild: x => head.push(x) }, querySelector: () => (enPagina ? {} : null) };
    try {
        const d = await import('../src/drive.js?picker=' + Date.now());
        // Elegir: tamaño mínimo que acepta Google, estilo de pantalla completa y aviso antes de mostrarse
        let p = d.elegirCarpeta({ antesDeMostrar: () => mostrado++ });
        await new Promise(r => setTimeout(r, 10));
        assert.deepEqual(tamano, [566, 650], 'en 390 px se pide el mínimo y el estilo lo pone a pantalla completa');
        const estilo = head.filter(x => x.id === 'estilo-picker');
        assert.ok(estilo.length === 1 && /max-width: 700px/.test(estilo[0].textContent) && /100vw/.test(estilo[0].textContent));
        assert.equal(mostrado, 1);
        callback({ action: 'picked', docs: [{ id: 'C1', name: 'Equipo' }] });
        assert.deepEqual(await p, { id: 'C1', nombre: 'Equipo' });
        // Cancelar mientras espera: da null y cierra el selector
        p = d.elegirCarpeta(); await new Promise(r => setTimeout(r, 10));
        d.cancelarSelector();
        assert.equal(await p, null); assert.equal(visibles.at(-1), false);
        // Si el selector nunca aparece en la página: error claro, no espera eterna
        mostrarDe = false; enPagina = false;
        p = d.elegirCarpeta({ espera: 30 });
        await assert.rejects(p, /no abrió/);
        d.cancelarSelector();  // sin selector abierto no pasa nada
    } finally { delete globalThis.localStorage; delete globalThis.window; delete globalThis.document; }
});
