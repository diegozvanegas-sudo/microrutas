// Lectura compartida de los datos de lotes para las herramientas del mapa rápido.
// Los polígonos son los de public/data (los mismos del mapa completo) más datos/origen/lotes_correcciones.js,
// que solo usan el mapa rápido y Supabase.
import fs from 'node:fs';
import path from 'node:path';

export const DATA = path.join(import.meta.dirname, '..', 'public', 'data');
const CORRECCIONES = path.join(import.meta.dirname, '..', '..', 'datos', 'origen', 'lotes_correcciones.js');

export function leerVar(ruta, nombre) {
  const ctx = {};
  new Function('ctx', fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '').replace('var ' + nombre, 'ctx.' + nombre))(ctx);
  return ctx[nombre];
}

export const leerData = (archivo, nombre) => leerVar(path.join(DATA, archivo), nombre);

// Polígonos de la capa con las correcciones aplicadas: cambios por fid y polígonos nuevos al final
export function leerZonas() {
  const zonas = leerData('zonasverdes__areas_zonas_verdes_2.js', 'json_zonasverdes__areas_zonas_verdes_2').features;
  const { cambios = {}, nuevos = [] } = leerVar(CORRECCIONES, 'correccionesLotes');
  const usados = new Set();
  const corregidas = zonas.map((f) => {
    const c = cambios[f.properties.fid];
    if (!c) return f;
    usados.add(String(f.properties.fid));
    return { ...f, properties: { ...f.properties, ...c } };
  });
  const faltan = Object.keys(cambios).filter((fid) => !usados.has(fid));
  if (faltan.length) throw new Error('lotes_correcciones.js: no están en la capa los fid ' + faltan.join(', '));
  return corregidas.concat(nuevos);
}
