"""Pega el trazo de las microrrutas al eje de las calles de OpenStreetMap (capas del mapa rápido).

    python tools/ajustar_a_calles.py [--lejos=M] <capa> [<capa> ...]      p. ej. python tools/ajustar_a_calles.py rutas_ryt rutas_lv
    python tools/ajustar_a_calles.py --lejos=35 barrido_dom barrido_manana barrido_tarde barrido_noche
--lejos: hasta cuántos metros se acepta el ajuste de un tramo (LEJOS_M). Los planos de barrido son de CAD ubicados por
los nombres de las calles (errores de hasta ~30 m) y son del centro, donde la calle más cercana sigue siendo la suya.

Los planos dibujan cada pasada a un lado de la vía (y a veces corrida unos metros): en el mapa salen líneas paralelas que
con el trazo grueso se vuelven manchas. Cada ruta se recorre cada PASO_M metros y cada punto se lleva al tramo de calle
más probable con un ajuste tipo HMM (Viterbi): cerca del punto, en la misma dirección de la ruta y sin saltar de una
calle a otra sin necesidad. Lo que no tiene calle a menos de RADIO_M (un parque, una vía que no está en OSM), o el
tramo que en promedio queda a más de LEJOS_M de la calle elegida (en lo rural el plano va lejos de la vía), queda como
venía. Inicio y fin se llevan a la calle más cercana.
Antes, si el plano viene corrido (la ruta entera cae lejos de las calles), se busca cuánto moverla (corrimiento()).
Guarda en "aj" el porcentaje de la ruta que quedó sobre calle y en "cr" los metros que se movió. El trazo del plano no
se guarda (el archivo pesaría el doble en el celular): se vuelve a sacar de los planos con rutas_desde_geopdf.py, que
llama a este ajuste. Las calles se descargan de OSM una vez y quedan en tools/.cache_osm_vias.json (no se versiona).
Necesita: pip install numpy shapely
"""
import json, os, re, sys, time, urllib.parse, urllib.request
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'public', 'data', 'rapido')
CACHE = os.path.join(AQUI, '.cache_osm_vias.json')
BBOX = '6.150,-75.710,6.360,-75.455'  # Medellín y alrededores (las rutas de LV y RyT)
TIPOS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|footway|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'
PASO_M, RADIO_M, CANDIDATOS = 5.0, 60.0, 10
GIRO_M, CAMBIO_M = 14.0, 8.0  # castigos (en metros) del ajuste: calle en otra dirección y saltar de una calle a otra
# Castigo por tipo de vía: en zona rural el plano va a 40-50 m de la vía y no debe quedarse en un camino de servicio
# Andenes y pasajes peatonales (footway): el barrido del centro pasa por ellos, pero las calles van primero
CASTIGO_VIA = {'service': 12.0, 'pedestrian': 6.0, 'footway': 15.0, 'living_street': 2.0}
TOL_M = 2.5
LEJOS_M = 20.0
CORRIDO_M, MAX_CORRIDO_M = 25.0, 400  # plano corrido: mediana a la calle desde la que se busca y hasta cuánto se mueve
LAT0, LNG0 = 6.25, -75.57
KX, KY = 111320 * np.cos(np.radians(LAT0)), 110574

def a_m(lat, lng): return ((np.asarray(lng) - LNG0) * KX, (np.asarray(lat) - LAT0) * KY)
def a_ll(x, y): return (LAT0 + np.asarray(y) / KY, LNG0 + np.asarray(x) / KX)

def vias():
    if not os.path.exists(CACHE) or time.time() - os.path.getmtime(CACHE) > 60 * 86400:
        q = '[out:json][timeout:240];way["highway"~"^(%s)$"](%s);out tags geom;' % (TIPOS, BBOX)
        req = urllib.request.Request('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': q}).encode(),
                                     headers={'User-Agent': 'microrutas-interventoria'})
        datos = urllib.request.urlopen(req, timeout=300).read()
        open(CACHE, 'wb').write(datos)
    A, B, via, castigo = [], [], [], []
    for w in json.load(open(CACHE, encoding='utf-8'))['elements']:
        g = w.get('geometry') or []
        if len(g) < 2: continue
        x, y = a_m([p['lat'] for p in g], [p['lon'] for p in g])
        for k in range(len(g) - 1):
            A.append((x[k], y[k])); B.append((x[k + 1], y[k + 1])); via.append(w['id']); castigo.append(CASTIGO_VIA.get(w['tags'].get('highway'), 0.0))
    A, B = np.array(A), np.array(B)
    castigo = np.array(castigo)
    lineas = [LineString([a, b]) for a, b in zip(A, B)]
    # Solo calles (sin andenes, servicio ni peatonales): para saber si un plano viene corrido; un parque con senderos
    # no cuenta como "cerca de calle"
    calles = STRtree([l for l, c in zip(lineas, castigo) if c == 0])
    return {'A': A, 'B': B, 'via': np.array(via), 'castigo': castigo, 'arbol': STRtree(lineas), 'calles': calles}

