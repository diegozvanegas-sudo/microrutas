// Auditar ZIP: rutas pegadas del PC (informe y ZIP en cualquier carpeta) y dónde deja cada cosa el motor.
// Las reglas de las rutas son las del backend (Aplicaciones/modulos/zonas_verdes/backend/zv).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarRuta, ubicaciones, archivosZip } from '../src/subsanaciones/auditoria.js';

test('auditar ZIP: los Excel de cada ZIP quedan donde los deja el motor', () => {
    const raiz = 'C:\\Users\\diego\\Documents\\Envarias\\Revisar IA reporte\\Zonas verdes';
    const a = archivosZip(raiz + '\\', { id: 4, ruta: 'C:\\ZIps a revisar\\C2.zip', modelo: 'claude-haiku-5-5' });
    assert.deepEqual(a.map((x) => x.ruta), [
        raiz + '\\salidas\\aplicacion\\lecturas\\fuente_4\\C2_zonas_verdes.xlsx',
        raiz + '\\salidas\\aplicacion\\lecturas\\fuente_4\\C2_zonas_verdes_avance_parcial.xlsx',
        raiz + '\\salidas\\aplicacion\\lecturas\\fuente_4',
        'C:\\ZIps a revisar\\C2.zip',
        'C:\\ZIps a revisar\\C2_claude_plan_claude-haiku-5-5_cache.jsonl'
    ]);
    // Solo los Excel (dentro de salidas\aplicacion) se pueden bajar desde la página
    assert.deepEqual(a.map((x) => x.descargar), [true, true, false, false, false]);
});

test('auditar ZIP: la ruta pegada se limpia (comillas de «Copiar como ruta», espacios, file:///)', () => {
    const r = 'C:\\Users\\diego\\Documents\\Envarias\\novedades reportadas\\ZIps a revisar\\INFORME_1_15_NOVIEMBRE 2026 CC.xlsx';
    assert.equal(limpiarRuta('"' + r + '"'), r);
    assert.equal(limpiarRuta('  ' + r + '\n'), r);
    assert.equal(limpiarRuta(r), r);
    assert.equal(limpiarRuta('file:///C:/Users/diego/Documents/ZIps%20a%20revisar/C2.zip'), 'C:\\Users\\diego\\Documents\\ZIps a revisar\\C2.zip');
    assert.equal(limpiarRuta(''), '');
    assert.equal(limpiarRuta(null), '');
});

test('auditar ZIP: dónde quedan el informe, la caché al lado del ZIP, las lecturas, el exportado y las revisiones', () => {
    const raiz = 'C:\\Users\\diego\\Documents\\Envarias\\Revisar IA reporte\\Zonas verdes';
    const q = { id: 3, nombre: 'Q1 NOVIEMBRE · C2', informe: 'C:\\ZIps a revisar\\INFORME_1_15_NOVIEMBRE 2026 CC.xlsx',
        fuentes: [{ id: 4, ruta: 'C:\\ZIps a revisar\\C2.zip', modelo: 'claude-haiku-5-5' }] };
    const u = ubicaciones(raiz + '\\', q, { carpeta_fotos: raiz + '\\entradas\\fotos' });
    const ruta = (texto) => (u.find((x) => x.que.indexOf(texto) !== -1) || {}).ruta;
    assert.equal(ruta('Informe de lotes'), q.informe);
    assert.equal(ruta('Lo leído por Claude'), 'C:\\ZIps a revisar\\C2_claude_plan_claude-haiku-5-5_cache.jsonl');
    assert.equal(ruta('Excel de las lecturas'), raiz + '\\salidas\\aplicacion\\lecturas\\fuente_4');
    // Mismo nombre de carpeta que el backend: re.sub(r"[^\w.-]+", "_", nombre).strip("_")
    assert.equal(ruta('Excel exportado'), raiz + '\\salidas\\aplicacion\\Q1_NOVIEMBRE_C2');
    assert.equal(ruta('Revisiones'), raiz + '\\datos\\zonasverdes.db');
    assert.equal(ruta('ZIP subidos'), raiz + '\\entradas\\fotos');
    assert.equal(ruta('Informes subidos'), raiz + '\\entradas\\informes');
    // Sin quincena: solo lo general
    assert.deepEqual(ubicaciones(raiz, null).map((x) => x.ruta), [raiz + '\\datos\\zonasverdes.db', raiz + '\\entradas\\fotos', raiz + '\\entradas\\informes']);
    // Nombre sin letras: carpeta quincena_<id>
    assert.equal(ubicaciones(raiz, { id: 9, nombre: ' · ', informe: 'x.xlsx', fuentes: [] }).find((x) => /exportado/.test(x.que)).ruta, raiz + '\\salidas\\aplicacion\\quincena_9');
});
