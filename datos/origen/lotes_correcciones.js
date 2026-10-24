// Correcciones a la capa de lotes (zonasverdes__areas_zonas_verdes_2.js) que no vienen de QGIS.
// Las aplican scripts/importar_lotes.mjs (Supabase) y web/tools/generar_mapa_rapido.mjs (mapa rápido).
// El mapa completo (index.html) no las usa.
// - cambios: por fid, las propiedades que se reemplazan.
// - nuevos: polígonos que faltan en la capa (fid desde 9001 para no chocar con los de QGIS).
var correccionesLotes = {
  "cambios": {
    // Franjas de la Cr 69 entre calles 97 y 98 (164 m²): son del lote 287 (Z2CC0090), venían como 280. Programación oct 2026.
    "6899": { "No_Lote": "287" }
  },
  "nuevos": [
    // Lote 287 (Z2CC0090): la zona principal no estaba dibujada. Contorno aproximado, 24/10/2026.
    {"type":"Feature","properties":{"fid":9001,"No_Lote":"287","Area_campo":"7500","Shape_Leng":null,"Microruta":"Z2CC0090","Area_m2":null,"CUADRILLA":"2","Descripcio":"Zona principal: cancha La Maracaná (núcleo de vida ciudadana de Castilla), I.E. La Esperanza secciones Cuba y Comuneros, Biblioteca Familia La Esperanza, placas deportivas y parques infantiles, entre calles 96 y 97 con carreras 73 y 74A. Trazado aproximado (contorno del conjunto tomado de OpenStreetMap): el área a intervenir son las zonas verdes de adentro, 7.500 m² según la programación (7.664 m² del lote menos 164 m² de las franjas de la carrera 69).","DIRECCION":null},"geometry":{"type":"MultiPolygon","coordinates":[[[[-75.5778156,6.2931764],[-75.5777971,6.2931029],[-75.5776276,6.2930294],[-75.5762322,6.2925857],[-75.575943,6.29332],[-75.5758693,6.2935335],[-75.576163,6.2937604],[-75.5767091,6.293972],[-75.5768606,6.2940217],[-75.5769867,6.2940617],[-75.5774002,6.2941171],[-75.5777724,6.293357],[-75.577794,6.2932835],[-75.5778156,6.2931764]]]]}}
  ]
};
