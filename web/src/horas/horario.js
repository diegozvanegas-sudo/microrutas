// Horas extras: H.I y H.F de cada fila frente al horario de su ruta (horarios.html). Si la ruta del reporte no es la del
// cumplimiento (encontrado por cédula, nombre o control: ruta mal escrita, p. ej. 61301 por 616301), se usa la del
// cumplimiento solo cuando la del reporte no está en los horarios, o cuando con la del reporte no cuadra y con la del
// cumplimiento sí (un tripulante puede salir ese día en otra ruta, en otro turno). rutaHorario dice cuándo se usó
import { revisarHorario } from '../horarios/horarios.js';
import { ruta, mismoControl, esConductor } from './cruce.js';

function cuadra(r) { return !!r.horario && !r.difHi && !r.difHf && !r.fueraDeDia; }
export function conHorario(f, horarios) {
    var propio = revisarHorario(f, horarios), real = ruta(f.rutaReal);
    var puede = !!f.difRuta && !!real && ['cedula', 'nombre', 'control'].indexOf(f.como) >= 0 && !!horarios && !!horarios.rutas[real];
    if (puede && !cuadra(propio)) {
        var otro = revisarHorario(Object.assign({}, f, { ruta: real }), horarios);
        if (!propio.horario || cuadra(otro)) return Object.assign(otro, { rutaHorario: f.rutaReal });
    }
    return Object.assign(propio, { rutaHorario: '' });
}

// Tripulación: el que no cuadra se revisa con la ruta de un compañero del mismo turno (misma fecha, misma ruta del reporte
// y mismo control) que sí cuadró, primero el conductor. filas: con lo de conHorario ya puesto -> mismas filas, corregidas
export function horarioTripulacion(filas, horarios) {
    var bien = filas.filter(cuadra);
    return filas.map(function (f) {
        if (cuadra(f) || !horarios) return f;
        var c = bien.filter(function (k) {
            return k !== f && k.fecha === f.fecha && k.ruta === f.ruta && mismoControl(k.control, f.control);
        }).sort(function (a, b) { return esConductor(b) - esConductor(a); })[0];
        var r = c && ruta(c.rutaHorario || c.ruta);
        if (!r || r === ruta(f.rutaHorario || f.ruta) || !horarios.rutas[r]) return f;
        var otro = revisarHorario(Object.assign({}, f, { ruta: r }), horarios);
        return cuadra(otro) ? Object.assign(f, otro, { rutaHorario: c.rutaHorario || c.rutaVer || c.ruta, horarioDe: c.nombre }) : f;
    });
}
