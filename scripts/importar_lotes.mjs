// Carga los polígonos de lotes y las microrrutas desde los archivos .js del mapa de qgis2web.
// Se puede correr de nuevo cuando llegue una programación nueva: actualiza sin duplicar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar } from './db.mjs';

const ORIGEN = process.env.ORIGEN || fileURLToPath(new URL('../datos/origen/', import.meta.url));
const LOTE = 300; // filas por INSERT

// Los archivos son "var x = {...};": se evalúan y se devuelve la variable.
function cargarVariable(archivo, variable) {
  const src = fs.readFileSync(path.join(ORIGEN, archivo), 'utf8').replace(/^﻿/, '');
  return new Function(`${src};\nreturn ${variable};`)();
}

const texto = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const numero = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

const capa = cargarVariable('zonasverdes__areas_zonas_verdes_2.js', 'json_zonasverdes__areas_zonas_verdes_2');
const direcciones = cargarVariable('direcciones_lotes.js', 'direccionesLotes');
const extras = cargarVariable('direcciones_fid.js', 'extrasLotes');

// Correcciones que no vienen de QGIS (las mismas del mapa rápido): cambios por fid y polígonos que faltan
const correcciones = cargarVariable('lotes_correcciones.js', 'correccionesLotes');
for (const f of capa.features) Object.assign(f.properties, correcciones.cambios[f.properties.fid]);
capa.features.push(...correcciones.nuevos);

// FIDS=6899,9001 carga solo esos polígonos (sin tocar las microrrutas ni los demás lotes)
const soloFids = process.env.FIDS ? new Set(process.env.FIDS.split(',').map(Number)) : null;
if (soloFids) capa.features = capa.features.filter((f) => soloFids.has(f.properties.fid));

// Microrrutas: las de la programación, más las que solo aparecen en los polígonos.
const microrrutas = new Map();
for (const [codigo, d] of Object.entries(direcciones)) {
  microrrutas.set(codigo, {
    codigo,
    lote: texto(d.lote),
    cuadrilla: texto(d.cuad),
    area_m2: numero(d.area),
    frecuencia: texto(d.frec),
    direccion: texto(d.d),
    descripcion: texto(d.desc),
  });
}

const lotes = capa.features.map((f) => {
  const p = f.properties;
  const x = extras[String(p.fid)] || {};
  const microrruta = texto(p.Microruta);
  if (microrruta && !microrrutas.has(microrruta)) {
    microrrutas.set(microrruta, { codigo: microrruta, lote: texto(p.No_Lote), cuadrilla: texto(p.CUADRILLA) });
  }
  const tieneGeom = f.geometry && f.geometry.coordinates && f.geometry.coordinates.flat(3).length > 0;
  return {
    fid: p.fid,
    no_lote: texto(p.No_Lote),
    microrruta,
    cuadrilla: texto(p.CUADRILLA),
    area_campo: texto(p.Area_campo),
    area_m2: numero(p.Area_m2),
    shape_leng: numero(p.Shape_Leng),
    descripcion: texto(p.Descripcio),
    direccion: texto(p.DIRECCION),
    comuna: texto(x.c),
    direccion_respaldo: texto(x.d),
    geom: tieneGeom ? f.geometry : null,
  };
});

const db = await conectar();
try {
  await db.query('begin');

  const listaMr = soloFids ? [] : [...microrrutas.values()];
  for (let i = 0; i < listaMr.length; i += LOTE) {
    await db.query(
      `insert into microrrutas (codigo, lote, cuadrilla, area_m2, frecuencia, direccion, descripcion)
       select codigo, lote, cuadrilla, area_m2, frecuencia, direccion, descripcion
       from jsonb_to_recordset($1::jsonb) as r(codigo text, lote text, cuadrilla text, area_m2 numeric,
                                               frecuencia text, direccion text, descripcion text)
       on conflict (codigo) do update set
         lote = excluded.lote, cuadrilla = excluded.cuadrilla, area_m2 = excluded.area_m2,
         frecuencia = excluded.frecuencia, direccion = excluded.direccion,
         descripcion = excluded.descripcion, actualizado = now()`,
      [JSON.stringify(listaMr.slice(i, i + LOTE))]
    );
  }
  console.log(`Microrrutas: ${listaMr.length}`);

  for (let i = 0; i < lotes.length; i += LOTE) {
    // Se quita la Z (0.0), se reparan polígonos inválidos y se deja todo como MultiPolygon.
    await db.query(
      `insert into lotes (fid, no_lote, microrruta, cuadrilla, area_campo, area_m2, shape_leng,
                          descripcion, direccion, comuna, direccion_respaldo, geom)
       select fid, no_lote, microrruta, cuadrilla, area_campo, area_m2, shape_leng,
              descripcion, direccion, comuna, direccion_respaldo,
              case when geom is null then null else
                st_multi(st_collectionextract(st_makevalid(st_force2d(st_setsrid(st_geomfromgeojson(geom), 4326))), 3))
              end
       from jsonb_to_recordset($1::jsonb) as r(fid int, no_lote text, microrruta text, cuadrilla text,
              area_campo text, area_m2 numeric, shape_leng numeric, descripcion text, direccion text,
              comuna text, direccion_respaldo text, geom jsonb)
       on conflict (fid) do update set
         no_lote = excluded.no_lote, microrruta = excluded.microrruta, cuadrilla = excluded.cuadrilla,
         area_campo = excluded.area_campo, area_m2 = excluded.area_m2, shape_leng = excluded.shape_leng,
         descripcion = excluded.descripcion, direccion = excluded.direccion, comuna = excluded.comuna,
         direccion_respaldo = excluded.direccion_respaldo, geom = excluded.geom, actualizado = now()`,
      [JSON.stringify(lotes.slice(i, i + LOTE))]
    );
    process.stdout.write(`\rLotes: ${Math.min(i + LOTE, lotes.length)} / ${lotes.length}`);
  }
  console.log();

  await db.query('commit');

  const { rows: [r] } = await db.query(`
    select count(*)::int as total,
           count(geom)::int as con_geometria,
           count(*) filter (where geom is not null and not st_isvalid(geom))::int as invalidas,
           count(microrruta)::int as con_microrruta,
           count(distinct no_lote)::int as lotes_distintos
    from lotes`);
  console.log('Verificación:', r);
} catch (e) {
  await db.query('rollback');
  throw e;
} finally {
  await db.end();
}