def muestrear(pts):
    """Puntos cada PASO_M a lo largo de la línea (con sus extremos)."""
    l = LineString(pts)
    if l.length == 0: return np.array(pts[:1])
    d = np.append(np.arange(0, l.length, PASO_M), l.length)
    return np.array([l.interpolate(t).coords[0] for t in d])

def candidatos(V, p, dirr):
    idx = V['arbol'].query(Point(p).buffer(RADIO_M))
    if not len(idx): return []
    A, B = V['A'][idx], V['B'][idx]
    ab = B - A; L2 = (ab ** 2).sum(1); L2[L2 == 0] = 1e-9
    t = np.clip(((p - A) * ab).sum(1) / L2, 0, 1)
    q = A + ab * t[:, None]
    d = np.hypot(*(q - p).T)
    seno = np.abs(ab[:, 0] * dirr[1] - ab[:, 1] * dirr[0]) / np.sqrt(L2)
    e = d + GIRO_M * seno + V['castigo'][idx]
    ok = d <= RADIO_M
    orden = np.argsort(e)[:CANDIDATOS]
    return [(e[k], q[k], V['via'][idx[k]], idx[k]) for k in orden if ok[k]]

def ajustar_linea(V, pts, lejos=LEJOS_M):
    """[(x, y)] -> (trazo ajustado en metros, cuántos puntos quedaron sobre calle, total de puntos)."""
    P = muestrear(pts)
    n = len(P)
    if n < 2: return P, 0, n
    dirs = np.zeros_like(P)
    dirs[1:-1] = P[2:] - P[:-2]; dirs[0] = P[1] - P[0]; dirs[-1] = P[-1] - P[-2]
    nrm = np.hypot(*dirs.T); nrm[nrm == 0] = 1; dirs = dirs / nrm[:, None]
    cand = [candidatos(V, P[i], dirs[i]) for i in range(n)]
    out, sobre = [], 0
    i = 0
    while i < n:
        if not cand[i]: out.append(P[i]); i += 1; continue
        # Tramo seguido con calle cerca: Viterbi
        j = i
        while j < n and cand[j]: j += 1
        costo = [np.array([c[0] for c in cand[i]])]; atras = [None]
        for k in range(i + 1, j):
            paso = np.hypot(*(P[k] - P[k - 1]))
            prev, cur = cand[k - 1], cand[k]
            M = np.empty((len(prev), len(cur)))
            for a, ca in enumerate(prev):
                for b, cb in enumerate(cur):
                    M[a, b] = abs(np.hypot(*(cb[1] - ca[1])) - paso) + (0 if ca[2] == cb[2] else CAMBIO_M)
            tot = costo[-1][:, None] + M
            atras.append(tot.argmin(0))
            costo.append(tot.min(0) + np.array([c[0] for c in cur]))
        s = int(costo[-1].argmin()); camino = [s]
        for k in range(len(atras) - 1, 0, -1):
            s = int(atras[k][s]); camino.append(s)
        camino.reverse()
        elegidos = [cand[k][s] for k, s in zip(range(i, j), camino)]
        q = [c[1] for c in elegidos]
        # En lo rural el plano va lejos de la vía y la calle "más probable" puede ser otra: si el tramo quedó en promedio
        # a más de LEJOS_M, se deja como en el plano
        if np.median(np.hypot(*(np.array(q) - P[i:j]).T)) <= lejos: out += por_esquinas(V, elegidos); sobre += j - i
        else: out += list(P[i:j])
        i = j
    return np.array(out), sobre, n

