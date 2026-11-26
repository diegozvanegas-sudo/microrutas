// «✅ Revisado sin novedad» desde la ficha del mapa (mapa_rapido.html): la visita abre con todo en SI.
// El mapa manda la fecha del último reporte de ejecución (&ejec=aaaa-mm-dd) y la cuadrilla (&cuad=).

// Fecha de ejecución que se puede poner sola: aaaa-mm-dd válida, no futura y no más de 45 días atrás
// (un reporte viejo es de otra quincena: mejor que la escriban). Si no sirve, ''.
export function ejecucionDelMapa(ejec, hoy) {
    var s = String(ejec || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(String(hoy || ''))) return '';
    var d = new Date(s + 'T00:00:00Z'), h = new Date(hoy + 'T00:00:00Z');
    if (isNaN(d) || d.toISOString().slice(0, 10) !== s) return '';
    var dias = Math.round((h - d) / 864e5);
    return dias >= 0 && dias <= 45 ? s : '';
}

// Cuadrilla del enlace: solo número (o «C4» → «4»)
export function cuadrillaDelMapa(cuad) {
    var m = String(cuad || '').trim().match(/^C?\s*(\d{1,2})$/i);
    return m ? String(+m[1]) : '';
}
