// Horarios de rutas en la base de datos (tabla horarios_rutas, 0011_horarios_rutas.sql): horarios.html los carga
// desde el Excel o los corrige uno a uno (0013_horarios_editar.sql; administradores y quien tenga el permiso) y Horas extras los lee. El Excel se lee en el navegador y solo se envían las
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

// Horarios de la base -> { rutas, n, nombre, fecha, editadas } (el mismo formato de leerHorarios) o null si no hay cargados.
// nombre y fecha: los del Excel del que vienen (las rutas agregadas a mano no traen archivo); editadas: cuántas se cambiaron a mano
export async function horariosGuardados(supabase) {
    var res = await supabase.from('horarios_rutas').select('ruta, zona, macro, dias, horas, por_dia, turno, obs, horario_ver, archivo, actualizado, editado').order('ruta');
    if (res.error) throw new Error(res.error.message);
    if (!res.data.length) return null;
    var rutas = {}, excel = res.data.filter(function (h) { return h.archivo; })[0] || res.data[0];
    res.data.forEach(function (h) {
        rutas[h.ruta] = { ruta: h.ruta, zona: h.zona, macro: h.macro, dias: h.dias || [], horas: h.horas || [], porDia: h.por_dia || {},
            turno: h.turno, obs: h.obs, horarioVer: h.horario_ver, editado: h.editado };
    });
    return { rutas: rutas, n: res.data.length, nombre: excel.archivo, fecha: excel.actualizado,
        editadas: res.data.filter(function (h) { return h.editado; }).length };
}

function fila(h) {
    return { ruta: h.ruta, zona: h.zona, macro: h.macro, dias: h.dias, horas: h.horas, por_dia: h.porDia, turno: h.turno, obs: h.obs, horario_ver: h.horarioVer };
}

// Reemplaza los horarios de la base por los leídos del Excel (la función rechaza a quien no tenga el permiso)
export async function guardarHorarios(supabase, datos, nombre) {
    var filas = Object.keys(datos.rutas).map(function (k) { return fila(datos.rutas[k]); });
    var res = await supabase.rpc('cargar_horarios', { filas: filas, archivo: nombre });
    if (res.error) throw new Error(res.error.message);
    return horariosGuardados(supabase);
}

// Crea o cambia una ruta (h como filaHorario; anterior: su código antes de cambiarlo) y devuelve los horarios de nuevo
export async function guardarHorario(supabase, h, anterior) {
    var res = await supabase.rpc('guardar_horario', { fila: fila(h), anterior: anterior || null });
    if (res.error) throw new Error(res.error.message);
    return horariosGuardados(supabase);
}

export async function borrarHorario(supabase, ruta) {
    var res = await supabase.rpc('borrar_horario', { ruta: ruta });
    if (res.error) throw new Error(res.error.message);
    return horariosGuardados(supabase);
}

// "599 rutas · HORARIOS….xlsx · cargado el 28/10/2026"
export function textoGuardados(g) {
    if (!g) return '';
    var f = g.fecha ? new Date(g.fecha) : null;
    return g.n + ' rutas' + (g.nombre ? ' · ' + g.nombre : '') + (g.nombre && f && !isNaN(f) ? ' · cargado el ' + ('0' + f.getDate()).slice(-2) + '/' + ('0' + (f.getMonth() + 1)).slice(-2) + '/' + f.getFullYear() : '') +
        (g.editadas ? ' · ' + g.editadas + (g.editadas === 1 ? ' editada' : ' editadas') + ' a mano' : '');
}
