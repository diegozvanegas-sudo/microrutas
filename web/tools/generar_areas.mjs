/* global process, console */
// Área de la ficha contra el área dibujada de cada microrruta, para «📐 Áreas descuadradas» del mapa rápido.
// Correr desde web/ después de generar_mapa_rapido.mjs:  node tools/generar_areas.mjs
// Sale public/data/rapido/areas.js (var areasLotes): una fila por microrruta con ficha y dibujo.
// Ficha: el área de la programación (direcciones_lotes.js). Dibujo: suma de sus polígonos medidos en el plano.
// Los polígonos con área de campo 0 (retirados de la ficha, p. ej. por restricción de acceso) se cuentan aparte.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, leerData, leerZonas } from './lotes.mjs';

export function areaM2(g) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let total = 0;
    for (const p of polys) p.forEach((anillo, i) => {
        const lat0 = anillo[0][1], fx = 111320 * Math.cos(lat0 * Math.PI / 180), fy = 110574;
        let s = 0;
        for (let a = 0, z = anillo.length - 1; a < anillo.length; z = a++) s += anillo[z][0] * fx * anillo[a][1] * fy - anillo[a][0] * fx * anillo[z][1] * fy;
        total += (i ? -1 : 1) * Math.abs(s) / 2;
    });
    return total;
}

// Filas por microrruta (sin las que no tienen área en la ficha)
export function compararAreas(zonas, prog) {
    const por = {};
    for (const f of zonas) {
        const p = f.properties || {}, mr = String(p.Microruta || '').trim().toUpperCase();
        if (!mr || !f.geometry) continue;
        const r = por[mr] ??= { m: mr, l: '', c: '', d: 0, n: 0, r: 0 };
        const a = areaM2(f.geometry);
        if (String(p.Area_campo).trim() === '0') r.r += a; else { r.d += a; r.n++; }
        if (!r.l && p.No_Lote && p.No_Lote !== 'NA') r.l = String(p.No_Lote);
        if (!r.c && p.CUADRILLA) r.c = String(p.CUADRILLA);
    }
    const filas = [];
    for (const r of Object.values(por)) {
        const pr = prog[r.m] || prog[Object.keys(prog).find((k) => k.toUpperCase() === r.m)] || {};
        const ficha = Number(pr.area);
        if (!(ficha > 0)) continue;
        filas.push({ m: r.m, l: r.l || (pr.lote && pr.lote !== 'NA' ? String(pr.lote) : ''), c: r.c, f: Math.round(ficha), d: Math.round(r.d), n: r.n, r: Math.round(r.r) });
    }
    return filas.sort((a, b) => Math.abs(b.d - b.f) - Math.abs(a.d - a.f));
}

if (import.meta.url === 'file://' + process.argv[1].replace(/\\/g, '/') || process.argv[1].endsWith('generar_areas.mjs')) {
    const filas = compararAreas(leerZonas(), leerData('direcciones_lotes.js', 'direccionesLotes'));
    const salida = path.join(DATA, 'rapido', 'areas.js');
    fs.writeFileSync(salida, '// Área de la ficha (f) contra la dibujada (d) por microrruta. Generado con tools/generar_areas.mjs, no editar a mano.\n' +
        '// m: microrruta · l: lote · c: cuadrilla · n: polígonos · r: m² de polígonos retirados (área de campo 0)\nvar areasLotes = ' + JSON.stringify(filas) + ';\n');
    const desc = filas.filter((x) => Math.abs(x.d - x.f) >= 200 && Math.abs(x.d - x.f) / x.f >= 0.2);
    console.log('areas.js', filas.length, 'microrrutas ·', desc.length, 'con 20 % o más de diferencia ·', Math.round(fs.statSync(salida).size / 1024), 'KB');
}
