// Horarios de rutas en la base de datos (tabla horarios_rutas, 0011_horarios_rutas.sql): horarios.html los carga
// desde el Excel (solo el administrador) y Horas extras los lee. El Excel se lee en el navegador y solo se envían las
// filas; ni el archivo ni los horarios quedan guardados en el equipo.
import { leerHorarios } from './horarios.js';

// ExcelJS (~940 kB) solo se descarga al cargar el archivo
var excel = null;
function cargarExcel() { return excel || (excel = import('exceljs').then(function (m) { return m.default; })); }

// Archivo .xlsx (ArrayBuffer) -> { rutas, n } leído de todas sus hojas, o null si no tiene las columnas
export async function leerArchivoHorarios(buffer) {
    var ExcelJS = await cargarExcel(), wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return leerHorarios(wb.worksheets.map(function (ws) {
        return { nombre: ws.name, valores: ws.getSheetValues().map(function (r) { return r || []; }) };
    }));
}

// Horarios de la base -> { rutas, n, nombre, fecha } (el mismo formato de leerHorarios) o null si no hay cargados
export async function horariosGuardados(supabase) {
    var res = await supabase.from('horarios_rutas').select('ruta, zona, macro, dias, horas, por_dia, turno, obs, horario_ver, archivo, actualizado').order('ruta');
    if (res.error) throw new Error(res.error.message);
    if (!res.data.length) return null;
    var rutas = {};
    res.data.forEach(function (h) {
        rutas[h.ruta] = { ruta: h.ruta, zona: h.zona, macro: h.macro, dias: h.dias || [], horas: h.horas || [], porDia: h.por_dia || {},
            turno: h.turno, obs: h.obs, horarioVer: h.horario_ver };
    });
    return { rutas: rutas, n: res.data.length, nombre: res.data[0].archivo, fecha: res.data[0].actualizado };
}

// Reemplaza los horarios de la base por los leídos del Excel (la función rechaza a quien no sea administrador)
export async function guardarHorarios(supabase, datos, nombre) {
    var filas = Object.keys(datos.rutas).map(function (k) {
        var h = datos.rutas[k];
        return { ruta: h.ruta, zona: h.zona, macro: h.macro, dias: h.dias, horas: h.horas, por_dia: h.porDia, turno: h.turno, obs: h.obs, horario_ver: h.horarioVer };
    });
    var res = await supabase.rpc('cargar_horarios', { filas: filas, archivo: nombre });
    if (res.error) throw new Error(res.error.message);
    return horariosGuardados(supabase);
}

// "599 rutas · HORARIOS….xlsx · cargado el 28/10/2026"
export function textoGuardados(g) {
    if (!g) return '';
    var f = g.fecha ? new Date(g.fecha) : null;
    return g.n + ' rutas · ' + g.nombre + (f && !isNaN(f) ? ' · cargado el ' + ('0' + f.getDate()).slice(-2) + '/' + ('0' + (f.getMonth() + 1)).slice(-2) + '/' + f.getFullYear() : '');
}