def esquina(V, sa, sb):
    """Cruce de las rectas de dos tramos de calle, si queda pegado a los dos (la esquina donde se encuentran); o None."""
    a1, b1, a2, b2 = V['A'][sa], V['B'][sa], V['A'][sb], V['B'][sb]
    d1, d2 = b1 - a1, b2 - a2
    den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-6 * np.hypot(*d1) * np.hypot(*d2): return None  # paralelos
    t = ((a2[0] - a1[0]) * d2[1] - (a2[1] - a1[1]) * d2[0]) / den
    x = a1 + t * d1
    cerca = lambda a, d: np.hypot(*(x - (a + np.clip(((x - a) @ d) / (d @ d), 0, 1) * d)))
    return x if cerca(a1, d1) < 8 and cerca(a2, d2) < 8 else None

def por_esquinas(V, elegidos):
    """Puntos ajustados; al pasar de una calle a otra la línea va por la esquina (si no, corta la manzana en diagonal)."""
    out = [elegidos[0][1]]
    for (_, q1, v1, s1), (_, q2, v2, s2) in zip(elegidos, elegidos[1:]):
        if s1 != s2 and np.hypot(*(q2 - q1)) > 2:
            x = esquina(V, s1, s2)
            if x is not None and np.hypot(*(x - q1)) < 40 and np.hypot(*(x - q2)) < 40: out.append(x)
        out.append(q2)
    return out

def sin_picos(p, largo=25.0):
    """Quita los picos de ida y vuelta cortos (A -> B -> A) que deja el ajuste al tocar una calle transversal."""
    p = list(p)
    k = 1
    while 0 < k < len(p) - 1:
        if np.hypot(*(p[k + 1] - p[k - 1])) < 3 and np.hypot(*(p[k] - p[k - 1])) < largo:
            del p[k:k + 2]; k = max(1, k - 1)
        else: k += 1
    return np.array(p)

def simplificar(p, tol):
    if len(p) < 3: return p
    keep = np.zeros(len(p), bool); keep[0] = keep[-1] = True
    pila = [(0, len(p) - 1)]
    while pila:
        a, b = pila.pop()
        if b <= a + 1: continue
        ab = p[b] - p[a]; L = np.hypot(*ab); seg = p[a + 1:b] - p[a]
        d = np.abs(ab[0] * seg[:, 1] - ab[1] * seg[:, 0]) / L if L > 0 else np.hypot(*seg.T)
        k = int(d.argmax())
        if d[k] > tol: keep[a + 1 + k] = True; pila += [(a, a + 1 + k), (a + 1 + k, b)]
    return p[keep]

def decodificar(g):
    out, x, y = [], 0, 0
    for k in range(0, len(g), 2): x += g[k]; y += g[k + 1]; out.append((y / 1e6, x / 1e6))
    return out

def codificar(latlng):
    out, px, py = [], 0, 0
    for lat, lng in latlng:
        x, y = round(lng * 1e6), round(lat * 1e6)
        if (x, y) == (px, py) and out: continue
        out += [x - px, y - py]; px, py = x, y
    return out

def distancias(V, Q, arbol='calles'):
    _, d = V[arbol].query_nearest(shapely.points(Q), return_distance=True, all_matches=False)
    return d

def corrimiento(V, lineas):
    """Planos con la georreferencia corrida (la ruta cae en el monte y las calles con su forma están a 200 m): se busca
    el desplazamiento (sin girar ni deformar) que la deja sobre calles. Se acepta solo si queda claramente mejor y no hay
    otro desplazamiento casi igual de bueno (en una cuadrícula de calles una cuadra corrida también cuadra).
    Devuelve (dx, dy) en metros, o None si no hace falta o no es seguro."""
    Q = np.concatenate([muestrear(l)[::4] for l in lineas if len(l) > 1])  # un punto cada ~20 m
    if len(Q) < 10: return None
    d0 = np.median(distancias(V, Q))
    if d0 <= CORRIDO_M: return None
    puntaje = lambda s: np.mean(np.minimum(distancias(V, Q + s), 40))
    malla = [np.array((dx, dy)) for dx in range(-MAX_CORRIDO_M, MAX_CORRIDO_M + 1, 20) for dy in range(-MAX_CORRIDO_M, MAX_CORRIDO_M + 1, 20)]
    res = sorted((puntaje(s), tuple(s)) for s in malla)
    mejor = np.array(res[0][1])
    otro = next((p for p, s in res if np.hypot(*(np.array(s) - mejor)) > 60), None)
    fino = min((puntaje(mejor + (a, b)), tuple(mejor + (a, b))) for a in range(-16, 17, 4) for b in range(-16, 17, 4))
    s = np.array(fino[1], float)
    d1 = np.median(distancias(V, Q + s))
    if d1 > 10 or d1 > d0 * 0.35 or (otro is not None and otro < 1.5 * fino[0]): return None
    return s

