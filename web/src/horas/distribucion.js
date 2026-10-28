// Distribución de las horas extras en OD (ordinaria diurna), ON (ordinaria nocturna), FD (festiva diurna) y FN (festiva nocturna).
// El tiempo extra va de la H.F a la hora de llegada; con menos de MINIMO minutos no hay extra. Se reparte en minutos
// y cada tipo se pasa a horas enteras con enHoras(): la fracción de MINIMO minutos o más sube a la hora siguiente.
// Diurna de 6:00 a 19:00 y nocturna de 19:00 a 6:00; festiva los domingos y festivos de Colombia, en los mismos horarios.
// Se reparte minuto a minuto por el reloj y el día, así un extra que pasa la medianoche del sábado al domingo (o del
// domingo al lunes) cambia de ordinaria a festiva (o al revés) a las 0:00. Sin nada de la página, para probarlo con npm test.

// Desde cuántos minutos de extra se reconocen (y desde cuántos una fracción cuenta como hora completa)
export var MINIMO = 36;
var DIURNA_DESDE = 6 * 60, DIURNA_HASTA = 19 * 60;

function iso(d) { return d.toISOString().slice(0, 10); }
function dia(a, m, d) { return new Date(Date.UTC(a, m - 1, d)); }
function mas(d, n) { return new Date(d.getTime() + n * 864e5); }
// Ley Emiliani: el festivo que no cae en lunes pasa al lunes siguiente
function lunes(d) { var s = d.getUTCDay(); return s === 1 ? d : mas(d, (8 - s) % 7); }

// Domingo de Pascua (algoritmo de Butcher)
function pascua(a) {
    var b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
    var i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
    var mes = Math.floor((i + m - 7 * n + 114) / 31), di = ((i + m - 7 * n + 114) % 31) + 1;
    return dia(a, mes, di);
}

var cache = {};
// Festivos de Colombia del año -> { 'aaaa-mm-dd': true } (los domingos se tratan aparte)
export function festivos(a) {
    if (cache[a]) return cache[a];
    var p = pascua(a), r = {};
    [dia(a, 1, 1), dia(a, 5, 1), dia(a, 7, 20), dia(a, 8, 7), dia(a, 12, 8), dia(a, 12, 25),   // fijos
        mas(p, -3), mas(p, -2)].forEach(function (d) { r[iso(d)] = true; });                    // jueves y viernes santo
    [dia(a, 1, 6), dia(a, 3, 19), dia(a, 6, 29), dia(a, 8, 15), dia(a, 10, 12), dia(a, 11, 1), dia(a, 11, 11),
        mas(p, 39), mas(p, 60), mas(p, 68)].forEach(function (d) { r[iso(lunes(d))] = true; }); // Ascensión, Corpus, Sagrado Corazón
    return (cache[a] = r);
}
// 'aaaa-mm-dd' -> true si es domingo o festivo
export function esFestivo(f) {
    var d = new Date(f + 'T00:00:00Z');
    return !isNaN(d) && (d.getUTCDay() === 0 || !!festivos(d.getUTCFullYear())[f]);
}

// fecha: día del turno ('aaaa-mm-dd'); hi, hf, llegada: minutos del día (los turnos de noche pasan la medianoche).
// -> { od, on, fd, fn, total } en minutos, o null si falta algo. total 0 si el extra no llega a MINIMO.
export function distribuir(fecha, hi, hf, llegada) {
    if (!fecha || hi == null || hf == null || llegada == null || isNaN(new Date(fecha + 'T00:00:00Z'))) return null;
    // Minutos desde las 0:00 del día del turno
    var fin = hi + (hf - hi + 1440) % 1440, hasta = hi + (llegada - hi + 1440) % 1440;
    var r = { od: 0, on: 0, fd: 0, fn: 0, total: 0 };
    if (hasta - fin < MINIMO) return r;
    var base = new Date(fecha + 'T00:00:00Z');
    for (var t = fin; t < hasta;) {
        var d = Math.floor(t / 1440), m = t - d * 1440;
        // Hasta el próximo cambio: las 6:00, las 19:00 o la medianoche
        var corte = d * 1440 + (m < DIURNA_DESDE ? DIURNA_DESDE : m < DIURNA_HASTA ? DIURNA_HASTA : 1440), n = Math.min(hasta, corte) - t;
        var clave = (esFestivo(iso(mas(base, d))) ? 'f' : 'o') + (m >= DIURNA_DESDE && m < DIURNA_HASTA ? 'd' : 'n');
        r[clave] += n;
        r.total += n;
        t += n;
    }
    return r;
}

// Minutos de cada tipo ({ od, on, fd, fn }) -> horas enteras: 2:47 -> 3, 2:35 -> 2, 0:20 -> 0. total: la suma de los enteros
export function enHoras(d) {
    var r = { total: 0 };
    ['od', 'on', 'fd', 'fn'].forEach(function (k) {
        r[k] = Math.floor(d[k] / 60) + (d[k] % 60 >= MINIMO ? 1 : 0);
        r.total += r[k];
    });
    return r;
}
