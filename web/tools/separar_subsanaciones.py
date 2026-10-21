# Separa subsanaciones.html (original) en estilos.css, el HTML y app.js.
# Las funciones que pasan a módulos propios se quitan de app.js por número de línea.
import sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8').split('\n')
out = pathlib.Path(sys.argv[2])
L = lambda a, b: src[a - 1:b]  # líneas a..b (1-indexadas, inclusive)

assert src[6].strip() == '<style>' and src[292].strip() == '</style>'
assert src[442].strip() == '(function () {' and src[1990].strip() == '})();'

(out / 'src/subsanaciones/estilos.css').write_text(
    '\n'.join(l[4:] if l.startswith('    ') else l for l in L(8, 292)) + '\n', encoding='utf-8')

quitar = [(444, 444), (461, 462), (465, 465), (468, 482), (512, 518), (549, 573), (733, 747), (789, 789),
          (791, 838), (1232, 1253), (1331, 1359), (1398, 1402), (1412, 1412), (1476, 1508), (1900, 1904), (1905, 1964)]
reemplazos = {
    484: ['    // ---------- API (Supabase: src/api.js responde igual que el Apps Script) ----------',
          '    function leer() { return api.leer(); }',
          '    function enviar(accion, datos) { return api.enviar(accion, datos); }'],
    1331: ['    function parsearMensaje(texto) { return leerMensaje(texto, LOTES); }'],
    1476: ['    function recorridoCorto(ps, desde) { return recorrer(ps, desde, distLotes); }'],
}
fuera = set()
for a, b in quitar + [(484, 507)]:
    fuera.update(range(a, b + 1))
cuerpo = []
for n in range(444, 1990):
    if n in reemplazos: cuerpo += reemplazos[n]
    if n not in fuera: cuerpo.append(src[n - 1])
(out / 'src/subsanaciones/app.js.cuerpo').write_text('\n'.join(cuerpo) + '\n', encoding='utf-8')
(out / 'subsanaciones.cuerpo.html').write_text('\n'.join(L(296, 435)) + '\n', encoding='utf-8')
print('líneas en app:', len(cuerpo))