def mover(latlngs, s):
    x, y = a_m([p[0] for p in latlngs], [p[1] for p in latlngs])
    lat, lng = a_ll(np.asarray(x) + s[0], np.asarray(y) + s[1])
    return [[round(float(a), 6), round(float(b), 6)] for a, b in zip(lat, lng)]

def ajustar_ruta(V, it, lejos=LEJOS_M):
    """Cambia it['g'] (e inicio y fin) por el trazo sobre calles. Si el plano venía corrido, primero lo mueve y deja
    en it['cr'] cuántos metros."""
    lineas = []
    for linea in it['g']:
        ll = decodificar(linea)
        if len(ll) < 2: continue
        x, y = a_m([p[0] for p in ll], [p[1] for p in ll])
        lineas.append(list(zip(x, y)))
    s = corrimiento(V, lineas)
    if s is not None:
        lineas = [[(px + s[0], py + s[1]) for px, py in l] for l in lineas]
        for k in ('i', 'f'):
            if it.get(k): it[k] = mover(it[k], s)
        it['cr'] = round(float(np.hypot(*s)))
    g, sobre, total = [], 0, 0
    for l in lineas:
        q, s, n = ajustar_linea(V, l, lejos)
        sobre += s; total += n
        q = simplificar(sin_picos(simplificar(q, 0.5)), TOL_M)
        lat, lng = a_ll(q[:, 0], q[:, 1])
        if len(q) > 1: g.append(codificar(zip(np.round(lat, 6), np.round(lng, 6))))
    it['g'] = g
    it['aj'] = round(100 * sobre / total) if total else 0
    for k in ('i', 'f'):
        if not it.get(k): continue
        nuevos = []
        for lat, lng in it[k]:
            x, y = a_m(lat, lng)
            c = candidatos(V, np.array([float(x), float(y)]), np.array([1.0, 0.0]))
            c = min(c, key=lambda z: np.hypot(*(z[1] - (x, y)))) if c else None
            la, ln = a_ll(*c[1]) if c else (lat, lng)
            nuevos.append([round(float(la), 6), round(float(ln), 6)])
        it[k] = nuevos
    return it

def leer_capa(capa):
    t = open(os.path.join(SALIDA, 'capa_%s.js' % capa), encoding='utf-8').read()
    return json.loads(t[t.index(',') + 1:t.rindex(')')])

def escribir_capa(capa, datos):
    js = 'cargarCapa(%s,%s);\n' % (json.dumps(capa), json.dumps(datos, ensure_ascii=False, separators=(',', ':')))
    open(os.path.join(SALIDA, 'capa_%s.js' % capa), 'w', encoding='utf-8').write(js)
    idx_path = os.path.join(SALIDA, 'indice.js')
    idx = open(idx_path, encoding='utf-8').read()
    m = re.search(r'("capas":\{)(.*?)(\}\};?\s*$)', idx, re.S)
    capas = json.loads('{' + m.group(2) + '}')
    capas[capa] = {'kb': round(len(js.encode()) / 1024)}
    open(idx_path, 'w', encoding='utf-8').write(idx[:m.start()] + '"capas":' + json.dumps(capas, separators=(',', ':')) + '};\n')
    return capas[capa]['kb']

if __name__ == '__main__':
    V = vias()
    lejos = next((float(a.split('=')[1]) for a in sys.argv[1:] if a.startswith('--lejos=')), LEJOS_M)
    for capa in [a for a in sys.argv[1:] if not a.startswith('--')]:
        datos = leer_capa(capa)
        t0 = time.time()
        for k, it in enumerate(datos['items']):
            ajustar_ruta(V, it, lejos)
            if k % 200 == 199: print('  %s: %d de %d' % (capa, k + 1, len(datos['items'])), flush=True)
        aj = np.array([it['aj'] for it in datos['items']])
        kb = escribir_capa(capa, datos)
        print('%s: %d rutas en %.0f s; sobre calle (mediana) %d%%; con menos del 70%% sobre calle: %d; %d KB' %
              (capa, len(aj), time.time() - t0, np.median(aj), (aj < 70).sum(), kb))
