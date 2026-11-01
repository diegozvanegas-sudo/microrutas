// Buscar en todo: textos de la búsqueda, sin nada de la página, para probarlo con npm test.

// Filtro "or" de Supabase con lo escrito tal cual: comas, comillas, % y _ no cambian la consulta
export function filtroContiene(columnas, q) {
    var seguro = String(q).replace(/[\\%_]/g, '\\$&').replace(/["\\]/g, '\\$&');
    return columnas.map(function (c) { return c + '.ilike."%' + seguro + '%"'; }).join(',');
}
// Un número puede ser un lote: se busca exacto para que "45" no traiga también el 145 y el 450
export function esNumeroLote(q) { return /^\d+$/.test(String(q).trim()); }
export function sinCeros(q) { return String(+q); }
