// Pruebas de 🧾 Instrumentos · Varias de una vez: reporte → filas, foto → ruta, nombres y enlaces. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerReporte, datosDeFila, tramosDe, distanciaRuta, filaDeFoto, nombrePdf, repartirEnlaces } from '../src/instrumento/lote.js';
import { vacioDom } from '../src/instrumento/comun.js';

const REPORTE = `LIMPIEZA VIAL (LV)

Zona 1

- Z1R19DOM
- Z1R12DOM
- Z1R22DOM

Zona 3

- Z3R01DOM
- Z3R17DOM
- Z3R17DOM (Parque Boston)
- Z3R17DOM

VERIFICACIÓN DE MAPAS:
Se evidencia cumplimiento en las rutas verificadas, con mapas en estado OK.

VEHÍCULOS EN OPERACIÓN:

- Placa KTN355: realizando actividad C683 (recolección), sin novedad.
- Placa WMO327: realizando actividad C583  (recolección), sin novedad.`;

test('reporte: rutas por zona, la repetida con nota es otra fila y los vehículos aparte', () => {
    const f = leerReporte(REPORTE);
    assert.deepEqual(f.map((x) => [x.ruta, x.nota, x.zona, x.tipo]), [
        ['Z1R19DOM', '', '1', 'lv'], ['Z1R12DOM', '', '1', 'lv'], ['Z1R22DOM', '', '1', 'lv'], ['Z3R01DOM', '', '3', 'lv'],
        ['Z3R17DOM', '', '3', 'lv'], ['Z3R17DOM', 'Parque Boston', '3', 'lv'], ['C683', 'Placa KTN355', '', 'ryt'], ['C583', 'Placa WMO327', '', 'ryt']]);
});
test('fila → formulario: zona, instrumento y contratista de la zona; lo cambiado a mano gana', () => {
    const base = Object.assign(vacioDom('2026-11-22', {}), { inspector: 'Ana', fotos: 'https://drive.google.com/carpeta' });
    const pref = { contratistasDom: { 'Zona 3': 'FUDEA' } };
    const d = datosDeFila({ ruta: 'Z3R01DOM', zona: '3', tipo: 'lv' }, base, pref);
    assert.equal(d.zona, 'Zona 3'); assert.equal(d.instrumento, 'Limpieza vial'); assert.equal(d.contratista, 'FUDEA');
    assert.equal(d.fotos, 'https://drive.google.com/carpeta', 'una carpeta para todas');
    const v = datosDeFila({ ruta: 'C683', zona: '', tipo: 'ryt', enlace: 'https://drive.google.com/uno', cambios: { calidad: 'No' } }, base, pref);
    assert.equal(v.instrumento, 'Recolección y Transporte'); assert.equal(v.fotos, 'https://drive.google.com/uno'); assert.equal(v.calidad, 'No');
});
test('foto → ruta, con el trazo real de la capa de domingos', () => {
    const t = readFileSync('public/data/rapido/capa_barrido_dom.js', 'utf8'), capa = JSON.parse(t.slice(t.indexOf(',') + 1, t.lastIndexOf(')')));
    const geo = {}; capa.items.forEach((it) => { geo[it.n] = tramosDe(it); });
    const filas = leerReporte('- Z5R14DOM\n- Z5R22DOM\n- Z1R19DOM');
    // Un punto sobre el primer vértice de Z5R14DOM queda en Z5R14DOM
    const it = capa.items.find((x) => x.n === 'Z5R14DOM'), p = { lon: it.g[0][0] / 1e6, lat: it.g[0][1] / 1e6 };
    assert.ok(distanciaRuta(p.lat, p.lon, geo.Z5R14DOM) < 1);
    assert.equal(filaDeFoto(p, filas, geo).fila, 'Z5R14DOM');
    assert.equal(filaDeFoto(null, filas, geo).motivo, 'sin GPS');
    const lejos = filaDeFoto({ lat: 6.35, lon: -75.70 }, filas, geo);
    assert.equal(lejos.fila, null); assert.match(lejos.motivo, /^a \d+ m de la ruta más cercana/);
});
test('PDF y enlaces pegados de una vez', () => {
    assert.equal(nombrePdf({ ruta: 'Z3R17DOM', nota: 'Parque Boston' }, '2026-11-22'), 'Z3R17DOM_Parque-Boston_22-11-2026.pdf');
    assert.equal(nombrePdf({ ruta: 'C683', nota: 'Placa KTN355' }, '2026-11-22'), 'C683_Placa-KTN355_22-11-2026.pdf');
    const filas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(repartirEnlaces('https://drive.google.com/1\nhttps://drive.google.com/2', filas), { enlaces: { a: 'https://drive.google.com/1', b: 'https://drive.google.com/2' }, sobran: 0, faltan: 1 });
});
